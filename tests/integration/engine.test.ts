import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "../../apps/api/src/database/client.js";
import { generateBracket } from "../../apps/api/src/modules/brackets/service.js";
import { saveResult } from "../../apps/api/src/modules/matches/service.js";
async function fixture(count: number, format = "SINGLE_ELIMINATION") {
  const tag = randomBytes(5).toString("hex");
  const owner = await db.user.create({
    data: {
      username: `engine_${tag}`,
      email: `engine_${tag}@test.invalid`,
      role: "ORGANIZER",
      emailVerifiedAt: new Date(),
    },
  });
  const event = await db.tournament.create({
    data: {
      name: `Engine ${tag}`,
      game: "valorant",
      description: "Engine verification fixture",
      rules: "Decisive results required",
      teamSize: 1,
      maxTeams: 64,
      opensAt: new Date(Date.now() - 10000),
      closesAt: new Date(Date.now() + 10000),
      startsAt: new Date(Date.now() + 20000),
      organizerId: owner.id,
      format,
    },
  });
  const teams = [];
  for (let i = 0; i < count; i++) {
    const player = await db.user.create({
      data: {
        username: `entrant_${tag}_${i}`,
        email: `entrant_${tag}_${i}@test.invalid`,
        role: "PLAYER",
        emailVerifiedAt: new Date(),
      },
    });
    const team = await db.team.create({
      data: {
        name: `Team ${tag} ${i}`,
        game: "valorant",
        captainId: player.id,
        members: { create: { userId: player.id, acceptedAt: new Date() } },
      },
    });
    teams.push(team.id);
    await db.tournamentRegistration.create({
      data: {
        tournamentId: event.id,
        teamId: team.id,
        status: "APPROVED",
        roster: [{ id: player.id, username: player.username }],
      },
    });
  }
  return { event, owner, teams };
}
after(() => db.$disconnect());
test("single-elimination regression: uneven fields, approved manual seeds, atomic progression and champion", async () => {
  for (const n of [2, 3, 5, 8, 17]) {
    const { event, owner, teams } = await fixture(n);
    const seeds = [...teams].reverse();
    const key = randomUUID();
    const first = await generateBracket(
      event.id,
      owner.id,
      { seeding: "MANUAL", teamIds: seeds },
      key,
    );
    const retry = await generateBracket(
      event.id,
      owner.id,
      { seeding: "MANUAL", teamIds: seeds },
      key,
    );
    assert.deepEqual(
      retry.map((m) => m.id),
      first.map((m) => m.id),
    );
    await assert.rejects(
      () => generateBracket(event.id, owner.id, { seeding: "RANDOM" }, key),
      /different operation/,
    );
    assert.deepEqual(
      (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).seedOrder,
      seeds,
    );
    let played = 0;
    while (
      (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase !== "COMPLETED"
    ) {
      assert(played++ < n);
      const m = await db.match.findFirstOrThrow({
        where: {
          tournamentId: event.id,
          status: { not: "COMPLETED" },
          teamAId: { not: null },
          teamBId: { not: null },
        },
        orderBy: [{ round: "asc" }, { position: "asc" }],
      });
      await saveResult(event.id, m.id, owner.id, 2, 1);
    }
    assert.equal(played, n - 1);
    assert.equal(
      await db.matchResult.count({ where: { match: { tournamentId: event.id } } }),
      n - 1,
    );
    const champion = (await db.tournament.findUniqueOrThrow({ where: { id: event.id } }))
      .championId;
    assert(teams.includes(champion!));
    await assert.rejects(() => generateBracket(event.id, owner.id));
  }
});
test("single-elimination concurrent conflicting results advance exactly one winner", async () => {
  const { event, owner } = await fixture(3);
  const matches = await generateBracket(event.id, owner.id);
  const m = matches.find((m) => m.teamAId && m.teamBId && !m.isBye)!;
  const outcomes = await Promise.allSettled([
    saveResult(event.id, m.id, owner.id, 2, 0),
    saveResult(event.id, m.id, owner.id, 0, 2),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.matchResult.count({ where: { matchId: m.id } }), 1);
  const saved = await db.match.findUniqueOrThrow({ where: { id: m.id } });
  const next = await db.match.findFirstOrThrow({
    where: { tournamentId: event.id, round: m.round + 1 },
  });
  assert([next.teamAId, next.teamBId].includes(saved.winnerId));
});

test("group round robins qualify into dependency-driven playoffs without cross-group advancement", async () => {
  for (const [count, groups, advance] of [
    [8, 2, 2],
    [10, 2, 1],
    [14, 4, 1],
  ]) {
    const { event, owner, teams } = await fixture(count, "GROUPS");
    await db.tournament.update({
      where: { id: event.id },
      data: { engineRules: { groups: { count: groups, advance } } },
    });
    await generateBracket(event.id, owner.id);
    let guard = 0;
    while (
      (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase !== "COMPLETED"
    ) {
      assert(guard++ < 150);
      const m = await db.match.findFirstOrThrow({
        where: {
          tournamentId: event.id,
          status: { not: "COMPLETED" },
          teamAId: { not: null },
          teamBId: { not: null },
        },
        orderBy: [{ round: "asc" }, { position: "asc" }],
      });
      await saveResult(event.id, m.id, owner.id, 2, 0, {
        killsA: 20,
        deathsA: 10,
        assistsA: 10,
        killsB: 10,
        deathsB: 20,
        assistsB: 5,
        durationSeconds: 600,
      });
    }
    const stages = await db.tournamentStage.findMany({
      where: { tournamentId: event.id },
      include: { participants: true, matches: true },
    });
    assert.equal(stages.filter((s) => s.kind === "GROUP").length, groups);
    const playoff = stages.find((s) => s.kind === "PLAYOFF")!;
    assert(playoff.completed);
    assert.equal(playoff.participants.length, groups * advance);
    for (const stage of stages)
      for (const m of stage.matches)
        for (const id of [m.teamAId, m.teamBId].filter(Boolean))
          assert(stage.participants.some((p) => p.teamId === id));
    assert(
      teams.includes(
        (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).championId!,
      ),
    );
  }
});

test("league single/double cycles support draws, points and deciding playoffs", async () => {
  for (const cycles of [1, 2]) {
    const { event, owner, teams } = await fixture(4, "LEAGUE");
    await db.tournament.update({
      where: { id: event.id },
      data: {
        engineRules: {
          league: { cycles, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: true },
        },
      },
    });
    await generateBracket(event.id, owner.id);
    const leagueMatches = await db.match.findMany({
      where: { tournamentId: event.id, isBye: false },
      orderBy: [{ round: "asc" }, { position: "asc" }],
    });
    assert.equal(leagueMatches.length, 6 * cycles);
    const statistics = {
      killsA: 10,
      deathsA: 10,
      assistsA: 10,
      killsB: 10,
      deathsB: 10,
      assistsB: 10,
      durationSeconds: 600,
    };
    for (const match of leagueMatches)
      await saveResult(event.id, match.id, owner.id, 1, 1, statistics);
    assert.equal(
      (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase,
      "ONGOING",
    );
    const stage = await db.tournamentStage.findFirstOrThrow({
      where: { tournamentId: event.id, kind: "PLAYOFF" },
    });
    let guard = 0;
    while (
      (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase !== "COMPLETED"
    ) {
      assert(guard++ < 4);
      const match = await db.match.findFirstOrThrow({
        where: {
          stageId: stage.id,
          status: { not: "COMPLETED" },
          teamAId: { not: null },
          teamBId: { not: null },
        },
        orderBy: { round: "asc" },
      });
      await assert.rejects(
        () => saveResult(event.id, match.id, owner.id, 1, 1, statistics),
        /decisive/,
      );
      await saveResult(event.id, match.id, owner.id, 2, 1, statistics);
    }
    assert(
      teams.includes(
        (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).championId!,
      ),
    );
  }
});

test("battle royale confirms complete lobby rounds, rejects foreign/duplicate placements and uses cumulative points", async () => {
  const { confirmBattle, battleDetail } =
    await import("../../apps/api/src/modules/brackets/battle.js");
  const { event, owner, teams } = await fixture(4, "BATTLE_ROYALE");
  await db.tournament.update({
    where: { id: event.id },
    data: {
      engineRules: {
        battle: {
          rounds: 3,
          placementPoints: [10, 6, 3, 0],
          eliminationPoints: 2,
          tieBreakers: ["ELIMINATIONS", "WINS", "LAST_ROUND_PLACEMENT"],
        },
      },
    },
  });
  await generateBracket(event.id, owner.id);
  assert.equal(await db.match.count({ where: { tournamentId: event.id } }), 0);
  const rounds = await db.battleRound.findMany({
    where: { tournamentId: event.id },
    orderBy: { number: "asc" },
  });
  const results = teams.map((teamId, i) => ({
    teamId,
    placement: i + 1,
    eliminations: 4 - i,
    noShow: false,
  }));
  await assert.rejects(
    () => confirmBattle(event.id, rounds[1].id, owner.id, { results }),
    /earlier rounds/,
  );
  await assert.rejects(() =>
    confirmBattle(event.id, rounds[0].id, owner.id, {
      results: results.map((r) => ({ ...r, placement: 1 })),
    }),
  );
  await assert.rejects(() =>
    confirmBattle(event.id, rounds[0].id, owner.id, {
      results: results.map((r, i) => (i ? r : { ...r, teamId: "foreign" })),
    }),
  );
  const key = randomUUID();
  await confirmBattle(event.id, rounds[0].id, owner.id, { results }, key);
  await confirmBattle(event.id, rounds[0].id, owner.id, { results }, key);
  for (const round of rounds.slice(1))
    await confirmBattle(event.id, round.id, owner.id, { results });
  const detail = await battleDetail(event.id);
  assert.equal(detail.standings[0].id, teams[0]);
  assert.equal(detail.standings[0].points, 54);
  assert.equal(
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).championId,
    teams[0],
  );
  assert.equal(
    await db.battleRoundResult.count({ where: { round: { tournamentId: event.id } } }),
    12,
  );
});
test("battle royale tied absent leaders get a deciding lobby instead of an arbitrary seed champion", async () => {
  const { confirmBattle } = await import("../../apps/api/src/modules/brackets/battle.js");
  const { event, owner, teams } = await fixture(3, "BATTLE_ROYALE");
  await db.tournament.update({
    where: { id: event.id },
    data: {
      engineRules: {
        battle: {
          rounds: 2,
          placementPoints: [0, 0, 0],
          eliminationPoints: 1,
          tieBreakers: ["LAST_ROUND_PLACEMENT"],
        },
      },
    },
  });
  await generateBracket(event.id, owner.id);
  const rounds = await db.battleRound.findMany({
    where: { tournamentId: event.id },
    orderBy: { number: "asc" },
  });
  await confirmBattle(event.id, rounds[0].id, owner.id, {
    results: teams.map((teamId, i) => ({
      teamId,
      placement: i + 1,
      eliminations: i < 2 ? 5 : 0,
      noShow: false,
    })),
  });
  await confirmBattle(event.id, rounds[1].id, owner.id, {
    results: teams.map((teamId, i) => ({
      teamId,
      placement: i < 2 ? null : 1,
      eliminations: 0,
      noShow: i < 2,
    })),
  });
  const tie = await db.battleRound.findFirstOrThrow({
    where: { tournamentId: event.id, isTiebreak: true },
  });
  assert.deepEqual(new Set(tie.participantIds), new Set(teams.slice(0, 2)));
  await confirmBattle(event.id, tie.id, owner.id, {
    results: tie.participantIds.map((teamId, i) => ({
      teamId,
      placement: i + 1,
      eliminations: 0,
      noShow: false,
    })),
  });
  assert.equal(
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).championId,
    tie.participantIds[0],
  );
});

const realStats = {
  killsA: 20,
  deathsA: 10,
  assistsA: 10,
  killsB: 10,
  deathsB: 20,
  assistsB: 5,
  durationSeconds: 600,
};
async function finishHeadToHead(eventId: string, ownerId: string) {
  for (let guard = 0; guard < 300; guard++) {
    if ((await db.tournament.findUniqueOrThrow({ where: { id: eventId } })).phase === "COMPLETED")
      return;
    const m = await db.match.findFirstOrThrow({
      where: {
        tournamentId: eventId,
        status: { not: "COMPLETED" },
        teamAId: { not: null },
        teamBId: { not: null },
      },
      orderBy: [{ round: "asc" }, { position: "asc" }],
    });
    await saveResult(eventId, m.id, ownerId, 2, 0, realStats);
  }
  assert.fail("Tournament failed to finish");
}
test("reviewed corrections invalidate only dependencies, preserve history and replay all head-to-head formats", async () => {
  const { openDispute, previewCorrection } =
    await import("../../apps/api/src/modules/matches/disputes.js");
  const { applyCorrection } = await import("../../apps/api/src/modules/matches/corrections.js");
  for (const format of [
    "SINGLE_ELIMINATION",
    "DOUBLE_ELIMINATION",
    "ROUND_ROBIN",
    "SWISS",
    "GROUPS",
    "LEAGUE",
  ]) {
    const { event, owner } = await fixture(format === "GROUPS" ? 8 : 5, format);
    if (format === "GROUPS")
      await db.tournament.update({
        where: { id: event.id },
        data: { engineRules: { groups: { count: 2, advance: 2 } } },
      });
    if (format === "LEAGUE")
      await db.tournament.update({
        where: { id: event.id },
        data: {
          engineRules: {
            league: { cycles: 1, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: true },
          },
        },
      });
    await generateBracket(event.id, owner.id);
    await finishHeadToHead(event.id, owner.id);
    const target = await db.match.findFirstOrThrow({
      where: { tournamentId: event.id, isBye: false },
      orderBy: [{ round: "asc" }, { position: "asc" }],
    });
    const dispute = await openDispute(
      event.id,
      target.id,
      owner.id,
      "The recorded score requires an official review.",
    );
    const preview = await previewCorrection(event.id, dispute.id, owner.id);
    await assert.rejects(
      () =>
        applyCorrection(
          event.id,
          dispute.id,
          owner.id,
          "0".repeat(64),
          "Correct the confirmed evidence.",
          { scoreA: 0, scoreB: 2, statistics: realStats, outcome: "PLAYED", reason: "" },
        ),
      /fresh rollback preview/,
    );
    const key = randomUUID(),
      input = {
        scoreA: 0,
        scoreB: 2,
        statistics: realStats,
        outcome: "PLAYED" as const,
        reason: "",
      };
    await applyCorrection(
      event.id,
      dispute.id,
      owner.id,
      preview.previewHash,
      "Correct the score based on reviewed evidence.",
      input,
      key,
    );
    await applyCorrection(
      event.id,
      dispute.id,
      owner.id,
      preview.previewHash,
      "Correct the score based on reviewed evidence.",
      input,
      key,
    );
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: target.id } })).winnerId,
      target.teamBId,
    );
    assert.equal(
      await db.engineHistory.count({
        where: { tournamentId: event.id, action: "correction.rollback" },
      }),
      1,
    );
    for (const affected of preview.affectedMatches) {
      const row = await db.match.findUnique({ where: { id: affected.id } });
      if (row && !row.isBye) assert.notEqual(row.status, "COMPLETED");
    }
    await finishHeadToHead(event.id, owner.id);
    assert.equal(
      (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase,
      "COMPLETED",
    );
  }
});
test("participant reports need confirmation; disputes pause dependencies; no-shows and stale reports are enforced", async () => {
  const { reportResult, reviewReport } =
    await import("../../apps/api/src/modules/matches/reports.js");
  const { openDispute, previewCorrection } =
    await import("../../apps/api/src/modules/matches/disputes.js");
  const { confirmResult, scheduleMatch } =
    await import("../../apps/api/src/modules/matches/service.js");
  const { applyCorrection } = await import("../../apps/api/src/modules/matches/corrections.js");
  const { event, owner } = await fixture(4);
  await generateBracket(event.id, owner.id);
  const first = await db.match.findFirstOrThrow({
    where: { tournamentId: event.id, round: 1, position: 0 },
  });
  const player = await db.team.findUniqueOrThrow({ where: { id: first.teamAId! } });
  const report = await reportResult(event.id, first.id, player.captainId, {
    scoreA: 2,
    scoreB: 0,
    outcome: "PLAYED",
    reason: "",
  });
  assert.equal(await db.matchResult.count({ where: { matchId: first.id } }), 0);
  await reviewReport(
    event.id,
    report.id,
    owner.id,
    true,
    "The organizer confirms the submitted result.",
  );
  assert.equal(await db.matchResult.count({ where: { matchId: first.id } }), 1);
  const dispute = await openDispute(
    event.id,
    first.id,
    player.captainId,
    "The organizer should review this disputed result.",
  );
  const second = await db.match.findFirstOrThrow({
    where: { tournamentId: event.id, round: 1, position: 1 },
  });
  await assert.rejects(
    () =>
      confirmResult(event.id, second.id, owner.id, {
        outcome: "NO_SHOW",
        winnerId: second.teamAId!,
        reason: "The other team did not arrive.",
      }),
    /grace period/,
  );
  await confirmResult(event.id, second.id, owner.id, {
    outcome: "FORFEIT",
    winnerId: second.teamAId!,
    reason: "The opposing team explicitly forfeited.",
  });
  const final = await db.match.findFirstOrThrow({ where: { tournamentId: event.id, round: 2 } });
  await assert.rejects(() => saveResult(event.id, final.id, owner.id, 2, 0), /disputed dependency/);
  const preview = await previewCorrection(event.id, dispute.id, owner.id);
  await scheduleMatch(
    event.id,
    final.id,
    owner.id,
    new Date(event.startsAt.getTime() + 3600000).toISOString(),
    "Server one",
  );
  await assert.rejects(
    () =>
      applyCorrection(
        event.id,
        dispute.id,
        owner.id,
        preview.previewHash,
        "Correct the result after review.",
        { outcome: "PLAYED", scoreA: 0, scoreB: 2, reason: "" },
      ),
    /fresh rollback preview/,
  );
  const fresh = await previewCorrection(event.id, dispute.id, owner.id);
  await applyCorrection(
    event.id,
    dispute.id,
    owner.id,
    fresh.previewHash,
    "Correct the result after review.",
    { outcome: "PLAYED", scoreA: 0, scoreB: 2, reason: "" },
  );
  await finishHeadToHead(event.id, owner.id);
  const forfeit = await db.match.findUniqueOrThrow({ where: { id: second.id } });
  assert.equal(forfeit.scoreA, null);
  assert.equal(forfeit.outcome, "FORFEIT");
});
test("battle correction previews void later rounds and retain prior result history", async () => {
  const { confirmBattle } = await import("../../apps/api/src/modules/brackets/battle.js");
  const { openDispute, previewCorrection } =
    await import("../../apps/api/src/modules/matches/disputes.js");
  const { applyCorrection } = await import("../../apps/api/src/modules/matches/corrections.js");
  const { event, owner, teams } = await fixture(3, "BATTLE_ROYALE");
  await db.tournament.update({
    where: { id: event.id },
    data: {
      engineRules: {
        battle: {
          rounds: 2,
          placementPoints: [10, 5, 0],
          eliminationPoints: 1,
          tieBreakers: ["LAST_ROUND_PLACEMENT"],
        },
      },
    },
  });
  await generateBracket(event.id, owner.id);
  const rounds = await db.battleRound.findMany({
    where: { tournamentId: event.id },
    orderBy: { number: "asc" },
  });
  const results = teams.map((teamId, i) => ({
    teamId,
    placement: i + 1,
    eliminations: 0,
    noShow: false,
  }));
  for (const r of rounds) await confirmBattle(event.id, r.id, owner.id, { results });
  const dispute = await openDispute(
    event.id,
    rounds[0].id,
    owner.id,
    "The placement evidence needs correction.",
    true,
  );
  const preview = await previewCorrection(event.id, dispute.id, owner.id);
  assert.equal(preview.voidedResults, 1);
  await applyCorrection(
    event.id,
    dispute.id,
    owner.id,
    preview.previewHash,
    "Correct the verified placement ordering.",
    { results: results.map((r, i) => ({ ...r, placement: 3 - i })) },
  );
  assert.equal(await db.battleRoundResult.count({ where: { roundId: rounds[1].id } }), 0);
  assert.equal(
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase,
    "ONGOING",
  );
  await confirmBattle(event.id, rounds[1].id, owner.id, { results });
  assert.equal(
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase,
    "COMPLETED",
  );
});

test("schedule slots reject overlapping participants, dependency overlap, end overflow and concurrent conflicts", async () => {
  const { scheduleMatch } = await import("../../apps/api/src/modules/matches/service.js");
  const { event, owner } = await fixture(4, "ROUND_ROBIN");
  const matches = await generateBracket(event.id, owner.id);
  const first = matches.find((m) => m.round === 1)!;
  const next = matches.find(
    (m) => m.round === 2 && [m.teamAId, m.teamBId].includes(first.teamAId),
  )!;
  const start = event.startsAt.getTime();
  const at = (minutes: number) => new Date(start + minutes * 60000).toISOString();
  await scheduleMatch(event.id, first.id, owner.id, at(0), "Room", 60);
  await assert.rejects(
    () => scheduleMatch(event.id, next.id, owner.id, at(30), "Room", 60),
    /overlapping|preceding/,
  );
  await scheduleMatch(event.id, next.id, owner.id, at(60), "Room", 60);
  await assert.rejects(
    () => scheduleMatch(event.id, first.id, owner.id, at(30), "Room", 60),
    /overlapping|next round/,
  );
  await db.tournament.update({
    where: { id: event.id },
    data: { endsAt: new Date(start + 120 * 60000) },
  });
  await assert.rejects(
    () => scheduleMatch(event.id, next.id, owner.id, at(100), "Room", 60),
    /full slot/,
  );
  const fixture2 = await fixture(4, "ROUND_ROBIN");
  const m2 = await generateBracket(fixture2.event.id, fixture2.owner.id);
  const a = m2.find((m) => m.round === 1)!,
    b = m2.find((m) => m.round === 2 && [m.teamAId, m.teamBId].includes(a.teamAId))!;
  const outcomes = await Promise.allSettled(
    [a, b].map((m) =>
      scheduleMatch(
        fixture2.event.id,
        m.id,
        fixture2.owner.id,
        fixture2.event.startsAt.toISOString(),
        "Room",
        60,
      ),
    ),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
});

test("exact group qualification ties resolve through played qualifiers before championship playoffs", async () => {
  const { event, owner } = await fixture(6, "GROUPS");
  await db.tournament.update({
    where: { id: event.id },
    data: { engineRules: { groups: { count: 2, advance: 2 } } },
  });
  await generateBracket(event.id, owner.id);
  const groups = await db.tournamentStage.findMany({
    where: { tournamentId: event.id, kind: "GROUP" },
    include: { participants: { orderBy: { seed: "asc" } }, matches: true },
  });
  const stats = {
    killsA: 10,
    killsB: 10,
    deathsA: 10,
    deathsB: 10,
    assistsA: 5,
    assistsB: 5,
    durationSeconds: 600,
  };
  for (const g of groups)
    for (const m of g.matches.filter((m) => !m.isBye)) {
      const ids = g.participants.map((p) => p.teamId);
      const ai = ids.indexOf(m.teamAId!),
        bi = ids.indexOf(m.teamBId!);
      const aWins = (ai + 1) % 3 === bi;
      await saveResult(event.id, m.id, owner.id, aWins ? 1 : 0, aWins ? 0 : 1, stats);
    }
  assert.equal(
    await db.tournamentStage.count({ where: { tournamentId: event.id, kind: "PLAYOFF" } }),
    0,
  );
  let guard = 0;
  while (
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase !== "COMPLETED"
  ) {
    assert(guard++ < 10);
    const m = await db.match.findFirstOrThrow({
      where: {
        tournamentId: event.id,
        status: { not: "COMPLETED" },
        teamAId: { not: null },
        teamBId: { not: null },
      },
      orderBy: [{ round: "asc" }, { position: "asc" }],
    });
    await saveResult(event.id, m.id, owner.id, 1, 0, stats);
  }
  const qualifiers = await db.tournamentStage.findMany({
    where: { tournamentId: event.id, kind: "QUALIFIER" },
    include: { matches: true },
  });
  assert.equal(qualifiers.length, 2);
  assert(qualifiers.every((s) => s.completed));
  assert.equal(
    (
      await db.tournamentStage.findFirstOrThrow({
        where: { tournamentId: event.id, kind: "PLAYOFF" },
        include: { participants: true },
      })
    ).participants.length,
    4,
  );
});

test("assignment swaps preserve entrants and regeneration is forbidden after a confirmed result", async () => {
  const { swapAssignments, resetBracket, changeMatchFormat } =
    await import("../../apps/api/src/modules/matches/operations.js");
  const { event, owner, teams } = await fixture(4);
  let matches = await generateBracket(event.id, owner.id);
  const first = matches.filter((m) => m.round === 1);
  await swapAssignments(
    event.id,
    owner.id,
    { matchId: first[0].id, side: "A" },
    { matchId: first[1].id, side: "B" },
  );
  const updated = await db.match.findMany({ where: { tournamentId: event.id, round: 1 } });
  assert.deepEqual(updated.flatMap((m) => [m.teamAId, m.teamBId]).sort(), [...teams].sort());
  await changeMatchFormat(event.id, first[0].id, owner.id, "BO3");
  await assert.rejects(() => saveResult(event.id, first[0].id, owner.id, 1, 0), /best-of/);
  await resetBracket(event.id, owner.id, "Reseed before any matches are played");
  matches = await generateBracket(event.id, owner.id, { seeding: "RANDOM" });
  await saveResult(event.id, matches.find((m) => m.round === 1)!.id, owner.id, 2, 0);
  await assert.rejects(
    () => resetBracket(event.id, owner.id, "Cannot reset a played bracket"),
    /recorded results/,
  );
  await assert.rejects(
    () =>
      swapAssignments(
        event.id,
        owner.id,
        { matchId: matches[0].id, side: "A" },
        { matchId: matches[1].id, side: "B" },
      ),
    /lock/,
  );
});

test("private engine review APIs enforce session, ownership, participant access and CSRF", async () => {
  const request = (await import("supertest")).default;
  const { app } = await import("../../apps/api/src/app.js");
  const { createHash } = await import("node:crypto");
  const { event, owner } = await fixture(2);
  await db.tournament.update({ where: { id: event.id }, data: { visibility: "PRIVATE" } });
  const [match] = await generateBracket(event.id, owner.id);
  async function cookie(userId: string) {
    const token = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        userId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return `matchflow_session=${token}`;
  }
  const outsider = (await fixture(2)).owner;
  const outsiderCookie = await cookie(outsider.id),
    ownerCookie = await cookie(owner.id);
  for (const path of ["engine-history", "my-reports", "battle"])
    assert(
      [401, 404].includes((await request(app).get(`/api/tournaments/${event.id}/${path}`)).status),
    );
  assert.equal(
    (
      await request(app)
        .get(`/api/tournaments/${event.id}/engine-history`)
        .set("Cookie", outsiderCookie)
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/tournaments/${event.id}/engine-history`)
        .set("Cookie", ownerCookie)
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post(`/api/tournaments/${event.id}/matches/${match.id}/result`)
        .set("Cookie", ownerCookie)
        .send({ scoreA: 1, scoreB: 0 })
    ).status,
    403,
  );
});

test("concurrent reviewed corrections reject stale previews and retain human-readable prior results", async () => {
  const { openDispute, previewCorrection, matchHistory } =
    await import("../../apps/api/src/modules/matches/disputes.js");
  const { applyCorrection } = await import("../../apps/api/src/modules/matches/corrections.js");
  const { event, owner } = await fixture(2);
  const [match] = await generateBracket(event.id, owner.id);
  await saveResult(event.id, match.id, owner.id, 2, 0);
  const dispute = await openDispute(
    event.id,
    match.id,
    owner.id,
    "The organizer requested a verified score review",
  );
  const preview = await previewCorrection(event.id, dispute.id, owner.id);
  const results = await Promise.allSettled([
    applyCorrection(
      event.id,
      dispute.id,
      owner.id,
      preview.previewHash,
      "Verified correction after reviewing match evidence",
      { outcome: "PLAYED", reason: "", scoreA: 0, scoreB: 2 },
    ),
    applyCorrection(
      event.id,
      dispute.id,
      owner.id,
      preview.previewHash,
      "A conflicting concurrent correction request",
      { outcome: "PLAYED", reason: "", scoreA: 1, scoreB: 0 },
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.matchResult.count({ where: { matchId: match.id } }), 1);
  const activity = await matchHistory(event.id, owner.id);
  assert(
    activity.history.some(
      (h) =>
        h.action === "correction.rollback" && h.evidence.some((line) => line.includes("2 : 0")),
    ),
  );
  const foreign = (await fixture(2)).owner;
  await assert.rejects(() => matchHistory(event.id, foreign.id));
});

test("no-show after grace records a real administrative win without score or timing inflation", async () => {
  const { confirmResult } = await import("../../apps/api/src/modules/matches/service.js");
  const { event, owner } = await fixture(2);
  const [match] = await generateBracket(event.id, owner.id);
  await db.tournament.update({
    where: { id: event.id },
    data: {
      opensAt: new Date(Date.now() - 7200000),
      closesAt: new Date(Date.now() - 5400000),
      startsAt: new Date(Date.now() - 3600000),
      engineRules: { noShowGraceMinutes: 15 },
    },
  });
  await confirmResult(event.id, match.id, owner.id, {
    outcome: "NO_SHOW",
    reason: "Opponent did not attend after the grace period",
    winnerId: match.teamAId!,
  });
  const result = await db.match.findUniqueOrThrow({ where: { id: match.id } });
  assert.equal(result.scoreA, null);
  assert.equal(result.durationSeconds, null);
  assert.equal(result.outcome, "NO_SHOW");
  assert.equal(
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).championId,
    match.teamAId,
  );
});

test("player/team histories distinguish draws from losses and include only visible battle rounds", async () => {
  const { competitionHistory } = await import("../../apps/api/src/modules/users/history.js");
  const { confirmBattle } = await import("../../apps/api/src/modules/brackets/battle.js");
  const league = await fixture(2, "LEAGUE");
  await db.tournament.update({
    where: { id: league.event.id },
    data: {
      engineRules: {
        league: { cycles: 1, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: true },
      },
    },
  });
  const [match] = await generateBracket(league.event.id, league.owner.id);
  await saveResult(league.event.id, match.id, league.owner.id, 1, 1, {
    killsA: 1,
    killsB: 1,
    deathsA: 1,
    deathsB: 1,
    assistsA: 1,
    assistsB: 1,
    durationSeconds: 600,
  });
  const record = await competitionHistory({ teamId: league.teams[0] });
  assert.equal(record.statistics.draws, 1);
  assert.equal(record.statistics.losses, 0);
  const battle = await fixture(2, "BATTLE_ROYALE");
  await db.tournament.update({
    where: { id: battle.event.id },
    data: {
      engineRules: {
        battle: {
          rounds: 1,
          placementPoints: [10, 5],
          eliminationPoints: 1,
          tieBreakers: ["LAST_ROUND_PLACEMENT"],
        },
      },
    },
  });
  await generateBracket(battle.event.id, battle.owner.id);
  const round = await db.battleRound.findFirstOrThrow({ where: { tournamentId: battle.event.id } });
  await confirmBattle(battle.event.id, round.id, battle.owner.id, {
    results: battle.teams.map((teamId, i) => ({
      teamId,
      placement: i + 1,
      eliminations: 2,
      noShow: false,
    })),
  });
  const history = await competitionHistory({ teamId: battle.teams[0] });
  assert.equal(history.history[0].battleRounds[0].points, 12);
  assert.equal(history.statistics.losses, 0);
  await db.tournament.update({ where: { id: battle.event.id }, data: { visibility: "PRIVATE" } });
  assert.equal((await competitionHistory({ teamId: battle.teams[0] })).history.length, 0);
});

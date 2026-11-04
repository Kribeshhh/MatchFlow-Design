import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
import { generateBracket } from "../../apps/api/src/modules/brackets/service.js";
import { saveResult } from "../../apps/api/src/modules/matches/service.js";
const write = (
  a: ReturnType<typeof request.agent>,
  method: "post" | "patch" | "delete",
  path: string,
  body: object = {},
) =>
  a[method]("/api" + path)
    .set("X-MatchFlow", "1")
    .set("Origin", "http://localhost:5173")
    .send(body);
async function account() {
  const agent = request.agent(app),
    username = `event_${randomBytes(5).toString("hex")}`;
  const response = await write(agent, "post", "/auth/register", {
    username,
    email: `${username}@test.invalid`,
    password: randomBytes(24).toString("hex"),
  });
  assert.equal(response.status, 201);
  await db.user.update({
    where: { id: response.body.user.id },
    data: { emailVerifiedAt: new Date() },
  });
  return { agent, id: response.body.user.id as string };
}
const body = (extra: object = {}) => ({
  name: `Event ${randomBytes(4).toString("hex")}`,
  game: "valorant",
  description: "A competitive test tournament.",
  rules: "Decisive match results are final.",
  teamSize: 1,
  maxTeams: 2,
  opensAt: new Date(Date.now() - 60000).toISOString(),
  closesAt: new Date(Date.now() + 3600000).toISOString(),
  startsAt: new Date(Date.now() + 7200000).toISOString(),
  ...extra,
});
after(() => db.$disconnect());
test("private secret links, draft visibility, rotation, individual identity and CSV boundaries", async () => {
  const owner = await account(),
    player = await account(),
    outsider = await account();
  const created = await write(
    owner.agent,
    "post",
    "/tournaments",
    body({ visibility: "PRIVATE", saveAsDraft: true, competitionType: "INDIVIDUAL" }),
  );
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert(!JSON.stringify(created.body).includes("shareTokenHash"));
  assert.equal((await outsider.agent.get(`/api/tournaments/${id}`)).status, 404);
  assert.equal(
    (await write(outsider.agent, "post", `/tournaments/${id}/lifecycle`, { action: "PUBLISH" }))
      .status,
    404,
  );
  assert.equal(
    (await write(owner.agent, "post", `/tournaments/${id}/lifecycle`, { action: "PUBLISH" }))
      .status,
    200,
  );
  const link = await write(owner.agent, "post", `/tournaments/${id}/share-link`);
  assert.equal(link.status, 200);
  assert.equal(
    (await db.tournament.findUniqueOrThrow({ where: { id } })).shareTokenHash === link.body.token,
    false,
  );
  assert.equal(
    (await write(player.agent, "post", `/tournaments/${id}/individual-registration`)).status,
    404,
  );
  const redeem = await write(player.agent, "post", `/tournaments/${id}/access`, {
    token: link.body.token,
  });
  assert.equal(redeem.status, 200);
  assert.match(String(redeem.headers["set-cookie"]), /HttpOnly/);
  assert.equal((await player.agent.get(`/api/tournaments/${id}`)).status, 200);
  assert.equal(
    (
      await write(player.agent, "post", `/tournaments/${id}/individual-registration`, {
        userId: outsider.id,
      })
    ).status,
    400,
  );
  const entry = await write(player.agent, "post", `/tournaments/${id}/individual-registration`);
  assert.equal(entry.status, 201);
  assert.equal(entry.body.roster[0].id, player.id);
  assert.equal((await player.agent.get(`/api/teams/${entry.body.teamId}`)).status, 404);
  assert.equal(
    (await player.agent.get("/api/teams")).body.some(
      (t: { id: string }) => t.id === entry.body.teamId,
    ),
    false,
  );
  assert.equal(
    (await write(player.agent, "post", `/tournaments/${id}/individual-registration`)).status,
    400,
  );
  assert.equal(
    (await write(outsider.agent, "post", `/tournaments/${id}/access`, { token: link.body.token }))
      .status,
    200,
  );
  await write(owner.agent, "post", `/tournaments/${id}/share-link`);
  assert.equal((await outsider.agent.get(`/api/tournaments/${id}`)).status, 404);
  assert.equal((await player.agent.get(`/api/tournaments/${id}`)).status, 200);
  assert.equal(
    (await request(app).get("/api/tournaments")).body.some((t: { id: string }) => t.id === id),
    false,
  );
  assert.equal((await outsider.agent.get(`/api/tournaments/${id}/export`)).status, 404);
  const csv = await owner.agent.get(`/api/tournaments/${id}/export`);
  assert.equal(csv.status, 200);
  assert(!csv.text.includes("@test.invalid"));
  const detail = await player.agent.get(`/api/tournaments/${id}`);
  assert(!JSON.stringify(detail.body).includes("shareTokenHash"));
});
test("capacity races, FIFO promotion, frozen snapshots, withdrawals, cancellation and deadlines", async () => {
  const owner = await account(),
    players = await Promise.all(Array.from({ length: 4 }, () => account()));
  const event = (
    await write(
      owner.agent,
      "post",
      "/tournaments",
      body({ competitionType: "INDIVIDUAL", waitlistEnabled: true }),
    )
  ).body;
  const entries = [];
  for (const player of players) {
    const r = await write(player.agent, "post", `/tournaments/${event.id}/individual-registration`);
    assert.equal(r.status, 201);
    entries.push(r.body);
  }
  assert.deepEqual(
    entries.map((r) => r.status),
    ["PENDING", "PENDING", "WAITLISTED", "WAITLISTED"],
  );
  assert.equal(
    (
      await write(
        players[1].agent,
        "post",
        `/tournaments/${event.id}/registrations/${entries[0].id}/withdraw`,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await write(owner.agent, "patch", `/tournaments/${event.id}/registrations/${entries[3].id}`, {
        status: "APPROVED",
      })
    ).status,
    400,
  );
  const snapshot = entries[2].roster;
  const outcomes = await Promise.all([
    write(
      players[0].agent,
      "post",
      `/tournaments/${event.id}/registrations/${entries[0].id}/withdraw`,
    ),
    write(
      players[1].agent,
      "post",
      `/tournaments/${event.id}/registrations/${entries[1].id}/withdraw`,
    ),
  ]);
  assert(outcomes.every((r) => r.status === 200));
  const promoted = await db.tournamentRegistration.findMany({
    where: { tournamentId: event.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(
    promoted.map((r) => r.id),
    [entries[2].id, entries[3].id],
  );
  assert.deepEqual(promoted[0].roster, snapshot);
  assert.equal(
    (
      await write(owner.agent, "post", `/tournaments/${event.id}/lifecycle`, {
        action: "CANCEL",
        reason: "The organizer cannot host this date.",
      })
    ).status,
    200,
  );
  assert.equal(
    (await write(players[0].agent, "post", `/tournaments/${event.id}/individual-registration`))
      .status,
    400,
  );
  assert.equal((await write(owner.agent, "post", `/tournaments/${event.id}/bracket`)).status, 400);
  assert.equal(
    (await write(owner.agent, "post", `/tournaments/${event.id}/lifecycle`, { action: "PUBLISH" }))
      .status,
    400,
  );
  const race = (
    await write(
      owner.agent,
      "post",
      "/tournaments",
      body({ competitionType: "INDIVIDUAL", waitlistEnabled: true }),
    )
  ).body;
  const parallel = await Promise.all(
    players.map((p) => write(p.agent, "post", `/tournaments/${race.id}/individual-registration`)),
  );
  assert(parallel.every((r) => r.status === 201));
  assert.equal(parallel.filter((r) => r.body.status === "PENDING").length, 2);
  assert.equal(parallel.filter((r) => r.body.status === "WAITLISTED").length, 2);
  await db.tournament.update({
    where: { id: race.id },
    data: { closesAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (
      await write(
        players[0].agent,
        "post",
        `/tournaments/${race.id}/registrations/${parallel[0].body.id}/withdraw`,
      )
    ).status,
    400,
  );
});
test("check-in window, organizer review, postponed publication and locked structure", async () => {
  const owner = await account(),
    player = await account();
  const input = body({ competitionType: "INDIVIDUAL", checkInRequired: true });
  const event = (await write(owner.agent, "post", "/tournaments", input)).body;
  const entry = (
    await write(player.agent, "post", `/tournaments/${event.id}/individual-registration`)
  ).body;
  assert.equal(
    (
      await write(owner.agent, "patch", `/tournaments/${event.id}`, {
        ...input,
        format: "DOUBLE_ELIMINATION",
      })
    ).status,
    400,
  );
  assert.equal(
    (await write(owner.agent, "post", `/tournaments/${event.id}/lifecycle`, { action: "CHECK_IN" }))
      .status,
    400,
  );
  assert.equal(
    (
      await write(owner.agent, "post", `/tournaments/${event.id}/lifecycle`, {
        action: "POSTPONE",
        reason: "Venue availability requires a new date.",
      })
    ).status,
    200,
  );
  assert.equal(
    (await write(owner.agent, "post", `/tournaments/${event.id}/lifecycle`, { action: "PUBLISH" }))
      .status,
    200,
  );
  assert.equal(
    (
      await write(owner.agent, "patch", `/tournaments/${event.id}/registrations/${entry.id}`, {
        status: "APPROVED",
      })
    ).status,
    200,
  );
  await db.tournament.update({
    where: { id: event.id },
    data: { closesAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await write(owner.agent, "post", `/tournaments/${event.id}/lifecycle`, { action: "CHECK_IN" }))
      .status,
    200,
  );
  assert.equal(
    (
      await write(
        player.agent,
        "post",
        `/tournaments/${event.id}/registrations/${entry.id}/check-in`,
      )
    ).status,
    200,
  );
  assert(
    (await db.tournamentRegistration.findUniqueOrThrow({ where: { id: entry.id } })).checkedInAt,
  );
  assert.equal((await write(owner.agent, "post", `/tournaments/${event.id}/bracket`)).status, 400);
});
test("all added engines complete, reset final, KDA tie-breaks and immutable series results", async () => {
  const owner = await account();
  const teams = [];
  for (let i = 0; i < 5; i++)
    teams.push(
      await db.team.create({
        data: { name: `Engine ${i}`, game: "valorant", captainId: owner.id },
      }),
    );
  for (const format of ["DOUBLE_ELIMINATION", "ROUND_ROBIN", "SWISS"]) {
    const event = await db.tournament.create({
      data: {
        ...body(),
        opensAt: new Date(Date.now() - 10000),
        closesAt: new Date(Date.now() + 10000),
        startsAt: new Date(Date.now() + 20000),
        organizerId: owner.id,
        format,
        matchFormat: "BO3",
        maxTeams: 8,
      },
    });
    await db.tournamentRegistration.createMany({
      data: teams.map((t) => ({
        tournamentId: event.id,
        teamId: t.id,
        status: "APPROVED",
        roster: [],
      })),
    });
    await generateBracket(event.id, owner.id);
    let played = 0;
    while (
      (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase !== "COMPLETED"
    ) {
      assert(played++ < 50, "Engine must terminate");
      const match = await db.match.findFirst({
        where: {
          tournamentId: event.id,
          status: { not: "COMPLETED" },
          teamAId: { not: null },
          teamBId: { not: null },
        },
        orderBy: [{ round: "asc" }, { position: "asc" }],
      });
      assert(match);
      const stats = {
        killsA: 20,
        deathsA: 10,
        assistsA: 10,
        killsB: 10,
        deathsB: 20,
        assistsB: 5,
        durationSeconds: 600,
      };
      await assert.rejects(() => saveResult(event.id, match.id, owner.id, 1, 0, stats), /best-of/);
      if (format !== "DOUBLE_ELIMINATION")
        await assert.rejects(() => saveResult(event.id, match.id, owner.id, 2, 0), /KDA/);
      const upset = match.bracket === "GRAND_FINAL";
      await saveResult(event.id, match.id, owner.id, upset ? 0 : 2, upset ? 2 : 0, stats);
      await assert.rejects(() => saveResult(event.id, match.id, owner.id, 2, 0, stats));
    }
    const result = await db.tournament.findUniqueOrThrow({ where: { id: event.id } });
    assert(result.championId);
    if (format === "DOUBLE_ELIMINATION")
      assert.equal(
        await db.match.count({ where: { tournamentId: event.id, bracket: "FINAL_RESET" } }),
        1,
      );
    if (format === "ROUND_ROBIN")
      assert.equal(
        await db.match.count({
          where: { tournamentId: event.id, isBye: false, bracket: "ROUND_ROBIN" },
        }),
        10,
      );
    if (format === "SWISS")
      assert.equal(
        (
          await db.match.aggregate({
            where: { tournamentId: event.id, bracket: "SWISS" },
            _max: { round: true },
          })
        )._max.round,
        3,
      );
  }
});

test("exact round-robin ties generate a deciding playoff instead of a seeded champion", async () => {
  const owner = await account();
  const event = await db.tournament.create({
    data: { ...body(), organizerId: owner.id, format: "ROUND_ROBIN", maxTeams: 4 },
  });
  const teams = [];
  for (let i = 0; i < 3; i++)
    teams.push(
      await db.team.create({ data: { name: `Tie ${i}`, game: "valorant", captainId: owner.id } }),
    );
  await db.tournamentRegistration.createMany({
    data: teams.map((t) => ({
      tournamentId: event.id,
      teamId: t.id,
      status: "APPROVED",
      roster: [],
    })),
  });
  await generateBracket(event.id, owner.id);
  const matches = await db.match.findMany({
    where: { tournamentId: event.id, isBye: false },
    orderBy: { round: "asc" },
  });
  const ids = teams.map((t) => t.id);
  for (const m of matches) {
    const a = ids.indexOf(m.teamAId!),
      b = ids.indexOf(m.teamBId!);
    const aWins = (a + 1) % 3 === b;
    await saveResult(event.id, m.id, owner.id, aWins ? 1 : 0, aWins ? 0 : 1, {
      killsA: 10,
      deathsA: 10,
      assistsA: 0,
      killsB: 10,
      deathsB: 10,
      assistsB: 0,
      durationSeconds: 600,
    });
  }
  assert.equal(
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase,
    "ONGOING",
  );
  assert.equal(await db.match.count({ where: { tournamentId: event.id, bracket: "TIEBREAK" } }), 3);
  for (let i = 0; i < 2; i++) {
    const m = await db.match.findFirstOrThrow({
      where: {
        tournamentId: event.id,
        bracket: "TIEBREAK",
        status: { not: "COMPLETED" },
        teamAId: { not: null },
        teamBId: { not: null },
      },
      orderBy: { round: "asc" },
    });
    await saveResult(event.id, m.id, owner.id, 1, 0, {
      killsA: 10,
      deathsA: 10,
      assistsA: 0,
      killsB: 10,
      deathsB: 10,
      assistsB: 0,
      durationSeconds: 600,
    });
  }
  assert.equal(
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).phase,
    "COMPLETED",
  );
});

test("discovery combines filters before pagination and organizer profiles exclude private events", async () => {
  const owner = await account();
  const tag = `Discovery ${randomBytes(4).toString("hex")}`;
  const publicEvent = await write(
    owner.agent,
    "post",
    "/tournaments",
    body({
      name: tag,
      region: "Nepal",
      locationType: "OFFLINE",
      location: "Kathmandu arena",
      format: "ROUND_ROBIN",
      teamSize: 1,
    }),
  );
  assert.equal(publicEvent.status, 201);
  await write(
    owner.agent,
    "post",
    "/tournaments",
    body({ name: tag + " secret", visibility: "PRIVATE" }),
  );
  await write(
    owner.agent,
    "post",
    "/tournaments",
    body({ name: tag + " draft", saveAsDraft: true }),
  );
  const params = new URLSearchParams({
    q: tag,
    game: "valorant",
    region: "nepal",
    locationType: "OFFLINE",
    format: "ROUND_ROBIN",
    teamSize: "1",
    competitionType: "TEAM",
    category: "FREE",
    status: "REGISTRATION_OPEN",
    sort: "UPCOMING",
  });
  const results = await request(app).get(`/api/tournaments?${params}`);
  assert.equal(results.status, 200);
  assert.deepEqual(
    results.body.map((r: { id: string }) => r.id),
    [publicEvent.body.id],
  );
  assert.equal(
    (await request(app).get(`/api/tournaments?q=${encodeURIComponent(tag)}&category=PAID`)).body
      .length,
    0,
  );
  assert.equal(
    (await request(app).get(`/api/tournaments?q=${encodeURIComponent(tag)}&page=2`)).body.length,
    0,
  );
  assert.equal((await request(app).get("/api/tournaments?sort=INVALID")).status, 400);
  const user = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  const profile = await request(app).get(`/api/organizers/${user.username}`);
  assert.equal(profile.status, 200);
  assert.deepEqual(
    profile.body.tournaments.map((t: { id: string }) => t.id),
    [publicEvent.body.id],
  );
  assert(!JSON.stringify(profile.body).includes(user.email));
  const entrant = await account();
  const team = (
    await write(entrant.agent, "post", "/teams", {
      name: "Regional entrant",
      game: "valorant",
      region: "India",
    })
  ).body;
  const restricted = (
    await write(owner.agent, "post", "/tournaments", body({ eligibleRegions: ["Nepal"] }))
  ).body;
  assert.equal(
    (
      await write(entrant.agent, "post", `/tournaments/${restricted.id}/registrations`, {
        teamId: team.id,
      })
    ).status,
    400,
  );
});

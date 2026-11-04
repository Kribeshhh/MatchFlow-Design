import type { Match } from "@prisma/client";
import type { Tx } from "../../database/client.js";
import { seedOrder } from "./domain.js";
import { advance } from "./progression.js";
import { standings, swissPairs, compareStanding } from "./formats.js";
export async function createPairRound(
  tx: Tx,
  tournamentId: string,
  stageId: string,
  round: number,
  bracket: string,
  pairs: [string | null, string | null][],
) {
  await tx.match.createMany({
    data: pairs.map(([teamAId, teamBId], position) => ({
      tournamentId,
      stageId,
      round,
      position,
      bracket,
      teamAId,
      teamBId,
      isBye: !teamAId || !teamBId,
      winnerId: !teamAId || !teamBId ? teamAId || teamBId : null,
      status: !teamAId || !teamBId ? ("COMPLETED" as const) : ("PENDING" as const),
      completedAt: !teamAId || !teamBId ? new Date() : null,
    })),
  });
}
export async function resolveDouble(tx: Tx, tournamentId: string) {
  let changed = true;
  while (changed) {
    changed = false;
    const matches = await tx.match.findMany({
      where: { tournamentId },
      orderBy: [{ round: "asc" }, { position: "asc" }],
    });
    const byId = new Map(matches.map((m) => [m.id, m]));
    for (const m of matches) {
      if (m.status === "COMPLETED") continue;
      const sources = [m.sourceAId, m.sourceBId].map((id) => (id ? byId.get(id) : null));
      if (sources.some((source) => source && source.status !== "COMPLETED")) continue;
      const opponent = (
        source: Match | null | undefined,
        outcome: string,
        current: string | null,
      ) =>
        !source
          ? current
          : outcome === "WINNER"
            ? source.winnerId
            : source.isBye
              ? null
              : source.winnerId === source.teamAId
                ? source.teamBId
                : source.teamAId;
      const teamAId = opponent(sources[0], m.sourceAOutcome, m.teamAId);
      const teamBId = opponent(sources[1], m.sourceBOutcome, m.teamBId);
      const isBye = !teamAId || !teamBId;
      if (teamAId !== m.teamAId || teamBId !== m.teamBId || isBye) {
        await tx.match.update({
          where: { id: m.id },
          data: {
            teamAId,
            teamBId,
            isBye,
            ...(isBye
              ? { status: "COMPLETED", winnerId: teamAId || teamBId, completedAt: new Date() }
              : {}),
          },
        });
        changed = true;
      }
    }
  }
}
export async function advanceFormat(tx: Tx, match: Match, format: string) {
  if (match.bracket === "TIEBREAK") {
    await advance(tx, match);
    return;
  }
  if (format === "DOUBLE_ELIMINATION") {
    await resolveDouble(tx, match.tournamentId);
    if (match.bracket === "GRAND_FINAL" && match.winnerId === match.teamBId) {
      await createPairRound(
        tx,
        match.tournamentId,
        match.stageId!,
        match.round + 1,
        "FINAL_RESET",
        [[match.teamAId, match.teamBId]],
      );
      await tx.match.update({
        where: {
          tournamentId_round_position: {
            tournamentId: match.tournamentId,
            round: match.round + 1,
            position: 0,
          },
        },
        data: {
          sourceAId: match.id,
          sourceAOutcome: "LOSER",
          sourceBId: match.id,
          sourceBOutcome: "WINNER",
        },
      });
    } else if (match.bracket === "GRAND_FINAL" || match.bracket === "FINAL_RESET") {
      await tx.tournament.update({
        where: { id: match.tournamentId },
        data: { phase: "COMPLETED", championId: match.winnerId },
      });
    }
    return;
  }
  const matches = await tx.match.findMany({ where: { tournamentId: match.tournamentId } });
  if (matches.some((m) => m.status !== "COMPLETED")) return;
  const entries = await tx.tournamentRegistration.findMany({
    where: { tournamentId: match.tournamentId, status: "APPROVED" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const event = await tx.tournament.findUniqueOrThrow({ where: { id: match.tournamentId } });
  const ids = event.seedOrder.length ? event.seedOrder : entries.map((e) => e.teamId);
  if (format === "SWISS" && match.round < Math.ceil(Math.log2(ids.length))) {
    await createPairRound(
      tx,
      match.tournamentId,
      match.stageId!,
      match.round + 1,
      "SWISS",
      swissPairs(ids, matches),
    );
    return;
  }
  const ranking = standings(ids, matches, format === "SWISS");
  const tied = ranking.filter((row) => compareStanding(row, ranking[0], format === "SWISS") === 0);
  if (tied.length === 1) {
    await tx.tournament.update({
      where: { id: match.tournamentId },
      data: { phase: "COMPLETED", championId: tied[0].id },
    });
    return;
  }
  const firstRound = Math.max(...matches.map((m) => m.round)) + 1;
  const size = 2 ** Math.ceil(Math.log2(tied.length)),
    order = seedOrder(size);
  for (let r = 0, count = size / 2; count >= 1; r++, count /= 2) {
    for (let position = 0; position < count; position++) {
      const a = r === 0 ? (tied[order[position * 2] - 1]?.id ?? null) : null;
      const b = r === 0 ? (tied[order[position * 2 + 1] - 1]?.id ?? null) : null;
      const bye = r === 0 && (!a || !b);
      await tx.match.create({
        data: {
          tournamentId: match.tournamentId,
          stageId: match.stageId,
          round: firstRound + r,
          position,
          bracket: "TIEBREAK",
          teamAId: a,
          teamBId: b,
          isBye: bye,
          status: bye ? "COMPLETED" : "PENDING",
          winnerId: bye ? a || b : null,
          completedAt: bye ? new Date() : null,
        },
      });
    }
  }
  const byes = await tx.match.findMany({
    where: { tournamentId: match.tournamentId, bracket: "TIEBREAK", isBye: true },
  });
  for (const bye of byes) await advance(tx, bye);
}

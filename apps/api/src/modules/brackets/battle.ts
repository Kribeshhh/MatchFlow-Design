import type { Tournament } from "@prisma/client";
import type { z } from "zod";
import { db, requireCondition, transaction, type Tx } from "../../database/client.js";
import { engineRulesSchema, type EngineRules } from "../../../../../packages/shared/src/engine.js";
import { battleResultsSchema } from "../../../../../packages/shared/src/battle.js";
import { owned, viewable } from "../tournaments/policy.js";
import { history, replay, remember } from "./commands.js";
import { createStage } from "./stages.js";
export type BattleRules = NonNullable<EngineRules["battle"]>;
type Round = {
  number: number;
  status: string;
  results: { teamId: string; placement: number | null; eliminations: number; noShow: boolean }[];
};
export function battleStandings(ids: string[], rounds: Round[], rules: BattleRules) {
  const completed = rounds
      .filter((r) => r.status === "COMPLETED")
      .sort((a, b) => a.number - b.number),
    last = completed.at(-1);
  const rows = ids.map((id, seed) => ({
    id,
    seed,
    points: 0,
    placementPoints: 0,
    eliminations: 0,
    wins: 0,
    played: 0,
    lastPlacement: last?.results.find((r) => r.teamId === id)?.placement ?? null,
  }));
  for (const round of completed)
    for (const result of round.results) {
      const row = rows.find((r) => r.id === result.teamId);
      if (!row || result.noShow) continue;
      const points = rules.placementPoints[(result.placement || 1) - 1] || 0;
      row.placementPoints += points;
      row.eliminations += result.eliminations;
      row.points += points + result.eliminations * rules.eliminationPoints;
      row.wins += result.placement === 1 ? 1 : 0;
      row.played++;
    }
  return rows.sort((a, b) => compareBattle(a, b, rules) || a.seed - b.seed);
}
export function compareBattle(
  a: {
    points: number;
    placementPoints: number;
    eliminations: number;
    wins: number;
    lastPlacement: number | null;
  },
  b: typeof a,
  rules: BattleRules,
) {
  let delta = b.points - a.points;
  for (const rule of rules.tieBreakers) {
    if (delta) break;
    delta =
      rule === "WINS"
        ? b.wins - a.wins
        : rule === "ELIMINATIONS"
          ? b.eliminations - a.eliminations
          : rule === "PLACEMENT_POINTS"
            ? b.placementPoints - a.placementPoints
            : (a.lastPlacement ?? 999) - (b.lastPlacement ?? 999);
  }
  return delta;
}
export async function generateBattle(tx: Tx, event: Tournament, ids: string[]) {
  const rules = engineRulesSchema.parse(event.engineRules).battle;
  requireCondition(rules, "Explicitly configure battle-royale scoring before starting.");
  await createStage(tx, event.id, "BATTLE_ROYALE", ids, "MAIN", "Battle royale standings");
  await tx.battleRound.createMany({
    data: Array.from({ length: rules.rounds }, (_, i) => ({
      tournamentId: event.id,
      number: i + 1,
      participantIds: ids,
    })),
  });
}
export async function finishBattle(tx: Tx, event: Tournament) {
  const rounds = await tx.battleRound.findMany({
    where: { tournamentId: event.id },
    include: { results: true },
    orderBy: { number: "asc" },
  });
  if (rounds.some((r) => r.status !== "COMPLETED")) return;
  const rules = engineRulesSchema.parse(event.engineRules).battle!;
  const ids = event.seedOrder.length
    ? event.seedOrder
    : (
        await tx.tournamentRegistration.findMany({
          where: { tournamentId: event.id, status: "APPROVED" },
        })
      ).map((r) => r.teamId);
  const ranking = battleStandings(ids, rounds, rules),
    top = ranking[0];
  requireCondition(top, "No battle participants.");
  const tied = ranking.filter((row) => compareBattle(row, top, rules) === 0);
  if (tied.length > 1) {
    await tx.battleRound.create({
      data: {
        tournamentId: event.id,
        number: rounds.at(-1)!.number + 1,
        isTiebreak: true,
        participantIds: tied.map((r) => r.id),
      },
    });
    return;
  }
  await tx.tournament.update({
    where: { id: event.id },
    data: { phase: "COMPLETED", championId: top.id },
  });
  await tx.tournamentStage.updateMany({
    where: { tournamentId: event.id },
    data: { completed: true },
  });
}
export async function confirmBattle(
  tournamentId: string,
  roundId: string,
  actor: string,
  input: z.infer<typeof battleResultsSchema>,
  key?: string,
) {
  return transaction(async (tx) => {
    const event = await owned(tx, tournamentId, actor),
      payload = { operation: "battle-result", tournamentId, roundId, input };
    const prior = await replay<{ ok: true }>(tx, actor, key, payload);
    if (prior) return prior;
    requireCondition(
      event.format === "BATTLE_ROYALE" && event.phase === "ONGOING",
      "This battle-royale event is not ongoing.",
    );
    const round = await tx.battleRound.findUnique({
      where: { id: roundId },
      include: { results: true },
    });
    requireCondition(round?.tournamentId === tournamentId, "Round not found.", 404);
    requireCondition(
      round.status !== "COMPLETED",
      "A completed round requires the dispute/correction workflow.",
    );
    requireCondition(
      input.expectedVersion === undefined || input.expectedVersion === round.version,
      "The round changed. Reload before confirming.",
      409,
    );
    battleResultsSchema.parse(input);
    requireCondition(
      input.results.length === round.participantIds.length &&
        input.results.every((r) => round.participantIds.includes(r.teamId)),
      "Submit every participant in this round exactly once.",
    );
    requireCondition(
      !(await tx.matchDispute.count({
        where: { tournamentId, status: "OPEN", battleRound: { number: { lt: round.number } } },
      })),
      "Resolve the disputed earlier round before confirming this one.",
      409,
    );
    const earlier = await tx.battleRound.count({
      where: { tournamentId, number: { lt: round.number }, status: { not: "COMPLETED" } },
    });
    requireCondition(!earlier, "Confirm earlier rounds first.");
    await tx.battleRoundResult.createMany({ data: input.results.map((r) => ({ ...r, roundId })) });
    await tx.battleRound.update({
      where: { id: roundId },
      data: { status: "COMPLETED", completedAt: new Date(), version: { increment: 1 } },
    });
    await history(
      tx,
      tournamentId,
      actor,
      "battle.result.confirmed",
      { before: round, results: input.results },
      roundId,
    );
    await finishBattle(tx, event);
    const result = { ok: true as const };
    await remember(tx, tournamentId, actor, key, payload, result);
    return result;
  });
}
export async function battleDetail(tournamentId: string, actor?: string, sharedIds: string[] = []) {
  const event = await viewable(db, tournamentId, actor, sharedIds);
  requireCondition(
    event.format === "BATTLE_ROYALE",
    "This event does not use battle-royale scoring.",
  );
  const rounds = await db.battleRound.findMany({
    where: { tournamentId },
    include: { results: true },
    orderBy: { number: "asc" },
  });
  const entries = await db.tournamentRegistration.findMany({
    where: { tournamentId, status: "APPROVED" },
    include: { team: { select: { id: true, name: true } } },
  });
  const ids = event.seedOrder.length ? event.seedOrder : entries.map((e) => e.teamId);
  const rules = engineRulesSchema.parse(event.engineRules).battle!;
  return {
    rules,
    rounds,
    participants: entries.map((e) => e.team),
    standings: battleStandings(ids, rounds, rules).map((row) => ({
      ...row,
      name: entries.find((e) => e.teamId === row.id)?.team.name || "Former participant",
    })),
  };
}
export async function scheduleBattle(
  tournamentId: string,
  roundId: string,
  actor: string,
  scheduledAt: string,
  venue: string,
  slotMinutes = 60,
) {
  return transaction(async (tx) => {
    const event = await owned(tx, tournamentId, actor);
    return scheduleBattleAuthorized(tx, event, roundId, actor, scheduledAt, venue, slotMinutes);
  });
}
// Shared scheduling rules; callers authorize inside this transaction.
export async function scheduleBattleAuthorized(
  tx: Tx,
  event: Tournament,
  roundId: string,
  actor: string | null,
  scheduledAt: string,
  venue: string,
  slotMinutes = 60,
) {
  const tournamentId = event.id;
  requireCondition(
    event.phase === "ONGOING" && event.format === "BATTLE_ROYALE",
    "The event is not ongoing.",
  );
  const round = await tx.battleRound.findUnique({ where: { id: roundId } });
  requireCondition(round?.tournamentId === tournamentId, "Round not found.", 404);
  requireCondition(round.status !== "COMPLETED", "Completed rounds cannot be rescheduled.");
  requireCondition(
    Number.isInteger(slotMinutes) && slotMinutes >= 1 && slotMinutes <= 480,
    "Choose a slot duration from 1 to 480 minutes.",
  );
  const date = new Date(scheduledAt);
  requireCondition(
    date >= event.startsAt &&
      (!event.endsAt || date.getTime() + slotMinutes * 60000 <= event.endsAt.getTime()),
    "Schedule within the event dates.",
  );
  const others = await tx.battleRound.findMany({
    where: { tournamentId, scheduledAt: { not: null }, id: { not: roundId } },
  });
  requireCondition(
    others.every((other) =>
      other.number < round.number
        ? other.scheduledAt!.getTime() + other.slotMinutes * 60000 <= date.getTime()
        : other.scheduledAt!.getTime() >= date.getTime() + slotMinutes * 60000,
    ),
    "Round schedules must follow round order.",
  );
  const result = await tx.battleRound.update({
    where: { id: roundId },
    data: {
      scheduledAt: date,
      venue,
      slotMinutes,
      status: "SCHEDULED",
      version: { increment: 1 },
    },
  });
  await history(
    tx,
    tournamentId,
    actor,
    "battle.scheduled",
    { before: round, after: result },
    roundId,
  );
  return result;
}

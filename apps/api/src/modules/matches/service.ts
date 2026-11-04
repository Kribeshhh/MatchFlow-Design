import { impactedMatches } from "./impact.js";
import type { Match, Tournament } from "@prisma/client";
import { engineRulesSchema } from "../../../../../packages/shared/src/engine.js";
import { history, replay, remember } from "../brackets/commands.js";
import { advanceLeague } from "../brackets/league.js";
import { advanceGroups } from "../brackets/groups.js";
import type { z } from "zod";
import {
  matchStatisticsSchema,
  type ResultInput,
} from "../../../../../packages/shared/src/matches.js";
import { requireCondition, transaction, type Tx } from "../../database/client.js";
import { audit } from "../administration/audit.js";
import { advanceFormat } from "../brackets/format-progression.js";
import { advance } from "../brackets/progression.js";
import { owned } from "../tournaments/policy.js";
import * as repository from "./repository.js";
export async function recordConfirmed(
  tx: Tx,
  t: Tournament,
  match: Match,
  owner: string,
  input: ResultInput,
) {
  requireCondition(t.phase === "ONGOING", "This tournament is not in progress.");
  requireCondition(match.tournamentId === t.id, "Match not found.", 404);
  requireCondition(match.status !== "COMPLETED", "A completed result cannot be overwritten.");
  requireCondition(
    input.expectedVersion === undefined || input.expectedVersion === match.version,
    "This match changed. Reload before confirming.",
    409,
  );
  requireCondition(
    match.teamAId && match.teamBId && !match.isBye,
    "Both opponents must be known before recording a result.",
  );
  const stage = match.stageId
    ? await tx.tournamentStage.findUnique({ where: { id: match.stageId } })
    : null;
  requireCondition(
    !stage || (stage.tournamentId === t.id && !stage.completed),
    "Results cannot be recorded in a completed or foreign stage.",
  );
  const disputes = await tx.matchDispute.findMany({
    where: { tournamentId: t.id, status: "OPEN", matchId: { not: null } },
  });
  if (disputes.length) {
    const matches = await tx.match.findMany({ where: { tournamentId: t.id } }),
      stages = await tx.tournamentStage.findMany({ where: { tournamentId: t.id } });
    requireCondition(
      !disputes.some((d) => {
        const source = matches.find((m) => m.id === d.matchId);
        return source && impactedMatches(t, source, matches, stages).some((m) => m.id === match.id);
      }),
      "Resolve the disputed dependency before confirming this result.",
      409,
    );
  }
  const rules = engineRulesSchema.parse(t.engineRules);
  const format = match.matchFormat || t.matchFormat;
  let scoreA: number | null = input.scoreA ?? null,
    scoreB: number | null = input.scoreB ?? null,
    winnerId: string | null;
  let outcome = input.outcome;
  if (outcome === "FORFEIT" || outcome === "NO_SHOW") {
    requireCondition(
      [match.teamAId, match.teamBId].includes(input.winnerId || "") && input.reason.length >= 10,
      "Choose a current opponent as winner and provide a reason.",
    );
    if (outcome === "NO_SHOW")
      requireCondition(
        new Date().getTime() >=
          (match.scheduledAt || t.startsAt).getTime() + (rules.noShowGraceMinutes ?? 15) * 60000,
        "The no-show grace period has not ended.",
      );
    winnerId = input.winnerId!;
    scoreA = null;
    scoreB = null;
  } else {
    requireCondition(
      scoreA !== null &&
        scoreB !== null &&
        Number.isInteger(scoreA) &&
        Number.isInteger(scoreB) &&
        scoreA >= 0 &&
        scoreB >= 0 &&
        scoreA <= 999 &&
        scoreB <= 999,
      "Enter non-negative integer scores (maximum 999).",
    );
    const draw = scoreA === scoreB;
    requireCondition(
      !draw ||
        (t.format === "LEAGUE" &&
          rules.league?.allowDraws &&
          stage?.kind === "MAIN" &&
          format === "SCORE"),
      "This match requires unequal scores and a decisive winner.",
    );
    requireCondition(outcome !== "DRAW" || draw, "A draw requires equal scores.");
    outcome = draw ? "DRAW" : "PLAYED";
    if (format !== "SCORE") {
      const target = ({ BO1: 1, BO3: 2, BO5: 3 } as Record<string, number>)[format];
      requireCondition(
        Boolean(target) && Math.max(scoreA, scoreB) === target && Math.min(scoreA, scoreB) < target,
        "Enter a completed best-of series score.",
      );
    }
    requireCondition(
      !["ROUND_ROBIN", "SWISS", "GROUPS", "LEAGUE"].includes(t.format) || Boolean(input.statistics),
      "Enter KDA totals and duration for standings tie-breaks.",
    );
    winnerId = draw ? null : scoreA > scoreB ? match.teamAId : match.teamBId;
    if (input.statistics)
      await tx.match.update({
        where: { id: match.id },
        data: matchStatisticsSchema.parse(input.statistics),
      });
  }
  const result = await repository.recordResult(tx, match.id, scoreA, scoreB, winnerId, outcome);
  await tx.matchReport.updateMany({
    where: { matchId: match.id, status: "PENDING" },
    data: { status: "SUPERSEDED" },
  });
  await audit(tx, owner, "match.result.recorded", "Match", match.id);
  if (t.format === "SINGLE_ELIMINATION") await advance(tx, result);
  else if (t.format === "GROUPS") await advanceGroups(tx, t, result);
  else if (t.format === "LEAGUE") await advanceLeague(tx, t, result);
  else await advanceFormat(tx, result, t.format);
  if ((await tx.tournament.findUniqueOrThrow({ where: { id: t.id } })).phase === "COMPLETED")
    await tx.tournamentStage.updateMany({
      where: { tournamentId: t.id },
      data: { completed: true },
    });
  await history(
    tx,
    t.id,
    owner,
    "match.result.confirmed",
    { before: match, after: result },
    match.id,
    input.reason,
  );
  return result;
}
export async function saveResult(
  tournamentId: string,
  matchId: string,
  owner: string,
  scoreA: number,
  scoreB: number,
  statistics?: z.infer<typeof matchStatisticsSchema>,
  options: Partial<ResultInput> & { requestKey?: string } = {},
) {
  return confirmResult(
    tournamentId,
    matchId,
    owner,
    { scoreA, scoreB, statistics, outcome: "PLAYED", reason: "", ...options },
    options.requestKey,
  );
}
export async function confirmResult(
  tournamentId: string,
  matchId: string,
  owner: string,
  input: ResultInput,
  requestKey?: string,
) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, owner);
    const payload = { operation: "result", tournamentId, matchId, input };
    const previous = await replay<Match>(tx, owner, requestKey, payload);
    if (previous) return previous;
    const match = await repository.findMatch(tx, matchId);
    requireCondition(match?.tournamentId === tournamentId, "Match not found.", 404);
    const result = await recordConfirmed(tx, t, match, owner, input);
    await remember(tx, tournamentId, owner, requestKey, payload, result);
    return result;
  });
}
export async function scheduleMatch(
  tournamentId: string,
  matchId: string,
  owner: string,
  scheduledAt: string,
  venue: string,
  slotMinutes = 60,
) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, owner);
    return scheduleAuthorized(tx, t, matchId, owner, scheduledAt, venue, slotMinutes);
  });
}
// Call only after authorizing the principal within the same transaction.
export async function scheduleAuthorized(
  tx: Tx,
  t: Tournament,
  matchId: string,
  owner: string | null,
  scheduledAt: string,
  venue: string,
  slotMinutes = 60,
) {
  const tournamentId = t.id;
  requireCondition(t.phase === "ONGOING", "Generate the bracket before scheduling.");
  const match = await repository.findMatch(tx, matchId);
  requireCondition(match?.tournamentId === tournamentId, "Match not found.", 404);
  requireCondition(match.status !== "COMPLETED", "Completed matches cannot be rescheduled.");
  const date = new Date(scheduledAt);
  requireCondition(date >= t.startsAt, "A match cannot start before the tournament date.");
  requireCondition(!t.endsAt || date <= t.endsAt, "Schedule within the tournament end date.");
  requireCondition(
    Number.isInteger(slotMinutes) && slotMinutes >= 1 && slotMinutes <= 480,
    "Choose a slot duration from 1 to 480 minutes.",
  );
  const end = new Date(date.getTime() + slotMinutes * 60000);
  requireCondition(
    !t.endsAt || end <= t.endsAt,
    "The full slot must fit within the tournament dates.",
  );
  const participants = [match.teamAId, match.teamBId].filter((id): id is string => Boolean(id));
  const otherSlots = await tx.match.findMany({
    where: {
      tournamentId,
      id: { not: matchId },
      scheduledAt: { not: null },
      OR: [{ teamAId: { in: participants } }, { teamBId: { in: participants } }],
    },
  });
  requireCondition(
    otherSlots.every(
      (other) =>
        other.scheduledAt!.getTime() + other.slotMinutes * 60000 <= date.getTime() ||
        other.scheduledAt! >= end,
    ),
    "A participant already has an overlapping match slot.",
  );
  const sources =
    t.format === "SINGLE_ELIMINATION"
      ? await repository.sourceMatches(tx, tournamentId, match.round, match.position)
      : await tx.match.findMany({
          where: {
            tournamentId,
            stageId: match.stageId,
            ...(t.format === "DOUBLE_ELIMINATION"
              ? {
                  id: {
                    in: [match.sourceAId, match.sourceBId].filter((id): id is string =>
                      Boolean(id),
                    ),
                  },
                }
              : { round: { lt: match.round } }),
          },
        });
  requireCondition(
    sources.every(
      (s) => !s.scheduledAt || s.scheduledAt.getTime() + s.slotMinutes * 60000 <= date.getTime(),
    ),
    "Schedule this round after its preceding matches.",
  );
  const next =
    t.format === "SINGLE_ELIMINATION"
      ? await repository.nextMatch(tx, tournamentId, match.round, match.position)
      : await tx.match.findFirst({
          where: {
            tournamentId,
            stageId: match.stageId,
            scheduledAt: { not: null },
            ...(t.format === "DOUBLE_ELIMINATION"
              ? { OR: [{ sourceAId: match.id }, { sourceBId: match.id }] }
              : { round: { gt: match.round } }),
          },
          orderBy: { scheduledAt: "asc" },
        });
  requireCondition(
    !next?.scheduledAt || next.scheduledAt >= end,
    "This match must start before the next round.",
  );
  const stage = match.stageId
    ? await tx.tournamentStage.findUnique({ where: { id: match.stageId } })
    : null;
  if (stage && ["PLAYOFF", "QUALIFIER"].includes(stage.kind)) {
    const predecessors = await tx.match.findMany({
      where: {
        tournamentId,
        stage: {
          ...(stage.kind === "PLAYOFF"
            ? { kind: { in: ["GROUP", "QUALIFIER", "MAIN"] } }
            : { kind: "GROUP", groupNumber: stage.groupNumber }),
        },
        scheduledAt: { not: null },
      },
    });
    requireCondition(
      predecessors.every((m) => m.scheduledAt!.getTime() + m.slotMinutes * 60000 <= date.getTime()),
      "Schedule this stage after its qualifying stages.",
    );
  }
  await audit(tx, owner, "match.scheduled", "Match", matchId);
  const result = await repository.setSchedule(tx, matchId, date, venue, slotMinutes);
  await history(
    tx,
    tournamentId,
    owner,
    match.scheduledAt ? "match.rescheduled" : "match.scheduled",
    { before: match, after: result },
    matchId,
  );
  return result;
}

import type { ResultInput } from "../../../../../packages/shared/src/matches.js";
import { requireCondition, transaction } from "../../database/client.js";
import { owned, viewable } from "../tournaments/policy.js";
import { requireTeamActor } from "../teams/policy.js";
import { history, json, replay, remember } from "../brackets/commands.js";
import { participant } from "./disputes.js";
import { recordConfirmed } from "./service.js";
export async function reportResult(
  tournamentId: string,
  matchId: string,
  actor: string,
  input: ResultInput,
  sharedIds: string[] = [],
  key?: string,
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actor);
    const event = await viewable(tx, tournamentId, actor, sharedIds);
    const payload = { operation: "report", tournamentId, matchId, input };
    const previous = await replay<{ id: string }>(tx, actor, key, payload);
    if (previous) return previous;
    requireCondition(event.phase === "ONGOING", "This event is not ongoing.");
    const match = await tx.match.findUnique({ where: { id: matchId } });
    requireCondition(
      match?.tournamentId === tournamentId &&
        match.teamAId &&
        match.teamBId &&
        !match.isBye &&
        match.status !== "COMPLETED",
      "A pending match with both opponents is required.",
    );
    requireCondition(
      input.expectedVersion === undefined || input.expectedVersion === match.version,
      "The match changed. Reload before reporting.",
      409,
    );
    await participant(tx, tournamentId, [match.teamAId, match.teamBId], actor);
    requireCondition(
      !(await tx.matchReport.count({ where: { matchId, reporterId: actor, status: "PENDING" } })),
      "You already have a pending report for this match.",
      409,
    );
    const report = await tx.matchReport.create({
      data: {
        tournamentId,
        matchId,
        reporterId: actor,
        payload: json({ ...input, expectedVersion: match.version }),
      },
    });
    await history(
      tx,
      tournamentId,
      actor,
      "match.result.reported",
      { reportId: report.id },
      matchId,
    );
    const result = { id: report.id };
    await remember(tx, tournamentId, actor, key, payload, result);
    return result;
  });
}
export async function reviewReport(
  tournamentId: string,
  reportId: string,
  actor: string,
  approve: boolean,
  reason: string,
) {
  return transaction(async (tx) => {
    const event = await owned(tx, tournamentId, actor);
    const report = await tx.matchReport.findUnique({ where: { id: reportId } });
    requireCondition(
      report?.tournamentId === tournamentId && report.status === "PENDING",
      "Pending report not found.",
      404,
    );
    if (approve) {
      const match = await tx.match.findUniqueOrThrow({ where: { id: report.matchId } });
      const { resultSchema } = await import("../../../../../packages/shared/src/matches.js");
      await recordConfirmed(tx, event, match, actor, resultSchema.parse(report.payload));
    }
    await tx.matchReport.update({
      where: { id: reportId },
      data: { status: approve ? "CONFIRMED" : "REJECTED" },
    });
    await history(
      tx,
      tournamentId,
      actor,
      approve ? "match.report.confirmed" : "match.report.rejected",
      { reportId },
      report.matchId,
      reason,
    );
    return { ok: true };
  });
}

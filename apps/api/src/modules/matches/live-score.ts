import { requireCondition, transaction } from "../../database/client.js";
import { owned } from "../tournaments/policy.js";
import { history } from "../brackets/commands.js";
export async function publishLiveScore(
  tournamentId: string,
  matchId: string,
  actor: string,
  input: { scoreA: number; scoreB: number; expectedVersion: number },
) {
  return transaction(async (tx) => {
    const event = await owned(tx, tournamentId, actor);
    requireCondition(event.phase === "ONGOING", "This tournament is not ongoing.");
    const match = await tx.match.findUnique({ where: { id: matchId } });
    requireCondition(match?.tournamentId === tournamentId, "Match not found.", 404);
    requireCondition(
      match.status !== "COMPLETED" && !match.isBye && match.teamAId && match.teamBId,
      "A pending match with both opponents is required.",
    );
    requireCondition(
      match.version === input.expectedVersion,
      "This match changed. Review its current score before publishing.",
      409,
    );
    const result = await tx.match.update({
      where: { id: matchId },
      data: { liveScoreA: input.scoreA, liveScoreB: input.scoreB, version: { increment: 1 } },
    });
    await history(
      tx,
      tournamentId,
      actor,
      "match.live-score.updated",
      { before: match, after: result },
      matchId,
    );
    return { ok: true };
  });
}

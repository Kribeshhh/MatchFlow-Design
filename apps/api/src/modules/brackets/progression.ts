import { requireCondition, type Tx } from "../../database/client.js";
import { nextMatch, setOpponent } from "../matches/repository.js";
import { completeTournament } from "../tournaments/repository.js";
export async function advance(
  tx: Tx,
  match: { tournamentId: string; round: number; position: number; winnerId: string | null },
) {
  requireCondition(match.winnerId, "Match has no winner.");
  const persisted = await tx.match.findUnique({
    where: {
      tournamentId_round_position: {
        tournamentId: match.tournamentId,
        round: match.round,
        position: match.position,
      },
    },
  });
  requireCondition(
    persisted?.status === "COMPLETED" &&
      persisted.winnerId === match.winnerId &&
      [persisted.teamAId, persisted.teamBId].includes(match.winnerId),
    "Only a confirmed opponent may advance.",
  );
  const next = await nextMatch(tx, match.tournamentId, match.round, match.position);
  if (next) {
    requireCondition(
      next.stageId === persisted.stageId && next.status !== "COMPLETED",
      "Progression cannot overwrite a completed or different-stage match.",
    );
    const existing = match.position % 2 === 0 ? next.teamAId : next.teamBId;
    requireCondition(
      !existing || existing === match.winnerId,
      "This slot already has a different participant.",
    );
    await setOpponent(
      tx,
      next.id,
      match.position % 2 === 0 ? "teamAId" : "teamBId",
      match.winnerId,
    );
  } else await completeTournament(tx, match.tournamentId, match.winnerId);
}

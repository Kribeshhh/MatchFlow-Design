import type { Tx } from "../../database/client.js";
export const findMatch = (tx: Tx, id: string) => tx.match.findUnique({ where: { id } });
export const sourceMatches = (tx: Tx, tournamentId: string, round: number, position: number) =>
  tx.match.findMany({
    where: { tournamentId, round: round - 1, position: { in: [position * 2, position * 2 + 1] } },
  });
export const nextMatch = (tx: Tx, tournamentId: string, round: number, position: number) =>
  tx.match.findUnique({
    where: {
      tournamentId_round_position: {
        tournamentId,
        round: round + 1,
        position: Math.floor(position / 2),
      },
    },
  });
export async function recordResult(
  tx: Tx,
  matchId: string,
  scoreA: number | null,
  scoreB: number | null,
  winnerId: string | null,
  outcome = "PLAYED",
) {
  const result = await tx.match.update({
    where: { id: matchId },
    data: {
      liveScoreA: null,
      liveScoreB: null,
      scoreA,
      scoreB,
      winnerId,
      outcome,
      version: { increment: 1 },
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
  await tx.matchResult.create({
    data: { matchId, scoreA, scoreB, winnerId, outcome, recordedAt: result.completedAt! },
  });
  return result;
}
export const setSchedule = (
  tx: Tx,
  id: string,
  scheduledAt: Date,
  venue: string,
  slotMinutes = 60,
) =>
  tx.match.update({
    where: { id },
    data: { scheduledAt, venue, slotMinutes, status: "SCHEDULED", version: { increment: 1 } },
  });
export const setOpponent = (tx: Tx, id: string, side: "teamAId" | "teamBId", winnerId: string) =>
  tx.match.update({ where: { id }, data: { [side]: winnerId } });

import { requireCondition, transaction } from "../../database/client.js";
import { owned } from "../tournaments/policy.js";
import { history } from "../brackets/commands.js";
export async function changeMatchFormat(
  tournamentId: string,
  matchId: string,
  actor: string,
  matchFormat: string,
) {
  return transaction(async (tx) => {
    const event = await owned(tx, tournamentId, actor);
    requireCondition(event.phase === "ONGOING", "This event is not ongoing.");
    const match = await tx.match.findUnique({ where: { id: matchId } });
    requireCondition(
      match?.tournamentId === tournamentId && match.status !== "COMPLETED" && !match.isBye,
      "Choose a pending played match.",
    );
    requireCondition(
      ["SCORE", "BO1", "BO3", "BO5"].includes(matchFormat),
      "Unsupported match format.",
    );
    requireCondition(
      !["pubg", "ff"].includes(event.game) || matchFormat === "SCORE",
      "Battle-royale games do not use head-to-head best-of series here.",
    );
    const result = await tx.match.update({
      where: { id: matchId },
      data: { matchFormat, version: { increment: 1 } },
    });
    await tx.matchReport.updateMany({
      where: { matchId, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    });
    await history(
      tx,
      tournamentId,
      actor,
      "match.format.changed",
      { before: match, after: result },
      matchId,
    );
    return result;
  });
}
export async function swapAssignments(
  tournamentId: string,
  actor: string,
  first: { matchId: string; side: "A" | "B" },
  second: { matchId: string; side: "A" | "B" },
) {
  return transaction(async (tx) => {
    const event = await owned(tx, tournamentId, actor);
    requireCondition(
      event.phase === "ONGOING" &&
        ["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"].includes(event.format),
      "Use manual seeds before generating this format.",
    );
    const a = await tx.match.findUnique({ where: { id: first.matchId } }),
      b = await tx.match.findUnique({ where: { id: second.matchId } });
    requireCondition(
      a?.tournamentId === tournamentId &&
        b?.tournamentId === tournamentId &&
        a.stageId === b.stageId &&
        a.round === 1 &&
        b.round === 1,
      "Swap two first-round slots in the same stage.",
    );
    requireCondition(!(a.id === b.id && first.side === second.side), "Choose two different slots.");
    requireCondition(
      !(await tx.match.count({
        where: {
          tournamentId,
          OR: [
            { status: "COMPLETED" },
            { sourceAId: { not: null }, round: 1 },
            { sourceBId: { not: null }, round: 1 },
          ],
        },
      })),
      "Assignments lock after any progression. Reset an unplayed bracket and use manual seeds for fields with BYEs.",
    );
    const aField = first.side === "A" ? "teamAId" : "teamBId",
      bField = second.side === "A" ? "teamAId" : "teamBId";
    requireCondition(a[aField] && b[bField], "Choose occupied slots.");
    await tx.match.update({
      where: { id: a.id },
      data: { [aField]: b[bField], liveScoreA: null, liveScoreB: null, version: { increment: 1 } },
    });
    await tx.match.update({
      where: { id: b.id },
      data: { [bField]: a[aField], liveScoreA: null, liveScoreB: null, version: { increment: 1 } },
    });
    await tx.matchReport.updateMany({
      where: { matchId: { in: [a.id, b.id] }, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    });
    await history(tx, tournamentId, actor, "match.assignments.swapped", {
      before: [a, b],
      first,
      second,
    });
    return { ok: true };
  });
}
export async function resetBracket(tournamentId: string, actor: string, reason: string) {
  return transaction(async (tx) => {
    const event = await owned(tx, tournamentId, actor);
    requireCondition(event.phase === "ONGOING", "Only an ongoing unplayed bracket can be reset.");
    requireCondition(
      !(await tx.matchResult.count({ where: { match: { tournamentId } } })) &&
        !(await tx.battleRoundResult.count({ where: { round: { tournamentId } } })),
      "A bracket with recorded results cannot be regenerated. Use disputes and reviewed corrections.",
    );
    requireCondition(
      !(await tx.matchReport.count({ where: { tournamentId } })) &&
        !(await tx.matchDispute.count({ where: { tournamentId } })),
      "Resolve reports through the match workflow; reported brackets cannot be regenerated.",
    );
    const matches = await tx.match.findMany({ where: { tournamentId } }),
      rounds = await tx.battleRound.findMany({ where: { tournamentId } });
    await history(
      tx,
      tournamentId,
      actor,
      "bracket.reset",
      { matches, rounds, seedOrder: event.seedOrder },
      undefined,
      reason,
    );
    await tx.match.updateMany({
      where: { tournamentId },
      data: { sourceAId: null, sourceBId: null },
    });
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.battleRound.deleteMany({ where: { tournamentId } });
    await tx.tournamentStage.deleteMany({ where: { tournamentId } });
    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        phase: event.checkInRequired ? "CHECK_IN" : "PUBLISHED",
        seedOrder: [],
        championId: null,
      },
    });
    return { ok: true };
  });
}

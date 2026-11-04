import type { Prisma } from "@prisma/client";
import { matchInclude, type Tx } from "../../database/client.js";
export const matchCount = (tx: Tx, tournamentId: string) =>
  tx.match.count({ where: { tournamentId } });
export const entries = (tx: Tx, tournamentId: string) =>
  tx.tournamentRegistration.findMany({
    where: { tournamentId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
export const createStage = (tx: Tx, tournamentId: string) =>
  tx.tournamentStage.create({ data: { tournamentId, position: 0, format: "SINGLE_ELIMINATION" } });
export async function persistBracket(
  tx: Tx,
  tournamentId: string,
  rows: Prisma.MatchCreateManyInput[],
) {
  await tx.match.createMany({ data: rows });
  await tx.tournament.update({ where: { id: tournamentId }, data: { phase: "ONGOING" } });
  return tx.match.findMany({ where: { tournamentId, isBye: true } });
}
export const bracketMatches = (tx: Tx, tournamentId: string) =>
  tx.match.findMany({
    where: { tournamentId },
    include: matchInclude,
    orderBy: [{ round: "asc" }, { position: "asc" }],
  });

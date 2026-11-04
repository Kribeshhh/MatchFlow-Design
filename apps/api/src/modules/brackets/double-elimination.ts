import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { seedOrder } from "./domain.js";
/** Winner/loser dependencies form a DAG; a grand-final reset is created only if needed. */
export function doubleElimination(tournamentId: string, stageId: string, teams: string[]) {
  const size = 2 ** Math.ceil(Math.log2(teams.length));
  const k = Math.log2(size),
    order = seedOrder(size);
  const rows: Prisma.MatchCreateManyInput[] = [];
  const add = (
    round: number,
    position: number,
    bracket: string,
    data: Partial<Prisma.MatchCreateManyInput>,
  ) => {
    const row = {
      id: `c${randomBytes(12).toString("hex")}`,
      tournamentId,
      stageId,
      round,
      position,
      bracket,
      ...data,
    };
    rows.push(row);
    return row.id;
  };
  const winners: string[][] = [];
  for (let r = 0; r < k; r++) {
    winners[r] = [];
    for (let p = 0; p < size / 2 ** (r + 1); p++) {
      winners[r].push(
        add(
          r + 1,
          p,
          "WINNERS",
          r === 0
            ? {
                teamAId: teams[order[p * 2] - 1] ?? null,
                teamBId: teams[order[p * 2 + 1] - 1] ?? null,
              }
            : { sourceAId: winners[r - 1][p * 2], sourceBId: winners[r - 1][p * 2 + 1] },
        ),
      );
    }
  }
  let losers: string[] = [];
  if (k > 1) {
    for (let p = 0; p < size / 4; p++)
      losers.push(
        add(k + 1, p, "LOSERS", {
          sourceAId: winners[0][p * 2],
          sourceBId: winners[0][p * 2 + 1],
          sourceAOutcome: "LOSER",
          sourceBOutcome: "LOSER",
        }),
      );
    for (let r = 1; r < k; r++) {
      losers = losers.map((id, p) =>
        add(k + 2 * r, p, "LOSERS", {
          sourceAId: id,
          sourceBId: winners[r][losers.length > 1 ? p ^ 1 : p],
          sourceBOutcome: "LOSER",
        }),
      );
      if (r < k - 1) {
        const previous = losers;
        losers = Array.from({ length: previous.length / 2 }, (_, p) =>
          add(k + 2 * r + 1, p, "LOSERS", {
            sourceAId: previous[p * 2],
            sourceBId: previous[p * 2 + 1],
          }),
        );
      }
    }
  }
  add(k === 1 ? 2 : 3 * k - 1, 0, "GRAND_FINAL", {
    sourceAId: winners[k - 1][0],
    sourceBId: losers[0] ?? winners[0][0],
    sourceBOutcome: k === 1 ? "LOSER" : "WINNER",
  });
  return rows;
}

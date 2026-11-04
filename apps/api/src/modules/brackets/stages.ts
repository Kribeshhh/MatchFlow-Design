import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Tx } from "../../database/client.js";
import { seedOrder } from "./domain.js";
export async function createStage(
  tx: Tx,
  tournamentId: string,
  format: string,
  ids: string[],
  kind = "MAIN",
  name = "Main stage",
  groupNumber?: number,
) {
  const last = await tx.tournamentStage.aggregate({
    where: { tournamentId },
    _max: { position: true },
  });
  return tx.tournamentStage.create({
    data: {
      tournamentId,
      format,
      kind,
      name,
      groupNumber,
      position: (last._max.position ?? -1) + 1,
      participants: { create: ids.map((teamId, i) => ({ teamId, seed: i + 1 })) },
    },
  });
}
export async function nextRound(tx: Tx, tournamentId: string) {
  return (
    ((await tx.match.aggregate({ where: { tournamentId }, _max: { round: true } }))._max.round ??
      0) + 1
  );
}
export async function knockout(
  tx: Tx,
  tournamentId: string,
  stageId: string,
  ids: string[],
  bracket: string,
  places = 1,
) {
  const first = await nextRound(tx, tournamentId),
    size = 2 ** Math.ceil(Math.log2(ids.length)),
    order = seedOrder(size);
  const rows: Prisma.MatchCreateManyInput[] = [],
    previous: string[][] = [];
  for (let r = 0, count = size / 2; count >= places; r++, count /= 2) {
    previous[r] = [];
    for (let position = 0; position < count; position++) {
      const id = `c${randomBytes(12).toString("hex")}`;
      previous[r].push(id);
      rows.push({
        id,
        tournamentId,
        stageId,
        round: first + r,
        position,
        bracket,
        ...(r === 0
          ? {
              teamAId: ids[order[position * 2] - 1] ?? null,
              teamBId: ids[order[position * 2 + 1] - 1] ?? null,
            }
          : {
              sourceAId: previous[r - 1][position * 2],
              sourceBId: previous[r - 1][position * 2 + 1],
            }),
      });
    }
  }
  await tx.match.createMany({ data: rows });
}

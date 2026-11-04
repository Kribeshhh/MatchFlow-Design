import { db, publicUser } from "../../database/client.js";
export const searchPlayers = (q: string) =>
  db.user.findMany({
    where: {
      status: "ACTIVE",
      roles: { has: "PLAYER" },
      username: { contains: q.toLowerCase(), mode: "insensitive" },
    },
    select: publicUser,
    take: 15,
    orderBy: { username: "asc" },
  });

import type { Tx } from "../../database/client.js";
export const findPlayer = (tx: Tx, id: string) =>
  tx.user.findUnique({ where: { id }, select: { id: true, roles: true, status: true } });

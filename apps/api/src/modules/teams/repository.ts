import type { Tx } from "../../database/client.js";
import { db, teamInclude, publicTeam } from "../../database/client.js";
export const findTeam = (id: string, tx: Tx = db) =>
  tx.team.findUnique({ where: { id }, include: teamInclude });
export const memberTeams = (userId: string) =>
  db.team.findMany({
    where: { competitionType: "TEAM", members: { some: { userId } } },
    include: teamInclude,
    orderBy: { createdAt: "desc" },
  });
export const activeEntries = (teamId: string, tx: Tx = db) =>
  tx.tournamentRegistration.count({
    where: {
      teamId,
      status: { in: ["PENDING", "APPROVED"] },
      tournament: { phase: { notIn: ["COMPLETED", "CANCELLED"] } },
    },
  });
export const candidates = (tournamentId: string, game: string, q: string) =>
  db.team.findMany({
    where: {
      game,
      competitionType: "TEAM",
      archivedAt: null,
      name: { contains: q, mode: "insensitive" },
      registrations: { none: { tournamentId } },
    },
    select: { ...publicTeam, ...teamInclude },
    take: 30,
  });

import type { z } from "zod";
import type { teamSchema } from "../../../../../packages/shared/src/validation.js";
export const insertTeam = (userId: string, input: z.infer<typeof teamSchema>, tx: Tx = db) =>
  tx.team.create({
    data: { ...input, captainId: userId, members: { create: { userId, acceptedAt: new Date() } } },
    include: teamInclude,
  });
export const insertMember = (tx: Tx, teamId: string, userId: string) =>
  tx.teamMember.create({ data: { teamId, userId } });
export const deleteMember = (tx: Tx, teamId: string, userId: string) =>
  tx.teamMember.deleteMany({ where: { teamId, userId } });

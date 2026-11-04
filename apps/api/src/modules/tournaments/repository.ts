import {
  db,
  matchInclude,
  publicTeam,
  publicUser,
  teamInclude,
  type Tx,
} from "../../database/client.js";
export const tournamentInclude = {
  organization: { select: { id: true, name: true, publicProfile: true } },
  stages: {
    orderBy: { position: "asc" as const },
    include: { participants: { orderBy: { seed: "asc" as const } } },
  },
  announcements: { orderBy: { createdAt: "desc" as const }, take: 50 },
  organizer: { select: publicUser },
  champion: { select: publicTeam },
  registrations: {
    include: { team: { select: { ...publicTeam, captain: teamInclude.captain } } },
    orderBy: { createdAt: "asc" as const },
  },
  matches: {
    include: matchInclude,
    orderBy: [{ round: "asc" as const }, { position: "asc" as const }],
  },
};

export const findTournament = (tx: Tx, id: string) => tx.tournament.findUnique({ where: { id } });
export const completeTournament = (tx: Tx, id: string, championId: string) =>
  tx.tournament.update({ where: { id }, data: { phase: "COMPLETED", championId } });
export const findDetail = (id: string) =>
  db.tournament.findUnique({ where: { id }, include: tournamentInclude });

import type { z } from "zod";
import type { discoverySchema } from "../../../../../packages/shared/src/tournaments.js";
export async function listTournaments(query: z.infer<typeof discoverySchema>) {
  const now = new Date();
  const statuses: Record<string, import("@prisma/client").Prisma.TournamentWhereInput> = {
    UPCOMING: { phase: { in: ["REGISTRATION", "PUBLISHED"] }, opensAt: { gt: now } },
    REGISTRATION_OPEN: {
      phase: { in: ["REGISTRATION", "PUBLISHED"] },
      opensAt: { lte: now },
      closesAt: { gt: now },
    },
    REGISTRATION_CLOSED: { phase: { in: ["REGISTRATION", "PUBLISHED"] }, closesAt: { lte: now } },
  };
  const orderBy: import("@prisma/client").Prisma.TournamentOrderByWithRelationInput[] =
    query.sort === "POPULARITY"
      ? [{ registrations: { _count: "desc" } }, { id: "asc" }]
      : query.sort === "UPCOMING"
        ? [{ startsAt: "asc" }, { id: "asc" }]
        : query.sort === "DEADLINE"
          ? [{ closesAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "asc" }];
  return db.tournament.findMany({
    where: {
      visibility: "PUBLIC",
      phase: { not: "DRAFT" },
      name: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
      game: query.game,
      region: query.region ? { equals: query.region, mode: "insensitive" } : undefined,
      locationType: query.locationType,
      format: query.format,
      teamSize: query.teamSize,
      competitionType: query.competitionType,
      entryCategory: query.category,
      startsAt: {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      },
      ...(query.status
        ? statuses[query.status] || {
            phase: query.status as "CHECK_IN" | "ONGOING" | "COMPLETED" | "CANCELLED" | "POSTPONED",
          }
        : {}),
    },
    include: {
      organizer: { select: publicUser },
      champion: { select: publicTeam },
      _count: { select: { registrations: { where: { status: { in: ["PENDING", "APPROVED"] } } } } },
    },
    orderBy,
    take: 50,
    skip: (query.page - 1) * 50,
  });
}

import type { Prisma } from "@prisma/client";
import { requireCondition, type Tx } from "../../database/client.js";
import { findTournament } from "./repository.js";
export const manageableBy = (userId: string): Prisma.TournamentWhereInput => ({
  restrictedAt: null,
  AND: [{ OR: [{ organizationId: null }, { organization: { restrictedAt: null } }] }],
  OR: [
    { organizerId: userId, organizationId: null },
    { organization: { ownerId: userId } },
    {
      organization: { members: { some: { userId, role: { in: ["OWNER", "ADMIN", "MANAGER"] } } } },
    },
    {
      AND: [
        { permissions: { some: { userId, canManage: true } } },
        { OR: [{ organizationId: null }, { organization: { members: { some: { userId } } } }] },
      ],
    },
  ],
});
export async function canManageTournament(tx: Tx, id: string, userId: string) {
  return Boolean(
    await tx.tournament.findFirst({ where: { id, ...manageableBy(userId) }, select: { id: true } }),
  );
}
export async function owned(tx: Tx, id: string, userId: string) {
  const t = await findTournament(tx, id);
  requireCondition(t, "Tournament not found.", 404);
  requireCondition(!t.restrictedAt, "This tournament is restricted by platform moderation.", 403);
  requireCondition(
    await canManageTournament(tx, id, userId),
    "You can only manage tournaments you are authorized for.",
    t.visibility === "PRIVATE" || t.phase === "DRAFT" ? 404 : 403,
  );
  return t;
}

export const visibleTo = (
  userId?: string,
  sharedIds: string[] = [],
): Prisma.TournamentWhereInput => ({
  OR: [
    { visibility: "PUBLIC", phase: { not: "DRAFT" } },
    ...(userId
      ? [
          manageableBy(userId),
          {
            phase: { not: "DRAFT" as const },
            registrations: { some: { roster: { array_contains: [{ id: userId }] } } },
          },
        ]
      : []),
    ...(sharedIds.length ? [{ id: { in: sharedIds }, phase: { not: "DRAFT" as const } }] : []),
  ],
});
export async function viewable(tx: Tx, id: string, userId?: string, sharedIds: string[] = []) {
  const event = await tx.tournament.findFirst({ where: { id, ...visibleTo(userId, sharedIds) } });
  requireCondition(event, "Tournament not found.", 404);
  return event;
}

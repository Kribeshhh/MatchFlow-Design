import { db, requireCondition, publicUser, publicTeam } from "../../database/client.js";
import { statusOf } from "./domain.js";
export async function organizerProfile(username: string) {
  const user = await db.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      status: true,
      profilePublic: true,
      displayName: true,
      bio: true,
      avatarId: true,
    },
  });
  requireCondition(user?.status === "ACTIVE", "Organizer not found.", 404);
  const events = await db.tournament.findMany({
    where: { organizerId: user.id, visibility: "PUBLIC", phase: { not: "DRAFT" } },
    include: {
      organizer: { select: publicUser },
      champion: { select: publicTeam },
      _count: { select: { registrations: { where: { status: { in: ["PENDING", "APPROVED"] } } } } },
    },
    orderBy: { startsAt: "desc" },
    take: 50,
  });
  return {
    username: user.username,
    displayName: user.profilePublic ? user.displayName : user.username,
    bio: user.profilePublic ? user.bio : "",
    avatarId: user.profilePublic ? user.avatarId : null,
    tournaments: events.map((t) => ({
      ...t,
      shareTokenHash: undefined,
      status: statusOf(t),
      registeredCount: t._count.registrations,
    })),
  };
}

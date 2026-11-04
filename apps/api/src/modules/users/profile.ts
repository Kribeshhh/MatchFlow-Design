import { db, requireCondition } from "../../database/client.js";
import { competitionHistory } from "./history.js";
export async function playerProfile(username: string, viewerId?: string) {
  const user = await db.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      region: true,
      gamesPlayed: true,
      socialLinks: true,
      profilePublic: true,
      showHistory: true,
      showTeams: true,
      avatarId: true,
      status: true,
    },
  });
  requireCondition(
    user?.status === "ACTIVE" && (user.profilePublic || user.id === viewerId),
    "Player profile not found.",
    404,
  );
  const self = user.id === viewerId;
  const teams =
    self || user.showTeams
      ? await db.teamMember.findMany({
          where: { userId: user.id, team: { competitionType: "TEAM" } },
          select: {
            manager: true,
            substitute: true,
            team: {
              select: { id: true, name: true, game: true, captainId: true, archivedAt: true },
            },
          },
        })
      : null;
  const record =
    self || user.showHistory
      ? await competitionHistory({ userId: user.id }, self ? user.id : undefined)
      : null;
  return { ...user, status: undefined, self, teams, record };
}

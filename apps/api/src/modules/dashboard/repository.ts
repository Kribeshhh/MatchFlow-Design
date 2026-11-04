import { manageableBy } from "../tournaments/policy.js";
import { db, matchInclude, publicTeam, publicUser } from "../../database/client.js";
export const participation = (userId: string) =>
  db.tournamentRegistration.findMany({
    where: { roster: { array_contains: [{ id: userId }] } },
    select: { tournamentId: true, teamId: true, id: true },
  });
export const events = (userId: string, owner: boolean, ids: string[]) =>
  db.tournament.findMany({
    where: owner ? manageableBy(userId) : { id: { in: ids } },
    include: {
      organizer: { select: publicUser },
      champion: { select: publicTeam },
      registrations: { select: { id: true, status: true, teamId: true, roster: true } },
    },
    orderBy: { createdAt: "desc" },
  });
export const matches = (
  userId: string,
  owner: boolean,
  entries: { tournamentId: string; teamId: string }[],
) =>
  db.match.findMany({
    where: owner
      ? { tournament: manageableBy(userId) }
      : {
          OR: entries.map((r) => ({
            tournamentId: r.tournamentId,
            OR: [{ teamAId: r.teamId }, { teamBId: r.teamId }],
          })),
        },
    include: { ...matchInclude, tournament: { select: { id: true, name: true } } },
    orderBy: { scheduledAt: "asc" },
  });

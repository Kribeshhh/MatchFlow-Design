import { requireCondition, type Tx } from "../../database/client.js";
import { findTeam } from "../teams/repository.js";
import { statusOf } from "../tournaments/domain.js";
import { findTournament } from "../tournaments/repository.js";
import { rosterOf } from "./domain.js";
import { activeRegistrations } from "./repository.js";
export async function eligible(
  tx: Tx,
  tournamentId: string,
  teamId: string,
  ignoreRegistration?: string,
  allowFull = false,
) {
  const t = await findTournament(tx, tournamentId);
  requireCondition(t, "Tournament not found.", 404);
  const team = await findTeam(teamId, tx);
  requireCondition(team, "Team not found.", 404);
  requireCondition(
    ["REGISTRATION", "PUBLISHED"].includes(t.phase) && statusOf(t) === "REGISTRATION_OPEN",
    "Registration is not open.",
  );
  requireCondition(
    !team.restrictedAt && !t.restrictedAt,
    "This entry or tournament is restricted.",
    403,
  );
  requireCondition(!team.archivedAt, "Archived teams cannot register.");
  const starters = team.members.filter((m) => !m.substitute);
  requireCondition(
    team.competitionType === t.competitionType,
    "Competition type does not match this entry.",
  );
  requireCondition(
    !t.eligibleRegions.length ||
      t.eligibleRegions.some((region) => region.toLowerCase() === team.region.toLowerCase()),
    "This entry does not meet the declared region requirements.",
  );
  requireCondition(team.game === t.game, "Team and tournament games must match.");
  requireCondition(
    starters.length === t.teamSize,
    `This tournament requires exactly ${t.teamSize} players, including the captain.`,
  );
  const activePlayers = await tx.user.count({
    where: {
      id: { in: starters.map((m) => m.userId) },
      status: "ACTIVE",
      roles: { has: "PLAYER" },
    },
  });
  requireCondition(
    activePlayers === starters.length,
    "All starting players must have active accounts.",
  );
  const existing = await activeRegistrations(tx, tournamentId, ignoreRegistration);
  requireCondition(
    allowFull || existing.length < t.maxTeams,
    "This tournament is full. Pending registrations reserve a place.",
  );
  const waitlisted = await tx.tournamentRegistration.findMany({
    where: {
      tournamentId,
      status: "WAITLISTED",
      ...(ignoreRegistration ? { id: { not: ignoreRegistration } } : {}),
    },
    select: { roster: true },
  });
  const rosterIds = new Set(starters.map((m) => m.userId));
  requireCondition(
    ![...existing, ...waitlisted].some((r) => rosterOf(r.roster).some((p) => rosterIds.has(p.id))),
    "A player on this roster is already registered with another team.",
  );
  return { t, team, starters, reserved: existing.length };
}

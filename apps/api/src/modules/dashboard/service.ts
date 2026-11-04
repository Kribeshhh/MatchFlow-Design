import type { Account } from "../auth/security.js";
import { memberTeams } from "../teams/repository.js";
import { statusOf } from "../tournaments/domain.js";
import * as repo from "./repository.js";
export async function dashboard(user: Account) {
  const owner = user.role === "ORGANIZER";
  const entries = owner ? [] : await repo.participation(user.id);
  const [teams, tournaments, matches] = await Promise.all([
    owner ? [] : memberTeams(user.id),
    repo.events(
      user.id,
      owner,
      entries.map((r) => r.tournamentId),
    ),
    repo.matches(user.id, owner, entries),
  ]);
  const visible = tournaments.map((t) => ({
    ...t,
    shareTokenHash: undefined,
    status: statusOf(t),
    registeredCount: t.registrations.filter((r) => ["PENDING", "APPROVED"].includes(r.status))
      .length,
    registrations: t.registrations
      .filter((r) => owner || entries.some((entry) => entry.id === r.id))
      .map(({ id, status, teamId }) => ({ id, status, teamId })),
  }));
  return {
    teams,
    tournaments: visible,
    totalRegistrations: owner
      ? tournaments.reduce((n, t) => n + t.registrations.length, 0)
      : entries.length,
    upcomingMatches: matches.filter((m) => m.status === "SCHEDULED"),
    recentResults: matches
      .filter((m) => m.status === "COMPLETED" && !m.isBye)
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
      .slice(0, 10),
  };
}

import { engineRulesSchema } from "../../../../../packages/shared/src/engine.js";
import { visibleTo } from "../tournaments/policy.js";
import { db } from "../../database/client.js";
import { rosterOf } from "../registrations/domain.js";
// Only published, approved participation contributes to public history. BYEs are not wins.
export async function competitionHistory(
  subject: { userId: string } | { teamId: string },
  viewerId?: string,
) {
  const registrations = await db.tournamentRegistration.findMany({
    where: {
      status: "APPROVED",
      tournament: visibleTo(viewerId),
      ...("userId" in subject
        ? { roster: { array_contains: [{ id: subject.userId }] } }
        : { teamId: subject.teamId }),
    },
    select: {
      teamId: true,
      roster: true,
      team: { select: { id: true, name: true } },
      tournament: {
        select: {
          id: true,
          name: true,
          game: true,
          phase: true,
          startsAt: true,
          championId: true,
          engineRules: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const matches = await db.match.findMany({
    where: {
      tournamentId: { in: registrations.map((r) => r.tournament.id) },
      status: "COMPLETED",
      isBye: false,
    },
    select: {
      id: true,
      tournamentId: true,
      teamAId: true,
      teamBId: true,
      winnerId: true,
      outcome: true,
      scoreA: true,
      scoreB: true,
      completedAt: true,
      teamA: { select: { name: true } },
      teamB: { select: { name: true } },
    },
  });
  const lobbies = await db.battleRound.findMany({
    where: { tournamentId: { in: registrations.map((r) => r.tournament.id) }, status: "COMPLETED" },
    include: { results: true },
    orderBy: { number: "asc" },
  });
  const history = registrations
    .filter(
      (r) => !("userId" in subject) || rosterOf(r.roster).some((p) => p.id === subject.userId),
    )
    .map((r) => {
      const played = matches.filter(
        (m) =>
          m.tournamentId === r.tournament.id && (m.teamAId === r.teamId || m.teamBId === r.teamId),
      );
      const wins = played.filter((m) => m.winnerId === r.teamId).length;
      const draws = played.filter((m) => m.outcome === "DRAW").length;
      const rules = engineRulesSchema.parse(r.tournament.engineRules).battle;
      const battleRounds = lobbies
        .filter((l) => l.tournamentId === r.tournament.id)
        .flatMap((l) =>
          l.results
            .filter((result) => result.teamId === r.teamId)
            .map((result) => ({
              number: l.number,
              placement: result.placement,
              eliminations: result.eliminations,
              noShow: result.noShow,
              points:
                result.noShow || !rules
                  ? 0
                  : (rules.placementPoints[(result.placement || 1) - 1] || 0) +
                    result.eliminations * rules.eliminationPoints,
            })),
        );
      return {
        tournament: r.tournament,
        team: r.team,
        wins,
        losses: played.length - wins - draws,
        draws,
        battleRounds,
        champion: r.tournament.phase === "COMPLETED" && r.tournament.championId === r.teamId,
        matches: played,
      };
    });
  const wins = history.reduce((sum, h) => sum + h.wins, 0),
    losses = history.reduce((sum, h) => sum + h.losses, 0);
  return {
    history,
    statistics: {
      tournaments: history.length,
      wins,
      losses,
      draws: history.reduce((sum, h) => sum + h.draws, 0),
      championships: history.filter((h) => h.champion).length,
      winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null,
    },
  };
}

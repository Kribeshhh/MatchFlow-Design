import { leagueStandings } from "../brackets/league.js";
import { engineRulesSchema } from "../../../../../packages/shared/src/engine.js";
import { standings } from "../brackets/formats.js";
import { db } from "../../database/client.js";
import { canManageTournament, viewable } from "./policy.js";
import { requireCondition } from "../../database/client.js";
import { canReadEntry, rosterOf } from "../registrations/domain.js";
import { statusOf } from "./domain.js";
import { findDetail } from "./repository.js";
export async function tournamentDetail(
  id: string,
  account?: { id: string },
  sharedIds: string[] = [],
) {
  await viewable(db, id, account?.id, sharedIds);
  const t = await findDetail(id);
  requireCondition(t, "Tournament not found.", 404);
  const canManage = Boolean(account && (await canManageTournament(db, id, account.id)));
  const managedTeams = account
    ? await db.team.findMany({
        where: {
          OR: [
            { captainId: account.id },
            { members: { some: { userId: account.id, manager: true } } },
          ],
        },
        select: { id: true },
      })
    : [];
  const manages = (teamId: string) => managedTeams.some((team) => team.id === teamId);
  // Pending/rejected rosters are visible only to their captain/members and the event owner.
  return {
    ...t,
    shareTokenHash: undefined,
    canManage,
    standings: t.stages
      .filter(
        (stage) =>
          stage.kind === "GROUP" ||
          (stage.kind === "MAIN" && ["ROUND_ROBIN", "SWISS", "LEAGUE"].includes(t.format)),
      )
      .flatMap((stage) => {
        const ids = stage.participants.map((p) => p.teamId);
        const matches = t.matches.filter((m) => m.stageId === stage.id && m.bracket !== "TIEBREAK");
        const rules = engineRulesSchema.parse(t.engineRules);
        const rows =
          t.format === "LEAGUE" && rules.league
            ? leagueStandings(ids, matches, rules.league)
            : standings(ids, matches, t.format === "SWISS");
        return rows.map((row) => ({
          ...row,
          stageName: stage.name,
          name: t.registrations.find((r) => r.teamId === row.id)?.team.name || "Former participant",
        }));
      }),
    status: statusOf(t),
    registeredCount: t.registrations.filter((r) => ["PENDING", "APPROVED"].includes(r.status))
      .length,
    registrations: t.registrations
      .filter((r) => canManage || manages(r.teamId) || canReadEntry(r, "", account?.id))
      .map((r) => ({
        ...r,
        rosterProposedBy: undefined,
        proposedRoster: canManage || manages(r.teamId) ? r.proposedRoster : undefined,
        canManageRoster: manages(r.teamId),
        team: {
          ...r.team,
          members: rosterOf(r.roster).map((p) => ({
            userId: p.id,
            user: { ...p, role: "PLAYER" as const },
          })),
        },
      })),
  };
}

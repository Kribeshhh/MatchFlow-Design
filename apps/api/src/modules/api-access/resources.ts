import type { Prisma } from "@prisma/client";
import { db, transaction, requireCondition, type Tx } from "../../database/client.js";
import { credentialAccess, eventAccess } from "./policy.js";
import { standings } from "../brackets/formats.js";
import { leagueStandings } from "../brackets/league.js";
import { battleStandings } from "../brackets/battle.js";
import { engineRulesSchema } from "../../../../../packages/shared/src/engine.js";
export const tournamentProjection = {
  id: true,
  name: true,
  game: true,
  description: true,
  rules: true,
  eligibility: true,
  region: true,
  locationType: true,
  location: true,
  teamSize: true,
  maxTeams: true,
  opensAt: true,
  closesAt: true,
  startsAt: true,
  endsAt: true,
  format: true,
  matchFormat: true,
  phase: true,
  visibility: true,
  organizationId: true,
  championId: true,
  engineVersion: true,
  createdAt: true,
} as const;
const matchProjection = {
  id: true,
  tournamentId: true,
  stageId: true,
  round: true,
  position: true,
  bracket: true,
  sourceAId: true,
  sourceBId: true,
  sourceAOutcome: true,
  sourceBOutcome: true,
  teamAId: true,
  teamBId: true,
  scoreA: true,
  scoreB: true,
  liveScoreA: true,
  liveScoreB: true,
  winnerId: true,
  isBye: true,
  status: true,
  scheduledAt: true,
  completedAt: true,
  venue: true,
  slotMinutes: true,
  version: true,
  outcome: true,
  matchFormat: true,
} as const;
export type Page = { limit: number; after?: string };
const pageArgs = (p: Page) => ({
  take: p.limit + 1,
  where: p.after ? { id: { gt: p.after } } : {},
  orderBy: { id: "asc" as const },
});
export function paged<T extends { id: string }>(rows: T[], p: Page) {
  return {
    data: rows.slice(0, p.limit),
    nextCursor: rows.length > p.limit ? rows[p.limit - 1].id : null,
  };
}
export async function listTournaments(p: Page, token?: string) {
  return transaction(async (tx) => {
    const app = token ? await credentialAccess(token, tx) : null;
    if (app)
      requireCondition(
        app.scopes.includes("tournaments:read"),
        "Required API scope is missing.",
        403,
      );
    const where: Prisma.TournamentWhereInput = app
      ? {
          organizationId: app.organizationId,
          integrationGrants: { some: { integrationId: app.id } },
        }
      : { visibility: "PUBLIC", phase: { not: "DRAFT" } };
    const args = pageArgs(p);
    return paged(
      await tx.tournament.findMany({
        ...args,
        where: { ...where, ...args.where },
        select: tournamentProjection,
      }),
      p,
    );
  });
}
async function authorized(
  tx: Tx,
  id: string,
  token?: string,
  kind = "detail",
  organizationId?: string,
) {
  if (token)
    return (
      await eventAccess(
        tx,
        token,
        id,
        kind === "registrations"
          ? "registrations:read"
          : ["matches", "bracket", "results", "standings", "schedule", "rounds"].includes(kind)
            ? "matches:read"
            : "tournaments:read",
      )
    ).tournament;
  const t = await tx.tournament.findFirst({
    where: {
      id,
      visibility: "PUBLIC",
      phase: { not: "DRAFT" },
      ...(organizationId ? { organizationId, organization: { portal: { enabled: true } } } : {}),
    },
  });
  requireCondition(t, "Tournament not found.", 404);
  return t;
}
export function readResource(
  id: string,
  kind: string,
  p: Page,
  token?: string,
  organizationId?: string,
) {
  return transaction(async (tx) => {
    const t = await authorized(tx, id, token, kind, organizationId),
      args = pageArgs(p);
    if (kind === "detail")
      return tx.tournament.findUnique({ where: { id }, select: tournamentProjection });
    if (kind === "announcements")
      return paged(
        await tx.tournamentAnnouncement.findMany({
          ...args,
          where: { tournamentId: id, ...args.where },
          select: { id: true, title: true, body: true, createdAt: true },
        }),
        p,
      );
    if (kind === "teams")
      return paged(
        await tx.team.findMany({
          ...args,
          where: {
            ...args.where,
            registrations: { some: { tournamentId: id, status: "APPROVED" } },
          },
          select: { id: true, name: true, game: true, region: true },
        }),
        p,
      );
    if (kind === "registrations")
      return paged(
        await tx.tournamentRegistration.findMany({
          ...args,
          where: {
            tournamentId: id,
            ...args.where,
            ...(!token ? { status: "APPROVED" as const } : {}),
          },
          select: { id: true, teamId: true, status: true, checkedInAt: true, createdAt: true },
        }),
        p,
      );
    if (kind === "rounds")
      return paged(
        await tx.battleRound.findMany({
          ...args,
          where: { tournamentId: id, ...args.where },
          select: {
            id: true,
            number: true,
            status: true,
            scheduledAt: true,
            venue: true,
            version: true,
            results: {
              select: { teamId: true, placement: true, eliminations: true, noShow: true },
            },
          },
        }),
        p,
      );
    if (kind === "standings") {
      const rules = engineRulesSchema.parse(t.engineRules);
      const stages = await tx.tournamentStage.findMany({
        where: { tournamentId: id },
        include: { participants: { orderBy: { seed: "asc" } }, matches: true },
        orderBy: { position: "asc" },
      });
      if (t.format === "BATTLE_ROYALE" && rules.battle) {
        const rounds = await tx.battleRound.findMany({
          where: { tournamentId: id },
          include: { results: true },
        });
        return {
          data: battleStandings(
            stages.flatMap((s) => s.participants.map((p) => p.teamId)),
            rounds,
            rules.battle,
          ),
          nextCursor: null,
        };
      }
      return {
        data: stages
          .filter(
            (s) =>
              s.kind === "GROUP" ||
              (s.kind === "MAIN" && ["LEAGUE", "ROUND_ROBIN", "SWISS"].includes(t.format)),
          )
          .flatMap((s) => {
            const ids = s.participants.map((p) => p.teamId),
              matches = s.matches.filter((m) => m.bracket !== "TIEBREAK");
            const rows =
              t.format === "LEAGUE" && rules.league
                ? leagueStandings(ids, matches, rules.league)
                : standings(ids, matches, t.format === "SWISS");
            return rows.map((row) => ({ ...row, stageId: s.id, stageName: s.name }));
          }),
        championId: t.championId,
        nextCursor: null,
      };
    }
    return paged(
      await tx.match.findMany({
        ...args,
        where: {
          tournamentId: id,
          ...args.where,
          ...(kind === "results"
            ? { status: "COMPLETED" as const, isBye: false }
            : kind === "schedule"
              ? { scheduledAt: { not: null } }
              : {}),
        },
        select: matchProjection,
      }),
      p,
    );
  });
}
export async function readOrganization(token: string) {
  return transaction(async (tx) => {
    const app = await credentialAccess(token, tx);
    requireCondition(
      app.scopes.includes("tournaments:read"),
      "Required API scope is missing.",
      403,
    );
    return tx.organization.findUnique({
      where: { id: app.organizationId },
      select: { id: true, name: true, description: true, region: true, website: true },
    });
  });
}
export async function publicOrganizations(p: Page) {
  const args = pageArgs(p);
  return paged(
    await db.organization.findMany({
      ...args,
      where: { ...args.where, publicProfile: true },
      select: { id: true, name: true, description: true, region: true, website: true },
    }),
    p,
  );
}

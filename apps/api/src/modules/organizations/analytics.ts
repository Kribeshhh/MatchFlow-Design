import { transaction } from "../../database/client.js";
import { organizationEventsAccess } from "./policy.js";
import { audit } from "../administration/audit.js";
import { csvRows } from "./csv.js";
export async function organizationAnalytics(
  id: string,
  actorId: string,
  days = 90,
  exporting = false,
) {
  return transaction(async (tx) => {
    await organizationEventsAccess(id, actorId, tx);
    const since = new Date(Date.now() - days * 86400000);
    const previousSince = new Date(since.getTime() - days * 86400000);
    const where = { organizationId: id };
    const [
      total,
      active,
      completed,
      registrations,
      pending,
      teams,
      upcoming,
      daily,
      games,
      trends,
      cohort,
      activity,
      progress,
    ] = await Promise.all([
      tx.tournament.count({ where }),
      tx.tournament.count({
        where: { ...where, phase: { in: ["PUBLISHED", "REGISTRATION", "CHECK_IN", "ONGOING"] } },
      }),
      tx.tournament.count({ where: { ...where, phase: "COMPLETED" } }),
      tx.tournamentRegistration.count({ where: { tournament: where } }),
      tx.tournamentRegistration.count({ where: { tournament: where, status: "PENDING" } }),
      tx.$queryRaw<
        { count: number }[]
      >`SELECT count(DISTINCT r."teamId")::int AS count FROM "TournamentRegistration" r JOIN "Tournament" t ON t.id=r."tournamentId" JOIN "Team" team ON team.id=r."teamId" WHERE t."organizationId"=${id} AND r.status='APPROVED' AND team."competitionType"='TEAM'`,
      tx.match.findMany({
        where: {
          tournament: where,
          status: "PENDING",
          isBye: false,
          scheduledAt: { gte: new Date() },
        },
        select: {
          id: true,
          tournamentId: true,
          scheduledAt: true,
          tournament: { select: { name: true } },
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      }),
      tx.$queryRaw<
        { day: string; registrations: number }[]
      >`SELECT to_char(r."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS registrations FROM "TournamentRegistration" r JOIN "Tournament" t ON t.id=r."tournamentId" WHERE t."organizationId"=${id} AND r."createdAt">=${since} GROUP BY day ORDER BY day`,
      tx.$queryRaw<
        { game: string; tournaments: number; registrations: number }[]
      >`SELECT t.game, count(DISTINCT t.id)::int AS tournaments, count(r.id)::int AS registrations FROM "Tournament" t LEFT JOIN "TournamentRegistration" r ON r."tournamentId"=t.id WHERE t."organizationId"=${id} AND t."createdAt">=${since} GROUP BY t.game ORDER BY registrations DESC, t.game`,
      tx.$queryRaw<
        { id: string; name: string; entries: number; previous: number }[]
      >`SELECT team.id, team.name, count(*) FILTER (WHERE r."createdAt">=${since})::int AS entries, count(*) FILTER (WHERE r."createdAt"<${since})::int AS previous FROM "TournamentRegistration" r JOIN "Tournament" t ON t.id=r."tournamentId" JOIN "Team" team ON team.id=r."teamId" WHERE t."organizationId"=${id} AND r."createdAt">=${previousSince} AND r.status='APPROVED' AND team."competitionType"='TEAM' GROUP BY team.id,team.name ORDER BY entries DESC,team.id LIMIT 20`,
      tx.$queryRaw<
        { submitted: number; approved: number; eligible: number; checkedIn: number }[]
      >`SELECT count(*)::int AS submitted, count(*) FILTER (WHERE r.status='APPROVED')::int AS approved, count(*) FILTER (WHERE r.status='APPROVED' AND t."checkInRequired")::int AS eligible, count(*) FILTER (WHERE r.status='APPROVED' AND t."checkInRequired" AND r."checkedInAt" IS NOT NULL)::int AS "checkedIn" FROM "TournamentRegistration" r JOIN "Tournament" t ON t.id=r."tournamentId" WHERE t."organizationId"=${id} AND r."createdAt">=${since}`,
      tx.$queryRaw<
        { id: string; action: string; createdAt: Date; resourceId: string }[]
      >`SELECT a.id,a.action,a."createdAt",a."resourceId" FROM "AuditEvent" a WHERE (a."resourceType"='Organization' AND a."resourceId"=${id}) OR (a."resourceType"='Tournament' AND EXISTS (SELECT 1 FROM "Tournament" t WHERE t.id=a."resourceId" AND t."organizationId"=${id})) OR (a."resourceType"='Match' AND EXISTS (SELECT 1 FROM "Match" m JOIN "Tournament" t ON t.id=m."tournamentId" WHERE m.id=a."resourceId" AND t."organizationId"=${id})) ORDER BY a."createdAt" DESC, a.id DESC LIMIT 30`,
      tx.tournament.findMany({
        where,
        select: {
          id: true,
          name: true,
          phase: true,
          game: true,
          startsAt: true,
          _count: {
            select: {
              registrations: true,
              matches: { where: { isBye: false } },
              battleRounds: true,
            },
          },
          matches: { where: { status: "COMPLETED", isBye: false }, select: { id: true } },
          battleRounds: { where: { status: "COMPLETED" }, select: { id: true } },
        },
        orderBy: { startsAt: "desc" },
        take: 100,
      }),
    ]);
    const { submitted, approved, eligible, checkedIn } = cohort[0];
    const rounds = await tx.battleRound.findMany({
      where: { tournament: where, status: "PENDING", scheduledAt: { gte: new Date() } },
      select: {
        id: true,
        tournamentId: true,
        number: true,
        scheduledAt: true,
        tournament: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });
    if (exporting) await audit(tx, actorId, "organization.analytics.exported", "Organization", id);
    return {
      days,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
      totals: {
        tournaments: total,
        active,
        completed,
        registrations,
        pendingApprovals: pending,
        participatingTeams: teams[0].count,
      },
      conversion: {
        submitted,
        approved,
        rate: submitted ? approved / submitted : null,
      },
      attendance: { eligible, checkedIn, rate: eligible ? checkedIn / eligible : null },
      daily,
      games,
      teamTrends: trends,
      upcoming: [
        ...upcoming,
        ...rounds.map((r) => ({
          ...r,
          label: `Battle royale round ${r.number}`,
          teamA: null,
          teamB: null,
        })),
      ]
        .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
        .slice(0, 10),
      activity,
      tournaments: progress.map((t) => ({
        id: t.id,
        name: t.name,
        phase: t.phase,
        game: t.game,
        startsAt: t.startsAt.toISOString(),
        registrations: t._count.registrations,
        scheduled: t._count.matches + t._count.battleRounds,
        completed: t.matches.length + t.battleRounds.length,
      })),
    };
  });
}
export async function exportAnalytics(id: string, actorId: string, days: number) {
  const data = await organizationAnalytics(id, actorId, days, true);
  return csvRows([
    ["Section", "Name", "Value", "Period days"],
    ...Object.entries(data.totals).map(([name, value]) => ["Lifetime totals", name, value, "all"]),
    [
      "Approval conversion",
      "Approved / submitted",
      data.conversion.rate ?? "Unavailable: no submissions",
      days,
    ],
    [
      "Check-in rate",
      "Checked in / approved requiring check-in",
      data.attendance.rate ?? "Unavailable: no eligible entries",
      days,
    ],
    ...data.daily.map((row) => ["Registrations UTC", row.day, row.registrations, days]),
    ...data.games.map((row) => [
      "Game registrations (events created in period)",
      row.game,
      row.registrations,
      days,
    ]),
    ...data.teamTrends.map((row) => ["Approved team entries", row.name, row.entries, days]),
  ]);
}

import { type Tournament, type Prisma } from "@prisma/client";
import {
  db,
  transaction,
  requireCondition,
  teamInclude,
  matchInclude,
  publicUser,
  type Tx,
} from "./db.js";
export function statusOf(t: Tournament) {
  if (t.phase !== "REGISTRATION") return t.phase;
  if (new Date() < t.opensAt) return "UPCOMING";
  return new Date() <= t.closesAt ? "REGISTRATION_OPEN" : "REGISTRATION_CLOSED";
}
export const tournamentInclude = {
  organizer: { select: publicUser },
  champion: true,
  registrations: {
    include: { team: { include: teamInclude } },
    orderBy: { createdAt: "asc" as const },
  },
  matches: {
    include: matchInclude,
    orderBy: [{ round: "asc" as const }, { position: "asc" as const }],
  },
};
export async function owned(tx: Tx, id: string, owner: string) {
  const t = await tx.tournament.findUnique({ where: { id } });
  requireCondition(t, "Tournament not found.", 404);
  requireCondition(
    t.organizerId === owner,
    "You can only manage your own tournaments.",
    403,
  );
  return t;
}
export async function editableTeam(tx: Tx, id: string, captain: string) {
  const team = await tx.team.findUnique({
    where: { id },
    include: teamInclude,
  });
  requireCondition(team, "Team not found.", 404);
  requireCondition(
    team.captainId === captain,
    "Only the team captain can change this roster.",
    403,
  );
  const locked = await tx.tournamentRegistration.count({
    where: {
      teamId: id,
      status: { in: ["PENDING", "APPROVED"] },
      tournament: { phase: { not: "COMPLETED" } },
    },
  });
  requireCondition(
    !locked,
    "This roster is locked by an active registration. The organizer must remove it before roster changes.",
  );
  return team;
}
export async function eligible(
  tx: Tx,
  tournamentId: string,
  teamId: string,
  ignoreRegistration?: string,
) {
  const t = await tx.tournament.findUnique({ where: { id: tournamentId } });
  requireCondition(t, "Tournament not found.", 404);
  const team = await tx.team.findUnique({
    where: { id: teamId },
    include: teamInclude,
  });
  requireCondition(team, "Team not found.", 404);
  requireCondition(
    t.phase === "REGISTRATION" && statusOf(t) === "REGISTRATION_OPEN",
    "Registration is not open.",
  );
  requireCondition(
    team.game === t.game,
    "Team and tournament games must match.",
  );
  requireCondition(
    team.members.length === t.teamSize,
    `This tournament requires exactly ${t.teamSize} players, including the captain.`,
  );
  const existing = await tx.tournamentRegistration.findMany({
    where: {
      tournamentId,
      status: { in: ["PENDING", "APPROVED"] },
      ...(ignoreRegistration ? { id: { not: ignoreRegistration } } : {}),
    },
  });
  requireCondition(
    existing.length < t.maxTeams,
    "This tournament is full. Pending registrations reserve a place.",
  );
  const rosterIds = new Set(team.members.map((m) => m.userId));
  requireCondition(
    !existing.some((r) =>
      (r.roster as { id: string }[]).some((p) => rosterIds.has(p.id)),
    ),
    "A player on this roster is already registered with another team.",
  );
  return { t, team };
}
export async function registerTeam(
  tournamentId: string,
  teamId: string,
  accountId: string,
  manual = false,
) {
  return transaction(async (tx) => {
    if (manual) await owned(tx, tournamentId, accountId);
    const { team } = await eligible(tx, tournamentId, teamId);
    if (!manual)
      requireCondition(
        team.captainId === accountId,
        "Only the captain can register this team.",
        403,
      );
    requireCondition(
      !(await tx.tournamentRegistration.findUnique({
        where: { tournamentId_teamId: { tournamentId, teamId } },
      })),
      "This team already has a registration. Contact the organizer about rejected entries.",
    );
    return tx.tournamentRegistration.create({
      data: {
        tournamentId,
        teamId,
        status: manual ? "APPROVED" : "PENDING",
        roster: team.members.map((m) => ({
          id: m.userId,
          username: m.user.username,
        })),
      },
    });
  });
}
export async function reviewRegistration(
  tournamentId: string,
  registrationId: string,
  owner: string,
  action: "APPROVED" | "REJECTED" | "REMOVE",
) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, owner);
    requireCondition(
      t.phase === "REGISTRATION",
      "Registrations are locked after the bracket is generated.",
    );
    const r = await tx.tournamentRegistration.findUnique({
      where: { id: registrationId },
    });
    requireCondition(
      r?.tournamentId === tournamentId,
      "Registration not found.",
      404,
    );
    if (action === "REMOVE") {
      await tx.tournamentRegistration.delete({ where: { id: registrationId } });
      return { removed: true };
    }
    // Reviews can occur after the deadline. Rejected registrations must be removed and resubmitted.
    requireCondition(
      r.status !== "REJECTED" || action === "REJECTED",
      "Remove the rejected entry and register the team again to re-check eligibility.",
    );
    return tx.tournamentRegistration.update({
      where: { id: registrationId },
      data: { status: action },
    });
  });
}
export function seedOrder(size: number) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    seeds = seeds.flatMap((n) => [n, sum - n]);
  }
  return seeds;
}
async function advance(
  tx: Tx,
  match: {
    tournamentId: string;
    round: number;
    position: number;
    winnerId: string | null;
  },
) {
  requireCondition(match.winnerId, "Match has no winner.");
  const next = await tx.match.findUnique({
    where: {
      tournamentId_round_position: {
        tournamentId: match.tournamentId,
        round: match.round + 1,
        position: Math.floor(match.position / 2),
      },
    },
  });
  if (next) {
    await tx.match.update({
      where: { id: next.id },
      data:
        match.position % 2 === 0
          ? { teamAId: match.winnerId }
          : { teamBId: match.winnerId },
    });
  } else {
    await tx.tournament.update({
      where: { id: match.tournamentId },
      data: { phase: "COMPLETED", championId: match.winnerId },
    });
  }
}
export async function generateBracket(tournamentId: string, owner: string) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, owner);
    requireCondition(t.phase === "REGISTRATION", "A bracket already exists.");
    requireCondition(
      (await tx.match.count({ where: { tournamentId } })) === 0,
      "A bracket already exists.",
    );
    const registrations = await tx.tournamentRegistration.findMany({
      where: { tournamentId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    requireCondition(
      !registrations.some((r) => r.status === "PENDING"),
      "Approve or reject all pending registrations before generating the bracket.",
    );
    const teams = registrations.filter((r) => r.status === "APPROVED");
    requireCondition(
      teams.length >= 2,
      "At least two approved teams are required.",
    );
    const size = 2 ** Math.ceil(Math.log2(teams.length));
    const order = seedOrder(size);
    const rows: Prisma.MatchCreateManyInput[] = [];
    for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) {
      for (let position = 0; position < count; position++) {
        const teamAId =
          round === 1 ? (teams[order[position * 2] - 1]?.teamId ?? null) : null;
        const teamBId =
          round === 1
            ? (teams[order[position * 2 + 1] - 1]?.teamId ?? null)
            : null;
        const isBye = round === 1 && (!teamAId || !teamBId);
        rows.push({
          tournamentId,
          round,
          position,
          teamAId,
          teamBId,
          isBye,
          status: isBye ? "COMPLETED" : "PENDING",
          winnerId: isBye ? teamAId || teamBId : null,
          completedAt: isBye ? new Date() : null,
        });
      }
    }
    await tx.match.createMany({ data: rows });
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { phase: "ONGOING" },
    });
    const byes = await tx.match.findMany({
      where: { tournamentId, isBye: true },
    });
    for (const bye of byes) await advance(tx, bye);
    return tx.match.findMany({
      where: { tournamentId },
      include: matchInclude,
      orderBy: [{ round: "asc" }, { position: "asc" }],
    });
  });
}
export async function saveResult(
  tournamentId: string,
  matchId: string,
  owner: string,
  scoreA: number,
  scoreB: number,
) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, owner);
    requireCondition(
      t.phase === "ONGOING",
      "This tournament is not in progress.",
    );
    const match = await tx.match.findUnique({ where: { id: matchId } });
    requireCondition(
      match?.tournamentId === tournamentId,
      "Match not found.",
      404,
    );
    requireCondition(
      match.status !== "COMPLETED",
      "A completed result cannot be overwritten.",
    );
    requireCondition(
      match.teamAId && match.teamBId && !match.isBye,
      "Both opponents must be known before recording a result.",
    );
    requireCondition(
      Number.isInteger(scoreA) &&
        Number.isInteger(scoreB) &&
        scoreA >= 0 &&
        scoreB >= 0 &&
        scoreA <= 999 &&
        scoreB <= 999 &&
        scoreA !== scoreB,
      "Enter unequal, non-negative integer scores (maximum 999).",
    );
    const result = await tx.match.update({
      where: { id: matchId },
      data: {
        scoreA,
        scoreB,
        winnerId: scoreA > scoreB ? match.teamAId : match.teamBId,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
    await advance(tx, result);
    return result;
  });
}
export async function scheduleMatch(
  tournamentId: string,
  matchId: string,
  owner: string,
  scheduledAt: string,
  venue: string,
) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, owner);
    requireCondition(
      t.phase === "ONGOING",
      "Generate the bracket before scheduling.",
    );
    const match = await tx.match.findUnique({ where: { id: matchId } });
    requireCondition(
      match?.tournamentId === tournamentId,
      "Match not found.",
      404,
    );
    requireCondition(
      match.status !== "COMPLETED",
      "Completed matches cannot be rescheduled.",
    );
    const date = new Date(scheduledAt);
    requireCondition(
      date >= t.startsAt,
      "A match cannot start before the tournament date.",
    );
    const sources = await tx.match.findMany({
      where: {
        tournamentId,
        round: match.round - 1,
        position: { in: [match.position * 2, match.position * 2 + 1] },
      },
    });
    requireCondition(
      sources.every((s) => !s.scheduledAt || s.scheduledAt < date),
      "Schedule this round after its preceding matches.",
    );
    const next = await tx.match.findUnique({
      where: {
        tournamentId_round_position: {
          tournamentId,
          round: match.round + 1,
          position: Math.floor(match.position / 2),
        },
      },
    });
    requireCondition(
      !next?.scheduledAt || next.scheduledAt > date,
      "This match must start before the next round.",
    );
    return tx.match.update({
      where: { id: matchId },
      data: { scheduledAt: date, venue, status: "SCHEDULED" },
    });
  });
}
export async function tournamentDetail(id: string, account?: { id: string }) {
  const t = await db.tournament.findUnique({
    where: { id },
    include: tournamentInclude,
  });
  requireCondition(t, "Tournament not found.", 404);
  // Pending/rejected rosters are visible only to their captain/members and the event owner.
  return {
    ...t,
    status: statusOf(t),
    registeredCount: t.registrations.filter((r) => r.status !== "REJECTED")
      .length,
    registrations: t.registrations.filter(
      (r) =>
        r.status === "APPROVED" ||
        t.organizerId === account?.id ||
        (r.roster as { id: string }[]).some((p) => p.id === account?.id),
    ),
  };
}

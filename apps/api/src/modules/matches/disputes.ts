import { staffAccess } from "../administration/staff-auth.js";
import { evidenceLines } from "./evidence.js";
import { requireCondition, transaction, type Tx, db } from "../../database/client.js";
import { owned, viewable, canManageTournament } from "../tournaments/policy.js";
import { requireTeamActor } from "../teams/policy.js";
import { rosterOf } from "../registrations/domain.js";
import { history, fingerprint } from "../brackets/commands.js";
import { impactedMatches } from "./impact.js";
export async function participant(tx: Tx, tournamentId: string, teamIds: string[], actor: string) {
  const entries = await tx.tournamentRegistration.findMany({
    where: { tournamentId, teamId: { in: teamIds }, status: "APPROVED" },
    include: { team: { include: { members: true } } },
  });
  requireCondition(
    entries.some(
      (e) =>
        rosterOf(e.roster).some((p) => p.id === actor) ||
        e.team.captainId === actor ||
        e.team.members.some((m) => m.userId === actor && m.manager),
    ),
    "Only a participant in this match may report or dispute it.",
    403,
  );
}
export async function openDispute(
  tournamentId: string,
  resourceId: string,
  actor: string,
  reason: string,
  battle = false,
  sharedIds: string[] = [],
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actor);
    await viewable(tx, tournamentId, actor, sharedIds);
    const resource = battle
      ? await tx.battleRound.findUnique({ where: { id: resourceId } })
      : await tx.match.findUnique({ where: { id: resourceId } });
    requireCondition(
      resource?.tournamentId === tournamentId && resource.status === "COMPLETED",
      "A completed result is required for a dispute.",
      404,
    );
    requireCondition(
      !("isBye" in resource) || !resource.isBye,
      "A BYE is not a played result and cannot be disputed.",
    );
    const manager = await canManageTournament(tx, tournamentId, actor);
    const teamIds =
      "participantIds" in resource
        ? resource.participantIds
        : [resource.teamAId, resource.teamBId].filter((id): id is string => Boolean(id));
    if (!manager) await participant(tx, tournamentId, teamIds, actor);
    const existing = await tx.matchDispute.findFirst({
      where: {
        tournamentId,
        reporterId: actor,
        ...(battle ? { battleRoundId: resourceId } : { matchId: resourceId }),
      },
    });
    requireCondition(
      !existing || (Boolean(manager) && existing.status !== "OPEN"),
      "You already submitted a dispute for this result.",
      409,
    );
    const dispute = await tx.matchDispute.create({
      data: {
        tournamentId,
        reporterId: actor,
        reason,
        ...(battle ? { battleRoundId: resourceId } : { matchId: resourceId }),
      },
    });
    await history(tx, tournamentId, actor, "dispute.opened", { disputeId: dispute.id }, resourceId);
    return dispute;
  });
}
export async function correctionAccess(tx: Tx, id: string, actor: string, staffSession?: string) {
  if (!staffSession) return owned(tx, id, actor);
  await staffAccess(tx, actor, staffSession, true, true);
  const event = await tx.tournament.findUnique({ where: { id } });
  requireCondition(event, "Tournament not found.", 404);
  return event;
}
export async function correctionState(
  tx: Tx,
  tournamentId: string,
  disputeId: string,
  actor: string,
  staffSession?: string,
) {
  const event = await correctionAccess(tx, tournamentId, actor, staffSession);
  requireCondition(
    ["ONGOING", "COMPLETED"].includes(event.phase),
    "Only ongoing or completed events can be corrected.",
  );
  const dispute = await tx.matchDispute.findUnique({ where: { id: disputeId } });
  requireCondition(
    dispute?.tournamentId === tournamentId && dispute.status === "OPEN",
    "Open dispute not found.",
    404,
  );
  const matches = await tx.match.findMany({
      where: { tournamentId },
      include: { result: true, reports: true },
      orderBy: [{ round: "asc" }, { position: "asc" }],
    }),
    stages = await tx.tournamentStage.findMany({ where: { tournamentId } });
  const rounds = await tx.battleRound.findMany({
    where: { tournamentId },
    include: { results: true },
    orderBy: { number: "asc" },
  });
  const target = matches.find((m) => m.id === dispute.matchId),
    battle = rounds.find((r) => r.id === dispute.battleRoundId);
  requireCondition(target || battle, "The disputed result is no longer current.", 409);
  const affected = target ? impactedMatches(event, target, matches, stages) : [];
  const affectedRounds = battle ? rounds.filter((r) => r.number > battle.number) : [];
  const hash = fingerprint({
    id: tournamentId,
    disputeId,
    version: event.engineVersion,
    matches,
    rounds,
  });
  return { event, dispute, target, battle, affected, affectedRounds, stages, hash };
}
export async function previewCorrection(
  tournamentId: string,
  disputeId: string,
  actor: string,
  staffSession?: string,
) {
  return transaction(async (tx) => {
    const state = await correctionState(tx, tournamentId, disputeId, actor, staffSession);
    return {
      previewHash: state.hash,
      target: state.target || state.battle,
      affectedMatches: state.affected.map((m) => ({
        id: m.id,
        round: m.round,
        bracket: m.bracket,
        status: m.status,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
      })),
      affectedRounds: state.affectedRounds.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
      })),
      voidedResults:
        state.affected.filter((m) => m.status === "COMPLETED" && !m.isBye).length +
        state.affectedRounds.filter((r) => r.status === "COMPLETED").length,
      championWillBeRecomputed: Boolean(state.event.championId),
    };
  });
}
export async function dismissDispute(
  tournamentId: string,
  disputeId: string,
  actor: string,
  resolution: string,
  staffSession?: string,
) {
  return transaction(async (tx) => {
    await correctionAccess(tx, tournamentId, actor, staffSession);
    const dispute = await tx.matchDispute.findUnique({ where: { id: disputeId } });
    requireCondition(
      dispute?.tournamentId === tournamentId && dispute.status === "OPEN",
      "Open dispute not found.",
      404,
    );
    await tx.matchDispute.update({
      where: { id: disputeId },
      data: { status: "REJECTED", resolution, resolvedAt: new Date() },
    });
    await history(
      tx,
      tournamentId,
      actor,
      "dispute.rejected",
      { disputeId },
      dispute.matchId || dispute.battleRoundId || undefined,
      resolution,
    );
    return { ok: true };
  });
}
export async function matchHistory(tournamentId: string, actor: string, cursor?: string) {
  await owned(db, tournamentId, actor);
  if (cursor)
    requireCondition(
      await db.engineHistory.findFirst({ where: { id: cursor, tournamentId } }),
      "History cursor not found.",
      404,
    );
  const historyRows = await db.engineHistory.findMany({
    where: { tournamentId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 101,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const names = new Map(
    (
      await db.tournamentRegistration.findMany({
        where: { tournamentId },
        select: { team: { select: { id: true, name: true } } },
      })
    ).map((r) => [r.team.id, r.team.name]),
  );
  return {
    disputes: await db.matchDispute.findMany({
      where: { tournamentId },
      orderBy: { createdAt: "desc" },
    }),
    reports: await db.matchReport.findMany({
      where: { tournamentId },
      orderBy: { createdAt: "desc" },
    }),
    history: historyRows.slice(0, 100).map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason,
      matchId: row.matchId,
      createdAt: row.createdAt,
      evidence: evidenceLines(row.snapshot, names),
    })),
    nextCursor: historyRows.length > 100 ? historyRows[99].id : null,
  };
}
export async function ownReports(tournamentId: string, actor: string, sharedIds: string[] = []) {
  await viewable(db, tournamentId, actor, sharedIds);
  return {
    disputes: await db.matchDispute.findMany({
      where: { tournamentId, reporterId: actor },
      orderBy: { createdAt: "desc" },
    }),
    reports: await db.matchReport.findMany({
      where: { tournamentId, reporterId: actor },
      orderBy: { createdAt: "desc" },
    }),
    history: [],
  };
}

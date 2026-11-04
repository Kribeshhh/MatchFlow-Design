import { db, requireCondition, transaction } from "../../database/client.js";
import { audit } from "../administration/audit.js";
import { throttle } from "../auth/throttle.js";
import { editableTeam, requireTeamActor } from "./policy.js";
const invitationSelect = {
  id: true,
  teamId: true,
  userId: true,
  status: true,
  expiresAt: true,
  user: { select: { id: true, username: true } },
  team: { select: { id: true, name: true, game: true } },
} as const;
export const inbox = (userId: string) =>
  db.teamInvitation.findMany({
    where: { userId, status: "PENDING", expiresAt: { gt: new Date() }, team: { archivedAt: null } },
    select: invitationSelect,
    orderBy: { createdAt: "desc" },
  });
export async function invite(teamId: string, actorId: string, userId: string) {
  await throttle("team-invite", actorId, 30, 3600000);
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const team = await editableTeam(tx, teamId, actorId);
    requireCondition(
      !team.members.some((m) => m.userId === userId),
      "This player is already a member.",
      409,
    );
    const user = await tx.user.findUnique({ where: { id: userId } });
    requireCondition(
      user?.status === "ACTIVE" && user.roles.includes("PLAYER"),
      "Player not found.",
      404,
    );
    const existing = await tx.teamInvitation.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    requireCondition(
      !existing || existing.status !== "PENDING" || existing.expiresAt <= new Date(),
      "An invitation is already pending.",
      409,
    );
    const data = {
      invitedById: actorId,
      status: "PENDING" as const,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    };
    const invitation = await tx.teamInvitation.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId, ...data },
      update: data,
      select: invitationSelect,
    });
    await audit(tx, actorId, "team.invited", "Team", teamId);
    return invitation;
  });
}
export function respond(invitationId: string, actorId: string, accept: boolean) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const invitation = await tx.teamInvitation.findUnique({
      where: { id: invitationId },
      include: { team: { include: { members: true } } },
    });
    requireCondition(invitation?.userId === actorId, "Invitation not found.", 404);
    requireCondition(
      invitation.status === "PENDING" &&
        invitation.expiresAt > new Date() &&
        !invitation.team.archivedAt &&
        !invitation.team.restrictedAt,
      "Invitation is no longer available.",
      409,
    );
    if (accept) {
      const inviter = await tx.user.findUnique({
        where: { id: invitation.invitedById },
        select: { status: true },
      });
      requireCondition(
        inviter?.status === "ACTIVE" &&
          (invitation.team.captainId === invitation.invitedById ||
            invitation.team.members.some((m) => m.userId === invitation.invitedById && m.manager)),
        "The inviter no longer manages this team. Request a new invitation.",
        409,
      );
      requireCondition(invitation.team.members.length < 10, "Teams can have at most 10 members.");
      await tx.teamMember.create({
        data: { teamId: invitation.teamId, userId: actorId, acceptedAt: new Date() },
      });
    }
    await tx.teamInvitation.update({
      where: { id: invitationId },
      data: { status: accept ? "ACCEPTED" : "REJECTED" },
    });
    await audit(
      tx,
      actorId,
      accept ? "team.invitation.accepted" : "team.invitation.rejected",
      "Team",
      invitation.teamId,
    );
    return { ok: true };
  });
}
export function cancel(teamId: string, invitationId: string, actorId: string) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    await editableTeam(tx, teamId, actorId);
    const result = await tx.teamInvitation.updateMany({
      where: { id: invitationId, teamId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    requireCondition(result.count, "Pending invitation not found.", 404);
    await audit(tx, actorId, "team.invitation.cancelled", "Team", teamId);
    return { ok: true };
  });
}
export async function sent(teamId: string, actorId: string) {
  const team = await db.team.findUnique({ where: { id: teamId }, include: { members: true } });
  requireCondition(
    team &&
      (team.captainId === actorId || team.members.some((m) => m.userId === actorId && m.manager)),
    "Permission denied.",
    403,
  );
  return db.teamInvitation.findMany({
    where: { teamId, status: "PENDING", expiresAt: { gt: new Date() } },
    select: invitationSelect,
  });
}

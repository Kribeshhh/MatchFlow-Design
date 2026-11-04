import { requireCondition, transaction } from "../../database/client.js";
import { audit } from "../administration/audit.js";
import { editableTeam, requireTeamActor } from "./policy.js";
import { activeEntries } from "./repository.js";
export function setMember(
  teamId: string,
  actorId: string,
  userId: string,
  data: { manager?: boolean; substitute?: boolean },
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const team = await editableTeam(tx, teamId, actorId);
    requireCondition(
      team.members.some((m) => m.userId === userId),
      "Member not found.",
      404,
    );
    requireCondition(userId !== team.captainId, "The captain remains a starting member.");
    requireCondition(
      data.manager === undefined || team.captainId === actorId,
      "Only the captain can assign managers.",
      403,
    );
    requireCondition(
      team.captainId === actorId || !team.members.find((m) => m.userId === userId)?.manager,
      "Only the captain can change another manager.",
      403,
    );
    await tx.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data });
    await audit(tx, actorId, "team.member.updated", "Team", teamId);
    return { ok: true };
  });
}
export function leave(teamId: string, actorId: string) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const team = await tx.team.findUnique({ where: { id: teamId } });
    requireCondition(team?.competitionType === "TEAM", "Team not found.", 404);
    requireCondition(
      team.captainId !== actorId,
      "Transfer captain ownership or archive the team before leaving.",
    );
    const member = await tx.teamMember.deleteMany({ where: { teamId, userId: actorId } });
    requireCondition(member.count, "Membership not found.", 404);
    if (team.transferToId === actorId)
      await tx.team.update({
        where: { id: teamId },
        data: { transferToId: null, transferExpiresAt: null },
      });
    await audit(tx, actorId, "team.member.left", "Team", teamId);
    return { ok: true };
  });
}
export function archive(teamId: string, actorId: string) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const team = await editableTeam(tx, teamId, actorId);
    requireCondition(team.captainId === actorId, "Only the captain can archive a team.", 403);
    requireCondition(
      !(await activeEntries(teamId, tx)),
      "Finish or remove active tournament entries before archiving.",
    );
    await tx.team.update({
      where: { id: teamId },
      data: { archivedAt: new Date(), transferToId: null, transferExpiresAt: null },
    });
    await tx.teamInvitation.updateMany({
      where: { teamId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await audit(tx, actorId, "team.archived", "Team", teamId);
    return { ok: true };
  });
}
export function requestTransfer(teamId: string, actorId: string, userId: string) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const team = await editableTeam(tx, teamId, actorId);
    requireCondition(team.captainId === actorId, "Only the captain can transfer ownership.", 403);
    requireCondition(
      userId !== actorId && team.members.some((m) => m.userId === userId),
      "Choose another current member.",
    );
    const target = await tx.user.findUnique({ where: { id: userId } });
    requireCondition(target?.status === "ACTIVE", "Choose an active member.");
    await tx.team.update({
      where: { id: teamId },
      data: { transferToId: userId, transferExpiresAt: new Date(Date.now() + 86400000) },
    });
    await audit(tx, actorId, "team.transfer.requested", "Team", teamId);
    return { ok: true };
  });
}
export function respondTransfer(teamId: string, actorId: string, accept: boolean) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const team = await tx.team.findUnique({ where: { id: teamId }, include: { members: true } });
    requireCondition(
      team?.competitionType === "TEAM" &&
        !team.archivedAt &&
        !team.restrictedAt &&
        team.transferToId === actorId &&
        team.transferExpiresAt &&
        team.transferExpiresAt > new Date() &&
        team.members.some((m) => m.userId === actorId),
      "Transfer is not available.",
      403,
    );
    if (accept)
      await tx.teamMember.update({
        where: { teamId_userId: { teamId, userId: actorId } },
        data: { manager: false, substitute: false },
      });
    await tx.team.update({
      where: { id: teamId },
      data: {
        ...(accept ? { captainId: actorId } : {}),
        transferToId: null,
        transferExpiresAt: null,
      },
    });
    await audit(
      tx,
      actorId,
      accept ? "team.transfer.accepted" : "team.transfer.rejected",
      "Team",
      teamId,
    );
    return { ok: true };
  });
}

export function cancelTransfer(teamId: string, actorId: string) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const team = await editableTeam(tx, teamId, actorId);
    requireCondition(team.captainId === actorId, "Only the captain can cancel a transfer.", 403);
    await tx.team.update({
      where: { id: teamId },
      data: { transferToId: null, transferExpiresAt: null },
    });
    await audit(tx, actorId, "team.transfer.cancelled", "Team", teamId);
    return { ok: true };
  });
}

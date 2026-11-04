import { z } from "zod";
import type { OrganizationRole } from "@prisma/client";
import { db, transaction, requireCondition, type Tx } from "../../database/client.js";
import { organizationAccess, workspaceAccess } from "./policy.js";
import { requireTeamActor } from "../teams/policy.js";
import { audit } from "../administration/audit.js";
export async function inviteStaff(
  id: string,
  actorId: string,
  input: { recipient: string; role: "ADMIN" | "MANAGER" | "MEMBER" },
) {
  return transaction(async (tx) => {
    const org = await organizationAccess(id, actorId, input.role === "ADMIN", tx);
    const label = input.recipient.trim();
    let email: string;
    if (label.includes("@")) email = z.string().email().max(254).parse(label).toLowerCase();
    else {
      const target = await tx.user.findUnique({ where: { username: label } });
      requireCondition(
        target?.status === "ACTIVE" && target.emailVerifiedAt,
        "Choose a verified account or invite by email.",
      );
      email = target.email.toLowerCase();
    }
    const target = await tx.user.findUnique({ where: { email } });
    requireCondition(target?.id !== org.ownerId, "The owner already has access.");
    if (target)
      requireCondition(
        !(await tx.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: id, userId: target.id } },
        })),
        "This account already belongs to the organization.",
        409,
      );
    await tx.organizationInvitation.updateMany({
      where: { organizationId: id, email, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "CANCELLED" },
    });
    requireCondition(
      !(await tx.organizationInvitation.findFirst({
        where: { organizationId: id, email, status: "PENDING" },
      })),
      "An invitation is already pending.",
      409,
    );
    const invite = await tx.organizationInvitation.create({
      data: {
        organizationId: id,
        email,
        label,
        role: input.role,
        invitedById: actorId,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
      select: { id: true },
    });
    await audit(tx, actorId, "organization.invited", "Organization", id);
    return invite;
  });
}
export async function myInvitations(actorId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!user.emailVerifiedAt || user.status !== "ACTIVE") return [];
  return db.organizationInvitation.findMany({
    where: { email: user.email, status: "PENDING", expiresAt: { gt: new Date() } },
    select: {
      id: true,
      role: true,
      expiresAt: true,
      organization: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
export async function answerInvitation(id: string, actorId: string, accept: boolean) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    const invite = await tx.organizationInvitation.findUnique({ where: { id } });
    requireCondition(
      invite && user.emailVerifiedAt && invite.email === user.email,
      "Invitation not found.",
      404,
    );
    requireCondition(
      invite.status === "PENDING" && invite.expiresAt > new Date(),
      "Invitation is no longer available.",
      409,
    );
    if (accept) {
      await organizationAccess(
        invite.organizationId,
        invite.invitedById,
        invite.role === "ADMIN",
        tx,
      );
      requireCondition(
        !(await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: { organizationId: invite.organizationId, userId: actorId },
          },
        })),
        "Already a member.",
        409,
      );
      await tx.organizationMember.create({
        data: { organizationId: invite.organizationId, userId: actorId, role: invite.role },
      });
    }
    await tx.organizationInvitation.update({
      where: { id },
      data: { status: accept ? "ACCEPTED" : "REJECTED" },
    });
    await audit(
      tx,
      actorId,
      accept ? "organization.invitation.accepted" : "organization.invitation.rejected",
      "Organization",
      invite.organizationId,
    );
    return { ok: true };
  });
}
export async function cancelInvitation(orgId: string, id: string, actorId: string) {
  return transaction(async (tx) => {
    const invite = await tx.organizationInvitation.findFirst({
      where: { id, organizationId: orgId },
    });
    requireCondition(invite, "Invitation not found.", 404);
    await organizationAccess(orgId, actorId, invite.role === "ADMIN", tx);
    requireCondition(invite.status === "PENDING", "Invitation is no longer pending.", 409);
    await tx.organizationInvitation.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, actorId, "organization.invitation.cancelled", "Organization", orgId);
    return { ok: true };
  });
}
async function targetMember(
  tx: Tx,
  id: string,
  actorId: string,
  userId: string,
  role?: OrganizationRole,
) {
  const org = await organizationAccess(id, actorId, false, tx);
  const member = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: id, userId } },
  });
  requireCondition(
    member && userId !== org.ownerId,
    "Member not found or owner cannot be changed.",
    404,
  );
  requireCondition(
    org.ownerId === actorId ||
      (member.role !== "ADMIN" &&
        member.role !== "OWNER" &&
        role !== "ADMIN" &&
        actorId !== userId),
    "Only the owner controls administrators.",
    403,
  );
  return member;
}
export async function changeMember(
  id: string,
  actorId: string,
  userId: string,
  role: "ADMIN" | "MANAGER" | "MEMBER",
) {
  return transaction(async (tx) => {
    await targetMember(tx, id, actorId, userId, role);
    await tx.organizationMember.update({
      where: { organizationId_userId: { organizationId: id, userId } },
      data: { role },
    });
    // A demotion must not retain event grants accidentally assigned under a broader role.
    await tx.tournamentPermission.deleteMany({
      where: { userId, tournament: { organizationId: id } },
    });
    await tx.organizationInvitation.updateMany({
      where: { organizationId: id, invitedById: userId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await audit(tx, actorId, "organization.member.role.changed", "Organization", id);
    return { ok: true };
  });
}
export async function removeMember(id: string, actorId: string, userId: string) {
  return transaction(async (tx) => {
    if (actorId === userId) {
      const org = await workspaceAccess(id, actorId, tx);
      requireCondition(org.ownerId !== actorId, "The owner cannot leave the organization.");
    } else await targetMember(tx, id, actorId, userId);
    await tx.tournamentPermission.deleteMany({
      where: { userId, tournament: { organizationId: id } },
    });
    await tx.organizationMember.delete({
      where: { organizationId_userId: { organizationId: id, userId } },
    });
    const target = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.organizationInvitation.updateMany({
      where: {
        organizationId: id,
        status: "PENDING",
        OR: [{ invitedById: userId }, { email: target.email }],
      },
      data: { status: "CANCELLED" },
    });
    await audit(tx, actorId, "organization.member.removed", "Organization", id);
    return { ok: true };
  });
}

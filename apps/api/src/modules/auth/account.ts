import { randomUUID } from "node:crypto";
import { rosterOf } from "../registrations/domain.js";
import type { z } from "zod";
import type { profileSchema } from "../../../../../packages/shared/src/auth.js";
import { db, transaction, requireCondition } from "../../database/client.js";
import { audit } from "../administration/audit.js";
import { selfUser } from "./repository.js";
import { hashPassword, verifyPassword } from "./password.js";
import { throttle } from "./throttle.js";
export const profile = (id: string) =>
  db.user.findUniqueOrThrow({ where: { id }, select: selfUser });
export async function updateProfile(id: string, data: z.infer<typeof profileSchema>) {
  await throttle("profile-update", id, 30, 3600000);
  return transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id } });
    requireCondition(user.status === "ACTIVE", "Account is not active.", 403);
    const updated = await tx.user.update({ where: { id }, data, select: selfUser });
    await audit(tx, id, "identity.profile.updated", "User", id);
    return updated;
  });
}
export const sessions = (userId: string, current: string) =>
  db.session
    .findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    })
    .then((rows) => rows.map((s) => ({ ...s, current: s.id === current })));
export async function revokeSession(userId: string, id: string) {
  await transaction(async (tx) => {
    const result = await tx.session.deleteMany({ where: { userId, id } });
    if (result.count) await audit(tx, userId, "identity.session.revoked", "User", userId);
  });
  return { ok: true };
}
export async function revokeOthers(userId: string, currentHash: string) {
  await db.session.deleteMany({ where: { userId, tokenHash: { not: currentHash } } });
  await audit(db, userId, "identity.sessions.revoked", "User", userId);
  return { ok: true };
}
export async function reauthenticate(userId: string, sessionHash: string, password: string) {
  await throttle("reauth", userId);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  requireCondition(
    await verifyPassword(password, user.passwordHash),
    "Unable to verify your credentials.",
    401,
  );
  await db.session.updateMany({
    where: { userId, tokenHash: sessionHash, expiresAt: { gt: new Date() } },
    data: { authenticatedAt: new Date() },
  });
  return { ok: true };
}
export async function changePassword(userId: string, password: string, currentPassword?: string) {
  await throttle("password-change", userId);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  requireCondition(
    !user.passwordHash ||
      (currentPassword && (await verifyPassword(currentPassword, user.passwordHash))),
    "Unable to verify your credentials.",
    401,
  );
  const passwordHash = await hashPassword(password);
  await transaction(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    requireCondition(
      fresh.passwordHash === user.passwordHash && fresh.status === "ACTIVE",
      "Account changed. Please sign in again.",
      409,
    );
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.identityToken.deleteMany({ where: { userId } });
    await tx.oAuthFlow.deleteMany({ where: { userId } });
    await audit(tx, userId, "identity.password.changed", "User", userId);
  });
  return { ok: true };
}
export async function deactivate(userId: string, deletion = false) {
  await transaction(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    requireCondition(current.status === "ACTIVE", "Account is not active.", 409);
    if (current.platformRole === "ADMIN")
      requireCondition(
        (await tx.user.count({ where: { platformRole: "ADMIN", status: "ACTIVE" } })) > 1,
        "The last administrator cannot deactivate or delete their account.",
      );
    await tx.session.deleteMany({ where: { userId } });
    await tx.identityToken.deleteMany({ where: { userId } });
    await tx.oAuthFlow.deleteMany({ where: { userId } });
    await tx.organizationInvitation.updateMany({
      where: { OR: [{ invitedById: userId }, { email: current.email }], status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await tx.teamInvitation.updateMany({
      where: { OR: [{ userId }, { invitedById: userId }], status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await tx.team.updateMany({
      where: { OR: [{ captainId: userId }, { transferToId: userId }] },
      data: { transferToId: null, transferExpiresAt: null },
    });
    if (deletion) {
      await tx.staffFactor.deleteMany({ where: { userId } });
      await tx.organizationInvitation.updateMany({
        where: { email: current.email },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          label: "Deleted account",
          status: "CANCELLED",
        },
      });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      await tx.team.updateMany({
        where: { individualUserId: userId },
        data: { name: "Deleted player", region: "" },
      });
      const id = randomUUID().replaceAll("-", "");
      const entries = await tx.tournamentRegistration.findMany({
        where: { roster: { array_contains: [{ id: userId }] } },
      });
      for (const entry of entries)
        await tx.tournamentRegistration.update({
          where: { id: entry.id },
          data: {
            roster: rosterOf(entry.roster).map((p) =>
              p.id === userId ? { ...p, username: "deleted_player" } : p,
            ),
          },
        });
      await tx.tournamentRegistration.updateMany({
        where: { proposedRoster: { array_contains: [{ id: userId }] } },
        data: {
          proposedRoster: (await import("@prisma/client")).Prisma.DbNull,
          rosterProposedBy: null,
        },
      });
      await tx.oAuthAccount.deleteMany({ where: { userId } });
      await tx.organizationMember.deleteMany({ where: { userId } });
      await tx.tournamentPermission.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: "DELETED",
          username: `deleted_${id.slice(0, 16)}`,
          email: `deleted-${id}@deleted.invalid`,
          passwordHash: null,
          displayName: "Deleted player",
          bio: "",
          region: "",
          gamesPlayed: [],
          socialLinks: [],
          profilePublic: false,
          showHistory: false,
          showTeams: false,
          avatarId: null,
          emailVerifiedAt: null,
          platformRole: "NONE",
          roles: [],
        },
      });
      await tx.accountDeletion.upsert({
        where: { userId },
        create: { userId, resolvedAt: new Date(), resolution: "ANONYMIZED" },
        update: { requestedAt: new Date(), resolvedAt: new Date(), resolution: "ANONYMIZED" },
      });
    } else await tx.user.update({ where: { id: userId }, data: { status: "DEACTIVATED" } });
    await audit(tx, userId, deletion ? "identity.deleted" : "identity.deactivated", "User", userId);
  });
  return { ok: true };
}

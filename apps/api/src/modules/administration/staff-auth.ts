import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import type { RequestHandler } from "express";
import { db, transaction, requireCondition, type Tx } from "../../database/client.js";
import { env } from "../../config/env.js";
import { digest } from "../auth/tokens.js";
import { throttle } from "../auth/throttle.js";
import { audit } from "./audit.js";
export const staffTTL = 15 * 60000;
function key() {
  requireCondition(env.STAFF_MFA_KEY, "Staff authentication is not configured.", 503);
  return Buffer.from(env.STAFF_MFA_KEY, "hex");
}
function encrypt(value: string, user: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`staff-factor:${user}`));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64");
}
function decrypt(value: string, user: string) {
  const data = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  cipher.setAAD(Buffer.from(`staff-factor:${user}`));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8");
}
export async function staffIdentity(tx: Tx, actor: string, admin = false) {
  const u = await tx.user.findUnique({ where: { id: actor } });
  requireCondition(
    u?.status === "ACTIVE" &&
      u.emailVerifiedAt &&
      (u.platformRole === "ADMIN" || (!admin && u.platformRole === "MODERATOR")),
    "Platform access required.",
    403,
  );
  return u;
}
export async function staffAccess(
  tx: Tx,
  actor: string,
  sessionId: string,
  admin = false,
  sensitive = false,
) {
  const u = await staffIdentity(tx, actor, admin);
  const session = await tx.session.findFirst({
    where: {
      id: sessionId,
      userId: actor,
      expiresAt: { gt: new Date() },
      staffVerifiedAt: { gt: new Date(Date.now() - staffTTL) },
    },
  });
  const factor = await tx.staffFactor.findUnique({ where: { userId: actor } });
  requireCondition(
    env.STAFF_MFA_KEY && factor?.enabledAt && session,
    "Verify your staff authenticator before continuing.",
    403,
  );
  if (sensitive)
    requireCondition(
      session.authenticatedAt && session.authenticatedAt > new Date(Date.now() - 5 * 60000),
      "Please reauthenticate before this action.",
      403,
    );
  return u;
}
export const staffGate: RequestHandler = async (req, _res, next) => {
  requireCondition(req.account && req.sessionId, "Please log in to continue.", 401);
  await staffAccess(db, req.account.id, req.sessionId);
  next();
};
export async function factorStatus(actor: string, sessionId: string) {
  await staffIdentity(db, actor);
  const factor = await db.staffFactor.findUnique({ where: { userId: actor } }),
    session = await db.session.findUnique({ where: { id: sessionId } });
  return {
    configured: Boolean(env.STAFF_MFA_KEY),
    enrolled: Boolean(factor?.enabledAt),
    verified: Boolean(
      factor?.enabledAt &&
      session?.staffVerifiedAt &&
      session.staffVerifiedAt > new Date(Date.now() - staffTTL),
    ),
  };
}
export async function enroll(actor: string) {
  await throttle("staff-enroll", actor, 5, 3600000);
  return transaction(async (tx) => {
    const u = await staffIdentity(tx, actor),
      existing = await tx.staffFactor.findUnique({ where: { userId: actor } });
    requireCondition(!existing?.enabledAt, "An authenticator is already enrolled.", 409);
    const secret = new Secret({ size: 20 }),
      encryptedSecret = encrypt(secret.base32, actor);
    await tx.staffFactor.upsert({
      where: { userId: actor },
      create: { userId: actor, encryptedSecret, expiresAt: new Date(Date.now() + 10 * 60000) },
      update: {
        encryptedSecret,
        expiresAt: new Date(Date.now() + 10 * 60000),
        lastCounter: -1,
        recoveryHashes: [],
      },
    });
    await audit(tx, actor, "staff.enrollment.started", "User", actor);
    return {
      secret: secret.base32,
      uri: new TOTP({ issuer: "MatchFlow Staff", label: u.username, secret }).toString(),
    };
  });
}
export async function verifyFactor(
  actor: string,
  sessionId: string,
  otp: string,
  activate = false,
) {
  await throttle("staff-factor", actor, 5, 5 * 60000);
  try {
    return await transaction(async (tx) => {
      await staffIdentity(tx, actor);
      const s = await tx.session.findFirst({
        where: { id: sessionId, userId: actor, expiresAt: { gt: new Date() } },
      });
      requireCondition(s, "Please sign in again.", 401);
      const factor = await tx.staffFactor.findUnique({ where: { userId: actor } });
      requireCondition(
        factor &&
          (activate ? !factor.enabledAt && factor.expiresAt > new Date() : factor.enabledAt),
        "Unable to verify authenticator.",
        403,
      );
      if (activate)
        requireCondition(
          s.authenticatedAt && s.authenticatedAt > new Date(Date.now() - 5 * 60000),
          "Please reauthenticate before enrollment.",
          403,
        );
      const recovery = !activate && factor.recoveryHashes.includes(digest(otp));
      const now = Date.now(),
        delta = /^\d{6}$/.test(otp)
          ? new TOTP({ secret: decrypt(factor.encryptedSecret, actor) }).validate({
              token: otp,
              window: 1,
              timestamp: now,
            })
          : null;
      const counter = delta === null ? null : BigInt(Math.floor(now / 30000) + delta);
      requireCondition(
        recovery || (counter !== null && counter > factor.lastCounter),
        "Unable to verify authenticator.",
        403,
      );
      const recoveryCodes = activate
        ? Array.from({ length: 10 }, () => randomBytes(16).toString("hex"))
        : undefined;
      await tx.staffFactor.update({
        where: { userId: actor },
        data: {
          enabledAt: factor.enabledAt || new Date(),
          ...(counter !== null && !recovery ? { lastCounter: counter } : {}),
          recoveryHashes: recoveryCodes
            ? recoveryCodes.map(digest)
            : factor.recoveryHashes.filter((h) => h !== digest(otp)),
        },
      });
      await tx.session.update({ where: { id: sessionId }, data: { staffVerifiedAt: new Date() } });
      await audit(
        tx,
        actor,
        recovery ? "staff.recovery.used" : activate ? "staff.enrolled" : "staff.verified",
        "User",
        actor,
      );
      return { ok: true, recoveryCodes };
    });
  } catch (e) {
    await audit(db, actor, "staff.verification.failed", "User", actor);
    throw e;
  }
}

export async function resetFactor(actor: string, sessionId: string, otp: string) {
  await verifyFactor(actor, sessionId, otp);
  return transaction(async (tx) => {
    await staffAccess(tx, actor, sessionId, false, true);
    await tx.staffFactor.delete({ where: { userId: actor } });
    await tx.session.deleteMany({ where: { userId: actor, id: { not: sessionId } } });
    await tx.session.update({ where: { id: sessionId }, data: { staffVerifiedAt: null } });
    await audit(tx, actor, "staff.factor.reset", "User", actor);
    return { ok: true };
  });
}

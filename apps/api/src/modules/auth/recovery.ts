import { randomBytes } from "node:crypto";
import type { IdentityPurpose } from "@prisma/client";
import { db, transaction, requireCondition, ApiError } from "../../database/client.js";
import { env } from "../../config/env.js";
import { logger } from "../../http/logger.js";
import { audit } from "../administration/audit.js";
import type { MailDelivery } from "./mail.js";
import { hashPassword } from "./password.js";
import { digest } from "./tokens.js";
import { throttle } from "./throttle.js";
export const genericRecovery = {
  message: "If the account is eligible, recovery instructions will be sent.",
};
export async function requestLink(email: string, purpose: IdentityPurpose, mail: MailDelivery) {
  if (!mail.available)
    throw new ApiError(503, "Email delivery is not configured. Please try again later.");
  await throttle(purpose, email, 5, 3600000);
  const started = Date.now();
  const user = await db.user.findUnique({ where: { email } });
  const eligible =
    user &&
    (purpose === "REACTIVATE" ? user.status === "DEACTIVATED" : user.status === "ACTIVE") &&
    !(purpose === "VERIFY_EMAIL" && user.emailVerifiedAt);
  if (eligible) {
    const token = randomBytes(32).toString("hex");
    await transaction(async (tx) => {
      await tx.identityToken.deleteMany({ where: { userId: user.id, purpose } });
      await tx.identityToken.create({
        data: {
          userId: user.id,
          purpose,
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + (purpose === "VERIFY_EMAIL" ? 86400000 : 1800000)),
        },
      });
      await audit(tx, user.id, `identity.${purpose.toLowerCase()}.requested`, "User", user.id);
    });
    const page =
      purpose === "RESET_PASSWORD"
        ? "reset-password"
        : purpose === "VERIFY_EMAIL"
          ? "verify-email"
          : "reactivate";
    // Tokens live in fragments, never HTTP query logs or referrers. No secret is logged.
    void mail
      .send({
        to: user.email,
        subject: "MatchFlow account security",
        text: `Continue your MatchFlow request: ${env.APP_ORIGIN}/${page}#token=${token}\nIf you did not request this, ignore this message.`,
      })
      .catch(() =>
        logger.error({ event: "identity.email_delivery_failed" }, "Account email delivery failed"),
      );
  }
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 250 - (Date.now() - started))));
  return genericRecovery;
}
export async function consumeLink(token: string, purpose: IdentityPurpose, password?: string) {
  const passwordHash = password ? await hashPassword(password) : undefined;
  return transaction(async (tx) => {
    const record = await tx.identityToken.findUnique({
      where: { tokenHash: digest(token) },
      include: { user: true },
    });
    requireCondition(
      record && record.purpose === purpose && record.expiresAt > new Date(),
      "This link is invalid or expired.",
    );
    requireCondition(
      purpose === "REACTIVATE"
        ? record.user.status === "DEACTIVATED"
        : record.user.status === "ACTIVE",
      "This link is invalid or expired.",
    );
    const deleted = await tx.identityToken.deleteMany({
      where: { tokenHash: record.tokenHash, expiresAt: { gt: new Date() } },
    });
    requireCondition(deleted.count === 1, "This link is invalid or expired.");
    if (purpose === "RESET_PASSWORD") {
      requireCondition(passwordHash, "A new password is required.");
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, emailVerifiedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: record.userId } });
      await tx.identityToken.deleteMany({ where: { userId: record.userId } });
      await tx.oAuthFlow.deleteMany({ where: { userId: record.userId } });
    } else if (purpose === "VERIFY_EMAIL")
      await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    else await tx.user.update({ where: { id: record.userId }, data: { status: "ACTIVE" } });
    await audit(
      tx,
      record.userId,
      `identity.${purpose.toLowerCase()}.completed`,
      "User",
      record.userId,
    );
    return { ok: true };
  });
}

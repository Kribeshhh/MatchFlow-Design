import type { PgBoss } from "pg-boss";
import { db, transaction, ApiError } from "../../database/client.js";
import { queueDatabase } from "../notifications/delivery.js";
import { mailDelivery, type MailDelivery } from "../auth/mail.js";
import { organizationAccess } from "./policy.js";
import { env } from "../../config/env.js";
export const INVITE_QUEUE = "organization-invitations";
export async function enqueueInvitations(boss: PgBoss) {
  const rows = await db.organizationInvitation.findMany({
    where: { status: "PENDING", emailState: "PENDING", expiresAt: { gt: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const row of rows)
    await transaction(async (tx) => {
      const changed = await tx.organizationInvitation.updateMany({
        where: { id: row.id, emailState: "PENDING", status: "PENDING" },
        data: { emailState: "QUEUED" },
      });
      if (changed.count)
        await boss.send(INVITE_QUEUE, { invitationId: row.id }, { db: queueDatabase(tx) });
    });
}
export async function deliverInvitation(id: string, mail: MailDelivery = mailDelivery) {
  const invite = await db.organizationInvitation.findUnique({
    where: { id },
    include: { organization: { select: { name: true } } },
  });
  if (!invite || ["SENT", "SKIPPED"].includes(invite.emailState)) return;
  let allowed = invite.status === "PENDING" && invite.expiresAt > new Date();
  if (allowed) {
    try {
      await organizationAccess(invite.organizationId, invite.invitedById, invite.role === "ADMIN");
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      allowed = false;
    }
  }
  if (!allowed) {
    await db.organizationInvitation.update({ where: { id }, data: { emailState: "SKIPPED" } });
    return;
  }
  if (!mail.available) throw Error("Invitation email unavailable");
  await mail.send({
    to: invite.email,
    subject: "MatchFlow organization invitation",
    text: `You have been invited to ${invite.organization.name} as ${invite.role === "MEMBER" ? "staff" : invite.role.toLowerCase()}.\n\nSign in or create an account using this email address, verify your email, then review and accept the invitation at ${env.APP_ORIGIN}/organizations\n\nExpires: ${invite.expiresAt.toISOString()}. If unexpected, ignore this invitation. No access is granted until you accept.`,
    messageId: `<matchflow-org-${invite.id}@${new URL(env.APP_ORIGIN).hostname}>`,
  });
  await db.organizationInvitation.update({ where: { id }, data: { emailState: "SENT" } });
}

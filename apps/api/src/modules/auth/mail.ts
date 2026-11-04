import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
export type MailMessage = { to: string; subject: string; text: string; messageId?: string };
export type MailDelivery = { available: boolean; send: (message: MailMessage) => Promise<void> };
const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: env.NODE_ENV === "production" && !env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 5000,
      socketTimeout: 10000,
    })
  : null;
const pending = new Set<Promise<unknown>>();
export async function drainMail() {
  await Promise.allSettled([...pending]);
  transport?.close();
}
export const mailDelivery: MailDelivery = {
  available: Boolean(transport && env.MAIL_FROM),
  async send(message) {
    if (!transport) throw new Error("Mail delivery unavailable");
    const delivery = transport.sendMail({ ...message, from: env.MAIL_FROM });
    pending.add(delivery);
    try {
      await delivery;
    } finally {
      pending.delete(delivery);
    }
  },
};

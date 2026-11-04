import { DOMAIN_QUEUE, enqueueDomains, reconcileDomain } from "../custom-domains/service.js";
import { WEBHOOK_QUEUE, enqueueWebhooks, deliverWebhook } from "../api-access/webhooks.js";
import {
  INVITE_QUEUE,
  enqueueInvitations,
  deliverInvitation,
} from "../organizations/invitation-mail.js";
import { PgBoss } from "pg-boss";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../database/client.js";
import { logger } from "../../http/logger.js";
import { mailDelivery, type MailDelivery } from "../auth/mail.js";
import {
  EVENT_QUEUE,
  MAIL_QUEUE,
  DEAD_QUEUE,
  processEvent,
  enqueuePending,
  deliverEmail,
  scheduleReminders,
} from "./delivery.js";
export function createJobQueue(schema = "matchflow_jobs") {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema, max: 4 });
  boss.on("error", () => logger.error("Notification queue error"));
  boss.on("warning", () => logger.warn("Notification queue warning"));
  return boss;
}
export async function startNotifications(
  options: {
    mail?: MailDelivery;
    schema?: string;
    retryDelay?: number;
    retryLimit?: number;
    intervalMs?: number;
    webhookTransport?: typeof import("../api-access/webhook-transport.js").postWebhook;
  } = {},
) {
  const mail = options.mail || mailDelivery,
    boss = createJobQueue(options.schema);
  await boss.start();
  await boss.createQueue(DEAD_QUEUE, {
    retentionSeconds: 30 * 86400,
    deleteAfterSeconds: 30 * 86400,
  });
  for (const name of [EVENT_QUEUE, MAIL_QUEUE, INVITE_QUEUE, WEBHOOK_QUEUE, DOMAIN_QUEUE])
    await boss.createQueue(name, {
      retryLimit: options.retryLimit ?? 5,
      retryDelay: options.retryDelay ?? 30,
      retryBackoff: true,
      expireInSeconds: 60,
      deadLetter: DEAD_QUEUE,
      retentionSeconds: 7 * 86400,
      deleteAfterSeconds: 7 * 86400,
    });
  await boss.work<
    { eventId: string },
    unknown,
    {
      includeMetadata: true;
      pollingIntervalSeconds: number;
      batchSize: number;
      burstWhenBatchFull: boolean;
    }
  >(
    EVENT_QUEUE,
    { includeMetadata: true, pollingIntervalSeconds: 1, batchSize: 10, burstWhenBatchFull: true },
    async (jobs) => {
      for (const job of jobs) {
        try {
          await processEvent(z.object({ eventId: z.string() }).parse(job.data).eventId);
        } catch {
          if (job.retryCount >= job.retryLimit)
            await db.notificationEvent.updateMany({
              where: { id: job.data.eventId },
              data: { failedAt: new Date() },
            });
          throw Error("Notification event processing failed");
        }
      }
    },
  );
  if (mail.available)
    await boss.work<
      { notificationId: string },
      unknown,
      { includeMetadata: true; pollingIntervalSeconds: number }
    >(MAIL_QUEUE, { includeMetadata: true, pollingIntervalSeconds: 1 }, async (jobs) => {
      for (const job of jobs) {
        try {
          await deliverEmail(
            z.object({ notificationId: z.string() }).parse(job.data).notificationId,
            mail,
          );
        } catch {
          await db.notification.updateMany({
            where: { id: job.data.notificationId, emailState: { not: "SENT" } },
            data: { emailState: job.retryCount >= job.retryLimit ? "DEAD" : "RETRY" },
          });
          throw Error("Notification delivery failed");
        }
      }
    });
  if (mail.available)
    await boss.work<
      { invitationId: string },
      unknown,
      { includeMetadata: true; pollingIntervalSeconds: number }
    >(INVITE_QUEUE, { includeMetadata: true, pollingIntervalSeconds: 1 }, async (jobs) => {
      for (const job of jobs) {
        try {
          await deliverInvitation(
            z.object({ invitationId: z.string() }).parse(job.data).invitationId,
            mail,
          );
        } catch {
          await db.organizationInvitation.updateMany({
            where: { id: job.data.invitationId, emailState: { not: "SENT" } },
            data: { emailState: job.retryCount >= job.retryLimit ? "DEAD" : "RETRY" },
          });
          throw Error("Invitation delivery failed");
        }
      }
    });
  await boss.work<
    { deliveryId: string },
    unknown,
    { includeMetadata: true; pollingIntervalSeconds: number }
  >(WEBHOOK_QUEUE, { includeMetadata: true, pollingIntervalSeconds: 1 }, async (jobs) => {
    for (const job of jobs) {
      try {
        await deliverWebhook(
          z.object({ deliveryId: z.string() }).parse(job.data).deliveryId,
          options.webhookTransport,
        );
      } catch {
        await db.webhookDelivery.updateMany({
          where: { id: job.data.deliveryId, status: { notIn: ["SENT", "SKIPPED"] } },
          data: { status: job.retryCount >= job.retryLimit ? "DEAD" : "RETRY" },
        });
        throw Error("Webhook delivery failed");
      }
    }
  });
  await boss.work<{ domainId: string }>(
    DOMAIN_QUEUE,
    { pollingIntervalSeconds: 1 },
    async (jobs) => {
      for (const job of jobs)
        await reconcileDomain(z.object({ domainId: z.string().cuid() }).parse(job.data).domainId);
    },
  );
  let running = false,
    stopped = false;
  let reminderScan = 0;
  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      if (Date.now() - reminderScan >= 30000) {
        await scheduleReminders();
        reminderScan = Date.now();
      }
      await enqueuePending(boss, mail.available);
      await enqueueWebhooks(boss);
      await enqueueDomains(boss);
      if (mail.available) await enqueueInvitations(boss);
    } catch {
      logger.warn("Notification dispatch will retry");
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void tick(), options.intervalMs ?? 2000);
  timer.unref();
  void tick();
  return {
    boss,
    tick,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 20));
      await boss.stop({ graceful: true, timeout: 12000 });
    },
  };
}

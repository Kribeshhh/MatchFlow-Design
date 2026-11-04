import { DOMAIN_QUEUE } from "../apps/api/src/modules/custom-domains/service.js";
import { WEBHOOK_QUEUE } from "../apps/api/src/modules/api-access/webhooks.js";
import { INVITE_QUEUE } from "../apps/api/src/modules/organizations/invitation-mail.js";
import { z } from "zod";
import { createJobQueue } from "../apps/api/src/modules/notifications/worker.js";
import {
  DEAD_QUEUE,
  EVENT_QUEUE,
  MAIL_QUEUE,
} from "../apps/api/src/modules/notifications/delivery.js";
import { db } from "../apps/api/src/database/client.js";
const boss = createJobQueue();
try {
  await boss.start();
  const action = process.argv[2] || "status";
  if (action === "retry") {
    const id = z.string().uuid().parse(process.argv[3]);
    console.log(
      JSON.stringify({ redriven: await boss.redrive(DEAD_QUEUE, { ids: [id], limit: 1 }) }),
    );
  } else if (action === "status") {
    for (const name of [
      EVENT_QUEUE,
      MAIL_QUEUE,
      INVITE_QUEUE,
      WEBHOOK_QUEUE,
      DOMAIN_QUEUE,
      DEAD_QUEUE,
    ]) {
      const queue = await boss.getQueue(name);
      console.log(
        JSON.stringify({
          queue: name,
          exists: Boolean(queue),
          stats: queue ? await boss.getQueueStats(name) : [],
        }),
      );
    }
    const dead = await boss.findJobs(DEAD_QUEUE, { limit: 50 });
    console.log(
      JSON.stringify({
        deadLetters: dead.map((job) => ({
          id: job.id,
          source: job.sourceName,
          createdAt: job.createdOn,
        })),
      }),
    );
    console.log(
      JSON.stringify({
        unprocessed: await db.notificationEvent.count({ where: { processedAt: null } }),
        webhookStates: await db.webhookDelivery.groupBy({ by: ["status"], _count: true }),
        emailStates: await db.notification.groupBy({ by: ["emailState"], _count: true }),
      }),
    );
  } else throw Error("Use status or retry <dead-letter-job-uuid>");
} finally {
  await boss.stop();
  await db.$disconnect();
}

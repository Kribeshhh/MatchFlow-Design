import { replayCreationEvents } from "./webhook-initial.js";
import { randomBytes } from "node:crypto";
import type { PgBoss } from "pg-boss";
import { Webhook } from "standardwebhooks";
import { db, transaction, requireCondition } from "../../database/client.js";
import { managed } from "./management.js";
import { newSigningSecret, sealSecret, openSecret, webhookAvailable } from "./webhook-secrets.js";
import { resolveDestination, postWebhook } from "./webhook-transport.js";
import { queueDatabase } from "../notifications/delivery.js";
import { audit } from "../administration/audit.js";
export const WEBHOOK_QUEUE = "developer-webhooks";
export async function createWebhook(
  org: string,
  appId: string,
  actor: string,
  input: { url: string; events: string[] },
) {
  await managed(db, org, appId, actor);
  requireCondition(webhookAvailable(), "Webhook signing is not configured.", 503);
  await resolveDestination(input.url);
  return transaction(async (tx) => {
    const app = await managed(tx, org, appId, actor);
    requireCondition(
      !app.disabledAt && app.scopes.includes("tournaments:read"),
      "Enable tournament read access before configuring webhooks.",
    );
    requireCondition(
      (await tx.webhookEndpoint.count({ where: { integrationId: appId } })) < 10,
      "Webhook endpoint limit reached.",
    );
    const id = `c${randomBytes(12).toString("hex")}`,
      secret = newSigningSecret();
    await tx.webhookEndpoint.create({
      data: {
        id,
        integrationId: appId,
        url: input.url,
        events: [...new Set(input.events)],
        encryptedSecret: sealSecret(secret, id),
      },
    });
    const grants = await tx.integrationTournament.findMany({
      where: { integrationId: appId },
      select: { tournamentId: true },
    });
    await replayCreationEvents(
      tx,
      appId,
      grants.map((g) => g.tournamentId),
    );
    await audit(tx, actor, "webhook.created", "Integration", appId);
    return { id, secret };
  });
}
export async function enqueueWebhooks(boss: PgBoss) {
  if (!webhookAvailable()) return;
  const events = await db.webhookEvent.findMany({
    where: { dispatchedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  for (const event of events)
    await transaction(async (tx) => {
      const claim = await tx.webhookEvent.updateMany({
        where: { id: event.id, dispatchedAt: null },
        data: { dispatchedAt: new Date() },
      });
      if (!claim.count) return;
      const t = await tx.tournament.findUniqueOrThrow({ where: { id: event.tournamentId } });
      const endpoints = await tx.webhookEndpoint.findMany({
        where: {
          disabledAt: null,
          createdAt: { lte: event.createdAt },
          events: { has: event.type },
          integration: {
            disabledAt: null,
            organizationId: t.organizationId || "",
            scopes: { has: "tournaments:read" },
            tournaments: { some: { tournamentId: t.id } },
          },
        },
        select: { id: true },
      });
      await tx.webhookDelivery.createMany({
        data: endpoints.map((e) => ({ endpointId: e.id, eventId: event.id })),
        skipDuplicates: true,
      });
    });
  const pending = await db.webhookDelivery.findMany({
    where: { queuedAt: null, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const d of pending)
    await transaction(async (tx) => {
      const claim = await tx.webhookDelivery.updateMany({
        where: { id: d.id, queuedAt: null, status: "PENDING" },
        data: { queuedAt: new Date() },
      });
      if (claim.count)
        await boss.send(WEBHOOK_QUEUE, { deliveryId: d.id }, { db: queueDatabase(tx) });
    });
}
export async function deliverWebhook(id: string, transport = postWebhook) {
  const d = await db.webhookDelivery.findUnique({
    where: { id },
    include: {
      event: { include: { tournament: { select: { organizationId: true } } } },
      endpoint: { include: { integration: { include: { tournaments: true } } } },
    },
  });
  if (!d || ["SENT", "SKIPPED", "DEAD"].includes(d.status)) return;
  const { endpoint: e, event } = d,
    app = e.integration;
  if (
    e.disabledAt ||
    app.disabledAt ||
    app.organizationId !== event.tournament.organizationId ||
    !app.scopes.includes("tournaments:read") ||
    !e.events.includes(event.type) ||
    !app.tournaments.some((t) => t.tournamentId === event.tournamentId)
  ) {
    await db.webhookDelivery.update({ where: { id }, data: { status: "SKIPPED" } });
    return;
  }
  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    tournamentId: event.tournamentId,
    resourceId: event.resourceId,
    timestamp: event.createdAt.toISOString(),
    version: event.version.toString(),
  });
  const now = new Date();
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": Math.floor(now.getTime() / 1000).toString(),
    "webhook-signature": new Webhook(openSecret(e.encryptedSecret, e.id)).sign(id, now, body),
  };
  await db.webhookDelivery.update({ where: { id }, data: { attempts: { increment: 1 } } });
  const status = await transport(e.url, body, headers);
  await db.webhookDelivery.update({
    where: { id },
    data: {
      responseStatus: status,
      ...(status >= 200 && status < 300
        ? { status: "SENT", deliveredAt: new Date() }
        : { status: "RETRY" }),
    },
  });
  requireCondition(
    status >= 200 && status < 300,
    "Webhook destination did not accept delivery.",
    502,
  );
}

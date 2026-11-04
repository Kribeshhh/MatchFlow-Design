import { openapi } from "./openapi.js";
import { Router } from "express";
import { z } from "zod";
import { db, transaction, ApiError } from "../../database/client.js";
import { requireAuth } from "../auth/security.js";
import { recentAuth } from "../auth/policy.js";
import { throttle } from "../auth/throttle.js";
import { logger } from "../../http/logger.js";
import { audit } from "../administration/audit.js";
import {
  integrationSchema,
  credentialSchema,
  webhookSchema,
  apiPageSchema,
} from "../../../../../packages/shared/src/developer.js";
import {
  managed,
  listIntegrations,
  saveIntegration,
  issueCredential,
  revokeCredential,
} from "./management.js";
import { createWebhook } from "./webhooks.js";
import { webhookAvailable, newSigningSecret, sealSecret } from "./webhook-secrets.js";
import { credentialAccess } from "./policy.js";
import {
  listTournaments,
  readResource,
  readOrganization,
  publicOrganizations,
  paged,
} from "./resources.js";
import { executeCommand } from "./commands.js";
const id = (v: unknown) => z.string().cuid().parse(v);
export const managementRouter = Router();
const root = "/organizations/:orgId/integrations";
managementRouter.use(root, requireAuth);
managementRouter.get(root, async (req, res) =>
  res.json({
    integrations: await listIntegrations(id(req.params.orgId), req.account!.id),
    webhooksAvailable: webhookAvailable(),
  }),
);
managementRouter.post(root, recentAuth, async (req, res) => {
  await throttle("integration-manage", req.account!.id, 30, 60000);
  res
    .status(201)
    .json(
      await saveIntegration(
        id(req.params.orgId),
        req.account!.id,
        integrationSchema.parse(req.body),
      ),
    );
});
managementRouter.put(`${root}/:id`, recentAuth, async (req, res) =>
  res.json(
    await saveIntegration(
      id(req.params.orgId),
      req.account!.id,
      integrationSchema.parse(req.body),
      id(req.params.id),
    ),
  ),
);
managementRouter.delete(`${root}/:id`, recentAuth, async (req, res) =>
  res.json(
    await transaction(async (tx) => {
      const app = await managed(tx, id(req.params.orgId), id(req.params.id), req.account!.id);
      await tx.integration.update({ where: { id: app.id }, data: { disabledAt: new Date() } });
      await tx.apiCredential.updateMany({
        where: { integrationId: app.id },
        data: { revokedAt: new Date() },
      });
      await audit(tx, req.account!.id, "integration.disabled", "Integration", app.id);
      return { ok: true };
    }),
  ),
);
managementRouter.post(`${root}/:id/credentials`, recentAuth, async (req, res) => {
  await throttle("credential-create", req.account!.id, 20, 60000);
  const input = credentialSchema.parse(req.body);
  res
    .status(201)
    .json(
      await issueCredential(
        id(req.params.orgId),
        id(req.params.id),
        req.account!.id,
        input.expiresInDays,
        input.rotateId,
      ),
    );
});
managementRouter.delete(`${root}/:id/credentials/:keyId`, recentAuth, async (req, res) =>
  res.json(
    await revokeCredential(
      id(req.params.orgId),
      id(req.params.id),
      id(req.params.keyId),
      req.account!.id,
    ),
  ),
);
managementRouter.post(`${root}/:id/webhooks`, recentAuth, async (req, res) => {
  await throttle("webhook-create", req.account!.id, 10, 60000);
  res
    .status(201)
    .json(
      await createWebhook(
        id(req.params.orgId),
        id(req.params.id),
        req.account!.id,
        webhookSchema.parse(req.body),
      ),
    );
});
managementRouter.post(`${root}/:id/webhooks/:hookId/rotate`, recentAuth, async (req, res) =>
  res.json(
    await transaction(async (tx) => {
      const app = await managed(tx, id(req.params.orgId), id(req.params.id), req.account!.id);
      const hook = await tx.webhookEndpoint.findFirst({
        where: { id: id(req.params.hookId), integrationId: app.id, disabledAt: null },
      });
      if (!hook) throw new ApiError(404, "Webhook not found.");
      const secret = newSigningSecret();
      await tx.webhookEndpoint.update({
        where: { id: hook.id },
        data: { encryptedSecret: sealSecret(secret, hook.id) },
      });
      await audit(tx, req.account!.id, "webhook.rotated", "Integration", app.id);
      return { secret };
    }),
  ),
);
managementRouter.delete(`${root}/:id/webhooks/:hookId`, recentAuth, async (req, res) =>
  res.json(
    await transaction(async (tx) => {
      const app = await managed(tx, id(req.params.orgId), id(req.params.id), req.account!.id);
      const result = await tx.webhookEndpoint.updateMany({
        where: { id: id(req.params.hookId), integrationId: app.id },
        data: { disabledAt: new Date() },
      });
      if (!result.count) throw new ApiError(404, "Webhook not found.");
      await audit(tx, req.account!.id, "webhook.disabled", "Integration", app.id);
      return { ok: true };
    }),
  ),
);
for (const kind of ["usage", "deliveries"] as const)
  managementRouter.get(`${root}/:id/${kind}`, async (req, res) => {
    await managed(db, id(req.params.orgId), id(req.params.id), req.account!.id);
    const p = apiPageSchema.parse(req.query),
      where = p.after ? { id: { gt: p.after } } : {};
    const args = { take: p.limit + 1, orderBy: { id: "asc" as const } };
    res.json(
      kind === "usage"
        ? paged(
            await db.apiRequest.findMany({
              ...args,
              where: { ...where, integrationId: id(req.params.id) },
              select: { id: true, requestId: true, operation: true, status: true, createdAt: true },
            }),
            p,
          )
        : paged(
            await db.webhookDelivery.findMany({
              ...args,
              where: { ...where, endpoint: { integrationId: id(req.params.id) } },
              select: {
                id: true,
                endpointId: true,
                eventId: true,
                status: true,
                attempts: true,
                responseStatus: true,
                deliveredAt: true,
                createdAt: true,
              },
            }),
            p,
          ),
    );
  });
managementRouter.post(`${root}/:id/deliveries/:deliveryId/retry`, recentAuth, async (req, res) =>
  res.json(
    await transaction(async (tx) => {
      const app = await managed(tx, id(req.params.orgId), id(req.params.id), req.account!.id);
      const updated = await tx.webhookDelivery.updateMany({
        where: {
          id: id(req.params.deliveryId),
          endpoint: { integrationId: app.id, disabledAt: null },
          status: "DEAD",
        },
        data: { status: "PENDING", queuedAt: null },
      });
      if (!updated.count)
        throw new ApiError(409, "Only failed deliveries to active endpoints can be retried.");
      await audit(tx, req.account!.id, "webhook.retried", "Integration", app.id);
      return { ok: true };
    }),
  ),
);
export const versionedRouter = Router();
versionedRouter.use(async (req, _res, next) => {
  await throttle("developer-ip", req.ip || "unknown", 300, 60000);
  next();
});
versionedRouter.get("/openapi.json", (_req, res) => res.json(openapi));
versionedRouter.get("/public/tournaments", async (req, res) =>
  res.json(await listTournaments(apiPageSchema.parse(req.query))),
);
versionedRouter.get("/public/organizations", async (req, res) =>
  res.json(await publicOrganizations(apiPageSchema.parse(req.query))),
);
for (const kind of [
  "detail",
  "matches",
  "bracket",
  "results",
  "schedule",
  "standings",
  "rounds",
  "teams",
  "announcements",
]) {
  const suffix = kind === "detail" ? "" : `/${kind}`;
  versionedRouter.get(`/public/tournaments/:id${suffix}`, async (req, res) =>
    res.json(await readResource(id(req.params.id), kind, apiPageSchema.parse(req.query))),
  );
}
versionedRouter.use(async (req, res, next) => {
  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const app = await credentialAccess(token);
  res.locals.apiToken = token;
  const accessLog = await db.apiRequest.create({
    data: {
      integrationId: app.id,
      requestId: req.requestId,
      operation: `${req.method} pending`,
      status: 102,
    },
  });
  res.on("finish", () => {
    void db.apiRequest
      .update({
        where: { id: accessLog.id },
        data: {
          operation: `${req.method} ${typeof req.route?.path === "string" ? req.route.path : "unmatched"}`,
          status: res.statusCode,
        },
      })
      .catch(() => logger.error("API access audit persistence failed"));
  });
  res.set("RateLimit-Limit", "120").set("RateLimit-Policy", "120;w=60");
  await throttle("developer-org", app.organizationId, 600, 60000);
  await throttle("developer-app", app.id, 120, 60000);
  next();
});
versionedRouter.get("/organization", async (_req, res) =>
  res.json(await readOrganization(res.locals.apiToken)),
);
versionedRouter.get("/tournaments", async (req, res) =>
  res.json(await listTournaments(apiPageSchema.parse(req.query), res.locals.apiToken)),
);
for (const kind of [
  "detail",
  "matches",
  "bracket",
  "results",
  "schedule",
  "standings",
  "rounds",
  "teams",
  "registrations",
  "announcements",
]) {
  const suffix = kind === "detail" ? "" : `/${kind}`;
  versionedRouter.get(`/tournaments/:id${suffix}`, async (req, res) =>
    res.json(
      await readResource(
        id(req.params.id),
        kind,
        apiPageSchema.parse(req.query),
        res.locals.apiToken,
      ),
    ),
  );
}
const key = (value: unknown) =>
  z
    .string()
    .regex(/^[a-zA-Z0-9_-]{8,100}$/)
    .parse(value);
versionedRouter.post("/tournaments/:id/announcements", async (req, res) =>
  res
    .status(201)
    .json(
      await executeCommand(
        res.locals.apiToken,
        id(req.params.id),
        key(req.get("Idempotency-Key")),
        "announcement",
        req.body,
      ),
    ),
);
versionedRouter.put("/tournaments/:id/matches/:matchId/schedule", async (req, res) =>
  res.json(
    await executeCommand(
      res.locals.apiToken,
      id(req.params.id),
      key(req.get("Idempotency-Key")),
      "schedule",
      req.body,
      id(req.params.matchId),
    ),
  ),
);
versionedRouter.put("/tournaments/:id/rounds/:roundId/schedule", async (req, res) =>
  res.json(
    await executeCommand(
      res.locals.apiToken,
      id(req.params.id),
      key(req.get("Idempotency-Key")),
      "round-schedule",
      req.body,
      id(req.params.roundId),
    ),
  ),
);
versionedRouter.use(() => {
  throw new ApiError(404, "API route not found.");
});

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
import { env } from "../../apps/api/src/config/env.js";
import {
  saveIntegration,
  issueCredential,
} from "../../apps/api/src/modules/api-access/management.js";
import {
  deliverWebhook,
  enqueueWebhooks,
  WEBHOOK_QUEUE,
} from "../../apps/api/src/modules/api-access/webhooks.js";
import {
  sealSecret,
  newSigningSecret,
} from "../../apps/api/src/modules/api-access/webhook-secrets.js";
import { createJobQueue } from "../../apps/api/src/modules/notifications/worker.js";
import { Webhook } from "standardwebhooks";
import { digest } from "../../apps/api/src/modules/auth/tokens.js";
async function user() {
  const tag = randomBytes(5).toString("hex"),
    u = await db.user.create({
      data: {
        username: `dev_${tag}`,
        email: `dev_${tag}@test.invalid`,
        role: "ORGANIZER",
        emailVerifiedAt: new Date(),
      },
    }),
    token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      userId: u.id,
      expiresAt: new Date(Date.now() + 3600000),
      authenticatedAt: new Date(),
    },
  });
  return { ...u, cookie: `matchflow_session=${token}` };
}
async function fixture() {
  const owner = await user(),
    org = await db.organization.create({ data: { name: "API organization", ownerId: owner.id } });
  const event = await db.tournament.create({
    data: {
      name: "Private API cup",
      description: "Private description",
      rules: "Confirmed rules",
      game: "valorant",
      teamSize: 1,
      maxTeams: 8,
      organizerId: owner.id,
      organizationId: org.id,
      visibility: "PRIVATE",
      opensAt: new Date(Date.now() - 3600000),
      closesAt: new Date(Date.now() + 3600000),
      startsAt: new Date(Date.now() + 7200000),
    },
  });
  const app = await saveIntegration(org.id, owner.id, {
    name: "Backend integration",
    scopes: [
      "tournaments:read",
      "matches:read",
      "registrations:read",
      "announcements:write",
      "schedules:write",
    ],
    tournamentIds: [event.id],
  });
  const key = await issueCredential(org.id, app.id, owner.id, 90);
  return { owner, org, event, integration: app, key };
}
const get = (path: string, secret?: string) =>
  request(app)
    .get(`/api/v1${path}`)
    .set("Authorization", secret ? `Bearer ${secret}` : "");
const manage = (
  cookie: string,
  path: string,
  body: object = {},
  method: "post" | "put" | "delete" = "post",
) => {
  const client = request(app);
  return client[method](`/api${path}`)
    .set("Cookie", cookie)
    .set("Origin", "http://localhost:5173")
    .set("X-MatchFlow", "1")
    .send(body);
};
after(() => db.$disconnect());
test("developer credentials are hashed, expire, rotate and revoke without cookie authority", async () => {
  const f = await fixture(),
    path = `/tournaments/${f.event.id}`;
  assert.equal((await get(path, f.key.secret)).status, 200);
  assert.equal((await get(path)).status, 401);
  assert.equal((await get(path, "mf_live_" + "0".repeat(64))).status, 401);
  assert.equal(
    (await request(app).get(`/api/v1${path}`).set("Cookie", f.owner.cookie)).status,
    401,
  );
  const record = await db.apiCredential.findUniqueOrThrow({ where: { id: f.key.id } });
  assert.equal(record.tokenHash, digest(f.key.secret));
  assert.ok(!JSON.stringify(record).includes(f.key.secret));
  const meta = await request(app)
    .get(`/api/organizations/${f.org.id}/integrations`)
    .set("Cookie", f.owner.cookie);
  assert.equal(meta.status, 200);
  assert.ok(!JSON.stringify(meta.body).includes(f.key.secret));
  assert.ok(!JSON.stringify(meta.body).includes(record.tokenHash));
  await db.apiCredential.update({ where: { id: f.key.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await get(path, f.key.secret)).status, 401);
  const rotated = await issueCredential(f.org.id, f.integration.id, f.owner.id, 1, f.key.id);
  assert.equal((await get(path, rotated.secret)).status, 200);
  await manage(
    f.owner.cookie,
    `/organizations/${f.org.id}/integrations/${f.integration.id}/credentials/${rotated.id}`,
    {},
    "delete",
  ).expect(200);
  assert.equal((await get(path, rotated.secret)).status, 401);
});
test("developer organization/resource scopes and public projections block cross-tenant and private leaks", async () => {
  const a = await fixture(),
    b = await fixture();
  assert.equal((await get(`/tournaments/${b.event.id}`, a.key.secret)).status, 404);
  assert.equal((await get(`/public/tournaments/${a.event.id}`, a.key.secret)).status, 404);
  const list = await get("/tournaments", a.key.secret);
  assert.deepEqual(
    list.body.data.map((t: { id: string }) => t.id),
    [a.event.id],
  );
  assert.ok(!JSON.stringify(list.body).includes("shareTokenHash"));
  await saveIntegration(
    a.org.id,
    a.owner.id,
    { name: "Restricted", scopes: ["matches:read"], tournamentIds: [a.event.id] },
    a.integration.id,
  );
  assert.equal((await get(`/tournaments/${a.event.id}`, a.key.secret)).status, 403);
  assert.equal((await get(`/tournaments/${a.event.id}/matches`, a.key.secret)).status, 200);
  assert.equal((await get(`/tournaments/${a.event.id}/registrations`, a.key.secret)).status, 403);
  await saveIntegration(
    a.org.id,
    a.owner.id,
    { name: "No grants", scopes: ["matches:read"], tournamentIds: [] },
    a.integration.id,
  );
  assert.equal((await get(`/tournaments/${a.event.id}/matches`, a.key.secret)).status, 404);
  assert.equal(
    (
      await request(app)
        .get(`/api/organizations/${a.org.id}/integrations`)
        .set("Cookie", b.owner.cookie)
    ).status,
    404,
  );
  assert.equal(
    (
      await manage(
        b.owner.cookie,
        `/organizations/${a.org.id}/integrations/${a.integration.id}/credentials`,
      )
    ).status,
    404,
  );
  assert.equal((await get("/tournaments?limit=51", b.key.secret)).status, 400);
  assert.equal((await get("/tournaments?include=users", b.key.secret)).status, 400);
  const publicEvent = await db.tournament.update({
    where: { id: a.event.id },
    data: { visibility: "PUBLIC" },
  });
  const cors = await request(app)
    .get(`/api/v1/public/tournaments/${publicEvent.id}`)
    .set("Origin", "https://example.org");
  assert.equal(cors.status, 200);
  assert.equal(cors.headers["access-control-allow-origin"], "*");
  assert.equal(cors.headers["access-control-allow-credentials"], undefined);
});
test("integration management requires current owner/admin, recent auth and CSRF", async () => {
  const f = await fixture(),
    staff = await user();
  await db.organizationMember.create({
    data: { organizationId: f.org.id, userId: staff.id, role: "MANAGER" },
  });
  const root = `/organizations/${f.org.id}/integrations/${f.integration.id}`;
  assert.equal((await manage(staff.cookie, `${root}/credentials`)).status, 403);
  assert.equal(
    (await request(app).post(`/api${root}/credentials`).set("Cookie", f.owner.cookie).send({}))
      .status,
    403,
  );
  await db.session.updateMany({
    where: { userId: f.owner.id },
    data: { authenticatedAt: new Date(0) },
  });
  assert.equal((await manage(f.owner.cookie, `${root}/credentials`)).status, 403);
  await db.organizationMember.update({
    where: { organizationId_userId: { organizationId: f.org.id, userId: staff.id } },
    data: { role: "ADMIN" },
  });
  assert.equal(
    (await manage(staff.cookie, `${root}/credentials`, { scopes: ["schedules:write"] })).status,
    400,
  );
  assert.equal((await manage(staff.cookie, `${root}/credentials`)).status, 201);
  await db.organizationMember.delete({
    where: { organizationId_userId: { organizationId: f.org.id, userId: staff.id } },
  });
  assert.equal((await manage(staff.cookie, `${root}/credentials`)).status, 404);
});
test("API writes enforce idempotency, scope, versions and legacy scheduling rules", async () => {
  const f = await fixture();
  const post = (body: object, key = "announcement_001") =>
    request(app)
      .post(`/api/v1/tournaments/${f.event.id}/announcements`)
      .set("Authorization", `Bearer ${f.key.secret}`)
      .set("Idempotency-Key", key)
      .send(body);
  const body = { title: "Arrival instructions", body: "Please arrive before check-in ends." };
  const responses = await Promise.all([post(body), post(body)]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [201, 201],
  );
  assert.equal(responses[0].body.id, responses[1].body.id);
  assert.equal(await db.tournamentAnnouncement.count({ where: { tournamentId: f.event.id } }), 1);
  assert.equal((await post({ ...body, title: "Changed title" })).status, 409);
  assert.equal((await post({ ...body, organizerId: f.owner.id }, "invalid_input")).status, 400);
  const match = await db.match.create({
    data: { tournamentId: f.event.id, round: 1, position: 1 },
  });
  const schedule = (version: number, time = f.event.startsAt.toISOString()) =>
    request(app)
      .put(`/api/v1/tournaments/${f.event.id}/matches/${match.id}/schedule`)
      .set("Authorization", `Bearer ${f.key.secret}`)
      .set("Idempotency-Key", `schedule_${version}_${time.replace(/\W/g, "")}`)
      .send({ scheduledAt: time, expectedVersion: version });
  assert.equal((await schedule(0)).status, 400);
  await db.tournament.update({ where: { id: f.event.id }, data: { phase: "ONGOING" } });
  assert.equal((await schedule(0)).status, 200);
  assert.equal(
    (await schedule(0, new Date(f.event.startsAt.getTime() + 3600000).toISOString())).status,
    409,
  );
  assert.equal((await schedule(1, new Date(0).toISOString())).status, 400);
  assert.equal(
    (
      await request(app)
        .post(`/api/v1/tournaments/${f.event.id}/matches/${match.id}/result`)
        .set("Authorization", `Bearer ${f.key.secret}`)
        .send({ scoreA: 1, scoreB: 0 })
    ).status,
    404,
  );
  await saveIntegration(
    f.org.id,
    f.owner.id,
    { name: "Read only", scopes: ["tournaments:read"], tournamentIds: [f.event.id] },
    f.integration.id,
  );
  assert.equal((await post(body, "no_write_scope")).status, 403);
});
test("shared per-integration rate limit prevents excess requests and records safe usage", async () => {
  const f = await fixture();
  await db.authThrottle.upsert({
    where: { key: digest(`developer-app:${f.integration.id}`) },
    create: {
      key: digest(`developer-app:${f.integration.id}`),
      count: 120,
      resetsAt: new Date(Date.now() + 60000),
    },
    update: { count: 120, resetsAt: new Date(Date.now() + 60000) },
  });
  assert.equal((await get("/tournaments", f.key.secret)).status, 429);
  await new Promise((r) => setTimeout(r, 50));
  const log = await db.apiRequest.findMany({ where: { integrationId: f.integration.id } });
  assert.ok(log.some((r) => r.status === 429));
  assert.ok(!JSON.stringify(log).includes(f.key.secret));
});
test("webhook outbox is atomic, minimal, scoped, signed, retryable and idempotent", async () => {
  env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const f = await fixture(),
    other = await fixture(),
    secret = newSigningSecret();
  const hook = await db.webhookEndpoint.create({
    data: {
      integrationId: f.integration.id,
      url: "https://example.org/hooks",
      events: ["announcement.created"],
      encryptedSecret: "pending",
    },
  });
  await db.webhookEndpoint.update({
    where: { id: hook.id },
    data: { encryptedSecret: sealSecret(secret, hook.id) },
  });
  const boss = createJobQueue(`devhooks_${randomBytes(4).toString("hex")}`);
  await boss.start();
  await boss.createQueue(WEBHOOK_QUEUE);
  try {
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.tournamentAnnouncement.create({
          data: { tournamentId: f.event.id, title: "Rollback", body: "Not committed" },
        });
        throw Error("rollback");
      }),
    );
    assert.equal(
      await db.webhookEvent.count({
        where: { tournamentId: f.event.id, type: "announcement.created" },
      }),
      0,
    );
    await db.tournamentAnnouncement.create({
      data: {
        tournamentId: f.event.id,
        title: "Sensitive title",
        body: "Private content never sent",
      },
    });
    await db.tournamentAnnouncement.create({
      data: { tournamentId: other.event.id, title: "Foreign", body: "Not for this integration" },
    });
    for (let batch = 0; batch < 100; batch++) {
      await Promise.all([enqueueWebhooks(boss), enqueueWebhooks(boss)]);
      if (await db.webhookDelivery.count({ where: { endpointId: hook.id } })) break;
    }
    const deliveries = await db.webhookDelivery.findMany({ where: { endpointId: hook.id } });
    assert.equal(deliveries.length, 1);
    const d = deliveries[0];
    let calls = 0;
    await assert.rejects(
      deliverWebhook(d.id, async () => {
        calls++;
        return 503;
      }),
    );
    assert.equal(
      (await db.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } })).status,
      "RETRY",
    );
    await deliverWebhook(d.id, async (_url, body, headers) => {
      calls++;
      const value = new Webhook(secret).verify(body, headers) as Record<string, unknown>;
      assert.deepEqual(
        Object.keys(value).sort(),
        ["id", "type", "tournamentId", "resourceId", "timestamp", "version"].sort(),
      );
      assert.ok(!body.includes("Sensitive"));
      assert.equal(headers["webhook-id"], d.id);
      return 204;
    });
    await deliverWebhook(d.id, async () => {
      calls++;
      return 200;
    });
    assert.equal(calls, 2);
    const newEvent = await db.tournamentAnnouncement.create({
      data: { tournamentId: f.event.id, title: "Second", body: "Revoke before delivery" },
    });
    await enqueueWebhooks(boss);
    const next = await db.webhookDelivery.findFirstOrThrow({
      where: { endpointId: hook.id, event: { resourceId: newEvent.id } },
    });
    await saveIntegration(
      f.org.id,
      f.owner.id,
      { name: "Revoked scope", scopes: ["tournaments:read"], tournamentIds: [] },
      f.integration.id,
    );
    await deliverWebhook(next.id, async () => {
      throw Error("Should not send");
    });
    assert.equal(
      (await db.webhookDelivery.findUniqueOrThrow({ where: { id: next.id } })).status,
      "SKIPPED",
    );
  } finally {
    await boss.stop({ graceful: true });
    env.WEBHOOK_ENCRYPTION_KEY = undefined;
  }
});
test("webhook worker retries transient failures and exposes terminal dead deliveries for authorized redrive", async () => {
  const { startNotifications } = await import("../../apps/api/src/modules/notifications/worker.js");
  env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const f = await fixture(),
    secret = newSigningSecret();
  const hook = await db.webhookEndpoint.create({
    data: {
      integrationId: f.integration.id,
      url: "https://example.org/worker",
      events: ["announcement.created"],
      encryptedSecret: "pending",
    },
  });
  await db.webhookEndpoint.update({
    where: { id: hook.id },
    data: { encryptedSecret: sealSecret(secret, hook.id) },
  });
  const worker = await startNotifications({
    schema: `hookworker_${randomBytes(4).toString("hex")}`,
    intervalMs: 50,
    retryDelay: 1,
    retryLimit: 1,
    mail: {
      available: false,
      send: async () => {
        throw Error("No mail");
      },
    },
    webhookTransport: async () => 503,
  });
  try {
    const a = await db.tournamentAnnouncement.create({
      data: {
        tournamentId: f.event.id,
        title: "Worker failure",
        body: "Retry through durable queue",
      },
    });
    const until = Date.now() + 20000;
    let delivery;
    while (Date.now() < until) {
      delivery = await db.webhookDelivery.findFirst({
        where: { endpointId: hook.id, event: { resourceId: a.id } },
      });
      if (delivery?.status === "DEAD") break;
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.equal(delivery?.status, "DEAD");
    assert.equal(delivery?.attempts, 2);
    const foreign = await user();
    const path = `/organizations/${f.org.id}/integrations/${f.integration.id}/deliveries/${delivery!.id}/retry`;
    assert.equal((await manage(foreign.cookie, path)).status, 404);
    assert.equal((await manage(f.owner.cookie, path)).status, 200);
  } finally {
    await worker.stop();
    env.WEBHOOK_ENCRYPTION_KEY = undefined;
  }
});
test("developer scheduling supports native battle rounds with version and order checks", async () => {
  const f = await fixture();
  await db.tournament.update({
    where: { id: f.event.id },
    data: { phase: "ONGOING", format: "BATTLE_ROYALE" },
  });
  const round = await db.battleRound.create({
    data: { tournamentId: f.event.id, number: 1, participantIds: [] },
  });
  const path = `/api/v1/tournaments/${f.event.id}/rounds/${round.id}/schedule`;
  const input = {
    scheduledAt: f.event.startsAt.toISOString(),
    expectedVersion: 0,
    slotMinutes: 30,
  };
  const r = await request(app)
    .put(path)
    .set("Authorization", `Bearer ${f.key.secret}`)
    .set("Idempotency-Key", "battle_schedule_1")
    .send(input);
  assert.equal(r.status, 200);
  assert.equal(r.body.version, 1);
  const stale = await request(app)
    .put(path)
    .set("Authorization", `Bearer ${f.key.secret}`)
    .set("Idempotency-Key", "battle_schedule_2")
    .send(input);
  assert.equal(stale.status, 409);
});
test("selected-event webhook subscriptions replay the original creation event exactly once", async () => {
  const f = await fixture();
  const hook = await db.webhookEndpoint.create({
    data: {
      integrationId: f.integration.id,
      url: "https://example.org/created",
      events: ["tournament.created"],
      encryptedSecret: "not-delivered",
    },
  });
  const input = {
    name: "Creation subscriber",
    scopes: ["tournaments:read"] as const,
    tournamentIds: [f.event.id],
  };
  await saveIntegration(
    f.org.id,
    f.owner.id,
    { ...input, scopes: [...input.scopes] },
    f.integration.id,
  );
  await saveIntegration(
    f.org.id,
    f.owner.id,
    { ...input, scopes: [...input.scopes] },
    f.integration.id,
  );
  const deliveries = await db.webhookDelivery.findMany({
    where: { endpointId: hook.id },
    include: { event: true },
  });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].event.resourceId, f.event.id);
  assert.equal(deliveries[0].event.type, "tournament.created");
});

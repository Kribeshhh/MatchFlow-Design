import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { app, createApp } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
import { env } from "../../apps/api/src/config/env.js";
import { digest } from "../../apps/api/src/modules/auth/tokens.js";
import { savePortal } from "../../apps/api/src/modules/portals/service.js";
import {
  claimDomain,
  reconcileDomain,
  requestRemoval,
  renewChallenge,
} from "../../apps/api/src/modules/custom-domains/service.js";
import type {
  DomainProvider,
  DomainState,
} from "../../apps/api/src/modules/custom-domains/provider.js";
import type { DomainDNS } from "../../apps/api/src/modules/custom-domains/dns.js";
import { uploadImage, cleanupMedia } from "../../apps/api/src/modules/media/service.js";
import {
  saveIntegration,
  issueCredential,
} from "../../apps/api/src/modules/api-access/management.js";
const config = { ...env };
after(async () => {
  Object.assign(env, config);
  await db.$disconnect();
});
async function fixture() {
  const tag = randomBytes(5).toString("hex"),
    u = await db.user.create({
      data: {
        username: `portal_${tag}`,
        email: `portal_${tag}@test.invalid`,
        role: "ORGANIZER",
        emailVerifiedAt: new Date(),
      },
    });
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      tokenHash: digest(token),
      userId: u.id,
      expiresAt: new Date(Date.now() + 3600000),
      authenticatedAt: new Date(),
    },
  });
  const org = await db.organization.create({ data: { name: "Community", ownerId: u.id } });
  const input = {
    slug: `club-${tag}`,
    enabled: true,
    title: "Community Championship",
    intro: "Play together",
    accent: "#D3F45D",
    navigation: [{ label: "Events", target: "TOURNAMENTS" as const }],
    hideAttribution: false,
  };
  await savePortal(org.id, u.id, input);
  const event = await db.tournament.create({
    data: {
      organizationId: org.id,
      organizerId: u.id,
      name: "Portal cup",
      description: "Public event",
      rules: "Fair competition",
      game: "valorant",
      teamSize: 1,
      maxTeams: 8,
      opensAt: new Date(Date.now() - 3600000),
      closesAt: new Date(Date.now() + 3600000),
      startsAt: new Date(Date.now() + 7200000),
    },
  });
  return { u, org, input, event, cookie: `matchflow_session=${token}` };
}
function provider() {
  let state: DomainState | null = null;
  let creates = 0;
  return {
    get creates() {
      return creates;
    },
    get state() {
      return state;
    },
    set state(v: DomainState | null) {
      state = v;
    },
    find: async () => state,
    create: async (hostname: string) => {
      creates++;
      state = {
        id: randomUUID(),
        hostname,
        status: "active",
        certificateStatus: "active",
        records: [],
      };
      return state;
    },
    remove: async () => {
      state = null;
    },
  } satisfies DomainProvider & { state: DomainState | null; creates: number };
}
function dns(challenge: string): DomainDNS {
  return {
    txt: async () => [[challenge]],
    cname: async () => [env.PORTAL_CNAME_TARGET!],
    addresses: async () => [],
  };
}
const write = (cookie: string, path: string, data: object = {}) =>
  request(app)
    .post(`/api${path}`)
    .set("Cookie", cookie)
    .set("Origin", "http://localhost:5173")
    .set("X-MatchFlow", "1")
    .send(data);
function configure() {
  env.PORTAL_ORIGIN_SECRET = randomBytes(32).toString("hex");
  env.PORTAL_CNAME_TARGET = "customers.matchflow.dev";
}
test("portal reads are organization-bound and never expose private/draft events or nested foreign resources", async () => {
  const a = await fixture(),
    b = await fixture();
  const root = `/api/portals/${a.input.slug}`;
  assert.equal((await request(app).get(root)).status, 200);
  assert.deepEqual(
    (await request(app).get(`${root}/tournaments`)).body.data.map((x: { id: string }) => x.id),
    [a.event.id],
  );
  for (const suffix of [
    "",
    "/matches",
    "/bracket",
    "/results",
    "/teams",
    "/rounds",
    "/standings",
    "/announcements",
  ]) {
    assert.equal(
      (await request(app).get(`${root}/tournaments/${b.event.id}${suffix}`)).status,
      404,
    );
  }
  await db.tournament.update({ where: { id: a.event.id }, data: { visibility: "PRIVATE" } });
  assert.equal(
    (await request(app).get(`${root}/tournaments/${a.event.id}`).set("Cookie", a.cookie)).status,
    404,
  );
  await db.tournament.update({
    where: { id: a.event.id },
    data: { visibility: "PUBLIC", phase: "DRAFT" },
  });
  assert.equal((await request(app).get(`${root}/tournaments/${a.event.id}`)).status, 404);
  await db.portal.update({ where: { organizationId: a.org.id }, data: { enabled: false } });
  assert.equal((await request(app).get(root)).status, 404);
});
test("portal management enforces roles, CSRF, versioning, theme safety and platform attribution policy", async () => {
  const f = await fixture(),
    foreign = await fixture(),
    root = `/api/organizations/${f.org.id}/portal`;
  assert.equal((await request(app).get(root).set("Cookie", foreign.cookie)).status, 404);
  assert.equal(
    (
      await request(app)
        .put(root)
        .set("Cookie", f.cookie)
        .send({ ...f.input, expectedVersion: 0 })
    ).status,
    403,
  );
  const put = (data: object) =>
    request(app)
      .put(root)
      .set("Cookie", f.cookie)
      .set("X-MatchFlow", "1")
      .set("Origin", "http://localhost:5173")
      .send(data);
  assert.equal((await put({ ...f.input, expectedVersion: 0, hideAttribution: true })).status, 403);
  assert.equal(
    (await put({ ...f.input, expectedVersion: 0, accent: "url(javascript:alert(1))" })).status,
    400,
  );
  assert.equal(
    (
      await put({
        ...f.input,
        expectedVersion: 0,
        navigation: [{ label: "Bad", target: "https://evil.org" }],
      })
    ).status,
    400,
  );
  assert.equal((await put({ ...f.input, expectedVersion: 0, html: "<script>" })).status, 400);
  assert.equal(
    (await put({ ...f.input, expectedVersion: 0, title: "Updated headline" })).status,
    200,
  );
  assert.equal((await put({ ...f.input, expectedVersion: 0 })).status, 409);
  await db.session.updateMany({
    where: { userId: f.u.id },
    data: { authenticatedAt: new Date(0) },
  });
  assert.equal((await put({ ...f.input, expectedVersion: 1 })).status, 403);
});
test("custom host routing requires fresh proof, active TLS and authenticated origin; sessions and keys never cross hosts", async () => {
  configure();
  const f = await fixture(),
    foreign = await fixture(),
    hostname = `play-${randomBytes(4).toString("hex")}.example.org`;
  const d = await claimDomain(f.org.id, f.u.id, hostname),
    p = provider();
  const get = (path: string, secret = env.PORTAL_ORIGIN_SECRET!) =>
    request(app)
      .get(path)
      .set("Host", hostname)
      .set("X-MatchFlow-Origin", secret)
      .set("Cookie", f.cookie);
  assert.equal((await get("/api/portal")).status, 421);
  await reconcileDomain(d.id, p, dns(d.challenge), true);
  assert.equal((await get("/api/portal", randomBytes(32).toString("hex"))).status, 421);
  assert.equal((await get("/api/portal")).status, 200);
  assert.equal((await get(`/api/portal/tournaments/${foreign.event.id}`)).status, 404);
  for (const path of [
    "/api/auth/me",
    "/API/auth/me",
    "/api/organizations",
    "/api/v1/tournaments",
    "/api/auth/google/callback",
    "/api/portals/foreign",
  ]) {
    assert.equal((await get(path)).status, 404, path);
  }
  assert.equal(
    (
      await request(app)
        .post("/api/portal")
        .set("Host", hostname)
        .set("X-MatchFlow-Origin", env.PORTAL_ORIGIN_SECRET!)
        .send({})
    ).status,
    404,
  );
  assert.equal((await get("/api/portal").set("Origin", "https://attacker.org")).status, 403);
  const integration = await saveIntegration(f.org.id, f.u.id, {
      name: "Private API",
      scopes: ["tournaments:read"],
      tournamentIds: [f.event.id],
    }),
    key = await issueCredential(f.org.id, integration.id, f.u.id, 1);
  assert.equal(
    (await get("/api/v1/tournaments").set("Authorization", `Bearer ${key.secret}`)).status,
    404,
  );
  const r = await get("/api/portal");
  assert.equal(r.headers["set-cookie"], undefined);
  assert.equal(r.body.canonicalOrigin, env.APP_ORIGIN);
  assert.equal(
    (
      await request(app)
        .get("/api/portal/context")
        .set("X-Forwarded-Host", hostname)
        .set("X-Tenant-ID", f.org.id)
    ).body.mode,
    "canonical",
  );
  await db.customDomain.update({
    where: { id: d.id },
    data: { checkedAt: new Date(Date.now() - 16 * 60000) },
  });
  assert.equal((await get("/api/portal")).status, 421);
  await reconcileDomain(d.id, p, dns("wrong challenge"), true);
  assert.equal(
    (await db.customDomain.findUniqueOrThrow({ where: { id: d.id } })).status,
    "SUSPENDED",
  );
});
test("domain claims, ownership, rotation, removal and reassignment reject stale proofs and races", async () => {
  configure();
  const f = await fixture(),
    b = await fixture(),
    name = `events-${randomBytes(4).toString("hex")}.example.org`;
  const results = await Promise.allSettled([
    claimDomain(f.org.id, f.u.id, name),
    claimDomain(b.org.id, b.u.id, name),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const d = await db.customDomain.findFirstOrThrow({ where: { hostname: name, removedAt: null } }),
    owner = d.organizationId === f.org.id ? f : b,
    other = owner === f ? b : f,
    p = provider();
  await assert.rejects(requestRemoval(d.organizationId, other.u.id, d.id));
  await db.organizationMember.create({
    data: { organizationId: owner.org.id, userId: other.u.id, role: "ADMIN" },
  });
  assert.equal(
    (
      await write(other.cookie, `/organizations/${owner.org.id}/domains`, {
        hostname: `other-${name}`,
      })
    ).status,
    403,
  );
  await reconcileDomain(d.id, p, dns("wrong"), true);
  assert.equal(p.creates, 0);
  await reconcileDomain(d.id, p, dns(d.challenge), true);
  assert.equal(p.creates, 1);
  await requestRemoval(owner.org.id, owner.u.id, d.id);
  assert.equal(
    (await db.customDomain.findUniqueOrThrow({ where: { id: d.id } })).status,
    "REMOVING",
  );
  await assert.rejects(claimDomain(other.org.id, other.u.id, name));
  await reconcileDomain(d.id, p, dns(d.challenge), true);
  assert.equal(p.state, null);
  const fresh = await claimDomain(other.org.id, other.u.id, name);
  assert.notEqual(fresh.challenge, d.challenge);
  await reconcileDomain(fresh.id, p, dns(d.challenge), true);
  assert.equal(
    (await db.customDomain.findUniqueOrThrow({ where: { id: fresh.id } })).status,
    "PENDING",
  );
  await renewChallenge(other.org.id, other.u.id, fresh.id);
  assert.notEqual(
    (await db.customDomain.findUniqueOrThrow({ where: { id: fresh.id } })).challenge,
    fresh.challenge,
  );
});
test("pending certificates and provider failures cannot activate a hostname or prematurely release it", async () => {
  configure();
  const f = await fixture(),
    name = `tls-${randomBytes(4).toString("hex")}.example.org`,
    d = await claimDomain(f.org.id, f.u.id, name),
    p = provider();
  p.state = {
    id: randomUUID(),
    hostname: name,
    status: "active",
    certificateStatus: "pending_validation",
    records: [],
  };
  await reconcileDomain(d.id, p, dns(d.challenge), true);
  assert.equal(
    (await db.customDomain.findUniqueOrThrow({ where: { id: d.id } })).status,
    "TLS_PENDING",
  );
  const failing: DomainProvider = {
    ...p,
    find: async () => {
      throw Error("private provider response");
    },
  };
  await requestRemoval(f.org.id, f.u.id, d.id);
  await reconcileDomain(d.id, failing, dns(d.challenge), true);
  const held = await db.customDomain.findUniqueOrThrow({ where: { id: d.id } });
  assert.equal(held.status, "REMOVING");
  assert.equal(held.removedAt, null);
});
test("portal media uploads retain validated assets and deny another tenant's images", async () => {
  const a = await fixture(),
    b = await fixture(),
    objects = new Map<string, Buffer>(),
    storage = {
      put: async (k: string, bytes: Buffer) => {
        objects.set(k, bytes);
      },
      get: async (k: string) => objects.get(k)!,
      remove: async (k: string) => {
        objects.delete(k);
      },
    };
  const local = createApp(undefined, undefined, undefined, storage);
  const bytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#d3f45d" },
  })
    .png()
    .toBuffer();
  const image = await uploadImage(a.u.id, { portalOrganizationId: a.org.id }, bytes, storage);
  const own = await request(local).get(`/api/portals/${a.input.slug}/media/${image.id}`);
  assert.equal(own.status, 200);
  assert.match(own.headers["content-type"], /image\/webp/);
  assert.equal(
    (await request(local).get(`/api/portals/${b.input.slug}/media/${image.id}`)).status,
    404,
  );
  await assert.rejects(uploadImage(b.u.id, { portalOrganizationId: a.org.id }, bytes, storage));
  await assert.rejects(
    uploadImage(a.u.id, { portalOrganizationId: a.org.id }, Buffer.from("<svg/>"), storage),
  );
  await db.mediaAsset.update({ where: { id: image.id }, data: { createdAt: new Date(0) } });
  await cleanupMedia(storage);
  assert.ok(await db.mediaAsset.findUnique({ where: { id: image.id } }));
});

test("in-flight provisioning cannot reactivate a removed claim or release its hostname early", async () => {
  env.PORTAL_CNAME_TARGET = "customers.matchflow.example.org";
  const a = await fixture(),
    b = await fixture();
  const d = await claimDomain(
    a.org.id,
    a.u.id,
    `race-${randomBytes(5).toString("hex")}.example.org`,
  );
  const remote = provider();
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run = reconcileDomain(
    d.id,
    {
      ...remote,
      create: async (hostname) => {
        started();
        await blocked;
        return remote.create(hostname);
      },
    },
    dns(d.challenge),
    true,
  );
  await entered;
  await requestRemoval(a.org.id, a.u.id, d.id);
  await assert.rejects(claimDomain(b.org.id, b.u.id, d.hostname));
  release();
  await run;
  assert.equal(
    (await db.customDomain.findUniqueOrThrow({ where: { id: d.id } })).status,
    "REMOVING",
  );
  assert.equal(
    await db.auditEvent.count({ where: { resourceId: d.id, action: "domain.activated" } }),
    0,
  );
  // Expired worker lease is reclaimed after the old request has settled.
  await db.customDomain.update({ where: { id: d.id }, data: { leaseUntil: new Date(0) } });
  await reconcileDomain(d.id, remote, dns(d.challenge), true);
  assert.equal(remote.state, null);
  assert.equal(
    (await db.customDomain.findUniqueOrThrow({ where: { id: d.id } })).status,
    "REMOVED",
  );
  const replacement = await claimDomain(b.org.id, b.u.id, d.hostname);
  assert.notEqual(replacement.challenge, d.challenge);
});

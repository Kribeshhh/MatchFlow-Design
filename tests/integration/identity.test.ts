import { TOTP } from "otpauth";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { createApp } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
import type { MailMessage } from "../../apps/api/src/modules/auth/mail.js";
import { legacyHashPassword } from "../../apps/api/src/modules/auth/password.js";
import { digest } from "../../apps/api/src/modules/auth/tokens.js";
import {
  beginGoogle,
  finishGoogle,
  acceptGoogleIdentity,
  type GoogleProvider,
} from "../../apps/api/src/modules/auth/google.js";
const messages: MailMessage[] = [];
const app = createApp(() => false, {
  available: true,
  async send(message) {
    messages.push(message);
  },
});
const suffix = randomBytes(4).toString("hex");
const password = randomBytes(24).toString("hex");
const agent = () => request.agent(app);
type Agent = ReturnType<typeof agent>;
const write = (
  a: Agent,
  method: "post" | "patch" | "put" | "delete",
  path: string,
  body: object = {},
) =>
  a[method](`/api${path}`)
    .set("Origin", "http://localhost:5173")
    .set("X-MatchFlow", "1")
    .send(body);
function token(email: string) {
  const message = messages.filter((m) => m.to === email).at(-1);
  assert.ok(message);
  return /token=([a-f0-9]{64})/.exec(message.text)![1];
}
async function account(name: string, verify = true) {
  const a = agent(),
    email = `id_${suffix}_${name}@test.invalid`;
  const r = await write(a, "post", "/auth/register", {
    username: `i_${suffix}_${name}`,
    email,
    password,
    role: "PLAYER",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (verify)
    assert.equal(
      (await write(a, "post", "/auth/verify-email", { token: token(email) })).status,
      200,
    );
  return {
    a,
    email,
    username: r.body.user.username as string,
    id: r.body.user.id,
    cookie: (r.headers["set-cookie"] as unknown as string[])[0].split(";")[0],
  };
}
after(async () => {
  await db.$disconnect();
});
test("verification is required for new writes, single use, and never grants administrative roles", async () => {
  const u = await account("verify", false);
  assert.equal(
    (await write(u.a, "post", "/teams", { name: "Identity Team", game: "pubg" })).status,
    403,
  );
  const t = token(u.email);
  assert.ok(
    !(await db.identityToken.findFirstOrThrow({ where: { userId: u.id } })).tokenHash.includes(t),
  );
  assert.equal((await write(u.a, "post", "/auth/verify-email", { token: t })).status, 200);
  assert.equal((await write(u.a, "post", "/auth/verify-email", { token: t })).status, 400);
  assert.equal(
    (await write(u.a, "post", "/teams", { name: "Identity Team", game: "pubg" })).status,
    201,
  );
  assert.equal(
    (
      await write(u.a, "patch", "/account", {
        displayName: "Name",
        bio: "",
        role: "ORGANIZER",
        platformRole: "ADMIN",
      })
    ).status,
    400,
  );
  assert.equal((await u.a.get("/api/admin/security-events")).status, 403);
  const update = await write(u.a, "patch", "/account", {
    displayName: "My name",
    bio: "Hello",
    role: "ORGANIZER",
  });
  assert.equal(update.status, 200);
  assert.deepEqual(update.body.user.roles, ["PLAYER", "ORGANIZER"]);
  assert.equal(
    (await write(u.a, "post", "/teams", { name: "Organizer can play", game: "valorant" })).status,
    201,
  );
});
test("password recovery has generic responses, expiring hashed tokens, one-time redemption and session revocation", async () => {
  const u = await account("reset");
  const second = agent();
  await write(second, "post", "/auth/login", { email: u.email, password });
  const known = await write(agent(), "post", "/auth/forgot-password", { email: u.email });
  const unknown = await write(agent(), "post", "/auth/forgot-password", {
    email: `absent_${suffix}@test.invalid`,
  });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  const expired = token(u.email);
  await db.identityToken.update({
    where: { tokenHash: digest(expired) },
    data: { expiresAt: new Date(0) },
  });
  const changed = randomBytes(24).toString("hex");
  assert.equal(
    (await write(agent(), "post", "/auth/reset-password", { token: expired, password: changed }))
      .status,
    400,
  );
  await write(agent(), "post", "/auth/forgot-password", { email: u.email });
  const t = token(u.email);
  const results = await Promise.all([
    write(agent(), "post", "/auth/reset-password", { token: t, password: changed }),
    write(agent(), "post", "/auth/reset-password", { token: t, password: changed }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal((await u.a.get("/api/account")).status, 401);
  assert.equal((await second.get("/api/account")).status, 401);
  assert.equal(
    (await write(agent(), "post", "/auth/login", { email: u.email, password })).status,
    401,
  );
  assert.equal(
    (await write(agent(), "post", "/auth/login", { email: u.email, password: changed })).status,
    200,
  );
});
test("session fixation, expiration, cross-user revocation and CSRF are rejected", async () => {
  const u = await account("sessions"),
    v = await account("other");
  const login = await write(u.a, "post", "/auth/login", { email: u.email, password });
  assert.notEqual((login.headers["set-cookie"] as unknown as string[])[0].split(";")[0], u.cookie);
  assert.equal((await request(app).get("/api/account").set("Cookie", u.cookie)).status, 401);
  const otherSession = (await v.a.get("/api/account/sessions")).body[0];
  assert.equal((await write(u.a, "delete", `/account/sessions/${otherSession.id}`)).status, 200);
  assert.equal((await v.a.get("/api/account")).status, 200);
  const list = (await u.a.get("/api/account/sessions")).body;
  assert.ok(list.every((s: any) => !("tokenHash" in s)));
  assert.equal(
    (await u.a.patch("/api/account").send({ displayName: "Attack", bio: "", role: "PLAYER" }))
      .status,
    403,
  );
  assert.equal(
    (
      await u.a
        .post("/api/account/deactivate")
        .set("X-MatchFlow", "1")
        .set("Origin", "https://attacker.invalid")
        .send({})
    ).status,
    403,
  );
  await db.session.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await u.a.get("/api/account")).status, 401);
});
test("legacy scrypt users and existing session digests survive; login upgrades to Argon2id", async () => {
  const u = await account("legacy");
  const oldHash = await legacyHashPassword(password);
  await db.user.update({
    where: { id: u.id },
    data: { passwordHash: oldHash, verificationRequired: false, emailVerifiedAt: null },
  });
  assert.equal((await u.a.get("/api/account")).status, 200);
  assert.equal((await write(u.a, "post", "/auth/login", { email: u.email, password })).status, 200);
  assert.match(
    (await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash!,
    /^\$argon2id\$/,
  );
});
test("password changes and revoke-others invalidate other devices, and stale sessions need reauthentication", async () => {
  const u = await account("change"),
    second = agent();
  await write(second, "post", "/auth/login", { email: u.email, password });
  await db.session.updateMany({ where: { userId: u.id }, data: { authenticatedAt: new Date(0) } });
  assert.equal((await write(u.a, "post", "/account/sessions/revoke-others")).status, 403);
  assert.equal((await write(u.a, "post", "/auth/reauthenticate", { password })).status, 200);
  assert.equal((await write(u.a, "post", "/account/sessions/revoke-others")).status, 200);
  assert.equal((await second.get("/api/account")).status, 401);
  const changed = randomBytes(24).toString("hex");
  assert.equal(
    (
      await write(u.a, "post", "/account/password", {
        currentPassword: password,
        password: changed,
      })
    ).status,
    200,
  );
  assert.equal((await u.a.get("/api/account")).status, 401);
});
test("Google linking refuses email merges, stolen state, swapped sessions, replay and identities already linked elsewhere", async () => {
  const u = await account("google"),
    v = await account("gother");
  const session = await db.session.findFirstOrThrow({ where: { userId: u.id } });
  await assert.rejects(
    acceptGoogleIdentity({ subject: `g_${suffix}`, email: u.email }, null, null),
  );
  const provider: GoogleProvider = {
    available: true,
    async start(state) {
      return `https://accounts.google.com/auth?state=${state}`;
    },
    async finish() {
      return { subject: `g_${suffix}`, email: u.email };
    },
  };
  const flow = await beginGoogle(provider, u.id, session.tokenHash);
  const state = new URL(flow.url).searchParams.get("state")!;
  const url = new URL(`http://localhost:5173/api/auth/google/callback?state=${state}&code=fixture`);
  await assert.rejects(finishGoogle(provider, url, "incorrect", session.tokenHash));
  await assert.rejects(finishGoogle(provider, url, flow.browser, "wrong-session"));
  const result = await finishGoogle(provider, url, flow.browser, session.tokenHash);
  assert.equal(result.user.id, u.id);
  await assert.rejects(finishGoogle(provider, url, flow.browser, session.tokenHash));
  const other = await db.session.findFirstOrThrow({ where: { userId: v.id } });
  await assert.rejects(
    acceptGoogleIdentity(
      { subject: `g_${suffix}`, email: v.email },
      v.id,
      other.tokenHash,
      other.tokenHash,
    ),
  );
  await db.session.deleteMany({ where: { userId: u.id } });
  await assert.rejects(
    acceptGoogleIdentity(
      { subject: `g2_${suffix}`, email: u.email },
      u.id,
      digest(result.token),
      digest(result.token),
    ),
  );
});
test("deactivation can be verified by email; deletion anonymizes snapshots and permanently revokes credentials", async () => {
  const u = await account("delete"),
    host = await account("host");
  const team = await db.team.create({
    data: { name: "History team", game: "pubg", captainId: u.id },
  });
  const event = await db.tournament.create({
    data: {
      name: "History",
      game: "pubg",
      description: "Retained history",
      rules: "Rules",
      teamSize: 1,
      maxTeams: 2,
      opensAt: new Date(0),
      closesAt: new Date(1000),
      startsAt: new Date(2000),
      organizerId: host.id,
    },
  });
  await db.tournamentRegistration.create({
    data: {
      teamId: team.id,
      tournamentId: event.id,
      roster: [{ id: u.id, username: `i_${suffix}_delete` }],
    },
  });
  assert.equal((await write(u.a, "post", "/account/deactivate")).status, 200);
  assert.equal(
    (await write(agent(), "post", "/auth/login", { email: u.email, password })).status,
    401,
  );
  await write(agent(), "post", "/auth/reactivation", { email: u.email });
  assert.equal(
    (await write(agent(), "post", "/auth/reactivate", { token: token(u.email) })).status,
    200,
  );
  await write(u.a, "post", "/auth/login", { email: u.email, password });
  assert.equal((await write(u.a, "post", "/account/deletion")).status, 200);
  const deleted = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  assert.equal(deleted.status, "DELETED");
  assert.equal(deleted.passwordHash, null);
  assert.notEqual(deleted.email, u.email);
  const entry = await db.tournamentRegistration.findUniqueOrThrow({
    where: { tournamentId_teamId: { tournamentId: event.id, teamId: team.id } },
  });
  assert.deepEqual(entry.roster, [{ id: u.id, username: "deleted_player" }]);
  assert.equal((await u.a.get("/api/account")).status, 401);
});
test("database-backed authentication throttle limits brute force independently of test IP limits", async () => {
  const email = `brute_${suffix}@test.invalid`;
  for (let n = 0; n < 20; n++)
    assert.equal((await write(agent(), "post", "/auth/login", { email, password })).status, 401);
  assert.equal((await write(agent(), "post", "/auth/login", { email, password })).status, 429);
});
test("organization and tournament grants are resource-scoped; moderators cannot become administrators", async () => {
  const owner = await account("owner"),
    admin = await account("orgadmin"),
    other = await account("foreign");
  const org = await db.organization.create({ data: { name: "Identity Org", ownerId: owner.id } });
  assert.equal(
    (await write(other.a, "put", `/organizations/${org.id}/members/${other.id}`, { role: "ADMIN" }))
      .status,
    404,
  );
  const invitation = await write(owner.a, "post", `/organizations/${org.id}/invitations`, {
    recipient: admin.username,
    role: "ADMIN",
  });
  assert.equal(invitation.status, 201);
  assert.equal(
    (
      await write(admin.a, "post", `/organization-invitations/${invitation.body.id}/respond`, {
        accept: true,
      })
    ).status,
    200,
  );
  const event = await db.tournament.create({
    data: {
      name: "Scope",
      game: "pubg",
      description: "Scope event",
      rules: "Rules",
      teamSize: 1,
      maxTeams: 2,
      opensAt: new Date(0),
      closesAt: new Date(1000),
      startsAt: new Date(2000),
      organizerId: owner.id,
      organizationId: org.id,
    },
  });
  assert.equal((await admin.a.get(`/api/tournaments/${event.id}`)).body.canManage, true);
  assert.equal((await agent().get("/api/organizations")).status, 401);
  assert.ok(
    (await owner.a.get("/api/organizations")).body.some((o: { id: string }) => o.id === org.id),
  );
  assert.ok(
    (await admin.a.get("/api/organizations")).body.some((o: { id: string }) => o.id === org.id),
  );
  assert.ok(
    !(await other.a.get("/api/organizations")).body.some((o: { id: string }) => o.id === org.id),
  );
  assert.equal((await other.a.get(`/api/tournaments/${event.id}`)).body.canManage, false);
  assert.equal(
    (
      await write(other.a, "put", `/tournaments/${event.id}/permissions/${other.id}`, {
        canManage: true,
      })
    ).status,
    404,
  );
  const staffInvitation = await write(owner.a, "post", `/organizations/${org.id}/invitations`, {
    recipient: other.username,
    role: "MEMBER",
  });
  assert.equal(staffInvitation.status, 201);
  assert.equal(
    (
      await write(other.a, "post", `/organization-invitations/${staffInvitation.body.id}/respond`, {
        accept: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write(owner.a, "put", `/tournaments/${event.id}/permissions/${other.id}`, {
        canManage: true,
      })
    ).status,
    200,
  );
  assert.equal((await other.a.get(`/api/tournaments/${event.id}`)).body.canManage, true);
  await db.user.update({ where: { id: admin.id }, data: { platformRole: "MODERATOR" } });
  await staffEnroll(admin.a);
  assert.equal((await admin.a.get("/api/admin/security-events")).status, 200);
  assert.equal(
    (await write(admin.a, "patch", `/admin/users/${admin.id}/role`, { platformRole: "ADMIN" }))
      .status,
    403,
  );
});

test("last administrator is protected and role changes revoke target sessions", async () => {
  // This suite can run after browser fixtures; establish exactly one admin in the disposable DB.
  assert.ok(new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"));
  await db.user.updateMany({ where: { platformRole: "ADMIN" }, data: { platformRole: "NONE" } });
  const admin = await account("platform"),
    target = await account("promote");
  await db.user.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });
  await staffEnroll(admin.a);
  assert.equal((await write(admin.a, "post", "/account/deactivate")).status, 400);
  assert.equal((await write(admin.a, "post", "/account/deletion")).status, 400);
  assert.equal(
    (await write(admin.a, "patch", `/admin/users/${admin.id}/role`, { platformRole: "NONE" }))
      .status,
    400,
  );
  assert.equal(
    (await write(admin.a, "patch", `/admin/users/${target.id}/role`, { platformRole: "ADMIN" }))
      .status,
    200,
  );
  assert.equal((await target.a.get("/api/account")).status, 401);
  assert.equal(
    (await write(admin.a, "patch", `/admin/users/${admin.id}/role`, { platformRole: "NONE" }))
      .status,
    200,
  );
  assert.equal((await admin.a.get("/api/admin/security-events")).status, 401);
});

test("unconfigured providers fail honestly and malformed cookies cannot break registration", async () => {
  const unavailable = createApp(
    () => false,
    {
      available: false,
      async send() {
        throw new Error("Not configured");
      },
    },
    {
      available: false,
      async start() {
        throw new Error("Not configured");
      },
      async finish() {
        throw new Error("Not configured");
      },
    },
  );
  const a = request.agent(unavailable);
  assert.deepEqual((await a.get("/api/auth/options")).body, { email: false, google: false });
  assert.equal(
    (await write(a, "post", "/auth/forgot-password", { email: "unknown@test.invalid" })).status,
    503,
  );
  assert.equal((await write(a, "post", "/auth/google/start")).status, 503);
  const r = await write(a, "post", "/auth/register", {
    username: `mal_${suffix}`,
    email: `mal_${suffix}@test.invalid`,
    password,
  }).set("Cookie", "matchflow_session=j%3A%7B%7D");
  assert.equal(r.status, 201);
  const callback = await a.get("/api/auth/google/callback?state=invalid&code=private-value");
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.location, "http://localhost:5173/login?oauth=failed");
});

async function staffEnroll(a: Agent) {
  const r = await write(a, "post", "/account/staff-factor/enroll");
  assert.equal(r.status, 200);
  const v = await write(a, "post", "/account/staff-factor/activate", {
    otp: new TOTP({ secret: r.body.secret }).generate(),
  });
  assert.equal(v.status, 200);
}

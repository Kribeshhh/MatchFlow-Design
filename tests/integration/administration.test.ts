import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TOTP } from "otpauth";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
import { digest } from "../../apps/api/src/modules/auth/tokens.js";
import { reviewCase } from "../../apps/api/src/modules/administration/cases.js";
import { cleanupRetention } from "../../apps/api/src/modules/administration/privacy.js";
import { env } from "../../apps/api/src/config/env.js";
const originalKey = env.STAFF_MFA_KEY;
after(async () => {
  env.STAFF_MFA_KEY = originalKey;
  await db.$disconnect();
});
async function account(role: "NONE" | "MODERATOR" | "ADMIN" = "NONE") {
  const tag = randomBytes(6).toString("hex"),
    token = randomBytes(32).toString("hex");
  const u = await db.user.create({
    data: {
      username: `staff_${tag}`,
      email: `staff_${tag}@test.invalid`,
      role: "ORGANIZER",
      platformRole: role,
      emailVerifiedAt: new Date(),
    },
  });
  const s = await db.session.create({
    data: {
      userId: u.id,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 3600000),
      authenticatedAt: new Date(),
    },
  });
  return { u, s, cookie: `matchflow_session=${token}` };
}
type Account = Awaited<ReturnType<typeof account>>;
function get(a: Account, path: string) {
  return request(app).get(`/api${path}`).set("Cookie", a.cookie);
}
function post(a: Account, path: string, body: object = {}) {
  return request(app)
    .post(`/api${path}`)
    .set("Cookie", a.cookie)
    .set("Origin", "http://localhost:5173")
    .set("X-MatchFlow", "1")
    .send(body);
}
async function enroll(a: Account) {
  const r = await post(a, "/account/staff-factor/enroll");
  assert.equal(r.status, 200);
  const otp = new TOTP({ secret: r.body.secret }).generate();
  const v = await post(a, "/account/staff-factor/activate", { otp });
  assert.equal(v.status, 200);
  return { secret: r.body.secret, otp, codes: v.body.recoveryCodes as string[] };
}
async function report(a: Account, target: Account) {
  const r = await post(a, "/support/cases", {
    targetType: "USER",
    targetId: target.u.id,
    category: "ABUSE",
    description: "Abusive conduct during our competition.",
  });
  assert.equal(r.status, 201);
  return r.body as { id: string; version: number };
}
const decision = (
  action: "SUSPEND" | "RESTORE_ACCOUNT" | "RESTRICT" | "RESTORE_CONTENT" | "RESOLVE",
  version = 0,
) => ({
  action,
  expectedVersion: version,
  reason: "Verified evidence reviewed by platform staff.",
  resolution: "The platform reviewed this report and recorded a decision.",
});
test("staff TOTP is required, encrypted, replay protected, session bound and recoverable exactly once", async () => {
  const staff = await account("ADMIN"),
    ordinary = await account();
  assert.equal((await get(staff, "/admin/users")).status, 403);
  assert.equal((await post(ordinary, "/account/staff-factor/enroll")).status, 403);
  const f = await enroll(staff),
    stored = await db.staffFactor.findUniqueOrThrow({ where: { userId: staff.u.id } });
  assert.equal(stored.encryptedSecret.includes(f.secret), false);
  assert.equal(stored.recoveryHashes.includes(f.codes[0]), false);
  assert.equal((await get(staff, "/admin/users")).status, 200);
  assert.equal((await post(staff, "/account/staff-factor/verify", { otp: f.otp })).status, 403);
  const token = randomBytes(32).toString("hex"),
    second = await db.session.create({
      data: {
        userId: staff.u.id,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 3600000),
        authenticatedAt: new Date(),
      },
    });
  const fresh = { ...staff, s: second, cookie: `matchflow_session=${token}` };
  assert.equal((await get(fresh, "/admin/users")).status, 403);
  const race = await Promise.all([
    post(fresh, "/account/staff-factor/verify", { otp: f.codes[0] }),
    post(fresh, "/account/staff-factor/verify", { otp: f.codes[0] }),
  ]);
  assert.deepEqual(race.map((v) => v.status).sort(), [200, 403]);
  await db.session.update({ where: { id: second.id }, data: { staffVerifiedAt: new Date(0) } });
  assert.equal((await get(fresh, "/admin/users")).status, 403);
  assert.equal((await post(staff, "/account/staff-factor/verify", { otp: "000000" })).status, 403);
  assert.equal((await post(staff, "/account/staff-factor/verify", { otp: "000000" })).status, 429);
  env.STAFF_MFA_KEY = undefined;
  assert.equal((await get(staff, "/admin/users")).status, 403);
  env.STAFF_MFA_KEY = originalKey;
});
test("moderation isolates reports, blocks escalation, suspends sessions and restores without resurrecting them", async () => {
  const moderator = await account("MODERATOR"),
    reporter = await account(),
    target = await account(),
    admin = await account("ADMIN");
  await enroll(moderator);
  const c = await report(reporter, target);
  assert.equal(
    (await get(target, "/support/cases")).body.some((v: { id: string }) => v.id === c.id),
    false,
  );
  assert.equal((await get(reporter, "/admin/cases")).status, 403);
  assert.equal((await get(moderator, "/admin/api-usage")).status, 403);
  const cs = await report(reporter, admin);
  assert.equal(
    (await post(moderator, `/admin/cases/${cs.id}/review`, decision("SUSPEND"))).status,
    403,
  );
  const noCSRF = await request(app)
    .post(`/api/admin/cases/${c.id}/review`)
    .set("Cookie", moderator.cookie)
    .send(decision("SUSPEND"));
  assert.equal(noCSRF.status, 403);
  assert.equal(
    (await post(moderator, `/admin/cases/${c.id}/review`, decision("SUSPEND"))).status,
    200,
  );
  assert.equal((await get(target, "/account")).status, 401);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: target.u.id } })).status,
    "SUSPENDED",
  );
  assert.equal(
    (await post(moderator, `/admin/cases/${c.id}/review`, decision("RESTORE_ACCOUNT", 0))).status,
    409,
  );
  assert.equal(
    (await post(moderator, `/admin/cases/${c.id}/review`, decision("RESTORE_ACCOUNT", 1))).status,
    200,
  );
  assert.equal((await get(target, "/account")).status, 401);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.u.id } })).status, "ACTIVE");
  const logs = await db.auditEvent.findMany({ where: { resourceId: c.id } });
  assert.ok(logs.some((v) => v.action === "moderation.suspend"));
  const own = (await get(reporter, "/support/cases")).body;
  assert.equal(JSON.stringify(own).includes("Verified evidence"), false);
  await db.session.update({
    where: { id: moderator.s.id },
    data: { authenticatedAt: new Date(0) },
  });
  assert.equal(
    (await post(moderator, `/admin/cases/${c.id}/review`, decision("RESOLVE", 2))).status,
    403,
  );
});
test("content restriction locks ordinary edits, removes discovery, preserves results and restores only through review", async () => {
  const mod = await account("MODERATOR"),
    owner = await account(),
    reporter = await account();
  await enroll(mod);
  const event = await db.tournament.create({
    data: {
      organizerId: owner.u.id,
      name: "Disputed listing",
      description: "Original description",
      rules: "Original rules",
      game: "valorant",
      teamSize: 1,
      maxTeams: 4,
      opensAt: new Date(),
      closesAt: new Date(Date.now() + 3600000),
      startsAt: new Date(Date.now() + 7200000),
    },
  });
  const r = await post(reporter, "/support/cases", {
    targetType: "TOURNAMENT",
    targetId: event.id,
    category: "FRAUD",
    description: "This listing appears to contain fraudulent claims.",
  });
  assert.equal(r.status, 201);
  assert.equal(
    (await post(mod, `/admin/cases/${r.body.id}/review`, decision("RESTRICT"))).status,
    200,
  );
  const saved = await db.tournament.findUniqueOrThrow({ where: { id: event.id } });
  assert.ok(saved.restrictedAt);
  assert.equal(saved.visibility, "PRIVATE");
  assert.equal((await request(app).get(`/api/v1/public/tournaments/${event.id}`)).status, 404);
  assert.equal((await get(reporter, `/tournaments/${event.id}`)).status, 404);
  const edit = await request(app)
    .patch(`/api/tournaments/${event.id}`)
    .set("Cookie", owner.cookie)
    .set("X-MatchFlow", "1")
    .set("Origin", "http://localhost:5173")
    .send({ name: "Bypass" });
  assert.notEqual(edit.status, 200);
  assert.equal(
    (await post(mod, `/admin/cases/${r.body.id}/review`, decision("RESTORE_CONTENT", 1))).status,
    200,
  );
  const restored = await db.tournament.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(restored.restrictedAt, null);
  assert.equal(restored.name, event.name);
  assert.equal(restored.visibility, "PRIVATE");
  const privateReport = await post(reporter, "/support/cases", {
    targetType: "TOURNAMENT",
    targetId: event.id,
    category: "FRAUD",
    description: "Trying to report a hidden private event.",
  });
  assert.equal(privateReport.status, 404);
});
test("moderation transactions reject stale concurrent actions and demoted staff", async () => {
  const mod = await account("MODERATOR"),
    a = await account(),
    b = await account();
  await enroll(mod);
  const c = await report(a, b);
  const results = await Promise.allSettled([
    reviewCase(mod.u.id, mod.s.id, c.id, decision("SUSPEND")),
    reviewCase(mod.u.id, mod.s.id, c.id, decision("SUSPEND")),
  ]);
  assert.equal(results.filter((v) => v.status === "fulfilled").length, 1);
  await db.user.update({ where: { id: mod.u.id }, data: { platformRole: "NONE" } });
  await assert.rejects(reviewCase(mod.u.id, mod.s.id, c.id, decision("RESTORE_ACCOUNT", 1)));
});
test("ownership transfer is admin-only, requires existing membership and revokes old grants and credentials", async () => {
  const admin = await account("ADMIN"),
    mod = await account("MODERATOR"),
    owner = await account(),
    member = await account(),
    outsider = await account();
  await enroll(admin);
  await enroll(mod);
  const org = await db.organization.create({
    data: {
      name: "Transfer community",
      ownerId: owner.u.id,
      members: { create: { userId: member.u.id, role: "MEMBER" } },
    },
  });
  const path = `/admin/organizations/${org.id}/owner`,
    reason = "Owner transition reviewed with organization staff.";
  assert.equal((await post(mod, path, { newOwnerId: member.u.id, reason })).status, 403);
  assert.equal((await post(admin, path, { newOwnerId: outsider.u.id, reason })).status, 400);
  assert.equal((await post(admin, path, { newOwnerId: member.u.id, reason })).status, 200);
  assert.equal(
    (await db.organization.findUniqueOrThrow({ where: { id: org.id } })).ownerId,
    member.u.id,
  );
  assert.ok(
    await db.auditEvent.findFirst({
      where: { resourceId: org.id, action: "organization.ownership.changed" },
    }),
  );
  assert.equal((await get(outsider, `/organizations/${org.id}`)).status, 404);
});
test("retention honors legal holds, dry-run and unresolved cases; exports omit secrets and deletion removes factors", async () => {
  const admin = await account("ADMIN"),
    person = await account();
  await enroll(admin);
  const old = new Date(Date.now() - 800 * 86400000);
  const a = await db.moderationCase.create({
    data: {
      reporterId: person.u.id,
      category: "SUPPORT",
      description: "An old support request",
      status: "RESOLVED",
      resolvedAt: old,
      createdAt: old,
    },
  });
  const held = await db.moderationCase.create({
    data: {
      reporterId: person.u.id,
      category: "SUPPORT",
      description: "A held support request",
      status: "RESOLVED",
      resolvedAt: old,
      createdAt: old,
      legalHold: true,
    },
  });
  const open = await db.moderationCase.create({
    data: {
      reporterId: person.u.id,
      category: "SUPPORT",
      description: "An unresolved request",
      createdAt: old,
    },
  });
  const log = await db.auditEvent.create({
    data: {
      actorId: person.u.id,
      action: "test.old",
      resourceType: "User",
      resourceId: person.u.id,
      createdAt: old,
    },
  });
  assert.equal(
    (
      await post(admin, "/admin/retention-holds", {
        resourceType: "AuditEvent",
        resourceId: log.id,
        hold: true,
      })
    ).status,
    200,
  );
  await cleanupRetention();
  assert.ok(await db.moderationCase.findUnique({ where: { id: a.id } }));
  await cleanupRetention(true);
  assert.equal(await db.moderationCase.findUnique({ where: { id: a.id } }), null);
  assert.ok(await db.moderationCase.findUnique({ where: { id: held.id } }));
  assert.ok(await db.moderationCase.findUnique({ where: { id: open.id } }));
  assert.ok(await db.auditEvent.findUnique({ where: { id: log.id } }));
  const exported = await get(admin, "/account/export");
  assert.equal(exported.status, 200);
  assert.equal(exported.body.user.id, admin.u.id);
  for (const key of ["encryptedSecret", "recoveryHashes", "passwordHash", "tokenHash"])
    assert.equal(JSON.stringify(exported.body).includes(key), false);
  assert.equal((await post(person, "/account/deletion")).status, 200);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: person.u.id } })).status, "DELETED");
  assert.ok(await db.moderationCase.findUnique({ where: { id: held.id } }));
  // Explicitly demote this disposable admin, then prove anonymization destroys the factor.
  await db.user.update({ where: { id: admin.u.id }, data: { platformRole: "NONE" } });
  assert.equal((await post(admin, "/account/deletion")).status, 200);
  assert.equal(await db.staffFactor.findUnique({ where: { userId: admin.u.id } }), null);
});

test("platform corrections require administrator factor, exact dispute binding and a fresh rollback preview", async () => {
  const { generateBracket } = await import("../../apps/api/src/modules/brackets/service.js");
  const { confirmResult } = await import("../../apps/api/src/modules/matches/service.js");
  const { openDispute } = await import("../../apps/api/src/modules/matches/disputes.js");
  const owner = await account(),
    staff = await account("ADMIN"),
    mod = await account("MODERATOR");
  await enroll(staff);
  await enroll(mod);
  const event = await db.tournament.create({
    data: {
      organizerId: owner.u.id,
      name: "Private review event",
      description: "Competition fixture",
      rules: "Fair play",
      game: "valorant",
      teamSize: 1,
      maxTeams: 4,
      visibility: "PRIVATE",
      opensAt: new Date(Date.now() - 7200000),
      closesAt: new Date(Date.now() - 3600000),
      startsAt: new Date(Date.now() + 3600000),
    },
  });
  const teams = [];
  for (let i = 0; i < 2; i++) {
    const p = await account();
    const t = await db.team.create({
      data: {
        name: `Review ${randomBytes(5).toString("hex")}`,
        game: "valorant",
        captainId: p.u.id,
        members: { create: { userId: p.u.id, acceptedAt: new Date() } },
      },
    });
    teams.push(t);
    await db.tournamentRegistration.create({
      data: {
        tournamentId: event.id,
        teamId: t.id,
        status: "APPROVED",
        roster: [{ id: p.u.id, username: p.u.username }],
      },
    });
  }
  await generateBracket(event.id, owner.u.id);
  const match = await db.match.findFirstOrThrow({ where: { tournamentId: event.id } });
  await confirmResult(event.id, match.id, owner.u.id, {
    scoreA: 1,
    scoreB: 0,
    outcome: "PLAYED",
    reason: "",
  });
  const dispute = await openDispute(
    event.id,
    match.id,
    owner.u.id,
    "The score was recorded on the wrong side.",
  );
  const path = `/admin/tournaments/${event.id}/disputes/${dispute.id}`;
  assert.equal((await get(owner, `${path}/preview`)).status, 403);
  assert.equal((await get(mod, `${path}/preview`)).status, 403);
  assert.equal(
    (
      await get(
        staff,
        `/admin/tournaments/${randomBytes(10).toString("hex")}/disputes/${dispute.id}/preview`,
      )
    ).status,
    404,
  );
  const preview = await get(staff, `${path}/preview`);
  assert.equal(preview.status, 200);
  const body = {
    previewHash: preview.body.previewHash,
    acknowledgement: "VOID_AND_REPLAY",
    reason: "Reviewed evidence confirms that the sides were reversed.",
    result: { scoreA: 0, scoreB: 1 },
  };
  assert.equal(
    (await post(staff, `${path}/correct`, { ...body, previewHash: "0".repeat(64) })).status,
    409,
  );
  assert.equal((await post(staff, `${path}/correct`, body)).status, 200);
  assert.equal(
    (await db.match.findUniqueOrThrow({ where: { id: match.id } })).winnerId,
    match.teamBId,
  );
  assert.ok(
    await db.engineHistory.findFirst({
      where: { tournamentId: event.id, actorId: staff.u.id, action: "correction.rollback" },
    }),
  );
  assert.equal((await post(staff, `${path}/correct`, body)).status, 404);
});

test("staff factor replacement requires fresh proof, invalidates old codes and never removes the primary-auth gate", async () => {
  const staff = await account("ADMIN"),
    f = await enroll(staff);
  assert.equal(
    (await post(staff, "/account/staff-factor/reset", { otp: "0".repeat(32) })).status,
    403,
  );
  await db.session.update({ where: { id: staff.s.id }, data: { authenticatedAt: new Date(0) } });
  assert.equal((await post(staff, "/account/staff-factor/reset", { otp: f.codes[0] })).status, 403);
  await db.session.update({ where: { id: staff.s.id }, data: { authenticatedAt: new Date() } });
  assert.equal((await post(staff, "/account/staff-factor/reset", { otp: f.codes[0] })).status, 200);
  assert.equal(await db.staffFactor.findUnique({ where: { userId: staff.u.id } }), null);
  assert.equal((await get(staff, "/admin/overview")).status, 403);
  assert.equal(
    (await post(staff, "/account/staff-factor/verify", { otp: f.codes[1] })).status,
    403,
  );
  const next = await post(staff, "/account/staff-factor/enroll");
  assert.equal(next.status, 200);
  assert.notEqual(next.body.secret, f.secret);
});

test("team and organization restrictions cancel pending consent flows, disable portals and block scoped credentials", async () => {
  const mod = await account("MODERATOR"),
    owner = await account(),
    member = await account(),
    invitee = await account();
  await enroll(mod);
  const team = await db.team.create({
    data: {
      name: `Reported ${randomBytes(5).toString("hex")}`,
      game: "valorant",
      captainId: owner.u.id,
      transferToId: member.u.id,
      transferExpiresAt: new Date(Date.now() + 3600000),
      members: {
        create: [
          { userId: owner.u.id, acceptedAt: new Date() },
          { userId: member.u.id, acceptedAt: new Date() },
        ],
      },
    },
  });
  const invite = await db.teamInvitation.create({
    data: {
      teamId: team.id,
      userId: invitee.u.id,
      invitedById: owner.u.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const c = await post(owner, "/support/cases", {
    targetType: "TEAM",
    targetId: team.id,
    category: "ABUSE",
    description: "Abusive team branding needs a review.",
  });
  assert.equal(c.status, 201);
  const context = await get(mod, `/admin/cases/${c.body.id}/context`);
  assert.equal(context.status, 200);
  assert.equal(context.body.target.name, team.name);
  assert.equal((await get(member, `/admin/cases/${c.body.id}/context`)).status, 403);
  assert.equal(
    (await post(mod, `/admin/cases/${c.body.id}/review`, decision("RESTRICT"))).status,
    200,
  );
  assert.equal(
    (await db.teamInvitation.findUniqueOrThrow({ where: { id: invite.id } })).status,
    "CANCELLED",
  );
  assert.equal((await db.team.findUniqueOrThrow({ where: { id: team.id } })).transferToId, null);
  const { respond } = await import("../../apps/api/src/modules/teams/invitations.js");
  await assert.rejects(respond(invite.id, invitee.u.id, true));
  const org = await db.organization.create({
    data: {
      name: "Reported organization",
      description: "Community",
      publicProfile: true,
      ownerId: owner.u.id,
    },
  });
  await db.portal.create({
    data: {
      organizationId: org.id,
      slug: `review-${randomBytes(5).toString("hex")}`,
      title: "Organization portal",
      enabled: true,
    },
  });
  const integration = await db.integration.create({
    data: { organizationId: org.id, name: "Test integration", scopes: ["tournaments:read"] },
  });
  const key = randomBytes(32).toString("hex"),
    token = `mf_live_${key}`;
  await db.apiCredential.create({
    data: {
      integrationId: integration.id,
      tokenHash: digest(token),
      prefix: token.slice(0, 16),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const report = await post(member, "/support/cases", {
    targetType: "ORGANIZATION",
    targetId: org.id,
    category: "FRAUD",
    description: "This organization's published claims require review.",
  });
  assert.equal(report.status, 201);
  assert.equal(
    (await post(mod, `/admin/cases/${report.body.id}/review`, decision("RESTRICT"))).status,
    200,
  );
  assert.equal(
    (await db.portal.findUniqueOrThrow({ where: { organizationId: org.id } })).enabled,
    false,
  );
  const { credentialAccess } = await import("../../apps/api/src/modules/api-access/policy.js");
  await assert.rejects(credentialAccess(token));
  assert.equal((await get(owner, `/organizations/${org.id}`)).status, 403);
  assert.equal(
    (await post(mod, `/admin/cases/${report.body.id}/review`, decision("RESTORE_CONTENT", 1)))
      .status,
    200,
  );
  await assert.rejects(credentialAccess(token));
  assert.equal(
    (await db.portal.findUniqueOrThrow({ where: { organizationId: org.id } })).enabled,
    false,
  );
});

test("only recently authenticated platform staff can initiate private-account cases", async () => {
  const staff = await account("MODERATOR"),
    reporter = await account(),
    target = await account();
  await enroll(staff);
  await db.user.update({ where: { id: target.u.id }, data: { profilePublic: false } });
  const body = {
    targetType: "USER",
    targetId: target.u.id,
    category: "SPAM",
    description: "Private account abuse reported through verified support.",
  };
  assert.equal((await post(reporter, "/support/cases", body)).status, 404);
  assert.equal((await post(reporter, "/admin/cases", body)).status, 403);
  assert.equal((await post(staff, "/admin/cases", body)).status, 201);
  assert.equal((await post(staff, "/admin/cases", body)).status, 409);
  await db.session.update({ where: { id: staff.s.id }, data: { authenticatedAt: new Date(0) } });
  assert.equal((await post(staff, "/admin/cases", body)).status, 403);
});

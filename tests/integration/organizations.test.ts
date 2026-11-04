import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { app } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
import {
  inviteStaff,
  answerInvitation,
  cancelInvitation,
  removeMember,
  changeMember,
} from "../../apps/api/src/modules/organizations/staff.js";
import { createOrganization } from "../../apps/api/src/modules/organizations/profiles.js";
import { organizationAnalytics } from "../../apps/api/src/modules/organizations/analytics.js";
import { uploadImage, readImage, cleanupMedia } from "../../apps/api/src/modules/media/service.js";
import { deliverInvitation } from "../../apps/api/src/modules/organizations/invitation-mail.js";
import { canManageTournament } from "../../apps/api/src/modules/tournaments/policy.js";
const origin = "http://localhost:5173";
async function user(email?: string, verified = true) {
  const tag = randomBytes(5).toString("hex");
  const u = await db.user.create({
    data: {
      username: `org_${tag}`,
      email: email || `org_${tag}@test.invalid`,
      role: "ORGANIZER",
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
  const token = randomBytes(32).toString("hex");
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
const profile = {
  name: "Verified organization",
  description: "A real test workspace",
  region: "Nepal",
  website: "",
  publicProfile: false,
};
const org = (ownerId: string) => createOrganization(ownerId, profile);
const read = (cookie: string, path: string) =>
  request(app).get(`/api${path}`).set("Cookie", cookie);
const write = (
  cookie: string,
  method: "post" | "patch" | "put" | "delete",
  path: string,
  data: object = {},
) => {
  const client = request(app);
  return client[method](`/api${path}`)
    .set("Cookie", cookie)
    .set("Origin", origin)
    .set("X-MatchFlow", "1")
    .send(data);
};
async function join(
  id: string,
  owner: { id: string },
  target: { id: string; username: string },
  role: "ADMIN" | "MANAGER" | "MEMBER",
) {
  const i = await inviteStaff(id, owner.id, { recipient: target.username, role });
  await answerInvitation(i.id, target.id, true);
}
async function event(
  organizationId: string,
  organizerId: string,
  visibility: "PRIVATE" | "PUBLIC" = "PRIVATE",
) {
  return db.tournament.create({
    data: {
      organizationId,
      organizerId,
      name: "Workspace cup",
      game: "valorant",
      description: "Organization tournament",
      rules: "Confirmed results only",
      teamSize: 1,
      maxTeams: 8,
      visibility,
      opensAt: new Date(Date.now() - 3600000),
      closesAt: new Date(Date.now() + 3600000),
      startsAt: new Date(Date.now() + 7200000),
    },
  });
}
after(() => db.$disconnect());
test("organization workspace, analytics, members, exports and settings reject cross-organization access", async () => {
  const owner = await user(),
    foreign = await user(),
    a = await org(owner.id),
    b = await org(foreign.id);
  for (const suffix of ["", "/members", "/analytics", "/export.csv", "/invitations"]) {
    assert.equal((await read(foreign.cookie, `/organizations/${a.id}${suffix}`)).status, 404);
    assert.equal((await request(app).get(`/api/organizations/${a.id}${suffix}`)).status, 401);
  }
  assert.equal(
    (
      await write(foreign.cookie, "patch", `/organizations/${a.id}`, {
        ...profile,
        expectedVersion: 0,
      })
    ).status,
    404,
  );
  assert.equal(
    (await read(owner.cookie, "/organizations")).body.some((o: { id: string }) => o.id === b.id),
    false,
  );
  assert.equal((await request(app).get(`/api/organizations/${a.id}/public`)).status, 404);
  assert.equal(
    (
      await write(owner.cookie, "patch", `/organizations/${a.id}`, {
        ...profile,
        publicProfile: true,
        expectedVersion: 0,
      })
    ).status,
    200,
  );
  await event(a.id, owner.id);
  const published = await event(a.id, owner.id, "PUBLIC");
  const publicView = await request(app).get(`/api/organizations/${a.id}/public`);
  assert.deepEqual(
    publicView.body.tournaments.map((t: { id: string }) => t.id),
    [published.id],
  );
  assert(!JSON.stringify(publicView.body).includes(owner.email));
  assert.equal(
    (
      await write(owner.cookie, "patch", `/organizations/${a.id}`, {
        ...profile,
        expectedVersion: 0,
      })
    ).status,
    409,
  );
});
test("email invitations require verified matching identity, acceptance, expiry and current inviter authority", async () => {
  const owner = await user(),
    outsider = await user(),
    a = await org(owner.id);
  const address = `new_${randomBytes(5).toString("hex")}@test.invalid`;
  const invitation = await inviteStaff(a.id, owner.id, { recipient: address, role: "MEMBER" });
  const newcomer = await user(address, false);
  assert.deepEqual((await read(newcomer.cookie, "/organization-invitations")).body, []);
  await assert.rejects(() => answerInvitation(invitation.id, newcomer.id, true));
  await assert.rejects(() => answerInvitation(invitation.id, outsider.id, true));
  await db.user.update({ where: { id: newcomer.id }, data: { emailVerifiedAt: new Date() } });
  const races = await Promise.allSettled([
    answerInvitation(invitation.id, newcomer.id, true),
    answerInvitation(invitation.id, newcomer.id, true),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await db.organizationMember.count({ where: { organizationId: a.id, userId: newcomer.id } }),
    1,
  );
  await assert.rejects(() =>
    inviteStaff(a.id, owner.id, { recipient: newcomer.username, role: "ADMIN" }),
  );
  const rejected = await inviteStaff(a.id, owner.id, {
    recipient: outsider.username,
    role: "MEMBER",
  });
  await answerInvitation(rejected.id, outsider.id, false);
  const expired = await inviteStaff(a.id, owner.id, {
    recipient: outsider.username,
    role: "MEMBER",
  });
  await db.organizationInvitation.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(0) },
  });
  await assert.rejects(() => answerInvitation(expired.id, outsider.id, true));
  const cancelled = await inviteStaff(a.id, owner.id, {
    recipient: outsider.username,
    role: "MEMBER",
  });
  await cancelInvitation(a.id, cancelled.id, owner.id);
  await assert.rejects(() => answerInvitation(cancelled.id, outsider.id, true));
  const admin = await user();
  await join(a.id, owner, admin, "ADMIN");
  const pending = await inviteStaff(a.id, admin.id, {
    recipient: outsider.username,
    role: "MEMBER",
  });
  await removeMember(a.id, owner.id, admin.id);
  await assert.rejects(() => answerInvitation(pending.id, outsider.id, true));
});
test("role hierarchy and current event assignments revoke creator access without privilege escalation", async () => {
  const owner = await user(),
    admin = await user(),
    manager = await user(),
    staff = await user(),
    stranger = await user(),
    a = await org(owner.id);
  await join(a.id, owner, admin, "ADMIN");
  await join(a.id, owner, manager, "MANAGER");
  await join(a.id, owner, staff, "MEMBER");
  const t = await event(a.id, manager.id);
  const createBody = {
    organizationId: a.id,
    name: "Managed tournament",
    game: "valorant",
    description: "New organization tournament",
    rules: "All results are confirmed by organizers",
    teamSize: 1,
    maxTeams: 4,
    opensAt: new Date(Date.now() + 3600000).toISOString(),
    closesAt: new Date(Date.now() + 7200000).toISOString(),
    startsAt: new Date(Date.now() + 10800000).toISOString(),
  };
  assert.equal((await write(manager.cookie, "post", "/tournaments", createBody)).status, 201);
  assert.equal((await write(staff.cookie, "post", "/tournaments", createBody)).status, 403);
  assert.equal((await write(stranger.cookie, "post", "/tournaments", createBody)).status, 404);
  assert(await canManageTournament(db, t.id, manager.id));
  assert.equal(await canManageTournament(db, t.id, staff.id), false);
  assert.equal((await read(staff.cookie, `/organizations/${a.id}/analytics`)).status, 403);
  assert.equal((await read(manager.cookie, `/organizations/${a.id}/analytics`)).status, 200);
  assert.equal(
    (
      await write(manager.cookie, "post", `/organizations/${a.id}/invitations`, {
        recipient: stranger.username,
        role: "MEMBER",
      })
    ).status,
    403,
  );
  await assert.rejects(() =>
    inviteStaff(a.id, admin.id, { recipient: stranger.username, role: "ADMIN" }),
  );
  await assert.rejects(() => changeMember(a.id, admin.id, admin.id, "MANAGER"));
  assert.equal(
    (
      await write(admin.cookie, "put", `/tournaments/${t.id}/permissions/${stranger.id}`, {
        canManage: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(admin.cookie, "put", `/tournaments/${t.id}/permissions/${staff.id}`, {
        canManage: true,
      })
    ).status,
    200,
  );
  assert(await canManageTournament(db, t.id, staff.id));
  await changeMember(a.id, owner.id, manager.id, "MEMBER");
  assert.equal(await canManageTournament(db, t.id, manager.id), false);
  await removeMember(a.id, admin.id, staff.id);
  assert.equal((await read(staff.cookie, `/tournaments/${t.id}`)).status, 404);
  assert.equal(
    (
      await write(manager.cookie, "put", `/tournaments/${t.id}/permissions/${manager.id}`, {
        canManage: true,
      })
    ).status,
    404,
  );
  await assert.rejects(() => removeMember(a.id, owner.id, owner.id));
});
test("real analytics and CSV exclude other organizations and escape formula cells", async () => {
  const owner = await user(),
    foreign = await user(),
    a = await org(owner.id),
    b = await org(foreign.id),
    t = await event(a.id, owner.id),
    other = await event(b.id, foreign.id);
  await db.tournament.update({ where: { id: t.id }, data: { checkInRequired: true } });
  for (const [index, tournamentId] of [t.id, t.id, other.id].entries()) {
    const player = await user();
    const team = await db.team.create({
      data: {
        name: index === 0 ? '=HYPERLINK("bad")' : `Metric team ${index}`,
        game: "valorant",
        captainId: player.id,
      },
    });
    await db.tournamentRegistration.create({
      data: {
        tournamentId,
        teamId: team.id,
        status: index === 1 ? "PENDING" : "APPROVED",
        checkedInAt: index === 0 ? new Date() : null,
        roster: [{ id: player.id, username: player.username }],
      },
    });
  }
  const stats = await organizationAnalytics(a.id, owner.id, 30);
  assert.equal(stats.totals.tournaments, 1);
  assert.equal(stats.totals.registrations, 2);
  assert.equal(stats.totals.pendingApprovals, 1);
  assert.equal(stats.totals.participatingTeams, 1);
  assert.equal(stats.conversion.rate, 0.5);
  assert.equal(stats.attendance.rate, 1);
  assert.equal(
    stats.daily.reduce((n, r) => n + r.registrations, 0),
    2,
  );
  const exported = await read(owner.cookie, `/organizations/${a.id}/export.csv?days=30`);
  assert.equal(exported.status, 200);
  assert(exported.text.includes("\"'=HYPERLINK"));
  assert(!exported.text.includes(foreign.email));
  assert(
    await db.auditEvent.findFirst({
      where: { resourceId: a.id, action: "organization.analytics.exported" },
    }),
  );
  assert.equal(
    (await read(owner.cookie, `/organizations/${a.id}/analytics?days=10000`)).status,
    400,
  );
});
test("organization branding uses validated images and current profile/member access", async () => {
  const owner = await user(),
    staff = await user(),
    stranger = await user(),
    a = await org(owner.id);
  await join(a.id, owner, staff, "MEMBER");
  const objects = new Map<string, Buffer>();
  const storage = {
    put: async (k: string, b: Buffer) => {
      objects.set(k, b);
    },
    get: async (k: string) => objects.get(k)!,
    remove: async (k: string) => {
      objects.delete(k);
    },
  };
  const bytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#d3f45d" },
  })
    .png()
    .toBuffer();
  await assert.rejects(() => uploadImage(staff.id, { organizationId: a.id }, bytes, storage));
  await assert.rejects(() =>
    uploadImage(owner.id, { organizationId: a.id }, Buffer.from("not an image"), storage),
  );
  const asset = await uploadImage(owner.id, { organizationId: a.id }, bytes, storage);
  await assert.rejects(() => readImage(asset.id, undefined, storage));
  await assert.rejects(() => readImage(asset.id, stranger.id, storage));
  assert((await readImage(asset.id, staff.id, storage)).length > 0);
  await db.mediaAsset.update({ where: { id: asset.id }, data: { createdAt: new Date(0) } });
  await cleanupMedia(storage);
  assert(await db.mediaAsset.findUnique({ where: { id: asset.id } }));
  await removeMember(a.id, owner.id, staff.id);
  await assert.rejects(() => readImage(asset.id, staff.id, storage));
  await db.organization.update({ where: { id: a.id }, data: { publicProfile: true } });
  assert((await readImage(asset.id, undefined, storage)).length > 0);
});
test("invitation mail is retryable, idempotent after success and suppressed after cancellation", async () => {
  const owner = await user(),
    recipient = await user(),
    a = await org(owner.id);
  const invite = await inviteStaff(a.id, owner.id, {
    recipient: recipient.username,
    role: "MEMBER",
  });
  let calls = 0;
  const mail = {
    available: true,
    send: async (message: { to: string; messageId?: string }) => {
      assert.equal(message.to, recipient.email);
      assert(message.messageId);
      if (++calls === 1) throw Error("isolated SMTP failure");
    },
  };
  await assert.rejects(() => deliverInvitation(invite.id, mail));
  await deliverInvitation(invite.id, mail);
  await deliverInvitation(invite.id, mail);
  assert.equal(calls, 2);
  await cancelInvitation(a.id, invite.id, owner.id);
  const next = await inviteStaff(a.id, owner.id, { recipient: recipient.username, role: "MEMBER" });
  await cancelInvitation(a.id, next.id, owner.id);
  await deliverInvitation(next.id, mail);
  assert.equal(calls, 2);
});

test("removed organization creators cannot read pending public-event entries or receive organizer notifications", async () => {
  const owner = await user(),
    creator = await user(),
    player = await user(),
    a = await org(owner.id);
  await join(a.id, owner, creator, "MANAGER");
  const t = await event(a.id, creator.id, "PUBLIC");
  await removeMember(a.id, owner.id, creator.id);
  const team = await db.team.create({
    data: { name: "Private pending entry", game: "valorant", captainId: player.id },
  });
  await db.tournamentRegistration.create({
    data: {
      tournamentId: t.id,
      teamId: team.id,
      roster: [{ id: player.id, username: player.username }],
    },
  });
  const detail = await read(creator.cookie, `/tournaments/${t.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.canManage, false);
  assert.equal(detail.body.registrations.length, 0);
  const { processEvent } = await import("../../apps/api/src/modules/notifications/delivery.js");
  const outbox = await db.notificationEvent.findFirstOrThrow({
    where: { tournamentId: t.id, kind: "REGISTRATION" },
  });
  await processEvent(outbox.id);
  assert.equal(
    await db.notification.count({ where: { eventId: outbox.id, userId: creator.id } }),
    0,
  );
});

test("organization invitation queue persists dispatch and retries delivery through the shared worker", async () => {
  const { startNotifications } = await import("../../apps/api/src/modules/notifications/worker.js");
  const { enqueueInvitations } =
    await import("../../apps/api/src/modules/organizations/invitation-mail.js");
  const owner = await user(),
    target = await user(),
    a = await org(owner.id);
  const invitation = await inviteStaff(a.id, owner.id, {
    recipient: target.username,
    role: "MEMBER",
  });
  const schema = `jobs_test_${randomBytes(5).toString("hex")}`;
  let attempts = 0;
  const worker = await startNotifications({
    schema,
    retryDelay: 1,
    retryLimit: 2,
    intervalMs: 100,
    mail: {
      available: true,
      send: async (message) => {
        if (message.to !== target.email) return;
        if (++attempts === 1) throw Error("Fixture SMTP retry");
      },
    },
  });
  try {
    await enqueueInvitations(worker.boss);
    const deadline = Date.now() + 20000;
    while (
      Date.now() < deadline &&
      (await db.organizationInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
        .emailState !== "SENT"
    )
      await new Promise((r) => setTimeout(r, 100));
    assert.equal(
      (await db.organizationInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
        .emailState,
      "SENT",
    );
    assert.equal(attempts, 2);
  } finally {
    await worker.stop();
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }
});

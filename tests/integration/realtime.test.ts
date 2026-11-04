import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { db, transaction } from "../../apps/api/src/database/client.js";
import { app } from "../../apps/api/src/app.js";
import { attachRealtime } from "../../apps/api/src/modules/realtime/server.js";
import { startNotifications } from "../../apps/api/src/modules/notifications/worker.js";
import {
  processEvent,
  scheduleReminders,
  enqueuePending,
  EVENT_QUEUE,
  MAIL_QUEUE,
  DEAD_QUEUE,
} from "../../apps/api/src/modules/notifications/delivery.js";
import {
  listNotifications,
  markRead,
  savePreferences,
} from "../../apps/api/src/modules/notifications/service.js";
import { publishLiveScore } from "../../apps/api/src/modules/matches/live-score.js";
async function waitFor(predicate: () => Promise<boolean>, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail("Timed out waiting for persisted state");
}
async function user() {
  const tag = randomBytes(5).toString("hex");
  const u = await db.user.create({
    data: {
      username: `live_${tag}`,
      email: `live_${tag}@test.invalid`,
      role: "PLAYER",
      emailVerifiedAt: new Date(),
    },
  });
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  await db.session.create({
    data: {
      tokenHash: hash,
      userId: u.id,
      expiresAt: new Date(Date.now() + 3600000),
      authenticatedAt: new Date(),
    },
  });
  return { ...u, cookie: `matchflow_session=${token}`, hash };
}
async function event(ownerId: string, visibility: "PUBLIC" | "PRIVATE" = "PUBLIC") {
  return db.tournament.create({
    data: {
      name: "Live verification event",
      description: "Real-time integration fixture",
      rules: "Server-confirmed results only",
      game: "valorant",
      teamSize: 1,
      maxTeams: 4,
      organizerId: ownerId,
      opensAt: new Date(Date.now() - 3600000),
      closesAt: new Date(Date.now() + 3600000),
      startsAt: new Date(Date.now() + 7200000),
      visibility,
    },
  });
}
async function server() {
  const http = createServer(app),
    live = attachRealtime(http, { intervalMs: 100 });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  assert(address && typeof address !== "string");
  return { url: `http://127.0.0.1:${address.port}`, close: live.close };
}
function connect(url: string, cookie?: string, origin = "http://localhost:5173") {
  return io(url, {
    path: "/api/realtime",
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
  });
}
const connected = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
const subscribe = (socket: Socket, tournamentId: string) =>
  socket.timeout(3000).emitWithAck("subscribe", { tournamentId }) as Promise<{
    ok: boolean;
    version?: string;
  }>;
after(() => db.$disconnect());
test("socket authentication, private subscriptions, organization revocation and expired sessions are enforced", async () => {
  const host = await user(),
    stranger = await user(),
    staff = await user();
  const t = await event(host.id, "PRIVATE");
  const s = await server();
  const clients: Socket[] = [];
  try {
    for (const [cookie, origin] of [
      [undefined, "http://localhost:5173"],
      [host.cookie, "https://attacker.invalid"],
    ]) {
      const c = connect(s.url, cookie, origin);
      clients.push(c);
      await assert.rejects(() => connected(c));
    }
    const foreign = connect(s.url, stranger.cookie),
      owner = connect(s.url, host.cookie);
    clients.push(foreign, owner);
    await Promise.all([connected(foreign), connected(owner)]);
    assert.equal((await subscribe(foreign, t.id)).ok, false);
    assert.equal((await subscribe(owner, t.id)).ok, true);
    assert.equal(
      (await owner.timeout(3000).emitWithAck("subscribe", { tournamentId: t.id, userId: host.id }))
        .ok,
      false,
    );
    const organization = await db.organization.create({
      data: {
        name: "Private organization",
        ownerId: host.id,
        members: { create: { userId: staff.id, role: "ADMIN" } },
      },
    });
    await db.tournament.update({ where: { id: t.id }, data: { organizationId: organization.id } });
    const member = connect(s.url, staff.cookie);
    clients.push(member);
    await connected(member);
    assert.equal((await subscribe(member, t.id)).ok, true);
    const revoked = new Promise<void>((resolve) =>
      member.once("subscription-revoked", () => resolve()),
    );
    await db.organizationMember.deleteMany({
      where: { organizationId: organization.id, userId: staff.id },
    });
    await revoked;
    assert.equal((await subscribe(member, t.id)).ok, false);
    const disconnect = new Promise<void>((resolve) => owner.once("disconnect", () => resolve()));
    await db.session.delete({ where: { tokenHash: host.hash } });
    await disconnect;
    assert.equal(owner.connected, false);
  } finally {
    clients.forEach((c) => c.disconnect());
    await s.close();
  }
});
test("two API instances see committed ordered revisions and reconnect catches missed changes without score commands", async () => {
  const host = await user(),
    t = await event(host.id),
    a = await server(),
    b = await server();
  const one = connect(a.url, host.cookie),
    two = connect(b.url, host.cookie);
  let reconnect: Socket | undefined;
  try {
    await Promise.all([connected(one), connected(two)]);
    await Promise.all([subscribe(one, t.id), subscribe(two, t.id)]);
    const initial = (await db.liveRevision.findUniqueOrThrow({ where: { tournamentId: t.id } }))
      .version;
    await assert.rejects(() =>
      transaction(async (tx) => {
        await tx.tournament.update({ where: { id: t.id }, data: { name: "Rolled back title" } });
        throw Error("Rollback");
      }),
    );
    assert.equal(
      (await db.liveRevision.findUniqueOrThrow({ where: { tournamentId: t.id } })).version,
      initial,
    );
    const versions: [string[], string[]] = [[], []];
    [one, two].forEach((socket, i) =>
      socket.on("changed", (signal) => {
        if (signal.topic === "tournament" && !signal.resync) {
          assert.deepEqual(Object.keys(signal).sort(), ["id", "topic", "version"]);
          versions[i].push(signal.version);
        }
      }),
    );
    await db.tournament.update({ where: { id: t.id }, data: { name: "Committed title" } });
    await waitFor(async () => versions.every((v) => v.length > 0));
    assert.equal(versions[0].at(-1), versions[1].at(-1));
    one.disconnect();
    await db.tournamentAnnouncement.create({
      data: {
        tournamentId: t.id,
        title: "Missed announcement",
        body: "Reconnect must recover this committed update.",
      },
    });
    reconnect = connect(a.url, host.cookie);
    await connected(reconnect);
    const recovered = await subscribe(reconnect, t.id);
    assert(BigInt(recovered.version!) > BigInt(versions[0].at(-1)!));
    reconnect.emit("score", { tournamentId: t.id, scoreA: 999, winnerId: host.id });
    assert.equal(await db.matchResult.count({ where: { match: { tournamentId: t.id } } }), 0);
  } finally {
    one.disconnect();
    two.disconnect();
    reconnect?.disconnect();
    await Promise.all([a.close(), b.close()]);
  }
});
test("notification creation is idempotent, private inboxes are isolated, preferences and reminders are authoritative", async () => {
  const host = await user(),
    player = await user(),
    foreign = await user(),
    t = await event(host.id, "PRIVATE");
  const team = await db.team.create({
    data: { name: "Reminder team", game: "valorant", captainId: player.id },
  });
  const entry = await db.tournamentRegistration.create({
    data: {
      tournamentId: t.id,
      teamId: team.id,
      status: "APPROVED",
      roster: [{ id: player.id, username: player.username }],
    },
  });
  const outbox = await db.notificationEvent.findFirstOrThrow({
    where: { tournamentId: t.id, kind: "REGISTRATION" },
  });
  assert(!JSON.stringify(outbox.payload).includes(player.username));
  await Promise.all([processEvent(outbox.id), processEvent(outbox.id)]);
  assert.equal(
    await db.notification.count({ where: { eventId: outbox.id, userId: player.id } }),
    1,
  );
  const inbox = await listNotifications(player.id);
  const notification = inbox.items.find((n) => n.tournamentId === t.id)!;
  assert(notification);
  assert.equal((await listNotifications(foreign.id)).items.length, 0);
  await assert.rejects(() => markRead(foreign.id, notification.id));
  await markRead(player.id, notification.id);
  assert.equal((await listNotifications(player.id)).unread, 0);
  assert.equal((await request(app).get("/api/notifications")).status, 401);
  assert.equal(
    (
      await request(app)
        .post(`/api/notifications/${notification.id}/read`)
        .set("Cookie", foreign.cookie)
        .set("Origin", "http://localhost:5173")
        .set("X-MatchFlow", "1")
        .send({})
    ).status,
    404,
  );
  await savePreferences(player.id, { inApp: false, email: false, mutedKinds: [] });
  const announcement = await db.tournamentAnnouncement.create({
    data: {
      tournamentId: t.id,
      title: "Preferences apply",
      body: "Do not notify an opted-out participant.",
    },
  });
  const message = await db.notificationEvent.findFirstOrThrow({
    where: { resourceId: announcement.id },
  });
  await processEvent(message.id);
  assert.equal(
    await db.notification.count({ where: { eventId: message.id, userId: player.id } }),
    0,
  );
  await db.tournament.update({
    where: { id: t.id },
    data: {
      checkInRequired: true,
      phase: "CHECK_IN",
      opensAt: new Date(Date.now() - 3 * 3600000),
      closesAt: new Date(Date.now() - 3600000),
      startsAt: new Date(Date.now() + 29 * 60000),
    },
  });
  await Promise.all([scheduleReminders(), scheduleReminders()]);
  assert.equal(
    await db.notificationEvent.count({ where: { tournamentId: t.id, kind: "CHECK_IN" } }),
    2,
  );
  await db.tournamentRegistration.update({
    where: { id: entry.id },
    data: { checkedInAt: new Date() },
  });
  for (const e of await db.notificationEvent.findMany({
    where: { tournamentId: t.id, kind: "CHECK_IN" },
  }))
    await processEvent(e.id);
  assert.equal(await db.notification.count({ where: { tournamentId: t.id, kind: "CHECK_IN" } }), 0);
});
test("durable queue retries email, dead-letters failures and coordinates duplicate workers", async () => {
  await db.notificationEvent.deleteMany();
  const host = await user(),
    t = await event(host.id);
  const schema = `jobs_test_${randomBytes(5).toString("hex")}`;
  const attempts = new Map<string, number>();
  let fail = false;
  const mail = {
    available: true,
    send: async (message: { to: string; messageId?: string }) => {
      if (message.to !== host.email) return;
      const key = message.messageId!;
      assert(key);
      const attempt = (attempts.get(key) || 0) + 1;
      attempts.set(key, attempt);
      if (fail || attempt < 2) throw Error("Fixture SMTP failure");
    },
  };
  const a = await startNotifications({
      schema,
      mail,
      retryDelay: 1,
      retryLimit: 1,
      intervalMs: 100,
    }),
    b = await startNotifications({ schema, mail, retryDelay: 1, retryLimit: 1, intervalMs: 100 });
  try {
    const announcement = await db.tournamentAnnouncement.create({
      data: {
        tournamentId: t.id,
        title: "Retry delivery",
        body: "This message must survive an SMTP failure.",
      },
    });
    await enqueuePending(a.boss, true);
    await waitFor(
      async () =>
        Boolean(
          await db.notification.findFirst({
            where: { resourceId: announcement.id, userId: host.id, emailState: "SENT" },
          }),
        ),
      20000,
    );
    const n = await db.notification.findFirstOrThrow({
      where: { resourceId: announcement.id, userId: host.id },
    });
    assert.equal(attempts.get(`<matchflow-${n.id}@localhost>`), 2);
    assert.equal(
      await db.notification.count({ where: { resourceId: announcement.id, userId: host.id } }),
      1,
    );
    fail = true;
    const doomed = await db.tournamentAnnouncement.create({
      data: {
        tournamentId: t.id,
        title: "Dead letter delivery",
        body: "Exhaust retries without an infinite resend loop.",
      },
    });
    await waitFor(
      async () =>
        Boolean(
          await db.notification.findFirst({
            where: { resourceId: doomed.id, userId: host.id, emailState: "DEAD" },
          }),
        ),
      20000,
    );
    await waitFor(async () => (await a.boss.findJobs(DEAD_QUEUE)).length > 0);
    const dead = await a.boss.findJobs(DEAD_QUEUE);
    assert(dead.some((job) => job.sourceName === MAIL_QUEUE));
    fail = false;
    const delivery = await db.notification.findFirstOrThrow({
      where: { resourceId: doomed.id, userId: host.id },
    });
    await a.boss.redrive(DEAD_QUEUE, {
      sourceName: MAIL_QUEUE,
      data: { notificationId: delivery.id },
    });
    await waitFor(
      async () =>
        (await db.notification.findUniqueOrThrow({ where: { id: delivery.id } })).emailState ===
        "SENT",
      20000,
    );
    assert(await a.boss.getQueue(EVENT_QUEUE));
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }
});
test("provisional live scores never progress brackets and reject stale/foreign writers", async () => {
  const { generateBracket } = await import("../../apps/api/src/modules/brackets/service.js");
  const { confirmResult } = await import("../../apps/api/src/modules/matches/service.js");
  const host = await user(),
    foreign = await user(),
    t = await event(host.id);
  for (const p of [host, foreign]) {
    const team = await db.team.create({
      data: { name: p.username, game: "valorant", captainId: p.id },
    });
    await db.tournamentRegistration.create({
      data: {
        tournamentId: t.id,
        teamId: team.id,
        status: "APPROVED",
        roster: [{ id: p.id, username: p.username }],
      },
    });
  }
  const [m] = await generateBracket(t.id, host.id);
  await publishLiveScore(t.id, m.id, host.id, { scoreA: 1, scoreB: 1, expectedVersion: m.version });
  assert.equal(await db.matchResult.count({ where: { matchId: m.id } }), 0);
  assert.equal((await db.tournament.findUniqueOrThrow({ where: { id: t.id } })).championId, null);
  await assert.rejects(() =>
    publishLiveScore(t.id, m.id, foreign.id, {
      scoreA: 9,
      scoreB: 0,
      expectedVersion: m.version + 1,
    }),
  );
  await assert.rejects(
    () =>
      publishLiveScore(t.id, m.id, host.id, { scoreA: 9, scoreB: 0, expectedVersion: m.version }),
    /changed/,
  );
  await confirmResult(t.id, m.id, host.id, { scoreA: 2, scoreB: 1, outcome: "PLAYED", reason: "" });
  const completed = await db.match.findUniqueOrThrow({ where: { id: m.id } });
  assert.equal(completed.liveScoreA, null);
  await assert.rejects(() =>
    publishLiveScore(t.id, m.id, host.id, {
      scoreA: 3,
      scoreB: 1,
      expectedVersion: completed.version,
    }),
  );
});

test("private share rotation, expired sessions and concurrent subscription limits fail closed", async () => {
  const host = await user(),
    viewer = await user();
  const t = await event(host.id, "PRIVATE");
  const token = randomBytes(32).toString("hex");
  await db.tournament.update({
    where: { id: t.id },
    data: { shareTokenHash: createHash("sha256").update(token).digest("hex") },
  });
  const s = await server();
  const client = connect(s.url, `${viewer.cookie}; mf_event_${t.id}=${token}`);
  try {
    await connected(client);
    assert.equal((await subscribe(client, t.id)).ok, true);
    const revoked = new Promise<void>((resolve) =>
      client.once("subscription-revoked", () => resolve()),
    );
    await db.tournament.update({ where: { id: t.id }, data: { shareTokenHash: null } });
    await revoked;
    assert.equal((await subscribe(client, t.id)).ok, false);
    const events = await Promise.all(Array.from({ length: 12 }, () => event(host.id)));
    const subscriptions = await Promise.all(
      events.map((tournament) => subscribe(client, tournament.id)),
    );
    assert.equal(subscriptions.filter((result) => result.ok).length, 8);
    const disconnected = new Promise<void>((resolve) => client.once("disconnect", () => resolve()));
    await db.session.update({
      where: { tokenHash: viewer.hash },
      data: { expiresAt: new Date(0) },
    });
    await disconnected;
    const expired = connect(s.url, viewer.cookie);
    try {
      await assert.rejects(() => connected(expired));
    } finally {
      expired.disconnect();
    }
  } finally {
    client.disconnect();
    await s.close();
  }
});

test("queued email rechecks preferences and revoked private permissions before SMTP", async () => {
  const { deliverEmail } = await import("../../apps/api/src/modules/notifications/delivery.js");
  const host = await user(),
    staff = await user(),
    t = await event(host.id, "PRIVATE");
  const organization = await db.organization.create({
    data: {
      name: "Mail access",
      ownerId: host.id,
      members: { create: { userId: staff.id, role: "ADMIN" } },
    },
  });
  await db.tournament.update({ where: { id: t.id }, data: { organizationId: organization.id } });
  const announcement = await db.tournamentAnnouncement.create({
    data: {
      tournamentId: t.id,
      title: "Private update",
      body: "Current permissions apply at delivery.",
    },
  });
  const eventRow = await db.notificationEvent.findFirstOrThrow({
    where: { resourceId: announcement.id },
  });
  await processEvent(eventRow.id);
  const deliveries = await db.notification.findMany({ where: { eventId: eventRow.id } });
  assert.equal(deliveries.length, 2);
  await savePreferences(host.id, { inApp: true, email: false, mutedKinds: [] });
  await db.organizationMember.deleteMany({
    where: { organizationId: organization.id, userId: staff.id },
  });
  let sent = 0;
  for (const delivery of deliveries)
    await deliverEmail(delivery.id, {
      available: true,
      send: async () => {
        sent++;
      },
    });
  assert.equal(sent, 0);
  assert.equal(
    await db.notification.count({ where: { eventId: eventRow.id, emailState: "SKIPPED" } }),
    2,
  );
  assert.equal((await listNotifications(staff.id)).items.length, 0);
});

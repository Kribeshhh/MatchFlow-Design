import express from "express";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
import { healthRouter } from "../../apps/api/src/http/health.js";
import { validateResponse } from "../../packages/shared/src/responses.js";
after(async () => {
  await db.$disconnect();
});
const stamp = randomBytes(4).toString("hex");
const password = randomBytes(24).toString("hex");
type Agent = ReturnType<typeof request.agent>;
const write = (a: Agent, method: "post" | "patch" | "delete", path: string, body: object = {}) =>
  a[method]("/api" + path)
    .set("Origin", "http://localhost:5173")
    .set("X-MatchFlow", "1")
    .send(body);

async function account(n: string, role = "PLAYER") {
  const agent = request.agent(app),
    username = `audit_${stamp}_${n}`;
  const r = await write(agent, "post", "/auth/register", {
    username,
    email: `${username}@test.invalid`,
    password,
    role,
  });
  assert.equal(r.status, 201);
  await db.user.update({ where: { id: r.body.user.id }, data: { emailVerifiedAt: new Date() } });
  const person = { agent, user: r.body.user };
  return person;
}
async function acceptInvite(client: Agent, teamId: string) {
  const inbox = await client.get("/api/team-invitations");
  const invitation = inbox.body.find((i: { teamId: string }) => i.teamId === teamId);
  assert.ok(invitation, "invitation must exist before joining");
  assert.equal(
    (await write(client, "post", `/team-invitations/${invitation.id}/respond`, { accept: true }))
      .status,
    200,
  );
}
test("snapshot history, private entry metadata and atomic stage/result/audit persistence", async () => {
  const owner = await account("host", "ORGANIZER");
  const a = await account("a"),
    b = await account("b"),
    c = await account("c"),
    d = await account("d"),
    newcomer = await account("new");
  const teamA = (await write(a.agent, "post", "/teams", { name: `Audit A ${stamp}`, game: "pubg" }))
    .body;
  const teamB = (await write(c.agent, "post", "/teams", { name: `Audit B ${stamp}`, game: "pubg" }))
    .body;
  assert.equal(
    (await write(a.agent, "post", `/teams/${teamA.id}/members`, { userId: b.user.id })).status,
    201,
  );
  assert.equal(
    (await write(c.agent, "post", `/teams/${teamB.id}/members`, { userId: d.user.id })).status,
    201,
  );
  await acceptInvite(b.agent, teamA.id);
  await acceptInvite(d.agent, teamB.id);
  const eventData = {
    name: `Audit ${stamp}`,
    game: "pubg",
    description: "Temporary audit fixture in the test database only.",
    rules: "Audit fixture rules for single elimination.",
    teamSize: 2,
    maxTeams: 2,
    opensAt: new Date(Date.now() - 60000).toISOString(),
    closesAt: new Date(Date.now() + 60000).toISOString(),
    startsAt: new Date(Date.now() + 120000).toISOString(),
  };
  const event = (await write(owner.agent, "post", "/tournaments", eventData)).body;
  const regA = (
    await write(a.agent, "post", `/tournaments/${event.id}/registrations`, { teamId: teamA.id })
  ).body;
  const regB = (
    await write(c.agent, "post", `/tournaments/${event.id}/registrations`, { teamId: teamB.id })
  ).body;
  const dashboard = await a.agent.get("/api/dashboard");
  validateResponse("/dashboard", "GET", dashboard.body);
  const leaked = dashboard.body.tournaments
    .find((t: any) => t.id === event.id)
    .registrations.some((r: any) => r.id === regB.id && r.status === "PENDING");
  assert.equal(leaked, false);
  assert.equal(
    dashboard.body.tournaments.find((t: any) => t.id === event.id).registrations.length,
    1,
  );
  for (const reg of [regA, regB])
    assert.equal(
      (
        await write(owner.agent, "patch", `/tournaments/${event.id}/registrations/${reg.id}`, {
          status: "APPROVED",
        })
      ).status,
      200,
    );
  const matches = (await write(owner.agent, "post", `/tournaments/${event.id}/bracket`)).body;
  assert.equal(
    (
      await write(owner.agent, "post", `/tournaments/${event.id}/matches/${matches[0].id}/result`, {
        scoreA: 2,
        scoreB: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (await write(a.agent, "delete", `/teams/${teamA.id}/members/${b.user.id}`)).status,
    200,
  );
  assert.equal(
    (await write(a.agent, "post", `/teams/${teamA.id}/members`, { userId: newcomer.user.id }))
      .status,
    201,
  );
  await acceptInvite(newcomer.agent, teamA.id);
  const oldDash = (await b.agent.get("/api/dashboard")).body;
  const newDash = (await newcomer.agent.get("/api/dashboard")).body;
  assert.ok(oldDash.tournaments.some((t: any) => t.id === event.id));
  assert.ok(!newDash.tournaments.some((t: any) => t.id === event.id));
  assert.ok(!newDash.recentResults.some((m: any) => m.tournamentId === event.id));
  const publicEvent = (await request(app).get(`/api/tournaments/${event.id}`)).body;
  validateResponse(`/tournaments/${event.id}`, "GET", publicEvent);
  const publicEntry = publicEvent.registrations.find((r: any) => r.teamId === teamA.id);
  assert.ok(!publicEntry.team.members.some((p: any) => p.userId === newcomer.user.id));
  assert.ok(publicEntry.team.members.some((p: any) => p.userId === b.user.id));
  assert.equal(await db.matchResult.count({ where: { matchId: matches[0].id } }), 1);
  assert.equal(await db.tournamentStage.count({ where: { tournamentId: event.id } }), 1);
  assert.equal(
    await db.auditEvent.count({
      where: { resourceId: matches[0].id, action: "match.result.recorded" },
    }),
    1,
  );
  assert.equal(
    (
      await write(owner.agent, "post", `/tournaments/${event.id}/matches/${matches[0].id}/result`, {
        scoreA: 1,
        scoreB: 3,
      })
    ).status,
    400,
  );
  assert.equal(await db.matchResult.count({ where: { matchId: matches[0].id } }), 1);
});

test("HTTP security foundation: correlation, size, CORS, no-store and health", async () => {
  const live = await request(app).get("/api/live");
  assert.equal(live.status, 200);
  assert.ok(live.headers["x-request-id"]);
  assert.ok(live.headers["x-content-type-options"]);
  assert.equal((await request(app).get("/api/ready")).status, 200);
  const anonymous = await request(app).get("/api/dashboard");
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers["cache-control"], "no-store");
  const forbidden = await request(app)
    .get("/api/tournaments")
    .set("Origin", "https://untrusted.invalid");
  assert.equal(forbidden.status, 403);
  const large = await request(app)
    .post("/api/auth/login")
    .set("X-MatchFlow", "1")
    .send({ password: "x".repeat(70000) });
  assert.equal(large.status, 413);
  assert.equal(large.body.requestId, large.headers["x-request-id"]);
  assert.ok(!("stack" in large.body));
  const malformed = await request(app)
    .post("/api/auth/login")
    .set("X-MatchFlow", "1")
    .set("Content-Type", "application/json")
    .send("{");
  assert.equal(malformed.status, 400);
  const missing = await request(app).get("/api/not-a-route");
  assert.equal(missing.status, 404);
  assert.match(missing.headers["content-type"], /json/);
});
test("readiness rejects shutdown or unavailable dependencies while liveness remains healthy", async () => {
  const stopping = express().use(healthRouter(() => true));
  assert.equal((await request(stopping).get("/ready")).status, 503);
  assert.equal((await request(stopping).get("/live")).status, 200);
  const broken = express().use(
    healthRouter(
      () => false,
      async () => {
        throw new Error("private database address");
      },
    ),
  );
  const r = await request(broken).get("/ready");
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { status: "unavailable" });
});

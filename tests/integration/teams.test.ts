import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import request from "supertest";
import { app } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
type Agent = ReturnType<typeof request.agent>;
const write = (a: Agent, method: "post" | "patch" | "delete", path: string, body: object = {}) =>
  a[method]("/api" + path)
    .set("X-MatchFlow", "1")
    .set("Origin", "http://localhost:5173")
    .send(body);
async function account() {
  const agent = request.agent(app),
    username = `team_${randomBytes(6).toString("hex")}`;
  const response = await write(agent, "post", "/auth/register", {
    username,
    email: `${username}@test.invalid`,
    password: randomBytes(24).toString("hex"),
  });
  assert.equal(response.status, 201);
  await db.user.update({
    where: { id: response.body.user.id },
    data: { emailVerifiedAt: new Date() },
  });
  return { agent, id: response.body.user.id as string };
}
after(async () => db.$disconnect());
test("team invitation consent, replay, expiry, rejection, cancellation and cross-user isolation", async () => {
  const owner = await account(),
    player = await account(),
    outsider = await account();
  const team = (
    await write(owner.agent, "post", "/teams", { name: "Consent test", game: "valorant" })
  ).body;
  assert.equal(
    (await write(outsider.agent, "post", `/teams/${team.id}/members`, { userId: player.id }))
      .status,
    403,
  );
  const invite = await write(owner.agent, "post", `/teams/${team.id}/members`, {
    userId: player.id,
  });
  assert.equal(invite.status, 201);
  assert.equal(await db.teamMember.count({ where: { teamId: team.id } }), 1);
  assert.equal((await outsider.agent.get(`/api/teams/${team.id}/invitations`)).status, 403);
  assert.equal(
    (
      await write(outsider.agent, "post", `/team-invitations/${invite.body.id}/respond`, {
        accept: true,
      })
    ).status,
    404,
  );
  assert.equal(
    (await write(owner.agent, "post", `/teams/${team.id}/members`, { userId: player.id })).status,
    409,
  );
  assert.equal(
    (
      await write(player.agent, "post", `/team-invitations/${invite.body.id}/respond`, {
        accept: false,
      })
    ).status,
    200,
  );
  assert.equal(await db.teamMember.count({ where: { teamId: team.id } }), 1);
  const renewed = await write(owner.agent, "post", `/teams/${team.id}/members`, {
    userId: player.id,
  });
  await db.teamInvitation.update({
    where: { id: renewed.body.id },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (
      await write(player.agent, "post", `/team-invitations/${renewed.body.id}/respond`, {
        accept: true,
      })
    ).status,
    409,
  );
  const current = await write(owner.agent, "post", `/teams/${team.id}/members`, {
    userId: player.id,
  });
  const accepts = await Promise.all(
    [1, 2].map(() =>
      write(player.agent, "post", `/team-invitations/${current.body.id}/respond`, { accept: true }),
    ),
  );
  assert.deepEqual(accepts.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await db.teamMember.count({ where: { teamId: team.id, userId: player.id } }), 1);
  const pending = await write(owner.agent, "post", `/teams/${team.id}/members`, {
    userId: outsider.id,
  });
  assert.equal(
    (await write(owner.agent, "delete", `/teams/${team.id}/invitations/${pending.body.id}`)).status,
    200,
  );
  assert.equal(
    (
      await write(outsider.agent, "post", `/team-invitations/${pending.body.id}/respond`, {
        accept: true,
      })
    ).status,
    409,
  );
});
test("manager limits, two-party captain transfer, old-owner denial, leaving and archival", async () => {
  const owner = await account(),
    player = await account(),
    outsider = await account();
  const team = (await write(owner.agent, "post", "/teams", { name: "Transfer test", game: "cs2" }))
    .body;
  const invitation = (
    await write(owner.agent, "post", `/teams/${team.id}/members`, { userId: player.id })
  ).body;
  await write(player.agent, "post", `/team-invitations/${invitation.id}/respond`, { accept: true });
  assert.equal(
    (
      await write(player.agent, "patch", `/teams/${team.id}/members/${player.id}`, {
        manager: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(owner.agent, "patch", `/teams/${team.id}/members/${player.id}`, {
        manager: true,
        substitute: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await write(player.agent, "post", `/teams/${team.id}/transfer`, { userId: owner.id })).status,
    403,
  );
  assert.equal(
    (await write(player.agent, "delete", `/teams/${team.id}/members/${owner.id}`)).status,
    400,
  );
  assert.equal(
    (await write(owner.agent, "post", `/teams/${team.id}/transfer`, { userId: outsider.id }))
      .status,
    400,
  );
  assert.equal(
    (await write(owner.agent, "post", `/teams/${team.id}/transfer`, { userId: player.id })).status,
    200,
  );
  assert.equal((await db.team.findUniqueOrThrow({ where: { id: team.id } })).captainId, owner.id);
  assert.equal(
    (await write(outsider.agent, "post", `/teams/${team.id}/transfer/respond`, { accept: true }))
      .status,
    403,
  );
  const attempts = await Promise.all(
    [1, 2].map(() =>
      write(player.agent, "post", `/teams/${team.id}/transfer/respond`, { accept: true }),
    ),
  );
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 403]);
  assert.equal((await db.team.findUniqueOrThrow({ where: { id: team.id } })).captainId, player.id);
  assert.equal((await write(owner.agent, "post", `/teams/${team.id}/archive`)).status, 403);
  assert.equal((await write(owner.agent, "post", `/teams/${team.id}/leave`)).status, 200);
  assert.equal((await write(player.agent, "post", `/teams/${team.id}/archive`)).status, 200);
  assert.equal(
    (await write(player.agent, "post", `/teams/${team.id}/members`, { userId: outsider.id }))
      .status,
    400,
  );
});
test("substitutes are excluded from frozen registration snapshots and managers can submit", async () => {
  const owner = await account(),
    player = await account(),
    reserve = await account();
  const team = (
    await write(owner.agent, "post", "/teams", { name: "Snapshot crew", game: "valorant" })
  ).body;
  for (const person of [player, reserve]) {
    const invitation = (
      await write(owner.agent, "post", `/teams/${team.id}/members`, { userId: person.id })
    ).body;
    assert.equal(
      (
        await write(person.agent, "post", `/team-invitations/${invitation.id}/respond`, {
          accept: true,
        })
      ).status,
      200,
    );
  }
  await write(owner.agent, "patch", `/teams/${team.id}/members/${player.id}`, { manager: true });
  await write(owner.agent, "patch", `/teams/${team.id}/members/${reserve.id}`, {
    substitute: true,
  });
  const event = await write(owner.agent, "post", "/tournaments", {
    name: "Snapshot test tournament",
    game: "valorant",
    description: "Test-only event for immutable roster snapshots.",
    rules: "Single elimination, starting roster only.",
    teamSize: 2,
    maxTeams: 2,
    opensAt: new Date(Date.now() - 60000).toISOString(),
    closesAt: new Date(Date.now() + 60000).toISOString(),
    startsAt: new Date(Date.now() + 120000).toISOString(),
  });
  assert.equal(event.status, 201);
  const registration = await write(
    player.agent,
    "post",
    `/tournaments/${event.body.id}/registrations`,
    { teamId: team.id },
  );
  assert.equal(registration.status, 201);
  assert.deepEqual(
    registration.body.roster.map((p: { id: string }) => p.id).sort(),
    [owner.id, player.id].sort(),
  );
  assert.equal(
    (
      await write(owner.agent, "patch", `/teams/${team.id}/members/${reserve.id}`, {
        substitute: false,
      })
    ).status,
    200,
  );
  assert.equal((await write(player.agent, "post", `/teams/${team.id}/leave`)).status, 200);
  assert.equal((await write(owner.agent, "post", `/teams/${team.id}/archive`)).status, 400);
  await write(
    owner.agent,
    "patch",
    `/tournaments/${event.body.id}/registrations/${registration.body.id}`,
    { status: "APPROVED" },
  );
  assert.equal(
    (await reserve.agent.get(`/api/teams/${team.id}/history`)).body.statistics.tournaments,
    1,
  );
  const entry = await db.tournamentRegistration.findUniqueOrThrow({
    where: { id: registration.body.id },
  });
  assert.deepEqual(entry.roster, registration.body.roster);
});
test("roster replacements need organizer approval before deadline, isolate entries and preserve frozen history", async () => {
  const organizer = await account(),
    captain = await account(),
    player = await account(),
    replacement = await account(),
    stranger = await account();
  const team = (
    await write(captain.agent, "post", "/teams", { name: "Reusable roster", game: "cs2" })
  ).body;
  async function join(person: typeof player) {
    const i = (
      await write(captain.agent, "post", `/teams/${team.id}/members`, { userId: person.id })
    ).body;
    assert.equal(
      (await write(person.agent, "post", `/team-invitations/${i.id}/respond`, { accept: true }))
        .status,
      200,
    );
  }
  await join(player);
  const event = (
    await write(organizer.agent, "post", "/tournaments", {
      name: "Roster approvals",
      game: "cs2",
      description: "Real integration fixture with approved roster changes.",
      rules: "Starting roster changes need organizer approval before close.",
      teamSize: 2,
      maxTeams: 4,
      opensAt: new Date(Date.now() - 60000).toISOString(),
      closesAt: new Date(Date.now() + 60000).toISOString(),
      startsAt: new Date(Date.now() + 120000).toISOString(),
    })
  ).body;
  const entry = (
    await write(captain.agent, "post", `/tournaments/${event.id}/registrations`, {
      teamId: team.id,
    })
  ).body;
  const path = `/tournaments/${event.id}/registrations/${entry.id}/roster`;
  await write(organizer.agent, "patch", `/tournaments/${event.id}/registrations/${entry.id}`, {
    status: "APPROVED",
  });
  await write(player.agent, "post", `/teams/${team.id}/leave`);
  await join(replacement);
  assert.deepEqual(
    (await db.tournamentRegistration.findUniqueOrThrow({ where: { id: entry.id } })).roster,
    entry.roster,
  );
  assert.equal((await write(stranger.agent, "post", path)).status, 403);
  assert.equal((await write(captain.agent, "post", path)).status, 200);
  assert.equal((await write(captain.agent, "patch", path, { approve: true })).status, 403);
  assert.equal(
    (await write(organizer.agent, "patch", path.replace(event.id, "cforeign"), { approve: true }))
      .status,
    404,
  );
  const publicEntry = (await request(app).get(`/api/tournaments/${event.id}`)).body
    .registrations[0];
  assert.ok(!("proposedRoster" in publicEntry));
  assert.ok(!("rosterProposedBy" in publicEntry));
  assert.deepEqual(publicEntry.roster, entry.roster);
  const race = await Promise.all(
    [1, 2].map(() => write(organizer.agent, "patch", path, { approve: true })),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const changed = (await db.tournamentRegistration.findUniqueOrThrow({ where: { id: entry.id } }))
    .roster;
  assert.deepEqual(
    (changed as { id: string }[]).map((p) => p.id).sort(),
    [captain.id, replacement.id].sort(),
  );
  assert.equal((await write(captain.agent, "post", path)).status, 200);
  await write(replacement.agent, "post", `/teams/${team.id}/leave`);
  assert.equal((await write(organizer.agent, "patch", path, { approve: true })).status, 400);
  assert.equal((await write(organizer.agent, "patch", path, { approve: false })).status, 200);
  await join(player);
  await write(captain.agent, "post", path);
  await db.tournament.update({
    where: { id: event.id },
    data: { closesAt: new Date(Date.now() - 1) },
  });
  assert.equal((await write(organizer.agent, "patch", path, { approve: true })).status, 400);
  assert.equal((await write(captain.agent, "post", path)).status, 400);
  assert.deepEqual(
    (await db.tournamentRegistration.findUniqueOrThrow({ where: { id: entry.id } })).roster,
    changed,
  );
});

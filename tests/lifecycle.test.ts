import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../server/app.js";
import { db } from "../server/db.js";
import { seedOrder } from "../server/tournaments.js";
const origin = "http://localhost:5173";
const agent = () => request.agent(app);
type Agent = ReturnType<typeof agent>;
const write = (
  client: Agent,
  method: "post" | "patch" | "delete",
  path: string,
  body: object = {},
) =>
  client[method](`/api${path}`)
    .set("Origin", origin)
    .set("X-MatchFlow", "1")
    .send(body);
const createAccount = async (
  client: Agent,
  username: string,
  role = "PLAYER",
) => {
  const r = await write(client, "post", "/auth/register", {
    username,
    email: `${username}@test.invalid`,
    password: "TestingPassword!26",
    role,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.user;
};
const eventBody = (name: string, maxTeams = 3) => ({
  name,
  game: "pubg",
  description: "A complete database lifecycle test event.",
  rules: "Single elimination. Unequal integer scores determine the winner.",
  teamSize: 2,
  maxTeams,
  opensAt: new Date(Date.now() - 3600000).toISOString(),
  closesAt: new Date(Date.now() + 3600000).toISOString(),
  startsAt: new Date(Date.now() + 7200000).toISOString(),
});
before(async () => {
  assert.ok(new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"));
  await db.match.deleteMany();
  await db.tournamentRegistration.deleteMany();
  await db.tournament.deleteMany();
  await db.teamMember.deleteMany();
  await db.team.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});
after(async () => {
  await db.$disconnect();
});
test("database-backed full lifecycle: accounts, roster, discovery, approvals, BYE, schedules, progression, champion, player reads", async () => {
  const organizer = agent(),
    other = agent();
  const owner = await createAccount(organizer, "host_one", "ORGANIZER");
  await createAccount(other, "host_two", "ORGANIZER");
  const eventResponse = await write(
    organizer,
    "post",
    "/tournaments",
    eventBody("Lifecycle Open"),
  );
  assert.equal(eventResponse.status, 201, JSON.stringify(eventResponse.body));
  const event = eventResponse.body;
  const publicList = await request(app).get(
    "/api/tournaments?q=Lifecycle&game=pubg&status=REGISTRATION_OPEN",
  );
  assert.equal(publicList.body.length, 1);
  const teams: {
    id: string;
    client: Agent;
    captainId: string;
    member: Agent;
  }[] = [];
  const regs: string[] = [];
  for (let n = 0; n < 3; n++) {
    const captain = agent(),
      member = agent();
    const captainUser = await createAccount(captain, `captain_${n}`);
    const memberUser = await createAccount(member, `member_${n}`);
    const tr = await write(captain, "post", "/teams", {
      name: `Test Roster ${n}`,
      game: "pubg",
    });
    assert.equal(tr.status, 201);
    const team = tr.body;
    assert.equal(
      (
        await write(captain, "post", `/tournaments/${event.id}/registrations`, {
          teamId: team.id,
        })
      ).status,
      400,
      "incomplete rosters rejected",
    );
    const found = await captain.get(`/api/users?q=member_${n}`);
    assert.equal(found.status, 200);
    assert.equal(found.body[0].id, memberUser.id);
    assert.ok(!("email" in found.body[0]));
    assert.equal(
      (
        await write(captain, "post", `/teams/${team.id}/members`, {
          userId: memberUser.id,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await write(captain, "post", `/teams/${team.id}/members`, {
          userId: memberUser.id,
        })
      ).status,
      409,
      "duplicates rejected",
    );
    assert.equal(
      (
        await write(member, "post", `/tournaments/${event.id}/registrations`, {
          teamId: team.id,
        })
      ).status,
      403,
      "only captains can register",
    );
    const reg = await write(
      captain,
      "post",
      `/tournaments/${event.id}/registrations`,
      { teamId: team.id },
    );
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    assert.equal(reg.body.status, "PENDING");
    regs.push(reg.body.id);
    assert.equal(
      (
        await write(
          captain,
          "delete",
          `/teams/${team.id}/members/${memberUser.id}`,
        )
      ).status,
      400,
      "registered rosters locked",
    );
    teams.push({
      id: team.id,
      client: captain,
      captainId: captainUser.id,
      member,
    });
  }
  assert.equal(
    (await write(organizer, "post", `/tournaments/${event.id}/bracket`)).status,
    400,
    "pending entries must be reviewed",
  );
  assert.equal(
    (
      await write(
        other,
        "patch",
        `/tournaments/${event.id}/registrations/${regs[0]}`,
        { status: "APPROVED" },
      )
    ).status,
    403,
    "foreign owners blocked",
  );
  assert.equal(
    (
      await write(
        teams[0].client,
        "patch",
        `/tournaments/${event.id}/registrations/${regs[0]}`,
        { status: "APPROVED" },
      )
    ).status,
    403,
    "players cannot approve",
  );
  assert.equal(
    (
      await write(
        teams[0].client,
        "post",
        "/tournaments",
        eventBody("Not allowed"),
      )
    ).status,
    403,
  );
  for (const reg of regs)
    assert.equal(
      (
        await write(
          organizer,
          "patch",
          `/tournaments/${event.id}/registrations/${reg}`,
          { status: "APPROVED" },
        )
      ).status,
      200,
    );
  assert.equal(
    (await write(other, "post", `/tournaments/${event.id}/bracket`)).status,
    403,
  );
  const bracket = await write(
    organizer,
    "post",
    `/tournaments/${event.id}/bracket`,
  );
  assert.equal(bracket.status, 201, JSON.stringify(bracket.body));
  assert.equal(bracket.body.length, 3);
  assert.equal(bracket.body.filter((m: any) => m.isBye).length, 1);
  assert.equal(
    (await write(organizer, "post", `/tournaments/${event.id}/bracket`)).status,
    400,
  );
  const ready = bracket.body.find(
    (m: any) => m.teamAId && m.teamBId && !m.isBye,
  );
  const final = bracket.body.find((m: any) => m.round === 2);
  assert.equal(
    (
      await write(
        organizer,
        "post",
        `/tournaments/${event.id}/matches/${final.id}/result`,
        { scoreA: 2, scoreB: 0 },
      )
    ).status,
    400,
    "unresolved opponents blocked",
  );
  const time = new Date(
    new Date(event.startsAt).getTime() + 3600000,
  ).toISOString();
  assert.equal(
    (
      await write(
        other,
        "patch",
        `/tournaments/${event.id}/matches/${ready.id}/schedule`,
        { scheduledAt: time, venue: "Room 42" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        organizer,
        "patch",
        `/tournaments/${event.id}/matches/${ready.id}/schedule`,
        { scheduledAt: time, venue: "Room 42" },
      )
    ).status,
    200,
  );
  const participating = teams.find((t) => t.id === ready.teamAId)!;
  const dash = await participating.member.get("/api/dashboard");
  assert.equal(dash.status, 200);
  assert.ok(dash.body.upcomingMatches.some((m: any) => m.id === ready.id));
  assert.equal(
    (
      await write(
        organizer,
        "post",
        `/tournaments/${event.id}/matches/${ready.id}/result`,
        { scoreA: 1, scoreB: 1 },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await write(
        other,
        "post",
        `/tournaments/${event.id}/matches/${ready.id}/result`,
        { scoreA: 2, scoreB: 0 },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        organizer,
        "post",
        `/tournaments/${event.id}/matches/${ready.id}/result`,
        { scoreA: 2, scoreB: 0 },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await write(
        organizer,
        "post",
        `/tournaments/${event.id}/matches/${ready.id}/result`,
        { scoreA: 0, scoreB: 2 },
      )
    ).status,
    400,
    "results immutable",
  );
  const updated = await db.match.findUniqueOrThrow({ where: { id: final.id } });
  assert.ok(updated.teamAId && updated.teamBId);
  assert.ok([updated.teamAId, updated.teamBId].includes(ready.teamAId));
  assert.equal(
    (
      await write(
        organizer,
        "patch",
        `/tournaments/${event.id}/matches/${final.id}/schedule`,
        {
          scheduledAt: new Date(
            new Date(time).getTime() + 3600000,
          ).toISOString(),
          venue: "Final lobby",
        },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await write(
        organizer,
        "post",
        `/tournaments/${event.id}/matches/${final.id}/result`,
        { scoreA: 3, scoreB: 1 },
      )
    ).status,
    200,
  );
  const persisted = await db.tournament.findUniqueOrThrow({
    where: { id: event.id },
  });
  assert.equal(persisted.phase, "COMPLETED");
  assert.equal(persisted.championId, updated.teamAId);
  assert.equal(persisted.organizerId, owner.id);
  const publicEvent = await request(app).get(`/api/tournaments/${event.id}`);
  assert.equal(publicEvent.body.status, "COMPLETED");
  assert.equal(publicEvent.body.champion.id, updated.teamAId);
  assert.equal(
    publicEvent.body.matches.filter((m: any) => m.status === "COMPLETED")
      .length,
    3,
  );
  assert.ok(
    publicEvent.body.matches.some((m: any) => m.venue === "Final lobby"),
  );
  const results = await participating.client.get("/api/dashboard");
  assert.ok(results.body.recentResults.length > 0);
  const captains = await db.user.findMany();
  assert.ok(captains.every((u) => !u.passwordHash.includes("TestingPassword")));
  assert.ok(captains.every((u) => u.passwordHash.includes(":")));
  const logout = await write(teams[0].client, "post", "/auth/logout");
  assert.equal(logout.status, 200);
  assert.equal((await teams[0].client.get("/api/dashboard")).status, 401);
});
test("server authentication, CSRF, validation, and confidential data boundaries", async () => {
  assert.equal((await request(app).get("/api/dashboard")).status, 401);
  const client = agent();
  assert.equal(
    (
      await client
        .post("/api/auth/login")
        .send({
          email: "host_one@test.invalid",
          password: "TestingPassword!26",
        })
    ).status,
    403,
  );
  assert.equal(
    (
      await client
        .post("/api/auth/login")
        .set("X-MatchFlow", "1")
        .set("Origin", "https://untrusted.invalid")
        .send({
          email: "host_one@test.invalid",
          password: "TestingPassword!26",
        })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(client, "post", "/auth/login", {
        email: "host_one@test.invalid",
        password: "wrong",
      })
    ).status,
    401,
  );
  const login = await write(client, "post", "/auth/login", {
    email: "host_one@test.invalid",
    password: "TestingPassword!26",
  });
  assert.equal(login.status, 200);
  const cookies = login.headers["set-cookie"] as unknown as string[];
  assert.match(cookies[0], /HttpOnly/i);
  assert.match(cookies[0], /SameSite=Lax/i);
  assert.ok(!("passwordHash" in login.body.user));
  const invalid = {
    ...eventBody("Bad dates"),
    opensAt: new Date(Date.now() + 99999999).toISOString(),
  };
  assert.equal(
    (await write(client, "post", "/tournaments", invalid)).status,
    400,
  );
  assert.equal(
    (
      await write(client, "post", "/tournaments", {
        ...eventBody("Bad format"),
        format: "DOUBLE_ELIMINATION",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(agent(), "post", "/auth/register", {
        username: "evil",
        email: "evil@test.invalid",
        password: "TestingPassword!26",
        role: "ADMIN",
      })
    ).status,
    400,
  );
});
test("capacity is enforced transactionally under simultaneous registration", async () => {
  const owner = agent();
  await write(owner, "post", "/auth/login", {
    email: "host_one@test.invalid",
    password: "TestingPassword!26",
  });
  const created = await write(
    owner,
    "post",
    "/tournaments",
    eventBody("Capacity Race", 2),
  );
  assert.equal(created.status, 201);
  const clients: Agent[] = [];
  const ids: string[] = [];
  for (let n = 0; n < 3; n++) {
    const c = agent();
    await write(c, "post", "/auth/login", {
      email: `captain_${n}@test.invalid`,
      password: "TestingPassword!26",
    });
    clients.push(c);
    const teams = await c.get("/api/teams");
    ids.push(teams.body[0].id);
  }
  const entries = await Promise.all(
    clients.map((c, n) =>
      write(c, "post", `/tournaments/${created.body.id}/registrations`, {
        teamId: ids[n],
      }),
    ),
  );
  assert.equal(
    entries.filter((r) => r.status === 201).length,
    2,
    JSON.stringify(entries.map((r) => r.body)),
  );
  assert.equal(
    await db.tournamentRegistration.count({
      where: { tournamentId: created.body.id },
    }),
    2,
  );
});
test("registration rejects wrong games and duplicate players; rejection/removal unlock rosters", async () => {
  const owner = agent(),
    captain = agent(),
    member = agent();
  await write(owner, "post", "/auth/login", {
    email: "host_two@test.invalid",
    password: "TestingPassword!26",
  });
  const c = await createAccount(captain, "policy_captain");
  const m = await createAccount(member, "policy_member");
  const t1 = (
    await write(captain, "post", "/teams", { name: "Policy One", game: "ml" })
  ).body;
  await write(captain, "post", `/teams/${t1.id}/members`, { userId: m.id });
  const wrong = (
    await write(owner, "post", "/tournaments", eventBody("Wrong game"))
  ).body;
  assert.equal(
    (
      await write(captain, "post", `/tournaments/${wrong.id}/registrations`, {
        teamId: t1.id,
      })
    ).status,
    400,
  );
  const event = (
    await write(owner, "post", "/tournaments", {
      ...eventBody("Policy Open"),
      game: "ml",
    })
  ).body;
  const reg = (
    await write(captain, "post", `/tournaments/${event.id}/registrations`, {
      teamId: t1.id,
    })
  ).body;
  const t2 = (
    await write(member, "post", "/teams", { name: "Policy Two", game: "ml" })
  ).body;
  await write(member, "post", `/teams/${t2.id}/members`, { userId: c.id });
  assert.equal(
    (
      await write(member, "post", `/tournaments/${event.id}/registrations`, {
        teamId: t2.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(
        owner,
        "patch",
        `/tournaments/${event.id}/registrations/${reg.id}`,
        { status: "REJECTED" },
      )
    ).status,
    200,
  );
  assert.equal(
    (await write(captain, "delete", `/teams/${t1.id}/members/${m.id}`)).status,
    200,
  );
  assert.equal(
    (
      await write(
        owner,
        "patch",
        `/tournaments/${event.id}/registrations/${reg.id}`,
        { status: "APPROVED" },
      )
    ).status,
    400,
    "stale rejected roster cannot be reapproved",
  );
  assert.equal(
    (
      await write(
        owner,
        "delete",
        `/tournaments/${event.id}/registrations/${reg.id}`,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await write(
        owner,
        "post",
        `/tournaments/${event.id}/manual-registration`,
        { teamId: t2.id },
      )
    ).status,
    201,
  );
  assert.equal(
    (await write(member, "delete", `/teams/${t2.id}/members/${m.id}`)).status,
    400,
  );
});
test("BYE seeding has no empty first-round match for 2–64 teams", () => {
  for (let count = 2; count <= 64; count++) {
    const size = 2 ** Math.ceil(Math.log2(count));
    const order = seedOrder(size);
    assert.equal(new Set(order).size, size);
    let byes = 0;
    for (let i = 0; i < size; i += 2) {
      const a = order[i] <= count,
        b = order[i + 1] <= count;
      assert.ok(a || b);
      if (!a || !b) byes++;
    }
    assert.equal(byes, size - count);
  }
});

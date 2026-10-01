import { db, teamInclude } from "../server/db.js";
import { hashPassword } from "../server/security.js";
import {
  generateBracket,
  saveResult,
  scheduleMatch,
} from "../server/tournaments.js";
if (
  process.env.NODE_ENV === "production" &&
  process.env.SEED_DEMO_DATA !== "yes"
)
  throw new Error(
    "Demo accounts are for local development. Set SEED_DEMO_DATA=yes only for an intentional demo environment.",
  );
const passwordHash = await hashPassword("MatchFlowDemo!2026");
const account = async (username: string, role: "PLAYER" | "ORGANIZER") =>
  db.user.upsert({
    where: { email: `${username}@matchflow.test` },
    update: {},
    create: {
      username,
      email: `${username}@matchflow.test`,
      role,
      passwordHash,
    },
  });
try {
  const owner = await account("demo_organizer", "ORGANIZER");
  const second = await account("arena_host", "ORGANIZER");
  const users = [];
  for (const name of [
    "demo_player",
    "river_scout",
    "summit_ace",
    "echo_runner",
    "grove_guard",
    "pixel_pilot",
    "cedar_spark",
    "lunar_rook",
  ])
    users.push(await account(name, "PLAYER"));
  const teams = [];
  for (const [index, name] of [
    "Valley Voyagers",
    "Cedar Comets",
    "Summit Sparks",
    "River Runners",
  ].entries()) {
    const t = await db.team.upsert({
      where: { id: `demo-team-${index}` },
      update: {},
      create: {
        id: `demo-team-${index}`,
        name,
        game: "pubg",
        description: "Fictional demonstration roster.",
        captainId: users[index * 2].id,
        members: {
          create: [
            { userId: users[index * 2].id },
            { userId: users[index * 2 + 1].id },
          ],
        },
      },
      include: teamInclude,
    });
    teams.push(t);
  }
  const ml = await db.team.upsert({
    where: { id: "demo-team-ml" },
    update: {},
    create: {
      id: "demo-team-ml",
      name: "Dawn Drifters",
      game: "ml",
      captainId: users[0].id,
      members: { create: [{ userId: users[0].id }, { userId: users[1].id }] },
    },
    include: teamInclude,
  });
  const ff = await db.team.upsert({
    where: { id: "demo-team-ff" },
    update: {},
    create: {
      id: "demo-team-ff",
      name: "Ember Explorers",
      game: "ff",
      captainId: users[4].id,
      members: { create: [{ userId: users[4].id }, { userId: users[5].id }] },
    },
    include: teamInclude,
  });
  const day = 86400000;
  const now = Date.now();
  const events = [
    {
      id: "demo-pubg-open",
      name: "Valley Open — Community Cup",
      game: "pubg",
      owner: owner.id,
      kind: "open",
      teams: [teams[0], teams[1]],
    },
    {
      id: "demo-ml-open",
      name: "Land of Dawn — Duo Open",
      game: "ml",
      owner: second.id,
      kind: "open",
      teams: [ml],
    },
    {
      id: "demo-ff-open",
      name: "Ember Cup — Free Fire",
      game: "ff",
      owner: owner.id,
      kind: "open",
      teams: [ff],
    },
    {
      id: "demo-ongoing",
      name: "Summit Series — Playoffs",
      game: "pubg",
      owner: owner.id,
      kind: "ongoing",
      teams: teams.slice(0, 3),
    },
    {
      id: "demo-completed",
      name: "River Cup — Season One",
      game: "pubg",
      owner: second.id,
      kind: "completed",
      teams,
    },
  ];
  for (const event of events) {
    if (await db.tournament.findUnique({ where: { id: event.id } })) continue;
    const past = event.kind === "completed";
    await db.tournament.create({
      data: {
        id: event.id,
        name: event.name,
        game: event.game,
        organizerId: event.owner,
        teamSize: 2,
        maxTeams: event.kind === "open" ? 8 : event.teams.length,
        opensAt: new Date(now - (past ? 5 : 1) * day),
        closesAt: new Date(now + (past ? -4 : 1) * day),
        startsAt: new Date(now + (past ? -3 : 2) * day),
        description:
          "A fictional MatchFlow demonstration event. Follow the full tournament lifecycle using reusable team rosters, reviewed entries, and a single-elimination bracket.",
        rules:
          "Two players per team including the captain. Captains must check their schedules and arrive 15 minutes early. Head-to-head elimination matches use the scores recorded by the organizer. No drawn results; the higher score advances. No entry fees or real prizes.",
      },
    });
    for (const [i, team] of event.teams.entries())
      await db.tournamentRegistration.create({
        data: {
          tournamentId: event.id,
          teamId: team.id,
          status: event.kind === "open" && i === 0 ? "PENDING" : "APPROVED",
          roster: team.members.map((m) => ({
            id: m.userId,
            username: m.user.username,
          })),
        },
      });
    if (event.kind !== "open") {
      await generateBracket(event.id, event.owner);
      let running = true;
      while (running) {
        const ready = await db.match.findFirst({
          where: {
            tournamentId: event.id,
            status: { not: "COMPLETED" },
            teamAId: { not: null },
            teamBId: { not: null },
          },
          orderBy: [{ round: "asc" }, { position: "asc" }],
        });
        if (!ready) break;
        const tournament = await db.tournament.findUniqueOrThrow({
          where: { id: event.id },
        });
        const when = new Date(
          tournament.startsAt.getTime() + ready.round * 3600000,
        ).toISOString();
        await scheduleMatch(
          event.id,
          ready.id,
          event.owner,
          when,
          `Demo lobby ${ready.round}-${ready.position + 1}`,
        );
        if (event.kind === "ongoing" && ready.round > 1) {
          running = false;
        } else await saveResult(event.id, ready.id, event.owner, 2, 1);
      }
    }
  }
  console.log(
    "Demo data ready. Login: demo_organizer@matchflow.test or demo_player@matchflow.test",
  );
  console.log("Local demo password: MatchFlowDemo!2026");
} finally {
  await db.$disconnect();
}

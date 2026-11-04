import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/database/client.js";
import { cleanupMedia } from "../../apps/api/src/modules/media/service.js";
const objects = new Map<string, Buffer>();
const app = createApp(undefined, undefined, undefined, {
  async put(k, bytes) {
    objects.set(k, bytes);
  },
  async get(k) {
    const b = objects.get(k);
    if (!b) throw Error("missing test object");
    return b;
  },
  async remove(k) {
    objects.delete(k);
  },
});
type Agent = ReturnType<typeof request.agent>;
const write = (a: Agent, method: "post" | "patch" | "delete", path: string, body: object = {}) =>
  a[method]("/api" + path)
    .set("X-MatchFlow", "1")
    .set("Origin", "http://localhost:5173")
    .send(body);
async function account() {
  const agent = request.agent(app),
    username = `p_${randomBytes(6).toString("hex")}`;
  const r = await write(agent, "post", "/auth/register", {
    username,
    email: `${username}@test.invalid`,
    password: randomBytes(24).toString("hex"),
  });
  assert.equal(r.status, 201);
  await db.user.update({ where: { id: r.body.user.id }, data: { emailVerifiedAt: new Date() } });
  return { agent, id: r.body.user.id as string, username };
}
after(async () => db.$disconnect());
test("public basics, optional private history/memberships, self-only account edits and deactivation privacy", async () => {
  const a = await account(),
    b = await account();
  const profile = {
    displayName: "Player name",
    bio: "<script>text only</script>",
    role: "PLAYER",
    region: "Nepal",
    gamesPlayed: ["valorant", "cs2"],
    socialLinks: ["https://example.com/player"],
    profilePublic: true,
    showHistory: false,
    showTeams: false,
  };
  assert.equal((await write(a.agent, "patch", "/account", profile)).status, 200);
  let r = await request(app).get(`/api/players/${a.username}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.record, null);
  assert.equal(r.body.teams, null);
  assert.equal(r.body.displayName, "Player name");
  for (const field of ["email", "passwordHash", "platformRole", "status", "sessions"])
    assert.ok(!(field in r.body));
  assert.ok((await a.agent.get(`/api/players/${a.username}`)).body.record);
  assert.equal((await write(b.agent, "patch", "/account", { ...profile, id: a.id })).status, 400);
  assert.equal(
    (
      await write(a.agent, "patch", "/account", {
        ...profile,
        socialLinks: ["javascript:alert(1)"],
      })
    ).status,
    400,
  );
  assert.equal(
    (await write(a.agent, "patch", "/account", { ...profile, username: b.username })).status,
    409,
  );
  const renamed = `renamed_${randomBytes(4).toString("hex")}`;
  assert.equal(
    (
      await write(a.agent, "patch", "/account", {
        ...profile,
        username: renamed,
        profilePublic: false,
      })
    ).status,
    200,
  );
  assert.equal((await request(app).get(`/api/players/${renamed}`)).status, 404);
  assert.equal((await b.agent.get(`/api/players/${renamed}`)).status, 404);
  assert.equal((await a.agent.get(`/api/players/${renamed}`)).status, 200);
  r = await write(a.agent, "post", "/account/deletion");
  assert.equal(r.status, 200);
  const stored = await db.user.findUniqueOrThrow({ where: { id: a.id } });
  assert.deepEqual(stored.socialLinks, []);
  assert.deepEqual(stored.gamesPlayed, []);
  assert.equal(stored.region, "");
  assert.equal((await request(app).get(`/api/players/${renamed}`)).status, 404);
});
test("validated uploads, private avatar access, team permission, removal, size and safe storage failures", async () => {
  const a = await account(),
    b = await account();
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "green" } })
    .png()
    .toBuffer();
  const upload = (agent: Agent, path: string, body: Buffer) =>
    agent
      .post(`/api${path}`)
      .set("X-MatchFlow", "1")
      .set("Content-Type", "application/octet-stream")
      .send(body);
  assert.equal((await upload(request.agent(app), "/account/avatar", png)).status, 401);
  assert.equal(
    (
      await a.agent
        .post("/api/account/avatar")
        .set("Content-Type", "application/octet-stream")
        .send(png)
    ).status,
    403,
  );
  assert.equal(
    (await upload(a.agent, "/account/avatar", Buffer.from('<svg onload="alert(1)"/>'))).status,
    400,
  );
  assert.equal((await upload(a.agent, "/account/avatar", png.subarray(0, 25))).status, 400);
  assert.equal(
    (await upload(a.agent, "/account/avatar", Buffer.alloc(2 * 1024 * 1024 + 1))).status,
    413,
  );
  const result = await upload(a.agent, "/account/avatar", png);
  assert.equal(result.status, 201);
  const id = result.body.id;
  const publicImage = await request(app).get(`/api/media/${id}`);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers["content-type"], "image/webp");
  assert.equal(publicImage.headers["cache-control"], "no-store");
  assert.equal((await sharp(publicImage.body).metadata()).format, "webp");
  await write(a.agent, "patch", "/account", {
    displayName: "",
    bio: "",
    role: "PLAYER",
    profilePublic: false,
  });
  assert.equal((await b.agent.get(`/api/media/${id}`)).status, 404);
  assert.equal((await a.agent.get(`/api/media/${id}`)).status, 200);
  const team = (await write(a.agent, "post", "/teams", { name: "Media team", game: "cs2" })).body;
  assert.equal(
    (
      await write(a.agent, "patch", `/teams/${team.id}`, {
        name: "Media team",
        game: "cs2",
        logoUrl: "https://example.com/arbitrary.svg",
      })
    ).status,
    400,
  );
  assert.equal((await upload(b.agent, `/teams/${team.id}/logo`, png)).status, 403);
  const logo = await upload(a.agent, `/teams/${team.id}/logo`, png);
  assert.equal(logo.status, 201);
  assert.equal((await request(app).get(`/api/media/${logo.body.id}`)).status, 200);
  await write(a.agent, "delete", "/account/avatar");
  assert.equal((await a.agent.get(`/api/media/${id}`)).status, 404);
  await db.mediaAsset.update({ where: { id }, data: { createdAt: new Date(0) } });
  const removed: string[] = [];
  await cleanupMedia({
    async put() {},
    async get() {
      return new Uint8Array();
    },
    async remove(key) {
      removed.push(key);
      objects.delete(key);
    },
  });
  assert.ok(removed.some((k) => k.includes(id)));
  assert.equal(await db.mediaAsset.findUnique({ where: { id } }), null);
  assert.ok(await db.mediaAsset.findUnique({ where: { id: logo.body.id } }));
});
test("unconfigured storage and provider failures return safe errors without publishing an asset", async () => {
  const a = await account();
  const { uploadImage } = await import("../../apps/api/src/modules/media/service.js");
  const png = await sharp({ create: { width: 5, height: 5, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
  await assert.rejects(
    () =>
      uploadImage(a.id, { userId: a.id }, png, {
        async put() {
          throw Error("secret-provider-details");
        },
        async get() {
          throw Error("unused");
        },
        async remove() {},
      }),
    (error) => error instanceof Error && error.message === "Image upload failed. Please try again.",
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: a.id } })).avatarId, null);
  assert.equal(
    await db.mediaAsset.count({ where: { ownerId: a.id } }),
    1,
    "failed upload is tracked for cleanup",
  );
  const unavailableApp = createApp();
  assert.equal((await request(unavailableApp).get("/api/media/options")).body.available, false);
});

test("private event covers follow share-link access and rotation, and attached covers survive cleanup", async () => {
  const owner = await account(),
    guest = await account();
  const event = await db.tournament.create({
    data: {
      name: "Private cover",
      game: "valorant",
      description: "Private cover fixture",
      rules: "Private rules fixture",
      teamSize: 1,
      maxTeams: 2,
      organizerId: owner.id,
      visibility: "PRIVATE",
      opensAt: new Date(Date.now() - 10000),
      closesAt: new Date(Date.now() + 10000),
      startsAt: new Date(Date.now() + 20000),
    },
  });
  const png = await sharp({ create: { width: 32, height: 18, channels: 3, background: "#465833" } })
    .png()
    .toBuffer();
  const upload = await owner.agent
    .post(`/api/tournaments/${event.id}/cover`)
    .set("X-MatchFlow", "1")
    .set("Origin", "http://localhost:5173")
    .set("Content-Type", "image/png")
    .send(png);
  assert.equal(upload.status, 201);
  assert.equal((await request(app).get(`/api/media/${upload.body.id}`)).status, 404);
  assert.equal((await owner.agent.get(`/api/media/${upload.body.id}`)).status, 200);
  const token = (await write(owner.agent, "post", `/tournaments/${event.id}/share-link`)).body
    .token;
  assert.equal(
    (await write(guest.agent, "post", `/tournaments/${event.id}/access`, { token })).status,
    200,
  );
  assert.equal((await guest.agent.get(`/api/media/${upload.body.id}`)).status, 200);
  await write(owner.agent, "post", `/tournaments/${event.id}/share-link`);
  assert.equal((await guest.agent.get(`/api/media/${upload.body.id}`)).status, 404);
  await db.mediaAsset.update({ where: { id: upload.body.id }, data: { createdAt: new Date(0) } });
  await cleanupMedia({
    put: async () => {},
    get: async () => Buffer.alloc(0),
    remove: async () => {},
  });
  assert(await db.mediaAsset.findUnique({ where: { id: upload.body.id } }));
  assert.equal((await write(guest.agent, "delete", `/tournaments/${event.id}/cover`)).status, 404);
});

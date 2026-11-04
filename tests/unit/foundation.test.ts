import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import { test } from "node:test";
import pino from "pino";
import { parseEnvironment } from "../../apps/api/src/config/env.js";
import { loggerOptions } from "../../apps/api/src/http/logger.js";
import { hashPassword, verifyPassword } from "../../apps/api/src/modules/auth/security.js";
import { canReadEntry, isParticipant } from "../../apps/api/src/modules/registrations/domain.js";
import { api, RequestError } from "../../apps/web/src/mvp/http.js";
import { tournamentSchema } from "../../packages/shared/src/validation.js";

test("environment validation fails closed and does not expose secrets", () => {
  const secret = randomBytes(24).toString("hex");
  assert.throws(
    () => parseEnvironment({ DATABASE_URL: secret }),
    (error) => error instanceof Error && !error.message.includes(secret),
  );
  assert.throws(() =>
    parseEnvironment({
      DATABASE_URL: "postgresql://localhost/db",
      NODE_ENV: "production",
      CLIENT_ORIGIN: "http://example.com",
    }),
  );
  assert.throws(() =>
    parseEnvironment({
      DATABASE_URL: "postgresql://localhost/db",
      CLIENT_ORIGIN: "https://example.com/path",
    }),
  );
  assert.equal(
    parseEnvironment({
      DATABASE_URL: "postgresql://localhost/db",
      NODE_ENV: "production",
      CLIENT_ORIGIN: "https://example.com",
      APP_ORIGIN: "https://example.com",
      PORT: "8080",
    }).PORT,
    8080,
  );
});
test("logger redacts credential fields", () => {
  let output = "";
  const sink = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const secret = randomBytes(24).toString("hex");
  pino({ ...loggerOptions, level: "info" }, sink).info(
    {
      password: secret,
      headers: { authorization: secret, cookie: secret, "set-cookie": secret },
      user: { passwordHash: secret },
      token: secret,
    },
    "safe",
  );
  assert.ok(!output.includes(secret));
  assert.match(output, /REDACTED/);
});
test("datetime ordering compares instants, including fractional seconds", () => {
  const base = new Date(Date.now() + 86400000).toISOString().slice(0, 19);
  const body = {
    name: "Precision cup",
    game: "pubg",
    description: "Testing date validation",
    rules: "Single elimination rules",
    teamSize: 2,
    maxTeams: 2,
    opensAt: base + ".900Z",
    closesAt: base + "Z",
    startsAt: new Date(Date.now() + 172800000).toISOString(),
  };
  assert.equal(tournamentSchema.safeParse(body).success, false);
  assert.equal(
    tournamentSchema.safeParse({ ...body, opensAt: base + "Z", closesAt: base + ".900Z" }).success,
    true,
  );
});
test("entry visibility uses snapshots and owner policy", () => {
  const entry = { status: "PENDING", roster: [{ id: "member", username: "member" }] };
  assert.equal(canReadEntry(entry, "owner", "stranger"), false);
  assert.equal(canReadEntry(entry, "owner", "member"), true);
  assert.equal(canReadEntry(entry, "owner", "owner"), true);
  assert.equal(canReadEntry({ ...entry, status: "APPROVED" }, "owner"), true);
  assert.equal(isParticipant(entry.roster, "new-member"), false);
});
test("password hashes are salted and malformed stored values fail safely", async () => {
  const password = randomBytes(24).toString("hex");
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword(password, "corrupt"), false);
  assert.equal(await verifyPassword(randomBytes(24).toString("hex"), a), false);
});
test("browser client rejects successful HTML and malformed authenticated data", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>fallback</html>", { status: 200 }),
  );
  await assert.rejects(
    api("/auth/me"),
    (error) => error instanceof RequestError && error.status === 502,
  );
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => Response.json({ unrelated: true }));
  await assert.rejects(
    api("/auth/me"),
    (error) => error instanceof RequestError && error.status === 502,
  );
});

import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { testDatabase } from "./test-database.mjs";
const database = testDatabase();
const port = 3197;
const origin = "https://release.matchflow.invalid";
const environment = {
  PATH: process.env.PATH,
  NODE_ENV: "production",
  DOTENV_CONFIG_PATH: "/dev/null",
  DATABASE_URL: database.href,
  APP_ORIGIN: origin,
  CLIENT_ORIGIN: origin,
  HOST: "127.0.0.1",
  PORT: String(port),
  STAFF_MFA_KEY: randomBytes(32).toString("hex"),
  NOTIFICATION_WORKER: "false",
  LOG_LEVEL: "info",
};
const server = spawn(process.execPath, ["dist/api/apps/api/src/index.js"], {
  env: environment,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", (v) => {
  output += v;
});
server.stderr.on("data", (v) => {
  output += v;
});
const ended = new Promise((resolve) => server.on("exit", (code) => resolve(code)));
const request = (path, options = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: options.method || "GET",
        headers: { host: new URL(origin).host, ...options.headers },
        timeout: 5000,
      },
      (res) => {
        let body = "";
        res.on("data", (v) => {
          body += v;
        });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
    req.end(options.body);
  });
const password = randomBytes(24).toString("hex");
let succeeded = false;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/api/ready")).status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* Startup only. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "production process became ready");
  const root = await request("/");
  assert.equal(root.status, 200);
  assert.ok(root.headers["content-security-policy"]);
  assert.ok(root.headers["strict-transport-security"]);
  assert.equal(root.headers["x-content-type-options"], "nosniff");
  assert.ok(!root.headers["x-powered-by"]);
  assert.ok(
    (await request("/api/tournaments", { headers: { host: "unverified.invalid" } })).status >= 400,
  );
  assert.equal((await request("/api/admin/overview")).status, 401);
  assert.equal((await request("/api/auth/logout", { method: "POST" })).status, 403);
  const username = `release_${randomBytes(6).toString("hex")}`;
  const registration = await request("/api/auth/register", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-matchflow": "1" },
    body: JSON.stringify({ username, email: `${username}@test.invalid`, password, role: "PLAYER" }),
  });
  assert.equal(registration.status, 201);
  const cookies = registration.headers["set-cookie"].join(";");
  assert.match(cookies, /Secure/);
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /SameSite=Lax/);
  assert.doesNotMatch(cookies, /Domain=/i);
  const invalid = await request("/api/auth/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-matchflow": "1" },
    body: "{",
  });
  assert.equal(invalid.status, 400);
  assert.doesNotMatch(invalid.body, /SyntaxError| at |node_modules/);
  assert.equal((await request("/api/missing")).status, 404);
  const samples = [];
  const statuses = {};
  const started = performance.now();
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      for (let n = 0; n < 20; n++) {
        const start = performance.now();
        const response = await request("/api/tournaments");
        samples.push(performance.now() - start);
        statuses[response.status] = (statuses[response.status] || 0) + 1;
        assert.equal(response.status, 200);
      }
    }),
  );
  const duration = performance.now() - started;
  samples.sort((a, b) => a - b);
  const report = {
    status: "passed",
    node: process.version,
    requests: samples.length,
    concurrency: 10,
    statuses,
    durationMs: Math.round(duration),
    requestsPerSecond: Math.round((samples.length * 1000) / duration),
    p50Ms: Math.round(samples[99]),
    p95Ms: Math.round(samples[189]),
    maxMs: Math.round(samples.at(-1)),
    scope:
      "Local production-mode discovery read burst, 200 requests; not a capacity or cloud benchmark",
  };
  server.kill("SIGTERM");
  assert.equal(
    await Promise.race([
      ended,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Shutdown exceeded 25 seconds")), 25000).unref(),
      ),
    ]),
    0,
  );
  assert.ok(output.includes("Shutdown started"));
  assert.ok(!output.includes(password));
  const records = output
    .trim()
    .split("\n")
    .filter((v) => v.startsWith("{"))
    .map((v) => JSON.parse(v));
  assert.ok(records.some((v) => v.requestId && typeof v.durationMs === "number"));
  mkdirSync(".local/phase12", { recursive: true });
  writeFileSync(".local/phase12/performance.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  succeeded = true;
} finally {
  if (!succeeded) server.kill("SIGTERM");
  await ended;
}

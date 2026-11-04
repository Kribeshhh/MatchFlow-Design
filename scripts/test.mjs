import { randomBytes } from "node:crypto";
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { testDatabase } from "./test-database.mjs";
const url = testDatabase().href;
const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test" };
// Provider credentials must never leak into disposable test processes.
env.DOTENV_CONFIG_PATH = "/dev/null";
env.STAFF_MFA_KEY = randomBytes(32).toString("hex");
for (const key of Object.keys(env))
  if (
    ["S3_", "SMTP_", "GOOGLE_", "WEBHOOK_", "CLOUDFLARE_", "PORTAL_"].some((prefix) =>
      key.startsWith(prefix),
    ) ||
    key === "MAIL_FROM"
  )
    delete env[key];
execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
execFileSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/integration/lifecycle.test.ts",
    "tests/integration/foundation.test.ts",
    "tests/integration/identity.test.ts",
    "tests/integration/teams.test.ts",
    "tests/integration/players-media.test.ts",
    "tests/integration/tournaments.test.ts",
    "tests/integration/engine.test.ts",
    "tests/integration/realtime.test.ts",
    "tests/integration/organizations.test.ts",
    "tests/integration/developer.test.ts",
    "tests/integration/portals.test.ts",
    "tests/integration/administration.test.ts",
  ],
  { env, stdio: "inherit" },
);

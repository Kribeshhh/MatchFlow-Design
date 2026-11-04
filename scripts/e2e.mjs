import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { testDatabase } from "./test-database.mjs";
const target = testDatabase();
const env = {
  ...process.env,
  DATABASE_URL: target.href,
  NODE_ENV: "test",
  PORT: "3101",
  CLIENT_ORIGIN: "http://localhost:4175",
  APP_ORIGIN: "http://localhost:4175",
  API_PROXY_TARGET: "http://127.0.0.1:3101",
  LOG_LEVEL: "silent",
};
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
// Remove only prior disposable notification fixtures; domain records are left for existing suites.
const fixtures = new PrismaClient({ datasourceUrl: target.href });
try {
  await fixtures.notificationEvent.deleteMany();
} finally {
  await fixtures.$disconnect();
}
execFileSync("npx", ["playwright", "test", ...process.argv.slice(2)], { env, stdio: "inherit" });

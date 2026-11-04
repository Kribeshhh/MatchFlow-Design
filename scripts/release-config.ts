import { env } from "../apps/api/src/config/env.js";
const failures: string[] = [];
if (env.NODE_ENV !== "production") failures.push("NODE_ENV must be production");
if (!env.CLIENT_ORIGIN.includes(env.APP_ORIGIN))
  failures.push("CLIENT_ORIGIN must contain APP_ORIGIN");
const database = new URL(env.DATABASE_URL);
if (["localhost", "127.0.0.1", "[::1]"].includes(database.hostname))
  failures.push("DATABASE_URL must identify the reviewed production database");
if (
  database.searchParams.get("sslmode") !== "require" ||
  database.searchParams.get("sslaccept") !== "strict"
)
  failures.push(
    "DATABASE_URL requires sslmode=require and sslaccept=strict (validate provider CA separately)",
  );
if (!/^[1-9][0-9]*$/.test(database.searchParams.get("connection_limit") || ""))
  failures.push("DATABASE_URL requires an explicit connection_limit");
for (const field of [
  "STAFF_MFA_KEY",
  "SUPPORT_CONTACT_EMAIL",
  "SMTP_HOST",
  "MAIL_FROM",
  "GOOGLE_CLIENT_ID",
  "S3_BUCKET",
  "WEBHOOK_ENCRYPTION_KEY",
  "CLOUDFLARE_ZONE_ID",
] as const)
  if (!env[field]) failures.push(`${field} is missing for full-platform qualification`);
const keys = [env.STAFF_MFA_KEY, env.WEBHOOK_ENCRYPTION_KEY, env.PORTAL_ORIGIN_SECRET].filter(
  Boolean,
);
if (new Set(keys).size !== keys.length)
  failures.push("Encryption and origin keys must be independent");
for (const field of ["TEST_DATABASE_URL", "SEED_DEMO_DATA", "DEMO_SEED_PASSWORD"])
  if (process.env[field]) failures.push(`${field} must not be present in a production process`);
console.log(
  JSON.stringify(
    {
      status: failures.length ? "blocked" : "configuration-present",
      failures,
      note: "Presence checks do not verify credentials, TLS, DNS, providers, monitoring or deployment.",
    },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 0;

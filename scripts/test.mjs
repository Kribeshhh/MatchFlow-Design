import "dotenv/config";
import { execFileSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL must point to a separate database ending in _test.",
  );
const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test" };
execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
execFileSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/lifecycle.test.ts",
  ],
  { env, stdio: "inherit" },
);

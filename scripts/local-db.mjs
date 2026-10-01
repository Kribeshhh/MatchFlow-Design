import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
const bin =
  process.env.PG_BIN ||
  (existsSync("/opt/homebrew/opt/postgresql@17/bin/pg_ctl")
    ? "/opt/homebrew/opt/postgresql@17/bin"
    : dirname(execFileSync("which", ["pg_ctl"], { encoding: "utf8" }).trim()));
const root = resolve(".local");
const data = resolve(root, "postgres");
mkdirSync(root, { recursive: true, mode: 0o700 });
const run = (name, args, options = {}) =>
  execFileSync(resolve(bin, name), args, { stdio: "inherit", ...options });
if (process.argv[2] === "stop") {
  run("pg_ctl", ["-D", data, "stop", "-m", "fast"]);
  process.exit(0);
}
if (!existsSync(".env")) {
  if (existsSync(data))
    throw new Error(
      "Restore your .env credentials before starting this existing database.",
    );
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    ".env",
    `DATABASE_URL=postgresql://matchflow:${password}@127.0.0.1:55432/matchflow_dev\nTEST_DATABASE_URL=postgresql://matchflow:${password}@127.0.0.1:55432/matchflow_test\nCLIENT_ORIGIN=http://localhost:5173,http://localhost:4173,http://localhost:3001\nPORT=3001\n`,
    { mode: 0o600 },
  );
}
const config = dotenv.parse(readFileSync(".env"));
const url = new URL(config.DATABASE_URL);
if (url.hostname !== "127.0.0.1" || url.port !== "55432")
  throw new Error(
    "Local DB helper is only for 127.0.0.1:55432. Use your external database directly.",
  );
if (!existsSync(data)) {
  const pwfile = resolve(root, ".db-password");
  writeFileSync(pwfile, decodeURIComponent(url.password), { mode: 0o600 });
  try {
    run("initdb", [
      "-D",
      data,
      "-U",
      url.username,
      "--auth=scram-sha-256",
      "--pwfile",
      pwfile,
      "--encoding=UTF8",
      "--locale=C",
    ]);
  } finally {
    unlinkSync(pwfile);
  }
}
try {
  execFileSync(resolve(bin, "pg_ctl"), ["-D", data, "status"], {
    stdio: "ignore",
  });
} catch {
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    resolve(root, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p 55432 -k ${root}`,
    "start",
  ]);
}
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
for (const name of ["matchflow_dev", "matchflow_test"]) {
  const exists = execFileSync(
    resolve(bin, "psql"),
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55432",
      "-U",
      url.username,
      "-d",
      "postgres",
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
    ],
    { encoding: "utf8", env },
  ).trim();
  if (!exists)
    run(
      "createdb",
      ["-h", "127.0.0.1", "-p", "55432", "-U", url.username, name],
      { env },
    );
}
console.log("Local PostgreSQL ready. Credentials are stored only in .env.");

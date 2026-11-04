import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { testDatabase } from "./test-database.mjs";
const source = testDatabase();
const destination = `matchflow_restore_${randomBytes(8).toString("hex")}_test`;
const directory = resolve(".local/phase12");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const dump = resolve(directory, "restore-drill.dump");
const bin =
  process.env.PG_BIN ||
  (existsSync("/opt/homebrew/opt/postgresql@17/bin/psql")
    ? "/opt/homebrew/opt/postgresql@17/bin"
    : "");
const environment = {
  ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port || "5432",
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
  PGDATABASE: source.pathname.slice(1),
};
const run = (name, args, database = source.pathname.slice(1), input) =>
  execFileSync(bin ? resolve(bin, name) : name, args, {
    env: { ...environment, PGDATABASE: database },
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (text, database) =>
  run("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"], database, text);
const fingerprints = (database) => {
  const tables = sql(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;",
    database,
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  return Object.fromEntries(
    tables.map((table) => {
      const name = '"' + table.replaceAll('"', '""') + '"';
      const rows = sql(
        `SELECT row_to_json(t)::text FROM public.${name} t ORDER BY row_to_json(t)::text;`,
        database,
      );
      return [table, createHash("sha256").update(rows).digest("hex")];
    }),
  );
};
let created = false;
const start = performance.now();
try {
  // Run only while no test suite writes this disposable database.
  const before = fingerprints();
  process.umask(0o077);
  run("pg_dump", ["--format=custom", "--no-owner", "--file", dump]);
  chmodSync(dump, 0o600);
  run("createdb", [destination]);
  created = true;
  run(
    "pg_restore",
    ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", destination, dump],
    destination,
  );
  const after = fingerprints(destination);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Fingerprint mismatch");
  const restored = new URL(source);
  restored.pathname = `/${destination}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: restored.href, DOTENV_CONFIG_PATH: "/dev/null" },
    stdio: "pipe",
  });
  const report = {
    status: "passed",
    tables: Object.keys(after).length,
    elapsedMs: Math.round(performance.now() - start),
    archiveSha256: createHash("sha256").update(readFileSync(dump)).digest("hex"),
    scope:
      "Disposable local database; every public table fingerprint preserved; migrate deploy succeeded on restored database",
  };
  writeFileSync(resolve(directory, "restore-results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} catch {
  throw new Error("Restore drill failed; connection strings and database contents suppressed.");
} finally {
  if (created) run("dropdb", [destination]);
}

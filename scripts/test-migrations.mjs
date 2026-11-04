import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { testDatabase } from "./test-database.mjs";
const target = testDatabase();
const schema = `migration_${randomBytes(8).toString("hex")}`;
const bin = process.env.PG_BIN
  ? resolve(process.env.PG_BIN, "psql")
  : existsSync("/opt/homebrew/opt/postgresql@17/bin/psql")
    ? "/opt/homebrew/opt/postgresql@17/bin/psql"
    : "psql";
const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || "5432",
  PGDATABASE: target.pathname.slice(1),
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
};
const sql = (input) =>
  execFileSync(bin, ["-X", "-v", "ON_ERROR_STOP=1", "-q"], {
    env,
    input,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf8",
  });
try {
  sql(`CREATE SCHEMA "${schema}";`);
  const initial = readFileSync("prisma/migrations/20260930161819_core_mvp/migration.sql", "utf8");
  const next = readFileSync(
    "prisma/migrations/20261029000000_phase1_foundation/migration.sql",
    "utf8",
  );
  const identity = readFileSync(
    "prisma/migrations/20261029010000_phase2_identity/migration.sql",
    "utf8",
  );
  const teams = readFileSync("prisma/migrations/20261031000000_phase4_teams/migration.sql", "utf8");
  const profiles = readFileSync(
    "prisma/migrations/20261031010000_phase4_profiles_media/migration.sql",
    "utf8",
  );
  const notifications = readFileSync(
    "prisma/migrations/20261102010000_phase7_live_notifications/migration.sql",
    "utf8",
  );
  const slots = readFileSync(
    "prisma/migrations/20261102000000_phase6_schedule_slots/migration.sql",
    "utf8",
  );
  const battle = readFileSync(
    "prisma/migrations/20261101030000_phase6_battle_rounds/migration.sql",
    "utf8",
  );
  const engine = readFileSync(
    "prisma/migrations/20261101020000_phase6_engine/migration.sql",
    "utf8",
  );
  const statistics = readFileSync(
    "prisma/migrations/20261101010000_phase5_match_statistics/migration.sql",
    "utf8",
  );
  const tournaments = readFileSync(
    "prisma/migrations/20261101000000_phase5_tournaments/migration.sql",
    "utf8",
  );
  sql(`SET search_path TO "${schema}";\n${initial}\n
 INSERT INTO "User" (id,username,email,"passwordHash",role) VALUES ('host','host','migration@test.invalid','non-login-fixture','ORGANIZER');
 INSERT INTO "Team" (id,name,game,"captainId") VALUES ('a','Alpha','pubg','host'),('b','Beta','pubg','host');
 INSERT INTO "Tournament" (id,name,game,description,rules,"teamSize","maxTeams","opensAt","closesAt","startsAt",phase,"organizerId","championId") VALUES ('event','Preserved cup','pubg','Fixture description','Fixture rules',1,2,'2026-01-01','2026-01-02','2026-01-03','COMPLETED','host','a');
 INSERT INTO "Match" (id,"tournamentId",round,position,"teamAId","teamBId","scoreA","scoreB","winnerId",status,"completedAt") VALUES ('final','event',1,0,'a','b',2,1,'a','COMPLETED','2026-01-03');
 ${next}
 INSERT INTO "Session" ("tokenHash","userId","expiresAt") VALUES ('legacy-session-digest','host','2099-01-01');
 ${identity}
 INSERT INTO "TeamMember" ("teamId", "userId") VALUES ('a', 'host');
 ${teams}
 ${profiles}
 ${tournaments}
 ${statistics}
 ${engine}
 ${battle}
 ${slots}
 ${notifications}
 ${readFileSync("prisma/migrations/20261102011000_phase7_outbox_minimization/migration.sql", "utf8")}
 ${readFileSync("prisma/migrations/20261102012000_phase7_delivery_live_scores/migration.sql", "utf8")}
 INSERT INTO "User" (id,username,email,role) VALUES ('org-owner','org-owner','org-owner@test.invalid','ORGANIZER');
 INSERT INTO "Organization" (id,name,"ownerId") VALUES ('legacy-org','Legacy organization','org-owner');
 UPDATE "Tournament" SET "organizationId"='legacy-org' WHERE id='event';
 ${readFileSync("prisma/migrations/20261102020000_phase8_organization_profiles/migration.sql", "utf8")}
 ${readFileSync("prisma/migrations/20261102021000_phase8_organization_staff/migration.sql", "utf8")}
 ${readFileSync("prisma/migrations/20261103000000_phase8_legacy_access/migration.sql", "utf8")}
 ${readFileSync("prisma/migrations/20261104000000_phase9_developer_api/migration.sql", "utf8")}
 ${readFileSync("prisma/migrations/20261104010000_phase10_portals/migration.sql", "utf8")}
 ${readFileSync("prisma/migrations/20261104020000_phase11_administration/migration.sql", "utf8")}
 DO $$ BEGIN
 IF (SELECT count(*) FROM "Portal")<>0 OR (SELECT count(*) FROM "CustomDomain")<>0 THEN RAISE EXCEPTION 'Unexpected tenant activation'; END IF;
 IF (SELECT count(*) FROM "Integration")<>0 OR (SELECT count(*) FROM "ApiCredential")<>0 THEN RAISE EXCEPTION 'Unexpected developer authority'; END IF;
 IF (SELECT count(*) FROM "OrganizationMember" WHERE "organizationId"='legacy-org' AND "userId"='host')<>1 OR (SELECT count(*) FROM "TournamentPermission" WHERE "tournamentId"='event' AND "userId"='host' AND "canManage")<>1 THEN RAISE EXCEPTION 'Legacy organization creator access lost'; END IF;
 IF (SELECT "profilePublic" FROM "User" WHERE id='host') THEN RAISE EXCEPTION 'Legacy private profile exposed'; END IF;
 IF (SELECT count(*) FROM "TeamMember" WHERE "teamId"='a' AND "userId"='host' AND "acceptedAt" IS NULL AND NOT manager AND NOT substitute)<>1 THEN RAISE EXCEPTION 'Legacy membership changed'; END IF;
 IF (SELECT count(*) FROM "Session" WHERE "tokenHash"='legacy-session-digest' AND "userId"='host' AND "expiresAt"='2099-01-01' AND "id" IS NOT NULL)<>1 THEN RAISE EXCEPTION 'Legacy session changed'; END IF;
 IF (SELECT count(*) FROM "User" WHERE id='host' AND "passwordHash"='non-login-fixture' AND "emailVerifiedAt" IS NULL AND NOT "verificationRequired" AND "roles" @> ARRAY['PLAYER','ORGANIZER']::"Role"[])<>1 THEN RAISE EXCEPTION 'Legacy user changed'; END IF;
 IF (SELECT count(*) FROM "User")<>2 OR (SELECT count(*) FROM "Team")<>2 OR (SELECT count(*) FROM "Match" WHERE id='final' AND "stageId"='stage_event')<>1 THEN RAISE EXCEPTION 'Existing records were not preserved'; END IF;
 IF (SELECT count(*) FROM "MatchResult" WHERE "matchId"='final' AND "scoreA"=2 AND "scoreB"=1 AND "winnerId"='a')<>1 THEN RAISE EXCEPTION 'Result backfill failed'; END IF;
 BEGIN UPDATE "Tournament" SET "teamSize"=0 WHERE id='event'; RAISE EXCEPTION 'Missing size constraint'; EXCEPTION WHEN check_violation THEN NULL; END;
 END $$;`);
  console.log(
    "Migration replay passed: preserved IDs, legacy users/session digests, role backfill, stage/results and CHECK constraints.",
  );
} catch {
  throw new Error(
    "Migration replay failed. Inspect migrations against a disposable database; connection details are suppressed.",
  );
} finally {
  sql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
}

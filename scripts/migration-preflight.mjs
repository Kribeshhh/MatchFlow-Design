import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const [events, matches] = await Promise.all([
    db.$queryRaw`SELECT count(*)::int AS count FROM "Tournament" WHERE "teamSize" NOT BETWEEN 1 AND 10 OR "maxTeams" NOT BETWEEN 2 AND 64 OR "opensAt" >= "closesAt" OR "closesAt" > "startsAt"`,
    db.$queryRaw`SELECT count(*)::int AS count FROM "Match" WHERE "round" < 1 OR "position" < 0 OR ("status" = 'COMPLETED' AND NOT "isBye" AND ("scoreA" IS NULL OR "scoreB" IS NULL OR "winnerId" IS NULL OR "completedAt" IS NULL OR "scoreA" NOT BETWEEN 0 AND 999 OR "scoreB" NOT BETWEEN 0 AND 999 OR "scoreA" = "scoreB" OR "teamAId" IS NULL OR "teamBId" IS NULL OR "winnerId" <> CASE WHEN "scoreA" > "scoreB" THEN "teamAId" ELSE "teamBId" END))`,
  ]);
  if (events[0].count || matches[0].count) throw new Error("incompatible data");
  console.log(
    "Migration preflight passed: existing dates, sizes and completed results are compatible.",
  );
} catch {
  console.error(
    "Migration preflight failed. Inspect incompatible records or database connectivity before deploying; no data was changed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

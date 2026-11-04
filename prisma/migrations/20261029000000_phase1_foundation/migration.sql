BEGIN;
-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "stageId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentStage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'SINGLE_ELIMINATION',

    CONSTRAINT "TournamentStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "scoreA" INTEGER NOT NULL,
    "scoreB" INTEGER NOT NULL,
    "winnerId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_ownerId_idx" ON "Organization"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentStage_tournamentId_position_key" ON "TournamentStage"("tournamentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_matchId_key" ON "MatchResult"("matchId");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_createdAt_idx" ON "AuditEvent"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "TournamentRegistration_teamId_idx" ON "TournamentRegistration"("teamId");

-- CreateIndex
CREATE INDEX "Match_stageId_idx" ON "Match"("stageId");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStage" ADD CONSTRAINT "TournamentStage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing bracket records keep their IDs and routes. Deterministic prefixed IDs are backfill-only.
INSERT INTO "TournamentStage" ("id", "tournamentId", "position", "format")
SELECT 'stage_' || "id", "id", 0, "format" FROM "Tournament"
WHERE EXISTS (SELECT 1 FROM "Match" WHERE "tournamentId" = "Tournament"."id");
UPDATE "Match" SET "stageId" = 'stage_' || "tournamentId";
INSERT INTO "MatchResult" ("id", "matchId", "scoreA", "scoreB", "winnerId", "recordedAt")
SELECT 'result_' || "id", "id", "scoreA", "scoreB", "winnerId", "completedAt" FROM "Match"
WHERE "status" = 'COMPLETED' AND NOT "isBye";
ALTER TABLE "Tournament" ADD CONSTRAINT "tournament_size_bounds" CHECK ("teamSize" BETWEEN 1 AND 10 AND "maxTeams" BETWEEN 2 AND 64);
ALTER TABLE "Tournament" ADD CONSTRAINT "tournament_date_order" CHECK ("opensAt" < "closesAt" AND "closesAt" <= "startsAt");
ALTER TABLE "MatchResult" ADD CONSTRAINT "result_scores" CHECK ("scoreA" BETWEEN 0 AND 999 AND "scoreB" BETWEEN 0 AND 999 AND "scoreA" <> "scoreB");
ALTER TABLE "Match" ADD CONSTRAINT "match_position" CHECK ("round" > 0 AND "position" >= 0);

COMMIT;

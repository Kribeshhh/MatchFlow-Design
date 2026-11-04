BEGIN;
-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "matchFormat" TEXT,
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'PLAYED',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MatchResult" ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'PLAYED',
ALTER COLUMN "scoreA" DROP NOT NULL,
ALTER COLUMN "scoreB" DROP NOT NULL,
ALTER COLUMN "winnerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "engineRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "engineVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seedOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TournamentStage" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupNumber" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MAIN',
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Main stage';

-- CreateTable
CREATE TABLE "StageParticipant" (
    "stageId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,

    CONSTRAINT "StageParticipant_pkey" PRIMARY KEY ("stageId","teamId")
);

-- CreateTable
CREATE TABLE "EngineHistory" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "actorId" TEXT,
    "matchId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineCommand" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchReport" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchDispute" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MatchDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "venue" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BattleRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleRoundResult" (
    "roundId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "placement" INTEGER,
    "eliminations" INTEGER NOT NULL DEFAULT 0,
    "noShow" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BattleRoundResult_pkey" PRIMARY KEY ("roundId","teamId")
);

-- CreateIndex
CREATE INDEX "StageParticipant_teamId_idx" ON "StageParticipant"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "StageParticipant_stageId_seed_key" ON "StageParticipant"("stageId", "seed");

-- CreateIndex
CREATE INDEX "EngineHistory_tournamentId_createdAt_idx" ON "EngineHistory"("tournamentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngineCommand_actorId_key_key" ON "EngineCommand"("actorId", "key");

-- CreateIndex
CREATE INDEX "MatchReport_matchId_status_idx" ON "MatchReport"("matchId", "status");

-- CreateIndex
CREATE INDEX "MatchDispute_tournamentId_status_idx" ON "MatchDispute"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BattleRound_tournamentId_number_key" ON "BattleRound"("tournamentId", "number");

-- CreateIndex
CREATE INDEX "BattleRoundResult_teamId_idx" ON "BattleRoundResult"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "BattleRoundResult_roundId_placement_key" ON "BattleRoundResult"("roundId", "placement");

-- AddForeignKey
ALTER TABLE "StageParticipant" ADD CONSTRAINT "StageParticipant_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageParticipant" ADD CONSTRAINT "StageParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineHistory" ADD CONSTRAINT "EngineHistory_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineHistory" ADD CONSTRAINT "EngineHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineCommand" ADD CONSTRAINT "EngineCommand_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineCommand" ADD CONSTRAINT "EngineCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReport" ADD CONSTRAINT "MatchReport_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReport" ADD CONSTRAINT "MatchReport_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReport" ADD CONSTRAINT "MatchReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDispute" ADD CONSTRAINT "MatchDispute_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDispute" ADD CONSTRAINT "MatchDispute_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDispute" ADD CONSTRAINT "MatchDispute_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleRound" ADD CONSTRAINT "BattleRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleRoundResult" ADD CONSTRAINT "BattleRoundResult_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "BattleRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleRoundResult" ADD CONSTRAINT "BattleRoundResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "MatchResult" DROP CONSTRAINT "result_scores";
ALTER TABLE "MatchResult" ADD CONSTRAINT "result_scores" CHECK (
  (outcome = 'PLAYED' AND "scoreA" BETWEEN 0 AND 999 AND "scoreB" BETWEEN 0 AND 999 AND "scoreA" <> "scoreB" AND "scoreA" IS NOT NULL AND "scoreB" IS NOT NULL AND "winnerId" IS NOT NULL)
  OR (outcome = 'DRAW' AND "scoreA" BETWEEN 0 AND 999 AND "scoreA" = "scoreB" AND "scoreA" IS NOT NULL AND "scoreB" IS NOT NULL AND "winnerId" IS NULL)
  OR (outcome IN ('FORFEIT','NO_SHOW') AND "scoreA" IS NULL AND "scoreB" IS NULL AND "winnerId" IS NOT NULL)
);
ALTER TABLE "BattleRoundResult" ADD CONSTRAINT "battle_result_bounds" CHECK (eliminations BETWEEN 0 AND 1000 AND (("noShow" AND placement IS NULL AND eliminations = 0) OR (NOT "noShow" AND placement BETWEEN 1 AND 64 AND placement IS NOT NULL)));
ALTER TABLE "StageParticipant" ADD CONSTRAINT "stage_seed_positive" CHECK (seed > 0);
INSERT INTO "StageParticipant" ("stageId", "teamId", seed)
SELECT s.id, r."teamId", row_number() OVER (PARTITION BY s.id ORDER BY r."createdAt",r.id)
FROM "TournamentStage" s JOIN "TournamentRegistration" r ON r."tournamentId" = s."tournamentId" AND r.status = 'APPROVED';
UPDATE "TournamentStage" SET completed = true WHERE "tournamentId" IN (SELECT id FROM "Tournament" WHERE phase='COMPLETED');
COMMIT;

BEGIN;
-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('TEAM', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "TournamentVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ONLINE', 'OFFLINE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RegistrationStatus" ADD VALUE 'WAITLISTED';
ALTER TYPE "RegistrationStatus" ADD VALUE 'WITHDRAWN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TournamentPhase" ADD VALUE 'DRAFT';
ALTER TYPE "TournamentPhase" ADD VALUE 'PUBLISHED';
ALTER TYPE "TournamentPhase" ADD VALUE 'CHECK_IN';
ALTER TYPE "TournamentPhase" ADD VALUE 'POSTPONED';
ALTER TYPE "TournamentPhase" ADD VALUE 'CANCELLED';

-- DropIndex
DROP INDEX "Team_captainId_name_game_key";

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "bracket" TEXT NOT NULL DEFAULT 'WINNERS',
ADD COLUMN     "sourceAId" TEXT,
ADD COLUMN     "sourceAOutcome" TEXT NOT NULL DEFAULT 'WINNER',
ADD COLUMN     "sourceBId" TEXT,
ADD COLUMN     "sourceBOutcome" TEXT NOT NULL DEFAULT 'WINNER';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "competitionType" "CompetitionType" NOT NULL DEFAULT 'TEAM',
ADD COLUMN     "individualUserId" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "cancellationReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "checkInRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "competitionType" "CompetitionType" NOT NULL DEFAULT 'TEAM',
ADD COLUMN     "coverId" TEXT,
ADD COLUMN     "eligibility" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "eligibleRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "entryCategory" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "location" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "locationType" "LocationType" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "matchFormat" TEXT NOT NULL DEFAULT 'SCORE',
ADD COLUMN     "prizeInfo" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "shareTokenHash" TEXT,
ADD COLUMN     "visibility" "TournamentVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TournamentRegistration" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "waitlistReason" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TournamentAnnouncement" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentAnnouncement_tournamentId_createdAt_idx" ON "TournamentAnnouncement"("tournamentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Team_captainId_name_game_competitionType_key" ON "Team"("captainId", "name", "game", "competitionType");

-- CreateIndex
CREATE UNIQUE INDEX "Team_individualUserId_game_key" ON "Team"("individualUserId", "game");

-- CreateIndex
CREATE INDEX "Tournament_visibility_phase_startsAt_idx" ON "Tournament"("visibility", "phase", "startsAt");

-- CreateIndex
CREATE INDEX "Tournament_closesAt_idx" ON "Tournament"("closesAt");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_individualUserId_fkey" FOREIGN KEY ("individualUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_sourceAId_fkey" FOREIGN KEY ("sourceAId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_sourceBId_fkey" FOREIGN KEY ("sourceBId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentAnnouncement" ADD CONSTRAINT "TournamentAnnouncement_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_individual_size_check" CHECK ("competitionType" <> 'INDIVIDUAL' OR "teamSize" = 1), ADD CONSTRAINT "Tournament_end_date_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "Team" ADD CONSTRAINT "Team_individual_identity_check" CHECK (("competitionType" = 'INDIVIDUAL') = ("individualUserId" IS NOT NULL));
ALTER TABLE "Match" ADD CONSTRAINT "Match_source_outcome_check" CHECK ("sourceAOutcome" IN ('WINNER','LOSER') AND "sourceBOutcome" IN ('WINNER','LOSER'));
COMMIT;

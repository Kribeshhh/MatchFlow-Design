BEGIN;
-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "logoId" TEXT;

-- AlterTable
ALTER TABLE "TournamentRegistration" ADD COLUMN     "proposedRoster" JSONB,
ADD COLUMN     "rosterProposedBy" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarId" TEXT,
ADD COLUMN     "gamesPlayed" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "profilePublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "region" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "showHistory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showTeams" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "socialLinks" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_key_key" ON "MediaAsset"("key");

-- CreateIndex
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Do not publish previously private account bios on migration. New accounts use public defaults.
UPDATE "User" SET "profilePublic" = false;
-- Legacy external logos are not trusted upload assets.
UPDATE "Team" SET "logoUrl" = NULL;

COMMIT;

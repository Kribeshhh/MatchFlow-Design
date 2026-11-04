BEGIN;
-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'DELETION_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "IdentityPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD', 'REACTIVATE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "displayName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "roles" "Role"[] DEFAULT ARRAY['PLAYER', 'ORGANIZER']::"Role"[],
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "verificationRequired" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "authenticatedAt" TIMESTAMP(3),
ADD COLUMN     "id" TEXT;
UPDATE "Session" SET "id" = gen_random_uuid()::text;
ALTER TABLE "Session" ALTER COLUMN "id" SET NOT NULL;
-- Existing users keep access without falsely claiming their email was verified.
UPDATE "User" SET "verificationRequired" = false;

-- CreateTable
CREATE TABLE "IdentityToken" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "IdentityPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthFlow" (
    "stateHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "userId" TEXT,
    "sessionHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthFlow_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "TournamentPermission" (
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canManage" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TournamentPermission_pkey" PRIMARY KEY ("tournamentId","userId")
);

-- CreateTable
CREATE TABLE "AccountDeletion" (
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "AccountDeletion_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "IdentityToken_userId_purpose_idx" ON "IdentityToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "IdentityToken_expiresAt_idx" ON "IdentityToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_subject_key" ON "OAuthAccount"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_userId_provider_key" ON "OAuthAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "OAuthFlow_expiresAt_idx" ON "OAuthFlow"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthThrottle_resetsAt_idx" ON "AuthThrottle"("resetsAt");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "TournamentPermission_userId_idx" ON "TournamentPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_id_key" ON "Session"("id");

-- AddForeignKey
ALTER TABLE "IdentityToken" ADD CONSTRAINT "IdentityToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPermission" ADD CONSTRAINT "TournamentPermission_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPermission" ADD CONSTRAINT "TournamentPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletion" ADD CONSTRAINT "AccountDeletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "OrganizationMember" ("organizationId","userId","role") SELECT "id","ownerId",'OWNER' FROM "Organization";
COMMIT;

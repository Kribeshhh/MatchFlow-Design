-- AlterEnum
ALTER TYPE "AccountStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "staffVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "restrictedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "restrictedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "restrictedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StaffFactor" (
    "userId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastCounter" BIGINT NOT NULL DEFAULT -1,
    "recoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "StaffFactor_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "tournamentId" TEXT,
    "organizationId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionHold" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationCase_status_createdAt_idx" ON "ModerationCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationCase_reporterId_createdAt_idx" ON "ModerationCase"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_caseId_createdAt_idx" ON "ModerationAction"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionHold_resourceType_resourceId_key" ON "RetentionHold"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "StaffFactor" ADD CONSTRAINT "StaffFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_target_check" CHECK (num_nonnulls("userId", "teamId", "tournamentId", "organizationId") <= 1);
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_status_check" CHECK (status IN ('OPEN','REVIEWING','RESOLVED','DISMISSED'));
CREATE UNIQUE INDEX "ModerationCase_open_target" ON "ModerationCase" ("reporterId", COALESCE("userId", "teamId", "tournamentId", "organizationId")) WHERE status IN ('OPEN','REVIEWING') AND category <> 'SUPPORT';

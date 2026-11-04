BEGIN;
ALTER TABLE "Organization" ADD COLUMN "description" TEXT NOT NULL DEFAULT '', ADD COLUMN "region" TEXT NOT NULL DEFAULT '', ADD COLUMN "website" TEXT NOT NULL DEFAULT '', ADD COLUMN "publicProfile" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "logoId" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Tournament_organizationId_createdAt_idx" ON "Tournament"("organizationId", "createdAt");
COMMIT;

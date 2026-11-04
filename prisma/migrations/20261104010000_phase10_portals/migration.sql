-- CreateTable
CREATE TABLE "Portal" (
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "intro" TEXT NOT NULL DEFAULT '',
    "accent" TEXT NOT NULL DEFAULT '#D3F45D',
    "navigation" JSONB NOT NULL DEFAULT '[]',
    "hideAttribution" BOOLEAN NOT NULL DEFAULT false,
    "coverId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Portal_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "CustomDomain" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "challengeExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "providerStatus" TEXT NOT NULL DEFAULT 'unconfigured',
    "certificateStatus" TEXT NOT NULL DEFAULT 'unconfigured',
    "dnsRecords" JSONB NOT NULL DEFAULT '[]',
    "verifiedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Portal_slug_key" ON "Portal"("slug");

-- CreateIndex
CREATE INDEX "CustomDomain_organizationId_createdAt_idx" ON "CustomDomain"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomDomain_hostname_removedAt_idx" ON "CustomDomain"("hostname", "removedAt");

-- CreateIndex
CREATE INDEX "CustomDomain_nextCheckAt_leaseUntil_idx" ON "CustomDomain"("nextCheckAt", "leaseUntil");

-- AddForeignKey
ALTER TABLE "Portal" ADD CONSTRAINT "Portal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portal" ADD CONSTRAINT "Portal_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CustomDomain_active_hostname_key" ON "CustomDomain"(hostname) WHERE "removedAt" IS NULL;
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_status_check" CHECK(status IN ('PENDING','TLS_PENDING','ACTIVE','SUSPENDED','REMOVING','REMOVED'));
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_removed_check" CHECK((status='REMOVED')=("removedAt" IS NOT NULL));

ALTER TYPE "OrganizationRole" ADD VALUE IF NOT EXISTS 'MANAGER';
CREATE TABLE "OrganizationInvitation" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "email" TEXT NOT NULL, "role" "OrganizationRole" NOT NULL, "invitedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "emailState" TEXT NOT NULL DEFAULT 'PENDING',
 CONSTRAINT "OrganizationInvitation_no_owner" CHECK (role <> 'OWNER')
);
CREATE INDEX "OrganizationInvitation_email_status_idx" ON "OrganizationInvitation"(email,status);
CREATE INDEX "OrganizationInvitation_organizationId_status_idx" ON "OrganizationInvitation"("organizationId",status);
CREATE UNIQUE INDEX "OrganizationInvitation_pending_unique" ON "OrganizationInvitation"("organizationId",email) WHERE status='PENDING';
UPDATE "OrganizationMember" m SET role='ADMIN' WHERE role='OWNER' AND NOT EXISTS (SELECT 1 FROM "Organization" o WHERE o.id=m."organizationId" AND o."ownerId"=m."userId");

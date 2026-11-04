BEGIN;
ALTER TABLE "OrganizationInvitation" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'Invitation';
-- Preserve previously effective creator and explicit-grant access as legacy staff assignments.
INSERT INTO "OrganizationMember" ("organizationId", "userId", role)
SELECT DISTINCT t."organizationId", t."organizerId", 'MEMBER'::"OrganizationRole" FROM "Tournament" t JOIN "Organization" o ON o.id=t."organizationId" WHERE t."organizerId"<>o."ownerId" ON CONFLICT DO NOTHING;
INSERT INTO "OrganizationMember" ("organizationId", "userId", role)
SELECT DISTINCT t."organizationId", p."userId", 'MEMBER'::"OrganizationRole" FROM "TournamentPermission" p JOIN "Tournament" t ON t.id=p."tournamentId" JOIN "Organization" o ON o.id=t."organizationId" WHERE p."canManage" AND p."userId"<>o."ownerId" ON CONFLICT DO NOTHING;
INSERT INTO "TournamentPermission" ("tournamentId", "userId", "canManage") SELECT id, "organizerId", true FROM "Tournament" WHERE "organizationId" IS NOT NULL ON CONFLICT ("tournamentId","userId") DO UPDATE SET "canManage"=true;
COMMIT;

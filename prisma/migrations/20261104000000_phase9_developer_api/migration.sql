-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT[],
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationTournament" (
    "integrationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,

    CONSTRAINT "IntegrationTournament_pkey" PRIMARY KEY ("integrationId","tournamentId")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRequest" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCommand" (
    "integrationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCommand_pkey" PRIMARY KEY ("integrationId","key")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "events" TEXT[],
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "version" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "queuedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_organizationId_createdAt_idx" ON "Integration"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationTournament_tournamentId_idx" ON "IntegrationTournament"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_tokenHash_key" ON "ApiCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiCredential_integrationId_idx" ON "ApiCredential"("integrationId");

-- CreateIndex
CREATE INDEX "ApiRequest_integrationId_createdAt_idx" ON "ApiRequest"("integrationId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_integrationId_idx" ON "WebhookEndpoint"("integrationId");

-- CreateIndex
CREATE INDEX "WebhookEvent_dispatchedAt_createdAt_idx" ON "WebhookEvent"("dispatchedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_tournamentId_version_type_key" ON "WebhookEvent"("tournamentId", "version", "type");

-- CreateIndex
CREATE INDEX "WebhookDelivery_queuedAt_createdAt_idx" ON "WebhookDelivery"("queuedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationTournament" ADD CONSTRAINT "IntegrationTournament_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationTournament" ADD CONSTRAINT "IntegrationTournament_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRequest" ADD CONSTRAINT "ApiRequest_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCommand" ADD CONSTRAINT "ApiCommand_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Capture minimal external events in the domain transaction, after the live revision trigger.
CREATE FUNCTION matchflow_webhook_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; old_r jsonb; tid text; k text; v bigint;
BEGIN
 r := to_jsonb(NEW); old_r := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 tid := CASE WHEN TG_TABLE_NAME='Tournament' THEN r->>'id' ELSE r->>'tournamentId' END;
 SELECT version INTO v FROM "LiveRevision" WHERE "tournamentId"=tid;
 IF TG_TABLE_NAME='Tournament' THEN
   IF TG_OP='INSERT' THEN k:='tournament.created';
   ELSIF r->>'phase'='COMPLETED' AND old_r->>'phase'<>'COMPLETED' THEN k:='tournament.completed';
   ELSIF r->'engineVersion' IS DISTINCT FROM old_r->'engineVersion' THEN k:='bracket.updated'; END IF;
 ELSIF TG_TABLE_NAME='TournamentRegistration' AND r->>'status'='APPROVED' AND (TG_OP='INSERT' OR old_r->>'status'<>'APPROVED') THEN k:='registration.approved';
 ELSIF TG_TABLE_NAME='TournamentAnnouncement' AND TG_OP='INSERT' THEN k:='announcement.created';
 ELSIF TG_TABLE_NAME IN ('Match','BattleRound') AND TG_OP='UPDATE' THEN
   IF r->>'status'='COMPLETED' AND old_r->>'status'<>'COMPLETED' AND COALESCE((r->>'isBye')::boolean,false)=false THEN k:='match.completed';
   ELSIF r->'scheduledAt' IS DISTINCT FROM old_r->'scheduledAt' OR r->'venue' IS DISTINCT FROM old_r->'venue' OR r->'slotMinutes' IS DISTINCT FROM old_r->'slotMinutes' THEN k:='match.scheduled'; END IF;
 END IF;
 IF k IS NOT NULL THEN
   INSERT INTO "WebhookEvent" (id,"tournamentId",type,"resourceId",version) VALUES(gen_random_uuid()::text,tid,k,r->>'id',v) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER zz_webhook_tournament AFTER INSERT OR UPDATE ON "Tournament" FOR EACH ROW EXECUTE FUNCTION matchflow_webhook_capture();
CREATE TRIGGER zz_webhook_registration AFTER INSERT OR UPDATE ON "TournamentRegistration" FOR EACH ROW EXECUTE FUNCTION matchflow_webhook_capture();
CREATE TRIGGER zz_webhook_match AFTER INSERT OR UPDATE ON "Match" FOR EACH ROW EXECUTE FUNCTION matchflow_webhook_capture();
CREATE TRIGGER zz_webhook_battle AFTER INSERT OR UPDATE ON "BattleRound" FOR EACH ROW EXECUTE FUNCTION matchflow_webhook_capture();
CREATE TRIGGER zz_webhook_announcement AFTER INSERT ON "TournamentAnnouncement" FOR EACH ROW EXECUTE FUNCTION matchflow_webhook_capture();
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_status_check" CHECK(status IN ('PENDING','RETRY','SENT','DEAD','SKIPPED'));
ALTER TABLE "ApiRequest" ADD CONSTRAINT "ApiRequest_status_check" CHECK(status BETWEEN 100 AND 599);

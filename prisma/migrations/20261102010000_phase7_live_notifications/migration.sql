BEGIN;
-- CreateTable
CREATE TABLE "LiveRevision" (
    "tournamentId" TEXT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveRevision_pkey" PRIMARY KEY ("tournamentId")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailState" TEXT NOT NULL DEFAULT 'PENDING',
    "emailSentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "mutedKinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_dedupeKey_key" ON "NotificationEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationEvent_queuedAt_createdAt_idx" ON "NotificationEvent"("queuedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_emailState_createdAt_idx" ON "Notification"("emailState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_userId_key" ON "Notification"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "LiveRevision" ADD CONSTRAINT "LiveRevision_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Publish only committed changes. Per-tournament row locking orders versions across writers.
INSERT INTO "LiveRevision" ("tournamentId") SELECT id FROM "Tournament";
CREATE FUNCTION matchflow_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_row jsonb;
  previous_row jsonb;
  event_id text;
  event_kind text;
  resource_id text;
  metadata jsonb := '{}'::jsonb;
  dedupe text;
BEGIN
  current_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  previous_row := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  event_id := CASE WHEN TG_TABLE_NAME = 'Tournament' THEN current_row->>'id' ELSE current_row->>'tournamentId' END;
  resource_id := current_row->>'id';
  -- Cascading deletion must not resurrect an event or its revision.
  IF NOT EXISTS (SELECT 1 FROM "Tournament" WHERE id = event_id) THEN RETURN NULL; END IF;
  INSERT INTO "LiveRevision" ("tournamentId", version, "updatedAt") VALUES (event_id, 1, now())
    ON CONFLICT ("tournamentId") DO UPDATE SET version = "LiveRevision".version + 1, "updatedAt" = now();
  IF TG_TABLE_NAME = 'TournamentRegistration' THEN
    IF TG_OP <> 'UPDATE' OR current_row->'status' IS DISTINCT FROM previous_row->'status' THEN
      event_kind := 'REGISTRATION';
      metadata := jsonb_build_object('status', CASE WHEN TG_OP = 'DELETE' THEN 'REMOVED' ELSE current_row->>'status' END, 'roster', current_row->'roster', 'teamId', current_row->>'teamId');
    END IF;
  ELSIF TG_TABLE_NAME = 'TournamentAnnouncement' AND TG_OP = 'INSERT' THEN event_kind := 'ANNOUNCEMENT';
  ELSIF TG_TABLE_NAME = 'Tournament' AND TG_OP = 'UPDATE' AND current_row->'phase' IS DISTINCT FROM previous_row->'phase' THEN
    event_kind := 'LIFECYCLE';
  ELSIF TG_TABLE_NAME IN ('Match','BattleRound') AND TG_OP = 'UPDATE' THEN
    IF current_row->>'status' = 'COMPLETED' AND COALESCE((current_row->>'isBye')::boolean, false) = false AND
       (previous_row->>'status' <> 'COMPLETED' OR current_row->'winnerId' IS DISTINCT FROM previous_row->'winnerId' OR current_row->'scoreA' IS DISTINCT FROM previous_row->'scoreA' OR current_row->'scoreB' IS DISTINCT FROM previous_row->'scoreB') THEN
      event_kind := 'RESULT';
    ELSIF current_row->'scheduledAt' IS DISTINCT FROM previous_row->'scheduledAt' OR current_row->'venue' IS DISTINCT FROM previous_row->'venue' OR current_row->'slotMinutes' IS DISTINCT FROM previous_row->'slotMinutes' THEN
      event_kind := 'SCHEDULE';
    END IF;
    metadata := jsonb_build_object('teamIds', CASE WHEN TG_TABLE_NAME = 'BattleRound' THEN current_row->'participantIds' ELSE jsonb_build_array(current_row->>'teamAId',current_row->>'teamBId') END);
  END IF;
  IF event_kind IS NOT NULL THEN
    dedupe := txid_current()::text || ':' || event_id || ':' || event_kind || ':' || resource_id;
    INSERT INTO "NotificationEvent" (id,"dedupeKey","tournamentId",kind,"resourceId",payload)
      VALUES (gen_random_uuid()::text,dedupe,event_id,event_kind,resource_id,metadata)
      ON CONFLICT ("dedupeKey") DO UPDATE SET payload = EXCLUDED.payload;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER matchflow_live_tournament AFTER INSERT OR UPDATE ON "Tournament" FOR EACH ROW EXECUTE FUNCTION matchflow_capture_change();
CREATE TRIGGER matchflow_live_registration AFTER INSERT OR UPDATE OR DELETE ON "TournamentRegistration" FOR EACH ROW EXECUTE FUNCTION matchflow_capture_change();
CREATE TRIGGER matchflow_live_match AFTER INSERT OR UPDATE OR DELETE ON "Match" FOR EACH ROW EXECUTE FUNCTION matchflow_capture_change();
CREATE TRIGGER matchflow_live_battle AFTER INSERT OR UPDATE OR DELETE ON "BattleRound" FOR EACH ROW EXECUTE FUNCTION matchflow_capture_change();
CREATE TRIGGER matchflow_live_announcement AFTER INSERT OR UPDATE OR DELETE ON "TournamentAnnouncement" FOR EACH ROW EXECUTE FUNCTION matchflow_capture_change();

CREATE FUNCTION matchflow_notification_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE id=NEW."userId") THEN
    INSERT INTO "NotificationPreference" ("userId",revision) VALUES (NEW."userId",1)
      ON CONFLICT ("userId") DO UPDATE SET revision="NotificationPreference".revision+1;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER matchflow_notification_live AFTER INSERT OR UPDATE ON "Notification" FOR EACH ROW EXECUTE FUNCTION matchflow_notification_revision();

COMMIT;

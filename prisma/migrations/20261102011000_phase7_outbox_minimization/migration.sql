BEGIN;
-- Keep only stable recipient identifiers, never historical profile names, in the outbox.
CREATE FUNCTION matchflow_minimize_recipients() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payload ? 'roster' THEN
    NEW.payload := jsonb_set(NEW.payload,'{roster}',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p->>'id')) FROM jsonb_array_elements(NEW.payload->'roster') p),'[]'::jsonb));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER matchflow_outbox_minimize BEFORE INSERT OR UPDATE ON "NotificationEvent" FOR EACH ROW EXECUTE FUNCTION matchflow_minimize_recipients();
UPDATE "NotificationEvent" SET payload=payload WHERE payload ? 'roster';
COMMIT;

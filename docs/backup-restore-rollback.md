# Backup, restore and rollback

Follow the ownership/incident procedures in operations-runbook.md. Production backups require an approved RPO/RTO, retention/region, encryption and independent backup identity; these product/hosting choices are not invented here.

## Backup

Use managed PostgreSQL PITR plus periodically tested logical backups. With a secret-managed libpq service profile, run `pg_dump --dbname=service=matchflow_backup --format=custom --file=matchflow.dump` under umask 077. Record checksum, migration version, image digest, snapshot time and storage receipt without credentials. Encrypt before remote storage. Keep independent protected backups of STAFF_MFA_KEY and WEBHOOK_ENCRYPTION_KEY; database ciphertext alone cannot recover staff factors or webhook secrets. Protect bucket versions and media metadata consistently with database retention/legal holds.

## Restore drill

Provision a new isolated destination and reviewed libpq restore profile. Stop outbound workers and block SMTP, webhooks and domain provisioning on the restored environment before boot. Run `pg_restore --exit-on-error --no-owner --no-acl --dbname=service=matchflow_restore matchflow.dump`. Verify migrations, constraints, table fingerprints/counts, users/session digests, rosters/results/history, staff key recovery and representative reads. Reconcile queue retries and external domains before allowing outbound jobs. Never restore over a live database merely to test a backup.

`npm run test:restore` is the executable local drill: it requires a guarded loopback TEST_DATABASE_URL distinct from the working database, dumps it to a mode-0600 ignored artifact, creates a random fresh destination, restores all objects, compares every public table fingerprint, runs migrate deploy against the restored destination, and removes only that freshly created database. Do not run it concurrently with browser/integration writers. Its report measures local restore execution, not production RTO, PITR coverage, external media recovery or cloud backup durability. PostgreSQL client tools must be compatible with the server version.

## Migration and rollback

1. Serialize releases. Run read-only preflight, review SQL/locking/data compatibility, take and verify a recoverable backup, record the current image and migration state. Do not edit historical deployed migrations.
2. Use the migration target with dedicated direct database credentials. Apply expand-compatible schema changes before new API/worker images. For incompatible changes, stop old writers explicitly and use a reviewed maintenance window. Do not assume every old application image supports every new schema.
3. Verify health, auth, private resources and competition operations before resuming traffic. Inspect error rates, queue age and audit events. A readiness response alone is not release acceptance.
4. For application-only rollback where schema compatibility was verified, drain new API/worker replicas and redeploy the prior immutable digest. Preserve committed results and command receipts; inspect retried notifications for expected at-least-once semantics.
5. If schema/data are incompatible or corrupted, stop writes, preserve incident evidence, restore/PITR into a new isolated database, validate, and perform a reviewed connection cutover. Account for writes since the restore point; reconcile rather than silently lose results. Restore corresponding encryption keys/media references. Never issue automatic down-migrations, reset databases or delete production data.
6. Record elapsed recovery, actual data gap, failed checks and operator approval. Test these steps in staging before release. The repository does not claim a cloud rollback exercise has occurred.

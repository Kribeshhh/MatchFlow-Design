# Platform operations — Phase 11

## Ownership and access

Assign an incident lead, security reviewer, database operator and support owner before launch. Maintain their contact details outside source control. Bootstrap only a verified active administrator using the existing `admin:grant` command; every staff member must enroll TOTP. Require distinct staff accounts, a password manager, private recovery-code storage and synchronized system time. Use MODERATOR for report review and ordinary-account/content enforcement; reserve ADMIN for staff roles, ownership transfers, confirmed-result corrections and API-use records. Organization administrators are not platform administrators.

Configure STAFF_MFA_KEY as an independently generated 32-byte lowercase-hex secret on every API instance. Keep it separate from webhook encryption and origin-auth secrets. Back it up in a secret manager with access logging. Changing this key without re-encrypting factors locks out enrolled staff; do not rotate it by merely changing an environment value. Use a reviewed maintenance migration to decrypt/re-encrypt with old/new keys and revoke staff session proofs. Never place keys in tickets, screenshots, logs, test data or shell history. Missing configuration blocks staff APIs.

Authenticator setup keys and ten recovery codes are shown only at enrollment. The account-security screen can replace a factor using a fresh OTP or unused recovery code plus recent primary authentication; this revokes other sessions. If both factor and recovery codes are lost, use a documented out-of-band identity-verification and two-operator incident procedure before database intervention. There is intentionally no unauthenticated MFA-reset API. Record any emergency intervention in restricted incident evidence and append an identifier-only audit event. Never bypass the gate for ordinary troubleshooting.

## Support and appeals

Signed-in verified accounts submit cases at /support and see their own status/resolution. Resource report links preselect the target; the server verifies target visibility. Reports are limited to five per account per hour and bounded plain text. Staff use /administration → Cases, or Open Case from Users/Organizations/Tournaments for private-resource intake; internal reasons are separate from the reporter-visible resolution. Do not paste credentials, full identity documents or unrelated personal information into cases.

Publish SUPPORT_CONTACT_EMAIL before launch. /help exposes this operator mailbox for locked-out users and appeals; it does not send or simulate email. Without configuration it explicitly states unavailability. Verify account control before discussing private information; knowledge of a username, case ID or email address alone is not identity proof. Record the decision and reason in the case. Define response targets and emergency escalation coverage operationally; the application makes no fictional response-time promise.

Suspension revokes sessions and recovery/OAuth flows and blocks normal login. Restoration permits a fresh login and never restores old sessions. Moderators cannot suspend themselves or platform staff; administrators cannot remove the last active administrator. Content restriction replaces public descriptive text, unlinks offending media and blocks ordinary editing/registration. Tournament competition records remain; restricted tournaments become private. Organization restriction also disables its portal/integrations. Restoring content does not automatically republish events/portals or enable credentials. Review remaining publication/media settings explicitly. Removed announcements/media are not automatically resurrected.

Result disputes keep the existing reviewed correction procedure: administrator factor verification and recent primary authentication, exact event/dispute binding, rollback preview, explicit VOID_AND_REPLAY acknowledgement and reason. Stale previews fail. Dependent results are voided, history retained and affected matches replayed. Never fix scores with direct SQL.

## Backups and restore

Use managed PostgreSQL backups/PITR where available. Define approved RPO/RTO, retention, encryption, geographic placement and restore ownership before launch. The repository does not configure a backup provider. Keep encrypted backups separate from the application account and test restoration regularly. Database backups contain private reports and encrypted factor secrets; protect them and the separate encryption keys independently.

For a logical backup, configure libpq service profiles/secret-managed credentials outside source control, then run:

```sh
umask 077
pg_dump --dbname=service=matchflow_backup --format=custom --file=matchflow.dump
pg_restore --list matchflow.dump
```

Encrypt/upload the artifact using the approved backup system, verify checksum and record completion time without logging credentials. A file listing is not a restore test. Restore only into a newly provisioned isolated destination with reviewed service configuration:

```sh
pg_restore --exit-on-error --no-owner --dbname=service=matchflow_restore matchflow.dump
```

Never point the restore service at production or use test/reset commands on production. Disable outbound SMTP/webhooks/domain provisioning during drills; restored jobs must not contact real recipients. Validate migrations, row counts, representative user/session/roster/result relations, application readiness and the seven format regressions. Reconcile external domain/TLS ownership before enabling tenant routing after recovery. Confirm S3 objects, queue state and encryption-key recovery separately. Record actual elapsed recovery time and any data gap; no restore drill is claimed by local unit tests.

## Monitoring and alerts

Provide independent probes of /api/live and /api/ready on the canonical host through the deployed proxy. Alert on sustained readiness failures, elevated 5xx rates/latency, connection-pool saturation, disk/backup-age thresholds, failed restore checks and unavailable providers. Choose thresholds from measured baseline/load tests, not fictional dashboard values.

The staff overview reports actual active accounts, organizations, tournaments, unresolved cases/disputes, 24-hour API request/error counts, retry/dead email counts and database query reachability. It is not an external uptime monitor. ApiRequest status 102 means completion was not persisted, not successful delivery. Configure collection/alerts for existing structured route/status/duration logs without request bodies, raw query strings, cookies or tokens.

Monitor pg-boss queue depth/oldest-job age and dead letters with notifications:jobs. Investigate SMTP/webhook retries, stale DNS/TLS checks and domains stuck REMOVING; do not release a hostname while provider cleanup is uncertain. Alert on repeated staff-factor failures, recovery-code use, platform-role/ownership/domain changes and unusual credential creation/revocation. Keep externally protected audit exports under the retention/hold policy; application AuditEvent has no ordinary-user mutation API, but a database superuser remains trusted. External immutable storage and alert delivery are deployment work, not simulated integrations.

## Incident response

1. Triage the alert, open a restricted incident record, identify the lead and affected accounts/organizations/resources, and preserve timestamps/request IDs. Do not collect secrets unnecessarily.
2. Contain proportionately: revoke sessions/credentials, suspend affected accounts, restrict fraudulent content, disable compromised integrations/portals and protect the origin. Preserve held evidence before cleanup. Avoid broad tenant exports.
3. Investigate with identifier-only audit trails and authorized case/competition evidence. Record each access and decision. Review cross-tenant scope and any exposed personal data; consult the designated legal/privacy lead for notification obligations and deadlines.
4. Eradicate the cause, patch and regression-test, rotate affected secrets through reviewed procedures and restore from verified backups only if needed. Never silently overwrite tournament history.
5. Recover gradually, revalidate private resources and custom-domain ownership, monitor recurrence and confirm user-facing support updates. Close with a post-incident review and assigned corrective actions.

This workflow follows the preparation, detection, response and recovery emphasis of [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final). It is a runbook, not evidence that monitoring, on-call coverage or notification channels have been provisioned.

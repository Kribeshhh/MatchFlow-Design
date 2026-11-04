# Deployment documentation

Current guidance is [production deployment](production-deployment.md), [environment variables](environment-variables.md), [backup/rollback](backup-restore-rollback.md), and [Phase 12 verification](phase-12-verification.md). The following records are historical implementation notes; later phases supersede earlier availability statements.

## Historical Phase 1 deployment

The repository has passing local foundation gates and CI configuration, but is not cleared for unrestricted production launch. See security-model.md and the remaining product/operational blockers in progress-tracker.md. A static-only deployment cannot provide the Express/PostgreSQL workflows.

## Build and runtime

From the repository root: `npm ci`, `npm run build`, reviewed `npm run db:migrate`, then `npm start`. Build generates Prisma, type-checks both apps, emits the API/shared code under dist/api and bundles the SPA into apps/web/dist. Express serves the SPA and routes; `/api` misses remain JSON 404. Do not reuse old server-dist or dist frontend artifacts. `npm run preview` is a frontend preview with an API proxy, not a production server.

Set DATABASE_URL, NODE_ENV=production and CLIENT_ORIGIN to exact HTTPS origin(s). Optional PORT (3001), HOST (127.0.0.1), LOG_LEVEL (info). Keep secrets in deployment environment configuration, not frontend build variables. TEST_DATABASE_URL is only for disposable test commands. API_PROXY_TARGET is a Vite development/test proxy override. PG_BIN chooses local PostgreSQL tools. .env remains ignored.

Default loopback binding supports a same-host reverse proxy. Deliberately set HOST for a container network; configure TLS, proxy trust, cache isolation, request/time limits and connection pooling for the selected topology. No hosting provider or automatic deployment was chosen. Never run the demo seed in production.

## Health, logs and lifecycle

`/api/live` confirms process response. `/api/ready` and compatible `/api/health` run a bounded database probe and return 503 on dependency failure/shutdown. Logs include server-generated request IDs, route templates, status and duration; no raw body/query/cookie data. Central errors return safe JSON. SIGTERM/SIGINT stop accepting traffic, close idle connections, drain requests and disconnect Prisma, with forced shutdown after ten seconds. Request/header timeouts are configured.

CI in .github/workflows/ci.yml uses disposable loopback PostgreSQL 17, a clean install, lint/format/type/test/build gates, migration replay, desktop/mobile browser smoke and advisory scanning. It has been configured, not executed remotely during this phase. Its isolated trust-auth database is not deployment guidance.

## Migration and local application

Follow [database-migration-plan.md](database-migration-plan.md): read-only preflight, backup, maintenance window, additive migration, application release and verification. The migration was replayed on legacy fixture data and applied to the separate local test and development databases. A protected pre-migration local backup is in .local/backups/phase1-before.dump. No development records were reset or seeded. This backup is not a completed restore drill or production recovery plan.

## Remaining release gates

Review launch audience/consent/account recovery, fixture landing claims, asset rights and tenant requirements. Select hosting/region and limits; run representative staging/load/security/accessibility checks, backup restore drills and rollback exercises. Add monitored metrics/error alerts and incident ownership. Define retention and audit coverage. Multi-instance rate limits, external secret management and real deployment verification remain future work. Stop old application writers during this migration because they do not maintain the new result/audit records.

## Phase 2 identity configuration and operations

Set APP_ORIGIN to the exact canonical public origin (HTTPS in production) and include it in CLIENT_ORIGIN. Configure SMTP_HOST and MAIL_FROM together; use SMTP_PORT=587 and SMTP_SECURE=false for STARTTLS, or the provider's implicit TLS port with SMTP_SECURE=true. Production requires TLS. Set SMTP_USER and SMTP_PASSWORD together when authentication is required. Keep secrets in deployment secret storage, never VITE variables. Without configuration the UI explains that email is unavailable; new users cannot finish verification until configured.

Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together. Register the exact callback `${APP_ORIGIN}/api/auth/google/callback` in Google Console. Local default: `http://localhost:5173/api/auth/google/callback`; production uses the public HTTPS origin. Use a Google web application client and allow the intended origins/test users according to the Google console configuration. Verify real login, consent, rejected callbacks and explicit linking in staging before launch. No provider tokens are stored. Google controls are unavailable until configured.

SMTP delivery is immediate, with safe failure logging and bounded shutdown draining; it is not a durable queue. Verify sender authentication/deliverability and reset/verification/reactivation links in staging. A failed or interrupted delivery requires requesting a new link; monitor fixed delivery-failure events. Do not expose test mail collectors publicly.

Schedule `npm run auth:cleanup` from the deployment scheduler to remove expired sessions/tokens/flows/throttles; no Redis or worker is required. Bootstrap only a verified active operator using `npm run admin:grant -- --email <operator-email> --confirm`; this revokes that account's sessions and audits the grant. Never grant platform roles from frontend or public registration. Database auth throttles work across instances; IP limits remain process-local and require reviewed proxy/rate-limit configuration for scaled deployment.

Run preflight, protected backup, migration replay and migrate deploy in the release process. Preserve the Phase 2 migration after deployment. See database-migration-plan.md. MFA is not enabled; staging/provider tests, retention policy, ownership transfer, restore drill, monitoring and security review remain launch gates.

## Phase 4 — S3-compatible images

The user deferred provider configuration. Without S3 settings the app returns available=false and disables upload controls; existing account/team features still work. No local storage fallback exists.

Configure S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY together in the environment/secret manager. For non-AWS providers also set S3_ENDPOINT (HTTPS, no URL credentials) and, when required, S3_FORCE_PATH_STYLE=true. Never use VITE_ variables for credentials. Bucket must be private, public access blocked, and encrypted at rest using the provider's configuration. Grant only GetObject/PutObject/DeleteObject on the matchflow/ prefix in a dedicated bucket. No public ACL, browser credential, client key or presigned direct upload is used. Confirm endpoint/checksum/path-style compatibility with the selected provider.

Allow the API to receive raw image bodies up to 2 MB. Keep reverse-proxy request limits consistent and timeouts sufficient for bounded image processing/S3 requests. Images are re-encoded to WebP at up to 512×512; originals/metadata are not retained. Public logos/avatars are served through /api/media/:id; private avatars require the owner's current session. Unattached assets and deactivated/deleted private avatars cannot be read. Responses are no-store; do not add a public caching layer that bypasses privacy checks.

Run `npm run media:cleanup` hourly from one deployment instance. Each run deletes at most 100 unattached assets older than 24 hours, using DB-owned keys. Repeat if a backlog exists; monitor safe failure output. This covers replaced/removed avatars/logos, anonymized accounts and tracked failed uploads. If bucket versioning is enabled, configure noncurrent-version expiration separately: DeleteObject alone does not erase retained versions. Define backup, retention and restore policies before launch. Do not configure a blanket current-object expiry that deletes attached images.

Before enabling public uploads, perform a staging upload/read/replacement/removal test with the real provider, test private-profile access from a second user, inspect bucket access/encryption, and exercise cleanup/restore. Local tests exercise actual SDK signing against loopback and isolated upload adapters; they do not certify a cloud deployment. See [AWS SDK examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html) and [Sharp input limits](https://sharp.pixelplumbing.com/api-constructor/).

## Phase 5 deployment

Apply both 20261101 migrations after preflight, protected backup and disposable replay. Deploy API/web together because new enums/response fields and match statistics cross both contracts. Existing events retain public/team/single-elimination behavior. No Redis or background worker is introduced. Configure the existing private S3 adapter to enable covers; the same cleanup command now retains attached covers. SMTP, Google and S3 live provider qualification remain deferred as previously approved.

Serve the SPA route for private fragment links and keep HTTPS/cookie/origin policy intact. Never log copied share links or response bodies containing freshly rotated tokens. Rotation invalidates old link-only cookies; participants retain snapshot access. RR/Swiss depend on organizer-reported statistics and are capped at 16. Paid entry, telemetry validation and native battle-royale scoring are not supported. Production load, restore, browser/security and provider acceptance gates still apply.

## Phase 6 release considerations

Deploy all three Phase 6 forward migrations and compatible API/web code after a writer drain, protected backup and disposable replay. See database-migration-plan.md. Existing sessions remain valid. New draw/administrative outcomes and lobby records require the new application; do not roll back to writers that assume every result has unequal scores. Monitor serializable retries and review-history growth. Competition snapshots/command receipts currently persist with their tournament; a retention policy and production-scale load/restore qualification remain release gates. Browser zoom uses modern CSS zoom; supported-browser staging checks remain necessary. No game credentials, worker, Redis or additional provider configuration is needed for manually operated competitions.

## Phase 7 operations

Run the pinned Node/dependency versions and deploy application migrations before starting the API. Back up the whole database, including `matchflow_jobs`; pg-boss initializes/migrates that schema at startup and needs the corresponding DDL permissions. Validate upgrades on a restored staging database. Each worker adds a pool of up to four PostgreSQL connections; budget Prisma/API pools separately.

`NOTIFICATION_WORKER=true` (default) runs a durable worker in each API. For dedicated workers, set it false on API processes and run `npm run notifications:worker` under a process supervisor with the same database/SMTP configuration. At least one worker must run. Multiple workers coordinate through PostgreSQL. Queue initialization blocks readiness; database readiness remains active, but queue backlog/worker liveness need separate monitoring.

Forward WebSocket upgrades at `/api/realtime` and preserve the configured allowed Origin. TLS/WSS is required in production. WebSocket-only transport avoids Socket.IO long-polling sticky-session requirements; blocked sockets use authorized HTTP polling every 15 seconds. Each API polls its active subscription revisions every second, so no Redis adapter is required. Load-test this database polling budget before increasing instance/connection counts. Existing exact-origin and proxy trust configuration must be reviewed for the deployed topology.

Use `npm run notifications:jobs -- status` for queue counts, unprocessed event counts, email states and dead-letter identifiers. After resolving a failure, `npm run notifications:jobs -- retry <dead-letter-uuid>` redrives one job. Do not manually reset progression or edit queue state. Alert on increasing pending age/backlog, DEAD mail, failed events, queue errors and missing worker heartbeats. Retry defaults are five retries with exponential delay starting at 30 seconds and a 60-second lease. Completed/source jobs retain seven days and dead letters 30 days. Application notifications/outbox currently retain history until owner deletion.

Configure the existing SMTP environment variables to enable mail. Missing SMTP leaves deliveries pending; mail older than seven days, unauthorized recipients and stale check-in reminders are skipped. SMTP can resend after an acceptance/commit crash; stable Message-ID is best effort, not exactly-once delivery. Account recovery/verification continues through its existing immediate mail path. Live provider tests, restart/restore drills, proxy/WSS verification and load qualification are required before public release. Do not use integration/browser test scripts against production.

## Phase 8 operations

Apply the three organization migrations after backup/preflight; validate legacy organization creator/grantee access against staging. Existing users, sessions, teams and competition records are preserved. Organization branding uses the already-configured private S3 bucket and cleanup process; missing credentials remain visibly unavailable.

The existing worker adds organization-invitations with the same durable retry/dead-letter settings. SMTP configuration is required for new-account invitation delivery and email verification. Invitations remain pending without SMTP; verified existing users can review them through /organizations. No production mail is simulated. Operator notification queue status includes the invitation queue; use the existing dead-letter redrive command after investigating delivery failures. SMTP may resend across the acceptance/commit crash window with a stable Message-ID.

Maintain recent-authentication requirements for staff/invitation changes. Before public launch, agree invitation/email/audit retention and owner succession policies, verify SMTP/S3/proxy settings, exercise backups/restores, load-test analytics/queue behavior and complete accessibility/security review. These are release gates, not completed production certification.

## Phase 9 API and webhook operations

Apply the additive Phase 9 migration only after preflight/backup. Use the existing PostgreSQL/pg-boss worker and NOTIFICATION_WORKER switch. `npm run notifications:jobs` now reports developer-webhooks and delivery state counts. Inspect DEAD deliveries in the owner/admin developer workspace and redrive there after fixing the receiver. That resets the retained delivery state and preserves webhook-id. The generic queue redrive CLI alone does not clear a terminal WebhookDelivery state; use the developer workspace for webhook redrive.

Webhook signing requires WEBHOOK_ENCRYPTION_KEY: a cryptographically random 32-byte lowercase hex key supplied identically to all API/worker instances by a secret manager. Do not commit or print it. A local operator can generate it with `openssl rand -hex 32` and place it in .env outside source control. Back up the key separately from the database. Losing/replacing it prevents decrypting retained endpoint secrets. Planned master-key rotation requires re-encrypting secrets under the new key or recreating endpoints while old workers are stopped; no automatic multi-key migration is claimed. Receiver signing-secret rotation is supported per endpoint in the dashboard.

Missing master key leaves webhook creation/dispatch explicitly unavailable; API credentials and reads/writes work independently. Tests strip production WEBHOOK_ variables and use ephemeral in-process keys/transport adapters. No external receiver is contacted by test jobs. SMTP, Google and S3 remain separately configurable as previously documented.

Allow outbound DNS and HTTPS only through reviewed egress controls. The application independently resolves all destination answers, blocks nonpublic networks, pins the checked IP and verifies TLS; it never follows redirects. Qualify a real HTTPS receiver, signing verification, duplicate/out-of-order handling and outage/recovery in staging. Validate proxy IP trust/limits, DNS/network timeouts, multi-worker load, backup restore and encryption-key recovery before production.

Monitor pending events, queue age, DEAD/retry counts, API 102/429/5xx rates, audit-write failures and database growth. Dispatch processes up to 100 events and 100 deliveries per worker tick. Access logs, command receipts and webhook history currently remain retained; set a reviewed archival/retention policy before public scale. Receivers retain dedupe receipts for the permitted replay lifetime. Do not purge command receipts while callers may still retry their keys. These are release gates, not completed production operations.

## Phase 10 — Cloudflare for SaaS release gate

Configure a Cloudflare for SaaS zone and an active fallback origin following the provider documentation linked in ADR 0011. Set CLOUDFLARE_ZONE_ID, a least-privilege zone custom-hostname API token, PORTAL_CNAME_TARGET and PORTAL_ORIGIN_SECRET together on API/worker instances. Generate the origin secret securely (32 random bytes, lowercase hex), never commit it. Use the configured CNAME target in customer DNS; apex flattening requires provider-approved public addresses explicitly listed in PORTAL_APEX_ADDRESSES. Do not infer these addresses from arbitrary DNS.

The trusted edge must overwrite X-MatchFlow-Origin with the secret and preserve the verified custom Host; strip client-supplied copies. Protect origin traffic with TLS and firewall/mTLS restrictions. Do not expose the secret in browser JavaScript. APP_ORIGIN and CLIENT_ORIGIN define canonical hostnames; X-Forwarded-Host is never trusted. Confirm reverse-proxy/static routing sends unknown hosts through the boundary rather than serving an unrestricted SPA fallback. Do not independently cache private API or tenant-context responses.

An owner configures and publishes a portal, claims a hostname, installs its _matchflow-challenge TXT value and required CNAME, then checks DNS/TLS. Install any additional Cloudflare ownership/certificate DNS records shown in the dashboard. Both hostname and certificate must become active before routing. Keep ownership TXT/routing records present: reconciliation runs through existing pg-boss, and routing expires after fifteen minutes without a successful check. Monitor custom-domain-reconcile queue and domain status. Provider outages deliberately fail closed.

Removal disables routing immediately; the worker confirms provider deletion before releasing the hostname. Never manually delete a pending cleanup row or cascade-delete its organization. A reassigned hostname needs a fresh TXT challenge. Pending challenge expiry does not automatically release the reservation. Rotate an expired challenge or remove the claim. Configure PORTAL_ALLOW_HIDE_ATTRIBUTION only according to platform policy; default false keeps attribution visible.

Before production: exercise a real external domain, certificate provisioning/renewal, DNS loss, authenticated edge, canonical/custom cookie boundaries, removal and reassignment in staging. These live checks are not verified by local injected-provider tests. S3 uploads also require the previously documented provider configuration. No provider credentials have been provisioned by this phase.

## Phase 11 operational release gates

Configure STAFF_MFA_KEY (independently generated 32-byte lowercase hex) consistently on API instances. Preserve it separately from the database in managed secret storage; never replace it without a factor re-encryption plan. Enroll all platform staff and store their one-use recovery codes privately. Historical sessions remain valid for ordinary work but receive no staff proof. Test subprocesses replace the staff key with ephemeral generated test configuration.

Publish SUPPORT_CONTACT_EMAIL for locked-out users and appeals before launch. Configure SUPPORT_RETENTION_DAYS=90, MODERATION_RETENTION_DAYS=365 and AUDIT_RETENTION_DAYS=365 as approved defaults; validate legal/contractual needs before production. Schedule reviewed privacy:cleanup -- --apply only after dry-run and hold review. Follow operations-runbook.md and privacy-retention.md for backup isolation/restore, incident response, alerts and external evidence retention. No backup/monitor/alert provider has been silently provisioned by Phase 11.

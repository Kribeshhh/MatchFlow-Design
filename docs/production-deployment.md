# Production deployment — Phase 12

Status: deployment configuration prepared; public launch is blocked pending the qualification checklist. No provider selected, cloud resources created, or production deployment performed. See [verification](phase-12-verification.md), [security review](security-review.md) and [ADR 0013](decisions/0013-phase-12-production-release.md).

## Topology and release artifact

Use a managed TLS ingress → private API/SPA containers → private managed PostgreSQL 17. A dedicated worker uses the same runtime layers and PostgreSQL queue; the worker image target disables the HTTP healthcheck because it has no listener. Private S3-compatible storage, SMTP, Google and Cloudflare for SaaS remain explicit adapters. No Redis is required. Restrict origin access to ingress; restrict database ingress to API/worker/migration/backup identities. Permit only reviewed outbound DNS, SMTP and HTTPS; block metadata/internal networks for webhook egress as defense in depth.

Use the supported Node 22 LTS security patch in `.nvmrc` and `infra/Dockerfile`; plan migration before its April 2027 support end. Update patch and lockfile together, rebuild native dependencies in Linux and rerun all gates. The Docker build uses `npm ci`, generates Prisma, performs strict checks and bundles the SPA. Runtime drops development dependencies, runs as node, and excludes test/seed sources. Use a read-only root, writable bounded /tmp, dropped capabilities, no-new-privileges, process/resource limits and at least 30 seconds termination grace.

Build runtime and migration targets from the same commit. Resolve base tags to reviewed digests in the selected registry, scan OS packages, record image digest/SBOM/provenance and sign through the selected release service. The repository pins Node patch but does not pretend mutable OS tags are immutable. `.github/workflows/ci.yml` validates code/security and includes Linux container smoke checks; `release.yml` prepares checksummed images behind the staging environment gate. Configure required reviewers and protected branches in GitHub. It deliberately does not select a registry or pretend to deploy. Require successful CI on the exact commit before promotion. Provider-specific push/deploy steps remain to be supplied after hosting selection.

## Local container integration

Docker is required and was unavailable on the implementation host. `infra/compose.yml` is local integration configuration, not a production database deployment. Generate a random local database password and an independent 32-byte lowercase-hex MFA key. Set LOCAL_DB_PASSWORD, LOCAL_DATABASE_URL (postgresql://matchflow:<URL-encoded-password>@database:5432/matchflow_integration), and LOCAL_STAFF_MFA_KEY outside source control. Run:

```sh
docker compose -f infra/compose.yml config --quiet
docker compose -f infra/compose.yml up --build -d
curl --fail -H 'Host: localhost:8443' http://127.0.0.1:3102/api/ready
docker compose -f infra/compose.yml down
```

This probes the private HTTP hop with a canonical Host. For browser authentication, put a locally trusted HTTPS reverse proxy on https://localhost:8443 forwarding to 127.0.0.1:3102. Do not turn off Secure cookies to browse over HTTP. Compose preserves its named database volume; do not use `down -v` on valuable data. Local provider features remain unavailable without their actual configuration.

## Staging procedure

1. Select provider/region with the operator, create separate staging database, bucket, domain, mail sandbox, secret set and application identities. Use synthetic consenting test accounts, never copy production personal data into staging without a separate approved process.
2. Configure the [environment contract](environment-variables.md). Run `npm run release:config` inside the candidate runtime; any blocked result requires resolution before full-platform qualification. Require HTTPS canonical APP_ORIGIN and exact CLIENT_ORIGIN. Ingress must overwrite forwarded client-IP/protocol headers, strip client X-MatchFlow-Origin, preserve validated canonical Host, and inject the origin secret only for managed verified custom hosts. Set TRUSTED_PROXIES to actual ingress addresses/CIDRs, not the entire internet or hop counts. Origin firewalling is mandatory.
3. Create bounded database pools. Set Prisma connection_limit and pool_timeout explicitly in DATABASE_URL based on measured instance counts and database capacity; reserve connections for pg-boss, migration, backup and operators. Use provider-verified TLS/CA; never sslaccept=accept_invalid_certs. Keep a direct migration connection when a transaction pooler is used. Qualify pg-boss and Prisma behavior with that pooler; prefer direct worker connections initially.
4. Run preflight and protected backup with independent operator credentials. Apply the migration image as a single serialized release job. Never run schema resets, demo seed, or test scripts against staging/production. Application replicas do not automatically migrate.
5. Start a worker with `node dist/api/scripts/notification-worker.js`; set NOTIFICATION_WORKER=false on API replicas. Alternatively run embedded workers using the documented default, and measure pool/queue capacity. Monitor workers independently: API readiness does not prove external-worker health. Schedule compiled auth/media/privacy maintenance commands; privacy cleanup remains dry-run until reviewed.
6. Probe /api/live and /api/ready through actual HTTPS ingress. Exercise registration/verification/login/logout/recovery, staff TOTP, all seven formats, organizations/private events, API credentials, a real signed webhook receiver and custom-host isolation. Verify failed provider calls, queue retries, reconnects and secret redaction.
7. Verify real S3 upload/download permissions and deletion; Google callback/linking; SMTP sender authentication/deliverability; Cloudflare TXT/CNAME/TLS, revalidation and safe domain removal/reassignment. Adapter tests do not replace these checks.
8. Restore a staging backup into a fresh isolated destination and recover external encryption keys/object media. Measure RPO/RTO. Exercise previous-image rollback and worker drain, then representative multi-instance/soak load with monitoring and ingress limits enabled.
9. Record evidence, unresolved risks and operator sign-off in the launch checklist before promoting the exact tested image digest. No public launch is inferred from a green local suite.

## Ingress, caching and limits

Terminate current TLS at the managed ingress, redirect HTTP to HTTPS and preserve WebSocket upgrades for /api/realtime. Reject oversized headers/bodies and enforce request/idle/connection limits consistent with 30-second API requests, 15-second headers and bounded uploads. Apply distributed abuse/IP limits there; built-in general IP counters are per process, while identity and integration controls include database enforcement. The application uses WebSocket-only Socket.IO transport; qualify upgrade handling, connection timeouts and reconnects across the selected load balancer.

Never cache authenticated/private API responses, portal bootstrap or account HTML across hosts/users. Preserve no-store and host separation. Cache only content-hashed static assets under a separate reviewed policy. Do not route arbitrary hostnames to a tenant or forward cookies/credentials between unrelated domains.

## Monitoring and shutdown

Collect structured stdout with request ID, route template, status and duration. Scrub queries, headers, cookies and bodies in ingress and error collection too. Set alerts for readiness, error/latency budgets, database connections/storage, backup freshness/restore failures, queue age/dead letters, worker exits and stale domain verification. Route test alerts to an actual on-call owner before launch. The application logger is not a provisioned monitoring service.

SIGTERM drains work and disconnects dependencies under a 20-second process deadline. Ensure ingress stops routing before termination; configure a 30-second or longer termination grace. Verify no lost confirmed results and retry-safe jobs during rolling deployment. See [operations runbook](operations-runbook.md) for incidents, staff recovery and support.

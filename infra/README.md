# Current production preparation

Phase 12 adds Dockerfile build/runtime/migration/worker targets, compose.yml for isolated local integration, healthcheck.mjs and focused Semgrep rules. See [deployment](../docs/production-deployment.md) and [actual verification](../docs/phase-12-verification.md). These artifacts have not been executed by Docker on this host; no cloud provider is assumed.

## Historical infrastructure notes

# Infrastructure boundary

Phase 1 keeps one Node API/SPA process and PostgreSQL. No Redis, background worker, object storage or hosting provider is introduced. `.github/workflows/ci.yml` runs checks against an isolated PostgreSQL 17 service. Password-free trust is limited to that disposable loopback CI service; never copy it into deployment configuration.

Production uses `npm ci`, `npm run build`, reviewed `npm run db:migrate`, and `npm start` from the repository root. Provide DATABASE_URL, NODE_ENV=production, HTTPS CLIENT_ORIGIN and APP_ORIGIN and optional HOST/PORT through the deployment environment. Default HOST is loopback; set deliberately for a container. Serve behind a configured HTTPS reverse proxy; do not enable blanket proxy trust. Monitor `/api/live` and `/api/ready`. Read docs/deployment.md and docs/database-migration-plan.md before deploying. Actual hosting, backup/restore, multi-instance rate limiting and tenant domains remain later release work.

## Phase 10 current boundary

The Phase 1 paragraph above is historical. Current infrastructure includes PostgreSQL/pg-boss durable workers, optional private S3 and SMTP adapters, and optional Cloudflare for SaaS. No Redis is required. Custom-host routing requires a trusted edge that preserves Host, overwrites X-MatchFlow-Origin, and restricts direct origin access with TLS/firewall or mTLS. Keep API/worker provider configuration consistent. See docs/deployment.md and ADR 0011 for DNS/TLS setup, fifteen-minute fail-closed freshness, removal/reassignment and staging qualification. Do not deploy a generic host-based catch-all or share canonical session cookies with customer domains.

## Phase 11 operations

Staff authorization needs independently managed STAFF_MFA_KEY across API instances. Configure SUPPORT_CONTACT_EMAIL for external appeals. Review dry-run privacy:cleanup before scheduling explicit --apply; legal holds override cleanup. See docs/operations-runbook.md and docs/privacy-retention.md for backup/PITR/restore, independent probes/alerts, incident response and retention. These documents do not imply any production backup or monitoring service has been provisioned.

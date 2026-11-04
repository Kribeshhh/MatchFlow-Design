# ADR 0013 — Provider-neutral release and qualification

Accepted for Phase 12, 2026-11-04. No hosting provider has been selected and no production deployment is authorized by this implementation.

Keep the modular monolith. Build one immutable Linux Node 22 LTS image containing the compiled API and SPA, plus a separate migration target. Keep PostgreSQL 17 as database and durable pg-boss queue. No Redis is required: invalidations use database revisions, and jobs use PostgreSQL coordination. The same runtime image can run a dedicated worker; disable embedded workers on API instances when using this topology. Maintenance commands are compiled into the runtime, without the demo seed.

Terminate HTTPS at a reviewed ingress, restrict origin connectivity to that ingress and configure only its actual IPs/CIDRs as trusted proxies. Never use blanket or hop-count trust. Preserve exact canonical Host checks and authenticated custom-host edge binding; forwarded headers never establish tenant identity. Enforce distributed IP limits at ingress because general HTTP IP counters remain process-local. Production secrets are runtime secret-manager injections, not build arguments or Vite variables.

Use managed PostgreSQL with verified TLS, private networking, bounded connection pools, independent migration credentials, backups/PITR and restore drills. Hosting choice, region, RPO/RTO, scaling limits and alert routing remain operator decisions. Build/test artifacts in CI; manually promote an immutable digest only after staging evidence and environment approval. Provider-specific deployment commands are intentionally deferred.

Local Docker absence and absent SMTP/Google/S3/Cloudflare credentials prevent container/live-provider qualification here. A local disposable database restore and production-mode HTTP checks provide bounded evidence, not cloud readiness. Release reporting must name these gaps.

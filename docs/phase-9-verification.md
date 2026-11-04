# Phase 9 verification — 2026-11-04

Scope: the existing MatchFlow modular monolith and visual identity, extended with the user-approved developer API. Writes are announcements and scheduling only; current organization owners/admins manage selected-event integrations; webhook payloads contain identifiers/type/timestamp/version only. No later phase or deployment was performed.

## Baseline and migration

Read AGENTS, overview, architecture/security/schema/API/design/progress documentation, Phase 8 decision/evidence and affected implementation/tests. The existing `npm run check` passed before changes (20 unit, 64 integration and production build/type/lint/format). No claim relies only on previous documentation.

Added migration 20261104000000_phase9_developer_api. Local development backup is ignored `.local/backups/phase9-before.dump`, mode 0600. Before/after identity/session/team-membership/tournament/match/roster fingerprints matched. Existing tables/data were not reset. Disposable-schema migration replay passed, preserving legacy accounts, sessions, grants and results, with no fabricated integration authority.

## Verified implementation

- Isolated Bearer v1 and public read routers; current key expiry/revocation, explicit scope/grant and organization checks, safe projections and bounded keyset pagination.
- Owner/admin/current-membership/recent-auth/CSRF enforcement for integration and credential changes; show-once random keys with only hashes retained.
- Announcement and head-to-head/battle-round scheduling writes share existing domain rules; idempotency receipts and expectedVersion prevent conflicting duplicate changes.
- Shared per-integration/organization limits, invalid-key source limits, access-start/status records and fixed-identifier audits. A failing rate-limit test exposed timezone ambiguity; the shared throttle now calculates UTC windows in PostgreSQL and existing auth regressions pass.
- Minimal transactional webhook events, initial original-creation-event replay for selected grants, unique endpoint/event delivery IDs, authorization revalidation, durable queue/retry/dead-letter and authorized redrive.
- Standard Webhooks signature/timestamp verification rejects tampering and stale replay; endpoint-bound AES-GCM encryption. Public-only DNS validation covers IPv4/IPv6, mapped/private/metadata/reserved addresses and mixed answers; HTTPS transport pins checked addresses, rejects redirects and bounds processing.
- Original MatchFlow landing/logo/art unchanged. Existing-shell Developers tab and lazy public API documentation/explorer use real API calls and existing form/confirmation primitives.

## Automated evidence

`npm run check` passed: lint, formatting, **22 unit tests**, **73 integration tests**, strict frontend/backend TypeScript and production build. The integration suite includes the real pg-boss retry worker with an injected receiver transport, duplicate concurrent commands, foreign tenant/resource access, key rotation/expiry/revocation, scope removal, rate limiting and rollback/initial-event behavior. The entire existing competition/auth/team/organization suite remains included.

`npm run test:migrations` passed. `npm audit` reported **0 vulnerabilities**. Pinned additions are ipaddr.js 2.5.0 and standardwebhooks 1.1.1. Build retains the upstream Zod/Rollup pure-annotation warning; build exits successfully.

`npm run test:e2e` passed **57 browser tests** across desktop/tablet/mobile, including existing product flows and new integration issuance/use/revocation, real public explorer, axe and overflow checks. After a targeted permission-control spacing refinement, the six developer browser checks passed again. Desktop/mobile screenshot review confirmed readable controls and contained layout; captures are in [screenshots/phase-9](screenshots/phase-9/README.md).

Local web /developers, API readiness and OpenAPI endpoints returned HTTP 200. Final lint/format checks passed. No production deployment or external receiver request was performed.

## Limits and release gates

This is local implementation evidence, not production certification. Public HTTPS receiver qualification, TLS/egress/proxy/load/restore testing, receiver deduplication/out-of-order policy, master-key recovery/rotation and independent security review remain. WEBHOOK_ENCRYPTION_KEY is required on API/worker instances; missing configuration fails visibly and does not simulate delivery. SMTP/Google/S3 provider qualifications remain as previously deferred.

At-least-once delivery permits the network-acceptance/database-commit resend window and cannot recall in-flight requests. Receivers must persist dedupe receipts; signature timestamps alone are insufficient. Access completion logging can leave status 102 after process failure. Command receipts/access/event/delivery history have no automatic retention purge; establish operational archival/capacity policy before scale. Management caps and latest-100 workspace tournament selection are documented in ADR 0010. Source-IP throttling behind a proxy requires explicit deployment configuration.

No visitor tracking, user PII API, write access to results/registration decisions, white-label domains, payments or production deployment was introduced. Stop after Phase 9.

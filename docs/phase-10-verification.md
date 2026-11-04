# Phase 10 verification — 2026-11-04

## Delivered scope

Organization-branded public portals with existing MatchFlow typography/palette, safe theme/navigation configuration, publication controls, logo/cover upload integration, scoped tournament listings/details/brackets/schedules/results and canonical account links. Owner/admin portal settings and owner-only domain management are connected to real persistence. Attribution defaults visible and hiding requires platform policy.

Cloudflare for SaaS adapter, TXT/routing verification, provider/TLS status, durable reconciliation, stale-proof rejection, removal and safe reassignment are implemented. Unknown hosts, inactive domains, cross-tenant resources, global APIs and account sessions cannot elevate access on custom hosts. No new infrastructure dependency was introduced; existing PostgreSQL/pg-boss owns reconciliation.

## Evidence

- `npm run check`: 25 unit and 80 integration tests passed, including existing phases; lint, formatting, strict frontend/backend TypeScript and production build passed.
- `npm run test:migrations`: passed; additive migration replay preserved legacy identity/session/competition records.
- Local preflight, backup and post-migration fingerprints preserved users, sessions, memberships, tournaments, matches and roster snapshots. Backup remains in ignored `.local/backups/phase10-before.dump`.
- `npm audit`: zero reported vulnerabilities.
- `npm run test:e2e -- --workers=2`: all 63 browser tests passed across desktop, tablet and mobile. The first four-worker run passed 60/63 with three desktop timeouts; the complete rerun passed without increasing timeouts.
- Portal screenshots were visually inspected; a narrow mobile search field and duplicate heading punctuation were corrected. Screenshots are in docs/screenshots/phase-10.
- Local readiness returned status ok and the development frontend returned canonical portal context.

New tests cover schema/hostname rejection, contrast and navigation safety, provider response bounds and generic failures, exact DNS proof, private/draft/foreign resource and media denial, owner/admin boundaries, CSRF/recent authentication, optimistic versioning, forged Host/forwarded headers, cookie/Bearer isolation, mixed-case API paths, stale checks, pending TLS, concurrent claims, cleanup failure, fresh proof on reassignment and removal during in-flight provisioning. Browser checks exercise publication, domain reservation with unavailable TLS clearly indicated, account-link destinations, private-event denial, keyboard/axe accessibility and viewport overflow.

## Limits and release gates

Cloudflare credentials, zone/fallback origin, trusted edge authentication and real customer DNS/TLS remain unconfigured by user choice. Injected DNS/provider tests verify behavior, not live certificate issuance or renewal. Configure and qualify these in staging using deployment.md before advertising custom-domain hosting. Provider outages or stale checks intentionally disable routing. Pending claims remain reserved until safe owner removal. Organization deletion must reconcile external domains before cascading records.

Uploads use the existing validated private S3 adapter; a live S3 provider remains a deployment prerequisite. Account actions intentionally leave branded domains for canonical MatchFlow. Portal reads refresh while visible; custom-domain sockets and cross-domain SSO are deliberately unavailable. Existing production qualification requirements still apply. No later phase implemented.

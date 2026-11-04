# Architecture — Phase 12

Current state: React/Vite/TypeScript/Tailwind SPA, Express/TypeScript modular monolith, PostgreSQL 17/Prisma and shared Zod contracts. All seven competition formats, identity/teams, notifications, organizations, developer API, verified branded portals and platform moderation are implemented with the verification limits in the phase reports. PostgreSQL pg-boss owns durable jobs; no Redis is required. Private S3, SMTP, Google and Cloudflare are optional configured adapters whose live qualification remains pending.

Production topology, migration/worker images, ingress/session boundaries, secrets, pools and shutdown are defined in [ADR 0013](decisions/0013-phase-12-production-release.md) and [deployment guide](production-deployment.md). CI and local verification do not constitute a production deployment. See [Phase 12 results](phase-12-verification.md).

## Historical foundation and incremental architecture

The following sections preserve phase-specific decisions; later phase sections supersede earlier feature and deployment limitations.

## Layout and dependency direction

```text
apps/web/                 React SPA, original landing assets and app views
apps/api/src/
  app.ts                  HTTP composition root
  index.ts                Process startup and bounded shutdown
  config/                 Validated environment
  http/                   Request context, logging, limits, errors, health
  database/               Prisma client, transactions and safe projections
  modules/                Owned business capabilities
packages/shared/src/      Browser-safe Zod contracts and inferred DTOs
prisma/                   Schema, forward migrations, guarded local seed
tests/{unit,integration,e2e}/
scripts/                  Local DB, test isolation and migration tooling
infra/                    Deployment boundary guidance
.github/workflows/        CI against disposable PostgreSQL
```

One root package.json and lockfile deliberately retain the original installation model. Directory boundaries provide separation without package publishing, duplicate dependency trees, a task orchestrator or workspace symlink complications. This can evolve if independent deployment/build consumers justify it. The shared UI stays in apps/web/src/mvp/UI.tsx; a packages/ui library currently has only one consumer and would add indirection.

Browser → module router/controller → application service → policy/domain and owned repository → Prisma transaction → PostgreSQL. Services do not depend on Express. Small HTTP callbacks remain in routes.ts rather than adding pass-through controller files. Simple read-only lookup routes may call a repository directly. Cross-module calls target named functions; no generic repository superclass or dependency-injection framework is introduced. Shared input schemas are split by responsibility; response DTO types are inferred from runtime schemas instead of duplicating them manually.

## Runtime

Development Vite proxies `/api` to Express (default 127.0.0.1:3001). `API_PROXY_TARGET` is a development/test override, never a browser secret. Production Express serves apps/web/dist and client deep links; unknown `/api` routes remain JSON 404s. API output is compiled to dist/api, preserving relative shared imports. A separate build config excludes tests and the local seed from runtime output; type checking still covers them. Generated API output is cleaned before compilation. Run commands from the repository root.

Configuration fails closed before listening when database URLs, ports, origins or production HTTPS requirements are invalid. Request IDs are generated server-side. Logs record route templates, status, duration and request IDs, never raw URLs/bodies/cookies. Helmet, strict origin handling, CSRF header checks, body limits, rate limits, no-store API responses and centralized errors compose before feature routes. `/api/live` is process liveness; `/api/ready` and legacy `/api/health` check database readiness independently of authentication. SIGTERM/SIGINT stop acceptance, close idle connections, drain work, disconnect Prisma and enforce a ten-second deadline.

## Capability boundaries

Implemented modules: auth, users, teams, tournaments, registrations, brackets, matches, dashboard and administration/audit. Auth separates password primitives, session persistence/middleware and authorization policy. Teams own membership; registrations own eligibility/snapshots/review; brackets own seeding/generation/progression; matches own scheduling and immutable played results. Tournaments own discovery, public detail and ownership. Dashboard is a read composition over immutable participation snapshots.

Reserved boundaries with no fake routes: notifications, analytics, api-access and custom-domains. Organization membership and tournament-specific policy now confer explicit management permissions. Administration exposes protected identity role/audit endpoints; a full admin UI remains deferred. The [file map](file-responsibility-map.md) names implementation and tests.

## Integrity and compatibility

All existing API paths, app URLs and visual components remain. Pending/approved entries still reserve slots and lock rosters. Single elimination remains the only format; BYEs, scheduling and immutable result rules are unchanged. Serializable transactions with bounded retries protect roster/entry/bracket/result writes. Generation persists its stage with matches. Recording a played result atomically writes MatchResult, updates compatibility score fields on Match, appends an audit event and advances the winner/champion.

Historical dashboards now select event snapshot membership, not current team membership. Player dashboards expose only their own entry metadata; organizer dashboards retain owned-event entries. Public event teams derive nested member lists from the saved entry snapshot. Shared runtime response parsing detects invalid data/HTML before views consume it; requests have a 15-second bound.

Read [database migration plan](database-migration-plan.md), [security model](security-model.md), and [Phase 1 verification](phase-1-verification.md). Multi-instance operation, additional tournament formats and full tenant isolation are not implemented.

## Phase 2 identity boundary

Auth routes call focused account, recovery, Google and session services. Password hashing uses Argon2; the Google adapter uses openid-client; SMTP uses Nodemailer. Mail/provider interfaces permit isolated tests without fake production integrations. Recovery and identity changes use existing serializable transaction orchestration. Browser account/recovery screens preserve the scoped MatchFlow design and shared Zod contracts. See ADR 0003 and the security model for migration compatibility and integration limitations.

## Phase 3 interface layer

Router lazily imports route screens, with Suspense loading states. Global styles load in declared order from main.tsx; design-system.css is the final shared refinement layer. UI.tsx owns established primitives; DesignSystem.tsx adds tabs, tables, confirmation provider, toast and unavailable states. CreateEventPage owns the guided creation flow. WorkspacePage composes existing dashboard, organization-membership and admin-audit APIs; organization listing adds a minimal authenticated projection. No database or runtime infrastructure change is required.

## Phase 4 identity, roster and media boundaries

Teams separate invitations, management, policy and persistence; registrations/roster-changes.ts owns transactional proposal/review, while existing eligibility is shared. Users/profile.ts projects privacy-aware public data; users/history.ts reads approved snapshots and played results. Shared Zod contracts supply input and response validation. Profile, media-upload and roster-change views remain lazy/shared within the web app; existing brand and landing are preserved.

Media separates routes, upload/read/cleanup service, image validation/re-encoding and an S3 adapter. Sharp performs bounded decoding; AWS SDK v3 signs actual S3 requests. The API tracks opaque assets before upload, attaches after rechecking authority, and serves private storage through current access rules. No Redis, background worker, disk fallback or public bucket is introduced. Scheduled media:cleanup removes unattached assets older than 24 hours. Provider credentials are intentionally deferred. Multi-instance deployments must use the same bucket/configuration and schedule one cleanup runner.

## Phase 5 architecture

Tournament responsibilities now span discovery/repository, detail projections, lifecycle/management, secret-link sharing and public organizer projections. Registration services coordinate eligibility, snapshots, participant withdrawal/check-in and FIFO promotion through existing serializable transactions. Bracket generation dispatches into pure double-elimination, round-robin and Swiss plans; format-progression owns dependency resolution, round generation and tied-leader playoffs. Existing single-elimination progression remains separate. Match services validate series scores/statistics and dual-write results atomically. No queue, cache or service split was introduced. See ADR 0006.

## Phase 6 competition boundary

See ADR 0007. brackets/service.ts orchestrates seeding and format dispatch. Existing progression.ts remains the single-elimination path. groups.ts, league.ts and battle.ts own the new format rules; stages.ts creates stage participants and dependency-driven playoffs. formats.ts owns pure standings/pairing calculations. matches/service.ts validates and confirms results or schedule slots inside serializable transactions. reports.ts, disputes.ts, impact.ts, corrections.ts and operations.ts separate proposals, authorization/review, dependency analysis, transactional rollback and pre-play controls. commands.ts owns idempotency receipts and restricted competition evidence; it is not a generic logging facility.

BattleRound/BattleRoundResult are independent of Match/MatchResult. Shared engine/battle/match input schemas and engine-responses.ts provide browser-safe contracts. The web application adds EngineFields, ResultFields, SeedingControls, MatchControls, BattleView, EngineReview and BracketViewport within the existing lazy-loaded tournament route. No Redis, worker, game SDK, rendering engine or new service is needed.

## Phase 7 live delivery architecture

See [ADR 0008](decisions/0008-phase-7-realtime-notifications.md). The HTTP server now also owns Socket.IO at `/api/realtime`; `/api/live` remains the liveness endpoint. Per-event PostgreSQL revisions drive independent API-instance invalidations. NotificationEvent is the transactional outbox; pg-boss in `matchflow_jobs` handles durable processing and mail delivery. No Redis is needed for this design. The worker runs in the API by default or as a separate process. Startup readiness waits for queue initialization; shutdown has a 20-second deadline and drains worker/socket/mail/database resources. Browser HTTP resources coalesce invalidations, keep mounted content during refresh and recover after reconnect or through periodic polling.

## Phase 8 organization boundary

See ADR 0009. Organizations now separate profile/branding, workspace policy, staff invitation/membership services, analytics/export queries and invitation-mail delivery. Routes own validated transport; serializable services own membership and permission changes. Organization-owned events use current membership/assignment instead of historical creator identity. Personal event policy is retained. Shared organization response/input contracts remain browser-safe.

The existing pg-boss worker gains an organization invitation queue; no dependency, Redis or service split is introduced. Branding reuses media validation/private S3 storage. Analytics aggregate PostgreSQL records and expose scoped projections. Existing WorkspacePage routes delegate to OrganizationsPage, with separate staff, analytics and profile components; public profiles use /communities/:id.

## Phase 9 developer boundary

api-access separates management/policy, resource projections/contracts, transactional commands, OpenAPI, encrypted signing material, SSRF-safe HTTPS transport and durable webhook dispatch. Versioned Bearer routes precede cookie middleware; public and privileged reads are distinct. Existing scheduling domain functions are shared after same-transaction principal authorization. Webhook events commit with competition mutations and reuse pg-boss; no Redis or service split. See ADR 0010 for full dependency/security rationale.

## Phase 10 — branded portals

Phase 10 adds portals and custom-domains modules without changing the stack. PortalBootstrap separates canonical account application from public tenant browsing. Organization-scoped public reads reuse explicit v1 projections; tenant hosts cannot use v1 credentials or account endpoints. Cloudflare adapter and DNS resolver are isolated from domain lifecycle services. Existing pg-boss workers reconcile domains every five minutes; requests fail closed after fifteen minutes without successful proof. No Redis or cross-domain identity service. See ADR 0011.

## Phase 11 — administration and responsible operations

Administration now separates staff-auth.ts (factor encryption, replay/recovery/session checks), cases.ts (report visibility and transactional enforcement), operations.ts (real summaries, ownership and holds), privacy.ts (self exports/cleanup), and routes.ts (validated HTTP). Platform corrections call the existing engine with an explicit staff session checked inside the correction transaction; ordinary ownership policy is unchanged. The frontend reuses existing forms/tables/confirmation and result/lobby fields. OTPAuth is the only new runtime dependency. No service split, Redis or payment infrastructure.

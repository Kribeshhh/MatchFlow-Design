# MatchFlow development rules

## Read before every phase

Read this file, README.md, docs/project-overview.md, docs/architecture.md, docs/security-model.md, docs/progress-tracker.md, applicable API/schema/design documentation, and accepted decisions in docs/decisions/. Inspect the affected code and tests; documentation is not proof of behavior. The 2026-10-29 audit supersedes historical MVP verification claims.

## Scope and approval

This is an existing application, not a rebuild. Implement only the phase explicitly requested by the user. Preserve working functionality and the established MatchFlow design. Ask before major unconfirmed product decisions: identity providers, organizer eligibility, team consent, competition rules, tenancy, hosting, billing, or data visibility. Proposed phases are not authorization to implement them. After each phase, update documentation and progress, report actual checks and limitations, then stop for the next instruction. Phase 2 authorizes identity, account management and resource authorization. The user approved SMTP integration with provider configuration later, Google integration with credentials later, and account anonymization retaining tournament history. Phase 3 now authorizes the shared UI/design system, responsive and accessible screen refinement, real discovery search, and clearly unavailable states for missing backend capabilities. Phase 4 now authorizes player profiles and reusable teams, invitations, permissions, roster snapshots and validated media. Stop after the currently requested Phase 12. The user approved editable reusable teams with frozen tournament snapshots, organizer-approved roster replacements before registration closes, public basic profiles with optional private history, and S3-compatible integration with provider configuration later.

## Engineering and security

- Separate UI, transport/API handlers, authorization, domain logic, persistence, validation, and infrastructure. Evolve the current modular monolith incrementally; avoid unnecessary services and dependencies.
- Keep TypeScript strict. Validate all external input on the server; frontend validation and guards provide UX only. Use explicit response projections and test access to nested records.
- Never hardcode credentials, secrets, passwords, or tokens. Keep .env and .local ignored. Demo seeding is restricted to an explicitly opted-in loopback _dev database and requires a supplied environment password; never relax these guards. Do not seed production or publish fictional data as real activity.
- Prefer maintained libraries and standard cryptographic primitives. Never expose hashes, tokens, stack traces, database errors, or private records. Review dependency advisories and actual reachability.
- Authorize every protected read and mutation server-side, including role, ownership, membership, and future tenant boundaries. Do not trust client IDs or claims.
- Protect multi-record competition mutations with transactions and database constraints. Preserve serializable retry behavior; add meaningful concurrency tests for changed invariants.
- Do not run destructive commands against production. Before tests, verify TEST_DATABASE_URL is a disposable test database, distinct from DATABASE_URL; a name suffix alone is not sufficient assurance. Never print connection secrets. Never reset working data without explicit authorization.
- Preserve existing user changes. No fake buttons, placeholder backend integrations, or simulated production data. Missing functionality must be documented honestly.
- Every implemented feature needs appropriate tests. Run tests, frontend/backend type checks, lint, and build; report unavailable or failing checks explicitly. Do not claim production readiness without verified release gates.

## Current domain invariants

Every active account may play and organize; `role` selects the default dashboard, while `roles` contains both capabilities. Captains and explicitly authorized team managers manage rosters/submit their teams. Only captains grant manager authority or offer captain transfer; the recipient must accept. Event management requires direct ownership, owning-organization owner/admin membership, or an explicit canManage grant. New accounts must verify email before competition mutations; migrated accounts retain their existing access without falsely asserting verification. Pending and approved entries reserve capacity and freeze tournament snapshots, while reusable team membership remains editable. Snapshot replacement requires a team-manager request and organizer approval before registration closes, with current-member and duplicate-player checks repeated. Registrations snapshot starting members, excluding substitutes. A player may appear only once among active entries in a tournament. Preserve historical participation using the registration snapshot, not current team membership (fixed and regression-tested in Phase 1).

Generation requires at least two approved teams, no pending reviews, and runs once. Single elimination remains supported; Phase 5 adds the formats and rules below. First-round BYEs advance automatically. Played elimination results require two resolved opponents and unequal integer scores, and advance winners atomically. Phase 6 league draws and administrative wins use their explicit outcome rules; battle royale uses native lobby results. Phase 6 approves correction only through the reviewed downstream invalidation policy in ADR 0007. Game labels do not imply support for their native scoring formats.

## Design and accessibility

Preserve the landing implementation in apps/web/src/App.tsx, Universe.tsx, HeroSearch.tsx, Art.tsx, Bracket.tsx, styles.css and hero.css, plus local fonts and artwork. Keep app styles scoped under .mvp until an approved incremental consolidation. Preserve centered game dialogs, keyboard controls, visible focus, focus restoration, responsive layouts, and reduced-motion behavior. Prototype fixture content is not production evidence; replacing it with real data must retain visual identity.

## Commands and evidence

See docs/verification.md for the actual baseline. npm run build includes Prisma generation and both TypeScript checks. npm test migrates and clears the dedicated test database. Run npm run check, npm run test:migrations and npm run test:e2e. ESLint and Prettier are mandatory gates. Browser tests use dedicated ports and the test database. npm run db:local starts the local PostgreSQL instance; npm run db:stop stops it. Use npm ci and the lockfile; review dependency changes and npm audit results.

## Phase 1 boundaries

- apps/web owns the React SPA, visuals and reusable UI; do not create packages/ui until a second consumer justifies it.
- apps/api/src/app.ts only assembles middleware and module routers. Module routes own HTTP parsing/serialization, services own use-case/transaction orchestration, policies/domain files own invariants, repositories own queries. No Express imports in business services.
- packages/shared/src owns Zod input/response contracts and inferred TypeScript DTOs. Keep it browser-safe; never import Prisma, environment variables or server modules into it or the web app.
- prisma owns schema, reviewed SQL migrations and local-only seed; tests owns unit/integration/browser suites; infra and .github/workflows own operational configuration.
- Audit records contain only fixed action names and identifiers. Never add request bodies, credentials, raw errors or private connection strings to logs/audit metadata.
- MatchResult and legacy Match score fields are dual-written in the same transaction until a future approved API migration. BYEs are not played results. Generation creates one stage for the selected implemented format; future staff/tenant features are not implied by the tables.
- Migration changes require preflight, backup, replay on a disposable schema, and explicit data-preservation evidence. Do not edit already-deployed migrations.

## Phase 2 identity rules

Use Argon2id for new passwords; retain legacy scrypt verification and upgrade on successful login. Preserve session token digests/expiry in migrations. Never merge OAuth accounts by email: linking requires an authenticated, recently reauthenticated, verified local account and a single-use browser/session-bound flow. Use openid-client validation, including signature checks, state, nonce and PKCE. No provider tokens in browser storage or persisted accounts.

Recovery tokens are random, hashed, expiring and single-use. Keep generic recovery responses and shared database throttles. Sensitive account mutations require recent authentication. The last active platform administrator cannot demote, deactivate or delete themselves. Platform roles are never self-service. Account deletion anonymizes identity and roster usernames, revokes credentials and permissions, and retains historical identifiers/results. Free-text team/event content is retained; full privacy/retention and ownership-transfer policies remain release work.

Missing SMTP/Google configuration must be visible and fail safely, never simulate delivery or sign-in. Run auth:cleanup periodically in deployment; SMTP is immediate delivery with bounded shutdown draining, not a durable queue. Phase 11 supersedes the historical MFA boundary with mandatory staff TOTP.

## Phase 3 interface rules

Use the documented tokens and existing local fonts/artwork. Global CSS loads in this order: styles.css, hero.css, mvp/mvp.css, mvp/design-system.css. The final layer refines the existing product; do not reverse its import order. Keep shared components in the single web consumer. Route views are lazy-loaded; wrap them in Suspense with an accessible loading state.

Form fields need explicit label associations and separate descriptions. Use Tabs for keyboard-operated panels, ConfirmProvider/useConfirm for destructive or irreversible actions, DataTable for semantic tabular data, and Unavailable for deferred capabilities. Never use fictional activity as platform statistics; remaining landing interface examples must be visibly identified as fictional. Phase 11 implements platform moderation under its separate staff policy. Phase 8 supersedes the historical unavailable organization setup/invitation state. Phase 7 implements notifications; the historical Phase 3 placeholder is superseded. Phase 5 adds real RR/Swiss standings.

Run the browser suites across desktop/tablet/mobile, including axe checks, keyboard/focus behavior, real wizard publishing, score confirmation/advancement and team-member removal. Browser data lives only in the guarded test database. Accessibility checks are evidence, not a WCAG certification. Update screenshots and phase verification when relevant. Do not add rich HTML rendering for user content.

## Phase 4 team and profile rules

POST /teams/:id/members now creates a seven-day invitation, not an active membership. Only the authenticated invitee can accept/reject. Acceptance, member changes and captain transfers use serializable transactions, current account checks, unique memberships and audit events. Legacy membership acceptedAt remains null rather than fabricating historical consent. Captain transfers require recent authentication, a current member, recipient acceptance within 24 hours and revalidation; either rejection or captain cancellation clears them. Archive retains membership/history, cancels invitations and blocks further team writes/registrations; unfinished active entries block archive. Team public projections must exclude pending transfer fields. New profiles default to public basics; existing accounts retain private profiles until opting in. Profile history and membership visibility are independent controls; public event rosters/results remain published. Never expose self-account data through public profiles. Avatar/logo uploads accept only validated PNG/JPEG/WebP, decoded and re-encoded as metadata-free WebP. Never accept remote image URLs or client storage keys. Private S3 objects are served through authorized API reads; absent configuration must be explicit. Run media:cleanup on a schedule to remove unattached assets older than 24 hours. See docs/phase-4-verification.md for verified scope and deferred live-provider qualification.

## Phase 5 tournament rules

Phase 5 authorized discovery, event operations, individual/team registration, private links, waitlists and the four competition engines. Its historical stop boundary is superseded by the user-requested Phase 6. Read ADR 0006 before changing these rules. Secret links grant view/entry-request access only; never expose hashes, tokens or private events through discovery, organizer profiles, history, media or exports. Preserve participant snapshot access. Auto-promote eligible waitlisted entries FIFO into PENDING review in the same serializable transaction that releases capacity. Never silently rewrite a snapshot.

Keep additional formats dispatched separately from legacy progression. Double elimination requires two losses and a conditional grand-final reset. Round robin/Swiss require real KDA totals and duration; tie-break order is wins, Swiss opponent strength, score difference, higher KDA, faster wins, then a deciding playoff. Do not infer telemetry or invent stats. RR/Swiss are capped at 16; elimination at 64. Phase 5 results were immutable; Phase 6 supersedes this with reviewed correction. Paid entry and automated game telemetry remain unavailable.

Tournament covers use the same private S3 adapter and validated image pipeline, resized to at most 1600×900. Authorization follows current event visibility, including share cookies; cleanup must exclude attached covers. Individual internal entrants must remain isolated from reusable-team routes and be anonymized with account deletion. See phase-5-verification.md for final checks.

## Phase 6 competition rules

Read ADR 0007. The user authorized all seven formats, configurable group/league rules, explicit organizer-configured battle-royale scoring, and correction previews that void affected results and require replay. Preserve the legacy single-elimination implementation and regression tests. Use native lobby rounds for battle royale. Never invent KDA/time/placement results or imply official game-provider integration.

Competition rules freeze after registrations exist. All seeding, assignment, scheduling, result confirmation and correction writes require server authorization and serializable transactions. A completed result may change only through an open dispute, fresh preview, recent authentication, explicit acknowledgement and retained before-state history. Never bypass this workflow to fix a fixture or UI failure. Keep security audit metadata identifier-only; competition evidence belongs in restricted EngineHistory.

Test every format through completion, qualification ties, BYEs, result/report/correction conflicts, schedule slots, cross-user/private access and browser workflows. Phase 7 supersedes the historical notification boundary; later administration or commercial features remain unauthorized.

## Phase 7 live-delivery rules

Read ADR 0008. The user approved important tournament emails enabled by default and reminders at check-in opening and 30 minutes before closing. Keep the database authoritative: socket messages only invalidate authorized HTTP resources. Revalidate session/private-event permissions, bound subscription/message rates and never accept socket scores. Provisional score writes require existing organizer policy and optimistic version checks; they never advance brackets.

Capture revisions/outbox in domain transactions and preserve event/user notification uniqueness. pg-boss owns durable PostgreSQL queue tables; Redis is not required. Recheck account/access/preferences before SMTP delivery; do not promise exactly-once SMTP. Keep provider secrets out of jobs/logs/test subprocesses. Preserve all earlier competition and privacy invariants. Verify multi-instance, reconnect, private access, retry/dead-letter and browser behavior; document provider and production qualification limits. Stop after Phase 7.

## Phase 8 organization rules

Read ADR 0009. Approved roles: owner controls admins, admins manage branding/staff, managers manage all organization events and analytics, staff manage only explicit event assignments. Creation binds organization ownership permanently for this phase. Never let historical creator identity bypass revoked organization membership. Personal event grants remain compatible; migration preserves previously effective organization access.

All new organization members accept invitations. New-user email invitations require a verified matching account, pending unexpired offer and current inviter authority. Never grant access merely from an invitation ID. PUT member role changes existing members only. Removal/role changes revoke organization grants and pending issued invitations. Use transactions/constraints and audit fixed identifiers. Queue only invitation IDs; revalidate before SMTP. Do not disclose a username lookup's email.

Analytics must be scoped server-side and use real records. Label approved/submitted conversion, UTC registration series, current-status attendance, displayed row bounds and null denominators. No visitor tracking is authorized. Exports omit personal account data and escape formula cells. Branding uses existing private S3 and validated media pipeline. Verify isolation, consent, staff rights, revocation, analytics/export and browser accessibility. Preserve the landing identity and all competition/session invariants. Stop after Phase 8.

## Phase 9 developer access rules

Read ADR 0010 and docs/developer-api.md. The user approved only announcement/scheduling writes, current organization owner/admin management, selected tournaments by default and minimal webhook payloads. Keep v1 Bearer authentication separate from session/CSRF authority; never impersonate an organization owner. Check current credential/integration status, scopes, organization and selected event in resource transactions. Public v1 reads must ignore privileged authority and exclude private/draft resources.

API keys are random, hashed, expiring and shown once. Webhook signing secrets use standardwebhooks and authenticated encryption with an external master key. Preserve all existing schedule/competition rules and null human actor plus integration audits. Use transactional idempotency receipts and minimal database-trigger outbox events. Initial creation-event replay reuses original event IDs/versions; never fabricate legacy creation history. PostgreSQL/pg-boss remains the only queue; no Redis is needed.

Validate every destination and DNS answer, pin the public address during HTTPS connection, refuse redirects/private/reserved/metadata networks and bound time/response processing. Retry with stable delivery IDs; receivers verify timestamps/signatures and atomically deduplicate. Recheck grants before delivery. Never put credentials, signing material, raw request paths/bodies or response bodies in logs/jobs/history. Status 102 in API usage means completion was not persisted, not success. Run access/scope/rate/idempotency/SSRF/retry/browser regressions and all earlier gates. Phase 10 supersedes the white-label/custom-domain boundary; production deployment remains unqualified.

## Phase 10 tenant rules

Read ADR 0011 and docs/phase-10-verification.md. Approved: Cloudflare for SaaS configured later; public branded browsing with canonical MatchFlow account actions; attribution visible unless platform policy permits hiding. Preserve host-only sessions and never transfer credentials to custom domains. Portal slugs are permanent public locators, not authority.

Resolve custom hosts only through exact active database bindings, authenticated edge origin headers, enabled portals and fresh DNS/provider/TLS checks. Ignore forwarded host/tenant identifiers. Deny global APIs, cookies as authority, developer credentials and sockets on tenant hosts. Bind every portal resource and media read to its owning organization and public non-draft event. Retain case-insensitive/encoded path regression protection.

Only owners manage domains with recent authentication. Never release a hostname while provider cleanup is uncertain; require new ownership proof on reassignment. Keep leases/version fencing and periodic durable reconciliation. Never delete an organization without first reconciling its external domains. Branding is validated tokens/plain text/internal navigation only. No arbitrary CSS, HTML, scripts or remote image URLs. Do not claim live DNS/TLS qualification from adapter tests. Stop after Phase 10.

## Phase 11 administration and privacy

Read ADR 0012, operations-runbook.md and privacy-retention.md. User approved mandatory staff TOTP with one-use recovery codes, moderator ordinary-user/content enforcement, administrator staff/ownership/operations authority, and configurable 90-day support / 365-day moderation and audit retention with legal holds. No commercial feature is authorized.

All /admin routes require current verified platform membership, enrolled TOTP and a recent session-bound factor proof. Sensitive writes additionally require recent primary authentication; services recheck in transactions. Never let organization roles, client IDs, password resets or ordinary OAuth sessions bypass staff verification. Use OTPAuth, encrypted factors under the external STAFF_MFA_KEY, atomic replay counters, hash-only recovery codes and shared throttles. Never log setup keys/codes or copy provider secrets to tests. Factor replacement requires fresh proof and revokes other sessions.

Reports bind the authenticated reporter and a visible target. Reporter-visible resolutions must not include confidential evidence. ModerationAction owns private reasons/evidence; AuditEvent remains fixed identifiers/actions with no public mutation endpoints. Preserve optimistic case versions, last-administrator protection, session revocation and explicit restoration. Restriction must block ordinary edits and cannot erase competition results. Restoration never republishes content or re-enables integration credentials automatically. Platform result correction remains narrowly scoped to the existing fresh rollback-preview/replay workflow, not a general ownership bypass.

Retain anonymizing account deletion and remove staff factors on deletion. Exports exclude secrets/other users. Retention defaults are product policy, not a legal compliance claim; dry-run first, honor case and record holds, preserve active cases/results, and account separately for backups/object storage. External support contact, secret management, backups/restore, alert delivery and jurisdiction review are launch gates. Stop after Phase 11.

## Phase 12 release rules

Read ADR 0013, production-deployment.md, security-review.md and phase-12-verification.md. Provider-neutral preparation is authorized; no cloud provider or public deployment has been selected. Preserve the full platform and visual identity. Use Node 22.23.4 or a reviewed newer supported patch, npm ci, locked dependencies and exact-commit CI evidence. Never weaken authentication, CSRF, tenant gates, TLS, rate limits or test isolation to get a green check.

All destructive test commands must use scripts/test-database.mjs and a loopback _test database distinct from working data. Run suites sequentially when they share that database. Restore drills may remove only the newly created random destination. Keep backup files private and ignored. No test credentials, seeds or TEST_DATABASE_URL in production.

Trust only explicit ingress IPs/CIDRs and restrict origin networking; general IP rate limits still require distributed ingress enforcement. Do not claim container, staging, provider, monitoring, cloud restore or production readiness without actual evidence. Follow the launch checklist and report unresolved blockers. Stop after Phase 12.

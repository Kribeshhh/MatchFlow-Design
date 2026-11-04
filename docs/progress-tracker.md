# Current release status — 2026-11-05

Phase 12 production preparation is implemented; local verification and unresolved external launch gates are recorded in [Phase 12 verification](phase-12-verification.md). Provider selection, Docker execution on this host, actual staging/provider/TLS tests, cloud restore, monitoring and representative scale qualification remain blocked by missing infrastructure/access. No deployment has occurred. Stop after Phase 12.

# Progress tracker and proposed implementation phases

Historical phase planning follows. The user has now authorized Phases 0–12. Phase 9 is the user-requested developer API and supersedes the proposed white-label/custom-domain scope. Phase 8 is organizer workspaces and analytics, superseding the proposed developer API scope. Phase 7 is live tournament updates and notifications, superseding the proposed analytics phase. Phase 6 is the user-requested tournament engine and match operations phase, superseding the earlier proposed administration phase. The user defined Phase 5 as tournament discovery, creation, registration and organizer operations, including additional formats; this supersedes the earlier proposed notification phase. The user defined Phase 4 as player identity and reusable teams, superseding the earlier proposed extra-format phase. The user explicitly defined Phase 3 as UI/UX refinement, superseding the previously proposed competition-operations phase. Later phases below are proposals and require the user's instruction; no product implementation is authorized by this roadmap alone. Order may change after product decisions. Every phase must read AGENTS/docs, implement its requested scope, run tests/type checks/lint/build, fix introduced problems, update evidence and limitations, then stop.

| Phase | Scope based on actual repository                                                                                                                                                      | Exit evidence                                                                                                         | Status                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 0     | Repository audit, baseline verification, inventory, development rules, architecture/security/schema/API/design/deployment docs and plan                                               | Actual failures and passing tests recorded; no product changes                                                        | Complete; known defects remain open      |
| 1     | Foundation hardening: clean reproducible dependencies/build, lint/CI, advisory triage, explicit response boundaries, F02–F05 regression fixes, seed isolation, resilient API failures | Clean CI gates; privacy/history/date/size regressions pass; selected dependency risks resolved/documented             | Complete; see Phase 1 evidence           |
| 2     | Identity, account management and resource authorization; approved SMTP/Google integration and anonymizing deletion                                                                    | Identity/API/browser checks, OAuth validation fixtures, safe migration; live provider qualification pending           | Complete; see Phase 2 verification       |
| 3     | Preserve and refine the landing; shared design system, accessible responsive product screens, real search, creation wizard and honest unavailable states                              | Browser workflows/accessibility checks, screenshots, strict types/lint/build; see Phase 3 verification                | Complete within existing backend scope   |
| 4     | Player identity, privacy, reusable teams, invitations, safe captain transfer, substitutes, snapshots and secure media                                                                 | Profile/media access tests, invitation/ownership concurrency tests, roster integrity and responsive browser workflows | Complete; provider setup deferred        |
| 5     | Tournament discovery/creation/lifecycle, private links, registration/waitlist/check-in, organizer operations and four competition engines                                             | Transactional/API/format/migration/browser checks; see Phase 5 verification                                           | Complete; provider setup deferred        |
| 6     | Seven competition formats, match operations, scheduling, reports/disputes, reviewed correction and interactive brackets                                                               | Format simulations, concurrency/access tests, rollback evidence, responsive browser checks                            | Complete; release qualification deferred |
| 7     | Live tournament updates, inbox/preferences, durable email and reminders                                                                                                               | Multi-instance, reconnect, authorization, retry/dead-letter and responsive browser tests                              | Delivered; verified below                |
| 8     | Organization workspaces, accepted staff invitations, permissions, analytics and exports                                                                                               | Isolation, invitation/role/revocation, analytics/export and responsive browser verification                           | Delivered; verified below                |
| 9     | Developer API, scoped credentials, developer workspace and signed webhooks                                                                                                            | Scoped API/credential/idempotency, SSRF/retry and responsive browser verification                                     | Delivered; see Phase 9 evidence          |
| 10    | Production release qualification and operations                                                                                                                                       | Staging E2E/a11y/load/security checks, restore drill, monitoring, rollback and signed-off release gates               | Not started                              |

Security and operations are continuous: build/CI and basic observability start early; tenant boundaries must precede tenant features, and audit logging must accompany sensitive admin actions. Phase 10 is final verification, not permission to defer security until launch. Large phases must be scoped into concrete user-approved increments.

## Decisions required before dependent implementation

- Identity decision resolved for Phase 2: local Argon2id/server sessions plus optional Google; player and organizer capabilities coexist. SMTP provider and Google credentials will be configured later.
- Phase 4 consent/privacy/storage decisions are resolved in ADR 0005; new team membership requires invitation acceptance. Existing organizer manual registration remains restricted to eligible accepted rosters. Provider selection/credentials are deferred.
- Phase 5 formats, check-in, private links, waitlists and KDA/time/playoff tie-breaks are resolved in ADR 0006. Phase 6 policies for forfeits, disputes and reviewed rollback are approved in ADR 0007.
- Are communities/organizers individual users or organizations with staff roles? What defines a white-label tenant?
- Phase 7 channels/defaults are resolved in ADR 0008. Hosting region/provider, data retention expectations, availability targets and domain ownership policy remain open.

These are open choices, not approved architecture. Confirm only when relevant to the requested phase.

## Audit completion and limitations

Phase 0 evidence is retained in verification.md. Phase 1 changes the structure and foundations, fixes confirmed read/validation/error defects and establishes repeatable quality gates; see phase-1-verification.md. Existing design/routes remain, and Phase 2 identity follows the accepted scope below. Production release qualification remains outstanding.

## Phase 1 delivered

- apps/web, apps/api and packages/shared with the original stack and one lockfile; reusable UI stays in its single consumer.
- Focused HTTP/service/policy/domain/repository modules and explicit deferred module boundaries; file-responsibility-map.md documents ownership.
- Additive organization/stage/result/audit database foundation, safe backfill, indexes/deletion behavior and constraints; preflight/migration replay plus protected local backup.
- Validated environment, safe structured logs/request IDs, strict origins, body limits/413, no-store, probes and bounded shutdown.
- Fixed snapshot history/private-entry leakage, date precision, invalid browser responses and atomic account/session issuance; seed credentials moved to explicit environment input.
- Strict types, ESLint/Prettier, unit/integration/browser suites, clean install, CI and dependency management.

Phase 1 historical boundary: landing fixture content, consent/invitations, recovery, additional formats, organization staff/tenancy, external APIs/domains and full production operations were not completed by Phase 1. Phase 2 identity and limited staff authorization are recorded below.

## Phase 2 delivered

Identity registration, verification/recovery/password changes, profiles, Google OIDC and explicit linking, session management, deactivation and immediate anonymizing deletion are implemented. Resource policies cover concurrent player/organizer capabilities, captains, owning organization staff, tournament grants and separate platform roles. Migration preserved 16 local users and 3 existing sessions after backup. SMTP and Google await credentials/live staging tests by user choice; MFA is architecture only. Reusable team invitations/consent are not part of the requested Phase 2 scope.

See [Phase 2 verification](phase-2-verification.md) for final commands and limitations. Stop after Phase 2; do not begin the later roadmap without a new instruction.

## Phase 3 delivered

Shared token system, responsive workspace navigation, form labels/hints, skeletons, semantic tables, keyboard tabs, native confirmations, toasts and real API-backed cards/screens are implemented. The search-first landing/logo/art/bubbles remain; real discovery replaces demo search and misleading aggregate counts are removed. Guided creation publishes through the existing endpoint. Both dashboard modes share one account; current schedule/results, organization membership and restricted audit views are available. Deferred notifications/moderation/setup/standings are explicitly unavailable. Route splitting and image sizing improve loading behavior without new runtime libraries.

See phase-3-verification.md for actual tests, screenshots and limitations. Phase 3 does not certify WCAG or production readiness and does not implement additional tournament rules. Stop here for the next instruction.

## Phase 4 delivered — 2026-10-31

Public/basic player profiles, editable usernames/display names, region/games/social links, profile/history/membership privacy, real snapshot-based statistics and team memberships are implemented. New profiles are public by default; migration preserves prior accounts' privacy. Account settings and anonymizing deletion cover the new fields.

Reusable teams support accepted invitations, managers, substitutes, two-party captain transfer, editing, leave/removal and archival with retained history. Team changes never silently change saved tournament rosters. Captain/manager requests and organizer approval may replace a roster only before registration closes; membership, capacity, game, duplicate players and cross-event authority are rechecked transactionally.

The user approved S3-compatible integration with credentials configured later. Uploads validate actual PNG/JPEG/WebP content, file/pixel/frame limits, re-encode to WebP and store private opaque objects. API access follows profile visibility or public team-logo rules. Unconfigured storage is visibly unavailable. Cleanup handles old/replaced/deleted/unattached assets. Legacy remote logos were cleared during the backed-up migration and must be uploaded again.

See phase-4-verification.md for tests, migrations and screenshots. Live S3/provider configuration and staging qualification remain deferred as approved, alongside earlier SMTP/Google provider gates. This is not production deployment/certification. Stop after Phase 4.

Phase 4 follow-up: the repeated request was checked against the existing implementation; fresh build/type/lint/format, 10 unit, 26 integration, 24 browser tests and migration replay passed. No additional product phase or duplicate implementation was started. Provider configuration remains deferred as previously approved.

## Phase 5 implementation — 2026-11-01

The existing platform now has extended filtered/paged discovery, public organizer profiles, validated event wizard/drafts and editing, optional covers, private secret-link access/rotation, publication/check-in/postponement/cancellation, announcements and permitted CSV exports. Individual entry is session-bound; reusable teams preserve roster snapshots. Capacity/duplicate prevention, withdrawals, organizer review and automatic eligible FIFO promotion use serializable transactions.

Double elimination includes loser dependencies and final reset; round robin schedules all opponents; Swiss generates no-rematch rounds from real standings. User-approved tie-breaking uses wins, Swiss opponent strength, score difference, higher KDA, faster wins, then a deciding playoff. Match statistics are organizer-entered and immutable. Legacy single elimination and design assets remain intact. Migrations were backed up, replayed and verified to preserve identities/sessions/memberships/rosters.

See phase-5-verification.md for final evidence. Free entry only; RR/Swiss maximum 16, elimination maximum 64. Native battle-royale formats, payments, telemetry, disputes/corrections, provider setup and production qualification remain explicit limitations. Notifications and later roadmap work were not implemented. Stop after Phase 5.

Final Phase 5 verification: 14 unit tests, 33 integration tests and 30 browser tests passed; lint, formatting, strict types, production build, migration replay and dependency audit passed. Desktop/tablet/mobile screenshots are saved in docs/screenshots/phase-5. No later phase was started.

## Phase 6 delivered — 2026-11-02

Added independent group/playoff, league and native battle-royale engines while retaining the four existing formats. Stage participants, seed order, result outcomes/versioning, schedule slots, reports, disputes, command receipts and historical snapshots have forward migrations. Local backups and identity/session/roster preservation comparisons passed. Organizer-configured rules, seeding, lobby entry, score/report review, rollback previews and bracket zoom/pan are connected to the existing interface.

Verification: 18 unit tests, 49 integration tests and 39 browser tests passed. Strict types, lint, formatting, production build, migration replay and dependency audit passed. Browser flows cover desktop/tablet/mobile, league draws, native lobby confirmation, reviewed rollback/replay and keyboard bracket zoom. History distinguishes draws from losses and shows native lobby records separately. See phase-6-verification.md for evidence and remaining release gates. Stop after Phase 6.

## Phase 7 delivered — 2026-11-02

Socket.IO carries authorized version signals; PostgreSQL revisions and transactional outbox remain authoritative. pg-boss provides durable jobs, retry/dead-letter handling and multi-worker coordination without Redis. Live provisional scores never progress matches. Existing result confirmation and all seven engines remain intact. The original landing identity is preserved.

Real inbox/read counts, category/channel preferences, default-on important email and check-in reminders are implemented. The user approved opening and 30-minute-before-close reminders. SMTP remains configurable later, with no simulated delivery. See phase-7-verification.md and ADR 0008 for evidence and operational limits. Stop after Phase 7.

Final Phase 7 verification: 20 unit, 56 integration and 45 browser tests passed; lint, formatting, strict types, build, migration replay and dependency audit passed. Screenshots are in docs/screenshots/phase-7. SMTP provider/staging qualification remains deferred. No Phase 8 work started.

## Phase 8 delivered — 2026-11-04

Added organization creation/profile/branding, opt-in public profiles, hierarchical staff roles, email/username invitations with verified recipient acceptance, explicit event assignments and current-membership revocation. Organization events support multiple collaborating staff while preserving personal event behavior. Existing effective access survives additive migrations.

Dashboard, registration/participation/game/check-in/completion analytics and permitted CSV use actual scoped records. Conversion is approved/submitted by user decision; no visitor tracking. Durable invitation mail reuses the PostgreSQL queue and existing SMTP adapter. Provider configuration/production qualification remain release work. See phase-8-verification.md for final evidence. Stop after Phase 8.

Final Phase 8 verification: 20 unit, 64 integration and 51 browser tests passed. Strict types, lint, formatting, production build, migration replay and dependency audit passed. Local web/API and queue status checks passed. Screenshots are saved in docs/screenshots/phase-8. SMTP/S3 staging qualification remains deferred. No Phase 9 work started.

## Phase 9 implementation — 2026-11-04

Implemented isolated v1 Bearer/public routers, scoped expiring credentials, owner/admin developer workspace, explicit read projections, idempotent announcements and version-checked head-to-head/battle scheduling. Signed minimal webhooks use transactional outbox, public DNS pinning, the existing durable PostgreSQL queue, retries/dead letters and current-grant revalidation. Interactive documentation and OpenAPI 3.1 are available at /developers and /api/v1/openapi.json. No new infrastructure or landing redesign.

Local backup/migration preservation passed. Final test counts and release limitations are recorded in phase-9-verification.md. Provider/staging qualification, master-key operations, retention/load/restore/security review remain release work. Stop after Phase 9.

Final Phase 9 evidence: 22 unit, 73 integration and 57 browser tests passed; six developer browser checks passed again after spacing refinement. Strict types, lint, formatting, production build, migration replay and dependency audit (0 vulnerabilities) passed. Screenshots are saved in docs/screenshots/phase-9. Webhook encryption-key configuration and public receiver/staging qualification remain deployment gates. No Phase 10 work started.

## Phase 10 delivered — 2026-11-04

Implemented organization-branded public portals, safe theme/navigation/media settings, scoped discovery/details/brackets/results, canonical account links and platform-controlled attribution. Owner domain workflows use fresh TXT challenges, exact routing verification, Cloudflare for SaaS, durable reconciliation, freshness limits and cleanup-before-reassignment. Architecture was documented in ADR 0011 before implementation. Existing landing design, sessions and tournament behavior are preserved.

Verification: 25 unit, 80 integration and 63 browser tests passed. Strict types, lint, formatting, production build, migration replay and full dependency audit (zero reported vulnerabilities) passed. Local backup and identity/session/competition preservation checks passed. Screenshots are in docs/screenshots/phase-10. See phase-10-verification.md for initial browser timeouts and complete successful rerun evidence.

Cloudflare credentials and live DNS/TLS/edge staging qualification remain deferred by user choice. Existing S3/SMTP production configuration and operational release gates remain. Account actions stay on canonical MatchFlow; no cross-domain SSO. Stop after Phase 10; no Phase 11 work started.

## Phase 11 delivered — 2026-11-04

Added mandatory staff TOTP/recovery, platform/organization role separation, report/support queues, audited content inspection, user suspension/restoration, content restrictions, ownership review, existing-engine result corrections, real operational/API summaries, security-event review and legal holds. Account export, factor-aware anonymization and explicit retention cleanup support privacy operations. Existing MatchFlow design, tenant boundaries and competition history remain intact.

Approved decisions are in ADR 0012. Default retention is 90 days for resolved support and 365 days for resolved moderation/security/API evidence, subject to holds. Operations and privacy runbooks document external support, backup/restore, monitoring/alerts, incident response and legal launch gates. No commercial features activated.

Final verification: 26 unit, 90 integration and 69 full browser tests passed; six administration browser tests passed again after the final restriction/context/mobile-spacing refinement. Lint, formatting, strict types, build, additive migration replay, local backup/preservation, dependency audit (zero vulnerabilities), local readiness and diff whitespace checks passed. See phase-11-verification.md and docs/screenshots/phase-11.

An independent local staff-encryption key is configured in ignored .env. Production secret management, SUPPORT_CONTACT_EMAIL, external backup/monitor/alert provisioning, restore drills and jurisdiction-specific review remain release gates alongside earlier provider configuration. Stop after Phase 11; no Phase 12 work started.

# File responsibility map

Current implementation: Phase 9 developer API, alongside Phases 1–8. See [Phase 9 verification](phase-9-verification.md) and [developer API guide](developer-api.md). Earlier phase sections are historical evidence.

All paths below are relative to the repository root. Domain modules do not require empty route/service/schema files when they have no implemented feature.

| Location                                                                             | Responsibility                                                                            | Verification                                                            |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| apps/web/src/{App,Universe,HeroSearch,Art,Bracket}.tsx; styles.css/hero.css; public/ | Preserved landing layout, bubbles, centered dialog, artwork and typography                | Playwright desktop/mobile dialog/focus smoke; existing visuals retained |
| apps/web/src/mvp/Router.tsx, Auth.tsx, *Page.tsx, UI.tsx                             | Existing app routing, forms, views and shared UI; original routes                         | Lifecycle integration + browser discovery smoke                         |
| apps/web/src/mvp/http.ts, api.ts                                                     | Bounded fetch/runtime response validation and React resource lifecycle                    | Unit invalid HTML/shape tests                                           |
| packages/shared/src/{common,auth,teams,tournaments,registrations,matches}.ts         | Per-responsibility input schemas; validation.ts is a compatibility barrel                 | Unit precision/date validation and existing API negatives               |
| packages/shared/src/responses.ts, contracts.ts                                       | Runtime response schemas and inferred public DTO types                                    | Client unit tests and actual dashboard/detail contract parsing          |
| apps/api/src/app.ts, index.ts                                                        | Middleware/router composition; lifecycle/timeouts                                         | HTTP integration, production smoke                                      |
| apps/api/src/config/env.ts                                                           | Validated environment, safe configuration failure                                         | Unit invalid/production-origin tests                                    |
| apps/api/src/http/{context,logger,errors,limits,health}.ts                           | Correlation, safe structured logs, centralized errors, limits and probes                  | Redaction unit test; HTTP/CORS/body/readiness integration               |
| apps/api/src/database/client.ts                                                      | Prisma client, transaction retry, shared minimal projections/errors                       | Existing lifecycle/capacity concurrency tests                           |
| modules/auth/{routes,service,repository,security,password,tokens,policy}.ts          | Account/session use cases, persistence, hashing, cookie middleware and role authorization | Unit hashing; integration auth/CSRF/logout/roles                        |
| modules/users/{routes,repository}.ts                                                 | Restricted player lookup                                                                  | Existing lookup and confidentiality tests                               |
| modules/teams/{routes,service,repository,policy}.ts                                  | Team/membership ownership, roster locks and persistence                                   | Lifecycle, duplicate/lock/captain rules                                 |
| modules/tournaments/{routes,service,repository,detail,domain,policy}.ts              | Discovery/create/read projections, state labels and owner policy                          | Discovery/detail/lifecycle and snapshot regression                      |
| modules/registrations/{routes,service,repository,policy,domain}.ts                   | Eligibility, entry review, snapshot visibility and storage                                | Capacity race, overlap/rejection/manual-entry and privacy tests         |
| modules/brackets/{routes,service,repository,domain,progression}.ts                   | Seed order, stage/bracket creation and winner progression                                 | Seed-order/BYE/champion tests                                           |
| modules/matches/{routes,service,repository}.ts                                       | Schedule/result invariants, result persistence and atomic advancement                     | Lifecycle/results/immutable result regression                           |
| modules/dashboard/{routes,service,repository}.ts                                     | Role-scoped snapshot-based participation read model                                       | Former/new member regression and private entry assertions               |
| modules/administration/audit.ts                                                      | Transaction-bound identifier-only competition audit events                                | Result/bracket persistence tests                                        |
| modules/{notifications,organizations,analytics,api-access,custom-domains}/README.md  | Explicit future ownership and scope, no placeholder services                              | No functionality claimed                                                |
| prisma/schema.prisma, migrations/, seed.ts                                           | Database relationships/constraints/backfill; guarded local demo seed                      | Prisma validate, migration replay/preflight, integration                |
| scripts/{test,e2e,test-migrations,migration-preflight}.mjs                           | Separate test DB safety, test servers, disposable-schema replay and read-only preflight   | Actual local executions                                                 |
| tests/unit, tests/integration, tests/e2e                                             | Node tests, Supertest/PostgreSQL, Playwright                                              | npm test; npm run test:migrations; npm run test:e2e                     |
| eslint.config.js, .prettierrc.json, tsconfig files, .github/workflows/ci.yml         | Strict quality/build and CI gates                                                         | npm run check                                                           |

`modules/` rows refer to apps/api/src/modules/. Business use cases remain deliberately small; transactional repositories accept Prisma transaction clients so no write escapes its transaction.

## Phase 2 additions

| Files                                                       | Responsibility                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| apps/api/src/modules/auth/password.ts, tokens.ts            | Standard password hashing/legacy verification and token digests                    |
| auth/account.ts, recovery.ts                                | Account/session lifecycle, token consumption and transactional anonymization       |
| auth/google.ts, mail.ts                                     | Verified OIDC adapter/linking and SMTP delivery/draining                           |
| auth/throttle.ts, policy.ts, security.ts                    | Shared identity throttles, recent-auth/capability policies, session authentication |
| organizations/policy.ts, routes.ts; tournaments/policy.ts   | Resource ownership, membership and explicit grants                                 |
| administration/identity-routes.ts                           | Protected moderation/audit/platform-role endpoints                                 |
| apps/web/src/mvp/AccountPage.tsx, RecoveryPage.tsx          | Real profile, account security and email-token workflows                           |
| scripts/grant-platform-admin.ts, auth-maintenance.ts        | Explicit verified-admin bootstrap and expiry cleanup                               |
| tests/integration/identity.test.ts, tests/unit/oidc.test.ts | Account abuse/access/concurrency tests and real OIDC token validation fixtures     |

Paths for auth/organizations/administration above are relative to apps/api/src/modules. No UI is advertised for deferred administration or organization creation features.

## Phase 3 additions

- apps/web/src/mvp/design-system.css: brand/type/space/grid tokens, shared responsive states and refinements.
- apps/web/src/mvp/DesignSystem.tsx: keyboard tabs, native confirmations, semantic tables, toast and unavailable states.
- apps/web/src/mvp/CreateEventPage.tsx: validated three-step creation and real publication.
- apps/web/src/mvp/WorkspacePage.tsx: schedule/results, organization membership, audit and explicit deferred screens.
- apps/web/src/mvp/Router.tsx and main.tsx: shared navigation, lazy boundaries and deterministic stylesheet order.
- apps/web/src/HeroSearch.tsx: search and filters navigating to actual tournament discovery.
- tests/e2e/design.spec.ts: responsive/accessibility/workflow tests against isolated database fixtures.
- docs/screenshots/: browser captures with source/context documented in README.md.

## Phase 4 additions

- teams/invitations.ts: invitation issuance, expiry, acceptance/rejection/cancellation and scoped inboxes.
- teams/management.ts: manager/substitute mutations, leave/archive, two-party captain transfer.
- users/history.ts: approved snapshot participation and completed played-match statistics.
- mvp/TeamManagement.tsx: permission controls, team editing, invitation inbox and transfer acceptance.
- mvp/CompetitionHistory.tsx: safe text rendering of real team history/results.
- tests/integration/teams.test.ts and tests/e2e/teams.spec.ts: consent, ownership isolation/concurrency, substitutes/snapshots and responsive real browser flows.

- users/profile.ts: privacy-aware public profile projection; auth/account.ts: self editing and anonymization.
- registrations/roster-changes.ts: explicit proposals and event-manager review before deadline.
- media/routes.ts, service.ts, image.ts, storage.ts: transport, authorized asset lifecycle, validated re-encoding and S3 adapter.
- scripts/media-maintenance.ts: scheduled unattached-object cleanup.
- mvp/PlayerProfilePage.tsx, MediaUpload.tsx, RosterChange.tsx: real profile/media/roster-review screens.
- tests/integration/players-media.test.ts, tests/unit/media.test.ts, storage.test.ts: privacy, byte/pixel/frame/size checks, storage access/errors/cleanup and actual SDK signing.

## Phase 5 additions

- tournaments/management.ts: event editing, lifecycle, announcements and permitted CSV exports.
- tournaments/sharing.ts and policy.ts: hashed secret links, cookie redemption/revocation and event visibility.
- tournaments/organizer.ts: privacy-safe public organizer listing.
- registrations/waitlist.ts: eligible FIFO promotion; service.ts: individual/team entry, review, withdrawal and check-in.
- brackets/formats.ts: pure RR/Swiss pairing/standings and exact tie comparison; double-elimination.ts: dependency graph; format-progression.ts: transactional graph/round/playoff advancement.
- web/mvp/TournamentFields.tsx and TournamentOperations.tsx: shared event input and organizer controls; OrganizerProfilePage.tsx: public organizer page.
- tests/unit/formats.test.ts, tests/integration/tournaments.test.ts, tests/e2e/tournaments.spec.ts: competition rules, security/concurrency and responsive browser flows.

## Phase 6

- Shared engine.ts, battle.ts, brackets.ts, matches.ts: competition configuration and external input contracts; engine-responses.ts: typed review/lobby responses.
- API brackets/seeding.ts, stages.ts, groups.ts, league.ts, battle.ts: seeding, stage construction and dedicated format rules. Existing progression.ts, double-elimination.ts, formats.ts and format-progression.ts retain the earlier engines.
- API brackets/commands.ts: atomic command receipts and competition evidence.
- API matches/service.ts/repository.ts: validated confirmation, scheduling and result persistence; reports.ts: proposals/review; disputes.ts: participant authority and preview/history reads; impact.ts: format-specific dependencies; corrections.ts: reviewed transactional rollback; operations.ts: pre-play controls; routes.ts: HTTP input/auth composition.
- Web EngineFields/ResultFields, SeedingControls/MatchControls, BattleView, EngineReview, BracketViewport: connected tournament interfaces within the existing lazy-loaded detail/wizard routes.
- tests/integration/engine.test.ts, tests/unit/engine-rules.test.ts and seeding.test.ts, tests/e2e/engine.spec.ts: simulations, security/integrity and responsive review/lobby browser workflows.

## Phase 7 ownership

- `apps/api/src/modules/realtime/server.ts`: socket lifecycle, authentication, subscription policy and version signals.
- `apps/api/src/modules/notifications/{routes,service,delivery,worker}.ts`: HTTP validation, inbox/preferences, event/delivery policy, durable scheduling/retry orchestration.
- `apps/api/src/modules/matches/live-score.ts`: authorized provisional score writes.
- `packages/shared/src/{notifications,live}.ts`: browser-safe contracts and version comparison.
- `apps/web/src/mvp/{live,LiveProvider,NotificationCenter,LiveScoreForm}`: live resource integration and product interfaces.
- `scripts/notification-worker.ts`, `scripts/notification-jobs.ts`: standalone worker and operator inspection/redrive.
- `tests/integration/realtime.test.ts`, `tests/e2e/live.spec.ts`: private access, multi-instance/reconnect, delivery and browser regression evidence.

## Phase 8 ownership

- apps/api/src/modules/organizations/policy.ts: member/admin/event-manager authorization.
- profiles.ts: profile creation/editing and safe public projection.
- staff.ts: invited consent, membership/role changes, leave/removal and revocation.
- analytics.ts and csv.ts: organization-scoped real aggregates, history, schedules and safe CSV.
- invitation-mail.ts: atomic queue dispatch and current-policy SMTP delivery.
- routes.ts: bounded Zod transport, throttles, recent-auth and role gates.
- packages/shared/src/organizations.ts: runtime input/response schemas and inferred DTOs.
- apps/web/src/mvp/OrganizationsPage.tsx, OrganizationStaff.tsx, OrganizationAnalytics.tsx, OrganizationProfileForm.tsx, OrganizationPublicPage.tsx: composed workspace experience using existing primitives.
- tests/integration/organizations.test.ts and tests/e2e/organizations.spec.ts: isolation, consent, role/revocation, metric/export, media, queue and responsive browser evidence.

## Phase 9 ownership

api-access/README.md maps the new policy, credential, command, resource, OpenAPI, transport and outbox files. Shared developer.ts owns validated inputs; DeveloperWorkspace/DeveloperDocsPage own existing-shell integration UX and docs explorer. Prisma migration owns additive external-access tables and event capture. notifications/worker.ts owns queue supervision. tests/integration/developer.test.ts, tests/unit/developer.test.ts and tests/e2e/developer.spec.ts verify security, delivery and responsive flows.

## Phase 10 — branded portals

- apps/api/src/modules/portals/: presentation configuration, scoped public reads and management routes.
- apps/api/src/modules/custom-domains/: hostname normalization, trusted request context, DNS proof, Cloudflare adapter and reconciled lifecycle.
- packages/shared/src/portals.ts: safe branding/navigation contracts and contrast validation.
- apps/web/src/mvp/PortalBootstrap.tsx: canonical versus public-tenant application boundary.
- apps/web/src/mvp/PortalPage.tsx: branded listing/details/brackets/results.
- apps/web/src/mvp/PortalSettings.tsx: organization branding/publication and owner DNS controls.
- tests/unit/portals.test.ts, tests/integration/portals.test.ts, tests/e2e/portals.spec.ts: provider/schema, isolation/lifecycle and responsive browser evidence.

## Phase 11 — administration and responsible operations

- apps/api/src/modules/administration/staff-auth.ts: TOTP enrollment, encryption, replay/recovery and session policy.
- administration/cases.ts: visibility-bound reports, versioned review and enforcement.
- administration/operations.ts: scoped staff operational reads, ownership and holds.
- administration/privacy.ts and scripts/privacy-maintenance.ts: self export and explicit retention.
- packages/shared/src/administration.ts: strict external contracts.
- apps/web/src/mvp/AdministrationPage.tsx, AdminDisputes.tsx, StaffAuthentication.tsx: real staff workflows.
- SupportPage.tsx, HelpPage.tsx, ReportLink.tsx: private support and configured public contact.
- tests/integration/administration.test.ts and tests/e2e/administration.spec.ts: authorization, moderation, retention and browser evidence.

## Phase 12 release files

- infra/Dockerfile: build, migration and unprivileged runtime targets; infra/compose.yml: local integration topology; infra/healthcheck.mjs: canonical-host readiness probe.
- .github/workflows/ci.yml: test/security/container gates; release.yml: reviewed candidate image artifact preparation, no assumed hosting provider.
- scripts/test-database.mjs: shared destructive-test isolation guard; test-restore.mjs: real isolated restore and fingerprints; test-release.mjs: production HTTP/security/log/shutdown checks and bounded read load.
- scripts/release-config.ts: secret-safe full-platform configuration checklist; notification-worker.ts: compiled bounded worker lifecycle.
- infra/security/semgrep.yml: reviewed security regression rules; docs/security-review.md: threat assessment and exception rationale.
- docs/production-deployment.md, environment-variables.md, backup-restore-rollback.md, launch-checklist.md, phase-12-verification.md: operator contract and actual evidence.

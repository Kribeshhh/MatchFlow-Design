# MatchFlow

Current implementation: Phase 12 release preparation over the existing Phases 1–11 platform. See [production-readiness report](docs/phase-12-verification.md), [deployment guide](docs/production-deployment.md) and [launch checklist](docs/launch-checklist.md). Production deployment has not occurred; external qualification remains blocked. Earlier phase sections are historical evidence.

Existing esports platform using React/Vite/TypeScript/Tailwind, Express/TypeScript, PostgreSQL/Prisma and Zod. Phases 1–9 strengthen the existing modular monolith while preserving its landing design and public/app routes. It is not a completed or production-certified platform.

## Local development

Use the Node version in .nvmrc and PostgreSQL 17. Run commands from the repository root:

```sh
npm ci
npm run db:local
npm run db:migrate
npm run dev
```

For an existing database, read the [migration plan](docs/database-migration-plan.md), run `npm run db:preflight` and take a backup before migration. The local helper uses a loopback cluster and an ignored .env. With another PostgreSQL instance, configure .env from .env.example and skip the local helper. Never point test commands at working/production data.

Open [MatchFlow](http://localhost:5173). The API defaults to 127.0.0.1:3001. `npm run dev` runs both processes until stopped with Control+C. `npm run db:stop` stops the local database. Register local accounts through the UI; demo seeding is optional, guarded, and requires an externally supplied password. No credentials are published here.

## Verification

```sh
npm run check
npm run test:migrations
npx playwright install chromium
npm run test:e2e
npm audit
```

`check` runs ESLint, Prettier, unit/integration tests, strict frontend/backend type checks and the production build. Tests require a separate loopback TEST_DATABASE_URL ending in `_test`; integration tests intentionally clear only that database. Migration replay uses a disposable schema there. Browser tests start their own API/web servers on 3101/4175 and check desktop/mobile interaction. CI mirrors these commands with isolated PostgreSQL.

See [Phase 8 verification](docs/phase-8-verification.md) for current results and limits. Production uses `npm start` after build/migration, with HTTPS origins and deployment secrets; see the [deployment guide](docs/deployment.md).

## Structure and documentation

- `apps/web`: existing SPA, assets and visual components
- `apps/api`: Express composition root, security infrastructure and capability modules
- `packages/shared`: input/response Zod contracts and inferred types
- `prisma`: database schema, migrations and guarded local seed
- `tests`: unit, integration and browser checks
- `infra`, `.github/workflows`: operational boundary and CI

Read [AGENTS.md](AGENTS.md), [overview](docs/project-overview.md), [architecture](docs/architecture.md), [file responsibility map](docs/file-responsibility-map.md), [database schema](docs/database-schema.md), [API contracts](docs/api-contracts.md), [security](docs/security-model.md), [design system](docs/ui-design-system.md), [feature inventory](docs/feature-inventory.md), [progress tracker](docs/progress-tracker.md) and [decisions](docs/decisions/README.md).

The [Phase 0 findings](docs/audit-findings.md), [baseline verification](docs/verification.md) and [earlier MVP guide](docs/MVP_IMPLEMENTATION.md) remain historical evidence. Later feature phases require a new instruction. Live Cloudflare DNS/TLS configuration and full production qualification remain deferred. Earlier phase sections retain historical boundaries; Phase 12 is the current release-preparation boundary.

## Phase 2 account security

Identity, recovery, account settings, revocable sessions, Google OIDC integration and resource-specific authorization are implemented. Both player and organizer capabilities are available to one account. See [security model](docs/security-model.md), [identity decision](docs/decisions/0003-phase-2-identity.md) and [Phase 2 verification](docs/phase-2-verification.md).

SMTP and Google credentials are intentionally not configured yet; follow [deployment setup](docs/deployment.md). New accounts require email verification before competition mutations. Existing users/sessions survive the migration; migrated users retain access. Account deletion anonymizes identity while retaining tournament history. MFA remains documented architecture only. Run `npm run check`, `npm run test:migrations` and `npm run test:e2e` before release. Stop after Phase 2; later features require a new instruction.

## Phase 3 interface

The original MatchFlow landing identity is preserved, with real tournament search and a shared responsive product design. See the [design system](docs/ui-design-system.md), [screenshots](docs/screenshots/README.md), and [Phase 3 verification](docs/phase-3-verification.md). Tournament creation is now a guided wizard; notifications and other missing backend capabilities are clearly marked unavailable. Run the existing check and browser commands; browser tests now include desktop, tablet and mobile plus automated accessibility checks. Stop after Phase 3.

## Phase 4 — players and reusable teams

Player profiles/privacy, invitation consent, manager/substitute controls, accepted captain transfers, reusable teams and explicit tournament roster-change review are implemented. Team changes preserve submitted snapshots; organizer approval before registration closes is required to replace a tournament roster. See [Phase 4 verification](docs/phase-4-verification.md) and [ADR 0005](docs/decisions/0005-phase-4-teams.md).

Avatar/logo uploads use validated/re-encoded images and private S3-compatible storage. Provider configuration is deferred by user choice; upload controls clearly show unavailable until configured. Follow [deployment setup](docs/deployment.md) and schedule `npm run media:cleanup`. Existing remote logos were removed without fetching them and must be uploaded again. Existing accounts keep private profiles until opting in; new accounts have public basics and configurable history/membership visibility. Stop after Phase 4.

## Phase 5 — tournament operations

Discovery, private share links, individual/team entry, automatic FIFO waitlists, check-in, extended wizard/drafts, organizer announcements/exports and four competition formats extend the existing product. See [accepted rules](docs/decisions/0006-phase-5-tournaments.md) and [verification](docs/phase-5-verification.md). RR/Swiss standings use actual organizer-entered KDA/duration and deciding playoffs. Free entry only; provider configuration and production qualification remain separate. Stop after Phase 5.

## Phase 6 competition engine

Seven formats are implemented: single/double elimination, round robin, Swiss, groups into playoffs, league seasons and native battle-royale lobby points. Organizers configure rules, seeds, schedules and match formats; players can submit results for review. Completed results require a dispute, rollback preview and explicit replay acknowledgement to correct. The existing landing identity remains intact.

See [ADR 0007](docs/decisions/0007-phase-6-competition-engine.md), [Phase 6 verification](docs/phase-6-verification.md) and [screenshots](docs/screenshots/phase-6/README.md). Scores, KDA and lobby placements are manually reported and organizer-confirmed, not game-provider telemetry. SMTP/Google/S3 configuration and production release qualification remain deferred. Stop after Phase 6.

## Phase 7 live updates

Authenticated live tournament updates, an in-app inbox and durable notification jobs use Socket.IO and PostgreSQL/pg-boss. No Redis is required. See [ADR 0008](docs/decisions/0008-phase-7-realtime-notifications.md), [operations](docs/deployment.md) and [verification](docs/phase-7-verification.md). SMTP provider setup and production qualification remain outstanding.

## Phase 8 organizer workspaces

Create and brand organizations, invite staff (including new-user emails), assign event access, create organization tournaments and view real analytics/CSV reports at /organizations. See [ADR 0009](docs/decisions/0009-phase-8-organizer-workspaces.md) and [verification](docs/phase-8-verification.md). SMTP/S3 provider qualification remains deferred.

## Phase 9 developer access

Owner/admin workspaces now include a Developers tab for selected-event integrations, expiring/revocable keys, usage and signed webhook delivery history. Interactive docs: /developers; OpenAPI: /api/v1/openapi.json. Only announcements and scheduling are privileged API writes. See [developer guide](docs/developer-api.md), [ADR 0010](docs/decisions/0010-phase-9-developer-api.md) and [verification](docs/phase-9-verification.md). Configure the external webhook encryption key and qualify a receiver before using production delivery. Stop after Phase 9.

## Phase 10 branded portals

Owners/admins configure branded public portals in the organization Portal tab. Owners manage domain claims and DNS/TLS checks. Public listings, details, brackets and results preserve MatchFlow styling and tenant isolation; account actions remain on canonical MatchFlow. Cloudflare for SaaS credentials and live-domain qualification are deferred by user choice. See [ADR 0011](docs/decisions/0011-phase-10-tenant-portals.md), [deployment](docs/deployment.md) and [verification](docs/phase-10-verification.md). Stop after Phase 10.

## Phase 11 administration

Platform staff use /administration after mandatory authenticator enrollment. /support accepts verified-account reports; /help exposes the configured external appeals contact. Account settings provide paginated data export and staff factor replacement. Moderators review ordinary-account/content reports; administrators manage platform roles, ownership, holds, API usage and reviewed result corrections. No organizer role grants platform authority.

Configure STAFF_MFA_KEY and SUPPORT_CONTACT_EMAIL before operating publicly. See [operations runbook](docs/operations-runbook.md), [privacy/retention](docs/privacy-retention.md), [ADR 0012](docs/decisions/0012-phase-11-administration.md) and [verification](docs/phase-11-verification.md). Retention cleanup defaults to dry run: npm run privacy:cleanup. Phase 12 supersedes this historical stop boundary; no commercial features activated.

## Phase 12 release preparation

Use `nvm install` and `nvm use` from this checkout to select the supported patch in .nvmrc, then `npm ci`. Run `npm run check`, `npm run test:migrations`, `npm run test:e2e`, `npm run test:restore`, and `npm run test:release` sequentially against the guarded local test database. `npm run release:config` checks the actual runtime configuration without exposing values and is expected to block in development. It does not verify live provider credentials.

See infra/Dockerfile for runtime/migration/worker targets and infra/compose.yml for local integration. Docker and real provider/staging credentials were unavailable during local qualification. The [security report](docs/security-review.md), [environment contract](docs/environment-variables.md) and [backup/rollback guide](docs/backup-restore-rollback.md) describe remaining operator gates. Stop after Phase 12.

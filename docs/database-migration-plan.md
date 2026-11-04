# Phase 1 database migration plan

Migration: `20261029000000_phase1_foundation`. Existing migration is retained unchanged. No destructive schema replacement, renaming of existing tables/IDs, database reset or production command is required.

## Additive changes

- Organization: name, owner User FK, creation time; nullable Tournament.organizationId. No existing event is assigned an organization or new permission scope.
- TournamentStage: tournament FK, ordered position and format, unique tournament/position. Existing brackets receive one single-elimination stage; new generation writes it atomically.
- Match.stageId: nullable to preserve compatibility with existing rows/older processes; generated/backfilled matches populate it. Cross-tournament stage consistency remains an application invariant.
- MatchResult: unique match FK, score pair, winner Team FK and recordedAt. Existing completed non-BYE matches are backfilled. BYEs do not invent played scores. Legacy Match fields remain for route compatibility and are dual-written with the result in one transaction.
- AuditEvent: optional actor FK with SET NULL, fixed action/resource identifiers and time; indexed for actor/resource history. New competition mutations append events transactionally. Past activity is not fabricated.
- Supporting indexes on Session.userId, registration.teamId and Match.stageId. Existing deletion behavior is explicit in Prisma; new ownership/stage/result references protect history. MatchResult cascades only with its match.
- CHECK constraints enforce roster/capacity bounds, event date order, played-result score ranges/inequality and positive match rounds/nonnegative slots.

## Deployment sequence

1. Identify the intended environment without exposing its connection URL. Review migration SQL and run `npm run db:preflight` against that database. It is read-only and rejects incompatible dates/sizes/completed results. Do not auto-repair historical values.
2. Take a protected database backup and verify restore procedures in staging. Schedule a maintenance/drain window: stop old API writers before migrating, because old code cannot dual-write the new result table. Index creation/backfills and validation can acquire locks; measure on a representative staging copy before a large deployment.
3. Run `npm run test:migrations` on a separate local `_test` database. It creates a random disposable schema, replays the original migration, inserts a completed legacy fixture, applies the new SQL, verifies IDs/result backfill/checks, then removes only that schema.
4. Run `npm run db:migrate` against the target. The migration is transaction-wrapped; invalid historical records abort it without partial DDL/backfill. Inspect failure safely, repair through an approved data plan and use Prisma's failed-migration recovery procedure before retrying; do not edit deployed SQL or reset the database.
5. Deploy the matching application build, verify readiness, existing account/team/event reads, new entry/bracket/result writes and audit/result records. Run `npm run db:status`.

## Rollback and limits

Prefer a reviewed roll-forward correction. Do not simply roll back to the old writer: it would stop maintaining MatchResult and audit/stage records. If rollback is unavoidable, stop writers and use a tested restore or a deliberate compatibility/reconciliation plan. No automatic destructive down migration is supplied.

The organization model is not tenancy. Staff roles, organization membership, stages for additional formats and result corrections require later approved product work. JSON roster snapshots remain; normalized participant tables are deferred. Result consistency with the Match compatibility projection is enforced by application transactions and tests, not cross-table triggers. Direct database writes must not bypass application invariants.

## Phase 2 identity migration

`20261029010000_phase2_identity` preserves user IDs/emails/usernames/password hashes/default roles and existing session token hashes/user IDs/expiry. It adds public session IDs, concurrent capabilities, nullable recent-auth timestamps, verification grandfathering, identity token/provider/flow/throttle tables, organization membership and tournament grants, and deletion audit state. Existing organization owners are backfilled as OWNER members. New accounts require verification; old accounts keep access without marking their emails verified.

On 2026-10-30 the local development database was backed up to ignored, mode-0600 `.local/backups/phase2-before.dump`. Before/after fingerprints confirmed all 16 existing users and 3 existing sessions unchanged in their legacy identity fields. Migration replay also checked a legacy fixture independently. Development and test schemas are up to date. No working database reset or seed was run.

For another environment: stop writes for a consistent preservation comparison, run db:preflight and test:migrations on a separate disposable database, take and verify a protected backup, deploy the reviewed forward migration, compare preserved identity/session fields and check login/readiness. Keep the old fields until migration qualification is complete. Roll back code only after evaluating new-account nullable passwords and concurrent-role compatibility; do not drop identity tables to roll back. Restore backups only through an explicitly approved maintenance recovery plan.

## Phase 4 migrations

Apply 20261031000000_phase4_teams then 20261031010000_phase4_profiles_media after preflight, protected backup and disposable replay. Preserve identity/session/membership fingerprints; verify old rosters remain unchanged. Existing memberships retain unknown acceptance time; new invitations require consent. Existing self-only profile content remains private; new accounts default public. Legacy remote logo URLs are intentionally cleared without fetching them; users must upload validated replacements after storage setup. Review this visible change before deployment. Local backups are mode 0600 in .local/backups/phase4-before.dump and phase4-profiles-before.dump; both preservation comparisons passed.

Deploy matching code atomically with a writer drain. Never roll back to arbitrary-member-add or remote-logo writers after consent/media deployment. Prefer forward repair; destructive recovery requires an approved restore plan. S3 provider setup is independently gated: keep buckets private, configure API credentials and verify smoke tests before enabling uploads. No production migration or cloud upload was performed here.

## Phase 5 forward migrations

20261101000000_phase5_tournaments and 20261101010000_phase5_match_statistics are additive, transaction-wrapped SQL. PostgreSQL 17 supports the multiple enum additions; new enum labels are not used before the migration transaction commits. Legacy phase/data/rosters and session digests remain unchanged. Added Team uniqueness includes competition type while retaining existing-team duplicate prevention. Match self-FKs encode double-elimination sources. Legacy KDA/time remain NULL.

Before local deployment, preflight and disposable replay passed; protected mode-0600 backups were taken. Explicit fingerprints of all users, sessions, memberships, event identity/dates/champions and registration snapshots matched before/after. No reset of working data was used. Test database migrations run separately under the existing local disposable guard. For production use a maintenance window, a tested restore backup and coordinated API/web release; rollback requires restoring the pre-migration backup or forward repair, not deleting history or editing applied SQL.

## Phase 6 forward migrations

Apply 20261101020000_phase6_engine, 20261101030000_phase6_battle_rounds and 20261102000000_phase6_schedule_slots in order. They add stages/participants, command/evidence/report/dispute tables, native lobby rounds, snapshot entrants, match outcomes and bounded schedule durations. The first migration backfills legacy stage participants and completion state; it does not invent historical scores or KDA. Existing MatchResult constraints are replaced with explicit outcome-specific checks.

All three were applied locally after protected mode-0600 backups and before/after comparisons of user/session/membership identity, event identities/dates/champions, registration rosters and existing match identity/opponents/scores/state. Comparisons passed. Backups are ignored under .local/backups; no working database reset occurred. Separate disposable migration replay is required for release. Drain writers and deploy compatible API/web code together; older code cannot interpret draws or native lobby results. Prefer forward repair. Never delete history or edit an applied migration to roll back.

## Phase 7 migration evidence

Applied additive migrations `20261102010000_phase7_live_notifications`, `20261102011000_phase7_outbox_minimization`, and `20261102012000_phase7_delivery_live_scores`. Each was preceded by a restricted local dump and followed by preservation comparisons for users, session digests, memberships, events, roster snapshots and results. The second migration deliberately corrects/minimizes outbox metadata through a forward migration rather than editing deployed SQL. Disposable migration replay includes all three. pg-boss initializes its separate schema on startup; back it up with the application database and qualify library upgrades against a restored staging copy.

## Phase 8 migration evidence

Applied additive migrations 20261102020000_phase8_organization_profiles, 20261102021000_phase8_organization_staff and 20261103000000_phase8_legacy_access after restricted local backups. Preservation snapshots cover existing user rows, sessions, team membership identity/timestamps, tournaments, saved rosters and matches. The final migration retains previously effective organization creator/grantee access as legacy memberships and explicit grants. All new memberships use invitations; legacy consent is not fabricated. Existing non-owner OWNER membership rows normalize to ADMIN while ownerId stays authoritative.

Disposable replay includes profile/staff/legacy-access migrations and verifies a legacy organization event creator keeps access. Partial pending-invitation uniqueness and role CHECK constraints live in SQL. Never edit applied migrations or reset working/production data. Before deployment, inspect existing organization membership/grant data, back up and replay on a restored staging database.

## Phase 9 migration

20261104000000_phase9_developer_api adds integration/grant/credential/access/idempotency and webhook tables, indexes, explicit FKs and transactional event triggers. No destructive data changes. The local working database was backed up to ignored .local/backups/phase9-before.dump (0600), then migration deploy compared stable identity/session/member/event/match/roster snapshots before/after. Preservation passed. Disposable-schema replay includes the new migration and asserts no implicit integration authority. Do not edit this applied migration; future changes require a forward migration and another backup/preflight.

## Phase 10 — branded portals

20261104010000_phase10_portals adds Portal/CustomDomain only. Local preflight, pg_dump backup, deploy and identity/session/membership/event/match/roster fingerprint comparison passed. Disposable migration replay passed. Do not edit deployed SQL or drop tables to roll back; disable portal publication/routing and retain provider cleanup records. Production requires independently verified backup/restore and external domain cleanup planning.

## Phase 11 — administration and responsible operations

Phase 11 additive migration was preceded by local preflight and .local/backups/phase11-before.dump. Fingerprints compared users, session identifiers/digests/timestamps, memberships, tournament state, matches and saved rosters before/after deploy; preserved. Disposable replay includes the new migration. Existing sessions get no automatic staff proof. Do not edit deployed migrations, remove held evidence or use production reset commands. Disable staff routes if rolling back application code; retain factors/evidence until a reviewed forward recovery plan.

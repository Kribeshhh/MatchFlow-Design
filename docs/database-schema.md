# Database schema

Current implementation: Phase 9 developer API, alongside Phases 1–8. See [Phase 9 verification](phase-9-verification.md) and [developer API guide](developer-api.md). Earlier phase sections are historical evidence.

Current implementation: Phase 8. Earlier phase sections are historical context. See [Phase 8 verification](phase-8-verification.md) and ADR 0009 for current organization scope and release gates.
Source of truth: [Prisma schema](../prisma/schema.prisma) and [initial SQL migration](../prisma/migrations/20260930161819_core_mvp/migration.sql). PostgreSQL; Phase 1 retains the seven original models and adds Organization, TournamentStage, MatchResult and AuditEvent in a second additive migration.

| Model                  | Relationships and stored purpose                                                                                                   | Existing constraints                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| User                   | Identity, nullable passwordHash, concurrent PLAYER/ORGANIZER capabilities; sessions, captain teams, memberships, owned tournaments | ID; unique username/email                                         |
| Session                | SHA-256 token digest, user, creation/expiry                                                                                        | Digest primary key; user FK cascade; expiry index                 |
| Team                   | Captain, game/name/description/logo; members, entries, opponents/wins/championships                                                | ID; unique captain/name/game; game index                          |
| TeamMember             | Team↔User; joinedAt                                                                                                                | Composite team/user primary key; user index; team delete cascade  |
| Tournament             | Organizer, game, dates, rules, exact roster size, capacity, format, phase, optional champion                                       | ID; organizer/champion FKs; game/phase and organizer indexes      |
| TournamentRegistration | Tournament↔Team; review status; JSON roster snapshot                                                                               | ID; unique tournament/team; related FKs                           |
| Match                  | Tournament round/position; nullable opponents, scores/winner, BYE, schedule/venue/completion                                       | ID; unique tournament/round/position; team FKs; scheduledAt index |

Enums: Role PLAYER/ORGANIZER; TournamentPhase REGISTRATION/ONGOING/COMPLETED; RegistrationStatus PENDING/APPROVED/REJECTED; MatchStatus PENDING/SCHEDULED/COMPLETED. Game and format remain strings at the database level. API game validation supports pubg, ml, ff, cs2, valorant, dota; format defaults to SINGLE_ELIMINATION.

## Integrity limitations

Phase 1 adds CHECK constraints for event date order, roster/capacity ranges, result score ranges/inequality and match positions. Actual entry capacity, winner/opponent consistency, captain membership and same-tournament participant membership still require application transactions. Unique and foreign keys prevent several structural duplicates, but do not enforce all competition rules. User normalization is application-side; database unique constraints alone do not enforce lowercase identity semantics.

JSON snapshots have no relational player references or schema constraints. They remain stored after roster edits, and Phase 1 dashboard/public projections now use those snapshots consistently for participation. Match participant FKs point to Team, not the tournament registration. A future normalized participation model or careful snapshot query/DTO design needs migration planning, not an audit-time rewrite.

Organization and identifier-only AuditEvent now exist; invitations, consent, tenant domains, API keys, notifications, moderation, disputes, standings and analytical events remain absent. Add only within an approved phase. Review missing supporting indexes (for example Session.userId and registration team lookups) using real query plans before adding them indiscriminately.

## Migration safety

Use reviewed forward migrations and transactional business writes. Plan data backfills and rollbacks before schema changes; test on disposable databases and staging copies with appropriately protected data. Never run migrate reset, drop, truncate or the integration suite against production. The test runner enforces loopback, the `_test` suffix and a database distinct from the working database; operators must still treat it as disposable.

## Phase 1 additions

| Model/change     | Ownership and constraints                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Organization     | Owner User FK, name, createdAt; no staff/tenant permissions; optional Tournament association          |
| TournamentStage  | Tournament FK; unique tournament/position; format; existing/new brackets use one stage                |
| MatchResult      | Unique Match FK (cascade on match delete), winner Team FK (restrict), scores/time; no BYE result rows |
| AuditEvent       | Actor User FK (SET NULL), action/resource identifiers/time; resource and actor/time indexes           |
| Indexes/deletion | Session.userId, registration.teamId, Match.stageId; explicit relation deletion actions                |

See [migration plan](database-migration-plan.md) for backfill, maintenance/rollback requirements, compatibility dual writes and remaining cross-table invariants.

## Phase 2 identity migration

The third migration, 20261029010000_phase2_identity, is additive and transactional. User adds concurrent roles, platformRole, verification state, displayName/bio and lifecycle status; passwordHash becomes nullable for OAuth-only accounts. The legacy role field remains a dashboard preference. Existing users get both capabilities and verificationRequired=false without a fabricated emailVerifiedAt. Session adds unique public id and nullable authenticatedAt without changing tokenHash or expiry.

| Model                | Purpose and constraints                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IdentityToken        | Hashed token PK, user cascade FK, purpose, expiry; user/purpose and expiry indexes                                                                                 |
| OAuthAccount         | User cascade FK; unique provider/subject and user/provider; no access tokens                                                                                       |
| OAuthFlow            | Hashed state PK, hashed browser binding, short-lived verifier/nonce and optional user/session binding; expiry index; binding IDs are checked against live sessions |
| AuthThrottle         | Hashed identity key PK, atomic counter/window; expiry index                                                                                                        |
| OrganizationMember   | Composite organization/user PK, cascade FKs, OWNER/ADMIN/MEMBER; existing owners backfilled                                                                        |
| TournamentPermission | Composite event/user PK, cascade FKs, explicit canManage                                                                                                           |
| AccountDeletion      | User PK/restrict FK, request/resolution timestamps and resolution; user tombstone retained                                                                         |

Deletion scrubs identity and JSON roster names while retaining competition records and ownership FKs. DELETION_PENDING is reserved; the approved workflow resolves immediately as ANONYMIZED. MFA factor storage is not present. Schema declarations and reviewed SQL remain the source of truth.

## Phase 4 migrations

20261031000000_phase4_teams adds Team.region/archive/transfer recipient FK and expiry; TeamMember.manager/substitute/nullable acceptedAt; TeamInvitation recipient/inviter/team FKs, unique team/recipient and recipient/status index. Legacy consent remains unknown (acceptedAt null); new memberships record acceptance. Reinviting resolves the existing invitation row, with identifier-only audit events for lifecycle actions.

20261031010000_phase4_profiles_media adds User region/gamesPlayed/socialLinks/profilePublic/showHistory/showTeams and avatar FK; Team.logoId FK; MediaAsset with opaque ID, unique internal key, uploader FK and cleanup timestamp index; registration proposedRoster/rosterProposedBy state. Media removal uses SET NULL references. Assets retain uploader tombstones and are deleted only after unlinking. Pending roster state is not public and does not replace the saved roster until approved.

Migration retains saved roster JSON, IDs, sessions and prior identity values. Existing profiles become private; new defaults are public basics. Legacy remote logo URLs are cleared without download; replace via validated upload. Membership/ownership/snapshot concurrency uses serializable transactions and existing FK/unique constraints. Do not edit applied migrations.

## Phase 5 schema

Migration 20261101000000_phase5_tournaments adds DRAFT/PUBLISHED/CHECK_IN/POSTPONED/CANCELLED phases and WAITLISTED/WITHDRAWN entry states; team/individual competition and public/private visibility; declared region/location, eligibility, prizes, series format, optional end date/cover, waitlist/check-in settings and hashed secret links. TournamentAnnouncement has an event cascade FK and event/date index. Entries add checkedInAt and an eligibility explanation for queued entries. Individual internal Team rows have a user FK, unique user/game and a type/identity consistency CHECK; the legacy captain/name/game uniqueness gains competitionType. Cover FK uses SET NULL. Discovery date/visibility indexes are added.

Match adds bracket labels and two self-referencing source FKs plus winner/loser outcomes for double elimination. Migration 20261101010000_phase5_match_statistics adds nullable per-side kills/deaths/assists and durationSeconds, with bounded integer CHECK constraints. Nullable preserves historical results without fabricating telemetry. Tournament end-date and individual roster-size checks reinforce validation. Neither migration changes user/session identities or historical rosters. Source dependencies and participant membership must still belong to the same event through server-generated plans and transactions. See ADR 0006 for standings and playoff semantics.

## Phase 6 additions

Tournament owns validated engineRules JSON, seedOrder and a monotonic engineVersion. TournamentStage adds kind/name/groupNumber/completed and StageParticipant links with unique (stage,team) and (stage,seed). Existing stages are backfilled from approved registrations; new engines write stage entrants explicitly.

Match adds result outcome/version, optional matchFormat and slotMinutes. MatchResult retains dual-write compatibility, allows a null winner for a validated draw and null scores for forfeits/no-shows, with outcome-specific SQL constraints. Match source relationships retain winner/loser dependencies. Schedule slot checks permit 1–480 minutes.

BattleRound owns participantIds, number, optional schedule, slotMinutes, state, version and isTiebreak. BattleRoundResult references real teams and enforces one result per entrant plus unique present placement per lobby; no-show rows have null placement/zero eliminations. The service validates exact participant coverage and contiguous present placements.

MatchReport stores a version-bound unconfirmed proposal and reporter. MatchDispute links a played match or lobby, reporter, reason and resolution. Deleted dependent resources set dispute references null; immutable EngineHistory snapshots preserve their prior evidence. EngineCommand stores actor-scoped unique request keys, request hashes and successful responses. EngineHistory has event/date indexes, actor set-null deletion and historical match IDs without a live FK, so reviewed rollback never erases evidence. These are competition records, not secrets or security-log request bodies.

## Phase 7 additions

`LiveRevision` is a tournament-owned monotonically increasing BigInt version. SQL domain-change triggers update it atomically. `NotificationEvent` stores a unique dedupe key, event kind/resource identifier, minimized recipient metadata and queue/processing timestamps. `Notification` has unique `(eventId, userId)`, user/event foreign keys, read state, in-app visibility and mail delivery state. `NotificationPreference` owns channel/category choices and a notification revision. Relations explicitly cascade with their owner. Notification triggers increment the owning user's revision. Match gains nullable paired bounded provisional scores; confirmed MatchResult stays authoritative.

Three forward migrations introduce this foundation, minimize roster metadata to IDs and add delivery/provisional fields. Existing sessions, users and competition results are preserved. Queue tables live in library-owned `matchflow_jobs`, outside Prisma. See ADR 0008 for retention and delivery semantics.

## Phase 8 additions

Organization adds description, region, HTTPS website, public-profile opt-in, logo FK (SET NULL) and optimistic profile version. OrganizationRole adds MANAGER; MEMBER is staff, and ownerId remains authoritative ownership. OrganizationInvitation contains recipient email, original input label, offered role, issuer FK, expiry, lifecycle and email delivery state. It cascades with organization, restricts issuer deletion, prohibits OWNER offers, and has a partial unique pending organization/email constraint. Membership's existing composite primary key prevents duplicates. Tournament indexes organizationId/createdAt.

Three forward migrations preserve working users/sessions/rosters/results. A legacy backfill retains previously effective organization creator/grantee access as membership/assignment; it does not claim historical acceptance. Public-profile defaults remain private. Prisma does not express the partial pending-invitation index or no-owner CHECK; retain the reviewed SQL. See migration plan and ADR 0009.

## Phase 9 additions

Integration belongs to Organization (cascade); IntegrationTournament binds explicit event grants with a composite key and tournament FK. `ApiCredential` stores a unique digest. Expiration, revocation and display prefix are separate fields. ApiRequest records request ID, template/status/time only; ApiCommand retains the request fingerprint and response under a unique integration and idempotency identifier. WebhookEndpoint stores destination/event subscriptions and encrypted signing secret. WebhookEvent references Tournament and stores type/resource/version/timestamp; unique tournament/version/type. WebhookDelivery uniquely binds endpoint/event, records attempts/status only and cascades with parents. Indexes support organization listing, key lookup, access history and undispatched events/jobs.

Migration 20261104000000_phase9_developer_api is additive. Database triggers run after live-revision capture to emit minimal external events atomically. No existing identities, sessions, memberships, registrations, results or competition constraints are rewritten. See database-migration-plan.md for backup/replay evidence.

## Phase 10 — branded portals

Portal is owned one-to-one by Organization with unique immutable slug, publication flag, validated presentation fields, optional MediaAsset cover and optimistic version. CustomDomain belongs to Organization and stores normalized hostname, public DNS challenge/expiry, provider/TLS status, proof/check timestamps, reconciliation lease/version and removal timestamp. A partial unique index permits only one nonremoved claim per hostname. SQL CHECK constraints enforce lifecycle/removal consistency. Organization foreign keys cascade; operational deletion must clean external provider domains first. Migration 20261104010000_phase10_portals is additive and preserves existing identity/session/competition records.

## Phase 11 — administration and responsible operations

20261104020000_phase11_administration adds AccountStatus.SUSPENDED, nullable Session.staffVerifiedAt, one-to-one encrypted StaffFactor (replay counter/hash-only recovery codes), restrictedAt on Team/Tournament/Organization, FK-backed ModerationCase, restricted ModerationAction and unique RetentionHold. Case status/target checks and partial pending reporter/target uniqueness supplement validation. Existing scalar identities, session digests, rosters and competition results are preserved. Cases retain account tombstone FKs; actions cascade only with retained-policy case cleanup. Factor rows cascade on physical deletion and are explicitly removed on anonymization.

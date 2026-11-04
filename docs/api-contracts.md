# Current API contracts

Current implementation: Phase 9 developer API, alongside Phases 1–8. See [Phase 9 verification](phase-9-verification.md) and [developer API guide](developer-api.md). Earlier phase sections are historical evidence.

Current implementation: Phase 8. Earlier phase sections are historical context. See [Phase 8 verification](phase-8-verification.md) and ADR 0009 for current organization scope and release gates.
Source: [routes](../apps/api/src/app.ts), [validation](../packages/shared/src/validation.ts), [domain](../apps/api/src/modules/tournaments/detail.ts). Base `/api`; JSON responses. This documents the internal cookie-authenticated implementation, not a versioned public developer API. Existing routes are preserved in Phase 1. No API keys, versioning, OpenAPI specification, webhooks or idempotency-key contract exist.

Mutations require `X-MatchFlow: 1`; supplied Origin must be allowed. Browser authentication uses an HttpOnly session cookie with credentials included. Roles and ownership are checked server-side. Request bodies reject unknown keys. Public user projections include id, username and role; self-session responses include the user's email. Dates serialize as ISO timestamps.

| Method/path                                           | Input                                                                           | Access / result                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| GET /health                                           | None                                                                            | Database check; `{status:"ok"}`                                                  |
| GET /auth/me                                          | Cookie optional                                                                 | `{user: self or null}`                                                           |
| POST /auth/register                                   | username, email, password, role                                                 | Public; 201 user envelope and cookie                                             |
| POST /auth/login                                      | email, password                                                                 | Public; user envelope and rotated cookie                                         |
| POST /auth/logout                                     | None                                                                            | Deletes current session; `{ok:true}`                                             |
| GET /users                                            | q                                                                               | Player-only username search, public projections                                  |
| GET /teams                                            | Optional eligibleFor event ID                                                   | Own memberships; candidate mode restricted to event owner                        |
| POST /teams                                           | name, game, optional description/logoUrl                                        | Player; 201 team with creator as captain/member                                  |
| GET /teams/:id                                        | ID                                                                              | Member only; team plus locked flag                                               |
| POST /teams/:id/members                               | userId                                                                          | Player/captain; locked roster rejected                                           |
| DELETE /teams/:id/members/:userId                     | IDs                                                                             | Captain; cannot remove captain; `{ok:true}`                                      |
| GET /tournaments                                      | q, game, status                                                                 | Public array with status and registeredCount; newest 200 before status filtering |
| POST /tournaments                                     | name, game, description, rules, teamSize, maxTeams, opensAt, closesAt, startsAt | Organizer; 201 stored event                                                      |
| GET /tournaments/:id                                  | ID                                                                              | Public detail; filtered registrations, matches, status, count                    |
| POST /tournaments/:id/registrations                   | teamId                                                                          | Player/captain; eligible roster submitted pending                                |
| POST /tournaments/:id/manual-registration             | teamId                                                                          | Owner; eligible roster approved immediately                                      |
| PATCH /tournaments/:id/registrations/:registrationId  | status APPROVED or REJECTED                                                     | Owner; registration phase only                                                   |
| DELETE /tournaments/:id/registrations/:registrationId | IDs                                                                             | Owner; before bracket generation                                                 |
| POST /tournaments/:id/bracket                         | None                                                                            | Owner; single-use generation                                                     |
| PATCH /tournaments/:id/matches/:matchId/schedule      | scheduledAt, optional venue                                                     | Owner; valid round order, ongoing event                                          |
| POST /tournaments/:id/matches/:matchId/result         | scoreA, scoreB                                                                  | Owner; atomic result/advancement                                                 |
| GET /dashboard                                        | Cookie                                                                          | Own-role teams/tournaments/count/upcomingMatches/recentResults                   |

## Validation and failures

Username: 3–24 alphanumeric/underscore characters, lowercase normalized. Email normalized; maximum 254. Registration password 10–128 characters. Team name 3–60, description up to 500, optional HTTPS logo up to 500. Event name 3–100, description/rules 10–5000; teamSize 1–10, maxTeams 2–64. Scores are unequal integers 0–999. Schedule venue maximum 200. Date ordering now compares parsed instants, with precision regression tests (F04 fixed).

Normal error envelopes contain `error`; validation adds issues. Intended statuses include 400 malformed/invalid input, 401 missing authentication, 403 denied role/ownership, 404 missing resource, 409 uniqueness/concurrency conflict and 429 rate limit. Unexpected failures return a generic 500 without stack traces. A request over the 64 KB JSON limit returns 413 (F05 fixed). Errors include a server-generated requestId. Rate-limit responses and content types need explicit contract tests before external clients rely on them.

## Visibility and shape gaps

Approved entries and their snapshots are public. Pending/rejected detail entries are limited to their snapshot members or owner. Phase 1 restricts player dashboards to their own entry metadata (F02) and returns snapshot members in public event entries (F03). Do not treat current broad Prisma response shapes as approved permanent contracts.

Dashboard fields are `teams`, `tournaments`, `totalRegistrations`, `upcomingMatches`, `recentResults` (last ten played results). Discovery, detail, create and dashboard projections remain distinct; shared Zod response schemas now infer their separate TypeScript types. Pagination is absent, and status filtering after a 200-row fetch can omit matching older events. Every endpoint needs an explicit response schema and access matrix before a secure developer API is offered.

## Phase 1 operational endpoints

GET /live returns process liveness. GET /ready and the existing /health return 200 for database readiness or safe 503 when unavailable/draining. Health checks run before session lookup. All responses receive X-Request-ID; normal API data responses are Cache-Control: no-store. HTTP transports now live in apps/api/src/modules/*/routes.ts.

## Phase 2 identity endpoints

All paths below have `/api` prefix. JSON mutations require X-MatchFlow and the centralized origin policy. Validation is strict Zod; errors remain `{error, requestId}` where supplied by centralized handling. Authenticated account data is projected without hashes/tokens. Recent authentication means within five minutes.

| Method/path                                    | Contract and policy                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET /auth/options                              | `{email:boolean,google:boolean}` configuration availability                                                        |
| POST /auth/register, /auth/login               | Existing credentials contract; register password min 12; both capabilities, default dashboard role; rotates cookie |
| POST /auth/logout                              | Revokes current cookie session                                                                                     |
| GET /auth/me                                   | Current self user or null                                                                                          |
| POST /auth/verification                        | Authenticated own account; requests email verification                                                             |
| POST /auth/forgot-password, /auth/reactivation | `{email}`; generic eligibility response, throttled                                                                 |
| POST /auth/verify-email, /auth/reactivate      | `{token}` 64-character hex token; single-use                                                                       |
| POST /auth/reset-password                      | `{token,password}`; revokes all sessions                                                                           |
| POST /auth/reauthenticate                      | `{password}`; authenticated, throttled                                                                             |
| GET /account                                   | `{user,googleLinked}`; self only                                                                                   |
| PATCH /account                                 | `{displayName,bio,role}`; only permitted profile fields                                                            |
| POST /account/password                         | `{password,currentPassword?}`; recent auth, existing password if set; signs out all devices                        |
| GET /account/sessions                          | Own active `{id,createdAt,expiresAt,current}[]`                                                                    |
| DELETE /account/sessions/:id                   | Recent auth, owner-bound revocation, no cross-user disclosure                                                      |
| POST /account/sessions/revoke-others           | Recent auth, preserves current session                                                                             |
| POST /account/deactivate, /account/deletion    | Recent auth; revokes credentials, blocks last-admin removal; deletion anonymizes immediately                       |
| POST /auth/google/start                        | Returns authorization `{url}`, sets browser-binding cookie; 503 if unconfigured                                    |
| POST /account/google/link                      | Recent auth; binds current session; callback also requires verified account                                        |
| GET /auth/google/callback                      | State/browser/PKCE/nonce verified; rotates session and redirects to account, or generic login failure              |
| DELETE /account/google                         | Recent auth and password fallback required; revokes sessions                                                       |
| GET /organizations/:id/members                 | Owner/admin of that organization                                                                                   |
| PUT /organizations/:id/members/:userId         | Owner plus recent auth; `{role:ADMIN or MEMBER}`; active verified target                                           |
| PUT /tournaments/:id/permissions/:userId       | Owner/organization admin plus recent auth; `{canManage:boolean}`; active verified target                           |
| GET /admin/security-events                     | Verified moderator/admin; latest 100 identifier-only audits                                                        |
| GET /admin/deletion-requests                   | Verified admin; latest 100 lifecycle records, including resolved anonymizations                                    |
| PATCH /admin/users/:id/role                    | Verified admin plus recent auth; `{platformRole:NONE or MODERATOR or ADMIN}`; target sessions revoked              |

New self-user fields include roles, platformRole, emailVerifiedAt, verificationRequired, displayName and bio. Tournament detail adds canManage for client affordances; backend policies remain authoritative. SMTP and Google credentials are operational configuration, never request input.

## Phase 3 read projection

`GET /api/organizations` requires a valid session and returns `{id,name,ownerId}[]`, sorted by name. Only direct owners or organization OWNER/ADMIN members are included. Ordinary members and unrelated users do not receive management-list entries. The existing member endpoint rechecks management access. Integration tests cover unauthenticated denial and owner/admin/foreign visibility. All other UI actions reuse existing endpoints; there is no notification or moderation-case API behind the unavailable screens.

## Phase 4 profiles, teams and media

All mutations retain session, CSRF, origin, input-validation and server authorization requirements. Competition/member/media mutations require verified accounts (or grandfathered access).

- GET /players/:username: public basics if active and profilePublic, otherwise owner-only/404. Explicit projection excludes email, platform authority and credentials. `record` is null when history is hidden, `teams` null when memberships are hidden; self may view both. Public event records remain independent.
- PATCH /account retains required displayName/bio/role and adds optional normalized username, region (80), gamesPlayed (unique supported games, max 6), socialLinks (HTTPS without URL credentials, max 5), profilePublic/showHistory/showTeams booleans. Identity, membership IDs and saved historical names remain stable across username edits. Profile writes are throttled and audited.
- POST /teams and PATCH /teams/:id: name/game/description/region; no remote logo URL input. Only captain/manager may edit; game cannot change after any entry history. Existing logoUrl output now contains server-generated media URLs only.
- POST /teams/:id/members creates a pending seven-day invitation (201), never an active member. GET /team-invitations returns own pending unexpired invitations. POST /team-invitations/:invitationId/respond `{accept:boolean}` is recipient-only. GET /teams/:id/invitations and DELETE /teams/:id/invitations/:invitationId require team management.
- PATCH /teams/:id/members/:userId accepts manager/substitute booleans; only captain grants manager authority. Managers cannot alter other managers or captain. DELETE removes an authorized non-captain member. POST /teams/:id/leave removes own non-captain membership. Team edits do not alter submitted snapshots.
- POST /teams/:id/archive requires captain/recent authentication and no active unfinished entry. Records remain, future writes/registering blocked.
- POST /teams/:id/transfer `{userId}` offers ownership; captain/recent authentication. POST /teams/:id/transfer/respond `{accept:boolean}` requires designated current member/recent authentication. DELETE cancels; captain/recent authentication. Offers expire after 24 hours and concurrent acceptance has one winner.
- GET /teams/:id/history: member-only, approved participation and completed played-match statistics; BYEs excluded.
- POST /tournaments/:id/registrations/:registrationId/roster `{}` proposes the current accepted starting roster; captain/manager only, registration open. PATCH same path `{approve:boolean}` requires tournament management. Approval before close rechecks eligibility/duplicates/current starting members and atomically changes only that snapshot. Rejected entries, wrong tournament IDs, expired/stale/locked requests fail. `proposedRoster` is visible only to team/tournament managers; `rosterProposedBy` is never serialized in detail. Public approved rosters remain the saved version until approval.
- GET /media/options: `{available:boolean}` configuration state. POST /account/avatar or /teams/:id/logo accepts raw PNG/JPEG/WebP bytes with image MIME or application/octet-stream, up to 2 MB. Server checks actual format, 16 MP/frame constraints and re-encodes; returns opaque `{id}` (201). Avatar target is always the caller; logo requires team management before decoding and again before attachment. Absent configuration returns safe 503. DELETE same paths removes the current association.
- GET /media/:id: WebP bytes with no-store/nosniff; active public avatar or own private avatar, or currently attached public team logo. Unattached/deleted/private foreign assets return 404. No client-provided object paths/remote URLs/presigned uploads.

Registration snapshots contain accepted starters only; authorized managers may submit. The current ten-member team cap is unchanged. Shared response contracts cover profile/invitation/history payloads. Legacy profile visibility defaults private on migration; new profiles default public. See ADR 0005 and deployment instructions.

## Phase 5 tournament contracts

GET /tournaments accepts q, game, region, locationType, format, teamSize, competitionType, category, dateFrom/dateTo (ISO UTC), status, sort and page. Pages contain at most 50; only public non-drafts are returned. Sort NEWEST, UPCOMING, DEADLINE or POPULARITY (total submitted entry interest, including historical statuses). PAID has no supported events. GET /organizers/:username returns public-profile basics and up to 50 published public events, never private counts.

POST /tournaments and PATCH /tournaments/:id validate full configuration including region/location, TEAM/INDIVIDUAL, PUBLIC/PRIVATE, eligibleRegions, eligibility, prizeInfo, endsAt, checkInRequired, waitlistEnabled, format and SCORE/BO1/BO3/BO5. POST supports saveAsDraft. Individual requires teamSize=1. Only FREE category is accepted. Existing defaults are retained. PATCH requires management and pre-start phase; structural rules freeze after entries exist.

POST /tournaments/:id/lifecycle accepts action PUBLISH/CHECK_IN/POSTPONE/CANCEL and reason (required >=10 characters for postpone/cancel). POST /:id/announcements accepts title/body. GET /:id/export returns authorized formula-escaped CSV. POST/DELETE /:id/cover use the media pipeline (raw image bytes for POST, 2 MB limit).

POST /:id/share-link requires management/recent authentication, rotates a secret and returns {token} once. POST /:id/access accepts {token}, rate-limits redemption and sets the share cookie. GET /:id and linked cover reads enforce visibility and exclude token hashes. Detail includes announcements, canManage, standings, checkedInAt and scoped waitlist explanations. Public readers never receive unapproved roster details without participant/team-manager authority.

POST /:id/individual-registration accepts {} and binds the authenticated user. Existing POST /:id/registrations accepts teamId and requires captain/manager authority. Capacity can return WAITLISTED when enabled; pending/approved reserve places. POST /:id/registrations/:entry/withdraw and /check-in bind the event, entry and current authorized participant. Review remains PATCH with APPROVED/REJECTED or DELETE removal; a waitlisted entry cannot bypass FIFO promotion through approval.

POST /:id/bracket creates the selected format once under existing manager policy. Result POST now accepts optional statistics:{killsA,deathsA,assistsA,killsB,deathsB,assistsB,durationSeconds}; all seven fields are required for RR/Swiss. Counts are integers 0–100000 and duration 1–86400 seconds. Series scores must finish the selected best-of. Statistics and result/advancement are atomic, immutable and audited. Match detail includes bracket labels. See ADR 0006 for progression, exact tie-breaking and seeded playoffs.

## Phase 6 competition contracts

Tournament create/edit accepts `format` SINGLE_ELIMINATION, DOUBLE_ELIMINATION, ROUND_ROBIN, SWISS, GROUPS, LEAGUE or BATTLE_ROYALE and `engineRules` (shared engine.ts). Format-specific rules are required and unrelated rule sections rejected. Published and edited rules freeze when registrations exist. Detail includes safe stages, match dependencies/version/outcome/slot length, rules, and group/league/RR/Swiss standings. Discovery supports all seven format filters.

All write routes retain session, Origin/CSRF and input validation. ORGANIZER means an authenticated organizer capability plus the event ownership/staff policy, not role-only authorization. PLAYER report/dispute routes also require a saved match participant or authorized team manager. Private access retains the existing secret-link/participant policy. Normal responses never include share-token hashes.

| Method and path under /api/tournaments/:id | Behavior                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| POST /bracket                              | Approved entrant generation; `{seeding: REGISTRATION/RANDOM/MANUAL, teamIds?}`; manual IDs must cover entrants exactly  |
| POST /bracket/reset                        | Unplayed-only reset with reason; retains entries                                                                        |
| POST /assignments/swap                     | Swap `{first:{matchId,side},second:{matchId,side}}` before elimination progression                                      |
| PATCH /matches/:matchId/format             | Pending match SCORE/BO1/BO3/BO5 override                                                                                |
| PATCH /matches/:matchId/schedule           | ISO scheduledAt, venue, slotMinutes 1–480; overlap/dependency/date validation                                           |
| POST /matches/:matchId/result              | Organizer confirmation with optional expectedVersion, PLAYED/DRAW scores/statistics or FORFEIT/NO_SHOW winnerId/reason  |
| POST /matches/:matchId/reports             | Participant proposal, no progression until reviewed                                                                     |
| POST /reports/:reportId/review             | Owner `{approve,reason}`; full result validation repeated                                                               |
| POST /matches/:matchId/disputes            | Participant/manager completed-match dispute with reason                                                                 |
| GET /my-reports                            | Only the caller's reports and disputes, with current event visibility checked                                           |
| GET /engine-history?cursor=                | Owner-only reports/disputes and paged historical evidence; opaque cursor is event-scoped                                |
| GET /disputes/:disputeId/preview           | Owner-only rollback scope, previewHash, voided result count and champion impact                                         |
| POST /disputes/:disputeId/correct          | Owner + recent auth; previewHash, acknowledgement VOID_AND_REPLAY, reason and corrected result/lobby; stale preview 409 |
| POST /disputes/:disputeId/dismiss          | Owner resolution reason, no result change                                                                               |
| GET /battle                                | Visible event's configured rules, assigned lobby participants/results and cumulative standings                          |
| PATCH /battle/:roundId/schedule            | Owner ordered nonoverlapping lobby slots                                                                                |
| POST /battle/:roundId/result               | Owner complete entrant results `{expectedVersion?,results:[{teamId,placement,eliminations,noShow}]}`                    |
| POST /battle/:roundId/disputes             | Played lobby dispute by a participant or manager                                                                        |

Optional UUID `Idempotency-Key` is supported for generation, result confirmation, player reports, lobby confirmation and corrections. Keys are scoped to the actor, bound to the complete operation and committed atomically with it; altered requests with the same key return 409. Without a key, repeated completed results cannot overwrite history. Input/response contracts are in shared brackets.ts, matches.ts, engine.ts, battle.ts and engine-responses.ts. KDA/duration are organizer/player reported, not provider verified.

## Phase 7 API contracts

Authenticated `GET /api/notifications` returns a paged owned inbox, unread count and email-availability flag, filtered by current event visibility. `GET /api/notifications/preferences` reads defaults or saved choices; `PUT` saves validated `inApp`, `email`, and `mutedKinds`. `POST /api/notifications/read-all` and `POST /api/notifications/:id/read` mark permitted owned deliveries read. Mutations retain CSRF protection. See `packages/shared/src/notifications.ts` for exact schemas.

Organizer `PATCH /api/tournaments/:id/matches/:matchId/live-score` accepts bounded `scoreA`, `scoreB` and `expectedVersion`. Stale versions conflict; only pending resolved matches in ongoing events accept provisional scores. It does not confirm or progress results.

Socket.IO `/api/realtime` uses WebSocket transport, allowed Origin and the existing session cookie. `subscribe` accepts `{tournamentId, version?}` and acknowledges current authorization/version; `unsubscribe` removes a topic. Server `changed` signals carry topic/id/version/resync only. `subscription-revoked`, `access-revoked` and `sync-unavailable` direct recovery. There are no socket score mutations or arbitrary user/organization rooms. All content is fetched through authorized HTTP routes.

## Phase 8 organization contracts

- GET/POST /api/organizations: current owned/member workspaces and verified organization creation.
- GET/PATCH /api/organizations/:id: current workspace projection and owner/admin profile update with expectedVersion.
- GET /api/organizations/:id/public: opt-in public profile and latest public non-draft events, without internal membership/analytics.
- GET /api/organizations/:id/members: current-member username/role directory.
- POST/GET /api/organizations/:id/invitations and DELETE /api/organizations/:id/invitations/:invitationId: owner/admin invite management; ADMIN offers are owner-only.
- GET /api/organization-invitations and POST /api/organization-invitations/:id/respond: verified matching recipient listing and explicit accept/reject.
- PUT/DELETE /api/organizations/:id/members/:userId: change an existing accepted member's role or remove/leave. PUT no longer creates memberships; use invitations. Owner cannot be removed; administrator control is owner-only.
- GET /api/organizations/:id/analytics?days=90 and /export.csv: owner/admin/manager aggregate reporting; days is 7–366.
- POST/DELETE /api/organizations/:id/logo: owner/admin validated branding upload/removal.

Tournament creation accepts optional organizationId after current event-management authority checks. Editing cannot reassign organization. Existing tournament permission route requires an accepted member and organization owner/admin authority for organization events. Sensitive membership/invitation mutations require recent authentication; all cookie writes retain CSRF checks. See packages/shared/src/organizations.ts for exact DTO schemas and ADR 0009 for metric definitions.

## Phase 9 contracts

Versioned `/api/v1` uses dedicated Bearer credentials and explicit projections; `/api/v1/public` is read-only and ignores cookies/key authority. OpenAPI 3.1 is served at `/api/v1/openapi.json`; full endpoint/scope/pagination/error/verification instructions are in developer-api.md. Shared developer.ts validates strict management/write/query input. response-contracts.ts documents success DTOs. Owner/admin management uses the existing session/CSRF boundary under `/api/organizations/:orgId/integrations`, with credential issuance/rotation/revocation, scope selection, webhook configuration/rotation/disable, paged usage/deliveries and authorized dead-delivery retry.

## Phase 10 — branded portals

Canonical owner/admin portal management: GET/PUT /api/organizations/:orgId/portal; POST/DELETE /api/organizations/:orgId/portal/cover. Owner-only domains: GET/POST /api/organizations/:orgId/domains; POST /:domainId/check and /:domainId/challenge; DELETE /:domainId. Sensitive writes require recent authentication and existing CSRF protections. PUT uses expectedVersion; slug cannot change after creation. Provider-unconfigured checks return an explicit unavailable response.

GET /api/portal/context selects canonical or verified tenant presentation. Canonical public portal reads use /api/portals/:slug; verified custom origins use /api/portal. Subresources: /tournaments, /tournaments/:id plus bracket, matches, schedule, results, standings, rounds, teams and announcements; /media/:id. Listings accept bounded q/page/completed; nested competition resources retain bounded v1 pagination. Unknown/private/foreign resources return 404. Invalid tenant origin returns 421; other APIs on custom hosts return 404. These read surfaces do not accept credential-based elevation.

## Phase 11 — administration and responsible operations

Staff setup: GET /api/account/staff-factor; POST /enroll, /activate, /verify and /reset beneath that path. Verification accepts only otp (six digits or a recovery code); enrollment/reset require recent primary authentication. Account export: GET /api/account/export?page=N, recent auth, returns nextPage until null. Public contact: GET /api/support/contact. Verified signed-in intake/list: POST/GET /api/support/cases; reporter ID is server-owned.

/admin endpoints require staff factor: GET overview, users, organizations, tournaments, cases, cases/:id/history, disputes, security-events; administrator-only GET api-usage. Lists use bounded page/q/status as applicable. POST cases/:id/review requires action/reason/resolution/expectedVersion. POST organizations/:id/owner requires newOwnerId and reason; POST retention-holds requires resourceType/resourceId/hold. Existing PATCH users/:id/role now passes the staff factor gate and transactional recheck. Staff dispute preview/dismiss/correct live under /admin/tournaments/:id/disputes/:disputeId and retain exact binding, acknowledgement and stale-preview rejection. Ordinary audit/case mutations and cross-tenant authority are never inferred from supplied IDs.

Phase 11 also provides POST /api/admin/cases for recently authenticated staff to open cases on private accounts/resources without weakening ordinary intake visibility. GET /api/admin/cases/:id/context returns an audited minimal target projection, excluding account emails/secrets.

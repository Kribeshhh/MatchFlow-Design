# MatchFlow core MVP

MatchFlow now supports a complete database-backed tournament lifecycle behind the existing landing page. The established hero, glass spheres, search preview, typography, colors, original bracket demo, and responsive presentation remain intact. Navigation connects discovery, account access, and hosting to actual app routes.

## What is implemented

- Player and organizer account creation, login, logout, and persistent authenticated sessions.
- Role-aware dashboards: teams, tournament entries, schedules, results; event ownership, registrations, and upcoming matches for organizers.
- Reusable teams with a captain, game, optional description, optional HTTPS logo URL, and existing-player member lookup.
- Public tournament discovery with name, game, and status filters.
- Event overview, approved teams, live database bracket, schedule, completed results, and champion.
- Organizer creation and management: review/approve/reject/remove entries, manually add eligible teams, generate a bracket, schedule matches, and record results.
- Single elimination for 2–64 approved teams, including non-power-of-two entrants via BYEs. Tournament rosters contain 1–10 players.
- Server validation, ownership checks, rate limiting, security headers, restricted CORS, and transaction-protected business rules.

No payment, subscription, sponsor, analytics, chat, dispute, verification, advanced notification, administration, AI, or additional bracket-format features are included.

## Architecture and files

| Location                                                                                                     | Responsibility                                                                    |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `src/App.tsx`                                                                                                | Preserved landing page with connected primary navigation                          |
| `src/Universe.tsx`, `src/HeroSearch.tsx`, `src/Art.tsx`, `src/Bracket.tsx`, `src/styles.css`, `src/hero.css` | Established landing presentation; fictional preview data remains in `src/data.ts` |
| `src/main.tsx`                                                                                               | React entry point, now mounts router                                              |
| `src/mvp/Router.tsx`                                                                                         | App routing, shell, navigation, protected pages                                   |
| `src/mvp/Auth.tsx`, `AuthPage.tsx`                                                                           | Session context, guards, account forms                                            |
| `src/mvp/api.ts`, `UI.tsx`                                                                                   | API client, typed resources, errors, reusable UI                                  |
| `src/mvp/DashboardPage.tsx`, `TeamsPage.tsx`, `EventsPage.tsx`, `EventDetailPage.tsx`                        | Actual application workflows                                                      |
| `src/mvp/mvp.css`                                                                                            | Scoped application styles using existing MatchFlow identity                       |
| `server/app.ts`, `server/index.ts`                                                                           | Express API, middleware, production static serving                                |
| `server/security.ts`                                                                                         | Password hashing, opaque session cookies, authorization middleware                |
| `server/tournaments.ts`                                                                                      | Registration, ownership, bracket generation/progression and schedule transactions |
| `server/db.ts`                                                                                               | Prisma client and serializable transaction retry helper                           |
| `shared/validation.ts`                                                                                       | Shared Zod validation contracts                                                   |
| `prisma/schema.prisma`, `prisma/migrations/`                                                                 | PostgreSQL schema and versioned migration                                         |
| `prisma/seed.ts`                                                                                             | Idempotent fictional development data                                             |
| `scripts/local-db.mjs`, `scripts/test.mjs`                                                                   | Isolated local database and test runner                                           |
| `tests/lifecycle.test.ts`                                                                                    | PostgreSQL-backed lifecycle, permission, capacity, registration and BYE tests     |
| `vite.config.ts`                                                                                             | Same-origin API proxy during development/preview                                  |
| `server/tsconfig.json`, `package.json`, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`               | Build, environment, setup, and development guidance                               |

## Database relationships

- **User**: normalized unique username/email, scrypt password hash, immutable PLAYER or ORGANIZER role.
- **Session**: hashed opaque token, user, expiry. Raw tokens exist only in the HttpOnly cookie.
- **Team**: game, name, captain, optional description/logo; related to members, entries, matches and championships.
- **TeamMember**: composite team/user key prevents duplicates. Captain is always a member and cannot be removed.
- **Tournament**: owner, game, exact team size, maximum teams, registration dates, start, description/rules, phase, champion.
- **TournamentRegistration**: unique tournament/team pair, review status, and immutable roster snapshot (player IDs/usernames).
- **Match**: unique tournament/round/position, opponents, scores, winner, BYE marker, status, schedule, location, completion time.

Foreign keys preserve relationships. Unique keys prevent duplicate membership, entries and bracket slots. Prisma migrations establish the schema.

## Authentication and security

Passwords use Node's asynchronous scrypt with a fresh 16-byte random salt and 64-byte derived key. Passwords are never stored as plaintext. Login checks are constant-time, with a dummy hash verification for unknown accounts. Sessions are random 32-byte tokens; only their SHA-256 digests are stored. They expire after seven days. Login/registration rotates the caller's session, and logout deletes it.

Cookies are HttpOnly, SameSite=Lax, Path=/ and Secure in production. Production therefore requires HTTPS. No authentication tokens are stored in localStorage. Protected reads and every mutation validate the current session server-side. Organizer role and tournament ownership are independent checks. Changing a frontend ID does not grant access.

All mutations require `X-MatchFlow: 1`; any supplied Origin must match `CLIENT_ORIGIN`. Cross-origin browser requests require a preflight and CORS permits only the configured origins. Vite proxies `/api` to keep browser requests same-origin. Authentication is rate limited to 40 requests per 15 minutes per IP; the API is limited to 300 requests/minute/IP. Integration tests use higher limits. Helmet adds security headers. JSON requests are capped at 64 KB. Zod validates bodies, dates, enums, ranges and unknown fields. API errors omit internal exception details. Public responses never include password hashes, session tokens, or user emails.

The local database binds to loopback and uses SCRAM password authentication with generated, untracked credentials. Production should use a separate restricted database account and a configured TLS reverse proxy. The server intentionally does not trust arbitrary proxy forwarding headers.

## Player workflow

1. Create a PLAYER account at `/register`.
2. Open `/teams/new`; choose a game and create a team. You become captain/member one.
3. Open the team page. Search an existing username (minimum two characters); add/remove players until the exact event roster size is met.
4. Browse `/tournaments`, filter, and open an event.
5. Select one of your captain-owned, matching-game teams. The saved roster loads automatically.
6. Submit for approval. Your dashboard/event page displays PENDING, APPROVED, or REJECTED.
7. Follow event Bracket, Schedule and Results. The dashboard displays matches involving your team.

Rosters are locked while a pending/approved entry belongs to an unfinished event. A captain cannot remove themselves. Duplicate members and duplicate players across active entries in the same tournament are rejected. Captains may reuse the same roster across different tournaments.

## Organizer workflow

1. Create an ORGANIZER account and open `/organizer/tournaments/new`.
2. Provide name, game, description, rules, exact team size, capacity and dates. Registration must open before it closes; closing cannot follow the tournament start; creation requires a future start.
3. Share the public event URL. Manage registrations from the organizer page.
4. Approve/reject pending teams, remove entries, or manually add an eligible existing team. Manual entries are immediately approved but use the same eligibility/capacity checks.
5. Resolve all pending entries. Generate a bracket once at least two teams are approved.
6. Open Matches. Schedule unresolved rounds and record results once both opponents are known.
7. The final result declares the champion automatically. Public Bracket/Results and dashboards read the updated records.

A rejected entry must be removed and resubmitted before approval, so a changed roster cannot bypass eligibility checks. Generation closes registration even if the original deadline has not passed. All entry mutations are blocked afterward.

## Registration and concurrent writes

Eligibility checks require an open registration window, the correct game, an exact roster size, captain permission, capacity, no existing team entry, and no overlapping player in another pending/approved roster for the event. Pending and approved entries reserve capacity; rejected entries do not.

Roster mutation, entry creation/review, bracket generation, scheduling, and result progression use PostgreSQL SERIALIZABLE transactions with up to three retries for serialization conflicts. Concurrent requests cannot overbook the final slot or advance a match twice. Roster snapshots preserve historical event membership after a tournament completes.

## Bracket generation and progression

Approved entries are seeded in registration order, with ID as a deterministic tiebreaker. The bracket size is the next power of two. A standard reflected seed ordering (1 vs last seed, etc.) spreads missing seeds so no first-round match is entirely empty. Every round/slot is persisted at generation time.

A first-round match with one team is a BYE. It is marked complete without a score and its winner immediately fills the appropriate next-round slot. Other matches wait for both participants.

Saving scores requires unequal non-negative integers (maximum 999), a live tournament, two resolved opponents, owner permission and an unfinished match. In one transaction the API stores scores/winner/completion time, marks the match complete and places the winner into round+1 at `floor(position / 2)`, in side A for even positions or side B for odd positions. With no next round, the winner becomes the tournament champion and phase becomes COMPLETED.

Results are final in this MVP. There is no bracket regeneration or score correction after publication; this avoids silently corrupting downstream results. Ties are rejected. The separate landing-page bracket animation is explicitly a fictional demonstration and never writes to the database.

## Schedules and results

Date/time forms use the browser's local timezone; values are sent and stored as UTC timestamps. A match cannot be scheduled before the tournament start. Adjacent rounds must respect known schedule order. Later rounds may be scheduled before their opponents are resolved. Location/room/venue is optional and public on the schedule, so do not use it for private access credentials.

Match status is PENDING, SCHEDULED, or COMPLETED. A result can be recorded without a schedule when both opponents are known. BYEs do not appear as played results. Match scheduling is a published plan rather than a clock-based restriction on reporting scores. The MVP does not enforce duration-based or cross-tournament calendar conflicts.

## API endpoints

All endpoints are prefixed with `/api`. Mutations require JSON and `X-MatchFlow: 1`.

| Method / path                                           | Access and purpose                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET `/health`                                           | Database connectivity                                                                       |
| GET `/auth/me`                                          | Session user or null                                                                        |
| POST `/auth/register`                                   | Account creation; username/email/password/role                                              |
| POST `/auth/login`                                      | Email/password login                                                                        |
| POST `/auth/logout`                                     | Delete session                                                                              |
| GET `/users?q=`                                         | Player-only existing username search; public user fields only                               |
| GET `/teams`                                            | Current user's teams                                                                        |
| POST `/teams`                                           | Player creates a team                                                                       |
| GET `/teams/:id`                                        | Team members only, including roster-lock state                                              |
| POST `/teams/:id/members`                               | Captain adds an existing player (`userId`)                                                  |
| DELETE `/teams/:id/members/:userId`                     | Captain removes a noncaptain member                                                         |
| GET `/teams?eligibleFor=:tournamentId`                  | Event owner searches eligible manual-entry candidates                                       |
| GET `/tournaments?q=&game=&status=`                     | Public discovery (maximum 200 results)                                                      |
| POST `/tournaments`                                     | Organizer creates event                                                                     |
| GET `/tournaments/:id`                                  | Public event/matches; pending/rejected rosters visible only to their members or event owner |
| POST `/tournaments/:id/registrations`                   | Player/captain submits `teamId`                                                             |
| POST `/tournaments/:id/manual-registration`             | Owner manually approves eligible `teamId`                                                   |
| PATCH `/tournaments/:id/registrations/:registrationId`  | Owner sets APPROVED or REJECTED                                                             |
| DELETE `/tournaments/:id/registrations/:registrationId` | Owner removes entry before bracket generation                                               |
| POST `/tournaments/:id/bracket`                         | Owner generates bracket                                                                     |
| PATCH `/tournaments/:id/matches/:matchId/schedule`      | Owner sets `scheduledAt`, optional `venue`                                                  |
| POST `/tournaments/:id/matches/:matchId/result`         | Owner sets `scoreA`, `scoreB`; automatically advances winner                                |
| GET `/dashboard`                                        | Authenticated role-aware dashboard                                                          |

## Install and run

Requirements: Node.js 22+ and PostgreSQL 17 (or compatible PostgreSQL installation).

```sh
npm install
npm run db:local
npm run db:migrate
npm run db:seed
npm run dev
```

`db:local` looks for Homebrew PostgreSQL 17 on macOS, otherwise `pg_ctl` on PATH. Set `PG_BIN=/path/to/postgres/bin` for another installation. On this machine PostgreSQL 17 was installed and a project-specific cluster was initialized in `.local/postgres`; it is not a system login service. It listens at 127.0.0.1:55432. The helper creates `matchflow_dev` and `matchflow_test`, and writes generated credentials to private `.env`. It will not replace an existing `.env` or wipe an existing cluster. Stop it with `npm run db:stop`.

For an existing external database, copy `.env.example` to `.env`, set `DATABASE_URL`, and skip `db:local`. Create a separate test database ending in `_test` for `TEST_DATABASE_URL`. Never commit `.env`.

The frontend runs at `http://localhost:5173`; the backend at `http://localhost:3001`. `npm run dev` starts both. `dev:web` and `dev:api` run them separately. The browser uses the Vite proxy.

```sh
npm run build
npm test
```

For deployment, apply `npm run db:migrate`, then build and run `npm start` behind HTTPS. The Express server serves `dist` and supports client-side routes. Set `CLIENT_ORIGIN` to the exact public origin. The current listen address is loopback, suitable for a local reverse proxy; adapt it deliberately for container deployment. Seed data is not production content. Production seeding requires explicit `SEED_DEMO_DATA=yes`.

## Demo accounts and data

All data and identities are fictional. Local demo password: `MatchFlowDemo!2026`.

| Account                         | Role                                                           |
| ------------------------------- | -------------------------------------------------------------- |
| `demo_organizer@matchflow.test` | Organizer: open PUBG/Free Fire events and ongoing playoffs     |
| `arena_host@matchflow.test`     | Second organizer: Mobile Legends event and completed River Cup |
| `demo_player@matchflow.test`    | Player/captain: Valley Voyagers and Dawn Drifters              |
| `river_scout@matchflow.test`    | Player: teammate for roster testing                            |
| `summit_ace@matchflow.test`     | Player/captain: Cedar Comets                                   |
| `grove_guard@matchflow.test`    | Player/captain: Summit Sparks and Ember Explorers              |
| `cedar_spark@matchflow.test`    | Player/captain: River Runners                                  |

Additional teammates: `echo_runner`, `pixel_pilot`, `lunar_rook` (same email domain/password). These are deliberate demo credentials, not real accounts. Remove/replace them before a public deployment.

Seeding is idempotent: it does not overwrite passwords, rosters, event progress or user-created records. Dates are relative to the first seed run. Old demo registration windows eventually close; create new events to demonstrate future dates.

## Full-cycle verification

`npm test` applies migrations to `TEST_DATABASE_URL`, verifies the name ends in `_test`, clears only that test database, and runs actual API requests against PostgreSQL using Supertest. It never clears the development database.

The integration suite creates organizers and players, creates a tournament, creates teams, searches/adds existing members, submits entries, reviews them, generates a three-team/four-slot bracket with a BYE, schedules a match, reads the player dashboard, records results, checks automatic advancement, finishes the final, and reads the declared champion and results publicly. It also checks unauthorized roles/foreign organizers, duplicate members, incomplete/wrong-game rosters, overlapping players, locked rosters, rejected-entry handling, manual approval, tied/overwritten/unresolved results, CSRF, session logout, and simultaneous entries competing for limited capacity. Seed ordering is checked for every entrant count from 2 through 64.

To repeat manually in the browser:

1. Register an organizer and create a two-player, three-team tournament whose registration is currently open.
2. In another session or after logout, create a player, create a PUBG Mobile team, search `river_scout` and add that player.
3. Discover the new tournament and submit the roster; confirm pending approval.
4. Log in as the event owner. Approve it, then manually add two eligible non-overlapping demo rosters (for example Cedar Comets and Summit Sparks).
5. Generate the bracket. Verify one team advances via BYE.
6. Schedule the playable first-round match; record `2–1`. Check that the winner appears in the final.
7. Schedule the final and record another unequal score. Confirm the champion banner and public Bracket/Schedule/Results pages.
8. Log in as a participating player to verify their dashboard result.

### Verified locally on October 1, 2026

- `npm run build` passed, including frontend and server TypeScript checks.
- `npm test` passed all five PostgreSQL integration tests.
- Browser walkthrough completed account/team creation, member lookup, registration, approval, manual entries, three-team bracket generation, a BYE, scheduling, semifinal advancement, final result, champion declaration, and the participating player's dashboard result.
- The fictional “Browser Proof — Community Cup” remains in the local demo database as a completed example. No existing user records were reset.
- Public event layout checked at 390px with no document-level horizontal overflow. Browser console had no errors at the final check.
- Screenshot: `preview/mvp-completed-bracket.png`.

## Known MVP limitations and future work

- Head-to-head team elimination only, including the battle-royale game labels; no multi-squad points/lobby ranking engine.
- Captains add existing players directly; invitations/consent flows are a future feature.
- No email verification, password recovery, account deletion, role switching, or roster transfer UI yet.
- No event editing/deletion, cancellation, bracket regeneration, reseeding UI, or result correction.
- No uploads/object storage. Optional logos are external HTTPS image URLs with a no-referrer policy.
- Exact roster size only; no substitute/bench selection. Tournament entries snapshot the whole roster.
- No push/live streaming updates; pages refresh after writes or on navigation/reload. No advanced notifications.
- Simple discovery limit of 200 events and manual-team candidate limit of 30; pagination can be added as data grows.
- Sessions expire after seven days. Authentication rate limits are process-local; multi-instance deployment needs a shared limiter and deliberate proxy configuration.
- This is a locally tested MVP, not a deployed production service. Production operations, monitoring, backups, recovery policies and security review remain deployment work.

Future product work can add invitations, account recovery, safe result correction, event edits, paginated discovery, and richer match formats without changing the core transaction and ownership guarantees.

# MatchFlow project instructions

## Established product

The landing page is complete. Preserve `src/App.tsx`, `src/Universe.tsx`, `src/HeroSearch.tsx`, `src/Art.tsx`, `src/Bracket.tsx`, `src/styles.css`, and `src/hero.css` visually. Landing-page navigation may connect to the app; fictional preview cards/search and the original bracket demo remain presentation data.

## Implemented MVP

- React + Vite + TypeScript + Tailwind, React Router. New app pages and styles live in `src/mvp/`.
- Express + TypeScript API in `server/`, shared Zod contracts in `shared/validation.ts`.
- PostgreSQL + Prisma models/migrations in `prisma/`. All actual tournament state is in PostgreSQL, not browser storage.
- Scrypt passwords; database-backed opaque sessions in HttpOnly cookies; player/organizer authorization and event ownership checked on the server.
- Team creation, captain-managed existing-user rosters, roster snapshots and locks during active entries.
- Tournament discovery, registration/review/manual approval, single-elimination bracket generation with BYEs, scheduling, automatic winner advancement, immutable results, and champion declaration.
- Player and organizer dashboards, public event overview/teams/bracket/schedule/results, owner management pages.

## Commands

- `npm run db:local`: start isolated local PostgreSQL on 127.0.0.1:55432 and create `.env` if absent. Requires PostgreSQL 17 binaries; `PG_BIN` overrides their location.
- `npm run db:migrate`, `npm run db:seed`, `npm run dev`.
- `npm run build`: Prisma generate, frontend/server TypeScript, Vite build.
- `npm test`: apply migrations and execute integration tests against `TEST_DATABASE_URL` (must end in `_test`). Tests intentionally clear only this test database.
- `npm run db:stop`: stop this project's local database.

## Invariants to preserve

1. Only event owners may mutate their tournaments; only players may create teams or submit registrations; only captains may alter/register their roster.
2. Pending and approved registrations reserve capacity. Rejected entries do not. A player's roster cannot enter twice in one event.
3. Registered rosters are immutable until their active entries are removed/rejected or their tournaments complete.
4. Generation requires at least two approved teams and no pending reviews. It is single-use, closes registration, and locks entries.
5. BYEs are resolved only in round one. Results require two resolved opponents, unequal integer scores, and a transaction that also advances the winner.
6. Results are final in the MVP. Do not introduce score edits without designing downstream invalidation.
7. Use serializable transactions and retry serialization conflicts for multi-record business mutations.
8. Never expose password hashes, session tokens, or database credentials. `.env` and `.local/` are ignored and must remain untracked.
9. Use the separate test DB. Do not reset the working/demo DB or overwrite user-created data.
10. New page CSS must remain scoped under `.mvp` to protect the landing page.

See `docs/MVP_IMPLEMENTATION.md` for architecture, API, workflow, setup, verification, and limitations.

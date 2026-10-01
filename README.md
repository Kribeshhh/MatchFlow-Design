# MatchFlow

A React/Vite/TypeScript tournament platform with the existing interactive landing page and a functional PostgreSQL-backed MVP.

## Run locally

Requires Node.js 22+ and PostgreSQL 17 binaries.

```sh
npm install
npm run db:local
npm run db:migrate
npm run db:seed
npm run dev
```

Open [MatchFlow](http://localhost:5173). The API runs at port 3001; Vite proxies `/api`.

For an existing PostgreSQL server, copy `.env.example` to `.env`, configure `DATABASE_URL`, and skip `db:local`. The local helper initializes an isolated cluster on port 55432; stop it with `npm run db:stop`.

## Local demo access

- Organizer: `demo_organizer@matchflow.test`
- Player: `demo_player@matchflow.test`
- Second organizer: `arena_host@matchflow.test`
- Password for these fictional local demo accounts: `MatchFlowDemo!2026`

## Verify

```sh
npm run build
npm test
```

Tests use a separate `TEST_DATABASE_URL` ending in `_test`, apply migrations, and exercise the complete tournament lifecycle against PostgreSQL. They intentionally clear only that test database.

The landing page remains at `/`. The functional app starts at `/tournaments`, `/register`, `/login`, and `/dashboard`. Tournament creation, team rosters, approvals, single-elimination brackets, schedules, results, and champion declaration use actual database records.

See [MVP implementation and workflow guide](docs/MVP_IMPLEMENTATION.md) for setup, database models, security, API endpoints, demo workflows, tested behavior, and limitations.

# Phase 7 verification — 2026-11-02

Scope: real-time tournament updates, notification center/preferences, durable tournament email and check-in reminders. Existing competition engines, identity/session model and landing identity are preserved. Stop after Phase 7.

## Evidence

- Baseline before changes: Phase 6 quality gates passed.
- Focused real-time integration: seven tests passed, covering exact-origin/session authentication, cross-user/private access, organization permission revocation, share-token rotation, expired sessions, concurrent subscription bounds, two independent API instances, transaction rollback, reconnect recovery, invalid socket score commands, notification idempotency, current inbox access, preferences/reminder deduplication, stale check-in suppression, dual queue workers, retry/dead-letter/redrive, deferred email permission checks and provisional score integrity.
- Final full regression: 20 unit tests and 56 integration tests passed with lint, formatting, strict types and production build.
- Browser regression: 45 tests passed across desktop, tablet and mobile, including two live viewers, offline/reconnect result recovery, actual inbox announcements/unread actions/preferences, accessibility scans, no horizontal overflow and preserved game-dialog behavior. The final rerun also checks stale live-score draft protection. The first expanded run found two test-ordering races: the test attempted confirmation before a preceding provisional PATCH completed. The test now waits for the actual response; server version checks remain unchanged.
- Forward migration replay passed on a disposable schema. Backed-up local migration comparisons preserved users, sessions, memberships, event identity, registration snapshots and played results.
- Dependency audit: zero vulnerabilities reported.

Final rerun: PASS — 20 unit, 56 integration and 45 browser tests. Lint, formatting, strict types, production build, disposable migration replay and dependency audit passed. Local API readiness and web preview returned HTTP 200; the operator queue status command completed successfully.

Local ignored evidence is under `.local/phase7/`: `live-tests-expanded.log`, `check-release.log`, `e2e-final.log`, `replay-final.log`, `audit.log`, and migration preservation logs. The test runners use a guarded disposable database and strip provider credentials. Tests do not reset working data.

## Screenshots

[Phase 7 screenshots](screenshots/phase-7/README.md) include desktop/tablet/mobile inbox/preferences and recovered completed brackets. Mobile inbox and desktop bracket captures were visually inspected. Browser fixture identities/data are test-only, not product statistics.

## Operational limits

SMTP provider configuration is still deferred by user choice. Delivery uses the real existing SMTP adapter; retry tests use an isolated test adapter, not a live provider. Authentication verification/recovery remains immediate delivery. SMTP has an acceptance/commit crash window that can resend despite a stable Message-ID; do not promise exactly-once email.

No Redis was introduced. PostgreSQL-backed pg-boss jobs and per-instance revision polling provide local multi-instance evidence, not production load certification. WebSocket proxy configuration, process supervision, queue alerting, database/queue restore drills, retention sign-off and live SMTP validation remain release gates. Queue readiness checks initialization and database health, not end-to-end delivery latency. Public viewers recover through 15-second HTTP polling; authenticated sockets receive revision invalidations and fetch authorized snapshots. Shared cookies acquired after connecting take effect on reconnect; HTTP access takes effect immediately.

Check-in scanning runs every 30 seconds; shorter-than-30-minute windows receive one opening reminder. Late reminders are suppressed after check-in/end/cancellation. Existing result/progression transactions remain the only authoritative competition writes. No game telemetry, push/SMS channels, commercial features or later phases were implemented.

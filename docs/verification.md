> Historical Phase 0 baseline. Current results: [Phase 1 verification](phase-1-verification.md).

# Verification record

Date: 2026-10-29. Checkout: /Users/kribeshthapa/Developer/MatchFlow, HEAD d9bf566, Node v22.23.3, npm 10.9.9, Prisma 6.19.3, local PostgreSQL 17. package.json/package-lock.json were already modified before the audit and were preserved. Results describe this exact working environment, not a clean CI install.

| Check                                              | Actual result                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| npm run build                                      | FAIL, exit 1. Prisma generation succeeded; frontend tsc failed TS2688 before server build/Vite bundling                |
| Frontend `tsc -b`                                  | FAIL: 23 missing type definition entries from empty duplicate-looking node_modules/@types directories with ` 2` suffix |
| Backend `tsc -p server/tsconfig.json --noEmit`     | PASS, exit 0; strict backend config also includes tests and seed                                                       |
| npm test, first attempt                            | FAIL: Prisma migration engine could not reach the stopped local database                                               |
| npm run db:local                                   | PASS: existing project PostgreSQL started; no reset or seed                                                            |
| npm test, rerun                                    | PASS: 5/5 tests, no pending migration, approximately 1.87 seconds test-run duration                                    |
| npm run lint                                       | FAIL/unavailable: Missing script: lint; no configured lint gate                                                        |
| npm audit --json                                   | Seven affected packages: 2 critical, 3 high, 2 moderate; no packages changed                                           |
| npm audit --omit=dev --json                        | Five affected packages: 0 critical, 3 high, 2 moderate; includes Vite through retained dependency graph                |
| Focused audit probes                               | Reproduced F02, F03, F04 and F05; see findings                                                                         |
| Fresh browser/accessibility/load/deployment checks | NOT RUN; historical screenshots and earlier verification are not new evidence                                          |

The type-directory issue is observed installation contamination; source compilation after a clean install remains unverified. No npm ci, npm audit fix, dependency update or source workaround was applied.

## Existing test coverage

1. Accounts, teams/member lookup, event discovery, registration/review, a three-team BYE bracket, schedules, advancement and champion.
2. Authentication, role/ownership boundaries, request/header validation and basic confidential-field checks.
3. Simultaneous registrations competing for limited capacity.
4. Wrong-game/overlapping player constraints, rejected/removed entries, unlock and manual registration.
5. Reflected seed ordering for entrant counts 2–64. This is not 63 end-to-end tournament lifecycles.

Missing regression coverage includes the reproduced dashboard/history/date/body-size defects, complete response access matrices, result-generation concurrency/rollback variants, auth failure recovery, browser loading/expired sessions, and production infrastructure behavior. Passing existing tests does not close these gaps.

## Dependency advisory record

Registry results are time-sensitive and count affected packages, including inherited advisories; they are not counts of independently exploitable production vulnerabilities. Full-tree affected packages: body-parser (high), concurrently (critical inherited), shell-quote (critical), ip-address (moderate), qs (moderate), vite (high), zod (high). Omit-dev excludes concurrently/shell-quote but retains the other five. Actual exploitability of each path was not established.

Primary advisory references returned by npm: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [shell-quote](https://github.com/advisories/GHSA-w7jw-789q-3m8p), [ip-address](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5), [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw), [Vite example](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Read the complete refreshed npm audit report when selecting remediation; more than one advisory can affect a package.

## Safety and reproducibility

Verified sanitized database targets were distinct loopback databases, matchflow_dev and matchflow_test on port 55432. Existing tests clear the test DB; focused probes create only test data. No development/production reset, migration change, feature code change or demo seed was run. Database remains available locally. Ignored probe script is .local/audit/probes.mjs; registry reports were stored in temporary local files. Findings above preserve outcomes without relying on these ephemeral files or exposing credentials.

Reproduce after inspecting the target environment: start local DB, run npm test, run npm run build, run backend no-emit type check, attempt configured lint, and obtain npm audit reports. Do not assume a `_test` suffix makes a remote database safe to destroy. A clean dependency installation and durable regression tests belong to the next approved phase.

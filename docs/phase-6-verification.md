# Phase 6 verification — 2026-11-02

Phase 6 is complete within the requested tournament engine and match operations scope. No later phase was started. The existing single-elimination path, original landing/logo/bubbles and previous routes remain. The user-approved policy is recorded in ADR 0007.

## Actual checks

| Check                                    | Result                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Unit suite                               | 18 passed                                                                                     |
| Integration suite                        | 49 passed against guarded local matchflow_test                                                |
| Browser suite                            | 39 passed, Chromium desktop 1440×1000, tablet 768×1024, mobile 390×844                        |
| ESLint / Prettier                        | Passed                                                                                        |
| Strict frontend/backend TypeScript       | Passed                                                                                        |
| Production API/web build                 | Passed                                                                                        |
| Forward migration replay                 | Passed in disposable schema                                                                   |
| Dependency audit                         | 0 reported vulnerabilities                                                                    |
| Local development migration preservation | Three protected backups and identity/session/membership/event/roster/match comparisons passed |

Reproducible commands: npm run check, npm run test:migrations, npm run test:e2e and npm audit. Ignored diagnostic logs are in .local/phase6. Screenshots are in docs/screenshots/phase-6. No production data reset, production deployment or external provider setup was performed.

## Coverage and behavior

- Existing single elimination completes uneven fields of 2/3/5/8/17 entrants, with manual seed validation, automatic BYEs, idempotent generation, concurrent conflicting results and one champion.
- Existing double elimination, round robin and Swiss regressions remain. Double elimination retains conditional grand-final reset; Swiss uses no-repeat pairings and stored seeds. KDA/time and exact-tie playoffs remain tested.
- Groups complete 8/10/14-entrant simulations, with stage membership isolation, qualification and championship progression. Exact three-way qualification ties create played qualifiers before the main playoff.
- Leagues complete single/double round robins, configured points, permitted draws and decisive championship playoffs. A playoff cannot draw. Browser creation changes from group to league configuration without leaking irrelevant fields, confirms a draw and reads real standings.
- Native battle royale validates all lobby participants, unique contiguous placements, eliminated opponents/foreign IDs, round order, cumulative points, repeated command keys and tied absent leaders requiring an extra lobby. Browser creation, manual seeds and lobby confirmation use real APIs.
- Scheduling rejects known-participant overlap, predecessor/qualifier overlap, event-end overflow and concurrent conflicting writes. Assignment swaps retain entrants; played or reported brackets cannot reset.
- Proposals require participant authority and manager confirmation; stale versions are rejected. Forfeits/no-shows have null scores and no fabricated statistics; grace timing is enforced. Private review APIs test sessions, resource ownership, cross-user reads and CSRF.
- Completed head-to-head events across all six formats are corrected from a played root, affected dependencies are voided, and replay restores a champion. Battle correction invalidates later lobby results. Stale previews/concurrent corrections cannot both apply. Before-state result evidence remains available to the owner.
- Player/team histories exclude draws from losses, show battle lobby points separately and preserve private-event filtering.
- Browser rollback preview explicitly identifies a dependent completed final, clears its result/champion, applies the correction and verifies replay. Keyboard bracket zoom, score-confirmation cancellation/focus, original centered game dialog, account/team/private-link flows, axe checks and horizontal overflow checks pass across all three viewports.

## Limits and release gates

- Scores, KDA/durations, placements and eliminations are manually reported and organizer-confirmed. There is no automated game telemetry, official ruleset certification or anti-cheat integration.
- RR/Swiss/leagues: maximum 16 entrants. Other formats: maximum 64. Groups: 2/4/8 groups, 1/2 qualifiers, at most 16 entrants per group. Battle rounds: 1–32 configured rounds, with additional deciding lobbies if necessary. Exact top/qualification ties require play, not arbitrary seed champions.
- Schedule conflict protection is within an event; it does not book global venues or prevent the same player joining overlapping different events. Scheduled slots are 1–480 minutes.
- Reset is unplayed-only and rejects any existing report/dispute. First-round elimination swaps lock on any progression, including BYEs; use reset and manual seeds before play instead. Cancelled events remain terminal.
- Optional idempotency keys are caller-provided UUIDs. Repeating the same successful key returns the original response; a new intent needs a new key. Mutation integrity also holds without keys through state/transaction checks.
- History and command receipts currently remain with their event. Production retention, restore drills, monitoring, scale/load tests and independent security qualification are release work. No production-readiness claim is made.
- Chromium accessibility checks are not a WCAG certificate or full browser/device qualification. Native touch scrolling and reduced-motion handling are implemented; Safari/Firefox staging verification remains a release gate.
- Previously approved SMTP/Google/S3 provider configuration and live staging qualification remain deferred. Free entry only; no payments or later-phase notification/administration/tenant features were introduced.

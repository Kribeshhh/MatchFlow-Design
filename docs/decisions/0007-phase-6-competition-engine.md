# ADR 0007 — Competition engines and reviewed corrections

Accepted by the user for Phase 6; implementation verification is tracked separately in phase-6-verification.md. Supersedes Phase 5's immutable-result and native battle-royale deferrals. It does not authorize another product phase.

## Decisions

Keep the existing single-elimination progression and regression coverage. Dispatch double elimination, round robin, Swiss, groups, leagues and battle royale through focused domain modules in the existing transaction boundary. Store stage participants and seed order; manual seeds must be a permutation of approved entrants, random seeds use Node's cryptographic random integer implementation. BYEs are never played results.

The user approved round-robin groups advancing to single-elimination playoffs, and single/double round-robin leagues with configurable win/draw/loss points. Groups have 2, 4 or 8 groups and 1 or 2 qualifiers each; every actual group must have more entrants than qualifying places and at most 16. Leagues/RR/Swiss have at most 16 entrants; other formats at most 64. Group seeding snakes across groups. A qualification tie creates a played qualifier for the remaining places. League draws are allowed only when explicitly enabled, in the main stage, with SCORE scoring. Playoffs remain decisive.

Preserve the approved head-to-head tie rules: wins (plus Swiss bye credit), Swiss opponent strength, score difference, aggregate KDA, faster average timed wins, then a deciding playoff. League points replace wins as the first criterion; group ties use the round-robin criteria. Forfeits and no-shows award a win without invented scores, KDA or duration. They do not count as timed wins. No-show grace is configurable from 0–120 minutes, default 15.

Battle royale has lobby rounds and entrant result rows, not artificial head-to-head matches. The user requires explicit organizer configuration of round count, placement points, elimination multiplier and ordered tie-breakers. Unlisted placements earn zero. Tie-breakers are distinct and finish with last-round placement; if tied leaders both did not start, a further deciding lobby includes only those leaders. All scheduled rounds contribute to cumulative points, including deciding lobbies. Each round submits every assigned participant exactly once; present placements must be contiguous and unique. At least one participant must be present. No-show rows have no placement and zero eliminations. This is an organizer-configured rules engine, not a claim to implement an official PUBG/Free Fire ruleset or game telemetry.

## Correction policy approved by the user

Require an explicit rollback preview; void affected results and replay affected matches. Never overwrite a completed result through the normal result endpoint. A participant may dispute their completed match/lobby; an event manager may open a review. Pending player reports do not advance anything until an authorized manager confirms them. Disputed dependencies cannot receive new results until resolved.

A preview identifies affected matches/lobbies, completed-result count and champion invalidation. Its SHA-256 fingerprint covers the event engine version and current match/lobby state. Apply requires ownership, recent authentication, the unchanged preview fingerprint, a reason and `VOID_AND_REPLAY` acknowledgement. A serializable transaction retains before-state snapshots, voids affected results/reports/disputes, applies the corrected root result, clears the champion and recomputes progression. A stale preview returns 409. Unrelated matches retain results.

Dependency rules: elimination follows winner and loser paths; Swiss invalidates later rounds because pairings depend on standings; round robin/league retain independent scheduled opponents but invalidate deciding playoffs; group corrections invalidate that group's qualification playoff and the championship stage; battle corrections invalidate later lobby results. Generated dependent stages can be removed and regenerated; their historical snapshots remain in EngineHistory. A corrected champion may immediately be recomputed if no replay is needed.

## Scheduling and regeneration

Schedule slots are 1–480 minutes, default 60. Entire slots fit the event dates. Known participants cannot overlap in the same event; dependencies and qualifying stages must end before their dependent slot starts. Serializable retries protect concurrent scheduling writes. This does not reserve a participant across unrelated tournaments, or allocate venues globally.

First-round occupied slots can be swapped in elimination before any progression. Fields with BYEs have already progressed; reset an unplayed bracket and use manual seeding instead. Reset requires no results, reports or disputes, retains registration snapshots and records the previous bracket in history. Match format overrides are limited to pending played matches and supersede pending reports.

## Integrity and retention

Prisma FKs, unique stage seeds, unique lobby placements, result checks, serializable transactions and command receipts enforce integrity. Optional UUID Idempotency-Key receipts cover generation, confirmed results, reports, lobby results and corrections. A reused key with a different request is rejected. Reusing an old successful command returns its original response; it is not a fresh intent.

EngineHistory is owner-authorized competition evidence containing result snapshots and supplied review reasons. It is distinct from security AuditEvent, whose metadata remains identifiers only. No credentials, tokens or request headers belong in either. History pagination retains access to older evidence. Physical user deletion is not introduced; existing anonymization retains historical relationships.

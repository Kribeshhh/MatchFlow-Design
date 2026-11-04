# 0001 — Existing application audit baseline

Date: 2026-10-29. Status: accepted scope constraints, directly specified by the user.

## Context

MatchFlow has an existing designed landing page and a PostgreSQL-backed MVP. The user wants a real production platform while preserving the design, beginning with an evidence-based audit rather than new features or a rebuild.

## Decision

Keep the repository, established visual identity and working implementation. This phase changes development rules and documentation only; test/probe execution is allowed to establish evidence. Record completed, partial, missing and risky behavior honestly. Plan incremental implementation phases and stop after the audit for the user's next instruction.

## Consequences

No framework replacement, database migration, dependency remediation, hosting selection or new product functionality is performed now. Source-only findings are distinguished from reproduced behavior. The old MVP guide is historical and superseded for current verification/security claims. Build failures and defects remain visible, not silently repaired or declared production-ready.

## Verification

See ../verification.md for actual command outcomes and ../audit-findings.md for confirmed defects. Later decisions must document the authority for any major product or architecture choice.

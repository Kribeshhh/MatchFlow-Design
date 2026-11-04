# Current project status — Phase 12

The existing platform now includes Phases 1–11, with release configuration and local qualification in Phase 12. The original search-first MatchFlow design is preserved. See [current architecture](architecture.md), [release results](phase-12-verification.md) and [launch checklist](launch-checklist.md). No cloud deployment or unrestricted production-readiness claim is made. The historical audit below describes the original baseline.

# Project overview

Current implementation: Phase 9 developer API, alongside Phases 1–8. See [Phase 9 verification](phase-9-verification.md) and [developer API guide](developer-api.md). Earlier phase sections are historical evidence.

Current implementation: Phase 8. Earlier phase sections are historical context. See [Phase 8 verification](phase-8-verification.md) and ADR 0009 for current organization scope and release gates.
Audit baseline: 2026-10-29, commit d9bf566, existing uncommitted package.json/package-lock.json changes preserved. The working checkout is /Users/kribeshthapa/Developer/MatchFlow; the earlier Desktop path no longer exists on this machine.

MatchFlow's vision covers players, reusable teams, organizers, communities, tournament operations, real-time communication, administration, analytics, developer access, and branded portals. The current implementation serves a narrower scope: player/organizer accounts, captain-managed teams, event discovery and entry review, and a database-backed single-elimination lifecycle. It supports six game identifiers but only one competition engine. Phase 1 adds a minimal organization relation, without community/staff roles or tenant isolation.

The visual identity is an existing product asset: dark green surfaces, acid-lime accents, condensed display typography, centered search/logo, interactive floating game bubbles, and a centered information dialog. Preserve it while replacing prototype content with authentic data in a separately requested phase.

## Evidence boundaries

Working means exercised by the existing tests or focused audit probes, where specified in the inventory. Source-present means code exists but was not comprehensively verified. The audit inspected tracked application, API, domain, validation, schema/migration, seed, scripts, tests, configuration, assets and existing documentation. Historical screenshots are design references, not fresh browser verification. No production deployment, provider console, backup restore, load test, or accessibility certification was performed.

The repository is a viable MVP foundation, not a completed production platform. Phase 1 restores reproducible verification and fixes the confirmed dashboard/history/date/body-size defects while retaining the product scope. See the [inventory](feature-inventory.md), [findings](audit-findings.md), and [phased plan](progress-tracker.md).

Current structure and results: [architecture](architecture.md), [file map](file-responsibility-map.md), [Phase 1 verification](phase-1-verification.md).

## Phase 2 status (2026-10-30)

Identity/account flows and resource authorization now extend the preserved application. Player and organizer capabilities coexist; SMTP and Google integrations await provider credentials and staging verification. Anonymizing deletion retains tournament history as approved. See phase-2-verification.md and security-model.md for actual evidence and limitations. This is not a production launch or implementation of later phases.

## Phase 3 status

The user-approved Phase 3 is UI/UX refinement, replacing the previously proposed competition-operations scope. It preserves the landing identity, adds reusable accessible/responsive components and screens, real search and guided publication, and explicit unavailable states for deferred capabilities. No schema migration or new competition rules were introduced.

## Phase 4 status

Player identity/privacy, accepted reusable team membership, permissions/ownership, starter snapshots and explicit deadline-bound roster review are implemented. Safe S3-compatible avatar/logo storage is integrated with provider configuration intentionally deferred. Existing design remains. See phase-4-verification.md; no production deployment or later-phase feature work is implied.

## Current Phase 5 scope

Tournament discovery/creation/lifecycle, private share links, individual and reusable-team registration, waitlists/check-in, organizer operations and single/double elimination, round robin and Swiss are implemented in the existing architecture. RR/Swiss collect actual organizer-entered KDA/duration and can create tied-leader playoffs. See ADR 0006 for bounded rules and phase-5-verification.md for evidence. This supersedes earlier single-format scope descriptions, not historical audit evidence. No production readiness certification or later roadmap phase is implied.

Phase 6 extends the existing tournament engine to group/playoff, league and native battle-royale events, with configured rules, seed controls, scheduling, participant result proposals and reviewed corrections. It preserves the original landing identity and four previous formats. Competition outcomes are manually reported and organizer-confirmed; no game-provider integration is implied. Refer to ADR 0007 and Phase 6 verification for policies and evidence.

## Phase 7 scope

Live tournament signals and an actual notification center now extend the existing design and modular monolith. PostgreSQL remains authoritative for revisions, event capture and durable jobs; Socket.IO carries authorized invalidation signals. Important email defaults on with user preferences; SMTP provider configuration remains deferred. See ADR 0008 and Phase 7 verification. Stop after Phase 7.

## Phase 8 scope

Organization workspaces now support schools, clubs, communities and operators with accepted staff invitations, scoped permissions, reusable branding, public profiles, multiple organization-owned events and database-backed analytics/exports. The user approved hierarchical roles, approved/submitted conversion and email invitations for new users. Existing stack and MatchFlow design remain. See ADR 0009 and Phase 8 verification. Stop after Phase 8; no later roadmap work is implied.

## Phase 10 — branded portals

Phase 10 adds opt-in organization-branded public portals, scoped tournament browsing, safe theme configuration and owner-managed domain claims. Cloudflare for SaaS integration is implemented; live provider configuration and DNS/TLS qualification are deferred by user choice. Account actions stay on canonical MatchFlow. See ADR 0011 and phase-10-verification.md. No later phase is authorized.

## Phase 11 — administration and responsible operations

Phase 11 adds server-authorized staff administration, mandatory TOTP, moderation/support cases, account/content enforcement, ownership review, real operations/API summaries, narrowly scoped result correction, self-service exports and retention controls. Existing stack, landing identity and tenant boundaries remain. See ADR 0012, operations-runbook.md and privacy-retention.md. Production operational qualification remains separate.

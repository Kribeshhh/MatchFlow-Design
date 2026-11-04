# 0002 — Incremental modular monolith

Date: 2026-10-29. Status: accepted implementation choice within the user's Phase 1 scope.

## Context and decision

Move the existing SPA/API/shared contracts into apps/web, apps/api and packages/shared. Retain one root installation and lockfile, with root-owned Prisma, tests and infra. Keep the technology stack and route contracts. Split HTTP transport, policies/domain, use-case services and owned repositories without generic CRUD layers or a framework rewrite. Small route handlers are the controllers; shared schemas are organized by owning capability.

Keep reusable UI inside the only web consumer. Record future module boundaries without fake endpoints. Add stage/result/audit persistence and a minimal optional organization relation; do not implement staff roles, tenant isolation or new competition rules. Preserve legacy score fields with transactional dual writes and additive backfill.

## Alternatives and consequences

Npm workspace packages, packages/ui, independent service deployment and a general DI/repository framework were not needed for the current single application. Relative imports and a single compiled API tree are more compatible with the existing code. If a second consumer or independent deployment emerges, review package boundaries then. Schema additions require a coordinated writer migration and explicit rollback planning.

The user explicitly requested safe structure adjustment, database foundation and security/quality work. This record does not approve later product choices: identity provider, organizer verification, invitations, notification channels, tenancy or hosting remain open.

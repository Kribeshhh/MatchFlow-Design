# Decision register

Record architecture/product decisions before implementing their consequences. Each record includes status (proposed/accepted/superseded), context, options, decision authority, consequences and verification. A proposed roadmap is not approval.

- [0001 — Preserve the existing application and separate audit from implementation](0001-audit-baseline.md): accepted constraints from the user's audit request.

Identity provider, organizer/consent policy, response visibility, formats, tenancy, hosting, notification delivery and custom-domain architecture are open. Do not invent accepted decisions for them.

- [0002 — Phase 1 modular monolith](0002-phase-1-modular-monolith.md): accepted incremental structure and additive migration decisions.

- [0003 — Identity](0003-phase-2-identity.md): approved SMTP/Google integration and anonymizing lifecycle.
- [0004 — Interface](0004-phase-3-interface.md): preserve/refine existing brand and reusable UI.
- [0005 — Players, teams and media](0005-phase-4-teams.md): accepted consent, snapshot/privacy policies and deferred S3 configuration; supersedes earlier open consent/profile/media questions for Phase 4.

- [0006 — Tournament operations and formats](0006-phase-5-tournaments.md): approved secret links, automatic waitlists, four engines and KDA/time/playoff tie-breaks. Supersedes earlier open format/private-access questions.

- [0007 — Phase 6 competition engines and reviewed corrections](0007-phase-6-competition-engine.md): user-approved formats, settings, schedules, tie-breaking and rollback/replay policy.

- [0009 — Phase 8 organization workspaces](0009-phase-8-organizer-workspaces.md): approved staff hierarchy, verified invitation consent, legacy access preservation, scoped analytics and exports.

- [0010 — Phase 9 developer API](0010-phase-9-developer-api.md): approved announcement/scheduling scope, owner/admin management, selected tournaments and minimal signed webhooks; reuses PostgreSQL queue.

- [0011 — Branded portals](0011-phase-10-tenant-portals.md): verified Cloudflare tenancy and canonical account boundaries.
- [0012 — Platform administration](0012-phase-11-administration.md): approved staff TOTP, moderation permissions and retention/legal holds.

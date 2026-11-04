# ADR 0004 — Refine the existing MatchFlow interface

Accepted 2026-10-30 within the user's explicit Phase 3 UI/UX scope. This supersedes the earlier proposed Phase 3 competition-operations roadmap; no new tournament format or result-correction policy is authorized.

Keep the existing landing composition, vector logo/game artwork, local fonts and palette. Refine the product using a shared CSS token layer and small React primitives inside apps/web, retaining the existing stack and routes. Lazy-load route views and keep motion optional. Use native forms, select controls and dialogs rather than a new UI framework.

Public landing search now opens actual tournament discovery. Existing illustrative tournament cards and workspace previews remain clearly labeled fictional examples; fabricated aggregate live activity is removed. Missing notifications, self-service organizations, moderation cases and league standings are honest unavailable experiences. Do not invent backend activity to fill screens.

The only new API is an authenticated organization management-list projection (id, name, ownerId), filtered to organizations the current user owns or manages as OWNER/ADMIN. This supplies the existing Phase 2 membership view without exposing unrelated organizations. No database migration, tenant model, invitation flow or admin permission change is introduced.

Existing irreversible actions use a reusable native confirmation dialog. A player/organizer view switch uses the existing account profile preference endpoint and existing dashboard policies. Wizard publication uses the existing tournament endpoint and validation; it does not claim draft persistence.

Verification includes responsive browser flows, automated accessibility rules, API permission regression tests, screenshots, strict types, lint and build. These checks do not replace release accessibility, performance, security or provider qualification.

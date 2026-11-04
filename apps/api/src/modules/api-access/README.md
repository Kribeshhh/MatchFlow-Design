# Developer access — Phase 9

- routes.ts: session/CSRF management transport and isolated v1 Bearer/public transport
- management.ts / policy.ts: organization authority, credential lifecycle, current resource grants
- commands.ts: scoped transactional/idempotent announcements and scheduling
- resources.ts / response-contracts.ts: explicit bounded read projections and documented DTOs
- openapi.ts: OpenAPI 3.1 specification served at /api/v1/openapi.json
- webhook-secrets.ts: standard AEAD encryption of receiver signing secrets
- webhook-transport.ts: public DNS validation, pinned HTTPS, redirect refusal and network bounds
- webhooks.ts: minimal outbox dispatch, durable jobs, authorization recheck and signed delivery

See docs/decisions/0010-phase-9-developer-api.md and docs/developer-api.md. No user impersonation, new result engine, Redis or alternative queue.

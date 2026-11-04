# MatchFlow developer API v1

Interactive documentation: `/developers`. Machine-readable OpenAPI 3.1: `/api/v1/openapi.json`. Integration management: Organizations → select workspace → Developers (owner/admin only). See ADR 0010 for security and bounded behavior.

## Authentication and resources

Send `Authorization: Bearer <credential>` from your server. Do not put credentials in a browser bundle, query string or localStorage. Generate a key with an explicit expiry, save it once and rotate/revoke through the workspace. All credential management mutations require recent authentication. Cookie sessions never authenticate v1 private operations.

| Path after /api/v1              | Read scope         | Result                                                               |
| ------------------------------- | ------------------ | -------------------------------------------------------------------- |
| /tournaments                    | tournaments:read   | Selected organization events                                         |
| /tournaments/{id}               | tournaments:read   | Event rules, dates, visibility and competition metadata              |
| /organization                   | tournaments:read   | Integration's organization profile, no staff directory               |
| /tournaments/{id}/teams         | tournaments:read   | Approved participant team ID/name/game/region                        |
| /tournaments/{id}/announcements | tournaments:read   | Escaped/plain-text publication content                               |
| /tournaments/{id}/registrations | registrations:read | Status, team ID and timestamps; no roster/account PII                |
| /tournaments/{id}/matches       | matches:read       | Head-to-head match cards and versions                                |
| /tournaments/{id}/bracket       | matches:read       | Same paged matches with dependency/source fields                     |
| /tournaments/{id}/schedule      | matches:read       | Scheduled head-to-head matches                                       |
| /tournaments/{id}/results       | matches:read       | Completed played/administrative head-to-head results, excluding BYEs |
| /tournaments/{id}/rounds        | matches:read       | Battle lobbies, schedules and placement/elimination results          |
| /tournaments/{id}/standings     | matches:read       | Existing scoring-engine ranks, or elimination champion               |

Prefix the tournament paths with `/public` for published public reads, except registrations (privileged only). `/public/organizations` lists public-profile organizers. These reads allow credential-free cross-origin browser access; cookies/Bearer keys do not broaden their visibility. Use private APIs server-to-server. Full player profiles/rosters/emails, staff directories, invitation data and internal audit evidence are deliberately outside v1.

Lists return `{data: [...], nextCursor: string | null}`. Pass `after=nextCursor` to continue. IDs order pagination, not chronological time. Limit defaults to 25, max 50. Standings are complete, competition-bounded and return nextCursor=null. Follow all pages for a complete bracket/schedule. Match dependencies identify source match and winner/loser outcome; battle rounds use their native collection. Unknown query fields are rejected.

## Writes

Only the following writes are supported. All require the relevant scope, current selected-event grant and `Idempotency-Key` (8–100 alphanumeric/underscore/hyphen characters).

- POST `/tournaments/{id}/announcements`: scope announcements:write; `{title,body}`. Returns 201 and the saved announcement.
- PUT `/tournaments/{id}/matches/{matchId}/schedule`: scope schedules:write; `{scheduledAt,venue,slotMinutes,expectedVersion}`. UTC ISO timestamp; duration 1–480 minutes (default 60); expectedVersion from a current match read.
- PUT `/tournaments/{id}/rounds/{roundId}/schedule`: same fields/scope, native battle scheduling rules.

Use the same key to retry the exact request. A key with different content returns 409. Read access, credential validity and grants are rechecked before returning a receipt. Keys/receipts persist; do not reuse keys across distinct commands. Concurrent version changes, completed matches, date bounds and overlapping/dependency slots remain enforced by the original domain rules. No developer result recording, approval, roster mutation or tournament creation endpoint is exposed.

## Errors and limits

Errors return `{error,requestId}` and validation errors may add issues. 400 invalid input; 401 invalid/expired/revoked credential; 403 insufficient scope; 404 unavailable/out-of-scope resource; 409 conflict; 413 JSON exceeds 64 KB; 429 rate limit; 500/503 operational failure. Preserve requestId for support; never log your credential.

Shared limits are 120 requests/minute per integration, 600 per organization and 300 per source IP on v1, plus platform IP protection. Credential rotation does not reset the integration limit. Rate-limited responses carry Retry-After; retry with jitter. Invalid credentials are still subject to source limits. Production reverse-proxy trust/IP configuration must be reviewed rather than blindly enabled.

## Webhooks

Configure public HTTPS/443 endpoints with no URL credentials/query/fragment. Local/private/mixed DNS, metadata, reserved and mapped addresses are rejected. Redirects are never followed. Events: registration.approved, match.scheduled, match.completed, bracket.updated, tournament.completed, announcement.created; tournament.created is captured in the durable event stream. Payloads include `{id,type,tournamentId,resourceId,timestamp,version}` only. Match events also describe native battle rounds; inspect /rounds if the ID is not a head-to-head match.

Headers: webhook-id (stable delivery ID), webhook-timestamp (fresh Unix seconds), webhook-signature (Standard Webhooks v1). Verify the raw request bytes before parsing/processing:

```js
import { Webhook } from "standardwebhooks";
const event = new Webhook(process.env.MATCHFLOW_WEBHOOK_SECRET).verify(rawBody, request.headers);
// Transactionally claim request.headers['webhook-id'] with a UNIQUE constraint,
// process the event and commit together. Already processed: acknowledge 2xx.
// Store decimal versions without precision loss; refetch current API state.
```

Verification rejects tampered IDs/body/signatures and timestamps outside the library's five-minute tolerance. Receivers must separately persist deduplication IDs: a timestamp check alone does not prevent replay within that window. Use a unique database constraint and commit side effects with the receipt, or use a transactional inbox. Keep receipts at least as long as delivery history/manual retries remain permitted.

Five exponential retries follow failed network/non-2xx delivery. Acknowledgement/commit crashes can resend, and separate jobs can arrive out of order. Idempotency IDs stay fixed; signatures/timestamps refresh. Track versions per tournament; versions may skip. Do not overwrite fresh state from an old event. Exhausted deliveries become DEAD and can be retried by an owner/admin. Disabled endpoints, revoked tournament grants and disabled integrations suppress queued delivery. An already in-flight network request cannot be recalled.

## Versioning and operations

v1 adds fields compatibly; consumers ignore unknown fields. Breaking changes require a new major version. Any retirement must provide at least 90 days' documentation notice and Deprecation/Sunset response headers; v1 has no retirement scheduled. There is no silent route migration.

See deployment.md for encryption key configuration, shared workers, dead-letter status, storage growth/retention and staging receiver qualification. The new interface preserves MatchFlow's existing visual identity. Current integration caps and latest-100 workspace tournament selection are documented in ADR 0010.

`tournament.created` has an explicit initial-sync behavior for selected-event scopes: granting an event or creating a subscription replays its original captured creation event once per endpoint/event. Its original timestamp/version are retained, so treat it as potentially older than other updates. Events created before Phase 9 have no captured creation event and are discovered with the read API. Repeated grant edits do not duplicate the delivery.

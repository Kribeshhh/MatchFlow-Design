# Security model — Phase 2

Current implementation: Phase 9 developer API, alongside Phases 1–8. See [Phase 9 verification](phase-9-verification.md) and [developer API guide](developer-api.md). Earlier phase sections are historical evidence.

Current implementation: Phase 8. Earlier phase sections are historical context. See [Phase 8 verification](phase-8-verification.md) and ADR 0009 for current organization scope and release gates.
The application has locally tested identity and authorization controls, not a production security certification. See [identity decision](decisions/0003-phase-2-identity.md) and [verification](phase-2-verification.md).

## Identity and sessions

New passwords use Argon2id (19 MiB, t=2, p=1). Legacy scrypt verifies and upgrades on successful login; malformed hashes fail safely. Unknown-user login performs dummy hashing. Random session tokens are SHA-256 hashed in PostgreSQL and never stored in localStorage. Cookies are HttpOnly, SameSite=Lax, Path=/, Secure in production; sessions expire after seven days and are revocable. Login, registration and OAuth completion rotate the browser session. Migration preserves existing session digests and expiry; their authenticatedAt remains null until reauthentication.

Recent authentication (five minutes) gates sensitive actions: password change, device revocation, linking/unlinking, deactivation/deletion and privileged role changes. Password change/reset revokes every session and outstanding recovery/link flow. Active sessions expose public IDs/timestamps only, and revocation queries bind the owner. Google-only users can reauthenticate by signing out and signing in with Google again. No passwords or provider tokens are returned to the browser.

## Email and OAuth

Verification, recovery and reactivation links use cryptographically random tokens; only SHA-256 hashes persist. Verification expires in 24 hours; reset/reactivation in 30 minutes. Redemption is transactional, single-use and purpose-bound; concurrent redemption has one winner. Links carry tokens in fragments, which the browser removes, and require an explicit POST. Recovery returns generic eligibility messages with a minimum response delay; this is not a claim of perfect timing indistinguishability. SMTP availability is public configuration status, not account existence. Registration remains successful if verification issuance fails; the user can request another link.

Google uses maintained openid-client with explicit signature validation, issuer/audience/expiry/nonce/state checks and PKCE S256. A single-use 10-minute flow binds a separate browser cookie; linking additionally binds the live, recently authenticated session and verified account. Matching email never authorizes linking. Provider access/refresh tokens are not persisted. Errors redirect to a fixed generic notice, never echo callback tokens or provider errors.

## Authorization

PLAYER and ORGANIZER coexist; role selects dashboard preference. Captains manage their own teams. Event ownership, owning-organization owner/admin membership and explicit tournament grants authorize management; delegated managers cannot delegate again. Platform moderator/admin checks require verified email; administrator changes require recent authentication and recheck actor privileges within the transaction. Only the operator CLI bootstraps verified administrators. Last-administrator removal/deactivation/deletion is blocked.

New users require verified email for competition mutations. Migrated users retain prior access through verificationRequired=false while emailVerifiedAt remains null. Profile updates accept only display name, bio and default dashboard, never platform roles. All browser guards are UX only; APIs enforce ownership and membership. Historical public rosters use saved snapshots; private registration metadata is limited to participants and authorized managers. Organization staff policies do not constitute complete white-label tenant isolation.

## Account lifecycle

Deactivation revokes sessions/recovery/link flows and blocks login; email reactivation is available when SMTP is configured. Deletion anonymizes username/email/display name/bio/password, removes OAuth links and permissions, clears sessions/tokens, scrubs roster snapshot usernames and records an anonymization event atomically. Historical IDs, tournament results, captain/owner relationships and authored team/event content remain. This protects referential integrity but requires a separate retention and management-transfer policy before public launch.

## HTTP, abuse protection and operations

Validated environment, exact CORS allowlist, HTTPS production origins, Helmet, 64 KB JSON limit, no-store responses, request IDs and generic errors remain. Cookie mutations require X-MatchFlow plus allowed Origin when present; custom-header preflight and SameSite protect browser requests. Non-browser clients without Origin remain supported. OAuth callback is GET and separately state/browser-bound. No arbitrary proxy trust is enabled.

IP limiters run before parsing. Database atomic throttles add shared per-identity enforcement for login, reauthentication and recovery (hashed identity keys). Login allows 20 attempts per 15 minutes; recovery five per hour per purpose/account. IP enforcement is still process-local and proxy configuration is a deployment gate. Expired sessions, tokens, flows and throttle rows are removed with auth:cleanup.

Pino logs route templates/status/duration/request IDs with secret redaction; raw URLs, bodies, callback codes and exceptions are not serialized. Identity and competition audits use fixed actions and identifiers only. SMTP errors use fixed messages. Shutdown drains mail and disconnects Prisma within ten seconds. SMTP has no durable outbox/retry queue yet.

## Remaining release work

Configure and verify SMTP and Google in staging. MFA is architecture only. Full tenant isolation, team consent/invitations, organizer vetting, immutable external audit storage/retention, proxy deployment, monitoring/alerts, backup restore drills, load tests and independent security testing remain. No live provider validation or public deployment has occurred. Preserve guarded local-only seeding and never use test/reset commands on production.

## Phase 3 interface boundary

New organization listing uses server-side ownership/OWNER/ADMIN membership filtering and an explicit identifier/name projection. Admin audit views continue to require verified platform authority. Client navigation never grants permissions. All descriptions, rules, names and audit values remain React-escaped text. Destructive confirmations improve UX but do not replace server policy or recent-auth requirements. No new secret storage, HTML injection, authentication changes or database migration were introduced.

## Phase 4 identity, consent and media

Invitations never activate members before recipient acceptance. Current account and inviter authority are rechecked transactionally. Managers cannot self-promote, alter other managers, remove captain or transfer ownership. Captain transfer requires recent authentication on both sides, current membership and expiry checks; races have one winner. Deactivation/deletion cancels pending invitations/transfers and clears new profile data/avatars/proposals on anonymization.

Reusable team changes preserve tournament snapshots. Proposal/review checks are event-bound, team-bound, deadline-bound and repeated against current accepted starters and all other active event rosters. Only authorized organizers approve. Public detail excludes pending proposal/transfer metadata. Public profiles explicitly project permitted fields; hiding history also hides aggregate statistics. Existing public tournament records remain published. New users default public; existing self-only content remains private until opt-in. HTTPS social links are validated and rendered as escaped text/safe external links.

Media requires session/CSRF, validated target ownership, per-account upload throttles, 2 MB request bounds, actual PNG/JPEG/WebP signatures, full Sharp decode, 16 MP/one-frame limits and metadata-free WebP re-encoding. SVG/GIF and remote URLs/paths are rejected. Opaque S3 keys are server-created; buckets must be private. API reads recheck linkage/privacy every time with no-store and nosniff. Old avatars and deleted private profiles become inaccessible immediately; scheduled cleanup removes unreferenced objects after 24 hours. Failed uploads remain tracked for cleanup. Account deletion retains team-owned branding/history rather than deleting team records.

S3 credentials are environment-only/redacted. Missing configuration and provider errors return safe messages; no production mock/fallback. Actual SDK signing is tested against loopback, image/access flows against an isolated test adapter. Live bucket permissions, encryption, retention/versioned-object cleanup and provider smoke tests remain release gates. Tests exclude S3 credentials and disable fallback .env loading in integration/browser subprocesses.

The final dependency audit flagged development-only minimatch GHSA-g3hv-75wg-m249; an exact 11.0.1 override replaces 10.2.6 without downgrading ESLint, with lint/build/tests reverified. Remove/revisit this override after upstream packages adopt the patched major. The established account lifecycle still retains ownership tombstones; users are advised to transfer captain ownership before deactivation/deletion, and automatic abandoned-team reassignment is not implemented.

## Phase 5 event boundaries

Private/draft discovery is denied server-side. Detail, organizer actions, media covers, participant history and exports use current event visibility/ownership/snapshot policy. Share links contain 256-bit random secrets; only hashes persist. Fragment redemption is rate-limited and issues an HttpOnly/SameSite cookie with production Secure. Rotation revokes link-only access; submitted participants retain historical access. Share secrets never grant organizer authority. The SPA strips the fragment and does not store it in browser storage. CSV exports omit emails and escape formula prefixes. Announcements/rules remain React text, not HTML.

Serializable registration transactions enforce capacity and duplicate participants across active/waitlisted snapshots. Automatic promotion repeats eligibility and preserves snapshot identity. Individual identity comes only from the session; internal entrant records are excluded from reusable-team mutation/read routes. Competition writes close on cancellation/completion; check-in has explicit deadlines and authority checks. KDA/time are bounded organizer-submitted data, not authenticated game telemetry. Review ADR 0006 and final verification for residual release limitations.

## Phase 6 result integrity

See ADR 0007. Every engine command rechecks event ownership or saved-roster participant authority server-side. Private event history and correction previews are owner-only; players read only their own proposals/disputes. Secret links never grant result-management authority. Dispute creation is account-throttled. Pending proposals bind to a match version, and format/assignment changes supersede them. Completed results can only change through a recent-authenticated correction against a fresh fingerprint and explicit rollback acknowledgement.

Results, progress, champion changes, evidence snapshots and command receipts commit together using the existing serializable retry wrapper. Unique lobby placements, stage seeds, outcome checks and participant-coverage checks reject invalid progress. Scheduling uses the same transaction boundary for conflict checks. Unknown match IDs and cross-event resources do not bypass ownership. Normal result confirmation refuses open disputed dependencies. Correction before-state evidence remains after dependent matches are removed; security AuditEvent remains identifiers-only. Free-text reasons and descriptions use React text rendering, never raw HTML.

## Phase 7 live communication and notifications

ADR 0008 documents socket authentication, shared handshake/account throttles, per-connection bounds, private subscription revalidation and minimized payloads. Revoked sessions disconnect on polling; lost event access removes subscriptions and causes authorized HTTP re-fetch. Inbox reads/read mutations cannot target another user. SMTP delivery rechecks current account, verified email, event access and preferences; stale reminders are suppressed. Queue payloads contain opaque IDs and fixed error messages, not credentials/provider errors. Test subprocesses strip SMTP, Google and S3 provider configuration.

Tournament email now has durable retries; authentication mail remains immediate. A stable Message-ID does not eliminate SMTP's acceptance/commit crash window. Live SMTP, proxy configuration, load/security review, queue alerting and restore drills remain release requirements.

## Phase 8 organization isolation

Read ADR 0009. Workspace membership, administration and tournament authority are distinct policies. Cross-organization reads return unavailable; ordinary staff cannot fetch organization analytics/exports or grant themselves rights. Owners control administrators; admins cannot change/remove other admins. Invitation acceptance binds a verified active email, expiry, pending state and current issuer authority; IDs are not bearer credentials. Pending uniqueness and serializable transactions prevent duplicate membership/racing acceptance.

Organization creator identity alone grants no ongoing event authority. Legacy effective access is preserved by migration; removal clears current organization grants and pending invitations. Role changes clear explicit grants. Former creators cannot use public event detail to read pending entries or continue receiving organizer-only notifications. Public roster participation remains independently authorized by the established policy.

Invite labels preserve originally supplied input; resolving a username does not expose its private email in management listings. Queue payloads contain invitation IDs only. Delivery revalidates authority/status/expiry and retries real SMTP failures. Account anonymization clears matching invitation recipient data. CSV omits personal account data and escapes formula prefixes; exports are audited/throttled. Organization logos use existing image checks and current member/public visibility. No HTML injection, visitor tracking or platform-role bypass is introduced.

## Phase 9 developer API

See ADR 0010 and developer-api.md. API credential hashes, mandatory expiry/revocation, current integration scopes and event grants protect organization resources independently from cookies. Owners/admins manage with recent authentication and CSRF. Public projections omit private user data. Idempotency and optimistic versions protect approved writes. Shared rate limits and durable access-start records bound/audit requests. UTC throttle arithmetic fixes database-timezone ambiguity.

Webhook HMAC signing uses standardwebhooks; AES-256-GCM encrypts retrievable receiver secrets under an external master key. Public-only all-answer DNS validation, connection pinning, HTTPS/443, no redirects/proxy/query credentials and network bounds prevent common SSRF paths. Workers revalidate authorization. Receivers must verify timestamp/signature and persist deduplication IDs. Local verification does not qualify production egress, receiver integration, key operations, retention or independent security review.

## Phase 10 — branded portals

Custom domains require an authenticated edge header, exact active hostname binding, enabled portal, fresh DNS ownership/routing proof and active managed certificate. Host alone, forwarded headers and supplied organization IDs never confer authority. Only GET/HEAD public portal resources are exposed on tenant hosts, with no account cookies or sockets. Canonical account destinations come from APP_ORIGIN, not return URLs. Portal reads constrain organization and PUBLIC/non-DRAFT visibility, including nested results and images. Owner domain writes require recent authentication; unique active claims, leases and version fencing protect removal/reassignment. Failed cleanup retains the reservation. Pending challenges expire after seven days; expired claims remain reserved until owner removal. Validated contrast-safe colors, plain text and internal navigation prevent arbitrary code injection. See ADR 0011 for trust boundaries and deployment prerequisites.

## Phase 11 — administration and responsible operations

Phase 11 supersedes historical MFA/moderation limitations. Verified platform roles alone cannot use /admin: require enrolled staff factor and a session proof newer than 15 minutes. Sensitive services also recheck primary authentication within five minutes and current staff authority transactionally. OTPAuth validates a one-step TOTP window; accepted counters advance atomically, recovery codes are random/hash-only/single-use and attempts are shared-rate-limited. Factor encryption uses standard AES-256-GCM with user-bound additional data under a dedicated secret. Missing key fails closed. No setup secret is persisted in plaintext or browser storage. Suspension invalidates sessions/recovery flows; restoration never revives them. Case/version/ownership/content/result permissions remain server-side, with custom-host denial unchanged. See ADR 0012 and privacy-retention.md.

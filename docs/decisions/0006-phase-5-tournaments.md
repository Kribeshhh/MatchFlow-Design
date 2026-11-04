# ADR 0006 — Tournament operations, access and competition engines

Accepted 2026-11-01 for Phase 5. The user explicitly selected secret share-link access for private events, automatic FIFO waitlist promotion, and double elimination, round robin and Swiss in addition to existing single elimination. The user further selected standings tie-breaks using higher KDA, then faster wins, with a playoff if still tied.

Preserve the modular monolith, React/Express/Prisma stack, existing landing artwork and component system. No Redis, background queue, payment service or new production dependency is needed here.

## Access and registration

Private events never appear in discovery or public organizer listings. Authorized event managers and saved roster participants can view them. Anyone possessing the current secret link can redeem it for a seven-day HttpOnly, SameSite cookie, including anonymous viewers; registration still requires a verified account and the usual eligibility/ownership checks. The token is 32 random bytes, stored only as a SHA-256 digest. The URL uses a fragment, which the SPA removes before redemption; it does not enter HTTP URLs, referrers or browser localStorage. Rotation immediately invalidates prior link cookies. Existing saved participants retain access for their history, including withdrawn/rejected entries. Links confer no organizer permission. At most ten private-link cookies are retained per browser; older ones can be redeemed again.

Pending and approved entries reserve capacity. Waitlisted entries preserve their submitted snapshot but do not reserve capacity. A released place promotes the oldest currently eligible saved entry to PENDING organizer review, transactionally; promotion does not automatically approve it. Changed/ineligible snapshots stay queued with an explanation; the entrant can withdraw and resubmit before close. Promotion runs on place release, capacity edits, republishing and new submissions. No timer or background job is needed. Waitlist re-submissions reset their queue timestamp. Duplicate players are prohibited across pending, approved and waitlisted snapshots.

Individual entries use a server-owned internal Team adapter keyed by user/game to preserve the existing match/result foreign keys. The user ID always comes from authentication. These rows never appear as reusable teams and cannot be edited through team-management endpoints. Deletion anonymizes their labels. Existing reusable team relationships and snapshots remain intact.

## Lifecycle and editing

Drafts contain a fully validated configuration, saved from wizard review. Drafts are not discoverable. Publication uses PUBLISHED with time-derived upcoming/open/closed registration status; legacy direct create retains REGISTRATION compatibility. Check-in is optional and explicit, opens only between registration close and start, and requires approved entry authority. Events requiring check-in cannot start until the window ends and every approved entry is checked in. Organizers must remove no-shows before generation. Legacy events without check-in may still generate early with explicit UI confirmation.

Competition/eligibility/visibility rules freeze once any entry exists. Capacity cannot fall below reserved places. Pre-start postponement closes registration; edit the dates and republish to resume. Cancellation is terminal, retains records and blocks competition writes. Completed results remain immutable. Announcements are safely rendered plain text. CSV exports are organizer-authorized, omit email/private account data, and escape spreadsheet formula prefixes.

Free entry only: paid categories/payment collection remain unavailable, as requested only where supported. Region eligibility checks declared profile/team region; free-text requirements require organizer review. Prize text is informational, with no payout integration.

## Formats and statistics

- Single elimination: existing power-of-two seeded bracket and BYEs retained.
- Double elimination: winner and loser dependency DAG, explicit loser-bracket cross-pairing, empty-seed propagation, grand final and conditional final reset. A participant must lose twice to be eliminated. Supports 2–64 entries.
- Round robin: each opponent once, balanced rotating schedule, optional BYE for odd entry counts; 2–16 entries.
- Swiss: ceil(log2(N)) rounds, next round generated only when all current matches finish. Ranked exact no-rematch matching, with the lowest-ranked eligible player receiving an odd-field BYE, never twice. Bounded to 16 entries. Pairing order within equal standings uses registration seed for reproducibility, not to award a championship.
- SCORE accepts decisive integer totals. BO1/3/5 require the winner to reach 1/2/3 game wins and the loser to remain below that threshold. Game artwork does not imply native battle-royale/lobby support.

Round-robin/Swiss results require actual organizer-entered team totals for kills, deaths, assists and total series duration in seconds. Standings order: wins plus Swiss BYE credit; opponent strength (sum of opponents' win/BYE points, Swiss only); score difference; aggregate (kills + assists) / max(1, deaths); average duration of won matches. Ratios are compared using integer cross-products, not rounded display values. Round-robin BYEs are balanced across all entrants and do not change relative ranking. BYEs are excluded from played W/L, KDA and duration. Exact first-place ties automatically create a seeded single-elimination deciding playoff; those playoff results do not rewrite the league standings. The playoff winner is the champion. No game telemetry is claimed; organizers are responsible for accurate totals.

## Migration and verification

Two additive, transaction-wrapped migrations preserve identities, sessions, membership, saved rosters and legacy single-elimination rows. Match source FKs protect the double-elimination graph; match statistics are nullable for legacy results and have database range checks. New type/visibility/location defaults preserve old public team events. See phase-5-verification.md for actual checks, provider limitations and release gates.

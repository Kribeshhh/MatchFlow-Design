# ADR 0009 — Organization workspaces, staff consent and analytics

Accepted 2026-11-03 for Phase 8. Keep the existing modular monolith, visual identity, storage adapter and durable PostgreSQL job queue; no new dependency or infrastructure is introduced.

## Approved permission model

The user approved: owner controls administrators; administrators manage branding and staff; tournament managers manage all organization events; staff manage explicitly assigned events only. Every user may still play and organize personally. Platform roles do not bypass organization policies.

Organization.ownerId is authoritative ownership. ADMIN can edit profile/branding, invite/remove managers and staff, and assign accepted staff to organization events. Only the owner grants/changes/removes administrators. MANAGER can create/manage organization events and read organization analytics/export. MEMBER is labelled Staff and sees its assigned event workspace; it cannot read organization-wide analytics or invite staff. Accepted members may read the staff directory, containing usernames and roles, not account emails. All member roles can leave except the owner. No organization ownership-transfer/deletion workflow is introduced in this phase.

Personal events retain existing direct-owner and explicit-grant behavior. Organization events use current owner/admin/manager authority or a current membership plus explicit canManage event grant. Historical creator identity alone no longer authorizes management. Removing a member deletes their organization event grants and cancels pending invitations they issued or would receive. Role changes clear explicit grants and pending invitations issued by that member; administrators can deliberately reassign them afterward. Serializable transactions coordinate these operations with competition writes. Socket and HTTP policies share these rules.

Tournament organization is selected at creation and cannot be reassigned by editing. Existing organization event creators/grantees retain their previously effective access through a one-time legacy membership/assignment backfill. This preserves authority already granted; it does not fabricate historical invitation acceptance. New members always require acceptance. Public profiles are opt-in, and migration leaves existing organizations private. Public profiles show only public, non-draft events, never internal analytics or staff.

## Invitations, including new accounts

The user requested support for email invitations to new users. Administrators may enter an existing verified username or an email address. Invitations expire after seven days and do not confer access. A recipient must sign in with an active, verified matching email and explicitly accept. Knowing an invitation ID is insufficient. Only the recipient accepts/rejects; issuer authority is rechecked at acceptance. Cancellation, expiry, removal/demotion of inviter, and duplicate membership are enforced server-side. A partial unique index prevents concurrent pending invitations to the same organization/email.

The invitation API returns opaque IDs. Admin listings show only the originally entered recipient label, not a username lookup's private email. Recipient listings contain organization name/ID, offered role and expiry only. Invitation creation is throttled, and invitation/staff changes require recent authentication. Audit metadata contains fixed actions and identifiers, never email addresses.

The existing pg-boss worker owns an `organization-invitations` queue. Queue dispatch and the invitation's queued state commit atomically. SMTP rechecks expiry/status and issuer authority before sending; retry/dead-letter behavior matches Phase 7. Missing SMTP leaves mail pending and the UI explains this. Verified existing users can still accept through their workspace list. New users must independently register and verify their invited email; invite acceptance never bypasses verification. SMTP retains the documented acceptance/commit resend window. Anonymizing account deletion clears matching invitation recipient data; organization history and ownership tombstones remain.

## Analytics definitions

All metrics come from current database records, read in a serializable transaction after organization authorization. No visitor tracking is introduced. The user approved **approval conversion = currently approved entries / submitted entries in the selected period**. It is explicitly distinguished from visitor-to-registration conversion, which remains unavailable.

Lifetime totals cover organization tournaments, active phases, all registrations, pending approvals, distinct reusable teams with approved entries and completed tournaments. Period filters span 7–366 days (UI: 30/90/365). Registration series use UTC days. Attendance is checked-in / approved entries requiring check-in, for entries submitted in the period; upcoming check-ins may be outstanding. Zero denominators return null, not an invented zero rate. Game popularity counts events created in the period and their current registrations. Team trends compare approved entry counts in the current and immediately preceding equal-length periods, top 20. Counts reflect retained records/current statuses, not an immutable historical funnel or player telemetry.

History/progress lists the latest 100 events and generated non-BYE matches/lobby rounds; future Swiss/playoff rounds only enter the denominator when generated. Upcoming schedules combine head-to-head matches and battle-royale rounds, next ten. Recent activity shows the latest 30 organization/tournament/match audit actions. These limits are labelled in the UI. Lifetime totals and aggregate rates are not limited to displayed rows.

CSV export is authorized for owner/admin/manager, audited and throttled. It contains aggregates and team labels, never account emails, private rosters, invitation addresses, authentication or internal secrets. Every cell is quoted and spreadsheet formula prefixes are neutralized. Existing per-event participant export retains its current event authorization and privacy restrictions.

## Branding and operations

Organization logos reuse the validated PNG/JPEG/WebP → metadata-free WebP pipeline and private S3-compatible adapter. Only owner/admin can upload/remove; reads follow public-profile opt-in or current membership. Cleanup excludes attached organization logos. The user-configured provider remains deferred; no fake/local-storage fallback.

Sensitive changes are audited. Readiness, queue supervision, SMTP/S3 staging qualification, retention policy, restore/load tests and ownership succession remain release gates. The user requested stopping after Phase 8; developer APIs, white-label domains, billing and full moderation remain outside scope.

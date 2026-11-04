# Phase 8 verification — 2026-11-04

Scope: organization workspaces, profile/branding, accepted staff invitations (including new-user email), hierarchical roles, explicit event assignments, organization event creation, real analytics and authorized CSV exports. Preserve existing MatchFlow identity, personal organizer behavior, sessions and competition engines. Stop after Phase 8.

## Observed checks

- Baseline: the Phase 7 quality command passed before implementation.
- Full quality run: **20 unit and 64 integration tests passed**, along with lint, formatting, strict frontend/backend TypeScript and production build.
- Eight new organization integration scenarios cover cross-organization reads/writes/exports, private public-profile opt-in, verified email invitation consent/expiry/cancellation/concurrent acceptance, current issuer authority, role hierarchy, creator demotion/removal, unauthorized creation/grants, real metric values, CSV formula injection, private branding access/cleanup, SMTP retry/idempotence/suppression, removed-creator public-entry/notification privacy, and persisted queue retry delivery.
- Existing identity authorization tests now exercise invitation acceptance instead of the superseded direct membership-creation endpoint. Nonmember organization access deliberately returns 404. No access assertions were removed.
- Migration replay passed including a legacy organization creator fixture whose existing authority survives the membership/grant backfill. All three local migrations followed restricted backups and preservation comparisons for users, sessions, team memberships, event identities, saved rosters and played results. Working data was not reset.
- Dependency audit reported **zero vulnerabilities**. No new dependency or infrastructure service was introduced.
- The expanded browser suite initially passed all 45 existing scenarios. After correcting ambiguous new-test locators, 50 of 51 scenarios passed. The remaining mobile test identified a real four-pixel overflow from an absolutely positioned screen-reader action label. Positioning its button as the containing block fixed the layout; both focused mobile organization scenarios then passed, including axe and document-overflow assertions.

Final rerun: **51 of 51 browser tests passed** across desktop/tablet/mobile. Build, strict type checking, lint and formatting passed. Local web returned HTTP 200, API readiness returned status ok, and queue status inspection succeeded with the organization-invitations queue initialized.

## Browser evidence

Organization flows run at desktop, tablet and mobile sizes using real test-database APIs: create organization, opt into public profile, view actual empty analytics/null rates, export CSV, save settings, open public profile, preselect organization in the event wizard, invite staff, accept in a separate user context, assign a private event, and confirm removal/revoked access. Existing suites still cover complete tournament workflows and the preserved landing dialogs. Captures are retained in [screenshots/phase-8](screenshots/phase-8/README.md); they show disposable test fixtures, not production activity.

Ignored local logs under `.local/phase8/` include baseline.log, check.log, e2e.log, browser-mobile.log, replay.log, audit.log and preservation-*.log. Test runners guard a separate loopback test database and strip SMTP/Google/S3 credentials.

## Deliberate limits and release gates

Approval conversion means currently approved / submitted records, as approved by the user. There is no visitor funnel tracking. Analytics reflect retained current records/statuses, with explicit period and row bounds; no immutable historical funnel is claimed. Upcoming lists cap at ten, history at 100 events, team comparisons at 20 teams, and recent audit activity at 30 records. Optional document attachments and new communication channels were not introduced; staff use existing rules, schedules and announcements.

Owner succession/organization deletion, commercial tenancy, developer APIs and custom domains are later scope. Existing owner/account tombstone behavior remains. SMTP and S3 provider configuration/live staging tests remain deferred by prior user decisions. New-user email invitations require functioning SMTP for delivery and email verification; the interface explicitly reports missing configuration. Verified existing users can accept saved invitations from their workspace list. Queue/SMTP tests use isolated adapters; no real recipient mail was sent by tests. SMTP remains at-least-once across its acceptance/commit crash window.

Production deployment, restore/load drills, invitation/audit retention sign-off, independent security testing and full browser/screen-reader accessibility certification remain release gates. Local tests do not certify production readiness.

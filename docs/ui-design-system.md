# MatchFlow UI design system — Phase 3

Current implementation: Phase 9 developer API, alongside Phases 1–8. See [Phase 9 verification](phase-9-verification.md) and [developer API guide](developer-api.md). Earlier phase sections are historical evidence.

The established MatchFlow identity is retained: angular M mark, condensed editorial headings, local Barlow/Display/Mono fonts, dark charcoal, signal lime, centered search and interactive glass game bubbles. The application now shares a navigation shell, consistent hierarchy, panels and action states with that landing identity.

## References inspected

Source components and vector assets in App.tsx, Art.tsx, Universe.tsx, HeroSearch.tsx, Bracket.tsx and data.ts; existing preview/matchflow-search-hero.png and preview/mvp-completed-bracket.png; current browser renders before and after changes; supplied conversation images showing centered search/logo and the game-info dialog. Historical temporary recording paths were no longer present, so no claim is made to have replayed those recordings in this phase. The existing bubble animation/interaction code was inspected and preserved.

## Tokens and layout

Implementation: apps/web/src/mvp/design-system.css. Load after styles.css, hero.css and mvp.css. This is an incremental final styling layer; existing component classes remain valid.

| Token / rule                   | Value and use                                                  |
| ------------------------------ | -------------------------------------------------------------- |
| --background                   | #121612; primary canvas                                        |
| --surface                      | #171C17; panels, cards, input surrounds                        |
| --lime                         | #D3F45D; primary action, selection, focus and emphasis         |
| --olive                        | #465833; restrained structural accent                          |
| --amber                        | #B4774D; reserved warm accent, not low-contrast body text      |
| --paper                        | #E8E6D9; primary text                                          |
| --muted                        | #A5AE9D; secondary text on dark backgrounds                    |
| --border / --line              | #758267 / translucent paper; interactive boundary / separators |
| --space-1/2/3/4/5/6/8/12/16    | 4/8/12/16/20/24/32/48/64 px                                    |
| --text-xs/sm/base/lg/title     | 12/14/16/20 px and fluid 40–64 px                              |
| --content-width / --rail-width | 1440px / 224px desktop; 190px rail on smaller desktop          |
| --grid-gap                     | 20px; flexible cards with 285px minimum or available width     |
| --radius                       | 4px; restrained corners                                        |

Display font is for headings; Barlow is for readable body/interface text; Mono is for short labels and metadata. Body text has generous line height. Inputs use 16px text to avoid mobile focus zoom. Major controls use at least 44px height. Product panels maintain a shared spacing rhythm; game artwork keeps its own existing proportions.

Desktop uses a left workspace rail and flexible content column. At 760px the rail becomes a horizontally scrollable navigation strip. Filters stack on mobile. Tables and brackets scroll within labeled, keyboard-focusable regions, never widening the whole document. Empty states provide real next actions. Native select controls retain platform keyboard behavior.

## Reusable component catalogue

| Component / recipe              | Location                                            | Contract and usage                                                                             |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PageTitle                       | mvp/UI.tsx                                          | Eyebrow, h1, description and optional real action                                              |
| Buttons                         | .button.primary / .outline, .mvp-small-button       | Native button for actions, Link for navigation; busy/disabled states preserve meaning          |
| Field                           | mvp/UI.tsx                                          | One native control, generated id, explicit label, optional aria-describedby hint               |
| Select / search filters         | Field plus native select; EventsPage and HeroSearch | Labeled values; URL-backed discovery filters; search submits to real API discovery             |
| Tabs                            | mvp/DesignSystem.tsx                                | items/value/onChange/label/panelId; arrow, Home/End, roving tabindex and associated panel      |
| ConfirmProvider / useConfirm    | mvp/DesignSystem.tsx                                | Promise<boolean>; native modal, cancel initially focused, Escape and trigger-focus restoration |
| Toast / Notice                  | DesignSystem.tsx / UI.tsx                           | Non-expiring dismissible success status; persistent inline status or error alert               |
| Status                          | UI.tsx                                              | Text plus visual treatment; meaning does not depend on color alone                             |
| EventCard / TeamCard            | UI.tsx / DashboardPage.tsx                          | Real API records, named navigation, stable logo dimensions, readable metadata                  |
| LiveBracket / MatchList         | EventDetailPage.tsx / UI.tsx                        | Actual matches, scrollable rounds, focus/hover team tracing, restrained advancement highlight  |
| DataTable                       | DesignSystem.tsx                                    | Caption, scoped column headers, scrollable named region; safe text cells                       |
| Loading / Empty / ResourceError | UI.tsx                                              | Accessible loading label and reserved skeleton area; contextual empty state; actual retry      |
| Unavailable                     | DesignSystem.tsx                                    | Explicit unavailable explanation; no fake buttons, counts or activity                          |
| Creation wizard                 | CreateEventPage.tsx                                 | Three steps, native per-step validation, server/Zod validation, review, real publication       |

Components remain in apps/web because there is only one consumer; packages/ui would add unnecessary indirection. Existing .mvp styles are retained underneath the shared refinement layer.

## Screen coverage and functionality

1. Landing: preserved logo/search/bubbles/art, real discovery search, motion-pause control and clearly fictional lower-page interface examples.
2. Discovery: URL-backed game/status/name filters, real tournament cards, loading/retry/empty states.
3. Tournament detail: shared title/status/champion, accessible section tabs and safe plain-text descriptions/rules.
4. Login/registration: same identity and form primitives, existing real authentication and provider-availability handling.
5. Player dashboard: own teams/events/schedule/results, with a working player/organizer workspace switch.
6. Team management: existing create/roster workflows, stable logo sizing, confirmed member removal.
7. Organizer dashboard: real event/registration totals, shared cards and workspace preference switch.
8. Creation wizard: identity/format → dates/rules → review/publish; no fake drafts or extra formats.
9. Bracket viewer: actual progression, scroll containment and keyboard team tracing.
10. Schedule: published times from the current dashboard workspace; full event schedule remains on event detail.
11. Results: current workspace's latest ten results and complete per-event results; league standings explicitly unavailable for single elimination.
12. Notifications: clearly unavailable inbox explanation and a working dashboard link; no unread badges.
13. Organization: authorized workspace list and real membership table; creation/invitations/branding/domains unavailable.
14. Administration: verified moderator/admin audit-event table and refresh; moderation queue explicitly unavailable. Existing server authorization remains authoritative.
15. Account: existing profile/security/session/lifecycle forms using shared controls and states.

## Interaction, safety and performance

Focus outlines remain visible; destructive roster removal, registration removal, bracket generation and irreversible score recording require confirmation. Tabs have keyboard navigation and panel relationships. Recovery and account actions keep their existing explicit consent/reauthentication requirements. User-generated text is rendered through React text interpolation; no dangerouslySetInnerHTML or custom rich-text HTML parser was introduced.

Reduced motion disables CSS animations/transitions. The landing also offers a manual ambient-motion toggle; bubble RAF work stops when paused, reduced-motion, offscreen or backgrounded. Interactive bracket examples remain explicitly labeled demos. Product advancement highlighting is brief and disabled with reduced motion.

Route views, including the landing, are lazy-loaded. The shared SVG artwork remains vector/code-based; no new raster hero downloads, 3D library or third-party font fetches were added. Team image dimensions are reserved and images are lazy/async decoded. Skeletons reduce loading jumps; this is not a measured zero-CLS claim.

## Evidence and limitations

See [Phase 3 verification](phase-3-verification.md) and [screenshots](screenshots/README.md). Automated WCAG 2/2.1/2.2 A/AA rule checks and targeted keyboard/responsive tests support the WCAG 2.2 AA target but do not certify full conformance. Real screen-reader, Safari/Firefox, long localized strings, high-zoom and independent accessibility review remain release checks. Font/game-art licensing remains a separate launch concern.

## Phase 4 components

TeamManagement supplies manager/substitute controls, editable identity disclosure, accepted ownership transfer and confirmed archive/leave. TeamInvitations handles recipient consent and manager cancellation; action rows wrap on mobile. PlayerProfilePage uses the existing shell/type/colors for public basics, safe socials, memberships and CompetitionHistory. Account settings expose explicit visibility checkboxes and username/game/region fields. MediaUpload accepts actual files, displays configuration-unavailable state and supports removing attached assets. RosterChange displays saved/proposed players and explicit request/organizer-review confirmations; approval never follows a team edit automatically. See phase-4-verification.md and screenshots/phase-4 for tests and captured responsive states.

## Phase 5 components and screens

The original landing logo/search/game bubbles/art remain unchanged. TournamentFields supplies common format, competition, visibility, region/location, eligibility/prize and registration settings to the existing wizard and editing form. TournamentOperations supplies current operational counts, publication/check-in, secret-link rotation, export, editable settings, cover upload, announcements and confirmed cancellation/postponement. Provider-unavailable cover uploads remain explicit. Individual entries, waitlist status, withdrawal and check-in use actual APIs. Private fragment redemption precedes event loading and removes the fragment. OrganizerProfilePage lists only published public events.

Discovery filters are URL-backed with 50-item paging. Bracket headings identify winner/loser/final/reset/Swiss/RR/playoff rounds; standings show real W/L/BYE/opponent strength/score difference/KDA/win duration. Match forms collect the required actual totals for RR/Swiss. Shared field/focus/confirmation/reduced-motion primitives and existing dark/lime tokens remain. No fake payments or automatic game-stat integration is presented.

## Phase 6 competition components

The original landing/logo/game artwork remains unchanged. Tournament pages continue using the existing scoped colors, typography, Field, Notice, confirmations and tabs. EngineFields renders only rules for the selected format. ResultFields is shared by organizer confirmation, participant proposals and reviewed correction, including explicit administrative outcomes without invented scores. SeedingControls offers registration, random and keyboard-operated manual order. MatchControls exposes pre-play assignment and format changes. BattleView uses responsive semantic standings and per-entrant lobby forms. EngineReview shows proposals, disputes, rollback impact, explicit confirmation and history.

BracketViewport uses native overflow scrolling and CSS zoom (75–150%), with labelled buttons, focusable arrow-key scrolling, plus/minus shortcuts and pointer drag on noninteractive space. Touch retains native scrolling. Stage filtering and explicit winner/loser source labels aid complex brackets. Confirmation animation respects reduced motion. Keyboard focus remains managed by the existing confirmation provider. No canvas or 3D dependency was added.

## Phase 7 components

`LiveProvider` owns authenticated connection lifecycle; `LiveStatus` gives a polite connection/fallback status. `NotificationBadge` is keyboard-accessible in the account header on mobile and desktop. `NotificationCenter` uses existing panels, fields, notices and buttons for paged deliveries, read actions and persisted preferences. Unconfigured email is explained honestly. `LiveScoreForm` separates provisional publishing from final confirmation, and bracket cards label provisional scores explicitly. Existing fonts, artwork, bubbles and charcoal/lime identity remain. Quiet resource refresh avoids full-page loading flashes; notification motion is disabled for reduced-motion users.

## Phase 8 organization interfaces

The original landing/logo/search/bubbles/art remain unchanged. OrganizationsPage owns the workspace list, acceptance inbox and permission-aware Overview/People/Settings tabs. OrganizationAnalytics uses real metric panels, a labelled daily meter chart, semantic tables, explicit empty denominators and scoped CSV download. It labels lifetime versus selected-period data and retained/current-state definitions. OrganizationStaff provides invitation status, accepted member roles, confirmed removal/leave and explicit tournament assignments. OrganizationProfileForm provides version-checked profile editing and public opt-in; MediaUpload remains the shared validated branding UI. OrganizationPublicPage lists only published public events. CreateEventPage selects personal or authorized organization ownership through the existing wizard.

Use existing Field, Tabs, DataTable, Notice, confirmation, focus and reduced-motion components. The dashboard grid collapses to two columns on narrow screens; tables/charts retain contained scrolling. No additional animation library or chart dependency is introduced. Staff and managers see only permitted actions, with backend policy authoritative.

## Phase 9 developer interfaces

DeveloperWorkspace lives in the existing organization's Developers tab, visible to current owners/admins. Reuse Field, Notice, confirmations, contained panels, checkbox fieldsets and responsive action rows. Credentials/signing secrets are rendered only in transient component state after issuance, never browser storage; dismissing or leaving the view removes them. Confirm rotation/revocation/disable and show actual configuration-unavailable states. Permission defaults are read-only and selected tournaments are explicit. Activity is real, paged API data.

DeveloperDocsPage is lazy-loaded at /developers with an actual credential-free public GET explorer, safe text response rendering and downloadable OpenAPI. It does not request/store privileged keys. Existing landing/logo/search/bubbles/art remain unchanged. Phase 9 screenshots and accessibility checks are documented in verification.

## Phase 10 — branded portals

Phase 10 retains the original landing artwork, search and glass bubbles. PortalPage uses existing charcoal/paper typography, contrast-validated accent tokens, scoped CSS, responsive tournament cards, accessible tabs, loading/error/empty states and existing zoom/pan bracket viewport. PortalSettings adds publication confirmation, immutable slug, validated media controls and honest DNS/TLS states in organization settings. Navigation is restricted to home/tournaments/results. Public pages poll authoritative reads while visible; account actions navigate to canonical MatchFlow. No browser auth/socket provider is mounted on custom domains.

## Phase 11 — administration and responsible operations

Phase 11 adds AdministrationPage, StaffAuthentication, AdminDisputes, SupportPage, HelpPage and ReportLink using existing typography/colors/forms/tabs/tables/confirmations. Staff setup and recovery secrets are transient UI state; no localStorage. Shared ResultFields/BattleFields support reviewed platform corrections without duplicating scoring rules. Profile/team/event/community report links prefill the private support flow. Account export downloads numbered JSON pages with explicit completion. Existing landing artwork/bubbles remain untouched.

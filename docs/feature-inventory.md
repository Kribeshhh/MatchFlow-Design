# Feature inventory

Current implementation: Phase 9 developer API, alongside Phases 1–8. See [Phase 9 verification](phase-9-verification.md) and [developer API guide](developer-api.md). Earlier phase sections are historical evidence.

Current implementation: Phase 8. Earlier phase sections are historical context. See [Phase 8 verification](phase-8-verification.md) and ADR 0009 for current organization scope and release gates.
Updated after Phase 1, 2026-10-29. “Working” below means the named tested slice, not production readiness. See [verification](verification.md) for limits and [findings](audit-findings.md) for defects.

| Capability                                      | Classification                             | Actual evidence / remaining work                                                                      |
| ----------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Registration/login/logout, opaque sessions      | Existing and working, incomplete lifecycle | API tests pass; recovery, verification, revocation UI and production cookie/proxy verification absent |
| Player profiles                                 | Existing but incomplete                    | Identity username/email/role only; no profile management                                              |
| Persistent teams, captain roster operations     | Existing and working, incomplete product   | Database/API tests; no invitations, consent, transfers, leave/edit/delete or substitutes              |
| Discovery and event detail                      | Existing and working, needs refactoring    | Public API tested; privacy/history projections corrected; capped results and no pagination remain     |
| Entry eligibility/review/manual registration    | Existing and working                       | Tests cover capacity, game/roster constraints and ownership; consent unresolved                       |
| Single elimination, BYEs, advancement, champion | Existing and working                       | Lifecycle plus seed-order tests; not exhaustive full brackets for every size/concurrency scenario     |
| Scheduling/results                              | Existing but incomplete                    | API path tested; no time-conflict engine, forfeit/dispute or correction policy                        |
| Player dashboard                                | Existing and regression-tested             | Snapshot history and private-entry metadata corrected                                                 |
| Organizer dashboard                             | Existing but incomplete                    | Counts/event management present; no verified analytics/reporting system                               |
| Landing visual identity and interactive bubbles | Existing, source inspected                 | Preserved code/assets; demo search/data and simulated activity are not production integration         |
| Responsive and accessible UI                    | Existing but incomplete verification       | Source support; historical screenshots; no fresh browser/a11y certification                           |
| Other formats and standings                     | Missing                                    | No double elimination, round robin, Swiss or battle-royale points engine                              |
| Event editing/cancellation/check-in             | Missing                                    | Registration/ongoing/completed only; abandoned events can keep roster locks                           |
| Notifications and real-time delivery            | Missing                                    | No subscription transport, queue, notification model or delivery integration                          |
| Administration/moderation/audit trail           | Existing but incomplete                    | Transactional competition audit events now exist; administrator role and moderation still absent      |
| Communities/organization membership             | Existing but incomplete                    | Optional Organization owner/event model added; staff/community workflows absent                       |
| Secure developer API                            | Missing                                    | Internal cookie API exists; no scoped keys, versioning, quotas or webhook contract                    |
| White-label portals/custom domains              | Missing                                    | No tenancy, branding/domain verification or TLS lifecycle                                             |
| Authentication and response hardening           | Security risks                             | See F02/F03/F06/F07/F09; server ownership checks do exist                                             |
| Input validation/error contract                 | Existing and regression-tested             | Parsed-instant validation and HTTP 413 handling tested                                                |
| API boundaries/shared types/styles              | Needs refactoring                          | Modules separated; inferred response contracts; fixture/real UI systems intentionally remain separate |
| Build/type verification                         | Existing quality gate                      | Clean install and strict frontend/backend build gates established                                     |
| Lint/CI/operations                              | Deployment blockers                        | Lint/format/CI/logs/health now present; production restore/monitoring/release verification remain     |
| Dependencies and demo seeding                   | Security risks / deployment blockers       | Zero current advisories; no embedded seed password; old demo accounts still require review            |

No payment/subscription system is implemented or assumed in the approved vision. If later requested, it requires its own product and security scope.

Stage/result persistence, identifier-only competition audit events, validated config, request IDs, safe logs/errors, liveness/readiness, shutdown and migration replay are implemented Phase 1 foundations. No Redis, workers, object storage, staff roles, extra formats or new product pages were added.

## Phase 2 inventory update (supersedes identity gaps above)

| State                                              | Capability                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implemented and locally tested                     | Registration/login/logout, verification/reset/reactivation token lifecycle, password change, profile, device-session revocation, deactivation/anonymizing deletion |
| Implemented and locally tested                     | Concurrent player/organizer capabilities, captain policy, org owner/admin membership, event delegation, separate moderator/admin policy, last-admin protection     |
| Integration implemented; live verification pending | SMTP delivery and Google OIDC; no credentials configured by user choice; signed token and account-linking fixtures tested                                          |
| Operational tools implemented                      | Verified-admin bootstrap and expired identity-state cleanup                                                                                                        |
| Architecture only                                  | Optional MFA/TOTP; no enrollment/challenge UI or stored factors                                                                                                    |
| Deployment blockers / release work                 | Provider staging tests, proxy/shared IP limits, retention and ownership transfer policy, monitoring, restores, independent security/load qualification             |
| Still deferred                                     | Team invitations/consent, additional formats, full admin/organization UI, realtime notifications, analytics, developer API, white-label tenants/custom domains     |

Identity audit findings from Phase 0 remain historical evidence; use security-model.md for current controls. No blanket production-ready claim is made.

## Phase 3 interface update

Shared tokens/primitives and responsive app shell now cover landing, discovery/details, auth, both dashboard modes, teams, account settings, guided tournament creation, brackets, schedule/results, organization membership and platform audit views. Notifications, self-service organization setup/invitations, full moderation and league standings are explicitly unavailable rather than simulated. Real backend data feeds implemented views; lower landing demonstrations are visibly fictional. See phase-3-verification.md for evidence and accessibility limitations.

## Phase 4 delivered (2026-10-31)

Locally tested profiles/privacy/username/games/socials/history/statistics, invitation consent, managers/substitutes, two-party ownership transfer, reusable roster snapshots with deadline-bound review, archive/leave and safe S3 image integration are implemented. Legacy remote image URLs are removed. S3 provider configuration/live qualification is deferred by the user; unavailable controls are explicit. Documentation and migrations preserve existing identities/sessions/history. Production security/accessibility/load/restore qualification remains outstanding. See phase-4-verification.md.

## Phase 5 inventory update

Implemented: filtered/paged discovery, public organizer pages, validated extended wizard/drafts, optional covers, private share links, event editing/publication/postponement/cancellation, announcements and authorized exports; individual and reusable-team entry, transactional capacity/duplicate checks, frozen snapshots, automatic eligible FIFO waitlist promotion, withdrawal/review/check-in; double elimination with reset, round robin and Swiss, real statistics/standings and deciding playoffs.

Explicit limits: free entry only; head-to-head decisive scoring, not native battle royale; RR/Swiss maximum 16; manual verified-organizer results/statistics, no game telemetry; immutable results; no event resumption after cancellation. S3 covers unavailable until provider configuration. Existing deferred SMTP/Google/S3 staging, full moderation/notifications/organization creation/analytics/API access/custom domains and production operations remain outside Phase 5. Verification evidence is recorded separately; implementation alone is not production qualification.

## Phase 6 verified update

Implemented seven format dispatch, reusable stage participants/seeds, configurable group qualification and leagues, native battle lobby results, administrative wins/draws, match slots/dependency checks, player proposals, organizer confirmation, disputes, explicit rollback previews/correction evidence, pre-play assignment/reset restrictions and interactive bracket controls. Existing single-elimination behavior has dedicated regression simulations. None of this implies provider telemetry, payments, global venue reservations, cross-event scheduling guarantees or production qualification. Verification: 18 unit, 49 integration and 39 browser checks passed; see phase-6-verification.md.

## Phase 7 inventory update

Implemented: authenticated live invalidations, private access revalidation, reconnect snapshot recovery, provisional score publishing, real inbox/unread/preferences, transactional outbox, important email queue/retries/dead letters, check-in reminders and multi-instance polling. Existing competition confirmation remains authoritative. No Redis, fake mail delivery or game telemetry was introduced. Live SMTP delivery, production scale/proxy tests, retention sign-off and operational alerting remain deployment blockers. See Phase 7 verification for actual test evidence.

## Phase 8 inventory update

Implemented: self-service organization creation/profile/branding, accepted invitations including new-user emails, owner/admin/manager/staff permissions, removal/leave, explicit event assignments, organization event creation, public organizer profiles, scoped dashboard/analytics and CSV export. Existing announcement/rule/schedule/result tools remain available according to event authority. Approval conversion is real approved/submitted data; visitor conversion is explicitly unavailable. Optional document attachments, white-label/custom domains, owner succession/deletion workflow and production provider/load qualification remain outside this phase. See Phase 8 verification for observed checks.

## Phase 9 update

Developer API, organization-scoped credentials, selected-event grants, bounded public/privileged projections, idempotent announcement/scheduling writes, developer dashboard, signed durable webhook delivery and interactive/OpenAPI documentation are implemented. Security/API/browser evidence and explicit release blockers are in phase-9-verification.md. No white-label/custom-domain, payments or full moderation implementation is implied.

## Phase 10 — branded portals

Implemented and locally tested: branded public listings/details/brackets/results, safe navigation/theme/media, publication controls, owner domain claims, TXT/routing verification, managed TLS adapter, removal/reassignment fencing and tenant isolation. Deployment blockers: Cloudflare zone/token/fallback origin and authenticated edge configuration, live domain/TLS staging qualification, existing S3/SMTP provider qualification. Cross-domain account sessions are intentionally unavailable under the approved canonical-login policy.

## Phase 11 — administration and responsible operations

Implemented: mandatory staff MFA, role-separated administration, private report/support queue, suspend/restore, content restriction/restoration, admin ownership transfer, real health/API usage, audit review, legal holds, dry-run retention cleanup and self export. Existing engine performs platform-reviewed corrections. Deployment gates: STAFF_MFA_KEY/secret custody, public SUPPORT_CONTACT_EMAIL, external backup/monitor/alerts and jurisdiction-specific legal/privacy review. No commercial features enabled.

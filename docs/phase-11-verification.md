# Phase 11 verification — 2026-11-04

## Delivered

Platform administration and moderation extend the existing modular monolith. Verified staff must enroll TOTP; session-bound factor proof and recent primary authentication protect sensitive operations. Moderator and administrator permissions are distinct from organizer permissions. Recovery codes are shown once, hash-only and single-use; replacement requires fresh proof and revokes other sessions.

Implemented user/organization/tournament lists, private report/support intake and review, audited content inspection, suspension/restoration, content restrictions, ownership transfer, legal holds, operational/API summaries and security-event review. Platform result corrections reuse the existing exact-dispute rollback preview, reason, acknowledgement, historical evidence and replay engine. Ordinary tournament ownership is not bypassed globally.

Self-service paginated JSON export and anonymizing deletion preserve existing competition history while removing identity secrets and staff factors. Retention cleanup defaults to dry run, respects case/record holds and does not delete competition results. Operations and privacy documentation cover support/appeals, backups, restore drills, incident response, monitoring, alerting and launch review. No commercial features were enabled.

## Actual checks

| Check                                                                                    | Result                                                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Phase 10 baseline `npm run check`                                                        | Passed before Phase 11 changes                                                                                      |
| Final `npm run check`                                                                    | Passed: ESLint, Prettier, 26 unit tests, 90 integration tests, strict frontend/backend TypeScript, production build |
| `npm run test:e2e -- --workers=2`                                                        | 69 passed across desktop, tablet and mobile                                                                         |
| Administration browser rerun after restriction/context/private-intake/spacing refinement | 6 passed across all three viewports                                                                                 |
| `npm run test:migrations`                                                                | Passed additive migration replay and existing preservation checks                                                   |
| Local preflight/backup/migration                                                         | Passed; user/session/member/event/match/roster fingerprints preserved                                               |
| `npm audit`                                                                              | Zero reported vulnerabilities                                                                                       |
| Local API readiness and frontend portal context                                          | `status: ok`, canonical mode                                                                                        |
| `git diff --check`                                                                       | Passed                                                                                                              |

The migration backup is stored in ignored `.local/backups/phase11-before.dump` with restricted permissions. The existing local development environment received an independently generated STAFF_MFA_KEY in ignored `.env`, mode 0600; the key was not printed. No production secrets or provider settings were provisioned. Test processes replace this key with ephemeral test-only configuration.

Screenshots in docs/screenshots/phase-11 show moderation, operations and support on desktop/tablet/mobile. Mobile moderation was visually reviewed; spacing was refined and browser accessibility/overflow checks repeated. Automated axe checks are evidence, not a complete WCAG certification.

## Security coverage

New tests exercise mandatory MFA, encrypted storage, replay counters, session separation, concurrent single-use recovery, brute-force limits, stale primary/factor proofs, factor replacement, ordinary-user/moderator privilege escalation, staff-only private-account case intake, private report isolation, CSRF, stale/concurrent moderation decisions, suspension/session revocation and explicit restoration. Existing identity tests now enroll staff rather than weakening the gate.

Content tests cover public/private discovery, ordinary editing, current-target inspection authorization, pending team invitation/captain-transfer cancellation, restricted organization workspace/portal/integration access and restoration without republishing or credential revival. Ownership transfer rejects moderators and nonmembers. Platform corrections reject nonadmins, wrong events and stale previews, then use real engine progression/history. Privacy tests cover secret-free self export, legal holds, dry-run versus apply, unresolved-case retention and deletion of staff factors.

Earlier engine, roster, authentication, notification, organization, developer API and custom-domain regressions remain passing. The existing landing identity and centered game dialogs remain covered by browser tests.

## Limits and release gates

Configure a real SUPPORT_CONTACT_EMAIL before public launch; signed-in cases work now, while /help honestly shows external contact availability. Provision secret-manager custody, independent backups/PITR, restore drills, external monitors, alert destinations and incident/support staffing. Repository runbooks do not claim these services are deployed. Production staff-key rotation requires reviewed factor re-encryption, not replacing the key in place.

TOTP is mandatory for staff authorization, not a general player MFA feature or phishing-resistant passkey system. Record-level legal holds can be managed through the protected API; case holds also have UI controls. Retention does not erase backup/object-store/log copies, and retained free-text evidence may need separate privacy review. Suspended users use the configured external support channel for appeals/deletion requests. Staff restoring content do not automatically republish it or restore unlinked media/announcements.

The legal entity/jurisdictions/user ages and provider deployment remain unqualified. See privacy-retention.md and operations-runbook.md. Existing Cloudflare/S3/SMTP/Google staging gates remain. Stop after Phase 11; no later phase is implemented.

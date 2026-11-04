# Phase 3 browser captures

Captured 2026-10-30–31 from the running local application. These are browser renders, not design mockups. Desktop 1440×1000, tablet 768×1024, mobile 390×844; full-page captures extend vertically. Reduced-motion was enabled for stable review.

Public discovery captures display existing local development records, including historical demo events already present before this phase; they are not evidence of public production traffic. Authenticated captures use clearly named UI fixtures in the isolated test database. Random ui_* usernames are test accounts. No credentials or cookies are included.

| Experience                   | Desktop                                             | Mobile / tablet                                                              |
| ---------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Preserved landing            | [Landing](phase3-landing-desktop.png)               | Responsive bubble interaction is covered in browser tests                    |
| Real discovery               | [Discovery](phase3-discovery-desktop.png)           | [Mobile](phase3-discovery-mobile.png)                                        |
| Registration                 | [Registration](phase3-register-desktop.png)         | Layout/labels tested at all three sizes                                      |
| Organizer dashboard          | [Dashboard](phase3-dashboard-desktop.png)           | [Mobile](phase3-dashboard-mobile.png), [tablet](phase3-dashboard-tablet.png) |
| Creation review              | [Wizard](phase3-wizard-desktop.png)                 | [Mobile](phase3-wizard-mobile.png)                                           |
| Tournament registration view | [Tournament](phase3-tournament-desktop.png)         | [Tablet](phase3-tournament-tablet.png)                                       |
| Completed bracket            | [Bracket](phase3-completed-bracket-desktop.png)     | [Mobile](phase3-completed-bracket-mobile.png)                                |
| Team roster                  | [Team](phase3-team-desktop.png)                     | [Mobile](phase3-team-mobile.png)                                             |
| Organization membership      | [Organization](phase3-organization-desktop.png)     | [Mobile](phase3-organization-mobile.png)                                     |
| Restricted audit view        | [Administration](phase3-administration-desktop.png) | [Mobile](phase3-administration-mobile.png)                                   |

Browser tests produce fresh authenticated captures in test-results/. Curated copies here support review; future changes should regenerate the relevant screenshots. See ../phase-3-verification.md for coverage and limitations.

## Phase 4

- [Team desktop](phase-4/team-desktop.png)
- [Team mobile](phase-4/team-mobile.png)
- [Player desktop](phase-4/player-desktop.png)
- [Player mobile](phase-4/player-mobile.png)

Captured from real UI flows against disposable test accounts: accepted invitation/captain transfer and profile privacy. S3 is deliberately unconfigured in browser tests; the unavailable state is shown honestly. API image flows use isolated test storage and the SDK adapter is separately verified. See ../phase-4-verification.md.

## Phase 5

[Organizer operations at desktop/tablet/mobile sizes](phase-5/README.md), captured from the real private draft/publication/share/announcement workflow. Links and tokens are excluded from the saved screenshots.

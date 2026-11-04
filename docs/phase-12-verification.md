# Phase 12 production-readiness report

Date: 2026-11-05. **Not cleared for public production launch. No cloud deployment performed.** Provider-neutral release preparation is implemented; local checks do not qualify absent infrastructure or integrations.

## Delivered

- Node 22.23.4 supported security patch, reproducible lockfile/build, unprivileged multi-stage API/SPA image, separate migration and worker targets, local integration Compose and canonical-host health probe.
- CI includes tests, migration replay, restore/release checks, dependency/static/secret scanning and a Linux container smoke job. A manually invoked staging-gated workflow prepares checksummed candidate images; provider-specific deployment is deferred until hosting is selected.
- Validated explicit trusted-proxy configuration, early HTTP acceptance shutdown, bounded/safe standalone-worker lifecycle, shared destructive-test database guard and regression tests.
- Real disposable backup restoration, production-mode HTTP/security/log checks and a bounded load harness.
- [Threat review](security-review.md), [deployment/staging guide](production-deployment.md), [environment contract](environment-variables.md), [backup/rollback guide](backup-restore-rollback.md), [launch checklist](launch-checklist.md), architecture/decision/file-map/progress updates.

No product features, routes, visual identity or production data were replaced. No production database was accessed or reset. Existing earlier-phase working changes remain in the checkout.

## Executed local evidence

| Check                                     | Actual result and limit                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                                   | Official Node v22.23.4 Darwin ARM64 archive verified against official SHA-256 manifest; checks executed with that binary                                                                                                                                                                             |
| Unit tests                                | 28 passed, including proxy validation and destructive-test target aliases/default-port separation                                                                                                                                                                                                    |
| Integration/API/database/security tests   | 90 passed; includes identity/authorization, all seven competition formats, registration conflicts, teams, organizations, API credentials/webhooks/SSRF, custom domains and staff moderation/privacy                                                                                                  |
| Browser                                   | 69 passed in Chromium at desktop 1440×1000, tablet 768×1024, mobile 390×844; existing axe, keyboard, responsive and actual workflow assertions. No Safari/Firefox/manual assistive-technology certification                                                                                          |
| Types, lint, formatting, production build | Clean npm ci and all gates passed; both applications and compiled maintenance/worker scripts included                                                                                                                                                                                                |
| Migrations                                | Legacy fixture replay passed, preserving identities/session digests/memberships/results and validating constraints; restored-database migrate deploy passed                                                                                                                                          |
| Restore                                   | 48 public tables fingerprint-matched after actual pg_dump/pg_restore into a new random disposable database; local execution 6,393 ms; fresh destination then removed. Protected archive retained only under ignored .local/phase12                                                                   |
| Production HTTP checks                    | Built application: headers, secure HttpOnly SameSite host-only cookie, CSRF rejection, unverified-host rejection, unauthenticated administration denial, safe malformed JSON, JSON API 404, structured request IDs/duration, no password in logs and graceful SIGTERM passed                         |
| Load                                      | 200 public discovery reads, concurrency 10, 200 HTTP 200 responses, 235 ms total, 850 requests/sec, p50 10 ms, p95 16 ms, max 46 ms. Local short burst over loopback; not sustained throughput, production capacity or an agreed SLO                                                                 |
| Dependencies                              | npm audit: zero reported vulnerabilities in the installed lockfile graph at review time; does not scan OS/container packages                                                                                                                                                                         |
| Static analysis                           | Semgrep 1.179.0: 6 repository rules / 192 targets, zero findings; registry security-audit: 30 rules / 207 targets, zero findings. Parameterized pg-boss SQL adapter reviewed manually. Not a full taint/penetration assessment                                                                       |
| Secrets                                   | Gitleaks 8.30.1 source snapshot including untracked non-ignored files: zero findings after correcting a documentation false positive. Reachable HEAD history: 5 commits, no findings. All-ref scan encountered a pre-existing malformed local ref; unreferenced/invalid-ref history is not qualified |

Evidence logs are local ignored files under `.local/phase12/`: install.log, check-last.log, browser.log, migrations.log, restore.log/restore-results.json, release-last.log/performance.json, configuration.log, audit.json, semgrep.log, semgrep-audit.json and redacted Gitleaks reports. Raw backups and test logs must not be uploaded as public CI artifacts. Fresh browser test screenshots remain under the existing test output paths; no visual redesign was required.

The actual local `release:config` result is **blocked**, as expected for the development environment: it identifies missing production database/TLS/pool configuration, provider secrets and support contact, and rejects test variables in a production process. Values are never printed.

## Unverified and blocking

1. Docker is not installed on this host: Dockerfile/Compose are prepared, but local image build, container execution, OS vulnerability scan and remote CI execution are not claimed.
2. Hosting, registry, region, staging/production domains and infrastructure access are unselected. No real TLS/ingress/firewall/proxy trust, managed database pooling or live deployment was verified.
3. SMTP, Google, S3 and Cloudflare credentials remain unconfigured by prior product decision. Live account delivery/OAuth/media/custom-domain TLS and real external webhook receiver qualification remain required.
4. Cloud backups/PITR, key/object restore, production RPO/RTO and rollback drill remain unverified. A successful local logical restore is narrower evidence.
5. Error monitoring, log retention/immutable export, alert delivery, support mailbox and on-call coverage need provisioning and a test incident. Logs alone are not monitoring.
6. Representative multi-instance/worker/soak load, distributed ingress abuse controls, manual accessibility/browser coverage, independent security review, asset rights and jurisdiction-specific privacy review remain launch gates.

Run the [launch checklist](launch-checklist.md) against the selected deployment. `release:config` reports missing full-platform configuration without printing values; a passing presence check still does not prove provider behavior. Optional unavailable features must remain accurately represented. No commercial capabilities are activated. Phase 12 stops here after the final local verification; production deployment requires a subsequent instruction and completed gates.

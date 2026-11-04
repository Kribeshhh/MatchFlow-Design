# Launch checklist

Phase 12 local evidence is in phase-12-verification.md. Checked items describe local results only; unchecked items block claiming the corresponding production capability.

- [x] Preserve application routes, existing data model and MatchFlow design.
- [x] Strict types, lint, production build and unit/integration regression coverage.
- [x] Separate guarded test database, migration replay, actual disposable backup restore and table fingerprints.
- [x] OWASP-based threat review, dependency audit, focused/registry SAST and secret scanning with documented scope.
- [x] Provider-neutral container, local Compose, CI and candidate artifact workflow prepared.
- [x] Production-mode security/configuration/log/shutdown checks and bounded local discovery-load measurement.
- [ ] Select hosting/region, protected registry, staging/production domains and operator ownership.
- [ ] Execute remote CI/container build/smoke; scan Linux OS image; record signed digest, SBOM and provenance. Configure branch/environment approvals.
- [ ] Run release:config with real production secret-manager injection; independently verify TLS/database CA, pools, ingress proxy trust, firewall, distributed rate limits and WebSocket routing.
- [ ] Qualify real SMTP verification/recovery/invitations and sender authentication; Google login/linking; private S3 media lifecycle; Cloudflare ownership/TLS/removal/reassignment.
- [ ] Run complete browser/lifecycle/tenant/API/webhook suites through deployed staging HTTPS, including mobile/manual keyboard/screen-reader checks. Local Chromium/axe is not a full WCAG 2.2 AA certification.
- [ ] Perform representative multi-instance/worker/soak load and abuse testing with real data volumes and realistic limits; agree latency/error/capacity targets.
- [ ] Restore managed backup/PITR, encryption keys and S3 media; record measured RPO/RTO and retention. Exercise previous-image and incompatible-schema rollback in staging.
- [ ] Provision log/error collection, immutable audit export, alerts, dashboards and on-call contacts; trigger test alerts and incident drill.
- [ ] Review remaining security risks independently, privacy/jurisdiction/retention requirements, support process and visual asset rights.
- [ ] Review exact release commit evidence, approve unresolved risks explicitly, and promote the tested digest. Verify production after rollout before declaring success.

Do not seed demo users, reuse development credentials, expose debug/administration endpoints without policy, or enable paid/commercial features as part of this release.

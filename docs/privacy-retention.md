# Privacy and retention — Phase 11

## Data boundaries

Collect account identity, consent/membership, tournament records and operational evidence needed for platform functions. Public APIs expose projected profiles/rosters and event records, not account emails, password hashes, sessions, MFA factors or recovery codes. Staff tables omit email addresses. Reporters can read only their own submissions and public resolution; internal reasons and historical restricted content require platform staff authorization. Ordinary organization permissions never grant platform queue access.

Account settings provide a recent-authenticated, paginated JSON export of the account profile, own memberships, participation identifiers and submitted cases. Download each numbered page until completion. Exports intentionally exclude other players' personal information, credentials, confidential evidence and provider tokens. This is an operational self-service export, not a claim that every jurisdictional access request is automatically fulfilled; broader requests go through verified support review.

Deletion preserves the approved anonymization model: scrub profile/email/password and roster usernames, remove sessions, identity flows, OAuth links, MFA factor/recovery hashes, memberships/permissions as defined by existing lifecycle rules, and retain anonymized competition history and ownership tombstones. Staff case/evidence records can remain for the purpose and period below, including holds. Free-text authored team/event/report evidence is not automatically guaranteed anonymous; verified privacy requests require review of residual identifying content. Suspended users can request review/deletion through the configured external support mailbox. Do not restore a DELETED account through the suspension-restore operation.

## Approved configurable defaults

| Records                                            | Default                                      | Cleanup condition                                                     |
| -------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| Support cases and associated actions               | 90 days                                      | Resolved/dismissed, measured from resolution, no legal hold           |
| Moderation cases and associated evidence           | 365 days                                     | Resolved/dismissed, measured from resolution, no legal hold           |
| Identifier-only AuditEvent / API request metadata  | 365 days                                     | Older than cutoff and not held                                        |
| Unresolved cases                                   | Until resolved                               | Review backlog regularly; no automatic destruction of active evidence |
| Tournament results / historical roster identifiers | Retained under existing anonymization policy | Separate historical-record review, never deleted by this cleanup      |

Configure SUPPORT_RETENTION_DAYS, MODERATION_RETENTION_DAYS and AUDIT_RETENTION_DAYS (1–3650 days). Defaults are product decisions, not statutory periods. Dry-run is the default:

```sh
npm run privacy:cleanup
npm run privacy:cleanup -- --apply
```

Review counts and holds before enabling a scheduled apply job. Cleanup uses a serializable transaction and records an identifier-only completion audit. Case holds protect case/actions and linked case audit records; individual audit/API records can also be held. Only recently authenticated administrators can apply/release holds. Cases, holds and audit records have no ordinary-user update/delete APIs. A database operator remains trusted and must follow the incident/privacy runbook.

After evidence retention expires, original restricted text may no longer be restorable. Restoration clears the restriction but does not invent erased text or automatically republish content. Backup/object-store copies follow separately configured deletion/retention procedures; running database cleanup does not erase external backups or logs. Define backup expiry and delayed-deletion replay during recovery before launch.

## Legal and launch review

The operating entity, launch jurisdictions, user ages and hosting/transfer locations are not established in this repository. Have qualified counsel/privacy staff determine applicable privacy, child-safety, content-reporting, records preservation and incident-notification obligations; publish clear notices, support contacts, terms and appeal procedures. Review processor agreements, lawful purposes, cross-border transfers, data-subject requests and specific retention needs before production.

If GDPR applies, purpose limitation, minimization and storage limitation are relevant principles; the approved defaults do not themselves establish compliance. See the [European Commission principles](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en). Applicability and lawful exceptions require jurisdiction-specific review. Do not collect identity documents or activate paid entry, payouts, subscriptions or billing without separate product/legal/provider approval.

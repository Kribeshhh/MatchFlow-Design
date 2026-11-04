# ADR 0003 — Identity and account lifecycle

Accepted 2026-10-30 for the explicitly authorized Phase 2.

## Decisions

Keep Express, Prisma/PostgreSQL, opaque server sessions and Zod. Add maintained Argon2, Nodemailer and openid-client implementations. Argon2id uses 19 MiB memory, two iterations and one lane; legacy scrypt hashes upgrade only after a successful password check. Password registration/reset/change requires at least 12 characters. Existing credentials and session digests/expiry survive migration. Existing accounts are marked verificationRequired=false rather than inventing verification evidence; new accounts require verification for competition mutations.

PLAYER and ORGANIZER are concurrent capabilities. The old role field remains a dashboard preference. Captain authority derives from team ownership; organization authority derives from owner/admin membership; tournament grants are resource-specific. Platform moderation/administration is separate, never accepted in public account input. Bootstrap an administrator through the explicit operator CLI after email verification.

The user approved SMTP integration now with service configuration later, and Google integration now with credentials later. SMTP is not a mocked production integration; absent configuration returns an honest unavailable response. Recovery responses are generic and delivery starts asynchronously. Shutdown drains outstanding delivery within the process deadline. A crash can lose pending delivery; users can request a new link. Durable delivery belongs to the later notification phase, and a staging delivery test is a launch gate.

Google OIDC authorization code flow uses state, nonce, PKCE S256, a short-lived HttpOnly browser binding and openid-client ID-token signature/issuer/audience/expiry validation. Linking also binds the original session and requires recent authentication and verified email. Email claims never silently merge existing accounts. OAuth access/refresh tokens are not stored. Local token exchange/JWKS fixtures verify actual library checks; live Google console credentials/callback verification remain pending configuration.

User-approved deletion immediately anonymizes the account and historical roster usernames, deletes credentials and delegated permissions, and retains the tombstone ID/results/ownership relationships for integrity. Deactivation instead blocks access and allows email reactivation. The UI explains loss of management access; ownership transfer and deletion of free-text team/event content require separate product policy. Backups and audit identifiers have not been erased by account deletion; retention remains an operational decision.

## Optional MFA boundary

TOTP is not implemented or advertised as enabled. A future approved implementation must use a maintained TOTP library, encrypted secrets with managed key rotation, enrollment confirmation, recent-auth challenges, replay protection, rate-limited verification, hashed single-use recovery codes, and audited recovery/disable flows. Introduce dedicated factor/challenge storage and tests before exposing controls. Do not implement custom cryptography or silently weaken recovery for MFA accounts.

## References

- [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [openid-client authorization code grant](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md)

These decisions do not certify production readiness or authorize later product phases.

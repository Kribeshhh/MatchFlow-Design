# ADR 0008 — Durable tournament notifications and live invalidation

Accepted 2026-11-02 for Phase 7. Preserve the existing modular monolith and competition transactions.

## Decision

Use Socket.IO 4.8.4 for authenticated WebSocket connections and pg-boss 12.38.0 for a durable PostgreSQL job queue. Redis is not required: each API instance observes committed tournament revisions in PostgreSQL and independently signals its connected clients. This avoids another stateful service while supporting multiple instances. Revisit this polling design after measured load tests; it is not a claim of unlimited scale.

[Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) do not replace durable application recovery. [pg-boss](https://github.com/timgit/pg-boss) supplies persisted jobs, leases, retries and dead letters using the existing database.

Database triggers increment a per-tournament revision and capture relevant notification events in the same transaction as domain writes. Rolled-back writes produce neither committed revisions nor events. The outbox dispatcher atomically marks dispatch and inserts its job through the same Prisma transaction. Event processing creates unique event/user deliveries and marks completion atomically. Jobs never advance brackets or confirm results.

Sockets carry only topic, identifier and decimal revision strings. The browser re-fetches authorized HTTP snapshots, deduplicates older revisions, refreshes on reconnect and falls back to 15-second visible-page polling. Subscription acknowledgements force resynchronization. Each API polls active subscriptions every second, revalidating session and private-event permissions. Revocation drops the subscription; HTTP remains authoritative. Public unauthenticated viewers use HTTP polling.

## User-approved delivery policy

Important tournament email is enabled by default, alongside in-app notifications. Users can disable either channel or individual categories. Only active users with verified email and current event access receive mail. Preferences and access are checked again immediately before sending. Authentication verification/recovery emails keep their existing immediate delivery behavior.

Approved entrants who have not checked in receive reminders when check-in opens and 30 minutes before it closes. The current check-in window runs from registration close to tournament start. Windows of 30 minutes or less receive one opening reminder, avoiding simultaneous duplicates. Scans run every 30 seconds; downtime recovery can deliver late reminders only while the window remains open. Check-in/cancellation is rechecked during processing and delivery.

## Delivery guarantees and limits

Notification uniqueness and processed-event markers make application event processing idempotent. SMTP delivery is at least once: a crash after provider acceptance but before recording SENT can resend. A stable Message-ID helps provider deduplication but cannot guarantee it. Mail older than seven days is skipped. Missing SMTP configuration leaves eligible mail pending, explicitly indicated in the interface.

Queue failures retry five times with an initial 30-second exponential delay, then enter a dead-letter queue. Completed/source jobs retain seven days; dead letters retain 30 days. Notification and outbox rows currently remain until owning records are deleted; define a retention policy before public launch. Queue schema is owned and migrated by the pinned pg-boss library, separately from application Prisma migrations.

## Security

Require exact allowed Origin and a current HttpOnly session cookie for connections. Client identity claims and score/state socket commands are never accepted. Limit payloads to 2 KB, subscriptions to eight per connection, subscription attempts to 30/minute, all messages to 60/minute, account connections to 60/minute and shared IP handshakes to 180/minute. API instances cap connections at approximately 500. Proxy/IP configuration and NAT effects require deployment review.

Private subscriptions reuse current ownership, organization membership, explicit grants, saved-roster and secret-share policies. Sessions and permissions are rechecked during polling. Inboxes and read mutations bind the authenticated user and current event visibility. Outbox roster metadata contains IDs only, never usernames, email addresses or secrets. Logs use fixed failure messages. Account anonymization removes owned notification/preferences records.

Provisional live scores use authorized, throttled, version-checked HTTP writes and do not create results or progression. Confirming a result clears provisional scores. Existing correction and competition integrity rules remain unchanged.

## Operational qualification

See deployment.md and phase-7-verification.md. Real SMTP provider delivery, production proxy/WebSocket configuration, load testing, backup restore and alerting remain release gates. No Redis, external email provider or game telemetry integration is implied.

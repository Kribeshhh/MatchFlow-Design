import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { PageTitle, Field, Notice } from "./UI";
export default function DeveloperDocsPage() {
  const [resource, setResource] = useState("tournaments"),
    [id, setId] = useState(""),
    [result, setResult] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const paths = [
    "tournaments",
    "organizations",
    "tournaments/{id}",
    ...[
      "matches",
      "bracket",
      "schedule",
      "results",
      "standings",
      "rounds",
      "teams",
      "announcements",
    ].map((k) => `tournaments/{id}/${k}`),
  ];
  return (
    <>
      <PageTitle
        label="DEVELOPER / API V1"
        title="Build on MatchFlow"
        description="Tournament data and reliable event delivery, with explicit organization permissions."
      />
      <div className="mvp-action-row">
        <a className="button primary" href="/api/v1/openapi.json" download="matchflow-openapi.json">
          DOWNLOAD OPENAPI 3.1
        </a>
        <Link className="button outline" to="/organizations">
          MANAGE INTEGRATIONS
        </Link>
      </div>
      <section className="mvp-panel mvp-section">
        <h2>Connect securely</h2>
        <p>
          Owners and administrators create integrations in their organization’s Developers tab.
          Select tournaments and the minimum required scopes, then generate an expiring credential.
          Credentials are shown once. Keep them on your server; never put them in a website bundle
          or browser storage.
        </p>
        <pre className="developer-code">{`Authorization: Bearer <your-server-secret>\nGET /api/v1/tournaments?limit=25\nGET /api/v1/tournaments/{id}/matches`}</pre>
        <p>
          Scopes: tournaments:read, matches:read, registrations:read, announcements:write,
          schedules:write. Public reads use /api/v1/public and never reveal drafts or private
          events.
        </p>
      </section>
      <section className="mvp-panel mvp-section">
        <h2>Try a public read</h2>
        <p>
          This explorer sends real requests without credentials. Private endpoints belong in your
          server integration.
        </p>
        <form
          className="mvp-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setResult("");
            try {
              setResult(
                JSON.stringify(
                  await api(
                    `/v1/public/${resource.replace("{id}", encodeURIComponent(id))}?limit=5`,
                    { credentials: "omit" },
                  ),
                  null,
                  2,
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Public resource">
            <select value={resource} onChange={(e) => setResource(e.target.value)}>
              {paths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          {resource.includes("{id}") && (
            <Field label="Tournament ID">
              <input required value={id} onChange={(e) => setId(e.target.value)} />
            </Field>
          )}
          <button className="button primary" disabled={busy}>
            SEND READ REQUEST
          </button>
        </form>
        {error && <Notice error>{error}</Notice>}
        {result && (
          <pre className="developer-code" tabIndex={0} aria-label="API response">
            {result}
          </pre>
        )}
      </section>
      <section className="mvp-panel mvp-section">
        <h2>Writes and concurrency</h2>
        <p>
          POST /api/v1/tournaments/&#123;id&#125;/announcements accepts title and body. PUT
          /api/v1/tournaments/&#123;id&#125;/matches/&#123;matchId&#125;/schedule accepts
          scheduledAt (UTC ISO timestamp), venue, slotMinutes and expectedVersion from the match
          read.
        </p>
        <p>
          Battle rounds use PUT
          /api/v1/tournaments/&#123;id&#125;/rounds/&#123;roundId&#125;/schedule with the same
          fields. All writes require an Idempotency-Key header (8–100 letters, digits, underscores
          or hyphens). Retry the same operation with the same key. Changing its content returns 409.
          Scheduling retains all tournament date, overlap and dependency checks. Results and
          registration decisions remain in the organizer workspace.
        </p>
        <h2>Pagination and limits</h2>
        <p>
          Lists return data and nextCursor. Pass nextCursor as after; limit defaults to 25, maximum
          50. Standings are complete and bounded by tournament participant limits. API limits: 120
          requests/minute per integration, 600 per organization, 300 per source IP, plus the
          platform IP limit. On 429, wait at least 60 seconds and retry with jitter.
        </p>
        <h2>Errors</h2>
        <p>
          Errors contain error and requestId. 400: invalid input; 401: invalid, expired or revoked
          credential; 403: missing permission; 404: unavailable resource; 409: conflict; 413: body
          exceeds 64 KB; 429: rate limit; 5xx: retry a transient failure using the same idempotency
          key.
        </p>
      </section>
      <section className="mvp-panel mvp-section">
        <h2>Webhooks</h2>
        <p>
          Configure an HTTPS endpoint and selected event types in the integration. Payloads contain
          only event ID, type, tournament ID, resource ID, timestamp and version. Re-fetch the
          authorized resource for current data. Head-to-head matches and battle rounds share match
          event types; use /matches or /rounds to read the relevant resource.
        </p>
        <p>
          Verify the raw body with the Standard Webhooks library and the signing secret. The signed
          headers are webhook-id, webhook-timestamp and webhook-signature. Enforce the library’s
          timestamp tolerance and atomically record the delivery ID with your processing result.
          Return 2xx for an already-processed delivery.
        </p>
        <pre className="developer-code">{`import { Webhook } from "standardwebhooks";\nconst event = new Webhook(process.env.MATCHFLOW_WEBHOOK_SECRET)\n  .verify(rawRequestBody, requestHeaders);\n// Transaction: deduplicate webhook-id, apply event, commit.\n// Track the latest version per tournament; re-fetch current state.`}</pre>
        <p>
          Delivery is at least once and may arrive out of order. Retries retain webhook-id and use a
          fresh signed timestamp. Five retries use exponential backoff; exhausted deliveries are
          visible and can be retried by an administrator. Secrets rotate immediately; coordinate the
          receiver before rotating.
        </p>
        <h2>Versioning</h2>
        <p>
          /api/v1 is the compatibility boundary. Additive fields may appear; clients should ignore
          unknown fields. Breaking changes require a new major path. Supported versions receive at
          least 90 days’ notice through documentation and Deprecation/Sunset headers before
          retirement. No v1 retirement is scheduled.
        </p>
      </section>
    </>
  );
}

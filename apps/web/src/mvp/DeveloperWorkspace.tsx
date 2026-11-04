import { useState } from "react";
import { Link } from "react-router-dom";
import {
  apiScopes,
  webhookEvents,
  type IntegrationInput,
} from "../../../../packages/shared/src/developer";
import type { Workspace } from "../../../../packages/shared/src/organizations";
import { useResource, send, date } from "./api";
import { Field, Loading, Notice, ResourceError } from "./UI";
import { useConfirm } from "./DesignSystem";
type Integration = {
  id: string;
  name: string;
  scopes: string[];
  disabledAt: string | null;
  tournaments: { tournamentId: string }[];
  credentials: { id: string; prefix: string; expiresAt: string; revokedAt: string | null }[];
  webhooks: { id: string; url: string; events: string[]; disabledAt: string | null }[];
  _count: { requests: number };
};
export function DeveloperWorkspace({ workspace: w }: { workspace: Workspace }) {
  const root = `/organizations/${w.id}/integrations`,
    r = useResource<{ integrations: Integration[]; webhooksAvailable: boolean }>(root);
  const [error, setError] = useState(""),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Integration | null>(null),
    [selected, setSelected] = useState("");
  const confirm = useConfirm();
  async function action(path: string, body: unknown = {}, method = "POST", confirmation?: string) {
    if (
      confirmation &&
      !(await confirm({
        title: confirmation,
        description:
          "This immediately changes access for the integration. Update dependent applications before continuing.",
        action: "CONFIRM",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setSecret("");
    try {
      const response = await send<{ secret?: string }>(path, body, method);
      setSecret(response.secret || "");
      r.refresh();
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (r.loading) return <Loading />;
  if (r.error || !r.data) return <ResourceError message={r.error} retry={r.refresh} />;
  return (
    <div className="mvp-section developer-workspace">
      <h2>Developer access</h2>
      <p>Connect your systems to selected tournaments. Keep API credentials on your server.</p>
      <Link className="text-button" to="/developers">
        API DOCUMENTATION ↗
      </Link>
      <p>
        Credential and permission changes require a sign-in or password reauthentication within the
        last five minutes. <Link to="/account">Account security</Link>
      </p>
      {error && <Notice error>{error}</Notice>}
      {secret && (
        <section className="mvp-panel" aria-label="New secret">
          <h3>Save this secret now</h3>
          <p>It will not be shown again. Store it in your application’s secret manager.</p>
          <code style={{ overflowWrap: "anywhere" }}>{secret}</code>
          <p>
            <button className="button outline" onClick={() => setSecret("")}>
              I HAVE SAVED IT
            </button>
          </p>
        </section>
      )}
      <IntegrationForm
        key={editing?.id || "new"}
        initial={editing}
        workspace={w}
        busy={busy}
        save={(input) =>
          action(
            editing ? `${root}/${editing.id}` : root,
            input,
            editing ? "PUT" : "POST",
            editing ? "Update integration permissions?" : undefined,
          )
        }
      />
      {editing && (
        <button className="text-button" onClick={() => setEditing(null)}>
          CANCEL EDIT
        </button>
      )}
      {!r.data.integrations.length && (
        <p>No integrations yet. Create one with the minimum permissions your application needs.</p>
      )}
      {r.data.integrations.map((app) => (
        <section className="mvp-panel mvp-section" key={app.id}>
          <h3>
            {app.name}
            {app.disabledAt ? " · Disabled" : ""}
          </h3>
          <p>{app.scopes.join(" · ")}</p>
          <p>
            {app.tournaments.length} selected tournaments · {app._count.requests} authenticated API
            requests
          </p>
          {!app.disabledAt && (
            <div className="mvp-action-row">
              <button className="button outline" onClick={() => setEditing(app)}>
                EDIT PERMISSIONS<span className="sr-only"> {app.name}</span>
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void action(`${root}/${app.id}`, {}, "DELETE", "Disable integration?")
                }
              >
                DISABLE<span className="sr-only"> {app.name}</span>
              </button>
            </div>
          )}
          <h4>Credentials</h4>
          {app.credentials.map((c) => (
            <div className="mvp-member" key={c.id}>
              <div>
                <code>{c.prefix}…</code>
                <small>{c.revokedAt ? "Revoked" : `Expires ${date(c.expiresAt)}`}</small>
              </div>
              {!app.disabledAt && !c.revokedAt && (
                <div className="mvp-action-row">
                  <button
                    disabled={busy}
                    className="mvp-small-button"
                    onClick={() =>
                      void action(
                        `${root}/${app.id}/credentials`,
                        { rotateId: c.id, expiresInDays: 90 },
                        "POST",
                        "Rotate credential?",
                      )
                    }
                  >
                    ROTATE<span className="sr-only"> {c.prefix}</span>
                  </button>
                  <button
                    disabled={busy}
                    className="mvp-small-button"
                    onClick={() =>
                      void action(
                        `${root}/${app.id}/credentials/${c.id}`,
                        {},
                        "DELETE",
                        "Revoke credential?",
                      )
                    }
                  >
                    REVOKE<span className="sr-only"> {c.prefix}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
          {!app.disabledAt && (
            <form
              className="mvp-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void action(`${root}/${app.id}/credentials`, {
                  expiresInDays: Number(data.get("days")),
                });
              }}
            >
              <Field label={`Credential lifetime for ${app.name} (days)`}>
                <input name="days" type="number" min={1} max={365} defaultValue={90} required />
              </Field>
              <button className="button primary" disabled={busy}>
                GENERATE CREDENTIAL<span className="sr-only"> {app.name}</span>
              </button>
            </form>
          )}
          <h4>Webhooks</h4>
          {!r.data!.webhooksAvailable && (
            <p>
              Webhook delivery is unavailable until the operator configures WEBHOOK_ENCRYPTION_KEY
              on API and worker instances.
            </p>
          )}
          {app.webhooks.map((h) => (
            <div key={h.id}>
              <p style={{ overflowWrap: "anywhere" }}>
                {h.url} {h.disabledAt ? "· Disabled" : ""}
              </p>
              <small>{h.events.join(" · ")}</small>
              {!h.disabledAt && !app.disabledAt && (
                <div className="mvp-action-row">
                  <button
                    className="mvp-small-button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        `${root}/${app.id}/webhooks/${h.id}/rotate`,
                        {},
                        "POST",
                        "Rotate signing secret?",
                      )
                    }
                  >
                    ROTATE SIGNING SECRET
                  </button>
                  <button
                    className="mvp-small-button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        `${root}/${app.id}/webhooks/${h.id}`,
                        {},
                        "DELETE",
                        "Disable webhook?",
                      )
                    }
                  >
                    DISABLE WEBHOOK
                  </button>
                </div>
              )}
            </div>
          ))}
          {!app.disabledAt && r.data!.webhooksAvailable && (
            <form
              className="mvp-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(`${root}/${app.id}/webhooks`, {
                  url: f.get("url"),
                  events: f.getAll("event"),
                });
              }}
            >
              <Field label={`HTTPS webhook URL for ${app.name}`}>
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="https://your-service.example/webhooks/matchflow"
                />
              </Field>
              <fieldset>
                <legend>Events to deliver</legend>
                {webhookEvents.map((event) => (
                  <label className="mvp-check" key={event}>
                    <input type="checkbox" name="event" value={event} />
                    {event}
                  </label>
                ))}
              </fieldset>
              <button className="button primary" disabled={busy}>
                CREATE WEBHOOK
              </button>
            </form>
          )}
          <button
            className="text-button"
            onClick={() => {
              setSelected(selected === app.id ? "" : app.id);
              r.refresh();
            }}
          >
            VIEW USAGE AND DELIVERIES<span className="sr-only"> {app.name}</span>
          </button>
          {selected === app.id && (
            <>
              <Activity path={`${root}/${app.id}/usage`} kind="usage" />
              <Activity
                path={`${root}/${app.id}/deliveries`}
                kind="deliveries"
                retry={(deliveryId) =>
                  action(
                    `${root}/${app.id}/deliveries/${deliveryId}/retry`,
                    {},
                    "POST",
                    "Retry failed delivery?",
                  )
                }
              />
            </>
          )}
        </section>
      ))}
    </div>
  );
}
function IntegrationForm({
  initial,
  workspace: w,
  busy,
  save,
}: {
  initial: Integration | null;
  workspace: Workspace;
  busy: boolean;
  save: (input: IntegrationInput) => Promise<void>;
}) {
  return (
    <form
      className="mvp-form mvp-panel mvp-section"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save({
          name: String(f.get("name")),
          scopes: f.getAll("scope") as IntegrationInput["scopes"],
          tournamentIds: f.getAll("tournament") as string[],
        });
      }}
    >
      <h3>{initial ? "Edit integration" : "Create integration"}</h3>
      <Field label="Integration name">
        <input name="name" minLength={2} maxLength={80} defaultValue={initial?.name} required />
      </Field>
      <fieldset>
        <legend>Permissions</legend>
        {apiScopes.map((scope) => (
          <label className="mvp-check" key={scope}>
            <input
              type="checkbox"
              name="scope"
              value={scope}
              defaultChecked={
                initial ? initial.scopes.includes(scope) : scope === "tournaments:read"
              }
            />
            {scope}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Selected tournaments</legend>
        <p>
          No selection grants no tournament access. Future tournaments are never included
          automatically.
        </p>
        {w.tournaments.map((t) => (
          <label className="mvp-check" key={t.id}>
            <input
              type="checkbox"
              name="tournament"
              value={t.id}
              defaultChecked={initial?.tournaments.some((g) => g.tournamentId === t.id)}
            />
            {t.name}
          </label>
        ))}
      </fieldset>
      <button className="button primary" disabled={busy}>
        {initial ? "SAVE PERMISSIONS" : "CREATE INTEGRATION"}
      </button>
    </form>
  );
}
function Activity({
  path,
  kind,
  retry,
}: {
  path: string;
  kind: string;
  retry?: (id: string) => Promise<void>;
}) {
  const [after, setAfter] = useState("");
  const r = useResource<{
    data: {
      id: string;
      operation?: string;
      status: string | number;
      attempts?: number;
      createdAt: string;
    }[];
    nextCursor: string | null;
  }>(`${path}?limit=25${after ? `&after=${after}` : ""}`);
  return (
    <section aria-label={kind}>
      <h4>{kind === "usage" ? "API access log" : "Webhook delivery history"}</h4>
      {r.error && <Notice error>{r.error}</Notice>}
      {r.loading ? (
        <Loading />
      ) : (
        <>
          <ul>
            {r.data?.data.map((row) => (
              <li key={row.id}>
                <code>{row.id}</code> · {row.operation || `${row.attempts} attempts`} · {row.status}{" "}
                · {date(row.createdAt)}
                {row.status === "DEAD" && (
                  <button
                    className="text-button"
                    onClick={() => void retry?.(row.id).then(r.refresh)}
                  >
                    RETRY DELIVERY
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!r.data?.data.length && <p>No recorded activity.</p>}
          <div className="mvp-action-row">
            {after && (
              <button className="button outline" onClick={() => setAfter("")}>
                FIRST PAGE
              </button>
            )}
            {r.data?.nextCursor && (
              <button className="button outline" onClick={() => setAfter(r.data!.nextCursor!)}>
                NEXT PAGE
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

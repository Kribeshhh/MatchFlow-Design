import { useState } from "react";
import { useAuth } from "./Auth";
import { send, useResource, date } from "./api";
import { Field, Loading, Notice, PageTitle } from "./UI";
import { DataTable, Tabs, useConfirm } from "./DesignSystem";
import StaffAuthentication from "./StaffAuthentication";
import AdminDisputes from "./AdminDisputes";
type Case = {
  id: string;
  userId: string | null;
  teamId: string | null;
  tournamentId: string | null;
  organizationId: string | null;
  category: string;
  description: string;
  status: string;
  resolution: string;
  version: number;
  legalHold: boolean;
  reporterId: string;
};
function Cases({ admin }: { admin: boolean }) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("OPEN"),
    [selected, setSelected] = useState<Case | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const r = useResource<Case[]>(`/admin/cases?page=${page}&status=${status}`),
    confirm = useConfirm();
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      r.refresh();
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Field label="Case status">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
            setSelected(null);
          }}
        >
          {["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      {error && <Notice error>{error}</Notice>}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <Notice error>{r.error}</Notice>
      ) : (
        <DataTable
          caption="Moderation and support cases"
          headings={["Case", "Report", "State", "Action"]}
        >
          {r.data?.map((c) => (
            <tr key={c.id}>
              <td>
                {c.category}
                <br />
                <code>{c.id}</code>
              </td>
              <td>{c.description}</td>
              <td>
                {c.status}
                {c.legalHold ? " · Legal hold" : ""}
              </td>
              <td>
                <button className="button outline" onClick={() => setSelected(c)}>
                  REVIEW CASE
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {selected && (
        <section className="mvp-panel" aria-label="Case review">
          <h2>Review case</h2>
          <p>{selected.description}</p>
          <p>
            Target:{" "}
            {selected.userId ||
              selected.teamId ||
              selected.tournamentId ||
              selected.organizationId ||
              "Support"}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              void action(async () => {
                if (
                  await confirm({
                    title: "Record this moderation action?",
                    description:
                      "Your reason and action will be retained. Enforcement changes take effect immediately.",
                    action: "CONFIRM MODERATION",
                  })
                )
                  await send(`/admin/cases/${selected.id}/review`, {
                    ...values,
                    expectedVersion: selected.version,
                  });
              });
            }}
          >
            <Field label="Moderation action">
              <select name="action">
                {[
                  "REVIEW",
                  "RESOLVE",
                  "DISMISS",
                  ...(selected.userId
                    ? ["SUSPEND", "RESTORE_ACCOUNT"]
                    : selected.teamId || selected.tournamentId || selected.organizationId
                      ? ["RESTRICT", "RESTORE_CONTENT"]
                      : []),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Internal moderation reason">
              <textarea name="reason" minLength={10} maxLength={2000} required />
            </Field>
            <Field
              label="Resolution for reporter"
              hint="Required when resolving or dismissing. Do not expose private evidence."
            >
              <textarea name="resolution" maxLength={2000} />
            </Field>
            <button className="button primary" disabled={busy}>
              SAVE MODERATION ACTION
            </button>
          </form>
          {admin && (
            <button
              className="button outline"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (
                    await confirm({
                      title: selected.legalHold ? "Release legal hold?" : "Apply legal hold?",
                      description:
                        "A hold prevents retention cleanup of this case and its evidence.",
                      action: "CONFIRM HOLD CHANGE",
                    })
                  )
                    await send("/admin/retention-holds", {
                      resourceType: "ModerationCase",
                      resourceId: selected.id,
                      hold: !selected.legalHold,
                    });
                })
              }
            >
              {selected.legalHold ? "RELEASE LEGAL HOLD" : "APPLY LEGAL HOLD"}
            </button>
          )}
          <CaseContext id={selected.id} />
          <CaseHistory id={selected.id} />
        </section>
      )}
      <Pager page={page} setPage={setPage} next={(r.data?.length || 0) === 25} />
    </>
  );
}
function CaseHistory({ id }: { id: string }) {
  const r = useResource<{ id: string; action: string; reason: string; createdAt: string }[]>(
    `/admin/cases/${id}/history`,
  );
  return (
    <>
      <h3>Recorded actions</h3>
      {r.error && <Notice error>{r.error}</Notice>}
      {r.data?.map((v) => (
        <p key={v.id}>
          {v.action} · {v.reason} · {date(v.createdAt)}
        </p>
      ))}
    </>
  );
}
function Pager({
  page,
  setPage,
  next,
}: {
  page: number;
  setPage: (v: number) => void;
  next: boolean;
}) {
  return (
    <div className="mvp-actions">
      <button className="button outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
        PREVIOUS
      </button>
      <span>Page {page}</span>
      <button className="button outline" disabled={!next} onClick={() => setPage(page + 1)}>
        NEXT
      </button>
    </div>
  );
}
function Overview() {
  const r = useResource<Record<string, unknown>>("/admin/overview");
  return r.loading ? (
    <Loading />
  ) : r.error ? (
    <Notice error>{r.error}</Notice>
  ) : (
    <>
      <h2>Platform operations</h2>
      <div className="mvp-form-grid">
        {[
          ["users", "Active accounts"],
          ["organizations", "Organizations"],
          ["tournaments", "Tournaments"],
          ["openCases", "Open cases"],
          ["openDisputes", "Open result disputes"],
          ["apiRequests24h", "API requests · 24 hours"],
          ["apiFailures24h", "API errors · 24 hours"],
          ["failedEmails", "Failed email deliveries"],
        ].map(([key, label]) => (
          <article className="mvp-panel" key={key}>
            <h3>{label}</h3>
            <p className="mvp-stat">{String(r.data?.[key] ?? "—")}</p>
          </article>
        ))}
      </div>
      <p>
        Database: {String(r.data?.database)} · Checked {date(String(r.data?.checkedAt))}
      </p>
      <p>
        External monitoring is not configured by this application. Follow the operations runbook for
        independent probes and alerts.
      </p>
      <button className="button outline" onClick={r.refresh}>
        REFRESH HEALTH
      </button>
    </>
  );
}
type RecordRow = {
  id: string;
  username?: string;
  name?: string;
  status?: string;
  platformRole?: string;
  phase?: string;
  ownerId?: string;
  organizationId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  createdAt?: string;
  operation?: string;
  integrationId?: string;
  restrictedAt?: string;
};
function Records({ kind, admin }: { kind: string; admin: boolean }) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<RecordRow | null>(null),
    [caseTarget, setCaseTarget] = useState<RecordRow | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const confirm = useConfirm();
  const endpoint =
    kind === "Audit events"
      ? "security-events"
      : kind === "API usage"
        ? "api-usage"
        : kind.toLowerCase();
  const r = useResource<RecordRow[]>(
    `/admin/${endpoint}?page=${page}&q=${encodeURIComponent(query)}`,
  );
  async function mutate(path: string, body: unknown, method = "POST") {
    setError("");
    try {
      await send(path, body, method);
      setMessage("Administrative change recorded.");
      r.refresh();
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {["Users", "Organizations", "Tournaments"].includes(kind) && (
        <form
          className="mvp-form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <Field label={`Search ${kind.toLowerCase()}`}>
            <input value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <button className="button outline">SEARCH</button>
        </form>
      )}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <Notice error>{r.error}</Notice>
      ) : (
        <DataTable caption={kind} headings={["Record", "Status / action", "Context", "Manage"]}>
          {r.data?.map((v) => (
            <tr key={v.id}>
              <td>
                {v.username || v.name || v.operation || v.action}
                <br />
                <code>{v.id}</code>
              </td>
              <td>
                {v.status || v.phase || v.platformRole || v.action}
                {v.restrictedAt ? " · Restricted" : ""}
              </td>
              <td>
                {v.ownerId || v.organizationId || v.resourceId || v.integrationId || "—"}
                {v.createdAt && <p>{date(v.createdAt)}</p>}
              </td>
              <td>
                {["Users", "Organizations", "Tournaments"].includes(kind) && (
                  <button className="button outline" onClick={() => setCaseTarget(v)}>
                    OPEN CASE
                  </button>
                )}
                {admin && ["Users", "Organizations"].includes(kind) ? (
                  <button className="button outline" onClick={() => setSelected(v)}>
                    MANAGE
                  </button>
                ) : admin && ["Audit events", "API usage"].includes(kind) ? (
                  <button
                    className="button outline"
                    onClick={() =>
                      void mutate("/admin/retention-holds", {
                        resourceType: kind === "Audit events" ? "AuditEvent" : "ApiRequest",
                        resourceId: v.id,
                        hold: true,
                      })
                    }
                  >
                    HOLD RECORD
                  </button>
                ) : (
                  "Read only"
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {caseTarget && (
        <form
          className="mvp-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            setError("");
            try {
              await send("/admin/cases", {
                ...values,
                targetType:
                  kind === "Users"
                    ? "USER"
                    : kind === "Organizations"
                      ? "ORGANIZATION"
                      : "TOURNAMENT",
                targetId: caseTarget.id,
              });
              setCaseTarget(null);
              setMessage("Moderation case created. Open the Cases tab to review it.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h3>Open case for {caseTarget.username || caseTarget.name}</h3>
          <Field label="Case category">
            <select name="category">
              {["ABUSE", "FRAUD", "SPAM", "OTHER"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Case evidence summary">
            <textarea name="description" required minLength={10} maxLength={4000} />
          </Field>
          <button className="button primary">CREATE MODERATION CASE</button>
        </form>
      )}
      {selected && (
        <form
          className="mvp-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = Object.fromEntries(new FormData(e.currentTarget));
            if (
              await confirm({
                title: "Apply administrative change?",
                description:
                  kind === "Users"
                    ? "Role changes revoke the target account's sessions."
                    : "The former owner becomes staff; their event grants and existing organization API credentials are revoked.",
                action: "CONFIRM CHANGE",
              })
            )
              await mutate(
                kind === "Users"
                  ? `/admin/users/${selected.id}/role`
                  : `/admin/organizations/${selected.id}/owner`,
                v,
                kind === "Users" ? "PATCH" : "POST",
              );
          }}
        >
          <h3>Manage {selected.username || selected.name}</h3>
          {kind === "Users" ? (
            <Field label="Platform role">
              <select name="platformRole" defaultValue={selected.platformRole}>
                {["NONE", "MODERATOR", "ADMIN"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field
                label="New owner account ID"
                hint="Must be an existing verified organization member."
              >
                <input name="newOwnerId" required maxLength={100} />
              </Field>
              <Field label="Ownership transfer reason">
                <textarea name="reason" required minLength={10} maxLength={2000} />
              </Field>
            </>
          )}
          <button className="button primary">SAVE ADMINISTRATIVE CHANGE</button>
        </form>
      )}
      <Pager page={page} setPage={setPage} next={(r.data?.length || 0) >= 25} />
    </>
  );
}
export default function AdministrationPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("Audit events");
  const admin = user?.platformRole === "ADMIN";
  const items = [
    "Overview",
    "Cases",
    "Disputes",
    "Users",
    "Organizations",
    "Tournaments",
    "Audit events",
    ...(admin ? ["API usage"] : []),
  ];
  return (
    <div className="administration-workspace">
      <PageTitle
        label="PLATFORM / RESTRICTED"
        title="Trust & oversight"
        description="Protect players. Preserve fair competition. Every enforcement action leaves a record."
      />
      {!user?.emailVerifiedAt || !["ADMIN", "MODERATOR"].includes(user.platformRole || "") ? (
        <Notice>Verified platform staff access is required.</Notice>
      ) : (
        <StaffAuthentication>
          <Tabs
            label="Administration views"
            items={items}
            value={tab}
            onChange={setTab}
            panelId="administration-panel"
          />
          <section
            role="tabpanel"
            id="administration-panel"
            aria-labelledby={`administration-panel-tab-${items.indexOf(tab)}`}
          >
            {tab === "Overview" ? (
              <Overview />
            ) : tab === "Cases" ? (
              <Cases admin={admin} />
            ) : tab === "Disputes" ? (
              <AdminDisputes admin={admin} />
            ) : (
              <Records key={tab} kind={tab} admin={admin} />
            )}
          </section>
        </StaffAuthentication>
      )}
    </div>
  );
}

function CaseContext({ id }: { id: string }) {
  const r = useResource<{ target: Record<string, string | null> | null }>(
    `/admin/cases/${id}/context`,
  );
  return (
    <section>
      <h3>Current reported content</h3>
      {r.error && <Notice error>{r.error}</Notice>}
      {r.data?.target ? (
        <dl>
          {Object.entries(r.data.target).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{v || "—"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>No resource attached to this support case.</p>
      )}
    </section>
  );
}

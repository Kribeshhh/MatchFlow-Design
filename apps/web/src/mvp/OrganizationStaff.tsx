import { useState } from "react";
import type { Workspace } from "../../../../packages/shared/src/organizations";
import { useAuth } from "./Auth";
import { send, useResource, date } from "./api";
import { Field, Notice, Loading, ResourceError, Status } from "./UI";
import { DataTable, useConfirm } from "./DesignSystem";
type Member = { userId: string; role: string; user: { id: string; username: string } };
type Invitation = {
  id: string;
  label: string;
  role: string;
  status: string;
  expiresAt: string;
  emailState: string;
};
export const roleLabel = (role: string) =>
  ({ OWNER: "Owner", ADMIN: "Administrator", MANAGER: "Tournament manager", MEMBER: "Staff" })[
    role
  ] || role;
export function OrganizationStaff({
  workspace: w,
  refresh,
}: {
  workspace: Workspace;
  refresh: () => void;
}) {
  const r = useResource<Member[]>(`/organizations/${w.id}/members`);
  const { user } = useAuth();
  const confirm = useConfirm();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const admin = ["OWNER", "ADMIN"].includes(w.access);
  async function action(path: string, data: unknown, method: string, destructive = false) {
    if (
      destructive &&
      !(await confirm({
        title: "Remove staff access?",
        description:
          "This revokes their organization event assignments and pending invitations. Tournament history remains.",
        action: "REMOVE ACCESS",
      }))
    )
      return;
    setError("");
    setBusy(true);
    try {
      await send(path, data, method);
      r.refresh();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>People & permissions</h2>
      <p>
        Owner controls administrators. Administrators manage branding and staff. Tournament managers
        manage all events. Staff manage assigned events only.
      </p>
      {error && <Notice error>{error}</Notice>}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ResourceError message={r.error} retry={r.refresh} />
      ) : (
        <DataTable caption="Workspace membership" headings={["Member", "Access", "Actions"]}>
          {r.data?.map((m) => (
            <tr key={m.userId}>
              <td>{m.user.username}</td>
              <td>{roleLabel(m.role)}</td>
              <td>
                {admin && m.role !== "OWNER" && (w.access === "OWNER" || m.role !== "ADMIN") && (
                  <select
                    aria-label={`Role for ${m.user.username}`}
                    value={m.role}
                    disabled={busy}
                    onChange={(e) =>
                      void action(
                        `/organizations/${w.id}/members/${m.userId}`,
                        { role: e.target.value },
                        "PUT",
                      )
                    }
                  >
                    {w.access === "OWNER" && <option value="ADMIN">Administrator</option>}
                    <option value="MANAGER">Tournament manager</option>
                    <option value="MEMBER">Staff</option>
                  </select>
                )}
                {m.role !== "OWNER" &&
                  (m.userId === user?.id ||
                    (admin && (w.access === "OWNER" || m.role !== "ADMIN"))) && (
                    <button
                      className="mvp-small-button"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          `/organizations/${w.id}/members/${m.userId}`,
                          {},
                          "DELETE",
                          true,
                        )
                      }
                    >
                      {m.userId === user?.id ? "LEAVE" : "REMOVE"}
                      <span className="sr-only"> {m.user.username}</span>
                    </button>
                  )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {admin && (
        <>
          <Invitations workspace={w} />
          <form
            className="mvp-panel mvp-form mvp-section"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget);
              await action(
                `/tournaments/${v.get("tournament")}/permissions/${v.get("member")}`,
                { canManage: v.get("canManage") === "on" },
                "PUT",
              );
            }}
          >
            <h3>Assign tournament staff</h3>
            <Field label="Tournament assignment">
              <select name="tournament" required>
                {w.tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Staff member">
              <select name="member" required>
                {r.data
                  ?.filter((m) => m.role === "MEMBER")
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.username}
                    </option>
                  ))}
              </select>
            </Field>
            <label>
              <input name="canManage" type="checkbox" defaultChecked /> Allow tournament management
            </label>
            <button
              className="button primary"
              disabled={busy || !w.tournaments.length || !r.data?.some((m) => m.role === "MEMBER")}
            >
              SAVE ASSIGNMENT
            </button>
            <p className="mvp-help">
              Assignments include registration review, schedules, announcements and result
              operations. Uncheck to revoke. Managers and administrators already manage all events.
            </p>
          </form>
          <DataTable caption="Explicit tournament assignments" headings={["Tournament", "Staff"]}>
            {w.tournaments.flatMap((t) =>
              (t.permissions || [])
                .filter((p) => p.canManage)
                .map((p) => (
                  <tr key={`${t.id}-${p.userId}`}>
                    <td>{t.name}</td>
                    <td>
                      {r.data?.find((m) => m.userId === p.userId)?.user.username || "Former staff"}
                    </td>
                  </tr>
                )),
            )}
          </DataTable>
        </>
      )}
    </>
  );
}
function Invitations({ workspace: w }: { workspace: Workspace }) {
  const r = useResource<Invitation[]>(`/organizations/${w.id}/invitations`);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(path: string, data: unknown = {}, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await send(path, data, method);
      r.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mvp-section">
      <form
        className="mvp-panel mvp-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget);
          await action(`/organizations/${w.id}/invitations`, {
            recipient: v.get("recipient"),
            role: v.get("role"),
          });
        }}
      >
        <h3>Invite staff</h3>
        {error && <Notice error>{error}</Notice>}
        <Field
          label="Username or email"
          hint="New users must register and verify the invited email before accepting."
        >
          <input name="recipient" required minLength={2} maxLength={254} />
        </Field>
        <Field label="Invitation role">
          <select name="role">
            {w.access === "OWNER" && <option value="ADMIN">Administrator</option>}
            <option value="MANAGER">Tournament manager</option>
            <option value="MEMBER">Staff</option>
          </select>
        </Field>
        <button className="button primary" disabled={busy}>
          SEND INVITATION
        </button>
        {!w.emailAvailable && (
          <Notice>
            SMTP is not configured. Invitations are saved; verified existing recipients can accept
            from their workspace list. Email delivery awaits configuration.
          </Notice>
        )}
        <p className="mvp-help">
          Invitations expire in seven days. Membership changes require a recent sign-in.
        </p>
      </form>
      {r.error ? (
        <ResourceError message={r.error} retry={r.refresh} />
      ) : (
        <DataTable
          caption="Invitations · latest 100"
          headings={["Recipient", "Role", "Status", "Action"]}
        >
          {r.data?.map((i) => (
            <tr key={i.id}>
              <td>{i.label}</td>
              <td>{roleLabel(i.role)}</td>
              <td>
                <Status
                  value={
                    i.status === "PENDING" && new Date(i.expiresAt) < new Date()
                      ? "EXPIRED"
                      : i.status
                  }
                />
                <small>
                  {date(i.expiresAt)} · Email: {i.emailState.toLowerCase()}
                </small>
              </td>
              <td>
                {i.status === "PENDING" && (w.access === "OWNER" || i.role !== "ADMIN") && (
                  <button
                    className="mvp-small-button"
                    disabled={busy}
                    onClick={() =>
                      void action(`/organizations/${w.id}/invitations/${i.id}`, {}, "DELETE")
                    }
                  >
                    CANCEL<span className="sr-only"> {i.label}</span>
                  </button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

import { PortalSettings } from "./PortalSettings";
import { DeveloperWorkspace } from "./DeveloperWorkspace";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Workspace } from "../../../../packages/shared/src/organizations";
import { useAuth } from "./Auth";
import { send, useResource, date } from "./api";
import { Empty, Loading, Notice, PageTitle, ResourceError } from "./UI";
import { Tabs } from "./DesignSystem";
import { OrganizationProfileForm } from "./OrganizationProfileForm";
import { OrganizationStaff, roleLabel } from "./OrganizationStaff";
import { OrganizationAnalytics } from "./OrganizationAnalytics";
import { MediaUpload } from "./MediaUpload";
export default function OrganizationsPage() {
  const { id } = useParams();
  return id ? <WorkspaceDetail key={id} id={id} /> : <OrganizationList />;
}
function OrganizationList() {
  const r = useResource<Workspace[]>("/organizations"),
    invites = useResource<
      { id: string; role: string; expiresAt: string; organization: { id: string; name: string } }[]
    >("/organization-invitations");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  async function respond(id: string, accept: boolean) {
    setBusy(true);
    setError("");
    try {
      await send(`/organization-invitations/${id}/respond`, { accept });
      r.refresh();
      invites.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        label="ORGANIZATION / WORKSPACE"
        title="Built together"
        description="Your community. Your competitions. One shared control room."
      />
      {error && <Notice error>{error}</Notice>}
      {!user?.emailVerifiedAt && (
        <Notice>Verify your account email to view and accept organization invitations.</Notice>
      )}
      {invites.error && <ResourceError message={invites.error} retry={invites.refresh} />}
      {Boolean(invites.data?.length) && (
        <section className="mvp-panel mvp-section">
          <h2>Your organization invitations</h2>
          {invites.data?.map((i) => (
            <div className="mvp-member" key={i.id}>
              <div>
                <strong>{i.organization.name}</strong>
                <small>
                  {roleLabel(i.role)} · expires {date(i.expiresAt)}
                </small>
              </div>
              <div className="mvp-action-row">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void respond(i.id, true)}
                >
                  ACCEPT<span className="sr-only"> {i.organization.name}</span>
                </button>
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => void respond(i.id, false)}
                >
                  REJECT<span className="sr-only"> {i.organization.name}</span>
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ResourceError message={r.error} retry={r.refresh} />
      ) : r.data?.length ? (
        <div className="mvp-team-grid">
          {r.data.map((o) => (
            <Link className="mvp-team-card" key={o.id} to={`/organizations/${o.id}`}>
              <div>
                {o.logoId && <img src={`/api/media/${o.logoId}`} alt="" width={64} height={64} />}
                <span className="eyebrow">{roleLabel(o.access)}</span>
                <h2>{o.name}</h2>
                <p>OPEN WORKSPACE ↗</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="No organization workspace yet">
          <p>Create a home for your school, club or tournament team.</p>
        </Empty>
      )}
      <div className="mvp-section">
        <OrganizationProfileForm onDone={(id) => navigate(`/organizations/${id}`)} />
      </div>
    </>
  );
}
function WorkspaceDetail({ id }: { id: string }) {
  const r = useResource<Workspace>(`/organizations/${id}`);
  const [tab, setTab] = useState("Overview"),
    [saved, setSaved] = useState(false);
  if (r.loading) return <Loading />;
  if (r.error || !r.data)
    return (
      <>
        <ResourceError message={r.error || "Workspace unavailable."} retry={r.refresh} />
        <Link className="button outline" to="/organizations">
          YOUR WORKSPACES
        </Link>
      </>
    );
  const w = r.data,
    admin = ["OWNER", "ADMIN"].includes(w.access),
    manager = admin || w.access === "MANAGER";
  const tabs = ["Overview", "People", ...(admin ? ["Settings", "Portal", "Developers"] : [])];
  const selected = tabs.includes(tab) ? tab : "Overview";
  return (
    <>
      <PageTitle
        label={`ORGANIZATION / ${roleLabel(w.access).toUpperCase()}`}
        title={w.name}
        description={
          w.description || "Coordinate your people, tournaments and next great competition."
        }
      />
      <div className="mvp-action-row">
        {manager && (
          <Link className="button primary" to={`/organizer/tournaments/new?organization=${w.id}`}>
            CREATE ORGANIZATION TOURNAMENT
          </Link>
        )}
        {w.publicProfile && (
          <Link className="button outline" to={`/communities/${w.id}`}>
            PUBLIC PROFILE ↗
          </Link>
        )}
        <Link className="text-button" to="/organizations">
          ALL WORKSPACES
        </Link>
      </div>
      <Tabs
        label="Organization views"
        panelId="organization-panel"
        items={tabs}
        value={selected}
        onChange={(value) => {
          setTab(value);
          setSaved(false);
        }}
      />
      <section
        role="tabpanel"
        id="organization-panel"
        aria-labelledby={`organization-panel-tab-${tabs.indexOf(selected)}`}
      >
        {selected === "Overview" &&
          (manager ? (
            <OrganizationAnalytics id={id} />
          ) : (
            <>
              <h2>Your assigned tournaments</h2>
              <p>
                Staff see only events they are assigned to manage. Organization analytics and
                settings require broader permissions.
              </p>
              {!w.tournaments.length && (
                <Empty title="No event assignments">
                  <p>An administrator can assign your next tournament.</p>
                </Empty>
              )}
              <div className="mvp-team-grid">
                {w.tournaments.map((t) => (
                  <Link className="mvp-team-card" key={t.id} to={`/organizer/tournaments/${t.id}`}>
                    <div>
                      <h3>{t.name}</h3>
                      <p>{date(t.startsAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ))}
        {selected === "People" && <OrganizationStaff workspace={w} refresh={r.refresh} />}
        {selected === "Portal" && admin && <PortalSettings workspace={w} />}
        {selected === "Developers" && admin && <DeveloperWorkspace workspace={w} />}
        {selected === "Settings" && admin && (
          <>
            {saved && <Notice>Organization settings saved.</Notice>}
            <OrganizationProfileForm
              key={w.id}
              organization={w}
              onDone={() => {
                setSaved(true);
                r.refresh();
              }}
            />
            <MediaUpload
              path={`/organizations/${id}/logo`}
              label="Organization logo"
              current={w.logoId ? `/api/media/${w.logoId}` : null}
              onChange={r.refresh}
            />
          </>
        )}
      </section>
    </>
  );
}

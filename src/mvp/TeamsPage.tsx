import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, UserPlus, X } from "lucide-react";
import { games } from "../data";
import { teamSchema } from "../../shared/validation";
import { api, send, useResource, gameName, type Team, type User } from "./api";
import { useAuth } from "./Auth";
import { TeamCard } from "./DashboardPage";
import { PageTitle, Field, Notice, Loading, ResourceError, Empty } from "./UI";
export function TeamsPage() {
  const r = useResource<Team[]>("/teams");
  return (
    <>
      <PageTitle
        label="PLAYER HUB"
        title="My teams"
        description="Create your roster once. Bring it to your next tournament."
        action={
          <Link to="/teams/new" className="button primary">
            <Plus size={16} />
            CREATE TEAM
          </Link>
        }
      />
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ResourceError message={r.error} retry={r.refresh} />
      ) : r.data?.length ? (
        <div className="mvp-team-grid">
          {r.data.map((t) => (
            <TeamCard team={t} key={t.id} />
          ))}
        </div>
      ) : (
        <Empty title="No teams yet">
          <p>Start with a name, choose a game, and add your teammates.</p>
        </Empty>
      )}
    </>
  );
}
export function CreateTeamPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        label="TEAMS / NEW ROSTER"
        title="Build your team"
        description="You become the captain and the first member of your team."
      />
      <form
        className="mvp-panel mvp-form mvp-form-width"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            const input = teamSchema.parse(
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            const t = await send<Team>("/teams", input);
            navigate(`/teams/${t.id}`);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Notice error>{error}</Notice>}
        <Field label="Team name">
          <input
            name="name"
            minLength={3}
            maxLength={60}
            required
            placeholder="e.g. Valley Voyagers"
          />
        </Field>
        <Field label="Game">
          <select name="game">
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Team description (optional)">
          <textarea name="description" maxLength={500} rows={3} />
        </Field>
        <Field
          label="Team logo URL (optional)"
          hint="Use an HTTPS image URL. No file uploads are stored in the MVP."
        >
          <input
            name="logoUrl"
            type="url"
            placeholder="https://…"
            maxLength={500}
          />
        </Field>
        <button className="button primary" disabled={busy}>
          {busy ? "CREATING…" : "CREATE TEAM"}
          <Plus size={16} />
        </button>
      </form>
    </>
  );
}
export function TeamDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const r = useResource<Team>(`/teams/${id}`);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (r.loading) return <Loading />;
  if (r.error || !r.data)
    return <ResourceError message={r.error} retry={r.refresh} />;
  const team = r.data;
  const captain = team.captainId === user?.id;
  async function mutate(path: string, body: unknown, method = "POST") {
    setError("");
    setBusy(true);
    try {
      await send(path, body, method);
      setNotice("Roster updated.");
      setUsers([]);
      setSearched(false);
      r.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        label={`TEAMS / ${gameName(team.game).toUpperCase()}`}
        title={team.name}
        description={
          team.description ||
          `${team.members.length} members · Captain ${team.captain.username}`
        }
        action={
          <Link
            className="button outline"
            to={`/tournaments?game=${team.game}`}
          >
            FIND TOURNAMENTS
          </Link>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {team.locked && (
        <Notice>
          This roster is locked while it has a pending or approved entry in an
          unfinished tournament. Ask the organizer to remove the entry before
          making changes.
        </Notice>
      )}
      <div className="mvp-two-column">
        <section className="mvp-panel">
          <h2>
            Roster <span className="mvp-count">{team.members.length}</span>
          </h2>
          {team.members.map((m) => (
            <div className="mvp-member" key={m.userId}>
              <span className="mvp-avatar">
                {m.user.username.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{m.user.username}</strong>
                <small>
                  {m.userId === team.captainId ? "TEAM CAPTAIN" : "PLAYER"}
                </small>
              </div>
              {captain && m.userId !== team.captainId && !team.locked && (
                <button
                  className="mvp-small-button danger"
                  disabled={busy}
                  aria-label={`Remove ${m.user.username}`}
                  onClick={() =>
                    void mutate(
                      `/teams/${id}/members/${m.userId}`,
                      {},
                      "DELETE",
                    )
                  }
                >
                  <X size={14} />
                  REMOVE
                </button>
              )}
            </div>
          ))}
        </section>
        {captain && (
          <section className="mvp-panel">
            <h2>Add a teammate</h2>
            <p>Find an existing MatchFlow player by username.</p>
            <form
              className="mvp-inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setBusy(true);
                try {
                  setUsers(
                    await api<User[]>(`/users?q=${encodeURIComponent(query)}`),
                  );
                  setSearched(true);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input
                aria-label="Search players by username"
                placeholder="Username (at least 2 characters)"
                minLength={2}
                maxLength={24}
                required
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={team.locked}
              />
              <button className="button primary" disabled={busy || team.locked}>
                SEARCH
              </button>
            </form>
            {searched && !users.length && <p>No matching players found.</p>}
            {users.map((u) => (
              <div className="mvp-member" key={u.id}>
                <strong>{u.username}</strong>
                {team.members.some((m) => m.userId === u.id) ? (
                  <small>ALREADY A MEMBER</small>
                ) : (
                  <button
                    className="mvp-small-button"
                    disabled={busy || team.locked}
                    onClick={() =>
                      void mutate(`/teams/${id}/members`, { userId: u.id })
                    }
                  >
                    <UserPlus size={15} />
                    ADD
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}

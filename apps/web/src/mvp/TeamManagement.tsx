import { MediaUpload } from "./MediaUpload";
import { games } from "../data";
import { CompetitionHistory, type History } from "./CompetitionHistory";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./Auth";
import { date, send, useResource, type Team } from "./api";
import { useConfirm } from "./DesignSystem";
import { Field, Notice, ResourceError } from "./UI";
import type { TeamInvitation as Invitation } from "../../../../packages/shared/src/responses";
export function TeamInvitations({ onChange, teamId }: { onChange: () => void; teamId?: string }) {
  const r = useResource<Invitation[]>(
    teamId ? `/teams/${teamId}/invitations` : "/team-invitations",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function respond(id: string, accept: boolean) {
    setBusy(true);
    setError("");
    try {
      await send(
        teamId ? `/teams/${teamId}/invitations/${id}` : `/team-invitations/${id}/respond`,
        { accept },
        teamId ? "DELETE" : "POST",
      );
      r.refresh();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (r.error) return <ResourceError message={r.error} retry={r.refresh} />;
  if (!r.data?.length) return null;
  return (
    <section className="mvp-panel mvp-section">
      <h2>{teamId ? "Pending invitations" : "Your team invitations"}</h2>
      {error && <Notice error>{error}</Notice>}
      {r.data.map((i) => (
        <div className="mvp-member" key={i.id}>
          <div>
            <strong>{teamId ? i.user.username : i.team.name}</strong>
            <small>Expires {date(i.expiresAt)}</small>
          </div>
          {!teamId && (
            <button
              disabled={busy}
              className="mvp-small-button"
              onClick={() => void respond(i.id, true)}
            >
              ACCEPT INVITATION
            </button>
          )}
          <button
            disabled={busy}
            className="mvp-small-button"
            onClick={() => void respond(i.id, false)}
          >
            {teamId ? "CANCEL INVITATION" : "REJECT INVITATION"}
          </button>
        </div>
      ))}
    </section>
  );
}
export function TeamManagement({ team, onChange }: { team: Team; onChange: () => void }) {
  const history = useResource<History>(`/teams/${team.id}/history`);
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const captain = team.captainId === user?.id;
  const manager = captain || team.members.some((m) => m.userId === user?.id && m.manager);
  async function act(path: string, data: unknown = {}, method = "POST", leaving = false) {
    setError("");
    setBusy(true);
    try {
      await send(`/teams/${team.id}${path ? `/${path}` : ""}`, data, method);
      if (leaving) navigate("/teams");
      else onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      {team.archivedAt ? (
        <Notice>This team is archived. Its tournament history is retained.</Notice>
      ) : (
        <section className="mvp-panel mvp-section">
          {manager && !team.locked && (
            <details className="mvp-team-edit">
              <summary>Edit team identity</summary>
              <form
                className="mvp-form mvp-section"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("", Object.fromEntries(new FormData(e.currentTarget)), "PATCH");
                }}
              >
                <h2>Team identity</h2>
                <Field label="Team name">
                  <input
                    name="name"
                    defaultValue={team.name}
                    minLength={3}
                    maxLength={60}
                    required
                  />
                </Field>
                <Field
                  label="Primary game"
                  hint="Once a team has tournament history, its game cannot change."
                >
                  <select name="game" defaultValue={team.game}>
                    {games.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Region">
                  <input name="region" defaultValue={team.region || ""} maxLength={80} />
                </Field>
                <Field label="Description">
                  <textarea name="description" defaultValue={team.description} maxLength={500} />
                </Field>
                <button className="button primary" disabled={busy}>
                  SAVE TEAM
                </button>
              </form>
            </details>
          )}
          <h2>Team permissions</h2>
          <p>
            Only the captain can assign managers or offer captain ownership. Transfers expire after
            24 hours and require the recipient’s acceptance and a recent sign-in.
          </p>
          {manager &&
            !team.locked &&
            team.members
              .filter((m) => m.userId !== team.captainId)
              .map((m) => (
                <div className="mvp-member" key={m.userId}>
                  <strong>{m.user.username}</strong>
                  {(captain || !m.manager) && (
                    <button
                      disabled={busy}
                      className="mvp-small-button"
                      onClick={() =>
                        void act(`members/${m.userId}`, { substitute: !m.substitute }, "PATCH")
                      }
                    >
                      {m.substitute ? "MAKE STARTER" : "MAKE SUBSTITUTE"}
                    </button>
                  )}
                  {captain && (
                    <>
                      <button
                        disabled={busy}
                        className="mvp-small-button"
                        onClick={() =>
                          void act(`members/${m.userId}`, { manager: !m.manager }, "PATCH")
                        }
                      >
                        {m.manager ? "REMOVE MANAGER" : "MAKE MANAGER"}
                      </button>
                      <button
                        disabled={busy}
                        className="mvp-small-button"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Offer captain ownership?",
                              description: `If ${m.user.username} accepts, you will lose captain permissions.`,
                              action: "OFFER TRANSFER",
                            })
                          )
                            void act("transfer", { userId: m.userId });
                        }}
                      >
                        OFFER CAPTAIN TRANSFER
                      </button>
                    </>
                  )}
                </div>
              ))}
          {team.transferToId &&
            team.transferExpiresAt &&
            new Date(team.transferExpiresAt) > new Date() && (
              <Notice>
                Captain transfer pending until {date(team.transferExpiresAt)}.{" "}
                {captain && (
                  <button
                    className="mvp-small-button"
                    disabled={busy}
                    onClick={() => void act("transfer", {}, "DELETE")}
                  >
                    CANCEL TRANSFER
                  </button>
                )}
              </Notice>
            )}
          {team.transferToId === user?.id && (
            <div className="mvp-inline-form">
              <button
                disabled={busy}
                className="button primary"
                onClick={() => void act("transfer/respond", { accept: true })}
              >
                ACCEPT CAPTAIN OWNERSHIP
              </button>
              <button
                disabled={busy}
                className="button outline"
                onClick={() => void act("transfer/respond", { accept: false })}
              >
                REJECT TRANSFER
              </button>
            </div>
          )}
          <button
            disabled={busy}
            className="button outline danger"
            onClick={async () => {
              if (
                await confirm({
                  title: captain ? "Archive this team?" : "Leave this team?",
                  description:
                    "Saved tournament rosters and results are retained. Rejoining requires a new invitation.",
                  action: captain ? "ARCHIVE TEAM" : "LEAVE TEAM",
                })
              )
                void act(captain ? "archive" : "leave", {}, "POST", !captain);
            }}
          >
            {captain ? "ARCHIVE TEAM" : "LEAVE TEAM"}
          </button>
        </section>
      )}
      {manager && !team.archivedAt && (
        <MediaUpload
          path={`/teams/${team.id}/logo`}
          label="Team logo"
          current={team.logoUrl}
          onChange={onChange}
        />
      )}
      {history.data && <CompetitionHistory data={history.data} />}
      {manager && !team.archivedAt && <TeamInvitations teamId={team.id} onChange={onChange} />}
    </>
  );
}

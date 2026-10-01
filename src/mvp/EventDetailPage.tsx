import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Trophy, GitBranch, CalendarDays, Check, X, Users } from "lucide-react";
import { GameLogo } from "../Art";
import { useAuth } from "./Auth";
import {
  date,
  localInput,
  send,
  useResource,
  gameName,
  type Event,
  type Team,
  type Match,
} from "./api";
import {
  PageTitle,
  Loading,
  ResourceError,
  Notice,
  Empty,
  Field,
  MatchList,
  Status,
} from "./UI";

export function LiveBracket({ event }: { event: Event }) {
  const [highlight, setHighlight] = useState<string | null>(null);
  if (!event.matches.length)
    return (
      <Empty title="The bracket is taking shape">
        <p>The organizer will generate the bracket from approved teams.</p>
      </Empty>
    );
  const last = Math.max(...event.matches.map((m) => m.round));
  return (
    <>
      <div
        className="mvp-bracket-scroll"
        tabIndex={0}
        aria-label="Tournament bracket. Scroll horizontally to see all rounds."
      >
        <div className="mvp-real-bracket">
          {Array.from({ length: last }, (_, i) => i + 1).map((round) => (
            <div className="mvp-round" key={round}>
              <h3>
                {round === last
                  ? "FINAL"
                  : round === last - 1
                    ? "SEMI FINALS"
                    : `ROUND ${round}`}
              </h3>
              <div className="mvp-round-matches">
                {event.matches
                  .filter((m) => m.round === round)
                  .map((m) => (
                    <div
                      className={`mvp-bracket-match ${m.winnerId ? "has-winner" : ""}`}
                      key={m.id}
                    >
                      <span className="mvp-bracket-label">
                        MATCH {m.position + 1} · {m.isBye ? "BYE" : m.status}
                      </span>
                      {(
                        [
                          ["A", m.teamA, m.scoreA],
                          ["B", m.teamB, m.scoreB],
                        ] as const
                      ).map(([side, team, score]) => (
                        <button
                          key={side}
                          type="button"
                          aria-label={
                            team
                              ? `${team.name}${m.winnerId === team.id ? ", winner" : ""}`
                              : m.isBye
                                ? "Bye"
                                : "Awaiting previous winner"
                          }
                          className={`${team && m.winnerId === team.id ? "won" : ""} ${team && highlight === team.id ? "highlight" : ""}`}
                          onFocus={() => setHighlight(team?.id || null)}
                          onBlur={() => setHighlight(null)}
                          onMouseEnter={() => setHighlight(team?.id || null)}
                          onMouseLeave={() => setHighlight(null)}
                        >
                          <span>
                            {team?.name ||
                              (m.isBye ? "BYE" : "Awaiting winner")}
                          </span>
                          <b>{score ?? "—"}</b>
                        </button>
                      ))}
                      {m.scheduledAt && (
                        <span className="mvp-bracket-date">
                          {date(m.scheduledAt)}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mvp-help">
        Winners advance automatically. Hover or focus a team to trace its
        progress. BYEs advance without a score.
      </p>
    </>
  );
}
function RegisterTeam({ event, onDone }: { event: Event; onDone: () => void }) {
  const { user } = useAuth();
  const r = useResource<Team[]>("/teams");
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const available =
    r.data?.filter((t) => t.game === event.game && t.captainId === user?.id) ||
    [];
  const selected = available.find((t) => t.id === teamId);
  return (
    <section className="mvp-panel">
      <h2>Register your team</h2>
      <p>
        Select an existing {gameName(event.game)} roster with exactly{" "}
        {event.teamSize} players. Your entry is reviewed by the organizer.
      </p>
      {error && <Notice error>{error}</Notice>}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ResourceError message={r.error} retry={r.refresh} />
      ) : available.length ? (
        <form
          className="mvp-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await send(`/tournaments/${event.id}/registrations`, { teamId });
              onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Your team">
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              required
            >
              <option value="">Select a team</option>
              {available.map((t) => (
                <option
                  value={t.id}
                  key={t.id}
                  disabled={
                    t.members.length !== event.teamSize ||
                    event.registrations.some((r) => r.teamId === t.id)
                  }
                >
                  {t.name} · {t.members.length}/{event.teamSize} players
                  {event.registrations.some((r) => r.teamId === t.id)
                    ? " · Already submitted"
                    : ""}
                </option>
              ))}
            </select>
          </Field>
          {selected && (
            <div className="mvp-roster-preview">
              <span className="eyebrow">ROSTER LOADED AUTOMATICALLY</span>
              {selected.members.map((m) => (
                <span key={m.userId}>
                  <Check size={13} />
                  {m.user.username}
                </span>
              ))}
            </div>
          )}
          <button className="button primary" disabled={busy || !selected}>
            {busy ? "SUBMITTING…" : "SUBMIT FOR APPROVAL"}
          </button>
        </form>
      ) : (
        <p>You do not captain a team for this game yet.</p>
      )}
      <Link className="mvp-small-link" to="/teams">
        MANAGE YOUR TEAMS ↗
      </Link>
    </section>
  );
}
function ManualRegistration({
  event,
  onDone,
}: {
  event: Event;
  onDone: () => void;
}) {
  const r = useResource<Team[]>(`/teams?eligibleFor=${event.id}`);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="mvp-panel">
      <summary>Manually add an eligible team</summary>
      <p>
        Use an existing matching roster. Manual entries are approved
        immediately.
      </p>
      {r.error && <Notice error>{r.error}</Notice>}
      {error && <Notice error>{error}</Notice>}
      <form
        className="mvp-inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await send(`/tournaments/${event.id}/manual-registration`, {
              teamId: selected,
            });
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <select
          aria-label="Eligible team"
          required
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Select a team</option>
          {r.data?.map((t) => (
            <option value={t.id} key={t.id}>
              {t.name} · Captain {t.captain.username}
            </option>
          ))}
        </select>
        <button className="button primary" disabled={busy || !selected}>
          ADD TEAM
        </button>
      </form>
      {!r.loading && !r.data?.length && (
        <p>No unregistered rosters match the game and team size.</p>
      )}
    </details>
  );
}
function MatchEditor({
  match,
  event,
  onDone,
}: {
  match: Match;
  event: Event;
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(path: string, data: unknown, method = "POST") {
    setError("");
    setBusy(true);
    try {
      await send(path, data, method);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mvp-match-editor">
      <summary>
        <span>
          <small>
            ROUND {match.round} / MATCH {match.position + 1}
          </small>
          <strong>
            {match.teamA?.name || "Awaiting winner"}{" "}
            <span className="muted">vs</span>{" "}
            {match.teamB?.name || "Awaiting winner"}
          </strong>
        </span>
        <Status value={match.status} />
      </summary>
      {error && <Notice error>{error}</Notice>}
      <div className="mvp-match-editor-body">
        <form
          className="mvp-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Object.fromEntries(new FormData(e.currentTarget));
            void save(
              `/tournaments/${event.id}/matches/${match.id}/schedule`,
              {
                scheduledAt: new Date(String(v.scheduledAt)).toISOString(),
                venue: v.venue,
              },
              "PATCH",
            );
          }}
        >
          <h3>
            <CalendarDays size={17} /> Match schedule
          </h3>
          <Field label="Date and time">
            <input
              name="scheduledAt"
              type="datetime-local"
              required
              min={localInput(event.startsAt)}
              defaultValue={localInput(match.scheduledAt || event.startsAt)}
            />
          </Field>
          <Field label="Server / room / venue (optional)">
            <input name="venue" maxLength={200} defaultValue={match.venue} />
          </Field>
          <button className="button outline" disabled={busy}>
            SAVE SCHEDULE
          </button>
        </form>
        <form
          className="mvp-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Object.fromEntries(new FormData(e.currentTarget));
            void save(`/tournaments/${event.id}/matches/${match.id}/result`, {
              scoreA: Number(v.scoreA),
              scoreB: Number(v.scoreB),
            });
          }}
        >
          <h3>
            <Trophy size={17} /> Record result
          </h3>
          <p>Saving a result is final and advances the winner automatically.</p>
          <div className="mvp-form-grid">
            <Field label={match.teamA?.name || "Team A"}>
              <input
                name="scoreA"
                type="number"
                min={0}
                max={999}
                step={1}
                required
                disabled={!match.teamA || !match.teamB}
              />
            </Field>
            <Field label={match.teamB?.name || "Team B"}>
              <input
                name="scoreB"
                type="number"
                min={0}
                max={999}
                step={1}
                required
                disabled={!match.teamA || !match.teamB}
              />
            </Field>
          </div>
          {(!match.teamA || !match.teamB) && (
            <p>
              Both opponents must advance before you can record this result.
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || !match.teamA || !match.teamB}
          >
            SAVE RESULT & ADVANCE
          </button>
        </form>
      </div>
    </details>
  );
}
export default function EventDetailPage({
  manage = false,
}: {
  manage?: boolean;
}) {
  const { id } = useParams();
  const { user } = useAuth();
  const r = useResource<Event>(`/tournaments/${id}`);
  const [params, setParams] = useSearchParams();
  const tabs = manage
    ? ["Overview", "Registrations", "Teams", "Bracket", "Matches", "Results"]
    : ["Overview", "Teams", "Bracket", "Schedule", "Results"];
  const requested = params.get("tab") || "Overview";
  const tab = tabs.includes(requested) ? requested : "Overview";
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (r.loading) return <Loading />;
  if (r.error || !r.data)
    return <ResourceError message={r.error} retry={r.refresh} />;
  const t = r.data;
  if (manage && t.organizerId !== user?.id)
    return <Notice error>You can only manage tournaments you own.</Notice>;
  const completed = t.matches.filter(
    (m) => m.status === "COMPLETED" && !m.isBye,
  );
  const approved = t.registrations.filter((r) => r.status === "APPROVED");
  const own = t.registrations.filter((r) =>
    r.roster.some((m) => m.id === user?.id),
  );
  async function action(
    path: string,
    body: unknown = {},
    method = "POST",
    message = "Saved successfully.",
  ) {
    setError("");
    setBusy(true);
    try {
      await send(path, body, method);
      setNotice(message);
      r.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function done(message = "Saved successfully.") {
    setNotice(message);
    r.refresh();
  }
  return (
    <>
      <PageTitle
        label={`${manage ? "CONTROL ROOM" : "TOURNAMENT"} / ${gameName(t.game).toUpperCase()}`}
        title={t.name}
        description={`Hosted by ${t.organizer.username} · Single elimination`}
        action={
          manage ? (
            <Link className="button outline" to={`/tournaments/${t.id}`}>
              PUBLIC TOURNAMENT PAGE ↗
            </Link>
          ) : user?.id === t.organizerId ? (
            <Link
              className="button primary"
              to={`/organizer/tournaments/${t.id}`}
            >
              MANAGE TOURNAMENT ↗
            </Link>
          ) : null
        }
      />
      <div className="mvp-event-strip">
        <Status value={t.status} />
        <span>
          <Users size={15} />
          {t.registeredCount} / {t.maxTeams} entries
        </span>
        <span>{t.teamSize} players per team</span>
        <span>
          <CalendarDays size={15} />
          {date(t.startsAt)}
        </span>
      </div>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {t.champion && (
        <div className="mvp-champion">
          <Trophy size={37} />
          <div>
            <span className="eyebrow">TOURNAMENT CHAMPION</span>
            <h2>{t.champion.name}</h2>
            <p>The final is complete. The crown is theirs.</p>
          </div>
        </div>
      )}
      <nav className="mvp-tabs" aria-label="Tournament sections">
        {tabs.map((label) => (
          <button
            key={label}
            className={label === tab ? "active" : ""}
            aria-current={label === tab ? "page" : undefined}
            onClick={() => setParams({ tab: label })}
          >
            {label}
            {label === "Registrations" && (
              <span>
                {t.registrations.filter((r) => r.status === "PENDING").length}
              </span>
            )}
          </button>
        ))}
      </nav>
      {tab === "Overview" && (
        <div className="mvp-two-column">
          <div className="mvp-panel">
            <h2>About the tournament</h2>
            <p className="mvp-prose">{t.description}</p>
            <h3>Rules</h3>
            <p className="mvp-prose">{t.rules}</p>
          </div>
          <div className="mvp-stack">
            <div className="mvp-panel">
              <div className="mvp-detail-game">
                <GameLogo game={t.game} />
              </div>
              <dl className="mvp-facts">
                <div>
                  <dt>Registration opens</dt>
                  <dd>{date(t.opensAt)}</dd>
                </div>
                <div>
                  <dt>Registration closes</dt>
                  <dd>{date(t.closesAt)}</dd>
                </div>
                <div>
                  <dt>Tournament date</dt>
                  <dd>{date(t.startsAt)}</dd>
                </div>
                <div>
                  <dt>Approved teams</dt>
                  <dd>
                    {approved.length} / {t.maxTeams}
                  </dd>
                </div>
                <div>
                  <dt>Team size</dt>
                  <dd>{t.teamSize} players including captain</dd>
                </div>
              </dl>
            </div>
            {!manage &&
              own.map((reg) => (
                <Notice key={reg.id}>
                  <strong>{reg.team.name}</strong> ·{" "}
                  <Status value={reg.status} />
                  <p>
                    {reg.status === "PENDING"
                      ? "Your roster was submitted. Waiting for organizer approval."
                      : reg.status === "APPROVED"
                        ? "Your team is approved. Follow the bracket and schedule for your next match."
                        : "This entry was rejected. Contact the organizer before trying again."}
                  </p>
                </Notice>
              ))}
            {!manage &&
              t.status === "REGISTRATION_OPEN" &&
              (user?.role === "PLAYER" ? (
                <RegisterTeam
                  event={t}
                  onDone={() =>
                    done("Registration submitted. Pending organizer approval.")
                  }
                />
              ) : !user ? (
                <Link
                  className="button primary"
                  to={`/login?next=${encodeURIComponent(`/tournaments/${t.id}`)}`}
                >
                  LOG IN TO REGISTER YOUR TEAM ↗
                </Link>
              ) : (
                <p className="mvp-help">
                  Players register teams. Organizer accounts manage events.
                </p>
              ))}
            {manage && (
              <div className="mvp-panel">
                <h3>Your next step</h3>
                <p>
                  {t.phase === "REGISTRATION"
                    ? "Review each entry, then generate a bracket from approved teams."
                    : t.phase === "ONGOING"
                      ? "Schedule matches and record scores. Winners advance automatically."
                      : "The champion has been declared. Results remain available to everyone."}
                </p>
                <button
                  className="button primary"
                  onClick={() =>
                    setParams({
                      tab:
                        t.phase === "REGISTRATION"
                          ? "Registrations"
                          : t.phase === "ONGOING"
                            ? "Matches"
                            : "Results",
                    })
                  }
                >
                  OPEN{" "}
                  {t.phase === "REGISTRATION"
                    ? "REGISTRATIONS"
                    : t.phase === "ONGOING"
                      ? "MATCHES"
                      : "RESULTS"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "Registrations" && manage && (
        <>
          <div className="mvp-section-title">
            <h2>Team registrations</h2>
            <span className="mvp-help">Pending entries reserve capacity.</span>
          </div>
          {!t.registrations.length && (
            <Empty title="Ready for your first team">
              <p>
                Share the public tournament page to start receiving entries.
              </p>
            </Empty>
          )}
          <div className="mvp-registration-list">
            {t.registrations.map((reg) => (
              <div className="mvp-panel" key={reg.id}>
                <div className="mvp-section-title">
                  <h3>{reg.team.name}</h3>
                  <Status value={reg.status} />
                </div>
                <p>
                  Captain {reg.team.captain.username} · {date(reg.createdAt)}
                </p>
                <div className="mvp-roster-preview">
                  {reg.roster.map((m) => (
                    <span key={m.id}>{m.username}</span>
                  ))}
                </div>
                {t.phase === "REGISTRATION" && (
                  <div className="mvp-action-row">
                    {reg.status === "PENDING" && (
                      <button
                        className="mvp-small-button"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            `/tournaments/${id}/registrations/${reg.id}`,
                            { status: "APPROVED" },
                            "PATCH",
                            "Team approved.",
                          )
                        }
                      >
                        <Check size={15} />
                        APPROVE
                      </button>
                    )}
                    {reg.status !== "REJECTED" && (
                      <button
                        className="mvp-small-button"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            `/tournaments/${id}/registrations/${reg.id}`,
                            { status: "REJECTED" },
                            "PATCH",
                            "Team rejected.",
                          )
                        }
                      >
                        <X size={15} />
                        REJECT
                      </button>
                    )}
                    <button
                      className="mvp-small-button danger"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          `/tournaments/${id}/registrations/${reg.id}`,
                          {},
                          "DELETE",
                          "Registration removed. The team may submit again.",
                        )
                      }
                    >
                      REMOVE
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {t.status === "REGISTRATION_OPEN" && (
            <ManualRegistration
              event={t}
              onDone={() => done("Team manually approved.")}
            />
          )}
        </>
      )}
      {tab === "Teams" && (
        <>
          {approved.length ? (
            <div className="mvp-team-grid">
              {approved.map((reg) => (
                <div className="mvp-panel" key={reg.id}>
                  <h3>{reg.team.name}</h3>
                  <p>Captain {reg.team.captain.username}</p>
                  <div className="mvp-roster-preview">
                    {reg.roster.map((m) => (
                      <span key={m.id}>{m.username}</span>
                    ))}
                  </div>
                  <Status value="APPROVED" />
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No approved teams yet">
              <p>Accepted team rosters will appear here.</p>
            </Empty>
          )}
        </>
      )}
      {tab === "Bracket" && (
        <>
          {manage && !t.matches.length && (
            <div className="mvp-panel mvp-bracket-action">
              <GitBranch size={28} />
              <h2>Ready for the first matchup?</h2>
              <p>
                {approved.length} approved teams. Review all pending entries
                first. Generating the bracket closes registration and locks the
                team list. BYEs advance automatically.
              </p>
              <button
                className="button primary"
                disabled={
                  busy ||
                  approved.length < 2 ||
                  t.registrations.some((r) => r.status === "PENDING")
                }
                onClick={() =>
                  void action(
                    `/tournaments/${id}/bracket`,
                    {},
                    "POST",
                    "Bracket generated. Registration is now closed.",
                  )
                }
              >
                GENERATE BRACKET
              </button>
            </div>
          )}
          <LiveBracket event={t} />
        </>
      )}
      {tab === "Schedule" && (
        <MatchList
          matches={t.matches.filter((m) => m.status === "SCHEDULED")}
        />
      )}
      {tab === "Matches" && manage && (
        <>
          <p className="mvp-help">
            Schedule using your local timezone. Later rounds can be scheduled
            before their opponents are known. Results are final.
          </p>
          {!t.matches.length ? (
            <Empty title="Generate your bracket first">
              <button
                className="button outline"
                onClick={() => setParams({ tab: "Bracket" })}
              >
                OPEN BRACKET
              </button>
            </Empty>
          ) : (
            t.matches
              .filter((m) => m.status !== "COMPLETED")
              .map((m) => (
                <MatchEditor
                  key={m.id}
                  match={m}
                  event={t}
                  onDone={() =>
                    done("Match saved. Bracket and schedules are up to date.")
                  }
                />
              ))
          )}
          {t.matches.length > 0 &&
            !t.matches.some((m) => m.status !== "COMPLETED") && (
              <Notice>
                All matches are complete. View the champion above and final
                results in the Results tab.
              </Notice>
            )}
        </>
      )}
      {tab === "Results" && <MatchList matches={completed} results />}
    </>
  );
}

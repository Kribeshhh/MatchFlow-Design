import { ReportLink } from "./ReportLink";
import { LiveStatus } from "./LiveProvider";
import { LiveScoreForm } from "./LiveScoreForm";
import { BracketViewport } from "./BracketViewport";
import { MatchControls } from "./MatchControls";
import { EngineReview } from "./EngineReview";
import { BattleView } from "./BattleView";
import { SeedingControls } from "./SeedingControls";
import { ResultFields, resultInput } from "./ResultFields";
import { TournamentOperations } from "./TournamentOperations";
import { formatNames } from "./TournamentFields";
import { RosterChange } from "./RosterChange";
import { CalendarDays, Check, Trophy, Users, X } from "lucide-react";
import { Tabs, Toast, useConfirm } from "./DesignSystem";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { GameLogo } from "../Art";
import {
  date,
  gameName,
  localInput,
  send,
  useResource,
  type Event,
  type Match,
  type Team,
} from "./api";
import { useAuth } from "./Auth";
import { Empty, Field, Loading, MatchList, Notice, PageTitle, ResourceError, Status } from "./UI";

export function LiveBracket({ event }: { event: Event }) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const [stageId, setStageId] = useState("");
  const visibleMatches = event.matches.filter((m) => !stageId || m.stageId === stageId);
  if (!event.matches.length)
    return (
      <Empty title="The bracket is taking shape">
        <p>The organizer will generate the bracket from approved teams.</p>
      </Empty>
    );
  const last = Math.max(...visibleMatches.map((m) => m.round));
  const rounds = [...new Set(visibleMatches.map((m) => m.round))];
  return (
    <>
      {event.stages.length > 1 && (
        <Field label="Bracket stage">
          <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">All stages</option>
            {event.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <BracketViewport>
        <div className="mvp-real-bracket">
          {rounds.map((round) => (
            <div className="mvp-round" key={round}>
              <h3>
                {event.format === "SINGLE_ELIMINATION"
                  ? round === last
                    ? "FINAL"
                    : round === last - 1
                      ? "SEMI FINALS"
                      : `ROUND ${round}`
                  : `${visibleMatches.find((m) => m.round === round)?.bracket.replaceAll("_", " ")} · ROUND ${round}`}
              </h3>
              <div className="mvp-round-matches">
                {visibleMatches
                  .filter((m) => m.round === round)
                  .map((m) => (
                    <div
                      className={`mvp-bracket-match ${m.winnerId ? "has-winner" : ""}`}
                      key={m.id}
                    >
                      <span className="mvp-bracket-label">
                        MATCH {m.position + 1} ·{" "}
                        {m.isBye ? "BYE" : m.status === "COMPLETED" ? m.outcome : m.status}
                      </span>
                      {(
                        [
                          ["A", m.teamA, m.status === "COMPLETED" ? m.scoreA : m.liveScoreA],
                          ["B", m.teamB, m.status === "COMPLETED" ? m.scoreB : m.liveScoreB],
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
                          <span>{team?.name || (m.isBye ? "BYE" : "Awaiting winner")}</span>
                          <b>{score ?? "—"}</b>
                        </button>
                      ))}
                      {(m.sourceAId || m.sourceBId) && (
                        <span className="mvp-bracket-date">
                          {(["A", "B"] as const).map((side) => {
                            const source = event.matches.find(
                              (source) => source.id === (side === "A" ? m.sourceAId : m.sourceBId),
                            );
                            return source
                              ? `${side}: ${(side === "A" ? m.sourceAOutcome : m.sourceBOutcome)?.toLowerCase()} R${source.round}/M${source.position + 1} `
                              : "";
                          })}
                        </span>
                      )}
                      {m.status !== "COMPLETED" && m.liveScoreA !== null && (
                        <span className="mvp-live-score">LIVE · PROVISIONAL</span>
                      )}
                      {m.scheduledAt && (
                        <span className="mvp-bracket-date">{date(m.scheduledAt)}</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </BracketViewport>
      <p className="mvp-help">
        Winners advance automatically. Hover or focus a team to trace its progress. BYEs advance
        without a score.
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
    r.data?.filter(
      (t) =>
        !t.archivedAt &&
        t.game === event.game &&
        (t.captainId === user?.id || t.members.some((m) => m.userId === user?.id && m.manager)),
    ) || [];
  const selected = available.find((t) => t.id === teamId);
  return (
    <section className="mvp-panel">
      <h2>Register your team</h2>
      <p>
        Select an existing {gameName(event.game)} roster with exactly {event.teamSize} players. Your
        entry is reviewed by the organizer.
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
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
              <option value="">Select a team</option>
              {available.map((t) => (
                <option
                  value={t.id}
                  key={t.id}
                  disabled={
                    t.members.filter((m) => !m.substitute).length !== event.teamSize ||
                    event.registrations.some((r) => r.teamId === t.id)
                  }
                >
                  {t.name} · {t.members.filter((m) => !m.substitute).length}/{event.teamSize}{" "}
                  starters
                  {event.registrations.some((r) => r.teamId === t.id) ? " · Already submitted" : ""}
                </option>
              ))}
            </select>
          </Field>
          {selected && (
            <div className="mvp-roster-preview">
              <span className="eyebrow">ROSTER LOADED AUTOMATICALLY</span>
              {selected.members
                .filter((m) => !m.substitute)
                .map((m) => (
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
function ManualRegistration({ event, onDone }: { event: Event; onDone: () => void }) {
  const r = useResource<Team[]>(`/teams?eligibleFor=${event.id}`);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="mvp-panel">
      <summary>Manually add an eligible team</summary>
      <p>Use an existing matching roster. Manual entries are approved immediately.</p>
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
function MatchEditor({ match, event, onDone }: { match: Match; event: Event; onDone: () => void }) {
  const confirm = useConfirm();
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
            {match.teamA?.name || "Awaiting winner"} <span className="muted">vs</span>{" "}
            {match.teamB?.name || "Awaiting winner"}
          </strong>
        </span>
        <Status value={match.status} />
      </summary>
      {error && <Notice error>{error}</Notice>}
      <LiveScoreForm event={event} match={match} onDone={onDone} />
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
                slotMinutes: Number(v.slotMinutes),
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
          <Field label="Slot duration (minutes)">
            <input
              name="slotMinutes"
              type="number"
              min={1}
              max={480}
              required
              defaultValue={match.slotMinutes}
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
          onSubmit={async (e) => {
            e.preventDefault();
            const v = Object.fromEntries(new FormData(e.currentTarget));
            if (
              !(await confirm({
                title: "Confirm the final score",
                description: `${v.outcome}: ${match.teamA?.name} vs ${match.teamB?.name}. This confirms the result and updates progression. Corrections require a dispute and rollback review.`,
                action: "SAVE & ADVANCE",
              }))
            )
              return;
            void save(
              `/tournaments/${event.id}/matches/${match.id}/result`,
              resultInput(v, event, match),
            );
          }}
        >
          <h3>
            <Trophy size={17} /> Record result
          </h3>
          <p>
            Confirming updates progression automatically. Corrections require a dispute and rollback
            review.
          </p>
          <ResultFields event={event} match={match} />
          {(!match.teamA || !match.teamB) && (
            <p>Both opponents must advance before you can record this result.</p>
          )}
          <button className="button primary" disabled={busy || !match.teamA || !match.teamB}>
            SAVE RESULT & ADVANCE
          </button>
        </form>
      </div>
    </details>
  );
}
function EventDetailContent({ manage = false }: { manage?: boolean }) {
  const confirm = useConfirm();
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
  if (r.error || !r.data) return <ResourceError message={r.error} retry={r.refresh} />;
  const t = r.data;
  if (manage && !t.canManage)
    return <Notice error>You can only manage tournaments you own.</Notice>;
  const completed = t.matches.filter((m) => m.status === "COMPLETED" && !m.isBye);
  const approved = t.registrations.filter((r) => r.status === "APPROVED");
  const own = t.registrations.filter(
    (r) => r.canManageRoster || r.roster.some((m) => m.id === user?.id),
  );
  async function action(
    path: string,
    body: unknown = {},
    method = "POST",
    message = "Saved successfully.",
  ) {
    if (
      method === "DELETE" &&
      !(await confirm({
        title: "Remove this registration?",
        description:
          "The team will lose its reserved place and may submit a new entry while registration is open.",
        action: "REMOVE ENTRY",
      }))
    )
      return;
    if (
      path.endsWith("/bracket") &&
      !(await confirm({
        title: "Lock the field & generate?",
        description:
          "Registration will close and the approved team list will be locked. The bracket can only be generated once.",
        action: "GENERATE BRACKET",
      }))
    )
      return;
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
        description={`Hosted by ${t.organization?.name || t.organizer.username} · ${formatNames[t.format as keyof typeof formatNames]}`}
        action={
          manage ? (
            <Link className="button outline" to={`/tournaments/${t.id}`}>
              VIEW EVENT PAGE ↗
            </Link>
          ) : t.canManage ? (
            <Link className="button primary" to={`/organizer/tournaments/${t.id}`}>
              MANAGE TOURNAMENT ↗
            </Link>
          ) : null
        }
      />
      <ReportLink type="TOURNAMENT" id={t.id} />
      {t.coverId && (
        <img
          className="mvp-event-cover"
          src={`/api/media/${t.coverId}`}
          alt="Tournament cover"
          width={1600}
          height={900}
        />
      )}
      <LiveStatus />
      <div className="mvp-event-strip">
        <Status value={t.status} />
        <span>
          <Users size={15} />
          {t.registeredCount} / {t.maxTeams} entries
        </span>
        <span>
          {t.competitionType === "INDIVIDUAL"
            ? "Individual competition"
            : `${t.teamSize} players per team`}
        </span>
        <span>
          <CalendarDays size={15} />
          {date(t.startsAt)}
        </span>
      </div>
      {error && <Notice error>{error}</Notice>}
      {notice && <Toast key={notice}>{notice}</Toast>}
      {t.champion && (
        <div className="mvp-champion">
          <Trophy size={37} />
          <div>
            <span className="eyebrow">TOURNAMENT CHAMPION</span>
            <h2>{t.champion.name}</h2>
            <p>The competition is complete. The crown is theirs.</p>
          </div>
        </div>
      )}
      {tab === "Overview" && manage && <TournamentOperations event={t} refresh={r.refresh} />}
      {tab === "Overview" &&
        t.announcements.map((a) => (
          <article className="mvp-panel mvp-section" key={a.id}>
            <span className="eyebrow">ANNOUNCEMENT · {date(a.createdAt)}</span>
            <h2>{a.title}</h2>
            <p className="mvp-prose">{a.body}</p>
          </article>
        ))}
      {tab === "Results" && t.standings.length > 0 && (
        <section className="mvp-panel">
          <h2>Standings</h2>
          <p>
            {t.format === "LEAGUE"
              ? "Configured league points → score difference → KDA → faster wins."
              : "Wins → opponent strength (Swiss only) → score difference → KDA → faster wins."}
            {t.format === "GROUPS"
              ? " Exact qualification ties require a deciding playoff."
              : " Exact first-place ties require a deciding playoff."}
            {t.format === "SWISS" && " Swiss BYEs count as one standings point, not a played win."}
          </p>
          <div className="mvp-table-scroll" tabIndex={0} role="region" aria-label="Standings table">
            <table>
              <thead>
                <tr>
                  {[
                    "Player / team",
                    "W",
                    "Draws",
                    "Points",
                    "L",
                    "BYE",
                    "Opp. strength",
                    "Score difference",
                    "KDA",
                    "Avg. win seconds",
                  ].map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.standings.map((row) => (
                  <tr key={`${row.stageName}-${row.id}`}>
                    <th scope="row">
                      {row.name}
                      <small className="mvp-help"> {row.stageName}</small>
                    </th>
                    <td>{row.wins}</td>
                    <td>{row.draws}</td>
                    <td>{row.points ?? "—"}</td>
                    <td>{row.losses}</td>
                    <td>{row.byes}</td>
                    <td>{t.format === "SWISS" ? row.buchholz : "—"}</td>
                    <td>{row.difference}</td>
                    <td>{row.kda.toFixed(2)}</td>
                    <td>{row.averageWinSeconds.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Tabs
        items={tabs}
        value={tab}
        onChange={(tab) => setParams({ tab })}
        label="Tournament sections"
        panelId="event-panel"
      />
      <section
        role="tabpanel"
        id="event-panel"
        aria-labelledby={`event-panel-tab-${tabs.indexOf(tab)}`}
      >
        {tab === "Overview" && (
          <div className="mvp-two-column">
            <div className="mvp-panel">
              <h2>About the tournament</h2>
              {t.organization ? (
                t.organization.publicProfile ? (
                  <Link to={`/communities/${t.organization.id}`}>Organization profile ↗</Link>
                ) : (
                  <span>{t.organization.name}</span>
                )
              ) : (
                <Link to={`/organizers/${t.organizer.username}`}>Organizer profile ↗</Link>
              )}
              <p className="mvp-prose">{t.description}</p>
              <p>
                {t.region || "All regions"} · {t.locationType} ·{" "}
                {t.location || "Venue to be announced"} · Free entry
              </p>
              <h3>Eligibility</h3>
              <p className="mvp-prose">
                {t.eligibility || "Meet the game, roster and region requirements."}
              </p>
              {t.prizeInfo && (
                <>
                  <h3>Prizes</h3>
                  <p className="mvp-prose">{t.prizeInfo}</p>
                </>
              )}
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
                    <dt>Approved entries</dt>
                    <dd>
                      {approved.length} / {t.maxTeams}
                    </dd>
                  </div>
                  <div>
                    <dt>Team size</dt>
                    <dd>
                      {t.competitionType === "INDIVIDUAL"
                        ? "One player"
                        : `${t.teamSize} players including captain`}
                    </dd>
                  </div>
                </dl>
              </div>
              {!manage &&
                own.map((reg) => (
                  <Notice key={reg.id}>
                    <strong>{reg.team.name}</strong> · <Status value={reg.status} />
                    <p>
                      {reg.status === "PENDING"
                        ? "Your roster was submitted. Waiting for organizer approval."
                        : reg.status === "APPROVED"
                          ? "Your team is approved. Follow the bracket and schedule for your next match."
                          : reg.status === "REJECTED"
                            ? "This entry was rejected. Contact the organizer before trying again."
                            : reg.status === "WAITLISTED"
                              ? "Your place on the waitlist is confirmed."
                              : "Your reserved place has been released."}
                    </p>
                    <p>
                      {reg.waitlistReason ||
                        (reg.status === "WAITLISTED"
                          ? "Waitlisted. Eligible entries move to review in arrival order when space opens."
                          : reg.status === "WITHDRAWN"
                            ? "Entry withdrawn."
                            : "")}
                    </p>
                    {reg.canManageRoster &&
                      ["PENDING", "APPROVED", "WAITLISTED"].includes(reg.status) &&
                      ["REGISTRATION", "PUBLISHED"].includes(t.phase) &&
                      Date.now() < Date.parse(t.closesAt) && (
                        <button
                          className="mvp-small-button"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Withdraw this entry?",
                                description:
                                  "Your reserved place will be released to the next eligible waitlisted entry.",
                                action: "WITHDRAW",
                              })
                            )
                              void action(`/tournaments/${t.id}/registrations/${reg.id}/withdraw`);
                          }}
                        >
                          WITHDRAW ENTRY
                        </button>
                      )}
                    {reg.canManageRoster && reg.status === "APPROVED" && t.phase === "CHECK_IN" && (
                      <button
                        className="button primary"
                        disabled={busy || Boolean(reg.checkedInAt)}
                        onClick={() =>
                          void action(`/tournaments/${t.id}/registrations/${reg.id}/check-in`)
                        }
                      >
                        {reg.checkedInAt ? "CHECKED IN" : "CHECK IN"}
                      </button>
                    )}
                    <RosterChange
                      event={t}
                      entry={reg}
                      manager={false}
                      onChange={() => done("Roster request updated.")}
                    />
                  </Notice>
                ))}
              {!manage &&
                t.status === "REGISTRATION_OPEN" &&
                (user?.roles?.includes("PLAYER") ? (
                  t.competitionType === "INDIVIDUAL" ? (
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        own.some((reg) =>
                          ["PENDING", "APPROVED", "WAITLISTED"].includes(reg.status),
                        )
                      }
                      onClick={() =>
                        void action(
                          `/tournaments/${t.id}/individual-registration`,
                          {},
                          "POST",
                          "Entry submitted. Check your registration status below.",
                        )
                      }
                    >
                      REGISTER AS A PLAYER
                    </button>
                  ) : (
                    <RegisterTeam
                      event={t}
                      onDone={() => done("Entry submitted. Check your registration status.")}
                    />
                  )
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
                    {["REGISTRATION", "PUBLISHED", "CHECK_IN"].includes(t.phase)
                      ? "Review each entry, then generate a bracket from approved teams."
                      : t.phase === "ONGOING"
                        ? "Schedule matches and record scores. Winners advance automatically."
                        : t.phase === "COMPLETED"
                          ? "The champion has been declared. Final results remain available to authorized viewers."
                          : t.phase === "DRAFT"
                            ? "Review the settings and publish when the event is ready."
                            : t.phase === "POSTPONED"
                              ? "Update the dates and publish again to resume registration."
                              : "This event is cancelled. Saved entries and results remain available for reference."}
                  </p>
                  <button
                    className="button primary"
                    onClick={() =>
                      setParams({
                        tab: ["REGISTRATION", "PUBLISHED", "CHECK_IN"].includes(t.phase)
                          ? "Registrations"
                          : t.phase === "ONGOING"
                            ? "Matches"
                            : "Results",
                      })
                    }
                  >
                    OPEN{" "}
                    {["REGISTRATION", "PUBLISHED", "CHECK_IN"].includes(t.phase)
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
                <p>Share the public tournament page to start receiving entries.</p>
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
                  <p>
                    {reg.checkedInAt ? `Checked in ${date(reg.checkedInAt)}` : "Not checked in"}{" "}
                    {reg.waitlistReason}
                  </p>
                  <RosterChange
                    event={t}
                    entry={reg}
                    manager={true}
                    onChange={() => done("Roster request updated.")}
                  />
                  {["REGISTRATION", "PUBLISHED", "CHECK_IN"].includes(t.phase) && (
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
            {t.status === "REGISTRATION_OPEN" && t.competitionType === "TEAM" && (
              <ManualRegistration
                event={t}
                onDone={() => done("Entry submitted. Check its registration status.")}
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
            {manage && ["REGISTRATION", "PUBLISHED", "CHECK_IN", "ONGOING"].includes(t.phase) && (
              <SeedingControls
                key={t.phase + approved.map((r) => r.teamId).join(",")}
                event={t}
                onDone={() => done("Competition updated.")}
              />
            )}
            {t.format === "BATTLE_ROYALE" ? (
              <BattleView event={t} manage={manage} onDone={r.refresh} />
            ) : (
              <LiveBracket event={t} />
            )}
          </>
        )}
        {tab === "Schedule" && t.format !== "BATTLE_ROYALE" && (
          <MatchList matches={t.matches.filter((m) => m.status === "SCHEDULED")} />
        )}
        {tab === "Matches" && manage && t.format !== "BATTLE_ROYALE" && (
          <>
            {t.phase === "ONGOING" && <MatchControls event={t} onDone={r.refresh} />}
            <p className="mvp-help">
              Schedule using your local timezone. Later rounds can be scheduled before their
              opponents are known. Corrections require an explicit rollback review.
            </p>
            {!t.matches.length ? (
              <Empty title="Generate your bracket first">
                <button className="button outline" onClick={() => setParams({ tab: "Bracket" })}>
                  OPEN BRACKET
                </button>
              </Empty>
            ) : (
              t.matches
                .filter((m) => m.status !== "COMPLETED" && t.phase === "ONGOING")
                .map((m) => (
                  <MatchEditor
                    key={`${m.id}-${m.teamAId}-${m.teamBId}`}
                    match={m}
                    event={t}
                    onDone={() => done("Match saved. Bracket and schedules are up to date.")}
                  />
                ))
            )}
            {t.matches.length > 0 && !t.matches.some((m) => m.status !== "COMPLETED") && (
              <Notice>
                All matches are complete. View the champion above and final results in the Results
                tab.
              </Notice>
            )}
          </>
        )}
        {["Results", "Matches", "Schedule"].includes(tab) && t.format === "BATTLE_ROYALE" && (
          <BattleView event={t} manage={manage && tab === "Matches"} onDone={r.refresh} />
        )}
        {tab === "Results" && t.format !== "BATTLE_ROYALE" && (
          <MatchList matches={completed} results />
        )}
        {tab === "Results" && user && <EngineReview event={t} manage={manage} onDone={r.refresh} />}
      </section>
    </>
  );
}

function EventAccessGate({ manage = false }: { manage?: boolean }) {
  const { id } = useParams();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("access"));
  const [ready, setReady] = useState(!token),
    [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    send(`/tournaments/${id}/access`, { token })
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, [id, token]);
  if (error) return <Notice error>{error}</Notice>;
  return ready ? <EventDetailContent manage={manage} /> : <Loading />;
}

export default function EventDetailPage({ manage = false }: { manage?: boolean }) {
  const location = useLocation();
  return <EventAccessGate key={location.pathname + location.hash} manage={manage} />;
}

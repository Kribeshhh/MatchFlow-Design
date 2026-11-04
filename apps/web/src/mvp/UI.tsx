import { ArrowUpRight, Trophy } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactNode, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { GameLogo } from "../Art";
import { date, gameName, type EventSummary, type Match } from "./api";
export function PageTitle({
  label,
  title,
  description,
  action,
}: {
  label: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mvp-title">
      <div>
        <span className="eyebrow">MATCHFLOW / {label}</span>
        <h1>
          {title}
          <span className="lime">.</span>
        </h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`mvp-status state-${value.toLowerCase()}`}>{value.replaceAll("_", " ")}</span>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mvp-empty">
      <Trophy size={28} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Notice({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <div className={`mvp-notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" aria-label="Loading your arena" aria-busy="true">
      <span className="sr-only">Loading your arena…</span>
      <div className="mvp-skeleton" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <div key={n}>
            <i />
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}
export function ResourceError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="mvp-state">
      <Notice error>{message}</Notice>
      <button className="button outline" onClick={retry}>
        TRY AGAIN
      </button>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string }>, {
        id,
        "aria-describedby": hint ? `${id}-hint` : undefined,
      })
    : children;
  return (
    <div className="mvp-field">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function EventCard({ event: t, manage = false }: { event: EventSummary; manage?: boolean }) {
  return (
    <Link
      className="mvp-event-card"
      to={manage ? `/organizer/tournaments/${t.id}` : `/tournaments/${t.id}`}
    >
      <div className="mvp-event-top">
        <div className="mvp-game-icon">
          <GameLogo game={t.game} />
        </div>
        <Status value={t.status} />
      </div>
      <span className="eyebrow">{gameName(t.game)}</span>
      <h2>{t.name}</h2>
      <p>Hosted by {t.organizer.username}</p>
      <p>
        {t.format.replaceAll("_", " ")} · {t.region || "All regions"} · {t.locationType}
      </p>
      <dl>
        <div>
          <dt>Tournament</dt>
          <dd>{date(t.startsAt)}</dd>
        </div>
        <div>
          <dt>Registration closes</dt>
          <dd>{date(t.closesAt)}</dd>
        </div>
        <div>
          <dt>Roster / entries</dt>
          <dd>
            {t.teamSize} {t.competitionType === "INDIVIDUAL" ? "player" : "players per team"} ·{" "}
            {t.registeredCount} / {t.maxTeams} entries
          </dd>
        </div>
      </dl>
      <span className="mvp-card-link">
        {manage ? "MANAGE TOURNAMENT" : "VIEW TOURNAMENT"}
        <ArrowUpRight size={17} />
      </span>
    </Link>
  );
}
export function MatchList({ matches, results = false }: { matches: Match[]; results?: boolean }) {
  if (!matches.length)
    return (
      <Empty title={results ? "No results yet" : "No matches scheduled yet"}>
        <p>
          {results
            ? "Completed match results will appear here."
            : "The organizer will publish match times after generating the bracket."}
        </p>
      </Empty>
    );
  return (
    <div className="mvp-match-list">
      {matches.map((m) => (
        <div className="mvp-match-summary" key={m.id}>
          <div>
            {m.tournament && (
              <Link className="mvp-small-link" to={`/tournaments/${m.tournament.id}`}>
                {m.tournament.name}
              </Link>
            )}
            <span className="eyebrow">
              ROUND {m.round} · MATCH {m.position + 1}
            </span>
            <strong>
              {m.teamA?.name || "Awaiting winner"}{" "}
              <span className="lime">
                {results ? `${m.scoreA ?? "—"} : ${m.scoreB ?? "—"}` : "vs"}
              </span>{" "}
              {m.teamB?.name || (m.isBye ? "BYE" : "Awaiting winner")}
            </strong>
            <p>
              {date(results ? m.completedAt : m.scheduledAt)}
              {m.venue && ` · ${m.venue}`}
            </p>
          </div>
          {results ? (
            <span className="mvp-winner">
              <Trophy size={14} />
              {m.outcome === "DRAW" ? "Draw" : m.winner?.name}
              {m.outcome !== "PLAYED" &&
                m.outcome !== "DRAW" &&
                ` · ${m.outcome.replaceAll("_", " ")}`}
            </span>
          ) : (
            <Status value={m.status} />
          )}
        </div>
      ))}
    </div>
  );
}

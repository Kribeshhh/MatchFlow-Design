import { Link } from "react-router-dom";
import { date } from "./api";
import { Empty } from "./UI";
export type { CompetitionHistory as History } from "../../../../packages/shared/src/responses";
import type { CompetitionHistory as History } from "../../../../packages/shared/src/responses";
export function CompetitionHistory({ data }: { data: History }) {
  return (
    <section className="mvp-panel mvp-section">
      <h2>Tournament record</h2>
      <p>
        {data.statistics.wins} wins · {data.statistics.losses} losses · {data.statistics.draws}{" "}
        draws · {data.statistics.championships} championships
        {data.statistics.winRate !== null ? ` · ${data.statistics.winRate}% win rate` : ""}
      </p>
      <p>
        Approved entries and completed results only. Head-to-head win rate excludes draws and BYEs;
        lobby results are shown separately.
      </p>
      {!data.history.length && (
        <Empty title="No tournament history yet">
          <p>Approved participation will appear here.</p>
        </Empty>
      )}
      {data.history.map((h) => (
        <article className="mvp-section" key={h.tournament.id}>
          <h3>
            <Link to={`/tournaments/${h.tournament.id}`}>{h.tournament.name}</Link>
            {h.champion ? " · Champion" : ""}
          </h3>
          <p>
            {h.team.name} · {date(h.tournament.startsAt)} · {h.wins}W / {h.losses}L / {h.draws}D
          </p>
          <ul>
            {h.matches.map((m) => (
              <li key={m.id}>
                {m.teamA?.name} {m.scoreA ?? "—"} — {m.scoreB ?? "—"} {m.teamB?.name} ·{" "}
                {m.outcome.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
          {h.battleRounds.length > 0 && (
            <ul>
              {h.battleRounds.map((round) => (
                <li key={round.number}>
                  Lobby {round.number}:{" "}
                  {round.noShow
                    ? "Did not start"
                    : `placement ${round.placement} · ${round.eliminations} eliminations · ${round.points} points`}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </section>
  );
}

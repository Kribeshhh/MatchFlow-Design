import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { games } from "../data";
import { useResource, type EventSummary } from "./api";
import { useAuth } from "./Auth";
import { Empty, EventCard, Field, Loading, PageTitle, ResourceError } from "./UI";
export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const r = useResource<EventSummary[]>(`/tournaments?${params}`);
  const { user } = useAuth();
  function filter(key: string, value: string) {
    setParams((p) => {
      p.delete("page");
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    });
  }
  const page = Number(params.get("page") || 1);
  return (
    <>
      <PageTitle
        label="FIND YOUR ARENA"
        title="Tournaments"
        description="Find your next challenge. Register your team. Play for the final."
        action={
          user?.roles?.includes("ORGANIZER") && (
            <Link to="/organizer/tournaments/new" className="button primary">
              CREATE TOURNAMENT
            </Link>
          )
        }
      />
      <form
        className="mvp-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setParams((p) => {
            p.delete("page");
            if (query) p.set("q", query);
            else p.delete("q");
            return p;
          });
        }}
      >
        <Field label="Tournament name">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tournaments…"
            maxLength={100}
          />
        </Field>
        <Field label="Game">
          <select
            value={params.get("game") || ""}
            onChange={(e) =>
              setParams((p) => {
                if (e.target.value) p.set("game", e.target.value);
                else p.delete("game");
                return p;
              })
            }
          >
            <option value="">All games</option>
            {games.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={params.get("status") || ""}
            onChange={(e) =>
              setParams((p) => {
                if (e.target.value) p.set("status", e.target.value);
                else p.delete("status");
                return p;
              })
            }
          >
            <option value="">Any status</option>
            {[
              "UPCOMING",
              "REGISTRATION_OPEN",
              "REGISTRATION_CLOSED",
              "CHECK_IN",
              "ONGOING",
              "COMPLETED",
              "CANCELLED",
              "POSTPONED",
            ].map((s) => (
              <option value={s} key={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Region">
          <input
            value={params.get("region") || ""}
            maxLength={80}
            onChange={(e) => filter("region", e.target.value)}
          />
        </Field>
        {(
          [
            ["locationType", "Location", ["ONLINE", "OFFLINE"]],
            [
              "format",
              "Format",
              [
                "SINGLE_ELIMINATION",
                "DOUBLE_ELIMINATION",
                "ROUND_ROBIN",
                "SWISS",
                "GROUPS",
                "LEAGUE",
                "BATTLE_ROYALE",
              ],
            ],
            ["competitionType", "Competition", ["TEAM", "INDIVIDUAL"]],
            ["teamSize", "Players per entry", Array.from({ length: 10 }, (_, i) => String(i + 1))],
            ["category", "Entry category", ["FREE"]],
            ["sort", "Sort by", ["UPCOMING", "NEWEST", "POPULARITY", "DEADLINE"]],
          ] as [string, string, string[]][]
        ).map(([key, label, options]) => (
          <Field key={key} label={label}>
            <select value={params.get(key) || ""} onChange={(e) => filter(key, e.target.value)}>
              <option value="">{key === "sort" ? "Newest" : "All"}</option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        ))}
        {(["dateFrom", "dateTo"] as const).map((key) => (
          <Field key={key} label={key === "dateFrom" ? "Starts from" : "Starts through"}>
            <input
              type="date"
              value={params.get(key)?.slice(0, 10) || ""}
              onChange={(e) =>
                filter(
                  key,
                  e.target.value
                    ? `${e.target.value}T${key === "dateFrom" ? "00:00:00" : "23:59:59"}.000Z`
                    : "",
                )
              }
            />
          </Field>
        ))}
        <button className="button primary">SEARCH</button>
        <button
          className="mvp-small-button"
          type="button"
          onClick={() => {
            setParams({});
            setQuery("");
          }}
        >
          RESET
        </button>
      </form>
      <p className="mvp-help">
        Free-entry events only; payment collection is unavailable. Date filters use UTC calendar
        days.
      </p>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ResourceError message={r.error} retry={r.refresh} />
      ) : r.data?.length ? (
        <>
          <p className="mvp-results-count">
            {r.data.length} tournaments · Times shown in your local timezone
          </p>
          <div className="mvp-event-grid">
            {r.data.map((t) => (
              <EventCard event={t} key={t.id} />
            ))}
          </div>
        </>
      ) : (
        <Empty title="No tournaments match your search">
          <p>Try another game, name, or status.</p>
        </Empty>
      )}
      <nav className="mvp-action-row" aria-label="Tournament pages">
        <button
          className="button outline"
          disabled={page <= 1 || r.loading}
          onClick={() =>
            setParams((p) => {
              p.set("page", String(page - 1));
              return p;
            })
          }
        >
          PREVIOUS
        </button>
        <span>Page {page}</span>
        <button
          className="button outline"
          disabled={r.loading || (r.data?.length || 0) < 50}
          onClick={() =>
            setParams((p) => {
              p.set("page", String(page + 1));
              return p;
            })
          }
        >
          NEXT
        </button>
      </nav>
    </>
  );
}

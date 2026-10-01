import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { games } from "../data";
import { tournamentSchema } from "../../shared/validation";
import { useAuth } from "./Auth";
import { localInput, send, useResource, type Event } from "./api";
import {
  PageTitle,
  Field,
  Notice,
  EventCard,
  Loading,
  ResourceError,
  Empty,
} from "./UI";
export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const r = useResource<Event[]>(`/tournaments?${params}`);
  const { user } = useAuth();
  return (
    <>
      <PageTitle
        label="FIND YOUR ARENA"
        title="Tournaments"
        description="Find your next challenge. Register your team. Play for the final."
        action={
          user?.role === "ORGANIZER" && (
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
            query ? p.set("q", query) : p.delete("q");
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
                e.target.value
                  ? p.set("game", e.target.value)
                  : p.delete("game");
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
                e.target.value
                  ? p.set("status", e.target.value)
                  : p.delete("status");
                return p;
              })
            }
          >
            <option value="">Any status</option>
            {[
              "UPCOMING",
              "REGISTRATION_OPEN",
              "REGISTRATION_CLOSED",
              "ONGOING",
              "COMPLETED",
            ].map((s) => (
              <option value={s} key={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
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
    </>
  );
}
export function CreateEventPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        label="ORGANIZER / NEW EVENT"
        title="Set the stage"
        description="Start with the essentials. The MVP uses single elimination with automatic BYEs."
      />
      <form
        className="mvp-panel mvp-form mvp-create-event"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const values = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const input = tournamentSchema.parse({
              ...values,
              teamSize: Number(values.teamSize),
              maxTeams: Number(values.maxTeams),
              opensAt: new Date(String(values.opensAt)).toISOString(),
              closesAt: new Date(String(values.closesAt)).toISOString(),
              startsAt: new Date(String(values.startsAt)).toISOString(),
            });
            const t = await send<Event>("/tournaments", input);
            navigate(`/organizer/tournaments/${t.id}`);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Notice error>{error}</Notice>}
        <div className="mvp-form-grid">
          <Field label="Tournament name">
            <input
              name="name"
              minLength={3}
              maxLength={100}
              required
              placeholder="e.g. Valley Open"
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
          <Field
            label="Team size"
            hint="Exact roster size, including the captain."
          >
            <input
              type="number"
              name="teamSize"
              min={1}
              max={10}
              defaultValue={4}
              required
            />
          </Field>
          <Field
            label="Maximum teams"
            hint="2–64 teams. Non-power-of-two sizes use BYEs."
          >
            <input
              type="number"
              name="maxTeams"
              min={2}
              max={64}
              defaultValue={16}
              required
            />
          </Field>
          <Field label="Registration opens">
            <input
              type="datetime-local"
              name="opensAt"
              defaultValue={localInput()}
              required
            />
          </Field>
          <Field label="Registration closes">
            <input type="datetime-local" name="closesAt" required />
          </Field>
          <Field
            label="Tournament start"
            hint="Dates use your local timezone and are stored in UTC."
          >
            <input type="datetime-local" name="startsAt" required />
          </Field>
          <Field label="Format">
            <input value="Single elimination" readOnly />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            name="description"
            minLength={10}
            maxLength={5000}
            rows={4}
            required
            placeholder="Tell teams what to expect."
          />
        </Field>
        <Field label="Rules">
          <textarea
            name="rules"
            minLength={10}
            maxLength={5000}
            rows={5}
            required
            placeholder="Include match format, check-in instructions, and scoring rules."
          />
        </Field>
        <button className="button primary" disabled={busy}>
          {busy ? "CREATING…" : "CREATE TOURNAMENT"}
        </button>
      </form>
    </>
  );
}

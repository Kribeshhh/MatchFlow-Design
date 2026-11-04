import { useState } from "react";
import type { BattleView as BattleData } from "../../../../packages/shared/src/engine-responses";
import { battleResultsSchema } from "../../../../packages/shared/src/battle";
import { date, localInput, send, useResource, type Event } from "./api";
import { Field, Loading, Notice, ResourceError } from "./UI";
import { useConfirm } from "./DesignSystem";
export function battleInput(form: HTMLFormElement, round: BattleData["rounds"][number]) {
  const v = new FormData(form);
  return battleResultsSchema.parse({
    expectedVersion: round.version,
    results: round.participantIds.map((id) => ({
      teamId: id,
      noShow: v.get(`absent-${id}`) === "on",
      placement: v.get(`absent-${id}`) === "on" ? null : Number(v.get(`place-${id}`)),
      eliminations: v.get(`absent-${id}`) === "on" ? 0 : Number(v.get(`kills-${id}`)),
    })),
  });
}
export function BattleFields({
  round,
  participants,
}: {
  round: BattleData["rounds"][number];
  participants: BattleData["participants"];
}) {
  return (
    <div className="mvp-stack">
      {round.participantIds.map((id) => (
        <BattleEntry
          key={id}
          id={id}
          name={participants.find((p) => p.id === id)?.name || "Participant"}
          count={round.participantIds.length}
        />
      ))}
    </div>
  );
}
function BattleEntry({ id, name, count }: { id: string; name: string; count: number }) {
  const [absent, setAbsent] = useState(false);
  return (
    <fieldset className="mvp-form-grid">
      <legend>{name}</legend>
      <label>
        <input
          name={`absent-${id}`}
          type="checkbox"
          checked={absent}
          onChange={(e) => setAbsent(e.target.checked)}
        />{" "}
        Did not start
      </label>
      <Field label={`${name} placement`}>
        <input
          name={`place-${id}`}
          type="number"
          min={1}
          max={count}
          required={!absent}
          disabled={absent}
        />
      </Field>
      <Field label={`${name} eliminations`}>
        <input
          name={`kills-${id}`}
          type="number"
          min={0}
          max={1000}
          required={!absent}
          disabled={absent}
        />
      </Field>
    </fieldset>
  );
}
export function BattleView({
  event,
  manage,
  onDone,
}: {
  event: Event;
  manage: boolean;
  onDone: () => void;
}) {
  const r = useResource<BattleData>(`/tournaments/${event.id}/battle`);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  async function save(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await send(path, body, method);
      r.refresh();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (r.loading) return <Loading />;
  if (r.error) return <ResourceError message={r.error} retry={r.refresh} />;
  if (!r.data) return null;
  const data = r.data,
    base = `/tournaments/${event.id}/battle`;
  return (
    <section className="mvp-stack">
      <h2>Lobby standings</h2>
      {error && <Notice error>{error}</Notice>}
      <p>
        Placement points: {data.rules.placementPoints.join(" / ")}. Each elimination:{" "}
        {data.rules.eliminationPoints} points. Ties:{" "}
        {data.rules.tieBreakers.join(" → ").replaceAll("_", " ")}.
      </p>
      <div
        className="mvp-table-scroll"
        role="region"
        aria-label="Battle royale standings"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              {["Participant", "Points", "Placement points", "Eliminations", "Wins", "Played"].map(
                (s) => (
                  <th key={s} scope="col">
                    {s}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {data.standings.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td>{row.points}</td>
                <td>{row.placementPoints}</td>
                <td>{row.eliminations}</td>
                <td>{row.wins}</td>
                <td>{row.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.rounds.length && (
        <p>Approve participants and generate lobby rounds from the Bracket tab.</p>
      )}
      {data.rounds.map((round) => (
        <details key={`${round.id}-${round.version}`} className="mvp-panel">
          <summary>
            Lobby {round.number}
            {round.isTiebreak ? " · Deciding lobby" : ""} · {round.status} ·{" "}
            {date(round.scheduledAt)}
          </summary>
          {round.results.length > 0 && (
            <ul>
              {round.results.map((row) => (
                <li key={row.teamId}>
                  {data.participants.find((p) => p.id === row.teamId)?.name}:{" "}
                  {row.noShow
                    ? "Did not start"
                    : `Placement ${row.placement} · ${row.eliminations} eliminations`}
                </li>
              ))}
            </ul>
          )}
          {manage && event.phase === "ONGOING" && round.status !== "COMPLETED" && (
            <>
              <form
                className="mvp-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = new FormData(e.currentTarget);
                  void save(
                    `${base}/${round.id}/schedule`,
                    {
                      scheduledAt: new Date(String(v.get("scheduledAt"))).toISOString(),
                      slotMinutes: Number(v.get("slotMinutes")),
                      venue: String(v.get("venue")),
                    },
                    "PATCH",
                  );
                }}
              >
                <h3>Schedule lobby</h3>
                <Field label="Lobby start">
                  <input
                    name="scheduledAt"
                    type="datetime-local"
                    required
                    defaultValue={localInput(round.scheduledAt || event.startsAt)}
                  />
                </Field>
                <Field label="Lobby duration (minutes)">
                  <input
                    name="slotMinutes"
                    type="number"
                    min={1}
                    max={480}
                    required
                    defaultValue={round.slotMinutes}
                  />
                </Field>
                <Field label="Lobby room / server">
                  <input name="venue" maxLength={200} defaultValue={round.venue} />
                </Field>
                <button className="button outline" disabled={busy}>
                  SAVE LOBBY SCHEDULE
                </button>
              </form>
              <form
                className="mvp-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const input = battleInput(e.currentTarget, round);
                    if (
                      await confirm({
                        title: `Confirm lobby ${round.number}`,
                        description:
                          "Every placement and elimination will contribute to cumulative standings. Corrections require rollback review.",
                        action: "CONFIRM LOBBY",
                      })
                    )
                      await save(`${base}/${round.id}/result`, input);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <h3>Record lobby results</h3>
                <BattleFields round={round} participants={data.participants} />
                <button className="button primary" disabled={busy}>
                  CONFIRM LOBBY RESULTS
                </button>
              </form>
            </>
          )}
        </details>
      ))}
    </section>
  );
}

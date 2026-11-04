import { useState } from "react";
import { send, type Event } from "./api";
import { Field, Notice } from "./UI";
import { useConfirm } from "./DesignSystem";
export function SeedingControls({ event, onDone }: { event: Event; onDone: () => void }) {
  const approved = event.registrations.filter((r) => r.status === "APPROVED");
  const [order, setOrder] = useState(approved.map((r) => r.teamId)),
    [mode, setMode] = useState("REGISTRATION"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const confirm = useConfirm();
  async function run(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await send(`/tournaments/${event.id}/${path}`, body);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canGenerate = ["PUBLISHED", "REGISTRATION", "CHECK_IN"].includes(event.phase);
  return (
    <section className="mvp-panel mvp-form">
      <h2>{canGenerate ? "Seed the competition" : "Bracket controls"}</h2>
      {error && <Notice error>{error}</Notice>}
      {canGenerate ? (
        <>
          <p>
            {approved.length} approved entries. Generating closes registration and freezes the
            entrant list.
          </p>
          <Field label="Seeding method">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="REGISTRATION">Registration order</option>
              <option value="RANDOM">Random draw</option>
              <option value="MANUAL">Manual seeds</option>
            </select>
          </Field>
          {mode === "MANUAL" && (
            <ol>
              {order.map((id, index) => (
                <li key={id}>
                  {approved.find((r) => r.teamId === id)?.team.name}
                  <button
                    type="button"
                    className="mvp-small-button"
                    disabled={!index || busy}
                    aria-label={`Move ${approved.find((r) => r.teamId === id)?.team.name} up`}
                    onClick={() =>
                      setOrder((ids) => {
                        const next = [...ids];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return next;
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="mvp-small-button"
                    disabled={index === order.length - 1 || busy}
                    aria-label={`Move ${approved.find((r) => r.teamId === id)?.team.name} down`}
                    onClick={() =>
                      setOrder((ids) => {
                        const next = [...ids];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        return next;
                      })
                    }
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button
            className="button primary"
            disabled={
              busy || approved.length < 2 || event.registrations.some((r) => r.status === "PENDING")
            }
            onClick={async () => {
              if (
                await confirm({
                  title: "Start the competition?",
                  description:
                    "Registration will close. Checked-in participants and configured rules will be validated before generation.",
                  action: "GENERATE BRACKET",
                })
              )
                await run("bracket", {
                  seeding: mode,
                  ...(mode === "MANUAL" ? { teamIds: order } : {}),
                });
            }}
          >
            GENERATE BRACKET
          </button>
        </>
      ) : event.phase === "ONGOING" ? (
        <details>
          <summary>Reset an unplayed competition</summary>
          <p>
            Only competitions without recorded results, reports or disputes can be reset. Saved
            registrations remain.
          </p>
          <form
            className="mvp-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const reason = String(new FormData(e.currentTarget).get("reason"));
              if (
                await confirm({
                  title: "Reset bracket and schedules?",
                  description:
                    "The generated matches and lobby rounds will be removed. Saved registrations remain available for reseeding.",
                  action: "RESET BRACKET",
                })
              )
                await run("bracket/reset", { reason });
            }}
          >
            <Field label="Reset reason">
              <textarea name="reason" minLength={10} maxLength={2000} required />
            </Field>
            <button className="button outline" disabled={busy}>
              RESET UNPLAYED BRACKET
            </button>
          </form>
        </details>
      ) : (
        <p>
          The competition is {event.phase.toLowerCase()}. Played results require reviewed
          corrections.
        </p>
      )}
    </section>
  );
}

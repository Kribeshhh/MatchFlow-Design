import { useState } from "react";
import { send, type Event } from "./api";
import { Field, Notice } from "./UI";
import { useConfirm } from "./DesignSystem";
export function MatchControls({ event, onDone }: { event: Event; onDone: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const confirm = useConfirm();
  const pending = event.matches.filter((m) => m.status !== "COMPLETED" && !m.isBye);
  const slots = event.matches
    .filter((m) => m.round === 1)
    .flatMap((m) =>
      (["A", "B"] as const).flatMap((side) => {
        const team = side === "A" ? m.teamA : m.teamB;
        return team
          ? [
              {
                value: `${m.id}:${side}`,
                label: `Match ${m.position + 1} · ${side} · ${team.name}`,
              },
            ]
          : [];
      }),
    );
  async function run(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await send(`/tournaments/${event.id}/${path}`, body, method);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mvp-panel">
      <summary>Match formats & assignments</summary>
      {error && <Notice error>{error}</Notice>}
      <form
        className="mvp-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget);
          if (
            await confirm({
              title: "Change match format?",
              description:
                "Pending reports for this match will be superseded. Completed matches cannot be changed.",
              action: "CHANGE FORMAT",
            })
          )
            await run(
              `matches/${v.get("matchId")}/format`,
              { matchFormat: v.get("matchFormat") },
              "PATCH",
            );
        }}
      >
        <Field label="Pending match">
          <select name="matchId" required>
            <option value="">Choose a match</option>
            {pending.map((m) => (
              <option key={m.id} value={m.id}>
                R{m.round} · {m.teamA?.name || "TBD"} vs {m.teamB?.name || "TBD"} ·{" "}
                {m.matchFormat || event.matchFormat}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Match format override">
          <select name="matchFormat">
            {["SCORE", "BO1", "BO3", "BO5"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
        <button className="button outline" disabled={busy || !pending.length}>
          SAVE MATCH FORMAT
        </button>
      </form>
      {["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"].includes(event.format) &&
        !event.matches.some((m) => m.status === "COMPLETED") && (
          <form
            className="mvp-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget);
              const slot = (name: string) => {
                const [matchId, side] = String(v.get(name)).split(":");
                return { matchId, side };
              };
              if (
                await confirm({
                  title: "Swap assigned participants?",
                  description:
                    "First-round slots will be exchanged. Pending reports become superseded.",
                  action: "SWAP ASSIGNMENTS",
                })
              )
                await run("assignments/swap", { first: slot("first"), second: slot("second") });
            }}
          >
            {["first", "second"].map((name) => (
              <Field key={name} label={`${name} slot`}>
                <select name={name} required>
                  <option value="">Choose occupied slot</option>
                  {slots.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <button className="button outline" disabled={busy}>
              SWAP FIRST-ROUND ASSIGNMENTS
            </button>
          </form>
        )}
    </details>
  );
}

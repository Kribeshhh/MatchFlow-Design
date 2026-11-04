import { useState } from "react";
import { Field } from "./UI";
import type { Event, Match } from "./api";
export const statKeys = [
  "killsA",
  "deathsA",
  "assistsA",
  "killsB",
  "deathsB",
  "assistsB",
  "durationSeconds",
] as const;
export function resultInput(
  v: Record<string, FormDataEntryValue>,
  event: Pick<Event, "format" | "engineRules">,
  match: Pick<Match, "version" | "teamA" | "teamB">,
) {
  const outcome = String(v.outcome || "PLAYED");
  return {
    outcome,
    expectedVersion: match.version,
    reason: String(v.resultReason || ""),
    ...(["FORFEIT", "NO_SHOW"].includes(outcome)
      ? { winnerId: String(v.winnerId) }
      : {
          scoreA: Number(v.scoreA),
          scoreB: Number(v.scoreB),
          ...(["ROUND_ROBIN", "SWISS", "GROUPS", "LEAGUE"].includes(event.format)
            ? { statistics: Object.fromEntries(statKeys.map((key) => [key, Number(v[key])])) }
            : {}),
        }),
  };
}
export function ResultFields({
  event,
  match,
}: {
  event: Pick<Event, "format" | "engineRules">;
  match: Pick<Match, "version" | "teamA" | "teamB">;
}) {
  const [outcome, setOutcome] = useState("PLAYED");
  const administrative = ["FORFEIT", "NO_SHOW"].includes(outcome);
  return (
    <>
      <Field label="Result type">
        <select name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="PLAYED">Played match</option>
          {event.format === "LEAGUE" && event.engineRules.league?.allowDraws && (
            <option value="DRAW">Draw (league stage only)</option>
          )}
          <option value="FORFEIT">Forfeit</option>
          <option value="NO_SHOW">No-show after grace period</option>
        </select>
      </Field>
      {administrative ? (
        <>
          <Field label="Winning participant">
            <select name="winnerId" required>
              <option value="">Select winner</option>
              {[match.teamA, match.teamB]
                .filter((t) => t !== null)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Result reason">
            <textarea name="resultReason" required minLength={10} maxLength={2000} />
          </Field>
          <p>No score or KDA is invented for forfeits or no-shows.</p>
        </>
      ) : (
        <>
          <div className="mvp-form-grid">
            {(["A", "B"] as const).map((side) => (
              <Field
                key={side}
                label={(side === "A" ? match.teamA : match.teamB)?.name || `Team ${side}`}
              >
                <input
                  name={`score${side}`}
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  required
                  disabled={!match.teamA || !match.teamB}
                />
              </Field>
            ))}
          </div>
          {["ROUND_ROBIN", "SWISS", "GROUPS", "LEAGUE"].includes(event.format) && (
            <div className="mvp-form-grid">
              {statKeys.map((key) => (
                <Field
                  key={key}
                  label={
                    key === "durationSeconds"
                      ? "Total match duration (seconds)"
                      : `${key.slice(0, -1)} · ${key.endsWith("A") ? match.teamA?.name : match.teamB?.name}`
                  }
                >
                  <input
                    name={key}
                    type="number"
                    min={key === "durationSeconds" ? 1 : 0}
                    max={key === "durationSeconds" ? 86400 : 100000}
                    required
                  />
                </Field>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

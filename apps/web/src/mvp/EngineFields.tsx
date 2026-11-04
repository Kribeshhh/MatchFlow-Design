import { Field } from "./UI";
import type { EngineRules } from "../../../../packages/shared/src/engine";
export function EngineFields({ format, rules = {} }: { format: string; rules?: EngineRules }) {
  return (
    <fieldset className="mvp-form">
      <legend>Competition rules</legend>
      <Field label="No-show grace period (minutes)">
        <input
          name="engineGrace"
          type="number"
          min={0}
          max={120}
          required
          defaultValue={rules.noShowGraceMinutes ?? 15}
        />
      </Field>
      {format === "GROUPS" && (
        <>
          <Field label="Number of groups">
            <select name="engineGroups" defaultValue={rules.groups?.count ?? 2}>
              {[2, 4, 8].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Qualifiers per group">
            <select name="engineAdvance" defaultValue={rules.groups?.advance ?? 1}>
              <option>1</option>
              <option>2</option>
            </select>
          </Field>
          <p>
            Seeded groups play round robin. Qualifiers enter single-elimination playoffs. Exact
            qualification ties require a deciding playoff.
          </p>
        </>
      )}
      {format === "LEAGUE" && (
        <>
          <Field label="League cycles">
            <select name="engineCycles" defaultValue={rules.league?.cycles ?? 1}>
              <option value="1">Single round robin</option>
              <option value="2">Double round robin</option>
            </select>
          </Field>
          <div className="mvp-form-grid">
            {(
              [
                ["Win", "winPoints", 3],
                ["Draw", "drawPoints", 1],
                ["Loss", "lossPoints", 0],
              ] as const
            ).map(([label, key, fallback]) => (
              <Field key={key} label={`${label} points`}>
                <input
                  name={`engine${key}`}
                  type="number"
                  required
                  min={key === "winPoints" ? 1 : 0}
                  max={100}
                  defaultValue={rules.league?.[key] ?? fallback}
                />
              </Field>
            ))}
          </div>
          <label>
            <input type="checkbox" name="engineDraws" defaultChecked={rules.league?.allowDraws} />{" "}
            Allow drawn league matches (score-based only)
          </label>
          <p>
            Points, score difference, KDA and faster wins determine standings. Exact first-place
            ties create a decisive playoff.
          </p>
        </>
      )}
      {format === "BATTLE_ROYALE" && (
        <>
          <Field label="Number of lobby rounds">
            <input
              name="engineRounds"
              type="number"
              min={1}
              max={32}
              required
              defaultValue={rules.battle?.rounds}
            />
          </Field>
          <Field
            label="Placement points"
            hint="Comma-separated points for 1st, 2nd, 3rd, and so on. Unlisted placements earn zero. Enter your event's rules; no official preset is applied."
          >
            <input
              name="enginePlacements"
              required
              maxLength={400}
              defaultValue={rules.battle?.placementPoints.join(", ")}
            />
          </Field>
          <Field label="Points per elimination">
            <input
              name="engineEliminations"
              type="number"
              min={0}
              max={1000}
              required
              defaultValue={rules.battle?.eliminationPoints}
            />
          </Field>
          <Field
            label="Ordered tie-breakers"
            hint="Comma-separated WINS, ELIMINATIONS, PLACEMENT_POINTS or LAST_ROUND_PLACEMENT. No repeats; finish with LAST_ROUND_PLACEMENT."
          >
            <input
              name="engineTies"
              required
              maxLength={100}
              defaultValue={rules.battle?.tieBreakers.join(", ")}
            />
          </Field>
          <p>
            Each lobby records all entrants, placements and eliminations. Equal leaders after all
            tie-breakers play an extra lobby.
          </p>
        </>
      )}
    </fieldset>
  );
}
export function engineInput(v: Record<string, FormDataEntryValue>) {
  return {
    noShowGraceMinutes: Number(v.engineGrace ?? 15),
    ...(v.format === "GROUPS"
      ? { groups: { count: Number(v.engineGroups), advance: Number(v.engineAdvance) } }
      : {}),
    ...(v.format === "LEAGUE"
      ? {
          league: {
            cycles: Number(v.engineCycles),
            winPoints: Number(v.enginewinPoints),
            drawPoints: Number(v.enginedrawPoints),
            lossPoints: Number(v.enginelossPoints),
            allowDraws: v.engineDraws === "on",
          },
        }
      : {}),
    ...(v.format === "BATTLE_ROYALE"
      ? {
          battle: {
            rounds: Number(v.engineRounds),
            placementPoints: String(v.enginePlacements || "")
              .split(",")
              .map((n) => Number(n.trim())),
            eliminationPoints: Number(v.engineEliminations),
            tieBreakers: String(v.engineTies || "")
              .split(",")
              .map((s) => s.trim().toUpperCase()),
          },
        }
      : {}),
  };
}

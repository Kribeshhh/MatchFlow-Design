import { useState } from "react";
import { EngineFields, engineInput } from "./EngineFields";
import { Field } from "./UI";
import type { Event } from "./api";
export const formatNames = {
  SINGLE_ELIMINATION: "Single elimination",
  DOUBLE_ELIMINATION: "Double elimination",
  ROUND_ROBIN: "Round robin",
  SWISS: "Swiss",
  GROUPS: "Groups → playoffs",
  LEAGUE: "League / season",
  BATTLE_ROYALE: "Battle royale",
};
export function TournamentFields({ event }: { event?: Event }) {
  const [format, setFormat] = useState(event?.format || "SINGLE_ELIMINATION");
  return (
    <>
      <div className="mvp-form-grid">
        <Field label="Format">
          <select name="format" value={format} onChange={(e) => setFormat(e.target.value)}>
            {Object.entries(formatNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Match scoring">
          <select name="matchFormat" defaultValue={event?.matchFormat || "SCORE"}>
            {["SCORE", "BO1", "BO3", "BO5"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="Competition">
          <select name="competitionType" defaultValue={event?.competitionType || "TEAM"}>
            <option value="TEAM">Reusable teams</option>
            <option value="INDIVIDUAL">Individual players (roster size 1)</option>
          </select>
        </Field>
        <Field label="Visibility">
          <select name="visibility" defaultValue={event?.visibility || "PUBLIC"}>
            <option value="PUBLIC">Public discovery</option>
            <option value="PRIVATE">Private · secret share link</option>
          </select>
        </Field>
        <Field label="Region">
          <input name="region" maxLength={80} defaultValue={event?.region} />
        </Field>
        <Field label="Location type">
          <select name="locationType" defaultValue={event?.locationType || "ONLINE"}>
            <option>ONLINE</option>
            <option>OFFLINE</option>
          </select>
        </Field>
        <Field label="Venue or server">
          <input name="location" maxLength={300} defaultValue={event?.location} />
        </Field>
        <Field
          label="Eligible regions"
          hint="Comma-separated declared regions; leave empty for all regions."
        >
          <input
            name="eligibleRegions"
            maxLength={1600}
            defaultValue={event?.eligibleRegions.join(", ")}
          />
        </Field>
      </div>
      <p>
        Round robin and Swiss: up to 16 entries. Standings use wins, opponent strength (Swiss),
        score difference, KDA, then faster wins. Unresolved first-place ties create a playoff.
        Organizers must record KDA totals and match duration.
      </p>
      <p>
        Double elimination includes a grand-final reset when the undefeated finalist loses. Battle
        royale uses lobby placements and eliminations instead of head-to-head brackets.
      </p>
      <EngineFields key={format} format={format} rules={event?.engineRules} />
      <label>
        <input name="checkInRequired" type="checkbox" defaultChecked={event?.checkInRequired} />{" "}
        Require check-in between registration close and tournament start
      </label>
      <label>
        <input name="waitlistEnabled" type="checkbox" defaultChecked={event?.waitlistEnabled} />{" "}
        Enable waitlist with automatic promotion to organizer review
      </label>
      <Field label="Eligibility requirements">
        <textarea name="eligibility" maxLength={3000} defaultValue={event?.eligibility} />
      </Field>
      <Field label="Prize information">
        <textarea name="prizeInfo" maxLength={2000} defaultValue={event?.prizeInfo} />
      </Field>
      <p>Entry is free. Paid registration and payment collection are unavailable.</p>
    </>
  );
}
export function tournamentInput(v: Record<string, FormDataEntryValue>) {
  return {
    ...Object.fromEntries(Object.entries(v).filter(([key]) => !key.startsWith("engine"))),
    engineRules: engineInput(v),
    teamSize: Number(v.teamSize),
    maxTeams: Number(v.maxTeams),
    opensAt: new Date(String(v.opensAt)).toISOString(),
    closesAt: new Date(String(v.closesAt)).toISOString(),
    startsAt: new Date(String(v.startsAt)).toISOString(),
    endsAt: v.endsAt ? new Date(String(v.endsAt)).toISOString() : null,
    eligibleRegions: String(v.eligibleRegions || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    checkInRequired: v.checkInRequired === "on",
    waitlistEnabled: v.waitlistEnabled === "on",
    saveAsDraft: v.saveAsDraft === "on",
  };
}

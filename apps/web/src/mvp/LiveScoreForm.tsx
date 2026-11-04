import { useState } from "react";
import { send, type Event, type Match } from "./api";
import { Field, Notice } from "./UI";
export function LiveScoreForm({
  event,
  match,
  onDone,
}: {
  event: Event;
  match: Match;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<{ scoreA: number; scoreB: number; version: number } | null>(
    null,
  );
  const values = draft ?? {
    scoreA: match.liveScoreA ?? 0,
    scoreB: match.liveScoreB ?? 0,
    version: match.version,
  };
  const stale = draft !== null && draft.version !== match.version;
  if (!match.teamA || !match.teamB || match.isBye) return null;
  return (
    <form
      className="mvp-panel mvp-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (stale) return;
        setBusy(true);
        setError("");
        try {
          await send(
            `/tournaments/${event.id}/matches/${match.id}/live-score`,
            {
              scoreA: values.scoreA,
              scoreB: values.scoreB,
              expectedVersion: values.version,
            },
            "PATCH",
          );
          setDraft(null);
          onDone();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Live scoreboard</h3>
      <p>
        Provisional scores update viewers immediately. They do not confirm a result or advance a
        participant.
      </p>
      {stale && (
        <Notice>
          This match changed while you were editing. Review the latest scores before publishing.{" "}
          <button type="button" className="button outline" onClick={() => setDraft(null)}>
            LOAD LATEST SCORES
          </button>
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      <div className="mvp-form-grid">
        <Field label={`Live score · ${match.teamA.name}`}>
          <input
            name="scoreA"
            type="number"
            min={0}
            max={999}
            required
            value={values.scoreA}
            onChange={(e) => setDraft({ ...values, scoreA: Number(e.target.value) })}
          />
        </Field>
        <Field label={`Live score · ${match.teamB.name}`}>
          <input
            name="scoreB"
            type="number"
            min={0}
            max={999}
            required
            value={values.scoreB}
            onChange={(e) => setDraft({ ...values, scoreB: Number(e.target.value) })}
          />
        </Field>
      </div>
      <button className="button outline" disabled={busy || stale}>
        PUBLISH LIVE SCORE
      </button>
    </form>
  );
}

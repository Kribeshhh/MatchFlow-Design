import { useState } from "react";
import { api, send, useResource, type Event, type Match } from "./api";
import { Field, Notice, Loading } from "./UI";
import { ResultFields, resultInput } from "./ResultFields";
import { BattleFields, battleInput } from "./BattleView";
import { useConfirm } from "./DesignSystem";
import type {
  CorrectionPreview,
  BattleView,
} from "../../../../packages/shared/src/engine-responses";
type Dispute = {
  id: string;
  tournamentId: string;
  reason: string;
  matchId: string | null;
  battleRoundId: string | null;
};
type Preview = CorrectionPreview & {
  event: Pick<Event, "format" | "engineRules">;
  match: Pick<Match, "version" | "teamA" | "teamB"> | null;
  round: BattleView["rounds"][number] | null;
  participants: BattleView["participants"];
};
export default function AdminDisputes({ admin }: { admin: boolean }) {
  const [page, setPage] = useState(1),
    r = useResource<Dispute[]>(`/admin/disputes?page=${page}`),
    [selected, setSelected] = useState<Dispute | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const base = selected
    ? `/admin/tournaments/${selected.tournamentId}/disputes/${selected.id}`
    : "";
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Result disputes</h2>
      {error && <Notice error>{error}</Notice>}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <Notice error>{r.error}</Notice>
      ) : (
        r.data?.map((d) => (
          <article className="mvp-panel" key={d.id}>
            <h3>{d.battleRoundId ? "Lobby result" : "Match result"}</h3>
            <p>{d.reason}</p>
            <p>Tournament {d.tournamentId}</p>
            {admin ? (
              <button
                className="button outline"
                disabled={busy}
                onClick={() => {
                  setSelected(d);
                  setPreview(null);
                }}
              >
                REVIEW DISPUTE
              </button>
            ) : (
              <p>Administrator review is required to change a confirmed result.</p>
            )}
          </article>
        ))
      )}
      {!r.loading && !r.data?.length && <p>No open disputes on this page.</p>}
      {selected && (
        <section className="mvp-panel" aria-label="Dispute review">
          <h3>Review {selected.id}</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(new FormData(e.currentTarget).get("reason"));
              void run(async () => {
                if (
                  await confirm({
                    title: "Dismiss this dispute?",
                    description: "The result stays unchanged and your reason is retained.",
                    action: "DISMISS DISPUTE",
                  })
                ) {
                  await send(`${base}/dismiss`, { reason });
                  setSelected(null);
                  setPreview(null);
                  r.refresh();
                }
              });
            }}
          >
            <Field label="Dispute resolution">
              <textarea name="reason" minLength={10} maxLength={2000} required />
            </Field>
            <button className="button outline" disabled={busy}>
              DISMISS DISPUTE
            </button>
          </form>
          <button
            className="button outline"
            disabled={busy}
            onClick={() => void run(async () => setPreview(await api<Preview>(`${base}/preview`)))}
          >
            PREVIEW CORRECTION
          </button>
          {preview && (
            <section aria-label="Rollback preview">
              <h3>Rollback preview</h3>
              <p>
                {preview.voidedResults} dependent completed results will be voided. Affected matches
                must be replayed.
              </p>
              <ul>
                {preview.affectedMatches.map((m) => (
                  <li key={m.id}>
                    Round {m.round} · {m.status} · {m.id}
                  </li>
                ))}
                {preview.affectedRounds.map((v) => (
                  <li key={v.id}>
                    Lobby {v.number} · {v.status}
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    v = Object.fromEntries(new FormData(form));
                  void run(async () => {
                    const result = preview.match
                      ? resultInput(v, preview.event, preview.match)
                      : preview.round
                        ? battleInput(form, preview.round)
                        : null;
                    if (!result) throw Error("The result changed. Reload the preview.");
                    if (
                      await confirm({
                        title: "Void affected results and apply correction?",
                        description:
                          "This retains history and requires affected matches to be replayed.",
                        action: "VOID & REPLAY",
                      })
                    ) {
                      await send(`${base}/correct`, {
                        previewHash: preview.previewHash,
                        acknowledgement: "VOID_AND_REPLAY",
                        reason: String(v.correctionReason),
                        result,
                      });
                      setPreview(null);
                      setSelected(null);
                      r.refresh();
                    }
                  });
                }}
              >
                {preview.match && <ResultFields event={preview.event} match={preview.match} />}{" "}
                {preview.round && (
                  <BattleFields round={preview.round} participants={preview.participants} />
                )}
                <Field label="Correction reason">
                  <textarea name="correctionReason" minLength={10} maxLength={2000} required />
                </Field>
                <label>
                  <input type="checkbox" required /> I reviewed the affected results and acknowledge
                  replay.
                </label>
                <button className="button primary" disabled={busy}>
                  APPLY REVIEWED CORRECTION
                </button>
              </form>
            </section>
          )}
        </section>
      )}
      <div className="mvp-actions">
        <button className="button outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
          PREVIOUS
        </button>
        <button
          className="button outline"
          disabled={(r.data?.length || 0) < 25}
          onClick={() => setPage(page + 1)}
        >
          NEXT
        </button>
      </div>
    </section>
  );
}

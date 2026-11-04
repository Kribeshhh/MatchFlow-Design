import { useState } from "react";
import { api, send, useResource, date, type Event, type Match } from "./api";
import type {
  EngineActivity,
  CorrectionPreview,
  BattleView as BattleData,
} from "../../../../packages/shared/src/engine-responses";
import { Field, Notice, Loading, ResourceError } from "./UI";
import { ResultFields, resultInput } from "./ResultFields";
import { BattleFields, battleInput } from "./BattleView";
import { useConfirm } from "./DesignSystem";
import { useAuth } from "./Auth";
export function EngineReview({
  event,
  manage,
  onDone,
}: {
  event: Event;
  manage: boolean;
  onDone: () => void;
}) {
  const [cursor, setCursor] = useState("");
  const base = `/tournaments/${event.id}`;
  const r = useResource<EngineActivity>(
    `${base}/${manage ? "engine-history" : "my-reports"}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  const [preview, setPreview] = useState<{
    dispute: EngineActivity["disputes"][number];
    data: CorrectionPreview;
    battle?: BattleData;
  } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const { user } = useAuth();
  async function run(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await send(`${base}/${path}`, body);
      setPreview(null);
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
    ownedIds = event.registrations
      .filter((r) => r.canManageRoster || r.roster.some((p) => p.id === user?.id))
      .map((r) => r.teamId);
  const relevant = event.matches.filter(
    (m) =>
      !m.isBye &&
      m.teamA &&
      m.teamB &&
      (manage || [m.teamAId, m.teamBId].some((id) => id && ownedIds.includes(id))),
  );
  const label = (m?: Match) =>
    m
      ? `${m.teamA?.name || "TBD"} vs ${m.teamB?.name || "TBD"} · round ${m.round}`
      : "Historical match";
  const disputedMatch = preview
    ? event.matches.find((m) => m.id === preview.dispute.matchId)
    : undefined;
  const disputedRound = preview?.battle?.rounds.find((r) => r.id === preview.dispute.battleRoundId);
  return (
    <section className="mvp-stack">
      <h2>{manage ? "Result review & history" : "Your reports & disputes"}</h2>
      {error && <Notice error>{error}</Notice>}
      <p>
        Reports await organizer confirmation. Open disputes pause dependent results. Corrections
        require a fresh preview and replay of affected matches.
      </p>
      {!manage &&
        relevant
          .filter((m) => m.status !== "COMPLETED" && event.phase === "ONGOING")
          .map((m) => (
            <details className="mvp-panel" key={m.id}>
              <summary>Report · {label(m)}</summary>
              <form
                className="mvp-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    `matches/${m.id}/reports`,
                    resultInput(Object.fromEntries(new FormData(e.currentTarget)), event, m),
                  );
                }}
              >
                <ResultFields event={event} match={m} />
                <button
                  className="button primary"
                  disabled={
                    busy || data.reports.some((r) => r.matchId === m.id && r.status === "PENDING")
                  }
                >
                  SUBMIT RESULT FOR REVIEW
                </button>
              </form>
            </details>
          ))}
      {relevant
        .filter((m) => m.status === "COMPLETED")
        .map((m) => (
          <details className="mvp-panel" key={m.id}>
            <summary>Dispute / correct · {label(m)}</summary>
            <DisputeForm
              busy={busy}
              submit={(reason) => run(`matches/${m.id}/disputes`, { reason })}
            />
          </details>
        ))}
      {event.format === "BATTLE_ROYALE" && (
        <BattleDisputes
          event={event}
          manage={manage}
          ownedIds={ownedIds}
          busy={busy}
          submit={(id, reason) => run(`battle/${id}/disputes`, { reason })}
        />
      )}
      {data.reports.map((report) => (
        <article className="mvp-panel" key={report.id}>
          <h3>Report · {label(event.matches.find((m) => m.id === report.matchId))}</h3>
          <p>
            {report.status} · {date(report.createdAt)}
          </p>
          <p>
            {report.payload.outcome}: {report.payload.scoreA ?? "—"} /{" "}
            {report.payload.scoreB ?? "—"}{" "}
            {report.payload.winnerId &&
              `Winner: ${event.registrations.find((r) => r.teamId === report.payload.winnerId)?.team.name || "Participant"}`}
          </p>
          {report.payload.reason && <p>{report.payload.reason}</p>}
          {report.payload.statistics && (
            <dl className="mvp-facts">
              {Object.entries(report.payload.statistics).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {manage && report.status === "PENDING" && (
            <form
              className="mvp-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget);
                const approve = v.get("decision") === "APPROVE";
                if (
                  await confirm({
                    title: approve ? "Confirm reported result?" : "Reject this report?",
                    description: approve
                      ? "The submitted score and statistics will update progression."
                      : "This proposal will be rejected without changing the match.",
                    action: approve ? "CONFIRM REPORT" : "REJECT REPORT",
                  })
                )
                  await run(`reports/${report.id}/review`, {
                    approve,
                    reason: String(v.get("reason")),
                  });
              }}
            >
              <Field label="Report decision">
                <select name="decision">
                  <option value="APPROVE">Confirm result</option>
                  <option value="REJECT">Reject proposal</option>
                </select>
              </Field>
              <Field label="Review reason">
                <textarea name="reason" minLength={10} maxLength={2000} required />
              </Field>
              <button className="button outline" disabled={busy}>
                REVIEW REPORT
              </button>
            </form>
          )}
        </article>
      ))}
      {data.disputes.map((dispute) => (
        <article className="mvp-panel" key={dispute.id}>
          <h3>
            {dispute.battleRoundId
              ? "Lobby dispute"
              : label(event.matches.find((m) => m.id === dispute.matchId))}
          </h3>
          <p>
            {dispute.status} · {date(dispute.createdAt)}
          </p>
          <p>{dispute.reason}</p>
          {dispute.resolution && <p>Resolution: {dispute.resolution}</p>}
          {manage && dispute.status === "OPEN" && (
            <>
              <button
                className="button outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const data = await api<CorrectionPreview>(
                      `${base}/disputes/${dispute.id}/preview`,
                    );
                    const battle = dispute.battleRoundId
                      ? await api<BattleData>(`${base}/battle`)
                      : undefined;
                    setPreview({ dispute, data, battle });
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                PREVIEW CORRECTION
              </button>
              <details>
                <summary>Dismiss dispute</summary>
                <DisputeForm
                  label="Dismissal reason"
                  button="DISMISS DISPUTE"
                  busy={busy}
                  submit={(reason) => run(`disputes/${dispute.id}/dismiss`, { reason })}
                />
              </details>
            </>
          )}
        </article>
      ))}
      {preview && (
        <section className="mvp-panel" aria-label="Rollback preview">
          <h3>Rollback preview</h3>
          <p>
            {preview.data.voidedResults} dependent completed results will be voided. Their matches
            must be replayed.{" "}
            {preview.data.championWillBeRecomputed ? "The current champion will be cleared." : ""}
          </p>
          <ul>
            {preview.data.affectedMatches.map((m) => (
              <li key={m.id}>
                {label(event.matches.find((match) => match.id === m.id))} · {m.status}
              </li>
            ))}
            {preview.data.affectedRounds.map((r) => (
              <li key={r.id}>
                Lobby {r.number} · {r.status}
              </li>
            ))}
          </ul>
          {!preview.data.affectedMatches.length && !preview.data.affectedRounds.length && (
            <p>No dependent matches exist. Only the disputed result will be corrected.</p>
          )}
          <form
            className="mvp-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const form = e.currentTarget,
                  v = Object.fromEntries(new FormData(form));
                const result = disputedMatch
                  ? resultInput(v, event, disputedMatch)
                  : disputedRound
                    ? battleInput(form, disputedRound)
                    : null;
                if (!result)
                  throw new Error(
                    "Reload the preview; the disputed result is no longer available.",
                  );
                if (
                  await confirm({
                    title: "Void affected results and apply correction?",
                    description: `${preview.data.voidedResults} dependent results will be voided. Historical results remain in the audit record. Affected matches must be replayed.`,
                    action: "VOID & REPLAY",
                  })
                )
                  await run(`disputes/${preview.dispute.id}/correct`, {
                    previewHash: preview.data.previewHash,
                    acknowledgement: "VOID_AND_REPLAY",
                    reason: String(v.correctionReason),
                    result,
                  });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {disputedMatch && <ResultFields event={event} match={disputedMatch} />}{" "}
            {disputedRound && preview.battle && (
              <BattleFields round={disputedRound} participants={preview.battle.participants} />
            )}
            <Field label="Correction reason">
              <textarea name="correctionReason" minLength={10} maxLength={2000} required />
            </Field>
            <p>
              Recent authentication is required. If prompted, reauthenticate in Account settings and
              obtain a fresh preview.
            </p>
            <label>
              <input type="checkbox" required /> I reviewed the affected results and understand they
              must be replayed.
            </label>
            <button className="button primary" disabled={busy}>
              APPLY REVIEWED CORRECTION
            </button>
            <button className="button outline" type="button" onClick={() => setPreview(null)}>
              CANCEL CORRECTION
            </button>
          </form>
        </section>
      )}
      {manage && (
        <details className="mvp-panel">
          <summary>Competition history</summary>
          <ol>
            {data.history.map((h) => (
              <li key={h.id}>
                {date(h.createdAt)} · {h.action} {h.reason && `· ${h.reason}`}
                {h.evidence.length > 0 && (
                  <details>
                    <summary>Result evidence</summary>
                    <ul>
                      {h.evidence.map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
          <div className="mvp-action-row">
            {cursor && (
              <button className="button outline" onClick={() => setCursor("")}>
                LATEST HISTORY
              </button>
            )}
            {data.nextCursor && (
              <button className="button outline" onClick={() => setCursor(data.nextCursor!)}>
                OLDER HISTORY
              </button>
            )}
          </div>
        </details>
      )}
      {!data.reports.length && !data.disputes.length && <p>No reports or disputes submitted.</p>}
    </section>
  );
}
function DisputeForm({
  busy,
  submit,
  label = "Dispute reason",
  button = "OPEN DISPUTE",
}: {
  busy: boolean;
  submit: (reason: string) => Promise<void>;
  label?: string;
  button?: string;
}) {
  return (
    <form
      className="mvp-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(String(new FormData(e.currentTarget).get("reason")));
      }}
    >
      <Field label={label}>
        <textarea name="reason" required minLength={10} maxLength={2000} />
      </Field>
      <button className="button outline" disabled={busy}>
        {button}
      </button>
    </form>
  );
}
function BattleDisputes({
  event,
  manage,
  ownedIds,
  busy,
  submit,
}: {
  event: Event;
  manage: boolean;
  ownedIds: string[];
  busy: boolean;
  submit: (id: string, reason: string) => Promise<void>;
}) {
  const r = useResource<BattleData>(`/tournaments/${event.id}/battle`);
  return (
    <>
      {r.error && <ResourceError message={r.error} retry={r.refresh} />}{" "}
      {r.data?.rounds
        .filter(
          (r) =>
            r.status === "COMPLETED" &&
            (manage || r.participantIds.some((id) => ownedIds.includes(id))),
        )
        .map((r) => (
          <details className="mvp-panel" key={r.id}>
            <summary>Dispute / correct lobby {r.number}</summary>
            <DisputeForm busy={busy} submit={(reason) => submit(r.id, reason)} />
          </details>
        ))}
    </>
  );
}

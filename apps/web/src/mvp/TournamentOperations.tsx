import { useState } from "react";
import type { Event } from "./api";
import { send, localInput } from "./api";
import { tournamentSchema } from "../../../../packages/shared/src/tournaments";
import { Field, Notice } from "./UI";
import { useConfirm } from "./DesignSystem";
import { MediaUpload } from "./MediaUpload";
import { TournamentFields, tournamentInput } from "./TournamentFields";
export function TournamentOperations({ event: t, refresh }: { event: Event; refresh: () => void }) {
  const confirm = useConfirm();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  async function run(task: () => Promise<unknown>, reload = true) {
    setBusy(true);
    setError("");
    try {
      await task();
      if (reload) refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const editable = ["DRAFT", "PUBLISHED", "REGISTRATION", "POSTPONED"].includes(t.phase);
  return (
    <section className="mvp-panel mvp-section">
      <h2>Event operations</h2>
      <p>
        {t.registrations.filter((r) => r.status === "PENDING").length} awaiting review ·{" "}
        {t.registrations.filter((r) => r.status === "WAITLISTED").length} waitlisted ·{" "}
        {t.registrations.filter((r) => r.checkedInAt).length} checked in
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="mvp-action-row">
        {["DRAFT", "POSTPONED"].includes(t.phase) && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(() => send(`/tournaments/${t.id}/lifecycle`, { action: "PUBLISH" }))
            }
          >
            PUBLISH EVENT
          </button>
        )}
        {t.checkInRequired && ["PUBLISHED", "REGISTRATION"].includes(t.phase) && (
          <button
            className="button outline"
            disabled={busy || Date.now() < Date.parse(t.closesAt)}
            onClick={() =>
              void run(() => send(`/tournaments/${t.id}/lifecycle`, { action: "CHECK_IN" }))
            }
          >
            OPEN CHECK-IN
          </button>
        )}
        <a className="button outline" href={`/api/tournaments/${t.id}/export`} download>
          EXPORT PARTICIPANTS
        </a>
        {t.visibility === "PRIVATE" && t.phase !== "DRAFT" && (
          <button
            className="button outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (
                  !(await confirm({
                    title: "Create a new private link?",
                    description:
                      "This replaces the previous link. Anyone with the new link can view the event and request entry. Existing participants retain access.",
                    action: "CREATE LINK",
                  }))
                )
                  return;
                const result = await send<{ token: string }>(`/tournaments/${t.id}/share-link`);
                setLink(`${window.location.origin}/tournaments/${t.id}#access=${result.token}`);
              }, false)
            }
          >
            CREATE / ROTATE SHARE LINK
          </button>
        )}
      </div>
      {link && (
        <Field
          label="Secret event link"
          hint="Copy this link now. Treat it as a password; it is not stored in browser storage."
        >
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
        </Field>
      )}
      {editable && (
        <details>
          <summary>Edit tournament settings</summary>
          <form
            className="mvp-form"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Object.fromEntries(new FormData(e.currentTarget));
              void run(async () => {
                const data = tournamentSchema.parse(tournamentInput(v));
                await send(`/tournaments/${t.id}`, data, "PATCH");
              });
            }}
          >
            <Field label="Tournament name">
              <input name="name" defaultValue={t.name} minLength={3} maxLength={100} required />
            </Field>
            <input type="hidden" name="game" value={t.game} />
            <div className="mvp-form-grid">
              <Field label="Players per team">
                <input
                  name="teamSize"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={t.teamSize}
                  required
                />
              </Field>
              <Field label="Maximum entries">
                <input
                  name="maxTeams"
                  type="number"
                  min={2}
                  max={64}
                  defaultValue={t.maxTeams}
                  required
                />
              </Field>
              {(["opensAt", "closesAt", "startsAt", "endsAt"] as const).map((key, i) => (
                <Field
                  key={key}
                  label={
                    [
                      "Registration opens",
                      "Registration closes",
                      "Tournament start",
                      "Tournament end",
                    ][i]
                  }
                >
                  <input
                    name={key}
                    type="datetime-local"
                    defaultValue={t[key] ? localInput(t[key]) : ""}
                    required={key !== "endsAt"}
                  />
                </Field>
              ))}
            </div>
            <Field label="Description">
              <textarea
                name="description"
                minLength={10}
                maxLength={5000}
                defaultValue={t.description}
                required
              />
            </Field>
            <Field label="Rules">
              <textarea
                name="rules"
                minLength={10}
                maxLength={5000}
                defaultValue={t.rules}
                required
              />
            </Field>
            <TournamentFields event={t} />
            <p>
              Once entries exist, format, eligibility, competition type, visibility and roster rules
              are locked. To postpone, select Postpone below, update the dates here, then publish
              again.
            </p>
            <button className="button primary" disabled={busy}>
              SAVE SETTINGS
            </button>
          </form>
        </details>
      )}
      {editable && (
        <MediaUpload
          path={`/tournaments/${t.id}/cover`}
          label="Tournament cover"
          current={t.coverId ? `/api/media/${t.coverId}` : null}
          onChange={refresh}
        />
      )}
      <details>
        <summary>Publish an announcement</summary>
        <form
          className="mvp-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const values = Object.fromEntries(new FormData(form));
            void run(async () => {
              await send(`/tournaments/${t.id}/announcements`, values);
              form.reset();
            });
          }}
        >
          <Field label="Announcement title">
            <input name="title" minLength={3} maxLength={120} required />
          </Field>
          <Field label="Announcement message">
            <textarea name="body" maxLength={5000} required />
          </Field>
          <button className="button primary" disabled={busy}>
            PUBLISH ANNOUNCEMENT
          </button>
        </form>
      </details>
      {!["COMPLETED", "CANCELLED"].includes(t.phase) && (
        <details>
          <summary>Cancel or postpone</summary>
          <form
            className="mvp-form"
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              void run(async () => {
                if (
                  await confirm({
                    title: `${values.action === "CANCEL" ? "Cancel" : "Postpone"} this event?`,
                    description:
                      "Registrations and results are retained. Participants will see the reason on the event page.",
                    action: "CONFIRM CHANGE",
                  })
                )
                  await send(`/tournaments/${t.id}/lifecycle`, values);
              });
            }}
          >
            <Field label="Event action">
              <select name="action">
                <option value="CANCEL">Cancel permanently</option>
                {t.phase !== "ONGOING" && (
                  <option value="POSTPONE">Postpone and close entry</option>
                )}
              </select>
            </Field>
            <Field label="Reason">
              <textarea name="reason" minLength={10} maxLength={2000} required />
            </Field>
            <button className="button outline danger" disabled={busy}>
              REVIEW CHANGE
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

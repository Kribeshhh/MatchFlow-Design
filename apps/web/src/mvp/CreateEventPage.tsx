import { TournamentFields, tournamentInput, formatNames } from "./TournamentFields";
import { useAuth } from "./Auth";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { tournamentSchema } from "../../../../packages/shared/src/validation";
import { games } from "../data";
import { localInput, send, useResource } from "./api";
import { Field, Notice, PageTitle } from "./UI";
export default function CreateEventPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [organizationId, setOrganizationId] = useState(params.get("organization") || "");
  const organizations =
    useResource<{ id: string; name: string; access: string }[]>("/organizations");
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = ["Identity & format", "Dates & rules", "Review & publish"];
  const values = () => Object.fromEntries(new FormData(form.current!));
  const [review, setReview] = useState<Record<string, FormDataEntryValue>>({});
  function advance() {
    const inputs = form.current!.querySelectorAll<HTMLInputElement>(
      `fieldset[data-step="${step}"] input,fieldset[data-step="${step}"] textarea,fieldset[data-step="${step}"] select`,
    );
    for (const input of inputs) {
      if (!input.reportValidity()) return;
    }
    setError("");
    setReview(values());
    setStep(step + 1);
    requestAnimationFrame(() => heading.current?.focus());
  }
  return (
    <>
      <PageTitle
        label="ORGANIZER / NEW TOURNAMENT"
        title="Set the stage"
        description="A clear format. A ready roster. A tournament worth showing up for."
      />
      <form
        ref={form}
        noValidate
        className="mvp-panel mvp-form mvp-wizard"
        onSubmit={async (e) => {
          e.preventDefault();
          if (step < 2) {
            advance();
            return;
          }
          setBusy(true);
          setError("");
          const v = values();
          try {
            const parsed = tournamentSchema.safeParse({
              ...tournamentInput(v),
              organizationId: v.organizationId || null,
            });
            if (!parsed.success) {
              setError(
                parsed.error.issues.map((i) => `${i.path.join(" ")}: ${i.message}`).join(" · "),
              );
              return;
            }
            const event = await send<{ id: string }>("/tournaments", parsed.data);
            navigate(`/organizer/tournaments/${event.id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Check your dates and try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <ol className="mvp-wizard-steps">
          {steps.map((name, n) => (
            <li key={name} aria-current={step === n ? "step" : undefined}>
              0{n + 1} / {name}
            </li>
          ))}
        </ol>
        <h2 ref={heading} tabIndex={-1}>
          {steps[step]}
        </h2>
        {error && <Notice error>{error}</Notice>}
        <fieldset data-step="0" hidden={step !== 0}>
          <legend className="sr-only">Tournament identity</legend>
          <div className="mvp-form-grid">
            <Field label="Tournament name">
              <input
                name="name"
                required
                minLength={3}
                maxLength={100}
                placeholder="e.g. Valley Open"
              />
            </Field>
            <Field label="Game">
              <select name="game">
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Players per team" hint="Exact roster size, including the captain.">
              <input name="teamSize" type="number" required min={1} max={10} defaultValue={4} />
            </Field>
            <Field label="Maximum teams" hint="2–64 entries. BYEs fill uneven brackets.">
              <input name="maxTeams" type="number" required min={2} max={64} defaultValue={16} />
            </Field>
          </div>
          <Field
            label="Organizing workspace"
            hint="Organization events follow current staff permissions, including removal of their creator."
          >
            <select
              name="organizationId"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
            >
              <option value="">Personal · {user?.username}</option>
              {organizations.data
                ?.filter((o) => ["OWNER", "ADMIN", "MANAGER"].includes(o.access))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </Field>
          <TournamentFields />
        </fieldset>
        <fieldset data-step="1" hidden={step !== 1}>
          <legend className="sr-only">Dates and rules</legend>
          <div className="mvp-form-grid">
            <Field label="Registration opens">
              <input name="opensAt" type="datetime-local" required defaultValue={localInput()} />
            </Field>
            <Field label="Registration closes">
              <input name="closesAt" type="datetime-local" required />
            </Field>
            <Field
              label="Tournament start"
              hint={`Your timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Stored in UTC.`}
            >
              <input name="startsAt" type="datetime-local" required />
            </Field>
          </div>
          <Field label="Tournament end (optional)">
            <input name="endsAt" type="datetime-local" />
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={5000}
              rows={4}
              placeholder="What makes this tournament worth entering?"
            />
          </Field>
          <Field label="Rules">
            <textarea
              name="rules"
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              placeholder="Match format, participation requirements and scoring rules."
            />
          </Field>
        </fieldset>
        {step === 2 && (
          <section className="mvp-review">
            <h3>{String(review.name)}</h3>
            <dl className="mvp-detail-list">
              <div>
                <dt>Game / format</dt>
                <dd>
                  {games.find((g) => g.id === review.game)?.name} ·{" "}
                  {formatNames[review.format as keyof typeof formatNames]}
                </dd>
              </div>
              <div>
                <dt>Roster / capacity</dt>
                <dd>
                  {String(review.teamSize)} players · {String(review.maxTeams)} teams
                </dd>
              </div>
              <div>
                <dt>Registration</dt>
                <dd>
                  {String(review.opensAt).replace("T", " ")} →{" "}
                  {String(review.closesAt).replace("T", " ")}
                </dd>
              </div>
              <div>
                <dt>Starts</dt>
                <dd>{String(review.startsAt).replace("T", " ")} (local time)</dd>
              </div>
            </dl>
            <h3>Description</h3>
            <p className="mvp-prose">{String(review.description)}</p>
            <h3>Rules</h3>
            <p className="mvp-prose">{String(review.rules)}</p>
            <label>
              <input name="saveAsDraft" type="checkbox" /> Save as draft instead of publishing
            </label>
            <Notice>
              Publishing uses your selected visibility. Save a draft to upload a cover before
              publishing. Email verification is required.
            </Notice>
          </section>
        )}
        <div className="mvp-wizard-actions">
          <button
            type="button"
            className="button outline"
            disabled={busy}
            onClick={() => (step ? setStep(step - 1) : navigate("/dashboard"))}
          >
            {step ? "BACK" : "CANCEL"}
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "PUBLISHING…" : step === 2 ? "PUBLISH TOURNAMENT" : "CONTINUE"}
          </button>
        </div>
      </form>
    </>
  );
}

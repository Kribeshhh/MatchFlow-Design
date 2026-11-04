import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { send, useResource, date } from "./api";
import { Field, Notice, PageTitle, Loading } from "./UI";
export default function SupportPage() {
  const [params] = useSearchParams();
  const [targetType, setType] = useState(params.get("type") || "SUPPORT"),
    [targetId, setId] = useState(params.get("id") || ""),
    [category, setCategory] = useState("ABUSE"),
    [description, setDescription] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1);
  const r = useResource<
    {
      id: string;
      category: string;
      description: string;
      status: string;
      resolution: string;
      createdAt: string;
    }[]
  >(`/support/cases?page=${page}`);
  return (
    <>
      <PageTitle
        label="TRUST / SUPPORT"
        title="Make your voice heard"
        description="Report abuse, suspicious listings or a support issue. Do not include passwords, payment information or unnecessary personal details."
      />
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <form
        className="mvp-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await send("/support/cases", {
              targetType,
              ...(targetType !== "SUPPORT" ? { targetId } : {}),
              category: targetType === "SUPPORT" ? "SUPPORT" : category,
              description,
            });
            setDescription("");
            setMessage("Your case was submitted. You can follow its resolution below.");
            r.refresh();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Report type">
          <select value={targetType} onChange={(e) => setType(e.target.value)}>
            {["SUPPORT", "USER", "TEAM", "TOURNAMENT", "ORGANIZATION"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        {targetType !== "SUPPORT" && (
          <>
            <Field
              label="Resource ID"
              hint="Use the report link on a profile, team or tournament, or paste its ID."
            >
              <input
                value={targetId}
                onChange={(e) => setId(e.target.value)}
                required
                maxLength={100}
              />
            </Field>
            <Field label="Reason category">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {["ABUSE", "FRAUD", "SPAM", "OTHER"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="What happened?">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minLength={10}
            maxLength={4000}
            required
          />
        </Field>
        <button className="button primary" disabled={busy}>
          SUBMIT CASE
        </button>
      </form>
      <section className="mvp-section">
        <h2>Your cases</h2>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <Notice error>{r.error}</Notice>
        ) : !r.data?.length ? (
          <p>No cases on this page.</p>
        ) : (
          r.data.map((c) => (
            <article className="mvp-panel" key={c.id}>
              <h3>
                {c.category} · {c.status}
              </h3>
              <p>{c.description}</p>
              <p>{c.resolution || "Awaiting review"}</p>
              <small>
                {date(c.createdAt)} · {c.id}
              </small>
            </article>
          ))
        )}
        <div className="mvp-actions">
          <button
            className="button outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
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
    </>
  );
}

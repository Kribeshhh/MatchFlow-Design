import { useEffect, useState, type CSSProperties } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Loading, Notice, Field, Status } from "./UI";
import { BracketViewport } from "./BracketViewport";
import { date, gameName } from "./api";
type Portal = {
  slug: string;
  title: string;
  intro: string;
  accent: string;
  coverId: string | null;
  hideAttribution: boolean;
  canonicalOrigin: string;
  organization: { name: string; logoId: string | null };
  navigation: { label: string; target: "HOME" | "TOURNAMENTS" | "RESULTS" }[];
};
type Event = {
  id: string;
  name: string;
  description: string;
  rules: string;
  eligibility: string;
  game: string;
  phase: string;
  startsAt: string;
  closesAt: string;
  region: string;
  format: string;
  coverId?: string | null;
  championId?: string | null;
};
type Match = {
  id: string;
  round: number;
  bracket: string;
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId: string | null;
  status: string;
  scheduledAt: string | null;
  venue: string;
  sourceAId: string | null;
  sourceBId: string | null;
  isBye: boolean;
};
function usePortalData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const r = await fetch(`/api${path}`, {
          credentials: "omit",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        const value = await r.json();
        if (!r.ok) throw Error(value.error || "Portal unavailable.");
        if (!controller.signal.aborted) {
          setData(value);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [path]);
  return { data, error };
}
export default function PortalPage({ custom = false }: { custom?: boolean }) {
  const { slug } = useParams(),
    location = useLocation(),
    base = custom ? "" : `/portals/${slug}`,
    apiRoot = custom ? "/portal" : `/portals/${slug}`;
  const r = usePortalData<Portal>(apiRoot),
    p = r.data;
  const parts = location.pathname.slice(base.length).split("/").filter(Boolean),
    eventId = parts[0] === "tournaments" ? parts[1] : undefined;
  if (r.error)
    return (
      <div className="mvp portal-shell">
        <main id="portal-main">
          <Notice error>{r.error}</Notice>
        </main>
      </div>
    );
  if (!p)
    return (
      <div className="mvp">
        <Loading />
      </div>
    );
  const targets = {
    HOME: base || "/",
    TOURNAMENTS: `${base}/tournaments`,
    RESULTS: `${base}/results`,
  };
  return (
    <div
      className="mvp portal-shell"
      style={{ "--lime": p.accent, "--accent": p.accent } as CSSProperties}
    >
      <a className="skip-link" href="#portal-main">
        Skip to portal content
      </a>
      <header className="portal-header">
        <Link to={base || "/"} className="portal-brand">
          {p.organization.logoId && (
            <img
              src={`/api${apiRoot}/media/${p.organization.logoId}`}
              width={48}
              height={48}
              alt=""
            />
          )}
          <strong>{p.organization.name}</strong>
        </Link>
        <nav aria-label="Portal navigation">
          {(p.navigation.length
            ? p.navigation
            : [{ label: "Tournaments", target: "TOURNAMENTS" as const }]
          ).map((n) => (
            <Link key={n.target} to={targets[n.target]}>
              {n.label}
            </Link>
          ))}
        </nav>
        <a className="text-button" href={`${p.canonicalOrigin}/login`}>
          SIGN IN ON MATCHFLOW ↗
        </a>
      </header>
      <main id="portal-main" className="portal-content">
        {eventId ? (
          <PortalEvent
            key={eventId}
            id={eventId}
            root={apiRoot}
            base={base}
            page={parts[2] || "overview"}
            canonical={p.canonicalOrigin}
          />
        ) : parts.length > 1 || (parts[0] && !["tournaments", "results"].includes(parts[0])) ? (
          <Notice error>Portal page not found.</Notice>
        ) : (
          <>
            <section className="portal-hero">
              {p.coverId && (
                <img
                  className="portal-cover"
                  src={`/api${apiRoot}/media/${p.coverId}`}
                  width={1600}
                  height={900}
                  alt=""
                />
              )}
              <div>
                <span className="eyebrow">{p.organization.name} / COMPETITION PORTAL</span>
                <h1>
                  {p.title.replace(/\.$/, "")}
                  <span className="lime" aria-hidden="true">
                    .
                  </span>
                </h1>
                <p>{p.intro}</p>
              </div>
            </section>
            <PortalListing
              key={parts[0] || "home"}
              root={apiRoot}
              base={base}
              completed={parts[0] === "results"}
            />
          </>
        )}
      </main>
      <footer className="portal-footer">
        <span>{p.organization.name}</span>
        {!p.hideAttribution && <a href={p.canonicalOrigin}>Powered by MatchFlow ↗</a>}
      </footer>
    </div>
  );
}
function PortalListing({
  root,
  base,
  completed,
}: {
  root: string;
  base: string;
  completed: boolean;
}) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const r = usePortalData<{ data: Event[]; hasMore: boolean }>(
    `${root}/tournaments?q=${encodeURIComponent(query)}&page=${page}${completed ? "&completed=true" : ""}`,
  );
  return (
    <section className="mvp-section">
      <h2>{completed ? "Results archive" : "Find your next competition"}</h2>
      <form
        className="portal-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
          setPage(1);
        }}
      >
        <Field label="Search portal tournaments">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            type="search"
            placeholder="Search this organization’s tournaments"
          />
        </Field>
        <button className="button primary">SEARCH</button>
      </form>
      {r.error ? (
        <Notice error>{r.error}</Notice>
      ) : !r.data ? (
        <Loading />
      ) : (
        <>
          <div className="portal-events">
            {r.data.data.map((t) => (
              <Link
                className="mvp-panel portal-event-card"
                key={t.id}
                to={`${base}/tournaments/${t.id}`}
              >
                {t.coverId && (
                  <img
                    src={`/api${root}/media/${t.coverId}`}
                    width={800}
                    height={450}
                    alt=""
                    loading="lazy"
                  />
                )}
                <div>
                  <span className="eyebrow">
                    {gameName(t.game)} / {t.region || "Online"}
                  </span>
                  <h3>{t.name}</h3>
                  <Status value={t.phase} />
                  <p>{date(t.startsAt)}</p>
                  <span className="text-button">VIEW TOURNAMENT ↗</span>
                </div>
              </Link>
            ))}
          </div>
          {!r.data.data.length && <p>No published tournaments match this view.</p>}
          <div className="mvp-action-row">
            {page > 1 && (
              <button className="button outline" onClick={() => setPage(page - 1)}>
                PREVIOUS
              </button>
            )}
            {r.data.hasMore && (
              <button className="button outline" onClick={() => setPage(page + 1)}>
                NEXT PAGE
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
function PortalEvent({
  id,
  root,
  base,
  page,
  canonical,
}: {
  id: string;
  root: string;
  base: string;
  page: string;
  canonical: string;
}) {
  const r = usePortalData<Event>(`${root}/tournaments/${encodeURIComponent(id)}`),
    teams = usePortalData<{ data: { id: string; name: string }[] }>(
      `${root}/tournaments/${encodeURIComponent(id)}/teams?limit=50`,
    );
  if (r.error) return <Notice error>{r.error}</Notice>;
  if (!r.data) return <Loading />;
  const t = r.data;
  return (
    <>
      <Link to={`${base}/tournaments`} className="text-button">
        ← TOURNAMENTS
      </Link>
      <section className="portal-event-heading">
        <span className="eyebrow">
          {gameName(t.game)} / {t.format.replaceAll("_", " ")}
        </span>
        <h1>
          {t.name.replace(/\.$/, "")}
          <span className="lime" aria-hidden="true">
            .
          </span>
        </h1>
        <Status value={t.phase} />
        <p>
          {date(t.startsAt)} · {t.region || "Online"}
        </p>
        <a className="button primary" href={`${canonical}/tournaments/${encodeURIComponent(t.id)}`}>
          PARTICIPATE ON MATCHFLOW ↗
        </a>
        <p>Sign-in and registration take place securely on MatchFlow.</p>
      </section>
      <nav aria-label="Tournament views" className="portal-event-nav">
        {["overview", "bracket", "schedule", "results"].map((v) => (
          <Link
            key={v}
            aria-current={page === v ? "page" : undefined}
            to={`${base}/tournaments/${t.id}${v === "overview" ? "" : `/${v}`}`}
          >
            {v.toUpperCase()}
          </Link>
        ))}
      </nav>
      {page === "overview" ? (
        <section className="mvp-panel">
          <h2>About this tournament</h2>
          <p className="portal-copy">{t.description}</p>
          <h3>Rules</h3>
          <p className="portal-copy">{t.rules}</p>
          <h3>Eligibility</h3>
          <p>{t.eligibility || "See tournament rules."}</p>
          <p>Registration closes {date(t.closesAt)}</p>
          <Announcements root={`${root}/tournaments/${id}`} />
        </section>
      ) : ["bracket", "schedule", "results"].includes(page) ? (
        <PortalCompetition
          key={page}
          root={`${root}/tournaments/${id}`}
          page={page}
          battle={t.format === "BATTLE_ROYALE"}
          names={Object.fromEntries((teams.data?.data || []).map((t) => [t.id, t.name]))}
        />
      ) : (
        <Notice error>Portal page not found.</Notice>
      )}
    </>
  );
}
function Announcements({ root }: { root: string }) {
  const r = usePortalData<{ data: { id: string; title: string; body: string }[] }>(
    `${root}/announcements`,
  );
  return (
    <section>
      <h3>Announcements</h3>
      {r.error && <Notice error>{r.error}</Notice>}
      {r.data?.data.map((a) => (
        <article key={a.id}>
          <h4>{a.title}</h4>
          <p className="portal-copy">{a.body}</p>
        </article>
      ))}
      {r.data && !r.data.data.length && <p>No announcements published.</p>}
    </section>
  );
}
function PortalCompetition({
  root,
  page,
  battle,
  names,
}: {
  root: string;
  page: string;
  battle: boolean;
  names: Record<string, string>;
}) {
  const [after, setAfter] = useState("");
  const collection = battle ? "rounds" : page === "bracket" ? "bracket" : page;
  const r = usePortalData<{ data: Match[]; nextCursor: string | null }>(
    `${root}/${collection}?limit=50${after ? `&after=${after}` : ""}`,
  );
  const standings = usePortalData<{
    data: Record<string, string | number | null>[];
    championId?: string | null;
  }>(`${root}/standings`);
  const name = (id: string | null) =>
    id ? names[id] || `Participant ${id.slice(-6)}` : "To be decided";
  if (r.error) return <Notice error>{r.error}</Notice>;
  if (!r.data) return <Loading />;
  return (
    <section className="mvp-section">
      <h2>
        {battle
          ? "Battle rounds"
          : page === "bracket"
            ? "Tournament bracket"
            : page === "results"
              ? "Confirmed results"
              : "Match schedule"}
      </h2>
      {!r.data.data.length && <p>No {collection} published yet.</p>}
      {battle ? (
        <BattleRounds rows={r.data.data as unknown as BattleRound[]} names={names} />
      ) : (
        <BracketViewport>
          <div className="portal-bracket">
            {[...new Set(r.data.data.map((m) => `${m.bracket} / ${m.round}`))].map((round) => (
              <section key={round}>
                <h3>{round.replaceAll("_", " ")}</h3>
                {r
                  .data!.data.filter((m) => `${m.bracket} / ${m.round}` === round)
                  .map((m) => (
                    <article className="portal-match" key={m.id}>
                      <span className="eyebrow">
                        {m.status} {m.isBye ? "· BYE" : ""}
                      </span>
                      <p>
                        <strong>{name(m.teamAId)}</strong>
                        <span>{m.scoreA ?? "—"}</span>
                      </p>
                      <p>
                        <strong>{name(m.teamBId)}</strong>
                        <span>{m.scoreB ?? "—"}</span>
                      </p>
                      {m.scheduledAt && (
                        <small>
                          {date(m.scheduledAt)} {m.venue}
                        </small>
                      )}
                      {(m.sourceAId || m.sourceBId) && (
                        <small>
                          Advances from {m.sourceAId?.slice(-6) || "seed"} /{" "}
                          {m.sourceBId?.slice(-6) || "seed"}
                        </small>
                      )}
                    </article>
                  ))}
              </section>
            ))}
          </div>
        </BracketViewport>
      )}
      <div className="mvp-action-row">
        {after && (
          <button className="button outline" onClick={() => setAfter("")}>
            FIRST PAGE
          </button>
        )}
        {r.data.nextCursor && (
          <button className="button outline" onClick={() => setAfter(r.data!.nextCursor!)}>
            NEXT MATCHES
          </button>
        )}
      </div>
      {standings.error && <Notice error>{standings.error}</Notice>}
      {page === "results" && (
        <>
          <h3>Standings</h3>
          {standings.data?.championId && (
            <p>
              Champion: <strong>{name(standings.data.championId)}</strong>
            </p>
          )}
          {standings.data?.data.map((row, i) => (
            <div className="mvp-panel" key={`${row.stageId || "main"}-${row.id}`}>
              <h4>
                {i + 1}. {name(String(row.id))}
              </h4>
              <p>
                {row.stageName} · {row.points !== undefined ? `${row.points} points · ` : ""}
                {row.wins} wins {row.losses !== undefined ? `/ ${row.losses} losses` : ""}
              </p>
              {row.kda !== undefined && (
                <p>
                  KDA {Number(row.kda).toFixed(2)} · Average winning time {row.averageWinSeconds}s
                </p>
              )}
            </div>
          ))}
          {!standings.data?.data.length && !standings.data?.championId && (
            <p>Standings are not available yet for this format.</p>
          )}
        </>
      )}
    </section>
  );
}
type BattleRound = {
  id: string;
  number: number;
  status: string;
  scheduledAt: string | null;
  results: { teamId: string; placement: number | null; eliminations: number; noShow: boolean }[];
};
function BattleRounds({ rows, names }: { rows: BattleRound[]; names: Record<string, string> }) {
  return (
    <div className="portal-events">
      {rows.map((r) => (
        <article className="mvp-panel" key={r.id}>
          <h3>Round {r.number}</h3>
          <Status value={r.status} />
          <p>{r.scheduledAt ? date(r.scheduledAt) : "Not scheduled"}</p>
          <ul>
            {r.results.map((p) => (
              <li key={p.teamId}>
                {names[p.teamId] || "Participant"}:{" "}
                {p.noShow ? "No show" : `placement ${p.placement}, ${p.eliminations} eliminations`}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

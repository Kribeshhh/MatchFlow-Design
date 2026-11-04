import { ReportLink } from "./ReportLink";
import { Link, useParams } from "react-router-dom";
import { useResource, date } from "./api";
import { Loading, PageTitle, ResourceError, Empty, Status } from "./UI";
type Profile = {
  id: string;
  name: string;
  description: string;
  region: string;
  website: string;
  logoId: string | null;
  tournaments: { id: string; name: string; game: string; phase: string; startsAt: string }[];
};
export default function OrganizationPublicPage() {
  const { id } = useParams();
  const r = useResource<Profile>(`/organizations/${id}/public`);
  if (r.loading) return <Loading />;
  if (!r.data || r.error)
    return <ResourceError message={r.error || "Organization unavailable."} retry={r.refresh} />;
  const p = r.data;
  return (
    <>
      <PageTitle
        label="ORGANIZER / COMMUNITY"
        title={p.name}
        description={p.region || "The people behind the competition."}
      />
      <ReportLink type="ORGANIZATION" id={p.id} />
      <section className="mvp-panel">
        {p.logoId && (
          <img src={`/api/media/${p.logoId}`} width={96} height={96} alt={`${p.name} logo`} />
        )}
        <p className="mvp-prose">{p.description}</p>
        {p.website && (
          <a className="text-button" href={p.website} target="_blank" rel="noopener noreferrer">
            OFFICIAL WEBSITE ↗
          </a>
        )}
      </section>
      <h2 className="mvp-section">Tournament history</h2>
      {!p.tournaments.length && (
        <Empty title="No published tournaments yet">
          <p>Public events will appear here.</p>
        </Empty>
      )}
      <div className="mvp-team-grid">
        {p.tournaments.map((t) => (
          <Link className="mvp-team-card" key={t.id} to={`/tournaments/${t.id}`}>
            <div>
              <Status value={t.phase} />
              <h3>{t.name}</h3>
              <p>
                {t.game} · {date(t.startsAt)}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <p className="mvp-help">Latest 100 public events.</p>
    </>
  );
}

import { useParams } from "react-router-dom";
import { useResource, type EventSummary } from "./api";
import { PageTitle, Loading, ResourceError, EventCard, Empty } from "./UI";
export default function OrganizerProfilePage() {
  const { username } = useParams();
  const r = useResource<{
    username: string;
    displayName: string;
    bio: string;
    avatarId: string | null;
    tournaments: EventSummary[];
  }>(`/organizers/${encodeURIComponent(username || "")}`);
  if (r.loading) return <Loading />;
  if (!r.data || r.error) return <ResourceError message={r.error} retry={r.refresh} />;
  return (
    <>
      <PageTitle
        label={`ORGANIZER / @${r.data.username}`}
        title={r.data.displayName || r.data.username}
        description={r.data.bio || "Public tournaments hosted on MatchFlow."}
      />
      {r.data.avatarId && (
        <img src={`/api/media/${r.data.avatarId}`} alt="Organizer avatar" width={96} height={96} />
      )}
      <div className="mvp-event-grid">
        {r.data.tournaments.map((t) => (
          <EventCard key={t.id} event={t} />
        ))}
      </div>
      {!r.data.tournaments.length && <Empty title="No published public tournaments" />}
    </>
  );
}

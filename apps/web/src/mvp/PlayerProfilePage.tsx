import { ReportLink } from "./ReportLink";
import { Link, useParams } from "react-router-dom";
import type { PlayerProfile } from "../../../../packages/shared/src/responses";
import { useResource, gameName } from "./api";
import { CompetitionHistory } from "./CompetitionHistory";
import { Loading, Notice, PageTitle, ResourceError } from "./UI";
export default function PlayerProfilePage() {
  const { username } = useParams();
  const r = useResource<PlayerProfile>(`/players/${encodeURIComponent(username || "")}`);
  if (r.loading) return <Loading />;
  if (!r.data) return <ResourceError message={r.error} retry={r.refresh} />;
  const p = r.data;
  return (
    <>
      <PageTitle
        label="PLAYER IDENTITY"
        title={p.displayName || p.username}
        description={`@${p.username}${p.region ? ` · ${p.region}` : ""}`}
        action={
          p.self ? (
            <Link className="button outline" to="/account">
              EDIT PROFILE
            </Link>
          ) : undefined
        }
      />
      <ReportLink type="USER" id={p.id} />
      {p.self && !p.profilePublic && (
        <Notice>Your profile is private. Only you can see this page.</Notice>
      )}
      <section className="mvp-panel mvp-section">
        <h2>About the player</h2>
        {p.avatarId && (
          <img
            src={`/api/media/${p.avatarId}`}
            alt={`${p.username} avatar`}
            width={96}
            height={96}
          />
        )}
        <p>{p.bio || "No bio added yet."}</p>
        <p>{p.gamesPlayed.map(gameName).join(" · ") || "No games selected."}</p>
        <ul>
          {p.socialLinks.map((link) => (
            <li key={link}>
              <a href={link} target="_blank" rel="noopener noreferrer nofollow">
                {new URL(link).hostname}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="mvp-panel mvp-section">
        <h2>Teams & memberships</h2>
        {p.teams === null ? (
          <p>Team memberships are private.</p>
        ) : !p.teams.length ? (
          <p>No team memberships yet.</p>
        ) : (
          p.teams.map((m) => (
            <p key={m.team.id}>
              <strong>{m.team.name}</strong> · {gameName(m.team.game)} ·{" "}
              {m.team.captainId === p.id
                ? "Captain"
                : m.manager
                  ? "Manager"
                  : m.substitute
                    ? "Substitute"
                    : "Player"}
              {m.team.archivedAt ? " · Archived" : ""}
            </p>
          ))
        )}
      </section>
      {p.record ? (
        <CompetitionHistory data={p.record} />
      ) : (
        <Notice>
          This player’s tournament history and statistics are private. Published event rosters and
          results remain available on event pages.
        </Notice>
      )}
    </>
  );
}

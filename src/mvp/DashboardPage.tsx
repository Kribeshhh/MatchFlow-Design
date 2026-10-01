import { Link } from "react-router-dom";
import { Plus, ArrowUpRight, Users } from "lucide-react";
import { useAuth } from "./Auth";
import { useResource, gameName, type Dashboard, type Team } from "./api";
import {
  PageTitle,
  Loading,
  ResourceError,
  Empty,
  EventCard,
  MatchList,
} from "./UI";
export function TeamCard({ team }: { team: Team }) {
  return (
    <Link className="mvp-team-card" to={`/teams/${team.id}`}>
      <div className="mvp-team-avatar">
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <Users size={24} />
        )}
      </div>
      <div>
        <span className="eyebrow">{gameName(team.game)}</span>
        <h3>{team.name}</h3>
        <p>
          {team.members.length} members · Captain {team.captain.username}
        </p>
      </div>
      <ArrowUpRight size={18} />
    </Link>
  );
}
export default function DashboardPage() {
  const { user } = useAuth();
  const resource = useResource<Dashboard>("/dashboard");
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data)
    return <ResourceError message={resource.error} retry={resource.refresh} />;
  const d = resource.data;
  const organizer = user?.role === "ORGANIZER";
  return (
    <>
      <PageTitle
        label={organizer ? "ORGANIZER HUB" : "PLAYER HUB"}
        title={`Welcome back, ${user?.username}`}
        description={
          organizer
            ? "Your events, registrations, and next matches. All in one place."
            : "Your team. Your next match. Your road to the final."
        }
        action={
          <Link
            className="button primary"
            to={organizer ? "/organizer/tournaments/new" : "/teams/new"}
          >
            <Plus size={16} />
            {organizer ? "CREATE TOURNAMENT" : "CREATE TEAM"}
          </Link>
        }
      />
      <div className="mvp-stats">
        <div>
          <span>{organizer ? "MY TOURNAMENTS" : "MY TEAMS"}</span>
          <strong>{organizer ? d.tournaments.length : d.teams.length}</strong>
        </div>
        <div>
          <span>{organizer ? "TOTAL REGISTRATIONS" : "MY TOURNAMENTS"}</span>
          <strong>
            {organizer ? d.totalRegistrations : d.tournaments.length}
          </strong>
        </div>
        <div>
          <span>UPCOMING MATCHES</span>
          <strong className="lime">{d.upcomingMatches.length}</strong>
        </div>
      </div>
      {!organizer && (
        <section className="mvp-section">
          <div className="mvp-section-title">
            <h2>My teams</h2>
            <Link to="/teams">
              MANAGE TEAMS <ArrowUpRight size={15} />
            </Link>
          </div>
          {d.teams.length ? (
            <div className="mvp-team-grid">
              {d.teams.map((t) => (
                <TeamCard team={t} key={t.id} />
              ))}
            </div>
          ) : (
            <Empty title="Your team starts with you">
              <p>
                Create a reusable roster before entering your first tournament.
              </p>
              <Link className="button outline" to="/teams/new">
                CREATE TEAM
              </Link>
            </Empty>
          )}
        </section>
      )}
      <section className="mvp-section">
        <div className="mvp-section-title">
          <h2>My tournaments</h2>
          <Link to="/tournaments">
            EXPLORE <ArrowUpRight size={15} />
          </Link>
        </div>
        {d.tournaments.length ? (
          <div className="mvp-event-grid">
            {d.tournaments.map((t) => (
              <div key={t.id}>
                <EventCard event={t} manage={organizer} />
                {!organizer && (
                  <p className="mvp-entry-note">
                    Your entry:{" "}
                    {t.registrations
                      .filter((r) =>
                        d.teams.some((team) => team.id === r.teamId),
                      )
                      .map((r) => r.status)
                      .join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title={
              organizer
                ? "Make the next big moment"
                : "Your next challenge is out there"
            }
          >
            <p>
              {organizer
                ? "Create a tournament to begin accepting teams."
                : "Discover tournaments and register an existing team."}
            </p>
          </Empty>
        )}
      </section>
      <section className="mvp-section">
        <h2>Upcoming matches</h2>
        <MatchList matches={d.upcomingMatches} />
      </section>
      <section className="mvp-section">
        <h2>Recent results</h2>
        <MatchList matches={d.recentResults} results />
      </section>
    </>
  );
}

import AdministrationPage from "./AdministrationPage";
import SupportPage from "./SupportPage";
import OrganizationsPage from "./OrganizationsPage";
import { NotificationCenter } from "./NotificationCenter";
import { Link } from "react-router-dom";
import { useResource, type Dashboard } from "./api";
import { Loading, MatchList, PageTitle, ResourceError } from "./UI";
function MatchWorkspace({ results }: { results: boolean }) {
  const r = useResource<Dashboard>("/dashboard");
  return (
    <>
      <PageTitle
        label="COMPETITION / MATCH CENTER"
        title={results ? "The scorebook" : "On the schedule"}
        description={
          results
            ? "Recorded results from your current workspace. Every score has a story."
            : "Your published match times, in your local timezone. Plan your next appearance."
        }
      />
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ResourceError message={r.error} retry={r.refresh} />
      ) : (
        r.data && (
          <MatchList
            matches={results ? r.data.recentResults : r.data.upcomingMatches}
            results={results}
          />
        )
      )}
      <p className="mvp-help">
        Showing your {results ? "10 most recent recorded results" : "scheduled matches"} for the
        dashboard preference in{" "}
        <Link className="text-button" to="/account">
          account settings
        </Link>
        . Open a tournament for its complete bracket and results.
      </p>
    </>
  );
}
export default function WorkspacePage({ kind }: { kind: string }) {
  if (kind === "schedule" || kind === "results")
    return <MatchWorkspace results={kind === "results"} />;
  if (kind === "organizations") return <OrganizationsPage />;
  if (kind === "administration") return <AdministrationPage />;
  if (kind === "support") return <SupportPage />;
  return <NotificationCenter />;
}

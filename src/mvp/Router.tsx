import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ArrowUpRight, LogOut } from "lucide-react";
import App from "../App";
import { Mark } from "../Art";
import { AuthProvider, Protected, useAuth } from "./Auth";
import AuthPage from "./AuthPage";
import DashboardPage from "./DashboardPage";
import { TeamsPage, CreateTeamPage, TeamDetailPage } from "./TeamsPage";
import { EventsPage, CreateEventPage } from "./EventsPage";
import EventDetailPage from "./EventDetailPage";
import { Notice } from "./UI";
import "./mvp.css";
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
function Layout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mvp">
      <a className="skip-link" href="#app-main">
        Skip to content
      </a>
      <header className="mvp-header">
        <Link className="brand" to="/">
          <Mark />
          <span>
            MATCHFLOW<span className="brand-period">®</span>
          </span>
        </Link>
        <nav aria-label="Application navigation">
          <Link to="/tournaments">Tournaments</Link>
          {auth.user && <Link to="/dashboard">Dashboard</Link>}
          {auth.user?.role === "PLAYER" && <Link to="/teams">My teams</Link>}
        </nav>
        <div className="mvp-account">
          {auth.user ? (
            <>
              <span>
                {auth.user.username}
                <small>{auth.user.role}</small>
              </span>
              <button
                className="icon-button"
                aria-label="Log out"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await auth.logout();
                    navigate("/login");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link className="button primary" to="/register">
                GET STARTED <ArrowUpRight size={14} />
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="mvp-main" id="app-main">
        {error && <Notice error>{error}</Notice>}
        <Outlet />
      </main>
      <footer className="mvp-footer">
        <span>MATCHFLOW — ONE CONTROL ROOM. EVERY TOURNAMENT.</span>
        <Link to="/">LANDING PAGE ↗</Link>
      </footer>
    </div>
  );
}
export default function Router() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollReset />
        <Routes>
          <Route path="/" element={<App />} />
          <Route element={<Layout />}>
            <Route path="login" element={<AuthPage />} />
            <Route path="register" element={<AuthPage register />} />
            <Route
              path="dashboard"
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
            <Route
              path="teams"
              element={
                <Protected role="PLAYER">
                  <TeamsPage />
                </Protected>
              }
            />
            <Route
              path="teams/new"
              element={
                <Protected role="PLAYER">
                  <CreateTeamPage />
                </Protected>
              }
            />
            <Route
              path="teams/:id"
              element={
                <Protected role="PLAYER">
                  <TeamDetailPage />
                </Protected>
              }
            />
            <Route path="tournaments" element={<EventsPage />} />
            <Route path="tournaments/:id" element={<EventDetailPage />} />
            <Route
              path="organizer/tournaments/new"
              element={
                <Protected role="ORGANIZER">
                  <CreateEventPage />
                </Protected>
              }
            />
            <Route
              path="organizer/tournaments/:id"
              element={
                <Protected role="ORGANIZER">
                  <EventDetailPage manage />
                </Protected>
              }
            />
            <Route
              path="organizer"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="player"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="*"
              element={
                <div className="mvp-state">
                  <h1>This arena could not be found.</h1>
                  <Link className="button primary" to="/tournaments">
                    FIND TOURNAMENTS
                  </Link>
                </div>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

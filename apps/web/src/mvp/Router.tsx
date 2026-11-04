import HelpPage from "./HelpPage";
import { LiveProvider } from "./LiveProvider";
import { NotificationBadge } from "./NotificationCenter";
import { ArrowUpRight, LogOut } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  Users,
  Trophy,
  Building2,
  Shield,
  Settings,
} from "lucide-react";
import { ConfirmProvider } from "./DesignSystem";
import { Loading } from "./UI";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { Mark } from "../Art";
import { AuthProvider, Protected, useAuth } from "./Auth";

import { Notice } from "./UI";
const OrganizationPublicPage = lazy(() => import("./OrganizationPublicPage"));
const OrganizerProfilePage = lazy(() => import("./OrganizerProfilePage"));
const App = lazy(() => import("../App"));
const PlayerProfilePage = lazy(() => import("./PlayerProfilePage"));
const DeveloperDocsPage = lazy(() => import("./DeveloperDocsPage"));
const PortalPage = lazy(() => import("./PortalPage"));
const AccountPage = lazy(() => import("./AccountPage"));
const RecoveryPage = lazy(() => import("./RecoveryPage"));
const AuthPage = lazy(() => import("./AuthPage"));
const DashboardPage = lazy(() => import("./DashboardPage"));
const EventDetailPage = lazy(() => import("./EventDetailPage"));
const EventsPage = lazy(() => import("./EventsPage").then((m) => ({ default: m.EventsPage })));
const CreateEventPage = lazy(() => import("./CreateEventPage"));
const TeamsPage = lazy(() => import("./TeamsPage").then((m) => ({ default: m.TeamsPage })));
const CreateTeamPage = lazy(() =>
  import("./TeamsPage").then((m) => ({ default: m.CreateTeamPage })),
);
const TeamDetailPage = lazy(() =>
  import("./TeamsPage").then((m) => ({ default: m.TeamDetailPage })),
);
const WorkspacePage = lazy(() => import("./WorkspacePage"));
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
          {auth.user && (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/account">Account</Link>
            </>
          )}
        </nav>
        <div className="mvp-account">
          {auth.user && <NotificationBadge />}
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
      <div className="mvp-workspace">
        <aside className="mvp-sidebar">
          <span className="eyebrow">YOUR CONTROL ROOM</span>
          <nav aria-label="Workspace navigation">
            <NavLink to="/tournaments">
              <Trophy />
              Discover
            </NavLink>
            {auth.user && (
              <>
                <NavLink to="/dashboard">
                  <LayoutDashboard />
                  Dashboard
                </NavLink>
                <NavLink to="/teams">
                  <Users />
                  My teams
                </NavLink>
                <NavLink to="/schedule">
                  <CalendarDays />
                  Schedule
                </NavLink>
                <NavLink to="/results">
                  <Trophy />
                  Results
                </NavLink>
                <NavLink to="/notifications">
                  <Bell />
                  Notifications
                </NavLink>
                <NavLink to="/organizations">
                  <Building2 />
                  Organization
                </NavLink>
                <NavLink to="/support">Support & reports</NavLink>
                {auth.user.platformRole && auth.user.platformRole !== "NONE" && (
                  <NavLink to="/administration">
                    <Shield />
                    Administration
                  </NavLink>
                )}
                <NavLink to="/account">
                  <Settings />
                  Account
                </NavLink>
              </>
            )}
          </nav>
          <div className="mvp-sidebar-foot">
            <strong>YOUR GAME. YOUR MOMENT.</strong>One place for the people, matches and moments
            that matter.
          </div>
        </aside>
        <main className="mvp-main" id="app-main">
          {error && <Notice error>{error}</Notice>}
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
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
        <LiveProvider />
        <ConfirmProvider>
          <ScrollReset />
          <Routes>
            <Route
              path="/"
              element={
                <Suspense fallback={<Loading />}>
                  <App />
                </Suspense>
              }
            />
            <Route
              path="portals/:slug/*"
              element={
                <Suspense fallback={<Loading />}>
                  <PortalPage />
                </Suspense>
              }
            />
            <Route element={<Layout />}>
              <Route path="players/:username" element={<PlayerProfilePage />} />
              <Route path="help" element={<HelpPage />} />
              <Route path="login" element={<AuthPage />} />
              <Route path="register" element={<AuthPage register />} />
              <Route
                path="account"
                element={
                  <Protected>
                    <AccountPage />
                  </Protected>
                }
              />
              {[
                "forgot-password",
                "reset-password",
                "verify-email",
                "reactivation",
                "reactivate",
              ].map((path) => (
                <Route key={path} path={path} element={<RecoveryPage />} />
              ))}
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
              {[
                "schedule",
                "results",
                "notifications",
                "organizations",
                "administration",
                "support",
              ].map((page) => (
                <Route
                  key={page}
                  path={page}
                  element={
                    <Protected>
                      <WorkspacePage kind={page} />
                    </Protected>
                  }
                />
              ))}
              <Route
                path="organizations/:id"
                element={
                  <Protected>
                    <WorkspacePage kind="organizations" />
                  </Protected>
                }
              />
              <Route path="developers" element={<DeveloperDocsPage />} />
              <Route path="communities/:id" element={<OrganizationPublicPage />} />
              <Route path="organizers/:username" element={<OrganizerProfilePage />} />
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
              <Route path="organizer" element={<Navigate to="/dashboard" replace />} />
              <Route path="player" element={<Navigate to="/dashboard" replace />} />
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
        </ConfirmProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

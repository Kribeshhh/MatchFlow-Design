import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./mvp/Auth";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Globe2,
  Menu,
  Radio,
  Trophy,
  Users,
  X,
  Zap,
  LayoutGrid,
  CalendarDays,
  GitBranch,
  Bell,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { GameArt, GameLogo, Mark } from "./Art";
import Universe from "./Universe";
import HeroSearch from "./HeroSearch";
import Bracket from "./Bracket";
import { games, tournaments, type GameId, type Tournament } from "./data";

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="MatchFlow home">
      <Mark />
      <span>
        MATCHFLOW<span className="brand-period">®</span>
      </span>
    </a>
  );
}
function LiveDot({ children }: { children: React.ReactNode }) {
  return (
    <span className="live-label mono">
      <i className="dot" />
      {children}
    </span>
  );
}

function TournamentCard({
  tournament: t,
  onOpen,
}: {
  tournament: Tournament;
  onOpen: (t: Tournament) => void;
}) {
  return (
    <button
      className={`tournament-card tournament-${t.game}`}
      onClick={() => onOpen(t)}
      aria-label={`View ${t.title} details`}
    >
      <div className="card-image">
        <GameArt game={t.game} />
        <span
          className={`card-status mono ${t.status === "LIVE" ? "status-live" : ""}`}
        >
          {t.status === "LIVE" && <i className="dot" />}
          {t.status}
        </span>
        <GameLogo game={t.game} />
        <span className="card-image-index mono">MF / 0{t.id}</span>
        <span className="card-image-arrow">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="card-content">
        <span className="eyebrow">
          {games.find((g) => g.id === t.game)?.name.toUpperCase()}
        </span>
        <h3>{t.title}</h3>
        <div className="card-meta">
          <span>
            <Users size={13} />
            {t.teams}
          </span>
          <span>{t.round}</span>
        </div>
        <div className="card-bottom">
          <span className="mono">
            <Trophy size={13} /> NPR <strong>{t.prize}</strong>
            <span className="muted"> PRIZE POOL</span>
          </span>
          <ArrowUpRight size={18} />
        </div>
        <div className="card-hover-info mono">
          {t.location} <span>VIEW DETAILS →</span>
        </div>
      </div>
    </button>
  );
}

const playerFeatures = [
  "Find tournaments",
  "Join with your team",
  "Track schedules",
  "Follow live brackets",
  "Receive updates",
  "View results",
];
const organizerFeatures = [
  "Create tournaments",
  "Register teams",
  "Generate brackets",
  "Schedule matches",
  "Record results",
  "Publish updates",
];

export default function App() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeGame, setActiveGame] = useState<GameId>("pubg");
  const [role, setRole] = useState<"player" | "organizer">("player");
  const [detail, setDetail] = useState<Tournament | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const why = useRef<HTMLElement>(null);
  const hero = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          e.target.classList.toggle("in-view", e.isIntersecting);
          if (e.isIntersecting) e.target.classList.add("revealed");
        }),
      { threshold: 0.12 },
    );
    document
      .querySelectorAll(".reveal, .why-section, .final-cta")
      .forEach((el) => observer.observe(el));
    let frame = 0;
    const update = () => {
      frame = 0;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        why.current?.style.setProperty("--merge", "1");
        return;
      }
      const rect = why.current?.getBoundingClientRect();
      if (rect)
        why.current?.style.setProperty(
          "--merge",
          `${Math.max(0, Math.min(1, (innerHeight - rect.top - 80) / (innerHeight * 0.65)))}`,
        );
      if (scrollY < innerHeight * 1.5)
        hero.current?.style.setProperty(
          "--hero-shift",
          `${Math.min(scrollY * 0.13, 100)}px`,
        );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      observer.disconnect();
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (detail || info) modal.current?.showModal();
  }, [detail, info]);
  function closeModal() {
    modal.current?.close();
    setDetail(null);
    setInfo(null);
  }
  function explore(id: GameId) { navigate(`/tournaments?game=${id}`); }
  function host() { navigate(user?.role === 'ORGANIZER' ? '/organizer/tournaments/new' : '/login?next=%2Forganizer%2Ftournaments%2Fnew'); }
  const infoCopy: Record<string, string> = {
    "Log in":
      "You’re exploring the MatchFlow design preview. Accounts and sign-in will be part of a future release. For now, discover the demo tournaments and play through a bracket.",
    "About MatchFlow":
      "One control room. Every tournament. MatchFlow is a concept for bringing players, teams, and tournament organizers into one connected esports experience. All tournaments, teams, results, and statistics in this preview are fictional.",
    Help: "Click a game bubble to explore its tournaments. Filter by game, open a tournament card, or play the bracket demo. Use Tab to move between controls and Escape to close a panel. On mobile, drag or tap a game bubble.",
    Terms:
      "This is a local MVP demonstration. Accounts and tournament workflows are functional, while seeded events and landing-page previews are fictional. Payments and prize payouts are not supported. Game names belong to their respective owners; this preview is not affiliated with them.",
    Privacy:
      "MatchFlow stores your account, team rosters, tournament entries, and match records in its database. Passwords are hashed, and an HTTP-only cookie maintains your session. Fonts and artwork are served locally. Landing-page previews use fictional data.",
  };

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header" id="top">
        <Brand />
        <nav
          className={mobileMenu ? "nav nav-open" : "nav"}
          aria-label="Main navigation"
        >
          {[
            ["Tournaments", "tournaments"],
            ["Games", "games"],
            ["How it works", "how-it-works"],
            ["For organizers", "for-organizers"],
          ].map(([label, id]) => (
            <a
              href={id === "tournaments" ? "/tournaments" : `#${id}`}
              key={id}
              onClick={() => {
                setMobileMenu(false);
                if (id === "for-organizers") setRole("organizer");
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <button className="login" onClick={() => navigate(user ? "/dashboard" : "/login")}>
            {user ? "Dashboard" : "Log in"} <ArrowUpRight size={13} />
          </button>
          <a className="button primary nav-cta" href="/register">
            GET STARTED <ArrowUpRight size={16} />
          </a>
          <button
            className="icon-button menu-button"
            aria-label={mobileMenu ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileMenu}
            onClick={() => setMobileMenu((v) => !v)}
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main id="main">
        <section ref={hero} className="hero search-hero">
          <Universe onExplore={explore} />
          <div className="hero-center">
            <div className="hero-wordmark" aria-label="MatchFlow">
              <Mark />
              <span>
                MATCH<span>FLOW</span>
              </span>
              <sup>®</sup>
            </div>
            <div className="eyebrow centered-eyebrow">
              YOUR GAME. YOUR TEAM. YOUR MOMENT.
            </div>
            <h1>
              Find your next <span>arena.</span>
            </h1>
            <p>Discover tournaments. Find your people. Make your mark.</p>
            <HeroSearch onOpen={setDetail} />
            <div className="center-actions">
              <a href="/tournaments" className="button primary">
                <Trophy size={15} /> EXPLORE TOURNAMENTS{" "}
                <ArrowUpRight size={17} />
              </a>
              <button className="button outline" onClick={host}>
                HOST A TOURNAMENT <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="center-live">
              <LiveDot>LIVE NOW</LiveDot>
              <span>
                6 games <i>·</i> 54 tournaments <i>·</i> One flow.
              </span>
            </div>
          </div>
          <div className="hero-bottom mono">
            <a href="#tournaments">
              <span className="scroll-icon">
                <ArrowDown size={12} />
              </span>{" "}
              SCROLL TO DISCOVER
            </a>
            <span>BUILT FOR THE NEXT GENERATION OF COMPETITION.</span>
            <span>EST. 2026</span>
          </div>
        </section>
        <div className="ticker" aria-label="Demo esports live feed">
          <span className="ticker-badge mono">
            <Radio size={14} /> THE LIVE FEED
          </span>
          <div className="ticker-window">
            <div className="ticker-track">
              {[0, 1].map((copy) => (
                <div
                  className="ticker-group mono"
                  key={copy}
                  aria-hidden={copy === 1}
                >
                  <span>
                    <i className="dot" /> LIVE <b>KATHMANDU TITANS</b>
                    <strong className="score">2 — 1</strong> PHOENIX
                  </span>
                  <span>
                    PUBG MOBILE <i className="ticker-separator" /> 32/40 TEAMS
                  </span>
                  <span>
                    REGISTRATION CLOSES <b className="lime">02H 14M</b>
                  </span>
                  <span>
                    UP NEXT <b>18:30 NPT</b>
                  </span>
                  <span>
                    FREE FIRE <i className="dot" /> REGISTRATION OPEN
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section id="tournaments" className="section live-section reveal">
          <div className="section-heading">
            <div>
              <span className="eyebrow">01 / IN THE ARENA</span>
              <h2>
                LIVE ON MATCHFLOW<span className="lime">.</span>
              </h2>
              <p>What's happening right now.</p>
            </div>
            <a href="/tournaments" className="text-button">
              EXPLORE TOURNAMENTS <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="tournament-grid">
            {tournaments.slice(0, 3).map((t) => (
              <TournamentCard key={t.id} tournament={t} onOpen={setDetail} />
            ))}
          </div>
          <div className="section-foot mono">
            <span>
              <i className="dot" /> THE COMPETITION NEVER STOPS.
            </span>
            <span>DEMO TOURNAMENTS / REAL POSSIBILITIES</span>
          </div>
        </section>

        <section id="games" className="section games-section reveal">
          <div className="section-heading">
            <div>
              <span className="eyebrow">02 / FIND YOUR ARENA</span>
              <h2>
                CHOOSE YOUR GAME<span className="lime">.</span>
              </h2>
            </div>
            <p>
              Different worlds. Same competitive spirit.
              <br />
              Find where you belong.
            </p>
          </div>
          <div
            className="game-tabs"
            role="tablist"
            aria-label="Choose your game"
          >
            {games.map((g, i) => (
              <button
                key={g.id}
                id={`tab-${g.id}`}
                role="tab"
                aria-selected={activeGame === g.id}
                aria-controls="game-results"
                tabIndex={activeGame === g.id ? 0 : -1}
                onClick={() => setActiveGame(g.id)}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? games.length - 1
                          : (i +
                              (e.key === "ArrowRight" ? 1 : -1) +
                              games.length) %
                            games.length;
                    setActiveGame(games[next].id);
                    document.getElementById(`tab-${games[next].id}`)?.focus();
                  }
                }}
                className={`game-tab ${activeGame === g.id ? "active" : ""}`}
              >
                <span className="tab-number mono">0{i + 1}</span>
                <GameLogo game={g.id} />
                <span className="tab-info">
                  <strong>{g.name}</strong>
                  <span className="mono">{g.tournaments} TOURNAMENTS</span>
                </span>
                <ArrowUpRight size={23} />
              </button>
            ))}
          </div>
          <div
            id="game-results"
            role="tabpanel"
            aria-labelledby={`tab-${activeGame}`}
            className="game-results"
            key={activeGame}
          >
            {tournaments
              .filter((t) => t.game === activeGame)
              .map((t) => (
                <button
                  className="tournament-row"
                  key={t.id}
                  onClick={() => setDetail(t)}
                >
                  <span className={`row-game-icon ${t.game}`}>
                    <GameLogo game={t.game} />
                  </span>
                  <span className="row-title">
                    <strong>{t.title}</strong>
                    <span>
                      {t.location} <span className="muted">/</span> {t.teams}
                    </span>
                  </span>
                  <span
                    className={`row-status mono ${t.status === "LIVE" ? "lime" : ""}`}
                  >
                    {t.status === "LIVE" && <i className="dot" />}
                    {t.status}
                  </span>
                  <span className="row-prize">
                    <Trophy size={14} />
                    <strong>NPR {t.prize}</strong>
                  </span>
                  <span className="row-arrow">
                    <ArrowUpRight size={20} />
                  </span>
                </button>
              ))}
          </div>
        </section>

        <Bracket />

        <section ref={why} className="why-section section" id="about">
          <div className="why-copy">
            <span className="eyebrow">04 / LESS CHAOS. MORE COMPETITION.</span>
            <h2>
              <span className="muted">
                TOO MANY
                <br />
                TOOLS.
              </span>
              <br />
              ONE{" "}
              <span className="lime">
                CONTROL
                <br />
                ROOM.
              </span>
              <br />
              EVERY TOURNAMENT.
            </h2>
            <p>
              Your teams, matches, and moments.
              <br />
              Finally, on the same page.
            </p>
          </div>
          <div className="control-story">
            <div className="fragment fragment-one mono">
              <span>↗</span> MESSAGES
            </div>
            <div className="fragment fragment-two mono">
              <LayoutGrid size={14} /> SPREADSHEETS
            </div>
            <div className="fragment fragment-three mono">
              <CheckCheck size={14} /> FORMS
            </div>
            <div className="fragment fragment-four mono">
              <GitBranch size={14} /> BRACKETS
            </div>
            <div className="fragment fragment-five mono">
              <CalendarDays size={14} /> SCHEDULES
            </div>
            <div className="fragment fragment-six mono">
              <Trophy size={14} /> RESULTS
            </div>
            <div className="dashboard-preview">
              <div className="dashboard-header">
                <span>
                  <Mark /> MATCHFLOW
                </span>
                <span className="mono">
                  <i className="dot" /> CONTROL ROOM
                </span>
              </div>
              <div className="dashboard-body">
                <aside>
                  <LayoutGrid />
                  <Users />
                  <GitBranch />
                  <CalendarDays />
                  <Bell />
                </aside>
                <div className="dashboard-main">
                  <span className="eyebrow">TOURNAMENT OVERVIEW</span>
                  <h3>
                    Kathmandu Invitational{" "}
                    <span className="demo-tag">DEMO</span>
                  </h3>
                  <div className="dashboard-stats">
                    <div>
                      <span>REGISTERED TEAMS</span>
                      <strong>
                        32 <small>/ 40</small>
                      </strong>
                    </div>
                    <div>
                      <span>MATCHES PLAYED</span>
                      <strong>
                        24 <small>/ 31</small>
                      </strong>
                    </div>
                    <div>
                      <span>PRIZE POOL</span>
                      <strong>
                        100<small>K NPR</small>
                      </strong>
                    </div>
                  </div>
                  <div className="dashboard-match">
                    <span className="mono">
                      <i className="dot" /> LIVE MATCH
                    </span>
                    <div>
                      <span className="team-icon">KT</span>
                      <strong>TITANS</strong>
                      <b>
                        2 <span>:</span> 1
                      </b>
                      <strong>PHOENIX</strong>
                      <span className="team-icon">PX</span>
                    </div>
                    <span className="mono muted">
                      QUARTER FINAL · BEST OF THREE
                    </span>
                  </div>
                  <div className="dashboard-footer mono">
                    <ShieldCheck size={13} /> ALL SYSTEMS IN SYNC{" "}
                    <Check size={13} />
                  </div>
                </div>
              </div>
            </div>
            <span className="story-caption mono">
              <span className="lime">✳</span> EVERYTHING CONNECTED. NOTHING
              MISSED.
            </span>
          </div>
        </section>

        <section id="for-organizers" className="section role-section reveal">
          <div className="role-copy">
            <span className="eyebrow">05 / YOUR SIDE OF THE GAME</span>
            <h2>
              MATCHFLOW FOR
              <br />
              <span className="lime">
                {role === "player" ? "THE PLAYERS." : "THE ORGANIZERS."}
              </span>
            </h2>
            <div
              className="role-toggle"
              role="group"
              aria-label="Choose your role"
            >
              <button
                aria-pressed={role === "player"}
                className={role === "player" ? "active" : ""}
                onClick={() => setRole("player")}
              >
                <Users size={15} /> PLAYER
              </button>
              <button
                aria-pressed={role === "organizer"}
                className={role === "organizer" ? "active" : ""}
                onClick={() => setRole("organizer")}
              >
                <LayoutGrid size={15} /> ORGANIZER
              </button>
            </div>
            <div className="role-features" key={role}>
              {(role === "player" ? playerFeatures : organizerFeatures).map(
                (feature) => (
                  <span key={feature}>
                    <Check size={15} />
                    {feature}
                  </span>
                ),
              )}
            </div>
            <a
              className="text-button"
              href={role === "player" ? "#games" : "#how-it-works"}
            >
              {role === "player"
                ? "FIND YOUR NEXT CHALLENGE"
                : "TRY THE TOURNAMENT DEMO"}{" "}
              <ArrowUpRight size={17} />
            </a>
          </div>
          <div className={`role-preview ${role}`} key={`preview-${role}`}>
            <div className="role-preview-top mono">
              <span>
                <i className="dot" />{" "}
                {role === "player" ? "PLAYER HUB" : "ORGANIZER HUB"}
              </span>
              <span>INTERFACE PREVIEW</span>
            </div>
            <div className="role-profile">
              <div className="profile-avatar">
                {role === "player" ? <Zap size={29} /> : <Mark />}
              </div>
              <div>
                <span className="eyebrow">
                  {role === "player"
                    ? "YOUR NEXT CHAPTER"
                    : "YOU’RE IN CONTROL"}
                </span>
                <h3>
                  {role === "player"
                    ? "Ready to make your mark?"
                    : "Make the next big moment."}
                </h3>
              </div>
            </div>
            <div className="role-preview-stats">
              <div>
                <span>
                  {role === "player" ? "YOUR TEAM" : "YOUR TOURNAMENTS"}
                </span>
                <strong>
                  {role === "player" ? "KATHMANDU TITANS" : "04 ACTIVE EVENTS"}
                </strong>
              </div>
              <span className="badge mono">
                <ShieldCheck size={12} />
                {role === "player" ? "VERIFIED" : "ALL IN SYNC"}
              </span>
            </div>
            <div className="next-match">
              <span className="eyebrow">
                {role === "player"
                  ? "YOUR NEXT MATCH"
                  : "NEXT ON YOUR SCHEDULE"}
              </span>
              <div>
                <span className="team-icon">KT</span>
                <b>TITANS</b>
                <span className="vs mono">VS</span>
                <b>PHOENIX</b>
                <span className="team-icon">PX</span>
              </div>
              <span className="mono muted">
                TODAY, 18:30 NPT <span className="lime">·</span> QUARTER FINAL
              </span>
            </div>
            <button
              className="role-preview-action"
              onClick={() =>
                role === "player"
                  ? setDetail(tournaments[0])
                  : document
                      .getElementById("how-it-works")
                      ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              {role === "player" ? <Bell size={16} /> : <Plus size={16} />}
              <span>
                {role === "player"
                  ? "Your next match is ready. View details."
                  : "Build the bracket. Try the interactive demo."}
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </section>

        <section className="final-cta">
          <div className="cta-sphere cta-sphere-one" />
          <div className="cta-sphere cta-sphere-two" />
          <div className="cta-sphere cta-sphere-three" />
          <span className="eyebrow">
            <i className="dot" /> YOUR NEXT TOURNAMENT STARTS HERE
          </span>
          <h2>
            ENTER THE <span className="lime">FLOW.</span>
            <ArrowUpRight aria-hidden="true" />
          </h2>
          <div className="flex justify-center flex-wrap gap-6">
            <a href="/tournaments" className="button primary">
              FIND A TOURNAMENT <ArrowUpRight size={17} />
            </a>
            <button className="button outline" onClick={host}>
              HOST A TOURNAMENT <ArrowUpRight size={17} />
            </button>
          </div>
          <span className="cta-coordinates mono">
            YOUR GAME. YOUR TEAM. YOUR MOMENT.
          </span>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-top">
          <Brand />
          <p className="mono">
            ONE CONTROL ROOM.
            <br />
            EVERY TOURNAMENT.
          </p>
          <nav aria-label="Footer navigation">
            <a href="#tournaments">Tournaments</a>
            <a href="#games">Games</a>
            <button onClick={host}>Organizers</button>
            {["About MatchFlow", "Help"].map((label) => (
              <button key={label} onClick={() => setInfo(label)}>
                {label.replace(" MatchFlow", "")}
              </button>
            ))}
          </nav>
        </div>
        <div className="footer-bottom mono">
          <span>
            © 2026 MATCHFLOW <span className="muted">/</span> LANDING PAGE
            CONCEPT
          </span>
          <span>
            <Globe2 size={12} /> BUILT FOR EVERY ARENA.
          </span>
          <div>
            <button onClick={() => setInfo("Terms")}>TERMS</button>
            <button onClick={() => setInfo("Privacy")}>PRIVACY</button>
            <a href="#top" aria-label="Back to top">
              ↑
            </a>
          </div>
        </div>
      </footer>

      <dialog
        ref={modal}
        className="detail-modal"
        aria-label={
          detail ? `${detail.title} details` : info || "MatchFlow information"
        }
        onCancel={(e) => {
          e.preventDefault();
          closeModal();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal-inner">
          <button
            className="icon-button modal-close"
            aria-label="Close dialog"
            onClick={closeModal}
          >
            <X size={22} />
          </button>
          {detail ? (
            <>
              <div className="modal-art">
                <GameArt game={detail.game} />
                <GameLogo game={detail.game} />
              </div>
              <span className="eyebrow lime">
                {detail.status} / DEMO TOURNAMENT
              </span>
              <h2>{detail.title}</h2>
              <div className="detail-facts">
                <span>
                  <Users size={17} />
                  {detail.teams}
                </span>
                <span>
                  <Trophy size={17} />
                  NPR {detail.prize} prize pool
                </span>
                <span>
                  <Globe2 size={17} />
                  {detail.location}
                </span>
                <span>
                  <CalendarDays size={17} />
                  {detail.date}
                </span>
              </div>
              <p>
                A little taste of the competition. This tournament is fictional
                and shows how event details could look in MatchFlow.
              </p>
              <button
                className="button primary full"
                onClick={() => {
                  closeModal();
                  document
                    .getElementById("how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                TRY THE LIVE BRACKET DEMO <ArrowRight size={17} />
              </button>
              <span className="demo-note mono">
                PREVIEW ONLY · REGISTRATION IS NOT AVAILABLE
              </span>
            </>
          ) : (
            <>
              <Mark className="lime" />
              <span className="eyebrow modal-eyebrow">
                MATCHFLOW / DESIGN PREVIEW
              </span>
              <h2>{info}</h2>
              <p>{info ? infoCopy[info] : ""}</p>
              <button className="button primary" onClick={closeModal}>
                BACK TO THE FLOW <ArrowUpRight size={17} />
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

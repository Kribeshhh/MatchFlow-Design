import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Search, SlidersHorizontal, X } from "lucide-react";
import { games, tournaments, type GameId, type Tournament } from "./data";
import { GameLogo } from "./Art";

export default function HeroSearch({
  onOpen,
}: {
  onOpen: (t: Tournament) => void;
}) {
  const [query, setQuery] = useState("");
  const [game, setGame] = useState<GameId | "all">("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLowerCase().replace(/[-:]/g, " ");
  const results = tournaments.filter((t) => {
    const identity = games.find((g) => g.id === t.game)!;
    const text = `${t.title} ${identity.name} ${identity.short} ${t.location}`
      .toLowerCase()
      .replace(/[-:]/g, " ");
    return (
      (game === "all" || game === t.game) &&
      (status === "all" || t.status === status) &&
      (!normalized || text.includes(normalized))
    );
  });
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setFilters(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function suggest(value: string) {
    setQuery(value);
    setGame("all");
    setStatus("all");
    setOpen(true);
    input.current?.focus();
  }
  return (
    <div
      className="hero-search"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          setFilters(false);
          input.current?.focus();
        }
      }}
    >
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Search className="search-symbol" size={21} />
        <input
          ref={input}
          type="search"
          aria-label="Search games or tournaments"
          aria-controls="hero-search-results"
          placeholder="Search your game or tournament..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query) setOpen(true);
          }}
        />
        <button
          className={`search-filter ${filters ? "active" : ""}`}
          type="button"
          aria-label="Filter tournaments"
          aria-expanded={filters}
          aria-controls="hero-filters"
          onClick={() => {
            setFilters((v) => !v);
            setOpen(true);
          }}
        >
          <SlidersHorizontal size={18} />
          {(game !== "all" || status !== "all") && <i className="dot" />}
        </button>
        <button className="search-submit" type="submit">
          SEARCH <ArrowUpRight size={19} />
        </button>
      </form>
      <div className="search-suggestions">
        <span>POPULAR</span>
        {["PUBG Mobile", "Valorant", "CS2", "Mobile Legends"].map((name) => (
          <button key={name} onClick={() => suggest(name)}>
            {name}
            <ArrowUpRight size={10} />
          </button>
        ))}
      </div>
      {open && (
        <div className="search-popover" id="hero-search-results">
          <div className="search-results-heading">
            <span className="mono">
              {query || game !== "all" || status !== "all"
                ? "YOUR SEARCH RESULTS"
                : "DISCOVER TOURNAMENTS"}
            </span>
            <button
              className="icon-button"
              aria-label="Close search results"
              onClick={() => {
                setOpen(false);
                setFilters(false);
              }}
            >
              <X size={16} />
            </button>
          </div>
          {filters && (
            <div className="search-filters" id="hero-filters">
              <label>
                GAME
                <select
                  value={game}
                  onChange={(e) => setGame(e.target.value as GameId | "all")}
                >
                  <option value="all">All games</option>
                  {games.map((g) => (
                    <option value={g.id} key={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                STATUS
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Any status</option>
                  <option value="LIVE">Live now</option>
                  <option value="REGISTRATION OPEN">Registration open</option>
                  <option value="UP NEXT">Up next</option>
                </select>
              </label>
            </div>
          )}
          <div className="search-match-count mono" aria-live="polite">
            {results.length}{" "}
            {results.length === 1 ? "TOURNAMENT" : "TOURNAMENTS"} FOUND{" "}
            <span>DEMO EVENTS</span>
          </div>
          <div className="search-result-list">
            {results.length ? (
              results.map((t) => (
                <button
                  key={t.id}
                  className="search-result"
                  onClick={() => {
                    setOpen(false);
                    setFilters(false);
                    onOpen(t);
                  }}
                >
                  <span className={`row-game-icon ${t.game}`}>
                    <GameLogo game={t.game} />
                  </span>
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {games.find((g) => g.id === t.game)?.name} <i>·</i>{" "}
                      {t.teams}
                    </small>
                  </span>
                  <span className="result-status">
                    {t.status === "LIVE" ? (
                      <>
                        <i className="dot" /> LIVE
                      </>
                    ) : (
                      `NPR ${t.prize}`
                    )}
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              ))
            ) : (
              <div className="search-empty">
                <Search size={25} />
                <strong>No tournaments found.</strong>
                <p>Try another game or clear your filters.</p>
                <button
                  onClick={() => {
                    setQuery("");
                    setGame("all");
                    setStatus("all");
                    input.current?.focus();
                  }}
                >
                  Show all tournaments <ArrowUpRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

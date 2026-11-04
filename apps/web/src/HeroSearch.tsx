import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { games } from "./data";
export default function HeroSearch() {
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("");
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  function search() {
    const params = new URLSearchParams();
    const matched = games.find((g) =>
      [g.name, g.short, g.id].some((v) => v.toLowerCase() === query.trim().toLowerCase()),
    );
    if (game || matched) params.set("game", game || matched!.id);
    if (query.trim() && !matched) params.set("q", query.trim());
    if (status) params.set("status", status);
    navigate(`/tournaments?${params}`);
  }
  return (
    <div
      className="hero-search"
      onKeyDown={(e) => {
        if (e.key === "Escape" && filters) {
          setFilters(false);
          trigger.current?.focus();
        }
      }}
    >
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <Search className="search-symbol" size={21} />
        <input
          type="search"
          aria-label="Search games or tournaments"
          placeholder="Search your game or tournament…"
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          ref={trigger}
          type="button"
          className={`search-filter ${filters ? "active" : ""}`}
          aria-label="Filter tournaments"
          aria-expanded={filters}
          aria-controls="hero-filters"
          onClick={() => setFilters(!filters)}
        >
          <SlidersHorizontal size={20} />
        </button>
        <button className="search-submit">
          SEARCH <ArrowUpRight size={19} />
        </button>
      </form>
      {filters && (
        <div className="search-popover" id="hero-filters">
          <div className="search-filters">
            <label>
              GAME
              <select value={game} onChange={(e) => setGame(e.target.value)}>
                <option value="">All games</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              STATUS
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Any status</option>
                <option value="REGISTRATION_OPEN">Registration open</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="ONGOING">In progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </label>
          </div>
          <button type="button" className="button primary full" onClick={search}>
            FIND TOURNAMENTS <ArrowUpRight size={17} />
          </button>
        </div>
      )}
      <div className="search-suggestions">
        <span>EXPLORE</span>
        {games
          .filter((g) => ["pubg", "valorant", "cs2", "ml"].includes(g.id))
          .map((g) => (
            <button key={g.id} onClick={() => navigate(`/tournaments?game=${g.id}`)}>
              {g.short}
              <ArrowUpRight size={10} />
            </button>
          ))}
      </div>
    </div>
  );
}

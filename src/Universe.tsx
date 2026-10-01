import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Crosshair, X, Trophy, Activity } from "lucide-react";
import { GameLogo, Mark } from "./Art";
import { games, tournaments, type GameId } from "./data";

export default function Universe({
  onExplore,
}: {
  onExplore: (id: GameId) => void;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<GameId | null>(null);
  const [phase, setPhase] = useState<"idle" | "pop" | "open" | "reform">(
    "idle",
  );
  const [coreStat, setCoreStat] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastBubble = useRef<HTMLButtonElement | null>(null);
  const drag = useRef({ x: 0, y: 0, active: false, moved: false });

  useEffect(() => {
    const el = scene.current!;
    const bubbles = Array.from(
      el.querySelectorAll<HTMLElement>(".bubble-position"),
    );
    const positions = bubbles.map(() => ({ x: 0, y: 0 }));
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    let px = 0,
      py = 0,
      mx = 0,
      my = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = el.getBoundingClientRect();
      px = (event.clientX - rect.left) / rect.width - 0.5;
      py = (event.clientY - rect.top) / rect.height - 0.5;
    };
    const leave = () => {
      px = 0;
      py = 0;
    };
    const tick = (time: number) => {
      if (!visible || document.hidden || reduced.matches) {
        frame = 0;
        return;
      }
      mx += (px - mx) * 0.035;
      my += (py - my) * 0.035;
      const scroll = Math.max(0, -el.getBoundingClientRect().top) / 700;
      el.style.setProperty("--parallax-x", `${mx * 12}px`);
      el.style.setProperty("--parallax-y", `${my * 12}px`);
      bubbles.forEach((bubble, i) => {
        const hovered =
          bubble.matches(":hover") || bubble.contains(document.activeElement);
        if (bubble.querySelector(".pop, .open")) return;
        const depth = [1.2, 0.7, 0.9, 1, 0.8, 0.6][i % 6];
        const selected = el.classList.contains("has-selection");
        const mobile = el.clientWidth < 680;
        const floatX =
          Math.sin(time / (4000 + i * 650) + i * 2) * (mobile ? 4 : 17);
        const floatY =
          Math.cos(time / (3400 + i * 550) + i) * (mobile ? 6 : 22);
        const x =
          floatX +
          mx * depth * (hovered ? 8 : -22) +
          scroll * (i === 1 ? -25 : 35) +
          (selected ? (i === 1 ? -25 : 20) : 0);
        const y = floatY + my * depth * -20 - scroll * (i + 1) * 18;
        const ease = hovered ? 0.008 : 0.035;
        positions[i].x += (x - positions[i].x) * ease;
        positions[i].y += (y - positions[i].y) * ease;
        bubble.style.transform = `translate3d(${positions[i].x}px,${positions[i].y}px,0)`;
      });
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame && visible && !document.hidden && !reduced.matches)
        frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      el.classList.toggle("paused", !visible);
      start();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", start);
    reduced.addEventListener("change", start);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    const stats = setInterval(() => {
      if (visible && !document.hidden) setCoreStat((n) => (n + 1) % 3);
    }, 3600);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(stats);
      observer.disconnect();
      document.removeEventListener("visibilitychange", start);
      reduced.removeEventListener("change", start);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (phase === "open") dialog.current?.showModal();
  }, [phase]);

  function pop(id: GameId, button: HTMLButtonElement) {
    if (phase !== "idle" && phase !== "reform") return;
    clearTimeout(timer.current);
    lastBubble.current = button;
    setSelected(id);
    setPhase("pop");
    timer.current = setTimeout(
      () => setPhase("open"),
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 540,
    );
  }
  function close() {
    dialog.current?.close();
    setPhase("reform");
    lastBubble.current?.focus({ preventScroll: true });
    timer.current = setTimeout(() => {
      setPhase("idle");
      setSelected(null);
    }, 700);
  }
  const game = games.find((g) => g.id === selected);
  const featured = tournaments.find((t) => t.game === selected);
  return (
    <div
      ref={scene}
      className={`universe ${selected && phase !== "reform" ? "has-selection" : ""}`}
      aria-label="Interactive game universe"
    >
      <div className="universe-grid" />
      <div className="universe-haze" />
      <div className="scene-coordinate mono">
        NETWORK / 27.7172° N<br />
        <span>85.3240° E</span>
      </div>
      <div className="ghost-sphere ghost-one" />
      <div className="ghost-sphere ghost-two" />
      <div className="ghost-sphere ghost-three" />
      <div className="ghost-sphere ghost-four" />
      <div className="ghost-sphere ghost-five" />
      <div className="ghost-sphere ghost-six" />
      <svg className="data-lines" viewBox="0 0 700 660" aria-hidden="true">
        <path d="M315 408 410 408 467 272" />
        <path d="M315 408 228 408 177 159" />
        <path d="M315 408 418 480 478 515" />
        <circle cx="315" cy="408" r="4" />
      </svg>
      <div className="core">
        <div className="core-top mono">
          <span>
            <i className="dot" /> LIVE NETWORK
          </span>
          <Activity size={12} />
        </div>
        <div className="core-name">
          <Mark />
          <strong>MATCHFLOW</strong>
        </div>
        <div className="core-stat mono" key={coreStat}>
          <span>
            {["24 TOURNAMENTS", "312 TEAMS", "48 LIVE MATCHES"][coreStat]}
          </span>
          <span className="core-bars">▂▅▃▇▄</span>
        </div>
        <span className="core-foot mono">
          SYSTEM ONLINE <span>↗</span>
        </span>
      </div>
      {games.map((g, index) => (
        <div className={`bubble-position bubble-${g.id}`} key={g.id}>
          <button
            className={`glass-bubble ${selected === g.id ? phase : ""}`}
            aria-label={`Explore ${g.name}`}
            aria-haspopup="dialog"
            style={{ "--game-color": g.color } as CSSProperties}
            onClick={(e) => {
              if (drag.current.moved) {
                drag.current.moved = false;
                return;
              }
              pop(g.id, e.currentTarget);
            }}
            onPointerDown={(e) => {
              if (e.pointerType !== "touch") return;
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                active: true,
                moved: false,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current.active) return;
              const dx = e.clientX - drag.current.x;
              const dy = e.clientY - drag.current.y;
              if (Math.abs(dx) + Math.abs(dy) > 12) drag.current.moved = true;
              e.currentTarget.style.translate = `${Math.max(-50, Math.min(50, dx))}px ${Math.max(-40, Math.min(40, dy))}px`;
            }}
            onPointerUp={(e) => {
              drag.current.active = false;
              e.currentTarget.style.translate = "";
            }}
            onPointerCancel={(e) => {
              drag.current.active = false;
              e.currentTarget.style.translate = "";
            }}
          >
            <span className="sphere-sheen" />
            <span className="sphere-rim" />
            <span className="sphere-glint" />
            <span className="bubble-index mono">
              0{index + 1} / {g.category}
            </span>
            <GameLogo game={g.id} />
            <span className="bubble-status mono">
              <i className="dot" />
              {g.tournaments} TOURNAMENTS
            </span>
            <span className="bubble-explore mono">
              EXPLORE {g.short} <ArrowUpRight size={13} />
            </span>
          </button>
          {selected === g.id && phase === "pop" && (
            <span className="pop-particles" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ "--i": i } as CSSProperties} />
              ))}
            </span>
          )}
          <span className="bubble-caption mono">
            {g.name.toUpperCase()}
            <span>↗</span>
          </span>
        </div>
      ))}
      <div className="scene-instruction mono">
        <Crosshair size={15} />
        <span>
          CHOOSE YOUR WORLD.
          <br />
          <span>HOVER TO EXPLORE. CLICK TO ENTER.</span>
        </span>
      </div>
      <span className="scene-corner mono">
        06 GAMES. ENDLESS POSSIBILITIES.
      </span>
      <dialog
        ref={dialog}
        className="game-focus"
        aria-label={game ? `${game.name} tournament details` : "Game details"}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {game && (
          <div className="focus-content">
            <button
              className="icon-button focus-close"
              onClick={close}
              aria-label="Close game details"
            >
              <X size={20} />
            </button>
            <div className="focus-label mono">
              <i className="dot" /> GAME CONNECTED <span>DEMO</span>
            </div>
            <GameLogo game={game.id} />
            <h2>{game.name}</h2>
            <div className="focus-numbers">
              <div>
                <strong>{game.tournaments}</strong>
                <span className="mono">TOURNAMENTS</span>
              </div>
              <div>
                <strong>{game.teams}</strong>
                <span className="mono">TEAMS COMPETING</span>
              </div>
            </div>
            <div className="focus-featured">
              <span className="eyebrow">FEATURED TOURNAMENT</span>
              <h3>{featured?.title}</h3>
              <div className="flex items-center justify-between">
                <span>{featured?.teams}</span>
                <span className="lime">
                  <Trophy size={13} /> NPR {featured?.prize}
                </span>
              </div>
              <div className="registration-bar">
                <i />
              </div>
              <span className="mono lime">{featured?.status}</span>
            </div>
            <div className="mini-bracket" aria-label="Demo match bracket">
              <div>
                <span>
                  TITANS <b>2</b>
                </span>
                <span>
                  PHOENIX <b>1</b>
                </span>
              </div>
              <i />
              <div>
                <span>
                  TITANS <b>↗</b>
                </span>
              </div>
              <i />
              <Trophy size={22} />
            </div>
            <button
              className="button primary full"
              onClick={() => {
                const id = game.id;
                close();
                onExplore(id);
              }}
            >
              EXPLORE {game.short} TOURNAMENTS <ArrowUpRight size={17} />
            </button>
            <p className="demo-note mono">
              FICTIONAL TOURNAMENT DATA · LANDING PAGE PREVIEW
            </p>
          </div>
        )}
      </dialog>
    </div>
  );
}

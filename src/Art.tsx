import { useId } from "react";
import type { GameId } from "./data";

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="30"
      height="26"
      viewBox="0 0 32 28"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 26V2h7l8 12L24 2h7v24h-7V14l-8 12-8-12v12H1Z"
        fill="currentColor"
      />
      <path d="m12 2 4 6 4-6h-8Z" fill="currentColor" />
    </svg>
  );
}

export function GameLogo({ game }: { game: GameId }) {
  if (game === "valorant")
    return (
      <span className="game-logo valorant-logo">
        <svg viewBox="0 0 80 64" aria-hidden="true">
          <path d="M5 6 45 54H23L5 32ZM75 6 51 35H73Z" fill="currentColor" />
        </svg>
        <strong>VALORANT</strong>
        <small>DEFY THE LIMITS</small>
      </span>
    );
  if (game === "cs2")
    return (
      <span className="game-logo cs2-logo">
        <strong>
          CS<span>2</span>
        </strong>
        <small>COUNTER-STRIKE</small>
      </span>
    );
  if (game === "dota")
    return (
      <span className="game-logo dota-logo">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M7 5 58 7 56 59 5 57Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            d="m13 12 39 35-3 7-39-36ZM33 13h18l-1 16ZM13 34l17 17H12Z"
            fill="currentColor"
          />
        </svg>
        <strong>DOTA 2</strong>
        <small>DEFEND YOUR ANCIENT</small>
      </span>
    );
  if (game === "pubg")
    return (
      <span className="game-logo pubg-logo">
        <strong>PUBG</strong>
        <span>MOBILE</span>
      </span>
    );
  if (game === "ml")
    return (
      <span className="game-logo ml-logo">
        <span className="logo-diamond">✦</span>
        <strong>
          MOBILE
          <br />
          LEGENDS
        </strong>
        <small>BANG BANG</small>
      </span>
    );
  return (
    <span className="game-logo ff-logo">
      <strong>
        FREE F<span className="knife">I</span>RE
      </strong>
      <small>BATTLE IN STYLE</small>
    </span>
  );
}

// Original vector scene artwork: local, lightweight, and crisp at any size.
export function GameArt({ game }: { game: GameId }) {
  const id = useId().replace(/:/g, "");
  const scene =
    game === "cs2"
      ? "pubg"
      : game === "dota"
        ? "ml"
        : game === "valorant"
          ? "ff"
          : game;
  const base =
    game === "valorant"
      ? "#8c625e"
      : game === "dota"
        ? "#856750"
        : scene === "pubg"
          ? "#8c8065"
          : scene === "ml"
            ? "#6e8271"
            : "#ad7651";
  return (
    <svg
      className={`game-art art-${game}`}
      viewBox="0 0 700 380"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x2="0" y2="1">
          <stop stopColor={base} />
          <stop offset="1" stopColor="#202820" />
        </linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" x2="1" y2="1">
          <stop stopColor="#b9bbaa" />
          <stop offset=".42" stopColor="#626a57" />
          <stop offset=".5" stopColor="#303b31" />
          <stop offset="1" stopColor="#121b17" />
        </linearGradient>
        <radialGradient id={`${id}-light`}>
          <stop stopColor="#e9e0b8" stopOpacity=".5" />
          <stop offset="1" stopColor="#d3f45d" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-noise`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".6"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".11" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" mode="soft-light" />
        </filter>
      </defs>
      <g filter={`url(#${id}-noise)`}>
        <path fill={`url(#${id}-sky)`} d="M0 0h700v380H0z" />
        <ellipse
          cx="450"
          cy="120"
          rx="280"
          ry="250"
          fill={`url(#${id}-light)`}
        />
        <circle cx="470" cy="103" r="63" fill="#dcd4a9" opacity=".12" />
        <path
          d="m0 239 99-104 70 59 68-106 84 131 80-104 66 75 66-43 167 128v105H0Z"
          fill="#253429"
          opacity=".65"
        />
        {scene === "pubg" ? (
          <>
            <path
              d="M0 230h68v-90h37v-20h34v120h35v-53h48v97h400V166h28v-20h36v29h14v205H0Z"
              fill="#18251f"
              opacity=".7"
            />
            <path d="m377 380 18-93 62-44 74 2 69 52 29 83" fill="#131e19" />
            <path
              d="m453 250 41 42 39-43-9 91-40 40-39-48Z"
              fill="#a2a390"
              opacity=".65"
            />
            <path
              d="m422 181 6-60 23-36 49-13 51 22 22 42-6 58-30 47-59-3-42-37Z"
              fill={`url(#${id}-metal)`}
            />
            <path d="m417 156 156-7 8 44-141 22-22-25Z" fill="#0d1713" />
            <path
              d="m426 160 143-6"
              stroke="#d5d2b2"
              opacity=".6"
              strokeWidth="3"
            />
            <path
              d="m494 79 11 66M548 104l-9 41"
              stroke="#d9d6b9"
              opacity=".2"
              strokeWidth="3"
            />
            <path d="m595 346 29-193 11-5-17 204-10 28h-31Z" fill="#101a14" />
            <path
              d="m408 296 31 23-15 61h-47m180-87-24 32 20 55h50"
              fill="#384336"
            />
            <path
              d="m404 320 17 6-7 28-18-6m161-30 14-5 13 30-19 7"
              stroke="#747a59"
              strokeWidth="5"
            />
          </>
        ) : scene === "ml" ? (
          <>
            <path
              d="M69 294V129l17-24 17 24v122l37 43m443 0V89l15-26 15 26v193l36 12"
              fill="#314d40"
            />
            <path d="m328 380 35-108 57-51 56 3 69 77 12 79Z" fill="#1c3028" />
            <path
              d="m409 128 22-52 41 53-4 71-24 37-38-42Z"
              fill={`url(#${id}-metal)`}
            />
            <path d="m405 147 66-1-13 22-46-1Z" fill="#101e18" />
            <path
              d="m404 111-23-61 49 31 43-8 34-20-22 69-18 18-17-20-26 17Z"
              fill="#a9b594"
            />
            <path
              d="m400 225-70 16-35 47 77-6 36 28 23-65m46-20 66 5 58 57-75-1-49 35-20-60"
              fill={`url(#${id}-metal)`}
            />
            <path d="m504 380 54-268 19-40 12 44-44 264Z" fill="#abc3a7" />
            <path
              d="m564 130-45 250m37-231 27 7m-52 89 41 9"
              stroke="#d0e6be"
              strokeWidth="4"
            />
            <path d="m410 292 37-28 30 32-30 41Z" fill="#819c66" />
            <path d="m418 296 25-9 18 11-17 20Z" fill="#ced79a" />
          </>
        ) : (
          <>
            <path
              d="M0 291h93V162h47v-29h37v160h48v-70h30v157H0Zm563 89V199h40v-42h62v-39h35v262Z"
              fill="#31291f"
            />
            <path d="m326 380 24-85 68-51 95-3 67 75 18 64Z" fill="#201f1b" />
            <path
              d="m400 217-5-68 33-70 51-14 54 42 20 82-33 49-75 27Z"
              fill={`url(#${id}-metal)`}
            />
            <path d="m423 193 8-62 41-30 37 38 13 58-48 58Z" fill="#181b16" />
            <path
              d="m434 165 26 3m20 0 21-8"
              stroke="#d9c38e"
              strokeWidth="4"
            />
            <path d="m433 189 71-4-12 39-26 11-24-16Z" fill="#725d43" />
            <path
              d="m420 257 40 77-19 46h-50l-28-74Zm78-6-14 77 31 52h68l-38-79Z"
              fill="#776b4c"
            />
            <path
              d="m448 289 9-13 13 14 12-12"
              stroke="#c5ab68"
              strokeWidth="4"
              fill="none"
            />
            <path d="m544 326 22-158 12 2-12 165 36 34-20 11Z" fill="#181d16" />
          </>
        )}
        <path
          d="M0 357c135-39 201 38 350-6s239 18 350-19v48H0Z"
          fill="#15221b"
        />
        <g fill="#e3d8aa" opacity=".5">
          <circle cx="310" cy="129" r="1.5" />
          <circle cx="586" cy="82" r="1" />
          <circle cx="372" cy="206" r="2" />
          <circle cx="225" cy="138" r="1" />
          <circle cx="552" cy="250" r="2" />
          <circle cx="275" cy="288" r="1.5" />
        </g>
      </g>
    </svg>
  );
}

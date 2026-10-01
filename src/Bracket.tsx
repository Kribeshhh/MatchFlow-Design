import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Trophy } from "lucide-react";
const teams = [
  "Kathmandu Titans",
  "Shadow Wolves",
  "Phoenix Esports",
  "Everest Gaming",
  "Valley Vipers",
  "Team Nova",
  "Himalayan Hawks",
  "Zero Gravity",
];
const initials = ["KT", "SW", "PX", "EG", "VV", "NV", "HH", "ZG"];
const rounds = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 2, 5, 6],
  [0, 5],
];
export default function Bracket() {
  const [stage, setStage] = useState(0);
  const [running, setRunning] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  useEffect(() => () => clearInterval(interval.current), []);
  function play() {
    clearInterval(interval.current);
    setStage(0);
    setRunning(true);
    let next = 0;
    interval.current = setInterval(
      () => {
        next += 1;
        setStage(next);
        if (next === 3) {
          clearInterval(interval.current);
          setRunning(false);
        }
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 350 : 1200,
    );
  }
  return (
    <section id="how-it-works" className="section bracket-section reveal">
      <div className="section-heading">
        <div>
          <span className="eyebrow">03 / THE ROAD TO GLORY</span>
          <h2>
            FROM FIRST MATCH
            <br />
            TO <span className="lime">CHAMPION.</span>
          </h2>
        </div>
        <div className="heading-aside">
          <p>
            Every round. Every upset. Every victory.
            <br />
            Your entire tournament, in one flow.
          </p>
          <button className="button outline" disabled={running} onClick={play}>
            {running
              ? "MATCHES IN PROGRESS"
              : stage === 3
                ? "REPLAY BRACKET DEMO"
                : "PLAY BRACKET DEMO"}
            {stage === 3 ? <RotateCcw size={15} /> : <Play size={14} />}
          </button>
        </div>
      </div>
      <div className="bracket-shell">
        <div className="bracket-top mono">
          <span>
            <i className="dot" /> MATCHFLOW INVITATIONAL
          </span>
          <span>
            8 TEAMS <span className="muted">/</span> SINGLE ELIMINATION{" "}
            <span className="demo-tag">INTERACTIVE DEMO</span>
          </span>
        </div>
        <div
          className="bracket-scroll"
          tabIndex={0}
          aria-label="Tournament bracket. Scroll horizontally on smaller screens."
        >
          <div className="bracket-grid">
            {rounds.map((ids, r) => (
              <div className={`bracket-round round-${r}`} key={r}>
                <span className="round-label mono">
                  0{r + 1} / {["QUARTER FINALS", "SEMI FINALS", "FINAL"][r]}
                </span>
                <div className="round-matches">
                  {Array.from({ length: ids.length / 2 }, (_, pair) => (
                    <div
                      className={`match-pair ${stage > r ? "decided" : ""}`}
                      key={pair}
                    >
                      {ids.slice(pair * 2, pair * 2 + 2).map((id, row) => {
                        const revealed = stage >= r;
                        const winner =
                          r === 2 ? id === 0 : rounds[r + 1].includes(id);
                        return (
                          <button
                            key={id}
                            className={`team-row ${hovered === id && revealed ? "path-highlight" : ""} ${winner && stage > r ? "winner" : ""}`}
                            onMouseEnter={() => setHovered(id)}
                            onMouseLeave={() => setHovered(null)}
                            onFocus={() => setHovered(id)}
                            onBlur={() => setHovered(null)}
                            aria-label={
                              revealed
                                ? `${teams[id]}${stage > r ? (winner ? ", advances" : ", eliminated") : ""}`
                                : "Awaiting previous round"
                            }
                          >
                            <span className={`team-icon team-${id}`}>
                              {revealed ? initials[id] : "—"}
                            </span>
                            <span>
                              {revealed ? teams[id] : "Awaiting winner"}
                            </span>
                            <b>
                              {stage > r
                                ? winner
                                  ? "2"
                                  : row === 0
                                    ? "0"
                                    : "1"
                                : "—"}
                            </b>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className={`champion ${stage === 3 ? "crowned" : ""}`}>
              <span className="round-label mono">THE CHAMPION</span>
              <div className="champion-emblem">
                <Trophy size={35} strokeWidth={1.2} />
              </div>
              <strong>
                {stage === 3 ? "KATHMANDU TITANS" : "YOUR MOMENT."}
              </strong>
              <span className="mono">
                {stage === 3 ? "THE CROWN IS YOURS." : "YOUR NAME HERE."}
              </span>
              {stage === 3 && (
                <div className="champion-confetti" aria-hidden="true">
                  ✦ · ✧ · ✦
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="bracket-bottom mono">
          <span>HOVER OR FOCUS A TEAM TO TRACE ITS PATH</span>
          <span aria-live="polite">
            {
              [
                "READY TO PLAY",
                "QUARTER FINALS COMPLETE",
                "SEMI FINALS COMPLETE",
                "KATHMANDU TITANS WIN THE DEMO",
              ][stage]
            }{" "}
            <span className="lime">↗</span>
          </span>
        </div>
      </div>
    </section>
  );
}

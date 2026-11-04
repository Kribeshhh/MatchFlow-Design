import { useRef, useState, type ReactNode } from "react";
export function BracketViewport({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const change = (amount: number) =>
    setZoom((z) => Math.max(0.75, Math.min(1.5, Math.round((z + amount) * 100) / 100)));
  return (
    <>
      <div className="mvp-action-row" aria-label="Bracket view controls">
        <button
          type="button"
          className="mvp-small-button"
          aria-label="Zoom out bracket"
          disabled={zoom <= 0.75}
          onClick={() => change(-0.25)}
        >
          −
        </button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button
          type="button"
          className="mvp-small-button"
          aria-label="Zoom in bracket"
          disabled={zoom >= 1.5}
          onClick={() => change(0.25)}
        >
          +
        </button>
        <button
          type="button"
          className="mvp-small-button"
          onClick={() => {
            setZoom(1);
            viewport.current?.scrollTo({ top: 0, left: 0 });
          }}
        >
          RESET VIEW
        </button>
      </div>
      <div
        ref={viewport}
        className="mvp-bracket-scroll"
        tabIndex={0}
        role="region"
        aria-label="Tournament bracket. Arrow keys scroll. Plus and minus zoom. Drag empty space to pan."
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            change(0.25);
          }
          if (e.key === "-") {
            e.preventDefault();
            change(-0.25);
          }
        }}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            e.pointerType === "touch" ||
            (e.target as HTMLElement).closest("button,a,input,select")
          )
            return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          e.currentTarget.scrollLeft = drag.current.left + drag.current.x - e.clientX;
          e.currentTarget.scrollTop = drag.current.top + drag.current.y - e.clientY;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="mvp-bracket-zoom" style={{ zoom }}>
          {children}
        </div>
      </div>
    </>
  );
}

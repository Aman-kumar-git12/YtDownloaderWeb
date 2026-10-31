import { useState } from "react";
import { toClock } from "../../lib/format";

const W = 1000;
const H = 140;

// The "most replayed" graph YouTube shows above the seek bar, with the best
// moments circled in pencil. Hovering reads out the time and replay level.
export default function ReplayChart({ heatmap, duration, moments }) {
  const [hover, setHover] = useState(null);
  const n = heatmap.length;
  const mean = heatmap.reduce((a, b) => a + b, 0) / n;
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => H - 6 - v * (H - 16);

  const line = heatmap.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const i = Math.round(ratio * (n - 1));
    setHover({ i, left: ratio * 100 });
  };

  return (
    <div className="replay">
      <div
        className="replay-plot"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Replay graph. Most replayed moments: ${moments.map((m) => toClock(m.peak)).join(", ") || "none stand out"}.`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="replay-mean" x1="0" x2={W} y1={y(mean)} y2={y(mean)} vectorEffect="non-scaling-stroke" />
          <path className="replay-area" d={area} />
          <path className="replay-line" d={line} vectorEffect="non-scaling-stroke" />
        </svg>

        {moments.map((m, index) => {
          const i = Math.round((m.peak / duration) * (n - 1));
          return (
            <span
              key={m.peak}
              className="replay-peak"
              style={{ left: `${(m.peak / duration) * 100}%`, top: `${(y(heatmap[Math.min(i, n - 1)]) / H) * 100}%` }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 40 40">
                <path d="M8 21c-1-8 7-14 15-12s11 9 8 15-11 8-17 5c-4-2-6-5-6-9" style={{ animationDelay: `${0.2 + index * 0.25}s` }} />
              </svg>
              <b>{index + 1}</b>
            </span>
          );
        })}

        {hover && (
          <>
            <span className="replay-cursor" style={{ left: `${hover.left}%` }} aria-hidden="true" />
            <span className={`replay-tip ${hover.left > 70 ? "is-left" : ""}`} style={{ left: `${hover.left}%` }} aria-hidden="true">
              <strong className="numeric">{toClock((hover.i / (n - 1)) * duration)}</strong>
              <span>{mean ? `${(heatmap[hover.i] / mean).toFixed(1)}× the average replays` : ""}</span>
            </span>
          </>
        )}
      </div>
      <div className="replay-axis numeric" aria-hidden="true">
        <span>0:00</span>
        <span>{toClock(duration / 2)}</span>
        <span>{toClock(duration)}</span>
      </div>
    </div>
  );
}

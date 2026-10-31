// Hand-drawn grease-pencil strokes, the way photographers mark frames on a
// contact sheet. Each path draws itself in via stroke-dashoffset (see .pencil).
const PATHS = {
  underline: {
    viewBox: "0 0 300 14",
    d: "M3 9 C 45 4, 95 12, 150 7 S 245 4, 297 8",
  },
  circle: {
    viewBox: "0 0 200 80",
    d: "M34 13 C 84 1, 170 3, 191 29 C 207 54, 152 77, 96 77 C 40 77, 3 63, 7 40 C 11 17, 62 6, 124 9",
  },
  check: {
    viewBox: "0 0 24 24",
    d: "M4 13.5 L9.5 18.5 L20 5.5",
  },
};

export default function PencilMark({ shape, className = "" }) {
  const { viewBox, d } = PATHS[shape];
  return (
    <svg
      className={`pencil pencil-${shape} ${className}`}
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} pathLength="1" />
    </svg>
  );
}

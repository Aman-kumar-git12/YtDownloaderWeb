// A film frame with a pencil circle: the app's own mark (not YouTube's logo)
export default function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="26" height="20" rx="3" className="logo-film" />
      <g className="logo-holes">
        <rect x="6" y="8" width="2.5" height="2" rx="0.5" />
        <rect x="11" y="8" width="2.5" height="2" rx="0.5" />
        <rect x="16" y="8" width="2.5" height="2" rx="0.5" />
        <rect x="21" y="8" width="2.5" height="2" rx="0.5" />
        <rect x="6" y="22" width="2.5" height="2" rx="0.5" />
        <rect x="11" y="22" width="2.5" height="2" rx="0.5" />
        <rect x="16" y="22" width="2.5" height="2" rx="0.5" />
        <rect x="21" y="22" width="2.5" height="2" rx="0.5" />
      </g>
      <path className="logo-play" d="M13.5 12.5 L19.5 16 L13.5 19.5 Z" />
      <path
        className="logo-ring"
        d="M10 11 C 16 7.5, 25 9, 25.5 15 C 26 21, 18 23.5, 12.5 21.5 C 7.5 19.5, 7 14, 11.5 11.5"
      />
    </svg>
  );
}

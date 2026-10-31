import { DownloadButton, DownloadStatus } from "./DownloadControls";

const FORMATS = [
  { id: "srt", label: "SRT", hint: "Works in most video players" },
  { id: "vtt", label: "VTT", hint: "For web players" },
];

export default function SubtitleList({ data, download, busy, onDownload, format, setFormat }) {
  const tracks = data.tracks || [];

  if (tracks.length === 0) {
    return <p className="panel-empty">This video has no subtitles or captions.</p>;
  }

  return (
    <>
      <div className="segmented" role="radiogroup" aria-label="Subtitle format">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={format === f.id}
            className={format === f.id ? "is-selected" : ""}
            onClick={() => setFormat(f.id)}
          >
            <strong>{f.label}</strong>
            <span>{f.hint}</span>
          </button>
        ))}
      </div>

      <ul className="format-list">
        {tracks.map((track) => {
          const key = `${track.id}:${format}`;
          const rowDownload = download?.key === key ? download : null;
          return (
            <li key={track.id} className={`format-row ${rowDownload ? "is-active" : ""}`}>
              <div className="format-main">
                <div className="format-name">
                  <span className="format-label">{track.name}</span>
                  {track.auto && <span className="badge">Auto-generated</span>}
                </div>
              </div>
              <span className="format-size">{format.toUpperCase()}</span>
              <DownloadButton
                label={`${track.name} subtitles`}
                download={rowDownload}
                busy={busy}
                onDownload={() => onDownload(key)}
              />
              <DownloadStatus kind="subtitles" download={rowDownload} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

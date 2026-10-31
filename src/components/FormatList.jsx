import PencilMark from "./PencilMark";
import { DownloadButton, DownloadStatus } from "./DownloadControls";
import { qualityBadge, sizeInMB } from "../lib/format";

// Formats that get title/artist tags and the thumbnail as cover art
const AUDIO_NOTES = {
  MP3: "Plays everywhere. Includes title, artist and cover art",
  M4A: "Best for Apple devices. Includes title, artist and cover art",
  FLAC: "Lossless. Includes title, artist and cover art",
};

// "120.3 MB" scaled to a clip's share of the video (scale 0..1)
function scaledSize(size, scale) {
  const mb = sizeInMB(size);
  if (scale === 1 || mb === null) return size;
  const clipped = mb * scale;
  return clipped >= 1024 ? `~${(clipped / 1024).toFixed(1)} GB` : `~${clipped.toFixed(1)} MB`;
}

export default function FormatList({ kind, data, download, busy, onDownload, scale = 1 }) {
  const items = Object.entries((kind === "video" ? data.resolutions : data.formats) || {});

  if (items.length === 0) {
    return <p className="panel-empty">No {kind} formats were found for this video.</p>;
  }

  return (
    <ul className="format-list">
      {items.map(([key, size]) => {
        const rowDownload = download?.key === key ? download : null;
        const badge = kind === "video" ? qualityBadge(key) : null;
        const shown = scaledSize(size, scale);
        const mb = sizeInMB(shown);
        const description =
          kind === "audio"
            ? AUDIO_NOTES[key] || data.details?.[key]
            : mb && mb > 500
              ? "Large file, may take a few minutes"
              : null;

        return (
          <li key={key} className={`format-row ${rowDownload ? "is-active" : ""}`}>
            <div className="format-main">
              <div className="format-name">
                <span className="format-label">
                  {key}
                  {rowDownload && <PencilMark shape="circle" className="format-circle" />}
                </span>
                {badge && <span className="badge">{badge}</span>}
              </div>
              {description && <p className="format-desc">{description}</p>}
            </div>
            <span className="format-size numeric">{shown === "Unknown" ? "Size unknown" : shown}</span>
            <DownloadButton
              label={key}
              download={rowDownload}
              busy={busy}
              onDownload={() => onDownload(key)}
            />
            <DownloadStatus kind={kind} download={rowDownload} />
          </li>
        );
      })}
    </ul>
  );
}

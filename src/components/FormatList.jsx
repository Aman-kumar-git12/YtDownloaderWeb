import PencilMark from "./PencilMark";
import { DownloadButton, DownloadStatus } from "./DownloadControls";
import { qualityBadge, sizeInMB } from "../lib/format";

export default function FormatList({ kind, data, download, busy, onDownload }) {
  const items = Object.entries((kind === "video" ? data.resolutions : data.formats) || {});

  if (items.length === 0) {
    return <p className="panel-empty">No {kind} formats were found for this video.</p>;
  }

  return (
    <ul className="format-list">
      {items.map(([key, size]) => {
        const rowDownload = download?.key === key ? download : null;
        const badge = kind === "video" ? qualityBadge(key) : null;
        const mb = sizeInMB(size);
        const description = kind === "audio" ? data.details?.[key] : mb && mb > 500 ? "Large file, may take a few minutes" : null;

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
            <span className="format-size numeric">{size === "Unknown" ? "Size unknown" : size}</span>
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

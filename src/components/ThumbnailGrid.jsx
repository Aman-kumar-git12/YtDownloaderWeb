import { DownloadButton, DownloadStatus } from "./DownloadControls";

export default function ThumbnailGrid({ data, download, busy, onDownload }) {
  // Largest first from the server; tiny sizes aren't worth listing
  const items = Object.entries(data.resolutions || {}).slice(0, 4);

  if (items.length === 0) {
    return <p className="panel-empty">No thumbnails were found for this video.</p>;
  }

  return (
    <ul className="thumb-grid">
      {items.map(([key, size]) => {
        const rowDownload = download?.key === key ? download : null;
        return (
          <li key={key} className={`thumb-card ${rowDownload ? "is-active" : ""}`}>
            <div className="thumb-preview">
              {data.previews?.[key] && <img src={data.previews[key]} alt={`Thumbnail at ${key}`} loading="lazy" />}
            </div>
            <div className="thumb-meta">
              <div>
                <span className="format-label numeric">{key.replace("x", " × ")}</span>
                <span className="format-size numeric">{size === "Unknown" ? "Size unknown" : size}</span>
              </div>
              <DownloadButton
                label={`thumbnail ${key}`}
                download={rowDownload}
                busy={busy}
                onDownload={() => onDownload(key)}
              />
            </div>
            <DownloadStatus kind="thumbnail" download={rowDownload} />
          </li>
        );
      })}
    </ul>
  );
}

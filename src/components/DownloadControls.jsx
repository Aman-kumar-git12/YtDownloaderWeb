import { AnimatePresence, motion } from "framer-motion";
import { Download, RotateCcw } from "lucide-react";
import PencilMark from "./PencilMark";
import { formatElapsed } from "../lib/format";

const PROCESSING_LABEL = {
  video: "Merging video and audio…",
  audio: "Converting audio…",
  thumbnail: "Saving image…",
};

function statusText(kind, download) {
  if (download.backendStatus === "queued") return "Waiting for a free download slot…";
  if (download.backendStatus === "processing") return PROCESSING_LABEL[kind];
  if (kind === "video" && download.stage) return `Downloading ${download.stage} stream`;
  return "Downloading";
}

export function DownloadButton({ label, download, busy, onDownload }) {
  const running = download?.status === "downloading";
  const failed = download?.status === "error";
  return (
    <button
      type="button"
      className={`button button-download ${running ? "is-running" : ""}`}
      onClick={onDownload}
      disabled={busy}
      title={busy && !download ? "Wait for the current download to finish" : undefined}
      aria-label={`${failed ? "Try again" : "Download"} ${label}`}
    >
      {failed ? <RotateCcw size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
      <span>{running ? formatElapsed(download.elapsed) : failed ? "Try again" : "Download"}</span>
    </button>
  );
}

export function DownloadStatus({ kind, download }) {
  return (
    <AnimatePresence initial={false}>
      {download && (
        <motion.div
          className="download-status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <div className="download-status-inner" aria-live="polite">
            {download.status === "downloading" && (
              <>
                <div
                  className={`film-progress ${download.backendStatus !== "downloading" ? "is-indeterminate" : ""}`}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(download.percent || 0)}
                >
                  <div className="film-progress-fill" style={{ width: `${Math.max(download.percent || 0, 3)}%` }} />
                </div>
                <p className="download-text">
                  <span>{statusText(kind, download)}</span>
                  {download.backendStatus === "downloading" && (
                    <span className="numeric">{Math.round(download.percent || 0)}%</span>
                  )}
                  {download.speed && <span className="numeric muted">{download.speed}</span>}
                </p>
              </>
            )}
            {download.status === "completed" && (
              <p className="download-text download-done">
                <PencilMark shape="check" className="done-check" />
                <span>Saved to your downloads in {formatElapsed(download.elapsed)}</span>
              </p>
            )}
            {download.status === "error" && (
              <p className="download-text download-failed" role="alert">
                {download.error}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

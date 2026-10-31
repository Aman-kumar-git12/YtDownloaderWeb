import { Scissors } from "lucide-react";
import { readClip } from "../lib/clip";
import { toClock } from "../lib/format";

// Lets the user download only part of the video. Times are typed as m:ss.
export default function ClipPicker({ clip, setClip, duration }) {
  const { clip: range, error } = readClip(clip, duration);
  const toggle = () =>
    setClip((prev) => ({
      ...prev,
      enabled: !prev.enabled,
      start: prev.start || "0:00",
      end: prev.end || (duration ? toClock(Math.min(duration, 60)) : "1:00"),
    }));

  return (
    <div className={`clip ${clip.enabled ? "is-on" : ""}`}>
      <button type="button" className="clip-toggle" aria-pressed={clip.enabled} onClick={toggle}>
        <Scissors size={16} aria-hidden="true" />
        <span>{clip.enabled ? "Downloading a clip" : "Download only part of it"}</span>
      </button>

      {clip.enabled && (
        <div className="clip-body">
          <div className="clip-fields">
            <label>
              <span>From</span>
              <input
                inputMode="numeric"
                value={clip.start}
                onChange={(e) => setClip((prev) => ({ ...prev, start: e.target.value }))}
                aria-invalid={Boolean(error)}
              />
            </label>
            <label>
              <span>To</span>
              <input
                inputMode="numeric"
                value={clip.end}
                onChange={(e) => setClip((prev) => ({ ...prev, end: e.target.value }))}
                aria-invalid={Boolean(error)}
              />
            </label>
          </div>
          {duration > 0 && (
            <div className="clip-strip" aria-hidden="true">
              {range && (
                <span
                  className="clip-range"
                  style={{ left: `${(range.start / duration) * 100}%`, width: `${((range.end - range.start) / duration) * 100}%` }}
                />
              )}
            </div>
          )}
          <p className={`clip-note ${error ? "is-error" : ""}`} role={error ? "alert" : undefined}>
            {error ||
              `${toClock(range.end - range.start)} clip. Clips take a little longer because the video is cut on the server.`}
          </p>
        </div>
      )}
    </div>
  );
}

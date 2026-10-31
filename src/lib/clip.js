import { parseTime, toClock } from "./format";

// { enabled, start: "1:20", end: "2:05" } -> { clip: { start, end } in seconds, error }
export function readClip(clip, duration) {
  if (!clip.enabled) return { clip: null, error: "" };
  const start = parseTime(clip.start);
  const end = parseTime(clip.end);
  if (start === null || end === null) return { clip: null, error: "Enter times like 1:20 or 0:45." };
  if (start >= end) return { clip: null, error: "The start needs to be before the end." };
  if (duration && end > duration) return { clip: null, error: `The video is only ${toClock(duration)} long.` };
  return { clip: { start, end }, error: "" };
}

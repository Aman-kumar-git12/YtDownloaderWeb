// 0 is a real count; only null/undefined means YouTube hid it
export function formatCount(value) {
  return value == null ? "Hidden" : value.toLocaleString();
}

// 1712345 -> "1.7M"
export function formatCompact(value) {
  if (value == null) return "Hidden";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// "2024-03-05" -> "Mar 5, 2024" (parsed as a local date so it doesn't shift a day)
export function formatDate(iso) {
  if (!iso) return "Unknown";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// "0:03:33" -> "3:33"
export function formatDuration(value) {
  if (!value) return "Unknown";
  return value.replace(/^0:0?/, "");
}

export function formatElapsed(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// "~1.2 GB" / "120.3 MB" -> megabytes (null if unknown)
export function sizeInMB(size) {
  const match = /([\d.]+)\s*(KB|MB|GB)/i.exec(size || "");
  if (!match) return null;
  const factor = { KB: 1 / 1024, MB: 1, GB: 1024 }[match[2].toUpperCase()];
  return parseFloat(match[1]) * factor;
}

export function qualityBadge(resolution) {
  const height = parseInt(resolution, 10);
  if (height >= 2160) return "4K";
  if (height >= 1440) return "2K";
  if (height >= 1080) return "Full HD";
  if (height >= 720) return "HD";
  return null;
}

// Accept links pasted without "https://"
export function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isYouTubeUrl(value) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return (
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtu.be"
    );
  } catch {
    return false;
  }
}

// "1:20", "01:02:03" or "80" -> seconds (null if invalid)
export function parseTime(value) {
  const parts = value.trim().split(":");
  if (!value.trim() || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((total, part) => total * 60 + parseFloat(part), 0);
}

// 80 -> "1:20", 3725 -> "1:02:05"
export function toClock(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// Pull the first YouTube link out of shared text ("Check this out https://youtu.be/…")
export function findYouTubeUrl(text) {
  const match = /(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/\S+/i.exec(text || "");
  return match ? match[0] : "";
}

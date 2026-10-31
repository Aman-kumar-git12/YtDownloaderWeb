// Copied from src/lib/format.js (the extension has no build step). Keep in sync.

// 1712345 -> "1.7M"
export function formatCompact(value) {
  if (value == null) return "Hidden";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// 61000 -> "$61K", 15.26 -> "$15.26"
export function formatMoney(value) {
  if (value == null) return "Unknown";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatMoneyRange([low, high]) {
  return `${formatMoney(low)} – ${formatMoney(high)}`;
}

// 80 -> "1:20", 3725 -> "1:02:05"
export function toClock(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

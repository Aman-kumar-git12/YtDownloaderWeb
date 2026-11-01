// Predictions for one video, from data the popup already has (video + channel parts).
//
// Model: a video's lifetime views grow roughly like a power law, V(t) = k · t^a — fast at first,
// then a long tail (a ≈ 0.25–0.5 for most videos). Instead of one generic curve we fit the curve to
// the channel's own recent uploads (log-views against log-age, least squares), so a channel whose
// videos keep growing gets a steeper curve than one whose videos die after a week. With too few
// uploads we fall back to the backend's generic ranges (Backend/core/insights.py → forecast()).
// Every number is a range (low–high exponent), never a single "exact" figure.

const DAY = 86400;
const MILESTONES = [1e3, 1e4, 5e4, 1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8, 5e8, 1e9, 2e9, 5e9, 1e10];
const MIN_FIT_VIDEOS = 6;
const A_MIN = 0.12, A_MAX = 0.75, A_SPREAD = 0.08;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Least squares on (ln age, ln views) of the channel's uploads → { a, k, r2, n }
export function fitChannelCurve(uploads, nowSec = Date.now() / 1000) {
  const pts = uploads
    .filter((u) => u.views > 0 && u.timestamp)
    .map((u) => [Math.log(Math.max((nowSec - u.timestamp) / DAY, 1)), Math.log(u.views)]);
  if (pts.length < MIN_FIT_VIDEOS) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  if (sxx < 0.5) return null; // all uploads about the same age: can't see a growth curve
  const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const a = sxy / sxx;
  const b = my - a * mx;
  const ssTot = pts.reduce((s, p) => s + (p[1] - my) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p[1] - (b + a * p[0])) ** 2, 0);
  return { a, k: Math.exp(b), r2: ssTot ? 1 - ssRes / ssTot : 0, n };
}

// Views the video should have `days` from now, for growth exponent a
const viewsAt = (views, age, days, a) => views * ((age + days) / age) ** a;

// Days from now until the curve reaches `target` views
const daysUntil = (views, age, target, a) => age * (target / views) ** (1 / a) - age;

export function buildPredictions(video, channel, nowSec = Date.now() / 1000) {
  const views = video?.views;
  if (!views || !video.published) return { available: false, reason: "This video is too new or has no public view count yet." };
  const age = Math.max((nowSec - video.published) / DAY, 0.5);

  // Growth exponent: fitted to this channel when possible, else the generic range
  const uploads = channel?.recent?.uploads || [];
  const fit = uploads.length ? fitChannelCurve(uploads.filter((u) => u.id !== video.video_id), nowSec) : null;
  // Trust the channel's own curve only when it explains a fair share of the spread (R² ≥ 0.2)
  const fitted = Boolean(fit && fit.a >= A_MIN && fit.a <= A_MAX && fit.r2 >= 0.2);
  let [aLow, aHigh] = age > 30 ? [0.25, 0.5] : [0.35, 0.65];
  if (fitted) [aLow, aHigh] = [clamp(fit.a - A_SPREAD, A_MIN, A_MAX), clamp(fit.a + A_SPREAD, A_MIN, A_MAX)];
  const aMid = (aLow + aHigh) / 2;

  const gain = (days) => [viewsAt(views, age, days, aLow) - views, viewsAt(views, age, days, aHigh) - views].map(Math.round);
  const horizons = [
    { label: "Next 7 days", days: 7, gain: gain(7) },
    { label: "Next 30 days", days: 30, gain: gain(30) },
    { label: "Next year", days: 365, gain: gain(365) },
  ];

  // Today's pace: the curve's slope now, dV/dt = a·V/t
  const perDay = [Math.round((aLow * views) / age), Math.round((aHigh * views) / age)];

  // Next two milestones it's on track for (within 20 years)
  const milestones = MILESTONES.filter((m) => m > views).slice(0, 3).map((m) => {
    const fast = daysUntil(views, age, m, aHigh);
    const slow = daysUntil(views, age, m, aLow);
    return { views: m, days: [fast, slow], likely: fast < 365 * 20 };
  }).filter((m) => m.likely).slice(0, 2);

  // Versus a typical upload of this channel at the same age (age-adjusted, unlike a plain median)
  let vsTypical = null;
  if (fitted) {
    const expected = fit.k * Math.max(age, 1) ** fit.a;
    vsTypical = { ratio: views / expected, expected: Math.round(expected) };
  }

  // Where it should rank among the channel's recent uploads a year from now
  let rank = null;
  const list = channel?.recent?.views?.map((v) => v.views).filter((v) => v > 0) || [];
  if (list.length >= 5 && !channel.this_video?.older_than_sample) {
    const inYear = viewsAt(views, age, 365, aMid);
    const others = channel.recent.views.filter((v) => v.id !== video.video_id).map((v) => v.views);
    rank = { position: others.filter((v) => v > inYear).length + 1, of: others.length + 1 };
  }

  // Earnings ahead, from the same RPM range as the earnings estimate
  const [rpmLow, rpmHigh] = video.earnings?.rpm || [0, 0];
  const money = (days) => {
    const [g1, g2] = gain(days);
    return [Math.round((g1 / 1000) * rpmLow), Math.round((g2 / 1000) * rpmHigh)];
  };
  const earnings = video.earnings?.monetized_likely ? { month: money(30), year: money(365) } : null;

  // When the creator will probably post next: last upload + their usual gap
  let nextUpload = null;
  const stamps = uploads.map((u) => u.timestamp).filter(Boolean).sort((a, b) => b - a);
  if (stamps.length >= 4) {
    const gaps = stamps.slice(0, -1).map((t, i) => (t - stamps[i + 1]) / DAY).filter((g) => g > 0);
    const usual = median(gaps);
    if (usual) {
      const due = (stamps[0] + usual * DAY - nowSec) / DAY;
      nextUpload = { usualGapDays: usual, dueInDays: due, approximate: !channel.upload_rhythm?.exact };
    }
  }

  // Life stage: share of its first-year views it has already had
  const share = age >= 365 ? null : views / viewsAt(views, age, 365 - age, aMid);

  return {
    available: true,
    age,
    views,
    exponent: { low: aLow, high: aHigh, fitted, n: fit?.n ?? 0, r2: fit?.r2 ?? null },
    horizons,
    perDay,
    milestones,
    vsTypical,
    rank,
    earnings,
    nextUpload,
    firstYearShare: share,
    curve: { aLow, aHigh, aMid },
  };
}

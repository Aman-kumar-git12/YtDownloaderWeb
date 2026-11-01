// Builds the video insights in the browser, without the Viewlens server.
// YouTube often blocks data-centre servers ("confirm you're not a bot") but not the viewer's own
// browser, so the popup reads the watch page itself and computes the same estimates as the
// backend (Backend/core/insights.py). Keep the two models in sync.

// ─── Earnings model (same numbers as the backend) ───
const CATEGORY_RPM = {
  Music: [0.5, 2.0], Gaming: [1.0, 3.5], Entertainment: [1.0, 3.5], Comedy: [1.0, 3.0],
  "People & Blogs": [1.5, 4.0], "Film & Animation": [1.0, 3.5], Sports: [1.5, 4.0],
  "Pets & Animals": [1.0, 3.0], "Travel & Events": [2.0, 5.0], "Autos & Vehicles": [3.0, 7.0],
  "Howto & Style": [2.0, 5.0], Education: [3.0, 8.0], "Science & Technology": [4.0, 10.0],
  "News & Politics": [2.0, 5.0], "Nonprofits & Activism": [1.0, 3.0],
};
const DEFAULT_RPM = [1.0, 4.0];
const FINANCE_RPM = [6.0, 15.0];
const FINANCE_WORDS = new Set(["invest", "investing", "investment", "stock", "stocks", "crypto", "bitcoin", "trading", "finance",
  "money", "credit", "loan", "insurance", "mortgage", "tax", "taxes", "budget", "income", "wealth",
  "passive", "dividend", "etf", "forex", "business", "realestate", "salary"]);
const SHORTS_RPM = [0.03, 0.1];
const LANGUAGE_FACTOR = {
  en: 0.75, de: 0.85, fr: 0.65, ja: 0.7, ko: 0.6, nl: 0.8, sv: 0.8, no: 0.85, da: 0.85,
  it: 0.5, es: 0.35, pt: 0.3, pl: 0.35, tr: 0.2, ru: 0.15, ar: 0.3, hi: 0.2, bn: 0.12,
  ta: 0.2, te: 0.2, mr: 0.2, ur: 0.12, id: 0.15, vi: 0.12, th: 0.2, tl: 0.15,
};
const MIDROLL_MIN_SECONDS = 8 * 60;
const SHORT_MAX_SECONDS = 180;
const SEGMENT_LABELS = {
  sponsor: "Paid sponsor", selfpromo: "Self-promotion", interaction: "Subscribe reminder", intro: "Intro",
  outro: "Outro / end cards", music_offtopic: "Non-music section", preview: "Preview / recap", filler: "Filler",
};

const now = () => Date.now() / 1000;
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const roundMoney = (v) => (v >= 10000 ? Math.round(v / 100) * 100 : v >= 1000 ? Math.round(v / 10) * 10 : round(v, 2));
const words = (s) => (s.toLowerCase().match(/[a-z]+/g) || []);
const fmt = (n) => String(round(n, 2)).replace(/\.0+$/, "");

// ─── Reading the watch page ───

// Pulls the JSON object assigned after `marker` out of the page's inline scripts
function extractJson(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at + marker.length);
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Every value stored under `key` anywhere inside obj
function findAll(obj, key, out = []) {
  if (Array.isArray(obj)) obj.forEach((v) => findAll(v, key, out));
  else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) out.push(v);
      findAll(v, key, out);
    }
  }
  return out;
}

// "4.55 million subscribers", "4.55M subscribers", "812K" -> number
function parseCount(text) {
  if (!text) return null;
  const m = String(text).replace(/,/g, "").match(/([\d.]+)\s*(thousand|million|billion|[KMB])?/i);
  if (!m) return null;
  const mult = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 }[(m[2] || "").toLowerCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

// Turns the page's data into the same "info" fields yt-dlp gives the backend
export function infoFromHtml(html, pageUrl) {
  const pr = extractJson(html, "ytInitialPlayerResponse =");
  const data = extractJson(html, "ytInitialData =") || {};
  if (!pr?.videoDetails) throw new Error("YouTube didn’t return the video page.");
  const vd = pr.videoDetails;
  const mf = pr.microformat?.playerMicroformatRenderer || {};

  // Likes live in different places depending on the page version; try each
  const likeText = findAll(data, "likeCountIfIndifferentNumber")[0] ?? findAll(data, "likeCount")[0]
    ?? (findAll(data, "accessibilityText").find((t) => /along with [\d,]+ other/.test(t)) || "").match(/along with ([\d,]+)/)?.[1]?.replace(/,/g, "");
  const subsLabel = findAll(data, "subscriberCountText")[0];
  const subscribers = parseCount(subsLabel?.simpleText || subsLabel?.accessibility?.accessibilityData?.label);

  const heatMarkers = findAll(data, "markersList")
    .find((l) => l?.markerType === "MARKER_TYPE_HEATMAP")?.markers || [];
  const heatmap = heatMarkers.map((m) => ({
    start_time: Number(m.startMillis) / 1000,
    end_time: (Number(m.startMillis) + Number(m.durationMillis)) / 1000,
    value: Number(m.intensityScoreNormalized),
  }));

  const duration = Number(vd.lengthSeconds) || 0;
  const chapterStarts = findAll(data, "chapterRenderer").map((c) => ({
    title: c.title?.simpleText || "",
    start_time: Number(c.timeRangeStartMillis) / 1000,
  }));
  const seen = new Set();
  const chapters = chapterStarts
    .filter((c) => !seen.has(c.start_time) && seen.add(c.start_time))
    .sort((a, b) => a.start_time - b.start_time)
    .map((c, i, all) => ({ ...c, end_time: all[i + 1]?.start_time ?? duration }));

  const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const formats = pr.streamingData?.adaptiveFormats || [];
  const videoFormats = formats.filter((f) => f.mimeType?.startsWith("video/"));
  const best = [...videoFormats].sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  const published = Date.parse(mf.publishDate || mf.uploadDate || "");

  return {
    id: vd.videoId,
    title: vd.title,
    channel: vd.author,
    channel_id: vd.channelId,
    channel_url: `https://www.youtube.com/channel/${vd.channelId}`,
    duration,
    view_count: Number(vd.viewCount) || 0,
    like_count: likeText != null && likeText !== "" ? Number(likeText) : null,
    comment_count: null,
    channel_follower_count: subscribers,
    timestamp: Number.isNaN(published) ? null : Math.round(published / 1000),
    upload_date: (mf.publishDate || mf.uploadDate || "").slice(0, 10) || null,
    categories: mf.category ? [mf.category] : [],
    tags: vd.keywords || [],
    description: vd.shortDescription || "",
    heatmap,
    chapters,
    subtitles: tracks.filter((t) => t.kind !== "asr").map((t) => t.languageCode),
    language: tracks.find((t) => t.kind === "asr")?.languageCode || null,
    max_height: best?.height || 0,
    fps: best?.fps || null,
    is_short: pageUrl.includes("/shorts/"),
    unlisted: mf.isUnlisted,
    family_safe: mf.isFamilySafe,
    live: vd.isLiveContent ? (vd.isLive ? "Live now" : "Was live") : "Never Live",
    embeddable: pr.playabilityStatus?.playableInEmbed,
  };
}

// ─── The same calculations as the backend ───

function estimateEarnings(info) {
  const views = info.view_count || 0;
  const duration = info.duration || 0;
  const category = info.categories[0] || null;
  const isShort = Boolean(duration) && (duration <= 60 || (duration <= SHORT_MAX_SECONDS && info.is_short));
  const factors = [];
  let low, high;

  if (isShort) {
    [low, high] = SHORTS_RPM;
    factors.push("Shorts pay from a shared pool, roughly $0.03–$0.10 per 1,000 views");
  } else {
    if (words([info.title, ...info.tags].join(" ")).some((w) => FINANCE_WORDS.has(w))) {
      [low, high] = FINANCE_RPM;
      factors.push("Money/business topic: advertisers pay the most here");
    } else {
      [low, high] = CATEGORY_RPM[category] || DEFAULT_RPM;
      factors.push(`Category “${category || "unknown"}”: about $${fmt(low)}–$${fmt(high)} per 1,000 views for a US audience`);
    }
    const language = (info.language || "").split("-")[0].toLowerCase();
    let f = 0.5;
    if (language in LANGUAGE_FACTOR) {
      f = LANGUAGE_FACTOR[language];
      factors.push(`Spoken language “${language}”: audience worth about ${Math.round(f * 100)}% of a US audience`);
    } else {
      factors.push("Audience country unknown: assumed a mixed worldwide audience");
    }
    low *= f;
    high *= f;
    if (duration >= MIDROLL_MIN_SECONDS) {
      high *= 1.3;
      factors.push("8 minutes or longer, so mid-roll ads are allowed");
    }
    if (category === "Music") factors.push("Music: much of this usually goes to the label and songwriters");
  }

  const subs = info.channel_follower_count;
  const monetizedLikely = !subs || subs >= 1000;
  if (!monetizedLikely) factors.push("Under 1,000 subscribers: the channel probably can’t run ads yet");
  const ageDays = Math.max((now() - (info.timestamp || now())) / 86400, 1);
  return {
    currency: "USD",
    rpm: [round(low, 2), round(high, 2)],
    total: [roundMoney((views / 1000) * low), roundMoney((views / 1000) * high)],
    per_day: [roundMoney((views / ageDays / 1000) * low), roundMoney((views / ageDays / 1000) * high)],
    monetized_likely: monetizedLikely,
    factors,
  };
}

function forecast(info) {
  const views = info.view_count;
  const ts = info.timestamp;
  if (!views || !ts) return null;
  const age = Math.max((now() - ts) / 86400, 0.5);
  const [lowA, highA] = age > 30 ? [0.25, 0.5] : [0.35, 0.65];
  const gain = (a) => views * (((age + 30) / age) ** a - 1);
  return {
    age_days: round(age, 1),
    views_per_day_lifetime: Math.round(views / age),
    next_30_days: [Math.trunc(gain(lowA)), Math.trunc(gain(highA))],
    stage: age < 3 ? "launch" : age < 30 ? "growing" : age < 365 ? "settling" : "long tail",
  };
}

function chapterAt(info, t) {
  return info.chapters.find((c) => c.start_time <= t && t < (c.end_time ?? Infinity))?.title || null;
}

function bestMoments(info, limit = 3) {
  const heatmap = info.heatmap;
  if (heatmap.length < 10) return { available: false, heatmap: [], moments: [] };
  const values = heatmap.map((h) => h.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const skip = Math.max(1, Math.floor(heatmap.length / 33));
  const candidates = [];
  for (let i = skip; i < heatmap.length; i++) {
    const left = values[i - 1];
    const right = i + 1 < values.length ? values[i + 1] : -1;
    if (values[i] >= left && values[i] >= right && values[i] > mean * 1.15) candidates.push(i);
  }
  candidates.sort((a, b) => values[b] - values[a]);
  const picked = [];
  const minGap = Math.max(3, Math.floor(heatmap.length / 12));
  for (const i of candidates) {
    if (picked.every((j) => Math.abs(i - j) >= minGap)) picked.push(i);
    if (picked.length === limit) break;
  }
  const duration = info.duration || heatmap.at(-1).end_time;
  const moments = picked.sort((a, b) => a - b).map((i) => {
    let lo = i, hi = i;
    while (lo > skip && values[lo - 1] > mean * 1.1 && i - lo < 4) lo--;
    while (hi + 1 < values.length && values[hi + 1] > mean * 1.1 && hi - i < 4) hi++;
    return {
      start: round(Math.max(0, heatmap[lo].start_time - 2), 1),
      end: round(Math.min(duration, heatmap[hi].end_time + 2), 1),
      peak: round(heatmap[i].start_time, 1),
      strength: round(values[i] / mean, 1),
      chapter: chapterAt(info, heatmap[i].start_time),
    };
  });
  return {
    available: true,
    heatmap: values.map((v) => round(v, 3)),
    segment_seconds: round(heatmap[0].end_time - heatmap[0].start_time, 2),
    moments,
  };
}

function seoReport(info) {
  const { title, description: desc, tags, duration } = info;
  const titleWords = new Set((title.toLowerCase().match(/\w+/g) || []).filter((w) => w.length > 3));
  const tagWords = new Set(tags.flatMap((t) => t.toLowerCase().match(/\w+/g) || []));
  const hashtags = desc.match(/#\w+/g) || [];
  const maxHeight = info.max_height;
  const checks = [
    ["Title length", title.length >= 20 && title.length <= 70, 15, `${title.length} characters (best: 20–70, so it isn’t cut off)`],
    ["Title isn’t shouting", !(title === title.toUpperCase() && /[A-Z]/.test(title) && title.length > 10), 5, "Mostly lowercase reads as more trustworthy"],
    ["Tags match the title", [...titleWords].some((w) => tagWords.has(w)), 10, tags.length ? `${tags.length} tags` : "No tags found"],
    ["Enough tags", tags.length >= 5, 5, "5 or more helps YouTube understand the topic"],
    ["Detailed description", desc.length >= 250, 15, `${desc.length} characters (aim for 250+)`],
    ["Title words in description", [...titleWords].some((w) => desc.toLowerCase().includes(w)), 10, "Repeating key title words helps search"],
    ["Hashtags", hashtags.length >= 1 && hashtags.length <= 15, 5, `${hashtags.length} hashtags (1–15 is the sweet spot)`],
    ["Chapters", info.chapters.length > 0 || duration < 300, 15, duration >= 300 ? `${info.chapters.length} chapters` : "Short video, chapters not needed"],
    ["Creator-made captions", info.subtitles.length > 0, 10, `${info.subtitles.length} languages`],
    ["HD quality", maxHeight >= 1080, 10, maxHeight ? `Up to ${maxHeight}p` : "Unknown"],
  ];
  const total = checks.reduce((a, c) => a + c[2], 0);
  const score = checks.reduce((a, c) => a + (c[1] ? c[2] : 0), 0);
  return { score: Math.round((score / total) * 100), checks: checks.map(([label, passed, , detail]) => ({ label, passed, detail })) };
}

function engagement(info, dislikes) {
  const views = info.view_count || 0;
  const likes = info.like_count;
  if (!views) return null;
  const likeRate = likes != null ? likes / views : null;
  const result = {
    like_rate: likeRate != null ? round(likeRate * 100, 2) : null,
    comment_rate: null,
    verdict: likeRate == null ? null : likeRate >= 0.06 ? "exceptional" : likeRate >= 0.035 ? "strong" : likeRate >= 0.015 ? "typical" : "low",
  };
  if (dislikes?.dislikes != null && likes) {
    const total = likes + dislikes.dislikes;
    result.dislikes = dislikes.dislikes;
    result.approval = total ? round((likes / total) * 100, 1) : null;
  }
  return result;
}

// ─── Free outside sources (called straight from the browser) ───

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function sponsorSegments(id) {
  try {
    const cats = encodeURIComponent(JSON.stringify(Object.keys(SEGMENT_LABELS)));
    const list = await getJson(`https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=${cats}`);
    return (list || []).map((s) => ({
      category: s.category, label: SEGMENT_LABELS[s.category] || s.category, start: round(s.segment[0], 1), end: round(s.segment[1], 1),
    }));
  } catch {
    return null; // unknown, not "none"
  }
}

async function dislikeEstimate(id) {
  try {
    const d = await getJson(`https://returnyoutubedislikeapi.com/votes?videoId=${id}`);
    return d && { dislikes: d.dislikes, rating: d.rating };
  } catch {
    return null;
  }
}

// ─── Everything for one video, in the shapes the popup already uses ───

export function buildParts(info, segments, dislikes) {
  const earnings = estimateEarnings(info);
  const outlook = forecast(info);
  if (outlook) {
    const [lowRpm, highRpm] = earnings.rpm;
    const [lowViews, highViews] = outlook.next_30_days;
    earnings.next_30_days = [roundMoney((lowViews / 1000) * lowRpm), roundMoney((highViews / 1000) * highRpm)];
  }
  const sponsorSeconds = (segments || []).filter((s) => s.category === "sponsor").reduce((a, s) => a + s.end - s.start, 0);
  if (sponsorSeconds) earnings.sponsorship = [roundMoney((info.view_count / 1000) * 10), roundMoney((info.view_count / 1000) * 30)];

  const video = {
    video_id: info.id,
    title: info.title,
    channel: info.channel,
    channel_url: info.channel_url,
    channel_id: info.channel_id,
    duration_seconds: info.duration,
    published: info.timestamp,
    views: info.view_count,
    earnings,
    forecast: outlook,
    engagement: engagement(info, dislikes),
    moments: bestMoments(info),
    seo: seoReport(info),
    sponsor_segments: segments,
    sponsor_seconds: Math.round(sponsorSeconds),
    technical: {
      max_height: info.max_height || null, fps: info.fps, language: info.language, caption_languages: info.subtitles,
      embeddable: info.embeddable, live: info.live,
    },
    data_api: false,
    from_browser: true,
  };

  const details = {
    title: info.title,
    video_id: info.id,
    channel: info.channel,
    channel_url: info.channel_url,
    subscribers: info.channel_follower_count,
    upload_date: info.upload_date,
    duration_seconds: info.duration,
    views: info.view_count,
    likes: info.like_count,
    comments: null,
    description: info.description,
    chapters: info.chapters.map((c) => ({ title: c.title, start: c.start_time, end: c.end_time })),
    category: info.categories[0] || null,
    max_height: info.max_height || null,
    fps: info.fps,
    language: info.language,
    tags: info.tags,
    privacy: info.unlisted ? "Unlisted" : "Public",
    license: "Not shown",
    age_restricted: info.family_safe === false,
    live_status: info.live,
    subtitles: info.subtitles,
    from_browser: true,
  };
  return { video, details };
}

// One fetch of the watch page per popup, shared by the video, details and comments parts
const pages = new Map();
export function watchPage(videoId) {
  if (!pages.has(videoId)) {
    const p = fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { credentials: "include", signal: AbortSignal.timeout(15000) })
      .then((r) => {
        if (!r.ok) throw new Error(`YouTube answered ${r.status}`);
        return r.text();
      });
    p.catch(() => pages.delete(videoId));
    pages.set(videoId, p);
  }
  return pages.get(videoId);
}

export async function readLocal(videoId, pageUrl) {
  const [html, segments, dislikes] = await Promise.all([watchPage(videoId), sponsorSegments(videoId), dislikeEstimate(videoId)]);
  const info = infoFromHtml(html, pageUrl);
  return { ...buildParts(info, segments, dislikes), info, html };
}

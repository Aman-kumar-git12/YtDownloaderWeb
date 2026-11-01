// Channel, comments and transcript insights built in the browser (see local.js for why).
// Same rules as the backend: Backend/core/channel_report.py, comment_insights.py,
// transcript_insights.py and text_tools.py. Keep them in sync.
import { watchPage } from "./local.js";

// ─── Shared page helpers ───

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

// "4.55 million subscribers", "114K", "1,234 views", "No views" -> number
function parseCount(text) {
  if (text == null) return null;
  if (/^no /i.test(String(text))) return 0;
  const m = String(text).replace(/,/g, "").match(/([\d.]+)\s*(thousand|million|billion|[KMB])?/i);
  if (!m) return null;
  const mult = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 }[(m[2] || "").toLowerCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

// "4 months ago" -> unix seconds (approximate, like the backend's approximate_dates)
const UNIT_SECONDS = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
function agoToTimestamp(text) {
  const m = String(text || "").match(/(\d+)\s*(second|minute|hour|day|week|month|year)/i);
  if (!m) return null;
  return Math.round(Date.now() / 1000 - Number(m[1]) * UNIT_SECONDS[m[2].toLowerCase()]);
}

// "1:02:05" -> 3725
function clockToSeconds(text) {
  if (!/^\d+(:\d{2}){1,2}$/.test(text || "")) return null;
  return text.split(":").reduce((a, p) => a * 60 + Number(p), 0);
}

const median = (values) => {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

async function fetchText(url) {
  const r = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`YouTube answered ${r.status}`);
  return r.text();
}

// ─── Channel ───

const DURATION_BUCKETS = [[0, 300, "Under 5 min"], [300, 900, "5–15 min"], [900, 1800, "15–30 min"], [1800, 1e9, "30+ min"]];
const VERIFIED_BADGES = ["CHECK_CIRCLE_FILLED", "CHECK_CIRCLE_THICK", "AUDIO_BADGE", "OFFICIAL_ARTIST_BADGE"];

function channelVideos(data) {
  return findAll(data, "lockupViewModel").map((l) => {
    const labels = findAll(l.metadata, "accessibilityLabel");
    const parts = findAll(l.metadata, "metadataParts").flat().map((p) => p?.text?.content).filter(Boolean);
    const viewsText = labels.find((t) => /views?$/i.test(t)) || parts.find((t) => /views?$/i.test(t)) || parts[0];
    const agoText = labels.find((t) => /ago$/i.test(t)) || parts.find((t) => /ago$/i.test(t));
    const badge = findAll(l.contentImage, "thumbnailBadgeViewModel").map((b) => b.text).find((t) => clockToSeconds(t) != null);
    return {
      id: l.contentId,
      title: l.metadata?.lockupMetadataViewModel?.title?.content || "",
      views: parseCount(viewsText),
      duration: clockToSeconds(badge),
      timestamp: agoToTimestamp(agoText),
    };
  }).filter((v) => v.id && v.views != null);
}

function shortsViews(data) {
  return findAll(data, "shortsLockupViewModel")
    .map((s) => parseCount((s.accessibilityText || "").match(/([\d.,]+\s*(?:thousand|million|billion)?)\s+views?/i)?.[1]))
    .filter((v) => v != null)
    .slice(0, 15);
}

function uploadRhythm(videos) {
  const stamps = videos.map((v) => v.timestamp).filter(Boolean).sort((a, b) => b - a);
  if (stamps.length < 2) return null;
  const spanDays = Math.max((stamps[0] - stamps.at(-1)) / 86400, 1);
  const daysSince = (Date.now() / 1000 - stamps[0]) / 86400;
  return {
    per_week: round(((stamps.length - 1) / spanDays) * 7, 1),
    days_since_last: round(daysSince, 1),
    consistency: null,
    exact: false,
    status: daysSince < 30 ? "active" : daysSince < 120 ? "slowing down" : "inactive",
  };
}

// info: the video facts from readLocal (channel id, views, upload time)
export async function readChannel(info) {
  if (!info.channel_id) throw new Error("This video doesn’t list its channel.");
  const base = `https://www.youtube.com/channel/${info.channel_id}`;
  const [videosHtml, shortsHtml] = await Promise.all([
    fetchText(`${base}/videos?hl=en`),
    fetchText(`${base}/shorts?hl=en`).catch(() => ""),
  ]);
  const data = extractJson(videosHtml, "ytInitialData =") || {};
  const videos = channelVideos(data).slice(0, 30);
  const shorts = shortsHtml ? shortsViews(extractJson(shortsHtml, "ytInitialData =") || {}) : [];
  const header = findAll(data, "pageHeaderViewModel")[0] || {};
  const subscribers = parseCount(findAll(header, "accessibilityLabel").find((t) => /subscriber/i.test(t))) ?? info.channel_follower_count;
  const verified = findAll(header.title || {}, "imageName").some((n) => VERIFIED_BADGES.includes(n));

  const views = videos.map((v) => v.views);
  const med = median(views);
  const top = [...videos].sort((a, b) => b.views - a.views);
  const breakouts = top.filter((v) => med && v.views >= 3 * med).slice(0, 5).map((v) => ({ ...v, score: round(v.views / med, 1) }));
  const oldest = Math.min(...videos.map((v) => v.timestamp).filter(Boolean));
  const byLength = DURATION_BUCKETS.map(([lo, hi, label]) => {
    const group = videos.filter((v) => v.duration != null && v.duration >= lo && v.duration < hi).map((v) => v.views);
    if (!group.length) return null;
    const m = median(group);
    return { label, videos: group.length, median_views: m, vs_channel: med ? round(m / med, 2) : null };
  }).filter(Boolean);

  const score = info.view_count != null && med ? round(info.view_count / med, 2) : null;
  const oldestTs = Number.isFinite(oldest) ? oldest : null;
  return {
    channel: info.channel,
    channel_url: base,
    verified,
    subscribers,
    recent: {
      count: videos.length,
      median_views: med,
      average_views: views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : null,
      views_per_subscriber: med && subscribers ? round(med / subscribers, 3) : null,
      top: top.slice(0, 3),
      breakouts,
      views: videos.map((v) => ({ id: v.id, views: v.views })),
      // Each upload's views and (approximate) age, for the prediction curve
      uploads: videos.map((v) => ({ id: v.id, views: v.views, timestamp: v.timestamp })),
      oldest_timestamp: oldestTs,
    },
    upload_rhythm: uploadRhythm(videos),
    by_length: byLength,
    shorts_vs_long: { shorts_median_views: median(shorts), long_median_views: med, shorts_sampled: shorts.length },
    best_posting: null,
    profile: null,
    data_api: false,
    from_browser: true,
    this_video: {
      views: info.view_count,
      outlier_score: score,
      label: score == null ? null : score >= 3 ? "breakout" : score >= 1.5 ? "above usual" : score >= 0.67 ? "usual" : "below usual",
      older_than_sample: Boolean(oldestTs && info.timestamp && info.timestamp < oldestTs - 30 * 86400),
    },
  };
}

// ─── Text tools (port of text_tools.py) ───

const WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}\p{N}_'’-]*/gu;
const STOPWORDS = new Set(`a about above after again against all also am an and any are aren't as at be because been before being below
between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few
for from further get got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself
him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's like me more most
mustn't my myself no nor not now of off on once only or other ought our ours ourselves out over own really same
shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then
there there's these they they'd they'll they're they've this those through to too under until up very was wasn't
we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's
will with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves yeah yes okay ok oh
gonna wanna gotta one two also even still much many well back know think going go make made way thing things
want see look right say said time people really actually video videos guys hey lol im dont thats ive youre
something anything everything every always never ever thank thanks please let us`.split(/\s+/));
const POSITIVE = new Set(`love loved loving lovely awesome amazing great good best better beautiful brilliant cool excellent fantastic
favorite favourite fun funny glad happy helpful incredible inspiring legend legendary masterpiece nice perfect
recommend respect super thank thanks useful wonderful wow goat fire underrated informative clear enjoyed enjoy
appreciate appreciated hilarious genius blessed proud gem banger classic iconic epic`.split(/\s+/));
const NEGATIVE = new Set(`awful bad boring clickbait cringe disappointed disappointing dislike fake hate hated horrible annoying lame
misleading poor sad scam stupid terrible trash waste worst wrong ugly useless overrated unsubscribe unsubscribed
garbage pathetic rubbish broken confusing lies liar`.split(/\s+/));
const POSITIVE_EMOJI = new Set([..."❤😍🥰😂🤣🔥👏👍💯🙌😊🥳💖💕✨🫶😁😄"]);
const NEGATIVE_EMOJI = new Set([..."👎😡🤮😒😤💩😢😭🙄"]);
const NEGATORS = new Set(["not", "no", "never", "dont", "don't", "isn't", "wasn't", "didn't", "nothing"]);
const SCRIPTS = [
  ["hi", /[ऀ-ॿ]/g], ["bn", /[ঀ-৿]/g], ["ta", /[஀-௿]/g], ["te", /[ఀ-౿]/g],
  ["ar", /[؀-ۿ]/g], ["ru", /[Ѐ-ӿ]/g], ["ja", /[぀-ヿ]/g], ["ko", /[가-힯]/g],
  ["zh", /[一-鿿]/g], ["th", /[฀-๿]/g], ["el", /[Ͱ-Ͽ]/g], ["he", /[֐-׿]/g],
];
const LATIN_MARKERS = {
  en: "the and is you this that it was for are with have just what so",
  es: "que el la los las es por para con una muy pero esto como más",
  pt: "que não muito uma com isso está você para mais é eu meu",
  fr: "le la les est et une pour pas que c'est très des je vous",
  de: "und ich das ist nicht die der es ein sehr auch mit",
  it: "che di non il è la per una sono molto questo anche",
  id: "yang dan ini itu tidak aku saya ada dengan bang banget juga",
  tr: "bir ve bu çok için ama ne da de gibi var",
  vi: "của là và có không này một những được người",
  tl: "ang ng mga sa po naman talaga ito ako ko",
  "hi-latn": "hai bhai nahi kya bhi aur yaar hain mein kuch sir bahut accha",
};
const LANGUAGE_NAMES = {
  en: "English", es: "Spanish", pt: "Portuguese", fr: "French", de: "German", it: "Italian", id: "Indonesian",
  tr: "Turkish", vi: "Vietnamese", tl: "Filipino", hi: "Hindi", "hi-latn": "Hindi (in English letters)", bn: "Bengali",
  ta: "Tamil", te: "Telugu", ar: "Arabic / Urdu", ru: "Russian / Cyrillic", ja: "Japanese", ko: "Korean", zh: "Chinese",
  th: "Thai", el: "Greek", he: "Hebrew",
};
const LANGUAGE_COUNTRIES = {
  en: ["United States", "India", "United Kingdom", "Philippines", "Canada"], es: ["Mexico", "Spain", "Argentina", "Colombia", "United States"],
  pt: ["Brazil", "Portugal"], fr: ["France", "Canada", "Belgium", "Morocco"], de: ["Germany", "Austria", "Switzerland"], it: ["Italy"],
  id: ["Indonesia"], tr: ["Turkey"], vi: ["Vietnam"], tl: ["Philippines"], hi: ["India"], "hi-latn": ["India", "Pakistan"],
  bn: ["Bangladesh", "India"], ta: ["India", "Sri Lanka"], te: ["India"], ar: ["Egypt", "Saudi Arabia", "Pakistan", "Iraq"],
  ru: ["Russia", "Ukraine", "Kazakhstan"], ja: ["Japan"], ko: ["South Korea"], zh: ["Taiwan", "Hong Kong", "Singapore"],
  th: ["Thailand"], el: ["Greece"], he: ["Israel"],
};

const words = (text) => (String(text || "").match(WORD_RE) || []).map((w) => w.toLowerCase().replace(/^['’-]+|['’-]+$/g, ""));

function topKeywords(texts, limit = 12, exclude = []) {
  const ex = new Set(exclude.map((w) => w.toLowerCase()));
  const counts = new Map();
  for (const text of texts) {
    for (const w of new Set(words(text).filter((w) => w.length > 3 && !STOPWORDS.has(w) && !ex.has(w)))) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .filter(([, c]) => c > 1 || texts.length === 1).map(([word, count]) => ({ word, count }));
}

function sentiment(text) {
  const tokens = words(text);
  let score = 0;
  tokens.forEach((w, i) => {
    let polarity = POSITIVE.has(w) ? 1 : NEGATIVE.has(w) ? -1 : 0;
    if (polarity && i && NEGATORS.has(tokens[i - 1])) polarity = -polarity;
    score += polarity;
  });
  for (const ch of String(text || "")) {
    if (POSITIVE_EMOJI.has(ch)) score++;
    if (NEGATIVE_EMOJI.has(ch)) score--;
  }
  return score > 0 ? 1 : score < 0 ? -1 : 0;
}

function detectLanguage(text) {
  if (!text) return null;
  for (const [code, re] of SCRIPTS) if ((text.match(re) || []).length >= 2) return code;
  const tokens = new Set(words(text));
  if (!tokens.size) return null;
  let best = null, bestHits = 0;
  for (const [code, markers] of Object.entries(LATIN_MARKERS)) {
    const hits = markers.split(" ").filter((m) => tokens.has(m)).length;
    if (hits > bestHits) [best, bestHits] = [code, hits];
  }
  return bestHits >= 1 ? best : null;
}

const short = (text, limit = 220) => {
  const t = String(text).split(/\s+/).join(" ").trim();
  return t.length <= limit ? t : `${t.slice(0, limit - 1).trimEnd()}…`;
};

// ─── Comments ───

const MAX_COMMENTS = 150;

function commentsFromResponse(r) {
  const pinnedKeys = new Set(findAll(r, "commentViewModel")
    .filter((v) => v && typeof v === "object" && findAll(v, "pinnedText").length)
    .map((v) => v.commentKey).filter(Boolean));
  return findAll(r, "commentEntityPayload").map((p) => ({
    text: p.properties?.content?.content || "",
    likes: parseCount(p.toolbar?.likeCountNotliked) || 0,
    author: p.author?.displayName || null,
    is_creator: Boolean(p.author?.isCreator),
    is_pinned: pinnedKeys.has(p.key),
    is_reply: (p.properties?.replyLevel || 0) > 0,
  })).filter((c) => c.text && !c.is_reply);
}

function nextToken(r) {
  const eps = [...(r.onResponseReceivedEndpoints || [])].reverse();
  for (const e of eps) {
    const items = (e.reloadContinuationItemsCommand || e.appendContinuationItemsAction)?.continuationItems || [];
    const last = items.at(-1)?.continuationItemRenderer;
    const token = last && findAll(last, "token")[0];
    if (token) return token;
  }
  return null;
}

export async function readComments(videoId, title) {
  const html = await watchPage(videoId);
  const data = extractJson(html, "ytInitialData =") || {};
  const context = extractJson(html, '"INNERTUBE_CONTEXT":');
  const section = findAll(data, "itemSectionRenderer").find((s) => s.sectionIdentifier === "comment-item-section");
  let token = section && findAll(section, "token")[0];
  if (!token || !context) return { sampled: 0, total: null, from_browser: true };

  const comments = [];
  let total = null;
  for (let page = 0; page < 8 && token && comments.length < MAX_COMMENTS; page++) {
    const r = await fetch("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, continuation: token }),
      signal: AbortSignal.timeout(15000),
    }).then((res) => (res.ok ? res.json() : Promise.reject(new Error(`YouTube answered ${res.status}`))));
    if (total == null) {
      const count = findAll(r, "countText")[0];
      total = parseCount((count?.runs || []).map((x) => x.text).join("") || count?.simpleText);
    }
    comments.push(...commentsFromResponse(r));
    token = nextToken(r);
  }
  return { ...analyseComments(comments.slice(0, MAX_COMMENTS), title), total, from_browser: true };
}

function analyseComments(comments, title) {
  if (!comments.length) return { sampled: 0 };
  const n = comments.length;
  const moods = { 1: 0, 0: 0, "-1": 0 };
  comments.forEach((c) => moods[sentiment(c.text)]++);
  const questions = comments.filter((c) => c.text.includes("?") && !c.is_creator).sort((a, b) => b.likes - a.likes).slice(0, 5);
  const langCounts = new Map();
  for (const c of comments) {
    const l = detectLanguage(c.text);
    if (l) langCounts.set(l, (langCounts.get(l) || 0) + 1);
  }
  const detected = [...langCounts.values()].reduce((a, b) => a + b, 0);
  const pick = (c) => (c ? { text: short(c.text), likes: c.likes, author: c.author } : null);
  return {
    sampled: n,
    mood: { positive: Math.round((moods[1] / n) * 100), neutral: Math.round((moods[0] / n) * 100), negative: Math.round((moods[-1] / n) * 100) },
    questions: questions.map((c) => ({ text: short(c.text), likes: c.likes })),
    keywords: topKeywords(comments.map((c) => c.text), 12, (title || "").split(/\s+/)),
    top_comment: pick([...comments].sort((a, b) => b.likes - a.likes)[0]),
    pinned: pick(comments.find((c) => c.is_pinned)),
    creator_replies: comments.filter((c) => c.is_creator).length,
    languages: detected
      ? [...langCounts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([code, count]) => ({
          code, name: LANGUAGE_NAMES[code] || code, share: Math.round((count / detected) * 100), likely_countries: LANGUAGE_COUNTRIES[code] || [],
        }))
      : [],
  };
}

// ─── Transcript (from YouTube's own "Show transcript" panel, when the viewer has it open) ───

// Runs inside the YouTube page: reads the transcript panel the viewer opened
export function pageTranscript() {
  const rows = [...document.querySelectorAll("ytd-transcript-segment-renderer")];
  return rows.map((r) => ({
    time: r.querySelector(".segment-timestamp")?.textContent?.trim() || "",
    text: r.querySelector(".segment-text")?.textContent?.trim() || "",
  })).filter((r) => r.text);
}

export function analyseTranscript(rows, info) {
  const lines = rows.map((r, i) => {
    const start = clockToSeconds(r.time) ?? 0;
    const next = rows[i + 1] ? clockToSeconds(rows[i + 1].time) : null;
    return [start, next ?? Math.min(start + 5, info.duration || start + 5), r.text];
  });
  const wordList = words(lines.map((l) => l[2]).join(" "));
  const duration = info.duration || lines.at(-1)[1];
  let speech = 0, curStart = null, curEnd = null;
  for (const [start, end] of [...lines].sort((a, b) => a[0] - b[0])) {
    if (curEnd == null || start > curEnd) {
      if (curEnd != null) speech += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    } else curEnd = Math.max(curEnd, end);
  }
  if (curEnd != null) speech += curEnd - curStart;
  if (duration) speech = Math.min(speech, duration);
  const wpm = speech > 30 ? Math.round(wordList.length / (speech / 60)) : null;
  const isMusic = (info.categories || []).includes("Music");
  const hook = isMusic ? "" : lines.filter(([s]) => s < 30).map((l) => l[2]).join(" ");
  const firstMinute = new Set(words(lines.filter(([s]) => s < 60).map((l) => l[2]).join(" ")));
  const titleWords = words(info.title).filter((w) => w.length > 3);
  return {
    available: true,
    source: "transcript panel",
    word_count: wordList.length,
    words_per_minute: wpm,
    pace: wpm == null ? null : wpm < 110 ? "slow" : wpm < 140 ? "relaxed" : wpm < 170 ? "conversational" : "fast",
    speech_share: duration ? Math.round((speech / duration) * 100) : null,
    keywords: topKeywords(lines.map((l) => l[2]), 15),
    hook: hook.slice(0, 600),
    title_words_in_first_minute: { found: titleWords.filter((w) => firstMinute.has(w)), total: titleWords.length },
    reading_minutes: round(wordList.length / 238, 1),
    from_browser: true,
  };
}

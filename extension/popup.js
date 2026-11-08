import { DEPLOYED_API, WEBSITE } from "./config.js";
import { buildHighlights } from "./lib/highlights.js";
import { readLocal } from "./lib/local.js";
import { buildPredictions } from "./lib/predict.js";
import { analyseTranscript, pageTranscript, readChannel, readComments } from "./lib/local-more.js";

const app = document.getElementById("app");
const VIDEO_URL = /^https:\/\/(www\.|m\.)?youtube\.com\/(watch\?|shorts\/)|^https:\/\/youtu\.be\//;

// ─── Small helpers ───

// Build DOM safely (all text goes through text nodes)
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "style") Object.assign(el.style, value);
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === "") continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(attrs, ...paths) {
  const el = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const p of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    for (const [k, v] of Object.entries(typeof p === "string" ? { d: p } : p)) path.setAttribute(k, v);
    el.append(path);
  }
  return el;
}

const ICONS = {
  trend: ["M22 7 13.5 15.5l-5-5L2 17", "M16 7h6v6"],
  alert: ["M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z", "M12 9v4", "M12 17h.01"],
  info: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z", "M12 16v-4", "M12 8h.01"],
  play: [{ d: "M7 4.5v15l12-7.5-12-7.5Z", fill: "currentColor" }],
  refresh: ["M21 12a9 9 0 1 1-2.6-6.4L21 8", "M21 3v5h-5"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
  check: ["M20 6 9 17l-5-5"],
  download: ["M12 4v11", "m7 10 5 5 5-5", "M5 20h14"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  volume: ["M11 5 6 9H2v6h4l5 4V5Z", "M15.5 8.5a5 5 0 0 1 0 7", "M19 5a10 10 0 0 1 0 14"],
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  skip: ["M5 4l10 8-10 8V4Z", "M19 5v14"],
  image: ["M3 5h18v14H3z", "m3 16 5-5 4 4 3-3 6 6", "M15.5 8.5h.01"],
  dollar: ["M12 2v20", "M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  calendar: ["M3 5h18v16H3z", "M3 10h18", "M8 3v4", "M16 3v4"],
  layers: ["m12 3 9 5-9 5-9-5 9-5Z", "m3 13 9 5 9-5"],
  film: ["M3 4h18v16H3z", "M7 4v16", "M17 4v16", "M3 9h4", "M3 15h4", "M17 9h4", "M17 15h4"],
  music: ["M9 18V5l12-2v13", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  file: ["M14 3H6v18h12V7l-4-4Z", "M14 3v4h4"],
  heart: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  chat: ["M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12Z"],
  pin: ["M12 17v5", "M9 3h6l-1 6 4 4H6l4-4-1-6Z"],
  tag: ["M20 12 12 20l-9-9V3h8l9 9Z", "M7.5 7.5h.01"],
  spark: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z", "M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 15Z"],
  flag: ["M5 21V4", "M5 4h11l-2 4 2 4H5"],
};
const icon = (name, label) =>
  svg({ class: "icon", viewBox: "0 0 24 24", ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" }) }, ...ICONS[name]);

const compact = (n) => (n == null ? "Hidden" : new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n));
const money = (n) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
const range = ([a, b], fmt = money) => `${fmt(a)} – ${fmt(b)}`;
const full = (n) => (n == null ? "Hidden" : n.toLocaleString());
const clock = (s) => {
  s = Math.floor(s);
  const hours = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return hours ? `${hours}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const timesFmt = (x) => `${x >= 10 ? Math.round(x).toLocaleString() : x}×`;
const row = (label, value) => h("div", { class: "row" }, h("span", {}, label), h("span", {}, value));

function ago(seconds) {
  if (!seconds) return "";
  const days = (Date.now() / 1000 - seconds) / 86400;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (days < 1) return "today";
  if (days < 30) return rtf.format(-Math.round(days), "day");
  if (days < 365) return rtf.format(-Math.round(days / 30), "month");
  return rtf.format(-Math.round(days / 365), "year");
}

function languageName(code) {
  try {
    return new Intl.DisplayNames(undefined, { type: "language" }).of(code);
  } catch {
    return code;
  }
}

function videoIdFrom(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1, 12);
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

// ─── Server ───

const API_BASE = DEPLOYED_API;

// "awake" if /health answers within 3 s, otherwise "asleep" (the free server is starting up).
// serverAwake flips to true once /health finally answers, so the popup can say the server is up.
let serverAwake = false;
let serverStatus = Promise.resolve("awake");

function checkServer() {
  const health = fetch(`${API_BASE}/health`, { cache: "no-store" })
    .then((r) => { serverAwake = r.ok; })
    .catch(() => {});
  const slow = new Promise((resolve) => setTimeout(() => resolve("asleep"), 3000));
  serverStatus = Promise.race([health.then(() => "awake"), slow]);
}

// ─── Data: each part is fetched once and shared by every card that uses it ───

async function get(path, url) {
  let response;
  try {
    // The free server can take ~50 s to wake up; give up after 90 s instead of waiting forever
    response = await fetch(`${API_BASE}${path}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(90000) });
  } catch (err) {
    throw new Error(err.name === "TimeoutError" ? "The server took too long. Try again." : "Can't reach the server. Check your connection.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(response.status === 429 ? "Too many lookups. Wait a minute and try again." : body.detail || "Couldn't analyse this video.");
  }
  return body.data;
}

const parts = {};
const partData = {};
const failed = new Set();
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());
let currentUrl = "";

// Cards wait here until the staged loader starts their part
const waiting = {};
function waitFor(name) {
  if (parts[name]) return parts[name];
  waiting[name] ??= Promise.withResolvers();
  return waiting[name].promise;
}

// Parts that don't come from the server (e.g. "page", read from the YouTube tab itself)
const sources = {};

function loadPart(name, retry = false) {
  if (!parts[name] || retry) {
    const path = { video: "/api/insights", details: "/api/metadata" }[name] || `/api/insights/${name}`;
    failed.delete(name);
    parts[name] = (sources[name] ? sources[name]() : get(path, currentUrl)).then((data) => {
      partData[name] = data;
      changed();
      return data;
    });
    parts[name].catch(() => {
      failed.add(name);
      changed();
    });
    waiting[name]?.resolve(parts[name]);
    delete waiting[name];
  }
  return parts[name];
}

// ─── Building blocks ───

const SOURCE_LABELS = { real: "Real data", estimate: "Estimate", mixed: "Real + estimates" };

// A card that shows a skeleton, then its content (or an error with a retry button)
function card(title, part, render, source = "real") {
  const head = () => h("div", { class: "card-head" }, h("h2", {}, title), h("span", { class: `source source-${source}` }, SOURCE_LABELS[source]));
  const skeleton = () => [h("div", { class: "skeleton tall" }), h("div", { class: "skeleton" }), h("div", { class: "skeleton short" })];
  const el = h("section", { class: "card" }, head(), skeleton());
  const run = (retry) =>
    (retry ? loadPart(part, true) : waitFor(part))
      .then((data) => {
        el.replaceChildren(head());
        append(el, [render(data)]);
      })
      .catch((err) =>
        el.replaceChildren(
          head(),
          h("div", { class: "error" },
            h("p", {}, err.message),
            h("button", { class: "button", onclick: () => { el.replaceChildren(head(), skeleton()); run(true); } }, icon("refresh"), "Try again"))
        )
      );
  run(false);
  return el;
}

async function seek(tabId, seconds) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (t) => {
      const video = document.querySelector("video");
      if (video) {
        video.currentTime = t;
        video.play();
      }
    },
    args: [seconds],
  });
}

// ─── Top of the popup: thumbnail, title and key numbers ───

function heroCard(videoId) {
  const thumb = h("div", { class: "thumb" },
    videoId && h("img", { src: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, alt: "" }));
  const text = h("div", { class: "hero-text" }, h("div", { class: "skeleton" }), h("div", { class: "skeleton short" }));
  const el = h("section", { class: "hero" }, thumb, text);

  // Render's free server sleeps. Only say "waking up" when the health check itself is slow
  // (a sleeping server), not when an awake server is just taking a few seconds on a video.
  let wakeTimer;
  serverStatus.then((status) => {
    if (status !== "asleep" || partData.video || failed.has("video")) return;
    const started = Date.now();
    const message = h("span", {}, "Waking up the server, this can take up to a minute…");
    text.replaceChildren(h("div", { class: "skeleton" }), h("p", { class: "waking" }, h("span", { class: "pulse" }), message));
    wakeTimer = setInterval(() => {
      if (partData.video || failed.has("video")) return clearInterval(wakeTimer);
      const seconds = Math.round((Date.now() - started) / 1000) + 3;
      message.textContent = serverAwake
        ? "Server is up, analysing the video…"
        : `Waking up the server, this can take up to a minute… ${seconds}s`;
    }, 1000);
  });

  const render = () => {
    const d = partData.video;
    if (!d) {
      if (failed.has("video")) text.replaceChildren(h("p", { class: "muted" }, "Couldn’t load this video."));
      return;
    }
    clearInterval(wakeTimer);
    if (d.duration_seconds && !thumb.querySelector(".duration")) {
      thumb.append(h("span", { class: "duration num" }, clock(d.duration_seconds)));
    }
    text.replaceChildren(
      h("h1", { title: d.title }, d.title),
      h("p", { class: "muted small" }, d.channel),
      h("p", { class: "muted small num" }, [compact(d.views), " views", d.published ? ` · ${ago(d.published)}` : ""])
    );
  };
  listeners.add(render);
  return el;
}

function kpiStrip() {
  const cell = (label) => {
    const value = h("strong", {});
    const el = h("div", { class: "kpi" }, h("span", { class: "bar" }), h("span", {}, label));
    return { el, value, label };
  };
  const cells = [cell("earned, estimated"), cell("vs channel’s usual"), cell("like rate")];
  const el = h("section", { class: "kpis", "aria-label": "Key numbers" }, cells.map((c) => c.el));

  // tone adds a small coloured dot plus a word, so the verdict isn't colour-only
  const fill = (c, text, title, tone, word) => {
    c.el.className = `kpi${tone ? ` kpi-${tone}` : ""}`;
    c.el.replaceChildren(
      h("strong", { title: title || text }, text),
      h("span", {}, word && h("i", { class: "dot", "aria-hidden": "true" }), word ? `${word} · ${c.label}` : c.label)
    );
  };
  const render = () => {
    const v = partData.video;
    const ch = partData.channel;
    if (v) {
      const [low, high] = v.earnings.total;
      fill(cells[0], `${money(low)}–${money(high).replace(/^\$/, "")}`, range(v.earnings.total));
      const verdict = v.engagement?.verdict;
      const likeTone = verdict === "low" ? "warn" : verdict === "strong" || verdict === "exceptional" ? "good" : null;
      fill(cells[2], v.engagement?.like_rate != null ? `${v.engagement.like_rate}%` : "Hidden", null, likeTone, likeTone && verdict);
    } else if (failed.has("video")) {
      fill(cells[0], "—");
      fill(cells[2], "—");
    }
    const score = ch?.this_video?.outlier_score;
    if (score != null) {
      const tone = score >= 1.5 ? "good" : score < 0.67 ? "warn" : null;
      fill(cells[1], timesFmt(score), null, tone, score >= 3 ? "breakout" : score >= 1.5 ? "above" : score < 0.67 ? "below" : null);
    }
    else if (ch || failed.has("channel")) fill(cells[1], "—");
  };
  listeners.add(render);
  return el;
}

// ─── Analytics tab ───

const TONE = {
  good: { icon: "trend", label: "Good sign" },
  warn: { icon: "alert", label: "Watch out" },
  info: { icon: "info", label: "Worth knowing" },
};

function highlightsCard(tabId) {
  const el = h("section", { class: "card highlights" });
  const render = () => {
    const items = buildHighlights(partData).slice(0, 4);
    const loading = ["video", "channel", "comments", "transcript"].some((p) => !(p in partData) && !failed.has(p));
    el.replaceChildren();
    append(el, [
      h("div", { class: "card-head" },
        h("h2", {}, "What stands out"),
        loading && h("span", { class: "reading" }, h("span", { class: "pulse" }), "Still reading")),
      items.length
        ? items.map((item) =>
            h("div", { class: `hl hl-${item.tone}` },
              h("span", { class: "hl-icon" }, icon(TONE[item.tone].icon, TONE[item.tone].label)),
              h("div", { class: "hl-body" },
                h("strong", {}, item.title),
                item.detail && h("span", { class: "muted small" }, item.detail),
                item.action && h("button", { class: "button", onclick: () => seek(tabId, item.action.start) }, icon("play"), "Jump to it"))))
        : loading
          ? [h("div", { class: "skeleton" }), h("div", { class: "skeleton short" })]
          : h("p", { class: "muted" }, "Nothing unusual; this video is performing as expected."),
    ]);
  };
  listeners.add(render);
  render();
  return el;
}

// The "most replayed" graph with the best moments circled in pencil
function replayChart(heatmap, duration, moments) {
  const W = 360, H = 74, n = heatmap.length;
  const mean = heatmap.reduce((a, b) => a + b, 0) / n;
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => H - 3 - v * (H - 10);
  const line = heatmap.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const chart = svg({ viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" },
    { d: `M0 ${y(mean)} H${W}`, class: "mean" },
    { d: `${line} L${W} ${H} L0 ${H} Z`, class: "area" },
    { d: line, class: "line" });
  const peaks = moments.map((m, i) => {
    const idx = Math.min(Math.round((m.peak / duration) * (n - 1)), n - 1);
    const ring = svg({ viewBox: "0 0 40 40" }, { d: "M8 21c-1-8 7-14 15-12s11 9 8 15-11 8-17 5c-4-2-6-5-6-9", style: `animation-delay:${0.15 + i * 0.2}s` });
    return h("span", { class: "peak", style: { left: `${(m.peak / duration) * 100}%`, top: `${(y(heatmap[idx]) / H) * 100}%` } }, ring, h("b", {}, i + 1));
  });
  const cursor = h("span", { class: "replay-cursor", hidden: "" });
  const tip = h("span", { class: "replay-tip num", hidden: "" });
  const box = h("div", { class: "replay", role: "img", "aria-label": `Replay graph; most replayed at ${moments.map((m) => clock(m.peak)).join(", ")}` }, chart, peaks, cursor, tip);
  box.addEventListener("pointermove", (e) => {
    const r = box.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    const i = Math.round(ratio * (n - 1));
    cursor.hidden = tip.hidden = false;
    cursor.style.left = tip.style.left = `${ratio * 100}%`;
    tip.classList.toggle("is-left", ratio > 0.6);
    tip.textContent = `${clock(ratio * duration)} · ${(heatmap[i] / mean).toFixed(1)}× replays`;
  });
  box.addEventListener("pointerleave", () => (cursor.hidden = tip.hidden = true));
  return [
    box,
    h("div", { class: "axis num" }, h("span", {}, "0:00"), h("span", {}, clock(duration / 2)), h("span", {}, clock(duration))),
  ];
}

// One dot per recent upload, placed by views (log scale); this video circled in pencil
function dotPlot(list, thisVideo, median, thisId) {
  const W = 360, H = 46, PAD = 8;
  const values = list.map((v) => v.views).concat(thisVideo.views ?? []).filter((v) => v > 0);
  const lo = Math.log10(Math.min(...values)), hi = Math.log10(Math.max(...values));
  const x = (v) => PAD + ((Math.log10(Math.max(v, 1)) - lo) / (hi - lo || 1)) * (W - PAD * 2);
  const dots = list.filter((v) => v.id !== thisId && v.views > 0).map((v, i) => ({
    d: `M${x(v.views)} ${H / 2 + ((i % 3) - 1) * 7}h.01`, class: "dp-dot",
  }));
  const marks = [{ d: `M${x(median)} 4V${H - 4}`, class: "dp-median" }, ...dots];
  const tx = thisVideo.views ? x(thisVideo.views) : null;
  if (tx != null) {
    marks.push({ d: `M${tx} ${H / 2}h.01`, class: "dp-this" });
    marks.push({ d: `M${tx - 9} ${H / 2 + 1}c0-6 5-10 10-9s9 5 8 10-6 8-11 7c-4-1-7-4-7-8`, class: "dp-ring" });
  }
  return [
    h("div", { class: "dotplot", role: "img", "aria-label": `This video has ${compact(thisVideo.views)} views; the channel's recent uploads range from ${compact(10 ** lo)} to ${compact(10 ** hi)}, median ${compact(median)}.` },
      svg({ viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" }, ...marks)),
    h("div", { class: "dp-legend small" },
      h("span", {}, h("i", { class: "dp-key-dot" }), "recent uploads"),
      h("span", {}, h("i", { class: "dp-key-line" }), "usual"),
      h("span", {}, h("i", { class: "dp-key-ring" }), "this video")),
  ];
}

// Like rate on a scale with the normal range shaded
function likeGauge(rate, verdict) {
  const max = Math.max(6, rate * 1.15);
  const pct = (v) => `${Math.min((v / max) * 100, 100)}%`;
  return h("div", { class: "gauge" },
    h("div", { class: "gauge-top" }, h("span", { class: "muted" }, "Like rate"), h("strong", { class: "num" }, `${rate}% · ${verdict}`)),
    h("div", { class: "gauge-track", role: "img", "aria-label": `Like rate ${rate}%; most videos get 1.5% to 3.5%` },
      h("span", { class: "gauge-band", style: { left: pct(1.5), width: `calc(${pct(3.5)} - ${pct(1.5)})` } }),
      h("span", { class: `gauge-marker gauge-${verdict}`, style: { left: pct(rate) } })),
    h("div", { class: "gauge-scale small num" }, h("span", {}, "0%"), h("span", { style: { left: pct(2.5) } }, "typical"), h("span", {}, `${Math.round(max)}%`)));
}

// Score ring plus the most useful fixes
function seoScore(seo) {
  const C = 2 * Math.PI * 22;
  const tone = seo.score >= 80 ? "good" : seo.score < 55 ? "warn" : "mid";
  const failed = seo.checks.filter((c) => !c.passed);
  return [
    h("div", { class: "seo" },
      h("div", { class: `ring-score ring-${tone}` },
        svg({ viewBox: "0 0 56 56", "aria-hidden": "true" },
          { d: "M28 6a22 22 0 1 1 0 44 22 22 0 0 1 0-44", class: "ring-bg" },
          { d: "M28 6a22 22 0 1 1 0 44 22 22 0 0 1 0-44", class: "ring-fg", style: `stroke-dasharray:${C};stroke-dashoffset:${C * (1 - seo.score / 100)}` }),
        h("strong", { class: "num" }, seo.score)),
      h("div", {},
        h("strong", {}, seo.score >= 80 ? "Well set up for search" : seo.score >= 55 ? "Decent, with room to improve" : "Hard to find in search"),
        h("p", { class: "muted small" }, `${seo.checks.length - failed.length} of ${seo.checks.length} checks passed`))),
    failed.slice(0, 3).map((c) => h("div", { class: "fix" }, icon("alert"), h("span", {}, h("strong", {}, c.label), h("span", { class: "muted" }, ` · ${c.detail}`)))),
  ];
}

function analyticsPanel(tabId) {
  return h("div", { class: "panel", id: "panel-analytics", role: "tabpanel", "aria-labelledby": "tab-analytics" },
    highlightsCard(tabId),

    card("Most replayed moments", "video", (d) => {
      if (!d.moments.available) return h("p", { class: "muted" }, "YouTube hasn’t made a replay graph for this video yet.");
      return [
        replayChart(d.moments.heatmap, d.duration_seconds, d.moments.moments),
        d.moments.moments.map((m, i) =>
          h("button", { class: "moment", onclick: () => seek(tabId, m.start), title: "Jump to this moment" },
            h("span", { class: "ring" }, i + 1),
            h("span", { class: "moment-time" }, clock(m.start)),
            h("span", { class: "muted small" }, `${m.strength}× replays${m.chapter ? ` · ${m.chapter}` : ""}`),
            h("span", { class: "play" }, icon("play")))),
      ];
    }),

    card("Estimated earnings", "video", (d) => [
      h("p", { class: "big" }, range(d.earnings.total)),
      h("p", { class: "big-sub" }, `from ${compact(d.views)} views`),
      row("Per 1,000 views", range(d.earnings.rpm)),
      d.earnings.next_30_days && row("Next 30 days", range(d.earnings.next_30_days)),
      d.earnings.sponsorship && row("Sponsor deal", range(d.earnings.sponsorship)),
      h("p", { class: "note" }, "Only the channel owner can see real earnings."),
    ], "estimate"),

    card("Compared with the channel", "channel", (d) => [
      d.this_video.outlier_score != null && h("p", { class: "big" }, timesFmt(d.this_video.outlier_score)),
      h("p", { class: "big-sub" }, `vs a median of ${compact(d.recent.median_views)} views on the last ${d.recent.count} uploads`),
      d.recent.views?.length > 2 && dotPlot(d.recent.views, d.this_video, d.recent.median_views, partData.video?.video_id),
      row("Subscribers", compact(d.subscribers)),
      d.upload_rhythm && row("Uploads", `${d.upload_rhythm.per_week} a week`),
      d.recent.views_per_subscriber != null && row("Typical reach", `${(d.recent.views_per_subscriber * 100).toFixed(1)}% of subs`),
      d.profile && row("Channel created", d.profile.created),
      d.profile?.country && row("Country", d.profile.country),
    ]),

    card("Engagement", "video", (d) => [
      d.engagement?.like_rate != null && likeGauge(d.engagement.like_rate, d.engagement.verdict),
      d.engagement?.approval != null && row("Approval", `${d.engagement.approval}%`),
      d.forecast && row("Next 30 days", `${range(d.forecast.next_30_days, compact)} views`),
    ], "mixed"),

    card("Search readiness", "video", (d) => seoScore(d.seo)),

    card("What viewers are saying", "comments", (d) => {
      if (!d.sampled) return h("p", { class: "muted" }, "No comments to read.");
      const { positive, neutral, negative } = d.mood;
      return [
        h("div", { class: "mood", role: "img", "aria-label": `${positive}% positive, ${neutral}% neutral, ${negative}% negative` },
          h("span", { class: "pos", style: { flexGrow: positive } }),
          h("span", { class: "neu", style: { flexGrow: neutral } }),
          h("span", { class: "neg", style: { flexGrow: negative } })),
        h("p", { class: "legend num" },
          h("span", {}, h("i", { class: "pos" }), `${positive}% positive`),
          h("span", {}, h("i", { class: "neu" }), `${neutral}% neutral`),
          h("span", {}, h("i", { class: "neg" }), `${negative}% negative`)),
        d.top_comment && h("blockquote", { class: "quote" }, d.top_comment.text, h("small", { class: "num" }, `${compact(d.top_comment.likes)} likes`)),
        d.questions?.length > 0 && [
          h("h3", {}, "Viewers are asking"),
          d.questions.slice(0, 2).map((q) => h("p", { class: "question" }, q.text, h("small", { class: "num" }, ` ${compact(q.likes)} likes`))),
        ],
        d.languages.slice(0, 3).map((l) => row(l.name, `${l.share}%`)),
        h("p", { class: "note" }, "Languages hint at where viewers are; exact countries are private."),
      ];
    }),

    card("What the video says", "transcript", (d) =>
      d.available
        ? [
            d.words_per_minute && row("Speaking pace", `${d.words_per_minute} words/min · ${d.pace}`),
            d.speech_share != null && row("Talking time", `${d.speech_share}%`),
            row("Main topics", d.keywords.slice(0, 4).map((k) => k.word).join(", ") || "Unclear"),
          ]
        : h("p", { class: "muted" }, d.reason === "blocked" ? "YouTube didn’t let the server read the captions right now. Try again in a few minutes." : "This video has no captions to read.")
    )
  );
}

// ─── Details tab: facts about the video itself (all real data) ───

const CHIP_LIMIT = 30;

async function copyText(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    button.dataset.copied = "true";
    button.replaceChildren(icon("check"), "Copied");
    setTimeout(() => {
      delete button.dataset.copied;
      button.replaceChildren(icon("copy"), text);
    }, 1500);
  } catch {
    // clipboard blocked; the ID is still visible to select
  }
}

function detailsPanel(tabId) {
  return h("div", { class: "panel", id: "panel-details", role: "tabpanel", "aria-labelledby": "tab-details", hidden: "" },
    card("Numbers", "details", (d) => [
      row("Views", full(d.views)),
      row("Likes", full(d.likes)),
      row("Comments", full(d.comments)),
      row("Channel subscribers", full(d.subscribers)),
    ]),
    card("Video", "details", (d) => [
      row("Uploaded", d.upload_date ? new Date(`${d.upload_date}T00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Unknown"),
      row("Length", d.duration_seconds ? clock(d.duration_seconds) : "Unknown"),
      row("Category", d.category || "None"),
      d.max_height && row("Best quality", `${d.max_height}p${d.fps ? ` · ${d.fps} fps` : ""}`),
      d.language && row("Spoken language", languageName(d.language)),
      row("Visibility", d.privacy),
      row("License", d.license),
      row("Live", d.live_status),
      row("Age-restricted", d.age_restricted ? "Yes" : "No"),
      h("div", { class: "row" }, h("span", {}, "Video ID"),
        h("span", {}, h("button", { class: "copy num", title: "Copy video ID", onclick: (e) => copyText(e.currentTarget, d.video_id) }, icon("copy"), d.video_id))),
    ]),
    card("Description", "details", (d) => {
      const text = (d.description || "").trim();
      if (!text) return h("p", { class: "muted" }, "No description.");
      return text.length > 280
        ? h("details", { class: "desc" },
            h("summary", {}, h("span", { class: "desc-text" }, `${text.slice(0, 280)}…`), h("br"), h("span", { class: "more" }, "Show more")),
            h("p", { class: "desc-text" }, text))
        : h("p", { class: "desc-text" }, text);
    }),
    card("Chapters", "details", (d) =>
      d.chapters?.length
        ? d.chapters.map((c) =>
            h("button", { class: "moment", onclick: () => seek(tabId, c.start), title: "Jump to this chapter" },
              h("span", { class: "moment-time" }, clock(c.start)),
              h("span", {}, c.title),
              h("span", { class: "play" }, icon("play"))))
        : h("p", { class: "muted" }, "This video has no chapters.")
    ),
    card("Tags", "details", (d) =>
      d.tags?.length
        ? h("ul", { class: "chips" }, d.tags.slice(0, CHIP_LIMIT).map((t) => h("li", {}, t)),
            d.tags.length > CHIP_LIMIT && h("li", { class: "muted" }, `+${d.tags.length - CHIP_LIMIT} more`))
        : h("p", { class: "muted" }, "No tags.")
    ),
    card("Captions", "details", (d) =>
      d.subtitles?.length
        ? h("ul", { class: "chips" }, d.subtitles.map((code) => h("li", {}, languageName(code))))
        : h("p", { class: "muted" }, "The creator hasn’t added captions (YouTube’s automatic ones may still exist).")
    )
  );
}

// ─── Hidden tab: things YouTube knows but doesn't show ───

// Runs inside the YouTube page (MAIN world), so it must be self-contained.
// Reads the player's own data for this video and returns a small, plain summary.
function pagePlayerInfo(wantedId) {
  let p = null;
  for (const id of ["movie_player", "shorts-player"]) {
    try {
      const r = document.getElementById(id)?.getPlayerResponse?.();
      if (r?.videoDetails?.videoId === wantedId) {
        p = r;
        break;
      }
    } catch {
      // player not ready
    }
  }
  if (!p && window.ytInitialPlayerResponse?.videoDetails?.videoId === wantedId) p = window.ytInitialPlayerResponse;
  if (!p) return { found: false };

  const mf = p.microformat?.playerMicroformatRenderer || {};
  const vd = p.videoDetails || {};
  const formats = p.streamingData?.adaptiveFormats || [];
  const CODECS = { av01: "AV1", vp9: "VP9", vp09: "VP9", avc1: "H.264", opus: "Opus", mp4a: "AAC", "ec-3": "Dolby Digital+", "ac-3": "Dolby Digital" };
  const codecOf = (mime = "") => {
    const c = (mime.match(/codecs="([^".,]+)/) || [])[1] || "";
    return CODECS[c] || c.toUpperCase() || "Unknown";
  };
  const video = formats.filter((f) => f.mimeType?.startsWith("video/"));
  const audio = formats.filter((f) => f.mimeType?.startsWith("audio/"));
  const bestV = [...video].sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0))[0];
  const bestA = [...audio].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  const HDR = ["COLOR_TRANSFER_CHARACTERISTICS_SMPTEST2084", "COLOR_TRANSFER_CHARACTERISTICS_ARIB_STD_B67"];

  const ads = (p.adPlacements || [])
    .map((a) => a.adPlacementRenderer?.config?.adPlacementConfig)
    .filter(Boolean)
    .map((c) => (c.kind === "AD_PLACEMENT_KIND_START" ? 0 : c.kind === "AD_PLACEMENT_KIND_END" ? -1 : Number(c.adTimeOffset?.offsetStartMilliseconds) / 1000))
    .filter((x) => !Number.isNaN(x));
  const captions = p.captions?.playerCaptionsTracklistRenderer;
  const captionTracks = captions?.captionTracks || [];

  return {
    found: true,
    loudnessDb: p.playerConfig?.audioConfig?.loudnessDb ?? null,
    ads: [...new Set(ads)].sort((a, b) => (a === -1) - (b === -1) || a - b),
    playerAds: Boolean(p.playerAds?.length),
    paidPromotion: Boolean(p.paidContentOverlay),
    familySafe: mf.isFamilySafe ?? null,
    unlisted: mf.isUnlisted ?? null,
    publishDate: mf.publishDate || mf.uploadDate || null,
    countries: mf.availableCountries?.length ?? null,
    allowRatings: vd.allowRatings ?? null,
    crawlable: vd.isCrawlable ?? null,
    embeddable: p.playabilityStatus?.playableInEmbed ?? null,
    keywords: vd.keywords?.length ?? 0,
    endscreen: p.endscreen?.endscreenRenderer?.elements?.length ?? 0,
    cards: p.cards?.cardCollectionRenderer?.cards?.length ?? 0,
    autoCaptions: captionTracks.some((t) => t.kind === "asr"),
    creatorCaptions: captionTracks.filter((t) => t.kind !== "asr").length,
    translatable: captions?.translationLanguages?.length ?? 0,
    streams: formats.length
      ? {
          count: formats.length,
          codecs: [...new Set(video.map((f) => codecOf(f.mimeType)))],
          hdr: video.some((f) => /HDR/i.test(f.qualityLabel || "") || HDR.includes(f.colorInfo?.transferCharacteristics)),
          vr: video.some((f) => f.projectionType && f.projectionType !== "RECTANGULAR"),
          audioTracks: [...new Set(audio.map((f) => f.audioTrack?.displayName).filter(Boolean))],
          bestVideo: bestV && { label: bestV.qualityLabel, codec: codecOf(bestV.mimeType), mbps: (bestV.bitrate || 0) / 1e6, size: Number(bestV.contentLength) || null },
          bestAudio: bestA && {
            codec: codecOf(bestA.mimeType),
            kbps: Math.round((bestA.averageBitrate || bestA.bitrate || 0) / 1000),
            khz: Number(bestA.audioSampleRate) / 1000 || null,
            channels: bestA.audioChannels || null,
            size: Number(bestA.contentLength) || null,
          },
        }
      : null,
  };
}

async function readPage(tabId, videoId) {
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: pagePlayerInfo, args: [videoId] });
  } catch {
    throw new Error("Couldn’t read the YouTube tab. Reload it and try again.");
  }
  if (!result?.found) throw new Error("The player isn’t ready yet. Let the video start, then try again.");
  return result;
}

const bytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
const yesNo = (v, yes = "Yes", no = "No") => (v == null ? "Unknown" : v ? yes : no);

// Two-column tiles: label, value and a tone dot (good / warn / plain)
function facts(items) {
  return h("div", { class: "facts" },
    items.filter(Boolean).map(([label, value, tone, hint]) =>
      h("div", { class: `fact${tone ? ` fact-${tone}` : ""}${String(value).length > 16 ? " fact-wide" : ""}`, title: hint || null },
        h("span", { class: "fact-label" }, label),
        h("strong", { class: "fact-value" }, (tone === "good" || tone === "warn") && h("i", { class: "dot", "aria-hidden": "true" }), value, tone === "est" && h("span", { class: "est" }, "est.")))));
}

// Loudness on a −12…+12 dB scale; YouTube's target is the 0 line
function loudness(db) {
  const clamped = Math.max(-12, Math.min(12, db));
  const verdict = db > 1 ? `Mastered loud: YouTube turns it down ${db.toFixed(1)} dB`
    : db < -1 ? `Quieter than YouTube’s level by ${Math.abs(db).toFixed(1)} dB (not boosted)`
      : "Right at YouTube’s normal loudness";
  return h("div", { class: "loud" },
    h("div", { class: "loud-top" }, h("span", {}, verdict)),
    h("div", { class: "loud-track", role: "img", "aria-label": verdict },
      h("span", { class: "loud-zero" }),
      h("span", { class: `loud-fill ${db >= 0 ? "is-up" : "is-down"}`, style: db >= 0 ? { left: "50%", width: `${(clamped / 24) * 100}%` } : { right: "50%", width: `${(-clamped / 24) * 100}%` } })),
    h("div", { class: "loud-scale small num" }, h("span", {}, "quieter"), h("span", {}, "YouTube level"), h("span", {}, "louder")));
}

function exactTime(iso) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return iso.includes("T")
    ? d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const openTab = (url) => chrome.tabs.create({ url });

// A labelled group inside a card: coloured icon, title, one-line "what is this", then the content
function group(iconName, title, about, ...content) {
  const body = content.flat(Infinity).filter(Boolean);
  if (!body.length) return null;
  return h("div", { class: "group" },
    h("div", { class: "group-head" },
      h("span", { class: `group-icon gi-${iconName}` }, icon(iconName)),
      h("div", {}, h("strong", {}, title), h("span", { class: "group-about" }, about))),
    body);
}

// Where a card's data comes from, in plain words, right under its title
const origin = (text) => h("p", { class: "origin" }, text);

function hiddenPanel(tabId, videoId) {
  return h("div", { class: "panel", id: "panel-hidden", role: "tabpanel", "aria-labelledby": "tab-hidden", hidden: "" },
    h("p", { class: "panel-intro" }, icon("eye"), "Things YouTube knows about this video but doesn’t show you."),
    autoSkipCard(tabId),
    h("div", { class: "legend-keys small" },
      h("span", {}, h("i", { class: "src src-real" }), "Real data"),
      h("span", {}, h("i", { class: "src src-est" }), "Estimate"),
      h("span", {}, h("i", { class: "dot dot-good" }), "Good"),
      h("span", {}, h("i", { class: "dot dot-warn" }), "Worth a look")),

    card("Behind the player", "page", (d) => [
      origin("Read from YouTube’s own player on this page."),
      d.loudnessDb != null && group("volume", "Sound", "How loud it was mixed, and what YouTube does about it", loudness(d.loudnessDb)),
      group("dollar", "Ads & money", "Ads YouTube planned and sponsorship disclosure",
        facts([
          ["Ad breaks", d.ads.length ? `${d.ads.length} planned` : d.playerAds ? "Yes" : "None sent", null, "An ad blocker can hide these."],
          ["Paid promotion", d.paidPromotion ? "Declared" : "Not declared", d.paidPromotion ? "warn" : null],
        ]),
        d.ads.length > 0 && h("div", { class: "ad-marks" },
          h("span", { class: "muted small" }, "Ads at"),
          d.ads.map((t) => t === -1 ? h("span", { class: "chip-time" }, "end")
            : t === 0 ? h("span", { class: "chip-time" }, "start")
              : h("button", { class: "chip-time", onclick: () => seek(tabId, t), title: "Jump here" }, clock(t))))),
      group("eye", "Visibility", "Who can find, see and share this video",
        facts([
          ["Unlisted", yesNo(d.unlisted), d.unlisted ? "warn" : null],
          ["In search", yesNo(d.crawlable), d.crawlable === false ? "warn" : null],
          ["Embeds", yesNo(d.embeddable, "Allowed", "Blocked"), d.embeddable === false ? "warn" : null],
          ["Family-safe", yesNo(d.familySafe), d.familySafe === false ? "warn" : null],
          ["Likes shown", yesNo(d.allowRatings, "Yes", "Hidden"), d.allowRatings === false ? "warn" : null],
          d.countries != null && ["Countries", `${d.countries} allowed`],
        ])),
      group("calendar", "Upload", "The exact moment it went live (your time zone)",
        facts([["Uploaded at", exactTime(d.publishDate)]])),
      group("layers", "Extras", "What the creator added around the video",
        facts([
          ["Hidden tags", String(d.keywords)],
          ["End screen", d.endscreen ? `${d.endscreen} items` : "None"],
          ["Info cards", d.cards ? String(d.cards) : "None"],
          ["Captions", d.creatorCaptions ? `${d.creatorCaptions} by creator` : d.autoCaptions ? "Auto only" : "None"],
          d.translatable > 0 && ["Auto-translate", `${d.translatable} languages`],
        ])),
    ]),

    card("Streams & quality", "page", (d) => {
      const s = d.streams;
      if (!s) return [origin("The files YouTube serves for this video."), h("p", { class: "muted" }, "YouTube didn’t share the stream list with this page.")];
      const total = (s.bestVideo?.size || 0) + (s.bestAudio?.size || 0);
      return [
        origin("The files YouTube serves for this video."),
        group("film", "Video", "Best picture quality available",
          facts([
            s.bestVideo && ["Resolution", s.bestVideo.label],
            s.bestVideo && ["Codec", s.bestVideo.codec],
            s.bestVideo?.mbps > 0 && ["Bitrate", `${s.bestVideo.mbps.toFixed(1)} Mbps`],
            ["HDR", yesNo(s.hdr), s.hdr ? "good" : null],
            s.vr && ["360° / VR", "Yes", "good"],
          ])),
        group("music", "Audio", "Best sound quality available",
          facts([
            s.bestAudio && ["Codec", s.bestAudio.codec],
            s.bestAudio && ["Bitrate", `${s.bestAudio.kbps} kbps`],
            s.bestAudio?.khz && ["Sample rate", `${s.bestAudio.khz} kHz`],
            s.bestAudio?.channels && ["Channels", s.bestAudio.channels > 2 ? `${s.bestAudio.channels} (surround)` : s.bestAudio.channels === 2 ? "Stereo" : "Mono"],
          ]),
          s.audioTracks.length > 1 && [h("p", { class: "sub-label" }, `Dubbed in ${s.audioTracks.length} languages`), h("ul", { class: "chips" }, s.audioTracks.map((t) => h("li", {}, t)))]),
        group("file", "Files", "What a full download would weigh",
          facts([
            total > 0 && ["Full-quality size", `≈ ${bytes(total)}`],
            ["Versions", `${s.count} files`],
          ]),
          h("p", { class: "sub-label" }, "Video codecs"),
          h("ul", { class: "chips" }, s.codecs.map((c) => h("li", {}, c)))),
        h("div", { class: "actions" },
          h("button", { class: "button", onclick: () => openTab(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`) }, icon("image"), "Full-size thumbnail"),
          h("button", { class: "button button-accent", onclick: () => openTab(`${WEBSITE}/?url=${encodeURIComponent(currentUrl)}`) }, icon("download"), "Download")),
      ];
    }),

    card("Hidden numbers", "video", (d) => {
      const e = d.engagement || {};
      const f = d.forecast || {};
      return [
        origin("Numbers YouTube hides or never shows. Ones marked “est.” are estimates."),
        group("heart", "Reactions", "How viewers really feel",
          facts([
            e.dislikes != null && ["Dislikes", compact(e.dislikes), "est", "From Return YouTube Dislike; YouTube hides the real count."],
            e.approval != null && ["Approval", `${e.approval}%`, e.approval >= 95 ? "good" : e.approval < 80 ? "warn" : null],
            e.comment_rate != null && ["Comments / 1K views", String(e.comment_rate)],
          ])),
        group("trend", "Growth", "Where the video is in its life",
          facts([
            f.views_per_day_lifetime != null && ["Views a day", compact(f.views_per_day_lifetime), null, "Average over its whole life"],
            f.stage && ["Life stage", f.stage],
            f.age_days != null && ["Age", f.age_days >= 365 ? `${(f.age_days / 365).toFixed(1)} years` : `${Math.round(f.age_days)} days`],
          ])),
        group("dollar", "Money", "What it likely makes from ads",
          facts([
            d.earnings?.per_day && ["Earns a day", range(d.earnings.per_day), "est"],
            d.earnings && ["Runs ads", d.earnings.monetized_likely ? "Likely" : "Unlikely", d.earnings.monetized_likely ? "good" : "warn"],
          ]),
          d.earnings?.factors?.length > 0 && h("details", { class: "how" },
            h("summary", {}, "How this estimate was made"),
            h("ul", {}, d.earnings.factors.map((x) => h("li", {}, x))))),
      ];
    }, "mixed"),

    card("Sponsors & skippable parts", "video", (d) => {
      const segs = d.sponsor_segments;
      const head = origin("Marked by viewers on SponsorBlock. Click a part to skip past it.");
      if (segs == null) return [head, h("p", { class: "muted" }, "SponsorBlock couldn’t be reached right now.")];
      if (!segs.length) return [head, h("p", { class: "muted" }, "No sponsor reads, intros or reminders reported yet.")];
      const dur = d.duration_seconds || Math.max(...segs.map((s) => s.end));
      return [
        head,
        h("div", { class: "seg-bar", role: "img", "aria-label": `${segs.length} marked parts` },
          segs.map((s) => h("span", { class: `seg seg-${s.category}`, style: { left: `${(s.start / dur) * 100}%`, width: `${Math.max(((s.end - s.start) / dur) * 100, 1)}%` } }))),
        segs.map((s) =>
          h("button", { class: "moment", onclick: () => seek(tabId, s.end), title: "Skip past it" },
            h("span", { class: `seg-key seg-${s.category}` }),
            h("span", { class: "moment-time" }, clock(s.start)),
            h("span", {}, s.label, h("span", { class: "muted small" }, ` · ${Math.round(s.end - s.start)}s`)),
            h("span", { class: "play" }, icon("skip")))),
      ];
    }),

    card("About the channel", "channel", (d) => {
      const best = [...(d.by_length || [])].filter((b) => b.videos >= 3).sort((a, b) => b.vs_channel - a.vs_channel)[0];
      const r = d.upload_rhythm;
      const svl = d.shorts_vs_long;
      return [
        origin("From the channel’s recent uploads."),
        group("user", "Activity", "Is the creator still posting?",
          facts([
            ["Verified", yesNo(d.verified), d.verified ? "good" : null],
            r?.status && ["Status", r.status, r.status === "inactive" ? "warn" : "good"],
            r?.days_since_last != null && ["Last upload", r.days_since_last < 1 ? "today" : `${Math.round(r.days_since_last)} days ago`],
          ])),
        group("trend", "What works", "Which videos do best on this channel",
          facts([
            d.recent?.average_views != null && ["Average views", compact(d.recent.average_views)],
            best && ["Best length", best.label],
            svl?.shorts_sampled > 0 && ["Shorts vs long", `${compact(svl.shorts_median_views)} vs ${compact(svl.long_median_views)}`, null, "Median views"],
          ])),
        d.recent?.top?.length > 0 && group("play", "Biggest recent uploads", "Click to open",
          d.recent.top.slice(0, 3).map((v) =>
            h("button", { class: "upload", onclick: () => openTab(`https://www.youtube.com/watch?v=${v.id}`), title: v.title },
              h("img", { src: `https://i.ytimg.com/vi/${v.id}/default.jpg`, alt: "" }),
              h("span", { class: "upload-text" }, h("span", { class: "upload-title" }, v.title), h("span", { class: "muted small num" }, `${compact(v.views)} views`)),
              icon("external")))),
      ];
    }),

    card("Inside the comments", "comments", (d) => [
      origin(`From a sample of ${d.sampled} comments.`),
      group("chat", "Conversation", "How active the comment section is",
        facts([
          ["Total comments", compact(d.total)],
          ["Creator replies", d.creator_replies ? `${d.creator_replies} seen` : "None seen", d.creator_replies ? "good" : null],
        ])),
      d.pinned && group("pin", "Pinned by the creator", "The comment they chose to show first",
        h("blockquote", { class: "quote" }, d.pinned.text ?? String(d.pinned))),
      d.keywords?.length > 0 && group("tag", "Most-used words", "What viewers keep talking about",
        h("ul", { class: "chips" }, d.keywords.slice(0, 12).map((k) => h("li", {}, k.word, h("small", { class: "num" }, ` ${k.count}`))))),
    ])
  );
}

// ─── Predictions tab: where this video is heading ───

const years = (days) => (days >= 730 ? `${(days / 365).toFixed(1)} years` : days >= 60 ? `${Math.round(days / 30)} months` : `${Math.max(1, Math.round(days))} days`);
const whenRange = ([fast, slow]) => (Math.abs(slow - fast) < 1 ? `in about ${years(fast)}` : `in ${years(fast)} – ${years(slow)}`);
const dateIn = (days) => new Date(Date.now() + days * 864e5).toLocaleDateString(undefined, { month: "short", year: "numeric", ...(days < 120 ? { day: "numeric" } : {}) });
const plus = ([a, b]) => `+${compact(a)} – ${compact(b)}`;
const between = ([a, b]) => `${compact(a)} – ${compact(b)}`;
// A usable [low, high] pair: the newer prediction fields can be missing or partial
const isRange = (r) => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite);

// Breakout chance: one dot per recent upload (at most 30), the ones that took off filled in
function breakoutDots(b) {
  const n = Math.min(b.of, 30);
  const hits = Math.round((b.count / b.of) * n);
  return [
    h("div", { class: "bo-dots", role: "img", "aria-label": `${b.count} of the channel’s last ${b.of} uploads took off` },
      Array.from({ length: n }, (_, i) => h("span", { class: `bo-dot${i < hits ? " bo-hit" : ""}` }))),
    h("p", { class: "bo-key muted small" },
      h("span", {}, h("i", { class: "bo-dot bo-hit", "aria-hidden": "true" }), "Took off"),
      h("span", {}, h("i", { class: "bo-dot", "aria-hidden": "true" }), "Usual"),
      b.of > 30 && h("span", {}, `(${b.of} uploads, scaled to 30 dots)`)),
  ];
}

// Past views (solid), the predicted range for the next year (shaded) and the middle path (dashed)
function projectionChart(p) {
  const W = 360, H = 96, PAD = 4;
  const past = Math.min(p.age, 365), future = 365;
  const t0 = p.age - past, t1 = p.age + future;
  const at = (t, a) => p.views * (Math.max(t, 0.01) / p.age) ** a;
  const yMin = at(t0, p.curve.aHigh) * 0.98, yMax = at(t1, p.curve.aHigh);
  const x = (t) => PAD + ((t - t0) / (t1 - t0)) * (W - PAD * 2);
  const y = (v) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD * 2 - 10);
  const steps = 40;
  const path = (from, to, a) => Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps;
    return `${i ? "L" : "M"}${x(t).toFixed(1)} ${y(at(t, a)).toFixed(1)}`;
  }).join(" ");
  const high = path(p.age, t1, p.curve.aHigh);
  const lowBack = Array.from({ length: steps + 1 }, (_, i) => {
    const t = t1 - ((t1 - p.age) * i) / steps;
    return `L${x(t).toFixed(1)} ${y(at(t, p.curve.aLow)).toFixed(1)}`;
  }).join(" ");
  return [
    h("div", { class: "proj", role: "img", "aria-label": `Predicted views a year from now: ${compact(p.views + p.horizons[2].gain[0])} to ${compact(p.views + p.horizons[2].gain[1])}` },
      svg({ viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" },
        { d: `${high} ${lowBack} Z`, class: "proj-band" },
        { d: path(t0, p.age, p.curve.aMid), class: "proj-past" },
        { d: path(p.age, t1, p.curve.aMid), class: "proj-mid" },
        { d: `M${x(p.age)} 0V${H}`, class: "proj-now" }),
      h("span", { class: "proj-dot", style: { left: `${(x(p.age) / W) * 100}%`, top: `${(y(p.views) / H) * 100}%` } })),
    h("div", { class: "axis num" },
      h("span", {}, past >= 365 ? "a year ago" : "uploaded"), h("span", { class: "axis-now" }, "now"), h("span", {}, "in a year")),
  ];
}

function predictionsPanel() {
  const needs = (p, render) => (p.available ? render(p) : h("p", { class: "muted" }, p.reason));
  return h("div", { class: "panel", id: "panel-predictions", role: "tabpanel", "aria-labelledby": "tab-predictions", hidden: "" },
    h("p", { class: "panel-intro" }, icon("spark"), "Where this video is heading, worked out from its growth so far and the channel’s own history. All predictions are ranges, not promises."),

    card("Views ahead", "predict", (p) => needs(p, () => [
      origin("If it keeps growing the way videos like it usually do."),
      projectionChart(p),
      facts([
        ...p.horizons.map((hz) => [hz.label, plus(hz.gain), null, `${compact(p.views + hz.gain[0])} – ${compact(p.views + hz.gain[1])} views in total`]),
        ["Views a day now", `${compact(p.perDay[0])} – ${compact(p.perDay[1])}`],
        p.firstYearShare != null && ["First year done", `${Math.round(p.firstYearShare * 100)}%`, null, "Share of its first-year views it already has"],
      ]),
    ]), "estimate"),

    card("Momentum", "predict", (p) => needs(p, () => {
      const m = p.momentum;
      const half = isRange(m?.halfPaceInDays), total = isRange(m?.fiveYearTotal);
      if (!half && !total) return h("p", { class: "muted" }, "Not enough data on this video to judge how fast it’s slowing.");
      return [
        origin("How fast this video is slowing down."),
        typeof m.slowing === "boolean" && (m.slowing
          ? h("p", { class: "verdict verdict-mid" }, "Past its launch burst — growing slowly now")
          : h("p", { class: "verdict verdict-good" }, "Still in its launch burst — most views are yet to come")),
        facts([
          // Beyond 10 years the curve is effectively flat; say so instead of "in 26–51 years"
          half && ["Daily views halve", m.halfPaceInDays[0] > 3650 ? "Not for 10+ years (steady)" : whenRange(m.halfPaceInDays), null, m.halfPaceInDays[1] <= 36500 ? `Around ${dateIn(m.halfPaceInDays[0])}${Math.abs(m.halfPaceInDays[1] - m.halfPaceInDays[0]) > 30 ? ` – ${dateIn(m.halfPaceInDays[1])}` : ""}` : null],
          total && ["5-year total", between(m.fiveYearTotal), null, "Lifetime views 5 years from now"],
        ]),
      ];
    }), "estimate"),

    card("Next milestones", "predict", (p) => needs(p, () => [
      origin("When it should pass the next round numbers."),
      p.milestones.length
        ? p.milestones.map((m) => h("div", { class: "milestone" },
            h("span", { class: "ms-flag" }, icon("flag")),
            h("div", {}, h("strong", { class: "num" }, `${compact(m.views)} views`),
              h("span", { class: "muted small" }, `${whenRange(m.days)} · around ${dateIn(m.days[0])}${Math.abs(m.days[1] - m.days[0]) > 30 ? ` – ${dateIn(m.days[1])}` : ""}`))))
        : h("p", { class: "muted" }, "Growth has slowed too much to reach the next milestone within 20 years."),
    ]), "estimate"),

    card("Against the channel", "predict", (p) => needs(p, () => {
      const v = p.vsTypical;
      const tone = v && (v.ratio >= 1.5 ? "good" : v.ratio < 0.67 ? "warn" : null);
      const verdict = !v ? null : v.ratio >= 3 ? "Breakout: likely one of the channel’s hits"
        : v.ratio >= 1.5 ? "Ahead of a typical upload" : v.ratio >= 0.67 ? "On track for a typical upload" : "Behind a typical upload";
      return [
        origin("Compared at the same age, so new and old videos are judged fairly."),
        verdict && h("p", { class: `verdict verdict-${tone || "mid"}` }, verdict),
        facts([
          v && ["vs typical at this age", `${v.ratio >= 10 ? Math.round(v.ratio) : v.ratio.toFixed(1)}×`, tone, `A typical upload has about ${compact(v.expected)} views at this age`],
          p.rank && ["Rank in a year", `#${p.rank.position} of ${p.rank.of}`, p.rank.position <= 3 ? "good" : null, "Among the channel’s recent uploads"],
        ]),
        !v && !p.rank && h("p", { class: "muted small" }, "Not enough comparable uploads on this channel to judge."),
      ];
    }), "estimate"),

    card("Breakout chance", "predict", (p) => needs(p, () => {
      const b = p.breakout;
      if (!(Number.isFinite(b?.of) && b.of > 0 && Number.isFinite(b.count))) return h("p", { class: "muted" }, "Not enough recent uploads on this channel to predict this.");
      const rate = Number.isFinite(b.rate) ? b.rate : b.count / b.of;
      return [
        origin("How often this channel’s uploads take off (3× their usual views)."),
        breakoutDots(b),
        facts([
          ["Channel’s hit rate", `${b.count} of ${b.of} (${Math.round(rate * 100)}%)`, null, "Recent uploads that reached 3× the channel’s median views"],
          b.onTrack === true ? ["This video", "On track to be a hit", "good"]
            : b.onTrack === false ? ["This video", "Not on track yet"]
              : ["This video", "Too old to compare"],
        ]),
      ];
    }), "estimate"),

    card("Money ahead", "predict", (p) => needs(p, () =>
      p.earnings
        ? [origin("Ad earnings from the predicted views, at this video’s estimated rate."),
            facts([["Next 30 days", range(p.earnings.month)], ["Next year", range(p.earnings.year)]])]
        : h("p", { class: "muted" }, "The channel probably can’t run ads yet, so no ad earnings are expected.")), "estimate"),

    card("Likes & comments ahead", "predict", (p) => needs(p, () => {
      const e = p.engagementAhead;
      const rows = [
        isRange(e?.likes?.month) && ["Likes, next 30 days", plus(e.likes.month)],
        isRange(e?.likes?.year) && ["Likes, next year", plus(e.likes.year)],
        isRange(e?.comments?.month) && ["Comments, next 30 days", plus(e.comments.month)],
        isRange(e?.comments?.year) && ["Comments, next year", plus(e.comments.year)],
      ].filter(Boolean);
      if (!rows.length) return h("p", { class: "muted" }, "Not enough like or comment data on this video to predict this.");
      return [origin("At this video’s current like and comment rates."), facts(rows)];
    }), "estimate"),

    card("Creator’s next upload", "predict", (p) => needs(p, () => {
      const n = p.nextUpload;
      if (!n) return h("p", { class: "muted" }, "Not enough recent uploads to see a rhythm.");
      const overdue = n.dueInDays < 0;
      return [
        origin(n.approximate ? "From the gaps between recent uploads (YouTube shows rough dates, so this is approximate)." : "From the gaps between recent uploads."),
        facts([
          ["Usually posts every", years(n.usualGapDays)],
          [overdue ? "Overdue by" : "Next upload expected", overdue ? years(-n.dueInDays) : `in ~${years(n.dueInDays)}`, overdue ? "warn" : null],
          !overdue && ["Around", dateIn(n.dueInDays)],
        ]),
      ];
    }), "estimate"),

    card("Next video forecast", "predict", (p) => needs(p, () => {
      const n = p.nextVideo;
      const rows = [
        isRange(n?.views7) && ["Views after 7 days", between(n.views7)],
        isRange(n?.views30) && ["Views after 30 days", between(n.views30)],
        isRange(n?.sponsor) && ["Fair sponsor price", range(n.sponsor), null, "Typical brand rate of $10–$30 per 1,000 expected views"],
      ].filter(Boolean);
      if (!rows.length) return h("p", { class: "muted" }, "Not enough data on this channel to predict this.");
      return [
        origin(n.basis === "fitted"
          ? "From this channel’s growth curve — useful for planning or pricing a sponsorship."
          : "From this channel’s typical recent upload — useful for planning or pricing a sponsorship."),
        facts(rows),
      ];
    }), "estimate"),

    card("How these were made", "predict", (p) => needs(p, () => [
      h("p", { class: "method" },
        "Views on YouTube grow fast at first, then slow down: lifetime views follow a curve like views × (age)",
        h("sup", {}, "a"), ". ",
        p.exponent.fitted
          ? `The steepness (a = ${p.exponent.low.toFixed(2)}–${p.exponent.high.toFixed(2)}) was fitted to this channel’s last ${p.exponent.n} uploads (fit quality R² = ${p.exponent.r2.toFixed(2)}).`
          : `This channel’s uploads didn’t show a clear enough pattern${p.exponent.n ? ` (R² = ${(p.exponent.r2 ?? 0).toFixed(2)} over ${p.exponent.n} uploads)` : ""}, so the typical YouTube range was used (a = ${p.exponent.low}–${p.exponent.high}).`),
      h("p", { class: "note" }, "A sudden boost (going viral, a shout-out, the algorithm picking it up) can beat these ranges; a video that stops being recommended can fall short."),
    ]), "estimate"),
  );
}

// ─── Analytics / Details / Hidden / Predictions tabs ───

const TABS = [
  { id: "analytics", label: "Analytics" },
  { id: "details", label: "Details" },
  { id: "hidden", label: "Hidden", icon: "eye" },
  { id: "predictions", label: "Predictions", icon: "spark", badge: true },
];

function tabBar(panels) {
  const underline = () => svg({ class: "underline", viewBox: "0 0 100 8", preserveAspectRatio: "none", "aria-hidden": "true" }, "M2 5c20-3 45-4 96-1");
  const buttons = TABS.map((t) =>
    h("button", { role: "tab", id: `tab-${t.id}`, "aria-controls": `panel-${t.id}`, class: "tab", onclick: () => select(t.id) },
      t.icon && icon(t.icon), t.label, t.badge && h("span", { class: "tab-new" }, "new")));
  const bar = h("div", { class: "tabs", role: "tablist", "aria-label": "View" }, buttons);

  // Each tab keeps its own scroll position, so switching back returns to the same spot
  let current;
  const scrollOf = {};
  // Where the tab bar starts sticking under the header (= a tab's own top). Measured from the
  // element above the bar, because a stuck sticky bar reports its stuck position, not its real one.
  const tabsTop = () => {
    const above = bar.previousElementSibling;
    if (!above) return 0;
    const gap = parseFloat(getComputedStyle(bar.parentElement).rowGap) || 0;
    return Math.max(0, above.getBoundingClientRect().bottom + window.scrollY + gap - document.querySelector(".top").offsetHeight);
  };

  function select(id) {
    if (id === current) return;
    if (current) scrollOf[current] = window.scrollY;
    const wasStuck = window.scrollY >= tabsTop();
    current = id;
    TABS.forEach((t, i) => {
      const on = t.id === id;
      buttons[i].setAttribute("aria-selected", String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      buttons[i].querySelector(".underline")?.remove();
      if (on) buttons[i].append(underline());
      panels[t.id].hidden = !on;
    });
    // Back to where this tab was left; a tab opened for the first time starts at its top
    // (only if the page was scrolled past the tab bar; otherwise stay put)
    const target = scrollOf[id] ?? (wasStuck ? tabsTop() : window.scrollY);
    window.scrollTo(0, target);
    try {
      localStorage.setItem("viewlens-tab", id);
    } catch {
      // storage unavailable; the choice just isn't remembered
    }
  }

  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex((t) => t.id === current);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length].id;
    select(next);
    document.getElementById(`tab-${next}`).focus();
  });

  let saved = "analytics";
  try {
    saved = localStorage.getItem("viewlens-tab") || "analytics";
  } catch {
    // ignore
  }
  select(panels[saved] ? saved : "analytics");
  return bar;
}

// ─── Start ───

function emptyState() {
  const lens = svg({ class: "lens", viewBox: "0 0 64 64", "aria-hidden": "true" },
    "M10 16h34v24H10z", "M24 22l9 6-9 6z", { d: "M40 38l12 12", "stroke-width": "4" },
    { d: "M6 28c-2-12 12-20 26-18s22 12 18 22-18 14-30 10c-8-3-12-8-12-14", class: "pencil" });
  return h("section", { class: "empty" }, lens,
    h("h2", {}, "Open a video to analyse it"),
    h("p", { class: "muted" }, "Go to any YouTube video, then click Viewlens to see its earnings estimate, best moments and more."));
}

// ─── auto-skip ───
// content.js skips ads and SponsorBlock parts on every YouTube page by itself. The popup only
// shows and changes its settings (chrome.storage.local) and the running totals it keeps.

const SKIP_DEFAULTS = { autoSkipAds: true, autoSkipSponsors: true, skippedAds: 0, skippedSeconds: 0 };
const skipState = { ...SKIP_DEFAULTS };
const skipViews = new Set(); // redraw functions for every switch / stats line on screen
const skipChanged = () => skipViews.forEach((fn) => fn());

function readSkip(values) {
  for (const [key, fallback] of Object.entries(SKIP_DEFAULTS)) {
    const v = values[key];
    skipState[key] = typeof fallback === "boolean" ? v !== false : Number.isFinite(v) ? v : fallback;
  }
  skipChanged();
}

async function loadSkip() {
  try {
    readSkip(await chrome.storage.local.get(Object.keys(SKIP_DEFAULTS)));
  } catch {
    // storage unavailable: keep the defaults (auto-skip on)
  }
  // Live: the counters go up while the popup is open, and the settings can change elsewhere
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !Object.keys(SKIP_DEFAULTS).some((k) => k in changes)) return;
    readSkip({ ...skipState, ...Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.newValue])) });
  });
}

function setSkip(patch) {
  Object.assign(skipState, patch);
  skipChanged();
  chrome.storage.local.set(patch).catch(() => toast("Couldn’t save the setting. Try again.", "warn"));
}

function skipOption(key, title, about) {
  const id = `opt-${key}`;
  const el = h("button", { type: "button", class: "skip-opt", role: "switch", "aria-labelledby": `${id}-t`, "aria-describedby": `${id}-d`, onclick: () => setSkip({ [key]: !skipState[key] }) },
    h("span", { class: "skip-opt-text" }, h("strong", { id: `${id}-t` }, title), h("span", { class: "group-about", id: `${id}-d` }, about)),
    h("span", { class: "switch", "aria-hidden": "true" }));
  skipViews.add(() => el.setAttribute("aria-checked", String(skipState[key])));
  return el;
}

function skippedMinutes(seconds) {
  if (seconds > 0 && seconds < 30) return "under 1 min";
  return `${Math.round(seconds / 60).toLocaleString()} min`;
}

function autoSkipCard(tabId) {
  const stats = h("p", { class: "skip-stats small" });
  const drawStats = () => {
    const n = skipState.skippedAds;
    stats.replaceChildren(icon("check"), "Skipped so far: ",
      h("strong", { class: "num" }, `${n.toLocaleString()} ${n === 1 ? "ad" : "ads"}`), " · ",
      h("strong", { class: "num" }, skippedMinutes(skipState.skippedSeconds)), " of sponsor parts");
  };
  skipViews.add(drawStats);
  const el = h("section", { class: "card skip-card" },
    h("div", { class: "card-head" },
      h("h2", {}, "Auto-skip"),
      h("button", { type: "button", class: "skip-now", disabled: !VIDEO_URL.test(currentUrl), title: "Put a Skip button on the video", onclick: () => addSkipButton(tabId) },
        icon("skip"), "Skip button")),
    origin("Works on every YouTube page, even with this popup closed."),
    skipOption("autoSkipAds", "YouTube ads", "Mutes and fast-forwards ads, presses Skip as soon as it appears"),
    skipOption("autoSkipSponsors", "Sponsor parts", "Jumps past sponsor reads, self-promotion and subscribe reminders (from SponsorBlock)"),
    stats);
  skipChanged();
  return el;
}

// ─── Skip now: the manual fallback (for when auto-skip is off) ───

// Runs inside the YouTube page, so it must be self-contained.
// 1. A YouTube ad is playing: press YouTube's own Skip button, or jump to the end of an ad that can't be skipped yet.
// 2. Otherwise: jump past the sponsor read / intro / reminder the video is in right now (SponsorBlock segments).
function skipInPage(segments) {
  const player = document.querySelector("#movie_player");
  const video = player?.querySelector("video") || document.querySelector("video");
  if (!video) return { did: "no-video" };

  if (player?.classList.contains("ad-showing") || player?.classList.contains("ad-interrupting")) {
    const button = document.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button, button[id^='skip-button']");
    if (button) {
      button.click();
      return { did: "ad-skipped" };
    }
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = video.duration;
      return { did: "ad-ended" };
    }
    return { did: "ad-wait" };
  }

  const t = video.currentTime;
  const now = segments.find((s) => t >= s.start - 0.5 && t < s.end - 0.3);
  if (now) {
    video.currentTime = now.end;
    if (video.paused) video.play();
    return { did: "segment", label: now.label, seconds: Math.round(now.end - Math.max(t, now.start)) };
  }
  const next = segments.filter((s) => s.start > t).sort((a, b) => a.start - b.start)[0];
  return { did: "nothing", next: next ? { label: next.label, start: next.start } : null };
}

async function skipNow(tabId) {
  const segments = (partData.video?.sponsor_segments || []).filter((s) => s.end > s.start);
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: skipInPage, args: [segments] });
  } catch {
    return toast("Couldn’t reach the video. Reload the YouTube tab and try again.", "warn");
  }
  const messages = {
    "ad-skipped": ["Ad skipped", "good"],
    "ad-ended": ["Ad skipped to its end", "good"],
    "ad-wait": ["The ad is still loading. Try again in a second.", null],
    "no-video": ["No video is playing on this page.", "warn"],
  };
  if (messages[result?.did]) return toast(...messages[result.did]);
  if (result?.did === "segment") return toast(`Skipped ${result.label.toLowerCase()} (${result.seconds}s)`, "good");
  if (!partData.video) return toast("No ad playing. Sponsor parts will be skippable once the video is analysed.", null);
  return toast(result?.next
    ? `No ad playing. Next: ${result.next.label.toLowerCase()} at ${clock(result.next.start)}`
    : "No ad or sponsor part to skip right now.", null);
}

// ─── skip ad: puts a Skip button on the YouTube video itself (handled by content.js) ───

async function addSkipButton(tabId) {
  const ask = () => chrome.tabs.sendMessage(tabId, { type: "showSkipButton" });
  try {
    await ask();
  } catch {
    // The tab was open before Viewlens was (re)loaded, so content.js isn't in it yet: add it now
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await ask();
    } catch {
      return skipNow(tabId); // last resort: skip once from the popup
    }
  }
  toast("Skip button added to the video (top right). Click it whenever an ad or sponsor part plays.", "good");
}

// A short message at the bottom of the popup
function toast(text, tone) {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: `toast${tone ? ` toast-${tone}` : ""}`, role: "status" }, tone === "good" && icon("check"), text);
  document.body.append(el);
  setTimeout(() => el.classList.add("toast-out"), 2600);
  setTimeout(() => el.remove(), 3000);
}

async function main() {
  document.getElementById("refresh").append(icon("refresh"));
  document.getElementById("refresh").addEventListener("click", () => location.reload());

  loadSkip(); // auto-skip settings and totals for the Hidden tab card

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  const onVideo = VIDEO_URL.test(url);

  // dwnld: open the website with this video already filled in
  const dwnld = document.getElementById("dwnld");
  dwnld.querySelector(".dwnld-icon").append(icon("download"));
  dwnld.href = onVideo ? `${WEBSITE}/?url=${encodeURIComponent(url)}` : WEBSITE;
  dwnld.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: dwnld.href });
  });

  // skip ad: put a Skip button on the video (works as soon as you're on a YouTube video page)
  const skip = document.getElementById("skip");
  skip.querySelector(".skip-icon").append(icon("skip"));
  skip.disabled = !onVideo;
  skip.addEventListener("click", () => addSkipButton(tab.id));

  if (!onVideo) {
    app.replaceChildren(emptyState());
    return;
  }
  currentUrl = url;
  checkServer();

  const videoId = videoIdFrom(url);
  sources.page = () => readPage(tab.id, videoId);

  // Video facts and estimates are worked out in the browser first: YouTube often blocks the
  // free server ("confirm you're not a bot") but not the viewer's own browser. The server is the backup.
  let local = null;
  const fromBrowser = () => (local ??= readLocal(videoId, url).catch((err) => {
    local = null;
    throw err;
  }));
  sources.video = () => fromBrowser().then((d) => d.video).catch(() => get("/api/insights", currentUrl));
  sources.details = () => fromBrowser().then((d) => d.details).catch(() => get("/api/metadata", currentUrl));
  sources.channel = () => fromBrowser().then((d) => readChannel(d.info)).catch(() => get("/api/insights/channel", currentUrl));
  sources.comments = () => fromBrowser().then((d) => readComments(videoId, d.info.title)).catch(() => get("/api/insights/comments", currentUrl));
  // Captions need the server; if YouTube blocks it, read YouTube's own transcript panel when it's open
  sources.transcript = () => get("/api/insights/transcript", currentUrl)
    .then((d) => (d.available ? d : Promise.reject(new Error(d.reason))))
    .catch(async (err) => {
      const [{ result: rows } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: pageTranscript }).catch(() => []);
      if (rows?.length) return analyseTranscript(rows, (await fromBrowser()).info);
      if (err.message === "none") return { available: false, reason: "none" };
      throw new Error("Open “…more” under the video, click “Show transcript”, then press Try again.");
    });
  // Predictions: from the video and (if it loads) the channel's uploads
  sources.predict = async () => {
    const video = await loadPart("video");
    const channel = await waitFor("channel").catch(() => null);
    const details = await waitFor("details").catch(() => null);
    return buildPredictions(video, channel, undefined, { details });
  };
  const panels = {
    analytics: analyticsPanel(tab.id), details: detailsPanel(tab.id), hidden: hiddenPanel(tab.id, videoId), predictions: predictionsPanel(),
  };
  app.replaceChildren(heroCard(videoId), kpiStrip(), tabBar(panels), panels.analytics, panels.details, panels.hidden, panels.predictions);

  // The page's own player data needs no server, so read it straight away
  loadPart("page").catch(() => {});

  // Ask in stages so the small free server isn't hit with five lookups at once:
  // the video first (it's cached for everything else), then the rest one by one.
  loadPart("video")
    .catch(() => {})
    .then(async () => {
      for (const p of ["details", "channel", "predict", "transcript", "comments"]) await loadPart(p).catch(() => {});
    });
}

main();

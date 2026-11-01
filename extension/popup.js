import { DEPLOYED_API, LOCAL_API } from "./config.js";
import { buildHighlights } from "./lib/highlights.js";

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

// ─── Which server to use ───

// Store installs have an update_url in their manifest; unpacked (development) copies don't.
const isDevelopmentCopy = () => !chrome.runtime?.getManifest?.().update_url;

async function pickServer() {
  if (isDevelopmentCopy()) {
    try {
      const response = await fetch(`${LOCAL_API}/health`, { signal: AbortSignal.timeout(800) });
      if (response.ok) return LOCAL_API;
    } catch {
      // local backend isn't running; use the deployed one
    }
  }
  return DEPLOYED_API;
}

let API_BASE = DEPLOYED_API;

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

function loadPart(name, retry = false) {
  if (!parts[name] || retry) {
    const path = { video: "/api/insights", details: "/api/metadata" }[name] || `/api/insights/${name}`;
    failed.delete(name);
    parts[name] = get(path, currentUrl).then((data) => {
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

// ─── Analytics / Details tabs ───

const TABS = [
  { id: "analytics", label: "Analytics" },
  { id: "details", label: "Details" },
];

function tabBar(panels) {
  const underline = () => svg({ class: "underline", viewBox: "0 0 100 8", preserveAspectRatio: "none", "aria-hidden": "true" }, "M2 5c20-3 45-4 96-1");
  const buttons = TABS.map((t) =>
    h("button", { role: "tab", id: `tab-${t.id}`, "aria-controls": `panel-${t.id}`, class: "tab", onclick: () => select(t.id) }, t.label));
  const bar = h("div", { class: "tabs", role: "tablist", "aria-label": "View" }, buttons);

  let current;
  function select(id) {
    current = id;
    TABS.forEach((t, i) => {
      const on = t.id === id;
      buttons[i].setAttribute("aria-selected", String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      buttons[i].querySelector(".underline")?.remove();
      if (on) buttons[i].append(underline());
      panels[t.id].hidden = !on;
    });
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

async function main() {
  document.getElementById("refresh").append(icon("refresh"));
  document.getElementById("refresh").addEventListener("click", () => location.reload());

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (!VIDEO_URL.test(url)) {
    app.replaceChildren(emptyState());
    return;
  }
  currentUrl = url;
  API_BASE = await pickServer();
  checkServer();
  if (API_BASE === LOCAL_API) {
    document.querySelector(".brand").append(h("span", { class: "server-tag", title: LOCAL_API }, "Local server"));
  }

  const panels = { analytics: analyticsPanel(tab.id), details: detailsPanel(tab.id) };
  app.replaceChildren(heroCard(videoIdFrom(url)), kpiStrip(), tabBar(panels), panels.analytics, panels.details);

  // Ask in stages so the small free server isn't hit with five lookups at once:
  // the video first (it's cached for everything else), then the rest one by one.
  loadPart("video")
    .catch(() => {})
    .then(async () => {
      for (const p of ["details", "channel", "transcript", "comments"]) await loadPart(p).catch(() => {});
    });
}

main();

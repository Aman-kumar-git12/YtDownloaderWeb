import { API_BASE } from "./config.js";
import { buildHighlights } from "./lib/highlights.js";

const app = document.getElementById("app");
const VIDEO_URL = /^https:\/\/(www\.|m\.)?youtube\.com\/(watch\?|shorts\/)|^https:\/\/youtu\.be\//;

// Build DOM safely (all text goes through textContent)
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "style") Object.assign(el.style, value);
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const compact = (n) => (n == null ? "Hidden" : new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n));
const money = (n) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
const range = ([a, b], fmt = money) => `${fmt(a)} – ${fmt(b)}`;
const clock = (s) => {
  s = Math.floor(s);
  const hours = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return hours ? `${hours}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const row = (label, value) => h("div", { class: "row" }, h("span", { class: "muted" }, label), h("span", { class: "num" }, value));

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

const SOURCE_LABELS = { real: "Real data", estimate: "Estimate", mixed: "Real + estimates" };

// Each insight part is fetched once and shared by every card that uses it
const parts = {};
const partData = {};
const failed = new Set();
let onPartChange = () => {};
let currentUrl = "";

// Cards wait here until the staged loader (in main) starts their part
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
      onPartChange();
      return data;
    });
    parts[name].catch(() => {
      failed.add(name);
      onPartChange();
    });
    waiting[name]?.resolve(parts[name]);
    delete waiting[name];
  }
  return parts[name];
}

// A card that fills itself once its request finishes
function card(title, part, render, source = "real") {
  const head = () => h("div", { class: "card-head" }, h("h2", {}, title), h("span", { class: `source source-${source}` }, SOURCE_LABELS[source]));
  const el = h("section", { class: "card" }, head(), h("div", { class: "skeleton big" }), h("div", { class: "skeleton" }));
  const run = (retry) =>
    (retry ? loadPart(part, true) : waitFor(part))
      .then((data) => el.replaceChildren(head(), ...[render(data)].flat().filter((x) => x != null && x !== false && x !== "")))
      .catch((err) =>
        el.replaceChildren(
          head(),
          h("p", { class: "muted" }, err.message),
          h("button", { class: "retry", onclick: () => { el.replaceChildren(head(), h("div", { class: "skeleton" })); run(true); } }, "Try again")
        )
      );
  run(false);
  return el;
}

const TONE = {
  good: { icon: "↗", label: "Good sign" },
  warn: { icon: "!", label: "Watch out" },
  info: { icon: "i", label: "Worth knowing" },
};

// "What stands out": the most important findings, refreshed as each part arrives
function highlightsCard(tabId) {
  const el = h("section", { class: "card highlights" });
  const render = () => {
    const items = buildHighlights(partData).slice(0, 4);
    const loading = ["video", "channel", "comments", "transcript"].some((p) => !(p in partData) && !failed.has(p));
    const pending = loading && h("span", { class: "muted small" }, "Still reading…");
    el.replaceChildren(
      h("div", { class: "card-head" }, h("h2", {}, "What stands out"), pending),
      ...(items.length
        ? items.map((item) =>
            h("div", { class: `hl hl-${item.tone}` },
              h("span", { class: "hl-icon", role: "img", "aria-label": TONE[item.tone].label }, TONE[item.tone].icon),
              h("div", {},
                h("strong", {}, item.title),
                item.detail && h("span", { class: "muted small" }, item.detail),
                item.action && h("button", { class: "retry jump", onclick: () => seek(tabId, item.action.start) }, "▶ Jump to it")))
          )
        : [loading ? h("div", { class: "skeleton" }) : h("p", { class: "muted" }, "Nothing unusual; this video is performing as expected.")])
    );
  };
  render();
  return { el, render };
}

function spark(values) {
  const W = 300, H = 56, n = values.length;
  const pts = values.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)} ${(H - 2 - v * (H - 6)).toFixed(1)}`);
  const line = "M" + pts.join(" L");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "spark");
  svg.setAttribute("aria-hidden", "true");
  for (const [cls, d] of [["area", `${line} L${W} ${H} L0 ${H} Z`], ["line", line]]) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("class", cls);
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
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

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (!VIDEO_URL.test(url)) {
    app.replaceChildren(
      h("section", { class: "card" },
        h("h2", {}, "Open a video first"),
        h("p", { class: "muted" }, "Go to a video page, then click Viewlens to see its insights."))
    );
    return;
  }

  currentUrl = url;
  const highlights = highlightsCard(tab.id);
  onPartChange = highlights.render;
  // Ask in stages so the small free server isn't hit with five lookups at once:
  // the video first (it's cached for everything else), then the rest one by one.
  const video = loadPart("video");
  video
    .catch(() => {})
    .then(async () => {
      for (const p of ["details", "channel", "transcript", "comments"]) await loadPart(p).catch(() => {});
    });
  highlights.render();
  const titleCard = h("section", { class: "card" }, h("div", { class: "skeleton" }));
  video.then((d) => titleCard.replaceChildren(h("h1", {}, d.title), h("p", { class: "muted small" }, `${d.channel} · ${compact(d.views)} views`))).catch(() => titleCard.remove());

  const analyticsPanel = h("div", { class: "panel", id: "panel-analytics", role: "tabpanel", "aria-labelledby": "tab-analytics" },
    highlights.el,
    card("Estimated earnings", "video", (d) => [
      h("p", { class: "hero" }, range(d.earnings.total)),
      row("Per 1,000 views", range(d.earnings.rpm)),
      d.earnings.next_30_days && row("Next 30 days", range(d.earnings.next_30_days)),
      d.earnings.sponsorship && row("Sponsor deal", range(d.earnings.sponsorship)),
      h("p", { class: "note" }, "Estimate from public data. Only the channel owner sees real earnings."),
    ], "estimate"),
    card("Compared with the channel", "channel", (d) => [
      d.this_video.outlier_score != null && h("p", { class: "hero" }, `${d.this_video.outlier_score >= 10 ? Math.round(d.this_video.outlier_score) : d.this_video.outlier_score}×`),
      h("p", { class: "muted small" }, `the channel's usual (median ${compact(d.recent.median_views)} views over the last ${d.recent.count} uploads)`),
      row("Subscribers", compact(d.subscribers)),
      d.upload_rhythm && row("Uploads", `${d.upload_rhythm.per_week} a week`),
      d.profile && row("Channel created", d.profile.created),
      d.profile?.country && row("Country", d.profile.country),
    ]),
    card("Most replayed moments", "video", (d) => {
      if (!d.moments.available) return h("p", { class: "muted" }, "No replay graph for this video yet.");
      return [
        spark(d.moments.heatmap),
        ...d.moments.moments.map((m, i) =>
          h("button", { class: "moment", onclick: () => seek(tab.id, m.start) },
            h("i", {}, i + 1),
            h("span", {}, h("strong", { class: "num" }, `${clock(m.start)} – ${clock(m.end)}`), h("span", { class: "muted" }, ` ${m.strength}× replays`)))
        ),
        h("p", { class: "note" }, "Click a moment to jump to it."),
      ];
    }),
    card("Engagement", "video", (d) => [
      d.engagement?.like_rate != null && row("Like rate", `${d.engagement.like_rate}% (${d.engagement.verdict})`),
      d.engagement?.approval != null && row("Approval", `${d.engagement.approval}%`),
      d.forecast && row("Next 30 days", `${range(d.forecast.next_30_days, compact)} views`),
      row("Search readiness", `${d.seo.score}/100`),
    ], "mixed"),
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
        ...d.languages.slice(0, 3).map((l) => row(l.name, `${l.share}%`)),
        h("p", { class: "note" }, "Languages are a guess at the audience, from the top comments."),
      ];
    }),
    card("What the video says", "transcript", (d) =>
      d.available
        ? [
            d.words_per_minute && row("Speaking pace", `${d.words_per_minute} words/min (${d.pace})`),
            row("Main topics", d.keywords.slice(0, 5).map((k) => k.word).join(", ")),
          ]
        : h("p", { class: "muted" }, "No captions to read.")
    )
  );
  mountTabs(titleCard, analyticsPanel, detailsPanel(tab.id));
}

// ─── Details tab: facts about the video itself (all real data) ───

const CHIP_LIMIT = 30;

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
      d.max_height && row("Best quality", `${d.max_height}p${d.fps ? ` at ${d.fps} fps` : ""}`),
      d.language && row("Spoken language", languageName(d.language)),
      row("Visibility", d.privacy),
      row("License", d.license),
      row("Live", d.live_status),
      row("Age-restricted", d.age_restricted ? "Yes" : "No"),
      h("div", { class: "row" }, h("span", { class: "muted" }, "Video ID"),
        h("button", { class: "copy num", title: "Copy video ID", onclick: (e) => copy(e.currentTarget, d.video_id) }, d.video_id)),
    ]),
    card("Description", "details", (d) => {
      const text = (d.description || "").trim();
      if (!text) return h("p", { class: "muted" }, "No description.");
      const short = text.length > 280;
      return short
        ? h("details", { class: "desc" }, h("summary", {}, h("span", { class: "desc-preview" }, text.slice(0, 280) + "…"), h("span", { class: "more" }, "Show more")), h("p", { class: "desc-full" }, text))
        : h("p", { class: "desc-full" }, text);
    }),
    card("Chapters", "details", (d) =>
      d.chapters?.length
        ? [
            ...d.chapters.map((c) =>
              h("button", { class: "moment", onclick: () => seek(tabId, c.start) },
                h("span", { class: "num chapter-time" }, clock(c.start)), h("span", {}, c.title))),
            h("p", { class: "note" }, "Click a chapter to jump to it."),
          ]
        : h("p", { class: "muted" }, "This video has no chapters.")
    ),
    card("Tags", "details", (d) =>
      d.tags?.length
        ? h("ul", { class: "chips" }, ...d.tags.slice(0, CHIP_LIMIT).map((t) => h("li", {}, t)),
            d.tags.length > CHIP_LIMIT && h("li", { class: "muted" }, `+${d.tags.length - CHIP_LIMIT} more`))
        : h("p", { class: "muted" }, "No tags.")
    ),
    card("Captions", "details", (d) =>
      d.subtitles?.length
        ? h("ul", { class: "chips" }, ...d.subtitles.map((code) => h("li", {}, languageName(code))))
        : h("p", { class: "muted" }, "The creator hasn’t added captions (YouTube’s automatic ones may still exist).")
    )
  );
}

const full = (n) => (n == null ? "Hidden" : n.toLocaleString());

function languageName(code) {
  try {
    return new Intl.DisplayNames(undefined, { type: "language" }).of(code);
  } catch {
    return code;
  }
}

async function copy(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    button.dataset.copied = "true";
    setTimeout(() => delete button.dataset.copied, 1500);
  } catch {
    // clipboard blocked; the ID is still visible to select
  }
}

// ─── Analytics / Details tabs ───

const TABS = [
  { id: "analytics", label: "Analytics" },
  { id: "details", label: "Details" },
];

function mountTabs(titleCard, analyticsPanel, detailsPanelEl) {
  const panels = { analytics: analyticsPanel, details: detailsPanelEl };
  const buttons = TABS.map((t) =>
    h("button", { role: "tab", id: `tab-${t.id}`, "aria-controls": `panel-${t.id}`, class: "tab", onclick: () => select(t.id) }, t.label));
  const bar = h("div", { class: "tabs", role: "tablist", "aria-label": "View" }, ...buttons);

  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex((t) => t.id === current);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length].id;
    select(next);
    document.getElementById(`tab-${next}`).focus();
  });

  let current = "analytics";
  function select(id) {
    current = id;
    TABS.forEach((t, i) => {
      const on = t.id === id;
      buttons[i].setAttribute("aria-selected", String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      panels[t.id].hidden = !on;
    });
    try {
      localStorage.setItem("viewlens-tab", id);
    } catch {
      // storage unavailable; the choice just isn't remembered
    }
  }

  let saved = "analytics";
  try {
    saved = localStorage.getItem("viewlens-tab") || "analytics";
  } catch {
    // ignore
  }
  select(panels[saved] ? saved : "analytics");
  app.replaceChildren(titleCard, bar, analyticsPanel, detailsPanelEl);
}

main();

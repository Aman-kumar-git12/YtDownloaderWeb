// Copied from src/lib/highlights.js (the extension has no build step). Keep in sync.
import { formatCompact, formatMoneyRange, toClock } from "./format.js";

// Turns the insight data into the few findings that matter most for this video,
// ranked by importance. tone: "good" | "warn" | "info".
export function buildHighlights({ video, channel, comments, transcript }) {
  const items = [];
  const add = (weight, tone, title, detail, action) => items.push({ weight, tone, title, detail, action });

  const ch = channel?.this_video;
  if (ch?.outlier_score != null && !ch.older_than_sample) {
    const s = ch.outlier_score;
    const x = s >= 10 ? Math.round(s) : s;
    if (s >= 3) add(100, "good", `A breakout: ${x}× the channel’s usual views`, `Their recent uploads get about ${formatCompact(channel.recent.median_views)} views each.`);
    else if (s >= 1.5) add(80, "good", `Beating the channel’s usual by ${x}×`, `Recent uploads get about ${formatCompact(channel.recent.median_views)} views each.`);
    else if (s < 0.67) add(85, "warn", `Underperforming: ${x}× the channel’s usual views`, `Recent uploads get about ${formatCompact(channel.recent.median_views)} views each.`);
  } else if (ch?.outlier_score >= 3) {
    add(70, "good", `One of the channel’s biggest videos (${Math.round(ch.outlier_score)}× recent uploads)`, "It’s older, so it has had years to collect views.");
  }

  if (video) {
    const e = video.earnings;
    if (e.monetized_likely) add(90, "info", `Likely earned ${formatMoneyRange(e.total)} from ads`, "Estimate. Only the owner sees real earnings.");
    else add(60, "warn", "Probably not earning from ads yet", "The channel looks too small to be in YouTube’s Partner Program.");

    const best = [...(video.moments.moments || [])].sort((a, b) => b.strength - a.strength)[0];
    if (best) {
      add(
        88,
        "info",
        `Most replayed: ${toClock(best.start)}–${toClock(best.end)}${best.chapter ? `, “${best.chapter}”` : ""}`,
        `Viewers rewatch this ${best.strength}× more than the rest.`,
        { label: "Clip this", start: best.start, end: best.end }
      );
    }

    if (video.sponsor_seconds > 0) {
      add(75, "info", `Has a paid sponsor segment (${video.sponsor_seconds} s)`, e.sponsorship ? `A deal like this is often worth ${formatMoneyRange(e.sponsorship)}.` : "");
    }

    const eng = video.engagement;
    if (eng?.verdict === "exceptional" || eng?.verdict === "strong") {
      add(65, "good", `Viewers love it: ${eng.like_rate}% like rate`, "Most videos sit between 1.5% and 3.5%.");
    } else if (eng?.verdict === "low") {
      add(55, "warn", `Low like rate: ${eng.like_rate}%`, "Most videos sit between 1.5% and 3.5%.");
    }
    if (eng?.approval != null && eng.approval < 80) {
      add(70, "warn", `Divisive: only ${eng.approval}% approval`, "Based on estimated dislikes.");
    }

    const f = video.forecast;
    if (f?.stage === "launch" || f?.stage === "growing") {
      add(50, "info", `Still growing: about ${formatCompact(f.views_per_day_lifetime)} views a day`, `Forecast: ${formatCompact(f.next_30_days[0])}–${formatCompact(f.next_30_days[1])} more views in 30 days.`);
    }

    const failed = video.seo.checks.filter((c) => !c.passed);
    if (video.seo.score < 60 && failed.length) {
      add(58, "warn", `Weak search setup: ${video.seo.score}/100`, `Biggest fixes: ${failed.slice(0, 2).map((c) => c.label.toLowerCase()).join(", ")}.`);
    }
  }

  if (comments?.sampled) {
    const m = comments.mood;
    if (m.negative >= 25) add(78, "warn", `${m.negative}% of top comments are negative`, comments.keywords?.length ? `People keep mentioning: ${comments.keywords.slice(0, 3).map((k) => k.word).join(", ")}.` : "");
    else if (m.positive >= 40) add(52, "good", `Comments are mostly positive (${m.positive}%)`, "");
    const q = comments.questions?.[0];
    if (q && q.likes >= 20) add(45, "info", "Viewers’ top question", `“${q.text.length > 120 ? `${q.text.slice(0, 119)}…` : q.text}”`);
  }

  if (transcript?.available) {
    const p = transcript.title_words_in_first_minute;
    if (p.total >= 3 && p.found.length === 0) {
      add(48, "warn", "The opening doesn’t match the title", "None of the title’s words are said in the first minute.");
    }
  }

  return items.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

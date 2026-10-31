import { useState } from "react";
import { AlertTriangle, Check, Info, LogIn, RotateCcw, Scissors, TrendingUp, X } from "lucide-react";
import { buildHighlights } from "../../lib/highlights";
import ReplayChart from "./ReplayChart";
import {
  formatCompact,
  formatMoney,
  formatMoneyRange,
  formatTimestamp,
  toClock,
} from "../../lib/format";
import {
  GOOGLE_CLIENT_ID,
  TRAFFIC_NAMES,
  countryName,
  loadOwnerAnalytics,
  signInWithGoogle,
} from "../../lib/ownerAnalytics";

const ESTIMATE_NOTE = "Estimate from public data. Only the channel owner can see real earnings.";

// One card; shows a skeleton, an error with retry, or its content
const SOURCE_LABELS = { real: "Real data", estimate: "Estimate", mixed: "Real + estimates" };

function Card({ title, state, onRetry, wide, children, note, source = "real" }) {
  return (
    <section className={`insight ${wide ? "insight-wide" : ""}`} aria-busy={state?.status === "loading"}>
      <div className="insight-head">
        <h2>{title}</h2>
        <span className={`source source-${source}`}>{SOURCE_LABELS[source]}</span>
      </div>
      {!state || state.status === "loading" ? (
        <div className="insight-loading" aria-label="Loading">
          <span />
          <span />
          <span />
        </div>
      ) : state.status === "error" ? (
        <div className="insight-error" role="alert">
          <p>{state.error}</p>
          <button className="button button-secondary" onClick={onRetry}>
            <RotateCcw size={16} aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      ) : (
        children(state.data)
      )}
      {note && state?.status === "ready" && <p className="insight-note">{note}</p>}
    </section>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className="numeric">{value}</dd>
      {sub && <dd className="stat-sub">{sub}</dd>}
    </div>
  );
}

function Bars({ rows }) {
  const max = Math.max(...rows.map((r) => r.value || 0), 1);
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bars-label">{r.label}</span>
          <span className="bars-track" aria-hidden="true">
            <span className={`bars-fill ${r.highlight ? "is-highlight" : ""}`} style={{ width: `${((r.value || 0) / max) * 100}%` }} />
          </span>
          <span className="bars-value numeric">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}

function Words({ items }) {
  if (!items?.length) return <p className="muted">Not enough text to pick out themes.</p>;
  return (
    <ul className="tags">
      {items.map((k) => (
        <li key={k.word}>
          {k.word} <span className="muted numeric">{k.count}</span>
        </li>
      ))}
    </ul>
  );
}

const daysAgo = (days) => {
  const d = Math.round(days);
  return d < 1 ? "last upload today" : `last upload ${d} day${d === 1 ? "" : "s"} ago`;
};

const languageName = (code) => {
  if (!code) return "Unknown";
  try {
    return new Intl.DisplayNames(undefined, { type: "language" }).of(code);
  } catch {
    return code;
  }
};

const OUTLIER_TEXT = {
  breakout: "A breakout for this channel",
  "above usual": "Doing better than usual",
  usual: "About what this channel usually gets",
  "below usual": "Below this channel’s usual",
};

// ─── Cards ───

function Earnings({ data }) {
  const e = data.earnings;
  return (
    <>
      <p className="insight-hero numeric">{formatMoneyRange(e.total)}</p>
      <p className="muted">estimated ad earnings so far, from {formatCompact(data.views)} views</p>
      <dl className="stats">
        <Stat label="Per 1,000 views" value={`${formatMoney(e.rpm[0])} – ${formatMoney(e.rpm[1])}`} />
        <Stat label="Average per day" value={formatMoneyRange(e.per_day)} sub="since upload" />
        {e.next_30_days && <Stat label="Next 30 days" value={formatMoneyRange(e.next_30_days)} sub="if views slow as usual" />}
        {e.sponsorship && <Stat label="Sponsor deal" value={formatMoneyRange(e.sponsorship)} sub="a sponsor segment was spotted" />}
      </dl>
      {!e.monetized_likely && <p className="insight-warning">This channel is probably too small to run ads yet.</p>}
      <details className="insight-how">
        <summary>How this was worked out</summary>
        <ul>
          {e.factors.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </details>
    </>
  );
}

function Moments({ data, onClip }) {
  const m = data.moments;
  if (!m.available) {
    return <p className="muted">YouTube hasn’t published a replay graph for this video yet. It appears once a video has enough views.</p>;
  }
  return (
    <>
      <ReplayChart heatmap={m.heatmap} duration={data.duration_seconds} moments={m.moments} />
      {m.moments.length ? (
        <ol className="moments">
          {m.moments.map((moment, i) => (
            <li key={moment.peak}>
              <span className="moment-index numeric" aria-hidden="true">{i + 1}</span>
              <div>
                <strong className="numeric">
                  {toClock(moment.start)} – {toClock(moment.end)}
                </strong>
                <span className="muted">
                  {" "}
                  {moment.strength}× the average replays{moment.chapter ? `, in “${moment.chapter}”` : ""}
                </span>
              </div>
              <button className="button button-secondary" onClick={() => onClip(moment.start, moment.end)}>
                <Scissors size={16} aria-hidden="true" />
                <span>Clip this</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Viewers watch this evenly; no moment stands out.</p>
      )}
    </>
  );
}

function Engagement({ data }) {
  const e = data.engagement;
  const f = data.forecast;
  return (
    <dl className="stats">
      {e?.like_rate != null && <Stat label="Like rate" value={`${e.like_rate}%`} sub={`${e.verdict} (typical is 1.5–3.5%)`} />}
      {e?.comment_rate != null && <Stat label="Comments" value={`${e.comment_rate} per 1,000 views`} />}
      {e?.approval != null && (
        <Stat label="Approval" value={`${e.approval}%`} sub={`about ${formatCompact(e.dislikes)} dislikes (estimate)`} />
      )}
      {f && <Stat label="Views per day" value={formatCompact(f.views_per_day_lifetime)} sub={`average over ${Math.round(f.age_days)} days`} />}
      {f && (
        <Stat
          label="Next 30 days"
          value={`${formatCompact(f.next_30_days[0])} – ${formatCompact(f.next_30_days[1])} views`}
          sub={`forecast; this video is in its ${f.stage} stage`}
        />
      )}
    </dl>
  );
}

function Channel({ data }) {
  const v = data.this_video;
  const r = data.recent;
  const rhythm = data.upload_rhythm;
  const sl = data.shorts_vs_long;
  return (
    <>
      {v.outlier_score != null && (
        <>
          <p className="insight-hero numeric">{v.outlier_score >= 10 ? Math.round(v.outlier_score) : v.outlier_score}×</p>
          <p>
            {OUTLIER_TEXT[v.label]}: the last {r.count} uploads have a median of {formatCompact(r.median_views)} views.
          </p>
          {v.older_than_sample && (
            <p className="muted">This video is older than those uploads, so it has had more time to collect views.</p>
          )}
        </>
      )}
      <dl className="stats">
        <Stat label="Subscribers" value={formatCompact(data.subscribers)} sub={data.verified ? "verified channel" : null} />
        {r.views_per_subscriber != null && (
          <Stat label="Typical reach" value={`${(r.views_per_subscriber * 100).toFixed(1)}%`} sub="of subscribers watch a new upload" />
        )}
        {rhythm && (
          <Stat
            label="Uploads"
            value={`${rhythm.per_week} a week`}
            sub={`${rhythm.status}${rhythm.consistency ? `, ${rhythm.consistency}` : ""}; ${daysAgo(rhythm.days_since_last)}`}
          />
        )}
        {sl.shorts_median_views != null && (
          <Stat
            label="Shorts vs videos"
            value={`${formatCompact(sl.shorts_median_views)} vs ${formatCompact(sl.long_median_views)}`}
            sub="median views each"
          />
        )}
      </dl>

      {data.by_length.length > 1 && (
        <>
          <h3>Which lengths work best</h3>
          <Bars
            rows={data.by_length.map((row) => ({
              label: row.label,
              value: row.median_views,
              display: `${formatCompact(row.median_views)} · ${row.videos} video${row.videos === 1 ? "" : "s"}`,
              highlight: row.median_views === Math.max(...data.by_length.map((x) => x.median_views)),
            }))}
          />
        </>
      )}

      {data.best_posting && (
        <>
          <h3>Best day to post</h3>
          <Bars
            rows={data.best_posting.days.map((d) => ({
              label: d.day.slice(0, 3),
              value: d.vs_channel,
              display: `${d.vs_channel}× · ${d.videos}`,
              highlight: d.day === data.best_posting.best_day?.day,
            }))}
          />
          {data.best_posting.usual_hour_utc && (
            <p className="muted">Usually posts around {data.best_posting.usual_hour_utc.hour_utc}:00 UTC.</p>
          )}
        </>
      )}

      {r.breakouts.length > 0 && (
        <>
          <h3>Recent breakouts</h3>
          <ul className="plain-list">
            {r.breakouts.map((b) => (
              <li key={b.id}>
                <a href={`https://www.youtube.com/watch?v=${b.id}`} target="_blank" rel="noreferrer">
                  {b.title}
                </a>
                <span className="muted numeric"> {b.score}× · {formatCompact(b.views)} views</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.profile ? (
        <dl className="stats stats-ruled">
          <Stat label="Channel created" value={formatTimestamp(Date.parse(data.profile.created) / 1000)} sub={`${data.profile.age_years} years ago`} />
          {data.profile.country && <Stat label="Country" value={countryName(data.profile.country)} />}
          <Stat label="Total views" value={formatCompact(data.profile.total_views)} sub={`${formatCompact(data.profile.views_per_video)} per video`} />
          <Stat label="Videos" value={formatCompact(data.profile.video_count)} sub={`${data.profile.videos_per_year} a year`} />
          {data.profile.subscribers_per_year && <Stat label="Growth" value={`${formatCompact(data.profile.subscribers_per_year)} subs a year`} sub="on average" />}
          {data.profile.topics.length > 0 && <Stat label="Topics" value={data.profile.topics.join(", ")} />}
        </dl>
      ) : (
        <p className="insight-note">Channel age, country and exact posting times appear when the server has a YouTube Data API key.</p>
      )}
    </>
  );
}

function Comments({ data }) {
  if (!data.sampled) return <p className="muted">Comments are turned off or there aren’t any yet.</p>;
  const mood = data.mood;
  return (
    <>
      <div className="mood" role="img" aria-label={`${mood.positive}% positive, ${mood.neutral}% neutral, ${mood.negative}% negative`}>
        <span className="mood-positive" style={{ flexGrow: mood.positive }} />
        <span className="mood-neutral" style={{ flexGrow: mood.neutral }} />
        <span className="mood-negative" style={{ flexGrow: mood.negative }} />
      </div>
      <p className="mood-legend numeric">
        <span><i className="mood-positive" />{mood.positive}% positive</span>
        <span><i className="mood-neutral" />{mood.neutral}% neutral</span>
        <span><i className="mood-negative" />{mood.negative}% negative</span>
      </p>
      <p className="muted">From the top {data.sampled} of {formatCompact(data.total)} comments.</p>

      {data.top_comment && (
        <blockquote className="quote">
          {data.top_comment.text}
          <footer className="numeric">{formatCompact(data.top_comment.likes)} likes</footer>
        </blockquote>
      )}

      {data.questions.length > 0 && (
        <>
          <h3>What viewers are asking</h3>
          <ul className="plain-list">
            {data.questions.map((q) => (
              <li key={q.text}>
                {q.text} <span className="muted numeric">{formatCompact(q.likes)} likes</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Words that keep coming up</h3>
      <Words items={data.keywords} />
      {data.creator_replies > 0 && <p className="muted">The creator replied in {data.creator_replies} of these.</p>}
    </>
  );
}

function Audience({ comments, video }) {
  const languages = comments?.languages || [];
  const captions = video?.technical.caption_languages || [];
  return (
    <>
      {languages.length ? (
        <Bars
          rows={languages.map((l) => ({
            label: l.name,
            value: l.share,
            display: `${l.share}%`,
          }))}
        />
      ) : (
        <p className="muted">Not enough comments to guess where viewers are.</p>
      )}
      {languages.length > 0 && (
        <ul className="plain-list">
          {languages.slice(0, 3).map((l) => (
            <li key={l.code}>
              <strong>{l.name}</strong> <span className="muted">usually means {l.likely_countries.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
      {captions.length > 0 && (
        <p className="muted">
          The creator added captions in {captions.length} language{captions.length === 1 ? "" : "s"}, a sign of who they’re reaching for.
        </p>
      )}
    </>
  );
}

function Transcript({ data }) {
  if (!data.available) {
    return (
      <p className="muted">
        {data.reason === "blocked"
          ? "YouTube didn’t let the server read the captions right now. Try again in a few minutes."
          : "This video has no captions to read."}
      </p>
    );
  }
  const promise = data.title_words_in_first_minute;
  return (
    <>
      <dl className="stats">
        {data.words_per_minute && <Stat label="Speaking pace" value={`${data.words_per_minute} words/min`} sub={data.pace} />}
        {data.speech_share != null && <Stat label="Talking time" value={`${data.speech_share}%`} sub="of the video has speech" />}
        <Stat label="Words spoken" value={formatCompact(data.word_count)} sub={`about ${data.reading_minutes} min to read`} />
      </dl>
      {data.hook && (
        <>
          <h3>The first 30 seconds</h3>
          <blockquote className="quote">{data.hook}</blockquote>
          {promise.total > 0 && (
            <p className="muted">
              {promise.found.length
                ? `The opening minute mentions ${promise.found.length} of ${promise.total} title words (${promise.found.join(", ")}).`
                : "The opening minute doesn’t repeat any of the title’s words. Viewers may wonder if it’s what they clicked for."}
            </p>
          )}
        </>
      )}
      <h3>Main topics</h3>
      <Words items={data.keywords} />
      <p className="insight-note">From {data.source === "creator" ? "the creator’s captions" : "YouTube’s automatic captions"}.</p>
    </>
  );
}

function Seo({ data }) {
  const seo = data.seo;
  return (
    <>
      <p className="insight-hero numeric">
        {seo.score}
        <span className="insight-hero-unit">/100</span>
      </p>
      <ul className="checks">
        {seo.checks.map((c) => (
          <li key={c.label} className={c.passed ? "is-pass" : "is-fail"}>
            {c.passed ? <Check size={16} aria-label="Passed" /> : <X size={16} aria-label="Needs work" />}
            <div>
              <strong>{c.label}</strong>
              <span className="muted">{c.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Segments({ data }) {
  const segments = data.sponsor_segments;
  if (segments === null) return <p className="muted">The sponsor database didn’t answer. Try again later.</p>;
  if (!segments.length) return <p className="muted">Viewers haven’t marked any sponsors, intros or reminders in this video.</p>;
  const duration = data.duration_seconds || 1;
  return (
    <>
      <div className="segment-strip" aria-hidden="true">
        {segments.map((s) => (
          <span
            key={`${s.category}-${s.start}`}
            className={`segment segment-${s.category === "sponsor" ? "sponsor" : "other"}`}
            style={{ left: `${(s.start / duration) * 100}%`, width: `${Math.max(((s.end - s.start) / duration) * 100, 0.6)}%` }}
          />
        ))}
      </div>
      <ul className="plain-list">
        {segments.map((s) => (
          <li key={`${s.category}-${s.start}`}>
            <strong>{s.label}</strong>{" "}
            <span className="muted numeric">
              {toClock(s.start)} – {toClock(s.end)} ({Math.round(s.end - s.start)} s)
            </span>
          </li>
        ))}
      </ul>
      <p className="insight-note">Marked by SponsorBlock viewers.</p>
    </>
  );
}

function Technical({ data }) {
  const t = data.technical;
  const rows = [
    ["Best quality", t.max_height ? `${t.max_height}p${t.fps ? ` at ${t.fps} fps` : ""}${t.hdr ? ", HDR" : ""}` : "Unknown"],
    ["Spoken language", languageName(t.language)],
    ["Creator captions", t.caption_languages.length ? `${t.caption_languages.length} languages` : "None"],
    ["Can be embedded", t.embeddable === false ? "No" : "Yes"],
    ["Age-restricted", t.age_restricted ? "Yes" : "No"],
    ["Made for kids", t.made_for_kids == null ? "Unknown" : t.made_for_kids ? "Yes" : "No"],
    ["Uploaded", formatTimestamp(data.published)],
  ];
  if (t.topics.length) rows.push(["YouTube topics", t.topics.join(", ")]);
  return (
    <dl>
      {rows.map(([label, value]) => (
        <div key={label} className="facts-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const TONE_ICONS = { good: TrendingUp, warn: AlertTriangle, info: Info };
const TONE_LABELS = { good: "Good sign", warn: "Watch out", info: "Worth knowing" };

function Highlights({ insights, onClip }) {
  const ready = (part) => (insights[part]?.status === "ready" ? insights[part].data : null);
  const items = buildHighlights({
    video: ready("video"),
    channel: ready("channel"),
    comments: ready("comments"),
    transcript: ready("transcript"),
  });
  const stillLoading = Object.values(insights).some((p) => p?.status === "loading");

  return (
    <section className="insight insight-wide highlights" aria-busy={stillLoading && !items.length}>
      <div className="insight-head">
        <h2>What stands out</h2>
        {stillLoading && <span className="muted small-text">Still reading comments and captions…</span>}
      </div>
      {!items.length ? (
        stillLoading ? (
          <div className="insight-loading" aria-label="Loading">
            <span />
            <span />
          </div>
        ) : (
          <p className="muted">Nothing unusual about this video; it’s performing as expected.</p>
        )
      ) : (
        <ol className="highlight-list">
          {items.map((item, i) => {
            const Icon = TONE_ICONS[item.tone];
            return (
              <li key={item.title} className={`highlight highlight-${item.tone}`} style={{ animationDelay: `${i * 60}ms` }}>
                <Icon size={18} aria-label={TONE_LABELS[item.tone]} />
                <div>
                  <strong>{item.title}</strong>
                  {item.detail && <span className="muted">{item.detail}</span>}
                </div>
                {item.action && (
                  <button className="button button-secondary" onClick={() => onClip(item.action.start, item.action.end)}>
                    <Scissors size={16} aria-hidden="true" />
                    <span>{item.action.label}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function OwnerAnalytics({ video }) {
  const [state, setState] = useState({ status: "idle" });
  if (!GOOGLE_CLIENT_ID || !video) return null;

  const connect = async () => {
    setState({ status: "loading" });
    try {
      const token = await signInWithGoogle();
      const data = await loadOwnerAnalytics(token, video.video_id, video.channel_id);
      setState({ status: "ready", data });
    } catch (err) {
      setState({ status: "error", error: err.message });
    }
  };

  const d = state.data;
  return (
    <section className="insight insight-wide insight-owner">
      <h2>Your real numbers</h2>
      {state.status !== "ready" ? (
        <>
          <p className="muted">
            Is this your video? Sign in with the Google account that owns the channel to see real earnings, countries,
            watch time and where viewers came from. Nothing is stored.
          </p>
          {state.error && <p className="insight-warning" role="alert">{state.error}</p>}
          <button className="button button-primary" onClick={connect} disabled={state.status === "loading"}>
            <LogIn size={16} aria-hidden="true" />
            <span>{state.status === "loading" ? "Loading your numbers…" : "Sign in with Google"}</span>
          </button>
        </>
      ) : (
        <>
          <dl className="stats">
            {d.totals.revenueAvailable && <Stat label="Earnings" value={formatMoney(d.totals.estimatedRevenue)} sub="from YouTube Analytics" />}
            <Stat label="Views" value={formatCompact(d.totals.views)} />
            <Stat label="Watch time" value={`${formatCompact(Math.round((d.totals.estimatedMinutesWatched || 0) / 60))} hours`} />
            <Stat label="Average view" value={toClock(d.totals.averageViewDuration || 0)} sub={`${Math.round(d.totals.averageViewPercentage || 0)}% of the video`} />
            <Stat label="Subscribers gained" value={formatCompact(d.totals.subscribersGained)} />
          </dl>
          <div className="owner-grid">
            <div>
              <h3>Top countries</h3>
              <Bars rows={d.countries.map((c) => ({ label: countryName(c.country), value: c.views, display: formatCompact(c.views) }))} />
            </div>
            <div>
              <h3>Where viewers came from</h3>
              <Bars
                rows={d.traffic.slice(0, 8).map((t) => ({
                  label: TRAFFIC_NAMES[t.insightTrafficSourceType] || t.insightTrafficSourceType,
                  value: t.views,
                  display: formatCompact(t.views),
                }))}
              />
            </div>
          </div>
          {d.audience.length > 0 && (
            <>
              <h3>Who watches</h3>
              <Bars
                rows={d.audience
                  .filter((a) => a.viewerPercentage >= 1)
                  .map((a) => ({
                    label: `${a.ageGroup.replace("age", "")} ${a.gender === "female" ? "women" : a.gender === "male" ? "men" : "other"}`,
                    value: a.viewerPercentage,
                    display: `${a.viewerPercentage.toFixed(1)}%`,
                  }))}
              />
            </>
          )}
          <p className="insight-note">Signed in as {d.channel}. Reload the page to sign out.</p>
        </>
      )}
    </section>
  );
}

export default function InsightsPanel({ insights, onRetry, onClip }) {
  const { video, channel, comments, transcript } = insights;
  const v = video?.status === "ready" ? video.data : null;
  const c = comments?.status === "ready" ? comments.data : null;
  const audienceState = !comments || comments.status === "loading" ? comments : { status: "ready", data: c };

  return (
    <div className="insights">
      <Highlights insights={insights} onClip={onClip} />
      <Card title="Estimated earnings" source="estimate" state={video} onRetry={() => onRetry("video")} note={ESTIMATE_NOTE}>
        {(data) => <Earnings data={data} />}
      </Card>
      <Card title="Compared with the channel" state={channel} onRetry={() => onRetry("channel")}>
        {(data) => <Channel data={data} />}
      </Card>
      <Card title="Most replayed moments" state={video} onRetry={() => onRetry("video")} wide>
        {(data) => <Moments data={data} onClip={onClip} />}
      </Card>
      <Card title="Engagement and outlook" source="mixed" state={video} onRetry={() => onRetry("video")}>
        {(data) => <Engagement data={data} />}
      </Card>
      <Card
        title="Likely audience"
        source="estimate"
        state={comments?.status === "error" ? comments : audienceState}
        onRetry={() => onRetry("comments")}
        note="A guess from comment languages. Exact countries are only visible to the channel owner."
      >
        {() => <Audience comments={c} video={v} />}
      </Card>
      <Card title="What viewers are saying" state={comments} onRetry={() => onRetry("comments")}>
        {(data) => <Comments data={data} />}
      </Card>
      <Card title="What the video says" state={transcript} onRetry={() => onRetry("transcript")}>
        {(data) => <Transcript data={data} />}
      </Card>
      <Card title="Search readiness" state={video} onRetry={() => onRetry("video")}>
        {(data) => <Seo data={data} />}
      </Card>
      <Card title="Sponsors and segments" state={video} onRetry={() => onRetry("video")}>
        {(data) => <Segments data={data} />}
      </Card>
      <Card title="Technical" state={video} onRetry={() => onRetry("video")}>
        {(data) => <Technical data={data} />}
      </Card>
      <OwnerAnalytics video={v} />
    </div>
  );
}

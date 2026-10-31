import { formatCompact, formatDate, formatDuration } from "../lib/format";

export default function VideoSummary({ meta }) {
  const facts = [
    { label: "Length", value: formatDuration(meta.duration) },
    { label: "Views", value: formatCompact(meta.views) },
    { label: "Uploaded", value: formatDate(meta.upload_date) },
  ];

  return (
    <section className="summary" aria-label="Video">
      <div className="summary-frame">
        {meta.thumbnail ? (
          <img src={meta.thumbnail} alt="" width="640" height="360" />
        ) : (
          <div className="summary-frame-empty" />
        )}
      </div>
      <div className="summary-text">
        <h1 className="summary-title">{meta.title}</h1>
        {meta.channel_url ? (
          <a className="summary-channel" href={meta.channel_url} target="_blank" rel="noreferrer">
            {meta.channel}
          </a>
        ) : (
          <p className="summary-channel">{meta.channel}</p>
        )}
        <dl className="summary-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

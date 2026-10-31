import { formatCount, formatDate, formatDuration } from "../lib/format";

function Facts({ title, rows }) {
  return (
    <section className="facts">
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="facts-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function DetailsPanel({ meta }) {
  return (
    <div className="details">
      <Facts
        title="Engagement"
        rows={[
          ["Views", formatCount(meta.views)],
          ["Likes", formatCount(meta.likes)],
          ["Comments", formatCount(meta.comments)],
          ["Channel subscribers", formatCount(meta.subscribers)],
        ]}
      />
      <Facts
        title="Video"
        rows={[
          ["Video ID", meta.video_id],
          ["Length", formatDuration(meta.duration)],
          ["Uploaded", formatDate(meta.upload_date)],
          ["Category", meta.categories?.join(", ") || "None"],
          ["Visibility", meta.privacy],
          ["License", meta.license],
          ["Age-restricted", meta.age_restricted ? "Yes" : "No"],
          ["Live", meta.live_status],
          ["Available streams", meta.total_formats],
          ["Subtitles", meta.subtitles?.length ? meta.subtitles.join(", ") : "None"],
        ]}
      />

      {meta.description_snippet && meta.description_snippet !== "None" && (
        <section className="facts facts-wide">
          <h2>Description</h2>
          <p className="description">{meta.description_snippet}</p>
        </section>
      )}

      {meta.total_chapters > 0 && (
        <section className="facts">
          <h2>Chapters ({meta.total_chapters})</h2>
          <ol className="chapters">
            {meta.chapters_preview.map((chapter) => (
              <li key={chapter} className="numeric">{chapter}</li>
            ))}
            {meta.total_chapters > meta.chapters_preview.length && (
              <li className="muted">and {meta.total_chapters - meta.chapters_preview.length} more</li>
            )}
          </ol>
        </section>
      )}

      {meta.tags?.length > 0 && (
        <section className="facts facts-wide">
          <h2>Tags</h2>
          <ul className="tags">
            {meta.tags.slice(0, 24).map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

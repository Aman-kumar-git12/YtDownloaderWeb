import { Clipboard, Link2, LoaderCircle } from "lucide-react";
import PencilMark from "./PencilMark";

const FRAMES = [
  { title: "Video", detail: "MP4 up to 4K, whole or a clip" },
  { title: "Audio", detail: "MP3 or M4A with cover art, WAV, FLAC, AAC" },
  { title: "Subtitles", detail: "SRT or VTT in every language" },
  { title: "Thumbnail", detail: "JPG or WebP, up to 1920×1080" },
  { title: "Details", detail: "Views, likes, tags and chapters" },
];

export default function Hero({ url, setUrl, onSubmit, onPaste, analyzing, serverWaking, error }) {
  return (
    <main className="hero" id="main">
      <div className="shell">
        <h1 className="hero-title">
          <span className="hero-line">Save any</span>{" "}
          <span className="hero-line hero-line-marked">
            YouTube video.
            <PencilMark shape="underline" className="hero-underline" />
          </span>
        </h1>
        <p className="hero-lede">
          Download it as MP4 or audio, grab the thumbnail, or look up its details.
          Paste a link to start.
        </p>

        <form className="link-form" onSubmit={onSubmit} noValidate>
          <label className="link-field">
            <span className="visually-hidden">YouTube link</span>
            <Link2 className="link-icon" size={20} aria-hidden="true" />
            <input
              id="url-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck="false"
              placeholder="youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={onPaste}
              aria-invalid={Boolean(error)}
              aria-describedby="link-help"
            />
            <button type="button" className="paste-button" onClick={() => onPaste()}>
              <Clipboard size={16} aria-hidden="true" />
              <span>Paste</span>
            </button>
          </label>
          <button className="button button-primary submit-button" type="submit" disabled={analyzing}>
            {analyzing ? (
              <>
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
                <span>Getting formats…</span>
              </>
            ) : (
              <span>Get formats</span>
            )}
          </button>
        </form>

        <p id="link-help" className={`form-help ${error ? "form-help-error" : ""}`} role={error ? "alert" : "status"}>
          {error ||
            (serverWaking
              ? "The server is starting up. Your first request can take up to a minute."
              : "Works with videos and Shorts. Playlists aren't supported.")}
        </p>
      </div>

      <section className="filmstrip" aria-label="What you can save">
        <ul className="filmstrip-frames">
          {FRAMES.map((frame) => (
            <li key={frame.title} className="frame">
              <strong>{frame.title}</strong>
              <span>{frame.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="shell fine-print">
        For personal use. Only download videos you have the right to, and respect creators and YouTube's terms.
      </p>
    </main>
  );
}

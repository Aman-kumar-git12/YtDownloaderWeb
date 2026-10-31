import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeft, RotateCcw } from "lucide-react";
import Logo from "./components/Logo";
import Hero from "./components/Hero";
import VideoSummary from "./components/VideoSummary";
import FormatList from "./components/FormatList";
import ThumbnailGrid from "./components/ThumbnailGrid";
import DetailsPanel from "./components/DetailsPanel";
import SubtitleList from "./components/SubtitleList";
import ClipPicker from "./components/ClipPicker";
import { readClip } from "./lib/clip";
import PencilMark from "./components/PencilMark";
import InsightsPanel from "./components/insights/InsightsPanel";
import {
  wakeServer,
  fetchMetadata,
  fetchVideoResolutions,
  fetchAudioFormats,
  fetchThumbnailResolutions,
  fetchSubtitles,
  downloadVideo,
  downloadAudio,
  downloadThumbnail,
  downloadSubtitles,
  fetchInsights,
  fetchChannelInsights,
  fetchCommentInsights,
  fetchTranscriptInsights,
} from "./api";
import { findYouTubeUrl, isYouTubeUrl, normalizeUrl, toClock } from "./lib/format";

const TABS = [
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "subtitles", label: "Subtitles" },
  { id: "thumbnail", label: "Thumbnail" },
  { id: "insights", label: "Insights" },
  { id: "details", label: "Details" },
];

const INSIGHT_LOADERS = {
  video: fetchInsights,
  channel: fetchChannelInsights,
  comments: fetchCommentInsights,
  transcript: fetchTranscriptInsights,
};

const LOADERS = {
  video: fetchVideoResolutions,
  audio: fetchAudioFormats,
  subtitles: fetchSubtitles,
  thumbnail: fetchThumbnailResolutions,
};

const DOWNLOADERS = {
  video: downloadVideo,
  audio: downloadAudio,
  thumbnail: downloadThumbnail,
  subtitles: downloadSubtitles,
};

const CLIPPABLE = ["video", "audio"];
const NO_CLIP = { enabled: false, start: "", end: "" };

// ?url=… from a shared link, or ?text=/?title= when shared from the YouTube
// app through the phone's share sheet (the installed app's share target)
const params = new URLSearchParams(window.location.search);
const initialUrl =
  params.get("url") || findYouTubeUrl(`${params.get("text") || ""} ${params.get("title") || ""}`);

function App() {
  const [url, setUrl] = useState(initialUrl);
  const [link, setLink] = useState(""); // the link that was analyzed
  const [meta, setMeta] = useState(null);
  const [panels, setPanels] = useState({}); // tab -> { status, data, error }
  const [insights, setInsights] = useState({}); // part -> { status, data, error }
  const [activeTab, setActiveTab] = useState("video");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [serverWaking, setServerWaking] = useState(false);
  const [download, setDownload] = useState(null);
  const [clip, setClip] = useState(NO_CLIP);
  const [subtitleFormat, setSubtitleFormat] = useState("srt");
  // Bumped on every new analysis so late responses for an old link are ignored
  const requestId = useRef(0);
  const autoStarted = useRef(false);

  const isDownloadRunning = download?.status === "downloading";

  // Wake the (possibly sleeping) server as soon as the page opens
  useEffect(() => {
    wakeServer(() => setServerWaking(true)).then(() => setServerWaking(false));
  }, []);

  // Cmd/Ctrl+K focuses the link field
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("url-input")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Elapsed-time counter for the running download
  useEffect(() => {
    if (!isDownloadRunning) return;
    const timer = setInterval(() => {
      setDownload((prev) => (prev ? { ...prev, elapsed: prev.elapsed + 1 } : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [isDownloadRunning]);

  const loadPanel = async (tab, videoUrl, id) => {
    setPanels((prev) => ({ ...prev, [tab]: { status: "loading" } }));
    try {
      const data = await LOADERS[tab](videoUrl);
      if (id !== requestId.current) return;
      setPanels((prev) => ({ ...prev, [tab]: { status: "ready", data } }));
    } catch (err) {
      if (id !== requestId.current) return;
      setPanels((prev) => ({ ...prev, [tab]: { status: "error", error: err.message } }));
    }
  };

  const loadInsight = async (part, videoUrl, id) => {
    setInsights((prev) => ({ ...prev, [part]: { status: "loading" } }));
    try {
      const data = await INSIGHT_LOADERS[part](videoUrl);
      if (id !== requestId.current) return;
      setInsights((prev) => ({ ...prev, [part]: { status: "ready", data } }));
    } catch (err) {
      if (id !== requestId.current) return;
      setInsights((prev) => ({ ...prev, [part]: { status: "error", error: err.message } }));
    }
  };

  // Insights are only fetched when the tab is opened (comments are slow to read)
  const loadInsights = (videoUrl, id) => {
    for (const part of Object.keys(INSIGHT_LOADERS)) loadInsight(part, videoUrl, id);
  };

  const analyze = async (rawValue) => {
    const normalized = normalizeUrl(rawValue);
    if (!normalized) return;
    if (!isYouTubeUrl(normalized)) {
      setError("That isn't a YouTube link. Paste one like youtube.com/watch?v=… or youtu.be/…");
      return;
    }

    const id = ++requestId.current;
    setError("");
    setAnalyzing(true);
    try {
      const data = await fetchMetadata(normalized);
      if (id !== requestId.current) return;
      setLink(normalized);
      setMeta(data);
      setPanels({});
      setInsights({});
      setActiveTab("video");
      setDownload(null);
      setClip(NO_CLIP);
      window.history.replaceState(null, "", `?url=${encodeURIComponent(normalized)}`);

      // Load the other tabs one after another in the background (the server
      // caches the video info, so these are quick) so switching tabs is instant.
      for (const tab of ["video", "audio", "subtitles", "thumbnail"]) {
        if (id !== requestId.current) return;
        await loadPanel(tab, normalized, id);
      }
    } catch (err) {
      if (id === requestId.current) setError(err.message || "This video couldn't be loaded. Try again.");
    } finally {
      if (id === requestId.current) setAnalyzing(false);
    }
  };

  // Open a shared link like /?url=https://youtu.be/…
  useEffect(() => {
    if (initialUrl && !autoStarted.current) {
      autoStarted.current = true;
      analyze(initialUrl);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    analyze(url);
  };

  // Pasting a YouTube link into the empty field (or using the Paste button) starts right away
  const handlePaste = async (event) => {
    let text;
    if (event) {
      if (url.trim()) return; // normal paste into existing text
      text = event.clipboardData?.getData("text") || "";
    } else {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        document.getElementById("url-input")?.focus();
        return;
      }
    }
    if (!text.trim()) return;
    if (isYouTubeUrl(normalizeUrl(text))) {
      event?.preventDefault();
      setUrl(text.trim());
      analyze(text);
    } else if (!event) {
      setUrl(text.trim());
    }
  };

  const reset = (e) => {
    e?.preventDefault();
    requestId.current++;
    setMeta(null);
    setLink("");
    setPanels({});
    setInsights({});
    setDownload(null);
    setError("");
    setAnalyzing(false);
    setUrl("");
    window.history.replaceState(null, "", window.location.pathname);
    requestAnimationFrame(() => document.getElementById("url-input")?.focus());
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    if (tab === "insights") {
      if (!insights.video) loadInsights(link, requestId.current);
    } else if (tab !== "details" && !panels[tab]) {
      loadPanel(tab, link, requestId.current);
    }
  };

  const handleTabKeys = (e) => {
    const index = TABS.findIndex((t) => t.id === activeTab);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const tab = TABS[(next + TABS.length) % TABS.length].id;
    selectTab(tab);
    document.getElementById(`tab-${tab}`)?.focus();
  };

  const handleDownload = async (tab, key) => {
    const { clip: range, error: clipError } = CLIPPABLE.includes(tab)
      ? readClip(clip, meta.duration_seconds)
      : { clip: null, error: "" };
    if (clipError) return; // the clip picker is already showing what's wrong

    const id = Date.now();
    // Only touch state that still belongs to this download
    const patch = (fields) => setDownload((prev) => (prev?.id === id ? { ...prev, ...fields } : prev));

    setDownload({ id, tab, key, status: "downloading", backendStatus: "queued", stage: null, elapsed: 0, percent: 0, speed: "" });
    try {
      await DOWNLOADERS[tab](
        link,
        key,
        (job) => patch({ percent: job.percent ?? 0, speed: job.speed || "", stage: job.stage, backendStatus: job.status }),
        range || undefined
      );
      patch({ status: "completed", percent: 100 });
      setTimeout(() => setDownload((prev) => (prev?.id === id ? null : prev)), 6000);
    } catch (err) {
      patch({ status: "error", error: err.message || "The download failed. Try again." });
    }
  };

  const renderPanel = () => {
    if (activeTab === "details") return <DetailsPanel meta={meta} />;
    if (activeTab === "insights") {
      return (
        <InsightsPanel
          insights={insights}
          onRetry={(part) => loadInsight(part, link, requestId.current)}
          onClip={(start, end) => {
            setClip({ enabled: true, start: toClock(start), end: toClock(Math.ceil(end)) });
            selectTab("video");
            window.scrollTo({ top: document.getElementById("tab-panel")?.offsetTop - 120 || 0, behavior: "smooth" });
          }}
        />
      );
    }

    const panel = panels[activeTab];
    if (!panel || panel.status === "loading") {
      return (
        <ul className="skeleton" aria-label="Loading formats">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} />
          ))}
        </ul>
      );
    }
    if (panel.status === "error") {
      return (
        <div className="panel-error" role="alert">
          <p>{panel.error}</p>
          <button className="button button-secondary" onClick={() => loadPanel(activeTab, link, requestId.current)}>
            <RotateCcw size={16} aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      );
    }

    const tabDownload = download?.tab === activeTab ? download : null;
    const props = {
      data: panel.data,
      download: tabDownload,
      busy: isDownloadRunning,
      onDownload: (key) => handleDownload(activeTab, key),
    };
    if (activeTab === "thumbnail") return <ThumbnailGrid {...props} />;
    if (activeTab === "subtitles") {
      return <SubtitleList {...props} format={subtitleFormat} setFormat={setSubtitleFormat} />;
    }
    const { clip: range } = readClip(clip, meta.duration_seconds);
    const scale = range && meta.duration_seconds ? (range.end - range.start) / meta.duration_seconds : 1;
    return (
      <>
        <ClipPicker clip={clip} setClip={setClip} duration={meta.duration_seconds} />
        <FormatList kind={activeTab} {...props} scale={scale} />
      </>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <a href="#main" className="skip-link">Skip to content</a>

        <header className="topbar">
          <div className="shell topbar-inner">
            <a href="/" className="brand" onClick={reset}>
              <Logo />
              <span>YT Downloader</span>
            </a>
            <div className="topbar-actions">
              {serverWaking && (
                <span className="server-pill" role="status">
                  <span className="pulse-dot" aria-hidden="true" />
                  Waking up server
                </span>
              )}
              {meta && (
                <button className="button button-secondary" onClick={reset}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>New link</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          {!meta ? (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Hero
                url={url}
                setUrl={setUrl}
                onSubmit={handleSubmit}
                onPaste={handlePaste}
                analyzing={analyzing}
                serverWaking={serverWaking}
                error={error}
              />
            </motion.div>
          ) : (
            <motion.main
              key="workspace"
              id="main"
              className="shell workspace"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <VideoSummary meta={meta} />

              <div className="tabs" role="tablist" aria-label="What to save" onKeyDown={handleTabKeys}>
                {TABS.map((tab) => {
                  const selected = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      role="tab"
                      aria-selected={selected}
                      aria-controls="tab-panel"
                      tabIndex={selected ? 0 : -1}
                      className={`tab ${selected ? "is-selected" : ""}`}
                      onClick={() => selectTab(tab.id)}
                    >
                      {tab.label}
                      {selected && (
                        <motion.span layoutId="tab-mark" className="tab-mark" transition={{ type: "spring", stiffness: 420, damping: 34 }}>
                          <PencilMark shape="underline" />
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </div>

              <section id="tab-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="panel">
                {renderPanel()}
              </section>
            </motion.main>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

export default App;

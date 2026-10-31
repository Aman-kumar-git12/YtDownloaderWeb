import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Link2,
  ArrowRight,
  Zap,
  Music2,
  Image as ImageIcon,
  ShieldCheck,
  Monitor,
  Headphones,
  Info,
  Download,
  AlertTriangle,
  CheckCircle,
  FileText,
  Hash,
  User,
  Users,
  Calendar,
  Clock,
  AlignLeft,
  Eye,
  ThumbsUp,
  MessageSquare,
  Tag,
  Folder,
  Lock,
  Radio,
  BookOpen,
  Settings,
  Languages,
} from "lucide-react";
import confetti from "canvas-confetti";
import {
  fetchMetadata,
  fetchVideoResolutions,
  fetchAudioFormats,
  fetchThumbnailResolutions,
  downloadVideo,
  downloadAudio,
  downloadThumbnail,
} from "./api";

const DOWNLOADERS = {
  video: downloadVideo,
  audio: downloadAudio,
  thumbnail: downloadThumbnail,
};

/* ─── Tabs config ─── */
const TABS = [
  { id: "metadata", label: "Metadata", icon: Info },
  { id: "video", label: "Video", icon: Monitor },
  { id: "audio", label: "Audio", icon: Headphones },
  { id: "thumbnail", label: "Thumbnail", icon: ImageIcon },
];

function App() {
  const [url, setUrl] = useState("");
  const [activeTab, setActiveTab] = useState("metadata");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [cache, setCache] = useState({});
  // Lives here (not in DownloadList) so switching tabs doesn't lose the progress UI
  const [download, setDownload] = useState(null);

  const currentData = cache[activeTab] || null;
  const isDownloadRunning = download?.status === "downloading";

  // Elapsed-time counter for the running download
  useEffect(() => {
    if (!isDownloadRunning) return;
    const timer = setInterval(() => {
      setDownload((prev) => (prev ? { ...prev, elapsed: prev.elapsed + 1 } : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [isDownloadRunning]);

  // Keyboard shortcut (Cmd+K or Ctrl+K) to focus input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("url-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const triggerConfetti = () => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.8 },
      colors: ["#ff1744", "#ff3d61", "#e11d48"],
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.8 },
      colors: ["#ff1744", "#ff3d61", "#e11d48"],
    });
  };

  const handleConnect = useCallback(
    async (e) => {
      e.preventDefault();
      const normalizedUrl = url.trim();
      if (!normalizedUrl) return;
      if (!isYouTubeUrl(normalizedUrl)) {
        setError("Enter a valid YouTube link, e.g. youtube.com/watch?v=…");
        return;
      }
      setError("");
      setSuccess("");
      setCache({});
      setVideoTitle("");
      setIsSubmitting(true);
      try {
        // Fetch metadata first. Starting four independent yt-dlp extractions
        // at once can trigger YouTube rate limits and bot checks. The other
        // data is loaded only when its tab is opened.
        const metadata = await fetchMetadata(normalizedUrl);

        setUrl(normalizedUrl);
        setVideoTitle(metadata?.title || "");
        setCache({ metadata });
        setActiveTab("metadata");
        setConnected(true);
      } catch (err) {
        setError(
          err.message ||
            "Could not analyze this link. Check the backend and try again."
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [url]
  );

  const handleDisconnect = () => {
    setConnected(false);
    setCache({});
    setDownload(null);
    setError("");
    setSuccess("");
    setVideoTitle("");
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setError("");
    setSuccess("");
    if (!cache[tabId] && connected) {
      fetchTabData(tabId, url);
    }
  };

  const fetchTabData = async (tab, videoUrl) => {
    setActiveTab(tab);
    setLoading(true);
    setError("");
    try {
      let data;
      switch (tab) {
        case "metadata":
          data = await fetchMetadata(videoUrl);
          setVideoTitle(data.title);
          break;
        case "video":
          data = await fetchVideoResolutions(videoUrl);
          if (data.title) setVideoTitle(data.title);
          break;
        case "audio":
          data = await fetchAudioFormats(videoUrl);
          if (data.title) setVideoTitle(data.title);
          break;
        case "thumbnail":
          data = await fetchThumbnailResolutions(videoUrl);
          if (data.title) setVideoTitle(data.title);
          break;
      }
      setCache((prev) => ({ ...prev, [tab]: data }));
    } catch (err) {
      setError(err.message || "Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  };

  const retryCurrentTab = () => {
    if (connected) fetchTabData(activeTab, url);
  };

  const handleDownload = async (tab, key) => {
    const id = Date.now();
    // Only touch state that still belongs to this download (the user may have
    // changed the link in the meantime).
    const patch = (fields) =>
      setDownload((prev) => (prev?.id === id ? { ...prev, ...fields } : prev));
    const clearLater = (ms) =>
      setTimeout(() => setDownload((prev) => (prev?.id === id ? null : prev)), ms);

    setError("");
    setSuccess("");
    setDownload({ id, tab, key, status: "downloading", backendStatus: "queued", elapsed: 0, percent: 0, speed: "" });

    try {
      await DOWNLOADERS[tab](url, key, (job) =>
        patch({ percent: job.percent ?? 0, speed: job.speed || "", backendStatus: job.status })
      );
      patch({ status: "completed", percent: 100 });
      setSuccess("Download completed — saved to your downloads.");
      triggerConfetti();
      setTimeout(() => setSuccess(""), 4000);
      clearLater(4000);
    } catch (err) {
      patch({ status: "error" });
      setError(err.message || "Download failed");
      clearLater(5000);
    }
  };

  /* ═══════════════════════════════════════════
     HERO (Not Connected) View
     ═══════════════════════════════════════════ */
  if (!connected) {
    return (
      <div className="app">
        <div className="background-overlay" />

        <header className="top-header">
          <div className="brand">
            <div className="brand-icon">
              <Play size={18} fill="white" />
            </div>
            <span>YT Downloader</span>
          </div>
          <div className="powered">
            <Zap size={15} />
            <span>Powered by yt-dlp</span>
          </div>
        </header>

        <main className="hero-wrapper">
          <motion.section
            className="hero-card"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="card-glow" />

            <div className="hero-content">
              <motion.div
                className="hero-logo"
                animate={{ y: [0, -4, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div className="logo-glow" />
                <div className="hero-logo-inner">
                  <Play size={48} fill="white" strokeWidth={0} />
                </div>
              </motion.div>

              <motion.h1
                className="hero-title"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5 }}
              >
                <span>YouTube</span> <strong>Downloader</strong>
              </motion.h1>

              <motion.p
                className="hero-description"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.5 }}
              >
                Paste any YouTube link to analyze metadata, download
                high-definition video, extract raw audio, or save thumbnail
                graphics.
              </motion.p>

              <motion.form
                className="download-form"
                onSubmit={handleConnect}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5 }}
              >
                <div className="input-box">
                  <Link2 className="input-icon" size={23} />
                  <input
                    id="url-input"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste a YouTube URL..."
                    aria-label="YouTube URL"
                    autoComplete="url"
                    inputMode="url"
                  />
                  <div className="shortcut">
                    <kbd>⌘</kbd>
                    <kbd>K</kbd>
                  </div>
                </div>

                <button
                  className="analyze-button"
                  type="submit"
                  disabled={!url.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="analyzing-state">
                      <span>Analyzing</span>
                      <span className="animated-dots">
                        <span className="dot dot-1">.</span>
                        <span className="dot dot-2">.</span>
                        <span className="dot dot-3">.</span>
                      </span>
                    </span>
                  ) : (
                    <>
                      <span>Analyze</span>
                      <ArrowRight size={19} strokeWidth={2.4} />
                    </>
                  )}
                </button>
              </motion.form>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    className="alert alert-error"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Features */}
              <motion.div
                className="feature-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.5 }}
              >
                <Feature icon={<Zap size={18} />} text="HD Quality" />
                <Divider />
                <Feature icon={<Music2 size={18} />} text="Extract Audio" />
                <Divider />
                <Feature
                  icon={<ImageIcon size={18} />}
                  text="Get Thumbnails"
                />
                <Divider />
                <Feature
                  icon={<ShieldCheck size={18} />}
                  text="Fast & Reliable"
                />
              </motion.div>
            </div>
          </motion.section>
        </main>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     CONNECTED View — Tabs + Content
     ═══════════════════════════════════════════ */
  return (
    <div className="app">
      <div className="background-overlay" />

      <header className="top-header">
        <div className="brand">
          <div className="brand-icon">
            <Play size={18} fill="white" />
          </div>
          <span>YT Downloader</span>
        </div>
        <div className="powered">
          <span className="connected-badge">
            <span className="connected-dot" />
            Connected
          </span>
        </div>
      </header>

      <main className="dashboard-wrapper">
        <motion.div
          className="dashboard-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Sticky Dashboard Navigation (Active link bar + Tab bar) */}
          <div className="sticky-dashboard-nav">
            {/* Active URL bar */}
            <div className="active-url-bar">
              <div className="active-url-info">
                <span className="connected-dot" />
                <span className="active-url-text">
                  Active: <strong>{videoTitle || url}</strong>
                </span>
              </div>
              <button className="change-link-btn" onClick={handleDisconnect}>
                Change Link
              </button>
            </div>

            {/* Tab Bar */}
            <div className="tab-bar">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`tab-item ${isActive ? "tab-active" : ""}`}
                  >
                  <Icon size={16} />
                  {tab.label}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="tab-underline"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

          {/* Alerts */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="alert alert-error"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <AlertTriangle size={16} />
                <span>{error}</span>
                <button className="retry-btn" onClick={retryCurrentTab}>
                  Retry
                </button>
              </motion.div>
            )}
            {success && (
              <motion.div
                className="alert alert-success"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <CheckCircle size={16} />
                <span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading */}
          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <span>Analyzing video formats...</span>
            </div>
          )}

          {/* Tab Content */}
          {!loading && (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "metadata" && currentData && (
                  <MetadataView data={currentData} />
                )}
                {activeTab === "video" && currentData && (
                  <DownloadList
                    items={currentData.resolutions}
                    onDownload={(key) => handleDownload("video", key)}
                    activeDownload={download?.tab === "video" ? download : null}
                    busy={download !== null}
                    icon={Monitor}
                    emptyLabel="video resolutions"
                  />
                )}
                {activeTab === "audio" && currentData && (
                  <DownloadList
                    items={currentData.formats}
                    descriptions={currentData.details}
                    onDownload={(key) => handleDownload("audio", key)}
                    activeDownload={download?.tab === "audio" ? download : null}
                    busy={download !== null}
                    icon={Headphones}
                    emptyLabel="audio formats"
                  />
                )}
                {activeTab === "thumbnail" && currentData && (
                  <DownloadList
                    items={currentData.resolutions}
                    onDownload={(key) => handleDownload("thumbnail", key)}
                    activeDownload={download?.tab === "thumbnail" ? download : null}
                    busy={download !== null}
                    icon={ImageIcon}
                    emptyLabel="thumbnail sizes"
                  />
                )}
                {!currentData && !loading && (
                  <div className="empty-state">
                    No data available. Try fetching again.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Metadata View
   ═══════════════════════════════════════════════════ */
function MetadataView({ data }) {
  const basicInfo = [
    { icon: <FileText size={16} />, label: "Title", value: data.title },
    { icon: <Hash size={16} />, label: "Video ID", value: data.video_id },
    { icon: <User size={16} />, label: "Channel", value: data.channel },
    {
      icon: <Calendar size={16} />,
      label: "Upload Date",
      value: formatDate(data.upload_date),
    },
    { icon: <Clock size={16} />, label: "Duration", value: data.duration || "—" },
    {
      icon: <AlignLeft size={16} />,
      label: "Description",
      value: data.description_snippet || "—",
    },
  ];

  const engagement = [
    { icon: <Eye size={16} />, label: "Views", value: formatCount(data.views) },
    { icon: <ThumbsUp size={16} />, label: "Likes", value: formatCount(data.likes) },
    {
      icon: <MessageSquare size={16} />,
      label: "Comments",
      value: formatCount(data.comments),
    },
    {
      icon: <Users size={16} />,
      label: "Subscribers",
      value: formatCount(data.subscribers),
    },
  ];

  const technical = [
    {
      icon: <Tag size={16} />,
      label: "Tags",
      value: data.tags?.length
        ? data.tags.slice(0, 8).join(", ") +
          (data.tags.length > 8 ? "…" : "")
        : "None",
    },
    {
      icon: <Folder size={16} />,
      label: "Category",
      value: data.categories?.join(", ") || "None",
    },
    { icon: <Lock size={16} />, label: "Privacy", value: data.privacy },
    { icon: <FileText size={16} />, label: "License", value: data.license },
    {
      icon: <AlertTriangle size={16} />,
      label: "Age Restricted",
      value: data.age_restricted ? "Yes" : "No",
    },
    { icon: <Radio size={16} />, label: "Live Status", value: data.live_status },
    {
      icon: <BookOpen size={16} />,
      label: "Chapters",
      value:
        data.total_chapters > 0
          ? `${data.total_chapters} chapters`
          : "None",
    },
    {
      icon: <Settings size={16} />,
      label: "Formats",
      value: `${data.total_formats} streams`,
    },
    {
      icon: <Languages size={16} />,
      label: "Subtitles",
      value: data.subtitles?.length ? data.subtitles.join(", ") : "None",
    },
  ];

  return (
    <div className="metadata-grid">
      {/* Thumbnail + Engagement */}
      <div className="metadata-sidebar">
        {data.thumbnail && (
          <div className="thumbnail-preview">
            <img src={data.thumbnail} alt="Thumbnail" />
          </div>
        )}
        <div className="stat-grid">
          {engagement.map((item) => (
            <div key={item.label} className="stat-card">
              <div className="stat-label">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <span className="stat-value">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info Sections */}
      <div className="metadata-main">
        <MetadataSection title="Basic Information" rows={basicInfo} />
        <MetadataSection title="Technical Details" rows={technical} />
      </div>
    </div>
  );
}

function MetadataSection({ title, rows }) {
  return (
    <div className="info-section">
      <div className="info-section-header">
        <h3>{title}</h3>
      </div>
      <div className="info-section-body">
        {rows.map((row, i) => (
          <div key={i} className="info-row">
            <span className="info-row-icon">{row.icon}</span>
            <span className="info-row-label">{row.label}</span>
            <span className="info-row-value">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Download List
   ═══════════════════════════════════════════════════ */
function DownloadList({
  items,
  descriptions,
  onDownload,
  activeDownload,
  busy,
  icon: Icon,
  emptyLabel,
}) {
  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const entries = Object.entries(items || {});

  if (entries.length === 0) {
    return <div className="empty-state">No {emptyLabel} found.</div>;
  }

  return (
    <div>
      <div className="list-count">
        {entries.length} {entries.length === 1 ? "option" : "options"} available
      </div>
      <div className="download-list">
        {entries.map(([key, size]) => {
          const isCurrent = activeDownload?.key === key;
          const isDownloading = isCurrent && activeDownload.status === "downloading";
          const isCompleted = isCurrent && activeDownload.status === "completed";
          const isError = isCurrent && activeDownload.status === "error";

          return (
            <div key={key} className={`download-row ${isCurrent ? "download-row-active" : ""}`}>
              <div className="download-row-left">
                <div className="download-row-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <div className="download-row-title-wrap">
                    <span className="download-row-name">{key}</span>
                    {isDownloading && (
                      <span className="live-timer-badge">
                        ⏱️ {formatTime(activeDownload.elapsed)}
                      </span>
                    )}
                  </div>
                  {descriptions?.[key] && (
                    <span className="download-row-desc">{descriptions[key]}</span>
                  )}
                  {isDownloading && (
                    <div className="live-progress-container">
                      <div className="progress-bar-bg">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${Math.max(activeDownload.percent || 5, 5)}%`,
                          }}
                        />
                      </div>
                      <div className="progress-details-text">
                        <span>
                          {activeDownload.backendStatus === "queued"
                            ? "Waiting for a free download slot..."
                            : activeDownload.backendStatus === "processing"
                              ? "Merging / converting file..."
                              : `Downloading ${activeDownload.percent || 0}%`}
                        </span>
                        {activeDownload.speed && <span>{activeDownload.speed}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="download-row-right">
                <span className="download-row-size">{size}</span>
                <button
                  className={`download-btn ${isDownloading ? "download-btn-loading" : ""} ${
                    isCompleted ? "download-btn-success" : ""
                  }`}
                  onClick={() => onDownload(key)}
                  disabled={busy}
                >
                  {isDownloading ? (
                    <>
                      <div className="spinner-sm" />
                      <span>{formatTime(activeDownload.elapsed)}</span>
                    </>
                  ) : isCompleted ? (
                    <>
                      <CheckCircle size={16} />
                      <span>Saved ({formatTime(activeDownload.elapsed)})</span>
                    </>
                  ) : isError ? (
                    <>
                      <AlertTriangle size={16} />
                      <span>Failed</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span>Download</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function Feature({ icon, text }) {
  return (
    <div className="feature">
      <div className="feature-icon">{icon}</div>
      <span>{text}</span>
    </div>
  );
}

function Divider() {
  return <div className="feature-divider" />;
}

// 0 is a real count; only null/undefined means YouTube hid it
function formatCount(value) {
  return value == null ? "Hidden" : value.toLocaleString();
}

// "2024-03-05" -> "Mar 5, 2024" (parsed as local date so it doesn't shift a day)
function formatDate(iso) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isYouTubeUrl(value) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return (
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtu.be"
    );
  } catch {
    return false;
  }
}

export default App;

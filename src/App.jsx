import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Music,
  Download,
  Image as ImageIcon,
  Calendar,
  Eye,
  ThumbsUp,
  MessageSquare,
  Tag,
  Folder,
  Lock,
  FileText,
  AlertTriangle,
  Radio,
  BookOpen,
  Settings,
  Languages,
  ArrowLeft,
  Link as LinkIcon,
  Sparkles,
  Search,
  CheckCircle,
  Hash,
  User,
  Users,
  Video
} from 'lucide-react'
import './App.css'
import {
  fetchMetadata,
  fetchVideoResolutions,
  fetchAudioFormats,
  fetchThumbnailResolutions,
  downloadVideo,
  downloadAudio,
  downloadThumbnail,
} from './api'

function App() {
  const [url, setUrl] = useState('')
  const [step, setStep] = useState('input')
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeAction, setActiveAction] = useState('')
  const [resultData, setResultData] = useState(null)
  const [videoTitle, setVideoTitle] = useState('')

  const handleSubmitUrl = (e) => {
    e.preventDefault()
    if (!url.trim()) return
    setError('')
    setStep('actions')
  }

  const handleBack = () => {
    setStep('actions')
    setActiveAction('')
    setResultData(null)
    setError('')
    setSuccess('')
  }

  const handleBackToInput = () => {
    setStep('input')
    setActiveAction('')
    setResultData(null)
    setError('')
    setSuccess('')
    setVideoTitle('')
  }

  const handleAction = async (action) => {
    setActiveAction(action)
    setStep('result')
    setLoading(true)
    setError('')
    setSuccess('')
    setResultData(null)

    try {
      let data
      switch (action) {
        case 'metadata':
          setLoadingText('Extracting comprehensive video metadata...')
          data = await fetchMetadata(url)
          setVideoTitle(data.title)
          setResultData({ type: 'metadata', data })
          break
        case 'video':
          setLoadingText('Scanning available video resolutions...')
          data = await fetchVideoResolutions(url)
          setVideoTitle(data.title)
          setResultData({ type: 'video', data })
          break
        case 'audio':
          setLoadingText('Analyzing available audio formats...')
          data = await fetchAudioFormats(url)
          setVideoTitle(data.title)
          setResultData({ type: 'audio', data })
          break
        case 'thumbnail':
          setLoadingText('Discovering thumbnail resolutions...')
          data = await fetchThumbnailResolutions(url)
          setVideoTitle(data.title)
          setResultData({ type: 'thumbnail', data })
          break
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Is the backend server running?')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadVideo = (resolution) => {
    setError('')
    setSuccess('⬇️ Video download request sent! Check Chrome\'s download bar.')
    try {
      downloadVideo(url, resolution, videoTitle)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDownloadAudio = (format) => {
    setError('')
    setSuccess('⬇️ Audio download request sent! Check Chrome\'s download bar.')
    try {
      downloadAudio(url, format, videoTitle)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDownloadThumbnail = (resolution) => {
    setError('')
    setSuccess('⬇️ Thumbnail download request sent! Check Chrome\'s download bar.')
    try {
      const thumbUrl = resultData.data.urls[resolution]
      downloadThumbnail(thumbUrl, resolution, videoTitle)
    } catch (err) {
      setError(err.message)
    }
  }

  const actions = [
    {
      id: 'metadata',
      icon: <FileText className="w-6 h-6 text-purple-400" />,
      title: 'Video Metadata',
      desc: 'Channel details, views, likes, duration, chapters, subtitles & tags',
      gradient: 'from-purple-500/20 to-blue-500/10 border-purple-500/20',
      glow: 'shadow-purple-500/5'
    },
    {
      id: 'video',
      icon: <Video className="w-6 h-6 text-pink-400" />,
      title: 'Download Video',
      desc: 'Export resolution options from 144p up to 4K with file size details',
      gradient: 'from-pink-500/20 to-purple-500/10 border-pink-500/20',
      glow: 'shadow-pink-500/5'
    },
    {
      id: 'audio',
      icon: <Music className="w-6 h-6 text-cyan-400" />,
      title: 'Download Audio',
      desc: 'Extract audio stream and convert to MP3, M4A, WAV, FLAC, or AAC',
      gradient: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/20',
      glow: 'shadow-cyan-500/5'
    },
    {
      id: 'thumbnail',
      icon: <ImageIcon className="w-6 h-6 text-emerald-400" />,
      title: 'Download Thumbnail',
      desc: 'Grab the video thumbnail cover image in maximum available resolution',
      gradient: 'from-emerald-500/20 to-cyan-500/10 border-emerald-500/20',
      glow: 'shadow-emerald-500/5'
    },
  ]

  const pageVariants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
    exit: { opacity: 0, y: -15, transition: { duration: 0.3, ease: 'easeIn' } }
  }

  return (
    <div className="min-h-screen relative overflow-hidden select-none">
      {/* Animated Background */}
      <div className="bg-scene">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>
      <div className="grid-overlay"></div>

      {/* Main Content Container */}
      <div className="relative z-10 max-w-[1000px] mx-auto px-6 pt-16 pb-24">

        {/* Dynamic Header */}
        <header className="text-center mb-16">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 100, delay: 0.1 }}
            className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-accent-purple to-accent-pink flex items-center justify-center shadow-lg shadow-accent-purple/20 mb-5 relative group cursor-pointer"
          >
            <Play className="w-9 h-9 fill-white text-white group-hover:scale-110 transition-transform duration-300 ml-1" />
            <Sparkles className="w-5 h-5 text-accent-cyan absolute -top-1.5 -right-1.5 animate-pulse" />
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="gradient-text text-5xl font-black tracking-tight leading-tight select-text"
          >
            YouTube Downloader
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-txt-secondary text-[0.95rem] mt-3 font-light max-w-lg mx-auto leading-relaxed select-text"
          >
            Download HD video, audio streams, cover thumbnails, and extract detailed YouTube metadata instantly.
          </motion.p>
        </header>

        {/* Staged Form Transition Wrapper */}
        <AnimatePresence mode="wait">
          {/* STEP 1: Link input */}
          {step === 'input' && (
            <motion.div
              key="input"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="max-w-2xl mx-auto"
            >
              <div className="glass-card rounded-3xl p-8 border border-white/5 relative">
                <h2 className="text-base font-semibold text-txt-primary mb-1.5 flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-accent-purple"></span>
                  Start Downloader
                </h2>
                <p className="text-xs text-txt-muted mb-6">
                  Provide any valid YouTube video or playlist link to fetch download formats.
                </p>

                <form onSubmit={handleSubmitUrl} className="flex gap-3 items-center">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none">
                      <Search className="w-5 h-5 opacity-55" />
                    </span>
                    <input
                      id="url-input"
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="input-glow w-full py-4 px-5 pl-12 bg-bg-input border border-border rounded-xl text-txt-primary text-[0.95rem] font-medium font-[Inter] outline-none transition-all duration-300 placeholder:text-txt-muted select-text"
                    />
                  </div>
                  <motion.button
                    id="submit-url-btn"
                    type="submit"
                    disabled={!url.trim()}
                    whileHover={url.trim() ? { scale: 1.02 } : {}}
                    whileTap={url.trim() ? { scale: 0.98 } : {}}
                    className="gradient-btn py-4 px-8 border-none rounded-xl text-white text-[0.95rem] font-bold font-[Inter] cursor-pointer transition-all duration-300 whitespace-nowrap tracking-wide hover:not-disabled:shadow-[0_8px_30px_rgba(139,92,246,0.4)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <span>Fetch</span>
                    <Sparkles className="w-4 h-4" />
                  </motion.button>
                </form>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5 py-3.5 px-5 rounded-xl text-sm flex items-center gap-2.5 bg-accent-red/10 border border-accent-red/20 text-accent-red"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="select-text">{error}</span>
                  </motion.div>
                )}
              </div>

              {/* Feature Tags */}
              <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
                {['Direct Stream', 'Highest Quality', 'MP3 Converter', 'Artwork Cover', 'JSON Metadata'].map((f, idx) => (
                  <motion.span 
                    key={f}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + idx * 0.05 }}
                    className="py-1.5 px-4 rounded-full text-xs font-semibold text-txt-secondary border border-border bg-glass hover:text-txt-primary transition-colors"
                  >
                    {f}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          )}

          {/* STEP 2: Main Choices */}
          {step === 'actions' && (
            <motion.div
              key="actions"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {/* Top Link Pill Banner */}
              <div className="glass-card rounded-2xl py-4 px-6 mb-8 flex items-center gap-3.5 border border-white/5">
                <div className="w-2.5 h-2.5 rounded-full bg-accent-green animate-pulse shrink-0"></div>
                <span className="text-xs text-txt-secondary font-medium truncate select-text">
                  Connected: <span className="text-txt-primary font-semibold">{url}</span>
                </span>
                <motion.button
                  onClick={handleBackToInput}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="ml-auto py-1.5 px-4 rounded-lg text-xs font-semibold text-txt-secondary border border-border bg-glass font-[Inter] cursor-pointer transition-all duration-300 hover:border-accent-purple hover:text-txt-primary shrink-0"
                >
                  Change Link
                </motion.button>
              </div>

              <h2 className="text-lg font-bold text-txt-primary mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent-purple" />
                Select Downloader Operation
              </h2>

              <div className="grid grid-cols-2 gap-5 max-[680px]:grid-cols-1">
                {actions.map((action, i) => (
                  <motion.div
                    key={action.id}
                    id={`action-${action.id}`}
                    onClick={() => handleAction(action.id)}
                    whileHover={{ y: -5, scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={`card-accent glass-inner rounded-2xl p-7 border border-white/5 cursor-pointer shadow-lg hover:border-border-glow transition-all duration-300 hover:${action.glow} flex flex-col items-start relative group`}
                  >
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-5 border transition-transform duration-300 group-hover:scale-105`}>
                      {action.icon}
                    </div>
                    <h3 className="text-base font-bold mb-2 text-txt-primary group-hover:text-accent-purple-light transition-colors duration-300">
                      {action.title}
                    </h3>
                    <p className="text-xs text-txt-secondary leading-relaxed mb-4">
                      {action.desc}
                    </p>
                    <div className="mt-auto flex items-center gap-1.5 text-xs text-txt-muted group-hover:text-accent-purple font-semibold transition-colors duration-300">
                      <span>Proceed</span>
                      <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* STEP 3: Downloader Results */}
          {step === 'result' && (
            <motion.div
              key="result"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {/* Result Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-glass border border-white/5 flex items-center justify-center">
                    {activeAction === 'metadata' && <FileText className="w-5 h-5 text-purple-400" />}
                    {activeAction === 'video' && <Video className="w-5 h-5 text-pink-400" />}
                    {activeAction === 'audio' && <Music className="w-5 h-5 text-cyan-400" />}
                    {activeAction === 'thumbnail' && <ImageIcon className="w-5 h-5 text-emerald-400" />}
                  </div>
                  <span className="select-text">
                    {activeAction === 'metadata' && 'Video Metadata'}
                    {activeAction === 'video' && 'Video Formats'}
                    {activeAction === 'audio' && 'Audio Formats'}
                    {activeAction === 'thumbnail' && 'Thumbnail Resolutions'}
                  </span>
                </h2>
                <motion.button
                  onClick={handleBack}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="py-2 px-5 glass-inner rounded-xl text-txt-secondary text-sm font-semibold font-[Inter] cursor-pointer transition-all duration-300 hover:border-accent-purple hover:text-txt-primary flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </motion.button>
              </div>

              {/* Connected details banner */}
              {videoTitle && !loading && (
                <div className="glass-card rounded-xl py-3.5 px-5 mb-6 flex items-center gap-3 border border-white/5">
                  <CheckCircle className="w-4 h-4 text-accent-green shrink-0" />
                  <span className="text-xs text-txt-secondary truncate select-text">
                    Title: <span className="text-txt-primary font-semibold">{videoTitle}</span>
                  </span>
                </div>
              )}

              {/* Fullpage Loader */}
              {loading && (
                <div className="glass-card rounded-3xl flex flex-col items-center justify-center py-24 gap-5 border border-white/5">
                  <div className="spinner"></div>
                  <p className="text-txt-secondary text-xs font-semibold animate-pulse-text">{loadingText}</p>
                </div>
              )}

              {/* Status Alert Panels */}
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-4 px-5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 bg-accent-red/10 border border-accent-red/20 text-accent-red mb-5 select-text"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              {success && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-4 px-5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 bg-accent-green/10 border border-accent-green/20 text-accent-green mb-5"
                >
                  <CheckCircle className="w-4 h-4 shrink-0 animate-bounce" />
                  <span className="select-text">{success}</span>
                </motion.div>
              )}

              {/* METADATA RESULT VIEW */}
              {resultData?.type === 'metadata' && !loading && (
                <MetadataDisplay data={resultData.data} />
              )}

              {/* VIDEO RESOLUTIONS VIEW */}
              {resultData?.type === 'video' && !loading && (
                <QualityList items={resultData.data.resolutions} onDownload={handleDownloadVideo} />
              )}

              {/* AUDIO FORMATS VIEW */}
              {resultData?.type === 'audio' && !loading && (
                <QualityList items={resultData.data.formats} descriptions={resultData.data.details} onDownload={handleDownloadAudio} />
              )}

              {/* THUMBNAIL RESOLUTIONS VIEW */}
              {resultData?.type === 'thumbnail' && !loading && (
                <QualityList items={resultData.data.resolutions} onDownload={handleDownloadThumbnail} />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="text-center mt-24 py-5 text-txt-muted text-xs tracking-wide">
          Built with <span className="text-accent-purple font-semibold">FastAPI</span> • <span className="text-accent-pink font-semibold">React</span> • <span className="text-accent-cyan font-semibold">Tailwind v4</span> • <span className="text-purple-400 font-semibold">Framer Motion</span>
        </footer>
      </div>
    </div>
  )
}

/* ─────────────── Metadata Display Component ─────────────── */
function MetadataDisplay({ data }) {
  const rows = [
    { icon: <FileText className="w-4 h-4 text-purple-400" />, label: 'Title', value: data.title },
    { icon: <Hash className="w-4 h-4 text-pink-400" />, label: 'Video ID', value: data.video_id },
    { icon: <User className="w-4 h-4 text-blue-400" />, label: 'Channel', value: data.channel },
    { icon: <Users className="w-4 h-4 text-cyan-400" />, label: 'Subscribers', value: data.subscribers ? data.subscribers.toLocaleString() : 'Hidden' },
    { icon: <Calendar className="w-4 h-4 text-emerald-400" />, label: 'Upload Date', value: data.upload_date },
    { icon: <Eye className="w-4 h-4 text-teal-400" />, label: 'Views', value: data.views ? data.views.toLocaleString() : 'Hidden' },
    { icon: <ThumbsUp className="w-4 h-4 text-orange-400" />, label: 'Likes', value: data.likes ? data.likes.toLocaleString() : 'Hidden' },
    { icon: <MessageSquare className="w-4 h-4 text-yellow-400" />, label: 'Comments', value: data.comments ? data.comments.toLocaleString() : 'Hidden' },
    { icon: <AlignLeft className="w-4 h-4 text-red-400" />, label: 'Description', value: data.description_snippet },
    { icon: <Tag className="w-4 h-4 text-purple-400" />, label: 'Tags', value: data.tags?.length ? data.tags.slice(0, 5).join(', ') + (data.tags.length > 5 ? '...' : '') : 'None' },
    { icon: <Folder className="w-4 h-4 text-pink-400" />, label: 'Category', value: data.categories?.join(', ') || 'None' },
    { icon: <Lock className="w-4 h-4 text-blue-400" />, label: 'Privacy', value: data.privacy },
    { icon: <FileText className="w-4 h-4 text-cyan-400" />, label: 'License', value: data.license },
    { icon: <AlertTriangle className="w-4 h-4 text-emerald-400" />, label: 'Age Restricted', value: data.age_restricted ? 'Yes' : 'No' },
    { icon: <Radio className="w-4 h-4 text-red-400" />, label: 'Live Status', value: data.live_status },
    { icon: <BookOpen className="w-4 h-4 text-orange-400" />, label: 'Chapters', value: data.total_chapters > 0 ? `${data.total_chapters} chapters` : 'None' },
    { icon: <Settings className="w-4 h-4 text-yellow-400" />, label: 'Total Formats', value: `${data.total_formats} streams` },
    { icon: <Languages className="w-4 h-4 text-teal-400" />, label: 'Subtitles', value: data.subtitles?.length ? data.subtitles.join(', ') : 'None' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start select-text">
      {/* Left Column: Premium YouTube-style Thumbnail with Hover Glow */}
      <div className="md:col-span-2 space-y-4 select-none">
        {data.thumbnail ? (
          <div className="relative group rounded-2xl overflow-hidden border border-white/10 shadow-[0_15px_45px_rgba(0,0,0,0.7)] aspect-video bg-black/40">
            <img 
              src={data.thumbnail} 
              alt="Video Thumbnail" 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            {data.duration && (
              <span className="absolute bottom-3.5 right-3.5 px-2.5 py-1 bg-black/85 text-[0.7rem] font-bold text-white tracking-widest rounded-md shadow select-none">
                {data.duration}
              </span>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border aspect-video flex items-center justify-center text-txt-muted">
            No high-resolution thumbnail found
          </div>
        )}
      </div>

      {/* Right Column: Information table */}
      <div className="md:col-span-3 glass-card rounded-2xl overflow-hidden divide-y divide-white/[0.04] border border-white/5">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex items-start py-3.5 px-5 transition-all duration-300 gap-4 hover:bg-white/[0.02]"
          >
            <div className="shrink-0 pt-0.5 select-none">{row.icon}</div>
            <span className="font-semibold text-[0.7rem] uppercase tracking-wider text-txt-muted min-w-[110px] shrink-0 pt-0.5 select-none">{row.label}</span>
            <span className="text-[0.85rem] text-txt-primary break-words flex-1 leading-relaxed">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─────────────── Quality / Format List Component ─────────────── */
function QualityList({ items, descriptions, onDownload }) {
  const [downloadingKey, setDownloadingKey] = useState(null)

  const handleClick = (key) => {
    setDownloadingKey(key)
    onDownload(key)
    setTimeout(() => {
      setDownloadingKey(null)
    }, 4000)
  }

  const entries = Object.entries(items)

  return (
    <div className="flex flex-col gap-3.5 select-text">
      {entries.map(([key, size]) => (
        <div
          key={key}
          className="glass-inner rounded-2xl py-4 px-6 flex items-center justify-between border border-white/5 transition-all duration-300 hover:border-accent-purple/40 hover:bg-bg-card-hover hover:translate-x-1 group"
        >
          <div className="flex items-center gap-4">
            <span className="py-1.5 px-4 bg-accent-purple/15 rounded-xl text-[0.85rem] font-black text-accent-purple-light tracking-wide select-none">
              {key}
            </span>
            {descriptions && descriptions[key] && (
              <span className="text-xs text-txt-secondary hidden sm:inline select-none font-medium">{descriptions[key]}</span>
            )}
          </div>
          <div className="flex items-center gap-5">
            <span className="text-xs text-txt-muted font-semibold tracking-wide select-none">{size}</span>
            <motion.button
              onClick={() => handleClick(key)}
              disabled={downloadingKey !== null}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="gradient-btn py-2.5 px-6 border-none rounded-xl text-white text-[0.8rem] font-bold font-[Inter] cursor-pointer transition-all duration-300 hover:not-disabled:shadow-[0_4px_20px_rgba(139,92,246,0.35)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 select-none"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingKey === key ? 'Starting...' : 'Download'}</span>
            </motion.button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default App

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '')

async function request(path, options, fallbackMessage) {
  let response
  if (!path.includes('/progress/')) {
    console.log(`🌐 [API Request] Calling ${path}`)
  }

  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch (err) {
    console.error(`❌ [API Network Error] ${path}:`, err)
    throw new Error("Can't reach the server. Check your connection and try again.")
  }

  if (!response.ok) {
    const msg = await getErrorMessage(response, fallbackMessage)
    console.error(`❌ [API Error ${response.status}] ${path}:`, msg)
    throw new Error(msg)
  }

  try {
    const resJson = await response.json()
    if (!path.includes('/progress/')) {
      console.log(`✅ [API Success] ${path}:`, resJson)
    }
    return resJson
  } catch (err) {
    console.error(`❌ [API JSON Parse Error] ${path}:`, err)
    throw new Error('The backend returned an invalid response. Check the server terminal for details.')
  }
}

// Render's free plan sleeps after 15 idle minutes and takes up to a minute to
// wake. Ping /health on page load; onSlow fires if it hasn't answered quickly.
export async function wakeServer(onSlow) {
  const slowTimer = setTimeout(() => onSlow?.(), 2500)
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(30000) })
        if (response.ok) return true
      } catch {
        // still waking up; retry
      }
      await sleep(3000)
    }
    return false
  } finally {
    clearTimeout(slowTimer)
  }
}

async function getErrorMessage(response, fallbackMessage) {
  try {
    const body = await response.json()
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  } catch {
    // Some proxies return HTML error pages; use the response status below.
  }

  return response.status === 429
    ? 'Too many requests. Wait a minute and try again.'
    : fallbackMessage
}

export async function fetchMetadata(url) {
  const data = await request(`/api/metadata?url=${encodeURIComponent(url)}`, undefined, 'Unable to analyze this YouTube link.')
  return data.data
}

export async function fetchVideoResolutions(url) {
  const data = await request(`/api/video/resolutions?url=${encodeURIComponent(url)}`, undefined, 'Unable to load video resolutions.')
  return data.data
}

export async function fetchAudioFormats(url) {
  const data = await request(`/api/audio/formats?url=${encodeURIComponent(url)}`, undefined, 'Unable to load audio formats.')
  return data.data
}

export async function fetchSubtitles(url) {
  const data = await request(`/api/subtitles?url=${encodeURIComponent(url)}`, undefined, 'Unable to load subtitles.')
  return data.data
}

export async function fetchThumbnailResolutions(url) {
  const data = await request(`/api/thumbnail/resolutions?url=${encodeURIComponent(url)}`, undefined, 'Unable to load thumbnail sizes.')
  return data.data
}

const POLL_INTERVAL_MS = 800
const MAX_POLL_FAILURES = 5

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Downloads run as background jobs on the server: start the job, poll its
// progress until it finishes, then let the browser fetch the finished file.
async function runDownload(kind, body, onProgress, fallbackMessage) {
  const { task_id: taskId } = await request(`/api/download/${kind}`, postBody(body), fallbackMessage)
  let failures = 0

  while (true) {
    await sleep(POLL_INTERVAL_MS)
    let job
    try {
      job = await request(`/api/download/progress/${taskId}`, undefined, 'Lost track of this download.')
      failures = 0
    } catch (err) {
      if (++failures >= MAX_POLL_FAILURES) throw err
      continue
    }

    onProgress?.(job)
    if (job.status === 'completed') {
      triggerBrowserDownload(taskId, job.filename)
      return job
    }
    if (job.status === 'error') {
      throw new Error(job.error || fallbackMessage)
    }
  }
}

// clip is optional: { start, end } in seconds (video and audio only)
export function downloadVideo(url, target, onProgress, clip) {
  return runDownload('video', { url, target, ...clip }, onProgress, 'Unable to download this video.')
}

export function downloadAudio(url, target, onProgress, clip) {
  return runDownload('audio', { url, target, ...clip }, onProgress, 'Unable to download this audio.')
}

export function downloadThumbnail(url, target, onProgress) {
  return runDownload('thumbnail', { url, target }, onProgress, 'Unable to download this thumbnail.')
}

export function downloadSubtitles(url, target, onProgress) {
  return runDownload('subtitles', { url, target }, onProgress, 'Unable to download these subtitles.')
}

function postBody(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function triggerBrowserDownload(taskId, filename) {
  console.log(`🎉 [Browser Download] Saving file: ${filename}`)

  // The server sends the real filename in Content-Disposition and deletes the
  // file once it has been delivered.
  const a = document.createElement('a')
  a.href = `${API_BASE}/api/files/${encodeURIComponent(taskId)}`
  a.download = filename || ''
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ─── Insights (estimates and analysis from public data) ───
const insight = (path, message) => async (url) =>
  (await request(`/api/insights${path}?url=${encodeURIComponent(url)}`, undefined, message)).data

export const fetchInsights = insight('', 'Unable to analyse this video.')
export const fetchChannelInsights = insight('/channel', 'Unable to load the channel report.')
export const fetchCommentInsights = insight('/comments', 'Unable to read the comments.')
export const fetchTranscriptInsights = insight('/transcript', 'Unable to read the transcript.')

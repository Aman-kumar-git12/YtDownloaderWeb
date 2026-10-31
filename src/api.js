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
    throw new Error('Cannot reach the backend. Start it with `python3 server.py` and try again.')
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

async function getErrorMessage(response, fallbackMessage) {
  try {
    const body = await response.json()
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  } catch {
    // Some proxies return HTML error pages; use the response status below.
  }

  return response.status === 500
    ? `The server could not process this video (HTTP 500). ${fallbackMessage}`
    : `${fallbackMessage} (HTTP ${response.status})`
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

export function downloadVideo(url, target, onProgress) {
  return runDownload('video', { url, target }, onProgress, 'Unable to download this video.')
}

export function downloadAudio(url, target, onProgress) {
  return runDownload('audio', { url, target }, onProgress, 'Unable to download this audio.')
}

export function downloadThumbnail(url, target, onProgress) {
  return runDownload('thumbnail', { url, target }, onProgress, 'Unable to download this thumbnail.')
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

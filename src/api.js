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

export async function fetchDownloadProgress(taskId) {
  try {
    const data = await request(`/api/download/progress/${taskId}`, undefined, 'Unable to fetch download progress.')
    return data
  } catch {
    return { status: 'downloading', percent: 0 }
  }
}

export async function downloadVideo(url, target, taskId) {
  const data = await request('/api/download/video', postBody({ url, target, task_id: taskId }), 'Unable to download this video.')
  triggerBrowserDownload(data.filename)
  return data
}

export async function downloadAudio(url, target, taskId) {
  const data = await request('/api/download/audio', postBody({ url, target, task_id: taskId }), 'Unable to download this audio.')
  triggerBrowserDownload(data.filename)
  return data
}

export async function downloadThumbnail(url, target, title) {
  const data = await request('/api/download/thumbnail', postBody({ url, target, title }), 'Unable to download this thumbnail.')
  triggerBrowserDownload(data.filename)
  return data
}

function postBody(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function triggerBrowserDownload(filename) {
  if (!filename) return
  console.log(`🎉 [Browser Download] Saving file: ${filename}`)

  const downloadUrl = `${API_BASE}/api/files/${encodeURIComponent(filename)}`
  const a = document.createElement('a')
  a.href = downloadUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001';

export async function fetchMetadata(url) {
  const resp = await fetch(`${API_BASE}/api/metadata?url=${encodeURIComponent(url)}`);
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.detail || 'Failed to fetch metadata');
  }
  const data = await resp.json();
  return data.data;
}

export async function fetchVideoResolutions(url) {
  const resp = await fetch(`${API_BASE}/api/video/resolutions?url=${encodeURIComponent(url)}`);
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.detail || 'Failed to fetch video resolutions');
  }
  const data = await resp.json();
  return data.data;
}

export async function fetchAudioFormats(url) {
  const resp = await fetch(`${API_BASE}/api/audio/formats?url=${encodeURIComponent(url)}`);
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.detail || 'Failed to fetch audio formats');
  }
  const data = await resp.json();
  return data.data;
}

export async function fetchThumbnailResolutions(url) {
  const resp = await fetch(`${API_BASE}/api/thumbnail/resolutions?url=${encodeURIComponent(url)}`);
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.detail || 'Failed to fetch thumbnail resolutions');
  }
  const data = await resp.json();
  return data.data;
}

export async function downloadVideo(url, target) {
  const resp = await fetch(`${API_BASE}/api/download/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, target }),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.detail || 'Download failed');
  }
  const data = await resp.json();
  // Trigger browser download
  if (data.filename) {
    triggerBrowserDownload(data.filename);
  }
  return data;
}

export async function downloadAudio(url, target) {
  const resp = await fetch(`${API_BASE}/api/download/audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, target }),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.detail || 'Download failed');
  }
  const data = await resp.json();
  // Trigger browser download
  if (data.filename) {
    triggerBrowserDownload(data.filename);
  }
  return data;
}

export async function downloadThumbnail(url, target, title) {
  const resp = await fetch(`${API_BASE}/api/download/thumbnail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, target, title }),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.detail || 'Download failed');
  }
  const data = await resp.json();
  // Trigger browser download
  if (data.filename) {
    triggerBrowserDownload(data.filename);
  }
  return data;
}

/**
 * Creates a hidden <a> element to trigger a browser file download
 * from the backend file-serving endpoint.
 */
function triggerBrowserDownload(filename) {
  const downloadUrl = `${API_BASE}/api/files/${encodeURIComponent(filename)}`;
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

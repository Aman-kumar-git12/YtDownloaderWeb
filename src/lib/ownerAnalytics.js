// Real numbers (revenue, countries, watch time, traffic, audience) for creators
// who sign in with the Google account that owns the video's channel.
// Uses Google Identity Services in the browser; the token never reaches our server.
// Needs VITE_GOOGLE_CLIENT_ID (see README → "Creator sign-in").

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
].join(" ");

let gisPromise;
function loadGoogleScript() {
  gisPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = resolve;
    script.onerror = () => {
      gisPromise = null;
      reject(new Error("Couldn't load Google sign-in. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

export async function signInWithGoogle() {
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response) =>
        response.error ? reject(new Error("Sign-in was cancelled.")) : resolve(response.access_token),
      error_callback: () => reject(new Error("Sign-in was cancelled.")),
    });
    client.requestAccessToken();
  });
}

async function google(token, url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `Google returned ${response.status}`);
  return body;
}

function report(token, params) {
  const query = new URLSearchParams({
    ids: "channel==MINE",
    startDate: "2005-02-14",
    endDate: new Date().toISOString().slice(0, 10),
    ...params,
  });
  return google(token, `https://youtubeanalytics.googleapis.com/v2/reports?${query}`);
}

// rows -> [{column: value}]
const rowsOf = (result) =>
  (result.rows || []).map((row) => Object.fromEntries(result.columnHeaders.map((h, i) => [h.name, row[i]])));

export async function loadOwnerAnalytics(token, videoId, channelId) {
  const mine = await google(token, "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true");
  const channel = mine.items?.[0];
  if (!channel) throw new Error("This Google account doesn't have a YouTube channel.");
  if (channelId && channel.id !== channelId) {
    throw new Error(`You're signed in as “${channel.snippet.title}”, which doesn't own this video. Real numbers are only available for your own videos.`);
  }

  const filters = `video==${videoId}`;
  const base = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained";
  const totals = await report(token, { metrics: `${base},estimatedRevenue`, filters })
    .then((r) => ({ ...rowsOf(r)[0], revenueAvailable: true }))
    // Revenue needs a monetised channel (and the monetary permission); fall back without it
    .catch(() => report(token, { metrics: base, filters }).then((r) => ({ ...rowsOf(r)[0], revenueAvailable: false })));

  const [countries, traffic, audience] = await Promise.all([
    report(token, { dimensions: "country", metrics: "views,estimatedMinutesWatched", filters, sort: "-views", maxResults: "10" }).then(rowsOf),
    report(token, { dimensions: "insightTrafficSourceType", metrics: "views", filters, sort: "-views" }).then(rowsOf),
    report(token, { dimensions: "ageGroup,gender", metrics: "viewerPercentage", filters }).then(rowsOf).catch(() => []),
  ]);

  return { channel: channel.snippet.title, totals: totals || {}, countries, traffic, audience };
}

export const TRAFFIC_NAMES = {
  YT_SEARCH: "YouTube search",
  RELATED_VIDEO: "Suggested videos",
  SUBSCRIBER: "Subscriptions feed",
  BROWSE: "Home and browse",
  EXT_URL: "Other websites",
  YT_CHANNEL: "Channel page",
  PLAYLIST: "Playlists",
  SHORTS: "Shorts feed",
  NOTIFICATION: "Notifications",
  END_SCREEN: "End screens",
  ANNOTATION: "Cards",
  NO_LINK_OTHER: "Direct or unknown",
  YT_OTHER_PAGE: "Other YouTube pages",
  HASHTAGS: "Hashtag pages",
  SOUND_PAGE: "Sound pages",
  CAMPAIGN_CARD: "Campaign cards",
  YT_PLAYLIST_PAGE: "Playlist pages",
};

export function countryName(code) {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code);
  } catch {
    return code;
  }
}

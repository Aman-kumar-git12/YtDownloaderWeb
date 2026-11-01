// Where Viewlens gets its data.
// - Installed from the Chrome Web Store: always DEPLOYED_API.
// - Loaded unpacked (development): LOCAL_API if the local backend is running, else DEPLOYED_API.
// If you change these, also update "host_permissions" in manifest.json.
export const DEPLOYED_API = "https://viewlens-api.onrender.com";
export const LOCAL_API = "http://localhost:8001";

// The website the "dwnld" button opens (with the current video filled in).
export const WEBSITE = "https://yt-downloader-web-pi.vercel.app";

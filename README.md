# YT Downloader — Web

React 19 + Vite + Tailwind frontend for the YT Downloader backend (`YtDownloaderBackend` repo). Paste a YouTube link to view its metadata and download video, audio or thumbnails, with live progress.

## Run locally

```bash
npm install
cp .env.example .env      # set VITE_API_BASE_URL to your backend
npm run dev               # http://localhost:5173
```

Make sure the backend's `FRONTEND_URL` includes this app's origin (CORS).

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | Lint with oxlint |

## How downloads work

1. `POST /api/download/<kind>` starts a background job and returns a `task_id`.
2. The app polls `/api/download/progress/<task_id>` to show the progress bar.
3. When the job completes, the browser fetches `/api/files/<task_id>`. The server deletes the file after sending it.

See `src/api.js`.

## Insights tab

Opens estimates and analysis from the backend's `/api/insights*` endpoints: earnings range, comparison with the channel,
the most replayed moments (with "Clip this" buttons that fill in the clip picker), engagement and forecast, likely
audience, comment mood, transcript, search readiness, sponsor segments and technical facts. Each card loads on its own.

### Creator sign-in ("Your real numbers")

Real earnings, top countries, watch time, traffic sources and viewer age/gender are only available to the channel
owner, through the YouTube Analytics API. The card appears when `VITE_GOOGLE_CLIENT_ID` is set:

1. https://console.cloud.google.com → create a project → APIs & Services → enable **YouTube Data API v3** and
   **YouTube Analytics API**.
2. OAuth consent screen → External → add the scopes `youtube.readonly`, `yt-analytics.readonly` and
   `yt-analytics-monetary.readonly`. While the app is in "Testing", add the Google accounts that may sign in
   (up to 100). Publishing it for everyone requires Google's verification.
3. Credentials → Create OAuth client ID → Web application → Authorized JavaScript origins: your site URL
   (e.g. `https://yt-downloader-web-pi.vercel.app`) and `http://localhost:5173`.
4. Put the client ID in `VITE_GOOGLE_CLIENT_ID` (Vercel → Settings → Environment Variables) and redeploy.

Sign-in happens entirely in the browser; the token is never sent to the backend.

## Chrome extension

`extension/` holds **Viewlens**, an analysis-only Chrome extension (no downloads, so it's allowed on the Chrome Web
Store). See `extension/README.md`.

> Personal / educational use only. Downloading from YouTube may violate its Terms of Service.

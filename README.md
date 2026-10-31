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

> Personal / educational use only. Downloading from YouTube may violate its Terms of Service.

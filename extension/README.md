# Viewlens (Chrome extension)

Insights for the video you're watching. It opens with **What stands out**: the 4 most important findings
(good signs, warnings and things worth knowing), then estimated earnings, how it compares with the channel,
the most replayed moments (click to jump), engagement, comment mood and the transcript's topics.
Three tabs: **Analytics** (the insights), **Details** (numbers, upload date, length, quality, description, clickable chapters,
tags and caption languages) and **Hidden** (what the player knows but doesn't show: loudness normalisation, planned ad
breaks, paid-promotion flag, exact upload time, stream codecs and sizes, SponsorBlock segments, estimated dislikes,
channel activity and comment keywords). The Hidden tab reads the YouTube tab's own player data, so it needs no server.

The **dwnld** button (top right) opens the website with the current video filled in. Because it links to a downloader,
the extension is distributed through GitHub Releases rather than the Chrome Web Store.

## Try it locally
1. Open `chrome://extensions`, turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension` folder.
3. Open any video and click the Viewlens icon.

## Which server it uses
Always the deployed server (`https://viewlens-api.onrender.com`), and only as a backup (see "Where the data comes
from" below). The address lives in `config.js`; if you change it, change `host_permissions` in `manifest.json` too.

## Publish to the Chrome Web Store
1. In the `Frontend` folder run `npm run package:extension`. It creates `viewlens-<version>.zip` without the
   docs.
2. Create a developer account at https://chrome.google.com/webstore/devconsole (one-time $5).
3. Upload the zip, add screenshots (1280×800), and paste `PRIVACY.md` into a public page (for example a
   GitHub Pages URL) as the privacy policy link.
4. Single purpose: "Shows analytics and estimates for the video in the current tab."
   Permissions justification: see `PRIVACY.md`.

Keep the name and description free of "YouTube" (it's a trademark) and of any mention of downloading.

## Shared code
`lib/highlights.js` and `lib/format.js` are copies of the website's `src/lib` files (the extension has no
build step). When you change the highlight rules on the website, copy them here too.

## Where the data comes from
YouTube often blocks the free server ("Sign in to confirm you're not a bot") but not the viewer's own browser, so the
popup builds almost everything in the browser (`lib/local.js`, `lib/local-more.js`) and uses the server only as a backup:
- **Video, details, earnings, replay graph, search score:** the watch page. Same formulas as `Backend/core/insights.py`.
- **Channel comparison:** the channel's Videos and Shorts pages.
- **Comments:** the first ~150 top comments, loaded the way the YouTube page loads them.
- **Dislikes / sponsor segments:** Return YouTube Dislike and SponsorBlock, called directly.
- **Transcript:** the server; if it's blocked, YouTube's own "Show transcript" panel when the viewer has it open.

## Predictions tab
`lib/predict.js`. Lifetime views are modelled as a power law, views ∝ age^a. The exponent `a` is fitted (least
squares on log-views vs log-age) to the channel's recent uploads and used only when the fit is good (R² ≥ 0.2);
otherwise the generic range from `Backend/core/insights.py` (0.25–0.5, or 0.35–0.65 for videos under 30 days) is
used. Everything is shown as a low–high range: views in 7/30/365 days, views per day now, next milestones,
performance vs a typical upload of the same age, rank among recent uploads in a year, ad earnings ahead and the
creator's next upload (from the median gap between uploads).

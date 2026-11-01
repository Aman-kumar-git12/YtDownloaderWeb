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
- **Unpacked (development):** the local backend (`http://localhost:8001`) if it's running, otherwise
  the deployed one. A "Local server" tag appears in the header when it's using your computer.
- **Installed from the Chrome Web Store:** always the deployed server.

Both addresses live in `config.js`. If you change one, change `host_permissions` in `manifest.json` too.

## Publish to the Chrome Web Store
1. In the `Frontend` folder run `npm run package:extension`. It creates `viewlens-<version>.zip` without the
   docs and without the localhost permission (reviewers shouldn't see a development-only permission).
2. Create a developer account at https://chrome.google.com/webstore/devconsole (one-time $5).
3. Upload the zip, add screenshots (1280×800), and paste `PRIVACY.md` into a public page (for example a
   GitHub Pages URL) as the privacy policy link.
4. Single purpose: "Shows analytics and estimates for the video in the current tab."
   Permissions justification: see `PRIVACY.md`.

Keep the name and description free of "YouTube" (it's a trademark) and of any mention of downloading.

## Shared code
`lib/highlights.js` and `lib/format.js` are copies of the website's `src/lib` files (the extension has no
build step). When you change the highlight rules on the website, copy them here too.

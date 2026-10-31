# Viewlens (Chrome extension)

Insights for the video you're watching: estimated earnings, how it compares with the channel,
the most replayed moments (click to jump), engagement, comment mood and the transcript's topics.
It is analysis only; it has no download features, so it fits the Chrome Web Store rules.

## Try it locally
1. Open `chrome://extensions`, turn on **Developer mode**.
2. Click **Load unpacked** and pick this `Extension` folder.
3. Open any video and click the Viewlens icon.

## Point it at a different server
Change `API_BASE` in `config.js` **and** the URL in `host_permissions` in `manifest.json`.

## Publish to the Chrome Web Store
1. Zip the folder contents: `cd Extension && zip -r ../viewlens.zip . -x "*.md"`.
2. Create a developer account at https://chrome.google.com/webstore/devconsole (one-time $5).
3. Upload the zip, add screenshots (1280×800), and paste `PRIVACY.md` into a public page (for example a
   GitHub Pages URL) as the privacy policy link.
4. Single purpose: "Shows analytics and estimates for the video in the current tab."
   Permissions justification: see `PRIVACY.md`.

Keep the name and description free of "YouTube" (it's a trademark) and of any mention of downloading.

# Viewlens (Chrome extension)

Insights for the YouTube video in your current tab. Click the Viewlens icon on a video (or Short) to see a header
with the thumbnail, title and three key numbers (estimated earnings, views vs the channel's usual, like rate),
then four tabs: **Analytics**, **Details**, **Hidden** and **Predictions**. The refresh button analyses the
video again.

The **dwnld** button (top right) opens the Viewlens website with the current video filled in. Because it links to
a downloader, the extension is distributed through GitHub Releases rather than the Chrome Web Store.

Privacy: see [`PRIVACY.md`](PRIVACY.md).

## Install from GitHub

1. Download [viewlens.zip](https://github.com/Aman-kumar-git12/YtDownloaderWeb/releases/latest/download/viewlens.zip).
2. Unzip it into its own folder and keep that folder where it is; Chrome loads the extension from it.
3. Open `chrome://extensions`, turn on **Developer mode** (top right) and click **Load unpacked**.
4. Pick the unzipped folder (the one that contains `manifest.json`).
5. Open any YouTube video and click the Viewlens icon (pin it from the puzzle-piece menu to keep it visible).

**Updating:** download the new zip, replace the contents of the same folder with it, then click the reload
button on the Viewlens card in `chrome://extensions`.

**Developing:** load this `extension` folder itself with **Load unpacked** and press reload after each change.

## Analytics tab

Opens with **What stands out**: the 4 most important findings (good signs, warnings and things worth knowing).
Then:
- **Most replayed moments**: YouTube's replay graph with the peaks circled; click one to jump to it.
- **Estimated earnings**: total, per 1,000 views, next 30 days and, if there's a sponsor read, a sponsor deal estimate.
- **Compared with the channel**: views vs the median of recent uploads, subscribers, upload rate, typical reach.
- **Engagement**: like rate against the normal range, approval (from estimated dislikes), 30-day view outlook.
- **Search readiness**: a score out of 100 with the top fixes.
- **What viewers are saying**: comment mood, top comment, viewers' questions and comment languages.
- **What the video says**: speaking pace, talking time and main topics from the transcript.

## Details tab

Plain facts about the video: exact views, likes, comments and subscribers; upload date, length, category, best
quality, spoken language, visibility, live status, age restriction and a copyable video ID; the description;
clickable chapters; tags; and caption languages.

## Hidden tab

What YouTube knows but doesn't show:
- **Behind the player** (read from the YouTube tab's own player data): loudness normalisation, planned ad
  breaks (clickable), paid-promotion flag, unlisted / in search / embeds / family-safe / likes shown / allowed
  countries, exact upload time, hidden tag count, end screen, info cards and captions.
- **Streams & quality** (also from the player): best video and audio codec, bitrate, sample rate, HDR, 360°,
  dubbed audio tracks, full-quality download size, plus **Full-size thumbnail** and **Download** buttons.
- **Hidden numbers**: estimated dislikes, approval, comments per 1,000 views, views a day, life stage, age,
  earnings a day and whether it likely runs ads.
- **Sponsors & skippable parts**: SponsorBlock segments; click one to skip past it.
- **About the channel**: verified, active or not, last upload, average views, best video length, Shorts vs long
  videos and the biggest recent uploads.
- **Inside the comments**: total comments, creator replies, the pinned comment and the most-used words.

## Predictions tab

Where the video is heading. Every prediction is a low–high range, never a single figure. The code is in
`lib/predict.js`.

Cards:
- **Views ahead**: past views and the predicted range for the next year on a chart; views gained in the next 7
  days, 30 days and year; views a day now; and, for videos under a year old, the share of first-year views it
  already has.
- **Momentum**: whether it's still in its launch burst (30 days or younger), when its daily views will have
  halved, and its lifetime total 5 years from now.
- **Next milestones**: the next two round numbers (1K, 10K, 50K, 100K, 500K, 1M, …) it should pass within 20
  years, with dates.
- **Against the channel**: views vs a typical upload of this channel at the same age, and where it should rank
  among the channel's recent uploads a year from now.
- **Breakout chance**: how many of the channel's last (up to 30) uploads reached 3× or more of its median views
  (at least 8 needed), and whether this video is on track to do the same (already 3× a typical upload at its
  age, or projected past 3× the median within a year).
- **Money ahead**: ad earnings for the next 30 days and year, from the predicted views at this video's
  estimated RPM (or a note when the channel probably can't run ads).
- **Likes & comments ahead**: likes and comments in the next 30 days and year, from the predicted views at this
  video's current like and comment rates.
- **Creator's next upload**: the usual gap between uploads (median), and when the next one is due or how
  overdue it is. Approximate, because YouTube shows upload dates as "3 weeks ago".
- **Next video forecast**: views the creator's next upload should have after 7 and 30 days, and a fair sponsor
  price for it at $10–$30 per 1,000 expected views (30-day views).
- **How these were made**: the curve and fit quality used for this video.

How it works: lifetime views are modelled as a power law, views = k · age^a, fast at first and then a long
tail. The exponent `a` is fitted (least squares on log-views vs log-age) to the channel's recent uploads, and
used when there are at least 6 uploads of different ages and the fit is good enough (R² ≥ 0.2, a between 0.12
and 0.75); the range is that fit ± 0.08. Otherwise the generic range from `Backend/core/insights.py` is used
(0.25–0.5, or 0.35–0.65 for videos under 30 days old). Daily views fall like age^(a−1), so they halve once the
age has grown by a factor of 2^(1/(1−a)). The next video forecast uses the channel's fitted curve, or, without
one, its median recent upload moved along the curve.

## Where the data comes from

YouTube often blocks the free server ("Sign in to confirm you're not a bot") but not the viewer's own browser, so
the popup builds almost everything in the browser (`lib/local.js`, `lib/local-more.js`) and uses the server
mainly as a backup:
- **Video, details, earnings, replay graph, search score:** the watch page. Same formulas as `Backend/core/insights.py`.
- **Hidden tab player data:** the open YouTube tab, read with `chrome.scripting`.
- **Channel comparison and predictions:** the channel's Videos and Shorts pages.
- **Comments:** the first ~150 top comments, loaded the way the YouTube page loads them.
- **Dislikes / sponsor segments:** Return YouTube Dislike and SponsorBlock, called directly.
- **Transcript:** the server first; if YouTube blocks it, YouTube's own "Show transcript" panel when the viewer
  has it open.

If the browser can't load the video, details, channel or comments, the popup asks the server
(`https://viewlens-api.onrender.com`) instead, sending only the video's link. The address lives in `config.js`; if
you change it, change `host_permissions` in `manifest.json` too.

The free server sleeps when idle, so `background.js` pings its `/health` endpoint every 10 minutes while you're
on a YouTube tab or a YouTube video is playing, and once an hour otherwise. It stores only the last ping time.

## Build the zip

1. Bump `version` in `manifest.json`.
2. In the `Frontend` folder run `npm run package:extension`. It creates `viewlens-<version>.zip` and
   `viewlens.zip` there, without the `.md` docs (and drops any localhost host permission).
3. Upload `viewlens.zip` to a new GitHub release so the
   [latest download link](https://github.com/Aman-kumar-git12/YtDownloaderWeb/releases/latest/download/viewlens.zip)
   points to it.

## Shared code

`lib/highlights.js` is a copy of the website's `src/lib/highlights.js`, and `lib/format.js` holds the parts of
`src/lib/format.js` it needs (the extension has no build step). When you change the highlight rules on the
website, copy them here too.

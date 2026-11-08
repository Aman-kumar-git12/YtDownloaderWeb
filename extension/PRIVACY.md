# Viewlens privacy policy

Last updated: 8 November 2026

Viewlens is a Chrome extension that shows public information and estimates for the YouTube video in your
current tab. It has no accounts, no analytics, no tracking and no ads. It does not collect, sell or share
personal data.

## What Viewlens reads

Only when you click the Viewlens icon on a YouTube video page:

- **The tab's address**, to know which video you're on.
- **Public data about that video**: its YouTube watch page, and the player data YouTube has already loaded in
  your tab (for example loudness, planned ad breaks and the available video and audio formats).
- **The channel's public pages**: its Videos and Shorts lists.
- **Public comments**: up to about 150 of the top comments.
- **YouTube's transcript panel**, only if you have opened "Show transcript" yourself.

All of this is analysed inside the popup, on your computer. Viewlens does not read your YouTube account,
subscriptions, watch history, cookies or anything from other websites.

**Auto-skip** (on by default, switch in the popup): a content script runs on youtube.com pages to detect ads
and sponsor parts in the player, and skips them. It reads only the player's state on the page (whether an ad is
showing, the current time, the Skip button), sends only the video ID to SponsorBlock (through the extension's
background worker), and stores nothing but its two settings and two counters on your device.

In the background, Viewlens checks whether the active tab (or a tab playing sound) is on YouTube, to decide how
often to ping its server (see below). Chrome only shows Viewlens the address of YouTube tabs, and nothing about
your tabs is stored or sent anywhere.

## Where requests go

| Service | When | What it receives |
| --- | --- | --- |
| YouTube (`www.youtube.com`, `m.youtube.com`, and `i.ytimg.com` for thumbnails) | When you open the popup on a video | The video ID and the channel ID, to load their public pages and comments |
| Return YouTube Dislike (`returnyoutubedislikeapi.com`) | When you open the popup on a video | The video ID, to get an estimated dislike count |
| SponsorBlock (`sponsor.ajay.app`) | When you open the popup on a video, and when a YouTube video starts while auto-skip for sponsor parts is on | The video ID, to get sponsor and intro segments marked by other viewers |
| Viewlens server (`viewlens-api.onrender.com`) | When you open the popup on a video | The video's link, to read its captions, and as a backup when your browser can't load some of the data itself |
| Viewlens server | Every 10 minutes while you're on YouTube or a YouTube video is playing, otherwise once an hour | A plain "are you awake?" request (`/health`) with no data about you or any video. It keeps the free server from going to sleep, so the popup loads faster |
| Viewlens website (`yt-downloader-web-pi.vercel.app`) | Only if you click **dwnld** or **Download** | Opens in a new tab with the video's link in the address |

Requests to youtube.com are made from your own browser, the same way the YouTube page makes them, so they may
include your normal YouTube cookies. Viewlens never reads, stores or sends those cookies anywhere. No cookies,
account details or browsing history are sent to any other service.

Like any website, each service can see your IP address when your browser connects to it. Return YouTube Dislike
and SponsorBlock are independent projects with their own privacy policies.

**The Viewlens server** looks up public information about the video and keeps the results in memory for up to
30 minutes, so repeat lookups are faster. It uses your IP address, in memory only, to limit how many lookups one
address can make per minute. Like most web servers, it writes standard request logs (time, IP address and the
requested address, which includes the video link). The hosting provider (Render) keeps them, and they are used
only to run and fix the server.

## What's stored on your device

- **The last time the server was pinged** (`lastPing`, in the extension's storage), so it isn't pinged too often.
- **Auto-skip settings and totals** (`autoSkipAds`, `autoSkipSponsors`, `skippedAds`, `skippedSeconds`, in the
  extension's storage): whether ads and sponsor parts are skipped, how many ads were skipped and how many
  seconds of sponsor parts.
- **The popup tab you had open last** (`viewlens-tab`, in the popup's local storage), so the popup reopens on it.

Nothing else is saved. Video data, comments and results are discarded when you close the popup.

## What Viewlens doesn't do

- No sign-in or accounts.
- No analytics, tracking, fingerprinting or ads.
- No selling, renting or sharing of data.
- No collection of personal information, account data or browsing history.
- No reading of your cookies.

## Permissions and why

- `activeTab`: read the address of the tab you clicked the icon on, to know which video to analyse.
- `scripting`: read the YouTube player's data for the open video, read the transcript panel if you've opened
  it, jump the video to a moment, chapter or sponsor segment when you click one, and skip the ad or sponsor
  part playing when you press **Skip now**.
- `storage`: remember when the server was last pinged, plus the auto-skip settings and totals.
- Content script on `https://www.youtube.com/*` and `https://m.youtube.com/*`: auto-skip, which detects ads and
  sponsor parts in the YouTube player and skips them.
- `alarms`: wake the background script every 10 minutes to check whether a ping is due.
- `https://www.youtube.com/*` and `https://m.youtube.com/*`: load the video's watch page, the channel's Videos and
  Shorts pages and the comments; also lets Viewlens see whether a tab is on YouTube.
- `https://returnyoutubedislikeapi.com/*`: get the estimated dislike count.
- `https://sponsor.ajay.app/*`: get SponsorBlock segments.
- `https://viewlens-api.onrender.com/*`: the Viewlens server (captions, backup data and the wake-up ping).

## Changes

If what Viewlens does with data changes, this page and the date at the top are updated.

## Contact

Questions or concerns: open an issue at https://github.com/Aman-kumar-git12/YtDownloaderWeb/issues.

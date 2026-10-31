# Viewlens privacy policy

Viewlens shows insights about the video in your current browser tab.

- **What is sent:** when you click the Viewlens icon on a video page, the extension sends that video's
  public link to the Viewlens server (see `config.js`), which looks up public information about the
  video and returns estimates. Nothing is sent until you click the icon.
- **What is not collected:** no account details, browsing history, cookies, or personal information.
  The extension has no analytics or tracking.
- **Storage:** the extension stores nothing on your device. The server keeps a short-lived cache of
  public video information (up to 30 minutes) to answer repeat lookups faster, and keeps no logs tied to you.
- **Permissions:** `activeTab` reads the address of the tab you clicked on; `scripting` lets the
  "jump to moment" buttons move that video's playback position.

Questions: open an issue on the project's GitHub page.

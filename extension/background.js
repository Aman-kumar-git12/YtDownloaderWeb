// Keeps the free server awake so the popup is fast.
// - While the user is on a YouTube tab (or a YouTube video is playing): ping /health every 10 minutes.
// - Otherwise: ping once an hour.
// Chrome stops background scripts when idle, so a 10-minute alarm wakes this up and it decides
// whether a ping is due. Opening or switching to YouTube also pings straight away if it's been 10 min.
import { DEPLOYED_API } from "./config.js";

const MINUTE = 60 * 1000;
const WATCHING_EVERY = 10 * MINUTE;
const IDLE_EVERY = 60 * MINUTE;
const SLACK = 30 * 1000; // alarms can fire a little early
const YOUTUBE = /^https:\/\/(www\.|m\.)?youtube\.com\/|^https:\/\/youtu\.be\//;

// On YouTube = the active tab of the focused window is YouTube, or any YouTube tab is playing sound
async function onYouTube() {
  try {
    const win = await chrome.windows.getLastFocused();
    if (win.focused) {
      const [active] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (YOUTUBE.test(active?.url || "")) return true;
    }
    const playing = await chrome.tabs.query({ audible: true });
    return playing.some((t) => YOUTUBE.test(t.url || ""));
  } catch {
    return false;
  }
}

async function pingIfDue(every) {
  try {
    const { lastPing = 0 } = await chrome.storage.local.get("lastPing");
    if (Date.now() - lastPing < every - SLACK) return;
    await chrome.storage.local.set({ lastPing: Date.now() });
    await fetch(`${DEPLOYED_API}/health`, { cache: "no-store" });
  } catch {
    // offline or server unreachable; the popup shows its own message
  }
}

async function tick() {
  await pingIfDue((await onYouTube()) ? WATCHING_EVERY : IDLE_EVERY);
}

async function ensureAlarm() {
  if (!(await chrome.alarms.get("ping"))) chrome.alarms.create("ping", { periodInMinutes: 10 });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
ensureAlarm();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ping") tick();
});

// Arriving on YouTube: wake the server now (if it's been 10 minutes) so the popup is ready
chrome.tabs.onUpdated.addListener((_tabId, info, tab) => {
  if (info.status === "loading" && tab.active && YOUTUBE.test(tab.url || "")) pingIfDue(WATCHING_EVERY);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (YOUTUBE.test(tab.url || "")) pingIfDue(WATCHING_EVERY);
  } catch {
    // tab closed
  }
});

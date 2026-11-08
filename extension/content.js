// Viewlens auto-skip: runs on YouTube pages.
// 1. YouTube video ads: mute + fast-forward the ad, press Skip, jump to its end, close banner ads,
//    then put the user's sound and speed back exactly as they were.
// 2. SponsorBlock segments (sponsor, self-promotion, subscribe reminders): jump over them as they start,
//    with a small "Undo" toast.
// Settings come from chrome.storage.local (autoSkipAds, autoSkipSponsors; both default on).
// Everything is wrapped in try/catch: this script must never break YouTube or log noise.
(() => {
  // Run once per page, but replace a copy left behind by an extension reload (it can no longer talk to Chrome)
  try {
    if (typeof window.__viewlensAutoSkip === "function" && window.__viewlensAutoSkip()) return;
  } catch {}

  const SKIP_BUTTONS =
    '.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-ad-skip-button-container button, button[id^="skip-button"]';
  const OVERLAY_CLOSE = ".ytp-ad-overlay-close-button";
  const AD_FAST_RATE = 16;
  const CATEGORIES = { sponsor: "sponsor", selfpromo: "self-promotion", interaction: "subscribe reminder" };
  const TOAST_MS = 2500;
  const TOAST_ID = "viewlens-skip-toast";

  const settings = { ads: true, sponsors: true };
  let running = false;
  let dead = false; // the extension was reloaded/removed: this copy of the script must stop
  window.__viewlensAutoSkip = () => {
    try {
      return !dead && !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };

  // Ad state
  let adBreak = null; // { video, muted, rate, mutedByUs, rateByUs } while we are handling an ad break
  let lastContent = null; // { muted, rate } of the real video, captured while no ad is showing
  let observedPlayer = null;
  let classObserver = null;

  // Sponsor state
  let videoId = null;
  let segments = [];
  let skipped = new Set(); // segment keys already skipped (or undone) in this playback
  let fetchToken = 0;
  let listenedVideo = null;

  let tickTimer = null;
  let urlTimer = null;
  let lastUrl = location.href;

  // ---------- helpers ----------

  function alive() {
    try {
      if (dead) return false;
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) throw new Error("gone");
      return true;
    } catch {
      die();
      return false;
    }
  }

  function getPlayer() {
    if (location.pathname.startsWith("/shorts/")) {
      const shorts = document.querySelector("#shorts-player");
      if (shorts) return shorts;
    }
    return document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
  }

  function getVideo(player) {
    return (
      (player && player.querySelector("video")) ||
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video")
    );
  }

  function adShowing(player) {
    return !!player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"));
  }

  function visible(el) {
    return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  function parseVideoId(href) {
    try {
      const url = new URL(href);
      const ok = (id) => (id && /^[\w-]{11}$/.test(id) ? id : null);
      if (url.hostname === "youtu.be") return ok(url.pathname.slice(1, 12));
      const v = ok(url.searchParams.get("v"));
      if (v) return v;
      const m = url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  // Serialise counter updates so two quick increments can't overwrite each other
  let counterChain = Promise.resolve();
  function addToCounter(key, amount) {
    if (!amount || !alive()) return;
    counterChain = counterChain
      .then(async () => {
        if (!alive()) return;
        const got = await chrome.storage.local.get(key);
        const now = Number(got[key]) || 0;
        await chrome.storage.local.set({ [key]: Math.max(0, now + amount) });
      })
      .catch(() => {});
  }

  // ---------- ads ----------

  function startAdBreak(video) {
    const base = lastContent || { muted: video.muted, rate: video.playbackRate };
    adBreak = { video, muted: base.muted, rate: base.rate, mutedByUs: false, rateByUs: false, acted: false };
    if (!video.muted) {
      video.muted = true;
      adBreak.mutedByUs = true;
    }
  }

  // Put back only what we changed, and only if it still holds the value we set
  // (if the user unmuted mid-ad, or YouTube reset the speed itself, leave it alone).
  function endAdBreak(count) {
    const state = adBreak;
    adBreak = null;
    if (!state) return;
    const targets = new Set([state.video, getVideo(getPlayer())].filter(Boolean));
    for (const v of targets) {
      try {
        if (state.mutedByUs && v.muted === true) v.muted = state.muted;
        if (state.rateByUs && v.playbackRate === AD_FAST_RATE) v.playbackRate = state.rate;
      } catch {}
    }
    if (count && state.acted) addToCounter("skippedAds", 1);
  }

  function handleAd(player, video) {
    if (!adBreak) startAdBreak(video);
    adBreak.acted = true;
    if (adBreak.video !== video) {
      // YouTube swapped the <video> element mid-break: treat the new one as ours too
      if (adBreak.mutedByUs && !video.muted) video.muted = true;
      adBreak.video = video;
    }
    // Loading the next ad in a pod resets the speed, so keep re-applying it
    if (video.playbackRate !== AD_FAST_RATE) {
      try {
        video.playbackRate = AD_FAST_RATE;
        adBreak.rateByUs = true;
      } catch {}
    }
    for (const button of document.querySelectorAll(SKIP_BUTTONS)) {
      if (visible(button)) {
        try {
          button.click();
        } catch {}
      }
    }
    const d = video.duration;
    if (Number.isFinite(d) && d > 0 && video.currentTime < d - 0.5) {
      try {
        video.currentTime = d - 0.1;
      } catch {}
    }
  }

  function closeOverlays() {
    for (const button of document.querySelectorAll(OVERLAY_CLOSE)) {
      if (visible(button)) {
        try {
          button.click();
        } catch {}
      }
    }
  }

  function watchPlayer(player) {
    if (player === observedPlayer) return;
    try {
      if (classObserver) classObserver.disconnect();
      observedPlayer = player;
      if (!player) return;
      classObserver = classObserver || new MutationObserver(() => tick());
      classObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
    } catch {}
  }

  // ---------- sponsor segments ----------

  function segKey(s) {
    return `${s.category}:${s.start}:${s.end}`;
  }

  function resetVideo(id) {
    videoId = id;
    segments = [];
    skipped = new Set();
    removeToast();
    loadSegments();
  }

  function loadSegments() {
    const token = ++fetchToken;
    const id = videoId;
    if (!id || !settings.sponsors || !alive()) return;
    try {
      chrome.runtime.sendMessage({ type: "segments", videoId: id }, (reply) => {
        try {
          void chrome.runtime.lastError; // read it so Chrome doesn't log "Unchecked runtime.lastError"
          if (token !== fetchToken || id !== videoId) return;
          segments = (Array.isArray(reply) ? reply : [])
            .filter((s) => s && CATEGORIES[s.category] && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
            .map((s) => ({ category: s.category, start: s.start, end: s.end }));
        } catch {}
      });
    } catch {
      die();
    }
  }

  function onTimeUpdate(e) {
    try {
      if (!running || !settings.sponsors || !segments.length) return;
      const video = e.currentTarget;
      if (adShowing(getPlayer()) || parseVideoId(location.href) !== videoId) return;
      const t = video.currentTime;
      const seg = segments.find((s) => t >= s.start - 0.3 && t < s.end - 0.5 && !skipped.has(segKey(s)));
      if (!seg) return;
      skipped.add(segKey(seg));
      const seconds = Math.max(0, Math.round(seg.end - Math.max(t, seg.start)));
      video.currentTime = seg.end;
      addToCounter("skippedSeconds", seconds);
      showToast(video, seg, seconds);
    } catch {}
  }

  function attachVideo(video) {
    if (video === listenedVideo) return;
    try {
      if (listenedVideo) listenedVideo.removeEventListener("timeupdate", onTimeUpdate);
      listenedVideo = video || null;
      if (listenedVideo) listenedVideo.addEventListener("timeupdate", onTimeUpdate);
    } catch {}
  }

  function duration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }

  let toastTimer = null;
  function removeToast() {
    clearTimeout(toastTimer);
    const old = document.getElementById(TOAST_ID);
    if (old) old.remove();
  }

  function showToast(video, seg, seconds) {
    try {
      removeToast();
      const player = getPlayer();
      const rect = (player || video).getBoundingClientRect();
      const box = document.createElement("div");
      box.id = TOAST_ID;
      box.setAttribute("role", "status");
      Object.assign(box.style, {
        position: "fixed",
        left: `${Math.max(8, rect.left + 12)}px`,
        bottom: `${Math.max(8, window.innerHeight - rect.bottom + 64)}px`,
        zIndex: "2147483647",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        borderRadius: "8px",
        background: "rgba(15, 15, 15, 0.9)",
        color: "#fff",
        font: "500 13px/1.3 Roboto, Arial, sans-serif",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.35)",
        pointerEvents: "auto",
      });
      const text = document.createElement("span");
      text.textContent = `Skipped ${CATEGORIES[seg.category]} · ${duration(seconds)}`;
      const undo = document.createElement("a");
      undo.href = "#";
      undo.textContent = "Undo";
      Object.assign(undo.style, { color: "#3ea6ff", textDecoration: "none", fontWeight: "600", cursor: "pointer" });
      const stop = (e) => e.stopPropagation();
      box.addEventListener("mousedown", stop);
      box.addEventListener("dblclick", stop);
      undo.addEventListener("click", (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
          skipped.add(segKey(seg)); // stays marked: never auto-skip this one again in this playback
          video.currentTime = seg.start;
          addToCounter("skippedSeconds", -seconds);
          removeToast();
        } catch {}
      });
      box.append(text, undo);
      (document.fullscreenElement || document.body).append(box);
      toastTimer = setTimeout(removeToast, TOAST_MS);
    } catch {}
  }

  // ---------- on-video Skip button (added when the user clicks "skip ad" in the popup) ----------

  const BUTTON_ID = "viewlens-skip-button";
  let buttonTimer = null;
  let manualSegments = []; // segments for the on-video button, fetched even when auto-skip is off

  function fetchManualSegments() {
    const id = parseVideoId(location.href);
    manualSegments = [];
    if (!id || !alive()) return;
    try {
      chrome.runtime.sendMessage({ type: "segments", videoId: id }, (reply) => {
        void chrome.runtime.lastError;
        if (parseVideoId(location.href) !== id) return;
        manualSegments = (Array.isArray(reply) ? reply : []).filter(
          (s) => s && CATEGORIES[s.category] && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start
        );
      });
    } catch {}
  }

  const allSegments = () => (segments.length ? segments : manualSegments);

  // What the button would skip right now: "ad", a segment, or nothing (with the next segment, if any)
  function skipTarget(player, video) {
    if (adShowing(player)) return { kind: "ad" };
    const t = video.currentTime;
    const seg = allSegments().find((s) => t >= s.start - 0.3 && t < s.end - 0.5);
    if (seg) return { kind: "segment", seg };
    const next = allSegments().filter((s) => s.start > t).sort((a, b) => a.start - b.start)[0];
    return { kind: "none", next };
  }

  function clockText(s) {
    s = Math.floor(s);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  function manualSkip() {
    try {
      const player = getPlayer();
      const video = getVideo(player);
      if (!video) return;
      const target = skipTarget(player, video);
      if (target.kind === "ad") {
        handleAd(player, video); // mute + 16× + press Skip + jump to the end; sound/speed restored when it ends
        return;
      }
      if (target.kind === "segment") {
        const seg = target.seg;
        const seconds = Math.max(0, Math.round(seg.end - Math.max(video.currentTime, seg.start)));
        skipped.add(segKey(seg));
        video.currentTime = seg.end;
        if (video.paused) video.play();
        addToCounter("skippedSeconds", seconds);
        showToast(video, seg, seconds);
      }
    } catch {}
  }

  function updateButton() {
    try {
      if (!alive()) return removeButton();
      const player = getPlayer();
      const video = getVideo(player);
      let button = document.getElementById(BUTTON_ID);
      if (!player || !video) {
        if (button) button.style.display = "none";
        return;
      }
      if (!button || button.parentElement !== player) {
        if (button) button.remove();
        button = makeButton();
        player.append(button);
      }
      button.style.display = "flex";
      // Restore sound and speed after an ad the button skipped (when auto-skip isn't running the loop)
      if (adBreak && !adShowing(player) && !running) endAdBreak(true);

      const target = skipTarget(player, video);
      const label = button.querySelector("[data-label]");
      const active = target.kind !== "none";
      label.textContent =
        target.kind === "ad" ? "Skip ad" : target.kind === "segment" ? `Skip ${CATEGORIES[target.seg.category]}` : "Skip";
      button.title = active
        ? "Click to skip"
        : target.next
          ? `Next: ${CATEGORIES[target.next.category]} at ${clockText(target.next.start)}`
          : "Nothing to skip right now";
      button.style.opacity = active ? "1" : "0.55";
      button.style.background = active ? "#ff3b2f" : "rgba(15, 15, 15, 0.8)";
    } catch {}
  }

  function makeButton() {
    const button = document.createElement("div");
    button.id = BUTTON_ID;
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    Object.assign(button.style, {
      position: "absolute",
      top: "12px",
      right: "12px",
      zIndex: "80",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 10px 8px 14px",
      borderRadius: "999px",
      color: "#fff",
      font: "600 14px/1 Roboto, Arial, sans-serif",
      cursor: "pointer",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.4)",
      userSelect: "none",
      transition: "background 0.2s, opacity 0.2s",
    });
    const label = document.createElement("span");
    label.dataset.label = "";
    const icon = document.createElement("span");
    icon.textContent = "\u25B6|";
    icon.style.fontSize = "12px";
    const close = document.createElement("span");
    close.textContent = "\u00D7";
    close.title = "Remove the Skip button";
    Object.assign(close.style, { marginLeft: "4px", padding: "0 4px", fontSize: "18px", opacity: "0.8" });
    button.append(label, icon, close);

    // Keep YouTube from treating our clicks as play/pause or fullscreen clicks
    for (const type of ["mousedown", "mouseup", "dblclick", "pointerdown", "pointerup"]) {
      button.addEventListener(type, (e) => e.stopPropagation());
    }
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.target === close) return removeButton();
      manualSkip();
      updateButton();
    });
    button.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        manualSkip();
      }
    });
    return button;
  }

  function showButton() {
    fetchManualSegments();
    if (!buttonTimer) {
      buttonTimer = setInterval(() => {
        if (location.href !== buttonUrl) {
          buttonUrl = location.href;
          fetchManualSegments();
        }
        updateButton();
      }, 400);
    }
    buttonUrl = location.href;
    updateButton();
  }
  let buttonUrl = location.href;

  function removeButton() {
    clearInterval(buttonTimer);
    buttonTimer = null;
    document.getElementById(BUTTON_ID)?.remove();
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "showSkipButton") {
        showButton();
        manualSkip(); // skip straight away too, if an ad or sponsor part is playing
        sendResponse({ ok: true });
      }
    });
  } catch {}

  // ---------- main loop ----------

  function tick() {
    try {
      if (!running || !alive()) return;
      const player = getPlayer();
      watchPlayer(player);
      const video = getVideo(player);
      attachVideo(video);
      if (!video) return;

      if (settings.ads && adShowing(player)) {
        handleAd(player, video);
      } else {
        if (adBreak) endAdBreak(true);
        if (!adShowing(player)) lastContent = { muted: video.muted, rate: video.playbackRate };
      }
      if (settings.ads) closeOverlays();
    } catch {}
  }

  function checkUrl() {
    try {
      if (!running) return;
      const href = location.href;
      const id = parseVideoId(href);
      lastUrl = href;
      if (id !== videoId) resetVideo(id);
    } catch {}
  }

  function onNavigate() {
    checkUrl();
    tick();
  }

  function start() {
    if (running || dead) return;
    running = true;
    lastUrl = location.href;
    videoId = parseVideoId(lastUrl);
    segments = [];
    skipped = new Set();
    loadSegments();
    tickTimer = setInterval(tick, 500);
    urlTimer = setInterval(() => {
      if (location.href !== lastUrl) onNavigate();
    }, 1000);
    document.addEventListener("yt-navigate-finish", onNavigate);
    tick();
  }

  function stop() {
    if (!running) return;
    running = false;
    clearInterval(tickTimer);
    clearInterval(urlTimer);
    document.removeEventListener("yt-navigate-finish", onNavigate);
    try {
      if (classObserver) classObserver.disconnect();
    } catch {}
    observedPlayer = null;
    attachVideo(null);
    if (adBreak) endAdBreak(false);
    removeToast();
    fetchToken++;
    segments = [];
  }

  function apply() {
    if (settings.ads || settings.sponsors) start();
    else stop();
    if (!running) return;
    if (!settings.ads && adBreak) endAdBreak(false); // toggled off mid-ad: give the user their sound back now
    if (!settings.sponsors) {
      fetchToken++;
      segments = [];
      removeToast();
    }
  }

  function die() {
    if (dead) return;
    dead = true;
    try {
      stop();
      removeButton();
    } catch {}
  }

  function onStorageChanged(changes, area) {
    try {
      if (area !== "local") return;
      let touched = false;
      if (changes.autoSkipAds) {
        settings.ads = changes.autoSkipAds.newValue !== false;
        touched = true;
      }
      if (changes.autoSkipSponsors) {
        const was = settings.sponsors;
        settings.sponsors = changes.autoSkipSponsors.newValue !== false;
        touched = true;
        if (settings.sponsors && !was && running) {
          apply();
          loadSegments();
          return;
        }
      }
      if (touched) apply();
    } catch {}
  }

  try {
    if (!alive()) return;
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.storage.local
      .get(["autoSkipAds", "autoSkipSponsors"])
      .then((got) => {
        settings.ads = got.autoSkipAds !== false;
        settings.sponsors = got.autoSkipSponsors !== false;
        apply();
      })
      .catch(() => {});
  } catch {}
})();

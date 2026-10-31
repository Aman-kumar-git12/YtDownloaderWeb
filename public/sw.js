// Minimal service worker so the site can be installed as an app (and appear in
// the phone's share sheet). It doesn't cache anything: every request goes to
// the network as usual, so a new deploy is picked up immediately.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

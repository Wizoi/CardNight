"use strict";

// Offline support for the table app. Network-first, falling back to a
// cache when the network is unavailable -- deliberately NOT cache-first
// with a manually-bumped version number, since this project has no build
// step to auto-invalidate a stale cache: cache-first would mean silently
// serving yesterday's code forever unless someone remembers to bump a
// version string on every deploy. Network-first means a normal, online
// visit always gets the latest files (the cache just quietly updates in
// the background) and only a genuinely offline visit ever falls back to
// whatever was last successfully fetched.
//
// The list of files worth caching is discovered by reading index.html's
// own <script src> / <link href> tags at install time, rather than a
// hand-maintained duplicate list here -- this project adds a new game (and
// its own script tag) fairly often, and a parallel list here would
// silently go stale the same way a manually-bumped cache version would.
const CACHE_NAME = "luck-of-the-deal-v1";
const CORE_URLS = ["./", "./index.html", "./style.css", "./manifest.webmanifest", "./icon.svg", "../app/games-data.js"];

async function discoverAssetUrls() {
  const urls = new Set(CORE_URLS);
  try {
    const res = await fetch("./index.html", { cache: "no-store" });
    const html = await res.text();
    const re = /<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g;
    let match;
    while ((match = re.exec(html))) {
      const url = match[1];
      if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) continue;
      urls.add(url);
    }
  } catch (err) {
    // If index.html itself can't be fetched (e.g. installing while
    // already offline), CORE_URLS is still a reasonable fallback set.
  }
  return [...urls];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Never lets one missing/renamed asset fail the whole install -- offline
// support degrading to "most files, not all" is far better than "none at
// all" because a single cache.addAll() call rejected on one 404. A couple
// of quick retries with backoff cover the OTHER real failure mode this
// hits in practice: precaching all ~80 files in one burst can trip a
// transient CDN blip on one or two of them (observed live against GitHub
// Pages -- a single file 503'd under the concurrent load, purely
// transiently) even though every file is genuinely reachable a moment
// later.
async function precacheAll(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const request = new Request(url, { cache: "reload" });
          const response = await fetch(request);
          if (response && response.ok) {
            await cache.put(request, response);
            return;
          }
        } catch (err) {
          // fall through to retry/give-up below
        }
        if (attempt < 2) await sleep(300 * (attempt + 1));
      }
      // All attempts failed -- this one asset just won't be available offline.
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const urls = await discoverAssetUrls();
      await precacheAll(cache, urls);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});

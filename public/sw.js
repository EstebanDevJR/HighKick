// HighKick service worker: an offline-capable app shell, nothing more.
//
// - Hashed build assets (/_next/static) are immutable, so cache-first.
// - Pages are network-first and fall back to the last cached copy (or the
//   cached home page) when offline, so the PWA opens instead of erroring.
// - API responses and video are never cached here: they're live data and
//   the HTTP layer already caches Kick responses server-side.

const VERSION = "highkick-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];
// Only these pages are kept for offline use; caching every channel or clip
// page visited would grow without bound.
const OFFLINE_PAGES = new Set(["/", "/explore", "/library", "/settings"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && OFFLINE_PAGES.has(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("/")) ?? Response.error()),
    );
  }
});

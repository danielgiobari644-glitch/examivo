/**
 * EXAMIVO — Progressive Web Application (PWA) Service Worker
 * Resiliently caches static application shell using relative paths and per-asset
 * fault tolerance so it never fails with `Failed to execute 'addAll' on 'Cache'`.
 */

const CACHE_NAME = "examivo-shell-v2";
const STATIC_ASSETS = [
  "./index.html",
  "./app.html",
  "./setup.html",
  "./exam.html",
  "./results.html",
  "./history.html",
  "./study.html",
  "./manifest.json",
  "./logo.svg",
  "./icon-192.svg",
  "./icon-512.svg",
  "./global.css",
  "./animations.css",
  "./landing.css",
  "./app.css",
  "./setup.css",
  "./exam.css",
  "./results.css",
  "./firebase.js",
  "./utils.js",
  "./ui.js",
  "./auth.js",
  "./storage.js",
  "./ai.js",
  "./questions.js",
  "./setup.js",
  "./exams.js",
  "./results.js",
  "./study.js",
  "./app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(
          STATIC_ASSETS.map(async (assetUrl) => {
            try {
              const response = await fetch(assetUrl, { cache: "no-cache" });
              if (response && response.ok) {
                await cache.put(assetUrl, response.clone());
              }
            } catch (_) {
              // Ignore individual asset fetch failures so SW install never throws
            }
          })
        );
      } catch (_) {}
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.allSettled(
          keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
        );
      } catch (_) {}
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests over http/https
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Always bypass cache for API endpoints or cross-origin requests
  if (url.pathname.includes("/api/") || url.origin !== self.location.origin) {
    return;
  }

  // Network-first with cache fallback for HTML navigation
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (_) {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match("./index.html");
          return (
            fallback ||
            new Response("Offline — Please check your connection.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            })
          );
        }
      })()
    );
    return;
  }

  // Stale-while-revalidate for local static assets
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      const networkFetch = fetch(request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || (await networkFetch) || new Response("", { status: 404 });
    })()
  );
});

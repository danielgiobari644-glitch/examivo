/**
 * EXAMIVO — Progressive Web Application (PWA) Service Worker
 * Caches static application shell (HTML, CSS, JS, SVG, Manifest) and supports offline access
 * to previously saved examination history while passing `/api/ai/*` requests to the network.
 */

const CACHE_NAME = "examivo-shell-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.html",
  "/setup.html",
  "/exam.html",
  "/results.html",
  "/history.html",
  "/study.html",
  "/manifest.json",
  "/logo.svg",
  "/icon-192.svg",
  "/icon-512.svg",
  "/global.css",
  "/animations.css",
  "/landing.css",
  "/app.css",
  "/setup.css",
  "/exam.css",
  "/results.css",
  "/firebase.js",
  "/utils.js",
  "/ui.js",
  "/auth.js",
  "/storage.js",
  "/ai.js",
  "/questions.js",
  "/setup.js",
  "/exams.js",
  "/results.js",
  "/study.js",
  "/app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return null;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always bypass cache for AI API calls & Firebase backend endpoints
  if (url.pathname.startsWith("/api/") || request.method !== "GET") {
    return;
  }

  // Network-first with cache fallback for HTML pages, Stale-While-Revalidate for static assets
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((res) => res || caches.match("/index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

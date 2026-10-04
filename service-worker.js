/* ============================================================
   EXAMIVO — Service Worker (PWA)
   Static shell: cache-first. Firebase/API traffic: never cached.
   ============================================================ */

const CACHE = 'examivo-v1';
const CORE = [
  './',
  './index.html',
  './app.html',
  './setup.html',
  './exam.html',
  './results.html',
  './history.html',
  './study.html',
  './manifest.json',
  './css/global.css',
  './css/animations.css',
  './css/landing.css',
  './css/app.css',
  './css/setup.css',
  './css/exam.css',
  './css/results.css',
  './js/firebase.js',
  './js/utils.js',
  './js/constants.js',
  './js/ui.js',
  './js/storage.js',
  './js/ai.js',
  './js/auth.js',
  './js/app-shell.js',
  './js/landing.js',
  './js/app.js',
  './js/setup.js',
  './js/questions.js',
  './js/exams.js',
  './js/results.js',
  './js/study.js',
  './js/history.js',
  './assets/logo/logo.svg',
  './assets/logo/mark.svg',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET.
  if (event.request.method !== 'GET') return;

  // Never intercept Firebase, Google Fonts CDN or cross-origin API traffic.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('cloudfunctions') || url.hostname.includes('firebaseio') || url.hostname.includes('googleapis')) {
    return;
  }

  // Static assets: cache-first with network refresh in background.
  if (/\.(css|js|svg|png|jpg|jpeg|webp|woff2?|json)$/.test(url.pathname) || url.pathname === '/' ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const refresh = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || refresh;
      })
    );
    return;
  }

  // Pages: network-first, fall back to cache (offline reading of saved content).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});

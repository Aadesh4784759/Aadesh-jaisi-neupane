// Aadesh AI Global Hub Service Worker
const CACHE_NAME = 'aadesh-ai-v4';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const reqUrl = event.request.url;
  // Skip non-GET, cross-origin backend calls (e.g. Vercel API), and /api/ routes
  if (
    event.request.method !== 'GET' ||
    !reqUrl.startsWith(self.location.origin) ||
    reqUrl.includes('/api/')
  ) {
    return;
  }

  // Always network-first for HTML / navigation so deployments never serve stale index.html -> old JS hashes
  const acceptHeader = event.request.headers.get('accept') || '';
  const pathname = new URL(reqUrl).pathname;
  const isNavigationOrHtml =
    event.request.mode === 'navigate' ||
    acceptHeader.includes('text/html') ||
    pathname === '/' ||
    pathname.endsWith('/index.html');

  if (isNavigationOrHtml) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, copy);
            });
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  // Cache-first only for hashed immutable static assets and icons
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }
        return networkResponse;
      });
    })
  );
});

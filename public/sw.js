const CACHE_NAME = 'chess1200-v1';
const PRECACHE = ['/today', '/pre-game'];

self.addEventListener('install', (event) => {
  void event;
  void CACHE_NAME;
  void PRECACHE;
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

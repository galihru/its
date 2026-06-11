const CACHE_NAME = 'its-maps-cache-v10';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/its.png',
  '/app-update.json',
  '/bwits.png'
];

const BYPASS_PATTERNS = [
  /\/cam\//i,
  /\.m3u8($|\?)/i,
  /\.ts($|\?)/i,
  /\.m4s($|\?)/i,
  /\.mp4($|\?)/i,
  /trycloudflare\.com/i,
  /firebaseio\.com/i,
  /firebasedatabase\.app/i,
];

function shouldBypassCache(request) {
  const url = new URL(request.url);
  if (request.destination === 'video') return true;
  if (url.origin !== self.location.origin && !/cdn\.jsdelivr\.net\/npm\/onnxruntime-web/i.test(url.href)) return true;
  return BYPASS_PATTERNS.some((pattern) => pattern.test(url.href));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (shouldBypassCache(event.request)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      try {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      } catch (e) {
        // ignore opaque responses and other failures
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

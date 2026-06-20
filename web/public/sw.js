const CACHE_NAME = 'its-maps-cache-v8';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/desktop/renderer.html',
  '/document',
  '/documentation',
  '/new',
  '/manifest.webmanifest',
  '/manifest-mobile.webmanifest',
  '/manifest-desktop.webmanifest',
  '/its.png',
  '/icons/icon-96.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/shortcut-map-96.png',
  '/icons/shortcut-camera-96.png',
  '/screenshots/desktop-home.png',
  '/screenshots/desktop-map.png',
  '/screenshots/mobile-map.png',
  '/screenshots/pwa/mobile-1.png',
  '/screenshots/pwa/mobile-2.png',
  '/screenshots/pwa/desktop-1.png',
  '/screenshots/pwa/desktop-2.png',
  '/screenshots/pwa/desktop-3.png',
  '/app-update.json'
];

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
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title || 'ITS Maps';
  const targetUrl = payload.url || payload.link || '/new';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || payload.message || 'Pembaruan ITS Maps tersedia.',
      icon: payload.icon || '/icons/icon-192.png',
      badge: payload.badge || '/icons/icon-96.png',
      tag: payload.tag || 'its-public-update',
      data: { url: targetUrl },
    })
  );
});

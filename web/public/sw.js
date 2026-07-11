const CACHE_NAME = 'its-maps-cache-v16';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/presentation/',
  '/desktop/renderer.html',
  '/document',
  '/documentation',
  '/documentation/',
  '/method',
  '/method/',
  '/method/android',
  '/method/windows',
  '/method/webapp',
  '/licence',
  '/license',
  '/pdf-preview',
  '/pdf-preview/documentation',
  '/pdf-preview/method',
  '/pdf-preview/android',
  '/pdf-preview/windows',
  '/pdf-preview/webapp',
  '/pdf-preview/licence',
  '/pdf-preview/license',
  '/pdf-preview/fte-cd-6',
  '/new',
  '/manifest.webmanifest',
  '/manifest-mobile.webmanifest',
  '/manifest-desktop.webmanifest',
  '/presentation-manifest.webmanifest',
  '/its.png',
  '/its-presentasi.png',
  '/icons/icon-96.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/presentation-96.png',
  '/icons/presentation-192.png',
  '/icons/presentation-512.png',
  '/icons/presentation-maskable-512.png',
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
  '/screenshots/presentation/welcome-desktop.png',
  '/screenshots/presentation/welcome-mobile.png',
  '/screenshots/presentation/og-default.png',
  '/app-update.json'
];
const PRESENTATION_SHORTCUTS_URL = '/presentation-recent-shortcuts.json';

function basePresentationManifest(recent = []) {
  const primary = recent[0]?.backgroundColor || '#111315';
  const theme = recent[0]?.themeColor || '#1f2933';
  const recentShortcuts = recent.slice(0, 3).map((item, index) => ({
    name: item.title || `Presentasi terakhir ${index + 1}`,
    short_name: (item.title || 'Terakhir').slice(0, 12),
    description: 'Buka presentasi yang baru dibuka di perangkat ini.',
    url: item.url || '/presentation/?last=1&source=pwa-shortcut',
    icons: [{ src: '/icons/presentation-96.png', sizes: '96x96', type: 'image/png' }]
  }));
  return {
    id: '/presentation/?source=pwa',
    name: 'ITS Presentasi',
    short_name: 'Presentasi',
    description: 'ITS Presentasi untuk membuat, mengimpor, membagikan, dan mempresentasikan slide realtime dengan komentar dan WebUSB ADB.',
    start_url: '/presentation/?source=pwa',
    scope: '/presentation/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: primary,
    theme_color: theme,
    orientation: 'any',
    categories: ['productivity', 'education', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: '/icons/presentation-96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
      { src: '/icons/presentation-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/presentation-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/presentation-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    screenshots: [
      { src: '/screenshots/presentation/welcome-desktop.png', sizes: '1365x768', type: 'image/png', form_factor: 'wide', label: 'Welcome desktop ITS Presentasi' },
      { src: '/screenshots/presentation/welcome-mobile.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Welcome mobile ITS Presentasi' }
    ],
    shortcuts: [
      ...recentShortcuts,
      {
        name: 'Buka presentasi terakhir',
        short_name: 'Terakhir',
        description: 'Buka presentasi terakhir yang pernah dibuka di perangkat ini.',
        url: '/presentation/?last=1&source=pwa-shortcut',
        icons: [{ src: '/icons/presentation-96.png', sizes: '96x96', type: 'image/png' }]
      },
      {
        name: 'Buat presentasi baru',
        short_name: 'Baru',
        description: 'Mulai dari daftar project ITS Presentasi.',
        url: '/presentation/?source=pwa-new',
        icons: [{ src: '/icons/presentation-96.png', sizes: '96x96', type: 'image/png' }]
      }
    ].slice(0, 4)
  };
}

async function readPresentationRecents() {
  try {
    const cached = await caches.match(PRESENTATION_SHORTCUTS_URL);
    return cached ? await cached.json() : [];
  } catch {
    return [];
  }
}

async function presentationManifestResponse() {
  const recent = await readPresentationRecents();
  return new Response(JSON.stringify(basePresentationManifest(Array.isArray(recent) ? recent : []), null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
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
  const url = new URL(event.request.url);
  const cacheable = url.protocol === 'http:' || url.protocol === 'https:';

  if (url.pathname === '/presentation-manifest.webmanifest') {
    event.respondWith(presentationManifestResponse());
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          if (cacheable && url.origin === self.location.origin) {
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (!cacheable) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      try {
        const copy = response.clone();
        if (url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
      } catch (e) {
        // ignore opaque responses and other failures
      }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'ITS_PRESENTATION_RECENTS' || !Array.isArray(data.items)) return;
  const items = data.items.slice(0, 3).map((item) => ({
    title: String(item.title || 'Presentasi').slice(0, 64),
    url: String(item.url || '/presentation/?last=1&source=pwa-shortcut'),
    themeColor: /^#[0-9a-f]{6}$/i.test(String(item.themeColor || '')) ? String(item.themeColor) : undefined,
    backgroundColor: /^#[0-9a-f]{6}$/i.test(String(item.backgroundColor || '')) ? String(item.backgroundColor) : undefined
  }));
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.put(PRESENTATION_SHORTCUTS_URL, new Response(JSON.stringify(items), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }
    })))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
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
      image: payload.image,
      tag: payload.tag || 'its-public-update',
      data: { url: targetUrl },
    })
  );
});

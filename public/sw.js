const STATIC_CACHE = 'maccms-static-v1';
const CORE_FILES = [
  '/offline.html',
  '/manifest.webmanifest',
  '/static/pwa-icon.svg',
  '/static/theme/css/style.css',
  '/static/theme/css/white.css',
  '/static/theme/css/maccms.css',
  '/static/theme/theme.js',
  '/static/theme/layout.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('maccms-static-') && key !== STATIC_CACHE).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }

  if (url.pathname.startsWith('/static/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = String(data.title || '站内通知').slice(0, 120);
  const body = String(data.body || '').slice(0, 500);
  const target = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/user.html';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/static/pwa-icon.svg',
    badge: '/static/pwa-icon.svg',
    tag: 'maccms-notification',
    data: { url: target },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url || '/user.html';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      existing.navigate(target);
      return existing.focus();
    }
    return clients.openWindow(target);
  }));
});

const CACHE_NAME = 'urij-v131';
const ASSETS = [
  './index.html', './hee.html', './work.html', './husband.html',
  './manifest.json', './manifest-hee.json', './manifest-husband.json',
  './manifest-work.json', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c =>
    Promise.allSettled(ASSETS.map(a => c.add(a).catch(() => {})))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate' || e.request.url.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});

// 페이지에서 postMessage로 알림 요청
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(e.data.title, {
      body: e.data.body || '',
      icon: './icon-192.png',
      tag: e.data.tag || ('cs-' + Date.now()),
      requireInteraction: false
    });
  }
});

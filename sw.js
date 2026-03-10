const CACHE_NAME = 'urij-v46';
const ASSETS = [
  './index.html',
  './shop.html',
  './house.html',
  './jinwoo.html',
  './invest.html',
  './recipe.html',
  './husband.html',
  './app.js',
  './style.css',
  './manifest.json',
  './manifest-husband.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

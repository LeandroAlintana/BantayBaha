const CACHE_NAME = 'bantaybaha-v5';
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './bantaybaha-icon.svg',
  './bantaybaha-192.png',
  './bantaybaha-512.png',
  './styles/main.css',
  './js/app.js',
  './js/camera.js',
  './js/supabase.js',
  './js/supabase-config.js',
  './js/admin.js',
  './js/vision.js',
  './pages/tracking.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

const CACHE_NAME = 'droptv-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/main.js',
  '/cast_sender.js',
  '/droptv.svg',
  '/musique.png',
  '/icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});


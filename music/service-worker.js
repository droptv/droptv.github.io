const CACHE_NAME = 'droptv-radio-v1';
const FILES = [
  '/music/',
  '/music/index.html',
  '/music/cover.jpg',
  '/music/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(resp => resp || fetch(e.request)));
});

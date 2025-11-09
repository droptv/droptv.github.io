const CACHE_NAME = "droptv-music-v1";
const URLS_TO_CACHE = [
  "/music/",
  "/music/index.html",
  "/music/style.css",
  "/music/app.js",
  "/music/cover.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  console.log("Service Worker instalado.");
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  console.log("Service Worker ativo.");
});


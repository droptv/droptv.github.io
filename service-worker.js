// === DropTV Service Worker (sem cache persistente) ===

// Nome simbólico apenas para controle de versão
const CACHE_NAME = "droptv-nocache-v1";

// Instala e ativa imediatamente (sem armazenar nada)
self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(clients.claim());
});

// Intercepta requisições, mas SEM usar cache
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        // opcional: retorna algo se estiver offline
        return new Response(
          "Sem conexão. Recarregue quando estiver online.",
          { status: 503, headers: { "Content-Type": "text/plain" } }
        );
      })
  );
});

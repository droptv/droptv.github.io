// === DropTV Service Worker (sem cache persistente) ===

// Instala e ativa imediatamente
self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Intercepta requisições, mas SEM usar cache
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // Se for navegação (HTML), mostra mensagem simples
      if (event.request.mode === "navigate") {
        return new Response(
          "Sem conexão. Recarregue quando estiver online.",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          }
        );
      }

      // Para now.json, HLS etc, devolve 503 vazio (o JS já trata e ignora)
      return new Response("", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    })
  );
});

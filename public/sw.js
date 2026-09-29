// Service worker mínimo: la única razón de ser es servir /offline cuando
// no hay red. No cachea nada más — en particular, nunca debe cachear una
// página autenticada (/admin, /apoderado, /funcionario) ni una respuesta
// de Server Action (que siempre llegan como POST). Se logra por omisión,
// no por una lista de exclusiones: solo se intercepta la navegación GET,
// todo lo demás pasa directo a la red sin que este archivo lo toque.

const CACHE = "nubiratag-offline-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo navegación de documento vía GET. Cualquier otra cosa (assets,
  // POST de Server Actions, fetch de datos, etc.) no se intercepta.
  if (request.method !== "GET" || request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())
    )
  );
});

// Payload lo arma lib/push.ts (JSON.stringify({ title, body, url })) —
// bajo nuestro control, no hace falta validar la forma más allá de que
// exista event.data.
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const datos = event.data.json();

  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: datos.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = new URL(
    event.notification.data?.url ?? "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((lista) => {
        const existente = lista.find((cliente) => cliente.url === url);
        if (existente) return existente.focus();
        return clients.openWindow(url);
      })
  );
});

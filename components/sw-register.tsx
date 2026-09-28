"use client";

import { useEffect } from "react";

// Sin skipWaiting/clients.claim en el SW: el registro es "fire and
// forget", no hace falta reaccionar a updatefound acá — la próxima carga
// completa de la app ya toma la versión nueva.
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("No se pudo registrar el service worker:", error);
    });
  }, []);

  return null;
}

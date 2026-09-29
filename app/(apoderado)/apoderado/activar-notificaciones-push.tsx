"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Share } from "lucide-react";

import { guardarSuscripcion, eliminarSuscripcion } from "./push-actions";

type Estado =
  | "cargando"
  | "no-soportado"
  | "ios-no-instalado"
  | "permiso-denegado"
  | "inactivo"
  | "activo";

// Boilerplate estándar para pasar la clave pública VAPID (base64url) al
// formato que pide PushManager.subscribe. El cast a BufferSource evita un
// choque de tipos de TS reciente (Uint8Array<ArrayBufferLike> vs el
// ArrayBuffer concreto que espera el lib.dom.d.ts) — en runtime es un
// Uint8Array normal, sin ninguna rareza.
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Seguro = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Seguro);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))) as BufferSource;
}

async function calcularEstado(vapidPublicKey: string | null): Promise<Estado> {
  if (!vapidPublicKey) {
    return "no-soportado";
  }

  const soportado =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  if (!soportado) {
    return "no-soportado";
  }

  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const esStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  // En iOS, Web Push solo existe dentro de la PWA instalada — pedir
  // permiso desde una pestaña normal de Safari no funciona. Se corta acá
  // antes de tocar Notification.permission.
  if (esIOS && !esStandalone) {
    return "ios-no-instalado";
  }

  if (Notification.permission === "denied") {
    return "permiso-denegado";
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? "activo" : "inactivo";
  } catch {
    return "inactivo";
  }
}

export function ActivarNotificacionesPush({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [pendiente, startTransition] = useTransition();

  // Todos estos chequeos dependen de window/navigator — tienen que
  // correr después del mount, nunca durante el render inicial (mismatch
  // de hidratación con lo que sea que haya renderizado el servidor). El
  // cálculo vive en calcularEstado() (fuera del componente) para que acá
  // el único setEstado quede dentro de un .then(), no síncrono en el
  // cuerpo del efecto.
  useEffect(() => {
    let cancelado = false;

    calcularEstado(vapidPublicKey).then((resultado) => {
      if (!cancelado) setEstado(resultado);
    });

    return () => {
      cancelado = true;
    };
  }, [vapidPublicKey]);

  function activar() {
    startTransition(async () => {
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          setEstado(permiso === "denied" ? "permiso-denegado" : "inactivo");
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
        });

        const { endpoint, keys } = subscription.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };

        await guardarSuscripcion({
          endpoint,
          claveP256dh: keys.p256dh,
          claveAuth: keys.auth,
          userAgent: navigator.userAgent,
        });

        setEstado("activo");
      } catch (error) {
        console.error("No se pudo activar las notificaciones:", error);
      }
    });
  }

  function desactivar() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          await eliminarSuscripcion(subscription.endpoint);
          await subscription.unsubscribe();
        }

        setEstado("inactivo");
      } catch (error) {
        console.error("No se pudo desactivar las notificaciones:", error);
      }
    });
  }

  if (estado === "cargando") {
    return null;
  }

  if (estado === "no-soportado") {
    return (
      <p className="text-sm text-gray-400">
        Notificaciones no disponibles en este dispositivo.
      </p>
    );
  }

  if (estado === "ios-no-instalado") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-gray-400" />
          <p className="text-sm font-medium text-gray-900">
            Activa las notificaciones
          </p>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Para recibir un aviso cuando encontremos un objeto, agrega
          NubiraTag a tu pantalla de inicio: toca{" "}
          <Share className="inline h-4 w-4 align-text-bottom" /> Compartir y
          luego &quot;Agregar a inicio&quot;.
        </p>
      </div>
    );
  }

  if (estado === "permiso-denegado") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <BellOff className="h-5 w-5 text-gray-400" />
          <p className="text-sm font-medium text-gray-900">
            Notificaciones bloqueadas
          </p>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Bloqueaste los avisos de NubiraTag en tu navegador. Actívalos desde
          la configuración del sitio para recibir un aviso apenas
          encontremos un objeto.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 shrink-0 text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {estado === "activo"
                ? "Notificaciones activas"
                : "Activa las notificaciones"}
            </p>
            <p className="text-sm text-gray-500">
              {estado === "activo"
                ? "Te avisamos apenas encontremos un objeto de tus hijos."
                : "Recibe un aviso apenas encontremos un objeto de tus hijos."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={estado === "activo" ? desactivar : activar}
          disabled={pendiente}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-[#54A6D8] hover:text-[#54A6D8] disabled:opacity-50"
        >
          {pendiente ? "..." : estado === "activo" ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  );
}

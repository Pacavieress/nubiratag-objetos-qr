"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, Share } from "lucide-react";

import { guardarSuscripcion, eliminarSuscripcion } from "./push-actions";

type Estado =
  | "cargando"
  | "no-soportado"
  | "ios-no-instalado"
  | "permiso-denegado"
  | "inactivo"
  | "activo";

const DESCARTADO_KEY = "nubiratag:push-descartado";
const DESCARTADO_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

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

// try/catch porque localStorage puede lanzar (navegación privada, sitio
// bloqueado) — degradación aceptable: si falla, el aviso simplemente
// vuelve a aparecer en la próxima carga, no rompe nada.
function leerDescartadoReciente(): boolean {
  try {
    const valor = localStorage.getItem(DESCARTADO_KEY);
    if (!valor) return false;
    const descartadoEn = Number(valor);
    return (
      Number.isFinite(descartadoEn) &&
      Date.now() - descartadoEn < DESCARTADO_DIAS_MS
    );
  } catch {
    return false;
  }
}

function guardarDescartado(): void {
  try {
    localStorage.setItem(DESCARTADO_KEY, String(Date.now()));
  } catch {
    // Ver comentario de leerDescartadoReciente.
  }
}

export function ActivarNotificacionesPush({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  // Inicializador perezoso (no un setState en el efecto): localStorage no
  // existe en el render del servidor, pero leerDescartadoReciente ya
  // devuelve false ahí (su try/catch atrapa el ReferenceError) — mismo
  // resultado que el cliente ve en su primer render, así que no hay
  // mismatch de hidratación.
  const [descartado, setDescartado] = useState(() => leerDescartadoReciente());
  const [pendiente, startTransition] = useTransition();

  // Todos estos chequeos dependen de window/navigator — tienen que correr
  // después del mount, nunca durante el render inicial (mismatch de
  // hidratación). calcularEstado vive fuera del componente para que acá
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

  const mostrarBanner =
    !descartado && (estado === "inactivo" || estado === "ios-no-instalado");

  // Transición de entrada del banner (baja desde arriba): arranca fuera
  // de pantalla y se anima al frame siguiente a que mostrarBanner pase a
  // true, en vez de aparecer de golpe ya en su posición final.
  const [animarEntrada, setAnimarEntrada] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setAnimarEntrada(mostrarBanner)
    );
    return () => cancelAnimationFrame(id);
  }, [mostrarBanner]);

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

        // Activar con éxito: el aviso desaparece y no vuelve a mostrarse
        // (estado ya no es "inactivo"/"ios-no-instalado", así que
        // mostrarBanner pasa a false solo).
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

  function ahoraNo() {
    guardarDescartado();
    setDescartado(true);
  }

  if (estado === "cargando" || estado === "permiso-denegado") {
    return null;
  }

  if (estado === "no-soportado") {
    return (
      <p className="text-sm text-gray-400">
        Notificaciones no disponibles en este dispositivo.
      </p>
    );
  }

  if (estado === "activo") {
    return (
      <p className="text-center">
        <button
          type="button"
          onClick={desactivar}
          disabled={pendiente}
          className="text-xs text-gray-400 underline disabled:opacity-50"
        >
          {pendiente ? "..." : "Desactivar notificaciones"}
        </button>
      </p>
    );
  }

  if (!mostrarBanner) {
    return null;
  }

  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 border-b border-gray-100 bg-white px-4 pb-3 shadow-sm transition-transform duration-300 ${
        animarEntrada ? "translate-y-0" : "-translate-y-full"
      }`}
      style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
    >
      <div className="mx-auto flex max-w-2xl items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#54A6D8]" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">
            Activa las notificaciones
          </p>
          {estado === "ios-no-instalado" ? (
            <p className="mt-1 text-sm text-gray-500">
              Para recibir un aviso cuando encontremos un objeto, agrega
              NubiraTag a tu pantalla de inicio: toca{" "}
              <Share className="inline h-4 w-4 align-text-bottom" /> Compartir
              y luego &quot;Agregar a inicio&quot;.
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              Recibe un aviso apenas encontremos un objeto de tus hijos.
            </p>
          )}
          <div className="mt-3 flex items-center gap-4">
            {estado === "inactivo" && (
              <button
                type="button"
                onClick={activar}
                disabled={pendiente}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-[#54A6D8] hover:text-[#54A6D8] disabled:opacity-50"
              >
                {pendiente ? "..." : "Activar"}
              </button>
            )}
            <button
              type="button"
              onClick={ahoraNo}
              className="text-sm font-medium text-gray-400"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

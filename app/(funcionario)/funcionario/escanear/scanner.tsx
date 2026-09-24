"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import type { IScannerError } from "@yudiel/react-qr-scanner";

import { validarToken } from "./actions";

// Sin doble lectura de confirmación: validarToken ya es la autoridad real
// (server-side, sin tocar), así que una lectura única errónea solo muestra
// un mensaje y reactiva el scanner — no hay daño en actuar de inmediato.
// retryDelay bajo para detectar más rápido en cualquier ángulo/distancia
// sin exigir un encuadre preciso.
const RETRY_DELAY_MS = 250;

// Mapea el `kind` que entrega la librería a un mensaje entendible. En
// particular "insecure-context" es el caso esperado mientras se prueba por
// IP LAN (getUserMedia exige HTTPS o localhost) — el ingreso manual de abajo
// sigue funcionando igual en ese caso.
function mensajeError(error: IScannerError): string {
  switch (error.kind) {
    case "permission-denied":
      return "No se pudo acceder a la cámara. Revisa los permisos del navegador.";
    case "insecure-context":
      return "El escaneo por cámara requiere una conexión segura (HTTPS). Usa el ingreso manual.";
    case "no-camera":
      return "No se encontró ninguna cámara en este dispositivo.";
    case "in-use":
      return "La cámara está siendo usada por otra aplicación.";
    case "unsupported":
      return "Este navegador no soporta el escaneo por cámara.";
    default:
      return "No se pudo activar la cámara. Usa el ingreso manual.";
  }
}

// Beep propio (Web Audio API, sin archivo de sonido) + vibración, disparado
// en la lectura exitosa — reemplaza el beep interno de la librería
// (sound={false} más abajo) para tener control total del feedback.
function reproducirConfirmacion() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(200);
  }

  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscilador = ctx.createOscillator();
    const ganancia = ctx.createGain();

    oscilador.type = "sine";
    oscilador.frequency.value = 880;
    ganancia.gain.setValueAtTime(0.2, ctx.currentTime);
    ganancia.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    oscilador.connect(ganancia);
    ganancia.connect(ctx.destination);

    oscilador.start();
    oscilador.stop(ctx.currentTime + 0.15);
    oscilador.onended = () => ctx.close();
  } catch {
    // Sin beep propio si el navegador bloquea AudioContext (ej. sin
    // interacción previa) — la vibración y el mensaje visual ya avisan,
    // no hace falta mostrar error por esto.
  }
}

export function EscanerQr() {
  const router = useRouter();

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");

  async function procesarCandidato(entrada: string) {
    if (!entrada.trim() || validando) return;

    setValidando(true);
    setMensaje(null);

    try {
      const resultado = await validarToken(entrada);

      if (resultado.ok) {
        router.push(`/q/${resultado.token}`);
        return;
      }

      setMensaje(resultado.error);
    } catch {
      // validarToken puede lanzar (ej. sesión vencida vía
      // requireFuncionario) — sin este catch, la promesa rechazada dejaba
      // validando en true para siempre y el scanner quedaba pausado en
      // silencio, sin ningún mensaje.
      setMensaje(
        "No se pudo validar el código. Si el problema sigue, recarga la página."
      );
    } finally {
      // Reactiva el scanner tras una pausa breve: evita que el mismo QR
      // inválido dispare onScan en loop inmediato mientras sigue en cuadro.
      setTimeout(() => setValidando(false), 1500);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    procesarCandidato(manualValue);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="relative mx-auto w-full max-w-[300px] aspect-square max-h-[50dvh] touch-pan-y overflow-hidden rounded-xl border border-gray-200">
        {cameraError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-gray-50 p-6 text-center">
            <p className="text-sm text-gray-600">{cameraError}</p>
          </div>
        ) : (
          <Scanner
            onScan={(codigos) => {
              const valor = codigos[0]?.rawValue;
              if (!valor) return;

              reproducirConfirmacion();
              procesarCandidato(valor);
            }}
            onError={(error) => setCameraError(mensajeError(error))}
            paused={validando}
            formats={["qr_code"]}
            constraints={{
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }}
            components={{ finder: true, torch: true }}
            retryDelay={RETRY_DELAY_MS}
            sound={false}
          />
        )}
      </div>

      {mensaje && (
        <p className="text-sm text-red-600" role="alert">
          {mensaje}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="codigo-manual"
          className="text-xs font-medium tracking-wide text-gray-500"
        >
          O INGRESA EL CÓDIGO MANUALMENTE
        </label>
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            id="codigo-manual"
            name="codigo"
            type="text"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="Pega la URL o el código del QR"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[16px] focus:border-[#54A6D8] focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
          />
          <button
            type="submit"
            disabled={validando || !manualValue.trim()}
            className="shrink-0 rounded-lg bg-[#ff914d] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#e08044] disabled:opacity-50"
          >
            Buscar
          </button>
        </form>
      </div>
    </div>
  );
}

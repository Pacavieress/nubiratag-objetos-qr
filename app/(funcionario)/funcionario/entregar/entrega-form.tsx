"use client";

import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import type { IScannerError } from "@yudiel/react-qr-scanner";

import {
  buscarPorCodigo,
  confirmarCalce,
  deshacerEntrega,
  entregarObjeto,
} from "./actions";

// Nota: no se extrajo un <CameraScanner> compartido con
// funcionario/escanear/scanner.tsx a propósito — solo hay dos usos, con
// lógicas de onScan bastante distintas (uno navega, este otro compara
// contra un hallazgo puntual), y armar una API genérica para dos
// instancias parecía prematuro. El bloque del visor se duplica.
const RETRY_DELAY_MS = 250;
const VENTANA_DESHACER_MS = 10_000;

function mensajeErrorCamara(error: IScannerError): string {
  switch (error.kind) {
    case "permission-denied":
      return "No se pudo acceder a la cámara. Revisa los permisos del navegador.";
    case "insecure-context":
      return "El escaneo por cámara requiere una conexión segura (HTTPS).";
    case "no-camera":
      return "No se encontró ninguna cámara en este dispositivo.";
    case "in-use":
      return "La cámara está siendo usada por otra aplicación.";
    case "unsupported":
      return "Este navegador no soporta el escaneo por cámara.";
    default:
      return "No se pudo activar la cámara.";
  }
}

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
    // Sin beep propio si el navegador bloquea AudioContext.
  }
}

type Hallazgo = {
  hallazgoId: number;
  etiqueta: string | null;
  ubicacion: string;
  fecha: string;
};

export function EntregaForm() {
  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [hallazgo, setHallazgo] = useState<Hallazgo | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [validandoCalce, setValidandoCalce] = useState(false);
  const [mensajeCalce, setMensajeCalce] = useState<string | null>(null);
  const [coincide, setCoincide] = useState(false);
  // Token que efectivamente hizo calce — se vuelve a mandar (y revalidar
  // en servidor) al entregar, para que la entrega no dependa de lo que
  // haya decidido la UI.
  const [tokenCoincidente, setTokenCoincidente] = useState<string | null>(
    null
  );

  const [entregando, setEntregando] = useState(false);
  const [entregado, setEntregado] = useState(false);
  const [mostrarDeshacer, setMostrarDeshacer] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [mensajeGeneral, setMensajeGeneral] = useState<string | null>(null);

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim() || buscando) return;

    setBuscando(true);
    setErrorCodigo(null);

    const formData = new FormData();
    formData.set("codigo", codigo);
    const resultado = await buscarPorCodigo(undefined, formData);

    setBuscando(false);

    if (!resultado.ok) {
      setErrorCodigo(resultado.error);
      return;
    }

    setHallazgo({
      hallazgoId: resultado.hallazgoId,
      etiqueta: resultado.etiqueta,
      ubicacion: resultado.ubicacion,
      fecha: resultado.fecha,
    });
  }

  async function handleScan(valor: string) {
    if (!hallazgo || validandoCalce || coincide) return;

    setValidandoCalce(true);
    setMensajeCalce(null);

    const resultado = await confirmarCalce(hallazgo.hallazgoId, valor);

    setValidandoCalce(false);

    if (resultado.ok) {
      reproducirConfirmacion();
      setTokenCoincidente(valor);
      setCoincide(true);
      return;
    }

    setMensajeCalce(resultado.error);
  }

  async function handleEntregar() {
    if (!hallazgo || !tokenCoincidente || entregando) return;

    setEntregando(true);
    setMensajeGeneral(null);

    const resultado = await entregarObjeto(
      hallazgo.hallazgoId,
      tokenCoincidente
    );

    setEntregando(false);

    if (!resultado.ok) {
      setMensajeGeneral(resultado.error);
      return;
    }

    setEntregado(true);
    setMostrarDeshacer(true);
    setTimeout(() => setMostrarDeshacer(false), VENTANA_DESHACER_MS);
  }

  async function handleDeshacer() {
    if (!hallazgo || deshaciendo) return;

    setDeshaciendo(true);
    const resultado = await deshacerEntrega(hallazgo.hallazgoId);
    setDeshaciendo(false);

    if (!resultado.ok) {
      setMensajeGeneral(resultado.error);
      return;
    }

    handleNuevoRetiro();
  }

  function handleNuevoRetiro() {
    setCodigo("");
    setHallazgo(null);
    setCoincide(false);
    setTokenCoincidente(null);
    setMensajeCalce(null);
    setEntregado(false);
    setMostrarDeshacer(false);
    setMensajeGeneral(null);
    setErrorCodigo(null);
  }

  if (entregado) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 text-center sm:p-6">
        <p className="text-base font-medium text-emerald-700">
          Objeto entregado correctamente.
        </p>
        {mostrarDeshacer && (
          <button
            type="button"
            onClick={handleDeshacer}
            disabled={deshaciendo}
            className="text-sm font-medium text-red-600 underline disabled:opacity-50"
          >
            {deshaciendo ? "Deshaciendo..." : "Deshacer"}
          </button>
        )}
        {mensajeGeneral && (
          <p className="text-sm text-red-600" role="alert">
            {mensajeGeneral}
          </p>
        )}
        <button
          type="button"
          onClick={handleNuevoRetiro}
          className="text-sm font-medium text-[#54A6D8]"
        >
          Registrar otra entrega
        </button>
      </div>
    );
  }

  if (!hallazgo) {
    return (
      <form onSubmit={handleBuscar} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="codigo-retiro"
            className="text-xs font-medium tracking-wide text-gray-500"
          >
            CÓDIGO DE RETIRO
          </label>
          <input
            id="codigo-retiro"
            name="codigo"
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="p. ej. 7K9XPQ"
            autoCapitalize="characters"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg font-semibold uppercase tracking-[0.3em] focus:border-[#54A6D8] focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
          />
        </div>

        {errorCodigo && (
          <p className="text-sm text-red-600" role="alert">
            {errorCodigo}
          </p>
        )}

        <button
          type="submit"
          disabled={buscando || !codigo.trim()}
          className="rounded-lg bg-[#ff914d] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#e08044] disabled:opacity-50"
        >
          {buscando ? "Buscando..." : "Buscar"}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        <p className="text-base font-semibold text-gray-900">
          {hallazgo.etiqueta ?? "Objeto"}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Ubicación: {hallazgo.ubicacion}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Llegó el {new Date(hallazgo.fecha).toLocaleDateString("es-CL")}
        </p>
      </div>

      {!coincide ? (
        <>
          <p className="text-sm text-gray-600">
            Escanea el QR de la prenda para confirmar que es la correcta.
          </p>
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
                  handleScan(valor);
                }}
                onError={(error) => setCameraError(mensajeErrorCamara(error))}
                paused={validandoCalce}
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
          {mensajeCalce && (
            <p className="text-sm text-red-600" role="alert">
              {mensajeCalce}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-emerald-700">
            La prenda coincide.
          </p>
          <button
            type="button"
            onClick={handleEntregar}
            disabled={entregando}
            className="rounded-lg bg-[#ff914d] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#e08044] disabled:opacity-50"
          >
            {entregando ? "Entregando..." : "Entregar"}
          </button>
        </>
      )}

      {mensajeGeneral && (
        <p className="text-sm text-red-600" role="alert">
          {mensajeGeneral}
        </p>
      )}
    </div>
  );
}

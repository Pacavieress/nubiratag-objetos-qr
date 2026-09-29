"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Circle,
  Download,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Type,
  X,
} from "lucide-react";

const STORAGE_KEY = "grabacion-teleprompter";
const TAMANO_MIN = 20;
const TAMANO_MAX = 120;
const VELOCIDAD_MIN = 10;
const VELOCIDAD_MAX = 300;

type Dispositivo = { id: string; label: string };
type Fase = "preparar" | "grabar";

function elegirMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidatos = [
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  return candidatos.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

// Sin procesamiento del navegador por defecto: el AGC/supresión de ruido
// de Chrome suele comprimir y "bombear" la voz en grabaciones.
function restriccionesAudio(
  microfonoId: string,
  procesar: boolean
): MediaTrackConstraints {
  return {
    deviceId: microfonoId ? { exact: microfonoId } : undefined,
    echoCancellation: procesar,
    noiseSuppression: procesar,
    autoGainControl: procesar,
    channelCount: 1,
    sampleRate: 48000,
  };
}

function mensajeErrorMedia(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permiso denegado. Permite el acceso a la cámara y al micrófono en la barra de direcciones del navegador y vuelve a intentar.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se encontró la cámara o el micrófono seleccionado. Revisa que estén conectados.";
    case "NotReadableError":
      return "La cámara o el micrófono están en uso por otra aplicación. Ciérrala y vuelve a intentar.";
    default:
      return "No se pudo acceder a la cámara y al micrófono.";
  }
}

function nombreArchivo(ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `grabacion-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}

function formatoTiempo(seg: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(seg / 60))}:${p(seg % 60)}`;
}

export function Teleprompter() {
  const [fase, setFase] = useState<Fase>("preparar");
  const [guion, setGuion] = useState("");
  const [tamano, setTamano] = useState(48);
  const [velocidad, setVelocidad] = useState(60);
  const [espejo, setEspejo] = useState(false);
  const [cuentaRegresiva, setCuentaRegresiva] = useState(true);
  const [procesarAudio, setProcesarAudio] = useState(false);

  const [camaras, setCamaras] = useState<Dispositivo[]>([]);
  const [microfonos, setMicrofonos] = useState<Dispositivo[]>([]);
  const [camaraId, setCamaraId] = useState("");
  const [microfonoId, setMicrofonoId] = useState("");
  const [errorPrep, setErrorPrep] = useState<string | null>(null);

  const [errorGrabar, setErrorGrabar] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [conteo, setConteo] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [resultado, setResultado] = useState<{
    url: string;
    ext: string;
  } | null>(null);
  const [intento, setIntento] = useState(0);

  const cargadoRef = useRef(false);
  const guionRef = useRef<HTMLTextAreaElement>(null);
  const medidorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const velocidadRef = useRef(velocidad);
  const conteoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    velocidadRef.current = velocidad;
  }, [velocidad]);

  // Persistencia: solo guion, tamaño y velocidad.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as {
          guion?: string;
          tamano?: number;
          velocidad?: number;
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (typeof d.guion === "string") setGuion(d.guion);
        if (typeof d.tamano === "number") setTamano(d.tamano);
        if (typeof d.velocidad === "number") setVelocidad(d.velocidad);
      }
    } catch {
      // localStorage no disponible o JSON inválido: se ignora.
    }
    cargadoRef.current = true;
  }, []);

  useEffect(() => {
    if (!cargadoRef.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ guion, tamano, velocidad })
      );
    } catch {
      // Sin persistencia: no es crítico.
    }
  }, [guion, tamano, velocidad]);

  const detenerStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const enumerar = useCallback(async () => {
    try {
      const todos = await navigator.mediaDevices.enumerateDevices();
      const aDisp = (tipo: MediaDeviceKind, nombre: string) =>
        todos
          .filter((d) => d.kind === tipo && d.deviceId)
          .map((d, i) => ({
            id: d.deviceId,
            label: d.label || `${nombre} ${i + 1}`,
          }));
      const cams = aDisp("videoinput", "Cámara");
      const mics = aDisp("audioinput", "Micrófono");
      setCamaras(cams);
      setMicrofonos(mics);
      setCamaraId((prev) => prev || cams[0]?.id || "");
      setMicrofonoId((prev) => prev || mics[0]?.id || "");
      return todos.some((d) => d.label);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void enumerar();
  }, [enumerar]);

  // Los nombres de dispositivos solo aparecen tras conceder permiso.
  async function pedirPermiso() {
    setErrorPrep(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      s.getTracks().forEach((t) => t.stop());
      await enumerar();
    } catch (err) {
      setErrorPrep(mensajeErrorMedia(err));
    }
  }

  // Medidor de nivel del micrófono en la fase Preparar. Solo arranca si ya
  // hay permiso (hay micrófonos listados); usa las mismas restricciones que
  // la grabación para que el nivel refleje lo que se va a grabar.
  const hayMicrofonos = microfonos.length > 0;
  useEffect(() => {
    if (fase !== "preparar" || !hayMicrofonos) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    let cancelado = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: restriccionesAudio(microfonoId, procesarAudio),
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const datos = new Uint8Array(analyser.fftSize);
        const medir = () => {
          analyser.getByteTimeDomainData(datos);
          let suma = 0;
          for (const v of datos) {
            const x = (v - 128) / 128;
            suma += x * x;
          }
          const rms = Math.sqrt(suma / datos.length);
          // Escala en dBFS: -60 dB → 0%, 0 dB → 100%.
          const db = 20 * Math.log10(Math.max(rms, 1e-6));
          const pct = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));
          if (medidorRef.current) {
            medidorRef.current.style.width = `${pct}%`;
            medidorRef.current.style.backgroundColor =
              pct > 90 ? "#dc2626" : pct > 30 ? "#54A6D8" : "#9ca3af";
          }
          raf = requestAnimationFrame(medir);
        };
        medir();
      } catch (err) {
        if (!cancelado) setErrorPrep(mensajeErrorMedia(err));
      }
    })();

    return () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [fase, hayMicrofonos, microfonoId, procesarAudio]);

  // Adquiere el stream al entrar a la fase de grabación (o al reintentar).
  useEffect(() => {
    if (fase !== "grabar") return;
    let cancelado = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorGrabar(
          "Este navegador no permite acceder a la cámara (requiere HTTPS)."
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: camaraId ? { exact: camaraId } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: restriccionesAudio(microfonoId, procesarAudio),
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setListo(true);
      } catch (err) {
        if (!cancelado) setErrorGrabar(mensajeErrorMedia(err));
      }
    })();

    return () => {
      cancelado = true;
      detenerStream();
      setListo(false);
    };
    // camaraId/microfonoId se fijan al iniciar; no deben re-adquirir el stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, intento, detenerStream]);

  // Scroll automático del guion.
  useEffect(() => {
    if (!scrolling || fase !== "grabar") return;
    let raf = 0;
    let ultimo = performance.now();
    const paso = (ahora: number) => {
      const el = scrollRef.current;
      if (el) {
        posRef.current += (velocidadRef.current * (ahora - ultimo)) / 1000;
        const max = el.scrollHeight - el.clientHeight;
        if (posRef.current >= max) {
          posRef.current = max;
          el.scrollTop = max;
          setScrolling(false);
          return;
        }
        el.scrollTop = posRef.current;
      }
      ultimo = ahora;
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [scrolling, fase]);

  // Cronómetro.
  useEffect(() => {
    if (!grabando) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [grabando]);

  const empezarGrabacion = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = elegirMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 192000,
        videoBitsPerSecond: 8000000,
      });
    } catch {
      setErrorGrabar("Este navegador no puede grabar video.");
      return;
    }
    const trozos: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) trozos.push(e.data);
    };
    recorder.onstop = () => {
      const tipo = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(trozos, { type: tipo });
      setResultado({
        url: URL.createObjectURL(blob),
        ext: tipo.includes("mp4") ? "mp4" : "webm",
      });
      detenerStream();
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setSegundos(0);
    setGrabando(true);
    setScrolling(true);
  }, [detenerStream]);

  function alternarGrabacion() {
    if (grabando) {
      recorderRef.current?.stop();
      setGrabando(false);
      setScrolling(false);
      return;
    }
    if (conteo !== null) {
      // Cancelar cuenta regresiva.
      if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
      setConteo(null);
      return;
    }
    if (!cuentaRegresiva) {
      empezarGrabacion();
      return;
    }
    let n = 3;
    setConteo(n);
    conteoTimerRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
        setConteo(null);
        empezarGrabacion();
      } else {
        setConteo(n);
      }
    }, 1000);
  }

  function reiniciarPosicion() {
    posRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  function salir() {
    if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    detenerStream();
    if (resultado) URL.revokeObjectURL(resultado.url);
    setResultado(null);
    setConteo(null);
    setGrabando(false);
    setScrolling(false);
    setErrorGrabar(null);
    setFase("preparar");
  }

  function grabarDeNuevo() {
    if (resultado) URL.revokeObjectURL(resultado.url);
    setResultado(null);
    setSegundos(0);
    setErrorGrabar(null);
    reiniciarPosicion();
    setIntento((n) => n + 1);
  }

  // El guion se persiste en un efecto sobre [guion], así que vaciarlo acá
  // también lo deja vacío en localStorage.
  function borrarGuion() {
    setGuion("");
    guionRef.current?.focus();
  }

  function iniciar() {
    posRef.current = 0;
    setSegundos(0);
    setErrorGrabar(null);
    setFase("grabar");
  }

  // Liberar todo al salir de la pantalla.
  useEffect(() => {
    return () => {
      if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Atajos: espacio = pausar scroll, flechas = velocidad.
  useEffect(() => {
    if (fase !== "grabar" || resultado) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        setScrolling((s) => !s);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setVelocidad((v) => Math.min(VELOCIDAD_MAX, v + 10));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setVelocidad((v) => Math.max(VELOCIDAD_MIN, v - 10));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fase, resultado]);

  const textoStyle = {
    fontSize: `${tamano}px`,
    transform: espejo ? "scaleX(-1)" : undefined,
  };

  if (fase === "preparar") {
    return (
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <label
              htmlFor="guion"
              className="text-sm font-medium text-gray-600"
            >
              Guion
            </label>
            <button
              type="button"
              onClick={borrarGuion}
              disabled={!guion}
              className="flex items-center gap-1 text-xs text-gray-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-gray-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Borrar todo
            </button>
          </div>
          <textarea
            id="guion"
            ref={guionRef}
            value={guion}
            onChange={(e) => setGuion(e.target.value)}
            placeholder="Pega o escribe aquí el guion…"
            className="mt-2 h-80 w-full resize-y rounded-xl border border-gray-200 p-3 text-base text-gray-900 outline-none focus:border-[#54A6D8] focus:ring-2 focus:ring-[#54A6D8]/30 lg:h-[28rem]"
          />
        </section>

        <section className="flex flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Tamaño de letra: {tamano}px
            <input
              type="range"
              min={TAMANO_MIN}
              max={TAMANO_MAX}
              value={tamano}
              onChange={(e) => setTamano(Number(e.target.value))}
              className="accent-[#54A6D8]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Velocidad de scroll: {velocidad} px/s
            <input
              type="range"
              min={VELOCIDAD_MIN}
              max={VELOCIDAD_MAX}
              value={velocidad}
              onChange={(e) => setVelocidad(Number(e.target.value))}
              className="accent-[#54A6D8]"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={espejo}
              onChange={(e) => setEspejo(e.target.checked)}
              className="h-4 w-4 accent-[#54A6D8]"
            />
            Espejo (voltear texto)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={cuentaRegresiva}
              onChange={(e) => setCuentaRegresiva(e.target.checked)}
              className="h-4 w-4 accent-[#54A6D8]"
            />
            Cuenta regresiva de 3 s
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={procesarAudio}
              onChange={(e) => setProcesarAudio(e.target.checked)}
              className="h-4 w-4 accent-[#54A6D8]"
            />
            Procesar audio del navegador
          </label>
          <p className="-mt-3 text-xs text-gray-500">
            Cancelación de eco, supresión de ruido y control automático de
            ganancia. Apagado suena más natural.
          </p>

          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
            {camaras.length === 0 && microfonos.length === 0 ? (
              <button
                type="button"
                onClick={pedirPermiso}
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[#54A6D8]/40"
              >
                <Camera className="h-4 w-4 text-[#54A6D8]" />
                Permitir cámara y micrófono
              </button>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-sm text-gray-600">
                  Cámara
                  <select
                    value={camaraId}
                    onChange={(e) => setCamaraId(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white p-2 text-sm text-gray-900"
                  >
                    {camaras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-600">
                  Micrófono
                  <select
                    value={microfonoId}
                    onChange={(e) => setMicrofonoId(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white p-2 text-sm text-gray-900"
                  >
                    {microfonos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {hayMicrofonos && (
              <div className="flex flex-col gap-1">
                <span className="text-sm text-gray-600">Nivel del micrófono</span>
                <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                  <div
                    ref={medidorRef}
                    className="h-full w-0 rounded-full bg-gray-400"
                  />
                </div>
                <span className="text-xs text-gray-500">
                  Habla normal: la barra debería quedar a mitad o más, sin
                  llegar al rojo.
                </span>
              </div>
            )}
            {errorPrep && (
              <p role="alert" className="text-sm text-red-600">
                {errorPrep}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={iniciar}
            disabled={!guion.trim()}
            className="mt-auto rounded-xl bg-[#54A6D8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4394c4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Iniciar
          </button>
        </section>
      </div>
    );
  }

  const botonCtrl =
    "flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-medium text-white transition hover:bg-white/25";

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      {resultado ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
          <video
            src={resultado.url}
            controls
            playsInline
            className="max-h-[75dvh] max-w-full rounded-xl"
          />
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={resultado.url}
              download={nombreArchivo(resultado.ext)}
              className="flex h-11 items-center gap-2 rounded-xl bg-[#54A6D8] px-5 text-sm font-semibold text-white hover:bg-[#4394c4]"
            >
              <Download className="h-4 w-4" />
              Descargar
            </a>
            <button type="button" onClick={grabarDeNuevo} className={botonCtrl}>
              <RotateCcw className="h-4 w-4" />
              Grabar de nuevo
            </button>
            <button type="button" onClick={salir} className={botonCtrl}>
              <X className="h-4 w-4" />
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />

          {/* Overlay DOM: no forma parte del stream que se graba. */}
          <div
            ref={scrollRef}
            className="absolute inset-x-0 top-0 h-[38dvh] overflow-hidden bg-black/60 px-6 sm:px-16"
          >
            <div className="h-[30dvh]" />
            <p
              className="whitespace-pre-wrap text-center font-semibold leading-snug"
              style={textoStyle}
            >
              {guion}
            </p>
            <div className="h-[38dvh]" />
          </div>

          {grabando && (
            <div className="absolute right-4 top-[40dvh] flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              REC {formatoTiempo(segundos)}
            </div>
          )}

          {conteo !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-9xl font-bold">
              {conteo}
            </div>
          )}

          {errorGrabar && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
              <p role="alert" className="max-w-md text-base">
                {errorGrabar}
              </p>
              <button type="button" onClick={salir} className={botonCtrl}>
                Volver
              </button>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-4">
            <button
              type="button"
              onClick={alternarGrabacion}
              disabled={!listo}
              className={`flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition disabled:opacity-50 ${
                grabando ? "bg-red-600 hover:bg-red-700" : "bg-[#54A6D8] hover:bg-[#4394c4]"
              }`}
            >
              {grabando ? (
                <Square className="h-4 w-4" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
              {grabando ? "Detener" : conteo !== null ? "Cancelar" : "Grabar"}
            </button>
            <button
              type="button"
              onClick={() => setScrolling((s) => !s)}
              className={botonCtrl}
              title="Espacio"
            >
              {scrolling ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {scrolling ? "Pausar" : "Reanudar"}
            </button>
            <button
              type="button"
              onClick={reiniciarPosicion}
              className={botonCtrl}
              title="Volver al inicio del guion"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1 text-xs" title="Flechas ↑↓">
              <button
                type="button"
                aria-label="Bajar velocidad"
                onClick={() =>
                  setVelocidad((v) => Math.max(VELOCIDAD_MIN, v - 10))
                }
                className={botonCtrl}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-16 text-center">{velocidad} px/s</span>
              <button
                type="button"
                aria-label="Subir velocidad"
                onClick={() =>
                  setVelocidad((v) => Math.min(VELOCIDAD_MAX, v + 10))
                }
                className={botonCtrl}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <Type className="h-4 w-4" />
              <button
                type="button"
                aria-label="Reducir tamaño"
                onClick={() => setTamano((t) => Math.max(TAMANO_MIN, t - 4))}
                className={botonCtrl}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center">{tamano}px</span>
              <button
                type="button"
                aria-label="Aumentar tamaño"
                onClick={() => setTamano((t) => Math.min(TAMANO_MAX, t + 4))}
                className={botonCtrl}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={salir}
              disabled={grabando}
              className={`${botonCtrl} disabled:opacity-50`}
            >
              <X className="h-4 w-4" />
              Salir
            </button>
          </div>
        </>
      )}
    </div>
  );
}

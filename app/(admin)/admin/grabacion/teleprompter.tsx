"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Circle,
  Download,
  Frame,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Share2,
  Square,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { useInmersivo } from "../../inmersivo";

const STORAGE_KEY = "grabacion-teleprompter";
const TAMANO_MIN = 20;
const TAMANO_MAX = 120;
const MULT_MIN = 0.7;
const MULT_MAX = 1.6;
const RESALTE = ["bg-[#54A6D8]/40"]; // clases de la línea que se está leyendo
const GANANCIA_MIN = 1;
const GANANCIA_MAX = 6;
const GANANCIA_DEFECTO = 2;
// Versión de la cadena de audio guardada con las preferencias: una ganancia
// guardada para la cadena anterior (más débil) no se reutiliza.
const VERSION_AUDIO = 2;
const MAKEUP_DB = 11;
const MAX_TOMA_S = 180;
const TIMEOUT_AUDIO_MS = 2000;
// Si el recorder no emite onstop tras detenerse, se arma la toma igual.
const TIMEOUT_ONSTOP_MS = 5000;
const MENSAJE_AUDIO =
  "El navegador no activó el audio, así que no se grabó. Toca Reintentar y vuelve a tocar Grabar.";
const MENSAJE_TIMEOUT_CAMARA =
  "La cámara no respondió en 10 segundos. Revisa el permiso del sitio, cierra otras apps que usen la cámara y reintenta.";
const ASPECTO_DEFECTO = 16 / 9; // hasta que el video informa su tamaño real
const MAX_TOMAS = 5;
const LIMITE_DURACION_S = 18;
// Umbral de "ya hay voz" (dBFS, después de ganancia y limitador): se adapta al
// ruido medido antes de cada toma; este es el valor si no hay medición.
const UMBRAL_VOZ_DB = -30;
const UMBRAL_MIN_DB = -40;
const UMBRAL_MAX_DB = -22;
const MARGEN_RUIDO_DB = 6;
const PERCENTIL_RUIDO = 0.2;
const INTERVALO_NIVEL_MS = 20;
// Sin cuenta regresiva, el ruido se mide al comienzo de la toma.
const MEDICION_RUIDO_MS = 500;
// Con menos ventanas que estas no se considera una medición.
const MIN_VENTANAS_RUIDO = 10;
// Por debajo es silencio digital (el audio aún no llega), no ruido ambiente.
const SIN_SENAL_DB = -100;
// Corte automático al terminar el guion: silencio continuo necesario y tope
// de espera, ambos contados desde que el scroll llega al final.
const SILENCIO_CORTE_MS = 600;
const TOPE_CORTE_MS = 4000;
// Salida vertical: si la cámara no entrega ≈9:16 (p. ej. una webcam de PC),
// se graba desde un canvas 1080×1920 al que se dibuja el video recortado al
// centro, con un desplazamiento horizontal ajustable (sin zoom).
const ASPECTO_VERTICAL = 9 / 16;
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const CANVAS_FPS = 30;
// En un dispositivo vertical, un video vertical se acepta solo con al menos
// este alto (descarta p. ej. los 480×640 que Safari da con 1080×1920 ideal).
const ALTO_MIN_VERTICAL = 1280;
const MENSAJE_FALLO_VERTICAL =
  "No se pudo grabar en vertical; se graba con el formato de la cámara.";
const TIMEOUT_PERMISO_MS = 10000;
const MENSAJE_TIMEOUT_PERMISO =
  "El navegador no respondió a la solicitud. Revisa el permiso del sitio en la configuración del navegador o ábrelo en Chrome o Safari.";

// Procesamiento en el servidor (app/api/grabacion/procesar). El tamaño
// máximo debe coincidir con el de la ruta.
const URL_PROCESAR = "/api/grabacion/procesar";
const MAX_BYTES_PROCESAR = 300 * 1024 * 1024;
const TIMEOUT_PROCESAR_MS = 12 * 60 * 1000; // subida + proceso + descarga

// Versión para TikTok de una toma.
type Proceso =
  | { estado: "subiendo"; porcentaje: number }
  | { estado: "procesando" }
  | { estado: "listo"; blob: Blob; url: string; nombre: string }
  | { estado: "error"; mensaje: string };

function mensajeErrorProceso(status: number): string {
  switch (status) {
    case 401:
      return "Tu sesión expiró. Inicia sesión en otra pestaña y reintenta.";
    case 403:
      return "Tu usuario no tiene permiso para procesar videos.";
    case 413:
      return "El servidor rechazó el video por tamaño (máximo 300 MB).";
    case 415:
      return "El servidor no admite el formato de esta toma.";
    case 429:
      return "Ya se está procesando otro video. Espera un momento y reintenta.";
    case 504:
      return "El procesamiento tardó demasiado y se canceló. Reintenta.";
    case 0:
      return "Falló la conexión. Revisa la red y reintenta.";
    default:
      return `El servidor no pudo procesar el video (error ${status}).`;
  }
}

type Dispositivo = { id: string; label: string };
type Fase = "preparar" | "grabar";
type Modo = "completa" | "gancho";
type Archivo = { url: string; ext: string; blob: Blob; mimeType: string };
type Grabador = {
  recorder: MediaRecorder;
  // Tipo pedido al construirlo (puede diferir de recorder.mimeType).
  pedido: string;
  detener: () => void;
  fin: Promise<Archivo>;
};
type Orientacion = "vertical" | "horizontal";
// De dónde sale el video de la toma: canvas 9:16, cámara directa, o cámara
// directa porque el canvas falló.
type Origen = "canvas" | "directo" | "directo-fallo";
type Toma = Archivo & {
  id: number;
  modo: Modo;
  segundos: number;
  muertoMs: number | null;
  muertoFinalMs: number | null;
  orientacion: Orientacion;
  origen: Origen;
  camara: string; // resolución cruda de la cámara al grabar ("" si no se leyó)
  creada: Date;
  ruidoDb: number | null; // null = sin medición
  umbralDb: number;
};
// Piso de ruido medido y umbral de voz que sale de él.
type Calibracion = { ruidoDb: number | null; umbralDb: number };
// Nivel de una ventana del analizador y cuándo se leyó (performance.now()).
type Ventana = { t: number; db: number };
type Sesion = {
  principal: Grabador;
  inicio: number;
  muertoMs: number | null;
  ultimaVoz: number | null; // performance.now() de la última voz detectada
  // null mientras se mide el ruido dentro de la toma (sin cuenta regresiva).
  calibracion: Calibracion | null;
  pendientes: Ventana[]; // ventanas a evaluar cuando haya umbral
  modo: Modo;
  orientacion: Orientacion;
  origen: Origen;
  camara: string;
};

// `fallidos`: tipos que isTypeSupported aceptó pero cuyo recorder falló.
function elegirMimeType(fallidos: ReadonlySet<string>): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidatos = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  return (
    candidatos.find(
      (t) => !fallidos.has(t) && MediaRecorder.isTypeSupported(t)
    ) ?? ""
  );
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

type CadenaAudio = {
  ctx: AudioContext;
  gain: GainNode;
  analyser: AnalyserNode;
  destino: MediaStreamAudioDestinationNode;
};

// micrófono → pasa-altos 80 Hz → ganancia (mono) → compresor → makeup →
// limitador → misma señal a los canales izquierdo y derecho del destino.
// El analizador cuelga después del limitador: mide lo mismo que se graba.
function crearCadenaAudio(pista: MediaStream, ganancia: number): CadenaAudio {
  const ctx = new AudioContext();

  // En los filtros pasa-altos de Web Audio, Q se expresa en dB: −3 da la
  // respuesta plana (sin realce junto al corte).
  const pasaAltos = ctx.createBiquadFilter();
  pasaAltos.type = "highpass";
  pasaAltos.frequency.value = 80;
  pasaAltos.Q.value = -3;

  const gain = ctx.createGain();
  gain.channelCount = 1;
  gain.channelCountMode = "explicit";
  gain.channelInterpretation = "speakers";
  gain.gain.value = ganancia;

  // Ojo: DynamicsCompressorNode aplica además su propia compensación de
  // nivel, que depende de threshold, knee y ratio.
  const compresor = ctx.createDynamicsCompressor();
  compresor.threshold.value = -24;
  compresor.knee.value = 6;
  compresor.ratio.value = 4;
  compresor.attack.value = 0.005;
  compresor.release.value = 0.2;

  const makeup = ctx.createGain();
  makeup.gain.value = 10 ** (MAKEUP_DB / 20);

  const limitador = ctx.createDynamicsCompressor();
  limitador.threshold.value = -2;
  limitador.knee.value = 0;
  limitador.ratio.value = 20;
  limitador.attack.value = 0.001;
  limitador.release.value = 0.1;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const union = ctx.createChannelMerger(2);
  const destino = ctx.createMediaStreamDestination();
  destino.channelCount = 2;

  ctx.createMediaStreamSource(pista).connect(pasaAltos);
  pasaAltos.connect(gain);
  gain.connect(compresor);
  compresor.connect(makeup);
  makeup.connect(limitador);
  limitador.connect(analyser);
  limitador.connect(union, 0, 0);
  limitador.connect(union, 0, 1);
  union.connect(destino);
  void ctx.resume().catch(() => {});
  return { ctx, gain, analyser, destino };
}

// Reanuda el AudioContext (hay que llamarla dentro de un gesto del usuario).
// Devuelve false si no queda en "running"; resume() puede no resolver nunca
// en iOS, de ahí el tope.
async function reanudarAudio(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === "running") return true;
  await Promise.race([
    ctx.resume().catch(() => {}),
    new Promise((r) => setTimeout(r, TIMEOUT_AUDIO_MS)),
  ]);
  return (ctx.state as string) === "running";
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
    default: {
      // Incluye TypeError (p. ej. mediaDevices undefined) y cualquier otro:
      // se muestra el detalle para poder diagnosticarlo.
      const detalle =
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : "error desconocido";
      return err instanceof TypeError
        ? `Este navegador no permite acceder a la cámara (requiere HTTPS). Detalle: ${detalle}`
        : `No se pudo acceder a la cámara y al micrófono. Detalle: ${detalle}`;
    }
  }
}

function nombreArchivo(d: Date, ext: string, sufijo?: string): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `grabacion-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${sufijo ? `-${sufijo}` : ""}.${ext}`;
}

// Video de la fuente (cámara directa o canvas) + audio ya amplificado y
// limitado por la cadena de audio.
function streamParaGrabar(
  fuenteVideo: MediaStream | null,
  cadena: CadenaAudio | null
): MediaStream | null {
  if (!fuenteVideo || !cadena) return null;
  return new MediaStream([
    ...fuenteVideo.getVideoTracks(),
    ...cadena.destino.stream.getAudioTracks(),
  ]);
}

// Pantalla táctil como entrada principal (teléfono / tablet).
function esDispositivoTactil(): boolean {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

// "vertical" solo para un dispositivo táctil con la pantalla en vertical. Una
// PC cuenta siempre como "horizontal" (aunque la ventana sea angosta): su
// webcam es horizontal y ahí es donde el canvas 9:16 hace falta.
function orientacionActual(): Orientacion {
  const vertical = window.matchMedia("(orientation: portrait)").matches;
  return vertical && esDispositivoTactil() ? "vertical" : "horizontal";
}

// Tamaño del video con la orientación del dispositivo en el momento de medirlo
// (se congela: girar el teléfono a mitad de una toma no cambia de fuente).
type Dimension = { w: number; h: number; orientacion: Orientacion };
// Lo que dice el track (getSettings) y lo que mide un <video> con ese stream.
// En Safari ambos pueden ir desfasados (p. ej. track 1080×1920 y video
// 1920×1080); las decisiones se toman con el video, getSettings solo informa.
type LecturaCamara = Dimension & {
  fps: number | null;
  video: { w: number; h: number } | null;
  // Lo que entregó cada intento de abrirCamaraVertical (✓ = el elegido).
  intentos: string[];
};

// Dimensión "real" de una lectura: la del video si se pudo medir.
function dimensionReal(l: LecturaCamara | null): Dimension | null {
  if (!l) return null;
  return { w: l.video?.w ?? l.w, h: l.video?.h ?? l.h, orientacion: l.orientacion };
}

// Decide si se usa el canvas 9:16 y explica por qué (para mostrarlo en
// pantalla). Se decide con el tamaño real del VIDEO:
// - PC (dispositivo horizontal): canvas si la cámara no entrega ≈9:16.
// - Dispositivo vertical: video vertical (alto > ancho) que no es ≈9:16
//   (p. ej. 3:4) → canvas con recorte central; video ≈9:16 → directo; video
//   horizontal (o cuadrado) → directo, nunca recortado (se avisa aparte).
function razonCanvas(
  dim: Dimension | null,
  fallo: boolean
): { activo: boolean; texto: string } {
  if (!dim) return { activo: false, texto: "sin medir" };
  if (fallo) return { activo: false, texto: "no (falló; se graba directo)" };
  const ratio = dim.w / dim.h;
  if (Math.abs(ratio - ASPECTO_VERTICAL) <= 0.02)
    return { activo: false, texto: "no (la cámara ya es ≈9:16; directo)" };
  if (dim.orientacion === "vertical") {
    if (dim.w >= dim.h)
      return {
        activo: false,
        texto: "no (dispositivo vertical con video horizontal; se graba directo)",
      };
    const camara = Math.abs(ratio - 3 / 4) <= 0.02 ? "3:4" : `${dim.w}×${dim.h}`;
    return { activo: true, texto: `ACTIVO (cámara ${camara} → recorte 9:16)` };
  }
  return { activo: true, texto: "ACTIVO (recorte central 9:16)" };
}

// Línea de diagnóstico de una lectura: getSettings() y el video medido.
function describirLectura(l: LecturaCamara | null): string {
  if (!l) return "sin lectura";
  return `getSettings ${l.w}×${l.h}${l.fps ? ` · ${Math.round(l.fps)} fps` : ""}${l.video ? ` · video ${l.video.w}×${l.video.h}` : ""} · dispositivo ${l.orientacion}${l.intentos.length > 1 ? ` · intentos: ${l.intentos.join(", ")}` : ""}`;
}

// Lee un stream de cámara ya abierto (getSettings del track + video medido).
function leerCamara(
  stream: MediaStream,
  video: { w: number; h: number } | null,
  intentos: string[]
): LecturaCamara {
  const s = stream.getVideoTracks()[0]?.getSettings();
  return {
    w: s?.width ?? 0,
    h: s?.height ?? 0,
    fps: s?.frameRate ?? null,
    orientacion: orientacionActual(),
    video,
    intentos,
  };
}

// Lectura "en vivo" para el chip de diagnóstico (track + video + dispositivo).
type LecturaVivo = { track: string; video: string; orientacion: Orientacion };

// Avisa cuando cambia la orientación del dispositivo (matchMedia y el evento
// orientationchange, que en iOS llega por separado). Devuelve cómo dejar de
// escuchar.
function suscribirOrientacion(cb: () => void): () => void {
  const mq = window.matchMedia("(orientation: portrait)");
  if (mq.addEventListener) mq.addEventListener("change", cb);
  else mq.addListener(cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    if (mq.removeEventListener) mq.removeEventListener("change", cb);
    else mq.removeListener(cb);
    window.removeEventListener("orientationchange", cb);
  };
}

// Tamaño real que muestra un <video> con este stream (no getSettings, que en
// Safari puede estar desfasado). Usa un <video> auxiliar invisible y espera
// hasta ~1,5 s a que tenga dimensiones; null si no las obtiene.
async function medirVideo(
  stream: MediaStream
): Promise<{ w: number; h: number } | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.style.cssText =
    "position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(video);
  try {
    video.srcObject = stream;
    await video.play().catch(() => {});
    const inicio = performance.now();
    while (performance.now() - inicio < 1500) {
      if (video.videoWidth > 0 && video.videoHeight > 0)
        return { w: video.videoWidth, h: video.videoHeight };
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  } finally {
    video.srcObject = null;
    video.remove();
  }
}

// Dibuja en el lienzo 9:16 la región central del video (cover, sin zoom: la
// escala es la misma en ambos ejes, no deforma). `pan` (−1…1) desplaza la
// ventana de recorte en horizontal: el preview del canvas va espejado por CSS,
// así que + mueve el encuadre hacia la derecha de lo que se ve en pantalla.
function dibujarRecorte(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  pan: number
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return;
  const objetivo = CANVAS_W / CANVAS_H;
  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;
  if (vw / vh > objetivo) {
    // Más ancho que 9:16: se recorta a lo ancho y el desplazamiento mueve la
    // ventana (invertido por el espejo del preview).
    sw = vh * objetivo;
    const holgura = vw - sw;
    sx = holgura / 2 - (pan * holgura) / 2;
  } else {
    // Más angosto que 9:16: se recorta a lo alto, centrado.
    sh = vw / objetivo;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CANVAS_W, CANVAS_H);
}

// Pide la cámara y devuelve el stream con el tamaño real del video (medido en
// un <video>); si no se puede medir, cae a getSettings(). Si la adquisición se
// canceló mientras tanto, no mide: quien llama suelta el stream.
async function abrirCamara(
  video: MediaTrackConstraints,
  audio: MediaTrackConstraints | false,
  cancelado: () => boolean
) {
  const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
  const medido = cancelado() ? null : await medirVideo(stream);
  const s = stream.getVideoTracks()[0]?.getSettings();
  return {
    stream,
    video: medido,
    ancho: medido?.w ?? s?.width ?? 0,
    alto: medido?.h ?? s?.height ?? 0,
  };
}

// Abre la cámara. Tamaño siempre "ideal" (nunca "exact"); sin aspectRatio.
// - PC (dispositivo horizontal): un único intento 1920×1080, sin validar.
// - Dispositivo vertical: prueba 1920×1080 → 1080×1920 → 720×1280 → 1280×720
//   → facingMode user y acepta el primero cuyo VIDEO (medido en un <video>,
//   no getSettings) llegue vertical (alto > ancho) con alto ≥ ALTO_MIN_VERTICAL;
//   el orden sale de lo medido en iPhone/Safari: el 1920×1080 ideal es el que
//   llega vertical (1080×1920) ya en el primer intento, mientras que con
//   1080×1920 y 720×1280 ideales llega horizontal (o chico), así que va
//   primero para no abrir la cámara de más;
//   si no cumple, suelta la cámara (en móvil no se puede abrir dos veces) y
//   prueba el siguiente. Si ninguno cumple, reabre el de mayor área entre los
//   que llegaron verticales; si ninguno llegó vertical, el 1er intento
//   (directo, con el aviso ámbar).
// Devuelve el stream, el tamaño medido del video y lo que entregó cada
// intento (para el chip), o null si se canceló a medias.
async function abrirCamaraVertical(
  camaraId: string,
  audio: MediaTrackConstraints | false,
  cancelado: () => boolean
): Promise<{
  stream: MediaStream;
  video: { w: number; h: number } | null;
  intentos: string[];
} | null> {
  const base = { deviceId: camaraId ? { exact: camaraId } : undefined };
  const vertical = orientacionActual() === "vertical";
  const intentos: MediaTrackConstraints[] = vertical
    ? [
        { ...base, width: { ideal: 1920 }, height: { ideal: 1080 } },
        { ...base, width: { ideal: 1080 }, height: { ideal: 1920 } },
        { ...base, width: { ideal: 720 }, height: { ideal: 1280 } },
        { ...base, width: { ideal: 1280 }, height: { ideal: 720 } },
        { ...base, facingMode: { ideal: "user" } },
      ]
    : [{ ...base, width: { ideal: 1920 }, height: { ideal: 1080 } }];
  const soltar = (s: MediaStream) => s.getTracks().forEach((t) => t.stop());
  const etiquetar = (r: { w: number; h: number }[], elegido: number) =>
    r.map((x, i) => `${x.w ? `${x.w}×${x.h}` : "error"}${i === elegido ? "✓" : ""}`);

  // Lo que entregó cada intento (0×0 = falló al abrir).
  const resultados: { w: number; h: number }[] = [];
  let abierto: Awaited<ReturnType<typeof abrirCamara>> | null = null;
  let indiceAbierto = -1;
  for (let i = 0; i < intentos.length; i++) {
    if (cancelado()) return null;
    let r: Awaited<ReturnType<typeof abrirCamara>>;
    try {
      r = await abrirCamara(intentos[i], audio, cancelado);
    } catch (e) {
      if (i === 0) throw e; // permiso denegado, cámara en uso, etc.
      resultados.push({ w: 0, h: 0 });
      continue;
    }
    if (cancelado()) {
      soltar(r.stream);
      return null;
    }
    resultados.push({ w: r.ancho, h: r.alto });
    // PC: se acepta lo que llegue. Vertical: solo si es vertical y alto ≥ 1280.
    if (!vertical || (r.alto > r.ancho && r.alto >= ALTO_MIN_VERTICAL)) {
      abierto = r;
      indiceAbierto = i;
      break;
    }
    soltar(r.stream);
  }

  if (!abierto) {
    // Ninguno cumplió: el vertical de mayor área, o si ninguno llegó vertical,
    // el 1er intento (se graba tal cual, sin recortar).
    let mejor = -1;
    resultados.forEach((x, i) => {
      if (x.h > x.w && (mejor < 0 || x.w * x.h > resultados[mejor].w * resultados[mejor].h))
        mejor = i;
    });
    indiceAbierto = mejor >= 0 ? mejor : 0;
    if (cancelado()) return null;
    abierto = await abrirCamara(intentos[indiceAbierto], audio, cancelado);
    if (cancelado()) {
      soltar(abierto.stream);
      return null;
    }
  }
  return {
    stream: abierto.stream,
    video: abierto.video,
    intentos: etiquetar(resultados, indiceAbierto),
  };
}

// Un MediaRecorder cuyo resultado llega como promesa de blob URL.
function crearGrabador(
  stream: MediaStream,
  mimeType: string,
  alFallar: () => void
): Grabador {
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    audioBitsPerSecond: 192000,
    videoBitsPerSecond: 8000000,
  });
  const trozos: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) trozos.push(e.data);
  };
  let cerrar = () => {};
  const fin = new Promise<Archivo>((resolve) => {
    let cerrado = false;
    cerrar = () => {
      if (cerrado) return;
      cerrado = true;
      const tipo = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(trozos, { type: tipo });
      resolve({
        url: URL.createObjectURL(blob),
        ext: tipo.includes("mp4") ? "mp4" : "webm",
        blob,
        mimeType: tipo,
      });
    };
  });
  recorder.onstop = () => cerrar();
  recorder.onerror = () => alFallar();
  recorder.start(1000);
  const detener = () => {
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } finally {
      setTimeout(cerrar, TIMEOUT_ONSTOP_MS);
    }
  };
  return { recorder, pedido: mimeType, detener, fin };
}

// Nivel RMS en dBFS de lo que hay ahora en el analizador.
function nivelDb(analyser: AnalyserNode, datos: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(datos);
  let suma = 0;
  for (const v of datos) {
    const x = (v - 128) / 128;
    suma += x * x;
  }
  return 20 * Math.log10(Math.max(Math.sqrt(suma / datos.length), 1e-6));
}

// Lee el nivel cada INTERVALO_NIVEL_MS. Devuelve cómo dejar de leer.
function muestrearNivel(
  analyser: AnalyserNode,
  alLeer: (db: number) => void
): () => void {
  const datos = new Uint8Array(analyser.fftSize);
  const id = setInterval(
    () => alLeer(nivelDb(analyser, datos)),
    INTERVALO_NIVEL_MS
  );
  return () => clearInterval(id);
}

// Piso de ruido = percentil 20 de las ventanas; umbral = ruido + 6 dB,
// acotado a [UMBRAL_MIN_DB, UMBRAL_MAX_DB].
function calibrar(niveles: number[]): Calibracion {
  const validos = niveles
    .filter((db) => db > SIN_SENAL_DB)
    .sort((a, b) => a - b);
  if (validos.length < MIN_VENTANAS_RUIDO)
    return { ruidoDb: null, umbralDb: UMBRAL_VOZ_DB };
  const ruidoDb = validos[Math.floor((validos.length - 1) * PERCENTIL_RUIDO)];
  return {
    ruidoDb,
    umbralDb: Math.min(
      UMBRAL_MAX_DB,
      Math.max(UMBRAL_MIN_DB, ruidoDb + MARGEN_RUIDO_DB)
    ),
  };
}

// Anota la voz de una ventana: tiempo muerto inicial y última voz.
function registrarVoz(s: Sesion, v: Ventana, umbralDb: number) {
  if (v.db <= umbralDb) return;
  s.ultimaVoz = v.t;
  if (s.muertoMs === null) s.muertoMs = Math.round(v.t - s.inicio);
}

// Fija el umbral con las ventanas acumuladas en la toma y las evalúa, así lo
// dicho durante la medición también cuenta. Si ya había umbral, no hace nada.
function resolverCalibracion(s: Sesion): Calibracion {
  if (s.calibracion) return s.calibracion;
  const calibracion = calibrar(s.pendientes.map((v) => v.db));
  s.calibracion = calibracion;
  s.pendientes.forEach((v) => registrarVoz(s, v, calibracion.umbralDb));
  s.pendientes = [];
  return calibracion;
}

function formatoTiempo(seg: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(seg / 60))}:${p(seg % 60)}`;
}

// Ritmo: palabras/seg con que avanza el scroll y se estima la duración de
// cada bloque.
const PRESETS = {
  normal: { nombre: "Normal", palabrasPorSeg: 2.5 },
  dinamico: { nombre: "Dinámico", palabrasPorSeg: 2.8 },
  rafaga: { nombre: "Ráfaga", palabrasPorSeg: 3.3 },
} as const;
type PresetId = keyof typeof PRESETS;

const OPCIONES_CUENTA = [0, 1, 2, 3] as const;

// Sin lookbehind (Safari/iOS < 16.4 rompe al parsearlo): el carácter previo
// se captura en el grupo 1 y se reconstruye en dividirMuletillas. Se arma con
// RegExp() y no como literal porque el target ES2017 del tsconfig no acepta
// \p{L} en un literal; si el navegador tampoco lo soporta, queda en null y
// el editor simplemente no resalta.
const MULETILLAS: RegExp | null = (() => {
  try {
    return new RegExp(
      "(^|[^\\p{L}\\p{N}])(yo creo que|o sea|pero|eh+)(?![\\p{L}\\p{N}])",
      "giu"
    );
  } catch {
    return null;
  }
})();

function dividirMuletillas(texto: string): { texto: string; muletilla: boolean }[] {
  if (!texto) return [];
  if (!MULETILLAS) return [{ texto, muletilla: false }];
  const partes: { texto: string; muletilla: boolean }[] = [];
  let fin = 0;
  MULETILLAS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MULETILLAS.exec(texto)) !== null) {
    // m[1] es el separador previo: queda como texto normal.
    const inicio = m.index + m[1].length;
    if (inicio > fin)
      partes.push({ texto: texto.slice(fin, inicio), muletilla: false });
    partes.push({ texto: m[2], muletilla: true });
    fin = inicio + m[2].length;
  }
  if (fin < texto.length)
    partes.push({ texto: texto.slice(fin), muletilla: false });
  return partes;
}

function contarPalabras(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}

// Bloques = párrafos separados por línea(s) en blanco.
function dividirBloques(guion: string): string[] {
  return guion
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

// Suma/resta al multiplicador de ritmo, en pasos de 0.1 dentro del rango.
function ajustarMult(v: number, delta: number): number {
  return Math.min(MULT_MAX, Math.max(MULT_MIN, Math.round((v + delta) * 10) / 10));
}

// Índice de la línea del guion que está en la línea de lectura para una
// posición de scroll dada (la última cuyo inicio ya se alcanzó).
function indiceLinea(lineas: { start: number }[], pos: number): number {
  let idx = 0;
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].start <= pos + 0.5) idx = i;
    else break;
  }
  return idx;
}

function etiquetaBloque(i: number, total: number): string {
  if (i === 0) return "Gancho";
  if (i === total - 1) return "Cierre";
  return total > 3 ? `Desarrollo ${i}` : "Desarrollo";
}

export function Teleprompter() {
  const [fase, setFase] = useState<Fase>("preparar");
  const [guion, setGuion] = useState("");
  const [tamano, setTamano] = useState(48);
  const [mult, setMult] = useState(1);
  const [espejo, setEspejo] = useState(false);
  const [cuentaSeg, setCuentaSeg] = useState<number>(1);
  const [guias, setGuias] = useState(true);
  const [cortarAlFinal, setCortarAlFinal] = useState(true);
  // Momento (performance.now) en que el scroll llegó al final; null = sin vigilar.
  const [finScroll, setFinScroll] = useState<number | null>(null);
  const [preset, setPreset] = useState<PresetId>("dinamico");
  const [procesarAudio, setProcesarAudio] = useState(false);
  const [ganancia, setGanancia] = useState(GANANCIA_DEFECTO);
  // Aviso no bloqueante (p. ej. por qué se cortó una toma).
  const [aviso, setAviso] = useState<string | null>(null);
  // Equipos que ahora mismo no entregan señal (track muted); solo informa.
  const [sinSenal, setSinSenal] = useState({ video: false, audio: false });
  // Entre detener el recorder y tener el archivo.
  const [finalizando, setFinalizando] = useState(false);
  // true cuando ya se leyó localStorage; antes no se escribe.
  const [cargado, setCargado] = useState(false);

  const [camaras, setCamaras] = useState<Dispositivo[]>([]);
  const [microfonos, setMicrofonos] = useState<Dispositivo[]>([]);
  const [camaraId, setCamaraId] = useState("");
  const [microfonoId, setMicrofonoId] = useState("");
  const [errorPrep, setErrorPrep] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  // Diagnóstico para el celular; se lee en el cliente (evita desajuste de
  // hidratación, porque en el servidor no existe window).
  const [diagnostico, setDiagnostico] = useState<{
    seguro: boolean;
    mediaDevices: boolean;
  } | null>(null);

  const [errorGrabar, setErrorGrabar] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [conteo, setConteo] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [intento, setIntento] = useState(0);
  const [aspecto, setAspecto] = useState(ASPECTO_DEFECTO);
  // Tamaño del video de la cámara en esta adquisición (null = aún no se mide),
  // con la orientación del dispositivo al medirlo.
  const [camaraDim, setCamaraDim] = useState<Dimension | null>(null);
  // Última lectura al abrir la cámara (getSettings + video medido; también la
  // de "preparar").
  const [lectura, setLectura] = useState<LecturaCamara | null>(null);
  // Lectura en vivo (cada 500 ms y en resize/orientationchange) para el chip.
  const [vivo, setVivo] = useState<LecturaVivo | null>(null);
  // El chip de diagnóstico de "grabar" solo se muestra con ?diag=1 en la URL.
  // Es seguro leerlo al inicializar: el chip solo existe en "grabar", que
  // nunca forma parte del HTML del servidor.
  const [diag] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("diag") === "1"
  );
  const [medirTick, setMedirTick] = useState(0);
  // Desplazamiento horizontal del recorte del canvas (−1…1, 0 = centro).
  const [desplazamiento, setDesplazamiento] = useState(0);
  // El canvas 9:16 (preview y fuente de la grabación) se usa solo si la cámara
  // no entrega ≈9:16 y no ha fallado; si ya llega 9:16 se graba el stream
  // directo. Mientras no se conoce el tamaño del video no hay canvas.
  const [canvasFallo, setCanvasFallo] = useState(false);
  const [avisoVertical, setAvisoVertical] = useState<string | null>(null);
  const razon = razonCanvas(camaraDim, canvasFallo);
  const canvasActivo = razon.activo;
  // Teléfono en vertical que aun así recibe un track horizontal: se graba tal
  // cual (sin recortar) y se avisa con la resolución real recibida.
  const horizontalEnVertical =
    camaraDim !== null &&
    camaraDim.orientacion === "vertical" &&
    camaraDim.w > camaraDim.h;
  // Resolución real de cada toma (id → "ancho×alto"), leída del video.
  const [resoluciones, setResoluciones] = useState<Record<number, string>>({});
  const [modo, setModo] = useState<Modo>("completa");
  const [bloqueActivo, setBloqueActivo] = useState(0);
  const [tomas, setTomas] = useState<Toma[]>([]);
  const [tomaId, setTomaId] = useState<number | null>(null);
  // Versión procesada de cada toma (id → estado).
  const [procesos, setProcesos] = useState<Record<number, Proceso>>({});
  const [enResultado, setEnResultado] = useState(false);

  // Número de la adquisición de cámara vigente: cambiarlo invalida la que
  // esté en curso.
  const adquisicionRef = useRef(0);
  // Aperturas de "preparar" (medidor y medición) que aún no sueltan su stream.
  const previasRef = useRef(new Set<Promise<unknown>>());
  const detenerMedidorRef = useRef<(() => void) | null>(null);
  const finalizandoRef = useRef(false);
  const reanudandoRef = useRef(false);
  const montadoRef = useRef(true);
  const mimeFallidosRef = useRef(new Set<string>());
  const guionRef = useRef<HTMLTextAreaElement>(null);
  const resaltadoRef = useRef<HTMLDivElement>(null);
  const sesionRef = useRef<Sesion | null>(null);
  const tomasRef = useRef<Toma[]>([]);
  const siguienteTomaRef = useRef(1);
  const activoRef = useRef(0);
  const medidorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const rafCanvasRef = useRef(0);
  // Si el canvas falló, no se vuelve a activar en esta adquisición.
  const canvasFalloRef = useRef(false);
  // Orientación del dispositivo con la que se abrió la cámara por última vez.
  const orientacionAbiertaRef = useRef<Orientacion>("horizontal");
  // Espejo de canvasActivo para los callbacks (el canvas se espera aunque su
  // stream aún no exista).
  const canvasEsperadoRef = useRef(false);
  // Lo lee el bucle de dibujo: el encuadre se ve en vivo sin reiniciarlo.
  const panRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const cadenaRef = useRef<CadenaAudio | null>(null);
  const gananciaRef = useRef(ganancia);
  const scrollRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const ritmoRef = useRef({ palabrasPorSeg: 2.8, mult: 1 });
  // start/len: tramo de scroll de la línea; n: sus palabras; resalte: su span.
  const lineasRef = useRef<
    { start: number; len: number; n: number; bloque: number; resalte: HTMLElement }[]
  >([]);
  const lineaActivaRef = useRef(-1);
  const conteoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Detiene la medición de ruido de la cuenta regresiva.
  const detenerMuestreoRef = useRef<(() => void) | null>(null);
  // Por id de toma: subida en curso y blob URL de la versión procesada.
  const subidasRef = useRef(new Map<number, XMLHttpRequest>());
  const urlsProcesadasRef = useRef(new Map<number, string>());

  const bloques = useMemo(() => dividirBloques(guion), [guion]);
  // En "Regrabar gancho" solo se muestra y graba el primer bloque.
  const bloquesGrab = useMemo(
    () => (modo === "gancho" ? bloques.slice(0, 1) : bloques),
    [bloques, modo]
  );
  const palabrasPorSeg = PRESETS[preset].palabrasPorSeg;
  const duraciones = bloques.map((b) => contarPalabras(b) / palabrasPorSeg);
  const duracionTotal = duraciones.reduce((a, b) => a + b, 0);

  // Líneas del guion visible (cada \n es una línea; las líneas en blanco
  // separan bloques y en pantalla solo dejan un pequeño espacio).
  const lineasGuion = useMemo(
    () =>
      bloquesGrab.flatMap((b, bi) =>
        b
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((texto, li) => ({
            texto,
            b: bi,
            n: contarPalabras(texto),
            inicio: li === 0,
          }))
      ),
    [bloquesGrab]
  );
  // Memorizado: los cambios de bloque/REC no deben re-renderizar el guion.
  // El span en línea con box-decoration-clone hace que, si una línea se parte
  // por el ancho, el resaltado cubra todos sus fragmentos.
  const textoGuion = useMemo(
    () => (
      <div
        className="text-center font-semibold leading-snug"
        style={{
          fontSize: `${tamano}px`,
          transform: espejo ? "scaleX(-1)" : undefined,
        }}
      >
        {lineasGuion.map((l, i) => (
          <p
            key={i}
            data-l
            data-b={l.b}
            data-n={l.n}
            className={l.inicio && i > 0 ? "mt-[0.6em]" : undefined}
          >
            <span className="box-decoration-clone rounded-sm px-1">
              {l.texto}
            </span>
          </p>
        ))}
      </div>
    ),
    [lineasGuion, tamano, espejo]
  );

  useEffect(() => {
    ritmoRef.current = { palabrasPorSeg, mult };
  }, [palabrasPorSeg, mult]);

  useEffect(() => {
    panRef.current = desplazamiento;
  }, [desplazamiento]);

  useEffect(() => {
    canvasEsperadoRef.current = canvasActivo;
  }, [canvasActivo]);

  // La fase "grabar" ocupa todo el panel: oculta Sidebar, Header y BottomNav.
  const { setActivo: setInmersivo } = useInmersivo();
  useEffect(() => {
    setInmersivo(fase === "grabar");
    return () => setInmersivo(false);
  }, [fase, setInmersivo]);

  useEffect(() => {
    tomasRef.current = tomas;
  }, [tomas]);

  // Ganancia en vivo: actualiza la cadena activa (medidor o grabación).
  useEffect(() => {
    gananciaRef.current = ganancia;
    if (cadenaRef.current) cadenaRef.current.gain.gain.value = ganancia;
  }, [ganancia]);

  // Persistencia: guion y preferencias (nada de la grabación en curso).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as {
          guion?: string;
          tamano?: number;
          multiplicador?: number;
          ganancia?: number;
          cuentaSeg?: number;
          guias?: boolean;
          cortarAlFinal?: boolean;
          desplazamiento?: number;
          preset?: string;
          versionAudio?: number;
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (typeof d.guion === "string") setGuion(d.guion);
        if (typeof d.tamano === "number") setTamano(d.tamano);
        if (typeof d.multiplicador === "number")
          setMult(Math.min(MULT_MAX, Math.max(MULT_MIN, d.multiplicador)));
        if (
          typeof d.cuentaSeg === "number" &&
          (OPCIONES_CUENTA as readonly number[]).includes(d.cuentaSeg)
        )
          setCuentaSeg(d.cuentaSeg);
        if (typeof d.guias === "boolean") setGuias(d.guias);
        if (typeof d.cortarAlFinal === "boolean")
          setCortarAlFinal(d.cortarAlFinal);
        if (typeof d.desplazamiento === "number")
          setDesplazamiento(Math.min(1, Math.max(-1, d.desplazamiento)));
        if (d.preset && d.preset in PRESETS) setPreset(d.preset as PresetId);
        if (d.versionAudio === VERSION_AUDIO && typeof d.ganancia === "number")
          setGanancia(
            Math.min(GANANCIA_MAX, Math.max(GANANCIA_MIN, d.ganancia))
          );
      }
    } catch {
      // localStorage no disponible o JSON inválido: se ignora.
    }
    setCargado(true);
  }, []);

  // Con estado (y no un ref) este efecto recién corre en un render que ya
  // tiene los valores leídos, también con el doble montaje de Strict Mode.
  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          guion,
          tamano,
          multiplicador: mult,
          ganancia,
          cuentaSeg,
          guias,
          cortarAlFinal,
          desplazamiento,
          preset,
          versionAudio: VERSION_AUDIO,
        })
      );
    } catch {
      // Sin persistencia: no es crítico.
    }
  }, [
    cargado,
    guion,
    tamano,
    mult,
    ganancia,
    cuentaSeg,
    guias,
    cortarAlFinal,
    desplazamiento,
    preset,
  ]);

  // Libera todo: bucle de dibujo y tracks del canvas, tracks de cámara/
  // micrófono y el AudioContext.
  const detenerStream = useCallback(() => {
    cancelAnimationFrame(rafCanvasRef.current);
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
    canvasStreamRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const cadena = cadenaRef.current;
    cadenaRef.current = null;
    if (cadena) {
      cadena.ctx.onstatechange = null;
      cadena.destino.stream.getTracks().forEach((t) => t.stop());
      void cadena.ctx.close();
    }
  }, []);

  const invalidarAdquisicion = useCallback(() => {
    adquisicionRef.current++;
  }, []);

  const cancelarConteo = useCallback(() => {
    if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
    conteoTimerRef.current = null;
    detenerMuestreoRef.current?.();
    detenerMuestreoRef.current = null;
    setConteo(null);
  }, []);

  // Cierra el recorder y arma la toma cuando el blob está listo. Sirve para
  // el corte manual, el automático y las interrupciones; el tiempo muerto
  // final es el que hay entre la última voz y este momento.
  const terminarGrabacion = useCallback(() => {
    const s = sesionRef.current;
    if (!s) return;
    sesionRef.current = null;
    finalizandoRef.current = true;
    setFinalizando(true);
    setGrabando(false);
    setScrolling(false);
    setFinScroll(null);
    const adquisicion = adquisicionRef.current;
    const ahora = performance.now();
    const duracion = Math.round((ahora - s.inicio) / 1000);
    // Una toma cortada antes de terminar la medición se evalúa igual.
    const { ruidoDb, umbralDb } = resolverCalibracion(s);
    const muertoFinalMs =
      s.ultimaVoz !== null ? Math.round(ahora - s.ultimaVoz) : null;
    s.principal.detener();
    void s.principal.fin.then((archivo) => {
      finalizandoRef.current = false;
      if (!montadoRef.current) {
        URL.revokeObjectURL(archivo.url);
        return;
      }
      setFinalizando(false);
      // Solo se suelta la cámara si no empezó otra adquisición ni otra toma.
      const sigueVigente =
        adquisicionRef.current === adquisicion && sesionRef.current === null;
      if (archivo.blob.size === 0) {
        URL.revokeObjectURL(archivo.url);
        if (sigueVigente) {
          detenerStream();
          setListo(false);
          setErrorGrabar("La toma quedó vacía: no se grabó nada.");
        }
        return;
      }
      const id = siguienteTomaRef.current++;
      const toma: Toma = {
        ...archivo,
        id,
        modo: s.modo,
        segundos: duracion,
        muertoMs: s.muertoMs,
        muertoFinalMs,
        orientacion: s.orientacion,
        origen: s.origen,
        camara: s.camara,
        creada: new Date(),
        ruidoDb,
        umbralDb,
      };
      setTomas((prev) => [...prev, toma]);
      setTomaId(id);
      setEnResultado(true);
      if (sigueVigente) detenerStream();
    });
  }, [detenerStream]);

  // Algo externo impide seguir: cancela la cuenta regresiva o termina la toma
  // en curso (conservando lo grabado) y avisa. Sin toma ni cuenta, no hace nada.
  const interrumpir = useCallback(
    (motivo: string) => {
      const habiaConteo = conteoTimerRef.current !== null;
      if (habiaConteo) cancelarConteo();
      if (sesionRef.current) {
        setAviso(`La toma se detuvo: ${motivo}`);
        terminarGrabacion();
      } else if (habiaConteo) {
        setAviso(`Se canceló la cuenta regresiva: ${motivo}`);
      }
    },
    [cancelarConteo, terminarGrabacion]
  );

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDiagnostico({
      seguro: window.isSecureContext,
      mediaDevices: !!navigator.mediaDevices,
    });
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void enumerar();
  }, [enumerar]);

  // Los nombres de dispositivos solo aparecen tras conceder permiso.
  async function pedirPermiso() {
    setErrorPrep(null);
    // Sin HTTPS (o en un navegador interno de otra app) mediaDevices no existe.
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorPrep(
        "Este navegador no puede acceder a la cámara. Abre la página en Chrome o Safari con HTTPS (no desde el navegador interno de otra app)."
      );
      return;
    }
    setPidiendo(true);
    let vencido = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const solicitud = navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      const espera = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          vencido = true;
          reject(new Error("timeout"));
        }, TIMEOUT_PERMISO_MS);
      });
      // Si la solicitud responde tarde (p. ej. el usuario acepta después del
      // timeout), se sueltan los tracks y se refresca la lista de equipos.
      solicitud.then(
        (s) => {
          if (!vencido) return;
          s.getTracks().forEach((t) => t.stop());
          void enumerar();
        },
        () => {}
      );
      const s = await Promise.race([solicitud, espera]);
      s.getTracks().forEach((t) => t.stop());
      await enumerar();
    } catch (err) {
      setErrorPrep(vencido ? MENSAJE_TIMEOUT_PERMISO : mensajeErrorMedia(err));
    } finally {
      clearTimeout(timer);
      setPidiendo(false);
    }
  }

  // Medidor de nivel del micrófono en la fase Preparar. Solo arranca si ya
  // hay permiso (hay micrófonos listados); usa las mismas restricciones y la
  // misma cadena de ganancia/limitador que la grabación, así que el nivel
  // que se ve es el que se graba.
  const hayMicrofonos = microfonos.length > 0;
  useEffect(() => {
    if (fase !== "preparar" || !hayMicrofonos) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    let cancelado = false;
    let stream: MediaStream | null = null;
    let cadena: CadenaAudio | null = null;
    let raf = 0;
    const detener = () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      if (cadena) {
        if (cadenaRef.current === cadena) cadenaRef.current = null;
        cadena.destino.stream.getTracks().forEach((t) => t.stop());
        void cadena.ctx.close();
        cadena = null;
      }
    };
    detenerMedidorRef.current = detener;
    const previas = previasRef.current;

    const tarea = (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: restriccionesAudio(microfonoId, procesarAudio),
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cadena = crearCadenaAudio(stream, gananciaRef.current);
        cadenaRef.current = cadena;
        const analyser = cadena.analyser;
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
    previas.add(tarea);
    void tarea.finally(() => previas.delete(tarea));

    return () => {
      detener();
      if (detenerMedidorRef.current === detener)
        detenerMedidorRef.current = null;
    };
  }, [fase, hayMicrofonos, microfonoId, procesarAudio]);

  // Diagnóstico en "preparar": con el permiso ya concedido, abre la cámara un
  // instante con el mismo flujo de intentos que usa "grabar", lee getSettings()
  // y la suelta. Así se ve qué entrega la cámara (y si habría canvas) sin
  // empezar a grabar. "Volver a medir" repite la lectura.
  const hayCamaras = camaras.length > 0;
  const [midiendo, setMidiendo] = useState(false);
  useEffect(() => {
    if (fase !== "preparar" || !hayCamaras) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    let cancelado = false;
    let vencido = false;
    let stream: MediaStream | null = null;
    const previas = previasRef.current;
    // Sin tope, una cámara que no responde dejaría "Iniciar" bloqueado.
    const timer = setTimeout(() => {
      vencido = true;
      previas.delete(tarea);
      setMidiendo(false);
    }, TIMEOUT_PERMISO_MS);

    const tarea = (async () => {
      setMidiendo(true);
      orientacionAbiertaRef.current = orientacionActual();
      try {
        const abierta = await abrirCamaraVertical(
          camaraId,
          false,
          () => cancelado || vencido
        );
        stream = abierta?.stream ?? null;
        if (abierta && !cancelado)
          setLectura(
            leerCamara(abierta.stream, abierta.video, abierta.intentos)
          );
      } catch {
        // Sin lectura: no es crítico (el error real sale al grabar).
      } finally {
        clearTimeout(timer);
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        if (!cancelado) setMidiendo(false);
      }
    })();
    previas.add(tarea);
    void tarea.finally(() => previas.delete(tarea));

    return () => {
      cancelado = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [fase, hayCamaras, camaraId, medirTick]);

  // Adquiere el stream al entrar a la fase de grabación (o al reintentar).
  useEffect(() => {
    if (fase !== "grabar") return;
    const id = ++adquisicionRef.current;
    // Deja de estar vigente al salir, reintentar, desmontar o vencer el tope.
    const vigente = () => adquisicionRef.current === id;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorGrabar(
          "Este navegador no permite acceder a la cámara (requiere HTTPS)."
        );
        return;
      }
      timer = setTimeout(() => {
        if (!vigente()) return;
        invalidarAdquisicion();
        // Para que el reintento no espere a una apertura que no responde.
        previasRef.current.clear();
        setErrorGrabar(MENSAJE_TIMEOUT_CAMARA);
      }, TIMEOUT_PERMISO_MS);
      try {
        // El medidor y la medición de "preparar" sueltan el equipo primero.
        detenerMedidorRef.current?.();
        await Promise.allSettled([...previasRef.current]);
        if (!vigente()) return;
        orientacionAbiertaRef.current = orientacionActual();
        const abierta = await abrirCamaraVertical(
          camaraId,
          restriccionesAudio(microfonoId, procesarAudio),
          () => !vigente()
        );
        if (!abierta) return;
        const stream = abierta.stream;
        if (!vigente()) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        clearTimeout(timer);
        setLectura(leerCamara(stream, abierta.video, abierta.intentos));
        streamRef.current = stream;
        const cadena = crearCadenaAudio(
          new MediaStream(stream.getAudioTracks()),
          gananciaRef.current
        );
        cadenaRef.current = cadena;
        cadena.ctx.onstatechange = () => {
          const estado = cadena.ctx.state as string;
          if (estado === "interrupted" || estado === "suspended")
            interrumpir("el sistema interrumpió el audio.");
        };
        stream.getTracks().forEach((t) => {
          const equipo = t.kind === "video" ? "la cámara" : "el micrófono";
          const tipo = t.kind === "video" ? "video" : "audio";
          // Un mute puede ser momentáneo: se avisa sin cortar la toma.
          const marcar = (mudo: boolean) => {
            if (vigente()) setSinSenal((prev) => ({ ...prev, [tipo]: mudo }));
          };
          t.onmute = () => marcar(true);
          t.onunmute = () => marcar(false);
          marcar(t.muted);
          t.onended = () => {
            if (!vigente() || finalizandoRef.current) return;
            if (sesionRef.current) {
              interrumpir(`se desconectó ${equipo}.`);
              return;
            }
            cancelarConteo();
            setListo(false);
            setErrorGrabar(`Se desconectó ${equipo}.`);
          };
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setListo(true);
      } catch (err) {
        if (vigente()) {
          clearTimeout(timer);
          setErrorGrabar(mensajeErrorMedia(err));
        }
      }
    })();

    return () => {
      invalidarAdquisicion();
      clearTimeout(timer);
      detenerStream();
      setListo(false);
      setSinSenal({ video: false, audio: false });
      // Cada adquisición vuelve a medir el video y a intentar el canvas.
      setCamaraDim(null);
      setCanvasFallo(false);
      setAvisoVertical(null);
      canvasFalloRef.current = false;
    };
    // camaraId/microfonoId se fijan al iniciar; no deben re-adquirir el stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fase,
    intento,
    detenerStream,
    interrumpir,
    cancelarConteo,
    invalidarAdquisicion,
  ]);

  // Al ocultarse la página (otra app, bloqueo) se cierra la toma limpiamente.
  useEffect(() => {
    const alOcultar = () => {
      if (document.hidden) interrumpir("la página quedó oculta.");
    };
    document.addEventListener("visibilitychange", alOcultar);
    return () => document.removeEventListener("visibilitychange", alOcultar);
  }, [interrumpir]);

  // Tope de duración por toma.
  useEffect(() => {
    if (!grabando) return;
    const id = setTimeout(
      () =>
        interrumpir(
          `se alcanzó el máximo de ${MAX_TOMA_S / 60} minutos por toma.`
        ),
      MAX_TOMA_S * 1000
    );
    return () => clearTimeout(id);
  }, [grabando, interrumpir]);

  // Aviso del navegador antes de recargar o cerrar con material sin guardar.
  // El servidor procesa un video a la vez.
  const procesandoAlguna = Object.values(procesos).some(
    (p) => p.estado === "subiendo" || p.estado === "procesando"
  );
  const hayPendiente =
    tomas.length > 0 || grabando || finalizando || procesandoAlguna;
  useEffect(() => {
    if (!hayPendiente) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayPendiente]);

  // Lectura en vivo para el chip de diagnóstico: getSettings() del track y
  // videoWidth/videoHeight actuales cada 500 ms y en cada resize del video u
  // orientationchange, junto a la orientación actual del dispositivo. Solo
  // lee: no altera la fuente ni la toma.
  useEffect(() => {
    // Solo hace falta con el chip (?diag=1) o con el aviso de horizontal en vertical.
    if (fase !== "grabar" || !listo || enResultado) return;
    if (!diag && !horizontalEnVertical) return;
    const leer = () => {
      const t = streamRef.current?.getVideoTracks()[0]?.getSettings();
      const v = videoRef.current;
      const nuevo: LecturaVivo = {
        track:
          t?.width && t.height
            ? `${t.width}×${t.height}${t.frameRate ? ` · ${Math.round(t.frameRate)} fps` : ""}`
            : "—",
        video: v && v.videoWidth > 0 ? `${v.videoWidth}×${v.videoHeight}` : "—",
        orientacion: orientacionActual(),
      };
      setVivo((prev) =>
        prev &&
        prev.track === nuevo.track &&
        prev.video === nuevo.video &&
        prev.orientacion === nuevo.orientacion
          ? prev
          : nuevo
      );
    };
    const inicial = setTimeout(leer, 0);
    const id = setInterval(leer, 500);
    const video = videoRef.current;
    video?.addEventListener("resize", leer);
    const dejarDeEscuchar = suscribirOrientacion(leer);
    return () => {
      clearTimeout(inicial);
      clearInterval(id);
      video?.removeEventListener("resize", leer);
      dejarDeEscuchar();
    };
  }, [fase, listo, enResultado, diag, horizontalEnVertical]);

  // Si el dispositivo cambia de orientación FUERA de una toma (en "preparar",
  // o en "grabar" sin grabar ni cuenta regresiva), reabre la cámara con
  // abrirCamaraVertical y vuelve a medir. Durante una toma (o su cuenta
  // regresiva) no se toca nada: ni cámara, ni fuente, ni decisión.
  useEffect(() => {
    if (enResultado) return;
    const alCambiar = () => {
      if (sesionRef.current || finalizandoRef.current || conteo !== null)
        return;
      if (orientacionActual() === orientacionAbiertaRef.current) return;
      if (fase === "grabar") setIntento((n) => n + 1);
      else setMedirTick((n) => n + 1);
    };
    return suscribirOrientacion(alCambiar);
  }, [fase, enResultado, conteo]);

  // Canvas 9:16: dibuja el recorte central del video y expone su captureStream
  // para grabar. El preview es este mismo canvas, así que lo que se ve es lo
  // que se graba (el espejo es solo CSS: el archivo no va espejado).
  useEffect(() => {
    if (!canvasActivo || !listo || enResultado) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !video || !ctx) return;
    let stream: MediaStream;
    try {
      if (typeof canvas.captureStream !== "function")
        throw new Error("canvas.captureStream no disponible");
      stream = canvas.captureStream(CANVAS_FPS);
    } catch {
      canvasFalloRef.current = true;
      setCanvasFallo(true);
      setAvisoVertical(MENSAJE_FALLO_VERTICAL);
      return;
    }
    canvasStreamRef.current = stream;
    ctx.imageSmoothingQuality = "high";

    let ultimo = 0;
    const dibujar = (t: number) => {
      // detenerStream suelta el stream: el bucle se corta solo.
      if (canvasStreamRef.current !== stream) return;
      rafCanvasRef.current = requestAnimationFrame(dibujar);
      // ~30 fps, igual que captureStream(30): se saltan los frames de más.
      if (t - ultimo < 1000 / CANVAS_FPS - 2) return;
      ultimo = t;
      dibujarRecorte(ctx, video, panRef.current);
    };
    rafCanvasRef.current = requestAnimationFrame(dibujar);

    return () => {
      cancelAnimationFrame(rafCanvasRef.current);
      stream.getTracks().forEach((t) => t.stop());
      if (canvasStreamRef.current === stream) canvasStreamRef.current = null;
    };
  }, [canvasActivo, listo, enResultado]);

  // Resalta la línea del guion que cruza la línea de lectura (mitad de la
  // ventana) y deduce de ella el bloque actual. El resaltado va por DOM y no
  // por estado para no re-renderizar el guion en cada cambio de línea.
  const calcularActivo = useCallback(() => {
    const el = scrollRef.current;
    const lineas = lineasRef.current;
    if (!el || lineas.length === 0) return;
    // La línea de lectura está en el centro y el texto empieza ahí: coincide
    // con scrollTop.
    const idx = indiceLinea(lineas, el.scrollTop);
    if (idx === lineaActivaRef.current) return;
    lineas[lineaActivaRef.current]?.resalte.classList.remove(...RESALTE);
    lineas[idx].resalte.classList.add(...RESALTE);
    lineaActivaRef.current = idx;
    const b = lineas[idx].bloque;
    if (b !== activoRef.current) {
      activoRef.current = b;
      setBloqueActivo(b);
    }
  }, []);

  // Mide el tramo de scroll de cada línea del guion y reaplica el resaltado.
  // Se usan rects relativos al contenedor y no offsetTop: no dependen de qué
  // ancestro sea el offsetParent ni de transforms como el espejo.
  const medirLineas = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const origen = el.getBoundingClientRect().top - el.scrollTop;
    const ps = Array.from(el.querySelectorAll<HTMLElement>("[data-l]"));
    const tops = ps.map((p) => p.getBoundingClientRect().top - origen);
    const max = el.scrollHeight - el.clientHeight;
    const lineas = ps.map((p, i) => {
      const span = p.firstElementChild as HTMLElement;
      span.classList.remove(...RESALTE); // por si React reutilizó el nodo
      const start = tops[i] - tops[0];
      const fin = i + 1 < ps.length ? tops[i + 1] - tops[0] : max;
      return {
        start,
        len: Math.max(0, fin - start),
        n: Math.max(1, Number(p.dataset.n)),
        bloque: Number(p.dataset.b),
        resalte: span,
      };
    });
    lineasRef.current = lineas;
    lineaActivaRef.current = -1;
    calcularActivo();
  }, [calcularActivo]);

  // Remide al cambiar el texto, el tamaño de letra o el tamaño del marco.
  useEffect(() => {
    if (fase !== "grabar" || enResultado) return;
    const el = scrollRef.current;
    if (!el) return;
    medirLineas();
    const ro = new ResizeObserver(() => medirLineas());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fase, enResultado, lineasGuion, tamano, medirLineas]);

  // Scroll automático del guion.
  useEffect(() => {
    if (!scrolling || fase !== "grabar") return;
    let raf = 0;
    let ultimo = performance.now();
    const paso = (ahora: number) => {
      const el = scrollRef.current;
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        const lineas = lineasRef.current;
        if (lineas.length > 0) {
          const { palabrasPorSeg: wps, mult: m } = ritmoRef.current;
          const l = lineas[indiceLinea(lineas, posRef.current)];
          // Cada línea dura n/(wps·m) s: sus px se reparten en ese tiempo,
          // así el ritmo sigue las palabras y no el tamaño de letra.
          posRef.current += (((l.len * wps * m) / l.n) * (ahora - ultimo)) / 1000;
        }
        if (posRef.current >= max) {
          posRef.current = max;
          el.scrollTop = max;
          calcularActivo();
          setFinScroll(performance.now());
          setScrolling(false);
          return;
        }
        el.scrollTop = posRef.current;
        calcularActivo();
      }
      ultimo = ahora;
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [scrolling, fase, calcularActivo]);

  // Cronómetro + seguimiento de voz. Tiempo muerto inicial: ms desde que
  // arranca el recorder hasta que el nivel supera el umbral de voz por 1ª
  // vez. También se anota la última voz, que usan el corte automático y el
  // tiempo muerto final. Sin umbral todavía, las ventanas se acumulan hasta
  // completar la medición de ruido.
  useEffect(() => {
    if (!grabando) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    const analyser = cadenaRef.current?.analyser;
    const detenerMedidor = analyser
      ? muestrearNivel(analyser, (db) => {
          const s = sesionRef.current;
          if (!s) return;
          const v = { t: performance.now(), db };
          if (s.calibracion) {
            registrarVoz(s, v, s.calibracion.umbralDb);
            return;
          }
          s.pendientes.push(v);
          if (v.t - s.inicio >= MEDICION_RUIDO_MS) resolverCalibracion(s);
        })
      : null;
    return () => {
      clearInterval(id);
      detenerMedidor?.();
    };
  }, [grabando]);

  const reiniciarPosicion = useCallback(() => {
    posRef.current = 0;
    activoRef.current = 0;
    setBloqueActivo(0);
    setFinScroll(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    calcularActivo();
  }, [calcularActivo]);

  // Arranque: el recorder y el scroll se disparan en el mismo handler (un
  // solo batch de React), sin pausa entre el clic/cuenta y el guion.
  // `ruido`: niveles leídos en la cuenta regresiva; null si no la hubo (el
  // ruido se mide entonces al comienzo de la toma).
  const empezarGrabacion = useCallback((ruido: number[] | null) => {
    const cadena = cadenaRef.current;
    const directo = streamRef.current;
    if (!directo || !cadena) return;
    if (cadena.ctx.state !== "running") {
      setErrorGrabar(MENSAJE_AUDIO);
      return;
    }
    if (directo.getTracks().some((t) => t.readyState !== "live")) {
      setErrorGrabar(
        "La cámara o el micrófono se desconectaron. Toca Reintentar."
      );
      return;
    }
    // Con el canvas vigente siempre se graba de su captureStream; si aún no
    // existe no se cae en silencio al stream directo.
    if (canvasEsperadoRef.current && !canvasStreamRef.current) return;
    // Con canvas se intenta primero grabar de él; si el recorder falla
    // (constructor o start), se cae al stream directo con aviso.
    const fuentes: ("canvas" | "directo")[] = canvasStreamRef.current
      ? ["canvas", "directo"]
      : ["directo"];
    let principal: Grabador | null = null;
    let fuente: "canvas" | "directo" = "directo";
    for (const f of fuentes) {
      const paraGrabar = streamParaGrabar(
        f === "canvas" ? canvasStreamRef.current : directo,
        cadena
      );
      if (!paraGrabar) continue;
      const mimeType = elegirMimeType(mimeFallidosRef.current);
      try {
        principal = crearGrabador(paraGrabar, mimeType, () => {
          // La próxima toma prueba el siguiente formato de la lista.
          if (mimeType) mimeFallidosRef.current.add(mimeType);
          interrumpir("el grabador del navegador falló.");
        });
        fuente = f;
        break;
      } catch {
        // Se prueba la siguiente fuente.
        if (f === "directo" && mimeType) mimeFallidosRef.current.add(mimeType);
      }
    }
    if (!principal) {
      setErrorGrabar("Este navegador no puede grabar video.");
      return;
    }
    if (fuentes[0] === "canvas" && fuente === "directo") {
      canvasFalloRef.current = true;
      // El preview vuelve al video de la cámara: lo que se ve es lo que se graba.
      setCanvasFallo(true);
      setAvisoVertical(MENSAJE_FALLO_VERTICAL);
    }
    const origen: Origen =
      fuente === "canvas"
        ? "canvas"
        : canvasFalloRef.current
          ? "directo-fallo"
          : "directo";
    // El guion parte siempre desde el inicio (en modo gancho, el del gancho).
    reiniciarPosicion();
    const grabador = principal;
    // Si el recorder se detiene solo, se arma la toma igual.
    grabador.recorder.addEventListener("stop", () => {
      if (sesionRef.current?.principal === grabador)
        interrumpir("el grabador se detuvo.");
    });
    sesionRef.current = {
      principal,
      inicio: performance.now(),
      muertoMs: null,
      ultimaVoz: null,
      calibracion: ruido ? calibrar(ruido) : null,
      pendientes: [],
      modo,
      orientacion: orientacionActual(),
      origen,
      camara: videoRef.current
        ? `${videoRef.current.videoWidth}×${videoRef.current.videoHeight}`
        : "",
    };
    setSegundos(0);
    setFinScroll(null);
    setGrabando(true);
    setScrolling(true);
  }, [modo, interrumpir, reiniciarPosicion]);

  // Corte al terminar el guion: con el scroll en el final se vigila la voz
  // (la última voz la anota el seguimiento de arriba) y se corta tras
  // SILENCIO_CORTE_MS de silencio continuo, o a los TOPE_CORTE_MS del final.
  // Pausar o reanudar pone finScroll en null y reinicia la vigilancia.
  useEffect(() => {
    if (!grabando || !cortarAlFinal || finScroll === null) return;
    const id = setInterval(() => {
      const s = sesionRef.current;
      if (!s) return;
      const ahora = performance.now();
      // Solo cuenta el silencio observado ya vigilando.
      const desde = Math.max(finScroll, s.ultimaVoz ?? 0);
      if (
        ahora - desde >= SILENCIO_CORTE_MS ||
        ahora - finScroll >= TOPE_CORTE_MS
      )
        terminarGrabacion();
    }, 50);
    return () => clearInterval(id);
  }, [grabando, cortarAlFinal, finScroll, terminarGrabacion]);

  // Pausar/reanudar a mano cancela la vigilancia; si el scroll vuelve a
  // llegar al final, se arma de nuevo desde cero.
  const alternarScroll = useCallback(() => {
    setFinScroll(null);
    setScrolling((s) => !s);
  }, []);

  async function alternarGrabacion() {
    if (grabando) {
      terminarGrabacion();
      return;
    }
    if (conteo !== null) {
      cancelarConteo();
      return;
    }
    const cadena = cadenaRef.current;
    if (!cadena || finalizandoRef.current || reanudandoRef.current) return;
    setAviso(null);
    // El audio se reanuda aquí, dentro del gesto del usuario (iOS lo exige).
    const adquisicion = adquisicionRef.current;
    reanudandoRef.current = true;
    const audioActivo = await reanudarAudio(cadena.ctx);
    reanudandoRef.current = false;
    if (adquisicionRef.current !== adquisicion || document.hidden) return;
    if (!audioActivo) {
      setErrorGrabar(MENSAJE_AUDIO);
      return;
    }
    if (cuentaSeg === 0) {
      empezarGrabacion(null);
      return;
    }
    let n = cuentaSeg;
    setConteo(n);
    const ruido: number[] = [];
    detenerMuestreoRef.current = muestrearNivel(cadena.analyser, (db) =>
      ruido.push(db)
    );
    conteoTimerRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        cancelarConteo();
        empezarGrabacion(ruido);
      } else {
        setConteo(n);
      }
    }, 1000);
  }

  // Corta la sesión en curso sin crear toma y libera sus blobs.
  const descartarSesion = useCallback(() => {
    const s = sesionRef.current;
    sesionRef.current = null;
    if (!s) return;
    s.principal.detener();
    void s.principal.fin.then((a) => URL.revokeObjectURL(a.url));
  }, []);

  // Cancela la subida y revoca la versión procesada de una toma.
  const liberarProceso = useCallback((id: number) => {
    subidasRef.current.get(id)?.abort();
    subidasRef.current.delete(id);
    const url = urlsProcesadasRef.current.get(id);
    if (url) URL.revokeObjectURL(url);
    urlsProcesadasRef.current.delete(id);
    setProcesos((prev) => {
      const quedan = { ...prev };
      delete quedan[id];
      return quedan;
    });
  }, []);

  function liberarToma(t: Toma) {
    liberarProceso(t.id);
    URL.revokeObjectURL(t.url);
  }

  // Sube la toma y guarda la versión que devuelve el servidor. XHR y no fetch
  // porque informa el avance de la subida.
  function procesarToma(toma: Toma, nombreOriginal: string) {
    const { id } = toma;
    if (subidasRef.current.size > 0) return;
    // Un reintento parte de cero.
    liberarProceso(id);
    const guardar = (p: Proceso) =>
      setProcesos((prev) => ({ ...prev, [id]: p }));
    if (toma.blob.size > MAX_BYTES_PROCESAR) {
      guardar({ estado: "error", mensaje: mensajeErrorProceso(413) });
      return;
    }

    const xhr = new XMLHttpRequest();
    const fallar = (mensaje: string) => {
      subidasRef.current.delete(id);
      guardar({ estado: "error", mensaje });
    };
    xhr.open(
      "POST",
      `${URL_PROCESAR}?nombre=${encodeURIComponent(nombreOriginal)}`
    );
    xhr.setRequestHeader("Content-Type", toma.mimeType.split(";")[0]);
    xhr.responseType = "blob";
    xhr.timeout = TIMEOUT_PROCESAR_MS;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      guardar({
        estado: "subiendo",
        porcentaje: Math.floor((e.loaded / e.total) * 100),
      });
    };
    xhr.upload.onload = () => guardar({ estado: "procesando" });
    xhr.onload = () => {
      const respuesta = xhr.response as Blob | null;
      if (xhr.status !== 200) {
        fallar(mensajeErrorProceso(xhr.status));
        return;
      }
      if (!respuesta?.size || !respuesta.type.startsWith("video/mp4")) {
        fallar("El servidor no devolvió un video. Reintenta.");
        return;
      }
      subidasRef.current.delete(id);
      const url = URL.createObjectURL(respuesta);
      urlsProcesadasRef.current.set(id, url);
      guardar({
        estado: "listo",
        blob: respuesta,
        url,
        nombre: `${nombreOriginal.replace(/\.[^.]+$/, "")}_tiktok.mp4`,
      });
    };
    xhr.onerror = () => fallar(mensajeErrorProceso(0));
    xhr.ontimeout = () => fallar(mensajeErrorProceso(504));
    subidasRef.current.set(id, xhr);
    guardar({ estado: "subiendo", porcentaje: 0 });
    xhr.send(toma.blob);
  }

  function limpiarEstadoGrabacion() {
    // Invalida la apertura de cámara en curso: lo que llegue tarde se detiene.
    adquisicionRef.current++;
    cancelarConteo();
    descartarSesion();
    detenerStream();
    setListo(false);
    setGrabando(false);
    setScrolling(false);
    setErrorGrabar(null);
    setAviso(null);
  }

  function reintentar() {
    limpiarEstadoGrabacion();
    setIntento((n) => n + 1);
  }

  // Salir de la pantalla de grabación: con tomas en memoria vuelve a
  // ellas; sin tomas, al editor.
  function salir() {
    limpiarEstadoGrabacion();
    if (tomas.length > 0) {
      setEnResultado(true);
      return;
    }
    setFase("preparar");
  }

  // Cerrar = descartar todas las tomas y volver al editor.
  function cerrarTodo() {
    if (
      tomas.length > 0 &&
      !window.confirm("Se descartarán las tomas que no hayas descargado.")
    )
      return;
    limpiarEstadoGrabacion();
    tomas.forEach(liberarToma);
    setTomas([]);
    setTomaId(null);
    setEnResultado(false);
    setModo("completa");
    setFase("preparar");
  }

  function descartarToma(id: number) {
    const t = tomas.find((x) => x.id === id);
    if (!t) return;
    if (!window.confirm("¿Descartar esta toma? No se puede recuperar.")) return;
    liberarToma(t);
    const quedan = tomas.filter((x) => x.id !== id);
    setTomas(quedan);
    if (quedan.length === 0) {
      setTomaId(null);
      setEnResultado(false);
      setModo("completa");
      setFase("preparar");
    } else if (tomaId === id) {
      setTomaId(quedan[quedan.length - 1].id);
    }
  }

  // Vuelve a la cámara para una toma nueva ("completa" o solo el gancho).
  function regrabar(m: Modo) {
    if (tomas.length >= MAX_TOMAS) return;
    setModo(m);
    setEnResultado(false);
    setSegundos(0);
    setErrorGrabar(null);
    setAviso(null);
    setListo(false);
    setScrolling(false);
    reiniciarPosicion();
    setIntento((n) => n + 1);
  }

  // Hoja de compartir del sistema (en iOS permite "Guardar video").
  function compartir(archivo: File) {
    navigator.share({ files: [archivo] }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAviso("No se pudo compartir; usa el botón de descarga.");
    });
  }

  // El guion se persiste en un efecto sobre [guion], así que vaciarlo acá
  // también lo deja vacío en localStorage.
  function borrarGuion() {
    setGuion("");
    guionRef.current?.focus();
  }

  function iniciar() {
    posRef.current = 0;
    activoRef.current = 0;
    setBloqueActivo(0);
    setModo("completa");
    setSegundos(0);
    setErrorGrabar(null);
    setFase("grabar");
  }

  // Liberar todo al salir de la pantalla.
  useEffect(() => {
    montadoRef.current = true;
    const subidas = subidasRef.current;
    const urlsProcesadas = urlsProcesadasRef.current;
    return () => {
      subidas.forEach((xhr) => xhr.abort());
      subidas.clear();
      urlsProcesadas.forEach((url) => URL.revokeObjectURL(url));
      urlsProcesadas.clear();
      montadoRef.current = false;
      if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
      conteoTimerRef.current = null;
      detenerMuestreoRef.current?.();
      detenerMuestreoRef.current = null;
      descartarSesion();
      tomasRef.current.forEach((t) => URL.revokeObjectURL(t.url));
      detenerStream();
    };
  }, [detenerStream, descartarSesion]);

  // Atajos: espacio = pausar scroll, flechas = velocidad.
  useEffect(() => {
    if (fase !== "grabar" || enResultado) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        alternarScroll();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMult((v) => ajustarMult(v, 0.1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setMult((v) => ajustarMult(v, -0.1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fase, enResultado, alternarScroll]);

  const avisoErrorPrep = (
    <>
      {errorPrep && (
        <p role="alert" className="text-sm text-red-600">
          {errorPrep}
        </p>
      )}
      {diagnostico && (
        <p className="text-[11px] text-gray-400">
          Contexto seguro (HTTPS): {diagnostico.seguro ? "sí" : "no"} ·
          mediaDevices: {diagnostico.mediaDevices ? "sí" : "no"}
        </p>
      )}
    </>
  );

  if (fase === "preparar") {
    return (
      <div className="grid w-full max-w-full grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="min-w-0 rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
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
          {/* Resaltado de muletillas: capa con el mismo texto y métricas
              detrás del textarea (transparente), con scroll sincronizado. */}
          <div className="relative mt-2">
            <div
              ref={resaltadoRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-y-scroll whitespace-pre-wrap break-words rounded-xl border border-transparent p-3 text-base text-transparent"
            >
              {dividirMuletillas(guion).map((p, i) =>
                p.muletilla ? (
                  <mark key={i} className="rounded bg-amber-200 text-transparent">
                    {p.texto}
                  </mark>
                ) : (
                  <span key={i}>{p.texto}</span>
                )
              )}
              {"​"}
            </div>
            <textarea
              id="guion"
              ref={guionRef}
              value={guion}
              onChange={(e) => setGuion(e.target.value)}
              onScroll={(e) => {
                if (resaltadoRef.current)
                  resaltadoRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              placeholder="Pega o escribe aquí el guion. Separa Gancho, Desarrollo y Cierre con una línea en blanco."
              className="relative block h-80 w-full resize-y overflow-y-scroll whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-transparent p-3 text-base text-gray-900 outline-none focus:border-[#54A6D8] focus:ring-2 focus:ring-[#54A6D8]/30 lg:h-[28rem]"
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            <mark className="rounded bg-amber-200 px-1 text-gray-700">
              muletillas
            </mark>{" "}
            resaltadas: «yo creo que», «o sea», «pero», «eh».
          </p>

          {bloques.length > 0 && (
            <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
              {bloques.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-gray-600">
                    <span className="font-medium text-gray-900">
                      {etiquetaBloque(i, bloques.length)}
                    </span>{" "}
                    · {b}
                  </span>
                  <span className="shrink-0 tabular-nums text-gray-500">
                    {contarPalabras(b)} pal. · ≈{duraciones[i].toFixed(1)} s
                  </span>
                </div>
              ))}
              <div
                className={`flex items-center justify-between text-sm font-semibold ${
                  duracionTotal > LIMITE_DURACION_S
                    ? "text-amber-600"
                    : "text-gray-900"
                }`}
              >
                <span>
                  Total
                  {duracionTotal > LIMITE_DURACION_S &&
                    ` · pasa de ${LIMITE_DURACION_S} s, considera recortar`}
                </span>
                <span className="tabular-nums">
                  ≈{duracionTotal.toFixed(1)} s
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Estimado a {palabrasPorSeg} palabras/seg (preset{" "}
                {PRESETS[preset].nombre}).
              </p>
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
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
          <div className="flex flex-col gap-1 text-sm text-gray-600">
            Ritmo
            <div className="grid grid-cols-3 gap-1" role="group">
              {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={preset === id}
                  onClick={() => setPreset(id)}
                  className={`rounded-lg border px-2 py-1.5 text-sm transition ${
                    preset === id
                      ? "border-[#54A6D8] bg-[#54A6D8]/10 font-semibold text-gray-900"
                      : "border-gray-200 text-gray-600 hover:border-[#54A6D8]/40"
                  }`}
                >
                  {PRESETS[id].nombre}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Velocidad: {mult.toFixed(1)}x
            <input
              type="range"
              min={MULT_MIN}
              max={MULT_MAX}
              step={0.1}
              value={mult}
              onChange={(e) => setMult(Number(e.target.value))}
              className="accent-[#54A6D8]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Volumen del micrófono: {ganancia}x
            <input
              type="range"
              min={GANANCIA_MIN}
              max={GANANCIA_MAX}
              step={0.5}
              value={ganancia}
              onChange={(e) => setGanancia(Number(e.target.value))}
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
          <div className="flex flex-col gap-1 text-sm text-gray-600">
            Cuenta regresiva
            <div className="grid grid-cols-4 gap-1" role="group">
              {OPCIONES_CUENTA.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={cuentaSeg === s}
                  onClick={() => setCuentaSeg(s)}
                  className={`rounded-lg border px-2 py-1.5 text-sm transition ${
                    cuentaSeg === s
                      ? "border-[#54A6D8] bg-[#54A6D8]/10 font-semibold text-gray-900"
                      : "border-gray-200 text-gray-600 hover:border-[#54A6D8]/40"
                  }`}
                >
                  {s === 0 ? "Sin" : `${s} s`}
                </button>
              ))}
            </div>
            {cuentaSeg === 0 && (
              <span className="text-xs text-gray-500">
                Sin cuenta: la grabación y el guion parten juntos al tocar
                Grabar.
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={guias}
              onChange={(e) => setGuias(e.target.checked)}
              className="h-4 w-4 accent-[#54A6D8]"
            />
            Guías en pantalla (encuadre)
          </label>
          <div className="flex flex-col gap-1">
            <p className="text-[11px] text-gray-500">
              {describirLectura(lectura)} · canvas:{" "}
              {razonCanvas(dimensionReal(lectura), false).texto}
              {midiendo ? " · midiendo…" : ""}
            </p>
            {hayCamaras && (
              <button
                type="button"
                onClick={() => setMedirTick((n) => n + 1)}
                disabled={midiendo}
                className="self-start text-[11px] text-gray-500 underline disabled:opacity-50"
              >
                Volver a medir la cámara
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={cortarAlFinal}
              onChange={(e) => setCortarAlFinal(e.target.checked)}
              className="h-4 w-4 accent-[#54A6D8]"
            />
            Cortar al terminar el guion
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
              <>
                <button
                  type="button"
                  onClick={pedirPermiso}
                  disabled={pidiendo}
                  className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[#54A6D8]/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Camera className="h-4 w-4 text-[#54A6D8]" />
                  {pidiendo ? "Solicitando permiso..." : "Permitir cámara y micrófono"}
                </button>
                {avisoErrorPrep}
              </>
            ) : (
              <>
                {avisoErrorPrep}
                <label className="flex flex-col gap-1 text-sm text-gray-600">
                  Cámara
                  <select
                    value={camaraId}
                    onChange={(e) => setCamaraId(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-gray-200 bg-white p-2 text-sm text-gray-900"
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
                    className="w-full min-w-0 rounded-xl border border-gray-200 bg-white p-2 text-sm text-gray-900"
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
          </div>

          <button
            type="button"
            onClick={iniciar}
            disabled={!guion.trim() || midiendo}
            className="mt-auto rounded-xl bg-[#54A6D8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4394c4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {midiendo ? "Midiendo la cámara..." : "Iniciar"}
          </button>
        </section>
      </div>
    );
  }

  const botonCtrl =
    "flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-medium text-white transition hover:bg-white/25";

  // Proporción real (y resolución cruda) del video de la cámara. De ella y de
  // la orientación del dispositivo (que se congela aquí) depende si se usa el
  // canvas 9:16. Mientras se graba no se actualiza nada: ni el tamaño ni la
  // orientación, así que girar el teléfono a mitad de toma no cambia de fuente.
  function actualizarAspecto(e: React.SyntheticEvent<HTMLVideoElement>) {
    const { videoWidth, videoHeight } = e.currentTarget;
    if (!(videoWidth > 0 && videoHeight > 0)) return;
    if (sesionRef.current) return;
    setAspecto(videoWidth / videoHeight);
    setCamaraDim({
      w: videoWidth,
      h: videoHeight,
      orientacion: orientacionActual(),
    });
  }

  // Con canvas el marco es 9:16 fijo; sin canvas, la proporción de la cámara.
  const aspectoMarco = canvasActivo ? ASPECTO_VERTICAL : aspecto;

  const tomaSel = tomas.find((t) => t.id === tomaId) ?? tomas[tomas.length - 1];
  const tomasLlenas = tomas.length >= MAX_TOMAS;
  const nombreToma = tomaSel
    ? nombreArchivo(
        tomaSel.creada,
        tomaSel.ext,
        `toma-${tomas.indexOf(tomaSel) + 1}${tomaSel.modo === "gancho" ? "-gancho" : ""}`
      )
    : "";
  // Archivo para la hoja de compartir; null si el navegador no la admite. El
  // tipo va sin ";codecs=...", que algunos navegadores rechazan al compartir.
  let archivoCompartible: File | null = null;
  if (enResultado && tomaSel && typeof navigator.canShare === "function") {
    const file = new File([tomaSel.blob], nombreToma, {
      type: tomaSel.mimeType.split(";")[0],
    });
    if (navigator.canShare({ files: [file] })) archivoCompartible = file;
  }
  // Lo mismo para la versión procesada de la toma seleccionada.
  const proceso = tomaSel ? procesos[tomaSel.id] : undefined;
  let procesadoCompartible: File | null = null;
  if (
    enResultado &&
    proceso?.estado === "listo" &&
    typeof navigator.canShare === "function"
  ) {
    const file = new File([proceso.blob], proceso.nombre, {
      type: "video/mp4",
    });
    if (navigator.canShare({ files: [file] })) procesadoCompartible = file;
  }
  // Acciones de la pantalla de resultados: ícono arriba y etiqueta abajo.
  const botonAccion =
    "flex h-16 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-xs font-medium leading-tight text-white transition disabled:opacity-50";
  const botonDestacado = `${botonAccion} bg-[#54A6D8] hover:bg-[#4394c4]`;
  const botonSecundario = `${botonAccion} bg-white/15 hover:bg-white/25`;

  return (
    <div className="absolute inset-0 overflow-hidden overscroll-none bg-black pt-[env(safe-area-inset-top,0px)] text-white">
      {enResultado && tomaSel ? (
        <div className="relative h-full">
          <button
            type="button"
            onClick={cerrarTodo}
            aria-label="Cerrar"
            className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex h-full flex-col items-center gap-2 overflow-y-auto overscroll-contain px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
            {/* El video toma el alto que sobra (hasta 55svh), así la grilla de
                acciones queda a la vista. Los márgenes laterales dejan libre el
                botón de cerrar. */}
            <video
              key={tomaSel.id}
              src={tomaSel.url}
              controls
              playsInline
              className="max-h-[55svh] min-h-40 w-[calc(100%-6rem)] flex-1 basis-0 rounded-xl object-contain"
              onLoadedMetadata={(e) => {
                const { videoWidth, videoHeight } = e.currentTarget;
                if (videoWidth > 0 && videoHeight > 0)
                  setResoluciones((prev) => ({
                    ...prev,
                    [tomaSel.id]: `${videoWidth}×${videoHeight}`,
                  }));
              }}
            />

            <div className="flex flex-wrap justify-center gap-1.5">
              {tomas.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={t.id === tomaSel.id}
                  onClick={() => setTomaId(t.id)}
                  className={`h-8 rounded-full px-3 text-xs font-medium transition ${
                    t.id === tomaSel.id
                      ? "bg-[#54A6D8] text-white"
                      : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  Toma {i + 1}
                  {t.modo === "gancho" ? " · gancho" : ""}
                </button>
              ))}
            </div>

            <div className="w-full max-w-md text-center text-[11px] leading-snug text-white/70">
              <p className="text-white/80">
                {tomaSel.segundos} s · Tiempo muerto inicial:{" "}
                <strong className="tabular-nums">
                  {tomaSel.muertoMs !== null
                    ? `${tomaSel.muertoMs} ms`
                    : "sin voz detectada"}
                </strong>
                {" · "}Tiempo muerto final:{" "}
                <strong className="tabular-nums">
                  {tomaSel.muertoFinalMs !== null
                    ? `${tomaSel.muertoFinalMs} ms`
                    : "sin voz detectada"}
                </strong>
              </p>
              <p>
                Grabado:{" "}
                <strong className="tabular-nums">
                  {resoluciones[tomaSel.id] ?? "…"}
                </strong>{" "}
                · Dispositivo: {tomaSel.orientacion} · Formato:{" "}
                {tomaSel.origen === "canvas"
                  ? "canvas 9:16"
                  : tomaSel.origen === "directo"
                    ? "cámara directa"
                    : "cámara directa (falló el canvas)"}{" "}
                · Cámara: {tomaSel.camara || "—"}
              </p>
              <p className="break-all">
                Archivo: {tomaSel.mimeType} · Ruido:{" "}
                {tomaSel.ruidoDb !== null
                  ? `${tomaSel.ruidoDb.toFixed(1)} dBFS`
                  : "sin medición"}{" "}
                · Umbral: {tomaSel.umbralDb.toFixed(1)} dBFS
              </p>
            </div>

            {proceso?.estado === "listo" && (
              <p role="status" className="text-[11px] text-white/80">
                Versión para TikTok lista
              </p>
            )}

            <div className="grid w-full max-w-md shrink-0 grid-cols-3 gap-2">
              {/* Fila 1: versión para TikTok (procesada en el servidor) y la
                  toma original. */}
              {proceso?.estado === "listo" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (procesadoCompartible) compartir(procesadoCompartible);
                    }}
                    disabled={!procesadoCompartible}
                    className={botonDestacado}
                  >
                    <Share2 className="h-5 w-5" />
                    Compartir TikTok
                  </button>
                  <a
                    href={proceso.url}
                    download={proceso.nombre}
                    className={botonDestacado}
                  >
                    <Download className="h-5 w-5" />
                    Descargar TikTok
                  </a>
                  <a
                    href={tomaSel.url}
                    download={nombreToma}
                    className={botonDestacado}
                  >
                    <Download className="h-5 w-5" />
                    Original
                  </a>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => procesarToma(tomaSel, nombreToma)}
                    disabled={procesandoAlguna}
                    className={botonDestacado}
                  >
                    <Upload className="h-5 w-5" />
                    <span aria-live="polite" className="tabular-nums">
                      {proceso?.estado === "subiendo"
                        ? `Subiendo ${proceso.porcentaje} %`
                        : proceso?.estado === "procesando"
                          ? "Procesando…"
                          : proceso?.estado === "error"
                            ? "Reintentar"
                            : "TikTok"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (archivoCompartible) compartir(archivoCompartible);
                    }}
                    disabled={!archivoCompartible}
                    className={botonDestacado}
                  >
                    <Share2 className="h-5 w-5" />
                    Compartir
                  </button>
                  <a
                    href={tomaSel.url}
                    download={nombreToma}
                    className={botonDestacado}
                  >
                    <Download className="h-5 w-5" />
                    Descargar
                  </a>
                </>
              )}

              {/* Fila 2 */}
              <button
                type="button"
                onClick={() => regrabar("gancho")}
                disabled={tomasLlenas}
                className={botonSecundario}
              >
                <RotateCcw className="h-5 w-5" />
                Regrabar gancho
              </button>
              <button
                type="button"
                onClick={() => regrabar("completa")}
                disabled={tomasLlenas}
                className={botonSecundario}
              >
                <RotateCcw className="h-5 w-5" />
                Grabar de nuevo
              </button>
              <button
                type="button"
                onClick={() => descartarToma(tomaSel.id)}
                className={botonSecundario}
              >
                <Trash2 className="h-5 w-5" />
                Descartar
              </button>
            </div>

            {/* Estado y errores, bajo la grilla. */}
            {proceso?.estado === "error" && (
              <p role="alert" className="text-center text-[11px] text-amber-400">
                {proceso.mensaje}
              </p>
            )}
            {!proceso && procesandoAlguna && (
              <p role="status" className="text-center text-[11px] text-white/80">
                Hay otra toma en proceso.
              </p>
            )}
            {aviso && (
              <p role="alert" className="text-center text-[11px] text-amber-400">
                {aviso}
              </p>
            )}
            {tomasLlenas && (
              <p className="text-center text-[11px] text-white/70">
                Máximo {MAX_TOMAS} tomas en memoria: descarta una para grabar otra.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="relative flex h-full w-full min-w-0 touch-none items-center justify-center">
          {/* Marco: 9:16 con canvas, o la proporción real de la cámara sin él.
              Lo que se ve es lo que se graba. Se ajusta al área con svh
              (constante con la barra de Safari). */}
          <div
            className="relative min-w-0 overflow-hidden"
            style={{
              aspectRatio: aspectoMarco,
              width: `min(100%, calc((100svh - env(safe-area-inset-top, 0px)) * ${aspectoMarco}))`,
            }}
          >
          {/* Con canvas, el video de la cámara es solo la fuente (oculto pero
              en el DOM para que iOS lo decodifique) y el preview es el
              canvas; sin canvas, el video se ve como siempre. El espejo es
              solo CSS: el archivo no va espejado. */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={
              canvasActivo
                ? "pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
                : "h-full w-full object-cover"
            }
            onLoadedMetadata={actualizarAspecto}
            onResize={actualizarAspecto}
            style={canvasActivo ? undefined : { transform: "scaleX(-1)" }}
          />
          {canvasActivo && (
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="h-full w-full"
              style={{ transform: "scaleX(-1)" }}
            />
          )}

          {/* Guías: overlay DOM, no forman parte del stream que se graba. */}
          {guias && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {/* Recorte vertical 9:16 centrado: lo que sobrevive si después
                  se recorta a vertical. Solo con cámara horizontal. */}
              {aspectoMarco > 1 && (
                <div
                  className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-x border-dashed border-white/40"
                  style={{ aspectRatio: "9 / 16" }}
                />
              )}
              {/* Óvalo de cara: su ancho sale de su alto (3:4), así no se
                  deforma con la proporción del marco. */}
              <div
                className="absolute left-1/2 top-[22%] h-[68%] -translate-x-1/2 rounded-[50%] border-2 border-dashed border-white/60"
                style={{ aspectRatio: "3 / 4" }}
              >
                <div className="absolute -inset-x-[12%] top-[36%] border-t border-dashed border-[#54A6D8]">
                  <span className="absolute -top-4 right-0 text-[10px] text-[#54A6D8]">
                    ojos
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Guion (overlay DOM): un solo flujo continuo; solo la línea que
              cruza la línea de lectura va resaltada. Alto fijo para no mover
              el scroll. */}
          <div
            ref={scrollRef}
            className={`absolute inset-x-0 top-0 h-[38%] overflow-hidden px-5 ${
              guias ? "bg-black/40" : "bg-black/60"
            }`}
          >
            <div className="h-1/2" />
            {textoGuion}
            <div className="h-1/2" />
          </div>

          {grabando && (
            <div className="absolute right-4 top-[40%] flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              REC {formatoTiempo(segundos)} / {formatoTiempo(MAX_TOMA_S)} ·{" "}
              {etiquetaBloque(bloqueActivo, bloquesGrab.length)}
            </div>
          )}

          {avisoVertical && (
            <p className="absolute inset-x-2 bottom-[24%] rounded-lg bg-amber-500/90 px-3 py-1.5 text-center text-xs font-medium text-black">
              {avisoVertical}
            </p>
          )}

          {horizontalEnVertical && camaraDim && (
            <p className="absolute inset-x-2 bottom-[34%] rounded-lg bg-amber-500/90 px-3 py-1.5 text-center text-xs font-medium text-black">
              Con el teléfono en vertical la cámara entregó video{" "}
              {camaraDim.w}×{camaraDim.h} (horizontal); getSettings dice{" "}
              {vivo?.track ?? (lectura ? `${lectura.w}×${lectura.h}` : "—")}.
              Se graba tal cual, sin canvas ni recorte.
            </p>
          )}

          {/* Diagnóstico en vivo (solo con ?diag=1): track (getSettings), video
              (videoWidth×videoHeight), orientación del dispositivo, canvas e
              intentos de apertura de la cámara. */}
          {diag && (
            <p className="pointer-events-none absolute left-2 top-[39%] max-w-[60%] rounded bg-black/60 px-2 py-1 text-[10px] leading-tight text-white/90">
              getSettings {vivo?.track ?? "—"} · video {vivo?.video ?? "—"} ·
              dispositivo {vivo?.orientacion ?? "—"} · canvas: {razon.texto} ·
              intentos: {lectura?.intentos.join(", ") || "—"}
            </p>
          )}

          {conteo !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-9xl font-bold">
              {conteo}
            </div>
          )}

          {(aviso || finalizando) && (
            <p
              role="status"
              className="absolute inset-x-2 bottom-[44%] rounded-lg bg-amber-500/90 px-3 py-1.5 text-center text-xs font-medium text-black"
            >
              {finalizando ? "Finalizando la toma..." : aviso}
            </p>
          )}

          {(sinSenal.video || sinSenal.audio) && (
            <div
              role="status"
              className="pointer-events-none absolute inset-x-2 bottom-[52%] rounded-lg bg-amber-500/90 px-3 py-1.5 text-center text-xs font-medium text-black"
            >
              {sinSenal.video && <p>La cámara dejó de entregar señal.</p>}
              {sinSenal.audio && <p>El micrófono dejó de entregar señal.</p>}
            </div>
          )}

          {errorGrabar && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
              <p role="alert" className="max-w-md text-base">
                {errorGrabar}
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={reintentar} className={botonCtrl}>
                  <RotateCcw className="h-4 w-4" />
                  Reintentar
                </button>
                <button type="button" onClick={salir} className={botonCtrl}>
                  Volver
                </button>
              </div>
            </div>
          )}
          </div>

          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={alternarGrabacion}
              disabled={
                !listo ||
                camaraDim === null ||
                finalizando ||
                errorGrabar !== null ||
                (!grabando && tomasLlenas)
              }
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
              onClick={alternarScroll}
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
            <button
              type="button"
              onClick={() => setGuias((g) => !g)}
              aria-pressed={guias}
              className={botonCtrl}
              title="Mostrar u ocultar guías (no se graban)"
            >
              <Frame className="h-4 w-4" />
              Guías
            </button>
            {/* Desplazamiento horizontal del recorte (sin zoom): se ve en vivo
                en el preview y se bloquea al grabar para que el encuadre no
                salte a mitad de toma. Solo existe con el canvas. */}
            {canvasActivo && (
              <label className="flex items-center gap-2 text-xs">
                Encuadre
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={5}
                  value={Math.round(desplazamiento * 100)}
                  onChange={(e) => setDesplazamiento(Number(e.target.value) / 100)}
                  disabled={grabando}
                  aria-label="Desplazar el recorte en horizontal"
                  className="w-28 accent-[#54A6D8] disabled:opacity-50"
                />
                <span className="w-10 text-center tabular-nums">
                  {Math.round(desplazamiento * 100)}%
                </span>
              </label>
            )}
            <div className="flex items-center gap-1 text-xs" title="Flechas ↑↓">
              <button
                type="button"
                aria-label="Bajar velocidad"
                onClick={() => setMult((v) => ajustarMult(v, -0.1))}
                className={botonCtrl}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-16 text-center">{mult.toFixed(1)}x</span>
              <button
                type="button"
                aria-label="Subir velocidad"
                onClick={() => setMult((v) => ajustarMult(v, 0.1))}
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
              disabled={grabando || finalizando}
              className={`${botonCtrl} disabled:opacity-50`}
            >
              <X className="h-4 w-4" />
              Salir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

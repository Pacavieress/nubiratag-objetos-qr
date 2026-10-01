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
  Square,
  Trash2,
  Type,
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
const ASPECTO_DEFECTO = 16 / 9; // hasta que el video informa su tamaño real
const MAX_TOMAS = 5;
const LIMITE_DURACION_S = 18;
// Umbral de "ya hay voz" para medir el tiempo muerto inicial (dBFS, después
// de ganancia y limitador).
const UMBRAL_VOZ_DB = -40;
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

type Dispositivo = { id: string; label: string };
type Fase = "preparar" | "grabar";
type Modo = "completa" | "gancho";
type Archivo = { url: string; ext: string };
type Grabador = { recorder: MediaRecorder; fin: Promise<Archivo> };
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
};
type Sesion = {
  principal: Grabador;
  inicio: number;
  muertoMs: number | null;
  ultimaVoz: number | null; // performance.now() de la última voz detectada
  modo: Modo;
  orientacion: Orientacion;
  origen: Origen;
  camara: string;
};

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

type CadenaAudio = {
  ctx: AudioContext;
  gain: GainNode;
  analyser: AnalyserNode;
  destino: MediaStreamAudioDestinationNode;
};

// micrófono → ganancia → compresor (limitador suave) → destino.
// El analizador cuelga después del compresor: mide lo mismo que se graba.
function crearCadenaAudio(pista: MediaStream, ganancia: number): CadenaAudio {
  const ctx = new AudioContext();
  const gain = ctx.createGain();
  gain.gain.value = ganancia;

  const limitador = ctx.createDynamicsCompressor();
  limitador.threshold.value = -6;
  limitador.knee.value = 6;
  limitador.ratio.value = 12;
  limitador.attack.value = 0.003;
  limitador.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const destino = ctx.createMediaStreamDestination();

  ctx.createMediaStreamSource(pista).connect(gain);
  gain.connect(limitador);
  limitador.connect(analyser);
  limitador.connect(destino);
  void ctx.resume();
  return { ctx, gain, analyser, destino };
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

function nombreArchivo(ext: string, sufijo?: string): string {
  const d = new Date();
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
// un <video>); si no se puede medir, cae a getSettings().
async function abrirCamara(
  video: MediaTrackConstraints,
  audio: MediaTrackConstraints | false
) {
  const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
  const medido = await medirVideo(stream);
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
    let r: Awaited<ReturnType<typeof abrirCamara>>;
    try {
      r = await abrirCamara(intentos[i], audio);
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
    abierto = await abrirCamara(intentos[indiceAbierto], audio);
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

function detenerRecorder(recorder: MediaRecorder) {
  if (recorder.state !== "inactive") recorder.stop();
}

// Un MediaRecorder cuyo resultado llega como promesa de blob URL.
function crearGrabador(stream: MediaStream, mimeType: string): Grabador {
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    audioBitsPerSecond: 192000,
    videoBitsPerSecond: 8000000,
  });
  const trozos: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) trozos.push(e.data);
  };
  const fin = new Promise<Archivo>((resolve) => {
    recorder.onstop = () => {
      const tipo = recorder.mimeType || mimeType || "video/webm";
      resolve({
        url: URL.createObjectURL(new Blob(trozos, { type: tipo })),
        ext: tipo.includes("mp4") ? "mp4" : "webm",
      });
    };
  });
  recorder.start(1000);
  return { recorder, fin };
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
  const [ganancia, setGanancia] = useState(3);

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
  const [enResultado, setEnResultado] = useState(false);

  const cargadoRef = useRef(false);
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
        if (typeof d.ganancia === "number")
          setGanancia(
            Math.min(GANANCIA_MAX, Math.max(GANANCIA_MIN, d.ganancia))
          );
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
        })
      );
    } catch {
      // Sin persistencia: no es crítico.
    }
  }, [
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
      cadena.destino.stream.getTracks().forEach((t) => t.stop());
      void cadena.ctx.close();
    }
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

    (async () => {
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

    return () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      if (cadena) {
        if (cadenaRef.current === cadena) cadenaRef.current = null;
        void cadena.ctx.close();
      }
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
    let stream: MediaStream | null = null;

    (async () => {
      setMidiendo(true);
      orientacionAbiertaRef.current = orientacionActual();
      try {
        const abierta = await abrirCamaraVertical(
          camaraId,
          false,
          () => cancelado
        );
        stream = abierta?.stream ?? null;
        if (abierta && !cancelado)
          setLectura(
            leerCamara(abierta.stream, abierta.video, abierta.intentos)
          );
      } catch {
        // Sin lectura: no es crítico (el error real sale al grabar).
      } finally {
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        if (!cancelado) setMidiendo(false);
      }
    })();

    return () => {
      cancelado = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [fase, hayCamaras, camaraId, medirTick]);

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
        orientacionAbiertaRef.current = orientacionActual();
        const abierta = await abrirCamaraVertical(
          camaraId,
          restriccionesAudio(microfonoId, procesarAudio),
          () => cancelado
        );
        if (!abierta) return;
        const stream = abierta.stream;
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLectura(leerCamara(stream, abierta.video, abierta.intentos));
        streamRef.current = stream;
        cadenaRef.current = crearCadenaAudio(
          new MediaStream(stream.getAudioTracks()),
          gananciaRef.current
        );
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
      // Cada adquisición vuelve a medir el video y a intentar el canvas.
      setCamaraDim(null);
      setCanvasFallo(false);
      setAvisoVertical(null);
      canvasFalloRef.current = false;
    };
    // camaraId/microfonoId se fijan al iniciar; no deben re-adquirir el stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, intento, detenerStream]);

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
      if (sesionRef.current || conteo !== null) return;
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
  // tiempo muerto final.
  useEffect(() => {
    if (!grabando) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    const analyser = cadenaRef.current?.analyser;
    const datos = analyser ? new Uint8Array(analyser.fftSize) : null;
    const medidor = setInterval(() => {
      const s = sesionRef.current;
      if (!s || !analyser || !datos) return;
      if (nivelDb(analyser, datos) > UMBRAL_VOZ_DB) {
        const ahora = performance.now();
        s.ultimaVoz = ahora;
        if (s.muertoMs === null) s.muertoMs = Math.round(ahora - s.inicio);
      }
    }, 20);
    return () => {
      clearInterval(id);
      clearInterval(medidor);
    };
  }, [grabando]);

  // Arranque: el recorder y el scroll se disparan en el mismo handler (un
  // solo batch de React), sin pausa entre el clic/cuenta y el guion.
  const empezarGrabacion = useCallback(() => {
    const cadena = cadenaRef.current;
    const directo = streamRef.current;
    if (!directo || !cadena) return;
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
      try {
        principal = crearGrabador(paraGrabar, elegirMimeType());
        fuente = f;
        break;
      } catch {
        // Se prueba la siguiente fuente.
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
    sesionRef.current = {
      principal,
      inicio: performance.now(),
      muertoMs: null,
      ultimaVoz: null,
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
  }, [modo]);

  // Cierra el recorder y arma la toma cuando el blob está listo. Sirve para
  // el corte manual y para el automático; el tiempo muerto final es el que
  // hay entre la última voz y este momento.
  const terminarGrabacion = useCallback(() => {
    const s = sesionRef.current;
    if (!s) return;
    sesionRef.current = null;
    setGrabando(false);
    setScrolling(false);
    setFinScroll(null);
    detenerRecorder(s.principal.recorder);
    const ahora = performance.now();
    const duracion = Math.round((ahora - s.inicio) / 1000);
    const muertoFinalMs =
      s.ultimaVoz !== null ? Math.round(ahora - s.ultimaVoz) : null;
    void s.principal.fin.then((archivo) => {
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
      };
      setTomas((prev) => [...prev, toma]);
      setTomaId(id);
      setEnResultado(true);
      detenerStream();
    });
  }, [detenerStream]);

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

  function alternarGrabacion() {
    if (grabando) {
      terminarGrabacion();
      return;
    }
    if (conteo !== null) {
      // Cancelar cuenta regresiva.
      if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
      setConteo(null);
      return;
    }
    if (cuentaSeg === 0) {
      empezarGrabacion();
      return;
    }
    let n = cuentaSeg;
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
    activoRef.current = 0;
    setBloqueActivo(0);
    setFinScroll(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    calcularActivo();
  }

  // Corta la sesión en curso sin crear toma y libera sus blobs.
  const descartarSesion = useCallback(() => {
    const s = sesionRef.current;
    sesionRef.current = null;
    if (!s) return;
    detenerRecorder(s.principal.recorder);
    void s.principal.fin.then((a) => URL.revokeObjectURL(a.url));
  }, []);

  function liberarToma(t: Toma) {
    URL.revokeObjectURL(t.url);
  }

  function limpiarEstadoGrabacion() {
    if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
    descartarSesion();
    detenerStream();
    setConteo(null);
    setGrabando(false);
    setScrolling(false);
    setErrorGrabar(null);
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
    setScrolling(false);
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
    activoRef.current = 0;
    setBloqueActivo(0);
    setModo("completa");
    setSegundos(0);
    setErrorGrabar(null);
    setFase("grabar");
  }

  // Liberar todo al salir de la pantalla.
  useEffect(() => {
    return () => {
      if (conteoTimerRef.current) clearInterval(conteoTimerRef.current);
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
  const botonPrimario =
    "flex h-11 items-center gap-2 rounded-xl bg-[#54A6D8] px-5 text-sm font-semibold text-white hover:bg-[#4394c4]";

  return (
    <div className="absolute inset-0 overflow-hidden overscroll-none bg-black pt-[env(safe-area-inset-top,0px)] text-white">
      {enResultado && tomaSel ? (
        <div className="flex h-full flex-col items-center gap-4 overflow-y-auto overscroll-contain p-4">
          <video
            key={tomaSel.id}
            src={tomaSel.url}
            controls
            playsInline
            className="max-h-[55svh] max-w-full rounded-xl"
            onLoadedMetadata={(e) => {
              const { videoWidth, videoHeight } = e.currentTarget;
              if (videoWidth > 0 && videoHeight > 0)
                setResoluciones((prev) => ({
                  ...prev,
                  [tomaSel.id]: `${videoWidth}×${videoHeight}`,
                }));
            }}
          />

          <div className="flex flex-wrap justify-center gap-2">
            {tomas.map((t, i) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={t.id === tomaSel.id}
                onClick={() => setTomaId(t.id)}
                className={`h-9 rounded-full px-4 text-sm font-medium transition ${
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

          <p className="text-center text-sm text-white/80">
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
          <p className="text-center text-xs text-white/70">
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

          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={tomaSel.url}
              download={nombreArchivo(
                tomaSel.ext,
                `toma-${tomas.indexOf(tomaSel) + 1}${tomaSel.modo === "gancho" ? "-gancho" : ""}`
              )}
              className={botonPrimario}
            >
              <Download className="h-4 w-4" />
              Descargar toma
            </a>
            <button
              type="button"
              onClick={() => regrabar("gancho")}
              disabled={tomasLlenas}
              className={`${botonCtrl} disabled:opacity-50`}
            >
              <RotateCcw className="h-4 w-4" />
              Regrabar gancho
            </button>
            <button
              type="button"
              onClick={() => regrabar("completa")}
              disabled={tomasLlenas}
              className={`${botonCtrl} disabled:opacity-50`}
            >
              <RotateCcw className="h-4 w-4" />
              Grabar de nuevo
            </button>
            <button
              type="button"
              onClick={() => descartarToma(tomaSel.id)}
              className={botonCtrl}
            >
              <Trash2 className="h-4 w-4" />
              Descartar
            </button>
            <button type="button" onClick={cerrarTodo} className={botonCtrl}>
              <X className="h-4 w-4" />
              Cerrar
            </button>
          </div>
          {tomasLlenas && (
            <p className="text-center text-xs text-white/70">
              Máximo {MAX_TOMAS} tomas en memoria: descarta una para grabar otra.
            </p>
          )}
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
              REC {formatoTiempo(segundos)} ·{" "}
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
          </div>

          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={alternarGrabacion}
              disabled={
                !listo || camaraDim === null || (!grabando && tomasLlenas)
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
              disabled={grabando}
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

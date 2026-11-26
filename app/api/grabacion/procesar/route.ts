import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { setPriority, tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as StreamWebNode } from "node:stream/web";

import { auth } from "@/lib/auth";

// Convierte una toma del teleprompter a un MP4 listo para TikTok.
//
// Esta ruta queda fuera del matcher de proxy.ts a propósito: cuando Proxy
// aplica, Next copia el body en memoria y lo trunca en 10 MB (ver
// experimental.proxyClientMaxBodySize). La autorización se resuelve aquí.

export const runtime = "nodejs";

const MAX_BYTES = 300 * 1024 * 1024;
const TIMEOUT_SUBIDA_MS = 5 * 60 * 1000;
const TIMEOUT_FFMPEG_MS = 5 * 60 * 1000;
const MAX_STDERR = 4000; // caracteres de stderr que se conservan
const LINEAS_LOG = 15;
const CARPETA = join(tmpdir(), "nubiratag-videos");

// Extensión del temporal y demuxer de ffmpeg según el Content-Type.
const TIPOS: Record<string, { ext: string; demuxer: string }> = {
  "video/mp4": { ext: "mp4", demuxer: "mov" },
  "video/webm": { ext: "webm", demuxer: "matroska" },
};

// Un solo proceso a la vez (por proceso de Node).
let ocupado = false;

class ErrorTamano extends Error {}

function error(status: number, mensaje: string, cabeceras?: HeadersInit) {
  return Response.json({ error: mensaje }, { status, headers: cabeceras });
}

const demasiadoGrande = () =>
  error(413, "El video supera el máximo de 300 MB.");

async function borrar(ruta: string) {
  try {
    await rm(ruta, { force: true, maxRetries: 3 });
  } catch (e) {
    console.error(
      "[grabacion] no se pudo borrar un temporal:",
      (e as NodeJS.ErrnoException).code
    );
  }
}

// Nombre de descarga seguro: <original>_tiktok.mp4.
function nombreSalida(original: string | null): string {
  const base = (original ?? "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .slice(0, 80);
  return `${base || "grabacion"}_tiktok.mp4`;
}

// Escribe el body en disco a medida que llega. Devuelve los bytes escritos.
async function guardarBody(
  body: ReadableStream<Uint8Array>,
  destino: string,
  signal: AbortSignal
): Promise<number> {
  let bytes = 0;
  const limite = new Transform({
    transform(trozo: Buffer, _codificacion, listo) {
      bytes += trozo.length;
      if (bytes > MAX_BYTES) listo(new ErrorTamano());
      else listo(null, trozo);
    },
  });
  await pipeline(
    Readable.fromWeb(body as StreamWebNode<Uint8Array>),
    limite,
    createWriteStream(destino),
    { signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_SUBIDA_MS)]) }
  );
  return bytes;
}

type ResultadoFfmpeg = {
  codigo: number | null;
  motivo: "fin" | "timeout" | "cancelado";
  stderr: string;
};

// Termina cuando el proceso ya cerró (también si hubo que matarlo).
function ejecutarFfmpeg(
  args: string[],
  signal: AbortSignal
): Promise<ResultadoFfmpeg> {
  return new Promise((resolve) => {
    let stderr = "";
    let motivo: ResultadoFfmpeg["motivo"] = "fin";
    // La ruta del binario es del servidor: turbopackIgnore evita que el build
    // intente incluir todo el proyecto como dependencia de esta ruta.
    const proceso = spawn(
      /*turbopackIgnore: true*/ process.env.FFMPEG_PATH || "ffmpeg",
      args,
      { shell: false, stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
    );
    // Menor prioridad para no quitarle CPU a la app mientras codifica. Sin pid
    // no se pudo lanzar y no hay proceso al que cambiarle la prioridad.
    if (proceso.pid !== undefined) {
      try {
        setPriority(proceso.pid, 10);
      } catch (e) {
        console.error(
          "[grabacion] no se pudo bajar la prioridad de ffmpeg:",
          (e as NodeJS.ErrnoException).code ?? (e as Error).name
        );
      }
    }
    const matar = (porque: ResultadoFfmpeg["motivo"]) => {
      motivo = porque;
      proceso.kill("SIGKILL");
    };
    const timer = setTimeout(() => matar("timeout"), TIMEOUT_FFMPEG_MS);
    const cancelar = () => matar("cancelado");
    signal.addEventListener("abort", cancelar, { once: true });
    if (signal.aborted) cancelar();

    const terminar = (codigo: number | null) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancelar);
      resolve({ codigo, motivo, stderr });
    };
    proceso.stderr.setEncoding("utf8");
    proceso.stderr.on("data", (texto: string) => {
      stderr = (stderr + texto).slice(-MAX_STDERR);
    });
    // "error": no se pudo lanzar (p. ej. ffmpeg no está instalado).
    proceso.on("error", (e: NodeJS.ErrnoException) => {
      stderr += `\nNo se pudo ejecutar ffmpeg: ${e.code}`;
      if (proceso.pid === undefined) terminar(null);
    });
    proceso.on("close", terminar);
  });
}

export async function POST(request: Request) {
  // Misma regla que requireSuperAdmin(), respondiendo JSON sin redirigir.
  const session = await auth();
  if (!session?.user) return error(401, "Inicia sesión para procesar videos.");
  if (session.user.rol !== "superadmin")
    return error(403, "Solo un superadmin puede procesar videos.");

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!Object.hasOwn(TIPOS, contentType))
    return error(415, "Formato no admitido: solo video/mp4 o video/webm.");
  const tipo = TIPOS[contentType];
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES)
    return demasiadoGrande();
  if (!request.body) return error(400, "No llegó ningún video.");

  if (ocupado)
    return error(
      429,
      "Ya se está procesando otro video. Espera a que termine y reintenta.",
      { "Retry-After": "60" }
    );
  ocupado = true;

  const id = randomUUID();
  const entrada = join(CARPETA, `${id}.${tipo.ext}`);
  const salida = join(CARPETA, `${id}_tiktok.mp4`);
  // true cuando la salida pasa a manos de la respuesta, que la borra.
  let entregada = false;

  try {
    await mkdir(CARPETA, { recursive: true });

    let bytes: number;
    try {
      bytes = await guardarBody(request.body, entrada, request.signal);
    } catch (e) {
      if (e instanceof ErrorTamano) return demasiadoGrande();
      return error(400, "La subida se interrumpió.");
    }
    if (bytes === 0) return error(400, "El video llegó vacío.");

    const resultado = await ejecutarFfmpeg(
      [
        "-hide_banner",
        "-nostdin",
        "-y",
        // El archivo subido solo puede leerse como el contenedor declarado y
        // no puede hacer que ffmpeg abra URLs u otros protocolos.
        "-protocol_whitelist",
        "file",
        "-f",
        tipo.demuxer,
        "-i",
        entrada,
        "-af",
        "pan=stereo|c0=c0|c1=c0,highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=11",
        "-vf",
        "scale=in_range=pc:out_range=tv,format=yuv420p,fps=30",
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        // Hilos de codificación acotados (el servidor comparte CPU).
        "-threads",
        process.env.FFMPEG_THREADS || "2",
        salida,
      ],
      request.signal
    );

    if (resultado.motivo === "cancelado")
      return error(400, "Procesamiento cancelado.");
    if (resultado.motivo === "timeout" || resultado.codigo !== 0) {
      console.error(
        `[grabacion] ffmpeg salió con código ${resultado.codigo}\n${resultado.stderr
          .split(/[\r\n]+/)
          .filter(Boolean)
          .slice(-LINEAS_LOG)
          .join("\n")}`
      );
      return resultado.motivo === "timeout"
        ? error(504, "El procesamiento superó los 5 minutos y se canceló.")
        : error(500, "El servidor no pudo procesar el video.");
    }

    const { size } = await stat(salida);
    if (request.signal.aborted)
      return error(400, "Procesamiento cancelado.");

    const lectura = createReadStream(salida);
    const cortar = () => lectura.destroy();
    request.signal.addEventListener("abort", cortar, { once: true });
    // "close" llega al terminar de enviar, si falla la lectura y si el
    // cliente se desconecta.
    lectura.once("close", () => {
      request.signal.removeEventListener("abort", cortar);
      void borrar(salida);
    });
    entregada = true;

    return new Response(Readable.toWeb(lectura) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${nombreSalida(
          new URL(request.url).searchParams.get("nombre")
        )}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(
      "[grabacion] error al procesar:",
      (e as NodeJS.ErrnoException).code ?? (e as Error).name
    );
    return error(500, "El servidor no pudo procesar el video.");
  } finally {
    ocupado = false;
    await borrar(entrada);
    if (!entregada) await borrar(salida);
  }
}

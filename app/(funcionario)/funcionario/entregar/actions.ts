"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notificarRetiro } from "@/lib/notificaciones";
import { extraerToken } from "@/lib/qr";

// Mismo patrón que requireFuncionario en el resto del panel.
async function requireFuncionario(): Promise<{
  id: number;
  colegioId: number;
}> {
  const session = await auth();
  if (
    !session?.user ||
    session.user.rol !== "funcionario" ||
    session.user.colegioId == null
  ) {
    throw new Error("No autorizado.");
  }
  return { id: Number(session.user.id), colegioId: session.user.colegioId };
}

// Rate limit simple en memoria, por funcionario — capa 1, alcanza para un
// solo proceso PM2 sin cluster. Si algún día se corre en más de una
// instancia, esto necesita moverse a un store compartido (Redis).
//
// Limitación consciente (a): este rate limit solo protege buscarPorCodigo
// (adivinar el código de retiro). confirmarCalce y entregarObjeto no lo
// necesitan además: ambos exigen tener el QR físico de la prenda en mano
// (confirmarCalce revalida el token escaneado contra el hallazgo, y
// entregarObjeto vuelve a exigir y revalidar ese mismo token antes de
// marcar el retiro) — no hay forma de fuerza bruta esos dos pasos sin el
// objeto real.
const INTENTOS_MAXIMOS = 8;
const VENTANA_INTENTOS_MS = 10 * 60 * 1000;
const intentosPorFuncionario = new Map<
  number,
  { intentos: number; desde: number }
>();

function registrarIntento(funcionarioId: number): boolean {
  const ahora = Date.now();
  const registro = intentosPorFuncionario.get(funcionarioId);

  if (!registro || ahora - registro.desde > VENTANA_INTENTOS_MS) {
    intentosPorFuncionario.set(funcionarioId, { intentos: 1, desde: ahora });
    return true;
  }
  if (registro.intentos >= INTENTOS_MAXIMOS) return false;

  registro.intentos += 1;
  return true;
}

function limpiarIntentos(funcionarioId: number) {
  intentosPorFuncionario.delete(funcionarioId);
}

export type ResultadoBusqueda =
  | {
      ok: true;
      hallazgoId: number;
      etiqueta: string | null;
      ubicacion: string;
      fecha: string;
    }
  | { ok: false; error: string };

// Sin nombres: solo lo mínimo para que el funcionario confirme que es el
// objeto correcto antes de escanear el calce.
export async function buscarPorCodigo(
  _prevState: ResultadoBusqueda | undefined,
  formData: FormData
): Promise<ResultadoBusqueda> {
  const funcionario = await requireFuncionario();

  if (!registrarIntento(funcionario.id)) {
    return {
      ok: false,
      error: "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
    };
  }

  const codigo = String(formData.get("codigo") ?? "")
    .trim()
    .toUpperCase();
  if (!codigo) {
    return { ok: false, error: "Ingresa el código de retiro." };
  }

  const hallazgo = await prisma.hallazgo.findUnique({
    where: { codigoRetiro: codigo },
    include: { qrCodigo: true, ubicacion: true },
  });

  // Mismo criterio de siempre: un solo mensaje genérico, sin distinguir
  // "no existe" de "es de otro colegio" o "ya no está abierto".
  if (
    !hallazgo ||
    hallazgo.qrCodigo.colegioId !== funcionario.colegioId ||
    hallazgo.estado !== "reportado"
  ) {
    return { ok: false, error: "Código no válido." };
  }

  limpiarIntentos(funcionario.id);

  return {
    ok: true,
    hallazgoId: hallazgo.id,
    etiqueta: hallazgo.qrCodigo.etiqueta,
    ubicacion: hallazgo.ubicacion.nombre,
    fecha: hallazgo.createdAt.toISOString(),
  };
}

export type ResultadoCalce = { ok: true } | { ok: false; error: string };

// Confirma que el QR escaneado es el mismo del hallazgo ya identificado
// por código. No expone nada del QR más allá de si coincide o no.
export async function confirmarCalce(
  hallazgoId: number,
  tokenEscaneado: string
): Promise<ResultadoCalce> {
  const funcionario = await requireFuncionario();

  const hallazgo = await prisma.hallazgo.findUnique({
    where: { id: hallazgoId },
    include: { qrCodigo: true },
  });

  if (
    !hallazgo ||
    hallazgo.qrCodigo.colegioId !== funcionario.colegioId ||
    hallazgo.estado !== "reportado"
  ) {
    return { ok: false, error: "Este retiro ya no está disponible." };
  }

  const token = extraerToken(tokenEscaneado);

  if (token !== hallazgo.qrCodigo.token) {
    return { ok: false, error: "Esta prenda no corresponde a este retiro." };
  }

  return { ok: true };
}

export type ResultadoEntrega = { ok: true } | { ok: false; error: string };

// El calce no depende de lo que haya decidido la UI: entregarObjeto vuelve
// a exigir el token escaneado y lo revalida acá adentro contra el QR real
// del hallazgo antes de marcar el retiro, igual que confirmarCalce.
export async function entregarObjeto(
  hallazgoId: number,
  tokenEscaneado: string
): Promise<ResultadoEntrega> {
  const funcionario = await requireFuncionario();

  const hallazgo = await prisma.hallazgo.findUnique({
    where: { id: hallazgoId },
    include: {
      qrCodigo: {
        include: {
          estudiante: { include: { apoderado: true } },
          colegio: true,
        },
      },
      ubicacion: true,
    },
  });

  if (!hallazgo || hallazgo.qrCodigo.colegioId !== funcionario.colegioId) {
    return { ok: false, error: "Este retiro ya no está disponible." };
  }

  // Idempotencia: doble toque, u otro funcionario ya lo entregó mientras
  // tanto — no cambia nada ni reenvía el correo, solo avisa.
  if (hallazgo.estado === "retirado") {
    return { ok: false, error: "Este objeto ya fue entregado." };
  }
  if (hallazgo.estado !== "reportado") {
    return { ok: false, error: "Este retiro ya no está disponible." };
  }

  const token = extraerToken(tokenEscaneado);
  if (token !== hallazgo.qrCodigo.token) {
    return { ok: false, error: "Esta prenda no corresponde a este retiro." };
  }

  const actualizado = await prisma.hallazgo.update({
    where: { id: hallazgoId },
    data: {
      estado: "retirado",
      retiradoAt: new Date(),
      retiradoPorId: funcionario.id,
    },
  });

  await notificarRetiro(hallazgoId, hallazgo, actualizado.retiradoAt!);

  revalidatePath("/funcionario/hallazgos");
  revalidatePath(`/apoderado/estudiantes/${hallazgo.qrCodigo.estudianteId}`);

  return { ok: true };
}

// Doble del botón de 10s en la UI, como margen por latencia de red.
const VENTANA_DESHACER_MS = 30_000;

// Limitación consciente (b): deshacer solo revierte el estado del
// hallazgo (vuelve a "reportado", limpia retiradoAt/retiradoPorId). NO
// revierte ni avisa que se deshizo el correo de retiro que ya se envió
// al apoderado si el envío alcanzó a salir — ese correo ya salió y no
// hay forma de "desenviarlo". Aceptable para capa 1: la ventana de 10s
// en la UI (30s de margen acá) busca cubrir el caso de un toque
// equivocado inmediato, no un arrepentimiento tardío.
export async function deshacerEntrega(
  hallazgoId: number
): Promise<ResultadoEntrega> {
  const funcionario = await requireFuncionario();

  const hallazgo = await prisma.hallazgo.findUnique({
    where: { id: hallazgoId },
    include: { qrCodigo: true },
  });

  if (!hallazgo || hallazgo.qrCodigo.colegioId !== funcionario.colegioId) {
    return { ok: false, error: "Este retiro ya no está disponible." };
  }

  if (
    hallazgo.estado !== "retirado" ||
    hallazgo.retiradoPorId !== funcionario.id ||
    !hallazgo.retiradoAt ||
    Date.now() - hallazgo.retiradoAt.getTime() > VENTANA_DESHACER_MS
  ) {
    return { ok: false, error: "Ya no se puede deshacer esta entrega." };
  }

  await prisma.hallazgo.update({
    where: { id: hallazgoId },
    data: { estado: "reportado", retiradoAt: null, retiradoPorId: null },
  });

  revalidatePath("/funcionario/hallazgos");
  revalidatePath(`/apoderado/estudiantes/${hallazgo.qrCodigo.estudianteId}`);

  return { ok: true };
}

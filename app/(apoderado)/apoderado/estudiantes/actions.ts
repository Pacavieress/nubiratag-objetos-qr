"use server";

import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generarToken } from "@/lib/qr";

// Estas Server Actions son, en los hechos, endpoints HTTP públicos (mismo
// principio que ya aplicamos en Etapas 3-4): proxy.ts protege /apoderado/**
// exigiendo rol apoderado, pero cada acción vuelve a comprobarlo acá
// adentro, sin confiar únicamente en esa capa.
async function requireApoderado(): Promise<{ id: number; colegioId: number }> {
  const session = await auth();

  if (
    !session?.user ||
    session.user.rol !== "apoderado" ||
    session.user.colegioId == null
  ) {
    throw new Error("No autorizado.");
  }

  return { id: Number(session.user.id), colegioId: session.user.colegioId };
}

// [CRÍTICO DE SEGURIDAD] Aislamiento por dueño (punto 9 del spec): un
// apoderado nunca puede operar sobre un estudiante de otro apoderado, ni
// aunque adivine o enumere IDs. notFound() en vez de un error explícito
// para no confirmar siquiera que el ID corresponde a un estudiante real
// de otro apoderado.
async function verificarPropiedadEstudiante(
  estudianteId: number,
  apoderadoId: number
) {
  const estudiante = await prisma.estudiante.findUnique({
    where: { id: estudianteId },
  });

  if (!estudiante || estudiante.apoderadoId !== apoderadoId) {
    notFound();
  }

  return estudiante;
}

function leerCamposEstudiante(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const cursoRaw = String(formData.get("curso") ?? "").trim();

  if (!nombre) {
    throw new Error("El nombre del estudiante es obligatorio.");
  }

  return { nombre, curso: cursoRaw || null };
}

export async function crearEstudiante(formData: FormData) {
  const apoderado = await requireApoderado();
  const datos = leerCamposEstudiante(formData);

  const estudiante = await prisma.estudiante.create({
    data: {
      ...datos,
      apoderadoId: apoderado.id,
      colegioId: apoderado.colegioId,
    },
  });

  revalidatePath("/apoderado/estudiantes");
  redirect(`/apoderado/estudiantes/${estudiante.id}`);
}

export async function actualizarEstudiante(
  estudianteId: number,
  formData: FormData
) {
  const apoderado = await requireApoderado();
  await verificarPropiedadEstudiante(estudianteId, apoderado.id);

  const datos = leerCamposEstudiante(formData);

  await prisma.estudiante.update({
    where: { id: estudianteId },
    data: datos,
  });

  revalidatePath("/apoderado/estudiantes");
  revalidatePath(`/apoderado/estudiantes/${estudianteId}`);
}

/**
 * Baja lógica. No revoca en cascada los QR del estudiante: el token sigue
 * existiendo, pero deja de resolver a un hallazgo válido. La Etapa 3
 * (escaneo público) debe verificar `estudiante.activo` además del
 * `estado` del propio qr_codigo antes de permitir registrar un hallazgo.
 */
export async function cambiarActivoEstudiante(
  estudianteId: number,
  activo: boolean
) {
  const apoderado = await requireApoderado();
  await verificarPropiedadEstudiante(estudianteId, apoderado.id);

  await prisma.estudiante.update({
    where: { id: estudianteId },
    data: { activo },
  });

  revalidatePath("/apoderado/estudiantes");
  revalidatePath(`/apoderado/estudiantes/${estudianteId}`);
}

const MAX_INTENTOS_TOKEN = 5;

/** Crea un qr_codigo con un token único, reintentando ante una colisión
 * (prácticamente imposible con 128 bits, pero no debe crashear crudo). */
async function crearQrConTokenUnico(
  estudianteId: number,
  colegioId: number,
  etiqueta: string
) {
  for (let intento = 1; intento <= MAX_INTENTOS_TOKEN; intento++) {
    const token = generarToken();
    try {
      return await prisma.qrCodigo.create({
        data: { estudianteId, colegioId, token, etiqueta },
      });
    } catch (error) {
      const esColisionDeToken =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.includes("token");

      if (!esColisionDeToken) {
        throw error;
      }
      // Colisión de token (astronómicamente improbable con 128 bits):
      // reintenta con un token nuevo en vez de propagar el error crudo.
    }
  }

  throw new Error(
    `No se pudo generar un token de QR único tras ${MAX_INTENTOS_TOKEN} intentos.`
  );
}

// Un QR = un objeto: se genera de a uno, con etiqueta obligatoria a nivel
// de aplicación (ej. "Mochila", "Chaqueta"). El schema deja `etiqueta`
// nullable a propósito (no se toca) porque QR generados antes de este
// cambio, o editados después, pueden quedar sin ella — pero acá, al
// crear, siempre se exige.
export async function generarQrCode(estudianteId: number, formData: FormData) {
  const apoderado = await requireApoderado();
  const estudiante = await verificarPropiedadEstudiante(
    estudianteId,
    apoderado.id
  );

  const etiqueta = String(formData.get("etiqueta") ?? "").trim();
  if (!etiqueta) {
    throw new Error("La etiqueta del objeto es obligatoria.");
  }

  await crearQrConTokenUnico(estudianteId, estudiante.colegioId, etiqueta);

  revalidatePath(`/apoderado/estudiantes/${estudianteId}`);
}

export type EstadoGuardadoEtiqueta = { guardado: boolean } | undefined;

// Firma (qrId, prevState, formData) en vez de (qrId, formData): el
// componente cliente la usa con useActionState para poder mostrar
// "Guardando..."/"Guardado" como confirmación explícita, no solo el
// remonte del input vía key.
export async function actualizarEtiquetaQr(
  qrId: number,
  _prevState: EstadoGuardadoEtiqueta,
  formData: FormData
): Promise<EstadoGuardadoEtiqueta> {
  const apoderado = await requireApoderado();

  const qr = await prisma.qrCodigo.findUnique({
    where: { id: qrId },
    include: { estudiante: true },
  });

  if (!qr || qr.estudiante.apoderadoId !== apoderado.id) {
    notFound();
  }

  const etiqueta = String(formData.get("etiqueta") ?? "").trim() || null;

  const actualizado = await prisma.qrCodigo.update({
    where: { id: qrId },
    data: { etiqueta },
  });

  revalidatePath(`/apoderado/estudiantes/${actualizado.estudianteId}`);

  return { guardado: true };
}

export async function revocarQr(qrId: number) {
  const apoderado = await requireApoderado();

  const qr = await prisma.qrCodigo.findUnique({
    where: { id: qrId },
    include: { estudiante: true },
  });

  if (!qr || qr.estudiante.apoderadoId !== apoderado.id) {
    notFound();
  }

  const actualizado = await prisma.qrCodigo.update({
    where: { id: qrId },
    data: { estado: "revocado" },
  });

  revalidatePath(`/apoderado/estudiantes/${actualizado.estudianteId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { generarToken } from "@/lib/qr";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function leerCamposEstudiante(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const curso = String(formData.get("curso") ?? "").trim();
  const apoderadoNombre = String(formData.get("apoderadoNombre") ?? "").trim();
  const apoderadoEmail = String(formData.get("apoderadoEmail") ?? "").trim();
  const apoderadoTelefonoRaw = String(
    formData.get("apoderadoTelefono") ?? ""
  ).trim();

  if (!nombre || !curso || !apoderadoNombre || !apoderadoEmail) {
    throw new Error(
      "Nombre, curso, apoderado y email del apoderado son obligatorios."
    );
  }

  if (!EMAIL_RE.test(apoderadoEmail)) {
    throw new Error("El email del apoderado no es válido.");
  }

  return {
    nombre,
    curso,
    apoderadoNombre,
    apoderadoEmail,
    apoderadoTelefono: apoderadoTelefonoRaw || null,
  };
}

export async function crearEstudiante(formData: FormData) {
  const datos = leerCamposEstudiante(formData);

  const estudiante = await prisma.estudiante.create({ data: datos });

  revalidatePath("/admin/estudiantes");
  redirect(`/admin/estudiantes/${estudiante.id}`);
}

export async function actualizarEstudiante(
  estudianteId: number,
  formData: FormData
) {
  const datos = leerCamposEstudiante(formData);

  await prisma.estudiante.update({
    where: { id: estudianteId },
    data: datos,
  });

  revalidatePath("/admin/estudiantes");
  revalidatePath(`/admin/estudiantes/${estudianteId}`);
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
  await prisma.estudiante.update({
    where: { id: estudianteId },
    data: { activo },
  });

  revalidatePath("/admin/estudiantes");
  revalidatePath(`/admin/estudiantes/${estudianteId}`);
}

const MAX_INTENTOS_TOKEN = 5;

/** Crea un qr_codigo con un token único, reintentando ante una colisión
 * (prácticamente imposible con 128 bits, pero no debe crashear crudo). */
async function crearQrConTokenUnico(estudianteId: number, etiqueta: string | null) {
  for (let intento = 1; intento <= MAX_INTENTOS_TOKEN; intento++) {
    const token = generarToken();
    try {
      return await prisma.qrCodigo.create({
        data: { estudianteId, token, etiqueta },
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

export async function generarQrCodes(estudianteId: number, formData: FormData) {
  const cantidadRaw = Number(formData.get("cantidad"));
  const cantidad =
    Number.isInteger(cantidadRaw) && cantidadRaw > 0 && cantidadRaw <= 50
      ? cantidadRaw
      : 5;

  for (let i = 0; i < cantidad; i++) {
    await crearQrConTokenUnico(estudianteId, null);
  }

  revalidatePath(`/admin/estudiantes/${estudianteId}`);
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
  const etiqueta = String(formData.get("etiqueta") ?? "").trim() || null;

  const qr = await prisma.qrCodigo.update({
    where: { id: qrId },
    data: { etiqueta },
  });

  revalidatePath(`/admin/estudiantes/${qr.estudianteId}`);

  return { guardado: true };
}

export async function revocarQr(qrId: number) {
  const qr = await prisma.qrCodigo.update({
    where: { id: qrId },
    data: { estado: "revocado" },
  });

  revalidatePath(`/admin/estudiantes/${qr.estudianteId}`);
}

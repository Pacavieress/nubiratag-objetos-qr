"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type EstadoRegistro =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

// Esta Server Action es, en los hechos, un endpoint HTTP público: que la
// página solo muestre el formulario con sesión no alcanza como protección
// (cualquiera podría invocarla directo). Por eso se revalida sesión y
// estado acá adentro, no solo se confía en lo que decidió el render.
export async function registrarHallazgo(
  qrCodigoId: number,
  _prevState: EstadoRegistro,
  formData: FormData
): Promise<EstadoRegistro> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      error: "Debes iniciar sesión para registrar un hallazgo.",
    };
  }

  // Revalidación fresca: el estado al momento de cargar la página puede
  // haber cambiado (QR revocado o estudiante dado de baja mientras tanto).
  const qr = await prisma.qrCodigo.findUnique({
    where: { id: qrCodigoId },
    include: { estudiante: true },
  });

  if (!qr || qr.estado !== "activo" || !qr.estudiante.activo) {
    return {
      ok: false,
      error: "Este código ya no es válido para registrar un hallazgo.",
    };
  }

  const ubicacionId = Number(formData.get("ubicacionId"));
  if (!Number.isInteger(ubicacionId) || ubicacionId <= 0) {
    return { ok: false, error: "Selecciona una ubicación válida." };
  }

  const ubicacion = await prisma.ubicacion.findUnique({
    where: { id: ubicacionId },
  });
  if (!ubicacion || !ubicacion.activo) {
    return { ok: false, error: "Selecciona una ubicación válida." };
  }

  const nota = String(formData.get("nota") ?? "").trim() || null;

  await prisma.hallazgo.create({
    data: {
      qrCodigoId: qr.id,
      ubicacionId,
      reportadoPor: Number(session.user.id),
      nota,
    },
  });

  revalidatePath(`/q/${qr.token}`);

  return { ok: true };
}

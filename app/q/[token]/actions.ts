"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Decisión de producto: /q/[token] dejó de ser pública. Solo funcionario
// logueado puede reportar hallazgos. Se usa redirect() (no notFound())
// para el caso "sin sesión / rol equivocado": el matcher de proxy.ts va
// por prefijo de ruta y /q/ no calza con /funcionario/**, así que esta
// función hace ese trabajo acá adentro, mismo patrón que
// requireFuncionario en /funcionario/hallazgos.
export async function requireFuncionario(): Promise<{
  id: number;
  colegioId: number;
}> {
  const session = await auth();

  if (
    !session?.user ||
    session.user.rol !== "funcionario" ||
    session.user.colegioId == null
  ) {
    redirect("/login");
  }

  return { id: Number(session.user.id), colegioId: session.user.colegioId };
}

export type EstadoRegistro =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

// Esta Server Action es, en los hechos, un endpoint HTTP: que la página
// solo muestre el formulario al funcionario correcto no alcanza como
// protección (cualquiera podría invocarla directo). Por eso se revalida
// sesión, rol y colegio acá adentro, no solo se confía en lo que decidió
// el render.
export async function registrarHallazgo(
  qrCodigoId: number,
  _prevState: EstadoRegistro,
  formData: FormData
): Promise<EstadoRegistro> {
  const funcionario = await requireFuncionario();

  // Revalidación fresca: el estado al momento de cargar la página puede
  // haber cambiado (QR revocado o estudiante dado de baja mientras
  // tanto).
  const qr = await prisma.qrCodigo.findUnique({
    where: { id: qrCodigoId },
    include: { estudiante: true },
  });

  // Regla de oro: el colegio se resuelve desde el QR, nunca desde la URL.
  // No se distingue "no existe" de "es de otro colegio" — mismo criterio
  // de no revelar que ya usaba el modelo anterior con "código no válido".
  if (!qr || qr.colegioId !== funcionario.colegioId) {
    notFound();
  }

  if (qr.estado !== "activo" || !qr.estudiante.activo) {
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

  // La ubicación tiene que ser del mismo colegio que el QR: ya se filtra
  // así en los botones de la UI, pero se revalida acá por si el
  // formulario se manipula directamente.
  if (
    !ubicacion ||
    !ubicacion.activo ||
    ubicacion.colegioId !== qr.colegioId
  ) {
    return { ok: false, error: "Selecciona una ubicación válida." };
  }

  // Sin nota: el funcionario solo toca la ubicación, no escribe nada
  // (decisión de producto — un solo toque, o toque + confirmar).
  await prisma.hallazgo.create({
    data: {
      qrCodigoId: qr.id,
      ubicacionId,
      reportadoPorId: funcionario.id,
    },
  });

  revalidatePath(`/q/${qr.token}`);

  return { ok: true };
}

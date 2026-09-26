"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// A diferencia de resolverAlcanceColegio (funcionario-actions.ts), estas
// dos acciones son exclusivas de admin de colegio — un superadmin no
// gestiona apoderados directamente (ver page.tsx: la sección solo
// muestra estos botones si !esSuperAdmin).
async function requireAdminDeColegio(): Promise<{ colegioId: number }> {
  const session = await auth();

  if (
    !session?.user ||
    session.user.rol !== "admin" ||
    session.user.colegioId == null
  ) {
    throw new Error("No autorizado.");
  }

  return { colegioId: session.user.colegioId };
}

async function verificarPropiedadApoderado(
  usuarioId: number,
  colegioId: number
) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

  // Mismo criterio que verificarPropiedadFuncionario: evita operar sobre
  // una cuenta que no sea apoderado o que sea de otro colegio, aunque
  // llegue un id ajeno a mano.
  if (
    !usuario ||
    usuario.rol !== "apoderado" ||
    usuario.colegioId !== colegioId
  ) {
    throw new Error("No autorizado.");
  }

  return usuario;
}

export async function cambiarActivoApoderado(
  usuarioId: number,
  activo: boolean
) {
  const { colegioId } = await requireAdminDeColegio();
  await verificarPropiedadApoderado(usuarioId, colegioId);

  await prisma.usuario.update({ where: { id: usuarioId }, data: { activo } });

  revalidatePath(`/admin/colegios/${colegioId}`);
}

// Elimina en cascada, de más dependiente a menos: notificaciones de los
// hallazgos de los QR de este apoderado, esos hallazgos, los QR, los
// estudiantes vinculados, y recién ahí el apoderado — todo dentro de una
// transacción para que sea atómico (si algo falla, no queda nada a
// medias). Todas estas FKs son RESTRICT por defecto en MySQL (sin
// onDelete en el schema), así que hay que borrar en este orden exacto.
export async function eliminarApoderado(usuarioId: number) {
  const { colegioId } = await requireAdminDeColegio();
  await verificarPropiedadApoderado(usuarioId, colegioId);

  await prisma.$transaction(async (tx) => {
    await tx.notificacion.deleteMany({
      where: {
        hallazgo: { qrCodigo: { estudiante: { apoderadoId: usuarioId } } },
      },
    });
    await tx.hallazgo.deleteMany({
      where: { qrCodigo: { estudiante: { apoderadoId: usuarioId } } },
    });
    await tx.qrCodigo.deleteMany({
      where: { estudiante: { apoderadoId: usuarioId } },
    });
    await tx.estudiante.deleteMany({ where: { apoderadoId: usuarioId } });
    await tx.usuario.delete({ where: { id: usuarioId } });
  });

  revalidatePath(`/admin/colegios/${colegioId}`);
}

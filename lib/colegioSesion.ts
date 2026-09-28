import { prisma } from "@/lib/db";

// Usado por los 3 layouts (apoderado/funcionario/admin) para mostrar el
// nombre del colegio en el header. colegioId es null para un superadmin
// (administra varios colegios, no tiene uno propio) — en ese caso no hay
// nada que mostrar, se devuelve null sin consultar la base.
export async function obtenerNombreColegioSesion(
  colegioId: number | null | undefined
): Promise<string | null> {
  if (colegioId == null) {
    return null;
  }

  const colegio = await prisma.colegio.findUnique({
    where: { id: colegioId },
    select: { nombre: true },
  });

  return colegio?.nombre ?? null;
}

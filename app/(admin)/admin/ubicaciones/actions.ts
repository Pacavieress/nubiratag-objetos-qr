"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Mismo patrón que requireFuncionario/requireApoderado en otras acciones:
// proxy.ts ya deja pasar admin y superadmin a /admin/**, acá se revalida
// y se resuelve el alcance (superadmin ve/opera todos los colegios, un
// admin de colegio solo el suyo).
async function resolverAlcanceColegio(): Promise<{
  esSuperAdmin: boolean;
  colegioId: number | null;
}> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.rol !== "admin" && session.user.rol !== "superadmin")
  ) {
    throw new Error("No autorizado.");
  }

  return {
    esSuperAdmin: session.user.rol === "superadmin",
    colegioId: session.user.colegioId,
  };
}

async function verificarPropiedadUbicacion(
  ubicacionId: number,
  alcance: { esSuperAdmin: boolean; colegioId: number | null }
) {
  if (alcance.esSuperAdmin) return;

  const ubicacion = await prisma.ubicacion.findUnique({
    where: { id: ubicacionId },
  });

  if (!ubicacion || ubicacion.colegioId !== alcance.colegioId) {
    throw new Error("No autorizado.");
  }
}

export async function crearUbicacion(formData: FormData) {
  const alcance = await resolverAlcanceColegio();
  const nombre = String(formData.get("nombre") ?? "").trim();

  if (!nombre) {
    throw new Error("El nombre de la ubicación es obligatorio.");
  }

  // El super admin elige el colegio por formulario (gestiona todos); un
  // admin de colegio siempre opera sobre el suyo, sin importar qué venga
  // en el formulario — igual que apoderado/funcionario en otras acciones.
  let colegioId: number;
  if (alcance.esSuperAdmin) {
    colegioId = Number(formData.get("colegioId"));
    if (!Number.isInteger(colegioId) || colegioId <= 0) {
      throw new Error("Selecciona un colegio válido.");
    }
    const colegio = await prisma.colegio.findUnique({
      where: { id: colegioId },
    });
    if (!colegio) {
      throw new Error("El colegio seleccionado no existe.");
    }
  } else {
    colegioId = alcance.colegioId!;
  }

  await prisma.ubicacion.create({ data: { nombre, colegioId } });

  revalidatePath("/admin/ubicaciones");
}

export type EstadoGuardadoUbicacion = { guardado: boolean } | undefined;

export async function actualizarNombreUbicacion(
  ubicacionId: number,
  _prevState: EstadoGuardadoUbicacion,
  formData: FormData
): Promise<EstadoGuardadoUbicacion> {
  const alcance = await resolverAlcanceColegio();
  await verificarPropiedadUbicacion(ubicacionId, alcance);

  const nombre = String(formData.get("nombre") ?? "").trim();

  if (!nombre) {
    return undefined;
  }

  await prisma.ubicacion.update({
    where: { id: ubicacionId },
    data: { nombre },
  });

  revalidatePath("/admin/ubicaciones");

  return { guardado: true };
}

export async function cambiarActivoUbicacion(
  ubicacionId: number,
  activo: boolean
) {
  const alcance = await resolverAlcanceColegio();
  await verificarPropiedadUbicacion(ubicacionId, alcance);

  await prisma.ubicacion.update({
    where: { id: ubicacionId },
    data: { activo },
  });

  revalidatePath("/admin/ubicaciones");
}

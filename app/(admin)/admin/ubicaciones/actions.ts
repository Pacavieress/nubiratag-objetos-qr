"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";

export async function crearUbicacion(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const colegioId = Number(formData.get("colegioId"));

  if (!nombre) {
    throw new Error("El nombre de la ubicación es obligatorio.");
  }

  if (!Number.isInteger(colegioId) || colegioId <= 0) {
    throw new Error("Selecciona un colegio válido.");
  }

  // El admin es global (no tiene colegioId propio) y administra ubicaciones
  // de cualquier colegio, así que acá sí hay que elegirlo explícitamente
  // por formulario — a diferencia de apoderado/funcionario, donde el
  // colegio siempre sale de la sesión.
  const colegio = await prisma.colegio.findUnique({
    where: { id: colegioId },
  });

  if (!colegio) {
    throw new Error("El colegio seleccionado no existe.");
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
  await prisma.ubicacion.update({
    where: { id: ubicacionId },
    data: { activo },
  });

  revalidatePath("/admin/ubicaciones");
}

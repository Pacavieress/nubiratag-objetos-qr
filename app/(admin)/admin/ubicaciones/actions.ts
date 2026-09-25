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

// Ahora siempre busca la fila (antes se saltaba el fetch para
// superadmin): además de verificar, el caller necesita el colegioId para
// revalidar /admin/colegios/[id]/mapa.
async function verificarPropiedadUbicacion(
  ubicacionId: number,
  alcance: { esSuperAdmin: boolean; colegioId: number | null }
) {
  const ubicacion = await prisma.ubicacion.findUnique({
    where: { id: ubicacionId },
  });

  if (!ubicacion) {
    throw new Error("No autorizado.");
  }
  if (!alcance.esSuperAdmin && ubicacion.colegioId !== alcance.colegioId) {
    throw new Error("No autorizado.");
  }

  return ubicacion;
}

async function verificarPropiedadColegio(
  colegioId: number,
  alcance: { esSuperAdmin: boolean; colegioId: number | null }
) {
  if (alcance.esSuperAdmin) return;

  if (colegioId !== alcance.colegioId) {
    throw new Error("No autorizado.");
  }
}

// Nominatim (OpenStreetMap) exige un User-Agent que identifique la app —
// no acepta el default de fetch, y no hay API key. Capa 1: si falla (red,
// rate limit, dirección no encontrada) no hay centro automático, pero
// nunca bloquea guardar la dirección.
export async function geocodificarDireccion(
  direccion: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", direccion);
    url.searchParams.set("limit", "1");

    const respuesta = await fetch(url, {
      headers: { "User-Agent": "NubiraTag/1.0 (contacto@nubira.cl)" },
    });

    if (!respuesta.ok) return null;

    const resultados = (await respuesta.json()) as Array<{
      lat: string;
      lon: string;
    }>;

    const primero = resultados[0];
    if (!primero) return null;

    return { lat: Number(primero.lat), lng: Number(primero.lon) };
  } catch (error) {
    console.error(`No se pudo geocodificar "${direccion}":`, error);
    return null;
  }
}

export type EstadoDireccionColegio =
  | { guardado: true; lat: number | null; lng: number | null }
  | { guardado: false; error: string }
  | undefined;

export async function actualizarDireccionColegio(
  colegioId: number,
  _prevState: EstadoDireccionColegio,
  formData: FormData
): Promise<EstadoDireccionColegio> {
  const alcance = await resolverAlcanceColegio();
  await verificarPropiedadColegio(colegioId, alcance);

  const direccion = String(formData.get("direccion") ?? "").trim();

  if (!direccion) {
    return { guardado: false, error: "Ingresa una dirección." };
  }

  await prisma.colegio.update({
    where: { id: colegioId },
    data: { direccion },
  });

  const coords = await geocodificarDireccion(direccion);

  revalidatePath(`/admin/colegios/${colegioId}/mapa`);

  return {
    guardado: true,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  };
}

function parseCoordenada(valor: FormDataEntryValue | null): number | null {
  if (valor == null || valor === "") return null;
  const num = Number(valor);
  return Number.isFinite(num) ? num : null;
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

  const latitud = parseCoordenada(formData.get("latitud"));
  const longitud = parseCoordenada(formData.get("longitud"));

  await prisma.ubicacion.create({
    data: { nombre, colegioId, latitud, longitud },
  });

  revalidatePath("/admin/ubicaciones");
  revalidatePath(`/admin/colegios/${colegioId}/mapa`);
}

export type EstadoGuardadoUbicacion = { guardado: boolean } | undefined;

export async function actualizarNombreUbicacion(
  ubicacionId: number,
  _prevState: EstadoGuardadoUbicacion,
  formData: FormData
): Promise<EstadoGuardadoUbicacion> {
  const alcance = await resolverAlcanceColegio();
  const ubicacion = await verificarPropiedadUbicacion(ubicacionId, alcance);

  const nombre = String(formData.get("nombre") ?? "").trim();

  if (!nombre) {
    return undefined;
  }

  const latitud = parseCoordenada(formData.get("latitud"));
  const longitud = parseCoordenada(formData.get("longitud"));

  await prisma.ubicacion.update({
    where: { id: ubicacionId },
    data: { nombre, latitud, longitud },
  });

  revalidatePath("/admin/ubicaciones");
  revalidatePath(`/admin/colegios/${ubicacion.colegioId}/mapa`);

  return { guardado: true };
}

export async function cambiarActivoUbicacion(
  ubicacionId: number,
  activo: boolean
) {
  const alcance = await resolverAlcanceColegio();
  const ubicacion = await verificarPropiedadUbicacion(ubicacionId, alcance);

  await prisma.ubicacion.update({
    where: { id: ubicacionId },
    data: { activo },
  });

  revalidatePath("/admin/ubicaciones");
  revalidatePath(`/admin/colegios/${ubicacion.colegioId}/mapa`);
}

"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const BCRYPT_COST = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mismo patrón que resolverAlcanceColegio en admin/ubicaciones/actions.ts.
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

async function verificarPropiedadFuncionario(
  usuarioId: number,
  alcance: { esSuperAdmin: boolean; colegioId: number | null }
) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

  // No solo aislamiento por colegio: también evita que esta acción opere
  // sobre una cuenta que no sea funcionario (p. ej. un admin), aunque
  // alguien mande un id ajeno a mano.
  if (!usuario || usuario.rol !== "funcionario") {
    throw new Error("No autorizado.");
  }
  if (!alcance.esSuperAdmin && usuario.colegioId !== alcance.colegioId) {
    throw new Error("No autorizado.");
  }

  return usuario;
}

export async function crearFuncionario(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const alcance = await resolverAlcanceColegio();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!nombre) {
    return "Ingresa un nombre.";
  }
  if (!EMAIL_RE.test(email)) {
    return "Ingresa un correo válido.";
  }
  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  // Mismo criterio que crearUbicacion: el super admin elige el colegio por
  // formulario; un admin de colegio siempre crea sobre el suyo, sin
  // importar qué venga en el formulario.
  let colegioId: number;
  if (alcance.esSuperAdmin) {
    colegioId = Number(formData.get("colegioId"));
    if (!Number.isInteger(colegioId) || colegioId <= 0) {
      return "Selecciona un colegio válido.";
    }
    const colegio = await prisma.colegio.findUnique({
      where: { id: colegioId },
    });
    if (!colegio) {
      return "El colegio seleccionado no existe.";
    }
  } else {
    colegioId = alcance.colegioId!;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        nombre,
        rol: "funcionario",
        colegioId,
        activo: true,
        // Lo crea directo un admin, no pasa por auto-registro (mismo
        // criterio que crearAdminColegio).
        emailVerificado: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "Ese correo ya está registrado.";
    }
    throw error;
  }

  revalidatePath(`/admin/colegios/${colegioId}`);
}

export async function cambiarActivoFuncionario(
  usuarioId: number,
  activo: boolean
) {
  const alcance = await resolverAlcanceColegio();
  const usuario = await verificarPropiedadFuncionario(usuarioId, alcance);

  await prisma.usuario.update({ where: { id: usuarioId }, data: { activo } });

  revalidatePath(`/admin/colegios/${usuario.colegioId}`);
}

export async function eliminarFuncionario(usuarioId: number) {
  const alcance = await resolverAlcanceColegio();
  const usuario = await verificarPropiedadFuncionario(usuarioId, alcance);

  await prisma.usuario.delete({ where: { id: usuarioId } });

  revalidatePath(`/admin/colegios/${usuario.colegioId}`);
}

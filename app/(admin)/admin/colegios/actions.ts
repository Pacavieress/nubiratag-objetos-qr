"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const BCRYPT_COST = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mismo patrón que requireFuncionario en q/[token]/actions.ts. proxy.ts ya
// exige rol admin para /admin/**, así que acá solo falta distinguir super
// admin (colegioId: null) de un futuro "admin de colegio" (rol admin con
// colegioId asignado) — ese admin de colegio no debería poder crear/ver
// otros colegios ni administradores fuera del suyo.
export async function requireSuperAdmin(): Promise<void> {
  const session = await auth();

  if (!session?.user || session.user.rol !== "admin") {
    redirect("/login");
  }

  if (session.user.colegioId != null) {
    redirect("/admin");
  }
}

export async function crearColegio(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  await requireSuperAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const codigoRegistro = String(formData.get("codigoRegistro") ?? "").trim();

  if (!nombre) {
    return "El nombre del colegio es obligatorio.";
  }
  if (!codigoRegistro) {
    return "El código de registro es obligatorio.";
  }

  try {
    await prisma.colegio.create({ data: { nombre, codigoRegistro } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "Ese código de registro ya está en uso.";
    }
    throw error;
  }

  revalidatePath("/admin/colegios");
}

export async function crearAdminColegio(
  colegioId: number,
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  await requireSuperAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
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

  const colegio = await prisma.colegio.findUnique({ where: { id: colegioId } });
  if (!colegio) {
    return "Ese colegio ya no existe.";
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        nombre,
        rol: "admin",
        colegioId,
        activo: true,
        // Lo crea directo un super admin, no pasa por auto-registro.
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

  revalidatePath("/admin/colegios");
}

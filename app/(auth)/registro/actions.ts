"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Mismo costo que usa el seed (prisma/seed.ts) y el resto del proyecto.
const BCRYPT_COST = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registrarApoderado(
  _prevState: string | undefined,
  formData: FormData
) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmarPassword = String(formData.get("confirmarPassword") ?? "");

  if (!nombre) {
    return "Ingresa tu nombre.";
  }

  if (!EMAIL_RE.test(email)) {
    return "Ingresa un correo válido.";
  }

  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  if (password !== confirmarPassword) {
    return "Las contraseñas no coinciden.";
  }

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    return "Este correo ya está registrado.";
  }

  // TODO: hoy hay un solo colegio (Colegio San Ejemplo), así que el
  // registro se autoasigna al primero que exista. Cuando haya
  // multi-colegio, reemplazar por una selección explícita (código de
  // registro, subdominio, etc.) — Google OAuth también queda pendiente
  // para esa misma etapa.
  const colegio = await prisma.colegio.findFirst({ orderBy: { id: "asc" } });
  if (!colegio) {
    return "No hay ningún colegio configurado todavía. Contacta al administrador.";
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        nombre,
        rol: "apoderado",
        colegioId: colegio.id,
        activo: true,
      },
    });
  } catch (error) {
    // Carrera entre dos registros simultáneos con el mismo email: el
    // findUnique de arriba no es atómico contra esto, la constraint
    // @unique del schema sí (mismo patrón que ya usa
    // apoderado/estudiantes/actions.ts para colisiones de token).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "Este correo ya está registrado.";
    }
    throw error;
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      // No debería pasar (la cuenta se acaba de crear con estas mismas
      // credenciales), pero si pasa igual la cuenta ya quedó creada:
      // manda al login para que entre manualmente.
      redirect("/login");
    }
    throw error;
  }

  redirect("/apoderado");
}

"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { enviarCorreoVerificacion } from "@/lib/email";

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

  // Mismo patrón que lib/qr.ts#generarToken: 128 bits, base64url.
  const tokenVerificacion = randomBytes(16).toString("base64url");
  const tokenVerificacionExpira = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        nombre,
        rol: "apoderado",
        colegioId: colegio.id,
        activo: true,
        emailVerificado: false,
        tokenVerificacion,
        tokenVerificacionExpira,
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

  await enviarCorreoVerificacion({
    destinatario: email,
    nombre,
    token: tokenVerificacion,
  });

  redirect("/registro/exito");
}

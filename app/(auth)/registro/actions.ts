"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { enviarCorreoVerificacion } from "@/lib/email";

// Mismo costo que usa el seed (prisma/seed.ts) y el resto del proyecto.
const BCRYPT_COST = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limit en memoria, capa 1 (mismo criterio que
// funcionario/entregar/actions.ts y reenviar-verificacion/actions.ts) —
// acá por IP, no por usuario/email, porque todavía no hay cuenta ni
// sesión en este punto. Solo cuenta intentos con código de colegio
// inválido: no penaliza a alguien que se equivoca en el nombre o la
// contraseña, solo a quien está adivinando códigos.
const INTENTOS_MAXIMOS = 3;
const VENTANA_INTENTOS_MS = 15 * 60 * 1000;
const intentosFallidosPorIp = new Map<
  string,
  { intentos: number; desde: number }
>();

async function obtenerIp(): Promise<string> {
  const listaHeaders = await headers();
  const forwarded = listaHeaders.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "desconocida";
}

function limiteAlcanzado(ip: string): boolean {
  const registro = intentosFallidosPorIp.get(ip);
  if (!registro) return false;
  if (Date.now() - registro.desde > VENTANA_INTENTOS_MS) return false;
  return registro.intentos >= INTENTOS_MAXIMOS;
}

function registrarIntentoFallido(ip: string) {
  const ahora = Date.now();
  const registro = intentosFallidosPorIp.get(ip);

  if (!registro || ahora - registro.desde > VENTANA_INTENTOS_MS) {
    intentosFallidosPorIp.set(ip, { intentos: 1, desde: ahora });
    return;
  }
  registro.intentos += 1;
}

export async function registrarApoderado(
  _prevState: string | undefined,
  formData: FormData
) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmarPassword = String(formData.get("confirmarPassword") ?? "");
  const codigoColegio = String(formData.get("codigoColegio") ?? "")
    .trim()
    .toUpperCase();

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

  if (!codigoColegio) {
    return "Ingresa el código de tu colegio.";
  }

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    return "Este correo ya está registrado.";
  }

  const ip = await obtenerIp();
  if (limiteAlcanzado(ip)) {
    return "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
  }

  // Un solo mensaje genérico sin distinguir "el código no existe" de "el
  // colegio cerró su registro" — mismo criterio de no revelar que ya usa
  // el resto de la app (login, /q/[token], etc.).
  const colegio = await prisma.colegio.findUnique({
    where: { codigoRegistro: codigoColegio },
  });

  if (!colegio || !colegio.registroActivo) {
    registrarIntentoFallido(ip);
    return "Código de colegio inválido.";
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

  // El usuario ya quedó creado arriba — un fallo de envío (SMTP, o lo
  // que rompió en producción con sharp/staticmaps) no debe tirar la
  // pantalla genérica de error ni dejar la cuenta "colgada": se redirige
  // igual a /registro/exito. Contras conocidas de esto: si el correo no
  // sale, hoy hay /reenviar-verificacion para pedir uno nuevo.
  try {
    await enviarCorreoVerificacion({
      destinatario: email,
      nombre,
      token: tokenVerificacion,
    });
  } catch (error) {
    console.error(
      `No se pudo enviar el correo de verificación a ${email}:`,
      error
    );
  }

  redirect("/registro/exito");
}

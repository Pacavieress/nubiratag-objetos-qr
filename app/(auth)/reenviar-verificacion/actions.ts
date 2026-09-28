"use server";

import { randomBytes } from "crypto";

import { prisma } from "@/lib/db";
import { enviarCorreoVerificacion } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mismo patrón de rate limit en memoria que ya usa
// funcionario/entregar/actions.ts — capa 1, por proceso. A diferencia de
// ese caso (clave = id del funcionario logueado), acá no hay sesión: se
// usa el email ingresado como clave. Limitación consciente: alguien
// podría rotar de email para esquivarlo, pero cada intento igual dispara
// como máximo un correo real por email dentro de la ventana, así que el
// abuso práctico queda acotado.
const INTENTOS_MAXIMOS = 3;
const VENTANA_INTENTOS_MS = 15 * 60 * 1000;
const intentosPorEmail = new Map<
  string,
  { intentos: number; desde: number }
>();

function registrarIntento(email: string): boolean {
  const ahora = Date.now();
  const registro = intentosPorEmail.get(email);

  if (!registro || ahora - registro.desde > VENTANA_INTENTOS_MS) {
    intentosPorEmail.set(email, { intentos: 1, desde: ahora });
    return true;
  }
  if (registro.intentos >= INTENTOS_MAXIMOS) return false;

  registro.intentos += 1;
  return true;
}

export type EstadoReenvio =
  | { ok: true; mensaje: string }
  | { ok: false; mensaje: string }
  | undefined;

const MENSAJE_GENERICO =
  "Si el correo está registrado y pendiente de verificación, te enviamos un enlace nuevo.";

// Sin distinguir "no existe" / "ya está verificado" / "no es apoderado":
// un solo mensaje genérico siempre, mismo criterio de no revelar que ya
// usa el resto de la app (login, registro, /q/[token]).
export async function reenviarVerificacion(
  _prevState: EstadoReenvio,
  formData: FormData
): Promise<EstadoReenvio> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { ok: false, mensaje: "Ingresa un correo válido." };
  }

  if (!registrarIntento(email)) {
    return {
      ok: false,
      mensaje: "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
    };
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (usuario && usuario.rol === "apoderado" && !usuario.emailVerificado) {
    // Mismo formato y vencimiento que registro/actions.ts.
    const tokenVerificacion = randomBytes(16).toString("base64url");
    const tokenVerificacionExpira = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { tokenVerificacion, tokenVerificacionExpira },
    });

    // Mismo criterio que registro/actions.ts: un fallo de SMTP no debe
    // romper la respuesta ni filtrar que el correo sí existe.
    try {
      await enviarCorreoVerificacion({
        destinatario: email,
        nombre: usuario.nombre,
        token: tokenVerificacion,
      });
    } catch (error) {
      console.error(
        `No se pudo reenviar el correo de verificación a ${email}:`,
        error
      );
    }
  }

  return { ok: true, mensaje: MENSAJE_GENERICO };
}

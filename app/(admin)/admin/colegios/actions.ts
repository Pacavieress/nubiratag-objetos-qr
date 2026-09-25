"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enviarCorreoBienvenidaAdmin } from "@/lib/email";

const BCRYPT_COST = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mismo patrón que requireFuncionario en q/[token]/actions.ts. proxy.ts
// ya deja pasar admin y superadmin a /admin/**; acá se exige
// específicamente superadmin — un admin de colegio no debe poder
// crear/ver otros colegios ni administradores fuera del suyo.
export async function requireSuperAdmin(): Promise<void> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.rol !== "admin" && session.user.rol !== "superadmin")
  ) {
    redirect("/login");
  }

  if (session.user.rol !== "superadmin") {
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

export type EstadoGuardadoColegio = { guardado: boolean } | undefined;

export async function actualizarNombreColegio(
  colegioId: number,
  _prevState: EstadoGuardadoColegio,
  formData: FormData
): Promise<EstadoGuardadoColegio> {
  await requireSuperAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();

  if (!nombre) {
    return undefined;
  }

  await prisma.colegio.update({
    where: { id: colegioId },
    data: { nombre },
  });

  revalidatePath("/admin/colegios");

  return { guardado: true };
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

  // Un admin desactivado con este correo se reactiva sobre la misma fila
  // (nombre/contraseña/colegio se actualizan a los recién ingresados) en
  // vez de rechazar por correo duplicado — cubre reasignar un
  // ex-administrador a otro colegio. Cualquier otro dueño del correo
  // (activo, o de otro rol) sigue rechazándose igual que antes.
  const existente = await prisma.usuario.findUnique({ where: { email } });

  if (existente) {
    if (existente.rol !== "admin" || existente.activo) {
      return "Ese correo ya está registrado.";
    }

    await prisma.usuario.update({
      where: { id: existente.id },
      data: { nombre, passwordHash, colegioId, activo: true },
    });
  } else {
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
  }

  // No se reutiliza registrarYEnviarNotificacion/lib/notificaciones.ts: ese
  // helper persiste el intento en la tabla notificacion, cuya FK
  // hallazgoId es obligatoria (ver schema.prisma) — este correo no está
  // atado a ningún hallazgo. Try/catch simple: el fallo de SMTP nunca debe
  // impedir que el admin quede creado.
  try {
    await enviarCorreoBienvenidaAdmin({
      destinatario: email,
      nombreAdmin: nombre,
      nombreColegio: colegio.nombre,
    });
  } catch (error) {
    console.error(
      `No se pudo enviar el correo de bienvenida al admin ${email}:`,
      error
    );
  }

  revalidatePath("/admin/colegios");
  revalidatePath(`/admin/colegios/${colegioId}`);
}

export async function desactivarAdmin(usuarioId: number, activo: boolean) {
  await requireSuperAdmin();

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

  // Mismo criterio que verificarPropiedadFuncionario: evita operar sobre
  // una cuenta que no sea admin, aunque llegue un id ajeno a mano.
  if (!usuario || usuario.rol !== "admin") {
    throw new Error("No autorizado.");
  }

  await prisma.usuario.update({ where: { id: usuarioId }, data: { activo } });

  revalidatePath(`/admin/colegios/${usuario.colegioId!}`);
}

export async function eliminarAdmin(usuarioId: number) {
  await requireSuperAdmin();

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

  // Mismo criterio que desactivarAdmin: evita operar sobre una cuenta que
  // no sea admin, aunque llegue un id ajeno a mano.
  if (!usuario || usuario.rol !== "admin") {
    throw new Error("No autorizado.");
  }

  await prisma.usuario.delete({ where: { id: usuarioId } });

  revalidatePath(`/admin/colegios/${usuario.colegioId!}`);
}

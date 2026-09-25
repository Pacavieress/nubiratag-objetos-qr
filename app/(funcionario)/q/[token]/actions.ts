"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enviarCorreoHallazgo } from "@/lib/email";
import { registrarYEnviarNotificacion } from "@/lib/notificaciones";
import { generarCodigoRetiro } from "@/lib/codigoRetiro";

// Decisión de producto: /q/[token] dejó de ser pública. Solo funcionario
// logueado puede reportar hallazgos. Se usa redirect() (no notFound())
// para el caso "sin sesión / rol equivocado": el matcher de proxy.ts va
// por prefijo de ruta y /q/ no calza con /funcionario/**, así que esta
// función hace ese trabajo acá adentro, mismo patrón que
// requireFuncionario en /funcionario/hallazgos.
export async function requireFuncionario(): Promise<{
  id: number;
  colegioId: number;
}> {
  const session = await auth();

  if (
    !session?.user ||
    session.user.rol !== "funcionario" ||
    session.user.colegioId == null
  ) {
    redirect("/login");
  }

  return { id: Number(session.user.id), colegioId: session.user.colegioId };
}

export type EstadoRegistro =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

// Crea la notificacion y deja su estado final (enviada/fallida) resuelto
// antes de devolver el control — nunca queda "pendiente" colgada. El
// hallazgo ya se guardó antes de llamar a esto, así que cualquier error
// de SMTP queda contenido acá adentro, sin afectar la pantalla del
// funcionario ni el registro ya hecho. Un hallazgo = una notificación,
// sin deduplicar entre hallazgos del mismo QR.
async function notificarHallazgo(
  hallazgoId: number,
  destinatario: string,
  datos: {
    nombreEstudiante: string;
    etiqueta: string | null;
    ubicacion: string;
    colegio: string;
    fecha: Date;
    nota: string | null;
    codigoRetiro: string;
    latitud: number | null;
    longitud: number | null;
  }
) {
  await registrarYEnviarNotificacion({
    hallazgoId,
    canal: "email",
    destinatario,
    payload: { ...datos },
    enviar: () => enviarCorreoHallazgo({ destinatario, ...datos }),
  });
}

const MAX_INTENTOS_CODIGO = 5;

/** Crea un hallazgo con un codigoRetiro único, reintentando ante una
 * colisión (prácticamente imposible con 887M combinaciones) — mismo
 * patrón que crearQrConTokenUnico en apoderado/estudiantes/actions.ts. */
async function crearHallazgoConCodigoUnico(opts: {
  qrCodigoId: number;
  ubicacionId: number;
  reportadoPorId: number;
}) {
  for (let intento = 1; intento <= MAX_INTENTOS_CODIGO; intento++) {
    const codigoRetiro = generarCodigoRetiro();
    try {
      return await prisma.hallazgo.create({
        data: { ...opts, codigoRetiro },
      });
    } catch (error) {
      const esColisionDeCodigo =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.includes(
          "codigo_retiro"
        );

      if (!esColisionDeCodigo) {
        throw error;
      }
      // Colisión de código (astronómicamente improbable): reintenta con
      // un código nuevo en vez de propagar el error crudo.
    }
  }

  throw new Error(
    `No se pudo generar un código de retiro único tras ${MAX_INTENTOS_CODIGO} intentos.`
  );
}

// Esta Server Action es, en los hechos, un endpoint HTTP: que la página
// solo muestre el formulario al funcionario correcto no alcanza como
// protección (cualquiera podría invocarla directo). Por eso se revalida
// sesión, rol y colegio acá adentro, no solo se confía en lo que decidió
// el render.
export async function registrarHallazgo(
  qrCodigoId: number,
  _prevState: EstadoRegistro,
  formData: FormData
): Promise<EstadoRegistro> {
  const funcionario = await requireFuncionario();

  // Revalidación fresca: el estado al momento de cargar la página puede
  // haber cambiado (QR revocado o estudiante dado de baja mientras
  // tanto).
  const qr = await prisma.qrCodigo.findUnique({
    where: { id: qrCodigoId },
    include: {
      estudiante: { include: { apoderado: true } },
      colegio: true,
    },
  });

  // Regla de oro: el colegio se resuelve desde el QR, nunca desde la URL.
  // No se distingue "no existe" de "es de otro colegio" — mismo criterio
  // de no revelar que ya usaba el modelo anterior con "código no válido".
  if (!qr || qr.colegioId !== funcionario.colegioId) {
    notFound();
  }

  if (qr.estado !== "activo" || !qr.estudiante.activo) {
    return {
      ok: false,
      error: "Este código ya no es válido para registrar un hallazgo.",
    };
  }

  const ubicacionId = Number(formData.get("ubicacionId"));
  if (!Number.isInteger(ubicacionId) || ubicacionId <= 0) {
    return { ok: false, error: "Selecciona una ubicación válida." };
  }

  const ubicacion = await prisma.ubicacion.findUnique({
    where: { id: ubicacionId },
  });

  // La ubicación tiene que ser del mismo colegio que el QR: ya se filtra
  // así en los botones de la UI, pero se revalida acá por si el
  // formulario se manipula directamente.
  if (
    !ubicacion ||
    !ubicacion.activo ||
    ubicacion.colegioId !== qr.colegioId
  ) {
    return { ok: false, error: "Selecciona una ubicación válida." };
  }

  // Sin nota: el funcionario solo toca la ubicación, no escribe nada
  // (decisión de producto — un solo toque, o toque + confirmar).
  // Evita hallazgos duplicados para el mismo QR: si ya hay uno abierto,
  // no se crea otro (antes no había ningún chequeo acá).
  const hallazgoAbierto = await prisma.hallazgo.findFirst({
    where: { qrCodigoId: qr.id, estado: "reportado" },
  });

  if (hallazgoAbierto) {
    return {
      ok: false,
      error:
        "Ya hay un hallazgo abierto para este objeto. Ve a Entregar objeto con su código de retiro, o ciérralo primero en Hallazgos.",
    };
  }

  const hallazgo = await crearHallazgoConCodigoUnico({
    qrCodigoId: qr.id,
    ubicacionId,
    reportadoPorId: funcionario.id,
  });

  await notificarHallazgo(hallazgo.id, qr.estudiante.apoderado.email, {
    nombreEstudiante: qr.estudiante.nombre,
    etiqueta: qr.etiqueta,
    ubicacion: ubicacion.nombre,
    colegio: qr.colegio.nombre,
    fecha: hallazgo.createdAt,
    nota: hallazgo.nota,
    codigoRetiro: hallazgo.codigoRetiro!,
    latitud: ubicacion.latitud,
    longitud: ubicacion.longitud,
  });

  revalidatePath(`/q/${qr.token}`);

  return { ok: true };
}

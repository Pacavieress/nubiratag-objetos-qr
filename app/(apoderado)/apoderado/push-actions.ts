"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Mismo límite que la columna user_agent VARCHAR(191) en la migración de
// suscripcion_push.
const USER_AGENT_MAX_LARGO = 191;

// Genérico (cualquier rol autenticado), no requireApoderado: una
// suscripción push no es un concepto propio del rol apoderado, aunque
// hoy el botón para activarla solo vaya a vivir en este panel (los
// únicos eventos que disparan push por ahora notifican al apoderado).
async function requireSesion(): Promise<number> {
  const session = await auth();

  if (!session?.user) {
    throw new Error("No autorizado.");
  }

  return Number(session.user.id);
}

export async function guardarSuscripcion(suscripcion: {
  endpoint: string;
  claveP256dh: string;
  claveAuth: string;
  userAgent?: string | null;
}): Promise<void> {
  const usuarioId = await requireSesion();

  const userAgent = suscripcion.userAgent
    ? suscripcion.userAgent.slice(0, USER_AGENT_MAX_LARGO)
    : null;

  // Upsert por endpoint, no por (usuarioId, endpoint): un mismo endpoint
  // solo puede existir una vez en el navegador que lo generó. Si ese
  // endpoint ya estaba guardado para OTRO usuario (dispositivo
  // compartido: alguien cierra sesión, otro apoderado entra y activa
  // notificaciones desde el mismo navegador), la fila se reasigna al
  // usuario que la está confirmando ahora — es la sesión activa la que
  // manda, no quién la creó la primera vez.
  await prisma.suscripcionPush.upsert({
    where: { endpoint: suscripcion.endpoint },
    create: {
      usuarioId,
      endpoint: suscripcion.endpoint,
      claveP256dh: suscripcion.claveP256dh,
      claveAuth: suscripcion.claveAuth,
      userAgent,
    },
    update: {
      usuarioId,
      claveP256dh: suscripcion.claveP256dh,
      claveAuth: suscripcion.claveAuth,
      userAgent,
    },
  });
}

export async function eliminarSuscripcion(endpoint: string): Promise<void> {
  const usuarioId = await requireSesion();

  // deleteMany (no delete) filtrando también por usuarioId: aislamiento
  // por dueño, mismo criterio que verificarPropiedadEstudiante en
  // apoderado/estudiantes/actions.ts — nadie puede borrar la suscripción
  // de otro usuario mandando a mano un endpoint ajeno.
  await prisma.suscripcionPush.deleteMany({
    where: { endpoint, usuarioId },
  });
}

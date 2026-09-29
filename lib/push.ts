import webpush from "web-push";

import { prisma } from "@/lib/db";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

const vapidConfigurado = Boolean(
  VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT
);

if (vapidConfigurado) {
  webpush.setVapidDetails(
    VAPID_SUBJECT!,
    VAPID_PUBLIC_KEY!,
    VAPID_PRIVATE_KEY!
  );
}

// Envía a todas las suscripciones del usuario en paralelo — una
// suscripción muerta no debe bloquear el push al resto de sus
// dispositivos. 404/410 significa que el navegador ya la dio de baja
// (desinstaló, revocó el permiso, etc.): se borra acá mismo, no hace
// falta un cron aparte. Sin VAPID configurado, no hace nada (ni falla):
// permite desplegar esta etapa antes de tener las claves generadas.
export async function enviarPush(
  usuarioId: number,
  datos: { titulo: string; cuerpo: string; url: string }
): Promise<void> {
  if (!vapidConfigurado) {
    return;
  }

  const suscripciones = await prisma.suscripcionPush.findMany({
    where: { usuarioId },
  });

  const payload = JSON.stringify({
    title: datos.titulo,
    body: datos.cuerpo,
    url: datos.url,
  });

  await Promise.allSettled(
    suscripciones.map(async (suscripcion) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: suscripcion.endpoint,
            keys: {
              p256dh: suscripcion.claveP256dh,
              auth: suscripcion.claveAuth,
            },
          },
          payload
        );
      } catch (error) {
        const statusCode =
          error instanceof webpush.WebPushError ? error.statusCode : null;

        if (statusCode === 404 || statusCode === 410) {
          await prisma.suscripcionPush.delete({
            where: { endpoint: suscripcion.endpoint },
          });
          return;
        }

        console.error(
          `No se pudo enviar push a la suscripción ${suscripcion.id} (usuario ${usuarioId}):`,
          error
        );
      }
    })
  );
}

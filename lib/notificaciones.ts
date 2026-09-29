import { Prisma, type CanalNotificacion } from "@prisma/client";

import { prisma } from "@/lib/db";
import { enviarCorreoRetiro } from "@/lib/email";
import { enviarPush } from "@/lib/push";

// Centraliza el patrón create-pendiente / intentar-enviar / marcar
// resultado (antes vivía solo dentro de notificarHallazgo en
// q/[token]/actions.ts) para no duplicarlo en el aviso de retiro. El
// fallo de envío queda contenido acá siempre — nunca se propaga.
export async function registrarYEnviarNotificacion(opts: {
  hallazgoId: number;
  canal: CanalNotificacion;
  destinatario: string;
  payload: Prisma.InputJsonObject;
  enviar: () => Promise<void>;
}): Promise<void> {
  const notificacion = await prisma.notificacion.create({
    data: {
      hallazgoId: opts.hallazgoId,
      canal: opts.canal,
      destinatario: opts.destinatario,
      estado: "pendiente",
      payload: opts.payload,
    },
  });

  try {
    await opts.enviar();

    await prisma.notificacion.update({
      where: { id: notificacion.id },
      data: { estado: "enviada", enviadaAt: new Date() },
    });
  } catch (error) {
    console.error(
      `No se pudo enviar la notificacion ${notificacion.id} (hallazgo ${opts.hallazgoId}, canal ${opts.canal}):`,
      error
    );
    await prisma.notificacion.update({
      where: { id: notificacion.id },
      data: { estado: "fallida" },
    });
  }
}

type HallazgoParaRetiro = {
  qrCodigo: {
    etiqueta: string | null;
    colegio: { nombre: string };
    estudiante: {
      nombre: string;
      apoderado: { id: number; email: string };
    };
  };
  ubicacion: { nombre: string; latitud: number | null; longitud: number | null };
};

// Compartido por notificarRetiro (acá abajo) y notificarHallazgo
// (q/[token]/actions.ts) — apunta a /apoderado/hallazgos/[id], la página
// de detalle que ya valida que el hallazgo sea de un estudiante del
// apoderado en sesión. canal "web" es el mismo enum CanalNotificacion
// que ya existía sin uso; registrarYEnviarNotificacion ya contiene su
// propio try/catch (nunca lanza), y enviarPush tampoco lanza (ver
// lib/push.ts) — doble seguro de que un fallo acá nunca se propaga hacia
// quien llama.
export async function notificarPush(
  hallazgoId: number,
  usuarioId: number,
  titulo: string
): Promise<void> {
  const url = `/apoderado/hallazgos/${hallazgoId}`;

  const datos = { titulo, cuerpo: "Toca para ver los detalles.", url };

  await registrarYEnviarNotificacion({
    hallazgoId,
    canal: "web",
    destinatario: String(usuarioId),
    payload: { ...datos },
    enviar: () => enviarPush(usuarioId, datos),
  });
}

// Compartido por entregarObjeto (entregar/actions.ts) y marcarRetirado
// (funcionario/hallazgos/actions.ts) — los dos únicos caminos que cierran
// un hallazgo como "retirado" y por lo tanto avisan al apoderado.
export async function notificarRetiro(
  hallazgoId: number,
  hallazgo: HallazgoParaRetiro,
  retiradoAt: Date
): Promise<void> {
  const destinatario = hallazgo.qrCodigo.estudiante.apoderado.email;
  const datos = {
    nombreEstudiante: hallazgo.qrCodigo.estudiante.nombre,
    etiqueta: hallazgo.qrCodigo.etiqueta,
    ubicacion: hallazgo.ubicacion.nombre,
    colegio: hallazgo.qrCodigo.colegio.nombre,
    fecha: retiradoAt,
    latitud: hallazgo.ubicacion.latitud,
    longitud: hallazgo.ubicacion.longitud,
  };

  await registrarYEnviarNotificacion({
    hallazgoId,
    canal: "email",
    destinatario,
    payload: { ...datos },
    enviar: () => enviarCorreoRetiro({ destinatario, ...datos }),
  });

  // Push después del correo, nunca antes ni en su lugar — ver el
  // comentario de notificarPush sobre por qué esto no puede afectar el
  // correo de arriba ni la transición de estado que ya ocurrió antes de
  // llegar acá.
  await notificarPush(
    hallazgoId,
    hallazgo.qrCodigo.estudiante.apoderado.id,
    `Retiraron un objeto de ${hallazgo.qrCodigo.estudiante.nombre}`
  );
}

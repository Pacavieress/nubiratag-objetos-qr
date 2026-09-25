import { Prisma, type CanalNotificacion } from "@prisma/client";

import { prisma } from "@/lib/db";
import { enviarCorreoRetiro } from "@/lib/email";

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
    estudiante: { nombre: string; apoderado: { email: string } };
  };
  ubicacion: { nombre: string };
};

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
  };

  await registrarYEnviarNotificacion({
    hallazgoId,
    canal: "email",
    destinatario,
    payload: { ...datos },
    enviar: () => enviarCorreoRetiro({ destinatario, ...datos }),
  });
}

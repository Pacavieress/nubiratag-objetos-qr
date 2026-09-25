"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notificarRetiro } from "@/lib/notificaciones";

// Igual que en el grupo (apoderado): estas son, en los hechos, endpoints
// HTTP públicos. proxy.ts protege /funcionario/** exigiendo rol
// funcionario, pero cada acción vuelve a comprobarlo acá adentro, sin
// confiar únicamente en esa capa.
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
    throw new Error("No autorizado.");
  }

  return { id: Number(session.user.id), colegioId: session.user.colegioId };
}

// [CRÍTICO DE SEGURIDAD] Aislamiento por colegio: un funcionario nunca
// puede operar sobre un hallazgo de otro colegio. Se verifica vía el
// colegioId del qr_codigo escaneado (no el de la ubicación: /q/[token]
// todavía no valida ubicación contra colegio, eso se migra aparte).
// notFound() en vez de un error explícito, mismo criterio que el
// aislamiento por dueño del apoderado.
async function transicionarHallazgo(
  hallazgoId: number,
  colegioId: number,
  funcionarioId: number,
  nuevoEstado: "retirado" | "descartado"
) {
  const hallazgo = await prisma.hallazgo.findUnique({
    where: { id: hallazgoId },
    include: {
      qrCodigo: {
        include: {
          estudiante: { include: { apoderado: true } },
          colegio: true,
        },
      },
      ubicacion: true,
    },
  });

  if (!hallazgo || hallazgo.qrCodigo.colegioId !== colegioId) {
    notFound();
  }

  if (hallazgo.estado !== "reportado") {
    // Ya lo transicionó otro funcionario mientras tanto, o no está en un
    // estado transicionable: no hay nada que hacer, no debe reventar.
    return;
  }

  const actualizado = await prisma.hallazgo.update({
    where: { id: hallazgoId },
    data:
      nuevoEstado === "retirado"
        ? {
            estado: nuevoEstado,
            retiradoAt: new Date(),
            retiradoPorId: funcionarioId,
          }
        : { estado: nuevoEstado },
  });

  revalidatePath("/funcionario/hallazgos");
  revalidatePath(`/apoderado/estudiantes/${hallazgo.qrCodigo.estudianteId}`);

  // Solo "retirado" avisa al apoderado; marcarDescartado nunca llega acá.
  if (nuevoEstado === "retirado") {
    await notificarRetiro(hallazgoId, hallazgo, actualizado.retiradoAt!);
  }
}

export async function marcarRetirado(hallazgoId: number) {
  const funcionario = await requireFuncionario();
  await transicionarHallazgo(
    hallazgoId,
    funcionario.colegioId,
    funcionario.id,
    "retirado"
  );
}

export async function marcarDescartado(hallazgoId: number) {
  const funcionario = await requireFuncionario();
  await transicionarHallazgo(
    hallazgoId,
    funcionario.colegioId,
    funcionario.id,
    "descartado"
  );
}

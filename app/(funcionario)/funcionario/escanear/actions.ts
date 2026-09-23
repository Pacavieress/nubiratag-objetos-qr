"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Mismo patrón que en hallazgos/actions.ts y q/[token]/actions.ts: esta
// página también es, en los hechos, un endpoint que cualquiera podría
// invocar directo, así que se re-valida sesión/rol/colegio acá adentro sin
// confiar en que proxy.ts ya lo filtró.
async function requireFuncionario(): Promise<{
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

// El QR codifica una URL completa (ver lib/qr.ts), no el token pelado. El
// ingreso manual, en cambio, puede traer el token solo. Se acepta cualquiera
// de las dos formas.
function extraerToken(entrada: string): string {
  const valor = entrada.trim();

  try {
    const url = new URL(valor);
    const segmentos = url.pathname.split("/").filter(Boolean);
    return segmentos[segmentos.length - 1] ?? valor;
  } catch {
    return valor;
  }
}

export type EstadoValidacion =
  | { ok: true; token: string }
  | { ok: false; error: string };

// Pre-validación de UX: evita mandar al funcionario a la página 404
// genérica de /q/[token] cuando escanea/tipea basura, dándole un mensaje
// inline y la posibilidad de reintentar sin perder la cámara abierta. No
// reemplaza la validación de /q/[token] ni de registrarHallazgo — esas
// siguen siendo la autoridad real al momento de registrar el hallazgo;
// esto es solo un filtro previo a la navegación.
//
// Mismo criterio de no revelar motivo que ya usa /q/[token]: "no existe",
// "es de otro colegio", "está revocado" y "estudiante dado de baja"
// devuelven el mismo mensaje genérico.
export async function validarToken(
  entrada: string
): Promise<EstadoValidacion> {
  const funcionario = await requireFuncionario();

  const token = extraerToken(entrada);
  if (!token) {
    return { ok: false, error: "Código no válido." };
  }

  const qr = await prisma.qrCodigo.findUnique({
    where: { token },
    include: { estudiante: true },
  });

  if (!qr || qr.colegioId !== funcionario.colegioId) {
    return { ok: false, error: "Código no válido." };
  }

  if (qr.estado !== "activo" || !qr.estudiante.activo) {
    return { ok: false, error: "Código no válido." };
  }

  return { ok: true, token };
}

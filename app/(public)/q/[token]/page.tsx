import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HallazgoForm } from "./hallazgo-form";

const MENSAJE_NEUTRO_INVALIDO = "Código no válido.";
const MENSAJE_NEUTRO_VALIDO =
  "Este objeto pertenece a un estudiante del colegio. Por favor déjalo en Inspectoría.";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  const qr = await prisma.qrCodigo.findUnique({
    where: { token },
    include: { estudiante: true },
  });

  const invalido = !qr || qr.estado !== "activo" || !qr.estudiante.activo;

  if (invalido) {
    // Público: siempre el mismo mensaje, sin importar el motivo (punto 10
    // del spec: "nunca revela por qué"). Staff: sí puede ver el motivo,
    // le sirve para no confundirse operativamente.
    if (!session) {
      return (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <p>{MENSAJE_NEUTRO_INVALIDO}</p>
        </main>
      );
    }

    const motivo = !qr
      ? "Este código no existe."
      : qr.estado !== "activo"
        ? "Este código fue revocado."
        : "Este estudiante fue dado de baja.";

    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p>{motivo}</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p>{MENSAJE_NEUTRO_VALIDO}</p>
      </main>
    );
  }

  const [ubicaciones, hallazgoAbierto] = await Promise.all([
    prisma.ubicacion.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.hallazgo.findFirst({
      where: { qrCodigoId: qr.id, estado: "reportado" },
      orderBy: { createdAt: "desc" },
      include: { ubicacion: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p>{MENSAJE_NEUTRO_VALIDO}</p>

      {hallazgoAbierto && (
        <p className="mt-4 text-sm text-amber-700">
          Aviso: ya hay un hallazgo abierto para este código, registrado el{" "}
          {hallazgoAbierto.createdAt.toLocaleDateString("es-CL")} en{" "}
          {hallazgoAbierto.ubicacion.nombre}. Igual puedes registrar uno
          nuevo si corresponde.
        </p>
      )}

      <HallazgoForm qrCodigoId={qr.id} ubicaciones={ubicaciones} />
    </main>
  );
}

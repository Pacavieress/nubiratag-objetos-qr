import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { VolverLink } from "@/components/volver-link";
import { requireFuncionario } from "./actions";
import { HallazgoForm } from "./hallazgo-form";

function VolverAEscanear() {
  return (
    <div className="flex items-center justify-between">
      <VolverLink href="/funcionario/escanear" />
    </div>
  );
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Decisión de producto: ya no es pública. Sin sesión, o con sesión pero
  // rol distinto de funcionario, rebota a /login (dentro de
  // requireFuncionario).
  const funcionario = await requireFuncionario();

  const qr = await prisma.qrCodigo.findUnique({
    where: { token },
    include: { estudiante: true },
  });

  // Regla de oro: el colegio se resuelve server-side desde el QR, nunca
  // desde la URL. No se distingue "no existe" de "es de otro colegio" —
  // notFound() en ambos casos, para no revelar que el token existe pero
  // pertenece a otro colegio.
  if (!qr || qr.colegioId !== funcionario.colegioId) {
    notFound();
  }

  if (qr.estado !== "activo" || !qr.estudiante.activo) {
    const motivo =
      qr.estado !== "activo"
        ? "Este código fue revocado."
        : "Este código pertenece a un estudiante dado de baja.";

    return (
      <>
        <VolverAEscanear />
        <main className="mx-auto flex w-full max-w-md flex-col gap-4">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 text-center sm:p-6">
            <p className="text-base text-gray-700">{motivo}</p>
          </section>
        </main>
      </>
    );
  }

  const [ubicaciones, hallazgoAbierto] = await Promise.all([
    // Ubicaciones del mismo colegio que el QR, no todas — cierra el hueco
    // de poder asignar una ubicación de otro colegio.
    prisma.ubicacion.findMany({
      where: { colegioId: qr.colegioId, activo: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.hallazgo.findFirst({
      where: { qrCodigoId: qr.id, estado: "reportado" },
      orderBy: { createdAt: "desc" },
      include: { ubicacion: true },
    }),
  ]);

  // "Mochila de Juan Pérez" — la etiqueta es obligatoria para QR nuevos
  // (ver apoderado/estudiantes/actions.ts), pero un QR generado antes de
  // ese cambio puede no tenerla, así que igual hay un fallback.
  const tituloObjeto = qr.etiqueta
    ? `${qr.etiqueta} de ${qr.estudiante.nombre}`
    : `Objeto de ${qr.estudiante.nombre}`;

  return (
    <>
      <VolverAEscanear />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
          {/* Ya no hay escaneo anónimo: solo llega acá un funcionario logueado
              de este mismo colegio, así que mostrarle a quién pertenece el
              objeto es información operativa normal, no una fuga de PII. */}
          <h1 className="text-lg font-semibold text-gray-900">{tituloObjeto}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Registrar dónde quedó este objeto.
          </p>

          {hallazgoAbierto && (
            <p className="mt-4 text-sm text-amber-700">
              Aviso: ya hay un hallazgo abierto para este código, registrado el{" "}
              {hallazgoAbierto.createdAt.toLocaleDateString("es-CL")} en{" "}
              {hallazgoAbierto.ubicacion.nombre}. Igual puedes registrar uno
              nuevo si corresponde.
            </p>
          )}

          <HallazgoForm qrCodigoId={qr.id} ubicaciones={ubicaciones} />
        </section>
      </main>
    </>
  );
}

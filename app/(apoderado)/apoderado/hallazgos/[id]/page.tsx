import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generarMapaEstatico } from "@/lib/mapa-estatico";
import { VolverLink } from "@/components/volver-link";

const TITULO_POR_ESTADO: Record<string, string> = {
  retirado: "Retiraron un objeto",
  reportado: "Encontraron un objeto",
  descartado: "Este hallazgo fue descartado",
};

export default async function HallazgoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hallazgoId = Number(id);

  if (!Number.isInteger(hallazgoId)) {
    notFound();
  }

  // proxy.ts ya protege /apoderado/:path* exigiendo sesión con rol
  // apoderado antes de llegar acá — mismo criterio que
  // estudiantes/[id]/page.tsx, que tampoco revalida sesión a mano.
  const session = await auth();
  const apoderadoId = Number(session!.user.id);

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

  // Aislamiento por dueño: mismo criterio que estudiantes/[id]/page.tsx —
  // si el hallazgo no existe o el estudiante no es de este apoderado,
  // 404 sin distinguir el motivo.
  if (!hallazgo || hallazgo.qrCodigo.estudiante.apoderadoId !== apoderadoId) {
    notFound();
  }

  const { ubicacion, qrCodigo } = hallazgo;
  const objeto = qrCodigo.etiqueta ?? "un objeto";
  const fechaTexto = (hallazgo.retiradoAt ?? hallazgo.createdAt).toLocaleString(
    "es-CL",
    { dateStyle: "long", timeStyle: "short" }
  );

  // Solo mientras está "reportado" tiene sentido mostrar dónde está: una
  // vez retirado (o descartado) la ubicación deja de ser accionable —
  // mismo criterio que se usó para sacar el botón de mapa del correo de
  // retiro (lib/email.ts, plantillaRetiro).
  const mostrarMapa =
    hallazgo.estado === "reportado" &&
    ubicacion.latitud != null &&
    ubicacion.longitud != null;

  const mapaBuffer = mostrarMapa
    ? await generarMapaEstatico(ubicacion.latitud!, ubicacion.longitud!)
    : null;

  return (
    <main className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <VolverLink href="/apoderado/estudiantes" />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {TITULO_POR_ESTADO[hallazgo.estado] ?? "Detalle del hallazgo"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {hallazgo.estado === "retirado" ? (
              <>
                {objeto} de <strong>{qrCodigo.estudiante.nombre}</strong> fue
                retirado desde <strong>{ubicacion.nombre}</strong>,{" "}
                {qrCodigo.colegio.nombre}, el {fechaTexto}.
              </>
            ) : (
              <>
                Encontramos {objeto} de{" "}
                <strong>{qrCodigo.estudiante.nombre}</strong> y quedó en{" "}
                <strong>{ubicacion.nombre}</strong>, {qrCodigo.colegio.nombre},
                el {fechaTexto}.
              </>
            )}
          </p>

          {mapaBuffer && (
            <img
              src={`data:image/png;base64,${mapaBuffer.toString("base64")}`}
              alt={`Mapa de ${ubicacion.nombre}`}
              className="mt-4 w-full rounded-xl"
            />
          )}

          {mostrarMapa && (
            <a
              href={`https://www.google.com/maps?q=${ubicacion.latitud},${ubicacion.longitud}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#54A6D8] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#478db8]"
            >
              <MapPin className="h-4 w-4" />
              Ver ubicación en el mapa
            </a>
          )}
        </section>
      </div>
    </main>
  );
}

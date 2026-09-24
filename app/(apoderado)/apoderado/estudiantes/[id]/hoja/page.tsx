import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generarImagenQr } from "@/lib/qr";
import { VolverLink } from "@/components/volver-link";
import { PrintButton } from "./print-button";

export default async function HojaImprimiblePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estudianteId = Number(id);

  if (!Number.isInteger(estudianteId)) {
    notFound();
  }

  const session = await auth();
  const apoderadoId = Number(session!.user.id);

  const estudiante = await prisma.estudiante.findUnique({
    where: { id: estudianteId },
    include: {
      qrCodigos: {
        where: { estado: "activo" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Aislamiento por dueño: mismo criterio que el resto del flujo.
  if (!estudiante || estudiante.apoderadoId !== apoderadoId) {
    notFound();
  }

  const qrs = await Promise.all(
    estudiante.qrCodigos.map(async (qr) => ({
      id: qr.id,
      etiqueta: qr.etiqueta,
      imagen: await generarImagenQr(qr.token),
    }))
  );

  return (
    <main className="w-full">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <VolverLink href={`/apoderado/estudiantes/${estudianteId}`} />
        <PrintButton />
      </div>

      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold print:hidden">
          Hoja imprimible — {estudiante.nombre}
        </h1>

        {/*
          El nombre del estudiante es solo una referencia visual en la hoja
          para el apoderado que va a pegar los QR; el código en sí (más
          abajo) únicamente codifica la URL con el token opaco, sin PII.
        */}
        <p className="mb-6 text-sm text-gray-600">
          Estudiante: <strong>{estudiante.nombre}</strong>
          {estudiante.curso && <> — Curso: {estudiante.curso}</>}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          {qrs.map((qr) => (
            <div key={qr.id} className="flex flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-gray-400 px-3 py-1">
                <p className="text-sm font-semibold">
                  <span className="text-[#2c7bc0]">Nubira</span>
                  <span className="text-[#ff914d]">Tag</span>
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.imagen} alt="Código QR" className="h-[3cm] w-[3cm]" />
              </div>
              <span className="text-xs text-gray-600">
                {qr.etiqueta ?? "Sin etiqueta"}
              </span>
            </div>
          ))}
          {qrs.length === 0 && (
            <p className="text-sm text-gray-500 col-span-full">
              Este estudiante no tiene códigos QR activos para imprimir.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

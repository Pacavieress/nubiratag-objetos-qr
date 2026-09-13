import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { generarImagenQr } from "@/lib/qr";
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

  const estudiante = await prisma.estudiante.findUnique({
    where: { id: estudianteId },
    include: {
      qrCodigos: {
        where: { estado: "activo" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!estudiante) {
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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <h1 className="text-xl font-semibold">
          Hoja imprimible — {estudiante.nombre}
        </h1>
        <PrintButton />
      </div>

      {/*
        El nombre del estudiante es solo una referencia visual en la hoja
        para el admin que va a pegar los QR; el código en sí (más abajo)
        únicamente codifica la URL con el token opaco, sin PII.
      */}
      <p className="mb-6 text-sm text-gray-600">
        Estudiante: <strong>{estudiante.nombre}</strong> — Curso:{" "}
        {estudiante.curso}
      </p>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {qrs.map((qr) => (
          <div
            key={qr.id}
            className="flex flex-col items-center gap-2 border rounded p-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.imagen} alt="Código QR" className="w-32 h-32" />
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
    </main>
  );
}

import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generarImagenQr } from "@/lib/qr";
import { VolverLink } from "@/components/volver-link";
import { PrintButton } from "../../hoja/print-button";

export default async function QrDetallePage({
  params,
}: {
  params: Promise<{ id: string; qrId: string }>;
}) {
  const { id, qrId } = await params;
  const estudianteId = Number(id);
  const qrCodigoId = Number(qrId);

  if (!Number.isInteger(estudianteId) || !Number.isInteger(qrCodigoId)) {
    notFound();
  }

  const session = await auth();
  const apoderadoId = Number(session!.user.id);

  const qr = await prisma.qrCodigo.findUnique({
    where: { id: qrCodigoId },
    include: { estudiante: true },
  });

  // Aislamiento por dueño: el QR debe pertenecer al estudiante de la URL,
  // y ese estudiante al apoderado logueado — mismo criterio que el resto
  // del flujo, notFound() sin distinguir el motivo.
  if (
    !qr ||
    qr.estudianteId !== estudianteId ||
    qr.estudiante.apoderadoId !== apoderadoId
  ) {
    notFound();
  }

  const imagen = await generarImagenQr(qr.token);

  return (
    <main className="flex w-full flex-col items-center gap-4 px-4 py-4">
      <div className="-mx-4 -mt-4 flex w-full items-center justify-between px-0 print:hidden">
        <VolverLink href={`/apoderado/estudiantes/${estudianteId}`} />
        <PrintButton />
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <div className="w-full text-left print:hidden">
          <p className="text-lg font-semibold text-gray-900">
            {qr.etiqueta ? `Código QR "${qr.etiqueta}" de:` : "Código QR de:"}
          </p>
          <p className="text-base text-gray-700">
            Estudiante: {qr.estudiante.nombre}
          </p>
          {qr.estudiante.curso && (
            <p className="text-base text-gray-700">
              Curso: {qr.estudiante.curso}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-gray-400 px-3 py-1">
          <p className="text-sm font-semibold">
            <span className="text-[#2c7bc0]">Nubira</span>
            <span className="text-[#ff914d]">Tag</span>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagen} alt="Código QR" className="h-[3cm] w-[3cm]" />
        </div>
      </div>
    </main>
  );
}

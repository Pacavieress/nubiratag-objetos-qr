import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  actualizarEstudiante,
  cambiarActivoEstudiante,
  generarQrCodes,
  revocarQr,
} from "../actions";
import { EstudianteForm } from "../estudiante-form";
import { EtiquetaForm } from "./etiqueta-form";

export default async function EstudianteDetallePage({
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
    include: { qrCodigos: { orderBy: { createdAt: "asc" } } },
  });

  if (!estudiante) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-10">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">{estudiante.nombre}</h1>
          <form action={cambiarActivoEstudiante.bind(null, estudiante.id, !estudiante.activo)}>
            <button
              type="submit"
              className="border rounded px-3 py-2 text-sm"
            >
              {estudiante.activo ? "Dar de baja" : "Reactivar"}
            </button>
          </form>
        </div>
        {!estudiante.activo && (
          <p className="text-sm text-amber-700 mb-4">
            Estudiante dado de baja: sus QR ya emitidos siguen existiendo,
            pero al escanearlos no deben resolver a un hallazgo válido
            (la Etapa 3 valida esto).
          </p>
        )}
        <EstudianteForm
          action={actualizarEstudiante.bind(null, estudiante.id)}
          defaultValues={estudiante}
          submitLabel="Guardar cambios"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Códigos QR</h2>
          <Link
            href={`/admin/estudiantes/${estudiante.id}/hoja`}
            className="underline text-sm"
          >
            Ver hoja imprimible
          </Link>
        </div>

        <form
          action={generarQrCodes.bind(null, estudiante.id)}
          className="flex items-end gap-2 mb-6"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="cantidad" className="text-sm">
              Cantidad a generar
            </label>
            <input
              id="cantidad"
              name="cantidad"
              type="number"
              min={1}
              max={50}
              defaultValue={5}
              className="border rounded px-3 py-2 w-24"
            />
          </div>
          <button type="submit" className="bg-black text-white rounded px-3 py-2">
            Generar QR
          </button>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Token</th>
              <th className="py-2">Etiqueta</th>
              <th className="py-2">Estado</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {estudiante.qrCodigos.map((qr) => (
              <tr key={qr.id} className="border-b align-top">
                <td className="py-2 font-mono text-xs">
                  {qr.token.slice(0, 12)}…
                </td>
                <td className="py-2">
                  <EtiquetaForm qrId={qr.id} etiquetaInicial={qr.etiqueta} />
                </td>
                <td className="py-2">{qr.estado}</td>
                <td className="py-2">
                  {qr.estado === "activo" && (
                    <form action={revocarQr.bind(null, qr.id)}>
                      <button type="submit" className="underline text-xs">
                        Revocar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {estudiante.qrCodigos.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-gray-500">
                  Este estudiante todavía no tiene códigos QR.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

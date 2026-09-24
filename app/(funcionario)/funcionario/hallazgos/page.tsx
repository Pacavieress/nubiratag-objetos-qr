import { BotonSubmit } from "@/components/boton-submit";
import { VolverLink } from "@/components/volver-link";
import { prisma } from "@/lib/db";
import { marcarDescartado, marcarRetirado, requireFuncionario } from "./actions";

export default async function HallazgosPage() {
  const funcionario = await requireFuncionario();

  const hallazgos = await prisma.hallazgo.findMany({
    where: { estado: "reportado", qrCodigo: { colegioId: funcionario.colegioId } },
    orderBy: { createdAt: "asc" },
    include: {
      ubicacion: true,
      qrCodigo: { include: { estudiante: true } },
    },
  });

  return (
    <main className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <VolverLink href="/funcionario/escanear" />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-xl font-semibold text-gray-900">Hallazgos abiertos</h1>

        <div className="flex flex-col gap-3">
          {hallazgos.map((h) => (
            <div
              key={h.id}
              className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-semibold text-gray-900">
                  {h.qrCodigo.estudiante.nombre}
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Reportado
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {h.ubicacion.nombre} — {h.createdAt.toLocaleDateString("es-CL")}
              </p>
              {h.nota && <p className="mt-2 text-sm text-gray-600">{h.nota}</p>}

              <div className="mt-4 flex flex-wrap gap-3">
                <form action={marcarRetirado.bind(null, h.id)}>
                  <BotonSubmit label="Marcar retirado" loadingLabel="Guardando..." />
                </form>
                <form action={marcarDescartado.bind(null, h.id)}>
                  <BotonSubmit
                    label="Descartar"
                    variante="gris"
                    loadingLabel="Guardando..."
                  />
                </form>
              </div>
            </div>
          ))}

          {hallazgos.length === 0 && (
            <p className="rounded-2xl border border-gray-200 bg-white p-5 text-center text-base text-gray-500 sm:p-6">
              No hay hallazgos abiertos.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

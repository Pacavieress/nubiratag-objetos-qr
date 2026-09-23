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
    <main className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Hallazgos abiertos</h1>

      <ul className="flex flex-col gap-3">
        {hallazgos.map((h) => (
          <li key={h.id} className="border rounded p-4">
            <p className="font-medium">{h.qrCodigo.estudiante.nombre}</p>
            <p className="text-sm text-gray-600">
              {h.ubicacion.nombre} — {h.createdAt.toLocaleDateString("es-CL")}
            </p>
            {h.nota && <p className="text-sm mt-1">{h.nota}</p>}
            <div className="flex gap-3 mt-3">
              <form action={marcarRetirado.bind(null, h.id)}>
                <button
                  type="submit"
                  className="bg-black text-white rounded px-3 py-1.5 text-sm"
                >
                  Marcar retirado
                </button>
              </form>
              <form action={marcarDescartado.bind(null, h.id)}>
                <button type="submit" className="underline text-sm">
                  Descartar
                </button>
              </form>
            </div>
          </li>
        ))}
        {hallazgos.length === 0 && (
          <p className="text-sm text-gray-500">No hay hallazgos abiertos.</p>
        )}
      </ul>
    </main>
  );
}

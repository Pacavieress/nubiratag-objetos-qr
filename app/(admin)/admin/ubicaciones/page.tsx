import { prisma } from "@/lib/db";
import { cambiarActivoUbicacion, crearUbicacion } from "./actions";
import { NombreForm } from "./nombre-form";

export default async function UbicacionesPage() {
  // El admin es global y ve ubicaciones de todos los colegios, así que se
  // ordena por colegio primero para que la tabla quede agrupada visualmente.
  const [ubicaciones, colegios] = await Promise.all([
    prisma.ubicacion.findMany({
      include: { colegio: true },
      orderBy: [{ colegio: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    prisma.colegio.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Ubicaciones</h1>

      <form action={crearUbicacion} className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="colegioId" className="text-sm">
            Colegio
          </label>
          <select
            id="colegioId"
            name="colegioId"
            required
            defaultValue=""
            className="border rounded px-3 py-2"
          >
            <option value="" disabled>
              Selecciona un colegio
            </option>
            {colegios.map((colegio) => (
              <option key={colegio.id} value={colegio.id}>
                {colegio.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="nombre" className="text-sm">
            Nueva ubicación
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            placeholder="p. ej. Biblioteca"
            className="border rounded px-3 py-2"
          />
        </div>
        <button type="submit" className="bg-black text-white rounded px-3 py-2">
          Agregar
        </button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Colegio</th>
            <th className="py-2">Nombre</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {ubicaciones.map((ubicacion) => (
            <tr key={ubicacion.id} className="border-b align-top">
              <td className="py-2 text-gray-600">{ubicacion.colegio.nombre}</td>
              <td className="py-2">
                <NombreForm
                  ubicacionId={ubicacion.id}
                  nombreInicial={ubicacion.nombre}
                />
              </td>
              <td className="py-2">
                {ubicacion.activo ? "Activa" : "Inactiva"}
              </td>
              <td className="py-2">
                <form
                  action={cambiarActivoUbicacion.bind(
                    null,
                    ubicacion.id,
                    !ubicacion.activo
                  )}
                >
                  <button type="submit" className="underline text-xs">
                    {ubicacion.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {ubicaciones.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-500">
                No hay ubicaciones registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

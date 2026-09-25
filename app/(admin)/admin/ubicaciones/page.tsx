import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cambiarActivoUbicacion } from "./actions";
import { CrearUbicacionForm } from "./crear-ubicacion-form";
import { NombreForm } from "./nombre-form";

export default async function UbicacionesPage() {
  const session = await auth();
  const esSuperAdmin = session?.user?.rol === "superadmin";
  const colegioIdPropio = session?.user?.colegioId ?? null;

  // El super admin ve/gestiona ubicaciones de todos los colegios; un admin
  // de colegio solo ve y puede operar las del suyo.
  const [ubicaciones, colegios] = await Promise.all([
    prisma.ubicacion.findMany({
      where: esSuperAdmin ? undefined : { colegioId: colegioIdPropio! },
      include: { colegio: true },
      orderBy: [{ colegio: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    esSuperAdmin
      ? prisma.colegio.findMany({
          where: { activo: true },
          orderBy: { nombre: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Agrupa por colegio (ya vienen ordenadas por colegio.nombre, nombre) —
  // el nombre del colegio pasa a ser encabezado de sección en vez de
  // repetirse en cada fila.
  const grupos = new Map<
    number,
    { nombre: string; ubicaciones: typeof ubicaciones }
  >();
  for (const ubicacion of ubicaciones) {
    const grupo = grupos.get(ubicacion.colegioId);
    if (grupo) {
      grupo.ubicaciones.push(ubicacion);
    } else {
      grupos.set(ubicacion.colegioId, {
        nombre: ubicacion.colegio.nombre,
        ubicaciones: [ubicacion],
      });
    }
  }

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Ubicaciones</h1>

      <CrearUbicacionForm esSuperAdmin={esSuperAdmin} colegios={colegios} />

      {[...grupos.values()].map((grupo) => (
        <section key={grupo.nombre} className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-gray-900">
            {grupo.nombre}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Nombre</th>
                <th className="py-2">Estado</th>
                <th className="py-2"></th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {grupo.ubicaciones.map((ubicacion) => (
                <tr key={ubicacion.id} className="border-b align-top">
                  <td className="py-2">
                    <NombreForm
                      ubicacionId={ubicacion.id}
                      nombreInicial={ubicacion.nombre}
                      latitudInicial={ubicacion.latitud}
                      longitudInicial={ubicacion.longitud}
                    />
                  </td>
                  <td className="py-2">
                    {ubicacion.activo ? "Activa" : "Inactiva"}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/admin/ubicaciones/${ubicacion.id}/mapa`}
                      className="underline text-xs"
                    >
                      Mapa
                    </Link>
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
            </tbody>
          </table>
        </section>
      ))}

      {ubicaciones.length === 0 && (
        <p className="py-4 text-center text-gray-500">
          No hay ubicaciones registradas.
        </p>
      )}
    </main>
  );
}

import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function UbicacionesPage() {
  const session = await auth();
  const esSuperAdmin = session?.user?.rol === "superadmin";
  const colegioIdPropio = session?.user?.colegioId ?? null;

  // El super admin ve todos los colegios; un admin de colegio solo ve el
  // suyo. La gestión de ubicaciones (crear, renombrar, ubicar en el mapa,
  // desactivar) se mudó por completo a /admin/colegios/[id]/mapa.
  const colegios = await prisma.colegio.findMany({
    where: esSuperAdmin ? { activo: true } : { id: colegioIdPropio! },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Ubicaciones</h1>
      <p className="text-sm text-gray-600">
        Elige un colegio para gestionar sus ubicaciones en el mapa.
      </p>

      <ul className="flex flex-col gap-2">
        {colegios.map((colegio) => (
          <li
            key={colegio.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4"
          >
            <span className="text-sm font-medium text-gray-900">
              {colegio.nombre}
            </span>
            <Link
              href={`/admin/colegios/${colegio.id}/mapa`}
              className="text-xs font-medium text-[#54A6D8] underline"
            >
              Mapa
            </Link>
          </li>
        ))}

        {colegios.length === 0 && (
          <p className="py-4 text-center text-gray-500">
            No hay colegios registrados.
          </p>
        )}
      </ul>
    </main>
  );
}

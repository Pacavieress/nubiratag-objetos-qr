import Link from "next/link";

import { prisma } from "@/lib/db";

export default async function EstudiantesPage() {
  const estudiantes = await prisma.estudiante.findMany({
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Estudiantes</h1>
        <Link
          href="/admin/estudiantes/nuevo"
          className="bg-black text-white rounded px-3 py-2 text-sm"
        >
          Nuevo estudiante
        </Link>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Nombre</th>
            <th className="py-2">Curso</th>
            <th className="py-2">Apoderado</th>
            <th className="py-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {estudiantes.map((estudiante) => (
            <tr key={estudiante.id} className="border-b">
              <td className="py-2">
                <Link
                  href={`/admin/estudiantes/${estudiante.id}`}
                  className="underline"
                >
                  {estudiante.nombre}
                </Link>
              </td>
              <td className="py-2">{estudiante.curso}</td>
              <td className="py-2">{estudiante.apoderadoNombre}</td>
              <td className="py-2">
                {estudiante.activo ? "Activo" : "Inactivo"}
              </td>
            </tr>
          ))}
          {estudiantes.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-500">
                No hay estudiantes registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

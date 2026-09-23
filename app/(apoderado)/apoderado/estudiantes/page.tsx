import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function EstudiantesPage() {
  const session = await auth();
  const apoderadoId = Number(session!.user.id);

  const estudiantes = await prisma.estudiante.findMany({
    where: { apoderadoId },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Mis estudiantes</h1>

      <div className="flex flex-col gap-3">
        {estudiantes.map((estudiante) => (
          <Link
            key={estudiante.id}
            href={`/apoderado/estudiantes/${estudiante.id}`}
            className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-emerald-300 active:scale-[0.99] sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-semibold capitalize text-gray-900">
                {estudiante.nombre}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${
                  estudiante.activo
                    ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                    : "border-gray-200 bg-gray-100 text-gray-500"
                }`}
              >
                {estudiante.activo ? "Activo" : "Inactivo"}
              </span>
            </div>
            {estudiante.curso && (
              <p className="mt-1 text-sm text-gray-500">{estudiante.curso}</p>
            )}
          </Link>
        ))}

        {estudiantes.length === 0 && (
          <p className="rounded-2xl border border-gray-200 bg-white p-5 text-center text-base text-gray-500 sm:p-6">
            Todavía no agregaste estudiantes.
          </p>
        )}
      </div>
    </main>
  );
}

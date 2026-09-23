import { Building2, Minus, Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "./actions";
import { CrearColegioForm } from "./crear-colegio-form";
import { AdminColegioForm } from "./admin-colegio-form";

export default async function ColegiosPage() {
  await requireSuperAdmin();

  const colegios = await prisma.colegio.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          estudiantes: true,
          usuarios: { where: { rol: "funcionario" } },
        },
      },
    },
  });

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold text-gray-900">Colegios</h1>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-medium text-gray-600">Nuevo colegio</h2>
        <CrearColegioForm />
      </section>

      <section className="flex flex-col gap-3">
        {colegios.map((colegio) => (
          <details
            key={colegio.id}
            className="group rounded-2xl border border-gray-100 bg-white p-5 sm:p-6"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 shrink-0 text-[#54A6D8]" />
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {colegio.nombre}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Código: {colegio.codigoRegistro} ·{" "}
                    {colegio._count.estudiantes} estudiantes ·{" "}
                    {colegio._count.usuarios} funcionarios · Creado el{" "}
                    {colegio.createdAt.toLocaleDateString("es-CL")}
                  </p>
                </div>
              </div>
              <Plus className="h-5 w-5 shrink-0 text-gray-400 group-open:hidden" />
              <Minus className="hidden h-5 w-5 shrink-0 text-gray-400 group-open:block" />
            </summary>

            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-600">
                Agregar administrador
              </h3>
              <AdminColegioForm colegioId={colegio.id} />
            </div>
          </details>
        ))}

        {colegios.length === 0 && (
          <p className="py-4 text-center text-base text-gray-500">
            Todavía no hay colegios registrados.
          </p>
        )}
      </section>
    </main>
  );
}

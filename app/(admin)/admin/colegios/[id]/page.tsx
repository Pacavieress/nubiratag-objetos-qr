import { notFound } from "next/navigation";
import { Minus, Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { VolverLink } from "@/components/volver-link";
import { requireSuperAdmin, desactivarAdmin } from "../actions";
import { NombreColegioForm } from "../nombre-colegio-form";
import { AdminColegioForm } from "../admin-colegio-form";
import { cambiarActivoFuncionario } from "../../funcionarios/actions";
import { CrearFuncionarioForm } from "../../funcionarios/crear-funcionario-form";

export default async function ColegioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();

  const { id } = await params;
  const colegioId = Number(id);

  if (!Number.isInteger(colegioId)) {
    notFound();
  }

  const colegio = await prisma.colegio.findUnique({
    where: { id: colegioId },
  });

  if (!colegio) {
    notFound();
  }

  const [admins, funcionarios, apoderados] = await Promise.all([
    prisma.usuario.findMany({
      where: { colegioId, rol: "admin" },
      orderBy: { nombre: "asc" },
    }),
    prisma.usuario.findMany({
      where: { colegioId, rol: "funcionario" },
      orderBy: { nombre: "asc" },
    }),
    prisma.usuario.findMany({
      where: { colegioId, rol: "apoderado" },
      include: { _count: { select: { hijos: true } } },
      orderBy: { nombre: "asc" },
    }),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <VolverLink href="/admin/colegios" />

      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {colegio.nombre}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Código: {colegio.codigoRegistro}
        </p>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-medium text-gray-600">
          Nombre del colegio
        </h2>
        <NombreColegioForm
          colegioId={colegio.id}
          nombreInicial={colegio.nombre}
        />
      </section>

      <details className="group rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden">
          <h2 className="text-base font-semibold text-gray-900">
            Administradores ({admins.length})
          </h2>
          <Plus className="h-5 w-5 shrink-0 text-gray-400 group-open:hidden" />
          <Minus className="hidden h-5 w-5 shrink-0 text-gray-400 group-open:block" />
        </summary>

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
          {admins.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {admin.nombre}
                </p>
                <p className="text-xs text-gray-500">{admin.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium ${
                    admin.activo ? "text-emerald-700" : "text-gray-400"
                  }`}
                >
                  {admin.activo ? "Activo" : "Inactivo"}
                </span>
                <form
                  action={desactivarAdmin.bind(
                    null,
                    admin.id,
                    !admin.activo
                  )}
                >
                  <button
                    type="submit"
                    className="text-xs font-medium text-[#54A6D8] underline"
                  >
                    {admin.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </div>
            </div>
          ))}
          {admins.length === 0 && (
            <p className="text-sm text-gray-500">
              Todavía no hay administradores.
            </p>
          )}

          <h3 className="mt-2 text-sm font-medium text-gray-600">
            Agregar administrador
          </h3>
          <AdminColegioForm colegioId={colegio.id} />
        </div>
      </details>

      <details className="group rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden">
          <h2 className="text-base font-semibold text-gray-900">
            Funcionarios ({funcionarios.length})
          </h2>
          <Plus className="h-5 w-5 shrink-0 text-gray-400 group-open:hidden" />
          <Minus className="hidden h-5 w-5 shrink-0 text-gray-400 group-open:block" />
        </summary>

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
          {funcionarios.map((funcionario) => (
            <div
              key={funcionario.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {funcionario.nombre}
                </p>
                <p className="text-xs text-gray-500">{funcionario.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium ${
                    funcionario.activo ? "text-emerald-700" : "text-gray-400"
                  }`}
                >
                  {funcionario.activo ? "Activo" : "Inactivo"}
                </span>
                <form
                  action={cambiarActivoFuncionario.bind(
                    null,
                    funcionario.id,
                    !funcionario.activo
                  )}
                >
                  <button
                    type="submit"
                    className="text-xs font-medium text-[#54A6D8] underline"
                  >
                    {funcionario.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </div>
            </div>
          ))}
          {funcionarios.length === 0 && (
            <p className="text-sm text-gray-500">
              Todavía no hay funcionarios.
            </p>
          )}

          <h3 className="mt-2 text-sm font-medium text-gray-600">
            Agregar funcionario
          </h3>
          <CrearFuncionarioForm
            esSuperAdmin={false}
            colegios={[]}
            colegioIdFijo={colegio.id}
          />
        </div>
      </details>

      <details className="group rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden">
          <h2 className="text-base font-semibold text-gray-900">
            Apoderados ({apoderados.length})
          </h2>
          <Plus className="h-5 w-5 shrink-0 text-gray-400 group-open:hidden" />
          <Minus className="hidden h-5 w-5 shrink-0 text-gray-400 group-open:block" />
        </summary>

        <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
          {apoderados.map((apoderado) => (
            <div
              key={apoderado.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {apoderado.nombre}
                </p>
                <p className="text-xs text-gray-500">{apoderado.email}</p>
              </div>
              <span className="text-xs text-gray-500">
                {apoderado._count.hijos} estudiante
                {apoderado._count.hijos === 1 ? "" : "s"}
              </span>
            </div>
          ))}
          {apoderados.length === 0 && (
            <p className="text-sm text-gray-500">Todavía no hay apoderados.</p>
          )}
        </div>
      </details>
    </main>
  );
}

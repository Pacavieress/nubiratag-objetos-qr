import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cambiarActivoFuncionario } from "./actions";
import { CrearFuncionarioForm } from "./crear-funcionario-form";

export default async function FuncionariosPage() {
  const session = await auth();
  const esSuperAdmin = session?.user?.rol === "superadmin";
  const colegioIdPropio = session?.user?.colegioId ?? null;

  const [funcionarios, colegios] = await Promise.all([
    prisma.usuario.findMany({
      where: {
        rol: "funcionario",
        ...(esSuperAdmin ? {} : { colegioId: colegioIdPropio! }),
      },
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

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold text-gray-900">Funcionarios</h1>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-medium text-gray-600">
          Nuevo funcionario
        </h2>
        <CrearFuncionarioForm esSuperAdmin={esSuperAdmin} colegios={colegios} />
      </section>

      <section className="flex flex-col gap-3">
        {funcionarios.map((funcionario) => (
          <div
            key={funcionario.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-5 sm:p-6"
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {funcionario.nombre}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {funcionario.email}
                {esSuperAdmin ? ` · ${funcionario.colegio!.nombre}` : ""}
              </p>
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
          <p className="py-4 text-center text-sm text-gray-500">
            Todavía no hay funcionarios registrados.
          </p>
        )}
      </section>
    </main>
  );
}

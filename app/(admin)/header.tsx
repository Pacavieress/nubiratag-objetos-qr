import type { RolUsuario } from "@prisma/client";

import { NombreColegio } from "@/components/nombre-colegio";

const ROL_LABEL: Record<RolUsuario, string> = {
  admin: "Administrador",
  funcionario: "Funcionario",
  apoderado: "Apoderado",
  superadmin: "Super Administrador",
};

export function Header({
  email,
  nombre,
  rol,
  nombreColegio,
}: {
  email: string | null | undefined;
  nombre: string | null | undefined;
  rol: RolUsuario | null | undefined;
  nombreColegio: string | null;
}) {
  // Prioriza el primer nombre real (Usuario.nombre, vía session.user.name)
  // sobre la parte del email — el email solo queda como respaldo para
  // cuentas que por algún motivo no tengan nombre cargado.
  const primerNombre = nombre?.trim().split(/\s+/)[0];
  const nombreDesdeUsuario = primerNombre
    ? primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1)
    : undefined;

  const usuario = email?.split("@")[0];
  const nombreDesdeEmail = usuario
    ? usuario.charAt(0).toUpperCase() + usuario.slice(1)
    : usuario;

  const nombreAMostrar = nombreDesdeUsuario ?? nombreDesdeEmail;

  return (
    <header className="border-b border-gray-100 bg-white print:hidden">
      <div className="flex items-center justify-between px-6 py-1.5 md:py-2">
        <p className="text-xl font-bold sm:text-2xl md:hidden">
          <span className="text-[#2c7bc0]">Nubira</span>
          <span className="text-[#ff914d]">Tag</span>
        </p>
        <div className="hidden min-w-0 flex-1 pr-4 md:block">
          <NombreColegio
            nombre={nombreColegio}
            className="text-sm font-medium text-gray-500"
          />
        </div>
        {nombreAMostrar && (
          <div className="ml-auto text-right leading-tight">
            <span className="block text-[13px] font-bold text-gray-600">
              {nombreAMostrar}
            </span>
            {rol && (
              <span className="block text-[11px] text-gray-400">
                {ROL_LABEL[rol]}
              </span>
            )}
            <NombreColegio
              nombre={nombreColegio}
              className="ml-auto max-w-[55vw] text-[11px] text-gray-400 md:hidden"
            />
          </div>
        )}
      </div>
    </header>
  );
}

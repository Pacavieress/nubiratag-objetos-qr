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
  rol,
  nombreColegio,
}: {
  email: string | null | undefined;
  rol: RolUsuario | null | undefined;
  nombreColegio: string | null;
}) {
  const usuario = email?.split("@")[0];
  const usuarioCapitalizado = usuario
    ? usuario.charAt(0).toUpperCase() + usuario.slice(1)
    : usuario;

  return (
    <header className="border-b border-gray-100 bg-white print:hidden">
      <div className="flex items-center justify-between px-6 py-3">
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
        {usuarioCapitalizado && (
          <div className="ml-auto text-right">
            <span className="block text-sm font-bold text-gray-600">
              {usuarioCapitalizado}
            </span>
            {rol && (
              <span className="block text-xs text-gray-400">
                {ROL_LABEL[rol]}
              </span>
            )}
          </div>
        )}
      </div>
      {nombreColegio && (
        <div className="px-6 pb-2 md:hidden">
          <NombreColegio nombre={nombreColegio} className="text-xs text-gray-400" />
        </div>
      )}
    </header>
  );
}

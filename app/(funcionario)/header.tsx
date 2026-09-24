import type { RolUsuario } from "@prisma/client";

const ROL_LABEL: Record<RolUsuario, string> = {
  admin: "Administrador",
  funcionario: "Funcionario",
  apoderado: "Apoderado",
  superadmin: "Super Administrador",
};

export function Header({
  email,
  rol,
}: {
  email: string | null | undefined;
  rol: RolUsuario | null | undefined;
}) {
  const usuario = email?.split("@")[0];
  const usuarioCapitalizado = usuario
    ? usuario.charAt(0).toUpperCase() + usuario.slice(1)
    : usuario;

  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3 print:hidden">
      <p className="text-xl font-bold sm:text-2xl lg:hidden">
        <span className="text-[#2c7bc0]">Nubira</span>
        <span className="text-[#ff914d]">Tag</span>
      </p>
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
    </header>
  );
}

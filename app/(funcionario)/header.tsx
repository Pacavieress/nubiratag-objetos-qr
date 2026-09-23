"use client";

import { usePathname } from "next/navigation";
import type { RolUsuario } from "@prisma/client";

import { NAV_ITEMS } from "./nav-items";

const ROL_LABEL: Record<RolUsuario, string> = {
  admin: "Administrador",
  funcionario: "Funcionario",
  apoderado: "Apoderado",
};

export function Header({
  email,
  rol,
}: {
  email: string | null | undefined;
  rol: RolUsuario | null | undefined;
}) {
  const pathname = usePathname();
  const itemActivo = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  const mostrarSeccion = itemActivo && itemActivo.href !== "/funcionario/hallazgos";

  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
      <div>
        <p className="text-sm lg:hidden">
          <span className="text-[#2c7bc0]">Nubira</span>
          <span className="text-[#ff914d]">Tag</span>
        </p>
        {mostrarSeccion && (
          <h1 className="text-base font-semibold text-gray-900">
            {itemActivo.label}
          </h1>
        )}
      </div>
      {email && (
        <div className="text-right">
          <span className="block text-sm font-bold text-gray-600">
            {email.split("@")[0]}
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

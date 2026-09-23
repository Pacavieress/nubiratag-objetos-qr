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
  esSuperAdmin,
}: {
  email: string | null | undefined;
  rol: RolUsuario | null | undefined;
  esSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const seccion =
    NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.label ?? "Panel";
  const etiquetaRol =
    rol === "admin" && esSuperAdmin
      ? "Super Administrador"
      : rol
        ? ROL_LABEL[rol]
        : null;

  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
      <div>
        <p className="text-sm lg:hidden">
          <span className="text-[#2c7bc0]">Nubira</span>
          <span className="text-[#ff914d]">Tag</span>
        </p>
        <h1 className="text-base font-semibold text-gray-900">{seccion}</h1>
      </div>
      {email && (
        <div className="text-right">
          <span className="block text-sm font-bold text-gray-600">
            {email.split("@")[0]}
          </span>
          {etiquetaRol && (
            <span className="block text-xs text-gray-400">{etiquetaRol}</span>
          )}
        </div>
      )}
    </header>
  );
}

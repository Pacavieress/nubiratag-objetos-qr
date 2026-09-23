"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, UserPlus } from "lucide-react";

import { cerrarSesion } from "./actions";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 flex-col bg-white border-r border-gray-100 print:hidden">
      <div className="px-4 py-2">
        <span className="text-2xl font-semibold">
          <span className="text-[#2c7bc0]">Nubira</span>
          <span className="text-[#ff914d]">Tag</span>
        </span>
      </div>

      <nav className="flex-1 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const activo =
            pathname.startsWith(item.href) &&
            !pathname.startsWith("/apoderado/estudiantes/nuevo");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border-l-4 text-[13px] transition ${
                activo
                  ? "border-transparent text-[#54A6D8]"
                  : "border-transparent text-gray-600 hover:border-[#54A6D8] hover:bg-[#54A6D8]/5 hover:text-gray-900"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {/* Ítem fijo, no viene de NAV_ITEMS: no es una sección de
            navegación, es el mismo atajo de alta que "Agregar" en el
            bottom nav de móvil (ese es lg:hidden, así que en desktop
            este es el único punto de entrada). */}
        <Link
          href="/apoderado/estudiantes/nuevo"
          className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border-l-4 text-[13px] transition ${
            pathname.startsWith("/apoderado/estudiantes/nuevo")
              ? "border-transparent text-[#54A6D8]"
              : "border-transparent text-gray-600 hover:border-[#54A6D8] hover:bg-[#54A6D8]/5 hover:text-gray-900"
          }`}
        >
          <UserPlus className="w-5 h-5" />
          <span>Agregar estudiante</span>
        </Link>
      </nav>

      <div className="h-px bg-gray-100 my-2" />

      <div className="px-3 pb-4">
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="group flex w-full items-center gap-3 px-3 py-2.5 rounded-xl border-l-4 border-transparent text-gray-600 transition hover:border-[#54A6D8] hover:bg-[#54A6D8]/5 hover:text-gray-900"
          >
            <LogOut className="w-5 h-5" />
            <span>Cerrar Sesión</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

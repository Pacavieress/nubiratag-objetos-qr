"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { cerrarSesion } from "./actions";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar({ esSuperAdmin }: { esSuperAdmin: boolean }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) =>
      (!item.soloSuperAdmin || esSuperAdmin) &&
      (!item.soloAdminColegio || !esSuperAdmin)
  );

  return (
    <aside className="hidden md:flex w-64 flex-col bg-white border-r border-gray-100">
      <div className="px-4 py-2">
        <span className="text-2xl font-semibold">
          <span className="text-[#2c7bc0]">Nubira</span>
          <span className="text-[#ff914d]">Tag</span>
        </span>
      </div>

      <nav className="flex-1 px-3 flex flex-col gap-1">
        {items.map((item) => {
          const activo = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border-l-4 text-[13px] transition ${
                activo
                  ? "border-[#54A6D8] bg-[#54A6D8]/10 text-[#54A6D8]"
                  : "border-transparent text-gray-600 hover:border-[#54A6D8] hover:bg-[#54A6D8]/5 hover:text-gray-900"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
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

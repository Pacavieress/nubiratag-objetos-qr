"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, UserPlus } from "lucide-react";

import { cerrarSesion } from "./actions";
import { NAV_ITEMS } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();
  const [tecladoAbierto, setTecladoAbierto] = useState(false);

  // Detecta el teclado por foco, no por tamaño de viewport: se oculta el
  // nav mientras el elemento enfocado sea un campo de texto real (no un
  // checkbox/radio/botón, que no abren teclado). El setTimeout en
  // focusout evita el parpadeo al saltar de un input a otro: si el nuevo
  // foco (document.activeElement) sigue siendo un campo de texto, no se
  // vuelve a mostrar el nav.
  useEffect(() => {
    function esCampoDeTexto(el: Element | null): boolean {
      if (!el) return false;
      if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
      if (el.tagName === "INPUT") {
        const tipo = (el as HTMLInputElement).type;
        return !["checkbox", "radio", "button", "submit"].includes(tipo);
      }
      return false;
    }

    function handleFocusIn(e: FocusEvent) {
      if (esCampoDeTexto(e.target as Element)) {
        setTecladoAbierto(true);
      }
    }

    function handleFocusOut() {
      setTimeout(() => {
        if (!esCampoDeTexto(document.activeElement)) {
          setTecladoAbierto(false);
        }
      }, 100);
    }

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  if (tecladoAbierto) return null;

  return (
    <nav className="shrink-0 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] pt-2 lg:hidden print:hidden">
      <ul
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${NAV_ITEMS.length + 2}, minmax(0, 1fr))`,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const activo =
            pathname.startsWith(item.href) &&
            !pathname.startsWith("/apoderado/estudiantes/nuevo");
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex w-full flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium select-none transition-transform duration-150 active:scale-[0.92] [-webkit-tap-highlight-color:transparent] ${
                  activo ? "text-[#54A6D8]" : "text-gray-400"
                }`}
              >
                <Icon className="h-6 w-6" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          {/* Ítem fijo, no viene de NAV_ITEMS: no es una sección de
              navegación, es un atajo directo al formulario de alta. */}
          <Link
            href="/apoderado/estudiantes/nuevo"
            className={`flex w-full flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium select-none transition-transform duration-150 active:scale-[0.92] [-webkit-tap-highlight-color:transparent] ${
              pathname.startsWith("/apoderado/estudiantes/nuevo")
                ? "text-[#54A6D8]"
                : "text-gray-400"
            }`}
          >
            <UserPlus className="h-6 w-6" />
            <span>Agregar</span>
          </Link>
        </li>
        <li>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="flex w-full flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium text-gray-400 select-none transition-transform duration-150 active:scale-[0.92] [-webkit-tap-highlight-color:transparent]"
            >
              <LogOut className="h-6 w-6" />
              <span>Salir</span>
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );
}

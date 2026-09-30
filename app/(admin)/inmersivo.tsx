"use client";

import { createContext, useContext, useState } from "react";

// Pantalla inmersiva (hoy, la fase "grabar" de /admin/grabacion): oculta
// Sidebar, Header y BottomNav y deja el contenedor interno sin padding ni
// scroll, sin recurrir a `fixed` (ver CLAUDE.md).
const Ctx = createContext<{ activo: boolean; setActivo: (v: boolean) => void }>({
  activo: false,
  setActivo: () => {},
});

export const useInmersivo = () => useContext(Ctx);

export function InmersivoProvider({ children }: { children: React.ReactNode }) {
  const [activo, setActivo] = useState(false);
  return <Ctx.Provider value={{ activo, setActivo }}>{children}</Ctx.Provider>;
}

// `contents` no altera el layout flex; `hidden` lo saca sin desmontar.
export function OcultarEnInmersivo({
  children,
}: {
  children: React.ReactNode;
}) {
  const { activo } = useInmersivo();
  return <div className={activo ? "hidden" : "contents"}>{children}</div>;
}

export function AreaContenido({ children }: { children: React.ReactNode }) {
  const { activo } = useInmersivo();
  return (
    <div
      className={`min-h-0 flex-1 overscroll-contain ${
        activo
          ? "relative overflow-hidden"
          : "overflow-y-auto p-6 [-webkit-overflow-scrolling:touch]"
      }`}
    >
      {children}
    </div>
  );
}

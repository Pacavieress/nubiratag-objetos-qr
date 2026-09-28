import { Backpack, BookOpen, Glasses, Shirt } from "lucide-react";

// Mismos íconos y colores de marca que el fondo de app/(auth)/login/page.tsx.
// Server component puro: animate-bounce/animate-pulse son keyframes que
// Tailwind ya trae, solo el delay de cada ícono es un valor inline — no
// hace falta "use client" ni tocar globals.css.
const ICONOS = [
  { Icono: Backpack, color: "#2c7bc0", delay: "0ms" },
  { Icono: Shirt, color: "#ff914d", delay: "150ms" },
  { Icono: Glasses, color: "#2c7bc0", delay: "300ms" },
  { Icono: BookOpen, color: "#ff914d", delay: "450ms" },
];

export default function Loading() {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-white">
      <div className="flex items-center gap-3">
        {ICONOS.map(({ Icono, color, delay }, i) => (
          <Icono
            key={i}
            className="h-8 w-8 animate-bounce"
            style={{ color, animationDelay: delay }}
          />
        ))}
      </div>
      <span className="animate-pulse text-sm font-medium text-gray-400">
        Cargando...
      </span>
    </main>
  );
}

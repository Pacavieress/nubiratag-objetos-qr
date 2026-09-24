import {
  Backpack,
  BookOpen,
  Briefcase,
  CupSoda,
  Glasses,
  GraduationCap,
  Pencil,
  Shirt,
} from "lucide-react";

import { LockScroll } from "@/components/lock-scroll";
import { RegistroForm } from "./registro-form";

// Posiciones fijas (no random en render, para que login y registro se
// vean idénticos y no haya hydration mismatch). Objetos escolares típicos;
// se descartó el balón porque se pierde de vista en movimiento durante el
// juego, no es algo que tenga sentido etiquetar con un QR.
const ICONOS_FONDO = [
  { Icono: Backpack, top: 4, left: 6, rot: -30, size: 32, color: "#2c7bc0" },
  { Icono: Shirt, top: 2, left: 38, rot: 15, size: 26, color: "#ff914d" },
  { Icono: Glasses, top: 6, left: 68, rot: -8, size: 28, color: "#2c7bc0" },
  { Icono: Pencil, top: 8, left: 92, rot: 33, size: 24, color: "#ff914d" },
  { Icono: BookOpen, top: 14, left: 20, rot: -20, size: 38, color: "#2c7bc0" },
  { Icono: CupSoda, top: 16, left: 50, rot: 10, size: 26, color: "#ff914d" },
  {
    Icono: GraduationCap,
    top: 12,
    left: 80,
    rot: -25,
    size: 34,
    color: "#2c7bc0",
  },
  { Icono: Briefcase, top: 20, left: 5, rot: 20, size: 28, color: "#ff914d" },
  { Icono: Backpack, top: 24, left: 35, rot: -15, size: 30, color: "#2c7bc0" },
  { Icono: Shirt, top: 22, left: 62, rot: 28, size: 24, color: "#ff914d" },
  { Icono: Glasses, top: 26, left: 88, rot: -35, size: 38, color: "#2c7bc0" },
  { Icono: Pencil, top: 32, left: 15, rot: 12, size: 32, color: "#ff914d" },
  { Icono: BookOpen, top: 34, left: 45, rot: -10, size: 28, color: "#2c7bc0" },
  { Icono: CupSoda, top: 30, left: 72, rot: 24, size: 24, color: "#ff914d" },
  {
    Icono: GraduationCap,
    top: 38,
    left: 95,
    rot: -18,
    size: 30,
    color: "#2c7bc0",
  },
  { Icono: Briefcase, top: 42, left: 25, rot: 35, size: 26, color: "#ff914d" },
  { Icono: Backpack, top: 46, left: 55, rot: -28, size: 34, color: "#2c7bc0" },
  { Icono: Shirt, top: 44, left: 8, rot: 8, size: 24, color: "#ff914d" },
  { Icono: Glasses, top: 50, left: 82, rot: -12, size: 28, color: "#2c7bc0" },
  { Icono: Pencil, top: 54, left: 40, rot: 40, size: 26, color: "#ff914d" },
  { Icono: BookOpen, top: 58, left: 65, rot: -22, size: 32, color: "#2c7bc0" },
  { Icono: CupSoda, top: 56, left: 18, rot: 16, size: 24, color: "#ff914d" },
  {
    Icono: GraduationCap,
    top: 62,
    left: 92,
    rot: -30,
    size: 38,
    color: "#2c7bc0",
  },
  { Icono: Briefcase, top: 66, left: 48, rot: 22, size: 28, color: "#ff914d" },
  { Icono: Backpack, top: 70, left: 10, rot: -18, size: 30, color: "#2c7bc0" },
  { Icono: Shirt, top: 68, left: 78, rot: 30, size: 26, color: "#ff914d" },
  { Icono: Glasses, top: 74, left: 32, rot: -8, size: 24, color: "#2c7bc0" },
  { Icono: Pencil, top: 78, left: 58, rot: 38, size: 28, color: "#ff914d" },
  { Icono: BookOpen, top: 82, left: 88, rot: -25, size: 32, color: "#2c7bc0" },
  { Icono: CupSoda, top: 86, left: 15, rot: 14, size: 26, color: "#ff914d" },
  {
    Icono: GraduationCap,
    top: 90,
    left: 42,
    rot: -32,
    size: 34,
    color: "#2c7bc0",
  },
  { Icono: Briefcase, top: 94, left: 70, rot: 18, size: 28, color: "#ff914d" },
] as const;

export default function RegistroPage() {
  return (
    <main className="relative isolate flex h-dvh w-full overflow-hidden overscroll-none">
      <LockScroll />

      {/* Fondo sutil solo mobile: patrón de íconos de objetos escolares a
          opacity muy baja. Oculto en desktop (lg:hidden), donde el panel
          de marca de abajo se ve normal. */}
      <div
        className="absolute inset-0 -z-10 overflow-hidden lg:hidden"
        aria-hidden="true"
      >
        {ICONOS_FONDO.map(({ Icono, top, left, rot, size, color }, i) => (
          <Icono
            key={i}
            style={{
              position: "absolute",
              top: `${top}%`,
              left: `${left}%`,
              width: size,
              height: size,
              color,
              opacity: 0.085,
              transform: `rotate(${rot}deg)`,
            }}
          />
        ))}
      </div>

      {/* Panel de marca: solo desktop */}
      <div
        className="relative hidden w-1/2 shrink-0 bg-cover bg-center lg:flex lg:flex-col lg:justify-end"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1594608661623-aa0bd3a69d98?auto=format&fit=crop&w=1600&q=80')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="relative px-12 pb-16">
          <p className="text-3xl font-semibold leading-tight text-white">
            Cada mochila, cada estuche, cada chaqueta,
            <br />
            siempre de vuelta a casa.
          </p>
          <p className="mt-3 text-sm text-white/80">
            NubiraTag conecta los objetos de tus hijos con su dueño en el
            colegio.
          </p>
        </div>
      </div>

      {/* Formulario: ancho completo en mobile, mitad derecha en desktop */}
      <div className="flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-white/95 lg:w-1/2 lg:bg-white">
        <div className="mx-auto flex w-full max-w-[320px] flex-1 flex-col justify-center px-6 py-12">
          {/* Tagline: solo mobile, arriba del logo */}
          <div className="mb-4 text-center lg:hidden">
            <p className="text-xs font-medium leading-snug text-gray-600">
              Cada mochila, cada estuche, cada chaqueta, siempre de vuelta a
              casa.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              NubiraTag conecta los objetos de tus hijos con su dueño en el
              colegio.
            </p>
          </div>

          <div className="mb-6 text-center">
            <span className="text-4xl font-semibold">
              <span className="text-[#2c7bc0]">Nubira</span>
              <span className="text-[#ff914d]">Tag</span>
            </span>
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-xl font-semibold text-gray-900">
              Crea tu cuenta
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Regístrate para gestionar los objetos de tus hijos.
            </p>
          </div>

          <RegistroForm />
        </div>
      </div>
    </main>
  );
}

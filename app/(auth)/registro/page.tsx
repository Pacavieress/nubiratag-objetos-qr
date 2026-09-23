import { LockScroll } from "@/components/lock-scroll";
import { RegistroForm } from "./registro-form";

export default function RegistroPage() {
  return (
    <main className="flex h-dvh w-full overflow-hidden overscroll-none">
      <LockScroll />

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
            Cada mochila, cada chaqueta,
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
      <div className="flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-white lg:w-1/2">
        <div className="mx-auto flex w-full max-w-[320px] flex-1 flex-col justify-center px-6 py-12">
          <div className="mb-6 text-center">
            <span className="text-3xl font-semibold">
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

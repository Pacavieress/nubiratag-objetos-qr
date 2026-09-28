import { LockScroll } from "@/components/lock-scroll";
import { ReenviarVerificacionForm } from "./reenviar-verificacion-form";

export default function ReenviarVerificacionPage() {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-hidden overscroll-none bg-white px-6">
      <LockScroll />

      <div className="mx-auto flex w-full max-w-[320px] flex-col">
        <div className="mb-6 text-center">
          <span className="text-4xl font-semibold">
            <span className="text-[#2c7bc0]">Nubira</span>
            <span className="text-[#ff914d]">Tag</span>
          </span>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            Reenviar verificación
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingresa tu correo y te mandamos un enlace nuevo si tu cuenta lo
            necesita.
          </p>
        </div>

        <ReenviarVerificacionForm />
      </div>
    </main>
  );
}

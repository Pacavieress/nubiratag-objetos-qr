import Link from "next/link";
import { Mail } from "lucide-react";

import { LockScroll } from "@/components/lock-scroll";

export default function RegistroExitoPage() {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-hidden overscroll-none bg-white px-6 text-center">
      <LockScroll />

      <span className="text-3xl font-semibold">
        <span className="text-[#2c7bc0]">Nubira</span>
        <span className="text-[#ff914d]">Tag</span>
      </span>

      <Mail className="mt-8 h-10 w-10 text-[#54A6D8]" />

      <h1 className="mt-4 text-xl font-semibold text-gray-900">
        Revisa tu correo
      </h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Te enviamos un enlace de verificación. Ábrelo para activar tu cuenta
        e iniciar sesión.
      </p>

      <Link
        href="/login"
        className="mt-8 text-sm font-medium text-[#54A6D8] hover:underline"
      >
        Volver a inicio de sesión
      </Link>
    </main>
  );
}

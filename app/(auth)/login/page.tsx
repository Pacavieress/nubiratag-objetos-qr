import { LockScroll } from "@/components/lock-scroll";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="h-dvh w-full overflow-hidden overscroll-none bg-white">
      <LockScroll />
      <div className="mx-auto flex h-full w-full max-w-[320px] flex-col px-6 pt-[140px]">
        <div className="mb-6 text-center">
          <span className="text-3xl font-semibold">
            <span className="text-[#2c7bc0]">Nubira</span>
            <span className="text-[#ff914d]">Tag</span>
          </span>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            ¡Hola de nuevo!
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingresa tus datos para continuar.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}

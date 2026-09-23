"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";

import { authenticate } from "./actions";

export function LoginForm() {
  const [errorMessage, formAction, pending] = useActionState(
    authenticate,
    undefined
  );
  const [mostrarPassword, setMostrarPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-xs font-medium tracking-wide text-gray-500"
        >
          CORREO ELECTRÓNICO
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-[16px] focus:border-[#54A6D8] focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-xs font-medium tracking-wide text-gray-500"
        >
          CONTRASEÑA
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="password"
            name="password"
            type={mostrarPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-12 text-[16px] focus:border-[#54A6D8] focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMostrarPassword((v) => !v)}
            aria-label={
              mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {mostrarPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        {/* TODO: ajustar maxAge/expiración de la sesión en lib/auth.ts
            según este valor. Por ahora solo viaja en el form, sin efecto. */}
        <input
          type="checkbox"
          name="mantenerSesion"
          className="h-4 w-4 rounded border-gray-300 text-[#54A6D8] focus:ring-[#54A6D8]"
        />
        Mantener sesión
      </label>

      {errorMessage && (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-black py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? (
          "Ingresando..."
        ) : (
          <>
            Ingresar
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}

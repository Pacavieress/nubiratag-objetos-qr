"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";

import { registrarApoderado } from "./actions";

export function RegistroForm() {
  const [errorMessage, formAction, pending] = useActionState(
    registrarApoderado,
    undefined
  );
  const [mostrarPassword, setMostrarPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="nombre"
          className="text-xs font-medium tracking-wide text-gray-500"
        >
          NOMBRE COMPLETO
        </label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            autoComplete="name"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-[16px] transition-colors focus:border-[#54A6D8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
          />
        </div>
      </div>

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
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-[16px] transition-colors focus:border-[#54A6D8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
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
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-12 text-[16px] transition-colors focus:border-[#54A6D8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
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
        <p className="text-xs text-gray-400">Mínimo 8 caracteres.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="confirmarPassword"
          className="text-xs font-medium tracking-wide text-gray-500"
        >
          CONFIRMAR CONTRASEÑA
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="confirmarPassword"
            name="confirmarPassword"
            type={mostrarPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-[16px] transition-colors focus:border-[#54A6D8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
          />
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#54A6D8] py-2.5 text-sm font-medium text-white transition hover:bg-[#478db8] disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creando cuenta...
          </>
        ) : (
          <>
            Crear cuenta
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="text-center text-sm text-gray-500">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-[#54A6D8] hover:underline"
        >
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

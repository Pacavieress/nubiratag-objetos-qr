"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
} from "lucide-react";

import { reenviarVerificacion } from "./actions";

export function ReenviarVerificacionForm() {
  const [estado, formAction, pending] = useActionState(
    reenviarVerificacion,
    undefined
  );

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
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-[16px] transition-colors focus:border-[#54A6D8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#54A6D8]"
          />
        </div>
      </div>

      {estado?.ok && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{estado.mensaje}</p>
        </div>
      )}

      {estado && !estado.ok && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{estado.mensaje}</p>
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
            Enviando...
          </>
        ) : (
          <>
            Enviar enlace
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="text-center text-sm text-gray-500">
        <Link
          href="/login"
          className="font-medium text-[#54A6D8] hover:underline"
        >
          Volver a inicio de sesión
        </Link>
      </p>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { BotonSubmit } from "@/components/boton-submit";
import { crearAdminColegio } from "./actions";

export function AdminColegioForm({ colegioId }: { colegioId: number }) {
  const [error, formAction] = useActionState(
    crearAdminColegio.bind(null, colegioId),
    undefined
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`nombre-${colegioId}`}
          className="text-xs font-medium text-gray-600"
        >
          Nombre
        </label>
        <input
          id={`nombre-${colegioId}`}
          name="nombre"
          required
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`email-${colegioId}`}
          className="text-xs font-medium text-gray-600"
        >
          Correo electrónico
        </label>
        <input
          id={`email-${colegioId}`}
          name="email"
          type="email"
          required
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`password-${colegioId}`}
          className="text-xs font-medium text-gray-600"
        >
          Contraseña
        </label>
        <input
          id={`password-${colegioId}`}
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <BotonSubmit label="Crear administrador" loadingLabel="Creando..." />
    </form>
  );
}

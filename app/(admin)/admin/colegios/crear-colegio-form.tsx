"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { BotonSubmit } from "@/components/boton-submit";
import { crearColegio } from "./actions";

export function CrearColegioForm() {
  const [error, formAction] = useActionState(crearColegio, undefined);

  return (
    <form
      action={formAction}
      className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="nombre" className="text-sm font-medium text-gray-600">
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          placeholder="p. ej. Colegio San Ejemplo"
          className="rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <label
          htmlFor="codigoRegistro"
          className="text-sm font-medium text-gray-600"
        >
          Código de registro
        </label>
        <input
          id="codigoRegistro"
          name="codigoRegistro"
          required
          placeholder="p. ej. SANEJEMPLO2026"
          className="rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <BotonSubmit label="Crear colegio" loadingLabel="Creando..." />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 sm:basis-full"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { actualizarCodigoRegistro } from "./actions";

export function CodigoColegioForm({
  colegioId,
  codigoInicial,
}: {
  colegioId: number;
  codigoInicial: string;
}) {
  const [estado, formAction, isPending] = useActionState(
    actualizarCodigoRegistro.bind(null, colegioId),
    undefined
  );

  return (
    <form action={formAction} className="mt-3 flex items-center gap-2">
      <input
        key={codigoInicial}
        name="codigoRegistro"
        defaultValue={codigoInicial}
        required
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
      />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-[#54A6D8] underline disabled:opacity-50"
      >
        {isPending ? "Guardando..." : "Guardar"}
      </button>
      {estado?.guardado && !isPending && (
        <span className="text-xs text-emerald-700">Guardado</span>
      )}
      {estado && !estado.guardado && !isPending && (
        <span className="text-xs text-red-600">{estado.error}</span>
      )}
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { actualizarEtiquetaQr } from "../actions";

export function EtiquetaForm({
  qrId,
  etiquetaInicial,
}: {
  qrId: number;
  etiquetaInicial: string | null;
}) {
  const [estado, formAction, isPending] = useActionState(
    actualizarEtiquetaQr.bind(null, qrId),
    undefined
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      {/* key sobre el valor guardado: fuerza el remonte del input (y por
          lo tanto que se re-aplique defaultValue) cuando el guardado
          cambia el dato, ya que React no vuelve a aplicar defaultValue
          en un input no controlado que sigue montado. */}
      <input
        key={etiquetaInicial ?? ""}
        name="etiqueta"
        defaultValue={etiquetaInicial ?? ""}
        placeholder="p. ej. mochila"
        className="border rounded px-2 py-1"
      />
      <button
        type="submit"
        disabled={isPending}
        className="underline text-xs disabled:opacity-50"
      >
        {isPending ? "Guardando..." : "Guardar"}
      </button>
      {estado?.guardado && !isPending && (
        <span className="text-xs text-green-700">Guardado</span>
      )}
    </form>
  );
}

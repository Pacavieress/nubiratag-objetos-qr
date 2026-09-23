"use client";

import { useActionState } from "react";

import { actualizarNombreUbicacion } from "./actions";

export function NombreForm({
  ubicacionId,
  nombreInicial,
}: {
  ubicacionId: number;
  nombreInicial: string;
}) {
  const [estado, formAction, isPending] = useActionState(
    actualizarNombreUbicacion.bind(null, ubicacionId),
    undefined
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      {/* key sobre el valor guardado: fuerza el remonte para que se
          re-aplique defaultValue tras un guardado exitoso (mismo fix
          que en la etiqueta de QR, Etapa 2). */}
      <input
        key={nombreInicial}
        name="nombre"
        defaultValue={nombreInicial}
        required
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

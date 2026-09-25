"use client";

import { useActionState } from "react";

import { actualizarNombreColegio } from "./actions";

export function NombreColegioForm({
  colegioId,
  nombreInicial,
}: {
  colegioId: number;
  nombreInicial: string;
}) {
  const [estado, formAction, isPending] = useActionState(
    actualizarNombreColegio.bind(null, colegioId),
    undefined
  );

  return (
    <form action={formAction} className="mt-3 flex items-center gap-2">
      {/* key sobre el valor guardado: fuerza el remonte para que se
          re-aplique defaultValue tras un guardado exitoso (mismo fix
          que en Ubicaciones). */}
      <input
        key={nombreInicial}
        name="nombre"
        defaultValue={nombreInicial}
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
    </form>
  );
}

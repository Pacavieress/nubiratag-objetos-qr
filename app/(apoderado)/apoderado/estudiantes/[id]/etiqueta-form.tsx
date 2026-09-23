"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";

import { actualizarEtiquetaQr } from "../actions";

export function EtiquetaForm({
  estudianteId,
  qrId,
  etiquetaInicial,
  children,
}: {
  estudianteId: number;
  qrId: number;
  etiquetaInicial: string | null;
  children?: ReactNode;
}) {
  const [estado, formAction, isPending] = useActionState(
    actualizarEtiquetaQr.bind(null, qrId),
    undefined
  );
  const formId = `etiqueta-form-${qrId}`;

  return (
    <div className="flex flex-col gap-2">
      <form id={formId} action={formAction} className="flex items-center gap-2">
        {/* key sobre el valor guardado: fuerza el remonte del input (y por
            lo tanto que se re-aplique defaultValue) cuando el guardado
            cambia el dato, ya que React no vuelve a aplicar defaultValue
            en un input no controlado que sigue montado. */}
        <input
          key={etiquetaInicial ?? ""}
          name="etiqueta"
          defaultValue={etiquetaInicial ?? ""}
          placeholder="p. ej. mochila"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
        <Link
          href={`/apoderado/estudiantes/${estudianteId}/qr/${qrId}`}
          className="shrink-0 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
        >
          Ver QR
        </Link>
      </form>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          form={formId}
          disabled={isPending}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
        <div className="flex-1">{children}</div>
      </div>

      {estado?.guardado && !isPending && (
        <span className="text-sm text-green-700">Guardado</span>
      )}
    </div>
  );
}

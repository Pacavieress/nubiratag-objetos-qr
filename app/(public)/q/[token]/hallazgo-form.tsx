"use client";

import { useActionState } from "react";

import { registrarHallazgo, type EstadoRegistro } from "./actions";

export function HallazgoForm({
  qrCodigoId,
  ubicaciones,
}: {
  qrCodigoId: number;
  ubicaciones: { id: number; nombre: string }[];
}) {
  const [estado, formAction, isPending] = useActionState<
    EstadoRegistro,
    FormData
  >(registrarHallazgo.bind(null, qrCodigoId), undefined);

  if (estado?.ok) {
    return (
      <p className="mt-4 text-sm text-green-700">
        Hallazgo registrado correctamente.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-4 flex max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="ubicacionId">Ubicación</label>
        <select
          id="ubicacionId"
          name="ubicacionId"
          required
          defaultValue=""
          className="border rounded px-3 py-2"
        >
          <option value="" disabled>
            Selecciona una ubicación
          </option>
          {ubicaciones.map((ubicacion) => (
            <option key={ubicacion.id} value={ubicacion.id}>
              {ubicacion.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="nota">Nota (opcional)</label>
        <textarea
          id="nota"
          name="nota"
          rows={3}
          className="border rounded px-3 py-2"
        />
      </div>
      {estado?.ok === false && (
        <p className="text-sm text-red-600" role="alert">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Registrando..." : "Registrar hallazgo"}
      </button>
    </form>
  );
}

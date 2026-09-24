"use client";

import { useActionState, useState } from "react";

import { BotonSubmit } from "@/components/boton-submit";
import { registrarHallazgo, type EstadoRegistro } from "./actions";

export function HallazgoForm({
  qrCodigoId,
  ubicaciones,
}: {
  qrCodigoId: number;
  ubicaciones: { id: number; nombre: string }[];
}) {
  const [ubicacionId, setUbicacionId] = useState<number | null>(null);
  const [estado, formAction] = useActionState<EstadoRegistro, FormData>(
    registrarHallazgo.bind(null, qrCodigoId),
    undefined
  );

  if (estado?.ok) {
    return (
      <p className="mt-4 text-sm text-green-700">
        Hallazgo registrado correctamente.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      {/* Selección + confirmar, no un solo toque: en un celular, con el
          objeto recién encontrado en una mano, es fácil rozar el botón
          equivocado. Este paso extra da un momento visual de "¿es esta
          la ubicación correcta?" antes de comprometer el registro. */}
      <input type="hidden" name="ubicacionId" value={ubicacionId ?? ""} />

      <div className="grid grid-cols-2 gap-3">
        {ubicaciones.map((ubicacion) => (
          <button
            key={ubicacion.id}
            type="button"
            onClick={() => setUbicacionId(ubicacion.id)}
            className={`rounded-lg border px-4 py-6 text-base font-medium transition ${
              ubicacionId === ubicacion.id
                ? "border-[#54A6D8] bg-[#54A6D8] text-white"
                : "border-gray-300 text-gray-900"
            }`}
          >
            {ubicacion.nombre}
          </button>
        ))}
      </div>

      {estado?.ok === false && (
        <p className="text-sm text-red-600" role="alert">
          {estado.error}
        </p>
      )}

      <BotonSubmit
        label="Confirmar"
        loadingLabel="Registrando..."
        disabled={ubicacionId === null}
      />
    </form>
  );
}

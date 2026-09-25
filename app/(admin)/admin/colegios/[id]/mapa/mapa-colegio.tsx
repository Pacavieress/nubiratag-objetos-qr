"use client";

import { useActionState, useMemo } from "react";

import { actualizarDireccionColegio } from "../../../ubicaciones/actions";
import { SelectorUbicacion } from "./selector-ubicacion";

type Ubicacion = {
  id: number;
  nombre: string;
  activo: boolean;
  latitud: number | null;
  longitud: number | null;
};

export function MapaColegio({
  colegioId,
  direccionInicial,
  centroInicial,
  ubicaciones,
}: {
  colegioId: number;
  direccionInicial: string;
  centroInicial: [number, number] | null;
  ubicaciones: Ubicacion[];
}) {
  const [estado, formAction, isPending] = useActionState(
    actualizarDireccionColegio.bind(null, colegioId),
    undefined
  );

  // Si se acaba de guardar/geocodificar una dirección nueva, usa ese
  // centro; si no, el que ya traía el colegio desde el servidor.
  const centroDefecto = useMemo<[number, number] | undefined>(() => {
    if (estado?.guardado && estado.lat != null && estado.lng != null) {
      return [estado.lat, estado.lng];
    }
    return centroInicial ?? undefined;
  }, [estado, centroInicial]);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label
            htmlFor="direccion"
            className="text-sm font-medium text-gray-600"
          >
            Dirección del colegio
          </label>
          <input
            key={direccionInicial}
            id="direccion"
            name="direccion"
            defaultValue={direccionInicial}
            placeholder="p. ej. Av. Siempre Viva 123, Santiago"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-[#54A6D8] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Guardar dirección"}
        </button>
      </form>
      {estado && !estado.guardado && (
        <p className="text-xs text-red-600">{estado.error}</p>
      )}
      {estado?.guardado && estado.lat == null && (
        <p className="text-xs text-gray-500">
          Dirección guardada, pero no se pudo ubicar en el mapa
          automáticamente.
        </p>
      )}

      <SelectorUbicacion
        colegioId={colegioId}
        ubicaciones={ubicaciones}
        centroDefecto={centroDefecto}
      />
    </div>
  );
}

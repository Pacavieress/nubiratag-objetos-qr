"use client";

import { useActionState, useMemo } from "react";
import dynamic from "next/dynamic";

import { actualizarDireccionColegio } from "../../../ubicaciones/actions";
import { SelectorUbicacion } from "./selector-ubicacion";

// ssr:false: Leaflet toca `window` y no puede renderizarse en el servidor.
const MapaUbicacionSoloLectura = dynamic(
  () =>
    import("../../../ubicaciones/mapa-ubicacion-solo-lectura").then(
      (m) => m.MapaUbicacionSoloLectura
    ),
  { ssr: false }
);

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
        <div className="max-w-md flex flex-col gap-1.5">
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
            className="max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
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

      <section className="flex flex-col gap-3 border-t border-gray-100 pt-6">
        <h2 className="text-sm font-medium text-gray-600">
          Ubicaciones de este colegio
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ubicaciones.map((ubicacion) => (
            <div
              key={ubicacion.id}
              className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {ubicacion.nombre}
                </span>
                <span
                  className={`text-xs font-medium ${
                    ubicacion.activo ? "text-emerald-700" : "text-gray-400"
                  }`}
                >
                  {ubicacion.activo ? "Activa" : "Inactiva"}
                </span>
              </div>
              {ubicacion.latitud != null && ubicacion.longitud != null ? (
                <MapaUbicacionSoloLectura
                  latitud={ubicacion.latitud}
                  longitud={ubicacion.longitud}
                />
              ) : (
                <div className="flex h-[150px] w-[200px] items-center justify-center rounded border border-dashed border-gray-300 text-xs text-gray-400">
                  Sin ubicar
                </div>
              )}
            </div>
          ))}

          {ubicaciones.length === 0 && (
            <p className="text-sm text-gray-500">
              Todavía no hay ubicaciones.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

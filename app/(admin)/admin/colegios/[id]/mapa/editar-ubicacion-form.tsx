"use client";

import { useActionState } from "react";
import dynamic from "next/dynamic";

import {
  actualizarNombreUbicacion,
  cambiarActivoUbicacion,
} from "../../../ubicaciones/actions";

// ssr:false: Leaflet toca `window` y no puede renderizarse en el servidor.
const MapaUbicacion = dynamic(
  () => import("../../../ubicaciones/mapa-ubicacion").then((m) => m.MapaUbicacion),
  { ssr: false }
);

export function EditarUbicacionForm({
  ubicacionId,
  nombreInicial,
  latitudInicial,
  longitudInicial,
  activo,
  centroDefecto,
}: {
  ubicacionId: number;
  nombreInicial: string;
  latitudInicial: number | null;
  longitudInicial: number | null;
  activo: boolean;
  centroDefecto?: [number, number];
}) {
  const [estado, formAction, isPending] = useActionState(
    actualizarNombreUbicacion.bind(null, ubicacionId),
    undefined
  );

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-3">
        <input
          key={nombreInicial}
          name="nombre"
          defaultValue={nombreInicial}
          required
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
        <MapaUbicacion
          latInicial={latitudInicial}
          lngInicial={longitudInicial}
          nombreCampoLat="latitud"
          nombreCampoLng="longitud"
          centroDefecto={centroDefecto}
        />
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-lg bg-[#54A6D8] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
        {estado?.guardado && !isPending && (
          <span className="text-xs text-emerald-700">Guardado</span>
        )}
      </form>

      <div className="flex items-center gap-3">
        <span
          className={`text-xs font-medium ${
            activo ? "text-emerald-700" : "text-gray-400"
          }`}
        >
          {activo ? "Activa" : "Inactiva"}
        </span>
        <form action={cambiarActivoUbicacion.bind(null, ubicacionId, !activo)}>
          <button
            type="submit"
            className="text-xs font-medium text-[#54A6D8] underline"
          >
            {activo ? "Desactivar" : "Reactivar"}
          </button>
        </form>
      </div>
    </div>
  );
}

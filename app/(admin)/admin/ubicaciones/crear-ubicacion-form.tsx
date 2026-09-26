"use client";

import dynamic from "next/dynamic";

import { crearUbicacion } from "./actions";

// ssr:false: Leaflet toca `window` y no puede renderizarse en el servidor.
// Solo funciona dentro de un Client Component, por eso este formulario se
// separó de page.tsx (Server Component).
const MapaUbicacion = dynamic(
  () => import("./mapa-ubicacion").then((m) => m.MapaUbicacion),
  { ssr: false }
);

export function CrearUbicacionForm({
  esSuperAdmin,
  colegios,
  colegioIdFijo,
  centroDefecto,
}: {
  esSuperAdmin: boolean;
  colegios: { id: number; nombre: string }[];
  colegioIdFijo?: number;
  centroDefecto?: [number, number];
}) {
  return (
    <form action={crearUbicacion} className="flex items-end gap-2">
      {colegioIdFijo != null && (
        <input type="hidden" name="colegioId" value={colegioIdFijo} />
      )}
      {colegioIdFijo == null && esSuperAdmin && (
        <div className="flex flex-col gap-1">
          <label htmlFor="colegioId" className="text-sm">
            Colegio
          </label>
          <select
            id="colegioId"
            name="colegioId"
            required
            defaultValue=""
            className="max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
          >
            <option value="" disabled>
              Selecciona un colegio
            </option>
            {colegios.map((colegio) => (
              <option key={colegio.id} value={colegio.id}>
                {colegio.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="nombre" className="text-sm">
          Nueva ubicación
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          placeholder="p. ej. Biblioteca"
          className="max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <MapaUbicacion
        latInicial={null}
        lngInicial={null}
        nombreCampoLat="latitud"
        nombreCampoLng="longitud"
        centroDefecto={centroDefecto}
      />
      <button
        type="submit"
        className="rounded-lg bg-[#54A6D8] px-4 py-2 text-sm font-medium text-white"
      >
        Agregar
      </button>
    </form>
  );
}

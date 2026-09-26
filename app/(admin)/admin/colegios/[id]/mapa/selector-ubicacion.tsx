"use client";

import { useState } from "react";

import { CrearUbicacionForm } from "../../../ubicaciones/crear-ubicacion-form";
import { EditarUbicacionForm } from "./editar-ubicacion-form";

type Ubicacion = {
  id: number;
  nombre: string;
  activo: boolean;
  latitud: number | null;
  longitud: number | null;
};

const NUEVA = "nueva" as const;

export function SelectorUbicacion({
  colegioId,
  ubicaciones,
  centroDefecto,
}: {
  colegioId: number;
  ubicaciones: Ubicacion[];
  centroDefecto?: [number, number];
}) {
  const [seleccion, setSeleccion] = useState<number | typeof NUEVA>(
    ubicaciones[0]?.id ?? NUEVA
  );

  const ubicacionActual =
    seleccion === NUEVA
      ? null
      : (ubicaciones.find((u) => u.id === seleccion) ?? null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="selector-ubicacion"
          className="text-sm font-medium text-gray-600"
        >
          Ubicación
        </label>
        <select
          id="selector-ubicacion"
          value={String(seleccion)}
          onChange={(e) => {
            const valor = e.target.value;
            setSeleccion(valor === NUEVA ? NUEVA : Number(valor));
          }}
          className="max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        >
          {ubicaciones.map((ubicacion) => (
            <option key={ubicacion.id} value={ubicacion.id}>
              {ubicacion.nombre}
            </option>
          ))}
          <option value={NUEVA}>+ Nueva ubicación</option>
        </select>
      </div>

      {ubicacionActual ? (
        <EditarUbicacionForm
          key={ubicacionActual.id}
          ubicacionId={ubicacionActual.id}
          nombreInicial={ubicacionActual.nombre}
          latitudInicial={ubicacionActual.latitud}
          longitudInicial={ubicacionActual.longitud}
          activo={ubicacionActual.activo}
          centroDefecto={centroDefecto}
        />
      ) : (
        <CrearUbicacionForm
          key="nueva"
          esSuperAdmin={false}
          colegios={[]}
          colegioIdFijo={colegioId}
          centroDefecto={centroDefecto}
        />
      )}
    </div>
  );
}

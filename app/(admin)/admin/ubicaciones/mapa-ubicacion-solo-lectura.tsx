"use client";

import { MapContainer, Marker, TileLayer } from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./leaflet-icon";

const ZOOM_PUNTO = 15;

// Mini-mapa de confirmación visual: sin click-to-mark, sin controles de
// zoom ni de arrastre. Solo muestra dónde quedó la ubicación ya guardada.
export function MapaUbicacionSoloLectura({
  latitud,
  longitud,
}: {
  latitud: number;
  longitud: number;
}) {
  return (
    <div className="h-[150px] w-[200px] overflow-hidden rounded border">
      <MapContainer
        center={[latitud, longitud]}
        zoom={ZOOM_PUNTO}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[latitud, longitud]} />
      </MapContainer>
    </div>
  );
}

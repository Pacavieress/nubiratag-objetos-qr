"use client";

import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import "leaflet/dist/leaflet.css";

// Leaflet arma la URL del ícono por defecto a partir de su propio bundle,
// lo que no funciona con el bundler de Next.js — se reemplaza a mano por
// los assets importados. Corre una sola vez al cargar el módulo.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x.src,
  iconUrl: markerIcon.src,
  shadowUrl: markerShadow.src,
});

// Centro de Chile continental, usado mientras la ubicación no tiene
// coordenadas guardadas.
const CENTRO_CHILE: [number, number] = [-35.6751, -71.543];
const ZOOM_CHILE = 4;
const ZOOM_PUNTO = 15;

function ClickParaMarcar({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function MapaUbicacion({
  latInicial,
  lngInicial,
  nombreCampoLat,
  nombreCampoLng,
}: {
  latInicial: number | null;
  lngInicial: number | null;
  nombreCampoLat: string;
  nombreCampoLng: string;
}) {
  const [punto, setPunto] = useState<[number, number] | null>(
    latInicial != null && lngInicial != null ? [latInicial, lngInicial] : null
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="h-48 w-full max-w-xs overflow-hidden rounded border">
        <MapContainer
          center={punto ?? CENTRO_CHILE}
          zoom={punto ? ZOOM_PUNTO : ZOOM_CHILE}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickParaMarcar onClick={(lat, lng) => setPunto([lat, lng])} />
          {punto && <Marker position={punto} />}
        </MapContainer>
      </div>
      <p className="text-xs text-gray-500">
        {punto
          ? `${punto[0].toFixed(5)}, ${punto[1].toFixed(5)}`
          : "Haz clic en el mapa para marcar el punto."}
      </p>
      <input type="hidden" name={nombreCampoLat} value={punto?.[0] ?? ""} />
      <input type="hidden" name={nombreCampoLng} value={punto?.[1] ?? ""} />
    </div>
  );
}

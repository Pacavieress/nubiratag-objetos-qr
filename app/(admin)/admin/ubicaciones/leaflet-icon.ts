import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet arma la URL del ícono por defecto a partir de su propio bundle,
// lo que no funciona con el bundler de Next.js — se reemplaza a mano por
// los assets importados. Efecto de módulo: corre una sola vez al cargar
// (y es inofensivo si dos componentes lo importan, mergeOptions es
// idempotente) — compartido entre MapaUbicacion y cualquier otro mapa
// Leaflet de esta app, para no depender de cuál se monte primero.
//
// Con Turbopack (Next 16) un import de imagen puede devolver directo el
// string de la URL en vez del objeto StaticImageData {src, width, ...}
// que se ve con webpack — de ahí el soporte para ambos casos.
function urlDeAsset(asset: string | { src: string }): string {
  return typeof asset === "string" ? asset : asset.src;
}

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: urlDeAsset(markerIcon2x),
  iconUrl: urlDeAsset(markerIcon),
  shadowUrl: urlDeAsset(markerShadow),
});

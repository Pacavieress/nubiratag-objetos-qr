import path from "path";
import StaticMaps from "staticmaps";

const ANCHO = 400;
const ALTO = 250;
const ZOOM = 16;

// Mismo servidor de tiles (https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png,
// ver admin/ubicaciones/mapa-ubicacion.tsx) y mismo criterio de
// User-Agent identificable que ya usa geocodificarDireccion (Nominatim,
// en admin/ubicaciones/actions.ts) — buen uso de la política de uso de
// OSM, sin API key.
const USER_AGENT = "NubiraTag/1.0 (contacto@nubira.cl)";

// Mismo ícono que ya usa el resto de la app en sus mapas Leaflet (ver
// admin/ubicaciones/leaflet-icon.ts) — consistencia visual con el mapa
// del panel admin. staticmaps acepta una ruta local de archivo directo
// (la carga con sharp), no hace falta servirlo por HTTP.
const ICONO_MARCADOR = path.join(
  process.cwd(),
  "node_modules/leaflet/dist/images/marker-icon.png"
);
const ICONO_ANCHO = 25;
const ICONO_ALTO = 41;

// Genera el PNG de un mapa estático centrado en (lat, lng) con un
// marcador, para incrustar en un correo. Nunca lanza: si algo falla
// (timeout, tile server caído, etc.) devuelve null y quien llama sigue
// sin la imagen — mismo criterio defensivo que ya usa el resto de la app
// (geocodificarDireccion nunca bloquea guardar la dirección si falla).
export async function generarMapaEstatico(
  latitud: number,
  longitud: number
): Promise<Buffer | null> {
  try {
    const mapa = new StaticMaps({
      width: ANCHO,
      height: ALTO,
      tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      tileSubdomains: ["a", "b", "c"],
      tileRequestTimeout: 8000,
      tileRequestHeader: { "User-Agent": USER_AGENT },
    });

    // staticmaps usa [lng, lat] (orden GeoJSON), al revés de como se
    // guarda en la base (latitud, longitud) — ver marker.coord en
    // node_modules/staticmaps/dist/staticmaps.js.
    mapa.addMarker({
      coord: [longitud, latitud],
      img: ICONO_MARCADOR,
      width: ICONO_ANCHO,
      height: ICONO_ALTO,
    });

    await mapa.render([longitud, latitud], ZOOM);

    return await mapa.image.buffer("image/png");
  } catch (error) {
    console.error(
      `No se pudo generar el mapa estático para (${latitud}, ${longitud}):`,
      error
    );
    return null;
  }
}

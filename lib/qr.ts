import { randomBytes } from "crypto";
import QRCode from "qrcode";

/** 128 bits de aleatoriedad criptográfica, codificados URL-safe. */
export function generarToken(): string {
  return randomBytes(16).toString("base64url");
}

export function construirUrlQr(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  return new URL(`/q/${token}`, base).toString();
}

/** Data URL PNG lista para usar en <img src="...">. */
export async function generarImagenQr(token: string): Promise<string> {
  return QRCode.toDataURL(construirUrlQr(token), { margin: 2 });
}

// El QR codifica una URL completa (construirUrlQr de acá arriba), no el
// token pelado. El ingreso manual, en cambio, puede traer el token solo.
// Se acepta cualquiera de las dos formas.
export function extraerToken(entrada: string): string {
  const valor = entrada.trim();

  try {
    const url = new URL(valor);
    const segmentos = url.pathname.split("/").filter(Boolean);
    return segmentos[segmentos.length - 1] ?? valor;
  } catch {
    return valor;
  }
}

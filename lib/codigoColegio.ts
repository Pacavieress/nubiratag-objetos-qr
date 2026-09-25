import { randomInt } from "crypto";

// 6 dígitos, guardado como string para no perder ceros a la izquierda.
const LARGO_CODIGO = 6;

export function generarCodigoColegio(): string {
  return String(randomInt(10 ** LARGO_CODIGO)).padStart(LARGO_CODIGO, "0");
}

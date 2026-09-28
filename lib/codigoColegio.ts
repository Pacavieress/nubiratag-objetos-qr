import { randomInt } from "crypto";

// Mismo alfabeto que lib/codigoRetiro.ts: sin 0/O ni 1/I/L (ambiguos al
// leerlos en voz alta o escritos a mano). 31 símbolos, 8 caracteres:
// ~852 mil millones de combinaciones.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LARGO_CODIGO = 8;

export function generarCodigoColegio(): string {
  let codigo = "";
  for (let i = 0; i < LARGO_CODIGO; i++) {
    codigo += ALFABETO[randomInt(ALFABETO.length)];
  }
  return codigo;
}

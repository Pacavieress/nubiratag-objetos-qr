import { randomInt } from "crypto";

// Sin 0/O ni 1/I/L (ambiguos al leerlos en voz alta o escritos a mano).
// 31 símbolos, 6 caracteres: ~887 millones de combinaciones.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LARGO_CODIGO = 6;

export function generarCodigoRetiro(): string {
  let codigo = "";
  for (let i = 0; i < LARGO_CODIGO; i++) {
    codigo += ALFABETO[randomInt(ALFABETO.length)];
  }
  return codigo;
}

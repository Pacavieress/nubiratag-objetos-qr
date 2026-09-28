// Piso artificial de tiempo mínimo, para correr en paralelo (Promise.all)
// junto al trabajo real de una página/layout gateado por un Suspense con
// loading.tsx — sin esto, el fallback de loading desaparece apenas el
// trabajo real (típicamente auth(), unos pocos ms) resuelve, y nunca
// llega a verse.
export function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

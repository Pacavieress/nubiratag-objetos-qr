import { EscanerQr } from "./scanner";

// La autorización de rol ya la resuelve proxy.ts (matcher /funcionario/:path*);
// validarToken() en actions.ts vuelve a comprobarla igual, sin confiar en esto.
export default function EscanearPage() {
  return (
    <main className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold mb-1">Escanear código</h1>
      <p className="text-sm text-gray-600 mb-6">
        Apunta la cámara al QR del objeto encontrado.
      </p>

      <EscanerQr />
    </main>
  );
}

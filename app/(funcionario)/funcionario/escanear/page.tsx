import { VolverLink } from "@/components/volver-link";
import { EscanerQr } from "./scanner";

// La autorización de rol ya la resuelve proxy.ts (matcher /funcionario/:path*);
// validarToken() en actions.ts vuelve a comprobarla igual, sin confiar en esto.
export default function EscanearPage() {
  return (
    <main className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <VolverLink href="/funcionario/hallazgos" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Escanear código</h1>
        <p className="text-sm text-gray-600">
          Apunta la cámara al QR del objeto encontrado.
        </p>
        <div className="mt-5">
          <EscanerQr />
        </div>
      </div>
    </main>
  );
}

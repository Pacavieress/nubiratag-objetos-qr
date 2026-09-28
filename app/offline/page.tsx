import { WifiOff } from "lucide-react";

// Fallback del service worker (public/sw.js) cuando no hay red. Sin fetch
// a la base de datos ni dependencia de sesión: tiene que poder renderizar
// también server-side si se navega acá directo con conexión.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <WifiOff className="h-10 w-10 text-gray-300" />
      <h1 className="mt-4 text-xl font-semibold text-gray-900">
        Sin conexión
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        No pudimos cargar esta página. Revisa tu conexión a internet e
        intenta de nuevo.
      </p>
    </main>
  );
}

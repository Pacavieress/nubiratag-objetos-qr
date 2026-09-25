import { VolverLink } from "@/components/volver-link";
import { EntregaForm } from "./entrega-form";

export default function EntregarPage() {
  return (
    <main className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <VolverLink href="/funcionario/hallazgos" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Entregar objeto</h1>
        <p className="text-sm text-gray-600">
          Pide el código de retiro al apoderado.
        </p>
        <div className="mt-5">
          <EntregaForm />
        </div>
      </div>
    </main>
  );
}

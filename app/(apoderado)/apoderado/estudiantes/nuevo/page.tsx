import { VolverLink } from "@/components/volver-link";
import { crearEstudiante } from "../actions";
import { EstudianteForm } from "../estudiante-form";

export default function NuevoEstudiantePage() {
  return (
    <main className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <VolverLink href="/apoderado/estudiantes" />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-xl font-semibold text-gray-900">Nuevo estudiante</h1>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <EstudianteForm action={crearEstudiante} submitLabel="Crear" />
        </div>
      </div>
    </main>
  );
}

import { crearEstudiante } from "../actions";
import { EstudianteForm } from "../estudiante-form";

export default function NuevoEstudiantePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">Nuevo estudiante</h1>
      <EstudianteForm action={crearEstudiante} submitLabel="Crear" />
    </main>
  );
}

import { crearEstudiante } from "../actions";
import { EstudianteForm } from "../estudiante-form";

export default function NuevoEstudiantePage() {
  return (
    <main>
      <h1 className="text-xl font-semibold mb-6">Nuevo estudiante</h1>
      <EstudianteForm action={crearEstudiante} submitLabel="Crear" />
    </main>
  );
}

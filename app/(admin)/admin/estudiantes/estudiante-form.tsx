type EstudianteFormValues = {
  nombre: string;
  curso: string;
  apoderadoNombre: string;
  apoderadoEmail: string;
  apoderadoTelefono: string | null;
};

export function EstudianteForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: EstudianteFormValues;
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4 max-w-md">
      <div className="flex flex-col gap-1">
        <label htmlFor="nombre">Nombre del estudiante</label>
        <input
          id="nombre"
          name="nombre"
          required
          defaultValue={defaultValues?.nombre}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="curso">Curso</label>
        <input
          id="curso"
          name="curso"
          required
          defaultValue={defaultValues?.curso}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="apoderadoNombre">Nombre del apoderado</label>
        <input
          id="apoderadoNombre"
          name="apoderadoNombre"
          required
          defaultValue={defaultValues?.apoderadoNombre}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="apoderadoEmail">Email del apoderado</label>
        <input
          id="apoderadoEmail"
          name="apoderadoEmail"
          type="email"
          required
          defaultValue={defaultValues?.apoderadoEmail}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="apoderadoTelefono">
          Teléfono del apoderado (opcional)
        </label>
        <input
          id="apoderadoTelefono"
          name="apoderadoTelefono"
          defaultValue={defaultValues?.apoderadoTelefono ?? ""}
          className="border rounded px-3 py-2"
        />
      </div>
      <button
        type="submit"
        className="bg-black text-white rounded px-3 py-2 self-start"
      >
        {submitLabel}
      </button>
    </form>
  );
}

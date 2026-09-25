"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { BotonSubmit } from "@/components/boton-submit";
import { crearFuncionario } from "./actions";

export function CrearFuncionarioForm({
  esSuperAdmin,
  colegios,
  colegioIdFijo,
}: {
  esSuperAdmin: boolean;
  colegios: { id: number; nombre: string }[];
  colegioIdFijo?: number;
}) {
  const [error, formAction] = useActionState(crearFuncionario, undefined);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      {colegioIdFijo != null && (
        <input type="hidden" name="colegioId" value={colegioIdFijo} />
      )}
      {colegioIdFijo == null && esSuperAdmin && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="colegioId"
            className="text-sm font-medium text-gray-600"
          >
            Colegio
          </label>
          <select
            id="colegioId"
            name="colegioId"
            required
            defaultValue=""
            className="rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
          >
            <option value="" disabled>
              Selecciona un colegio
            </option>
            {colegios.map((colegio) => (
              <option key={colegio.id} value={colegio.id}>
                {colegio.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nombre" className="text-sm font-medium text-gray-600">
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          className="rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-gray-600">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-gray-600"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <BotonSubmit label="Crear funcionario" loadingLabel="Creando..." />
    </form>
  );
}

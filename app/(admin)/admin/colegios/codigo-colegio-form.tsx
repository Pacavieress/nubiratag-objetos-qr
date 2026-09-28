"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";

import { BotonSubmit } from "@/components/boton-submit";
import {
  actualizarCodigoRegistro,
  cambiarRegistroActivo,
  regenerarCodigoRegistro,
} from "./actions";

export function CodigoColegioForm({
  colegioId,
  codigoInicial,
  registroActivo,
}: {
  colegioId: number;
  codigoInicial: string;
  registroActivo: boolean;
}) {
  const [estado, formAction, isPending] = useActionState(
    actualizarCodigoRegistro.bind(null, colegioId),
    undefined
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [regenerando, startRegenerar] = useTransition();

  function copiar() {
    const valor = inputRef.current?.value;
    if (!valor) return;
    navigator.clipboard.writeText(valor).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <form
        action={formAction}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          key={codigoInicial}
          ref={inputRef}
          name="codigoRegistro"
          defaultValue={codigoInicial}
          required
          className="max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-medium text-[#54A6D8] underline disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
        {estado?.guardado && !isPending && (
          <span className="text-xs text-emerald-700">Guardado</span>
        )}
        {estado && !estado.guardado && !isPending && (
          <span className="text-xs text-red-600">{estado.error}</span>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copiar}
          className="flex items-center gap-1 text-xs font-medium text-gray-600 underline"
        >
          {copiado ? (
            <>
              <Check className="h-3 w-3" /> Copiado
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copiar
            </>
          )}
        </button>

        <button
          type="button"
          disabled={regenerando}
          onClick={() =>
            startRegenerar(() => regenerarCodigoRegistro(colegioId))
          }
          className="text-xs font-medium text-red-600 underline disabled:opacity-50"
        >
          {regenerando ? "Regenerando..." : "Regenerar código"}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Regenerar invalida el código anterior — cualquier apoderado que
        todavía no se haya registrado con él tendrá que usar el nuevo.
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
        <span
          className={`text-xs font-medium ${
            registroActivo ? "text-emerald-700" : "text-gray-400"
          }`}
        >
          Registro {registroActivo ? "activo" : "desactivado"}
        </span>
        <form
          action={cambiarRegistroActivo.bind(
            null,
            colegioId,
            !registroActivo
          )}
        >
          <BotonSubmit
            label={registroActivo ? "Desactivar registro" : "Activar registro"}
            variante="gris"
          />
        </form>
      </div>
    </div>
  );
}

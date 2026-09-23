"use client";

import { useRef } from "react";
import { ArrowRight } from "lucide-react";

import { BotonSubmit } from "../boton-submit";

export function ConfirmarAccion({
  action,
  titulo,
  mensaje,
  textoBoton,
  textoConfirmar,
}: {
  action: (formData: FormData) => void | Promise<void>;
  titulo: string;
  mensaje: string;
  textoBoton: string;
  textoConfirmar: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-600 sm:w-auto"
      >
        {textoBoton}
        <ArrowRight className="h-4 w-4" />
      </button>

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-100 p-6 backdrop:bg-black/40"
      >
        <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
        <p className="mt-2 text-base text-gray-600">{mensaje}</p>

        <div className="mt-6 flex flex-col gap-2">
          <form action={action} onSubmit={() => dialogRef.current?.close()}>
            <BotonSubmit label={textoConfirmar} variante="rojo" />
          </form>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="w-full rounded-xl border border-gray-300 px-5 py-3.5 text-base font-medium text-gray-700"
          >
            Cancelar
          </button>
        </div>
      </dialog>
    </>
  );
}

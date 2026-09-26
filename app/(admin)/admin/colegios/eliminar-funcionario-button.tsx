"use client";

import { useTransition } from "react";

import { eliminarFuncionario } from "./funcionario-actions";

export function EliminarFuncionarioButton({
  usuarioId,
}: {
  usuarioId: number;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        "¿Eliminar este funcionario? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }
    startTransition(() => {
      eliminarFuncionario(usuarioId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-medium text-red-600 underline disabled:opacity-50"
    >
      {isPending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}

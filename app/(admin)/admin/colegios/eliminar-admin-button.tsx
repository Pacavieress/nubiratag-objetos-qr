"use client";

import { useTransition } from "react";

import { eliminarAdmin } from "./actions";

export function EliminarAdminButton({ usuarioId }: { usuarioId: number }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        "¿Eliminar este administrador? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }
    startTransition(() => {
      eliminarAdmin(usuarioId);
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

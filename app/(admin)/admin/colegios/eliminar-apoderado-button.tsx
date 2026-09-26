"use client";

import { useTransition } from "react";

import { eliminarApoderado } from "./apoderado-actions";

export function EliminarApoderadoButton({
  usuarioId,
}: {
  usuarioId: number;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        "¿Eliminar este apoderado? Se eliminarán también sus estudiantes vinculados y sus códigos QR. Esta acción no se puede deshacer."
      )
    ) {
      return;
    }
    startTransition(() => {
      eliminarApoderado(usuarioId);
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

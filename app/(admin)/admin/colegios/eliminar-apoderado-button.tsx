"use client";

import { ConfirmarAccion } from "@/components/confirmar-accion";

import { eliminarApoderado } from "./apoderado-actions";

export function EliminarApoderadoButton({
  usuarioId,
}: {
  usuarioId: number;
}) {
  return (
    <ConfirmarAccion
      action={eliminarApoderado.bind(null, usuarioId)}
      titulo="Eliminar apoderado"
      mensaje="¿Eliminar este apoderado? Se eliminarán también sus estudiantes vinculados y sus códigos QR. Esta acción no se puede deshacer."
      textoBoton="Eliminar"
      textoConfirmar="Eliminar"
    />
  );
}

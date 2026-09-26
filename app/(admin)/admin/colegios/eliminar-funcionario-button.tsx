"use client";

import { ConfirmarAccion } from "@/components/confirmar-accion";

import { eliminarFuncionario } from "./funcionario-actions";

export function EliminarFuncionarioButton({
  usuarioId,
}: {
  usuarioId: number;
}) {
  return (
    <ConfirmarAccion
      action={eliminarFuncionario.bind(null, usuarioId)}
      titulo="Eliminar funcionario"
      mensaje="¿Eliminar este funcionario? Esta acción no se puede deshacer."
      textoBoton="Eliminar"
      textoConfirmar="Eliminar"
    />
  );
}

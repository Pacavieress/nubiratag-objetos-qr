"use client";

import { ConfirmarAccion } from "@/components/confirmar-accion";

import { eliminarAdmin } from "./actions";

export function EliminarAdminButton({ usuarioId }: { usuarioId: number }) {
  return (
    <ConfirmarAccion
      action={eliminarAdmin.bind(null, usuarioId)}
      titulo="Eliminar administrador"
      mensaje="¿Eliminar este administrador? Esta acción no se puede deshacer."
      textoBoton="Eliminar"
      textoConfirmar="Eliminar"
    />
  );
}

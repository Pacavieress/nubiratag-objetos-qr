import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Minus, Plus, QrCode } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cambiarActivoEstudiante, generarQrCode, revocarQr } from "../actions";
import { BotonSubmit } from "@/components/boton-submit";
import { VolverLink } from "@/components/volver-link";
import { EtiquetaForm } from "./etiqueta-form";
import { ConfirmarAccion } from "@/components/confirmar-accion";

const ESTADO_HALLAZGO_ESTILO: Record<string, string> = {
  reportado: "bg-amber-100 text-amber-700",
  retirado: "bg-green-100 text-green-700",
  descartado: "bg-gray-100 text-gray-500",
};

export default async function EstudianteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estudianteId = Number(id);

  if (!Number.isInteger(estudianteId)) {
    notFound();
  }

  const session = await auth();
  const apoderadoId = Number(session!.user.id);

  const estudiante = await prisma.estudiante.findUnique({
    where: { id: estudianteId },
    include: { qrCodigos: { orderBy: { createdAt: "asc" } } },
  });

  // Aislamiento por dueño: si el estudiante no existe o no es de este
  // apoderado, 404 — nunca se confirma ni se muestra nada del registro.
  if (!estudiante || estudiante.apoderadoId !== apoderadoId) {
    notFound();
  }

  // Historial por estudiante (punto 18 del spec): solo lectura, las
  // acciones de retirar/descartar viven en /funcionario/hallazgos.
  const hallazgos = await prisma.hallazgo.findMany({
    where: { qrCodigo: { estudianteId } },
    orderBy: { createdAt: "desc" },
    include: { ubicacion: true, reportante: true },
  });

  return (
    <main className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <VolverLink href="/apoderado/estudiantes" />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        {/* Datos del estudiante */}
        <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-semibold capitalize text-gray-900">
              {estudiante.nombre}
            </h1>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                estudiante.activo
                  ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                  : "border-gray-200 bg-gray-100 text-gray-500"
              }`}
            >
              {estudiante.activo ? "Activo" : "Inactivo"}
            </span>
          </div>
          {estudiante.curso && (
            <p className="mt-1 text-2xl font-semibold uppercase text-gray-900">
              {estudiante.curso}
            </p>
          )}

          {!estudiante.activo && (
            <p className="mt-4 text-sm text-gray-600">
              Este estudiante está dado de baja. Sus códigos QR no van a
              registrar hallazgos nuevos.
            </p>
          )}

          <div className="mt-6 border-t border-gray-100 pt-5">
            {estudiante.activo ? (
              <ConfirmarAccion
                action={cambiarActivoEstudiante.bind(null, estudiante.id, false)}
                titulo={`¿Dar de baja a ${estudiante.nombre}?`}
                mensaje="Sus códigos QR van a dejar de funcionar para reportar objetos encontrados. Puedes reactivarlo cuando quieras."
                textoBoton="Dar de baja"
                textoConfirmar="Sí, dar de baja"
              />
            ) : (
              <form
                action={cambiarActivoEstudiante.bind(null, estudiante.id, true)}
              >
                <BotonSubmit label="Reactivar" variante="gris" />
              </form>
            )}
          </div>
        </section>

        {/* Códigos QR */}
        <details className="group rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
          <summary className="flex cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-[#54A6D8]" />
              <h2 className="text-lg font-semibold text-gray-900">
                Códigos QR
              </h2>
            </div>
            <Plus className="h-5 w-5 text-gray-400 group-open:hidden" />
            <Minus className="hidden h-5 w-5 text-gray-400 group-open:block" />
          </summary>

          <Link
            href={`/apoderado/estudiantes/${estudiante.id}/hoja`}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-5 py-3.5 text-base font-medium text-gray-700 sm:w-auto"
          >
            Ver hoja imprimible
          </Link>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-600">
              Agregar un objeto nuevo
            </h3>
            <form
              action={generarQrCode.bind(null, estudiante.id)}
              className="mt-2 flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="etiqueta"
                  className="text-sm font-medium text-gray-600"
                >
                  Etiqueta del objeto
                </label>
                <input
                  id="etiqueta"
                  name="etiqueta"
                  required
                  placeholder="p. ej. Mochila"
                  className="rounded-lg border border-gray-300 px-4 py-3.5 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
                />
              </div>
              <BotonSubmit label="Generar QR" loadingLabel="Generando..." />
            </form>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {estudiante.qrCodigos.map((qr) => (
              <div key={qr.id} className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-medium text-gray-900">
                    {qr.etiqueta ?? "Sin etiqueta"}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                      qr.estado === "activo"
                        ? "bg-[#54A6D8]/10 text-[#54A6D8]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {qr.estado === "activo" ? "Activo" : "Revocado"}
                  </span>
                </div>

                <p className="mt-1 font-mono text-xs text-gray-400">
                  {qr.token.slice(0, 12)}…
                </p>

                {qr.estado === "activo" && (
                  <div className="mt-3">
                    <EtiquetaForm
                      estudianteId={estudiante.id}
                      qrId={qr.id}
                      etiquetaInicial={qr.etiqueta}
                    >
                      <ConfirmarAccion
                        action={revocarQr.bind(null, qr.id)}
                        titulo="¿Revocar este código?"
                        mensaje="Este código dejará de funcionar. Si el objeto ya tiene el QR pegado, vas a necesitar imprimir uno nuevo."
                        textoBoton="Revocar"
                        textoConfirmar="Sí, revocar"
                      />
                    </EtiquetaForm>
                  </div>
                )}
              </div>
            ))}

            {estudiante.qrCodigos.length === 0 && (
              <p className="py-4 text-center text-base text-gray-500">
                Este estudiante todavía no tiene códigos QR.
              </p>
            )}
          </div>
        </details>

        {/* Historial de hallazgos */}
        <details className="group rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
          <summary className="flex cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#54A6D8]" />
              <h2 className="text-lg font-semibold text-gray-900">
                Historial de hallazgos
              </h2>
            </div>
            <Plus className="h-5 w-5 text-gray-400 group-open:hidden" />
            <Minus className="hidden h-5 w-5 text-gray-400 group-open:block" />
          </summary>

          <div className="mt-6 flex flex-col gap-3">
            {hallazgos.map((h) => (
              <div key={h.id} className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-500">
                    {h.createdAt.toLocaleDateString("es-CL")}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                      ESTADO_HALLAZGO_ESTILO[h.estado] ??
                      "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {h.estado}
                  </span>
                </div>
                <p className="mt-1 text-base font-medium text-gray-900">
                  {h.ubicacion.nombre}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Reportado por: {h.reportante.nombre}
                  {h.nota && <> — {h.nota}</>}
                </p>
              </div>
            ))}

            {hallazgos.length === 0 && (
              <p className="py-4 text-center text-base text-gray-500">
                Sin hallazgos registrados para este estudiante.
              </p>
            )}
          </div>
        </details>
      </div>
    </main>
  );
}

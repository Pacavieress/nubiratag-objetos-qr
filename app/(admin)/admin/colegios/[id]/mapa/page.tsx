import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { VolverLink } from "@/components/volver-link";
import { geocodificarDireccion } from "../../../ubicaciones/actions";
import { MapaColegio } from "./mapa-colegio";

export default async function MapaColegioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const esSuperAdmin = session?.user?.rol === "superadmin";
  const colegioIdPropio = session?.user?.colegioId ?? null;

  const { id } = await params;
  const colegioId = Number(id);

  if (!Number.isInteger(colegioId)) {
    notFound();
  }

  // Mismo criterio que el resto de /admin/ubicaciones: superadmin ve
  // cualquier colegio, un admin de colegio solo el suyo.
  if (!esSuperAdmin && colegioIdPropio !== colegioId) {
    notFound();
  }

  const colegio = await prisma.colegio.findUnique({
    where: { id: colegioId },
  });

  if (!colegio) {
    notFound();
  }

  const ubicaciones = await prisma.ubicacion.findMany({
    where: { colegioId },
    orderBy: { nombre: "asc" },
  });

  const centroInicial = colegio.direccion
    ? await geocodificarDireccion(colegio.direccion)
    : null;

  return (
    <main className="flex flex-col gap-6">
      <VolverLink href="/admin/ubicaciones" />

      <h1 className="text-xl font-semibold text-gray-900">
        Mapa — {colegio.nombre}
      </h1>

      <MapaColegio
        colegioId={colegio.id}
        direccionInicial={colegio.direccion ?? ""}
        centroInicial={
          centroInicial ? [centroInicial.lat, centroInicial.lng] : null
        }
        ubicaciones={ubicaciones}
      />
    </main>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";

export default async function VerificarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const usuario = await prisma.usuario.findUnique({
    where: { tokenVerificacion: token },
  });

  if (!usuario) {
    notFound();
  }

  if (usuario.emailVerificado) {
    redirect("/login?verificado=1");
  }

  if (
    !usuario.tokenVerificacionExpira ||
    usuario.tokenVerificacionExpira < new Date()
  ) {
    return (
      <main className="mx-auto flex h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          Enlace vencido
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Este enlace de verificación ya venció.
        </p>
        <Link
          href="/reenviar-verificacion"
          className="mt-6 text-sm font-medium text-[#54A6D8] hover:underline"
        >
          Pedir un enlace nuevo
        </Link>
      </main>
    );
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      emailVerificado: true,
      tokenVerificacion: null,
      tokenVerificacionExpira: null,
    },
  });

  redirect("/login?verificado=1");
}

"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, EmailNoVerificadoError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData
) {
  const email = String(formData.get("email") ?? "");

  try {
    // redirect: false solo cambia el camino de éxito (devuelve la URL en
    // vez de redirigir sola); en credenciales inválidas sigue lanzando
    // AuthError igual, verificado leyendo next-auth/lib/actions.js.
    await signIn("credentials", {
      ...Object.fromEntries(formData),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof EmailNoVerificadoError) {
      return "Debes verificar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.";
    }
    if (error instanceof AuthError) {
      return "Credenciales inválidas.";
    }
    throw error;
  }

  // El destino depende del rol: admin -> panel admin, funcionario -> sus
  // hallazgos abiertos, apoderado -> sus estudiantes. Se consulta la BD
  // en vez de leer la sesión recién creada para no depender de que la
  // cookie ya esté disponible en este mismo request.
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (usuario?.rol === "admin" || usuario?.rol === "superadmin") {
    redirect("/admin");
  } else if (usuario?.rol === "funcionario") {
    redirect("/funcionario/hallazgos");
  } else {
    redirect("/apoderado");
  }
}

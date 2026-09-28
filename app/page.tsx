import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { esperar } from "@/lib/esperar";

// "/" no pasa por proxy.ts (su matcher solo cubre /admin, /apoderado y
// /funcionario), así que replica acá el mismo destino por rol que usa
// el login (app/(auth)/login/actions.ts) después de autenticar.

// app/loading.tsx es el fallback de Suspense de esta página: sin este
// piso, auth() (solo decodifica el JWT de la cookie) resuelve en unos
// pocos ms y la animación completa nunca llega a verse. Promise.all no
// suma latencia sobre el trabajo real — corren en paralelo, gana el que
// tarde más.
export default async function Home() {
  const [session] = await Promise.all([auth(), esperar(700)]);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.rol === "admin" || session.user.rol === "superadmin") {
    redirect("/admin");
  } else if (session.user.rol === "funcionario") {
    redirect("/funcionario/hallazgos");
  } else {
    redirect("/apoderado");
  }
}

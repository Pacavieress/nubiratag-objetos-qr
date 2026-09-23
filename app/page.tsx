import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

// "/" no pasa por proxy.ts (su matcher solo cubre /admin, /apoderado y
// /funcionario), así que replica acá el mismo destino por rol que usa
// el login (app/(auth)/login/actions.ts) después de autenticar.
export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.rol === "admin") {
    redirect("/admin");
  } else if (session.user.rol === "funcionario") {
    redirect("/funcionario/hallazgos");
  } else {
    redirect("/apoderado");
  }
}

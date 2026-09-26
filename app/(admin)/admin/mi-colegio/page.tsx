import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

// Sin UI propia: un admin de colegio no conoce su propio id de antemano,
// así que este link fijo en el nav lo manda directo a
// /admin/colegios/[su colegioId], que ya sabe mostrarle solo lo que le
// corresponde (ver requireAccesoColegio en admin/colegios/actions.ts).
export default async function MiColegioPage() {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.rol !== "admin" && session.user.rol !== "superadmin")
  ) {
    redirect("/login");
  }

  if (session.user.rol === "superadmin" || session.user.colegioId == null) {
    redirect("/admin/colegios");
  }

  redirect(`/admin/colegios/${session.user.colegioId}`);
}

import { auth } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { LockScroll } from "@/components/lock-scroll";
import { obtenerNombreColegioSesion } from "@/lib/colegioSesion";
import { esperar } from "@/lib/esperar";
import {
  AreaContenido,
  InmersivoProvider,
  OcultarEnInmersivo,
} from "./inmersivo";

// La autorización de rol ya la resuelve proxy.ts (matcher /admin/:path*)
// antes de que se llegue a renderizar este layout. Acá solo se usa
// auth() para leer el email a mostrar, no para autorizar.
//
// Super admin = rol "superadmin" (colegioId siempre null). Admin =
// rol "admin", colegioId siempre asignado (gestiona solo su colegio).
// Ver requireSuperAdmin() en admin/colegios/actions.ts.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // nombreColegio depende de session (necesita colegioId), así que el
  // trío va como una sola unidad secuencial corriendo en paralelo con el
  // piso de 700ms — mismo criterio que app/page.tsx, ver lib/esperar.ts.
  const [{ session, esSuperAdmin, nombreColegio }] = await Promise.all([
    (async () => {
      const session = await auth();
      const esSuperAdmin = session?.user?.rol === "superadmin";
      const nombreColegio = await obtenerNombreColegioSesion(
        session?.user?.colegioId
      );
      return { session, esSuperAdmin, nombreColegio };
    })(),
    esperar(700),
  ]);

  return (
    <InmersivoProvider>
      <div className="flex h-dvh w-full flex-col overflow-hidden overscroll-none bg-gray-50 md:flex-row">
        <LockScroll />
        <OcultarEnInmersivo>
          <Sidebar esSuperAdmin={esSuperAdmin} />
        </OcultarEnInmersivo>
        <div className="flex min-h-0 flex-1 flex-col">
          <OcultarEnInmersivo>
            <Header
              email={session?.user?.email}
              nombre={session?.user?.name}
              rol={session?.user?.rol}
              nombreColegio={nombreColegio}
            />
          </OcultarEnInmersivo>
          <AreaContenido>{children}</AreaContenido>
        </div>
        <OcultarEnInmersivo>
          <BottomNav esSuperAdmin={esSuperAdmin} />
        </OcultarEnInmersivo>
      </div>
    </InmersivoProvider>
  );
}

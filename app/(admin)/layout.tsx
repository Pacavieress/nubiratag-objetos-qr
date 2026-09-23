import { auth } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

// La autorización de rol ya la resuelve proxy.ts (matcher /admin/:path*)
// antes de que se llegue a renderizar este layout. Acá solo se usa
// auth() para leer el email a mostrar, no para autorizar.
//
// Super admin = rol "admin" con colegioId: null (todos los admin
// actuales). Admin de colegio = mismo rol "admin" pero con colegioId
// asignado (rol futuro, el modelo ya lo permite pero no existe todavía
// ningún usuario así). Ver requireSuperAdmin() en
// admin/colegios/actions.ts.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const esSuperAdmin =
    session?.user?.rol === "admin" && session.user.colegioId == null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar esSuperAdmin={esSuperAdmin} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          email={session?.user?.email}
          rol={session?.user?.rol}
          esSuperAdmin={esSuperAdmin}
        />
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

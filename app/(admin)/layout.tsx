import { auth } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { LockScroll } from "@/components/lock-scroll";

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
  const session = await auth();
  const esSuperAdmin = session?.user?.rol === "superadmin";

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden overscroll-none bg-gray-50 md:flex-row">
      <LockScroll />
      <Sidebar esSuperAdmin={esSuperAdmin} />
      <div className="flex min-h-0 flex-1 flex-col">
        <Header email={session?.user?.email} rol={session?.user?.rol} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [-webkit-overflow-scrolling:touch]">
          {children}
        </div>
      </div>
      <BottomNav esSuperAdmin={esSuperAdmin} />
    </div>
  );
}

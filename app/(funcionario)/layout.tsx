import { auth } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { LockScroll } from "@/components/lock-scroll";
import { obtenerNombreColegioSesion } from "@/lib/colegioSesion";
import { esperar } from "@/lib/esperar";

// La autorización de rol ya la resuelve proxy.ts (matcher /funcionario/:path*,
// exige rol funcionario). Acá solo se usa auth() para leer el email a
// mostrar, no para autorizar.
export default async function FuncionarioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // nombreColegio depende de session (necesita colegioId), así que el par
  // va como una sola unidad secuencial corriendo en paralelo con el piso
  // de 700ms — mismo criterio que app/page.tsx, ver lib/esperar.ts.
  const [{ session, nombreColegio }] = await Promise.all([
    (async () => {
      const session = await auth();
      const nombreColegio = await obtenerNombreColegioSesion(
        session?.user?.colegioId
      );
      return { session, nombreColegio };
    })(),
    esperar(700),
  ]);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden overscroll-none bg-gray-50 lg:flex-row">
      <LockScroll />
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col">
        <Header
          email={session?.user?.email}
          nombre={session?.user?.name}
          rol={session?.user?.rol}
          nombreColegio={nombreColegio}
        />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [-webkit-overflow-scrolling:touch]">{children}</div>
      </div>
      <BottomNav />
    </div>
  );
}

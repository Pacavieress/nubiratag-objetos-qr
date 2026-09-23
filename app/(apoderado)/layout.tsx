import { auth } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { LockScroll } from "@/components/lock-scroll";

// La autorización de rol ya la resuelve proxy.ts (matcher /apoderado/:path*,
// exige rol apoderado). Acá solo se usa auth() para leer el email a
// mostrar, no para autorizar.
export default async function ApoderadoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden overscroll-none bg-gray-50 lg:flex-row">
      <LockScroll />
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col">
        <Header email={session?.user?.email} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [-webkit-overflow-scrolling:touch]">{children}</div>
      </div>
      <BottomNav />
    </div>
  );
}

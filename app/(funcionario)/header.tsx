"use client";

import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "./nav-items";

export function Header({ email }: { email: string | null | undefined }) {
  const pathname = usePathname();
  const seccion =
    NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.label ?? "Panel";

  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
      <div>
        <p className="text-sm lg:hidden">
          <span className="text-[#2c7bc0]">Nubira</span>
          <span className="text-[#ff914d]">Tag</span>
        </p>
        <h1 className="text-base font-semibold text-gray-900">{seccion}</h1>
      </div>
      {email && (
        <span className="text-sm font-bold text-gray-600">{email?.split("@")[0]}</span>
      )}
    </header>
  );
}

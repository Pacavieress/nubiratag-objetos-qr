import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function VolverLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 text-base text-gray-600"
    >
      <ArrowLeft className="h-5 w-5" />
      Volver
    </Link>
  );
}

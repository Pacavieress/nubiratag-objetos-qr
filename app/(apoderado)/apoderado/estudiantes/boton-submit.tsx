"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2 } from "lucide-react";

const VARIANTES = {
  naranjo: "bg-[#ff914d] text-white hover:bg-[#e08044]",
  rojo: "bg-red-600 text-white hover:bg-red-700",
  gris: "border border-gray-300 text-gray-700",
} as const;

export function BotonSubmit({
  label,
  loadingLabel = "Procesando...",
  variante = "naranjo",
}: {
  label: string;
  loadingLabel?: string;
  variante?: keyof typeof VARIANTES;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 sm:w-auto ${VARIANTES[variante]}`}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </button>
  );
}

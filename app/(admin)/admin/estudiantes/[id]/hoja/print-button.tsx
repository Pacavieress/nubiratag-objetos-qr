"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-black text-white rounded px-3 py-2 text-sm print:hidden"
    >
      Imprimir
    </button>
  );
}

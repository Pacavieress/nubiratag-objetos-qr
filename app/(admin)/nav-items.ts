import { MapPin, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// "Estudiantes" se sacó de acá: ese flujo es del apoderado ahora
// (/apoderado/estudiantes). "Hallazgos" también: la vista de hallazgos
// abiertos por colegio es del funcionario (/funcionario/hallazgos); la
// vista global multi-colegio para el admin todavía no se reconstruyó.
export const NAV_ITEMS: NavItem[] = [
  { href: "/admin/ubicaciones", label: "Ubicaciones", icon: MapPin },
  // Próximamente: Usuarios/Funcionarios, Colegios, Hallazgos (vista global).
];

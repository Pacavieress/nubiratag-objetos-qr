import { Building2, MapPin, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Visible solo para superadmin (colegioId: null). /admin/colegios/[id]
  // igual re-valida con requireAccesoColegio, así que este flag solo
  // evita mostrarle el link a un admin de colegio — no es la única
  // barrera.
  soloSuperAdmin?: boolean;
  // Inverso de soloSuperAdmin: visible solo para admin de colegio.
  soloAdminColegio?: boolean;
};

// "Estudiantes" se sacó de acá: ese flujo es del apoderado ahora
// (/apoderado/estudiantes). "Hallazgos" también: la vista de hallazgos
// abiertos por colegio es del funcionario (/funcionario/hallazgos); la
// vista global multi-colegio para el admin todavía no se reconstruyó.
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/colegios",
    label: "Colegios",
    icon: Building2,
    soloSuperAdmin: true,
  },
  {
    href: "/admin/mi-colegio",
    label: "Mi colegio",
    icon: Building2,
    soloAdminColegio: true,
  },
  { href: "/admin/ubicaciones", label: "Ubicaciones", icon: MapPin },
  // Próximamente: Hallazgos (vista global).
];

import { Building2, MapPin, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Solo visible para super admin (rol admin con colegioId: null). Hoy
  // todo admin es super admin, así que esto no filtra nada en la
  // práctica — pero /admin/colegios igual exige requireSuperAdmin(), así
  // que un futuro admin de colegio rebotaría a /admin si entrara por URL
  // directa. Este flag solo evita mostrarle el link.
  soloSuperAdmin?: boolean;
};

// "Estudiantes" se sacó de acá: ese flujo es del apoderado ahora
// (/apoderado/estudiantes). "Hallazgos" también: la vista de hallazgos
// abiertos por colegio es del funcionario (/funcionario/hallazgos); la
// vista global multi-colegio para el admin todavía no se reconstruyó.
export const NAV_ITEMS: NavItem[] = [
  { href: "/admin/ubicaciones", label: "Ubicaciones", icon: MapPin },
  {
    href: "/admin/colegios",
    label: "Colegios",
    icon: Building2,
    soloSuperAdmin: true,
  },
  // Próximamente: Usuarios/Funcionarios, Hallazgos (vista global).
];

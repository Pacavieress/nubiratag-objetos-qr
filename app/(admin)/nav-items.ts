import { Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin/estudiantes", label: "Estudiantes", icon: Users },
  // Próximamente: Hallazgos, Ubicaciones, Usuarios.
];

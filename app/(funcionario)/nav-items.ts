import {
  ClipboardList,
  PackageCheck,
  ScanLine,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/funcionario/hallazgos", label: "Hallazgos", icon: ClipboardList },
  { href: "/funcionario/escanear", label: "Escanear", icon: ScanLine },
  { href: "/funcionario/entregar", label: "Entregar", icon: PackageCheck },
];

import { NextResponse } from "next/server";
import type { RolUsuario } from "@prisma/client";

import { auth } from "@/lib/auth";

// Prefijo de ruta -> roles permitidos. /admin acepta admin (de colegio)
// y superadmin; el guard fino entre ambos (ej. requireSuperAdmin en
// admin/colegios/actions.ts) vive dentro de cada sección, no acá.
const ROLES_POR_PREFIJO: Record<string, RolUsuario[]> = {
  "/admin": ["admin", "superadmin"],
  "/apoderado": ["apoderado"],
  "/funcionario": ["funcionario"],
};

// Chequeo optimista: solo lee el JWT de la cookie de sesión, sin ir a la
// base de datos (recomendación oficial de Next.js para Proxy).
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const prefijo = Object.keys(ROLES_POR_PREFIJO).find((p) =>
    pathname.startsWith(p)
  );
  const rolesPermitidos = prefijo ? ROLES_POR_PREFIJO[prefijo] : undefined;
  const rolUsuario = req.auth.user?.rol;

  if (rolesPermitidos && (!rolUsuario || !rolesPermitidos.includes(rolUsuario))) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

// /admin/** admin o superadmin, /apoderado/** solo apoderado,
// /funcionario/** solo funcionario.
export const config = {
  matcher: ["/admin/:path*", "/apoderado/:path*", "/funcionario/:path*"],
};

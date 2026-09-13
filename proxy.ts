import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

// Chequeo optimista: solo lee el JWT de la cookie de sesión, sin ir a la
// base de datos (recomendación oficial de Next.js para Proxy).
export default auth((req) => {
  const rol = req.auth?.user?.rol;

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  if (rol !== "admin") {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

// Por ahora solo /admin/**. El flujo de registro de hallazgo (Etapas 3-4,
// accesible a admin + funcionario) se agrega a este matcher cuando esa
// ruta exista.
export const config = {
  matcher: ["/admin/:path*"],
};

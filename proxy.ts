import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

// Prefijo de ruta -> rol exigido. El matcher de abajo garantiza que esta
// función solo se invoca para paths que empiezan con una de estas tres
// rutas, así que rolRequerido siempre se encuentra.
const ROL_POR_PREFIJO: Record<string, "admin" | "apoderado" | "funcionario"> = {
  "/admin": "admin",
  "/apoderado": "apoderado",
  "/funcionario": "funcionario",
};

// Chequeo optimista: solo lee el JWT de la cookie de sesión, sin ir a la
// base de datos (recomendación oficial de Next.js para Proxy).
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const prefijo = Object.keys(ROL_POR_PREFIJO).find((p) =>
    pathname.startsWith(p)
  );
  const rolRequerido = prefijo ? ROL_POR_PREFIJO[prefijo] : undefined;

  if (rolRequerido && req.auth.user?.rol !== rolRequerido) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

// /admin/** solo admin, /apoderado/** solo apoderado, /funcionario/** solo
// funcionario.
export const config = {
  matcher: ["/admin/:path*", "/apoderado/:path*", "/funcionario/:path*"],
};

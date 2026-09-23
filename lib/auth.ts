import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";

// Lanzado desde authorize() cuando un apoderado no verificado intenta
// entrar. Al extender CredentialsSignin, Auth.js relanza esta instancia
// tal cual (confirmado en @auth/core/index.js: isAuthError && isRaw &&
// !isRedirect => throw error) hasta actions.ts, donde se distingue del
// mensaje genérico "Credenciales inválidas." por su código.
export class EmailNoVerificadoError extends CredentialsSignin {
  code = "email-no-verificado";
}

// "Mantener sesión" del login: marcado, el JWT vive 30 días; sin marcar,
// 1 día de inactividad (se recalcula en cada request mientras la sesión
// siga activa). session.maxAge es el techo que usa Auth.js para el
// Max-Age de la cookie — la duración corta real la impone token.exp en
// el callback jwt(), no la cookie.
const SESSION_MAX_AGE_LARGO = 30 * 24 * 60 * 60;
const SESSION_MAX_AGE_CORTO = 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_LARGO },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        // "mantenerSesion" no está en el schema declarado arriba (solo
        // define email/password para la UI default de Auth.js), pero sí
        // llega en runtime porque login-form.tsx lo manda dentro del mismo
        // FormData que actions.ts reenvía completo a signIn().
        const mantenerSesion = (
          credentials as { mantenerSesion?: string } | undefined
        )?.mantenerSesion;

        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const usuario = await prisma.usuario.findUnique({
          where: { email },
        });

        if (!usuario || !usuario.activo) {
          return null;
        }

        const passwordValida = await bcrypt.compare(
          password,
          usuario.passwordHash
        );

        if (!passwordValida) {
          return null;
        }

        // Solo apoderado pasa por el flujo de auto-registro/verificación;
        // admin y funcionario se crean manualmente y quedan exentos.
        if (usuario.rol === "apoderado" && !usuario.emailVerificado) {
          throw new EmailNoVerificadoError();
        }

        return {
          id: String(usuario.id),
          email: usuario.email,
          name: usuario.nombre,
          rol: usuario.rol,
          colegioId: usuario.colegioId,
          remember: mantenerSesion === "on",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.rol = user.rol;
        token.colegioId = user.colegioId;
        token.remember = user.remember;
      }

      token.exp =
        Math.floor(Date.now() / 1000) +
        (token.remember ? SESSION_MAX_AGE_LARGO : SESSION_MAX_AGE_CORTO);

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.rol = token.rol;
      session.user.colegioId = token.colegioId;
      return session;
    },
  },
});

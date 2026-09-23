import type { RolUsuario } from "@prisma/client";

// NextAuthConfig's callbacks (jwt/session) are typed against @auth/core's
// own Session/User/JWT interfaces, not the ones re-exported from
// "next-auth"/"next-auth/jwt" — augment the source modules directly or
// these fields stay `unknown` in the callbacks.
declare module "@auth/core/types" {
  interface User {
    rol: RolUsuario;
    colegioId: number | null;
  }

  interface Session {
    user: {
      id: string;
      rol: RolUsuario;
      colegioId: number | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    rol: RolUsuario;
    colegioId: number | null;
  }
}

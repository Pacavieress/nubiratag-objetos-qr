import bcrypt from "bcryptjs";

import { prisma } from "../lib/db";

const DEFAULT_EMAIL = "admin@colegio.cl";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    throw new Error(
      "SEED_ADMIN_PASSWORD no está definida. Defínela en .env con una " +
        "contraseña propia antes de correr el seed (no hay default por " +
        "seguridad). Ejemplo: SEED_ADMIN_PASSWORD=\"algo-largo-y-unico\""
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.usuario.upsert({
    where: { email },
    update: {
      passwordHash,
      rol: "admin",
      activo: true,
    },
    create: {
      email,
      passwordHash,
      nombre: "Administrador",
      rol: "admin",
      activo: true,
    },
  });

  console.log(`Usuario admin listo: ${admin.email}`);

  const UBICACIONES_DEFAULT = ["Recepción", "Inspectoría", "Portería"];

  for (const nombre of UBICACIONES_DEFAULT) {
    const existente = await prisma.ubicacion.findFirst({ where: { nombre } });
    if (!existente) {
      await prisma.ubicacion.create({ data: { nombre } });
      console.log(`Ubicación creada: ${nombre}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

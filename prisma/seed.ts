import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "../lib/db";

// Mismo costo que usaba el seed anterior.
const BCRYPT_COST = 12;

function requireEnv(name: string): string {
  const valor = process.env[name];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${name} para correr el seed.`);
  }
  return valor;
}

async function upsertUsuario(opts: {
  email: string;
  password: string;
  nombre: string;
  rol: "admin" | "funcionario" | "apoderado" | "superadmin";
  colegioId: number | null;
}) {
  const passwordHash = await bcrypt.hash(opts.password, BCRYPT_COST);

  const usuario = await prisma.usuario.upsert({
    where: { email: opts.email },
    update: {
      passwordHash,
      nombre: opts.nombre,
      rol: opts.rol,
      colegioId: opts.colegioId,
      activo: true,
    },
    create: {
      email: opts.email,
      passwordHash,
      nombre: opts.nombre,
      rol: opts.rol,
      colegioId: opts.colegioId,
      activo: true,
    },
  });

  console.log(`Usuario ${opts.rol} listo: ${usuario.email}`);
  return usuario;
}

async function upsertColegio(opts: { nombre: string; codigoRegistro: string }) {
  const colegio = await prisma.colegio.upsert({
    where: { codigoRegistro: opts.codigoRegistro },
    update: { nombre: opts.nombre, activo: true },
    create: {
      nombre: opts.nombre,
      codigoRegistro: opts.codigoRegistro,
      activo: true,
    },
  });

  console.log(`Colegio listo: ${colegio.nombre} (código: ${colegio.codigoRegistro})`);
  return colegio;
}

// Estudiante no tiene un campo único además de id, así que la idempotencia
// se resuelve buscando por nombre + apoderadoId antes de crear.
async function ensureEstudiante(opts: {
  nombre: string;
  apoderadoId: number;
  colegioId: number;
}) {
  const existente = await prisma.estudiante.findFirst({
    where: { nombre: opts.nombre, apoderadoId: opts.apoderadoId },
  });

  if (existente) {
    console.log(`Estudiante ya existía: ${existente.nombre}`);
    return existente;
  }

  const estudiante = await prisma.estudiante.create({
    data: {
      nombre: opts.nombre,
      apoderadoId: opts.apoderadoId,
      colegioId: opts.colegioId,
      activo: true,
    },
  });

  console.log(`Estudiante creado: ${estudiante.nombre}`);
  return estudiante;
}

// Idempotente por estudianteId: si el estudiante ya tiene un QR del seed,
// no genera uno nuevo (el token es aleatorio en cada corrida, así que no
// hay otro campo estable contra el cual hacer upsert) — pero SÍ actualiza
// la etiqueta si no coincide con la declarada acá, para que una corrida
// posterior del seed pueda agregarle etiqueta a un QR viejo sin duplicar.
async function ensureQrCodigo(opts: {
  estudianteId: number;
  colegioId: number;
  etiqueta: string;
}) {
  const existente = await prisma.qrCodigo.findFirst({
    where: { estudianteId: opts.estudianteId },
  });

  if (existente) {
    if (existente.etiqueta !== opts.etiqueta) {
      const actualizado = await prisma.qrCodigo.update({
        where: { id: existente.id },
        data: { etiqueta: opts.etiqueta },
      });
      console.log(
        `QR actualizado con etiqueta para estudiante ${opts.estudianteId}: ${actualizado.etiqueta}`
      );
      return actualizado;
    }
    console.log(`QR ya existía para estudiante ${opts.estudianteId}: ${existente.token}`);
    return existente;
  }

  // 128 bits, 32 caracteres hex, sin prefijo (pedido explícito para el
  // seed; la app en runtime usa base64url vía lib/qr.ts#generarToken).
  const token = randomBytes(16).toString("hex");

  const qr = await prisma.qrCodigo.create({
    data: {
      estudianteId: opts.estudianteId,
      colegioId: opts.colegioId,
      token,
      etiqueta: opts.etiqueta,
      estado: "activo",
    },
  });

  console.log(`QR creado para estudiante ${opts.estudianteId}: ${qr.token} (${qr.etiqueta})`);
  return qr;
}

async function ensureUbicacion(opts: { nombre: string; colegioId: number }) {
  const existente = await prisma.ubicacion.findFirst({
    where: { nombre: opts.nombre, colegioId: opts.colegioId },
  });

  if (existente) {
    return existente;
  }

  const ubicacion = await prisma.ubicacion.create({
    data: { nombre: opts.nombre, colegioId: opts.colegioId, activo: true },
  });

  console.log(`Ubicación creada: ${ubicacion.nombre}`);
  return ubicacion;
}

async function main() {
  // 1. Colegio de prueba + su código de registro (antes que el admin:
  // ahora el admin de colegio necesita colegio.id para existir). El
  // schema no tiene una entidad separada para el código: es
  // Colegio.codigoRegistro.
  const colegio = await upsertColegio({
    nombre: "Colegio San Ejemplo",
    codigoRegistro: "SANEJEMPLO2026",
  });

  // 2. Super admin — colegioId null, no pertenece a ningún colegio.
  await upsertUsuario({
    email: requireEnv("SEED_SUPERADMIN_EMAIL"),
    password: requireEnv("SEED_SUPERADMIN_PASSWORD"),
    nombre: "Super Admin Plataforma",
    rol: "superadmin",
    colegioId: null,
  });

  // 3. Admin del colegio de prueba — colegioId obligatorio.
  await upsertUsuario({
    email: requireEnv("SEED_ADMIN_EMAIL"),
    password: requireEnv("SEED_ADMIN_PASSWORD"),
    nombre: "Admin Colegio San Ejemplo",
    rol: "admin",
    colegioId: colegio.id,
  });

  // 4. Funcionario, ligado al colegio.
  await upsertUsuario({
    email: requireEnv("SEED_FUNCIONARIO_EMAIL"),
    password: requireEnv("SEED_FUNCIONARIO_PASSWORD"),
    nombre: "Funcionario Prueba",
    rol: "funcionario",
    colegioId: colegio.id,
  });

  // 5. Apoderado, ligado al colegio.
  const apoderado = await upsertUsuario({
    email: requireEnv("SEED_APODERADO_EMAIL"),
    password: requireEnv("SEED_APODERADO_PASSWORD"),
    nombre: "Apoderado Prueba",
    rol: "apoderado",
    colegioId: colegio.id,
  });

  // 6. Estudiantes del apoderado.
  const estudiante1 = await ensureEstudiante({
    nombre: "Juan Pérez",
    apoderadoId: apoderado.id,
    colegioId: colegio.id,
  });
  const estudiante2 = await ensureEstudiante({
    nombre: "Ana Pérez",
    apoderadoId: apoderado.id,
    colegioId: colegio.id,
  });

  // 7. Un QR por estudiante, con etiqueta (un QR = un objeto).
  await ensureQrCodigo({
    estudianteId: estudiante1.id,
    colegioId: colegio.id,
    etiqueta: "Mochila",
  });
  await ensureQrCodigo({
    estudianteId: estudiante2.id,
    colegioId: colegio.id,
    etiqueta: "Chaqueta",
  });

  // 8. Ubicaciones del colegio.
  await ensureUbicacion({ nombre: "Recepción", colegioId: colegio.id });
  await ensureUbicacion({ nombre: "Inspectoría", colegioId: colegio.id });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

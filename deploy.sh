#!/usr/bin/env bash
set -euo pipefail

APP_NAME="nubiratag"
APP_URL="http://localhost:3001"

echo "==> Guardando referencia del commit actual"
COMMIT_ANTERIOR=$(git rev-parse HEAD)

echo "==> Actualizando repo (git pull origin main)"
git pull origin main

COMMIT_NUEVO=$(git rev-parse HEAD)
ARCHIVOS_CAMBIADOS=$(git diff --name-only "$COMMIT_ANTERIOR" "$COMMIT_NUEVO")

if echo "$ARCHIVOS_CAMBIADOS" | grep -qE '^(package\.json|package-lock\.json)$'; then
  echo "==> package.json/package-lock.json cambiaron, instalando dependencias (npm install)"
  npm install
else
  echo "==> Sin cambios en dependencias, saltando npm install"
fi

if echo "$ARCHIVOS_CAMBIADOS" | grep -q '^prisma/schema\.prisma$'; then
  echo "==> prisma/schema.prisma cambió, aplicando migraciones (prisma migrate deploy + generate)"
  npx prisma migrate deploy
  npx prisma generate
else
  echo "==> Sin cambios en el schema de Prisma, saltando migraciones"
fi

echo "==> Compilando (npm run build)"
npm run build

echo "==> Reiniciando proceso con pm2 ($APP_NAME)"
pm2 restart "$APP_NAME" --update-env

echo "==> Verificando que la app responda en $APP_URL"
RESPUESTA=$(curl -sI "$APP_URL" | head -1)
echo "$RESPUESTA"

if echo "$RESPUESTA" | grep -q " 200 "; then
  echo "==> Deploy exitoso: $APP_URL responde 200"
else
  echo "==> ERROR: $APP_URL no respondió 200 (respuesta: $RESPUESTA)"
  exit 1
fi

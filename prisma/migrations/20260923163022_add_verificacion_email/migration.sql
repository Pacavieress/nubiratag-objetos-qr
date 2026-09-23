-- AlterTable
ALTER TABLE `usuario` ADD COLUMN `email_verificado` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `token_verificacion` VARCHAR(191) NULL,
    ADD COLUMN `token_verificacion_expira` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `usuario_token_verificacion_key` ON `usuario`(`token_verificacion`);

-- Backfill: los apoderados que ya existían antes de este cambio nunca
-- pasaron por el flujo de verificación por correo, así que quedan
-- marcados como verificados para no bloquearlos. Solo los registros
-- nuevos (a partir de ahora) requieren verificar su correo. Admin y
-- funcionario nunca chequean este campo (ver lib/auth.ts), así que no
-- necesitan backfill.
UPDATE `usuario` SET `email_verificado` = true WHERE `rol` = 'apoderado';

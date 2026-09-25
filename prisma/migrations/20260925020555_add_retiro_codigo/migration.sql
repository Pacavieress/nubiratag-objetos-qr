-- AlterTable
ALTER TABLE `hallazgo`
  ADD COLUMN `codigo_retiro` VARCHAR(191) NULL,
  ADD COLUMN `retirado_at` DATETIME(3) NULL,
  ADD COLUMN `retirado_por` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `hallazgo_codigo_retiro_key` ON `hallazgo`(`codigo_retiro`);

-- CreateIndex
CREATE INDEX `hallazgo_retirado_por_idx` ON `hallazgo`(`retirado_por`);

-- AddForeignKey
ALTER TABLE `hallazgo` ADD CONSTRAINT `hallazgo_retirado_por_fkey` FOREIGN KEY (`retirado_por`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

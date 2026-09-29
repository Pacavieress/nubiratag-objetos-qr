-- CreateTable
CREATE TABLE `suscripcion_push` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `clave_p256dh` VARCHAR(191) NOT NULL,
    `clave_auth` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `suscripcion_push_endpoint_key`(`endpoint`),
    INDEX `suscripcion_push_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `suscripcion_push` ADD CONSTRAINT `suscripcion_push_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

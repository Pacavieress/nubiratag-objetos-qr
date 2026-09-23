-- CreateTable
CREATE TABLE `colegio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `codigo_registro` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `colegio_codigo_registro_key`(`codigo_registro`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `rol` ENUM('admin', 'funcionario', 'apoderado') NOT NULL,
    `colegio_id` INTEGER NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `usuario_email_key`(`email`),
    INDEX `usuario_colegio_id_idx`(`colegio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estudiante` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `curso` VARCHAR(191) NULL,
    `apoderado_id` INTEGER NOT NULL,
    `colegio_id` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `estudiante_apoderado_id_idx`(`apoderado_id`),
    INDEX `estudiante_colegio_id_idx`(`colegio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qr_codigo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `estudiante_id` INTEGER NOT NULL,
    `colegio_id` INTEGER NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `etiqueta` VARCHAR(191) NULL,
    `estado` ENUM('activo', 'revocado') NOT NULL DEFAULT 'activo',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `qr_codigo_token_key`(`token`),
    INDEX `qr_codigo_estudiante_id_idx`(`estudiante_id`),
    INDEX `qr_codigo_colegio_id_idx`(`colegio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ubicacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `colegio_id` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ubicacion_colegio_id_idx`(`colegio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hallazgo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `qr_codigo_id` INTEGER NOT NULL,
    `ubicacion_id` INTEGER NOT NULL,
    `reportado_por` INTEGER NOT NULL,
    `nota` VARCHAR(191) NULL,
    `estado` ENUM('reportado', 'retirado', 'descartado') NOT NULL DEFAULT 'reportado',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `hallazgo_qr_codigo_id_idx`(`qr_codigo_id`),
    INDEX `hallazgo_ubicacion_id_idx`(`ubicacion_id`),
    INDEX `hallazgo_reportado_por_idx`(`reportado_por`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hallazgo_id` INTEGER NOT NULL,
    `canal` ENUM('email', 'whatsapp', 'web') NOT NULL,
    `destinatario` VARCHAR(191) NOT NULL,
    `estado` ENUM('pendiente', 'enviada', 'fallida') NOT NULL DEFAULT 'pendiente',
    `payload` JSON NOT NULL,
    `enviada_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notificacion_hallazgo_id_idx`(`hallazgo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_colegio_id_fkey` FOREIGN KEY (`colegio_id`) REFERENCES `colegio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estudiante` ADD CONSTRAINT `estudiante_apoderado_id_fkey` FOREIGN KEY (`apoderado_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estudiante` ADD CONSTRAINT `estudiante_colegio_id_fkey` FOREIGN KEY (`colegio_id`) REFERENCES `colegio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qr_codigo` ADD CONSTRAINT `qr_codigo_estudiante_id_fkey` FOREIGN KEY (`estudiante_id`) REFERENCES `estudiante`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qr_codigo` ADD CONSTRAINT `qr_codigo_colegio_id_fkey` FOREIGN KEY (`colegio_id`) REFERENCES `colegio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ubicacion` ADD CONSTRAINT `ubicacion_colegio_id_fkey` FOREIGN KEY (`colegio_id`) REFERENCES `colegio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hallazgo` ADD CONSTRAINT `hallazgo_qr_codigo_id_fkey` FOREIGN KEY (`qr_codigo_id`) REFERENCES `qr_codigo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hallazgo` ADD CONSTRAINT `hallazgo_ubicacion_id_fkey` FOREIGN KEY (`ubicacion_id`) REFERENCES `ubicacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hallazgo` ADD CONSTRAINT `hallazgo_reportado_por_fkey` FOREIGN KEY (`reportado_por`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificacion` ADD CONSTRAINT `notificacion_hallazgo_id_fkey` FOREIGN KEY (`hallazgo_id`) REFERENCES `hallazgo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

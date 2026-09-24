-- AlterTable: agrega 'superadmin' al enum de rol.
ALTER TABLE `usuario` MODIFY COLUMN `rol` ENUM('admin', 'funcionario', 'apoderado', 'superadmin') NOT NULL;

-- Los admin existentes sin colegio son, con la nueva regla, superadmin
-- (admin ahora siempre requiere colegioId). Convierte esos casos; no
-- toca ningún admin que ya tenga colegioId (no hay ninguno hoy, pero si
-- lo hubiera, se queda como admin de colegio tal cual).
UPDATE `usuario` SET `rol` = 'superadmin' WHERE `rol` = 'admin' AND `colegio_id` IS NULL;

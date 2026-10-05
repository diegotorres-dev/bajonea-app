-- Migración de datos: Categoria y Tag de `bajonea` (base MVP, deprecada) a
-- `bajonea_final` (base definitiva del proyecto completo).
--
-- Contexto: ver docs/DECISIONES.md, entrada "Enmienda formal de alcance: el
-- proyecto deja de ser un MVP acotado y pasa a ser el proyecto completo"
-- (2026-08-27) y docs/AUDITORIA-MODELO-DATOS-NUEVO.md. Confirmado con Diego
-- que de todos los datos cargados en `bajonea`, solo Categoria y Tag valen
-- la pena conservar (Provincia/Localidad ya están resueltas en
-- `bajonea_final` vía el ETL de Georef, idempotente; el resto son datos de
-- prueba descartables).
--
-- Estructura de `categoria`/`tag` verificada idéntica entre ambas bases
-- (DESCRIBE columna a columna, 2026-08-27) — sin discrepancias que resolver.
-- Se preserva el `id` original de `bajonea` para que no haya que resolver
-- ningún remapeo cuando en una fase futura se migre `Producto`/`ProductoTag`
-- (que referencian estos ids por FK).
--
-- Repetible sin duplicar (ON DUPLICATE KEY UPDATE sobre el id, mismo
-- criterio ya usado en el ETL de Georef de Provincia/Localidad).
--
-- Ejecutar contra `bajonea_final` únicamente. Nunca contra `bajonea`
-- (de ahí solo se lee).

-- ============================================================================
-- Categoria (22 filas en origen)
-- ============================================================================

INSERT INTO bajonea_final.categoria (id, nombre, activo, fecha_creacion, fecha_modificacion, fecha_baja) VALUES
(1,  'Pizzas',              1, '2026-07-31 22:59:18', NULL, NULL),
(2,  'Empanadas',           1, '2026-07-31 22:59:22', NULL, NULL),
(3,  'Hamburguesas',        1, '2026-07-31 22:59:26', NULL, NULL),
(4,  'Milanesas',           1, '2026-07-31 22:59:31', NULL, NULL),
(5,  'Lomitos',             1, '2026-07-31 22:59:34', NULL, NULL),
(6,  'Comida Casera',       1, '2026-07-31 22:59:39', NULL, NULL),
(7,  'Menú del Día',        1, '2026-07-31 22:59:44', NULL, NULL),
(8,  'Parrillas y Asados',  1, '2026-07-31 22:59:52', NULL, NULL),
(9,  'Pastas',              1, '2026-07-31 23:05:51', NULL, NULL),
(10, 'Comidas Mexicanas',   1, '2026-07-31 23:05:57', NULL, NULL),
(11, 'Comidas Asiáticas',   1, '2026-07-31 23:06:02', NULL, NULL),
(12, 'Sushi',               1, '2026-07-31 23:06:07', NULL, NULL),
(13, 'Pescados y Mariscos', 1, '2026-07-31 23:06:13', NULL, NULL),
(14, 'Panadería',           1, '2026-07-31 23:06:17', NULL, NULL),
(15, 'Pastelería',          1, '2026-07-31 23:06:21', NULL, NULL),
(16, 'Helados',             1, '2026-07-31 23:06:25', NULL, NULL),
(17, 'Ensaladas y Bowls',   1, '2026-07-31 23:06:33', NULL, NULL),
(18, 'Bebidas c/ Alcohol',  1, '2026-07-31 23:06:40', NULL, NULL),
(19, 'Bebidas s/ Alcohol',  1, '2026-07-31 23:06:45', NULL, NULL),
(20, 'Café e Infusiones',   1, '2026-07-31 23:06:51', NULL, NULL),
(21, 'Para Picar',          1, '2026-07-31 23:06:58', NULL, NULL),
(22, 'Otros',               1, '2026-07-31 23:07:02', NULL, NULL)
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    activo = VALUES(activo),
    fecha_creacion = VALUES(fecha_creacion),
    fecha_modificacion = VALUES(fecha_modificacion),
    fecha_baja = VALUES(fecha_baja);

-- ============================================================================
-- Tag (17 filas en origen)
-- ============================================================================

INSERT INTO bajonea_final.tag (id, nombre, activo, fecha_creacion, fecha_modificacion, fecha_baja) VALUES
(1,  'Vegano',             1, '2026-07-31 23:07:21', NULL, NULL),
(2,  'Vegetariano',        1, '2026-07-31 23:07:24', NULL, NULL),
(3,  'Sin TACC',           1, '2026-07-31 23:07:29', NULL, NULL),
(4,  'Sin Lactosa',        1, '2026-07-31 23:07:34', NULL, NULL),
(5,  'Apto Diabéticos',    1, '2026-07-31 23:07:38', NULL, NULL),
(6,  'Sin Azúcar',         1, '2026-07-31 23:07:46', NULL, NULL),
(7,  'Picante',            1, '2026-07-31 23:07:49', NULL, NULL),
(8,  'Dulce',              1, '2026-07-31 23:07:52', NULL, NULL),
(9,  'Salado',             1, '2026-07-31 23:07:55', NULL, NULL),
(10, 'Para Compartir',     1, '2026-07-31 23:08:01', NULL, NULL),
(11, 'Al Horno',           1, '2026-07-31 23:08:05', NULL, NULL),
(12, 'A la Parrilla',      1, '2026-07-31 23:08:12', NULL, NULL),
(13, 'Frito',              1, '2026-07-31 23:08:17', NULL, NULL),
(14, 'Al Vapor',           1, '2026-07-31 23:08:20', NULL, NULL),
(15, 'Combos',             1, '2026-07-31 23:08:23', NULL, NULL),
(16, 'Light',              1, '2026-07-31 23:08:26', NULL, NULL),
(17, 'Desayuno/Merienda',  1, '2026-07-31 23:08:33', NULL, NULL)
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    activo = VALUES(activo),
    fecha_creacion = VALUES(fecha_creacion),
    fecha_modificacion = VALUES(fecha_modificacion),
    fecha_baja = VALUES(fecha_baja);

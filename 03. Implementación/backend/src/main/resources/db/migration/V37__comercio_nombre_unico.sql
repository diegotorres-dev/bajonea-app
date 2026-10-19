-- Nombre de comercio unico en toda la plataforma. La columna generada guarda el nombre sin espacios de mas
-- (TRIM + colapso de cualquier espacio, tabulacion o espacio no cortante) y vale NULL para RECHAZO_DEFINITIVO, que
-- libera el nombre; cualquier otro estado, incluido RECHAZADO, lo retiene. La colacion utf8mb4_unicode_ci hace que el
-- UNIQUE ignore mayusculas y acentos (y que la n con tilde sea igual a la n). La entidad JPA no mapea esta columna;
-- el chequeo previo del servicio usa la misma expresion contra ella. Antes de aplicarla en una base existente:
-- SELECT TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' ')) AS clave, COUNT(*) FROM comercio
-- WHERE estado <> 'RECHAZO_DEFINITIVO' GROUP BY clave COLLATE utf8mb4_unicode_ci HAVING COUNT(*) > 1;
ALTER TABLE `comercio`
  ADD COLUMN `nombre_unico` varchar(150) COLLATE utf8mb4_unicode_ci
    GENERATED ALWAYS AS (CASE WHEN `estado` = 'RECHAZO_DEFINITIVO' THEN NULL
      ELSE TRIM(REGEXP_REPLACE(`nombre`, '[[:space:]]+', ' ')) END) STORED,
  ADD UNIQUE KEY `uq_comercio_nombre_unico` (`nombre_unico`);

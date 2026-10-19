-- Saneamiento de datos de bajonea_practicas3 previo a la Fase 1 (bloque Registro de Comercio).
-- NO es una migracion de Flyway: son correcciones de datos de una base concreta. Se corre a mano en
-- phpMyAdmin, sobre bajonea_practicas3, y antes de aplicar las migraciones V36 y V37.
--
-- Que hace:
--   1. Informa (sin modificar nada) el estado de los comercios llamados "Multicomercio", con sus
--      productos y pedidos, y las direcciones que estan en localidades fuera de Rio Grande, Ushuaia y Tolhuin.
--   2. Renombra a "Multicomercio 2" el comercio de id mayor entre los dos que se llaman "Multicomercio"
--      (hoy ids 41 y 42, ambos APROBADO, del dueno 260). Solo toca comercio.nombre y comercio.fecha_modificacion.
--   3. Pasa a Rio Grande (94008010) las direcciones de Laguna Escondida (94015010) y Puerto Argentino
--      (94021010). Solo toca direccion.localidad_id y direccion.fecha_modificacion.
--   4. Vuelve a informar, para comparar contra la primera tabla.
--
-- Idempotente: si se corre dos veces, la segunda no cambia nada.
--   - El renombre solo ocurre si hay exactamente 2 comercios (no RECHAZO_DEFINITIVO) con el nombre
--     "Multicomercio" y ninguno llamado "Multicomercio 2". Despues de la primera corrida queda uno solo, asi
--     que la segunda no encuentra nada que renombrar. Con 3 o mas no toca nada (hay que revisarlos a mano).
--   - El pasaje a Rio Grande solo alcanza filas que sigan en las dos localidades de origen.
--
-- No toca productos, pedidos, usuarios, otras columnas de direccion (ni codigo_postal) ni otras tablas.
-- El codigo postal de esas direcciones queda como esta; si queres ponerlo en 9420, hay una linea opcional
-- al final del bloque 3, comentada.

-- ============================================================================================
-- 1. INFORME ANTES
-- ============================================================================================
SET @etapa = 'ANTES';

SELECT @etapa AS etapa, 'Comercio llamado Multicomercio*' AS chequeo,
       CONCAT(c.nombre, ' | ', c.estado, ' | dueno ', c.dueno_id,
              ' | productos ', (SELECT COUNT(*) FROM producto p WHERE p.comercio_id = c.id),
              ' | pedidos ', (SELECT COUNT(*) FROM pedido ped WHERE ped.comercio_id = c.id)) AS detalle,
       c.id AS cantidad
FROM comercio c
WHERE c.nombre LIKE 'Multicomercio%'
UNION ALL
SELECT @etapa, 'Grupos con nombre de comercio duplicado (debe dar 0 antes del indice unico)',
       COALESCE(GROUP_CONCAT(CONCAT(d.clave, ' -> ids ', d.ids) SEPARATOR ' | '), 'ninguno'), COUNT(*)
FROM (SELECT TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' ')) AS clave, GROUP_CONCAT(id ORDER BY id) AS ids
      FROM comercio
      WHERE estado <> 'RECHAZO_DEFINITIVO'
      GROUP BY TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' '))
      HAVING COUNT(*) > 1) d
UNION ALL
SELECT @etapa, 'Direccion en localidad fuera de Rio Grande, Ushuaia y Tolhuin',
       CONCAT('direccion ', d.id, ' | localidad ', d.localidad_id, ' ', l.nombre, ' | ',
              IF(d.cliente_id IS NOT NULL, CONCAT('cliente ', d.cliente_id), CONCAT('comercio ', d.comercio_id)),
              ' | CP ', d.codigo_postal, ' | pedidos que la usan ',
              (SELECT COUNT(*) FROM pedido ped WHERE ped.direccion_id = d.id)),
       d.id
FROM direccion d
JOIN localidad l ON l.id = d.localidad_id
WHERE d.localidad_id NOT IN ('94008010', '94015020', '94011010')
UNION ALL
SELECT @etapa, 'Total de direcciones fuera de la lista', 'cantidad', COUNT(*)
FROM direccion
WHERE localidad_id NOT IN ('94008010', '94015020', '94011010')
UNION ALL
SELECT @etapa, 'Existe la localidad de destino Rio Grande 94008010', 'cantidad', COUNT(*)
FROM localidad
WHERE id = '94008010';

-- ============================================================================================
-- 2 y 3. CORRECCIONES (en una transaccion)
-- ============================================================================================
START TRANSACTION;

SET @cuantos = (SELECT COUNT(*) FROM comercio
                WHERE estado <> 'RECHAZO_DEFINITIVO'
                  AND TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' ')) = 'Multicomercio');
SET @mayor = (SELECT MAX(id) FROM comercio
              WHERE estado <> 'RECHAZO_DEFINITIVO'
                AND TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' ')) = 'Multicomercio');
SET @ya_existe_2 = (SELECT COUNT(*) FROM comercio
                    WHERE TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' ')) = 'Multicomercio 2');

UPDATE comercio
SET nombre = 'Multicomercio 2',
    fecha_modificacion = NOW()
WHERE id = @mayor
  AND @cuantos = 2
  AND @ya_existe_2 = 0;

UPDATE direccion
SET localidad_id = '94008010',
    fecha_modificacion = NOW()
WHERE localidad_id IN ('94015010', '94021010');

-- Opcional: poner tambien el codigo postal de Rio Grande en esas mismas direcciones (descomentar para usarlo).
-- UPDATE direccion SET codigo_postal = '9420' WHERE localidad_id = '94008010' AND codigo_postal <> '9420' AND id IN (<ids de las 6 direcciones>);

COMMIT;

-- ============================================================================================
-- 4. INFORME DESPUES (mismas consultas que el informe ANTES)
-- ============================================================================================
SET @etapa = 'DESPUES';

SELECT @etapa AS etapa, 'Comercio llamado Multicomercio*' AS chequeo,
       CONCAT(c.nombre, ' | ', c.estado, ' | dueno ', c.dueno_id,
              ' | productos ', (SELECT COUNT(*) FROM producto p WHERE p.comercio_id = c.id),
              ' | pedidos ', (SELECT COUNT(*) FROM pedido ped WHERE ped.comercio_id = c.id)) AS detalle,
       c.id AS cantidad
FROM comercio c
WHERE c.nombre LIKE 'Multicomercio%'
UNION ALL
SELECT @etapa, 'Grupos con nombre de comercio duplicado (debe dar 0 antes del indice unico)',
       COALESCE(GROUP_CONCAT(CONCAT(d.clave, ' -> ids ', d.ids) SEPARATOR ' | '), 'ninguno'), COUNT(*)
FROM (SELECT TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' ')) AS clave, GROUP_CONCAT(id ORDER BY id) AS ids
      FROM comercio
      WHERE estado <> 'RECHAZO_DEFINITIVO'
      GROUP BY TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' '))
      HAVING COUNT(*) > 1) d
UNION ALL
SELECT @etapa, 'Direccion en localidad fuera de Rio Grande, Ushuaia y Tolhuin',
       CONCAT('direccion ', d.id, ' | localidad ', d.localidad_id, ' ', l.nombre, ' | ',
              IF(d.cliente_id IS NOT NULL, CONCAT('cliente ', d.cliente_id), CONCAT('comercio ', d.comercio_id)),
              ' | CP ', d.codigo_postal, ' | pedidos que la usan ',
              (SELECT COUNT(*) FROM pedido ped WHERE ped.direccion_id = d.id)),
       d.id
FROM direccion d
JOIN localidad l ON l.id = d.localidad_id
WHERE d.localidad_id NOT IN ('94008010', '94015020', '94011010')
UNION ALL
SELECT @etapa, 'Total de direcciones fuera de la lista', 'cantidad', COUNT(*)
FROM direccion
WHERE localidad_id NOT IN ('94008010', '94015020', '94011010')
UNION ALL
SELECT @etapa, 'Existe la localidad de destino Rio Grande 94008010', 'cantidad', COUNT(*)
FROM localidad
WHERE id = '94008010';

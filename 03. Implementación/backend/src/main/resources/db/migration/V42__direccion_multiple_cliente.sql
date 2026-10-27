-- Direcciones multiples del Cliente. Agrega alias y referencia a direccion, una garantia en base de una sola
-- direccion predeterminada activa por Cliente (columna generada STORED + UNIQUE, mismo patron que V27 y V37; los
-- NULL no cuentan como duplicados) y la copia de la direccion de entrega en pedido. pedido.direccion_id se conserva
-- solo como origen; entrega_localidad_id no lleva FK a proposito (catalogo estatico, sin bloqueo compartido extra
-- por pedido). Primero DDL, despues DML: MariaDB no revierte el DDL si la migracion falla a la mitad.
ALTER TABLE `direccion`
  ADD COLUMN `nombre` varchar(40) NULL,
  ADD COLUMN `referencia` varchar(150) NULL,
  ADD COLUMN `principal_activa_cliente_id` int
    GENERATED ALWAYS AS (IF(`principal` = 1 AND `eliminada` = 0, `cliente_id`, NULL)) STORED,
  ADD KEY `idx_direccion_cliente_activa` (`cliente_id`, `eliminada`);

UPDATE `direccion` d
  JOIN (SELECT cliente_id, MAX(id) AS id FROM `direccion`
        WHERE cliente_id IS NOT NULL AND eliminada = 0
          AND cliente_id NOT IN (SELECT cliente_id FROM (SELECT cliente_id FROM `direccion`
                                  WHERE cliente_id IS NOT NULL AND eliminada = 0 AND principal = 1) p)
        GROUP BY cliente_id) x ON x.id = d.id
  SET d.principal = 1;

ALTER TABLE `direccion`
  ADD UNIQUE KEY `uq_direccion_principal_cliente` (`principal_activa_cliente_id`);

ALTER TABLE `pedido`
  ADD COLUMN `entrega_calle` varchar(150) NULL,
  ADD COLUMN `entrega_numero` varchar(10) NULL,
  ADD COLUMN `entrega_piso_depto` varchar(30) NULL,
  ADD COLUMN `entrega_codigo_postal` varchar(10) NULL,
  ADD COLUMN `entrega_localidad_id` varchar(15) NULL,
  ADD COLUMN `entrega_referencia` varchar(150) NULL;

UPDATE `pedido` p
  JOIN `direccion` d ON d.id = p.direccion_id
  SET p.entrega_calle = d.calle,
      p.entrega_numero = d.numero,
      p.entrega_piso_depto = d.piso_depto,
      p.entrega_codigo_postal = d.codigo_postal,
      p.entrega_localidad_id = d.localidad_id,
      p.entrega_referencia = d.referencia
  WHERE p.direccion_id IS NOT NULL;

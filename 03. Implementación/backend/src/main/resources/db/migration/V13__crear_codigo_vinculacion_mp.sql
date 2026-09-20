-- Tramo MercadoPago 02 (vinculación OAuth): tabla nueva, sin equivalente en
-- docs/diccionario-de-datos.md — guarda el `state`/`code_verifier` de PKCE entre el momento en
-- que Bajoneá redirige al Dueño a autorizar en Mercado Pago y el momento en que MP redirige de
-- vuelta al callback con el `code`. Vida corta (minutos), no es tabla de historial: una fila se
-- crea al iniciar la vinculación y se marca `usado=1` apenas se completa el intercambio (o queda
-- abandonada sin uso si el Dueño nunca vuelve de MP — sin job de limpieza en este tramo).
--
-- Deliberadamente separada de `token` (verificación de email/recuperación de password/
-- reactivación de cuenta): esa tabla está pensada para códigos de 6 dígitos que un humano tipea
-- a mano, esto es un string opaco que viaja automáticamente entre el backend y MP, sin que el
-- Dueño lo vea nunca — son dos conceptos distintos (ver docs/DECISIONES.md).
CREATE TABLE `codigo_vinculacion_mp` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dueno_id` int(11) NOT NULL,
  `identificador_intento` varchar(64) NOT NULL,
  `codigo_verificacion` varchar(128) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `usado` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_codigo_vinculacion_mp_identificador` (`identificador_intento`),
  KEY `idx_codigo_vinculacion_mp_dueno` (`dueno_id`),
  CONSTRAINT `fk_codigo_vinculacion_mp_dueno` FOREIGN KEY (`dueno_id`) REFERENCES `dueno` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

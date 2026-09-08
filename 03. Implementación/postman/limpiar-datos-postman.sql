-- Limpia exclusivamente los datos de prueba creados por la colección de Postman de Bajoneá.
-- Filtra siempre por marcadores propios de la colección (emails postman.*@bajonea.test,
-- nombres de categoria/tag con 'Postman') — nunca toca admin, provincia/localidad, ni datos
-- reales. Re-ejecutable: si no hay nada que borrar, no hace nada. Pensado para correr antes
-- de cada corrida de Newman contra una base local, ya que la colección no genera identificadores
-- únicos por corrida (email/cuit/dni fijos) — ver docs/DECISIONES.md, cierre de Fase 10/14.
--
-- Corregido el 2026-09-02 (tramo de matriz exhaustiva de testeo de Cliente) para alinear con
-- el schema real de bajonea_final tras la migración Comercio -> Dueño (Tramo 6 de
-- portabilidad, CLAUDE.md §1bis): la versión anterior filtraba comercio por
-- `persona_juridica_id`, columna que ya no existe (ahora `comercio.dueno_id`, con
-- `dueno.id = persona_juridica.id = persona.id = usuario.id` vía la cadena @MapsId), y borraba
-- `notificacion` por `pedido_id`, columna reemplazada por `entidad_tipo`/`entidad_id` en el
-- mismo tramo — ese DELETE fallaba con "Unknown column" y abortaba el resto del script
-- (columna inexistente = error duro, no silencioso), dejando datos de corridas previas sin
-- limpiar entre ejecuciones de Newman. También suma limpieza de tablas nuevas desde entonces:
-- `dueno` (+ su `persona_fisica_id` de representante, que NO cuelga de ningún `usuario`
-- propio), `red_social`, `historial_estado_comercio`, `historial_estado_pedido`,
-- `historial_estado_usuario`, `item_carrito_extra`, `detalle_pedido_extra`.
SET FOREIGN_KEY_CHECKS = 0;

DROP TEMPORARY TABLE IF EXISTS tmp_usr;
DROP TEMPORARY TABLE IF EXISTS tmp_com;
DROP TEMPORARY TABLE IF EXISTS tmp_dueno_repfisica;
DROP TEMPORARY TABLE IF EXISTS tmp_pedido;

CREATE TEMPORARY TABLE tmp_usr AS
SELECT id FROM usuario WHERE email LIKE 'postman.%@bajonea.test' OR email LIKE '%postman%@bajonea.test';

-- comercio.dueno_id = dueno.id = persona_juridica.id = persona.id = usuario.id (cadena @MapsId)
-- para la cuenta de Dueño que se registró con un email postman.*
CREATE TEMPORARY TABLE tmp_com AS
SELECT id FROM comercio WHERE dueno_id IN (SELECT id FROM tmp_usr);

-- Representante legal del Dueño: una PersonaFisica propia, sin usuario/login asociado —
-- capturada antes de borrar la fila de `dueno` que la referencia.
CREATE TEMPORARY TABLE tmp_dueno_repfisica AS
SELECT persona_fisica_id AS id FROM dueno WHERE id IN (SELECT id FROM tmp_usr) AND persona_fisica_id IS NOT NULL;

CREATE TEMPORARY TABLE tmp_pedido AS
SELECT id FROM pedido WHERE cliente_id IN (SELECT id FROM tmp_usr) OR comercio_id IN (SELECT id FROM tmp_com);

DELETE FROM historial_estado_pedido WHERE pedido_id IN (SELECT id FROM tmp_pedido);
DELETE FROM detalle_pedido_extra WHERE detalle_pedido_id IN (SELECT id FROM detalle_pedido WHERE pedido_id IN (SELECT id FROM tmp_pedido));
DELETE FROM detalle_pedido WHERE pedido_id IN (SELECT id FROM tmp_pedido);
DELETE FROM item_carrito_extra WHERE item_carrito_id IN (SELECT id FROM item_carrito WHERE carrito_id IN (SELECT id FROM carrito WHERE cliente_id IN (SELECT id FROM tmp_usr) OR comercio_id IN (SELECT id FROM tmp_com)));
DELETE FROM item_carrito WHERE carrito_id IN (SELECT id FROM carrito WHERE cliente_id IN (SELECT id FROM tmp_usr) OR comercio_id IN (SELECT id FROM tmp_com));
DELETE FROM carrito WHERE cliente_id IN (SELECT id FROM tmp_usr) OR comercio_id IN (SELECT id FROM tmp_com);
DELETE FROM notificacion WHERE usuario_id IN (SELECT id FROM tmp_usr);
DELETE FROM pedido WHERE id IN (SELECT id FROM tmp_pedido);
DELETE FROM red_social WHERE comercio_id IN (SELECT id FROM tmp_com);
DELETE FROM producto_tag WHERE producto_id IN (SELECT id FROM producto WHERE comercio_id IN (SELECT id FROM tmp_com));
DELETE FROM imagen_producto WHERE producto_id IN (SELECT id FROM producto WHERE comercio_id IN (SELECT id FROM tmp_com));
DELETE FROM producto WHERE comercio_id IN (SELECT id FROM tmp_com);
DELETE FROM horario WHERE comercio_id IN (SELECT id FROM tmp_com);
DELETE FROM historial_estado_comercio WHERE comercio_id IN (SELECT id FROM tmp_com);
DELETE FROM historial_estado_usuario WHERE usuario_id IN (SELECT id FROM tmp_usr);
DELETE FROM direccion WHERE cliente_id IN (SELECT id FROM tmp_usr) OR comercio_id IN (SELECT id FROM tmp_com);
DELETE FROM sesion WHERE usuario_id IN (SELECT id FROM tmp_usr);
DELETE FROM token WHERE usuario_id IN (SELECT id FROM tmp_usr);
DELETE FROM comercio WHERE id IN (SELECT id FROM tmp_com);
DELETE FROM dueno WHERE id IN (SELECT id FROM tmp_usr);
DELETE FROM cliente WHERE id IN (SELECT id FROM tmp_usr);
DELETE FROM administrador WHERE id IN (SELECT id FROM tmp_usr);
DELETE FROM persona_fisica WHERE id IN (SELECT id FROM tmp_usr) OR id IN (SELECT id FROM tmp_dueno_repfisica);
DELETE FROM persona_juridica WHERE id IN (SELECT id FROM tmp_usr);
DELETE FROM persona WHERE id IN (SELECT id FROM tmp_usr);
DELETE FROM usuario WHERE id IN (SELECT id FROM tmp_usr);

DROP TEMPORARY TABLE tmp_usr;
DROP TEMPORARY TABLE tmp_com;
DROP TEMPORARY TABLE tmp_dueno_repfisica;
DROP TEMPORARY TABLE tmp_pedido;

DELETE FROM producto_tag WHERE tag_id IN (SELECT id FROM tag WHERE nombre LIKE '%Postman%');
DELETE FROM tag WHERE nombre LIKE '%Postman%';
DELETE FROM categoria WHERE nombre LIKE '%Postman%';

SET FOREIGN_KEY_CHECKS = 1;

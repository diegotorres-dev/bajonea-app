-- Multi-comercio, tramo 1: borra el comercio creado con multicomercio-tramo1-crear-segundo-comercio.sql
-- y todo lo que colgó de él durante la prueba. Lo ejecuta Diego a mano; el asistente no lo corre.
--
-- Solo borra si TODAS estas condiciones se cumplen (si no, no toca nada):
--   * el nombre termina en ' (prueba multi)'
--   * no es el comercio más antiguo de su Dueño
--   * no tiene pedidos, grupos de extras ni empleados asociados
--
-- Poné el id del comercio NUEVO (el que mostró el script de creación):
SET @comercio_id = 0;

SET @seguro = (
  SELECT c.nombre LIKE '% (prueba multi)'
     AND c.id <> (SELECT o.id FROM comercio o WHERE o.dueno_id = c.dueno_id ORDER BY o.fecha_registro, o.id LIMIT 1)
     AND NOT EXISTS (SELECT 1 FROM pedido WHERE comercio_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM grupo_extra WHERE comercio_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM empleado_comercio WHERE comercio_id = c.id)
  FROM comercio c WHERE c.id = @comercio_id
);

SELECT IF(@seguro = 1, 'Se va a borrar', 'NO se borra nada (condiciones de seguridad no cumplidas o id inexistente)') AS resultado;

DELETE ic FROM item_carrito ic JOIN producto p ON p.id = ic.producto_id WHERE p.comercio_id = @comercio_id AND @seguro = 1;
UPDATE carrito SET comercio_id = NULL WHERE comercio_id = @comercio_id AND @seguro = 1;
DELETE ii FROM imagen_producto ii JOIN producto p ON p.id = ii.producto_id WHERE p.comercio_id = @comercio_id AND @seguro = 1;
DELETE pt FROM producto_tag pt JOIN producto p ON p.id = pt.producto_id WHERE p.comercio_id = @comercio_id AND @seguro = 1;
DELETE FROM producto WHERE comercio_id = @comercio_id AND @seguro = 1;
DELETE FROM red_social WHERE comercio_id = @comercio_id AND @seguro = 1;
DELETE FROM horario WHERE comercio_id = @comercio_id AND @seguro = 1;
DELETE FROM direccion WHERE comercio_id = @comercio_id AND @seguro = 1;
DELETE hcc FROM historial_cambio_comercio hcc JOIN historial_estado_comercio hec ON hec.id = hcc.historial_estado_comercio_id WHERE hec.comercio_id = @comercio_id AND @seguro = 1;
DELETE FROM historial_estado_comercio WHERE comercio_id = @comercio_id AND @seguro = 1;
DELETE FROM comercio WHERE id = @comercio_id AND @seguro = 1;

SELECT id, dueno_id, nombre, estado FROM comercio WHERE id = @comercio_id;

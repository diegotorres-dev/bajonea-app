-- Multi-comercio, tramo 1: crea un segundo comercio para un Dueño de prueba duplicando su
-- comercio más antiguo (mismos datos, dirección y horarios; nombre con el sufijo
-- ' (prueba multi)'). Lo ejecuta Diego a mano contra su base de desarrollo; el asistente no lo corre.
-- Sin tablas ni columnas nuevas. Se deshace con multicomercio-tramo1-borrar-segundo-comercio.sql.
--
-- 1) Poné el id del USUARIO Dueño (usuario.id = dueno.id) que querés probar:
SET @dueno_id = 0;
-- 2) Nombre del comercio nuevo (el sufijo es lo que reconoce el script de borrado):
SET @nombre = 'Segundo Comercio (prueba multi)';

SET @origen_id = (SELECT id FROM comercio WHERE dueno_id = @dueno_id AND nombre NOT LIKE '% (prueba multi)' ORDER BY fecha_registro, id LIMIT 1);

INSERT INTO comercio (dueno_id, nombre, descripcion, foto_perfil_url, telefono, email, tipo_comercio,
                      acepta_delivery, acepta_retiro, estado, fecha_registro)
SELECT dueno_id, @nombre, descripcion, foto_perfil_url, telefono, email, tipo_comercio,
       acepta_delivery, acepta_retiro, estado, NOW()
FROM comercio WHERE id = @origen_id;

SET @nuevo_id = LAST_INSERT_ID();

INSERT INTO direccion (calle, numero, piso_depto, codigo_postal, localidad_id, comercio_id, principal, fecha_creacion)
SELECT calle, numero, piso_depto, codigo_postal, localidad_id, @nuevo_id, principal, NOW()
FROM direccion WHERE comercio_id = @origen_id;

INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre)
SELECT @nuevo_id, dia_semana, hora_apertura, hora_cierre
FROM horario WHERE comercio_id = @origen_id;

SELECT id, dueno_id, nombre, estado, fecha_registro,
       IF(id = @nuevo_id, 'NUEVO (usá este id en X-Comercio-Id)', 'original') AS rol
FROM comercio WHERE dueno_id = @dueno_id ORDER BY fecha_registro, id;

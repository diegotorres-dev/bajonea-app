-- Inverso de prueba-manual-multicomercio-3b.sql: borra los dos Dueños de prueba, sus comercios y todo lo que se
-- haya generado alrededor probando (re-solicitudes, historiales, notificaciones, sesiones, tokens). Se puede correr
-- aunque no exista nada (no falla) y las veces que haga falta. No toca ningún otro dato.

USE bajonea_practicas3;

SET @u1 = (SELECT id FROM usuario WHERE email = 'dueno3b.uno@bajonea.test');
SET @u2 = (SELECT id FROM usuario WHERE email = 'dueno3b.dos@bajonea.test');

DELETE FROM notificacion
WHERE usuario_id IN (@u1, @u2)
   OR (entidad_tipo = 'COMERCIO' AND entidad_id IN (SELECT id FROM comercio WHERE dueno_id IN (@u1, @u2)));

DELETE FROM historial_cambio_comercio
WHERE historial_estado_comercio_id IN (
  SELECT id FROM historial_estado_comercio WHERE comercio_id IN (SELECT id FROM comercio WHERE dueno_id IN (@u1, @u2))
);
DELETE FROM historial_estado_comercio WHERE comercio_id IN (SELECT id FROM comercio WHERE dueno_id IN (@u1, @u2));
DELETE FROM red_social WHERE comercio_id IN (SELECT id FROM comercio WHERE dueno_id IN (@u1, @u2));
DELETE FROM horario WHERE comercio_id IN (SELECT id FROM comercio WHERE dueno_id IN (@u1, @u2));
DELETE FROM direccion WHERE comercio_id IN (SELECT id FROM comercio WHERE dueno_id IN (@u1, @u2));
DELETE FROM comercio WHERE dueno_id IN (@u1, @u2);

DELETE FROM codigo_vinculacion_mp WHERE dueno_id IN (@u1, @u2);
DELETE FROM cuenta_mercado_pago WHERE dueno_id IN (@u1, @u2);
DELETE FROM token WHERE usuario_id IN (@u1, @u2);
DELETE FROM sesion WHERE usuario_id IN (@u1, @u2);
DELETE FROM historial_estado_usuario WHERE usuario_id IN (@u1, @u2);
DELETE FROM historial_cambio_nombre_usuario WHERE usuario_id IN (@u1, @u2);

DELETE FROM dueno WHERE id IN (@u1, @u2);
DELETE FROM persona_juridica WHERE id IN (@u1, @u2);
DELETE FROM persona_fisica WHERE id IN (@u1, @u2);
DELETE FROM persona WHERE id IN (@u1, @u2);
DELETE FROM usuario WHERE id IN (@u1, @u2);

SELECT
  (SELECT COUNT(*) FROM usuario WHERE email IN ('dueno3b.uno@bajonea.test', 'dueno3b.dos@bajonea.test')) AS usuarios_restantes,
  (SELECT COUNT(*) FROM comercio WHERE email LIKE 'comercio3b.%@bajonea.test') AS comercios_restantes;

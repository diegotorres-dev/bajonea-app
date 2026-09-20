-- Fase 19 (anticipación de diseño, pedido a Diego, ver docs/DECISIONES.md): se agrega el valor
-- `EMPLEADO` al ENUM de `historial_estado_pedido.actor_rol`. La entidad `Empleado` y su vínculo
-- a `Usuario` todavía no existen en el proyecto (quedan en el bloque de fases nuevas sin
-- numerar, ver CLAUDE.md §1bis) — este valor queda sin ningún call site que lo use por ahora,
-- reservado para cuando se modele esa entidad.
ALTER TABLE `historial_estado_pedido`
  MODIFY COLUMN `actor_rol` ENUM('CLIENTE','COMERCIO','SISTEMA','EMPLEADO') NOT NULL;

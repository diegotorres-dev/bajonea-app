-- Amplía usuario.email de VARCHAR(150) a VARCHAR(254) — el máximo teórico real de una
-- dirección de email según RFC 5321/5322. Ver docs/DECISIONES.md, tramo de perfeccionamiento
-- de validaciones de "01. Datos Personales" de registro-cliente.html, para el detalle.
--
-- NOT NULL se repite explícitamente porque MODIFY COLUMN redefine la columna completa.
-- UNIQUE (email) es un índice a nivel de tabla, independiente de la definición de columna
-- — MODIFY COLUMN nunca lo toca, se mantiene intacto sin necesidad de repetirlo.
ALTER TABLE usuario MODIFY COLUMN email VARCHAR(254) NOT NULL;

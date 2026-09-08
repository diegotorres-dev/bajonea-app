-- Tramo 16.11, punto 2: token de VERIFICACION_EMAIL pasa de UUID v4 a codigo numerico
-- de 6 digitos (decision documentada en docs/DECISIONES.md, autorizada explicitamente
-- por Diego). RECUPERACION_PASSWORD y REACTIVACION_CUENTA siguen siendo UUID v4 sin
-- cambios (flujo por link, no de tipeo manual) -- por eso la columna `token` NO se
-- angosta: VARCHAR(36) sigue siendo necesario para que esos dos tipos convivan en la
-- misma tabla. Esta migracion agrega unicamente el contador de intentos fallidos que
-- protege al codigo de 6 digitos contra fuerza bruta (5 intentos, ver AuthService).

ALTER TABLE token
    ADD COLUMN intentos_fallidos INT NOT NULL DEFAULT 0 AFTER fecha_uso;

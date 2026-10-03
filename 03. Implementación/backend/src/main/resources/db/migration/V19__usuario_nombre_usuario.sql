-- Agrega usuario.nombre_usuario, credencial de login (el email pasa a usarse solo para
-- recuperación, verificación y reactivación de cuenta).
--
-- Paso 1: columna nullable. COLLATE utf8mb4_bin (sensible a mayúsculas, sin depender de la
-- collation por defecto del servidor ni de la base) + CHECK que obliga a minúsculas, para que la
-- base rechace mayúsculas aunque se escriba por fuera del backend.
ALTER TABLE usuario
    ADD COLUMN nombre_usuario VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL AFTER email;

-- Paso 2: cuentas conocidas. Se exige coincidencia de id Y email: si en otra base ese id
-- pertenece a otra cuenta, no se le asigna el nombre equivocado (cae en el paso 3).
UPDATE usuario SET nombre_usuario = CASE
    WHEN id = 2   AND email = 'admin@bajonea.com'      THEN 'adminbajonea'
    WHEN id = 184 AND email = 'diego@bajonea.com'      THEN 'diegotorres'
    WHEN id = 247 AND email = 'cliente@bajonea.com'    THEN 'clientedeprueba'
    WHEN id = 185 AND email = 'popular@bajonea.com'    THEN 'pizzeriapopular'
    WHEN id = 186 AND email = 'corner@bajonea.com'     THEN 'cornerdueno'
    WHEN id = 187 AND email = 'lostroncos@bajonea.com' THEN 'lostroncos'
    WHEN id = 188 AND email = 'store54@bajonea.com'    THEN 'store54dueno'
    WHEN id = 189 AND email = 'lasvegas@bajonea.com'   THEN 'lasvegasdueno'
    WHEN id = 190 AND email = 'bigburger@bajonea.com'  THEN 'bigburger'
    WHEN id = 191 AND email = 'tantesara@bajonea.com'  THEN 'tantesara'
    WHEN id = 192 AND email = 'elcuyano@bajonea.com'   THEN 'elcuyano'
    WHEN id = 193 AND email = 'frozono@bajonea.com'    THEN 'frozonodueno'
    WHEN id = 194 AND email = 'donpepone@bajonea.com'  THEN 'donpepone'
    WHEN id = 195 AND email = 'nn@bajonea.com'         THEN 'nnduenoprueba'
    WHEN id = 196 AND email = 'coiron@bajonea.com'     THEN 'coirondueno'
    WHEN id = 197 AND email = 'patiobalto@bajonea.com' THEN 'patiobalto'
    WHEN id = 198 AND email = 'grandehotel@bajonea.com' THEN 'grandehotel'
    ELSE NULL
END;

-- Paso 3: cualquier fila restante recibe un valor válido y único derivado del id
-- ('usuario' + id: 8 a 20 caracteres, solo letras y dígitos, minúsculas).
UPDATE usuario SET nombre_usuario = CONCAT('usuario', id) WHERE nombre_usuario IS NULL;

-- Paso 4: recién ahora NOT NULL, UNIQUE y CHECK. Si quedara algún NULL o duplicado, estas
-- sentencias fallan y abortan la migración.
ALTER TABLE usuario MODIFY COLUMN nombre_usuario VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE usuario ADD CONSTRAINT uq_usuario_nombre_usuario UNIQUE (nombre_usuario);
ALTER TABLE usuario ADD CONSTRAINT ck_usuario_nombre_usuario_minusculas CHECK (nombre_usuario = LOWER(nombre_usuario));

-- Paso 5: el subject del JWT pasó de email a id de usuario; se cierran las sesiones activas
-- para que ningún token emitido antes siga siendo válido.
UPDATE sesion SET activa = 0, tipo_cierre = 'FORZADO', fecha_cierre = NOW() WHERE activa = 1;

# Plan del Tramo 2: nombre único de comercio y disponibilidad en vivo (2026-10-19)

Plan de trabajo, sin código todavía. Sale de `docs/AUDITORIA-FASE1-REGISTRO.md` (secciones 4, 10, 11 y 12; "aud. N" = sección N) y de las decisiones de Diego del 2026-10-19. Formato como el del Tramo 1 (`docs/PLAN-FASE1-REGISTRO-TRAMO1.md`): entrega A (backend, tests y estrés), entrega B (pantallas y tests de UI), checklist y un commit solo cuando Diego confirma. El Tramo 1 ya está commiteado (`V36` aplicada, specs `63` y `64` de registro), así que este tramo agrega la `V37`.

---

## 0. Verificación previa en `bajonea_test` (hecha hoy)

Sobre una copia de `comercio` (`CREATE TABLE ... LIKE`, tabla temporal ya borrada; `comercio` y el esquema real quedaron intactos).

| Pregunta | Resultado |
|---|---|
| Versión del servidor | **10.4.32-MariaDB** (`@@collation_server = utf8mb4_general_ci`; la columna `comercio.nombre` es `utf8mb4_unicode_ci`) |
| 1. `REGEXP_REPLACE` en columna generada `STORED` con `UNIQUE` | **Sí lo acepta.** `ADD COLUMN nombre_unico ... GENERATED ALWAYS AS (CASE WHEN estado='RECHAZO_DEFINITIVO' THEN NULL ELSE TRIM(REGEXP_REPLACE(nombre,'[[:space:]]+',' ')) END) STORED, ADD UNIQUE KEY` se creó sin errores. El `INSERT` de un equivalente falla con `1062 Duplicate entry`. `[[:space:]]` también colapsa tabulaciones y espacios no cortantes (U+00A0) |
| 2. `ñ` = `n` con `utf8mb4_unicode_ci` | **Sí, son iguales** (y `é`=`e`, `Ñ`=`n`). Con `utf8mb4_general_ci` también. Consecuencia de producto: **"Cafetería Ñandú" y "Cafeteria Nandu" son el mismo nombre**. La auditoría suponía que la colación podía distinguirlos; no es así en ninguna de las dos, y está bien para este requisito |
| Extra: la consulta con un literal bajo una conexión `general_ci` | Compara con la colación de la columna (la de columna gana a la del literal), así que la consulta nativa del servicio da el mismo resultado que el índice sin depender de la conexión |
| Extra: estados | `RECHAZO_DEFINITIVO` → la columna queda `NULL` y puede repetirse; `RECHAZADO` **retiene** el nombre (el segundo `INSERT` falla); cambiar el estado recalcula la columna. Volver un comercio de `RECHAZO_DEFINITIVO` a otro estado chocaría si el nombre fue retomado, pero **ningún código de la aplicación saca a un comercio de ese estado** (`ComercioService:393` solo lo lee) |

Quedan sin probar, a propósito, el deadlock con tres inserciones simultáneas de la misma clave (aud. 4.e): lo cubre el estrés nuevo (A8).

---

## 1. Decisiones fijadas que mandan en este tramo

| Tema | Decisión |
|---|---|
| Alcance de la regla | Nombre único global. Cuentan todos los estados menos `RECHAZO_DEFINITIVO`. Un `RECHAZADO` retiene su nombre |
| Comparación | Una sola expresión SQL: `TRIM(REGEXP_REPLACE(nombre,'[[:space:]]+',' '))` contra la columna generada `comercio.nombre_unico` (`utf8mb4_unicode_ci`: ignora mayúsculas y acentos, `ñ`=`n`). El mismo texto lo usan el índice, el chequeo previo y la disponibilidad en vivo; Java no normaliza para comparar |
| Mensaje | "Ya existe un comercio con ese nombre. Elegí otro." (`409`) en registro, alta adicional, corrección y edición del perfil |
| Chequeo por dirección | Se elimina (queda redundante). Desaparece `ValidadorComercioDuplicado` |
| Disponibilidad en vivo | Patrón del nombre de usuario: consulta en `blur`, sin debounce, dos endpoints finos sobre un servicio, respuesta solo `{ "disponible": boolean }` |
| Rate limit | Grupo nuevo en `RateLimitPublicoFilter` para los endpoints públicos de disponibilidad: el de comercio **y** el de nombre de usuario (cierra el pendiente de `CLAUDE.md` §9) |
| Cuenta sin verificar | Retiene el nombre. Limitación aceptada, anotada en `LISTA-DE-DESPLIEGUE.md` |
| Migración | `V37` aparte de la `V36`. El saneamiento de `practicas3` ya está hecho: no hay duplicados |
| Normalizar el nombre al guardar (colapsar espacios) | **Fuera del tramo.** El índice ya los ignora; solo cambiaría cómo se ve un nombre guardado con espacios dobles, algo que ya pasa hoy |

---

## 2. Entrega A: backend, tests y estrés

### A1. Migración `V37` y estado de la base

- `backend/src/main/resources/db/migration/V37__comercio_nombre_unico.sql`: el `ALTER TABLE` ya probado (columna generada `STORED` con `COLLATE utf8mb4_unicode_ci`, `UNIQUE KEY uq_comercio_nombre_unico`). Precedente: `V27`. La entidad `Comercio` no mapea la columna (igual que `mp_user_id_activo`), así que `ddl-auto=validate` no la ve.
- `bajonea_test`: `scripts/reset-db.mjs` corre Flyway al final y aplica la `V37`. En `practicas3` la aplica Flyway cuando Diego arranca su backend; no se ejecuta nada fuera de `bajonea_test`.
- Verificación: tras el reset, `SHOW CREATE TABLE comercio` muestra la columna y el índice, y el `INSERT` de un nombre equivalente falla con `1062`.
- Revisión de escrituras directas: los `INSERT INTO comercio` de `docs/db/*.sql`, de los datos de Railway y de la línea 695 del spec `22` tienen lista de columnas, así que no se rompen; los scripts de `docs/db` no se corren sobre `bajonea_test`.
- Hecho cuando: `mvnw test` arranca limpio y la migración aplica sobre una base reseteada.

### A2. Validación global del nombre (servicio)

- `NombreComercioService` (nuevo, `@Component`): `boolean estaDisponible(String nombre, Integer excluirComercioId)` con consulta nativa `SELECT EXISTS(SELECT 1 FROM comercio WHERE nombre_unico = TRIM(REGEXP_REPLACE(:nombre,'[[:space:]]+',' ')) AND (:excluirId IS NULL OR id <> :excluirId))` en un repositorio nuevo (`ComercioNombreRepository`, para no mezclar JPQL con SQL nativo en `ComercioRepository`); y `validar(nombre, excluirId)` que lanza `ConflictoDeNegocioException("Ya existe un comercio con ese nombre. Elegí otro.")`. Es una lectura sin bloqueos: no cambia el orden global de bloqueos.
- Se invoca desde cuatro lugares, siempre **antes de la primera escritura** y **después** de las validaciones de campos (para que un `400` siga ganando a un `409`):
  1. `RegistroService.registrarComercio`: junto a las otras unicidades, **al final** de ellas (email, nombre de usuario, CUIT, DNI) para que los tests de esos `409` conserven su mensaje aunque repitan el nombre.
  2. `AltaComercioAdicionalService:76`, donde hoy está el validador de dirección.
  3. `ComercioCorreccionService:156` con el id del propio comercio como exclusión.
  4. `ComercioService.editarPerfil`: solo si el nombre normalizado cambió, con el id del comercio activo como exclusión.
- Se borran `ValidadorComercioDuplicado`, `DireccionRepository.findByDuenoIdConComercioYLocalidad` (verificar que no tenga otro uso: hoy solo lo ven el validador y su test) y `MENSAJE_DUPLICADO`.
- Hecho cuando: los cuatro puntos devuelven `409` con el texto nuevo y ninguno deja escrituras a medias (el registro revierte `usuario`, `persona`, etc.).

### A3. Red de seguridad del índice y orden de los flush

- `GlobalExceptionHandler.handleDataIntegrityViolation`: sumar `uq_comercio_nombre_unico` con el mismo `409` y el mismo mensaje, como ya se hizo con `uq_usuario_nombre_usuario`.
- `saveAndFlush` en el alta (`RegistroService.crearComercio`) y en `ComercioService.editarPerfil` / `ComercioEdicionService.actualizarDatosBasicos`, para que la violación salga dentro del método y no en el commit, después de haber escrito historial y notificaciones (`HistorialEdicionComercioService.registrar` vuelca pendientes antes de insertar; el `save` de una entidad gestionada se difiere al commit). Detalle a confirmar al implementar: `Comercio` lleva `@DynamicUpdate`, así que renombrar solo envía `nombre` y la columna generada se recalcula sola.
- Caso de `Deadlock found` (1213) con tres o más inserciones simultáneas de la misma clave (aud. 4.e): **se decide con el estrés (A8), no a priori.** Si aparece, la salida preferida es reintentar la transacción de alta una vez (el chequeo previo ya verá al ganador y responderá `409` limpio); no se agrega ningún `GET_LOCK` ni lock nuevo, porque rompería el orden global de bloqueos.
- Hecho cuando: una carrera real de dos inserciones da un `201` y un `409` con el mensaje, nunca un `500`.

### A4. Endpoints de disponibilidad y rate limit

| Endpoint | Quién | Detalle |
|---|---|---|
| `GET /api/v1/auth/comercio-nombre/disponibilidad?nombre=` | Público (registro, sin sesión) | Ruta exacta en `RUTAS_PUBLICAS` (`SecurityConfig:96`) y en el grupo nuevo de rate limit |
| `GET /api/v1/comercios/nombre/disponibilidad?nombre=&comercioId=` | Dueño (alta adicional, corrección, perfil) | Cae bajo el matcher `hasRole("DUENO")` existente de `/comercios/**`; **no** se agrega a `DelegacionEmpleado` y se clasifica como exclusivo del Dueño en `ClasificacionRutasComercioTest`; ignora `X-Comercio-Id`. `comercioId` opcional, validado con `findByIdAndDuenoId`; si no es suyo, `404` "Comercio no encontrado" idéntico al del resto, para que nadie descubra nombres ajenos por la exclusión |

- Respuesta `DisponibilidadNombreComercioResponseDTO { boolean disponible }`: nada de estado, dueño, id ni motivo; `RECHAZO_DEFINITIVO` responde "disponible".
- Formato: las mismas anotaciones de `DatosNegocioComercioRequestDTO.nombre` (obligatorio, con letra o número, 150 máximo), `400` con mensaje; el controller aplica `@Validated` sobre el parámetro.
- Rate limit: `GRUPO_POR_RUTA` suma los dos endpoints públicos (`/auth/comercio-nombre/disponibilidad` y `/auth/nombre-usuario/disponibilidad`) en un grupo `disponibilidad`, con `app.rate-limit.disponibilidad-por-minuto` (valor por defecto 30 en el `@Value`, sin tocar `application.properties`, que tiene cambios locales de Diego) y `application-test.properties` en 1000. `Map.of` admite hasta 10 pares: pasa de 4 a 6. Decisión simple: un solo grupo compartido por los dos endpoints; el flujo de registro hace unas pocas consultas de cada uno por minuto.
- Hecho cuando: ambos responden lo esperado por rol y el grupo devuelve `429` al pasar el límite.

### A5. Tests Java

- Nuevos: `NombreComercioServiceTest` (excluir id, `RECHAZO_DEFINITIVO`, expresión contra la columna real vía integración), integración de la disponibilidad (los dos endpoints, `comercioId` ajeno, respuesta de un solo campo, Cliente y Administrador rechazados, Empleado sin acceso), `NombreComercioRateLimitIntegrationTest` (patrón de `InvitacionEmpleadoRateLimitIntegrationTest`, con la propiedad en un valor chico; **el `429` se prueba acá y no en Playwright**, que corre con el límite en 1000), `RegistroComercioNombreConcurrenciaIntegrationTest` (dos registros simultáneos con el mismo nombre desde Dueños distintos: un `201`, un `409`, sin `usuario` huérfano), test del handler para `uq_comercio_nombre_unico`.
- Que cambian de significado: `AltaComercioAdicionalServiceTest` (`:135` mensaje; `:160` y `:175`: otra dirección y `RECHAZADO` ya no son "distinto"; los `verify` de `direccionRepository` desaparecen), `ComercioCorreccionServiceTest:242` (la exclusión del propio comercio se mantiene, ahora contra el servicio nuevo), `ComercioEdicionServiceTest` (nuevo caso de carrera de `uq_comercio_nombre_unico`, a replicar del de `uq_persona_juridica_cuit`, `:397`), `ClasificacionRutasComercioTest` (ruta nueva).

### A6. Barrido de nombres repetidos en los datos de prueba (lo mecánico del tramo)

Con el índice, cualquier cuerpo de prueba que registre dos comercios con el mismo nombre en la misma base falla con `409`. Verificación por `grep` de **todo** nombre literal en registros, altas adicionales, clonados y renombres.
- Newman, `build-matriz-comercio-postman.mjs` y `matriz-comercio-runner.mjs:13`: `Comercio Matriz Base` aparece 109 veces, 14 de ellas esperando `201` con Dueños distintos; las 13 posteriores a la primera pasarían a `409`. Sufijo único por request/corrida (`{{...}}` con variable de colección o pre-request), sin tocar los 93 negativos que fallan antes por validación. También `Sucursal Postman Base` (34), `Cafetería Ñandú Postman` (9, ojo: ahora choca contra cualquier "Cafeteria Nandu..."), `Comercio Postman Negativo` (4, carpeta `09`) y `Ex Empleado Postman` (2, carpeta `56`).
- Builders y estreses con nombres literales que solo se repiten en una segunda corrida sin reset (`Local Pedidos A0`, `Local Trazabilidad A3`, `Local Orden A5b`, `Local No Retirado A4b`, `Local Escrituras A2`, `Local Equipo E4`, `Local Carrito E3`, `Local Avisos A4`, `Local Autoconfirmado A6`, `Local Actividad A2b`, `Comercio Matriz Cliente`, `Comercio Matriz Sin Delivery`, `Comercio Unico Editado`, `Multi Postman B Editado`, `Adicional Correccion M`): los estreses se repiten sin reset en la práctica del proyecto, así que se les agrega sufijo por corrida. Alcance acotado a los 44 scripts que registran o clonan comercios.
- Playwright: `09-notificaciones.spec.ts:18`, `21-multicomercio-tramo1.spec.ts:163,302`, `24-...spec.ts:1010,1027` y el `INSERT` directo de `22:695` (sufijo único); `helpers/backend.ts` ya usa sufijo.
- `TestSupportService.clonarComercio`: no cambia (usa JPA), pero 29 archivos lo llaman con `?nombre=`; se revisa que ningún llamador repita nombre.
- Seeds `datos-prueba/scripts`: `datos-fase1.mjs` y `seed-fase1-comercios.mjs` tienen los mismos 7 nombres (son copias); se documenta que no se corren las dos sobre la misma base.
- Hecho cuando: Newman completo y Playwright de API pasan desde base reseteada **y** una segunda corrida de los estreses sin reset tampoco choca.

### A7. Pruebas nuevas de la entrega A

- Playwright API, spec `65-nombre-comercio-unico-api.spec.ts` (los números `63` y `64` están repetidos hoy; el siguiente libre es el `65`): registro con nombre ya tomado (`409`, mensaje, sin usuario huérfano: se vuelve a registrar el mismo email con otro nombre y da `201`); variantes (mayúsculas, tildes, espacios de más, `ñ` contra `n`, tabulación); alta adicional con el mismo nombre en **otra dirección** y en otro Dueño (`409`); corrección con el mismo nombre propio (permitida) y con uno ajeno (`409`); renombrar desde el perfil a un nombre ajeno (`409`), al propio con otra capitalización (`200`) y a uno libre (`200`); `RECHAZADO` retiene (otro Dueño no puede, el Dueño no puede dar de alta otro igual y la salida es corregir); `RECHAZO_DEFINITIVO` libera; el Empleado no puede cambiar el nombre (ya no podía).
- Playwright API, spec `66-nombre-comercio-disponibilidad-api.spec.ts`: libre, ocupado, capitalización, sin tildes, espacios, `ñ` contra `n`, `RECHAZADO` retiene, `RECHAZO_DEFINITIVO` libera, vacío y formato inválido `400`, respuesta con solo `disponible`, sin token en el endpoint del Dueño `401`, Cliente `403` (sin y con `X-Comercio-Id`), Administrador `403`, `comercioId` ajeno `404`, exclusión del propio comercio, endpoint público accesible sin sesión.
- Newman: dos builders nuevos que van **últimos y en este orden**: `build-nombre-comercio-unico-tramo2-postman.mjs` (carpeta `71`) y `build-nombre-comercio-disponibilidad-tramo2-postman.mjs` (carpeta `72`, unos 14 requests: ambos endpoints, libre, ocupado, capitalización, `ñ`, formato, `401`, `403`, `404` de `comercioId` ajeno y exclusión).
- Mutaciones ("las pruebas muerden"): quitar el `UNIQUE` (el estrés da doble ganador), quitar el chequeo previo (sigue dando `409` por el handler pero con otro costo: el test de "sin escrituras a medias" lo detecta si falta el flush), quitar el mapeo de `uq_comercio_nombre_unico` (da `500`), quitar la exclusión por id (la corrección y el perfil dan `409` contra sí mismos) y quitar la validación de `comercioId` (el test de `404` ajeno falla).

### A8. Estrés nuevo `stress-locks-tramoNombreUnico.mjs`

Patrón de `stress-locks-tramo2a.mjs` y registro en `correr-estreses.mjs`. Escenarios, con 8 o más rondas:
1. N registros simultáneos con el mismo nombre desde Dueños distintos (N = 2, 3, 6 y 12): exactamente un `201`, el resto `409` con el mensaje, **cero `5xx`**, y sin `usuario` huérfano (los perdedores se pueden volver a registrar con otro nombre).
2. Mismas pruebas con variantes del nombre (`Ñandú`/`Nandu`, mayúsculas, espacios) mezcladas en la misma tanda.
3. Altas adicionales simultáneas del mismo Dueño (con su lock) y de Dueños distintos.
4. Renombres simultáneos de comercios distintos al mismo nombre desde el perfil, y renombre contra un registro nuevo del mismo nombre.
5. Disponibilidad en paralelo con registros del mismo nombre: nunca `5xx`; una vez confirmado el ganador, responde "no disponible".
6. Sonda de `Deadlock found`: tres o más inserciones de la misma clave; el log no debe mostrar `Deadlock found` ni `Lock wait timeout`. Si aparece, se aplica la salida de A3 y se repite.
Más el runner completo de los estreses una vez: los demás registran comercios y tienen que pasar con nombres únicos.

### A9. Verificación de la entrega A

`mvnw test` (las dos pasadas del proyecto), Newman completo desde base reseteada, Playwright de API, runner de estreses completo, y mutaciones. Entregables: lista de archivos tocados y evidencia por punto. **Punto de corte: informe a Diego antes de la entrega B.**

---

## 3. Entrega B: pantallas y tests de UI

### B1. `bindDisponibilidad` en `js/form-utils.js`

- Generalizar `bindNombreUsuario` en `bindDisponibilidad({ inputId, endpoint, parametro, textos, normalizar, valorOriginal, extraQuery })`, con el mismo contador de secuencia contra respuestas viejas, los mismos cuatro estados (inactivo, verificando, disponible, ocupado) y el mismo ícono; `bindNombreUsuario` queda como una llamada con sus parámetros, sin cambiar su comportamiento ni sus ids (`estado-<id>`, `icono-<id>`, `error-<id>`).
- Para el nombre de comercio: dispara en `blur`, `normalizar` solo recorta y colapsa espacios (no pasa a minúsculas), textos "Verificando…", "Nombre disponible" y "Ya existe un comercio con ese nombre. Elegí otro.", constante compartida `MENSAJE_NOMBRE_COMERCIO_EN_USO`, testids `estado-nombre-comercio` e `icono-estado-nombre-comercio`.
- `valorOriginal` (corrección y perfil): si el nombre normalizado no cambió (ignorando mayúsculas), no consulta. Además el servidor excluye el propio id por `comercioId`.
- `validarParaContinuar()` espera la consulta pendiente y bloquea el avance si está ocupado.

### B2. Las cuatro pantallas

- **Registro** (`registro-comercio.html`, paso 1, `auth.js`), **alta adicional** (`agregar-comercio.html`, `agregar-comercio.js`) y **corrección** (`comercio-corregir.html`, `comercio-corregir.js`): el campo `nombre` suma `icono-nombre` y `estado-nombre` (misma estructura que `perfil.html:74-81`); endpoint público en el registro, el del Dueño en las otras dos (la corrección manda `comercioId`).
- **Perfil** (`comercio-perfil.html`, campo `editar-nombre`, `comercio.js` ~2338-2359): lo mismo, con `comercioId` del comercio activo; el guardado se bloquea si está ocupado.
- **Costo conocido (aud. 11.b):** `initCamposNegocio().validar()` hoy es síncrono (`comercio-form.js:332`); pasa a asíncrono y hay que actualizar a sus llamadores (`auth.js:283`, `agregar-comercio.js:161`, `comercio-corregir.js:247`) y el guardado del perfil. Es lo que más riesgo de regresión tiene del frontend.
- Los `409` del envío (carrera) se mapean al campo y se vuelve al paso 1 (registro, alta adicional y corrección) o se muestra bajo el campo (perfil); `PREFIJO_MENSAJE_DUPLICADO` de `comercio-corregir.js:25` pasa al texto nuevo, y el banner del alta adicional se reemplaza por el mismo mapeo.

### B3. Pruebas de UI

- Specs existentes a actualizar: `22` (los de API que cambian de significado: `:384`, `:391`, `:405` ahora `409`, `:438`, `:449` se invierte, `:466` se invierte), `23-...-ui` (`:35`, `:277`, `:454`, texto del mensaje), `24-...` (`:39-40`, `:796-827`, regla de estados), `01`, `13`, `19`, `25` (el `blur` de nombre dispara ahora una consulta; con nombres únicos el resultado no cambia, pero el avance puede esperarla), `14-perfil-comercio` y los de `53` que editan el nombre.
- Spec nuevo `67-nombre-comercio-disponibilidad-ui.spec.ts`: "Verificando…" (con `page.route` para forzar la lentitud), disponible, ocupado, ícono de 4 estados, bloqueo de avance en registro, alta adicional, corrección y perfil, valor original sin consulta (corrección y perfil), carrera (`page.route` responde "disponible" y el envío da `409`: vuelve al campo con el mensaje), sin scroll horizontal a 375 px.
- Actualizar `docs/DATA-TESTID-FASE17.md` con `estado-nombre-comercio` e `icono-estado-nombre-comercio`.

### B4. Cierre del tramo

- Documentación: `CLAUDE.md` (§1bis, §5bis, §6, §9: se cierra el pendiente del rate limit de nombre de usuario), `docs/DECISIONES.md` (una entrada por decisión), `docs/diccionario-de-datos.md` (columna generada `nombre_unico`), `docs/APRENDIZAJES-TECNICOS.md` (`REGEXP_REPLACE` en columna generada `STORED`, `ñ`=`n`, hallazgos del estrés), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (nuevo punto de serialización por índice único; sin cambios al orden global), `docs/LISTA-DE-DESPLIEGUE.md` (cuentas sin verificar que retienen el nombre; el límite por IP depende de `server.forward-headers-strategy`), requisitos funcionales y historias de usuario del comercio y del Dueño (en `docs/entregables-01-02/`), `docs/entregables-01-02/CAMBIOS.md` y `docs/MAPEO-ARCHIVOS-TRAMO-REGISTRO-2.md`.
- Regresión completa: `mvnw test`, Newman, Playwright completo (inestables conocidos `01:101` y `27:497`), todos los estreses.
- Checklist para Diego con evidencia por punto. **Sin commit hasta su confirmación.**

---

## 4. Orden de trabajo y dependencias

1. A1 (`V37`) → A2 (validación) → A3 (handler y flush) → A4 (endpoints y rate limit): el servidor queda completo.
2. A5 (tests Java) en paralelo con cada paso; A6 (barrido de nombres) **inmediatamente después de A3**, porque es lo que vuelve a poner en verde Newman, Playwright y estreses; no se avanza con la suite rota.
3. A7 (pruebas nuevas), A8 (estrés) y A9 (verificación). **Corte: entrega A completa, informe a Diego.**
4. B1 (`bindDisponibilidad`, sin cambiar a los usuarios existentes) → B2 (registro, alta adicional, corrección, perfil: de a una pantalla) → B3 → B4.

## 5. Riesgos y puntos de atención

| Riesgo | Cómo se maneja |
|---|---|
| `Deadlock found` (1213) con 3 o más inserciones simultáneas de la misma clave | Estrés con N hasta 12; si aparece, reintento único de la transacción de alta. No se agrega `GET_LOCK` ni ningún lock nuevo |
| `ñ`=`n`, `é`=`e`: "Nandu" bloquea a "Ñandú" (y al revés), incluso entre Dueños sin relación | Es consistente con el requisito y lo ve el aviso en vivo; se documenta como regla de producto en el texto de requisitos |
| `Cafetería Ñandú Postman` y otros nombres de prueba que hoy no chocan, ahora sí | Barrido por `grep` de todo nombre literal (A6) y sufijo por corrida |
| `validar()` pasa a asíncrono y rompe un llamador | Cuatro llamadores identificados; los specs `01`, `13`, `19`, `23`, `25` y `14` lo ejercitan; revisar la consola del navegador |
| Un `400` y un `409` compiten por el mismo cuerpo | El chequeo de nombre va después de la validación de campos y, en el registro, después de las otras unicidades; hay tests de orden |
| Rate limit por IP detrás de un proxy (todos comparten contador) | Ya está en la lista de despliegue (`server.forward-headers-strategy`); se refuerza la nota |
| Consulta de disponibilidad revela nombres de comercios no aprobados (pendientes, rechazados, suspendidos) | Aceptado por Diego: respuesta de un solo booleano y rate limit |
| Cuenta sin verificar que retiene el nombre | Limitación aceptada y documentada; no hay job que libere nombres |
| `V37` falla en una base con duplicados | `bajonea_test` se resetea, `practicas3` ya está saneada; cualquier otra base se revisa con la consulta de aud. 4.c antes de arrancar el backend |
| Cambios locales de Diego en `application.properties` y `Bajonea-Local.postman_environment.json` | No se tocan: la propiedad nueva lleva su valor por defecto en el código |

## 6. Tests existentes que cambian de significado (resumen)

| Test | Antes | Ahora |
|---|---|---|
| `22:405` | Mismo nombre en otra dirección es distinto | `409` |
| `22:449` | Un `RECHAZADO` no cuenta como duplicado | Un `RECHAZADO` retiene el nombre (`409`) |
| `22:466` | Dos Dueños pueden tener el mismo nombre | `409` |
| `24:796-827` | `RECHAZO_DEFINITIVO` cuenta, `RECHAZADO` no | `RECHAZO_DEFINITIVO` libera, `RECHAZADO` retiene |
| `22:384`, `:391`, `:438`, `23:35,277,454`, `24:39-40`, `AltaComercioAdicionalServiceTest:135` | Texto "Ya tenés un comercio con ese nombre en esa dirección..." | "Ya existe un comercio con ese nombre. Elegí otro." |
| Newman carpeta `50` (`[duplicado]`) | "otro número: 201", "otro piso: 201", "tras el rechazo se puede dar de alta el mismo: 201" | `409` (los dos primeros) y `409` el tercero; el "tercer intento" sigue en `409` con otro texto |
| Newman carpeta `51` | `RECHAZO_DEFINITIVO` cuenta como duplicado | Libera el nombre |
| `AltaComercioAdicionalServiceTest:160,175` | Otra dirección, `RECHAZADO` no cuentan | Ya cuentan |
| Newman matriz de comercio (14 altas con `Comercio Matriz Base`) | `201` repetido | Nombre único por corrida |

## 7. Qué necesito de Diego para arrancar

Nada bloqueante. Una sola cosa para que decidas: el resultado `ñ`=`n` implica que "Nandu" y "Ñandú" son el mismo nombre. Si preferís que se distingan habría que usar una colación `utf8mb4_bin` con normalización explícita en el SQL; no lo recomiendo porque el mismo comercio con y sin tilde ya no sería un duplicado, que es justo lo que se quiere evitar.

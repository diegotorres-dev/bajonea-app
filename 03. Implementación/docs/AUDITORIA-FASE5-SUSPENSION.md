# Auditoría de la Fase 5: Suspensión, Soporte y Reclamos

Fecha: 2026-10-27. Auditoría de solo lectura sobre `main` (último commit `4dc1c20`). No se tocó código, migraciones, tests, configuración ni datos, y no se consultó ninguna base. Todo lo que figura como "propuesta" es solo texto: Diego valida cada tabla y cada campo antes de que exista una migración.

**Cómo leer las citas.** `archivo:línea` son líneas leídas en esta auditoría. Lo que no pude verificar lo marco como "no verificado". No corrí tests ni levanté el backend: el estado real del código sale de lectura, no de ejecución.

**Límites de esta auditoría.** No leí cada aserción de los ~126 tests Java ni de los 86 specs de Playwright: el impacto en tests (punto 15) sale de búsquedas por texto y por nombre de método, y es una estimación de qué toca, no una lista de fallos confirmados. Tampoco verifiqué el mapeo numérico T1..T37 contra el documento de requisitos: usé los nombres de `TipoNotificacion` (`enums/TipoNotificacion.java`) y los números que da el prompt.

---

## Resumen ejecutivo

1. Casi nada de la Fase 5 existe en código: hoy solo se puede **suspender** un comercio (nunca levantar). No hay forma de suspender ni levantar a un Cliente, Dueño o Empleado: `EstadoUsuario.SUSPENDIDO` y tres tipos de notificación (`CLIENTE_SUSPENDIDO`, `SUSPENSION_LEVANTADA`, `NUEVO_MENSAJE_SOPORTE`) existen sin ningún emisor.
2. Las tablas `reclamo`, `soporte` e `historial_estado_usuario` existen en el baseline `V1` pero **no tienen entidad, repositorio, servicio ni pantalla**. `soporte` y `reclamo` hay que rediseñarlas (no alcanzan para lo decidido).
3. Hay **un defecto que bloquea la fase**: recuperar contraseña y verificar email ponen la cuenta en `ACTIVO` sin mirar el estado anterior (`AuthService.java:133, 151, 211`). Un Cliente suspendido podría levantarse la suspensión solo, pidiendo un código de recuperación.
4. El login hoy revela el estado de la cuenta **antes** de comprobar la contraseña (`AuthService.java:101` antes de `:103`). La decisión 4 pide lo contrario para la suspensión.
5. La opción C (cada pedido en su transacción) se simplifica mucho si el tope de 90 minutos se calcula desde una fecha de suspensión guardada en el comercio, en vez de grabar un vencimiento en cada pedido. Con eso, suspender un comercio deja de tocar pedidos y desaparece la cascada que hoy corre en la transacción del Administrador.
6. El frontend del Dueño trata a un comercio `SUSPENDIDO` como "no operativo" (`comercio-activo.js:72`): hoy no puede entrar al panel. La decisión 9 (ver pedidos, estadísticas y documentos con el comercio suspendido) obliga a rehacer esa parte del frontend; es la parte más cara de S2.
7. La carrera más peligrosa es el pago en vuelo: el webhook toma el pedido antes de leer el estado del comercio (`MercadoPagoPagoService.java:278`). Si se agrega el chequeo sin reordenar, invierte el orden de locks y puede interbloquearse con la desvinculación de Mercado Pago.
8. Hay un hueco de plata que ya existe y que la decisión 5 hace visible: un pago aprobado que llega sobre un pedido ya cancelado solo deja una alerta, **no se reembolsa** (`MercadoPagoPagoService.java:293-297`).
9. Propuesta: 5 tramos (S1 cuentas y Cliente, S2 comercio, S3 Dueño y Empleado, S4 Soporte, S5 Reclamos). Lo más desproporcionado para su valor: las fotos de reclamos y el límite por IP de Soporte. Detalle y preguntas abiertas al final.

---

## 1. Modelo de usuario y cuentas

### 1.1 Estados y bloqueo

| Qué | Dónde | Estado real |
|---|---|---|
| `EstadoUsuario` = `PENDIENTE, ACTIVO, BLOQUEADO, SUSPENDIDO, INACTIVO` | `enums/EstadoUsuario.java` | `SUSPENDIDO` nunca se asigna en ningún lado (`grep EstadoUsuario.SUSPENDIDO` = 0 usos de escritura) |
| Columna única `usuario.estado` | `entities/Usuario.java:55` | Una sola columna: **no puede representar "bloqueado y suspendido a la vez"** |
| Intentos fallidos | `Usuario.intentosFallidos`, `AuthService.java:361-373` | A los 3 pasa a `BLOQUEADO`, cierra la sesión y propaga a los comercios |
| Mensaje de login por estado | `MensajesEstadoCuenta.java:25` | `SUSPENDIDO` -> `"Cuenta suspendida"`, sin motivo |
| Historial de estados de usuario | tabla `historial_estado_usuario` (`V1`, líneas 235-246) | Existe con `usuario_id`, `estado_origen`, `estado_destino`, `motivo`, `fecha_hora`. **Sin entidad, sin repositorio, sin escritor, sin `administrador_id`** |
| Historial de cambios de nombre de usuario | `HistorialCambioNombreUsuario` | Otro asunto, no sirve |

Consecuencia de la decisión 1 ("con las dos a la vez manda la suspensión"): como hay una sola columna, "a la vez" significa que al suspender se **pisa** el `BLOQUEADO`. Al levantar la suspensión hay que decidir a qué estado vuelve (pregunta abierta 5).

### 1.2 Sesión y JWT

- `Sesion` (`entities/Sesion.java`): `usuario_id`, `activa`, `tipo_cierre` (`TipoCierreSesion` = `MANUAL`, `AUTOMATICO`, `FORZADO`), IP, navegador. **Sesión única por usuario**: el login cierra la activa antes de crear otra (`AuthService.java:113`, `cerrarSesionActivaSiExiste` en `:414-421`, que usa `SesionRepository.findByUsuarioIdAndActivaTrue`, un `Optional`). No hay restricción única en la base que garantice una sola activa (hallazgo H6).
- `JwtAuthenticationFilter.java` (líneas 37-87): valida firma, comprueba `sesion.activa` y arma el `Authentication` con el rol. **No mira `usuario.estado`**. Una sesión cerrada responde `401` por `CustomAuthenticationEntryPoint` con mensaje genérico. Por lo tanto, **el único mecanismo que corta a un usuario suspendido es cerrar su sesión**; no hay chequeo de estado en cada request.
- Claims del JWT: `sub` = id de usuario, `userId`, `rol`, `sesionId` (`JwtService`).
- Para la decisión 4 ("con la sesión abierta, en su próxima acción ve una pantalla con el motivo"): hoy el `401` es indistinguible de cualquier sesión cerrada (otro login, cambio de contraseña, bloqueo). Hace falta que el cierre por suspensión deje una marca (propuesta: valor nuevo `SUSPENSION` en `TipoCierreSesion` y en el ENUM físico de `sesion.tipo_cierre`) y que el filtro, al encontrar una sesión cerrada con esa marca, responda `401` con `data.codigo = CUENTA_SUSPENDIDA` y el motivo. La firma del token ya está validada en ese punto, así que el motivo no se filtra a un tercero.

### 1.3 Flujo completo del login (`AuthService.login`, líneas 95-126)

1. `findByNombreUsuarioConBloqueo` (`FOR UPDATE`): si no existe, `CredencialesInvalidasException("Usuario o contraseña incorrectos")`.
2. `validarEstadoParaLogin` (`:354-359`): **antes** de mirar la contraseña. Lanza `409` con el texto del estado: `PENDIENTE`, `BLOQUEADO`, `INACTIVO` y `SUSPENDIDO` se revelan a cualquiera que conozca el nombre de usuario.
3. `passwordEncoder.matches`: si falla, `registrarIntentoFallido` (solo llega acá con la cuenta `ACTIVO`) y `401` con `intentosRestantes`.
4. Éxito: resetea intentos, cierra la sesión anterior, crea la nueva.

Dónde se puede mostrar la suspensión sin revelar que el email existe (decisión 4): **solo entre los pasos 3 y 4**, es decir, después de verificar la contraseña. Eso exige mover el chequeo del estado `SUSPENDIDO` después de `matches` y que la contraseña incorrecta de una cuenta suspendida no sume intentos. Hoy la segunda parte ya se cumple por accidente (el `409` se lanza antes). Qué hacer con `BLOQUEADO`, `INACTIVO` y `PENDIENTE` es la pregunta abierta 4: moverlos también esconde su estado, pero un usuario bloqueado que olvidó su contraseña vería para siempre "Usuario o contraseña incorrectos" y no el camino de recuperación.

El frontend arma el banner por texto exacto en `frontend/js/auth.js:50-53` (`'Cuenta suspendida'` -> "Tu cuenta fue suspendida. Contactá a soporte para más información.", sin enlace y sin motivo). Cambiarlo a un código estable (`data.codigo`) es parte de S1.

### 1.4 Recuperación, verificación y reactivación: no deben levantar una suspensión

| Flujo | Línea | Problema |
|---|---|---|
| `solicitarRecuperacionPassword` | `AuthService.java:177-183` | Genera token y manda email para **cualquier** estado, suspendido incluido (correcto: no revela estado) |
| `confirmarRecuperacionPassword` | `:203-217`, `:211` | `usuario.setEstado(ACTIVO)` incondicional: **levanta una suspensión** y además restaura comercios (`:216`) |
| `verificarEmail` / `verificarEmailConCodigo` | `:128-135`, `:145-153` (`:133`, `:151`) | `setEstado(ACTIVO)` incondicional sobre el usuario del token. Un suspendido con un token de verificación viejo sin usar quedaría activo |
| `confirmarReactivacionCuenta` | `:330-342` | Correcto: solo muta si el estado era `INACTIVO` |
| `cambiarPasswordDesdePerfil`, `cambiarNombreUsuario` | `:219`, `:251` | Requieren sesión; un suspendido no tiene |

Arreglo mínimo (S1): en `confirmarRecuperacionPassword` cambiar la contraseña siempre, pero poner `ACTIVO` solo si el estado era `BLOQUEADO`; y en los dos `verificarEmail*` solo si era `PENDIENTE`. Además `confirmarRecuperacionPassword` llama a `restaurarComercioSiCorresponde` (`:216`): con la cuenta suspendida no debe restaurar nada.

### 1.5 Cómo se resuelve "este usuario es Cliente, Dueño, Empleado o Administrador"

- `usuario.rol` (`RolUsuario` = `CLIENTE, DUENO, ADMINISTRADOR`) es **una sola columna** y es lo que viaja en el JWT. **El Empleado no es un rol**: es un `CLIENTE` con una fila en `empleado` y relaciones `empleado_comercio` `ACTIVO`; el contexto lo da el header `X-Comercio-Id` (`ComercioActivoService.java:39-82`).
- `MatrizRolesService` (`services/MatrizRolesService.java`): capacidades por existencia de fila en `administrador`, `dueno`, `cliente`, `empleado`. Regla (`Capacidades.esCombinacionValida`): a lo sumo **una** de Administrador, Dueño o Empleado; Cliente se combina con cualquiera.
- Consecuencia que contradice un ejemplo del prompt: **un Dueño no puede ser Empleado de otro comercio** (`puedeSerEmpleado = !administrador && !dueno`). No existe el caso "Dueño de un comercio y Empleado de otro". Sí existe "Cliente que además es Empleado": suspender esa cuenta suspende las dos identidades a la vez.
- No hay mecanismo que cree "Dueño + Cliente" (la matriz lo permite en teoría; no hay código que lo construya). Para la auditoría asumo que suspender un Dueño suspende solo su identidad de Dueño.
- El Administrador no se puede suspender a sí mismo ni a otro: hay que validar que el usuario destino no tenga fila en `administrador` (hoy no existe ninguna ruta, así que no hay guard).

---

## 2. Modelo de datos que falta (solo propuesta)

Convención: el `ALTER`/`CREATE` va en una migración `V44` en adelante, un archivo por tramo. Ningún DDL de abajo lleva comentarios. Los nombres de columnas siguen el estilo del proyecto (`snake_case`, `datetime` en `-03:00` escrito por el servidor con el `Clock`).

**Reutilizar antes que crear.** Existen `historial_estado_usuario` (servirá, con una columna más), `reclamo` (servirá, con columnas más), `historial_estado_comercio` (sirve tal cual; ya admite `SUSPENDIDO`) y `soporte` (**no sirve**: `usuario_id NOT NULL`, un solo mensaje, resolución `REACTIVADO`/`SUSPENSION_MANTENIDA`, sin código de seguimiento; está vacía y sin entidad). Detalle por tramo.

### 2.1 S1 — Suspensión de usuarios (V44)

```sql
ALTER TABLE `usuario`
  ADD COLUMN `motivo_suspension` varchar(500) NULL AFTER `intentos_fallidos`,
  ADD COLUMN `suspendido_desde` datetime NULL AFTER `motivo_suspension`,
  ADD CONSTRAINT `ck_usuario_suspension`
    CHECK ((`estado` = 'SUSPENDIDO') = (`motivo_suspension` IS NOT NULL AND `suspendido_desde` IS NOT NULL));

ALTER TABLE `historial_estado_usuario`
  ADD COLUMN `administrador_id` int(11) NULL AFTER `usuario_id`,
  ADD KEY `idx_heu_administrador` (`administrador_id`),
  ADD CONSTRAINT `fk_heu_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `administrador` (`id`);

ALTER TABLE `sesion`
  MODIFY COLUMN `tipo_cierre` enum('MANUAL','AUTOMATICO','FORZADO','SUSPENSION') NULL;

ALTER TABLE `nota_credito`
  MODIFY COLUMN `motivo` enum('RECHAZO_COMERCIO','CANCELACION_CLIENTE','ANULACION_COMERCIO','SUSPENSION_COMERCIO','EXPIRACION_SIN_RESPUESTA','SUSPENSION_CLIENTE','RECLAMO') NULL;

ALTER TABLE `historial_estado_pedido`
  MODIFY COLUMN `motivo_timeout` enum('TIMEOUT_PAGO','TIMEOUT_ENTREGA','TIMEOUT_RESPUESTA_COMERCIO','TIMEOUT_RETIRO_SUSPENSION','TIMEOUT_PREPARACION_SUSPENSION','SUSPENSION_CLIENTE') NULL;
```

Por qué:
- `motivo_suspension` y `suspendido_desde` en `usuario`: el login tiene que mostrar el motivo sin un join y sin leer el historial; el `CHECK` obliga a que el motivo exista si y solo si el estado es `SUSPENDIDO`. (Verificar en MariaDB 10.4 que la igualdad de booleanos en un `CHECK` se acepta; si no, partirlo en dos `CHECK`.) El historial conserva todo el rastro; estas dos columnas son la foto vigente.
- `historial_estado_usuario.administrador_id`: "quién" suspendió o levantó (`NULL` si fue el sistema). El motivo del levantamiento va en la columna `motivo` de **la fila de levantamiento** (cada transición es una fila con origen y destino), así que no hace falta una columna aparte.
- `sesion.tipo_cierre = SUSPENSION`: lo necesita el filtro (punto 1.2).
- `nota_credito.motivo` y `historial_estado_pedido.motivo_timeout`: ENUM físicos que hay que mantener sincronizados con los enums Java. `EnumsContraBaseDeDatosIntegrationTest` falla si no coinciden. El valor nuevo va **al final** para que sea un cambio de metadatos, como `V34` y `V35`.
- No confirmé los nombres exactos de las columnas ENUM de `historial_estado_pedido` ni su orden actual (los creó `V5`/`V7`): revisar antes de escribir la migración.
- `MotivoTimeoutPedido` (Java, `enums/MotivoTimeoutPedido.java`): sumar `TIMEOUT_PREPARACION_SUSPENSION` (tope de 90 minutos de `EN_PREPARACION`) y `SUSPENSION_CLIENTE`.

Tipos de notificación nuevos (ENUM `notificacion.tipo`, mismo `ALTER ... MODIFY` que `V35`, agregando al final):
`COMERCIO_SUSPENDIDO_EQUIPO`, `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` (ambos audiencia `EQUIPO`, sin motivo), `RECLAMO_REEMBOLSO_DUENO` (audiencia `DUENO`). Los demás ya existen: `COMERCIO_SUSPENDIDO` (T16, `DUENO`), `CLIENTE_SUSPENDIDO` (T28, `CLIENTE`), `SUSPENSION_LEVANTADA` (T29, `CLIENTE_O_DUENO`), `NUEVO_RECLAMO` (T19), `RECLAMO_APROBADO` (T20), `RECLAMO_RECHAZADO` (T21), `NUEVO_MENSAJE_SOPORTE` (T22, `ADMINISTRADOR`). Cada tipo nuevo exige actualizar `AudienciaNotificacionTest`. (Opcional, no incluido: sumar `RECLAMO` a `notificacion.entidad_tipo`, hoy `PEDIDO`/`COMERCIO`; el aviso del Cliente puede apuntar a su `PEDIDO`.)

### 2.2 S2 — Origen de la suspensión del comercio (V45)

```sql
ALTER TABLE `comercio`
  ADD COLUMN `suspension_origen` enum('INDIVIDUAL','DUENO') NULL,
  ADD COLUMN `suspendido_desde` datetime NULL,
  ADD COLUMN `motivo_suspension` varchar(500) NULL,
  ADD KEY `idx_comercio_suspension` (`dueno_id`, `estado`, `suspension_origen`),
  ADD CONSTRAINT `ck_comercio_suspension`
    CHECK ((`estado` = 'SUSPENDIDO') = (`suspension_origen` IS NOT NULL AND `suspendido_desde` IS NOT NULL AND `motivo_suspension` IS NOT NULL));

ALTER TABLE `historial_estado_comercio`
  ADD COLUMN `suspension_origen` enum('INDIVIDUAL','DUENO') NULL;
```

Por qué:
- `suspension_origen` responde la decisión 7 con una consulta directa: al levantar al Dueño se toma `WHERE dueno_id = ? AND estado = 'SUSPENDIDO' AND suspension_origen = 'DUENO'`. Si el Administrador suspende individualmente un comercio ya suspendido por el Dueño, el servidor pasa `suspension_origen` a `INDIVIDUAL` (decisión 7) y deja una fila de historial `SUSPENDIDO -> SUSPENDIDO` con el motivo nuevo.
- `suspendido_desde` en el comercio es lo que permite **no grabar nada por pedido**: el tope de 90 minutos de `EN_PREPARACION` y el cierre de `LISTO_PARA_RETIRAR` se calculan contra esta fecha (ver punto 5). Hoy el vencimiento de retiros vive en `pedido.suspension_retiro_expira` (`entities/Pedido.java:93-94`); propongo dejar de escribirlo (la columna queda sin uso) y que `autoconfirmarRetirosPorSuspension` use `comercio.suspendido_desde + 90 min`.
- `motivo_suspension` denormalizado: el listado `mis-comercios` del Dueño y el panel lo necesitan en una consulta agrupada; el historial sigue siendo la fuente de verdad. El `MiComercioEmpleadoResponseDTO` y el `ComercioEmpleadoResponseDTO` **no** deben llevarlo (decisión 10): test de contrato.
- `historial_estado_comercio.suspension_origen` es opcional; sirve para auditar sin reconstruir. `administrador_id` ya existe y puede ser `NULL` (suspensión de comercio generada por la suspensión del Dueño lleva el id del Administrador que suspendió al Dueño).
- Los ENUM `estado_origen`/`estado_destino` de `historial_estado_comercio` ya admiten `SUSPENDIDO` (`V1`, `V12`, `V24`; no leí `V12` y `V24` completas para confirmar `APTO_VENTA` y `RECHAZO_DEFINITIVO` en ambos ENUM, pero el código ya escribe esas transiciones).
- Las dos migraciones no pisan datos: no hay comercios en `SUSPENDIDO` con el `CHECK` nuevo salvo los que existan por pruebas. **Verificar en `bajonea_practicas3`** si hay filas `SUSPENDIDO` antes de agregar el `CHECK` (un `UPDATE` previo las completaría). No lo consulté.

### 2.3 S4 — Soporte (V46)

Reemplaza a `soporte` (vacía, sin entidad). Propongo crear dos tablas nuevas y dejar `soporte` sin tocar en esa migración (se elimina en una posterior, después de que Diego confirme; pregunta abierta 16).

```sql
CREATE TABLE `ticket_soporte` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo_seguimiento` char(9) NOT NULL,
  `email` varchar(254) NOT NULL,
  `usuario_id` int(11) NULL,
  `tipo` enum('APELAR_CUENTA','APELAR_COMERCIO','NO_PUEDO_ENTRAR','COMERCIO_RECHAZADO_DOCUMENTOS_COBROS','OTRO') NOT NULL,
  `nombre_comercio` varchar(100) NULL,
  `estado` enum('ABIERTO','RESPONDIDO','CERRADO') NOT NULL DEFAULT 'ABIERTO',
  `cantidad_mensajes` smallint(6) NOT NULL DEFAULT 0,
  `ip_origen` varchar(45) NOT NULL,
  `fecha_creacion` datetime NOT NULL,
  `fecha_ultimo_mensaje` datetime NOT NULL,
  `fecha_cierre` datetime NULL,
  `administrador_cierre_id` int(11) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ticket_codigo` (`codigo_seguimiento`),
  KEY `idx_ticket_email` (`email`, `estado`),
  KEY `idx_ticket_bandeja` (`estado`, `fecha_ultimo_mensaje`),
  KEY `idx_ticket_usuario` (`usuario_id`),
  KEY `idx_ticket_administrador` (`administrador_cierre_id`),
  CONSTRAINT `fk_ticket_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `fk_ticket_administrador` FOREIGN KEY (`administrador_cierre_id`) REFERENCES `administrador` (`id`),
  CONSTRAINT `ck_ticket_comercio` CHECK (`tipo` NOT IN ('APELAR_COMERCIO','COMERCIO_RECHAZADO_DOCUMENTOS_COBROS') OR `nombre_comercio` IS NOT NULL),
  CONSTRAINT `ck_ticket_mensajes` CHECK (`cantidad_mensajes` <= 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ticket_soporte_mensaje` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticket_id` int(11) NOT NULL,
  `numero` smallint(6) NOT NULL,
  `autor` enum('USUARIO','ADMINISTRADOR') NOT NULL,
  `administrador_id` int(11) NULL,
  `texto` varchar(1000) NOT NULL,
  `fecha_creacion` datetime NOT NULL,
  `email_estado` enum('NO_APLICA','PENDIENTE','ENVIADO','FALLIDO') NOT NULL DEFAULT 'NO_APLICA',
  `email_intentos` tinyint(4) NOT NULL DEFAULT 0,
  `email_proximo_intento` datetime NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ticket_mensaje_numero` (`ticket_id`, `numero`),
  KEY `idx_ticket_mensaje_administrador` (`administrador_id`),
  KEY `idx_ticket_mensaje_email` (`email_estado`, `email_proximo_intento`),
  CONSTRAINT `fk_ticket_mensaje_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `ticket_soporte` (`id`),
  CONSTRAINT `fk_ticket_mensaje_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `administrador` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `soporte_limite` (
  `clave` varchar(260) NOT NULL,
  `dia` date NOT NULL,
  `creados_dia` smallint(6) NOT NULL DEFAULT 0,
  `abiertos` smallint(6) NOT NULL DEFAULT 0,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Por qué:
- `codigo_seguimiento` `char(9)` = `K7M2-9QXP` (8 caracteres más guion). Alfabeto de 31 o 32 símbolos sin ambiguos (sin `0 O 1 I L`) da ~10^12 combinaciones; con el email también exigido y un tope de intentos por IP y por email en la consulta, no es enumerable. La generación sigue el patrón de reintento ante colisión de `TokenInsercionRepository` / `InvitacionInsercionRepository`.
- Estados: `ABIERTO` = escribió el usuario (espera al equipo), `RESPONDIDO` = escribió el Administrador (el usuario puede escribir), `CERRADO`. Con eso la regla de turnos sale del estado, sin columna de turno. "3 abiertos a la vez" = estado distinto de `CERRADO`.
- `cantidad_mensajes` con `CHECK <= 20` y `UNIQUE (ticket_id, numero)` son la red de seguridad del tope; la regla real corre con el ticket tomado `FOR UPDATE`.
- `ticket_soporte_mensaje.email_estado`: la respuesta del Administrador **sale por email y es el único canal si el usuario no tiene sesión**. Si el email falla no puede perderse en silencio: propongo la misma mecánica de reintentos que `cierre_turno` (`PENDIENTE`/`ENVIADO`/`FALLIDO`, retroceso) en lugar de `Notificacion` canal `EMAIL`, que exige `usuario_id NOT NULL` y no sirve para quien no tiene cuenta.
- `soporte_limite` resuelve la carrera del límite sin tener una fila de usuario que bloquear (el email puede no existir en el sistema): dos claves, `e:<email normalizado>` y `i:<ip>`, que se toman `FOR UPDATE` siempre en el mismo orden (primero email, después IP) y llevan `creados_dia` (tope 3) y `abiertos` (tope 3). Se crean con `INSERT ... ON DUPLICATE KEY UPDATE` como primera sentencia, igual que `CarritoInsercionRepository`. Alternativa más simple si se recorta: sin tabla, contando tickets en una consulta; admite una carrera de unos pocos tickets de más (pregunta 17).
- La relación opcional con `comercio` queda fuera: `nombre_comercio` es texto libre del formulario; el Administrador lo cruza a mano. Sumar `comercio_id` solo si el usuario coincide con un Dueño sería un enriquecimiento posterior.

### 2.4 S5 — Reclamos (V47)

```sql
ALTER TABLE `reclamo`
  MODIFY COLUMN `descripcion` varchar(1000) NOT NULL,
  ADD COLUMN `motivo` enum('NO_LLEGO','INCOMPLETO_O_EQUIVOCADO','MAL_ESTADO','COBRO_INCORRECTO','NO_RETIRADO_PERO_FUI','OTRO') NOT NULL AFTER `pedido_id`,
  ADD COLUMN `monto_reembolsado` decimal(10,2) NULL AFTER `nota_resolucion`,
  ADD COLUMN `nota_credito_id` int(11) NULL AFTER `monto_reembolsado`,
  ADD KEY `idx_reclamo_nota_credito` (`nota_credito_id`),
  ADD CONSTRAINT `fk_reclamo_nota_credito` FOREIGN KEY (`nota_credito_id`) REFERENCES `nota_credito` (`id`),
  ADD CONSTRAINT `ck_reclamo_resolucion`
    CHECK (`estado` = 'PENDIENTE' OR (`administrador_id` IS NOT NULL AND `fecha_resolucion` IS NOT NULL));

CREATE TABLE `reclamo_foto` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reclamo_id` int(11) NOT NULL,
  `orden` tinyint(4) NOT NULL,
  `nombre_original` varchar(255) NOT NULL,
  `tipo_mime` varchar(100) NOT NULL,
  `tamano_bytes` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reclamo_foto_orden` (`reclamo_id`, `orden`),
  CONSTRAINT `fk_reclamo_foto_reclamo` FOREIGN KEY (`reclamo_id`) REFERENCES `reclamo` (`id`),
  CONSTRAINT `ck_reclamo_foto_orden` CHECK (`orden` BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reclamo_foto_archivo` (
  `foto_id` int(11) NOT NULL,
  `contenido` longblob NOT NULL,
  PRIMARY KEY (`foto_id`),
  CONSTRAINT `fk_reclamo_foto_archivo_foto` FOREIGN KEY (`foto_id`) REFERENCES `reclamo_foto` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Por qué:
- `reclamo` ya tiene `pedido_id` **único** (`uq_reclamo_pedido`): "un reclamo por pedido" y "no se reabre" ya están garantizados por la base. `estado` (`PENDIENTE`, `APROBADO`, `RECHAZADO`), `administrador_id`, `nota_resolucion varchar(500)` y `fecha_resolucion` alcanzan. No hace falta columna de "quién reclama": sale del pedido.
- `descripcion` pasa de `text` a `varchar(1000)` (la validación de 10 a 1000 vive en el DTO). La tabla está vacía; no hay riesgo de datos.
- `motivo` (los seis de la decisión): `NOT NULL` sin valor por defecto; con la tabla vacía no necesita backfill.
- `monto_reembolsado` y `nota_credito_id`: un reclamo aprobado que genera nota. El estado del reembolso para el mensaje "aprobado, reembolso en proceso" sale de `nota_credito.estado`, no se duplica acá.
- Fotos en tablas aparte, calcando `V43` (`documento_comercio` / `documento_comercio_archivo`): ningún listado lee el binario. "Sin borrado" = no hay `DELETE` en el servicio; no hay `ON DELETE CASCADE`.
- Por qué no `ENUM` nuevo en `notificacion.entidad_tipo`: no hace falta.

**Resumen de migraciones propuestas:** `V44` (S1: usuario, `historial_estado_usuario`, `sesion`, ENUMs de `nota_credito` y `historial_estado_pedido`, tipos de notificación), `V45` (S2: `comercio`), `V46` (S4: tablas de Soporte), `V47` (S5: reclamos). S3 no necesita migración propia si `V44`/`V45` quedan bien (el origen del Dueño ya está en `V45`).

---

## 3. Estado del comercio: todos los lugares que deciden o filtran

| Lugar | Archivo:línea | Qué hace hoy | Cambio por la Fase 5 |
|---|---|---|---|
| Catálogo público de comercios | `ComercioService.java:201-221` (`ESTADOS_VISIBLES_EN_CATALOGO` = `APTO_VENTA`, `CERRADO_TEMPORALMENTE`) | `SUSPENDIDO` ya no aparece | Ninguno |
| Detalle público de un comercio | `ComercioService.java:249` (`buscarAprobadoPorId`) | Mismo filtro: un suspendido da `404` | Ninguno (decisión 11: "no aparece a los Clientes") |
| Búsqueda global de productos y filtros | `ProductoService.java:211` y `:260` (`findByComercio_EstadoAndEstadoNot(APTO_VENTA, DESCONTINUADO)`) | Solo ve `APTO_VENTA` (hallazgo conocido H5: un `CERRADO_TEMPORALMENTE` aparece en el catálogo de comercios pero sus productos no en la búsqueda) | Ninguno; no se resuelve |
| Carrito (agregar ítem) | `CarritoService.java:85` -> `ComercioService.validarAceptaPedidos(comercio)` | `409` "no está aceptando pedidos" si no es `APTO_VENTA` | Texto: decisión 11 pide "comercio no disponible" (hoy es "Este comercio no está aceptando pedidos en este momento") |
| Checkout (`confirmarPedido`) | `PedidoService.java:171-175` | Lee estado y cierre con `LOCK IN SHARE MODE` y valida | Ya cubre `SUSPENDIDO`. Falta el estado de la cuenta del Cliente (`:153` lee solo el id) |
| Carrito con comercio que se suspende | `ItemCarrito`/`Carrito` | No se toca | Decisión 11: se conserva (no hay código que lo limpie al suspender; bien) |
| Validación de pedido nuevo del Empleado | `ComercioActivoService.java:155-163` | `409 COMERCIO_SIN_OPERACION` con `SUSPENDIDO` o `CERRADO_TEMPORALMENTE` | Ninguno |
| Guard de edición del Empleado | `ComercioActivoService.java:137-148` | `409 COMERCIO_SUSPENDIDO` solo si es Empleado (`:138`) | Quitar la exención del Dueño (punto 7) |
| Resolver de actor del Empleado | `ComercioActivoService.java:44` (`ESTADOS_ACCESIBLES_EMPLEADO`) | Un Empleado accede a `SUSPENDIDO` | Ninguno |
| Resolver del Dueño | `ComercioActivoService.java:92-96` | Accede a su comercio en **cualquier** estado | Ninguno |
| "Operativo" del Dueño | `ComercioActivoService.java:88-90` (`esOperativo`: `APROBADO`/`APTO_VENTA`) y `MisComerciosService.java:19` | Un suspendido no es operativo | El frontend lo usa para decidir si el Dueño entra al panel (ver punto 13) |
| Aptitud de venta | `AptitudVentaComercioService.java:217-220` (`participa`) | `SUSPENDIDO` no participa y `decidir` devuelve `actual` | Sumar el caso `SUSPENSION_LEVANTADA` (punto 4) |
| Cierre de turno y email | `CierreTurnoService.java:46` (`ESTADOS_ELEGIBLES` incluye `SUSPENDIDO`) y `CierreTurnoEnvioService.java:94` | El cierre se registra; el aviso sale solo si hubo pedidos o pendientes y la cuenta del Dueño está `ACTIVO` | Decisión 12: revisar la definición de "movimiento" (pregunta 13) |
| Documentos | `DocumentoComercioService.java:55` (incluye `SUSPENDIDO` entre los estados que permiten subir) | El Dueño ya puede subir con el comercio suspendido | Ninguno (coincide con la decisión 9) |
| Invitar y aceptar invitaciones | `InvitacionEmpleadoService.java:126` (aceptable con `SUSPENDIDO`), `:543` (invitar exige comercio operativo) | Invitar bloqueado con suspendido; **aceptar** una invitación ya enviada, permitido | Decisión 9 pide equipo "en solo lectura": hoy aceptar sigue permitido (pregunta 12) |
| Aprobación previa | `AprobacionPreviaDueno.java:31` (incluye `SUSPENDIDO`) | Un comercio que estuvo suspendido cuenta como "ya aprobado" | Ninguno |
| Listado del Administrador | `AdministradorService.java:194-218` (`listarComercios`) | Todos los estados | Ninguno; sumar origen y motivo para el Administrador |
| Mercado Pago (vincular/desvincular) | `MercadoPagoOAuthService`, `CuentaMercadoPagoService` | Recalcula todos los comercios del Dueño; `SUSPENDIDO` no participa | Decisión 9: **bloquear desvincular** con comercio suspendido (hoy permitido salvo pagos en curso) |

Qué cambia por la decisión 7 (origen) y 8 (recalcular al levantar): ningún filtro de la tabla depende del origen; el origen solo lo usan las acciones del Administrador (levantar individual vs. levantar al Dueño) y la lectura del motivo.

---

## 4. `AptitudVentaComercioService`

- **Cómo engancha `SUSPENSION_LEVANTADA`.** El enum ya existe (`enums/MotivoRecalculo.java:14`) y el `switch` de `texto(...)` ya lo traduce ("Suspensión levantada", `AptitudVentaComercioService.java:243`). Falta lo esencial: `decidir` (`:73-98`) no tiene rama para `SUSPENDIDO` (cae en `default -> actual`) y `participa` (`:217-220`) lo excluye. Hay que sumar `SUSPENDIDO` a `participa` y una rama que, solo con `motivo == SUSPENSION_LEVANTADA` (igual que `CERRADO_TEMPORALMENTE`/`INACTIVO` hoy con `DUENO_RESTAURADO`), devuelva: `APROBADO` si no se cumple `puedeSeguir`, `CERRADO_TEMPORALMENTE` si el Dueño está `BLOQUEADO`, `APTO_VENTA` en otro caso.
- **¿Regla de entrar o de seguir?** Un comercio que vuelve de una suspensión no "entra" desde cero, pero tampoco está vendiendo. Con `puedeSeguir` (cuenta de Mercado Pago activa + al menos un documento aprobado) vuelve a vender aunque haya un documento pendiente; con `puedeEntrar` (además, ningún documento pendiente) no. Como el Dueño puede subir documentos **durante** la suspensión, la diferencia es real. Recomiendo `puedeSeguir` (el comercio ya había cumplido la regla antes de suspenderse y un documento nuevo en revisión no corta ventas en la regla vigente); pregunta abierta 15.
- **Qué hace hoy con un comercio `SUSPENDIDO`.** Nada: `recalcular` devuelve el estado actual (`:155-157`) y `restaurar` (`:204-215`) solo mira `CERRADO_TEMPORALMENTE` o `INACTIVO`. Eso es bueno: un recálculo por documento o por Mercado Pago no levanta una suspensión por accidente.
- **Dueño bloqueado y suspendido a la vez.** `duenoBloqueado` sale de `usuario.estado == BLOQUEADO` (`ComercioService.java:263-267`). Con una sola columna, un Dueño `SUSPENDIDO` no está `BLOQUEADO`, así que "ambos" no se representa. Al levantar al Dueño pasa a `ACTIVO` y la regla de aptitud ve un Dueño no bloqueado. Si se decide que levantar devuelve a `BLOQUEADO` (pregunta 5), `decidir` deja los comercios en `CERRADO_TEMPORALMENTE`, que es consistente.
- **Cierre manual.** `decidir` y `recalcular` nunca leen ni escriben `comercio.cerrado_manualmente` (la bandera la escribe `CierreComercioService`). Confirmado por lectura: el recálculo no pisa el cierre manual, y `registrarTransicionAutomatica` (`ComercioService`) cambia estado, `fechaModificacion` e historial únicamente. La decisión 8 se cumple con solo no tocarla.
- **Orden de bloqueo para levantar.** Mismo contrato que hoy: `leerDueno` (usuario del Dueño compartido, cuenta de Mercado Pago `FOR UPDATE`) -> `bloquearComercio` -> `contarDocumentos` -> `recalcular`. Para levantar al Dueño se usa `leerDuenoRestaurado` (el llamador ya tiene la fila del usuario).

---

## 5. Suspensión actual de comercio y qué hay que rehacer

### 5.1 Cómo funciona hoy (`AdministradorService.suspenderComercio`, líneas 347-381)

1. Lee comercio y administrador; toma el estado del Dueño con `LOCK IN SHARE MODE` (`duenoBloqueadoConBloqueo`, `:354`) y el comercio `FOR UPDATE` por `refresh` (`:355`).
2. Valida `APROBADO` o `APTO_VENTA` (`:357`); desde `CERRADO_TEMPORALMENTE` **no** se puede suspender (decisión 6 sí lo incluye).
3. Cambia estado, escribe la fila de historial (con `administrador` y `motivo`), crea el aviso `COMERCIO_SUSPENDIDO` al Dueño (T16).
4. Llama a `PedidoService.cancelarPedidosPorSuspensionComercio` (`:380`) **dentro de la misma transacción del Administrador**.

`cancelarPedidosPorSuspensionComercio` (`PedidoService.java:779-815`): para cada pedido `PENDIENTE_CONFIRMACION_COMERCIO` y `EN_PREPARACION` hace `bloquearParaActualizar` y lo pasa a `CANCELADO_POR_SISTEMA` con nota de crédito y reembolso total (motivo `SUSPENSION_COMERCIO`); los `LISTO_PARA_RETIRAR` reciben `suspension_retiro_expira = ahora + 90 min` (final del mismo método, propiedad `pedido.timeout.retiro-suspension-minutos=90`, `application.properties:44`). `EN_CAMINO` y `PENDIENTE_PAGO` no se tocan.

El timer de retiros (`autoconfirmarRetirosPorSuspension`, `PedidoService.java:959-974`, job cada 5 min en `PedidoSchedulerService`): cierra como `NO_RETIRADO` (actor `SISTEMA`, `MotivoTimeoutPedido.TIMEOUT_RETIRO_SUSPENSION`, sin reembolso, aviso T36 al Cliente). **T26 (`PEDIDO_CERRADO_TIMER_SUSPENSION`) no tiene emisor**: el prompt menciona "T36/T26"; hoy solo T36.

### 5.2 Diferencias con la opción C

| | Hoy | Opción C |
|---|---|---|
| `PENDIENTE_CONFIRMACION_COMERCIO` | Cancela y reembolsa al suspender | No se toca; el equipo solo puede rechazar; vence a los 30 min con reembolso (ya existe, `PedidoService.java:913-940`) |
| `EN_PREPARACION` | Cancela y reembolsa al suspender | Se atiende (despachar o anular); tope automático de 90 min desde la suspensión con reembolso total |
| `EN_CAMINO` | No se toca | No se toca (coincide) |
| `LISTO_PARA_RETIRAR` | Timer de 90 min grabado por pedido | Igual, pero conviene derivarlo del comercio (ver abajo) |
| Transacciones | Todo dentro de la transacción del Administrador | Cada pedido en la suya |
| Levantar | No existe; el timer grabado en cada pedido no se borra | Tiene que existir y cancelar el tope |

### 5.3 Qué hay que rehacer y cómo (recomendación)

- **Dejar de tocar pedidos al suspender.** Con `comercio.suspendido_desde` (§2.2) el tope de `EN_PREPARACION` es un job nuevo, `cancelarPreparacionPorSuspension`, que cada 5 minutos busca pedidos `EN_PREPARACION` de comercios `SUSPENDIDO` con `suspendido_desde <= ahora - 90 min`, y los resuelve **uno por transacción** con el camino de `enTransaccionPorPedido` y `bloquearParaActualizarConEquipo`. Antes de cancelar revalida, con el pedido ya bloqueado, que el comercio siga `SUSPENDIDO` (lectura `LOCK IN SHARE MODE`) y que el pedido siga `EN_PREPARACION`. Si el Administrador levantó la suspensión antes, el job no encuentra nada: "si se levanta antes, el tope deja de aplicar" se cumple sin escribir nada al levantar. El job 4 (retiros) pasa a usar la misma fecha.
- **Efecto colateral bueno:** suspender (o suspender al Dueño con N comercios) pasa a ser una escritura corta de filas de `comercio` más avisos; desaparece la cascada de `N × pedidos × reembolsos` dentro de una transacción con el usuario del Dueño tomado. Eso elimina de raíz el riesgo de deadlock que describe `AUDITORIA-ETAPA-FINAL.md` (punto 4e).
- **Qué se descarta:** `PedidoService.cancelarPedidosPorSuspensionComercio` y el uso de `pedido.suspension_retiro_expira`. Los tests que los ejercitan se reescriben (punto 15).
- **Caso borde del timer (pregunta 9):** un pedido `EN_PREPARACION` que se despacha a `LISTO_PARA_RETIRAR` en el minuto 80 de la suspensión se cierra como `NO_RETIRADO`, sin reembolso, a los 10 minutos de estar listo. Con "90 minutos desde la suspensión" es lo que sale; con "90 minutos desde que quedó listo" haría falta guardar esa fecha por pedido. Hoy el `NO_RETIRADO` manual espera 60 min desde `LISTO_PARA_RETIRAR`; el automático por suspensión no.
- **Re-suspensión.** Si un comercio ya suspendido por el Dueño se suspende individualmente (decisión 7), recomiendo conservar el `suspendido_desde` original (no extiende ni acorta los topes) y cambiar origen y motivo. Pregunta 8.
- **Notificaciones al suspender** (decisión 10): el aviso al Dueño ya existe (T16, `:376-378`); falta el aviso al equipo (`COMERCIO_SUSPENDIDO_EQUIPO`, sin motivo) y el email al Dueño. Para el aviso al equipo hay que resolver los destinatarios **antes** de bloquear el comercio (usuarios de los Empleados con `LOCK IN SHARE MODE` en id ascendente, después las relaciones, después el comercio `FOR UPDATE`): hoy `suspenderComercio` no lo hace y tomaría los usuarios después del comercio, invirtiendo el orden global. Es el mismo patrón de `PedidoService.bloquear` (`:388-435`).

---

## 6. Matriz completa de efectos

Convenciones: "→" es el efecto al momento de suspender. "Pago en vuelo" = pago que llega por webhook o sincronización **después** de la suspensión. "Reembolso" = nota de crédito + llamada a Mercado Pago después del commit (`ReembolsoService`).

### 6.1 Por estado de pedido y por tipo de suspensión

| Estado del pedido | Comercio (individual o por Dueño) | Cliente suspendido | Empleado con cuenta suspendida | Dueño suspendido (cuenta) |
|---|---|---|---|---|
| `PENDIENTE_PAGO` | No se toca. Si el pago se confirma después: se cancela (`CANCELADO_POR_SISTEMA`) y se reembolsa al instante (pregunta 10: ¿se bloquea además crear o reusar la preferencia?) | Se cancela (`CANCELADO_POR_SISTEMA`, motivo `SUSPENSION_CLIENTE`), sin nota (no hay pago). Pago en vuelo: se cancela y se reembolsa al instante (nota motivo `SUSPENSION_CLIENTE`) | Sin efecto (es un pedido del Cliente-Empleado: ver columna Cliente si el Empleado compró) | Sin efecto directo; sus comercios pasan a `SUSPENDIDO` y se aplica la columna Comercio |
| `PENDIENTE_CONFIRMACION_COMERCIO` | El equipo solo puede **rechazar** (reembolso inmediato); aceptar da `409`. Vence a los 30 min con reembolso (job existente) | Sigue su camino: el comercio acepta o rechaza, o vence | Sin efecto | Igual que comercio |
| `EN_PREPARACION` | El equipo puede despachar o anular (reembolso total). Tope: a los 90 min de `suspendido_desde`, el sistema cancela con reembolso total | Sigue su camino normal | Sin efecto sobre pedidos; el Empleado no puede operar (sin sesión) | Igual que comercio |
| `EN_CAMINO` | No se toca. El Cliente confirma o el sistema a los 75/90 min | No se toca | Sin efecto | No se toca |
| `LISTO_PARA_RETIRAR` | El equipo puede entregar o cerrar como `NO_RETIRADO` (con la espera de 60 min). A los 90 min de `suspendido_desde` el sistema cierra `NO_RETIRADO`, sin reembolso, aviso T36 | Sigue su camino (el comercio entrega o cierra) | Sin efecto | Igual que comercio |
| `ENTREGADO`, `NO_RETIRADO`, `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA`, `EXPIRADO` | Terminales: no se tocan. **Reclamo permitido** sobre `ENTREGADO` y `NO_RETIRADO` aunque el comercio esté suspendido | Reclamo **no permitido** mientras dure la suspensión; el plazo de 7 días corre | Sin efecto | Sin efecto |

### 6.2 Carrito, pagos y reembolsos

| | Comercio suspendido | Cliente suspendido |
|---|---|---|
| Carrito | Se conserva. El checkout responde "comercio no disponible" (`409`) | Se conserva (decisión 5). Checkout bloqueado. **Contradice** `AUDITORIA-ETAPA-FINAL.md` (punto 4, matriz), que decía "carrito vaciado" |
| Webhook / sincronización tarde | `aplicarResultadoPago` (`MercadoPagoPagoService.java:277-309`) llama a `confirmarPagoAprobado` solo si el pedido sigue en `PENDIENTE_PAGO` (`:293-294`); hay que agregar la lectura del estado del comercio y, si está suspendido, cancelar y reembolsar | Ídem con el estado del Cliente |
| Reembolso | `ReembolsoService.generarNotaYReembolsarTotal` (`:67-90`), nota en la misma transacción; con la cuenta de Mercado Pago desvinculada queda `PENDIENTE_REVISION_MANUAL` (`prepararIntento`) y cae en la pantalla de reembolsos del Administrador | Ídem |
| Pantalla de reembolsos | `admin-reembolsos.html` / `initAdminReembolsos` (`admin.js:1955`) | Ídem |

### 6.3 Cómo se ven hoy los `PENDIENTE_PAGO` y qué jobs los tocan

- Un pedido nace `PENDIENTE_PAGO` en `confirmarPedido` (`PedidoService.java:152`). El comercio **no** lo ve (`listarPedidosComercio` usa `findLlegadosPagadosByComercioId`, `:752`). El Cliente lo ve con el botón de pago.
- Único job que lo toca: `expirarPagosVencidos` (`:829-846`, cada 60 s, umbral `pedido.timeout.pago-minutos`): lo pasa a `CANCELADO_POR_SISTEMA` con motivo "Pago no confirmado" o "Pago rechazado", sin nota (no hay pago aprobado).
- **Hueco que ya existe y que la decisión 5 hace visible** (hallazgo H4): si MercadoPago confirma el pago **después** de ese vencimiento, `aplicarResultadoPago` solo registra la alerta `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO` (`:295-297`) y **no genera nota ni reembolso**. La plata queda retenida hasta que el Administrador actúe a mano. La decisión 5 pide reembolso inmediato para el caso de suspensión; recomiendo resolver el caso general en el mismo cambio (pregunta 7), porque el código es el mismo.

---

## 7. Guard del Dueño (4b)

### 7.1 Escrituras del Dueño sobre un comercio

Todas pasan hoy por `ComercioActivoService`/`ProductoService`/`ComercioService`; el guard `validarComercioModificable` solo corta al Empleado (`ComercioActivoService.java:138`). Clasificación propuesta (decisión 9):

| Escritura | Ruta | Hoy con comercio `SUSPENDIDO` | Propuesta |
|---|---|---|---|
| Alta, edición, estado de producto | `POST /productos`, `PUT /productos/{id}`, `PATCH /productos/{id}/estado` | Dueño permitido | `409 COMERCIO_SUSPENDIDO` |
| Imágenes de producto (firma, alta, borrado, orden, recorte, url) | `POST .../cloudinary/firma`, `.../imagenes`, `DELETE`, `PATCH .../orden`, `.../recorte/firma`, `PATCH .../url` | Permitido | `409 COMERCIO_SUSPENDIDO` |
| Precio | `PUT /productos/{id}` | Permitido (y bloqueado en franja) | `409 COMERCIO_SUSPENDIDO` (misma ruta) |
| Perfil, foto, datos operativos | `PUT /comercios/perfil`, `PUT /comercios/perfil/foto` (+ firma), `PUT /comercios/perfil/datos-operativos` | Permitido | `409 COMERCIO_SUSPENDIDO` |
| Horarios | `PUT /comercios/perfil/horarios` | Permitido (`HorarioEdicionService.java:62` ya llama a `validarComercioModificable`) | `409 COMERCIO_SUSPENDIDO` |
| Redes sociales | `POST/PUT/DELETE /comercios/redes-sociales` | Permitido | A decidir (no figura en la decisión 9 como bloqueada ni como permitida): recomiendo bloquear con el resto del perfil |
| Abrir y cerrar | `PUT /comercios/abrir`, `/cerrar` | `409 COMERCIO_NO_OPERATIVO` ya existe (`CierreComercioService`, texto "Este comercio no está operativo") | Verificar que `SUSPENDIDO` cae en esa rama: la regla es "solo `APROBADO`/`APTO_VENTA`" |
| Vincular Mercado Pago | `GET /oauth/mercadopago/iniciar` + callback | Permitido | Permitido (decisión 9) |
| Desvincular Mercado Pago | `DELETE /oauth/mercadopago/desvincular` | Permitido salvo pagos en curso | `409` nuevo (los reembolsos pendientes usan su token) |
| Equipo (invitar, reenviar, cancelar, desactivar, reactivar) | `/comercios/equipo/**` | Invitar y reactivar ya exigen operativo (`InvitacionEmpleadoService.java:543`, `GestionMiembroEquipoService.java:231`); desactivar y cancelar invitación permitidos | Todo solo lectura: `409` también en desactivar y cancelar |
| Documentos | `POST/DELETE /comercios/documentos` | Permitido (`DocumentoComercioService.java:55`) | Permitido (decisión 9) |
| Pedidos (aceptar, rechazar, despachar, entregar, no retirado, anular) | `PUT /pedidos/comercio/{id}/...` | El Dueño no tiene guard; **aceptar** debería dar `409` (sin operación) para el Dueño igual que para el Empleado | Aplicar `validarComercioAceptaPedidosNuevos` también al Dueño al aceptar |
| Lecturas (pedidos, estadísticas, documentos, perfil) | `GET ...` | Permitido | Permitido |

### 7.2 Cómo reutilizar el guard del Empleado

`ComercioActivoService.validarComercioModificable(ComercioActivo actor, EstadoComercio)` (`:137-148`) ya devuelve `ConflictoComercioException.SUSPENDIDO` con código estable. La reutilización es quitar el `if (!actor.esEmpleado()) return;` y dejar la rama del `404` para estados no accesibles solo al Empleado. El estado se lee con `LOCK IN SHARE MODE` como primera lectura del comercio (A5b: `ProductoService.iniciarEscrituraDeCatalogo`, `:474-480`; `ComercioService.java:118-121`; `HorarioEdicionService.java:58-62`), así que no agrega bloqueos nuevos. **Cuidado**: para `editarDatosOperativos`, cerrar y abrir el comercio se toma `FOR UPDATE` directo y se valida sobre esa fila (A2: leerlo antes con compartido interbloquea); el guard del Dueño ahí también tiene que validar sobre la fila ya bloqueada.

La excepción nueva `COMERCIO_NO_OPERATIVO` de la decisión 9 ya existe como `ConflictoComercioException.NO_OPERATIVO`.

### 7.3 Tests que asumen que el Dueño sí puede editar suspendido

Estimación por búsqueda de texto (no verifiqué aserciones): `EscriturasEmpleadoIntegrationTest` (guard del Empleado y comparación con el Dueño), spec `42-empleado-escrituras-api`, spec `53-empleado-edicion-ui`, `EscriturasCatalogoOrdenDeBloqueoIntegrationTest` y spec `51` (A5b usa `suspenderComercio` para probar la carrera), `HorarioEdicion*` y spec `68`, spec `74-precio-franja-api`. El hueco figura documentado como conocido en `ComercioActivoService.java:135` y en `CLAUDE.md` §9.

---

## 8. Empleados

Un Empleado es un Cliente: **suspender su cuenta es suspender al Cliente** (S1). Lo particular de la decisión 13:

| Tema | Hoy | Qué hay que hacer |
|---|---|---|
| Relación con el comercio | La fila `empleado_comercio` no depende del estado del usuario | Sin cambios: sigue `ACTIVO` (decisión 13) |
| Acceso a comercios | `GET /empleados/mis-comercios` (`MisComerciosEmpleadoService`) lista relaciones activas; con sesión cerrada no se llama | Nada, pero **dentro de la transacción** de cada escritura delegada hay que comprobar que el actor siga `ACTIVO`: el JWT ya pasó el filtro. Propuesta: `UsuarioRepository.leerEstadoConBloqueoCompartido` en `HistorialEdicionComercioService.iniciarEscritura` (primera instrucción de todas las escrituras de catálogo, `:68`) y en `PedidoService.bloquear` para el usuario actor (`:411`, hoy `leerIdConBloqueoCompartido`) |
| Fan-out de avisos | `PedidoService.bloquear` arma `candidatos` con `findRelacionesByComercioIdAndEstado(..., ACTIVO)` (`:393-399`) y los filtra por `EstadoDeRelacion` (`:425-430`): **no mira `usuario.estado`** | Excluir a los suspendidos: join con `usuario` en `findRelacionesByComercioIdAndEstado` o filtrar con el estado leído en el mismo `LOCK IN SHARE MODE` de los usuarios (`:411`). Decisión 13: "queda afuera de las notificaciones del equipo" |
| Tope de empleados | **No existe** (`docs/DECISIONES.md:8757`: "sin tope de empleados por comercio"; `requisitos-funcionales-dueño.md:159`; `alcance-y-limitaciones.md:171`) | La decisión 13 dice "cuenta para el tope de empleados": hoy no hay tope, así que no hay nada que cambiar; ver contradicciones |
| Listado del equipo del Dueño | `InvitacionEmpleadoService.listarEquipo` -> `MiembroEquipoResponseDTO` (estado, `motivoBaja`, `puedeReactivar`) | Sumar el estado de la cuenta (`ACTIVO`/`SUSPENDIDO`) para mostrar "Cuenta suspendida" **sin motivo**; en `ComercioAdminResponseDTO`/equipo del Administrador también |
| Baja por el Dueño | `PUT /comercios/equipo/miembros/{id}/desactivar` | Sigue funcionando (salvo comercio suspendido: solo lectura) |
| Reactivar o invitar a una cuenta suspendida | `AptitudCuentaEmpleadoService.evaluar` (`:54-58`) rechaza cualquier estado no `ACTIVO`, con `409` genérico sin revelar el estado | Sin cambios |
| Pérdida de acceso en la app | `perderAccesoAlComercio` (`js/api.js`, hoja inferior con cuatro causas) y sondeo de 15 s sobre `GET /empleados/mis-comercios` | El `401` por sesión cerrada de la suspensión debe ir a la pantalla de cuenta suspendida (punto 13), no a esta hoja; el aviso "comercio suspendido" para el Empleado ya existe (`comercio.js:481` "Comercio suspendido. No se aceptan pedidos nuevos.") |
| Levantar | — | Al levantar, vuelve a operar sin migración: la relación nunca cambió |
| Combinación Empleado + Cliente | Misma cuenta | Suspender al Cliente-Empleado cierra su única sesión: cubre las dos identidades |

El Empleado de un comercio suspendido ve el aviso sin motivo y **sin botón de Soporte** (decisión Soporte): el DTO reducido del Empleado no debe incluir `motivo_suspension`.

---

## 9. Notificaciones y emails

### 9.1 Estado

| Aviso | `TipoNotificacion` | Audiencia | Emisor hoy |
|---|---|---|---|
| T16 comercio suspendido | `COMERCIO_SUSPENDIDO` | `DUENO` | `AdministradorService.java:376-378` |
| T28 cliente suspendido | `CLIENTE_SUSPENDIDO` | `CLIENTE` | Ninguno |
| T29 suspensión levantada | `SUSPENSION_LEVANTADA` | `CLIENTE_O_DUENO` | Ninguno |
| T19 nuevo reclamo | `NUEVO_RECLAMO` | `ADMINISTRADOR` | Ninguno |
| T20 / T21 reclamo aprobado / rechazado | `RECLAMO_APROBADO` / `RECLAMO_RECHAZADO` | `CLIENTE` | Ninguno |
| T22 nuevo mensaje de soporte | `NUEVO_MENSAJE_SOPORTE` | `ADMINISTRADOR` | Ninguno |
| Aviso a Empleados (suspensión del comercio y su levantamiento) | no existe | `EQUIPO` | Nuevos: `COMERCIO_SUSPENDIDO_EQUIPO`, `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` |
| Aviso al Dueño por reembolso de reclamo, sin texto del Cliente | no existe | `DUENO` | Nuevo: `RECLAMO_REEMBOLSO_DUENO` |

Hay un patrón de emisor hacia **todos los Administradores** (`NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`). No leí cómo resuelve los destinatarios; hay un solo Administrador (Diego), pero no conviene fijar su id.

Caminos de creación: `NotificacionService.crearParaCliente`, `crearParaDueno` y `crearParaEquipo` rechazan un tipo de otra audiencia (`exigirAudiencia`). Los avisos de reclamo al Cliente usan `crearParaCliente`; el aviso a Administradores hay que revisar con qué camino se emite (el `ADMINISTRADOR` no tiene método propio visible en lo que leí).

Impacto en el catálogo de notificaciones: cada tipo nuevo exige actualizar `AudienciaNotificacionTest`, `EnumsContraBaseDeDatosIntegrationTest` (ENUM físico) y, en el frontend, el texto/enlace del tipo (`js/notificaciones.js`: no vi mapa de tipos; el enlace "Ver pedido" depende de `entidadTipo`).

### 9.2 Emails

- `EmailService` (`services/EmailService.java`): `enviar(destinatario, asunto, cuerpo, idempotencyKey)` devuelve `ResultadoEnvioEmail` (`ENVIADO`, `FALLIDO`, `DESHABILITADO`); los envíos "simples" tragan el resultado. Sin plantillas HTML: texto plano firmado. Con `email.envio-habilitado=false` (perfil `test`) no llama a Resend y solo registra destinatario y asunto.
- Métodos a agregar: suspensión de cuenta (con motivo), suspensión levantada (con motivo opcional), comercio suspendido y levantado (al Dueño), respuesta de Soporte (texto completo y código), y confirmación de ticket con código.
- **Reintentos:** para avisos de suspensión alcanza el "mejor esfuerzo" actual (el aviso dentro de la app es el primario; pero ojo: el Dueño o el Cliente **suspendidos no pueden ver la app**, así que el email es su único canal). Recomiendo para suspensiones el mismo mecanismo de rastro que ya usa la regularización (`NotificacionService.registrarEmailEnviado`: fila canal `EMAIL`, estado `ENVIADO`="se intentó") y, para Soporte, el estado de envío por mensaje (§2.3) con reintentos como `cierre_turno`.
- **Canal Email en `notificacion`:** `registrarEmailEnviado` exige `usuario_id` (FK NOT NULL), así que sirve para suspensión (el usuario existe) y no para Soporte de emails sin cuenta.
- **Límites por destinatario:** hoy solo el tope de 3 emails de regularización por día, contados en `notificacion` con `canal = EMAIL`. Soporte necesita su propio límite (3 tickets por día por email y por IP, §2.3). Riesgo a notar: el formulario público dispara un email **a la dirección que escribe el visitante**; sin el límite por email sería una forma de mandar correo a terceros.
- Los emails se envían recién al confirmar la transacción (`util/EjecucionPostCommit`), nunca con un lock tomado.
- En pruebas hay un atajo para contar emails de regularización (`GET /api/v1/test/emails-regularizacion/cantidad`); hará falta uno equivalente para los emails de suspensión y Soporte.

---

## 10. Soporte y Reclamos hoy

### 10.1 Qué existe

| | Soporte | Reclamos |
|---|---|---|
| Tablas | `soporte` (`V1:485-500`): `usuario_id NOT NULL`, `mensaje_descargo text`, `atendido`, `resolucion` (`REACTIVADO`/`SUSPENSION_MANTENIDA`) | `reclamo` (`V1:442-457`): `pedido_id` único, `descripcion text`, `estado`, `administrador_id`, `nota_resolucion varchar(500)`, fechas |
| Entidad / repositorio / servicio / controller / DTO | **Ninguno** | **Ninguno** |
| Enums | `NUEVO_MENSAJE_SOPORTE` | `NUEVO_RECLAMO`, `RECLAMO_APROBADO`, `RECLAMO_RECHAZADO` |
| Pantallas | Solo textos estáticos "Contactá a soporte": `js/auth.js:52` (cuenta suspendida), `js/auth.js:149` (comercio no operativo), `js/comercio.js:351` y `:372-376` (rechazo definitivo), `comercio-perfil.html:160` | Solo el texto de `PedidoService` ("podés iniciar un reclamo o contactar al comercio", en la notificación de autoconfirmación): promete una función que no existe |
| Botón de soporte | `js/config.js:1` `SOPORTE_CONTACTO_URL = ''`: el botón de `comercio-rechazo-definitivo.html` **nunca se ve** | — |

### 10.2 Soporte público: infraestructura reutilizable

- **Rate limit por IP.** `config/security/RateLimitPublicoFilter.java`: grupos por ruta **exacta** (`GRUPO_POR_RUTA = Map.of(...)`, hoy 6 entradas; `Map.of` admite hasta 10 pares, así que sumar 3 rutas de Soporte entra pero deja poco margen), contador en memoria por `grupo|IP` con ventana fija de 60 s, límites por propiedad `app.rate-limit.*-por-minuto` (subidos a 1000 en `application-test.properties`). **Limita por minuto, no por día ni por email**: el "3 por día y 3 abiertos" de la decisión necesita persistencia (`soporte_limite`, §2.3). La IP es `request.getRemoteAddr()`; detrás del proxy de Don Web hace falta `server.forward-headers-strategy` (pendiente de la lista de despliegue); si no, todos comparten el contador del proxy. Además, muchas redes móviles argentinas comparten IP (CGNAT): un límite de 3 tickets por IP puede bloquear usuarios legítimos (pregunta 17).
- **Honeypot.** No hay antecedente en el proyecto. Un campo de formulario oculto con CSS no basta para lectores de pantalla: hace falta `aria-hidden="true"`, `tabindex="-1"`, `autocomplete="off"` y fuera del orden de tabulación, y que el servidor lo trate como éxito silencioso (sin crear ticket, sin revelar nada).
- **Código de seguimiento.** Alfabeto sin caracteres ambiguos, 8 símbolos con guion, único en base; reintento ante colisión como `TokenInsercionRepository`/`InvitacionInsercionRepository`.
- **Consulta sin sesión.** Rutas públicas por ruta exacta en `RUTAS_PUBLICAS` (`SecurityConfig.java:93`); un test de clasificación de mappings falla si se olvida alguna. `POST` con email y código en el cuerpo (nunca en la URL, regla de "sin tokens en URL"). Contra enumeración: la respuesta de "email o código incorrectos" es única, el alta responde igual exista o no la cuenta, y la consulta tiene su propio límite por IP y por email.
- **Vínculo con la cuenta.** `usuario_id` se completa solo si el email coincide con un usuario; la respuesta pública nunca lo indica ("sin cuenta" es solo para el Administrador).
- Muchas rutas públicas y de Administrador implican nuevos matchers exactos y las entradas del test de clasificación.

### 10.3 Fotos de reclamos: patrón de `DocumentoComercio`

Reutilizar tal cual: subida multipart (`DocumentoComercioController` `@PostMapping(consumes = MULTIPART_FORM_DATA_VALUE)`), validación por firma de bytes (`util/FirmaArchivo`, nunca por extensión ni `Content-Type`), tamaño legible en el mensaje (`util/TamanoLegible`), `Cache-Control: no-store`, `nosniff`, visor por blob con el header `Authorization` (`frontend/js/documentos-comun.js`; `Caddyfile` ya permite `blob:` en `frame-src`).

Límites a revisar: `spring.servlet.multipart.max-file-size=16MB`, `max-request-size=17MB` y `server.tomcat.max-swallow-size=32MB` (`application.properties:54-59`, pensados para 8 MB por documento). Un reclamo con 3 fotos de 5 MB más el texto son ~15 MB: entra bajo los 17 MB, con poco margen. `max_allowed_packet` del servidor de base de datos debe ser de **al menos 16 MB** (ya requerido por la Fase 4; `docs/LISTA-DE-DESPLIEGUE.md`). Cada reclamo suma hasta 15 MB de `LONGBLOB` que no se borran nunca: tamaño de la base y de los respaldos en Don Web **no verificado**. Para el Cliente, el límite visible en la interfaz tiene que mostrar el peso real del archivo y el máximo.

---

## 11. Reembolsos y notas de crédito

- **Motivo `RECLAMO`.** `MotivoNotaCredito` (Java) y el ENUM físico `nota_credito.motivo` (`V23`) llevan hoy cinco valores (`RECHAZO_COMERCIO`, `CANCELACION_CLIENTE`, `ANULACION_COMERCIO`, `SUSPENSION_COMERCIO`, `EXPIRACION_SIN_RESPUESTA`). Agregar `RECLAMO` y `SUSPENSION_CLIENTE` al final de los dos (§2.1). `EnumsContraBaseDeDatosIntegrationTest` los compara.
- **Reembolso parcial.** `MercadoPagoReembolsoClient` solo expone `solicitarReembolsoTotal` (lo llama `ReembolsoService.solicitarYRegistrar`); `generarNotaYReembolsarTotal` crea la nota por `pago.getMonto()` y corta si `montoCubierto >= pago.getMonto()` (`prepararIntento`). Para un reclamo parcial falta un método que acepte monto (la API de Mercado Pago admite `amount`; no probado acá) y una variante de `prepararIntento` con monto. La tabla `nota_credito` es 1 pago : N notas desde `V2` (se eliminó `uq_nota_credito_pago`), así que varias notas parciales ya caben.
- **Topes.** "Hasta lo pagado menos lo ya devuelto": `NotaCreditoService.montoCubierto(pagoId)` ya suma las notas; el tope es `pago.monto - montoCubierto`. "No se puede reclamar un pedido ya reembolsado al 100%": el mismo cálculo.
- **Cuenta de Mercado Pago del Dueño desvinculada.** `prepararIntento` crea la nota `PENDIENTE_REVISION_MANUAL` con el mensaje fijo `ERROR_CUENTA_DESVINCULADA` y devuelve `hayNota = true`; el Administrador la ve en la pantalla de reembolsos y puede reintentar (`reintentarNotaCredito`, que exige cuenta activa). Esto ya cubre el requisito "aprobado, reembolso en proceso".
- **Decisión 9 y desvinculación.** Con comercio suspendido, `desvincular` debe dar `409` porque los reembolsos pendientes usan su token.
- **Riesgos conocidos, no resueltos acá:** (a) `CLAUDE.md` §1bis deja pendiente "validar en sandbox cómo MercadoPago reparte el reembolso con `marketplace_fee`", y un reembolso de un pedido entregado semanas antes (con el split ya liquidado) nunca se probó; puede fallar por saldo del vendedor. (b) El ticket WCS-52639 de Mercado Pago se menciona en `CLAUDE.md` como pendiente de la suspensión; su contenido y estado **no están en lo que leí**.
- **Concurrencia de la resolución de un reclamo:** ver punto 14 (el orden recomendado es pedido -> reclamo -> pago -> nota, que difiere del propuesto en `AUDITORIA-ETAPA-FINAL.md`).

---

## 12. Panel del Administrador actual

| Pieza | Dónde | Estado |
|---|---|---|
| Dashboard con tarjetas de contadores | `admin-dashboard.html` (alert-card de pendientes, re-solicitudes y documentos, líneas 23-59), `js/admin.js:210` `initAdminDashboard` y `pintarTarjetaDocumentos` | Modelo a copiar para Soporte y Reclamos (cada uno con su contador) |
| Métricas | `GET /administrador/metricas` -> `MetricasAdminResponseDTO` (`comerciosPendientes`, `resolicitudesPendientes`, ..., `documentosPendientes`) | Sumar `soportePendiente` y `reclamosPendientes`; el contador sale de `count` por estado, como `documentoComercioRepository.countByEstado(PENDIENTE)` |
| Listado de Clientes | `admin-clientes.html`, `initAdminClientes` (`admin.js:1031`), `GET /administrador/clientes` -> `AdministradorService.listarClientes` (`findAll`, sin paginar) | **Solo lectura**: tiene estado pero ninguna acción |
| Listado de Dueños | No existe | Hace falta (o acción desde el modal del comercio / el detalle) para suspender a un Dueño |
| Listado de Comercios | `admin-comercios.html`, `initAdminComercios` (`admin.js:978`), `GET /administrador/comercios` | Todos los estados; `mostrarModalDetalleComercio` (`:859`) con "Suspender" solo si `APROBADO`/`APTO_VENTA` |
| Modal de suspender | `mostrarModalSuspenderComercio` (`admin.js:780-857`) con textarea de motivo y error (`"El motivo es obligatorio..."`); `PUT /administrador/comercios/{id}/suspender` | Motivo hoy solo `@NotBlank @Size(max = 500)` (`SuspensionComercioRequestDTO`); la decisión pide 10 a 500 |
| Bandeja de documentos | `admin-documentos.html`, `admin-documento-revision.html`, `js/admin-documentos.js` | Modelo para la bandeja de reclamos con fotos |
| Reembolsos | `admin-reembolsos.html`, `initAdminReembolsos` (`admin.js:1955`) | Recibe las notas de reclamos que fallen |
| Equipo y actividad por comercio | `admin-comercio-equipo.html`, `admin-comercio-actividad.html`, `js/admin-equipo.js` | Mostrar "Cuenta suspendida" en integrantes |

`admin.js` tiene 2463 líneas con todos los módulos del panel: sumar Soporte y Reclamos ahí empeora el tamaño; conviene archivos nuevos (`js/admin-soporte.js`, `js/admin-reclamos.js`), como `admin-documentos.js`.

---

## 13. Frontend afectado

### 13.1 Pantallas que cambian o se crean

| Pantalla | Tramo | Qué | Componentes a reutilizar |
|---|---|---|---|
| Login | S1 | Error por código estable (`data.codigo`), enlace a Soporte, motivo visible solo con contraseña correcta | `renderBannerConEnlace` (`auth.js`), banners de `form-utils.js` |
| Pantalla "Cuenta suspendida" (sesión abierta) | S1 | Motivo y botón a Soporte; se alcanza por `401` con `CUENTA_SUSPENDIDA` | Hoja bloqueante `perderAccesoAlComercio` (`js/api.js`) como modelo; página nueva `cuenta-suspendida.html` |
| Admin: suspender y levantar Cliente | S1 | Botones en `admin-clientes.html`, modal con motivo | Generalizar `mostrarModalSuspenderComercio` (`admin.js:780`) a un modal "acción con motivo" |
| Admin: levantar comercio y mostrar origen y motivo | S2 | Modal de detalle (`:859`) y lista | Mismo modal |
| Panel del Dueño con comercio suspendido | S2 | Aviso con motivo y botón a Soporte, pedidos/estadísticas/documentos en lectura | Banner de `comercio.js:481`; **rehacer `comercio-activo.js`** (hoy un `SUSPENDIDO` no entra: `elegirDestino` solo considera `comercio.operativo` y `ORDEN_SIN_OPERATIVO = ['RECHAZADO','PENDIENTE','RECHAZO_DEFINITIVO']`, líneas 18 y 72-82; sin operativos, el login muestra "Tu comercio no está operativo", `auth.js:149`) |
| Selector de comercio | S2 | Un comercio suspendido hoy aparece en "Otros", gris y sin acción (`selector-comercio.js`) | Hacerlo seleccionable para lectura |
| Panel del Empleado con comercio suspendido | S2 | Aviso sin motivo y sin Soporte | Ya existe la leyenda (`comercio.js:481`) |
| Detalle de pedido del Cliente | S2 | Nombre y foto del comercio de pedidos viejos: hoy los resuelve `pedidos.js:283-300` con `GET /catalogo/comercios`, que **no devuelve suspendidos** (cae al fallback "Pedido #N"). Decisión 11 lo contradice: hay que sumar `comercioNombre`/`comercioFotoUrl` a `PedidoResponseDTO` | `pintarAvatarComercio` |
| Equipo del Dueño y del Administrador | S3 | Etiqueta "Cuenta suspendida" por integrante | `js/equipo-vistas.js` |
| Formulario público de Soporte | S4 | Email, tipo, mensaje, nombre del comercio para tipos 2 y 4, honeypot | `crearCheckboxTerminos`/validadores de `form-utils.js`, `bindDisponibilidad` como modelo de estados |
| Consulta por email + código y conversación | S4 | Estados "Esperando respuesta del equipo", contador de mensajes | Esqueletos y `renderEmptyState` de `catalogo.js` |
| Bandeja y detalle de ticket (Administrador) | S4 | Bandeja con contador; botón "Levantar suspensión" que abre el modal de las listas | `admin-documentos.html` como modelo |
| "Ayuda y soporte" para todos | S4 | **No hay pie de página**: la navegación es una barra inferior (`renderBottomNav`, `catalogo.js:253`) | Fila en el perfil del Cliente/Dueño/Empleado, enlace en login y en las pantallas de estado (pregunta 3) |
| "Iniciar reclamo" desde el pedido | S5 | Botón en detalle de pedido `ENTREGADO`/`NO_RETIRADO` dentro de plazo, formulario con motivo, mensaje y hasta 3 fotos | `js/documentos.js` (subida con validación en el cliente), `documentos-comun.js` (visor) |
| Vista de la respuesta | S5 | Aprobado (con o sin "reembolso en proceso") o rechazado con mensaje | `renderPedidoEstadoHeader` |
| Bandeja y detalle de reclamos (Administrador) | S5 | Fotos, resolver con monto parcial o rechazo con mensaje | `admin-documento-revision.html` como modelo |

### 13.2 Heurísticas de Nielsen a resolver

- **Visibilidad del estado:** ticket y reclamo muestran siempre en qué estado están y quién tiene el turno ("Esperando respuesta del equipo"); la pantalla de suspensión explica qué pasó y qué puede hacer.
- **Prevención de errores:** antes de suspender, mostrar el efecto (cuántos pedidos están en curso, a cuántos comercios afecta si es un Dueño), en el estilo de `GET /oauth/mercadopago/desvinculacion/previa`; el rechazo de un reclamo sin mensaje no se envía.
- **Reconocimiento antes que recuerdo:** código de seguimiento visible y copiable al crear el ticket y enviado por email; consultar con email y código sin tener que recordar nada más.
- **Control del usuario:** confirmación al cerrar un ticket y al aprobar un reembolso (acción irreversible).
- **Ayuda:** texto de ayuda de los plazos (7 días) y límites (3 fotos de 5 MB) en el mismo formulario.
- **Consistencia:** reutilizar el modal de motivo y el patrón de toasts de éxito (toda acción exitosa muestra un toast, regla del proyecto).
- **Mobile 375 px:** la tira de fotos y el visor deben probarse a ese ancho (hay un fixture de overflow `sinScrollHorizontal`, `testing/playwright/tests/helpers/layout.ts`).
- **Textos:** nunca nombres internos de estados al usuario ("Cuenta suspendida" sí; `SUSPENDIDO`, `CERRADO_TEMPORALMENTE` no).

---

## 14. Concurrencia

### 14.1 Orden de locks y el punto de partida

Orden global vigente: usuario, empleado_comercio, dueño/cuenta_mercado_pago, comercio, documento_comercio, producto/pedido, pago, carrito (`docs/CONCURRENCIA-Y-TRANSACCIONES.md`). En MariaDB 10.4: lecturas con `LOCK IN SHARE MODE` (consulta nativa), actualizar por clave primaria. Reglas de apoyo: nunca leer compartido y escribir después la misma fila; una transacción por pedido en procesos; los usuarios con `LOCK IN SHARE MODE` en id ascendente antes que el pedido (`PedidoService.bloquear`, `:388-435`).

### 14.2 Cambios estructurales necesarios

1. **Suspender un usuario toma su fila con `FOR UPDATE`** (`UsuarioRepository.findByIdConBloqueo`), igual que el login y la recuperación. Eso serializa suspender contra login, cambio de contraseña y cualquier acción que tome el usuario compartido (todas las de pedidos, checkout, escrituras de catálogo).
2. **Comprobar el estado de la cuenta del actor dentro de la transacción** de cada operación, con la misma lectura que ya toma el lock: reemplazar `leerIdConBloqueoCompartido` por `leerEstadoConBloqueoCompartido` donde el usuario es el que actúa. Sin esto, una request que ya pasó el filtro JWT antes de la suspensión sigue ejecutándose.
3. **No tener el `FOR UPDATE` del usuario tomado mientras se procesan pedidos en otra transacción.** Si el suspendedor del Dueño o del Cliente corriera los pedidos en `REQUIRES_NEW` desde la misma transacción, esas transacciones piden el usuario compartido y esperan al bloqueo exclusivo del llamador que las está esperando: se interbloquea con el hilo mismo. La suspensión del Cliente se parte en dos fases: (1) transacción corta que cambia el estado, escribe historial, cierra sesión y deja los avisos; (2) después del commit, un barrido de los pedidos `PENDIENTE_PAGO` del Cliente, uno por transacción, con `bloquearParaActualizar`. La suspensión del comercio y del Dueño **no necesitan fase 2** (punto 5).
4. **El webhook y la sincronización deben leer los estados antes de bloquear el pedido.** `aplicarResultadoPago` bloquea el pedido en `:278` y luego `confirmarPagoAprobado` bloquea usuarios y relaciones. Para decidir "pago en vuelo" hay que leer el estado del Cliente y del comercio con `LOCK IN SHARE MODE`, y el orden permitido es comercio antes que pedido. Si el chequeo se agrega después de `:278`, queda pedido -> comercio, invertido respecto de la desvinculación de Mercado Pago (comercio `FOR UPDATE` y después los `PENDIENTE_PAGO` con bloqueo compartido): ciclo posible. Diseño: una variante de `bloquearParaActualizar` que lea cliente y comercio antes del pedido y devuelva una foto de los estados, y pasarla a `confirmarPagoAprobado`.
5. **Orden en la creación de reclamos y su resolución**: el orden propuesto en `AUDITORIA-ETAPA-FINAL.md` (resolver: pedido -> pago -> nota -> reclamo) interbloquea con un segundo `INSERT` del mismo reclamo (el `UNIQUE (pedido_id)` hace esperar al segundo insert por el lock del primero mientras sostiene el pedido compartido que necesita el resolutor). Recomiendo: crear = usuario compartido -> pedido `FOR UPDATE` -> `INSERT reclamo`; resolver = usuario del Administrador compartido -> pedido `FOR UPDATE` -> reclamo `FOR UPDATE` -> pago -> nota. Es decir, el reclamo va **después del pedido y antes del pago**.

### 14.3 Escenarios

| # | Escenario | Locks y resultado esperado | Estrés / mutación |
|---|---|---|---|
| 1 | Suspender comercio vs. aceptar | Aceptar toma usuarios, relación y comercio `S`, pedido `X`. Suspender toma comercio `X`. Gana el que llegue primero; el aceptador que pierde ve `SUSPENDIDO` y responde `409 COMERCIO_SIN_OPERACION` (para el Dueño, nuevo) | Mutación: quitar la lectura del comercio en aceptar |
| 2 | Suspender vs. rechazar, despachar, anular, entregar | Estas acciones **no** leen el comercio (por diseño); siguen siendo válidas con el comercio suspendido (decisión): no hay carrera que resolver, solo debe seguir siendo cierto | Test de que las cuatro funcionan con el comercio suspendido |
| 3 | Suspender vs. expirar sin respuesta (30 min) y vs. autoconfirmar | No se tocan entre sí: el job toma usuarios y pedido; suspender solo escribe el comercio | Una corrida simultánea sin `5xx` ni doble aviso |
| 4 | Suspender comercio vs. checkout | `confirmarPedido` lee el estado con `S` antes de crear el pedido (`:171`): o ve `SUSPENDIDO` y rechaza, o el pedido nace antes y queda `PENDIENTE_PAGO` | Estrés: 20 checkouts contra una suspensión; sin pedidos nacidos después |
| 5 | Suspender comercio vs. pago confirmado | Ver 14.2 punto 4. Pago que gana antes de la suspensión: pedido `PENDIENTE_CONFIRMACION_COMERCIO` normal. Pago después: cancelado y reembolsado, una sola nota | Mutación: sacar la lectura de estado del webhook; mutación: invertir el orden pedido/comercio y verificar el deadlock con la desvinculación |
| 6 | Suspender Cliente vs. checkout | Cliente `X` contra Cliente `S` en `confirmarPedido` (`:153`): o el pedido nace y la fase 2 lo cancela, o se rechaza | Estrés + mutación (sacar la comprobación de estado) |
| 7 | Suspender Cliente vs. pago confirmado | Igual que 5 con el estado del Cliente | Estrés |
| 8 | Suspender Cliente vs. login | `FOR UPDATE` contra `FOR UPDATE` sobre el mismo usuario: serializa. Login gana: sesión creada y cerrada por la suspensión. Suspensión gana: el login ve `SUSPENDIDO` | Estrés: 30 logins contra una suspensión; ninguna sesión activa al final |
| 9 | Suspender Dueño vs. sus comercios operando | Usuario del Dueño `X` y después sus comercios operativos por clave primaria con `refresh PESSIMISTIC_WRITE` (nunca todos a la vez: ver `AuthService.java:375-388` y `docs/APRENDIZAJES-TECNICOS.md`, deadlock con la aprobación de un pendiente). Las operaciones del Dueño y de su equipo toman `usuario S` primero y esperan | Estrés: cerrar, abrir, editar, aceptar y vincular Mercado Pago contra la suspensión |
| 10 | Suspender Dueño vs. aprobar un comercio pendiente | La aprobación toma el usuario del Dueño `S` (`leerDueno`), la suspensión `X`: o aprueba antes (el comercio queda `APROBADO`/`APTO_VENTA` y la suspensión lo incluye si ya está confirmado) o ve `SUSPENDIDO` y responde `409` (decisión 6: no se aprueba con el Dueño suspendido) | Test: la aprobación nunca deja un comercio operativo con el Dueño suspendido |
| 11 | Suspender Dueño vs. cambios del equipo | Invitar, desactivar y reactivar toman el usuario del Dueño | Estrés |
| 12 | Levantar vs. suspender (mismo comercio o usuario) | Mismo lock exclusivo; la segunda ve el estado ya cambiado y responde `409` o repite idempotente (definir: pregunta) | Dos Administradores no se prueban (criterio), pero sí dos pestañas de uno: no hace falta |
| 13 | Levantar individual de un comercio suspendido por el Dueño | Lectura de `suspension_origen` con la fila bloqueada; `409` si es `DUENO` | Test |
| 14 | Suspender Empleado vs. acciones sobre pedidos | El Empleado toma su usuario `S` en `bloquear`; la suspensión `X`. Lo que ya estaba en curso termina; lo que llegue después ve `SUSPENDIDO` (comprobación 14.2 punto 2) | Estrés + mutación (sacar la comprobación) |
| 15 | Tope de 90 min vs. despachar o anular a mano | Ambos pasan por el pedido `X`; el que pierde ve el estado nuevo: el job no hace nada, la acción manual da `409` | Mutación: sacar la revalidación del estado con el pedido bloqueado |
| 16 | Levantar vs. tope de 90 min | El job revalida con `S` sobre el comercio que siga `SUSPENDIDO`; levantar toma el comercio `X`. Si el tope gana, el pedido ya está cancelado y reembolsado (legítimo: pasaron 90 min); si levantar gana, el job no encuentra nada | Estrés |
| 17 | Doble clic de reclamo duplicado | `UNIQUE (pedido_id)` más el orden de 14.2 punto 5: una sola fila, el segundo da `409` | Prueba de doble clic (única de Reclamos junto con la siguiente) |
| 18 | Aprobar dos veces el mismo reembolso | Reclamo `FOR UPDATE` y revalidar `PENDIENTE`; nota única (mismo cuidado que `anular`) | Prueba de doble clic |

No se prueban carreras entre acciones del Administrador (criterio). Estrés nuevo propuesto: `stress-locks-tramoSuspension.mjs` (id `suspension` en `correr-estreses.mjs`) para los escenarios 1, 4 a 11, 14 a 16 (backend con `MERCADOPAGO_API_BASE_URL` apuntando al stub para pagos en vuelo, como el estrés `carrito`). Mutaciones propuestas, cada una debe hacer fallar al menos un test: (M1) sacar la comprobación de estado del Cliente en `confirmarPedido`; (M2) sacar la lectura del estado del comercio en el camino del pago; (M3) sacar la comprobación de estado del actor en `iniciarEscritura`; (M4) sacar la revalidación de estado del pedido en el job del tope; (M5) tomar los comercios del Dueño con `findByDuenoIdConBloqueo` en vez de por clave primaria; (M6) ignorar `suspension_origen` al levantar al Dueño; (M7) dejar el chequeo del `UNIQUE` sin captura (`500` en lugar de `409`).

---

## 15. Impacto en tests existentes

Estimación por búsqueda de texto; no corrí nada.

**Java (11 clases mencionan la suspensión o sus métodos):** `PedidoTransicionesIntegrationTest`, `PedidoServiceReembolsoTest`, `PedidoServiceCarreraTest`, `PedidoServiceRelojTest`, `PedidoNoRetiradoServiceTest`, `PedidoNoRetiradoConcurrenciaIntegrationTest`, `PedidoAutoconfirmadoEquipoIntegrationTest`, `NotificacionesEquipoIntegrationTest`, `ActividadComercioPedidosIntegrationTest`, `EscriturasEmpleadoIntegrationTest`, `CierreTurnoConcurrenciaIntegrationTest`. Los que prueban la cascada de cancelación al suspender (`PedidoTransicionesIntegrationTest`, `PedidoServiceReembolsoTest`, `PedidoServiceCarreraTest`) se reescriben; los del timer de retiros y de `NO_RETIRADO` se adaptan a leer `comercio.suspendido_desde`. Más `AptitudVentaComercioServiceTest` (nuevas ramas de `decidir`), `AudienciaNotificacionTest`, `EnumsContraBaseDeDatosIntegrationTest` (ENUM nuevos) y `ClasificacionRutasComercioTest` (rutas nuevas). Los nuevos son aditivos.

**Playwright (86 specs):** mencionan suspensión o el helper `suspenderComercio` (`tests/helpers/backend.ts:883`): 21 a 27, 40, 42, 43, 45, 47, 49, 51, 53, 56, 60, 61, 68 y 74 (muchos solo la usan para armar un estado, por lo que el cambio de comportamiento no los afecta; los que **esperan** la cancelación o el `409` del Dueño sí). Los que esperan el nuevo estado: 40 (nota en transacción), 42 y 53 (guard del Dueño), 47 y 49 (timers) y 61 (lista de Administrador). Helpers como `aprobarDocumentacionTest` no cambian.

**Newman:** 11 constructores `build-*-postman.mjs` usan `/suspender` (`actividad-E3-A2b`, `catalogo-A5b`, `empleado-E1/E2/E3-A2`, `equipo-gestion-E4`, `horarios-T1`, `multicomercio-2a/3a`, `notificaciones-equipo-A4`, `pedidos-no-retirado-A4b`); sin tocar las colecciones existentes salvo las que esperen cancelación inmediata. La numeración de carpetas (la última es 79 según el prompt) no la verifiqué.

**Estreses:** 10 scripts mencionan `suspender` o `SUSPENDIDO`: `stress-locks-tramoC2`, `stress-locks-tramoE3-A0`, `A2`, `A3`, `A4b`, `stress-locks-empleado-e2`, `e4`, `stress-locks-tramoCierreTurno`, `Horarios` y `Turnos`.

Estimación de lo que se rompe de verdad: del orden de 4 a 6 clases Java y 5 a 8 specs de Playwright, más 3 a 4 carpetas de Newman. El resto cambia solo de helper.

---

## 16. Documentación a actualizar

| Documento | Qué |
|---|---|
| `docs/diccionario-de-datos.md` -> **v1.29** | `usuario` (dos columnas), `historial_estado_usuario` (`administrador_id`), `sesion.tipo_cierre`, `comercio` (tres columnas), `historial_estado_comercio` (origen), `nota_credito.motivo`, `historial_estado_pedido.motivo_timeout`, `ticket_soporte`, `ticket_soporte_mensaje`, `soporte_limite`, `reclamo` ampliada y `reclamo_foto(_archivo)`, `notificacion.tipo`. Dejar explícito el destino de la tabla `soporte` vieja |
| Requisitos funcionales del sistema | Reescribir "Suspensión de Comercio — Gestión de Pedidos Activos" (`requisitos-funcionales-sistema.md:110-116`) por la opción C; la regla de la suspensión del Dueño (`:27`); T28, T29 y los tipos nuevos |
| Requisitos del Administrador, Cliente, Dueño, Empleado y Comercio | Suspender y levantar (`requisitos-funcionales-administrador.md:11-12, 32-33, 92`), la historia del Dueño y del Cliente de Soporte (HU-C15, HU-D10) y las de Reclamos; las referencias a "tramo de rediseño de la suspensión" (`requisitos-funcionales-comercio.md:304`, `-dueño.md:330`, `-empleado.md:159`) |
| Historias de usuario | HU-A06 y HU-A10 (levantar) pasan de "futuro" a definidas; nuevas de Soporte y Reclamos |
| `alcance-y-limitaciones.md` | Líneas 194-200 describen "En Camino se completan automáticamente como entregados" y un cierre del retiro sin reembolso; líneas 232 y 247-248 dicen que levantar no existe |
| `docs/DECISIONES.md` | Una entrada por decisión (suspensión como decisión del Administrador, origen, opción C, derivar el tope del comercio, motivos, Soporte, Reclamos) |
| `docs/CONCURRENCIA-Y-TRANSACCIONES.md` | Punto 3 y la fila de "Cancelación por suspensión del comercio" (línea 106) cambian por completo; sección nueva con los escenarios de 14.3 y el orden del reclamo |
| `docs/APRENDIZAJES-TECNICOS.md` | Si aparecen deadlocks nuevos al implementar |
| `docs/LISTA-DE-DESPLIEGUE.md` | `server.forward-headers-strategy` (IP real para el límite de Soporte), tamaño de la base por las fotos |
| `CLAUDE.md` | §1bis (cuando se cierre cada tramo), §3 (componentes), §6, §9 |

**Contradicciones entre documentos y código ya detectadas:** ver la sección siguiente.

---

## 17. Hallazgos aparte

Sin proponer arreglo salvo que bloquee la fase.

- **H1 (bloquea S1).** `AuthService.confirmarRecuperacionPassword` y `verificarEmail*` ponen `ACTIVO` sin mirar el estado: levantan una suspensión (`AuthService.java:133, 151, 211`). Se corrige dentro de S1.
- **H2.** `reenviarVerificacion` devuelve `404` "No existe una cuenta con ese email" (`AuthService.java:155-157`): enumeración de cuentas, a diferencia de recuperación y reactivación que ya se corrigieron.
- **H3.** El login revela `PENDIENTE`, `BLOQUEADO`, `INACTIVO` y `SUSPENDIDO` sin contraseña (`AuthService.java:101`). Pregunta 4.
- **H4.** Un pago aprobado sobre un pedido ya cancelado deja solo una alerta, sin reembolso (`MercadoPagoPagoService.java:293-297`). Plata retenida hasta que alguien actúe.
- **H5 (conocido, sin resolver).** La búsqueda global de productos solo ve comercios `APTO_VENTA` (`ProductoService.java:211, 260`), mientras el catálogo de comercios también lista `CERRADO_TEMPORALMENTE`.
- **H6.** `findByUsuarioIdAndActivaTrue` devuelve `Optional`; si algún día hubiera dos sesiones activas lanzaría `IncorrectResultSizeDataAccessException`. No hay restricción única en la base que lo impida.
- **H7.** `SuspensionComercioRequestDTO` solo exige `@NotBlank @Size(max=500)`; no hay mínimo de 10.
- **H8.** `AdministradorService.listarClientes` usa `findAll` sin paginar, con un acceso por cliente a persona y usuario.
- **H9.** `JwtAuthenticationFilter` no mira `usuario.estado`: la seguridad de una cuenta suspendida depende solo de que se cierre la sesión (por eso el chequeo dentro de la transacción del punto 14.2).
- **H10.** `confirmarPagoAprobado` llamado desde `aplicarResultadoPago` toma usuarios de los Empleados y sus relaciones **después** de tener el pedido `FOR UPDATE` (`MercadoPagoPagoService.java:278` -> `PedidoService.java:288` -> `bloquear`): el orden documentado lo pone antes. No encontré un ciclo concreto; conviene revisarlo cuando se reordene el camino del pago (14.2 punto 4).
- **H11.** `SOPORTE_CONTACTO_URL` vacío: el botón de soporte del rechazo definitivo no se ve nunca.
- **H12.** `T26` (`PEDIDO_CERRADO_TIMER_SUSPENSION`) sin emisor; el texto de T36 afirma "el comercio lo cerró" aunque lo cierre el sistema por la suspensión (anotado en `AUDITORIA-ETAPA-FINAL.md:631`).
- **H13.** `RateLimitPublicoFilter` depende de `getRemoteAddr()` (ver 10.2).
- **H14.** El aviso de autoconfirmación promete un reclamo que no existe.

---

## Contradicciones: el prompt contra el código y los documentos

Para que Diego decida; no las resolví.

| # | El prompt / un documento dice | El código o el repositorio dice | Impacto |
|---|---|---|---|
| C1 | Decisión 4: con contraseña incorrecta sale el mensaje genérico y no suma al bloqueo | El login revela el estado antes de la contraseña (`AuthService.java:101`); no suma intentos para estados no `ACTIVO` porque lanza antes | Hay que mover el chequeo; qué hacer con los otros estados es la pregunta 4 |
| C2 | "Un mismo usuario... Dueño de un comercio y Empleado de otro" (punto 1) | `MatrizRolesService`: un Empleado nunca es Dueño ni Administrador | Ese caso no existe; sí existe Cliente + Empleado |
| C3 | Decisión 13: el Empleado suspendido "cuenta para el tope de empleados" | No hay tope de empleados (`DECISIONES.md:8757`, requisitos del Dueño y de alcance) | Nada que implementar; confirmar si se quiere un tope (fuera de la Fase 5) |
| C4 | Decisión 6: el Dueño suspendido suspende `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE`; los otros no cambian | `requisitos-funcionales-sistema.md:27`: "TODOS los comercios que administra a Suspendido" | Actualizar el requisito |
| C5 | Decisión opción C: `EN_PREPARACION` sigue su camino con tope de 90 min; `PENDIENTE_CONFIRMACION_COMERCIO` solo se rechaza o vence | `requisitos-funcionales-sistema.md:112-116` y `alcance-y-limitaciones.md:194-200`: cancelar ambos; `EN_CAMINO` pasa a `ENTREGADO` automático | Dos documentos describen un diseño anterior distinto del prompt y del código |
| C6 | Decisión 5: el carrito del Cliente suspendido se conserva | `AUDITORIA-ETAPA-FINAL.md`, punto 4: "carrito vaciado" | Documento viejo; no hay código que vacíe hoy |
| C7 | Decisión 9: el Dueño con comercio suspendido ve pedidos, estadísticas y documentos | `frontend/js/comercio-activo.js:72`: un comercio `SUSPENDIDO` no es "operativo" y el Dueño no entra al panel; `auth.js:149` muestra "no está operativo" | Trabajo de frontend grande (S2) |
| C8 | Decisión 11: los pedidos viejos siguen mostrando el nombre del comercio | `pedidos.js:283-300` lo resuelve con `GET /catalogo/comercios`, que excluye suspendidos | Sumar el nombre y la foto al DTO del pedido |
| C9 | Decisión 12: el email de cierre de turno de un comercio suspendido solo sale si hubo "pedidos terminados, cobros o reembolsos" | `CierreTurnoEnvioService`: sale si hubo pedidos o pendientes y la cuenta del Dueño está `ACTIVO` (`:94`) | Definición distinta; con la cuenta del Dueño suspendida el email se omite siempre |
| C10 | Decisión 9: el equipo queda en solo lectura | Aceptar una invitación ya enviada sigue permitido con comercio `SUSPENDIDO` (`InvitacionEmpleadoService.java:126`); desactivar y cancelar invitaciones no están bloqueados | Pregunta 12 |
| C11 | El prompt: `T36/T26`, "se mantiene el timer existente de 90 minutos" | Solo T36 tiene emisor (T26 sin emisor); el timer se graba por pedido (`suspension_retiro_expira`) y propongo derivarlo del comercio | Decisión de diseño |
| C12 | Decisión Soporte: "Acceso: login (cuenta suspendida o bloqueada)... y enlace 'Ayuda y soporte' en el pie de la app" | No hay pie de página; la navegación es una barra inferior | Pregunta 3 |
| C13 | Prompt: "según un documento viejo no existía `Reclamo` ni `Soporte`" | Existen las **tablas** `reclamo`, `soporte` e `historial_estado_usuario` (`V1`), sin entidad ni código | Aprovechar `reclamo` e `historial_estado_usuario`; `soporte` no sirve |
| C14 | Decisión 7: "No se puede levantar individualmente un comercio suspendido por el Dueño" | No existe el origen en ninguna parte | Es parte de S2 |
| C15 | `AUDITORIA-ETAPA-FINAL.md` propone para Reclamos resolver con el orden pedido -> pago -> nota -> reclamo | Interbloquea con un segundo insert del mismo reclamo (14.2 punto 5) | Cambiar el orden |
| C16 | Decisión 10 (T16 al Dueño con email) y decisión 4 (suspendido sin sesión) | El Dueño o el Cliente suspendidos **no pueden ver el aviso dentro de la app**; el email es el único canal real | Reforzar el rastro y el reintento del email de suspensión |

---

## Preguntas abiertas

Cada una con mi recomendación y los escenarios que la hacen necesaria. No decido por Diego.

1. **Motivo al rechazar un reclamo: ¿obligatorio?** Recomiendo obligatorio, entre 10 y 500 caracteres: el Cliente no puede responder (decisión) y sin mensaje no hay forma de entender el rechazo. El esquema (`nota_resolucion varchar(500)`) ya lo admite. Escenario: Cliente de buena fe con reclamo rechazado sin explicación.
2. **Retención de tickets y mensajes (¿se borran?).** Recomiendo conservar los tickets `CERRADO` 12 meses y después anonimizar el email y borrar los textos con un job aparte (los datos personales sin un fin ya cumplido es un riesgo de Ley 25.326 que no analicé). Si no se quiere ahora, anotar el límite en `alcance-y-limitaciones.md`. Para reclamos: las fotos "no se borran" (decisión), así que conviene fijar un tope por reclamo y un criterio de purga. Escenario: crecimiento de la base y de los respaldos (fotos de 5 MB).
3. **Texto y lugar del botón "Ayuda y soporte".** "Ayuda y soporte" está bien como texto. Como no hay pie de página, recomiendo una fila "Ayuda y soporte" en el perfil de cada rol, el enlace en `login.html` y en las pantallas de estado, y el botón de la pantalla de cuenta suspendida. Escenario: pantalla del Cliente sin sesión (solo el login).
4. **Orden del login para los otros estados.** Recomiendo mover **solo** `SUSPENDIDO` después de la contraseña y dejar `BLOQUEADO`, `INACTIVO` y `PENDIENTE` como hoy (su estado ya se filtra sin contraseña: H3). Si se esconden también, el usuario bloqueado que olvidó su contraseña nunca vería el camino de recuperación. Alternativa: moverlos y mostrar en el mensaje genérico un enlace "¿Olvidaste tu contraseña?" siempre.
5. **Estado al levantar una suspensión sobre una cuenta que estaba `BLOQUEADO`.** Recomiendo volver a `ACTIVO` con `intentos_fallidos = 0` (el Administrador revisó el caso; el bloqueo por intentos no tiene valor tras la suspensión). La alternativa (restaurar `BLOQUEADO`) exige leer el estado previo del historial y complica el Dueño (sus comercios quedarían `CERRADO_TEMPORALMENTE`).
6. **`confirmarRecuperacionPassword` con la cuenta `SUSPENDIDO`.** Recomiendo cambiar la contraseña y **no** tocar el estado ni restaurar comercios. Tiene que quedar fijado antes de implementar S1 (H1).
7. **Pago aprobado tardío sobre un pedido cancelado (caso general).** Recomiendo reembolsar siempre, no solo en la suspensión: hoy la plata queda retenida (H4). Escenario: pedido `PENDIENTE_PAGO` vencido a los 30 minutos y pago confirmado a los 35.
8. **Suspensión individual sobre un comercio ya suspendido por el Dueño: ¿se conserva `suspendido_desde`?** Recomiendo conservar la fecha original (los topes de 90 minutos no se extienden) y cambiar origen y motivo. Escenario: Dueño suspendido a las 10:00, comercio suspendido a mano a las 11:00, pedidos `EN_PREPARACION` desde las 10:30.
9. **Tope de 90 minutos y un pedido despachado a `LISTO_PARA_RETIRAR` tarde.** Con el cálculo desde la suspensión, uno despachado en el minuto 80 se cierra `NO_RETIRADO` a los 10 minutos. Recomiendo aceptarlo y mostrarle al equipo "el comercio se cierra en N min" (visibilidad del estado). Alternativa: 90 minutos desde `LISTO_PARA_RETIRAR`, que exige una fecha por pedido.
10. **`PENDIENTE_PAGO` de un comercio que se suspende.** La decisión no lo cancela al suspender. ¿Se bloquea además crear o reusar la preferencia de pago (`POST /pedidos/cliente/{id}/pago`) y "Ir a pagar"? Recomiendo bloquear con "comercio no disponible": hoy el Cliente podría pagar un pedido que se va a cancelar y reembolsar. Escenario: Cliente abre el checkout de Mercado Pago un minuto antes de la suspensión.
11. **Qué puede hacer el Dueño en el panel con el comercio suspendido** (decisión 9): ¿entra por el selector y ve el mismo panel en lectura con un banner y el botón de Soporte, o una pantalla propia con accesos a pedidos, estadísticas y documentos? Recomiendo el mismo panel con el aviso fijo y los botones de edición ocultos con la misma condición central que usa el Empleado (`contextoPuedeEditarCatalogo`).
12. **Aceptar una invitación enviada con el comercio suspendido.** Recomiendo bloquearla (`409`, texto neutro): si no, el equipo crece con el comercio suspendido, contra "equipo en solo lectura".
13. **Email de cierre de turno de comercio suspendido.** Aclarar "movimiento": ¿pedidos que llegaron pagados, terminados, reembolsos? Hoy la regla de aviso (`pedidos o pendientes`) no coincide exactamente. Recomiendo: enviar si hubo pedidos terminados, cobros o reembolsos en el turno, tal como dice la decisión, y definirlo en el builder.
14. **Empleado con cuenta suspendida: ¿aviso al Dueño?** La decisión no lo dice. Recomiendo un aviso discreto al Dueño ("{Nombre} tiene la cuenta suspendida") para que no espere atención de esa persona; sin motivo. Escenario: Empleado único de un comercio.
15. **Al levantar un comercio: `puedeSeguir` o `puedeEntrar`.** Recomiendo `puedeSeguir` (§4).
16. **Tabla `soporte` vieja.** Recomiendo dejarla sin usar en `V46` y eliminarla en una migración posterior confirmada por Diego (está vacía). Alternativa: reutilizarla con `ALTER` (arrastra `resolucion` y `mensaje_descargo`, que ya no encajan).
17. **Límite por IP de Soporte (3 por día y 3 abiertos).** CGNAT de redes móviles: varios usuarios legítimos comparten IP. Recomiendo por IP un tope mayor (10 por día) o solo un tope de ritmo (el existente por minuto) y dejar el estricto de 3 solo por email. También decidir si se quiere la tabla `soporte_limite` (exacta) o contar tickets (admite una carrera de pocos).
18. **Acción sobre un ticket de apelación cuando la suspensión ya se levantó por otro camino.** El ticket queda abierto (decisión). ¿El botón "Levantar suspensión" del ticket queda oculto o deshabilitado con el texto "ya no está suspendido"? Recomiendo deshabilitado con explicación.
19. **Reclamos: ¿plazo en días corridos o hábiles?** Recomiendo corridos (7 × 24 h desde la fila del historial, con el reloj único `Clock`); el prompt dice "7 días". Escenario: pedido entregado el viernes.
20. **Reclamo sobre `NO_RETIRADO` aprobado.** La decisión de A4b fue "sin devolución"; el reclamo la revierte. Documentarlo y ajustar el texto de T36 para mencionar que se puede reclamar si sí se fue.
21. **Historial de usuario: ¿se registran también las transiciones automáticas (bloqueo por intentos, restauración, reactivación)?** Recomiendo sí, con `administrador_id` nulo: hoy no hay rastro de ellas y son útiles para auditar quién desbloqueó qué.
22. **Aviso a los Empleados al levantar la suspensión de un comercio y avisos al Cliente suspendido.** Si se suspende un Cliente que es Empleado, ¿el Dueño de un comercio donde trabaja se entera por el aviso del punto 14?
23. **Tope de 20 mensajes por ticket.** ¿Qué ve el usuario al llegar al tope? Recomiendo un mensaje fijo ("Este caso llegó al máximo de mensajes. Esperá que lo cierre el equipo y abrí uno nuevo") y que el Administrador pueda cerrar.
24. **Validación de motivos:** 10 a 500 caracteres para suspender; para levantar, opcional hasta 500. ¿El motivo de la suspensión se muestra sin editar al Dueño (incluye datos que el Administrador no quiera exponer)? Recomiendo una advertencia en el modal: "El motivo lo va a ver la persona suspendida".

---

## Propuesta de tramos (a validar)

Cada tramo: entrega A (backend y tests: `mvnw`, Newman, Playwright de API, estrés donde haya locks, mutaciones), entrega B (pantallas y tests de UI), y cierre (revisión de checklist, documentos, `CLAUDE.md`). Tamaño relativo: chica, mediana, pesada. Sin estimar tiempos.

| Tramo | Contenido | Entrega A | Entrega B | Depende de |
|---|---|---|---|---|
| **S1. Cuentas y Cliente (4c)** | `V44`; arreglar H1; suspender/levantar Cliente (`PUT /administrador/clientes/{id}/suspender` y `/levantar-suspension`); entidad `HistorialEstadoUsuario`; guard "cuenta activa" dentro de las transacciones; login nuevo y `401` con código; cancelar `PENDIENTE_PAGO`; pago en vuelo con reembolso (reordenar el camino del webhook); avisos T28/T29 y emails; tope de 90 min no (es S2) | **Pesada** (reordenar el pago, el guard transversal, estrés nuevo con mutaciones) | **Mediana** (login, `cuenta-suspendida.html`, botones del listado de Clientes con el modal generalizado) | Nada |
| **S2. Comercio (4a y 4b)** | `V45`; levantar suspensión con `SUSPENSION_LEVANTADA`; origen y motivo; opción C (quitar la cascada, job de tope de 90 min, job 4 con la fecha del comercio); guard del Dueño; bloquear desvincular Mercado Pago, aceptar invitaciones y equipo solo lectura; `comercioNombre` en el pedido; avisos T16/T29 + equipo + email | **Pesada** (la matriz de efectos, reescribir tests del orden de pedidos, estrés de escenarios 1 a 5 y 15 a 16) | **Pesada** (rehacer la selección del comercio activo del Dueño para suspendidos, banners, modales de levantar y de origen, spec nuevo) | S1 (guard de cuenta y avisos por email comparten infraestructura) |
| **S3. Dueño y Empleado (4d y 4e)** | Suspender/levantar Dueño (cascada de comercios por origen, no aprobar mientras esté suspendido); listado de Dueños para el Administrador; "Cuenta suspendida" en el equipo; excluir del fan-out de avisos; aviso al Dueño por Empleado suspendido (si se confirma) | **Mediana** | **Mediana** | S1 y S2 |
| **S4. Soporte** | `V46`; formulario público, consulta, conversación por turnos, límites, honeypot, código; bandeja y detalle del Administrador; botón "Levantar suspensión" del ticket; emails con reintentos; contador T22; enlaces de "Ayuda y soporte" | **Mediana-pesada** (tablas, límites sin sesión, emails con rastro, protección contra enumeración, estrés de límites) | **Mediana-pesada** (tres vistas públicas, bandeja, detalle, spec de privacidad) | S1 a S3 solo para el botón de levantar; puede salir antes sin ese botón |
| **S5. Reclamos** | `V47`; creación con fotos y plazo, bandeja y resolución con reembolso total o parcial, `MercadoPagoReembolsoClient` parcial, motivo `RECLAMO`, avisos T19–T21 y al Dueño | **Pesada** (fotos, reembolso parcial sin sandbox validado, orden de locks nuevo) | **Mediana** (formulario con fotos y vista de respuesta, bandeja con visor) | S1 (Cliente suspendido no reclama); la infraestructura de reembolsos ya existe |

Dependencias: S1 -> S2 -> S3 en cadena corta; S4 y S5 son independientes entre sí; S5 solo necesita S1 para el chequeo de cuenta; S4 gana un botón al terminar S3.

**Partes desproporcionadas para su valor (para que Diego decida si recorta):**
1. **Fotos de reclamos** (hasta 3 de 5 MB en `LONGBLOB` sin borrado): es lo más caro de S5 (tablas, límites de multipart y de `max_allowed_packet`, visor, crecimiento de la base) para un solo Administrador que resuelve caso por caso. Alternativa: reclamos solo con texto en esta fase y fotos como mejora posterior.
2. **Límite de Soporte por IP y por email con tabla propia, honeypot y 20 mensajes**: con un único Administrador y tráfico bajo alcanza con el límite por email en una consulta y el límite por minuto por IP que ya existe; la tabla `soporte_limite` es lo que más agrega.
3. **Interfaz del Dueño para el comercio suspendido** (S2 B): hay que rehacer la selección del comercio activo y los guards del panel; si se recorta, una pantalla de lectura mínima (aviso, motivo, lista de pedidos activos y botón de Soporte) cubre la necesidad de atender los pedidos.
4. **Listado de Dueños** (S3 B): hoy no existe; se puede reemplazar por la acción "Suspender al Dueño" dentro del modal del comercio.
5. **Reembolso parcial** (S5): lo más riesgoso técnicamente porque depende de cómo Mercado Pago reparte el reembolso con `marketplace_fee`, sin validar en sandbox; si se quiere acotar, solo reembolso total en la primera versión.

---

## Propuesta de esquema, agrupada por tramo (índice)

| Tramo | Migración | Tablas y columnas | Sección |
|---|---|---|---|
| S1 | `V44` | `usuario.motivo_suspension`, `usuario.suspendido_desde` + `CHECK`; `historial_estado_usuario.administrador_id`; `sesion.tipo_cierre` + `SUSPENSION`; `nota_credito.motivo` + `SUSPENSION_CLIENTE`, `RECLAMO`; `historial_estado_pedido.motivo_timeout` + `TIMEOUT_PREPARACION_SUSPENSION`, `SUSPENSION_CLIENTE`; `notificacion.tipo` + tres tipos | 2.1 |
| S2 | `V45` | `comercio.suspension_origen`, `suspendido_desde`, `motivo_suspension` + `CHECK` + índice; `historial_estado_comercio.suspension_origen` (opcional) | 2.2 |
| S3 | (sin migración propia) | Usa lo de S1 y S2 | 2.1, 2.2 |
| S4 | `V46` | `ticket_soporte`, `ticket_soporte_mensaje`, `soporte_limite` (la tabla `soporte` vieja queda sin uso) | 2.3 |
| S5 | `V47` | `reclamo` ampliada (`motivo`, `monto_reembolsado`, `nota_credito_id`, `descripcion varchar(1000)`), `reclamo_foto`, `reclamo_foto_archivo` | 2.4 |

Todo lo anterior es propuesta: ningún campo ni tabla existe hasta que Diego lo valide.

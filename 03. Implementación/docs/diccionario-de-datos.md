# Diccionario de Datos — Bajoneá

**Proyecto:** Bajoneá — Plataforma de pedidos gastronómicos en línea  
**Motor de base de datos:** MySQL (InnoDB)  
**ORM / Migraciones:** Spring Data JPA + Hibernate / Flyway  
**Versión del modelo:** 1.30
**Cambios de la v1.30 (Fase 5, tramo S2, suspensión individual de un comercio, migración `V45`, 2026-10-29):** `Comercio` suma `suspension_origen` (`ENUM('INDIVIDUAL','DUENO') NULL`), `suspendido_desde` (`DATETIME NULL`) y `motivo_suspension` (`VARCHAR(500) NULL`) con el `CHECK ck_comercio_suspension` (las tres completas si y solo si `estado = 'SUSPENDIDO'`, `NULL` en cualquier otro estado) y el índice `idx_comercio_suspension (dueno_id, estado, suspension_origen)`; `HistorialEstadoComercio` suma `suspension_origen` (`ENUM NULL`, el origen de la suspensión a la que se refiere la fila). La migración completa los comercios que ya estaban `SUSPENDIDO` (origen `INDIVIDUAL`, fecha y motivo tomados de su última fila de historial hacia `SUSPENDIDO`) y marca `INDIVIDUAL` las filas de historial que ya llevaban a `SUSPENDIDO`. `historial_estado_pedido.motivo_timeout` suma `TIMEOUT_PREPARACION_SUSPENSION`, `nota_credito.motivo` suma `PAGO_TARDIO` y `notificacion.tipo` suma `COMERCIO_SUSPENDIDO_EQUIPO` y `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` (los tres al final del ENUM, cambio de metadatos). `Pedido.suspension_retiro_expira` queda sin uso: la columna sigue en la base pero ninguna entidad ni proceso la lee ni la escribe. Cambios de comportamiento: suspender un comercio ya no toca ningún pedido; los dos topes de 90 minutos (preparación y retiro) se calculan desde `Comercio.suspendido_desde`; el Dueño y el equipo quedan en solo lectura mientras dure la suspensión; ver "Suspensión de un comercio (v1.30)" más abajo.
**Cambios de la v1.29 (Fase 5, tramo S1, suspensión de cuentas del Cliente, migración `V44`, 2026-10-27):** `Usuario` suma `motivo_suspension` (`VARCHAR(500) NULL`) y `suspendido_desde` (`DATETIME NULL`) con el `CHECK ck_usuario_suspension`: las dos columnas están completas si y solo si `estado = 'SUSPENDIDO'` y son `NULL` en cualquier otro estado (el historial conserva todo el rastro; estas dos columnas son la foto vigente que lee el login y el filtro JWT sin un join). `HistorialEstadoUsuario` (ya existía en el baseline, sin entidad) suma `administrador_id` (`INT NULL`, `FOREIGN KEY` a `Usuario.id`, `NULL` cuando el cambio lo hace el sistema) y empieza a usarse: **todo** cambio de `usuario.estado` (suspensión, levantamiento, bloqueo por intentos, desbloqueo por recuperación de contraseña, verificación de email y reactivación) pasa por un único método (`EstadoUsuarioService.cambiar`) que cambia el estado y escribe la fila en la misma transacción. `sesion.tipo_cierre` suma `SUSPENSION` (cierre de la sesión por la suspensión; el filtro JWT lo distingue de cualquier otro cierre para mostrar el motivo). `nota_credito.motivo` suma `SUSPENSION_CLIENTE` (devolución de un pago que llegó cuando la cuenta del Cliente estaba suspendida) y `RECLAMO` (reservado para el tramo S5, sin emisor todavía). `historial_estado_pedido.motivo_timeout` suma `SUSPENSION_CLIENTE` (pedido sin pagar cancelado por la suspensión). Los cuatro ENUM suman el valor al final (cambio de metadatos, como `V34` y `V35`). Sin tablas nuevas. `notificacion.tipo` no cambia: `CLIENTE_SUSPENDIDO` (T28) y `SUSPENSION_LEVANTADA` (T29) existían sin emisor y ahora tienen uno. Cambios de comportamiento sin esquema: solo el Administrador suspende y levanta (a un Cliente; un Dueño todavía no, un Administrador nunca); recuperar la contraseña y verificar el email ya no pueden levantar una suspensión; el login revela la suspensión (con el motivo) solo después de comprobar la contraseña; un pago aprobado que llega sobre un pedido ya cancelado se reembolsa siempre.  
**Cambios de la v1.28 (Fase 4, documentos del comercio y nueva regla de `APTO_VENTA`, migración `V43`, 2026-10-26):** tablas nuevas `DocumentoComercio` (`documento_comercio`: metadatos de cada documento de habilitación de un comercio, con tipo, estado, motivo de rechazo y quién y cuándo lo resolvió) y `DocumentoComercioArchivo` (`documento_comercio_archivo`: el contenido binario, `LONGBLOB`, en tabla aparte para que ningún listado lo lea). Enums nuevos `TipoDocumentoComercio` (`LIBRETA_SANITARIA`, `CARNET_MANIPULACION_ALIMENTOS`, `HABILITACION_COMERCIAL`, `OTRO`; ampliable agregando valores al final) y `EstadoDocumentoComercio` (`PENDIENTE`, `APROBADO`, `RECHAZADO`). `notificacion.tipo` suma `DOCUMENTO_APROBADO`, `DOCUMENTO_RECHAZADO`, `COMERCIO_APTO_VENTA` y `COMERCIO_SIN_APTITUD` (cambio de metadatos como `V34` y `V35`; audiencia `DUENO` los cuatro). `V43` no modifica el estado de ningún comercio. Cambia la regla de `EstadoComercio.APTO_VENTA`, que ahora decide un único servicio (`AptitudVentaComercioService`): para entrar hacen falta cuenta de MercadoPago activa, al menos un documento `APROBADO` y ningún documento `PENDIENTE`; para seguir vendiendo, cuenta activa y al menos un `APROBADO`; con la cuenta del Dueno `BLOQUEADO` nada queda a la venta. La exigencia de documentos se apaga con `comercio.documentacion.requerida=false` (por defecto `true`; `false` en el perfil `test`): apagada, solo cuenta MercadoPago, como antes de esta versión. Los documentos son privados del comercio: los ve y los sube solo el Dueno y los revisa el Administrador; el Empleado no tiene acceso. Límites por propiedad: 8 MB por archivo, 5 documentos en revisión a la vez y 20 en total por comercio (los rechazados cuentan). Formatos PDF, JPG, PNG y WebP, validados por la firma de bytes. Un `RECHAZADO` no se vuelve a resolver; el Dueno solo elimina un documento propio que sigue `PENDIENTE`.  
**Cambios de la v1.27 (Fase 3, direcciones múltiples del Cliente, migración `V42`, 2026-10-24):** `Direccion` suma `nombre` (`VARCHAR(40) NULL`, alias privado del Cliente, repetible entre direcciones) y `referencia` (`VARCHAR(150) NULL`, indicación de entrega), la columna generada `principal_activa_cliente_id` (`STORED`: vale `cliente_id` si `principal = 1` y `eliminada = 0`, si no `NULL`) con el índice único `uq_direccion_principal_cliente` (garantiza en base una sola predeterminada activa por Cliente; no la mapea la entidad JPA) y el índice `idx_direccion_cliente_activa (cliente_id, eliminada)`. `Pedido` suma la copia de la dirección de entrega: `entrega_calle`, `entrega_numero`, `entrega_piso_depto`, `entrega_codigo_postal`, `entrega_localidad_id` (sin `FOREIGN KEY` a propósito) y `entrega_referencia`, todas `NULL`; `direccion_id` se conserva como origen de la copia y las respuestas de pedido leen siempre la copia, nunca la dirección viva. El alias no se copia al pedido. Un pedido `RETIRO` no tiene copia. La migración deja una predeterminada por Cliente que no la tuviera (la de mayor `id`) y copia la dirección a los pedidos `DOMICILIO` existentes; los valores previos a una edición posterior de la dirección no se pueden reconstruir, así que esos pedidos quedan con los valores actuales. Reglas de la API (sin esquema): hasta 5 direcciones activas por Cliente (`409 DIRECCIONES_CUPO_MAXIMO`), la primera queda predeterminada, la última activa no se puede eliminar (`409 ULTIMA_DIRECCION`), eliminar la predeterminada promueve la más reciente, y al crear o editar la localidad tiene que ser Río Grande, Ushuaia o Tolhuin (las direcciones viejas fuera de esas tres se siguen leyendo y sirven para pedir).  
**Cambios de la v1.26 (Fase 2, tramo T4, migración `V41`, 2026-10-22):** tabla nueva `CierreTurno` (`cierre_turno`): una fila por turno terminado de un comercio, con la foto de sus cifras (`cantidad_pedidos`, `vendido`, `comision`, `neto`, `pendientes_al_cierre`) y el estado del email de resumen que se le manda al Dueño (`email_estado`, `email_intentos`, `email_proximo_intento`, `email_envio_iniciado`, `email_fecha_envio`, `email_ultimo_error`). Enum nuevo `EstadoEmailCierreTurno`. `UNIQUE (comercio_id, turno_fecha, horario_id)`; `horario_id` es una `FOREIGN KEY` a `Horario.id` sin cascada (un turno cerrado conserva su versión de horario). No cambia ninguna otra tabla.  
**Cambios de la v1.25 (Fase 2, tramo T3, migración `V40`, 2026-10-22):** `ItemCarrito` suma `precio_visto` (`DECIMAL(10,2) NULL`): el precio vigente del producto en el momento en que el ítem se insertó en el carrito. Se estampa solo al insertar (sumar o cambiar la cantidad no lo toca); si el precio vigente del producto es distinto, el carrito marca el ítem con `precioCambio` y el cliente ve el aviso. Los ítems anteriores a `V40` quedan con `NULL` y nunca avisan. Sin índices ni claves nuevas. Además hay cambios de comportamiento sin esquema: el precio de un producto no se puede cambiar mientras el comercio está dentro de una franja de `Horario` (`409` `PRECIO_BLOQUEADO_EN_FRANJA`, propiedad `precio.bloqueo-en-franja.habilitado`), y `POST /pedidos/cliente` acepta un `totalEsperado` opcional y responde `409` `PRECIO_CAMBIO` si no coincide con el total que se cobraría.  
**Cambios de la v1.24 (Fase 2, tramo T2, migración `V39`, 2026-10-20):** `Pedido` suma `fecha_pago_confirmado` (`DATETIME NULL`), `turno_fecha` (`DATE NULL`) y `turno_horario_id` (`INT NULL`, `FOREIGN KEY fk_pedido_turno_horario` a `Horario.id` sin cascada), con los índices `idx_pedido_turno (comercio_id, turno_fecha, turno_horario_id)`, `idx_pedido_fecha_pago (comercio_id, fecha_pago_confirmado)` e `idx_pedido_turno_horario (turno_horario_id)`. El turno de un pedido se asigna al confirmarse el pago, con el mismo instante que la fila `PENDIENTE_CONFIRMACION_COMERCIO` del historial: es el turno en el que cayó el pago (`turno_fecha` es la fecha de apertura del turno, así que un pago de madrugada va al turno del día anterior) y, si cayó fuera de toda franja, el último turno terminado dentro de los 7 días anteriores; queda `NULL` si el comercio no tenía ninguna franja vigente. Los pedidos anteriores a la migración reciben `fecha_pago_confirmado` desde el historial en la propia migración y `turno_*` por un proceso de aplicación que corre una vez al arrancar (`turno.backfill.habilitado`). El panel del comercio deja de contar "hoy" y pasa a contar por turno (`GET /api/v1/pedidos/comercio/resumen-turno`, que reemplaza a `resumen-hoy`).  
**Cambios de la v1.23 (Fase 2, tramo T1, migración `V38`, 2026-10-19):** `Horario` suma `vigente_desde` (`DATE NOT NULL DEFAULT '2000-01-01'`) y `vigente_hasta` (`DATE NULL`, inclusivo) con el índice `idx_horario_comercio_vigencia (comercio_id, vigente_desde, vigente_hasta)` (reemplaza a `idx_horario_comercio`) y el `CHECK chk_horario_vigencia`. Una fila es un turno: su día es el de apertura y cruza la medianoche cuando `hora_cierre < hora_apertura`; `cierre = apertura` no se permite. La edición de horarios de un comercio aprobado es versionada: cierra lo vigente con `vigente_hasta = hoy` e inserta lo nuevo con `vigente_desde = mañana`. `HistorialEdicionComercio` empieza a registrar `HORARIO` (acción `EDITAR`).  
**Cambios de la v1.22 (Tramo 2 de registro de Comercio, migración `V37`, 2026-10-19):** el nombre de un comercio es único en toda la plataforma. `Comercio` suma la columna generada `nombre_unico` (`STORED`, `utf8mb4_unicode_ci`) con el índice único `uq_comercio_nombre_unico`; la entidad JPA no la mapea. Se elimina la regla anterior de duplicado por nombre, dirección y piso.  
**Cambios de la v1.21 (Tramo 1 de registro de Comercio, migración `V36`, 2026-10-18):** `PersonaJuridica.razon_social`, `condicion_iva`, `tipo_sociedad` y `fecha_inicio_actividades` pasan a ser opcionales (`NULL`); `cuit` y `domicilio_fiscal` siguen obligatorios, igual que los datos del representante. `Comercio.email` pasa a `NULL`: el email de contacto del comercio ya no se pide ni se muestra en el registro, el alta adicional, la corrección ni el perfil (los comercios ya registrados conservan el valor y solo lo ve el Administrador, de solo lectura). Las filas existentes no se tocan. La localidad Tolhuin (`94011010`, id oficial de Georef) se inserta por la migración. La API de geografía ofrece solo Tierra del Fuego (`94`) con Río Grande (`94008010`), Tolhuin (`94011010`) y Ushuaia (`94015020`), definidas por la propiedad `geografia.localidades-habilitadas`; las demás filas de `Provincia` y `Localidad` se conservan, y las direcciones ya guardadas fuera de esa lista siguen leyéndose.  
**Cambios de la v1.20 (tramo E4, bloque A3, 2026-10-15):** cambio solo de comportamiento, sin esquema ni migración. La lista de actividad del comercio (`GET /api/v1/comercios/equipo/actividad`) suma una cuarta fuente, `EQUIPO` (último valor de `FuenteActividad`, así que los cursores anteriores siguen siendo válidos), que muestra las filas de `HistorialEmpleadoComercio`: `INVITACION` ("Invitó a {email}"), `INVITACION_CANCELADA` ("Canceló la invitación a {email}"), `ACEPTACION` ("Aceptó la invitación"), `BAJA_DUENO` ("Dio de baja a {Nombre Apellido}"), `RENUNCIA` ("Dejó de trabajar en el comercio") y `REACTIVACION` ("Reactivó a {Nombre Apellido}"); el actor es el Dueno si coincide con el Dueno del comercio, el Empleado si es cualquier otro usuario y el sistema (sin nombre ni usuario) si la fila no tiene actor; la entidad es el Empleado si la fila tiene relación y la invitación (su email) si no. Cuando alguien acepta una invitación estando inactivo se escriben las dos filas `ACEPTACION` y `REACTIVACION` (esta última con `invitacion_id`); la actividad muestra solo la `ACEPTACION`, para no repetir una misma acción. El parámetro `fuente` acepta `PEDIDO`, `EDICION`, `CIERRE` y `EQUIPO`. Sin filtro son cuatro consultas por página (una con filtro). Nuevos `GET /api/v1/administrador/comercios/{id}/equipo` (miembros con `estado`, `fechaBaja`, `motivoBaja` y `puedeReactivar`, más las invitaciones: la misma forma que ve el Dueno) y `GET /api/v1/administrador/comercios/{id}/actividad` (con `limite`, `cursor` y `fuente`), solo lectura, solo `ADMINISTRADOR`, para un comercio en cualquier estado, sin `X-Comercio-Id` y sin bloqueos; un comercio inexistente responde `404` "Comercio no encontrado". Cada invitación del listado del equipo trae `diasRestantes`, calculado por el servidor con la hora y la zona de la aplicación: solo en una invitación `PENDIENTE` vigente, los días que faltan para `fecha_vencimiento` redondeados hacia arriba con un mínimo de 1 (nulo en el resto). Sin tablas ni columnas nuevas.  
**Cambios de la v1.19 (tramo E4, bloque A2, 2026-10-15):** cambio solo de comportamiento, sin esquema ni migración. El propio Empleado puede dejar un comercio (`PUT /api/v1/empleados/comercios/{comercioId}/renunciar`, solo rol `CLIENTE`, sin `X-Comercio-Id`): la relación pasa a `INACTIVO` con `fecha_baja`, se escribe la fila `RENUNCIA` de `HistorialEmpleadoComercio` (origen `ACTIVO`, destino `INACTIVO`, actor = el Empleado, sin `invitacion_id`), se borran sus avisos de ese comercio y el Dueno recibe el aviso T34 (`EMPLEADO_DESACTIVADO`, con `comercio_id`, `entidad_tipo = COMERCIO`: "{Nombre Apellido} dejó de trabajar en {Comercio}.", texto provisorio). Es idempotente (repetirla, o renunciar a una relación que el Dueno ya dio de baja, responde `200` sin escribir nada) y funciona con el comercio en cualquier estado. Sin relación con ese comercio (o con un comercio que no existe) responde el mismo `404` `COMERCIO_NO_DISPONIBLE` que el resolver de comercio activo. Nuevo `GET /api/v1/empleados/comercios/{comercioId}/acceso` (solo `CLIENTE`, solo lectura): informa la relación propia (`estado`, `motivoBaja` derivado de la última baja del historial, `comercioAccesible`) para que el frontend sepa por qué se perdió el acceso sin tocar el `404` idéntico. Sin tablas ni columnas nuevas.  
**Cambios de la v1.18 (tramo E4, bloque A1, 2026-10-14):** nuevo tipo de aviso `EMPLEADO_REACTIVADO` (T37), por la migración `V35`, que agrega el valor al final del ENUM `notificacion.tipo` (cambio de metadatos, sin tocar filas); audiencia `CLIENTE_O_DUENO`, igual que `EMPLEADO_DESACTIVADO` (T32): va a la persona reactivada como aviso personal (sin `comercio_id`). El Dueno ya puede dar de baja y reactivar directamente a un miembro del equipo (`PUT /api/v1/comercios/equipo/miembros/{empleadoId}/desactivar` y `/reactivar`): escriben las filas `BAJA_DUENO` y `REACTIVACION` de `HistorialEmpleadoComercio` (la reactivación directa no lleva `invitacion_id`, a diferencia de la que produce aceptar una invitación). El listado del equipo (`MiembroEquipoResponseDTO`) suma `motivoBaja` y `puedeReactivar`, que no son columnas: se calculan de la última fila de baja del historial. Sin tablas ni columnas nuevas.  
**Cambios de la v1.17 (tramo E3, entrega B, etapa 4, 2026-10-14):** cambio solo de documentación, sin esquema ni migración. Se corrige la regla de negocio de `HistorialEdicionComercio` sobre qué entra en la lista de actividad (`GET /api/v1/comercios/equipo/actividad`), que decía "solo las filas de los actores Dueno y Empleado" de `HistorialEstadoPedido` y quedó desactualizada desde el bloque A2b, y se anota el parámetro opcional `fuente` (`PEDIDO`, `EDICION` o `CIERRE`) que agrega la etapa 4.  
**Cambios de la v1.16 (tramo E3, bloque A6, 2026-10-14):** cambio solo de documentación, sin esquema ni migración. El aviso `PEDIDO_AUTOCONFIRMADO_COMERCIO` (T30), que ya figuraba en el ENUM de `notificacion.tipo` desde `V1` pero no se emitía a nadie, pasa a emitirse: cuando el proceso automático autoconfirma la entrega de un pedido a domicilio `EN_CAMINO` (`motivo_timeout = TIMEOUT_ENTREGA`, actor `SISTEMA`), escribe en la misma transacción una copia para el Dueno y para cada Empleado `ACTIVO` del comercio (sin el Cliente del pedido si es Empleado del comercio), con `comercio_id`, `entidad_tipo = PEDIDO` y el texto "El pedido #N se confirmó automáticamente como entregado porque el cliente no respondió en M minutos." (M sale de `pedido.timeout.autoconfirmacion-en-camino-minutos`, 90 por defecto). El aviso al Cliente (T8) no cambia.  
**Cambios de la v1.15 (tramo E3, bloque A4b, 2026-10-14):** nuevo estado de pedido `NO_RETIRADO` y nuevo tipo de aviso `PEDIDO_NO_RETIRADO` (T36), ambos por la migración `V34`, que agrega el valor al final de los ENUM `pedido.estado`, `historial_estado_pedido.estado` y `notificacion.tipo` (cambio de metadatos, sin tocar filas). El estado lo alcanza el cierre manual del Dueño o de un Empleado (`PUT /api/v1/pedidos/comercio/{id}/no-retirado`, con una espera mínima de 60 minutos configurable en `pedido.timeout.no-retirado-espera-minutos`) y el proceso automático del comercio suspendido, que antes marcaba `ENTREGADO` y ahora marca `NO_RETIRADO` (motivo `TIMEOUT_RETIRO_SUSPENSION` conservado). `ENTREGADO` queda reservado para entregas reales. `FuenteEntrega.COMERCIO_SIN_RETIRO` sale del enum Java y queda en el ENUM físico de `pedido.fuente_entrega` como valor sin uso; `PEDIDO_CERRADO_TIMER_SUSPENSION` (T26) queda sin emisor y se conserva en el ENUM por las filas históricas.  
**Cambios de la v1.14 (tramo E3, bloque A4, 2026-10-13):** `Notificacion` suma la columna `comercio_id` (migración `V33`, sin clave foránea) con el índice `idx_notificacion_usuario_comercio`, y cada `TipoNotificacion` pasa a tener una audiencia fija (cliente, equipo del comercio, solo Dueno, cliente o Dueno, administrador). Los avisos operativos del comercio (T1, T9, T13 y, cuando se implemente, T30) se emiten ahora como una copia por destinatario —el Dueno y cada Empleado `ACTIVO`, sin el Cliente del pedido—, cada una con su propio estado de lectura; los de administración (T14, T15, T16, T33, T25, T29 y T34) siguen yendo solo al Dueno y llevan el comercio. El estado `NO_RETIRADO` y la notificación T36 pasan a la migración `V34`. Ver la tabla `Notificacion` (sección 6) y la nota debajo de la tabla de tipos.  
**Estado de la v1.12:** el modelo del rol Empleado decidido el 2026-10-05 (ver `docs/DECISIONES.md`) está **implementado en parte** (tramo E1, bloques A1 y A2, 2026-10-06): las migraciones `V29` (estado de la relación `ACTIVO`/`INACTIVO`), `V30` (`InvitacionEmpleado`) y `V31` (`HistorialEmpleadoComercio`) están aplicadas, con sus entidades, repositorios y los servicios de invitar, reenviar, cancelar y listar el equipo, pero todavía sin endpoints ni pantallas (bloques A3 a A5 y entrega B). `HistorialEdicionComercio` (`V32`, que reemplaza a la `ActividadComercio` propuesta antes; ver la tabla) está **implementada** desde el tramo E3, bloque A1 (2026-10-12): la tabla, su entidad y el registro de las escrituras del Dueño existen; el registro de las escrituras de un Empleado llega con los bloques A2 y A3. El estado `NO_RETIRADO` del pedido y la notificación T36 (migración `V34`, tramo E3, bloque A4b) siguen **planificados**. Los pasajes que describen lo que aún no existe están marcados como planificados.  

## 1. Tipos Enumerados (ENUMs)

---

### ENUM: RolUsuario

Define el rol funcional de un usuario dentro del sistema.

| Valor | Descripción |
|-------|-------------|
| `CLIENTE` | Usuario final que realiza pedidos. Asociado a `PersonaFisica` → `Cliente`. |
| `DUENO` | Titular de uno o varios comercios gastronómicos. Asociado a `PersonaFisica` y a `PersonaJuridica` mediante `Dueno`. |
| `EMPLEADO` | Operador delegado por un Dueno para gestionar uno o varios comercios. Asociado a `PersonaFisica` → `Empleado`, vinculado a comercios mediante `EmpleadoComercio`. **El valor existe en el ENUM de la base pero no se usa:** quien es Empleado conserva `Usuario.rol = CLIENTE` (no existe multirol físico; ver "Combinaciones de roles y contexto del Empleado" en la sección 12). |
| `ADMINISTRADOR` | Operador interno con acceso a la gestión global de la plataforma. Asociado a `PersonaFisica` → `Administrador`. |

---

### ENUM: EstadoUsuario

Ciclo de vida del usuario en el sistema.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Registrado pero con email aún sin verificar. No puede operar. |
| `ACTIVO` | Email verificado; puede operar con normalidad. |
| `BLOQUEADO` | Bloqueado tras 3 intentos fallidos de login o 3 intentos fallidos en el flujo de cambio de contraseña desde perfil. Desbloqueable exclusivamente mediante recuperación de contraseña por email. |
| `SUSPENDIDO` | Suspendido manualmente por el Administrador con motivo. Puede enviar mensaje de soporte para solicitar revisión. |
| `INACTIVO` | Inactivado automáticamente por el sistema tras 3 meses sin actividad (`fecha_ultimo_acceso`). Reactivable mediante token de reactivación. |

---

### ENUM: CondicionIva

Situación fiscal del titular del comercio ante la AFIP (Argentina).

| Valor | Descripción |
|-------|-------------|
| `RESPONSABLE_INSCRIPTO` | Inscripto en IVA; emite factura A o B con IVA discriminado. |
| `EXENTO` | Exento del pago del IVA por disposición legal. |
| `NO_INSCRIPTO` | No inscripto en el IVA. |
| `MONOTRIBUTO` | Adherido al régimen simplificado para pequeños contribuyentes. |
| `RESPONSABLE_NACIONAL` | Inscripción especial ante tributos nacionales (categoría residual). |

---

### ENUM: TipoPersonaJuridica

Formas jurídicas reconocidas en Argentina para la constitución de personas jurídicas con fines comerciales o cooperativos.

| Valor | Descripción |
|-------|-------------|
| `SA` | Sociedad Anónima |
| `SRL` | Sociedad de Responsabilidad Limitada |
| `SAS` | Sociedad por Acciones Simplificada (Ley 27.349) |
| `SC` | Sociedad Colectiva |
| `SCS` | Sociedad en Comandita Simple |
| `SCRL` | Sociedad Cooperativa de Responsabilidad Limitada |
| `SCSA` | Sociedad en Comandita por Acciones |
| `SCCS` | Sociedad en Comandita por Cuotas Sociales |
| `CC` | Cooperativa de Consumo |
| `CS` | Cooperativa de Servicios |
| `CCSA` | Cooperativa de Crédito Sociedad Anónima |
| `CA` | Cooperativa Agraria |
| `SP` | Sociedad de Participación |
| `ST` | Sociedad de Trabajadores |
| `ACP` | Asociación Civil con Personería Jurídica |
| `EMP` | Emprendedor / empresa en formación simplificada |
| `EU` | Empresa Unipersonal |
| `UTE` | Unión Transitoria de Empresas |

---

### ENUM: TipoComercio

Categoría de negocio del comercio dentro de la plataforma.

| Valor | Descripción |
|-------|-------------|
| `RESTAURANTE` | Establecimiento gastronómico formal con local físico. |
| `EMPRENDIMIENTO` | Negocio gastronómico informal o de pequeña escala (cocina emprendedora, delivery casero, etc.). |
| `ROTISERIA` | Comidas elaboradas y platos listos para llevar. |
| `HELADERIA` | Heladería. |
| `CAFETERIA` | Cafetería. |
| `PANADERIA` | Panadería. |
| `PIZZERIA` | Pizzería. |
| `PARRILLA` | Parrilla / asador. |
| `BAR` | Bar. |
| `KIOSCO` | Kiosco / almacén de cercanía. |
| `FOOD_TRUCK` | Food truck / gastronomía móvil. |
| `HAMBURGUESERIA` | Hamburguesería. Agregado por la migración `V20`. |
| `OTRO` | Categoría no contemplada en los valores anteriores. |

> Clasificación informativa y visual; todos los tipos de comercio tienen las mismas funcionalidades dentro de la plataforma. Campo candidato a usarse como filtro del catálogo público en una futura versión (no implementado en esta).

---

### ENUM: TipoRedSocial

Plataforma o canal de contacto asociado a un link de red social cargado por el comercio.

| Valor | Descripción |
|-------|-------------|
| `INSTAGRAM` | Perfil de Instagram. |
| `FACEBOOK` | Página de Facebook. |
| `TIKTOK` | Perfil de TikTok. |
| `WHATSAPP` | Enlace directo de WhatsApp (`wa.me`), distinto del campo `Comercio.telefono`. |
| `X` | Perfil de X (ex Twitter). |
| `SITIO_WEB` | Sitio web propio del comercio. |
| `OTRO` | Otro canal no contemplado en los valores anteriores. |

---

### ENUM: EstadoComercio

Ciclo de vida del comercio en la plataforma.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Solicitud de alta enviada; pendiente de revisión por el Administrador. No visible en el catálogo. |
| `APROBADO` | Aprobado por el Administrador. Todavía no es visible en el catálogo ni puede recibir pedidos: para eso tiene que cumplir los requisitos de `APTO_VENTA` (cuenta de MercadoPago vinculada y documentación aprobada, ver abajo). Un comercio que pierde la aptitud vuelve a este estado. |
| `RECHAZADO` | Solicitud rechazada por el Administrador con motivo. El Dueno puede corregir los datos del mismo comercio y volver a solicitar su aprobación (re-solicitud, hasta 3 veces por comercio: `comercio.resolicitudes.max`); la re-solicitud lo devuelve a `PENDIENTE`. |
| `SUSPENDIDO` | Suspendido por el Administrador (o, desde el tramo S3, por la suspensión del Dueño titular). Oculto del catálogo y sin pedidos nuevos; el Dueño entra a su panel en solo lectura. Se suspenden `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE`. Lleva siempre `suspension_origen`, `suspendido_desde` y `motivo_suspension`; ningún evento (documentos, Mercado Pago, cierre manual, restauración de la cuenta) lo saca de este estado: solo lo levanta el Administrador. Ver "Suspensión de un comercio (v1.30)". |
| `INACTIVO` | Inactivado por propagación desde el Dueno titular (3 meses sin actividad). Oculto del catálogo. |
| `CERRADO_TEMPORALMENTE` | Cerrado automáticamente por bloqueo del Dueno titular. Solo llegan a este estado los comercios que estaban en `APTO_VENTA`: un `APROBADO` (sin cuenta de cobro) y los demás estados no se tocan. Sigue visible en el catálogo con el indicador "Cerrado temporalmente", sin hora de reapertura y sin recibir pedidos. Se restaura al recuperar la contraseña: a `APTO_VENTA` si el Dueno sigue cumpliendo la regla de seguir vendiendo (cuenta de MercadoPago activa y al menos un documento aprobado, o solo la cuenta si la exigencia de documentos está apagada), o a `APROBADO` si no. Mientras dura el bloqueo ningún otro evento (documentos, MercadoPago) lo mueve. También es el destino de un comercio que, con la cuenta del Dueno `BLOQUEADO`, iba a quedar en `APTO_VENTA` (aprobación del Administrador con cuenta de cobro vinculada, o vinculación de MercadoPago sobre un `APROBADO`): ningún comercio queda a la venta con el Dueno bloqueado. |
| `RECHAZO_DEFINITIVO` | Estado terminal, sin salida desde la aplicación. Se llega desde `PENDIENTE` cuando el Administrador rechaza de forma definitiva (a pedido suyo, sobre el alta original o sobre una re-solicitud) o cuando rechaza una re-solicitud y el comercio ya usó todas las que tenía (`cantidad_resolicitudes >= comercio.resolicitudes.max`; lo decide el servidor). El Dueno no puede corregirlo ni volver a solicitarlo; reabrirlo es una operación manual sobre la base (estado a `RECHAZADO`, `cantidad_resolicitudes` en 2 y una fila de historial "reabierto manualmente"). No cuenta para la elegibilidad de agregar otros comercios, pero sí como duplicado. No es visible en el catálogo ni recibe pedidos, y no lo toca el bloqueo ni la suspensión de cuenta (migración `V24`). |
| `APTO_VENTA` | Aprobado, con la cuenta de MercadoPago del Dueno titular vinculada (`CuentaMercadoPago.activa = true`) y la documentación aprobada. Es el único estado en el que el comercio aparece en el catálogo público como abierto y puede recibir pedidos (migración `V12`). **Regla (v1.28, `AptitudVentaComercioService`, única fuente):** entrar desde `APROBADO` exige cuenta de MercadoPago activa, al menos un `DocumentoComercio` `APROBADO` (de cualquier tipo) y ningún documento `PENDIENTE`; seguir en `APTO_VENTA` exige cuenta activa y al menos un documento `APROBADO`, así que subir un documento nuevo (queda `PENDIENTE`) o que rechacen uno extra no corta las ventas. Se pierde (`APTO_VENTA → APROBADO`, con aviso `COMERCIO_SIN_APTITUD`) al desvincular MercadoPago, al revocarse el último documento aprobado o al eliminarse el respaldo. Con `comercio.documentacion.requerida=false` los documentos se ignoran y solo cuenta MercadoPago. Con la cuenta del Dueno `BLOQUEADO` ningún camino deja el comercio en `APTO_VENTA`: el que cumpliría queda en `CERRADO_TEMPORALMENTE`. Un comercio que pierde la aptitud desaparece del catálogo del Cliente, igual que al desvincular MercadoPago. |

> **Regla de visibilidad y venta (implementada):** el catálogo público (`GET /catalogo/comercios` y los productos de un comercio) lista los comercios con `estado = APTO_VENTA` o `CERRADO_TEMPORALMENTE`, y un pedido solo se acepta si el comercio está en `APTO_VENTA`, no está cerrado manualmente (`cerrado_manualmente = false`) y la hora actual está dentro de alguna franja de `Horario` (`ComercioService.validarAceptaPedidos`, en este orden: `CERRADO_TEMPORALMENTE` con el mismo `409` "Este comercio está cerrado en este momento" del cierre manual, resto de estados distintos de `APTO_VENTA` con "Este comercio no está aceptando pedidos en este momento", cierre manual, horario). El indicador de apertura es `estadoApertura`: `ABIERTO`, `CERRADO_HORARIO`, `CERRADO_MANUAL` (cierre manual de un `APTO_VENTA`) o `CERRADO_TEMPORALMENTE` (comercio en estado `CERRADO_TEMPORALMENTE`, con la cuenta del Dueno bloqueada; si además tiene un cierre manual previo, manda el bloqueo). `textoReapertura` se calcula para el cierre por horario y el cierre manual, y es `NULL` para un comercio en estado `CERRADO_TEMPORALMENTE` (no se promete una hora). El campo `estado` del catálogo público informa siempre `APTO_VENTA`, también para un `CERRADO_TEMPORALMENTE`; el público distingue el bloqueo de la cuenta del cierre manual por `estadoApertura` (regla del 2026-10-18, que reemplaza a la del tramo C2 de mostrar los dos casos iguales). Para el panel del Dueno un `CERRADO_TEMPORALMENTE` no es operativo (`operativo = false`, `puedeCambiarCierre = false`).

---

### ENUM: TipoDocumentoComercio

Tipo de documento de habilitación de un comercio (`DocumentoComercio.tipo`). Se amplía agregando valores al final del ENUM (cambio de metadatos).

| Valor | Etiqueta | Descripción |
|-------|----------|-------------|
| `LIBRETA_SANITARIA` | Libreta sanitaria | Libreta sanitaria. |
| `CARNET_MANIPULACION_ALIMENTOS` | Carnet de manipulación de alimentos | Carnet de manipulación de alimentos. |
| `HABILITACION_COMERCIAL` | Habilitación comercial | Habilitación comercial. |
| `OTRO` | Otro | Cualquier otro documento; exige `descripcion` (hasta 100 caracteres). |

---

### ENUM: EstadoDocumentoComercio

Estado de revisión de un documento (`DocumentoComercio.estado`). El Dueno ve las etiquetas "En revisión", "Aprobado" y "Rechazado"; la API devuelve el valor del enum.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Subido, esperando la revisión del Administrador. Es el único estado en el que el Dueno puede eliminarlo. Estado inicial. |
| `APROBADO` | Aprobado por el Administrador. Cuenta para la aptitud de venta. El Administrador puede revocarlo (pasarlo a `RECHAZADO` con motivo). |
| `RECHAZADO` | Rechazado (o revocado) por el Administrador, con motivo. Queda en el historial del comercio y cuenta para el tope de 20; no se vuelve a aprobar: el Dueno sube uno nuevo. |

---

### ENUM: EstadoEmailCierreTurno

Estado del email de resumen de un turno cerrado (`CierreTurno.email_estado`).

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Esperando el envío: recién cerrado o a la espera del próximo intento (`email_proximo_intento`, nulo = ya). Estado inicial. |
| `ENVIANDO` | Una corrida lo reclamó y está llamando a Resend (`email_envio_iniciado`). Si pasan más de 15 minutos sin resultado (el proceso cayó) vuelve a `PENDIENTE`. |
| `ENVIADO` | El mail salió (o el envío está deshabilitado, como en el perfil `test`). Estado final. |
| `FALLIDO` | Se agotaron los 5 intentos. Estado final: solo se reencola a mano. |
| `OMITIDO` | No se envía y no se reintenta: la cuenta del Dueño no estaba `ACTIVO` en el intento, o el comercio estaba `SUSPENDIDO` o `CERRADO_TEMPORALMENTE` y no hubo pedidos ni pendientes. Estado final. |

---

### ENUM: AccionCierre

Acción registrada en `HistorialCierreComercio`.

| Valor | Descripción |
|-------|-------------|
| `CERRADO` | El comercio se cerró manualmente (`Comercio.cerrado_manualmente` pasó a `true`). |
| `REABIERTO` | El cierre manual se apagó (`cerrado_manualmente` pasó a `false`), a mano o por la reapertura automática. |

---

### ENUM: ActorCierre

Quién ejecutó la acción registrada en `HistorialCierreComercio`.

| Valor | Descripción |
|-------|-------------|
| `DUENO` | El Dueno titular, desde el panel de un comercio. |
| `EMPLEADO` | Un Empleado autorizado del comercio. Reservado: el código todavía no lo usa; se activa en el tramo E3 (planificado). |
| `SISTEMA` | El job de reapertura automática. Es el único actor sin usuario (`actor_usuario_id` nulo). |

---

### ENUM: DiaSemana

Días de la semana para la configuración de horarios del comercio.

| Valor | Descripción |
|-------|-------------|
| `LUNES` | Lunes |
| `MARTES` | Martes |
| `MIERCOLES` | Miércoles |
| `JUEVES` | Jueves |
| `VIERNES` | Viernes |
| `SABADO` | Sábado |
| `DOMINGO` | Domingo |

---


### ENUM: TipoToken

Propósito funcional del token de seguridad de un solo uso.

| Valor | Descripción |
|-------|-------------|
| `VERIFICACION_EMAIL` | Token enviado al registrarse para verificar la dirección de email. |
| `RECUPERACION_PASSWORD` | Token enviado para restablecer la contraseña olvidada. También desbloquea usuarios en estado `BLOQUEADO`. |
| `REACTIVACION_CUENTA` | Token enviado para reactivar una cuenta en estado `INACTIVO`. |
| `INVITACION_EMPLEADO` | **Sin uso.** El valor existe en el ENUM de la base pero las invitaciones de Empleado no usan la tabla `Token` (`Token.usuario_id` es obligatorio y el invitado puede no tener cuenta): viven en `InvitacionEmpleado` (implementado, `V30`). |

> **Nota de implementación (MVP, Tramo 16.12 de `03. Implementación`, 2026-07-28):** el MVP se apartó de este diseño original para los 3 tipos de token existentes en ese momento (`VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD`, `REACTIVACION_CUENTA`) — se generan como un código numérico de 6 dígitos (no UUID v4), pensado para tipeo manual por el usuario en una pantalla de la app, no como parte de un link. `INVITACION_EMPLEADO` se incorpora con posterioridad a esa nota; salvo indicación en contrario en `docs/DECISIONES.md`, sigue el diseño original (UUID v4 como parte de un link de invitación por email). El resto del párrafo (tabla `Token` discriminada por `tipo`, expiración según duración por tipo, invalidación tras el primer uso) sigue vigente sin cambios. Detalle completo en `03. Implementación/docs/modelo-mvp.md` (tabla `token`) y `03. Implementación/docs/DECISIONES.md`.
>
> Todos los tokens se generan como UUID v4, se almacenan en la tabla `Token` discriminada por `tipo`, expiran según la duración definida para cada tipo, y se invalidan tras su primer uso.
---

### ENUM: EstadoEmpleadoComercio

Estado de la relación entre un Empleado y un Comercio puntual (tabla `EmpleadoComercio`).

> **Implementado (migración `V29`, tramo E1):** pasó de `PENDIENTE`/`ACTIVO`/`DESACTIVADO` a `ACTIVO`/`INACTIVO`. La migración hace el cambio en tres pasos (ampliar, convertir y reducir); la tabla no tenía filas.

| Valor | Descripción |
|-------|-------------|
| `ACTIVO` | El empleado opera este comercio. La fila nace en este estado cuando se acepta la invitación, o vuelve a él cuando se reactiva. |
| `INACTIVO` | La relación terminó: el Dueno lo dio de baja (`BAJA_DUENO`) o el empleado renunció (`RENUNCIA`); el motivo vive en `HistorialEmpleadoComercio`. No afecta las relaciones del empleado con otros comercios. |

> Los estados "Pendiente" (invitación vigente) y "Vencida" (invitación cuyo plazo de 7 días terminó) que ve el Dueno en pantalla no son estados de esta tabla: salen de `InvitacionEmpleado`, y "Vencida" es un estado guardado en la base que un proceso automático asigna cada minuto.

---

### ENUM: EstadoInvitacionEmpleado

*Implementado (migración `V30`, tramo E1).* Estado de una fila de `InvitacionEmpleado`. El código produce los seis valores: `PENDIENTE`, `CANCELADA` y `REEMPLAZADA` (invitar, reenviar y cancelar), `VENCIDA` (el proceso automático de vencimiento y, como red de seguridad, invitar y reenviar) y `ACEPTADA` e `INVALIDADA` (validar y aceptar).

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Invitación dentro del plazo en que se puede aceptar, reenviar o cancelar. Al cumplirse la `fecha_vencimiento` (7 días) un proceso automático la pasa a `VENCIDA` (corre cada minuto); en el intervalo entre el vencimiento y esa corrida el listado ya la informa como "Vencida". |
| `ACEPTADA` | El invitado la aceptó con su email y el código. |
| `CANCELADA` | El Dueno la canceló. Se puede cancelar una invitación `PENDIENTE`, `VENCIDA` o `INVALIDADA` que sea la más reciente de su email en el comercio; una `ACEPTADA`, `CANCELADA` o `REEMPLAZADA`, o cualquiera que ya tenga otra más nueva del mismo email, ya no se puede cancelar. |
| `REEMPLAZADA` | El Dueno reenvió una invitación `PENDIENTE` todavía vigente: la fila anterior queda reemplazada por una nueva. No pisa otras causas: una invitación `INVALIDADA` o `VENCIDA` que se reenvía conserva su estado. |
| `VENCIDA` | Pasaron los 7 días sin aceptarse. Es un estado guardado: un proceso automático (cada minuto) pasa a `VENCIDA` toda invitación `PENDIENTE` cuya `fecha_vencimiento` ya pasó, con una sola actualización por lote, `fecha_resolucion` igual a la `fecha_vencimiento` y sin escribir historial ni avisar. Como red de seguridad, si el proceso se atrasa, el listado informa como "Vencida" a una `PENDIENTE` con la fecha cumplida y invitar o reenviar al mismo email la pasan a `VENCIDA` para liberar el único pendiente por comercio y email. |
| `INVALIDADA` | El código acumuló 5 intentos fallidos; hay que reenviar la invitación. |

---

### ENUM: MotivoHistorialEmpleado

*Implementado (migración `V31`, tramo E1).* Evento del equipo registrado en `HistorialEmpleadoComercio`. El código escribe `INVITACION`, `INVITACION_CANCELADA` y `ACEPTACION` (E1), desde el bloque A1 de E4 `BAJA_DUENO` y `REACTIVACION` (directa, sin invitación) y desde el bloque A2 de E4 `RENUNCIA` (actor = el propio Empleado, sin invitación).

| Valor | Descripción |
|-------|-------------|
| `INVITACION` | El Dueno envió una invitación (cuelga de la invitación, sin transición de estado). |
| `ACEPTACION` | El invitado aceptó: la relación nace `ACTIVO` (o se reactiva). |
| `INVITACION_CANCELADA` | El Dueno canceló una invitación pendiente (cuelga de la invitación). |
| `BAJA_DUENO` | El Dueno desactivó la relación (`ACTIVO → INACTIVO`). |
| `RENUNCIA` | El empleado renunció (`ACTIVO → INACTIVO`). |
| `REACTIVACION` | La relación vuelve a `ACTIVO` (`INACTIVO → ACTIVO`): o bien el Dueno la reactivó directamente (la dio de baja él mismo; actor = el Dueno, sin `invitacion_id`), o bien el invitado aceptó una invitación nueva (actor = el invitado, con `invitacion_id`, junto a la fila `ACEPTACION`). |

---

### ENUM: TipoEntidadEdicion

*Implementado (migración `V32`, tramo E3, bloque A1).* Tipo de entidad sobre la que se hizo un cambio registrado en `HistorialEdicionComercio`.

| Valor | Descripción |
|-------|-------------|
| `PRODUCTO` | Un producto del comercio. |
| `IMAGEN_PRODUCTO` | Una imagen de la galería de un producto. |
| `COMERCIO` | Los datos del perfil del comercio (descripción, teléfono, foto y, para el Dueño, el resto de los datos editables). |
| `HORARIO` | Una franja de horario (futuro: hoy no hay endpoint de edición). |
| `RED_SOCIAL` | Un enlace a red social (acción exclusiva del Dueno). |
| `GRUPO_EXTRA` | Un grupo de extras (futuro). |
| `EXTRA` | Un extra (futuro). |

No hay valor `PEDIDO`: las transiciones de un pedido ya quedan en `HistorialEstadoPedido`.

---

### ENUM: AccionEdicion

*Implementado (migración `V32`, tramo E3, bloque A1).* Acción registrada en `HistorialEdicionComercio`. Es un conjunto chico y estable: el detalle va en el texto de `detalle`, no en valores nuevos del ENUM.

| Valor | Descripción |
|-------|-------------|
| `CREAR` | Alta de la entidad. |
| `EDITAR` | Edición de la entidad. |
| `ELIMINAR` | Baja de la entidad. |
| `CAMBIAR_ESTADO` | Cambio de estado (por ejemplo, de disponibilidad de un producto). |

No hay `ABRIR` ni `CERRAR`: la apertura y el cierre manual ya quedan en `HistorialCierreComercio`.

---

### ENUM: EstadoToken

Estado del ciclo de vida de un token.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Token generado y aún no utilizado ni expirado. |
| `UTILIZADO` | Token consumido exitosamente. Fecha registrada en `fecha_uso`. |
| `EXPIRADO` | Token vencido según `fecha_vencimiento`. Un job periódico actualiza el estado de `PENDIENTE` a `EXPIRADO` cuando `fecha_vencimiento <= NOW()`. |

---

### ENUM: TipoCierreSesion

Motivo del cierre de una sesión de usuario.

| Valor | Descripción |
|-------|-------------|
| `MANUAL` | Cierre explícito realizado por el usuario (acción de logout). |
| `AUTOMATICO` | Cierre por expiración del tiempo de sesión inactiva. |
| `FORZADO` | Cierre forzado por el sistema: cambio de contraseña, bloqueo de cuenta, suspensión, inactivación o apertura de sesión concurrente. |

---

### ENUM: EstadoProducto

Estado de disponibilidad del producto en el catálogo.

| Valor | Descripción |
|-------|-------------|
| `DISPONIBLE` | Producto publicado y disponible para agregar al carrito. |
| `AGOTADO` | Sin stock temporalmente. Al marcarlo, el sistema elimina el ítem de los carritos activos y emite notificación T23 a los clientes afectados. Puede volver a `DISPONIBLE`. |
| `DESCONTINUADO` | Dado de baja lógica de forma definitiva. Al marcarlo, el sistema elimina el ítem de los carritos activos y emite notificación T23. No puede volver a `DISPONIBLE`. |

---

### ENUM: ModalidadEntrega

Forma de entrega elegida por el cliente al confirmar el pedido.

| Valor | Descripción |
|-------|-------------|
| `DOMICILIO` | El comercio envía el pedido al domicilio del cliente. Requiere `Pedido.direccion_id` no nulo. |
| `RETIRO` | El cliente retira el pedido en el local del comercio. `Pedido.direccion_id` es NULL. |

---

### ENUM: MotivoRechazo

Motivo estructurado por el cual el comercio rechazó un pedido en estado `PENDIENTE_CONFIRMACION_COMERCIO`.

| Valor | Descripción |
|-------|-------------|
| `SIN_STOCK` | Uno o más productos del pedido no están disponibles en stock. |
| `CERRADO` | El comercio no está atendiendo en este momento. |
| `ALTO_VOLUMEN_PEDIDOS` | El comercio tiene más pedidos de los que puede gestionar simultáneamente. |
| `PRODUCTO_NO_DISPONIBLE_TEMPORAL` | Algún producto del pedido está temporalmente no disponible. |
| `SIN_DELIVERY_DISPONIBLE` | No hay personal de reparto disponible para realizar la entrega. |
| `PROBLEMA_TECNICO` | Inconveniente técnico interno del comercio. |
| `OTRO` | Motivo no categorizado; se complementa con `Pedido.comentario_rechazo` en texto libre. |

---

### ENUM: EstadoPedido

Estados del ciclo de vida de un pedido.

| Valor | Descripción | ¿Genera reembolso? |
|-------|-------------|-------------------|
| `PENDIENTE_PAGO` | Pedido creado; cliente redirigido a MercadoPago. Esperando confirmación de cobro. | No |
| `PENDIENTE_CONFIRMACION_COMERCIO` | Pago confirmado por MP vía webhook. Esperando aceptación o rechazo del comercio. | No |
| `EN_PREPARACION` | Pedido aceptado por el comercio; en proceso de elaboración. | No |
| `EN_CAMINO` | Pedido despachado. Solo aplica a modalidad `DOMICILIO`. | No |
| `LISTO_PARA_RETIRAR` | Pedido listo para que el cliente lo retire. Solo aplica a modalidad `RETIRO`. | No |
| `ENTREGADO` | Pedido completado. Confirmado por cliente, comercio o sistema (autoconfirmación de los 90 minutos de un envío a domicilio). Estado terminal positivo, reservado para entregas reales. | No |
| `RECHAZADO` | El comercio rechazó el pedido estando en `PENDIENTE_CONFIRMACION_COMERCIO`. | Sí |
| `CANCELADO` | Cancelado por el cliente antes del despacho (domicilio) o antes de estar listo (retiro). | Sí |
| `ANULADO` | Anulado por el comercio desde estado `EN_PREPARACION`. | Sí |
| `CANCELADO_POR_SISTEMA` | Cancelado automáticamente por el sistema (vencimiento del plazo de pago, con el pago sin resolver o rechazado; suspensión o inactivación del comercio). El reembolso se genera **solo** si el pago ya había sido confirmado previamente. | Condicional |
| `EXPIRADO` | El comercio no respondió dentro de 30 minutos (`pedido.timeout.respuesta-comercio-minutos`) tras la confirmación del pago. | Sí |
| `NO_RETIRADO` | El comercio cerró un pedido de retiro que estaba en `LISTO_PARA_RETIRAR` porque el cliente no se presentó (migración `V34`, tramo E3, bloque A4b). Estado terminal; solo se alcanza desde `LISTO_PARA_RETIRAR` y solo en modalidad `RETIRO`, por dos vías: el cierre manual del Dueño o de un Empleado, solo después de una espera mínima de 60 minutos desde que el pedido quedó listo (configurable; la espera no aplica a confirmar la entrega, que es inmediata), y el proceso automático del comercio suspendido, sin esa espera. El comercio conserva el pago: el pedido estaba preparado. No genera nota de crédito ni reembolso. No tiene `fuente_entrega` ni `fecha_entrega`. El Cliente lo ve como "No retirado"; cuenta en el "facturado hoy". | No |

> **Valor `PENDIENTE` residual:** la migración `V6` renombró el estado histórico `PENDIENTE` a `PENDIENTE_CONFIRMACION_COMERCIO`, pero conservó el literal `PENDIENTE` en el ENUM físico de MySQL de `pedido.estado` e `historial_estado_pedido.estado` para no invalidar pedidos de prueba ya guardados con ese valor. El enum Java `EstadoPedido` no lo contempla; ningún código lo escribe.

---

### ENUM: EstadoDetallePedido

Estado individual de un ítem (`DetallePedido`) dentro de un pedido ya confirmado. Permite cancelar o anular un ítem puntual sin afectar el resto del pedido — agregado 2026-08-28, ver `docs/DECISIONES.md`.

| Valor | Descripción |
|-------|-------------|
| `ACTIVO` | Estado inicial de todo ítem al confirmarse el pedido. Sin cancelación ni anulación. |
| `CANCELADO` | El ítem fue cancelado (a pedido del cliente o del comercio, según la lógica de negocio que se defina en el tramo de implementación). Estado terminal. |
| `ANULADO` | El ítem fue anulado por el comercio con motivo (`motivo_anulacion`). Estado terminal. |

> `CANCELADO` y `ANULADO` son ambos terminales: un ítem que sale de `ACTIVO` no vuelve a `ACTIVO` ni cambia entre sí. La distinción exacta entre ambos valores (quién puede llevar un ítem a cada uno, y bajo qué circunstancia) es lógica de negocio pendiente del tramo que implemente los endpoints de cancelación/anulación parcial — fuera de alcance del tramo de modelo de datos que introdujo este ENUM.

---

### ENUM: EstadoPagoPedido

Estado del pago asociado al pedido, sincronizado con los webhooks de MercadoPago.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Pago aún no confirmado por MercadoPago. Estado inicial. |
| `PAGADO` | Pago aprobado (`approved`), confirmado consultando `GET /v1/payments/{id}` con el token del Dueno y cruzando `external_reference` con el pedido. Llega por la notificación de tipo `payment` del webhook o por la sincronización a pedido del Cliente. |
| `RECHAZADO` | Pago rechazado o cancelado (`rejected`/`cancelled`) por MercadoPago. El pedido NO se cancela: queda en `PENDIENTE_PAGO` hasta que se apruebe un pago o venza el plazo de pago (cancelación por timeout, sin reembolso). |

---

### ENUM: ActorPedido

Rol que ejecutó una transición de estado del pedido. Se registra en `HistorialEstadoPedido.actor_rol`.

| Valor | Descripción |
|-------|-------------|
| `CLIENTE` | Transición ejecutada por el cliente. |
| `DUENO` | Transición ejecutada por el Dueno del comercio. |
| `SISTEMA` | Transición automática (webhook de pago, jobs, suspensión de comercio). |
| `EMPLEADO` | Un Empleado autorizado del comercio. Reservado: ningún código lo usa todavía; se activa en el tramo E3 (planificado), cuando las acciones de pedido dejen de fijar `DUENO` a mano y tomen el actor del comercio activo. |

---

### ENUM: MotivoTimeoutPedido

Timeout automático que disparó una transición. Se registra en `HistorialEstadoPedido.motivo_timeout`.

| Valor | Descripción |
|-------|-------------|
| `TIMEOUT_PAGO` | Venció el plazo de pago (30 minutos, configurable) con el pedido en `PENDIENTE_PAGO`. |
| `TIMEOUT_ENTREGA` | Autoconfirmación de entrega a los 90 minutos en `EN_CAMINO`. |
| `TIMEOUT_RESPUESTA_COMERCIO` | El comercio no respondió en 30 minutos (configurable) desde `PENDIENTE_CONFIRMACION_COMERCIO`. |
| `TIMEOUT_RETIRO_SUSPENSION` | Se cumplieron 90 minutos de un pedido `LISTO_PARA_RETIRAR` de un comercio suspendido, contados desde que quedó listo o desde que se suspendió el comercio (lo que haya pasado después); el pedido pasa a `NO_RETIRADO` (hasta la v1.14 pasaba a `ENTREGADO`, y esas filas históricas conservan ese estado). |
| `TIMEOUT_PREPARACION_SUSPENSION` | Desde la `V45`: se cumplieron 90 minutos desde la suspensión de un comercio con un pedido `EN_PREPARACION` que el equipo no despachó ni anuló; el pedido pasa a `CANCELADO_POR_SISTEMA` con reembolso total (nota `SUSPENSION_COMERCIO`). |

---

### ENUM: MotivoAlertaWebhookMp

Causa de una alerta registrada en `AlertaWebhookMp`.

| Valor | Descripción |
|-------|-------------|
| `EXTERNAL_REFERENCE_MISMATCH` | El `external_reference` que devuelve MercadoPago no coincide con el pedido reclamado en la notificación. |
| `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO` | Llegó un pago aprobado para un pedido que ya no estaba esperando el pago (pago tardío). |
| `PAGO_APROBADO_DUPLICADO` | Llegó un segundo pago aprobado, con otro id, para un pedido que ya tenía su pago aprobado. |
| `SPLIT_NO_APLICADO` | Se aprobó un pago pero el `fee_details` que devolvió MercadoPago no trae la comisión de marketplace esperada (falta la entrada o su monto no coincide con `marketplace_fee`). Solo se registra: no bloquea ni revierte el pago ni el pedido. Agregado por la migración `V22`. |

---

### ENUM: CanceladoPor

Actor que originó la cancelación de un pedido. Campo discriminador en `Pedido`.

| Valor | Descripción |
|-------|-------------|
| `CLIENTE` | Cancelación iniciada por el cliente (estado `CANCELADO`). |
| `COMERCIO` | Anulación iniciada por el comercio (estado `ANULADO`) o rechazo del comercio (estado `RECHAZADO`). |
| `SISTEMA` | Cancelación automática por el sistema (estados `CANCELADO_POR_SISTEMA` y `EXPIRADO`). |

> Se registra **únicamente** en estados terminales negativos: `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA`, `EXPIRADO`. Es `NULL` en todos los demás estados.

---

### ENUM: FuenteEntrega

Actor que confirmó o cerró la entrega del pedido. Campo discriminador en `Pedido`.

| Valor | Descripción |
|-------|-------------|
| `CLIENTE` | El cliente confirmó haber recibido el pedido a domicilio. |
| `COMERCIO` | El comercio confirmó la entrega del pedido de retiro en el local. |
| `COMERCIO_SIN_RETIRO` | Sin uso. Estaba previsto para cerrar un pedido de retiro por no presentarse el cliente; ese cierre es el estado `NO_RETIRADO` (`V34`) y `ENTREGADO` queda reservado para entregas reales. El valor salió del enum Java `FuenteEntrega` y queda en el ENUM físico de `pedido.fuente_entrega`, sin filas que lo usen. |
| `SISTEMA` | El sistema confirmó la entrega automáticamente (timer de 90 min en `EN_CAMINO`). |

> Se registra **únicamente** cuando `estado = ENTREGADO`. Es `NULL` en todos los demás estados.

---

### ENUM: EstadoNotaCredito

Estado del proceso de reembolso gestionado a través de la API de MercadoPago.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Reembolso generado; aún no procesado por la API de MP. |
| `PROCESADO` | Reembolso confirmado exitosamente por MercadoPago. |
| `PENDIENTE_REINTENTO` | Primer intento de reembolso fallido; el job periódico lo reintentará. |
| `FALLIDO` | El pedido de reembolso a MercadoPago falló (hoy, en el primer intento: el job de reintentos hasta 5 todavía no existe). El error real queda en `ultimo_error`. Requiere intervención manual del Administrador. La notificación T27 todavía no se emite. |
| `PENDIENTE_REVISION_MANUAL` | Agregado 2026-09-25. El reembolso no se intentó porque la cuenta de MercadoPago del comercio está desvinculada (`CuentaMercadoPago.activa = false` o inexistente). Queda registrado para que el Administrador lo resuelva a mano; `intentos = 0`. |

---

### ENUM: MotivoNotaCredito

Agregado 2026-09-25. Origen de una nota de crédito (columna `NotaCredito.motivo`).

| Valor | Descripción |
|-------|-------------|
| `RECHAZO_COMERCIO` | El comercio rechazó el pedido (`RECHAZADO`). |
| `CANCELACION_CLIENTE` | El cliente canceló el pedido (`CANCELADO`). Todavía sin llamador (endpoint pendiente). |
| `ANULACION_COMERCIO` | El comercio anuló el pedido (`ANULADO`). Todavía sin llamador (endpoint pendiente). |
| `SUSPENSION_COMERCIO` | Cancelación por el sistema por suspensión del comercio (`CANCELADO_POR_SISTEMA`): el tope de 90 minutos de un pedido `EN_PREPARACION`, o un pago aprobado que llega con el comercio suspendido (también si llega tarde sobre un pedido ya cancelado). |
| `EXPIRACION_SIN_RESPUESTA` | El comercio no respondió a tiempo (`EXPIRADO`). |
| `SUSPENSION_CLIENTE` | Devolución de un pago aprobado que llegó cuando la cuenta del Cliente estaba suspendida (el pedido se cancela y se reembolsa entero en el acto), o de un pago tardío sobre un pedido cancelado mientras el Cliente sigue suspendido (`V44`). |
| `RECLAMO` | Reembolso total o parcial por un reclamo aprobado (tramo S5). Reservado en `V44`, sin emisor todavía. |
| `PAGO_TARDIO` | Desde la `V45`: devolución de un pago aprobado que llegó sobre un pedido que ya estaba cancelado por cualquier causa que no sea una suspensión (por ejemplo, un pedido vencido por falta de pago). Antes se usaba `CANCELACION_CLIENTE`. |

---

### ENUM: EstadoReclamo

Estado de un reclamo iniciado por un cliente sobre un pedido.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Reclamo enviado; pendiente de revisión por el Administrador. |
| `APROBADO` | Administrador aprobó el reclamo; se genera `NotaCredito` y se procesa el reembolso. Se emite notificación T20. |
| `RECHAZADO` | Administrador rechazó el reclamo con motivo. Se emite notificación T21. |

---

### ENUM: ResolucionSoporte

Resolución de un ticket de soporte determinada por el Administrador.

| Valor | Descripción |
|-------|-------------|
| `REACTIVADO` | El Administrador levantó la suspensión del usuario tras revisar el mensaje. |
| `SUSPENSION_MANTENIDA` | El Administrador mantuvo la suspensión tras revisar el mensaje. |

---

### ENUM: CanalNotificacion

Canal de envío de la notificación al usuario.

| Valor | Descripción |
|-------|-------------|
| `PUSH` | Notificación in-app almacenada en la base de datos y consultada por el frontend mediante polling REST. |
| `EMAIL` | Notificación enviada mediante proveedor SMTP transaccional (Brevo u otro). |

> Cuando una notificación se envía por ambos canales, se crean **dos registros independientes** en la tabla `Notificacion`, uno por canal.

---

### ENUM: EstadoEnvioNotificacion

Estado de procesamiento del envío de la notificación.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Notificación generada; aún no enviada al canal correspondiente. |
| `ENVIADO` | Notificación enviada exitosamente. |
| `FALLIDO` | Error en el envío al canal correspondiente. |

---

### ENUM: TipoNotificacion

Tipo de evento que originó la notificación. Corresponde a los códigos T1–T41 de los Requisitos Funcionales del Sistema (T33 a T35 reutilizan tipos existentes, ver la nota debajo de la tabla; T36 a T41 tienen tipo propio).

| Valor | Cód. | Destinatario | Canal | Descripción |
|-------|------|-------------|-------|-------------|
| `NUEVO_PEDIDO` | T1 | Dueno y Empleados activos del comercio | Push | Nuevo pedido recibido en estado `PENDIENTE_CONFIRMACION_COMERCIO`. |
| `PEDIDO_ACEPTADO` | T2 | Cliente | Push | Pedido aceptado por el comercio; pasa directamente a `EN_PREPARACION`. |
| `PEDIDO_RECHAZADO` | T3 | Cliente | Push | Pedido rechazado por el comercio con motivo. |
| `PEDIDO_EN_CAMINO` | T5 | Cliente | Push | Pedido despachado (modalidad `DOMICILIO`). |
| `PEDIDO_LISTO_RETIRO` | T6 | Cliente | Push | Pedido listo para retirar en el local (modalidad `RETIRO`). |
| `AVISO_75MIN_SIN_CONFIRMACION` | T7 | Cliente | Push | Aviso preventivo: 75 min en estado `EN_CAMINO` sin confirmación de recepción. |
| `PEDIDO_AUTOCONFIRMADO` | T8 | Cliente | Push | Pedido autoconfirmado como `ENTREGADO` a los 90 min. Incluye opciones para iniciar reclamo o contactar al comercio. |
| `PEDIDO_CANCELADO_CLIENTE` | T9 | Dueno y Empleados activos del comercio | Push | El cliente canceló un pedido activo. |
| `PEDIDO_ANULADO_COMERCIO` | T10 | Cliente | Push | El comercio anuló el pedido desde `EN_PREPARACION`. |
| `PEDIDO_CANCELADO_SISTEMA` | T11 | Cliente | Push + Email | Pedido cancelado por el sistema con motivo (suspensión, timeout, pago rechazado). |
| `PEDIDO_EXPIRADO_CLIENTE` | T12 | Cliente | Push | El comercio no respondió en 30 minutos; pedido expirado y devolución del pago en gestión. |
| `PEDIDO_EXPIRADO_COMERCIO` | T13 | Dueno y Empleados activos del comercio | Push | Aviso al comercio de pedido expirado por falta de respuesta. |
| `COMERCIO_APROBADO` | T14 | Dueno | Push + Email | La solicitud del comercio fue aprobada por el Administrador. |
| `COMERCIO_RECHAZADO` | T15 | Dueno | Push + Email | La solicitud del comercio fue rechazada con motivo. |
| `COMERCIO_SUSPENDIDO` | T16 | Dueno (el Empleado ve el estado del comercio en su selector, con aviso) | Push + Email | El comercio fue suspendido por el Administrador con motivo. |
| `COMERCIO_SUSPENDIDO_EQUIPO` | — | Empleados `ACTIVO` del comercio (cuenta no suspendida) | Push | Desde la `V45`: el comercio fue suspendido; sin motivo y sin email. |
| `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` | — | Empleados `ACTIVO` del comercio (cuenta no suspendida) | Push | Desde la `V45`: se levantó la suspensión del comercio; sin mensaje y sin email. |
| `NUEVO_COMERCIO_PENDIENTE` | T17 | Administrador | Push | Nueva solicitud de alta de comercio para revisar en el panel. |
| `NUEVA_RESOLICITUD_COMERCIO` | T18 | Administrador | Push | Re-solicitud de aprobación de un comercio rechazado. |
| `NUEVO_RECLAMO` | T19 | Administrador | Push | Nuevo reclamo iniciado por un cliente. |
| `RECLAMO_APROBADO` | T20 | Cliente | Push | Reclamo aprobado; reembolso en proceso. |
| `RECLAMO_RECHAZADO` | T21 | Cliente | Push | Reclamo rechazado con motivo por el Administrador. |
| `NUEVO_MENSAJE_SOPORTE` | T22 | Administrador | Push | Nuevo mensaje de soporte de un usuario suspendido. |
| `PRODUCTO_REMOVIDO_CARRITO` | T23 | Cliente | Push | Un producto fue eliminado del carrito activo por pasar a `AGOTADO` o `DESCONTINUADO`. |
| `CUENTA_INACTIVADA` | T24 | Cliente, Dueno o Empleado | Email | Cuenta inactivada automáticamente por 3 meses sin actividad. |
| `COMERCIO_INACTIVADO` | T25 | Dueno | Email | Comercio inactivado automáticamente por inactividad del Dueno titular. |
| `PEDIDO_CERRADO_TIMER_SUSPENSION` | T26 | Cliente | Push | **Sin emisor desde la v1.15:** el proceso que vence el timer de 90 min durante la suspensión del comercio ahora cierra el pedido como `NO_RETIRADO` y avisa con T36. Se conserva en el ENUM por las filas históricas. |
| `REEMBOLSO_FALLIDO_DEFINITIVO` | T27 | Administrador | Push + Email | Reembolso fallido tras 5 intentos; requiere intervención manual. |
| `CLIENTE_SUSPENDIDO` | T28 | Cliente | Push + Email | Cliente suspendido por el Administrador con motivo. |
| `SUSPENSION_LEVANTADA` | T29 | Cliente o Dueno | Push + Email | Suspensión levantada por el Administrador. |
| `PEDIDO_AUTOCONFIRMADO_COMERCIO` | T30 | Dueno y Empleados activos del comercio | Push | **Implementado en el bloque A6 de E3 (v1.16).** El sistema autoconfirmó la entrega de un pedido a domicilio porque el Cliente no la confirmó (timer de 90 min, configurable): "El pedido #12 se confirmó automáticamente como entregado porque el cliente no respondió en 90 minutos." Una copia por destinatario, con `comercio_id`, escrita en la misma transacción que el cambio a `ENTREGADO` y el aviso T8 al Cliente. No se emite si el Cliente confirma antes ni en el cierre de un retiro (T36). |
| `INVITACION_EMPLEADO` | T31 | Persona invitada | Email | Invitación para operar un comercio como Empleado. El email lleva el código en el texto y un enlace genérico a `{app.frontend-base-url}/invitacion-empleado.html` (sin código, sin email y sin `#` en la URL); no genera una fila de notificación in-app. |
| `EMPLEADO_DESACTIVADO` | T32 | Empleado | Push | El Dueno desactivó al empleado de un comercio puntual (**implementado en el bloque A1 de E4**): aviso personal (sin `comercio_id`, con `entidad_tipo = COMERCIO` y el id del comercio), que se conserva en la campana personal de la persona: "{Comercio} te dio de baja del equipo. Ya no tenés acceso a ese comercio." (texto provisorio). El mismo tipo sirve a T34 (**implementado en el bloque A2 de E4**: el Empleado renunció; aviso al Dueno, con `comercio_id` y `entidad_tipo = COMERCIO`, que se ve con ese comercio abierto: "{Nombre Apellido} dejó de trabajar en {Comercio}.", texto provisorio). |
| `EMPLEADO_REACTIVADO` | T37 | Empleado | Push | **Implementado en el bloque A1 de E4 (v1.18, migración `V35`).** El Dueno reactivó directamente al empleado: aviso personal (sin `comercio_id`, con `entidad_tipo = COMERCIO` y el id del comercio): "{Comercio} te reactivó en el equipo. Ya podés volver a trabajar ahí." (texto provisorio). No hay email de reactivación. |
| `PEDIDO_NO_RETIRADO` | T36 | Cliente | Push | El comercio (Dueño o Empleado) o el proceso automático del comercio suspendido cerró como `NO_RETIRADO` un pedido de retiro: "Tu pedido #12 no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago." Una sola fila, personal del Cliente (sin copias al equipo), escrita en la misma transacción que el cambio de estado (migración `V34`). |
| `DOCUMENTO_APROBADO` | T38 | Dueno | Push | **Implementado en la Fase 4 (v1.28, migración `V43`).** El Administrador aprobó un documento del comercio: "Tu documento «Libreta sanitaria» de {Comercio} fue aprobado." Aviso del comercio (con `comercio_id` y `entidad_tipo = COMERCIO`). Sin email. |
| `DOCUMENTO_RECHAZADO` | T39 | Dueno | Push | **Fase 4 (v1.28).** El Administrador rechazó un documento, o revocó uno aprobado, con motivo: "Tu documento «…» de {Comercio} fue rechazado. Motivo: …" o "Se revocó la aprobación de tu documento «…» de {Comercio}. Motivo: …". Con `comercio_id`. Sin email. |
| `COMERCIO_APTO_VENTA` | T40 | Dueno | Push | **Fase 4 (v1.28).** El comercio pasó de `APROBADO` a `APTO_VENTA` (cumple la regla de aptitud de venta): "Tu comercio {Comercio} ya puede recibir pedidos." No se emite al aprobar el comercio (ya lo dice `COMERCIO_APROBADO`) ni al restaurar la cuenta. |
| `COMERCIO_SIN_APTITUD` | T41 | Dueno | Push | **Fase 4 (v1.28).** El comercio dejó de cumplir la regla y volvió a `APROBADO`: "Tu comercio {Comercio} dejó de recibir pedidos: falta vincular Mercado Pago / falta tener un documento aprobado." También se emite si al restaurar la cuenta ya no la cumple. No se emite cuando lo cierra el bloqueo de la cuenta. |

> **Reutilización de tipos para el Empleado (sin valores nuevos de ENUM; T35 implementado en el bloque A2 de E1, el resto planificado en E1 a E4):** T33 (invitación aceptada) usa `INVITACION_EMPLEADO` dirigido al Dueno, con `entidad_tipo = COMERCIO`; T34 (el empleado renunció, implementado en el bloque A2 de E4) usa `EMPLEADO_DESACTIVADO` dirigido al Dueno con otro texto; T35 (aviso de regularización a una cuenta que no se pudo invitar) usa `INVITACION_EMPLEADO` con `canal = EMAIL` y `estado = ENVIADO`, dirigido al `usuario_id` de la persona, y sirve para contar el tope de 3 por día por destinatario (24 horas corridas; la fila se escribe aunque falle el envío, porque significa "se intentó"). Los listados y el contador de la campana del Cliente filtran `canal = PUSH` para no mostrar estas filas. Las operativas (T1, T9, T13 y T30) se emiten una vez por cada Empleado `ACTIVO` además del Dueno (T1, T9 y T13 implementadas en el bloque A4 de E3; T30, en el bloque A6).
>
> **Audiencia por tipo (bloque A4 de E3, implementada en `TipoNotificacion.getAudiencia()`):** *equipo* (el Dueno y los Empleados `ACTIVO` del comercio, una copia cada uno): T1, T9, T13 y T30; *Dueno* (solo él, con `comercio_id`): T14, T15, T16, T25, T33 y T38 a T41; *Cliente o Dueno* (el mismo tipo sirve a los dos, según el texto): T29, T32/T34 (`EMPLEADO_DESACTIVADO`: T32 va a la persona desactivada como aviso personal, T34 al Dueno) y T37 (`EMPLEADO_REACTIVADO`, aviso personal de la persona reactivada, v1.18); *Administrador* (hoy no se emiten): T17, T18, T19, T22 y T27; *Cliente* (aviso personal, sin comercio): todos los demás. Las copias del equipo excluyen al Cliente del pedido: un Empleado que compra en su propio comercio recibe solo sus avisos de comprador. Quien se suma o se reactiva ve solo los avisos posteriores a su activación (al activar o reactivar a un Empleado se borran, por clave primaria y en la misma transacción, sus avisos anteriores de ese comercio; la desactivación y, desde el bloque A1 de E4, la reactivación directa hacen el mismo purgado, en la misma transacción; la renuncia, desde el bloque A2, también. T32 y T37 no se purgan: son avisos personales, sin `comercio_id`).

---

### ENUM: TipoEntidadNotificacion

Tipo de entidad referenciada por `Notificacion.entidad_id`, cuando la notificación permite un deep-link a un recurso concreto (ej. "ver pedido" desde la campana de notificaciones). Diseño genérico (`entidad_tipo` + `entidad_id`) en vez de una columna `*_id` nullable por cada tipo de entidad referenciable — ver regla de negocio de integridad en `Tabla: Notificacion` más abajo.

| Valor | Descripción |
|-------|-------------|
| `PEDIDO` | `entidad_id` referencia un `Pedido.id`. |
| `COMERCIO` | `entidad_id` referencia un `Comercio.id`. |

---

## 2. Módulo Geografía

---

### Tabla: Provincia

**Descripción:** Catálogo estático de provincias de Argentina. Precargado mediante ETL inicial desde la API Georef (datos.gob.ar). De solo lectura desde la aplicación.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | VARCHAR(2) | NO | — | PK | Código identificador de la provincia según la API Georef (ej. `"T"` para Tierra del Fuego). |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre completo de la provincia (ej. `"Tierra del Fuego, Antártida e Islas del Atlántico Sur"`). |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: Localidad

**Descripción:** Catálogo estático de localidades de Argentina. Precargado desde la API Georef. Cada localidad pertenece a una provincia. **Excepción (MVP, Tramo 16.12):** la fila de Tolhuin (Tierra del Fuego) no viene de la API Georef — no existe en su endpoint /localidades— se cargó aparte vía migración Flyway; verdocs/modelo-mvp.md.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | VARCHAR(15) | NO | — | PK | Identificador alfanumérico de la localidad según la API Georef. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre de la localidad (ej. `"Río Grande"`). |
| `provincia_id` | VARCHAR(2) | NO | — | FK → Provincia.id, NN | Provincia a la que pertenece la localidad. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (provincia_id)`

---

### Tabla: Direccion

**Descripción:** Direcciones físicas asociadas a clientes (varias por cliente) o a comercios (exactamente una). Soporta baja lógica mediante `eliminada`. Los campos `cliente_id` y `comercio_id` son mutuamente excluyentes.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la dirección. |
| `nombre` | VARCHAR(40) | SÍ | NULL | — | Agregada en la migración `V42`. Alias privado que el Cliente le pone a la dirección ("Casa", "Trabajo"). Repetible. Solo lo ve el Cliente: no se copia al pedido. |
| `calle` | VARCHAR(150) | NO | — | NN | Nombre de la calle. |
| `numero` | VARCHAR(10) | NO | — | NN | Número de puerta o altura. |
| `piso_depto` | VARCHAR(30) | SÍ | NULL | — | Piso y/o departamento (ej. `"3° B"`). Opcional. |
| `codigo_postal` | VARCHAR(10) | NO | — | NN | Código postal de la dirección. |
| `referencia` | VARCHAR(150) | SÍ | NULL | — | Agregada en la migración `V42`. Indicación de entrega ("portón verde"). Se copia al pedido. |
| `localidad_id` | VARCHAR(15) | NO | — | FK → Localidad.id, NN | Localidad donde se ubica la dirección. |
| `cliente_id` | INT | SÍ | NULL | FK → Cliente.id | FK al cliente propietario. Mutuamente excluyente con `comercio_id`. |
| `comercio_id` | INT | SÍ | NULL | FK → Comercio.id, UQ | FK al comercio propietario. UQ garantiza máximo una dirección por comercio. Mutuamente excluyente con `cliente_id`. |
| `principal` | TINYINT(1) | NO | `false` | NN | `true` si es la dirección principal del cliente (predeterminada al hacer pedidos). Solo aplica cuando `cliente_id` no es NULL. |
| `eliminada` | TINYINT(1) | NO | `false` | NN | Baja lógica: `true` = dirección eliminada por el cliente. No se muestra en la UI ni se usa en nuevos pedidos. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última edición de la dirección. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora de la eliminación lógica. |
| `principal_activa_cliente_id` | INT | SÍ | generada | STORED, UQ | Agregada en la migración `V42`. `cliente_id` si `principal = 1` y `eliminada = 0`, si no `NULL`. Con su índice único garantiza una sola predeterminada activa por Cliente. No la mapea la entidad JPA. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (comercio_id)` | `INDEX (cliente_id)` | `INDEX idx_direccion_cliente_activa (cliente_id, eliminada)` | `UNIQUE uq_direccion_principal_cliente (principal_activa_cliente_id)` | `INDEX (localidad_id)`

**Reglas de negocio:**
- Exactamente uno de `cliente_id` o `comercio_id` debe estar poblado; el otro debe ser NULL.
- Un cliente puede tener hasta 5 direcciones activas (las eliminadas no cuentan). Solo una activa puede tener `principal = true` (índice único `V42`). La primera dirección queda predeterminada; al eliminar la predeterminada pasa a serlo la activa de mayor `id`; la última activa no se puede eliminar. El cambio de predeterminada se hace solo por su endpoint (`PUT /clientes/direcciones/{id}/principal`), nunca editando la dirección.
- La dirección del comercio no puede eliminarse lógicamente.

---

## 3. Módulo Identidad y Herencia

---

### Tabla: Usuario

**Descripción:** Entidad central del sistema de identidad. Almacena credenciales, estado operacional actual y metadatos de seguridad para todos los actores del sistema. Las transiciones de estado y sus fechas se registran en `HistorialEstadoUsuario`. La PK (`id`) es compartida con `Persona` mediante herencia por tabla.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del usuario. Compartido con `Persona` (mismo valor). |
| `email` | VARCHAR(254) | NO | — | NN, UQ | Dirección de email, única en toda la plataforma. Ya **no** es la credencial de login (ver `nombre_usuario`): se usa para verificación de cuenta, recuperación de contraseña y reactivación de cuenta. Ampliado de `VARCHAR(150)` a `VARCHAR(254)` (máximo teórico real de un email según RFC 5321/5322) en el tramo de perfeccionamiento de validaciones de "01. Datos Personales" de `registro-cliente.html` — ver `docs/DECISIONES.md` y la migración `V4__ampliar_usuario_email_varchar254.sql`. |
| `nombre_usuario` | VARCHAR(20) `utf8mb4_bin` | NO | — | NN, UQ, CK | **Credencial de login** (migración `V19`). De 8 a 20 caracteres, solo letras y números ASCII, al menos una letra; se guarda y se muestra normalizado a minúsculas. Único en toda la tabla sin importar el rol. La collation `utf8mb4_bin` más el `CHECK (nombre_usuario = LOWER(nombre_usuario))` (`ck_usuario_nombre_usuario_minusculas`) hacen que la base rechace mayúsculas aunque se escriba por fuera del backend, sin depender de la collation del servidor. El backend rechaza además una lista de nombres reservados (comparación exacta). El Cliente puede cambiarlo desde su perfil (ver `HistorialCambioNombreUsuario`). |
| `password_hash` | VARCHAR(255) | NO | — | NN | Hash de la contraseña generado con BCrypt. Nunca se almacena en texto plano. |
| `rol` | ENUM RolUsuario | NO | — | NN | Rol funcional: `CLIENTE`, `DUENO`, `EMPLEADO` o `ADMINISTRADOR`. Determina las entidades asociadas y los permisos de la API. Un Empleado conserva `CLIENTE` (no hay multirol físico: una sola columna, y el token de sesión lleva un solo rol) |
| `estado` | ENUM EstadoUsuario | NO | `'PENDIENTE'` | NN | Estado operacional actual del usuario. Consultado en cada validación de seguridad. |
| `email_verificado` | TINYINT(1) | NO | `false` | NN | `true` una vez que el usuario consumió exitosamente el token de `VERIFICACION_EMAIL`. |
| `foto_perfil_url` | VARCHAR(500) | SÍ | NULL | — | URL en Cloudinary de la foto de perfil personal del usuario. Opcional para los cuatro roles. Campo independiente de `Comercio.foto_perfil_url` (logo del negocio): no se comparte entre los distintos comercios de un mismo Dueno. |
| `intentos_fallidos` | INT | NO | `0` | NN | Contador de intentos fallidos de login o de cambio de contraseña desde perfil. Se resetea al autenticarse correctamente. Al llegar a 3, el usuario pasa a `BLOQUEADO`. |
| `motivo_suspension` | VARCHAR(500) | SÍ | NULL | CK `ck_usuario_suspension` | Motivo que cargó el Administrador al suspender la cuenta (10 a 500 caracteres, lo ve la persona suspendida). Completo si y solo si `estado = SUSPENDIDO`. Migración `V44` (reincorpora la columna que la v1.2 había eliminado a favor del historial: se mantiene como foto vigente para no hacer un join en cada request). |
| `suspendido_desde` | DATETIME | SÍ | NULL | CK `ck_usuario_suspension` | Fecha y hora de la suspensión vigente. Completo si y solo si `estado = SUSPENDIDO`. Migración `V44`. |
| `fecha_registro` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de usuario. Inmutable. |
| `fecha_ultimo_acceso` | DATETIME | SÍ | NULL | — | Fecha y hora del último inicio de sesión exitoso. Criterio para detectar inactividad (3 meses sin actualización = `INACTIVO`). |
| `fecha_actualizacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación de cualquier campo del registro. |

> **Campos eliminados en v1.2:** `fecha_bloqueo`, `fecha_suspension`, `motivo_suspension`, `fecha_inactivo`, `fecha_reactivacion`. Todos se derivan desde `HistorialEstadoUsuario`: `SELECT estado_destino, motivo, fecha_hora FROM HistorialEstadoUsuario WHERE usuario_id = ? ORDER BY fecha_hora DESC`.

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (email)` | `UNIQUE (nombre_usuario)` (`uq_usuario_nombre_usuario`) | `INDEX (rol)` | `INDEX (estado)`

**Reglas de negocio:**
- El login es exclusivamente por `nombre_usuario` y contraseña. El `sub` del JWT es el `id` del usuario, no el email ni el nombre de usuario, por lo que cambiar el nombre de usuario no invalida las sesiones existentes.
- Al registrarse: `estado = PENDIENTE`, `email_verificado = false`. Se inserta la primera fila en `HistorialEstadoUsuario` con `estado_origen = NULL`, `estado_destino = PENDIENTE`.
- Tras 3 intentos fallidos: `estado → BLOQUEADO`, `intentos_fallidos` se resetea a 0. Se inserta fila en `HistorialEstadoUsuario`.
- `fecha_ultimo_acceso` se actualiza en cada login exitoso y es el único criterio para la inactivación por 3 meses.
- Cada cambio de `estado` genera un INSERT en `HistorialEstadoUsuario` con `estado_origen` (estado previo) y `estado_destino` (nuevo estado).

---

### Tabla: HistorialEstadoUsuario

**Descripción:** Registro histórico de todas las transiciones de estado del usuario. Tabla de detalle 1:N de `Usuario`. Cada cambio de `Usuario.estado` genera una nueva fila. Patrón de máquina de estados: registra el estado previo y el estado resultante de cada transición. Permite auditoría completa del ciclo de vida del usuario sin sobreescribir datos.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro histórico. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario cuyo estado cambió. |
| `administrador_id` | INT | SÍ | NULL | FK → Usuario.id (`fk_heu_administrador`) | Administrador que hizo el cambio. `NULL` cuando lo hizo el sistema (bloqueo por intentos, recuperación de contraseña, verificación de email, reactivación). Migración `V44`. |
| `estado_origen` | ENUM EstadoUsuario | SÍ | NULL | — | Estado del usuario antes de la transición. NULL únicamente en el primer registro (creación del usuario, sin estado previo). |
| `estado_destino` | ENUM EstadoUsuario | NO | — | NN | Estado resultante del usuario tras la transición. |
| `motivo` | VARCHAR(500) | SÍ | NULL | — | Motivo de la transición. Obligatorio para `SUSPENDIDO`; opcional para los demás estados. El actor se infiere de la transición: `BLOQUEADO` = sistema, `SUSPENDIDO` = admin, `INACTIVO` = sistema. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora exacta de la transición. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id)` | `INDEX (fecha_hora)`

**Reglas de negocio:**
- Tabla de solo inserción (append-only). No se modifica ni elimina ningún registro.
- Desde la v1.29 la escribe un único método (`EstadoUsuarioService.cambiar`), dentro de la misma transacción que el cambio de `Usuario.estado`; ningún otro código puede cambiar el estado de un usuario (lo garantiza `EstadoUsuarioCentralizadoTest`). El registro de creación (`estado_origen = NULL`) no se escribe todavía.
- El motivo del levantamiento de una suspensión (opcional, hasta 500 caracteres) va en la fila `SUSPENDIDO → ACTIVO` (o `→ PENDIENTE` si la cuenta estaba sin verificar al suspenderse).
- El estado actual del usuario se obtiene desde `Usuario.estado`. El historial completo, desde esta tabla ordenada por `fecha_hora ASC`.
- Para obtener la última suspensión: `SELECT motivo, fecha_hora FROM HistorialEstadoUsuario WHERE usuario_id = ? AND estado_destino = 'SUSPENDIDO' ORDER BY fecha_hora DESC LIMIT 1`.

---

### Tabla: HistorialCambioNombreUsuario

**Descripción:** Registro de auditoría de cada cambio de `Usuario.nombre_usuario` hecho desde el perfil (migración `V21`). Sirve para calcular el límite de cambios. Tabla chica de un evento puntual, sin relación con otras tablas de negocio más allá del usuario dueño del cambio. Hoy solo el Cliente puede cambiar su nombre de usuario.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN, `ON DELETE CASCADE` | Usuario que cambió su nombre de usuario. |
| `nombre_usuario_anterior` | VARCHAR(20) | NO | — | NN | Nombre de usuario antes del cambio. |
| `nombre_usuario_nuevo` | VARCHAR(20) | NO | — | NN | Nombre de usuario después del cambio. |
| `fecha_cambio` | DATETIME | NO | `NOW()` | NN | Fecha y hora del cambio. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id, fecha_cambio)` (`idx_historial_cambio_nombre_usuario_usuario_fecha`)

**Reglas de negocio:**
- Tabla de solo inserción (append-only).
- Límite: máximo 3 cambios cada 30 días corridos (ventana deslizante hacia atrás desde el momento del intento, no mes calendario). Si ya hay 3 cambios en la ventana, el cupo se libera cuando sale de ella el más antiguo de esos cambios, y el mensaje informa los días reales restantes.
- Cada cambio exige la contraseña actual; una contraseña incorrecta cuenta como intento fallido con el mismo bloqueo a los 3 intentos que el login y el cambio de contraseña.

---

### Tabla: Persona

**Descripción:** Nodo intermedio de la jerarquía de herencia. Vincula `Usuario` con su subtipo concreto (`PersonaFisica` o `PersonaJuridica`). Comparte PK con `Usuario`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → Usuario.id | Mismo valor que `Usuario.id`. No usa AUTO_INCREMENT propio. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: PersonaFisica

**Descripción:** Datos personales de los usuarios con identidad individual (Clientes y Administradores). El `id` es el mismo que el de `Persona`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → Persona.id | Mismo valor que `Persona.id`. |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre(s) de pila del individuo. |
| `apellido` | VARCHAR(100) | NO | — | NN | Apellido(s) del individuo. |
| `dni` | VARCHAR(10) | NO | — | NN, UQ | Documento Nacional de Identidad argentino. Único en toda la plataforma. |
| `fecha_nacimiento` | DATE | NO | — | NN | Fecha de nacimiento. |
| `telefono` | VARCHAR(30) | NO | — | NN | Número de teléfono con código de área. Se usa para generar enlaces `wa.me` hacia WhatsApp. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última actualización del perfil personal. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (dni)`

---

### Tabla: PersonaJuridica

**Descripción:** Datos fiscales y comerciales del titular de un comercio. El `id` es el mismo que el de `Persona`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → Persona.id | Mismo valor que `Persona.id`. |
| `razon_social` | VARCHAR(150) | SÍ | NULL | — | Nombre legal o razón social de la empresa. Opcional desde la v1.21. |
| `cuit` | VARCHAR(11) | NO | — | NN, UQ | Clave Única de Identificación Tributaria (11 dígitos, sin guiones). Único en toda la plataforma. |
| `condicion_iva` | ENUM CondicionIva | SÍ | NULL | — | Situación ante el IVA según AFIP. Opcional desde la v1.21. |
| `tipo_sociedad` | ENUM TipoPersonaJuridica | SÍ | NULL | — | Forma jurídica con la que está constituida la empresa. Opcional desde la v1.21. |
| `domicilio_fiscal` | VARCHAR(255) | NO | — | NN | Domicilio fiscal declarado ante AFIP. Puede diferir del domicilio operativo registrado en `Direccion`. |
| `fecha_inicio_actividades` | DATE | SÍ | NULL | — | Fecha de inicio de actividades declarada ante AFIP. Opcional desde la v1.21. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (cuit)`

---

### Tabla: Cliente

**Descripción:** Subtipo de `PersonaFisica` con rol `CLIENTE`. Tabla de identidad que actúa como nodo de unión para sus pedidos, carrito y direcciones. No tiene columnas propias más allá de la PK.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → PersonaFisica.id | Mismo valor que `PersonaFisica.id`. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: Administrador

**Descripción:** Subtipo de `PersonaFisica` con rol `ADMINISTRADOR`. Tabla de identidad que actúa como nodo de unión para las acciones administrativas (historial de comercios, reclamos, mensajes de soporte). No tiene columnas propias más allá de la PK.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → PersonaFisica.id | Mismo valor que `PersonaFisica.id`. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: Empleado

**Descripción:** Subtipo de `PersonaFisica` para quien opera comercios en nombre de un Dueno. Tabla de identidad que actúa como nodo de unión entre el usuario y los comercios donde opera (relación M:N vía `EmpleadoComercio`). **Entidad y repositorio implementados (tramo E1, bloque A1); la creación de la fila queda para el bloque A3:** la fila se crea al aceptar la primera invitación (o ya existe si la persona fue Empleado antes) y el `Usuario` conserva `rol = CLIENTE`; hoy ningún código crea filas. No tiene columnas propias más allá de la PK y el timestamp de creación.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → PersonaFisica.id | Mismo valor que `PersonaFisica.id`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de empleado. |

**Índices:** `PRIMARY KEY (id)`

**Reglas de negocio:**
- No lleva `fecha_modificacion` ni `fecha_baja` propias: la baja de la cuenta se maneja vía `Usuario.estado` (`SUSPENDIDO`/`INACTIVO`), igual que `Cliente` y `Administrador`.
- La baja de un Empleado en un comercio puntual (sin afectar sus otras relaciones) se maneja vía `EmpleadoComercio.estado = INACTIVO` (antes de la migración `V29`, `DESACTIVADO`), no en esta tabla.
- Una persona con fila en `Empleado`, aunque su relación esté inactiva ("ex Empleado"), no puede registrar un comercio con esa cuenta (ver "Combinaciones de roles y contexto del Empleado", sección 12).

---

### Tabla: Dueno

**Descripción:** Subtipo de `PersonaJuridica` **y** de `PersonaFisica` simultáneamente, con rol `DUENO`. Tabla de identidad del titular de uno o varios `Comercio`. Representa que el titular legal del negocio (`PersonaJuridica`) es siempre la misma persona física (`PersonaFisica`) que se registró en la plataforma — ambas relaciones son 1:1 y corresponden al mismo `Persona`/`Usuario`. No tiene columnas propias más allá de la PK, la FK hacia `PersonaFisica` y el timestamp de creación: los datos personales viven en `PersonaFisica`, los datos fiscales en `PersonaJuridica` y los datos del negocio en `Comercio`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → PersonaJuridica.id | Mismo valor que `PersonaJuridica.id`. |
| `persona_fisica_id` | INT | NO | — | FK → PersonaFisica.id, NN, UQ | Persona física titular del negocio. Misma persona que ya está asociada a este Usuario/Persona vía la relación de herencia estándar — esta FK existe para permitir navegar directamente de Dueno a sus datos personales sin atravesar el nodo Persona. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de Dueno. |

**Índices:** `PRIMARY KEY (id)`, `UNIQUE KEY (persona_fisica_id)`

**Reglas de negocio:**
- No lleva `fecha_modificacion` ni `fecha_baja` propias: la baja de la cuenta se maneja vía `Usuario.estado` (`SUSPENDIDO`/`INACTIVO`), igual que `Cliente` y `Administrador`.
- Un Dueno puede tener múltiples `Comercio` asociados (relación N:1 nativa desde `Comercio.dueno_id`).
- La vinculación de MercadoPago (`CuentaMercadoPago`) cuelga del Dueno, no de cada comercio: se vincula una sola vez y habilita el cobro en todos sus comercios aprobados.
- `persona_fisica_id` debe corresponder siempre a la misma fila de `PersonaFisica` asociada al `Persona` del cual este `Dueno` desciende (vía `PersonaJuridica.id = Dueno.id = Persona.id`). No se valida a nivel de FK que ambas relaciones apunten al mismo `Persona.id` — es responsabilidad del `RegistroService` garantizarlo al crear ambas filas en la misma transacción de registro.

---

## 4. Módulo Comercio

---

### Tabla: Comercio

**Descripción:** Entidad principal que representa a un comercio gastronómico en la plataforma. Vinculado a un `Dueno` como titular. Un mismo Dueno puede administrar varios comercios (relación N:1). Tiene estado propio que puede ser afectado automáticamente por el estado de su Dueno titular. Los motivos y fechas de cada transición de estado se registran exclusivamente en `HistorialEstadoComercio`; esta tabla conserva únicamente el estado operacional actual y los atributos que no tienen naturaleza histórica repetible.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del comercio. |
| `dueno_id` | INT | NO | — | FK → Dueno.id, NN | Dueno titular del comercio. Relación N:1: un mismo Dueno puede administrar varios comercios. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre comercial o de fantasía del comercio. Único en toda la plataforma desde la v1.22 (ver `nombre_unico`). |
| `nombre_unico` | VARCHAR(150) | SÍ | generada | UQ, columna generada `STORED`, `utf8mb4_unicode_ci` | Agregada en la migración `V37` (2026-10-19). Vale `TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' '))` y es `NULL` mientras `estado = RECHAZO_DEFINITIVO`. Con esa colación el índice único ignora mayúsculas y tildes y trata la `ñ` como `n`; los espacios de más (también tabulaciones y espacios no cortantes) se colapsan. Solo `RECHAZO_DEFINITIVO` libera el nombre; un `RECHAZADO` lo conserva. La aplicación no la lee ni la escribe: la usan el índice y la consulta de disponibilidad (`NombreComercioService`), con la misma expresión. |
| `descripcion` | TEXT | SÍ | NULL | — | Descripción libre del comercio: propuesta de valor, especialidades, etc. |
| `foto_perfil_url` | VARCHAR(500) | NO | — | NN | URL del logo/imagen de perfil del comercio almacenada en Cloudinary. Campo propio de cada comercio: no se comparte entre los distintos comercios de un mismo Dueno, a diferencia de `Usuario.foto_perfil_url` (foto personal del Dueno/Empleado). |
| `telefono` | VARCHAR(30) | NO | — | NN | Teléfono de contacto del comercio. Se usa para generar enlace `wa.me`. |
| `email` | VARCHAR(150) | SÍ | NULL | — | Email de contacto del comercio (puede ser distinto al email del Dueno titular). Desde la v1.21 ya no se pide: los comercios nuevos quedan en `NULL` y los anteriores conservan su valor, visible solo para el Administrador. |
| `tipo_comercio` | ENUM TipoComercio | NO | — | NN | Categoría del negocio (ver ENUM TipoComercio, 13 valores). Clasificación informativa y visual; no altera funcionalidades. |
| `acepta_delivery` | TINYINT(1) | NO | `false` | NN | `true` si el comercio ofrece entrega a domicilio. |
| `acepta_retiro` | TINYINT(1) | NO | `false` | NN | `true` si el comercio permite retiro en el local. |
| `estado` | ENUM EstadoComercio | NO | `'PENDIENTE'` | NN | Estado operacional actual del comercio. Consultado en cada validación de pedido. |
| `suspension_origen` | ENUM('INDIVIDUAL','DUENO') | SÍ | NULL | CHECK `ck_comercio_suspension` | Agregada en la `V45`. Quién originó la suspensión vigente: `INDIVIDUAL` (el Administrador suspendió este comercio) o `DUENO` (se suspendió al Dueño titular, tramo S3). `NULL` salvo con `estado = 'SUSPENDIDO'`. Un comercio `DUENO` no se levanta individualmente. |
| `suspendido_desde` | DATETIME | SÍ | NULL | CHECK `ck_comercio_suspension` | Agregada en la `V45`. Cuándo empezó la suspensión vigente, con el reloj de la aplicación. De esta fecha salen los dos topes de 90 minutos; volver a suspender un comercio ya suspendido (de origen `DUENO` a `INDIVIDUAL`) la conserva. |
| `motivo_suspension` | VARCHAR(500) | SÍ | NULL | CHECK `ck_comercio_suspension` | Agregada en la `V45`. Motivo de la suspensión vigente (10 a 500 caracteres, validado en el DTO). Lo ve el Dueño y el Administrador; el Empleado nunca. |
| `cerrado_manualmente` | TINYINT(1) | NO | `false` | NN | `true` si el comerciante cerró manualmente su tienda. Independiente del estado y del horario; se combina con ambos para determinar la disponibilidad real. Solo se puede prender y apagar a mano dentro de una franja de `Horario` y con el comercio `APROBADO` o `APTO_VENTA`; se apaga solo al empezar la primera franja posterior al cierre (ver `HistorialCierreComercio`). Cada cambio deja una fila en `HistorialCierreComercio`, en la misma transacción. |
| `fecha_resolicitud` | DATETIME | SÍ | NULL | — | Fecha y hora de la última re-solicitud: el Dueno corrigió el comercio rechazado y volvió a pedir su aprobación. `NULL` mientras nunca se re-solicitó. Se escribe en la misma transacción que `cantidad_resolicitudes` y que la fila `RECHAZADO → PENDIENTE` del historial. |
| `cantidad_resolicitudes` | INT | NO | `0` | NN | Cuántas veces el Dueno volvió a solicitar la aprobación de este comercio. Es igual a la cantidad de filas `RECHAZADO → PENDIENTE` de `HistorialEstadoComercio` de este comercio (la aplicación mantiene las dos cosas en la misma transacción). Con `0` y `estado = PENDIENTE` es una solicitud nueva; con más de `0`, una re-solicitud: la bandeja del Administrador las muestra por separado. Tope: `comercio.resolicitudes.max` (3). Migración `V25`. |
| `mp_vinculado` | TINYINT(1) | NO | `false` | NN | Columna existente en el schema (`V1`) **sin uso en el código**: ninguna Entity ni Service la lee ni la escribe (queda en su default). Su función la cumple el estado `APTO_VENTA` de `estado` (ver ENUM EstadoComercio). Se conserva por compatibilidad con el diseño original. |
| `fecha_registro` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del comercio en el sistema. Inmutable. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación del perfil del comercio (nombre, descripción, teléfono, foto, modalidades). |

> **Campos eliminados en v1.1:** `motivo_rechazo`, `fecha_rechazo`, `motivo_suspension`, `fecha_suspension`, `fecha_aprobacion`, `fecha_reactivacion`. Todos se obtienen desde `HistorialEstadoComercio` con `WHERE comercio_id = ? AND estado_destino = 'RECHAZADO' ORDER BY fecha_hora DESC LIMIT 1` (o el `estado_destino` correspondiente).

**Índices:** `PRIMARY KEY (id)` | `INDEX (dueno_id)` | `INDEX (estado)` | `UNIQUE uq_comercio_nombre_unico (nombre_unico)` | `INDEX idx_comercio_suspension (dueno_id, estado, suspension_origen)`

**Reglas de negocio:**
- Nombre único (v1.22): ningún otro comercio, de cualquier Dueño y en cualquier dirección, puede tener el mismo nombre, salvo uno en `RECHAZO_DEFINITIVO`. Se valida antes de escribir en el registro, el alta adicional, la corrección y la edición del perfil (`409` "Ya existe un comercio con ese nombre. Elegí otro."), con el índice como red de seguridad ante cargas simultáneas. La cuenta de un Dueño sin verificar también retiene el nombre.
- Implementado: un comercio puede recibir pedidos si `estado = APTO_VENTA AND cerrado_manualmente = false AND hora actual dentro de Horario` (`ComercioService.validarAceptaPedidos`, horario evaluado con offset fijo -03:00; una franja que cierra a las 23:59 se interpreta como fin del día).
- Diseño pendiente de implementar: además `Dueno titular con Usuario.estado = ACTIVO` como condición propia (hoy se cubre por propagación de estado).
- Cierre manual: cerrar y abrir solo se puede dentro de una franja, con el comercio `APROBADO` o `APTO_VENTA` (409 si no). Cerrar solo frena pedidos nuevos (agregar al carrito y confirmar el pedido): los pedidos en curso, los productos, los pagos y el flujo del comercio siguen igual. Cerrar o abrir dos veces seguidas no escribe una segunda fila de historial.
- Reapertura automática: un job (cada 60 segundos) apaga `cerrado_manualmente` cuando empieza la primera franja posterior al momento del cierre (la fecha y hora de la última fila `CERRADO` de `HistorialCierreComercio`), y escribe una fila `REABIERTO` de `SISTEMA`. Si el backend estuvo caído, se pone al día al arrancar.
- Limitación conocida: las franjas que cruzan la medianoche se cargan como dos filas y no se unen, y una franja partida tiene dos filas del mismo día. Un cierre manual hecho en el primer tramo se reabre al empezar el segundo.
- Propagación automática desde el estado del `Usuario` del Dueno titular hacia los comercios que administra: `BLOQUEADO → CERRADO_TEMPORALMENTE` solo para los comercios en `APTO_VENTA` (cada uno deja su fila de historial; un `APROBADO` y los demás estados no cambian; el estado de cada comercio se vuelve a leer con bloqueo de fila antes de decidir); `INACTIVO → INACTIVO`; `SUSPENDIDO → SUSPENDIDO`.
- Regla del bloqueo vigente: con el `Usuario` del Dueno en `BLOQUEADO`, ningún camino deja un comercio en `APTO_VENTA`. La aprobación del Administrador (si el Dueno tiene `CuentaMercadoPago` activa) y la vinculación de MercadoPago (sobre los comercios `APROBADO`) leen el estado del `Usuario` con bloqueo compartido de fila **antes** de tocar la cuenta de cobro y el comercio (orden de bloqueo `usuario` → `cuenta_mercado_pago` → `comercio`) y, si está `BLOQUEADO`, dejan el comercio en `CERRADO_TEMPORALMENTE` sin pasar por `APTO_VENTA`: la aprobación deja la fila `PENDIENTE → APROBADO` (con el Administrador) y una segunda fila automática `APROBADO → CERRADO_TEMPORALMENTE` con el motivo "Bloqueo de cuenta vigente al aprobar"; la vinculación deja una fila automática `APROBADO → CERRADO_TEMPORALMENTE` con el motivo "Bloqueo de cuenta vigente al vincular Mercado Pago". Un comercio que no llegaría a `APTO_VENTA` (por ejemplo un `APROBADO` sin cuenta de cobro) no cambia. Al desbloquear, la restauración de siempre lo lleva a `APTO_VENTA` o `APROBADO` según la cuenta activa.
- Al recuperar contraseña (desbloqueo del Dueno): se restaura automáticamente el estado de los comercios de ese Dueno que estuvieran en `CERRADO_TEMPORALMENTE`: a `APTO_VENTA` si el Dueno tiene una `CuentaMercadoPago` activa, o a `APROBADO` si no.
- Al reactivarse la cuenta del Dueno (token de reactivación): se restaura automáticamente el estado de los comercios de ese Dueno que estuvieran en `INACTIVO`: a `APTO_VENTA` si el Dueno tiene una `CuentaMercadoPago` activa, o a `APROBADO` si no.
- La suspensión de un comercio puntual por el Administrador es una acción a nivel `Comercio`: cambia el estado de ese comercio a `SUSPENDIDO` sin alterar el estado del Dueno ni el de sus demás comercios, y sin tocar ningún pedido (v1.30). Al levantarla el destino lo decide `AptitudVentaComercioService` con la regla de seguir vendiendo.
- Los cambios de estado sobre la cuenta de un Empleado no propagan ningún efecto sobre los comercios donde opera.
- Para obtener el motivo y fecha del último rechazo: `SELECT motivo, fecha_hora FROM HistorialEstadoComercio WHERE comercio_id = ? AND estado_destino = 'RECHAZADO' ORDER BY fecha_hora DESC LIMIT 1`.
- Para obtener el motivo y fecha de la última suspensión: ídem con `estado_destino = 'SUSPENDIDO'`.
- Para obtener la fecha de la última aprobación o reactivación: ídem con `estado_destino = 'APROBADO'`.
- Corrección y re-solicitud (multi-comercio, tramo 3A): solo el Dueno del comercio, solo mientras está `RECHAZADO`, siempre sobre el mismo comercio. Corrige todos los datos del negocio y, solo si nunca tuvo un comercio aprobado, también los datos fiscales y del representante; usuario, email de la cuenta y contraseña no se tocan. Un reenvío sin ningún dato cambiado se rechaza. Cada reenvío deja una fila `RECHAZADO → PENDIENTE` (sin administrador, motivo "Nueva solicitud del Dueño") y un registro por campo cambiado en `HistorialCambioComercio`. No se avisa al Administrador: la re-solicitud aparece en su bandeja.
- Un `RECHAZO_DEFINITIVO` no se puede suspender ni lo mueve el bloqueo o la restauración de cuenta del Dueno, y cuenta como duplicado ("mismo nombre en la misma dirección") al agregar otro comercio; un `RECHAZADO` no cuenta como duplicado.
- Elegibilidad para agregar un comercio adicional: el Dueno tiene al menos un comercio `APROBADO` o `APTO_VENTA`, o tiene al menos un comercio y todos están en `RECHAZO_DEFINITIVO`. Cualquier otra combinación no es elegible.

---

### Tabla: Horario

**Descripción:** Franjas horarias de atención del comercio por día de la semana. Un comercio puede tener múltiples registros por día (horario partido) o uno por cada día que opere.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de horario. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio al que pertenece este horario. |
| `dia_semana` | ENUM DiaSemana | NO | — | NN | Día de la semana al que aplica la franja horaria. |
| `hora_apertura` | TIME | NO | — | NN | Hora de inicio de la franja de atención. Formato `HH:MM:SS`. |
| `hora_cierre` | TIME | NO | — | NN | Hora de fin de la franja de atención. Formato `HH:MM:SS`. Si es menor que la apertura, el turno termina al día siguiente. |
| `vigente_desde` | DATE | NO | `2000-01-01` | NN | Primer día en que rige la fila. Una edición inserta lo nuevo con la fecha de mañana. |
| `vigente_hasta` | DATE | SÍ | NULL | CHECK `>= vigente_desde` | Último día en que rige la fila (inclusivo). `NULL` mientras siga vigente. |

**Índices:** `PRIMARY KEY (id)` | `INDEX idx_horario_comercio_vigencia (comercio_id, vigente_desde, vigente_hasta)`

**Reglas de negocio:**
- Se pueden definir múltiples registros por día para cubrir horarios partidos (ej. mediodía y noche).
- El sistema compara la hora actual del comercio (`America/Argentina/Ushuaia`) contra las franjas vigentes de hoy y contra la cola de los turnos de ayer que cruzan la medianoche para determinar si el comercio está "dentro del horario".
- Una franja cuyo cierre es menor que su apertura es un turno que cruza la medianoche; `cierre = apertura` se rechaza (las 24 horas se cargan de 00:00 a 23:59, y `23:59` vale `24:00` en una franja que no cruza). Las franjas no pueden superponerse entre sí en una semana circular (el domingo que cruza choca con el lunes).
- La edición (Dueño o Empleado) no modifica filas: cierra las vigentes y agrega las nuevas desde mañana. Siempre queda al menos una fila vigente en cada fecha. El registro y la corrección de un comercio rechazado siguen escribiendo sin versionado.

---

### Tabla: RedSocial

**Descripción:** Links de contacto y redes sociales cargados manualmente por el comercio (solo el Dueno: no es una acción delegable al Empleado), visibles en su perfil público. No implica integración OAuth ni sincronización automática con las plataformas externas — ver aclaración en Alcance y Limitaciones.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del link. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio Dueno del link. |
| `tipo` | ENUM TipoRedSocial | NO | — | NN | Plataforma o canal del link. |
| `url` | VARCHAR(500) | NO | — | NN | Link completo. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última edición de la url. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Baja lógica, si el comercio elimina el link. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)` | `UNIQUE (comercio_id, tipo)`

**Reglas de negocio:**
- El `UNIQUE (comercio_id, tipo)` aplica solo a filas activas (`fecha_baja IS NULL`) a nivel de validación de aplicación, no como constraint SQL — permite recargar un tipo de red social dado de baja anteriormente.
- Mínimo 1 fila por `comercio_id`, validado a nivel aplicación.

---

### Tabla: CuentaMercadoPago

**Descripción:** Credenciales OAuth del Dueno en MercadoPago bajo el modelo Marketplace con split de pagos. Se vincula una única vez por Dueno y habilita el cobro en todos los comercios que administra. El `access_token` permite al backend crear preferencias de pago de Checkout Pro con `marketplace_fee` en nombre de esos comercios.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `dueno_id` | INT | NO | — | FK → Dueno.id, NN, UQ | Dueno al que pertenece la cuenta vinculada. UNIQUE: un solo registro por Dueno, compartido por todos sus comercios. Un Dueno tiene una sola cuenta de MercadoPago activa: con una activa no puede iniciar otra vinculación ni vincular otra distinta sin desvincular antes. |
| `mp_user_id` | VARCHAR(50) | NO | — | NN | ID del usuario en la plataforma de MercadoPago (obtenido durante el flujo OAuth). Una misma cuenta no puede estar activa en dos Dueños a la vez (ver `mp_user_id_activo`); una fila inactiva de otro Dueno con el mismo `mp_user_id` no cuenta. |
| `access_token` | VARCHAR(500) | NO | — | NN | Token de acceso OAuth para llamadas a la API de MP en nombre del Dueno. Sensible: se guarda cifrado con AES-GCM (IV aleatorio de 12 bytes prefijado al texto cifrado; clave en la variable de entorno `MERCADOPAGO_TOKEN_ENCRYPTION_KEY`; conversor `MercadoPagoTokenConverter`). La columna se amplió a `VARCHAR(500)` en la migración `V11` para alojar el texto cifrado. |
| `refresh_token` | VARCHAR(500) | NO | — | NN | Token de renovación OAuth para obtener un nuevo `access_token` antes de que expire. Sensible: se guarda cifrado igual que `access_token`. No se usa: la renovación (refresh) no está implementada. |
| `public_key` | VARCHAR(255) | SÍ | NULL | — | Clave pública del Dueno en MercadoPago. Puede usarse para inicializar el SDK en el frontend. |
| `activa` | TINYINT(1) | NO | `true` | NN | `true` si la vinculación está activa. Pasa a `false` al desvincular. |
| `es_cuenta_prueba` | TINYINT(1) | NO | `false` | NN | `true` si la cuenta se vinculó pidiendo credenciales de sandbox (`test_token=true` en el `POST /oauth/token`). Es el mismo valor que Bajoneá manda en el intercambio OAuth, guardado como dato propio porque el prefijo del `access_token` (`APP_USR-`/`TEST-`) no determina el entorno. Decide `init_point` vs `sandbox_init_point`. El default solo rellena filas previas a la migración `V16`; el código lo setea siempre de forma explícita. |
| `fecha_vinculacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora en que el Dueno completó el flujo OAuth exitosamente. |
| `fecha_desvinculacion` | DATETIME | SÍ | NULL | — | Fecha y hora en que el Dueno desvinculó su cuenta. Se popula al desvincular. |
| `token_expira` | DATETIME | SÍ | NULL | — | Fecha y hora de expiración del `access_token`. Se calcula con `expires_in` de la respuesta OAuth (~6 meses). El diseño prevé renovar antes de que venza, pero el refresh no está implementado: un token vencido no se renueva. |
| `mp_user_id_activo` | VARCHAR(50) | SÍ | generada | UQ, columna generada `STORED` | Agregada en la migración `V27` (2026-10-03, multi-comercio tramo 5). Vale `mp_user_id` mientras `activa = 1` y `NULL` si no: `GENERATED ALWAYS AS (CASE WHEN activa = 1 THEN mp_user_id ELSE NULL END) STORED`. Su `UNIQUE` impide que una misma cuenta de MercadoPago esté activa en dos Dueños a la vez y deja convivir filas inactivas (los `NULL` no chocan). La entidad JPA no la mapea y la aplicación nunca la escribe. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (dueno_id)` | `UNIQUE uq_cuenta_mp_user_id_activo (mp_user_id_activo)`

**Reglas de negocio:**
- Al desvincular: `activa = false`, `fecha_desvinculacion = NOW()`; **todos** los comercios del Dueno que estuvieran en `APTO_VENTA` vuelven a `APROBADO`, con una fila de `historial_estado_comercio` por comercio (`ComercioService.desactivarAptoVenta`). Los tokens guardados no se borran. Se rechaza con `409` mientras algún comercio del Dueno tenga pedidos en `PENDIENTE_PAGO` (un cliente podría estar pagando contra esa cuenta): el error trae la hora aproximada para reintentar (fecha de creación del pedido más reciente más `pedido.timeout.pago-minutos`). Los demás pedidos en curso (`PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`) siguen su flujo; un reembolso posterior con la cuenta inactiva nace `PENDIENTE_REVISION_MANUAL`. Orden de bloqueo: cuenta, comercios (`FOR UPDATE`), pedidos `PENDIENTE_PAGO` (lectura con bloqueo compartido, filas y no un conteo).
- Al vincular (nueva o renovación): `activa = true`; **todos** los comercios del Dueno que estuvieran en `APROBADO` pasan a `APTO_VENTA` (`ComercioService.activarAptoVenta`). La vinculación usa OAuth `authorization_code` con PKCE (ver `CodigoVinculacionMp`). Volver a vincular la misma cuenta es idempotente y refresca los datos; vincular otra distinta con una activa da `409`; vincular una cuenta activa en otro Dueno da `409` sin revelar quién la tiene (la violación de `uq_cuenta_mp_user_id_activo` en una carrera se traduce a ese mismo error).
- Crear un pedido lee el estado del comercio con bloqueo compartido y revalida `APTO_VENTA` dentro de la transacción, así que nunca queda un pedido nuevo sobre una cuenta ya desvinculada.
- Con más de un comercio, la cuenta sigue siendo una sola por Dueno y alcanza a todos los comercios aprobados. Cuando `APTO_VENTA` exija además documentación, una etiqueta de "falta vincular cobro" tendrá que leer la cuenta del Dueno y no solo el estado del comercio.

---

### Tabla: CodigoVinculacionMp

**Descripción:** Intento de vinculación OAuth (`authorization_code` con PKCE) de la cuenta de MercadoPago de un Dueno. Guarda el `code_verifier` de PKCE entre el momento en que se genera la URL de autorización y el callback de MercadoPago (migración `V13`). Al iniciar un intento nuevo se eliminan los pendientes del mismo Dueno.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del intento. |
| `dueno_id` | INT | NO | — | FK → Dueno.id, NN | Dueno que inició la vinculación. |
| `identificador_intento` | VARCHAR(64) | NO | — | NN, UQ | Valor `state` enviado a MercadoPago y devuelto en el callback; identifica el intento. |
| `codigo_verificacion` | VARCHAR(128) | NO | — | NN | `code_verifier` de PKCE. Sensible. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del intento. |
| `usado` | TINYINT(1) | NO | `false` | NN | `true` una vez procesado el callback; se marca antes de intercambiar el código por el token, de modo que un intento no puede usarse dos veces. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (identificador_intento)` | `INDEX (dueno_id)`

---

### Tabla: EmpleadoComercio

**Descripción:** Tabla puente M:N entre `Empleado` y `Comercio`. Cada fila representa la relación entre un empleado y un comercio puntual, controlada de forma independiente por el Dueno de ESE comercio — no afecta las relaciones del empleado con otros comercios, incluso si pertenecen a otro Dueno. **La fila nace al aceptar una invitación** (ver `InvitacionEmpleado`), ya en estado `ACTIVO`; si la relación ya existía, la misma fila se reactiva.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la relación. |
| `empleado_id` | INT | NO | — | FK → Empleado.id, NN | Empleado vinculado al comercio. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio donde opera el empleado. |
| `estado` | ENUM EstadoEmpleadoComercio | NO | `'ACTIVO'` (desde `V29`) | NN | Estado de la relación empleado-comercio: `ACTIVO` o `INACTIVO`. |
| `fecha_alta` | DATETIME | NO | `NOW()` | NN | Fecha y hora de la creación de la fila, que desde `V29` coincide con la primera aceptación de la invitación. Una reactivación no la cambia (queda en el historial). |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora en que la relación pasó a `INACTIVO` (baja del Dueno o renuncia). Se vuelve a `NULL` al reactivar. El motivo y el actor quedan en `HistorialEmpleadoComercio`. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (empleado_id, comercio_id)` | `INDEX (comercio_id)` | `INDEX (empleado_id)`

**Reglas de negocio:**
- **Implementado (migración `V29`, tramo E1):** el ENUM `estado` pasó de `PENDIENTE`/`ACTIVO`/`DESACTIVADO` a `ACTIVO`/`INACTIVO`, con default `ACTIVO`. La migración convierte los `DESACTIVADO` en `INACTIVO` y elimina los `PENDIENTE` (en tres pasos, mismo patrón que `V9`); la tabla no tenía filas. La entidad `EmpleadoComercio` y su repositorio existen; todavía no hay código que cree filas (lo hace la aceptación, bloque A3).
- La relación se crea únicamente al aceptar la invitación. Aceptar con un email sin `Usuario` crea `Usuario`/`PersonaFisica`/`Cliente`/`Empleado` en la misma transacción (con los datos del registro de Cliente y la aceptación de Términos y Condiciones validada en el servidor); con un `Usuario` existente alcanza con email y código y solo se agrega la fila de `Empleado` (si falta) y esta relación.
- El `Dueno` puede pasar la relación a `INACTIVO` en cualquier momento (motivo `BAJA_DUENO`) y reactivarla directamente, sin código, solo si él mismo la dio de baja. El empleado puede renunciar por su cuenta en cualquier momento (motivo `RENUNCIA`, sin importar el estado del comercio). Si el empleado renunció o la invitación se canceló, hace falta una invitación nueva, que reutiliza la misma fila. Ninguna de estas acciones afecta los otros comercios donde el empleado esté `ACTIVO`.
- La autorización del Empleado se comprueba contra esta tabla en cada request (relación `ACTIVO` del usuario autenticado con el comercio del encabezado `X-Comercio-Id`); si no corresponde, la respuesta es la misma que para un comercio inexistente.
- Los cambios de estado del comercio (suspensión, cierre temporal, inactivación) no tocan las filas de esta tabla.
- No lleva `fecha_modificacion`: los cambios y su autor se registran en `HistorialEmpleadoComercio`.

---

### Tabla: InvitacionEmpleado

> **Implementada — migración `V30`, tramo E1 (bloques A1 y A2, 2026-10-06).** Entidad `InvitacionEmpleado`, repositorios `InvitacionEmpleadoRepository` e `InvitacionInsercionRepository` (inserción por JDBC con reintento ante colisión de código, mismo patrón que `TokenInsercionRepository`) y servicio `InvitacionEmpleadoService`. Sin endpoints todavía.

**Descripción:** Una fila por cada **envío** de una invitación para operar un comercio como Empleado. Vive en una estructura propia y no en `Token` porque el invitado puede no tener cuenta (`Token.usuario_id` es obligatorio) y porque cada envío necesita su propio ciclo de vida. Reenviar crea una fila nueva y deja la anterior en `REEMPLAZADA` solo si era una `PENDIENTE` vigente. El invitado se identifica con su email y el código de 6 dígitos que llegó en el texto del email.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la invitación. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio al que se invita (la invitación es por comercio). |
| `email` | VARCHAR(254) | NO | — | NN | Email invitado, normalizado (sin espacios y en minúsculas). No es FK a `Usuario`: la persona puede no tener cuenta. |
| `codigo` | CHAR(6) | NO | — | NN | Código de 6 dígitos, en texto plano (igual que `Token.token`). |
| `estado` | ENUM EstadoInvitacionEmpleado | NO | `'PENDIENTE'` | NN | Estado de la invitación. |
| `intentos_fallidos` | INT | NO | `0` | NN | Intentos fallidos de ingresar el código; al quinto la invitación pasa a `INVALIDADA`. |
| `invitado_por_usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario (Dueno) que envió la invitación. |
| `usuario_aceptante_id` | INT | SÍ | NULL | FK → Usuario.id | Usuario que la aceptó; `NULL` hasta que se acepta. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora del envío. |
| `fecha_vencimiento` | DATETIME | NO | — | NN | Vence a los 7 días de la creación. |
| `fecha_resolucion` | DATETIME | SÍ | NULL | — | Fecha y hora en que dejó de estar pendiente (aceptada, cancelada, reemplazada, invalidada o marcada vencida). |
| `pendiente_clave` | TINYINT(1) GENERATED STORED | SÍ | — | — | Columna generada: vale `1` si `estado = 'PENDIENTE'` y `NULL` en cualquier otro caso. Solo sirve para los dos únicos parciales de abajo (mismo patrón que `CuentaMercadoPago.mp_user_id_activo`). La entidad no la mapea. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (comercio_id, email, pendiente_clave)` | `UNIQUE (email, codigo, pendiente_clave)` | `INDEX (comercio_id, fecha_creacion)` | `INDEX (email, estado)` | `INDEX (invitado_por_usuario_id)` | `INDEX (usuario_aceptante_id)`

**Reglas de negocio:**
- A lo sumo una invitación `PENDIENTE` por (comercio, email), y un código no se repite entre las invitaciones `PENDIENTE` de un mismo email; dos reenvíos simultáneos no pueden dejar dos pendientes del mismo par.
- Tope de 5 envíos por hora por comercio: se cuenta `COUNT(*)` de las filas con `comercio_id = ?` y `fecha_creacion` dentro de la última hora, cada envío o reenvío es una fila. Para que el tope sea exacto se serializa por el Dueno que invita.
- Solo se crea con el comercio `APROBADO` o `APTO_VENTA`. Si el email pertenece a un Dueno o a un Administrador, o a una cuenta bloqueada, suspendida, inactiva o sin verificar, no se crea la invitación (ver T35 y la regla de combinaciones, sección 12).
- Aceptar identifica por email y código leyendo las invitaciones `PENDIENTE` del email con bloqueo; una aceptación simultánea con una cancelación o un reenvío deja un solo ganador y las demás reciben el mismo error genérico. La matriz de roles se revalida al aceptar.
- "Vencida" es un estado guardado: un proceso automático (cada minuto) pasa a `VENCIDA` las `PENDIENTE` con `fecha_vencimiento` pasada (red de seguridad si se atrasa: el listado la informa como vencida e invitar o reenviar al mismo email la pasan a `VENCIDA`). Cancelar acepta `PENDIENTE`, `VENCIDA` e `INVALIDADA`. El listado de solicitudes de "Ver equipo" devuelve una línea por email, la de su invitación más reciente, si está `PENDIENTE`, `VENCIDA` o `INVALIDADA`; una `ACEPTADA` pasa a "Mi equipo" y las `CANCELADA` y `REEMPLAZADA` no se muestran. El historial registra hoy el envío (`INVITACION`) y la cancelación (`INVITACION_CANCELADA`).
- Hoy, al invitar o reenviar, el servicio toma primero la fila de `usuario` del Dueno en modo exclusivo (serializa el tope de 5 por hora y toda la secuencia comprobar-y-escribir), después las invitaciones del par comercio y email y, al final, lee el estado del comercio con bloqueo compartido; al cancelar toma la fila del Dueno en modo compartido y después la invitación. Reenviar acepta invitaciones `PENDIENTE` (vigentes o vencidas), `VENCIDA` e `INVALIDADA`: deja `REEMPLAZADA` solo a la `PENDIENTE` todavía vigente, marca `VENCIDA` a una `PENDIENTE` pasada de fecha y no toca a las `VENCIDA` ni a las `INVALIDADA`; cancelar acepta `PENDIENTE`, `VENCIDA` e `INVALIDADA`. Reenviar y cancelar solo actúan sobre la invitación más reciente (mayor `id`) del par comercio y email, sea cual sea su estado: si existe una más nueva responden `409` sin escribir nada (ni estado ni historial). La comprobación se hace con la fila del Dueno ya bloqueada y la invitación bloqueada por clave primaria, así que ninguna invitación nueva del par puede aparecer mientras dura la transacción; no agrega bloqueos.
- La invitación solo se crea si el email no pertenece a un Dueno o Administrador, no es ya miembro `ACTIVO` del comercio y la cuenta (si existe) está `ACTIVO`. En los casos de rechazo por rol o por cuenta no activa el Dueno recibe siempre el mismo `409` genérico, y las filas de regularización se escriben aunque haya `409` (`noRollbackFor` de la excepción específica, no de clase).
- Orden de bloqueo del tramo: `usuario` (en `id` ascendente si son dos) → `invitacion_empleado` → `empleado_comercio` → `comercio` (compartido).

---

### Tabla: HistorialEmpleadoComercio

> **Implementada — migración `V31`, tramo E1 (bloque A1, 2026-10-06)**; las pantallas llegan en el tramo E4. Tabla física `historial_empleado_comercio`; entidad `HistorialEmpleadoComercio` y repositorio con consulta por comercio.

**Descripción:** Registro append-only de los eventos del equipo de un comercio: invitación, aceptación, invitación cancelada, baja del Dueno, renuncia y reactivación, con quién lo hizo y cuándo. Los eventos de invitación ocurren cuando la fila de `EmpleadoComercio` todavía no existe (cuenta nueva) o sin transición de estado, por eso cuelga de la relación **o** de la invitación (ambas FK nulables).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio del equipo. Repetido a propósito para listar el historial de un comercio sin joins. |
| `empleado_comercio_id` | INT | SÍ | NULL | FK → EmpleadoComercio.id | Relación afectada, en los eventos que la tienen. |
| `invitacion_id` | INT | SÍ | NULL | FK → InvitacionEmpleado.id | Invitación afectada, en los eventos de invitación. |
| `estado_origen` | ENUM EstadoEmpleadoComercio | SÍ | NULL | — | Estado de la relación antes del evento; `NULL` si no hay transición. |
| `estado_destino` | ENUM EstadoEmpleadoComercio | SÍ | NULL | — | Estado de la relación después del evento; `NULL` si no hay transición. |
| `motivo` | ENUM MotivoHistorialEmpleado | NO | — | NN | Evento: `INVITACION`, `ACEPTACION`, `INVITACION_CANCELADA`, `BAJA_DUENO`, `RENUNCIA` o `REACTIVACION`. Sin motivo escrito en texto libre. |
| `actor_usuario_id` | INT | SÍ | NULL | FK → Usuario.id | Quien ejecutó el evento. Hoy todos tienen actor; `NULL` queda permitido por si más adelante hay un actor del sistema. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora del evento. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id, fecha_hora)` | `INDEX (empleado_comercio_id)` | `INDEX (invitacion_id)` | `INDEX (actor_usuario_id)` | `CHECK (empleado_comercio_id IS NOT NULL OR invitacion_id IS NOT NULL)`

**Reglas de negocio:**
- Tabla append-only: nunca se modifica ni se elimina un registro.
- **Motivo de la última baja (v1.18):** el listado del equipo informa `motivoBaja` y `puedeReactivar` de cada miembro `INACTIVO`. No son columnas: el motivo es el de la fila de mayor `id` de la relación cuyo `estado_destino` es `INACTIVO` (`BAJA_DUENO` o `RENUNCIA`), leído para todas las relaciones inactivas del comercio en una sola consulta; `puedeReactivar` es verdadero solo si ese motivo es `BAJA_DUENO`. Una relación que quedó inactiva sin ninguna fila de baja (por ejemplo, las que deja el atajo de test sin `motivo`) tiene `motivoBaja` nulo y no se puede reactivar directamente: hace falta una invitación nueva. La reactivación directa responde `409` con código estable si la persona renunció o no hay registro de la baja (`EMPLEADO_NO_REACTIVABLE`), si tiene una invitación pendiente vigente en ese comercio (`INVITACION_PENDIENTE`) o si el comercio no está operativo (`COMERCIO_NO_OPERATIVO`), y con un `409` genérico sin código si la cuenta no es apta (rol, estado o edad), sin revelar cuál.
- `INVITACION` e `INVITACION_CANCELADA` cuelgan de `invitacion_id` (origen y destino nulos); `ACEPTACION`, `REACTIVACION`, `BAJA_DUENO` y `RENUNCIA` cuelgan de la relación, con origen y destino. Un evento repetido sobre una relación que ya está en el estado destino (por ejemplo, desactivar dos veces) no escribe una segunda fila.
- La ven el Dueno del comercio y, en solo lectura, el Administrador; el Empleado no. Desde el bloque A3 de E4 las dos vistas leen estas filas en la lista de actividad (fuente `EQUIPO`, ver v1.20) y el Administrador además lee el equipo con `GET /api/v1/administrador/comercios/{id}/equipo`. La lista no muestra las filas `REACTIVACION` que llevan `invitacion_id` (las que escribe aceptar una invitación estando inactivo): ya figuran como la `ACEPTACION` de la misma hora.

---

### Tabla: HistorialEdicionComercio

> **Implementada — migración `V32` (tramo E3, bloque A1, 2026-10-12).** Tabla física `historial_edicion_comercio`, entidad `HistorialEdicionComercio`. Reemplaza, por decisión del 2026-10-12, a la `ActividadComercio` propuesta antes.

**Descripción:** Registro de solo inserción de quién hizo qué cambio sobre el catálogo y el perfil del comercio y cuándo: altas, ediciones, bajas y cambios de estado de productos, imágenes, perfil y horarios, hechos por el Dueno o por un Empleado. No guarda valores anteriores. No registra pedidos ni cierres y aperturas, porque ya tienen su propio historial (`HistorialEstadoPedido` e `HistorialCierreComercio`); la pestaña Actividad de "Ver equipo" junta las fuentes (pedidos, ediciones, cierres y, desde el bloque A3 de E4, el equipo) en una sola lista por fecha.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio sobre el que se actuó. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario que hizo el cambio. El nombre de quien actuó no se guarda en la fila: se lee de este usuario. |
| `actor_rol` | ENUM(`DUENO`,`EMPLEADO`) | NO | — | NN | Rol con el que actuó. |
| `entidad_tipo` | ENUM TipoEntidadEdicion | NO | — | NN | Tipo de entidad tocada. |
| `entidad_id` | INT | SÍ | NULL | — | Id de la entidad, sin FK (apunta a varias tablas). |
| `entidad_nombre` | VARCHAR(150) | SÍ | NULL | — | Nombre de la entidad en el momento del cambio (snapshot: el producto puede renombrarse o descontinuarse después). |
| `accion` | ENUM AccionEdicion | NO | — | NN | `CREAR`, `EDITAR`, `ELIMINAR` o `CAMBIAR_ESTADO`. |
| `detalle` | VARCHAR(255) | SÍ | NULL | — | Texto breve con los nombres de los campos que cambiaron (por ejemplo, "Editó: descripción, teléfono"); nunca datos personales ni valores. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora del cambio. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id, fecha_hora, id)` | `INDEX (usuario_id)`

**DDL aplicado (migración `V32__crear_historial_edicion_comercio.sql`):**

```sql
CREATE TABLE `historial_edicion_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `actor_rol` enum('DUENO','EMPLEADO') NOT NULL,
  `entidad_tipo` enum('PRODUCTO','IMAGEN_PRODUCTO','COMERCIO','HORARIO','RED_SOCIAL','GRUPO_EXTRA','EXTRA') NOT NULL,
  `entidad_id` int(11) DEFAULT NULL,
  `entidad_nombre` varchar(150) DEFAULT NULL,
  `accion` enum('CREAR','EDITAR','ELIMINAR','CAMBIAR_ESTADO') NOT NULL,
  `detalle` varchar(255) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hed_comercio_fecha` (`comercio_id`,`fecha_hora`,`id`),
  KEY `idx_hed_usuario` (`usuario_id`),
  CONSTRAINT `fk_hed_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_hed_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Los nombres de índice y de clave foránea usan el prefijo `hed` y no `hec`: los nombres de restricción son únicos por base y `fk_hec_comercio` ya existe en `historial_estado_comercio`.

**Reglas de negocio:**
- Se escribe desde los servicios, en la misma transacción del cambio (si el cambio falla no queda fila y si la fila no se puede escribir el cambio no se confirma), solo cuando hubo un cambio efectivo. Quien escribe toma primero la fila del usuario que actúa y después la del comercio (orden global de bloqueos): el insert toma bloqueos compartidos por sus dos claves foráneas y, sin ese orden, se cruzaría con el bloqueo de cuenta del Dueno. Cubre las escrituras delegables de productos, imágenes y perfil y las del Dueno que no se delegan (redes sociales), para que la vista del Dueno sea completa. Desde el tramo T1 de la Fase 2 se escriben filas de `HORARIO` (acción `EDITAR`, con la fecha desde la que rige el cambio o la cancelación del cambio programado); no se escriben de `GRUPO_EXTRA` ni `EXTRA` (no existen extras); la fecha es la hora del comercio (UTC-03:00) sin fracciones, como en `HistorialCierreComercio`.
- La ve el Dueno completa (tramo E3) y el Administrador en solo lectura (tramo E4); el Empleado no la ve. La lista `GET /api/v1/comercios/equipo/actividad` junta esta tabla con `HistorialEstadoPedido` (todo lo que el comercio vio de sus pedidos, sea quien sea el actor: Dueno, Empleado, Cliente y sistema, incluida la transición a `PENDIENTE_CONFIRMACION_COMERCIO` que la lista muestra como "Pedido recibido"; no entran el nacimiento en `PENDIENTE_PAGO` ni su vencimiento por falta de pago, `TIMEOUT_PAGO`, y en las filas del sistema no hay nombre ni usuario) y `HistorialCierreComercio` (todas), ordenadas por `(fecha_hora, fuente, id)` descendente y paginadas por cursor; el parámetro opcional `fuente` (`PEDIDO`, `EDICION`, `CIERRE` o, desde el bloque A3 de E4, `EQUIPO`, con las filas de `HistorialEmpleadoComercio`) consulta una sola de las fuentes. Los dos índices de esta tabla y `idx_hci_comercio_fecha` de `HistorialCierreComercio` alcanzan para esa lectura; la parte de pedidos entra por `pedido.comercio_id` (`idx_pedido_comercio`) y `idx_hep_pedido_fecha`.

---

### Tabla: HistorialEstadoComercio

**Descripción:** Registro histórico inmutable de todas las transiciones de estado del comercio. Tabla de detalle 1:N de `Comercio`. Patrón de máquina de estados: registra el estado previo (`estado_origen`) y el estado resultante (`estado_destino`) de cada transición. Hoy se escribe en estos puntos del código: aprobación/rechazo y suspensión por el Administrador, las transiciones automáticas `APROBADO ↔ APTO_VENTA` al vincular o desvincular MercadoPago, el bloqueo de cuenta del Dueno (solo `APTO_VENTA → CERRADO_TEMPORALMENTE`) y su restauración al recuperar la contraseña o reactivar la cuenta, el cierre automático de un comercio que iba a quedar a la venta con el Dueno bloqueado (`APROBADO → CERRADO_TEMPORALMENTE`, motivos "Bloqueo de cuenta vigente al aprobar" y "Bloqueo de cuenta vigente al vincular Mercado Pago"), y la re-solicitud del Dueno (`administrador_id` NULL en las automáticas). Las demás transiciones previstas (levantamiento de suspensión e inactivación) todavía no registran historial. No hay columna de tipo de acción: se deduce de `estado_destino`. Cada registro es de solo inserción; no se modifica ni elimina.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio cuyo estado cambió. |
| `administrador_id` | INT | SÍ | NULL | FK → Administrador.id | Administrador que ejecutó la transición. NULL cuando la transición es automática (sistema). |
| `estado_origen` | ENUM EstadoComercio | NO | — | NN | Estado del comercio antes de la transición. |
| `estado_destino` | ENUM EstadoComercio | NO | — | NN | Estado del comercio después de la transición. |
| `motivo` | VARCHAR(500) | SÍ | NULL | — | Motivo de la transición. Obligatorio para transiciones hacia `RECHAZADO`, `RECHAZO_DEFINITIVO` y `SUSPENDIDO`. Opcional en los demás casos. La re-solicitud del Dueno (`RECHAZADO → PENDIENTE`) lleva el motivo fijo "Nueva solicitud del Dueño". |
| `suspension_origen` | ENUM('INDIVIDUAL','DUENO') | SÍ | NULL | — | Agregada en la `V45`. Origen de la suspensión a la que se refiere la fila: la que empieza (destino `SUSPENDIDO`), la que se convierte (`SUSPENDIDO → SUSPENDIDO`) o la que se levanta (origen `SUSPENDIDO`). `NULL` en las demás transiciones. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora exacta de la transición. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)` | `INDEX (administrador_id)` | `INDEX (fecha_hora)`

**Reglas de negocio:**
- Tabla append-only. Nunca se modifica ni elimina ningún registro.
- `administrador_id = NULL` identifica transiciones automáticas del sistema o hechas por el Dueno (implementado: `APROBADO ↔ APTO_VENTA` al vincular o desvincular MercadoPago, bloqueo y restauración de cuenta, y la re-solicitud `RECHAZADO → PENDIENTE`).
- Las filas nuevas por re-solicitud y por rechazo definitivo (`PENDIENTE → RECHAZO_DEFINITIVO`, con el motivo del Administrador) siguen el mismo esquema; el estado nuevo está en los dos ENUM `estado_origen` y `estado_destino` (migración `V24`).
- La última fila se determina por `fecha_hora` y, a igual `fecha_hora`, por `id` (la columna no guarda fracciones de segundo).
- Para obtener el motivo y fecha del último rechazo: `SELECT motivo, fecha_hora FROM HistorialEstadoComercio WHERE comercio_id = ? AND estado_destino IN ('RECHAZADO', 'RECHAZO_DEFINITIVO') ORDER BY fecha_hora DESC, id DESC LIMIT 1`.
- Para obtener el motivo y fecha de la última suspensión: ídem con `estado_destino = 'SUSPENDIDO'`.

---

### Tabla: HistorialCambioComercio

**Descripción:** Qué datos cambió el Dueno al corregir y volver a solicitar un comercio rechazado: una fila por cada campo que realmente cambió, colgada de la fila `RECHAZADO → PENDIENTE` de `HistorialEstadoComercio` que dejó esa re-solicitud (relación N:1, `ON DELETE CASCADE`). La bandeja de re-solicitudes del Administrador la usa para mostrar "antes y después". Tabla de solo inserción (migración `V26`).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `historial_estado_comercio_id` | INT | NO | — | FK → HistorialEstadoComercio.id, NN, ON DELETE CASCADE | Fila de historial de estados de la re-solicitud a la que pertenece el cambio. |
| `campo` | VARCHAR(40) | NO | — | NN | Dato que cambió. Es un enum Java (`CampoCambioComercio`), no un ENUM de MySQL: `NOMBRE`, `DESCRIPCION`, `TELEFONO`, `EMAIL_CONTACTO`, `TIPO_COMERCIO`, `MODALIDADES`, `FOTO_PERFIL`, `DIRECCION`, `HORARIOS`, `REDES_SOCIALES`, `RAZON_SOCIAL`, `CUIT`, `CONDICION_IVA`, `TIPO_SOCIEDAD`, `DOMICILIO_FISCAL`, `FECHA_INICIO_ACTIVIDADES`, `REPRESENTANTE_NOMBRE`, `REPRESENTANTE_APELLIDO`, `REPRESENTANTE_DNI`, `REPRESENTANTE_TELEFONO`, `REPRESENTANTE_FECHA_NACIMIENTO`. |
| `valor_anterior` | TEXT | SÍ | NULL | — | Valor antes del cambio, como texto legible (la dirección, los horarios, las redes sociales y las modalidades ya serializados). `NULL` si el dato estaba vacío. |
| `valor_nuevo` | TEXT | SÍ | NULL | — | Valor después del cambio, con el mismo formato. `NULL` si el dato se quitó. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (historial_estado_comercio_id, campo)`

**Reglas de negocio:**
- A lo sumo una fila por campo y por re-solicitud (`UNIQUE`). Un campo que no cambió no tiene fila: el valor se compara después de normalizarlo como en el alta (Title Case en nombres y calle, código postal canónico, vacío igual a `NULL`, horas a nivel minuto; horarios y redes como conjuntos ordenados).
- Los datos fiscales y del representante se guardan en texto plano (CUIT y DNI incluidos), igual que en `PersonaJuridica` y `PersonaFisica`, y solo aparecen si el Dueno pudo corregirlos (nunca tuvo un comercio aprobado).
- Para ver lo que cambió en la última re-solicitud: `SELECT campo, valor_anterior, valor_nuevo FROM HistorialCambioComercio WHERE historial_estado_comercio_id = (SELECT MAX(id) FROM HistorialEstadoComercio WHERE comercio_id = ? AND estado_destino = 'PENDIENTE')`.

---

### Tabla: HistorialCierreComercio

**Descripción:** Registro append-only de cada cierre y reapertura del comercio (bandera `Comercio.cerrado_manualmente`): quién, cuándo y qué acción. La reapertura automática usa la última fila `CERRADO` como momento del cierre para calcular cuándo empieza la próxima franja. Migración `V28`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio que se cerró o reabrió. |
| `accion` | ENUM AccionCierre | NO | — | NN | `CERRADO` o `REABIERTO`. |
| `actor_usuario_id` | INT | SÍ | NULL | FK → Usuario.id | Usuario que ejecutó la acción. `NULL` solo cuando `actor_rol = SISTEMA`. |
| `actor_rol` | ENUM ActorCierre | NO | — | NN | `DUENO`, `EMPLEADO` o `SISTEMA`. |
| `fecha_hora` | DATETIME | NO | — | NN | Momento de la acción, en `-03:00`, sin fracciones de segundo. Siempre lo escribe la aplicación (la tabla no tiene `DEFAULT`). En la reapertura automática es la hora real en que corrió el job. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id, fecha_hora)` | `INDEX (actor_usuario_id)` | `CHECK (actor_rol = 'SISTEMA') = (actor_usuario_id IS NULL)` (`ck_hci_actor`).

**Reglas de negocio:**
- Para cada comercio las filas alternan `CERRADO`, `REABIERTO`, `CERRADO`…; la última coincide con `Comercio.cerrado_manualmente`. Se escriben en la misma transacción que la bandera, con el comercio bloqueado `FOR UPDATE`.
- Si un comercio tiene la bandera prendida y ninguna fila `CERRADO` (dato anterior a este tramo), el job lo reabre igual, escribe la fila `REABIERTO` y deja un aviso en el log.
- Para saber cuándo se cerró el comercio: `SELECT fecha_hora FROM HistorialCierreComercio WHERE comercio_id = ? AND accion = 'CERRADO' ORDER BY fecha_hora DESC, id DESC LIMIT 1`.

---

### Tabla: CierreTurno

**Descripción:** Foto de las cifras de un turno terminado de un comercio y estado del email de resumen que se le manda al Dueño. Una fila por turno (`comercio_id`, `turno_fecha`, `horario_id`). La crea un job que corre cada 60 segundos cuando pasaron `fin del turno + 30 minutos` y no queda ningún pedido `PENDIENTE_PAGO` creado antes del fin (con tope de espera de 120 minutos). Las cifras son las mismas que muestra el resumen del turno del panel (`vendido` = suma del `subtotal` de los pedidos facturables; `comision` = suma de su `cargo_servicio_comercio`; `neto = vendido - comision`) y no se recalculan: un pago o una aceptación posteriores al cierre no las cambian. Migración `V41`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del cierre. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio cuyo turno se cerró. |
| `turno_fecha` | DATE | NO | — | NN | Fecha de apertura del turno (un turno que cruza la medianoche conserva la del día en que abrió). |
| `horario_id` | INT | NO | — | FK → Horario.id (sin cascada), NN | Versión de la fila de `Horario` que rigió ese turno. |
| `inicio` | DATETIME | NO | — | NN | Inicio del turno, en `-03:00`. |
| `fin` | DATETIME | NO | — | NN | Fin del turno (`23:59` vale `24:00`; un turno que cruza termina el día siguiente). |
| `cantidad_pedidos` | INT | NO | — | NN | Pedidos del turno de cualquier estado (los que llegaron pagados a ese turno). |
| `vendido` | DECIMAL(14,2) | NO | — | NN | Suma bruta del `subtotal` de los pedidos facturables (`EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `NO_RETIRADO`). |
| `comision` | DECIMAL(14,2) | NO | — | NN | Suma del `cargo_servicio_comercio` de los facturables. |
| `neto` | DECIMAL(14,2) | NO | — | NN | `vendido - comision`. No incluye los pendientes. |
| `pendientes_al_cierre` | INT | NO | — | NN | Pedidos en `PENDIENTE_CONFIRMACION_COMERCIO` de todo el comercio (no solo del turno) al momento del cierre, igual que el contador del panel. Fuera de los montos. |
| `fecha_cierre` | DATETIME | NO | — | NN | Instante de la corrida que creó la fila (el reloj único de la aplicación). |
| `email_estado` | ENUM EstadoEmailCierreTurno | NO | `PENDIENTE` | NN | Estado del email de resumen. |
| `email_intentos` | INT | NO | 0 | NN | Intentos de envío fallidos hasta ahora (sube en cada falla; al llegar a 5 el estado pasa a `FALLIDO`). |
| `email_proximo_intento` | DATETIME | SÍ | NULL | — | A partir de cuándo se reintenta (10, 30, 60 y 60 minutos después de cada falla). `NULL` = ya. |
| `email_envio_iniciado` | DATETIME | SÍ | NULL | — | Cuándo una corrida reclamó la fila (`ENVIANDO`). |
| `email_fecha_envio` | DATETIME | SÍ | NULL | — | Cuándo salió el mail. |
| `email_ultimo_error` | VARCHAR(500) | SÍ | NULL | — | Código HTTP y nombre del error de Resend del último intento fallido, o el motivo de un `OMITIDO`. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE uq_cierre_turno (comercio_id, turno_fecha, horario_id)` | `INDEX idx_cierre_turno_envio (email_estado, email_proximo_intento)` | `INDEX idx_cierre_turno_horario (horario_id)` | `FOREIGN KEY fk_cierre_turno_comercio` | `FOREIGN KEY fk_cierre_turno_horario` (sin cascada).

**Reglas de negocio:**
- Generan cierre los comercios `APTO_VENTA`; los `SUSPENDIDO` y `CERRADO_TEMPORALMENTE` registran el cierre pero su fila nace `OMITIDO` si no hubo pedidos ni pendientes; `APROBADO`, `INACTIVO` y los que nunca vendieron no generan cierre. Un comercio sin franjas vigentes no tiene turnos.
- Se cierran los turnos terminados hace al menos 30 minutos, con fin posterior a los últimos 3 días y posterior al fin del último cierre del comercio. Un comercio sin ningún cierre en los últimos 5 días (por `turno_fecha`) cierra solo su último turno terminado.
- Un mail por Dueño y por corrida con todos sus cierres pendientes, aunque el total sea cero. El estado del envío cambia siempre con una sentencia por clave primaria que repite el estado esperado (`PENDIENTE` → `ENVIANDO` → `ENVIADO`/`PENDIENTE`/`FALLIDO`), así que dos corridas simultáneas nunca pisan el resultado una de la otra.
- Si la cuenta del Dueño no está `ACTIVO` al momento del intento el cierre pasa a `OMITIDO` (se evalúa en cada intento).
- Reencolar un cierre `FALLIDO`: `UPDATE cierre_turno SET email_estado = 'PENDIENTE', email_intentos = 0, email_proximo_intento = NULL, email_ultimo_error = NULL WHERE id = ? AND email_estado = 'FALLIDO'`.

---

### Tabla: DocumentoComercio

**Descripción:** Documento de habilitación de un comercio (libreta sanitaria, carnet de manipulación de alimentos, habilitación comercial u otro) que sube el Dueno y revisa el Administrador. Privado del comercio: lo ven solo el Dueno de ese comercio y el Administrador; el Empleado no. Sin vencimiento. Una fila por archivo subido; un documento rechazado se conserva (el Dueno sube uno nuevo) y no hay tabla de historial aparte. El contenido binario vive en `DocumentoComercioArchivo`. Migración `V43`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del documento. |
| `comercio_id` | INT | NO | — | FK → Comercio.id (sin cascada), NN | Comercio al que pertenece. |
| `tipo` | ENUM TipoDocumentoComercio | NO | — | NN | Tipo de documento. |
| `descripcion` | VARCHAR(100) | SÍ | NULL | — | Solo para `OTRO` (obligatoria en ese caso, validada en el DTO); para los demás tipos se ignora y queda `NULL`. |
| `nombre_original` | VARCHAR(255) | NO | — | NN | Nombre del archivo tal como lo subió el Dueno, sin rutas ni caracteres de control. Solo para mostrar (siempre con `textContent`). |
| `tipo_mime` | VARCHAR(100) | NO | — | NN | Tipo real comprobado por la firma de bytes (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`), nunca el que declara el navegador. |
| `tamano_bytes` | INT | NO | — | NN | Tamaño del archivo (máximo 8 MB, `comercio.documentacion.max-bytes`). |
| `estado` | ENUM EstadoDocumentoComercio | NO | `PENDIENTE` | NN | Estado del documento. |
| `motivo_rechazo` | VARCHAR(255) | SÍ | NULL | CHECK | Obligatorio cuando `estado = RECHAZADO` (`ck_documento_comercio_motivo`); es la razón de un rechazo o de una revocación. |
| `fecha_subida` | DATETIME | NO | — | NN | Instante de la subida (el reloj único de la aplicación). |
| `fecha_resolucion` | DATETIME | SÍ | NULL | — | Instante de la última resolución del Administrador (una revocación pisa la fecha de la aprobación anterior). |
| `administrador_id` | INT | SÍ | NULL | FK → Administrador.id | Administrador que resolvió por última vez. |
| `subido_por_usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario que lo subió: siempre el Dueno. |

**Índices:** `PRIMARY KEY (id)` | `INDEX idx_documento_comercio_bandeja (estado, fecha_subida)` (bandeja de pendientes del Administrador, de la más antigua a la más nueva) | `INDEX idx_documento_comercio_conteo (comercio_id, estado)` (recuentos por comercio y estado) | `INDEX idx_documento_comercio_administrador (administrador_id)` | `INDEX idx_documento_comercio_subido_por (subido_por_usuario_id)` | `FOREIGN KEY` a `comercio`, `administrador` y `usuario`, sin cascada.

**Reglas de negocio:**
- Subir exige el comercio `APROBADO`, `APTO_VENTA` o `CERRADO_TEMPORALMENTE` (`409 COMERCIO_ESTADO_NO_PERMITE_DOCUMENTOS` en otro caso). Cupos configurables: 5 documentos `PENDIENTE` a la vez (`409 DOCUMENTO_CUPO_REVISION`) y 20 en total contando los rechazados (`409 DOCUMENTO_CUPO_TOTAL`). No se borra nada automáticamente.
- Formatos PDF, JPG, PNG y WebP, comprobados por la firma de bytes; tamaño máximo 8 MB. Errores `400` con `DOCUMENTO_FORMATO_NO_PERMITIDO` y `DOCUMENTO_TAMANO_EXCEDIDO` (el mensaje trae el tamaño real y el máximo).
- Transiciones del Administrador (`PUT /administrador/documentos/{id}/resolver`): aprobar solo un `PENDIENTE`; rechazar un `PENDIENTE` o un `APROBADO` (revocación), siempre con motivo; un `RECHAZADO` no se vuelve a resolver (`409 DOCUMENTO_YA_RESUELTO`).
- El Dueno solo elimina físicamente un documento propio que sigue `PENDIENTE` (`409 DOCUMENTO_NO_ELIMINABLE` si ya fue resuelto).
- Cualquier documento aprobado de cualquier tipo alcanza para la aptitud de venta: no hay lista de tipos obligatorios.
- Orden de bloqueo: `usuario` del Dueno, `cuenta_mercado_pago`, `comercio` (`FOR UPDATE`), `documento_comercio` (`FOR UPDATE`, primera lectura de la fila), después el resto. Toda escritura de documentos termina recalculando la aptitud del comercio (`AptitudVentaComercioService`).
- Avisos in-app al Dueno, sin email: `DOCUMENTO_APROBADO`, `DOCUMENTO_RECHAZADO` (con el motivo; la revocación lo dice), `COMERCIO_APTO_VENTA` y `COMERCIO_SIN_APTITUD`. Al Administrador no hay aviso: el dashboard suma `documentosPendientes` y hay una bandeja.

---

### Tabla: DocumentoComercioArchivo

**Descripción:** Contenido binario de un `DocumentoComercio`, en tabla aparte para que los listados y los recuentos nunca lean el binario. Una fila por documento; se crea y se borra junto con él. Se entrega solo a través de la API autenticada (`GET /comercios/documentos/{id}/archivo` y `GET /administrador/documentos/{id}/archivo`), con `Content-Type` real, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`; nunca con una URL ni un token. Migración `V43`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `documento_id` | INT | NO | — | PK, FK → DocumentoComercio.id (sin cascada) | Documento al que pertenece el contenido. |
| `contenido` | LONGBLOB | NO | — | NN | Bytes del archivo (hasta 8 MB). Requiere `max_allowed_packet` de al menos 16 MB en el servidor de base de datos. |

**Índices:** `PRIMARY KEY (documento_id)` | `FOREIGN KEY fk_documento_comercio_archivo_documento`.

---

### Tabla: ConfiguracionTarifa

**Descripción:** Historial de configuraciones de tarifas de servicio. La tarifa vigente es la del registro con `fecha_vigencia` más alta. Cada cambio genera un nuevo registro (política append-only). Los valores se congelan en cada `Pedido` al momento de su creación.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de tarifa. |
| `administrador_id` | INT | NO | — | FK → Administrador.id, NN | Administrador que definió esta configuración. |
| `cargo_cliente` | DECIMAL(10,2) | NO | — | NN | Cargo de servicio aplicado al cliente. Monto fijo en pesos o tasa porcentual según `tipo_cargo_cliente`. |
| `tipo_cargo_cliente` | ENUM('FIJO','PORCENTAJE') | NO | `'FIJO'` | NN | Cómo se interpreta `cargo_cliente`: `FIJO` = monto en pesos tal cual; `PORCENTAJE` = tasa aplicada sobre el subtotal del pedido. Agregada junto con `tipo_cargo_comercio` (Bloque 1, punto 2 de `docs/recorrido-trabajo-final.md`) — el diccionario original (v1.5) no distinguía el tipo de cargo por columna propia. |
| `cargo_comercio` | DECIMAL(10,2) | NO | — | NN | Comisión de plataforma cobrada al comercio por cada pedido. Monto fijo en pesos o tasa porcentual según `tipo_cargo_comercio`. |
| `tipo_cargo_comercio` | ENUM('FIJO','PORCENTAJE') | NO | `'PORCENTAJE'` | NN | Cómo se interpreta `cargo_comercio`, mismo criterio que `tipo_cargo_cliente`. |
| `fecha_vigencia` | DATETIME | NO | `NOW()` | NN | Fecha y hora desde la cual esta configuración está vigente. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (administrador_id)` | `INDEX (fecha_vigencia)`

**Reglas de negocio:**
- Al crear un pedido, el backend obtiene el registro con `MAX(fecha_vigencia)` y aplica sus valores como `Pedido.cargo_servicio_cliente` y `Pedido.cargo_servicio_comercio`. Estos valores quedan congelados en el pedido.
- El cargo al comercio (`cargo_comercio`/`tipo_cargo_comercio`) se calcula siempre sobre `Pedido.subtotal` (suma de `DetallePedido.subtotal`), nunca sobre `Pedido.total` — el total ya incluye el cargo al cliente, que es ingreso de Bajoneá y no del comercio.
- La comisión que MercadoPago le cobra a cada Dueño (variable según el plazo de acreditación que elija) es un costo externo a Bajoneá — no se calcula, guarda ni muestra en ningún lugar de este sistema. `cargo_cliente`/`cargo_comercio` son exclusivamente el fee de marketplace de Bajoneá.
- Configuración vigente al cerrar el Bloque 1 punto 2 (ver `docs/DECISIONES.md`): `cargo_cliente = 200.00` (`FIJO`), `cargo_comercio = 1.00` (`PORCENTAJE`, 1%).

---

## 5. Módulo Seguridad y Sesiones

---

### Tabla: Token

**Descripción:** Tokens de un solo uso para operaciones críticas de seguridad. Tabla discriminada por el campo `tipo` que unifica los tres flujos de tokenización del sistema. Los tokens se generan como UUID v4 y se envían al usuario por email como parte de un enlace de acción. **MVP (Tramo 16.12):** en vez de UUID v4 y de un enlace, el MVP usa un código numérico de 6 dígitos que el usuario tipea a mano en la app — ver nota en `ENUM: TipoToken` más arriba.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de token. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario al que pertenece el token. |
| `tipo` | ENUM TipoToken | NO | — | NN | Propósito del token: `VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD` o `REACTIVACION_CUENTA`. |
| `token` | VARCHAR(36) | NO | — | NN, UQ | Valor del token. Diseño original: UUID v4 incluido en un enlace. **MVP (Tramo 16.12):** código numérico de 6 dígitos, tipeado a mano por el usuario — la columna sigue en VARCHAR(36) sin angostar (ver `docs/modelo-mvp.md`). UNIQUE para garantizar irrepetibilidad global. || `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de generación del token. |
| `fecha_vencimiento` | DATETIME | NO | — | NN | Fecha y hora de expiración. Calculada al crear el token según la duración configurada para cada tipo. |
| `fecha_uso` | DATETIME | SÍ | NULL | — | Fecha y hora en que el usuario consumió el token. Se registra al pasar a `UTILIZADO`. |
| `estado` | ENUM EstadoToken | NO | `'PENDIENTE'` | NN | Estado del ciclo de vida del token. |
| `intentos_fallidos` | INT | NO | `0` | NN | Contador de intentos fallidos de verificación de este token (código de 6 dígitos). Protección anti-fuerza-bruta independiente del contador de intentos de login (`Usuario.intentos_fallidos`) — ambas columnas coexisten a propósito, cada una protege una amenaza distinta (login vs. verificación de OTP/token de un solo uso). |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (token)` | `INDEX (usuario_id, tipo, estado)`

**Reglas de negocio:**
- Un job periódico actualiza a `EXPIRADO` todos los tokens donde `fecha_vencimiento <= NOW() AND estado = 'PENDIENTE'`.
- Al consumirse: `estado = UTILIZADO`, `fecha_uso = NOW()`. No puede reutilizarse.
- Al reenviar un token del mismo tipo para el mismo usuario, los tokens `PENDIENTE` anteriores del mismo tipo deben invalidarse.
- Cada intento fallido de verificación (código incorrecto) incrementa `intentos_fallidos` en 1. Al alcanzar `MAX_INTENTOS_TOKEN_VERIFICACION = 5` intentos fallidos, el token deja de aceptar verificaciones aunque siga `PENDIENTE` y no haya vencido — el usuario debe solicitar un token nuevo.

---

### Tabla: Sesion

**Descripción:** Historial completo de sesiones de usuarios. Cada inicio de sesión exitoso genera un nuevo registro. Permite auditoría de accesos y gestión de sesiones concurrentes.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la sesión. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario que inició la sesión. |
| `activa` | TINYINT(1) | NO | `true` | NN | `true` mientras la sesión sigue abierta. `false` al cerrarse por cualquier motivo. |
| `fecha_inicio` | DATETIME | NO | `NOW()` | NN | Fecha y hora del inicio de sesión exitoso (login). |
| `fecha_cierre` | DATETIME | SÍ | NULL | — | Fecha y hora del cierre de la sesión. NULL mientras está activa. |
| `tipo_cierre` | ENUM TipoCierreSesion | SÍ | NULL | — | Motivo del cierre: `MANUAL`, `AUTOMATICO`, `FORZADO` o `SUSPENSION` (cierre por la suspensión de la cuenta, `V44`: el filtro JWT responde `401` con el código `CUENTA_SUSPENDIDA` y el motivo mientras la cuenta siga suspendida). NULL mientras está activa. |
| `ip_origen` | VARCHAR(45) | NO | — | NN | Dirección IP del cliente al momento del login. Admite IPv4 (hasta 15 chars) e IPv6 (hasta 45 chars). |
| `navegador` | VARCHAR(255) | SÍ | NULL | — | User-Agent del navegador al momento del login. NULL si no se puede detectar. |
| `dispositivo` | VARCHAR(255) | SÍ | NULL | — | Información del dispositivo (SO, modelo). NULL si no se puede detectar. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id, activa)`

**Reglas de negocio:**
- Al bloquear, suspender o inactivar un usuario: se fuerzan el cierre de todas sus sesiones activas (`activa = false`, `tipo_cierre = FORZADO`, `fecha_cierre = NOW()`).
- Al cambiar contraseña: se fuerza el cierre de todas las sesiones activas del usuario.
- Al detectar login con sesión ya activa: se fuerza el cierre de la sesión anterior; se envía notificación de cierre de sesión por email (por fuera del sistema de notificaciones push).

---

## 6. Módulo Notificaciones

---

### Tabla: Notificacion

**Descripción:** Registro de todas las notificaciones emitidas por el sistema. Soporta notificaciones in-app (canal `PUSH`, consultadas por polling REST) y por email (canal `EMAIL`). Cada combinación evento+canal genera un registro independiente.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la notificación. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario destinatario de la notificación. |
| `tipo` | ENUM TipoNotificacion | NO | — | NN | Tipo de evento que originó la notificación (ver tabla T1–T35). |
| `mensaje` | VARCHAR(500) | NO | — | NN | Texto legible de la notificación mostrado al usuario. Puede incluir datos dinámicos del contexto (nombre del comercio, motivo de cancelación, etc.). |
| `leida` | TINYINT(1) | NO | `false` | NN | `true` una vez que el usuario marcó la notificación como leída. Solo tiene sentido funcional para canal `PUSH`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de generación de la notificación. |
| `canal` | ENUM CanalNotificacion | NO | — | NN | Canal de envío: `PUSH` o `EMAIL`. |
| `estado` | ENUM EstadoEnvioNotificacion | NO | `'PENDIENTE'` | NN | Estado del procesamiento del envío. |
| `fecha_envio` | DATETIME | SÍ | NULL | — | Fecha y hora en que el envío fue procesado. NULL hasta que se envíe. |
| `entidad_tipo` | ENUM TipoEntidadNotificacion | SÍ | NULL | — | Tipo de entidad referenciada por `entidad_id`, para deep-link desde la notificación (ej. "ver pedido"). NULL si la notificación no referencia ninguna entidad concreta. Va siempre junto con `entidad_id`: ambas con valor o ambas `NULL`. |
| `entidad_id` | INT | SÍ | NULL | — | Id de la entidad referenciada, interpretado según `entidad_tipo`. Sin FK física (ver regla de negocio abajo). NULL si la notificación no referencia ninguna entidad concreta. |
| `comercio_id` | INT | SÍ | NULL | — | **(v1.14, `V33`)** Comercio al que pertenece el aviso. Lo llevan solo los avisos del comercio (equipo y Dueno); los personales del Cliente quedan en `NULL`. **Sin FK física, a propósito:** cada `INSERT` con una FK a `comercio` tomaría un bloqueo compartido sobre esa fila, que en el orden de bloqueos va antes que el pedido (la suspensión toma el comercio y después los pedidos), y se interbloquearía con las transiciones que avisan al equipo. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id, leida)` | `INDEX (estado)` | `INDEX idx_notificacion_usuario_comercio (usuario_id, comercio_id, leida, fecha_creacion)` (v1.14: la lista y el contador de un usuario sobre un comercio son una búsqueda por este índice, sin deducir el comercio desde el pedido)

**Reglas de negocio:**
- `entidad_tipo` + `entidad_id` es una referencia genérica opcional hacia cualquier entidad del sistema (hoy `PEDIDO` o `COMERCIO`, ver `ENUM: TipoEntidadNotificacion`), en vez de una columna `*_id` nullable dedicada por cada tipo de entidad referenciable — diseño abierto a sumar más valores de `entidad_tipo` a futuro sin alterar la estructura de la tabla.
- **Implementado (rol Empleado, bloque A2 de E1):** el listado y el contador in-app del Cliente (y de quien no es Dueno) filtran `canal = PUSH`: las filas `EMAIL`, como el aviso de regularización T35, no se muestran en la campana. Las consultas por comercio del Dueno no cambian (las filas de regularización no llevan entidad).
- **Implementado (rol Empleado, tramo E3, bloque A4):** el listado y el contador con un comercio abierto (`X-Comercio-Id`: el Dueno siempre, el Cliente que es Empleado `ACTIVO`) traen solo los avisos del usuario con ese `comercio_id`; el listado y el contador sin comercio (el Cliente sin header, y el Administrador) traen solo los personales (`comercio_id IS NULL`), nunca los del comercio. Una copia por destinatario, con lectura individual: que un Empleado marque un aviso como leído no cambia el de los demás. Marcar una notificación como leída exige, si lleva `comercio_id`, ser el Dueno de ese comercio o su Empleado `ACTIVO` (si no, `404`). Los avisos de administración del comercio nunca llegan a los Empleados.
- **Migración `V33`:** agrega la columna y el índice, y completa las filas existentes: los avisos con `entidad_tipo = COMERCIO` toman `entidad_id`, y los de pedido de tipo T1, T9 y T13 toman el comercio del pedido; los personales del Cliente quedan en `NULL`.
- **Sin FK física:** MySQL no soporta una FK condicional/polimórfica que apunte a distintas tablas según el valor de otra columna. La integridad de `entidad_id` respecto a la tabla indicada por `entidad_tipo` se garantiza a nivel de aplicación, no de base de datos. Si la entidad referenciada se elimina físicamente en el futuro, corresponde limpiar o anular las notificaciones asociadas a nivel de servicio.

---

## 7. Módulo Atención y Soporte

---

### Tabla: Soporte

**Descripción:** Mensajes de descargo enviados por usuarios suspendidos al Administrador. Permite al usuario contestar la suspensión y solicitar su revisión. El Administrador puede levantar la suspensión o mantenerla.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del mensaje de soporte. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario que envió el mensaje (debe estar en estado `SUSPENDIDO`). |
| `mensaje_descargo` | TEXT | NO | — | NN | Texto libre con el descargo o justificación del usuario. |
| `fecha_envio` | DATETIME | NO | `NOW()` | NN | Fecha y hora en que el usuario envió el mensaje. |
| `atendido` | TINYINT(1) | NO | `false` | NN | `true` una vez que un Administrador revisó y resolvió el mensaje. |
| `administrador_id` | INT | SÍ | NULL | FK → Administrador.id | Administrador que atendió el mensaje. NULL mientras está sin atender. |
| `resolucion` | ENUM ResolucionSoporte | SÍ | NULL | — | Resolución del ticket: `REACTIVADO` o `SUSPENSION_MANTENIDA`. NULL mientras no fue atendido. |
| `fecha_resolucion` | DATETIME | SÍ | NULL | — | Fecha y hora de resolución por el Administrador. NULL mientras no fue atendido. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id)` | `INDEX (atendido)`

---

### Tabla: Reclamo

**Descripción:** Reclamos iniciados por clientes sobre pedidos autoconfirmados como entregados o con entrega cuestionada. Un pedido puede tener como máximo un reclamo (UNIQUE en `pedido_id`). Si el reclamo se aprueba, se genera una `NotaCredito` para el reembolso.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del reclamo. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN, UQ | Pedido sobre el que se realiza el reclamo. UNIQUE: máximo un reclamo por pedido. |
| `descripcion` | TEXT | NO | — | NN | Descripción del problema ingresada por el **cliente** al crear el reclamo. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del reclamo. |
| `estado` | ENUM EstadoReclamo | NO | `'PENDIENTE'` | NN | Estado del reclamo en el flujo de resolución. |
| `administrador_id` | INT | SÍ | NULL | FK → Administrador.id | Administrador que resolvió el reclamo. NULL mientras está `PENDIENTE`. |
| `nota_resolucion` | VARCHAR(500) | SÍ | NULL | — | Nota del **Administrador** al resolver el reclamo, aplicable tanto a `APROBADO` como a `RECHAZADO`. NULL mientras está `PENDIENTE`. Semánticamente distinto de `descripcion` (cliente) y de `Pedido.motivo_rechazo` (comercio rechazando el pedido). |
| `fecha_resolucion` | DATETIME | SÍ | NULL | — | Fecha y hora de resolución por el Administrador. NULL mientras está `PENDIENTE`. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (pedido_id)` | `INDEX (estado)`

---

## 8. Módulo Catálogo de Productos

---

### Tabla: Categoria

**Descripción:** Categorías de clasificación para los productos del catálogo. Gestionadas exclusivamente por el Administrador. Un producto pertenece a exactamente una categoría. Soporta baja lógica.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la categoría. |
| `nombre` | VARCHAR(100) | NO | — | NN, UQ | Nombre único de la categoría (ej. `"Pizzas"`, `"Empanadas"`). |
| `activo` | TINYINT(1) | NO | `true` | NN | `true` si está activa y disponible para asignar a productos. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación del nombre. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora de desactivación lógica. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (nombre)`

---

### Tabla: Tag

**Descripción:** Etiquetas transversales para enriquecer búsqueda y filtrado de productos. Gestionadas por el Administrador. Un producto puede tener múltiples tags (relación M:N a través de `ProductoTag`).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del tag. |
| `nombre` | VARCHAR(100) | NO | — | NN, UQ | Nombre único del tag (ej. `"Vegano"`, `"Sin TACC"`, `"Picante"`). |
| `activo` | TINYINT(1) | NO | `true` | NN | `true` si está activo y disponible para asignar a productos. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación del nombre. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora de desactivación lógica. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (nombre)`

---

### Tabla: Producto

**Descripción:** Productos ofrecidos por los comercios en el catálogo. El precio se congela en `DetallePedido.precio_unitario` al confirmar cada pedido. Al pasar a `AGOTADO` o `DESCONTINUADO`, el sistema elimina automáticamente las apariciones del producto en carritos activos.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del producto. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio propietario del producto. |
| `categoria_id` | INT | NO | — | FK → Categoria.id, NN | Categoría a la que pertenece el producto. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre del producto. |
| `descripcion` | TEXT | SÍ | NULL | — | Descripción detallada: ingredientes, tamaño, opciones, alérgenos, etc. |
| `precio` | DECIMAL(10,2) | NO | — | NN | Precio unitario en pesos argentinos (ARS). Se congela en `DetallePedido.precio_unitario` al momento del pedido; los cambios no afectan pedidos existentes. |
| `estado` | ENUM EstadoProducto | NO | `'DISPONIBLE'` | NN | Estado de disponibilidad del producto en el catálogo. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de publicación del producto. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación (nombre, descripción, precio, categoría). |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora en que el producto fue descontinuado (baja lógica definitiva). |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)` | `INDEX (categoria_id)` | `INDEX (estado)`

**Reglas de negocio:**
- Máximo 5 imágenes por producto; validado en el backend antes de emitir la firma de subida a Cloudinary.
- Un producto `DESCONTINUADO` no puede revertir a `DISPONIBLE`.

---

### Tabla: ImagenProducto

**Descripción:** Imágenes asociadas a un producto. Las URLs apuntan a recursos en Cloudinary. Máximo 5 imágenes por producto; una se designa como principal (portada en el catálogo).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la imagen. |
| `producto_id` | INT | NO | — | FK → Producto.id, NN | Producto al que pertenece la imagen. |
| `url` | VARCHAR(500) | NO | — | NN | URL pública en Cloudinary de la imagen. |
| `orden` | INT | NO | `0` | NN | Orden de visualización en la galería del producto (0 = primera posición). |
| `es_principal` | TINYINT(1) | NO | `false` | NN | `true` si esta imagen es la imagen de portada del producto (miniatura en el catálogo). Solo una imagen por producto puede tener este valor en `true`. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (producto_id)`

---

### Tabla: ProductoTag

**Descripción:** Tabla de unión M:N entre `Producto` y `Tag`. Permite asignar múltiples tags a un producto y un mismo tag a múltiples productos.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `producto_id` | INT | NO | — | PK (componente), FK → Producto.id | Producto que tiene el tag. |
| `tag_id` | INT | NO | — | PK (componente), FK → Tag.id | Tag asignado al producto. |

**Índices:** `PRIMARY KEY (producto_id, tag_id)` | `INDEX (tag_id)`

---

### Tabla: GrupoExtra

**Descripción:** Grupo de opciones de personalización configurado por el comercio para uno o varios productos (ej. "Agregados", "Elegí tu salsa"). Un producto puede tener múltiples grupos asociados (M:N vía `ProductoGrupoExtra`).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del grupo. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio Dueno del grupo. |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre del grupo (ej. "Agregados", "Elegí tu salsa"). |
| `cantidad_maxima` | INT | NO | `1` | NN | Máximo de opciones seleccionables del grupo. `1` = elegí solo una. |
| `obligatorio` | TINYINT(1) | NO | `false` | NN | `true` exige al menos 1 selección de este grupo antes de confirmar el pedido. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Baja lógica. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)`

---

### Tabla: Extra

**Descripción:** Opción individual dentro de un `GrupoExtra` (ej. "Panceta extra"). Su precio se suma al precio del producto al seleccionarse.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del extra. |
| `grupo_extra_id` | INT | NO | — | FK → GrupoExtra.id, NN | Grupo al que pertenece. Un extra pertenece a un solo grupo (1:N). |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre del extra (ej. "Panceta extra"). |
| `precio` | DECIMAL(10,2) | NO | `0` | NN | Monto que se suma al precio del producto. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Baja lógica. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (grupo_extra_id)`

---

### Tabla: ProductoGrupoExtra

**Descripción:** Tabla de unión M:N entre `Producto` y `GrupoExtra`. Un producto sin filas en esta tabla no ofrece extras.

| Columna | Tipo MySQL | Nulo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `producto_id` | INT | NO | PK (componente), FK → Producto.id | Producto que ofrece el grupo de extras. |
| `grupo_extra_id` | INT | NO | PK (componente), FK → GrupoExtra.id | Grupo de extras ofrecido en el producto. |

**Índices:** `PRIMARY KEY (producto_id, grupo_extra_id)` | `INDEX (grupo_extra_id)`

**Reglas de negocio de Extras (a nivel aplicación):**
- Producto sin filas en `ProductoGrupoExtra` no ofrece extras.
- Al agregar un extra de un grupo con `cantidad_maxima = 1`: reemplaza cualquier otro extra del mismo grupo ya presente en ese ítem. Si `cantidad_maxima > 1`, acumula hasta el máximo.
- Al confirmar el pedido: se valida que todo `GrupoExtra` con `obligatorio = true` asociado al producto tenga al menos un `Extra` elegido, o se rechaza la confirmación con mensaje claro.
- El total del carrito suma `ItemCarritoExtra.precio_unitario` de todos los ítems.

---

## 9. Módulo Operaciones y Ventas

---

### Tabla: Carrito

**Descripción:** Carrito de compras del cliente. Existe exactamente uno por cliente (persistente a lo largo de las sesiones). Solo puede contener productos de un único comercio a la vez. `comercio_id` se asigna al agregar el primer ítem y se limpia al vaciar el carrito o al confirmar el pago.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del carrito. |
| `cliente_id` | INT | NO | — | FK → Cliente.id, NN, UQ | Cliente propietario del carrito. UNIQUE: un solo carrito por cliente. |
| `comercio_id` | INT | SÍ | NULL | FK → Comercio.id | Comercio del cual provienen los productos actuales. NULL si el carrito está vacío. |
| `activo` | TINYINT(1) | NO | `true` | NN | `true` mientras la sesión del cliente está activa. `false` al cerrar sesión o al inactivarse la cuenta. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (cliente_id)` | `INDEX (comercio_id)`

**Reglas de negocio:**
- El carrito **no** se limpia al crear el pedido en `PENDIENTE_PAGO`. Se limpia únicamente al confirmarse el pago aprobado (webhook o sincronización; transición del pedido a `PENDIENTE_CONFIRMACION_COMERCIO`), y solo si el carrito actual es del mismo comercio del pedido pagado.
- Si el pago expira (timeout 30 min) o es rechazado por MP, el carrito permanece intacto para permitir el reintento del cliente.
- Al agregar un producto de un comercio diferente al `comercio_id` actual, el sistema solicita al cliente confirmar el vaciado del carrito.

---

### Tabla: ItemCarrito

**Descripción:** Ítems individuales dentro del carrito de un cliente. Cada registro representa un producto con su cantidad y nota opcional. Los ítems de productos `AGOTADO` o `DESCONTINUADO` se eliminan automáticamente.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del ítem de carrito. |
| `carrito_id` | INT | NO | — | FK → Carrito.id, NN | Carrito al que pertenece el ítem. |
| `producto_id` | INT | NO | — | FK → Producto.id, NN | Producto representado por el ítem. |
| `cantidad` | INT | NO | — | NN | Cantidad de unidades solicitadas. Valor mínimo: 1. |
| `nota` | VARCHAR(255) | SÍ | NULL | — | Nota o aclaración del cliente para ese ítem (ej. `"Sin cebolla"`, `"Extra salsa"`). |
| `precio_visto` | DECIMAL(10,2) | SÍ | NULL | — | Precio vigente del producto cuando se insertó el ítem (v1.25). No se actualiza al cambiar la cantidad. Si difiere del precio vigente, el carrito informa `precioCambio`. `NULL` en los ítems anteriores a `V40`. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (carrito_id)` | `INDEX (producto_id)`

---

### Tabla: ItemCarritoExtra

**Descripción:** Extras seleccionados por el cliente para un ítem del carrito. Tabla de borrador: si el cliente quita el extra, la fila se elimina físicamente (no hay baja lógica), mismo criterio que `ItemCarrito`.

| Columna | Tipo MySQL | Nulo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | INT | NO | PK, AI | Identificador único. |
| `item_carrito_id` | INT | NO | FK → ItemCarrito.id, NN | Ítem del carrito al que pertenece el extra. |
| `extra_id` | INT | NO | FK → Extra.id, NN | Extra seleccionado. |
| `precio_unitario` | DECIMAL(10,2) | NO | NN | Precio congelado al agregarse al carrito. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | Momento en que el cliente agregó este extra al ítem del carrito. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (item_carrito_id)` | `INDEX (extra_id)`

**Reglas de negocio:**
- No lleva `fecha_modificacion` ni `fecha_baja`: si el cliente quita el extra, la fila se elimina físicamente; si cambia de opinión, se inserta como fila nueva.
- **Confirmado con Diego (2026-08-26):** el costo del extra en el carrito es `precio_unitario × ItemCarrito.cantidad` del ítem padre (mismo criterio que en el pedido, ver `DetallePedidoExtra`). Ejemplo: 2 hamburguesas con panceta extra ($500 c/u) = $1.000 de panceta en el subtotal del carrito.

---

### Tabla: Pedido

**Descripción:** Pedido generado por un cliente. Cubre el ciclo completo desde la creación (antes del pago) hasta la entrega. Contiene el snapshot de montos al momento de la transacción y los metadatos del ciclo de vida. Los timestamps de cada transición de estado se registran exclusivamente en `HistorialEstadoPedido`; esta tabla conserva únicamente el estado operacional actual y `fecha_creacion` (evento único, no repetible). El `id` del pedido se usa como `external_reference` en MercadoPago para correlacionar webhooks.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del pedido. Usado como `external_reference` en MercadoPago. |
| `cliente_id` | INT | NO | — | FK → Cliente.id, NN | Cliente que realizó el pedido. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio receptor del pedido. |
| `direccion_id` | INT | SÍ | NULL | FK → Direccion.id | Dirección de la que salió la copia de entrega. Obligatorio para `DOMICILIO`; NULL para `RETIRO`. Desde la `V42` solo indica el origen: las respuestas leen la copia `entrega_*`. |
| `entrega_calle` | VARCHAR(150) | SÍ | NULL | — | Agregada en la migración `V42`. Copia de la calle de la dirección al confirmar el pedido. NULL en `RETIRO`. |
| `entrega_numero` | VARCHAR(10) | SÍ | NULL | — | Agregada en la migración `V42`. Copia del número. |
| `entrega_piso_depto` | VARCHAR(30) | SÍ | NULL | — | Agregada en la migración `V42`. Copia del piso o departamento. |
| `entrega_codigo_postal` | VARCHAR(10) | SÍ | NULL | — | Agregada en la migración `V42`. Copia del código postal. |
| `entrega_localidad_id` | VARCHAR(15) | SÍ | NULL | — (sin FK) | Agregada en la migración `V42`. Copia de la localidad; el nombre de la localidad y la provincia se resuelven por `Localidad.id` al armar la respuesta. |
| `entrega_referencia` | VARCHAR(150) | SÍ | NULL | — | Agregada en la migración `V42`. Copia de la referencia de entrega. El alias de la dirección no se copia. |
| `modalidad_entrega` | ENUM ModalidadEntrega | NO | — | NN | Modalidad elegida por el cliente: `DOMICILIO` o `RETIRO`. |
| `estado` | ENUM EstadoPedido | NO | `'PENDIENTE_PAGO'` | NN | Estado actual del pedido en su ciclo de vida. |
| `pago_estado` | ENUM EstadoPagoPedido | NO | `'PENDIENTE'` | NN | Estado del pago asociado. Se actualiza al recibir el webhook de MercadoPago o la sincronización a pedido del Cliente; `RECHAZADO` no cancela el pedido. |
| `cancelado_por` | ENUM CanceladoPor | SÍ | NULL | — | Actor que originó la cancelación. Solo se registra en estados terminales negativos. NULL en todos los demás estados. |
| `motivo` | VARCHAR(500) | SÍ | NULL | — | Texto legible del motivo de anulación elegido por el comercio de la lista de motivos de rechazo, con el comentario si lo hay (por ejemplo, "Problema técnico. Se cortó la luz"; estado `ANULADO`; los pedidos anulados antes del 2026-10-12 conservan el texto libre que se escribió), o motivo automático de la cancelación por vencimiento del plazo de pago (`Pago no confirmado` si el pago quedó sin resolver, `Pago rechazado` si el último pago fue rechazado; estado `CANCELADO_POR_SISTEMA`). El DTO de respuesta solo lo expone cuando `estado = ANULADO`. |
| `fuente_entrega` | ENUM FuenteEntrega | SÍ | NULL | — | Actor que confirmó la entrega. Solo se registra cuando `estado = ENTREGADO`. NULL en todos los demás estados. |
| `fecha_entrega` | DATETIME | SÍ | NULL | — | Fecha y hora real en que el pedido fue entregado o confirmado como entregado. |
| `suspension_retiro_expira` | DATETIME | SÍ | NULL | — | **Sin uso desde la v1.30** (`V45`): la entidad ya no la mapea y ningún proceso la lee ni la escribe. Hasta la v1.29 guardaba la expiración del timer de 90 minutos de un retiro afectado por la suspensión; ahora ese tope se calcula desde `Comercio.suspendido_desde` y desde la fecha en que el pedido quedó `LISTO_PARA_RETIRAR`. Se conserva la columna por las filas históricas. |
| `primer_aviso_emitido` | TINYINT(1) | NO | `false` | NN | Flag de idempotencia: `true` una vez emitido el aviso de los 75 minutos (T7) para pedidos en `EN_CAMINO`. Evita duplicados en reintentos del job periódico. |
| `motivo_rechazo` | ENUM MotivoRechazo | SÍ | NULL | — | Motivo estructurado del rechazo o de la anulación por el comercio (la misma lista para las dos acciones). Se registra cuando `estado = RECHAZADO` o `estado = ANULADO`; NULL en los pedidos anulados antes del 2026-10-12. |
| `comentario_rechazo` | VARCHAR(500) | SÍ | NULL | — | Texto libre complementario al `motivo_rechazo`, en el rechazo y en la anulación. Obligatorio cuando `motivo_rechazo = OTRO`. |
| `subtotal` | DECIMAL(10,2) | NO | — | NN | Suma de todos los `DetallePedido.subtotal` al momento de confirmar el pedido. Valor congelado. |
| `cargo_servicio_cliente` | DECIMAL(10,2) | NO | — | NN | Cargo de servicio aplicado al cliente, congelado desde la `ConfiguracionTarifa` vigente al momento del pedido. |
| `cargo_servicio_comercio` | DECIMAL(10,2) | NO | — | NN | Comisión de plataforma del comercio, congelada desde la `ConfiguracionTarifa` vigente al momento del pedido. |
| `total` | DECIMAL(10,2) | NO | — | NN | Monto total cobrado al cliente: `subtotal + cargo_servicio_cliente`. Debe coincidir con `Pago.monto`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del pedido (previo al pago). Inmutable. |
| `fecha_pago_confirmado` | DATETIME | SÍ | NULL | — | Agregada en la migración `V39` (2026-10-20). Instante en que el pago se confirmó y el pedido pasó a `PENDIENTE_CONFIRMACION_COMERCIO`; coincide con `fecha_hora` de esa fila del historial (se estampan con el mismo instante). NULL mientras el pedido no llegó pagado. Para los pedidos anteriores a la migración se completó desde `MIN(HistorialEstadoPedido.fecha_hora)` de esa fila. |
| `turno_fecha` | DATE | SÍ | NULL | — | Agregada en la migración `V39`. Fecha de **apertura** del turno al que pertenece el pedido (un pago de madrugada en un turno que cruza la medianoche lleva la fecha del día anterior). Se asigna al confirmarse el pago. NULL si no llegó pagado o si el comercio no tenía ninguna franja vigente. |
| `turno_horario_id` | INT | SÍ | NULL | FK → Horario.id (sin cascada) | Agregada en la migración `V39`. Versión de la franja `Horario` que definió el turno; una edición posterior de los horarios no cambia el turno de un pedido ya pagado. |

> **Campos eliminados en v1.1:** `fecha_pago`, `fecha_aceptacion`, `fecha_listo`, `fecha_despacho`, `fecha_cancelacion`. Todos se derivan desde `HistorialEstadoPedido` con `SELECT fecha_hora FROM HistorialEstadoPedido WHERE pedido_id = ? AND estado = 'ESTADO_BUSCADO' ORDER BY fecha_hora DESC LIMIT 1`.

**Índices:** `PRIMARY KEY (id)` | `INDEX (cliente_id)` | `INDEX (comercio_id)` | `INDEX (estado)` | `INDEX (fecha_creacion)` | `INDEX idx_pedido_turno (comercio_id, turno_fecha, turno_horario_id)` | `INDEX idx_pedido_fecha_pago (comercio_id, fecha_pago_confirmado)` | `INDEX idx_pedido_turno_horario (turno_horario_id)`

**Reglas de negocio:**
- `cancelado_por` y `fuente_entrega` son mutuamente excluyentes: en un pedido terminal solo puede estar poblado uno de los dos. Un pedido `NO_RETIRADO` no tiene ninguno de los dos ni `fecha_entrega`.
- Diseño pendiente de implementar: si llega un pago aprobado y el pedido ya está en `CANCELADO_POR_SISTEMA` (por timeout procesado primero), el sistema debe generar el reembolso inmediatamente. Implementado hoy: se registra una alerta `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO` en `AlertaWebhookMp` y no se modifica el pedido ni se reembolsa.
- Un pedido llegó pagado al comercio si existe una fila de `HistorialEstadoPedido` con `estado = PENDIENTE_CONFIRMACION_COMERCIO`. El comercio solo ve esos pedidos, y la fecha de esa fila es la fecha de pago que ve el comercio. Hasta la v1.23 también era la que contaba el día de hoy en su panel; desde la v1.24 el panel cuenta por turno (`turno_fecha`, `turno_horario_id`).
- Turno del pedido (v1.24): al confirmarse el pago se asigna `(turno_fecha, turno_horario_id)` con el mismo instante que `fecha_pago_confirmado` y que la fila del historial: el turno que contiene ese instante o, fuera de toda franja, el último turno terminado dentro de 7 días (`turno.pago-fuera-franja-dias`). "Vendido en el turno" suma el `subtotal` de los pedidos del turno en `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO` o `NO_RETIRADO`; "Pedidos del turno" cuenta todos los que llegaron pagados al turno sin importar cómo terminaron; la comisión (suma de `cargo_servicio_comercio`) y el neto los ve solo el Dueno; los pendientes cuentan todos los del comercio, no los del turno.
- Los valores de `subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio` y `total` son inmutables una vez registrados.
- Cada cambio de estado del pedido genera un INSERT en `HistorialEstadoPedido`, que es la fuente canónica de todos los timestamps del ciclo de vida.

---

### Tabla: DetallePedido

**Descripción:** Snapshot de cada ítem del pedido al momento de su confirmación. `precio_unitario` se congela desde `Producto.precio` al crear el pedido, garantizando trazabilidad histórica ante cambios futuros de precios.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del ítem del pedido. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN | Pedido al que pertenece el ítem. |
| `producto_id` | INT | NO | — | FK → Producto.id, NN | Producto pedido. Referencia histórica: el producto puede haber cambiado de precio, nombre o estado desde entonces. |
| `cantidad` | INT | NO | — | NN | Cantidad de unidades pedidas del producto. |
| `precio_unitario` | DECIMAL(10,2) | NO | — | NN | Precio del producto **al momento del pedido** (congelado desde `Producto.precio`). Inmutable. |
| `nota` | VARCHAR(255) | SÍ | NULL | — | Nota o aclaración del cliente para ese ítem. Copiada desde `ItemCarrito.nota` al confirmar el pedido. |
| `subtotal` | DECIMAL(10,2) | NO | — | NN | Valor calculado y congelado: `precio_unitario × cantidad`. |
| `estado` | ENUM EstadoDetallePedido | NO | `'ACTIVO'` | NN | Estado individual del ítem: permite cancelar/anular un ítem puntual sin afectar el resto del pedido. Agregado 2026-08-28. |
| `motivo_anulacion` | VARCHAR(255) | SÍ | NULL | — | Motivo de la anulación, texto libre. Se completa únicamente cuando `estado = ANULADO`. Agregado 2026-08-28. |
| `nota_credito_id` | INT | SÍ | NULL | FK → NotaCredito.id | Nota de crédito parcial asociada a la cancelación/anulación de este ítem. Se completa únicamente cuando `estado != ACTIVO`. Agregado 2026-08-28. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (pedido_id)` | `INDEX (nota_credito_id)`

**Reglas de negocio:**
- `nota_credito_id` solo debe completarse cuando `estado != ACTIVO`.
- Una vez `CANCELADO` o `ANULADO`, el estado de un ítem es terminal — sin transición de vuelta a `ACTIVO` ni entre `CANCELADO`/`ANULADO`.
- `motivo_anulacion` se completa únicamente cuando `estado = ANULADO`.
- **Fuera de alcance del tramo que introdujo estas columnas (2026-08-28, ver `docs/DECISIONES.md`):** ningún Service/Controller/endpoint implementa todavía la cancelación o anulación de un ítem puntual, ni la generación de la nota de crédito parcial asociada. Estas 3 reglas están documentadas acá, no como constraint de base de datos ni como validación de aplicación — quedan para el tramo que implemente esa lógica.

---

### Tabla: DetallePedidoExtra

**Descripción:** Snapshot inmutable de los extras seleccionados para cada ítem del pedido al momento de su confirmación. Mismo criterio que `DetallePedido`: no se edita.

| Columna | Tipo MySQL | Nulo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | INT | NO | PK, AI | Identificador único. |
| `detalle_pedido_id` | INT | NO | FK → DetallePedido.id, NN | Ítem del pedido al que pertenece el extra. |
| `extra_id` | INT | NO | FK → Extra.id, NN | Extra pedido. Referencia histórica. |
| `precio_unitario` | DECIMAL(10,2) | NO | NN | Precio congelado al momento de confirmar el pedido, mismo criterio que `DetallePedido.precio_unitario`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | Momento de confirmación del pedido (mismo instante para todas las filas de un mismo pedido). |

**Índices:** `PRIMARY KEY (id)` | `INDEX (detalle_pedido_id)` | `INDEX (extra_id)`

**Reglas de negocio:**
- No lleva `fecha_modificacion` ni `fecha_baja`: es un registro histórico inmutable, igual que `DetallePedido`.
- **Confirmado con Diego (2026-08-26):** el costo total de un extra en el pedido es `precio_unitario × DetallePedido.cantidad` del ítem padre — los extras no tienen cantidad propia, se multiplican por la cantidad del producto al que pertenecen. Ejemplo: 2 hamburguesas con panceta extra ($500 c/u) = $1.000 de panceta en el subtotal, no $500 fijo.

---

### Tabla: HistorialEstadoPedido

**Descripción:** Registro inmutable de cada transición de estado que experimenta un pedido. Un registro por cada cambio de estado. Permite la auditoría y reconstrucción completa del ciclo de vida de cualquier pedido.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de historial. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN | Pedido al que corresponde la transición de estado. |
| `estado` | ENUM EstadoPedido | NO | — | NN | Estado alcanzado en esta transición. |
| `actor_rol` | ENUM ActorPedido (`CLIENTE`,`DUENO`,`SISTEMA`,`EMPLEADO`) | NO | — | NN | Qué rol ejecutó esta transición puntual — se completa en **todas** las filas. Agregado en la Fase 19 (2026-09-15, ver `docs/DECISIONES.md`) a pedido explícito de Diego: trazabilidad completa del ciclo de vida, no solo de los estados terminales/`ENTREGADO`. Renombrado de `actor` a `actor_rol` el mismo día, al agregarse `actor_usuario_id` (rediseño), para distinguir explícitamente "qué rol" de "qué usuario puntual". Valor `EMPLEADO` agregado el 2026-09-16 como anticipación de diseño — sin ningún call site que lo use todavía, la entidad `Empleado` y su vínculo a `Usuario` no existen en el proyecto a esta fecha. Valor `COMERCIO` renombrado a `DUENO` el mismo día (2026-09-16, ver `docs/DECISIONES.md`): sin `ñ`, ASCII, consistente con el resto de identificadores del proyecto, y distingue explícitamente al Dueño de un futuro Empleado actuando en nombre del comercio — algo que `COMERCIO` no podía expresar. **Planificado (tramo E3, 2026-10-05):** el nombre de quien ejecutó cada transición se muestra en el detalle del pedido del panel del comercio (Dueno y Empleados), también cuando el Empleado ya está `INACTIVO` (el `actor_usuario_id` apunta al `Usuario`, que nunca se borra); el Cliente no ve qué empleado atendió su pedido |
| `actor_usuario_id` | INT | SÍ | NULL | FK → Usuario.id, `ON DELETE RESTRICT` | Usuario específico que ejecutó la transición, cuando `actor_rol` es `CLIENTE` o `COMERCIO` (y en el futuro `EMPLEADO`). NULL cuando `actor_rol = SISTEMA`. Agregado en el rediseño del 2026-09-15 (ver `docs/DECISIONES.md`) — antes solo se sabía el rol, no el usuario puntual. `ON DELETE RESTRICT` explícito: nunca se puede borrar un `Usuario` con historial asociado, la trazabilidad se preserva siempre. |
| `motivo_timeout` | ENUM MotivoTimeoutPedido (`TIMEOUT_PAGO`,`TIMEOUT_ENTREGA`,`TIMEOUT_RESPUESTA_COMERCIO`,`TIMEOUT_RETIRO_SUSPENSION`,`SUSPENSION_CLIENTE`,`TIMEOUT_PREPARACION_SUSPENSION`) | SÍ | NULL | — | Desde la `V45`, `TIMEOUT_PREPARACION_SUSPENSION` marca la cancelación por sistema de un pedido `EN_PREPARACION` a los 90 minutos de la suspensión del comercio (con reembolso total). Un pago aprobado que llega con el comercio suspendido cancela el pedido con `motivo_timeout = NULL` (no es un timeout). Desde la `V44`, `SUSPENSION_CLIENTE` marca la cancelación (`CANCELADO_POR_SISTEMA`) de un pedido sin pagar porque el Administrador suspendió la cuenta del Cliente, o del pedido que recibió un pago aprobado con la cuenta ya suspendida (no es un timeout, pero comparte la columna del motivo del sistema). Qué timeout automático disparó esta transición. Se completa **únicamente** en las 4 transiciones producidas por los jobs `@Scheduled` de `PedidoSchedulerService` (`expirarPagosVencidos`, `avisar75MinYAutoconfirmar` en su rama de autoconfirmación, `expirarPedidosSinRespuestaComercio`, `autoconfirmarRetirosPorSuspension`). NULL en cualquier otra transición de `actor_rol = SISTEMA` — en particular, la cascada de `PedidoService.cancelarPedidosPorSuspensionComercio` (disparada síncronamente por `AdministradorService.suspenderComercio`) no es un timeout, es una cancelación administrativa directa, y queda con `motivo_timeout = NULL`. Agregado en el mismo rediseño del 2026-09-15. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora exacta de la transición. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (pedido_id, fecha_hora)` | `INDEX (actor_usuario_id)`

**Nota de implementación (Fase 19):** el comercio del pedido no se desnormaliza en esta tabla — se resuelve vía `HistorialEstadoPedido.pedido.comercio`, un solo join, sin columna propia.

**Rediseño del 2026-09-15 (mismo día del alta inicial, ver `docs/DECISIONES.md`):** las columnas `cancelado_por` (ENUM CanceladoPor) y `fuente_entrega` (ENUM FuenteEntrega) que esta tabla heredó del diseño original del diccionario se eliminaron — `cancelado_por` era redundante 1:1 con `actor_rol` en toda cancelación real del código, y `fuente_entrega` ya vive en `Pedido` sin cambiar por transición, no correspondía repetirla acá. `Pedido.cancelado_por`/`Pedido.fuente_entrega` no se tocaron, mantienen su semántica ya documentada en la tabla `Pedido`.

---

### Tabla: Pago

**Descripción:** Registro del pago de un pedido. Se crea al generar la preferencia de Checkout Pro contra MercadoPago — **antes** de que exista ningún pago real — para poder reusar `mp_init_point`/`mp_sandbox_init_point` si el Cliente no completa el pago en el primer intento (evita preferencias duplicadas para el mismo Pedido); se completa recién cuando el webhook confirma el resultado real (ver Tramo MercadoPago 03, migración `V14`, `docs/DECISIONES.md`). Exactamente uno por pedido (UNIQUE en `pedido_id`). El `id_transaccion_mp` (`payment_id` de MP) es necesario para emitir reembolsos.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del pago. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN, UQ | Pedido al que corresponde el pago. UNIQUE: un solo pago por pedido. |
| `mp_preferencia_id` | VARCHAR(120) | SÍ | NULL | — | `id` de la preferencia de Checkout Pro devuelto por MercadoPago. Se completa al crear la preferencia, antes de que exista ningún pago real. |
| `mp_init_point` | VARCHAR(500) | SÍ | NULL | — | URL de checkout de producción devuelta por MercadoPago al crear la preferencia. |
| `mp_sandbox_init_point` | VARCHAR(500) | SÍ | NULL | — | URL de checkout de sandbox devuelta por MercadoPago al crear la preferencia (usada mientras `CuentaMercadoPago.es_cuenta_prueba = true` para la cuenta vinculada del Dueno). |
| `monto` | DECIMAL(10,2) | NO | — | NN | Monto total cobrado. Debe coincidir con `Pedido.total`; el webhook y la sincronización hoy no lo verifican. |
| `metodo_pago` | VARCHAR(30) | SÍ | NULL | — | Método de pago reportado por MercadoPago (ej. `"credit_card"`, `"debit_card"`, `"account_money"`). NULL hasta que se confirme el pago. |
| `mp_estado` | VARCHAR(30) | SÍ | NULL | — | Estado crudo del pago devuelto por `GET /v1/payments/{id}` de MercadoPago (`approved`/`pending`/`in_process`/`rejected`/`cancelled`/etc., más granular que `EstadoPagoPedido` de `Pedido`). Se completa recién cuando el webhook confirma un pago real. |
| `id_transaccion_mp` | VARCHAR(50) | SÍ | NULL | — | `payment_id` de MercadoPago. Se popula al recibir el webhook de pago aprobado. Requerido para emitir reembolsos. No se almacena en `Pedido`; la correlación webhook → pedido se hace en dos pasos: primero por el query param propio `pedidoId` de la `notification_url` (agregado por Bajoneá al crear la preferencia, ver `MercadoPagoPagoService`), usado solo como clave de búsqueda; después, antes de tocar cualquier estado, se valida cruzando contra el `external_reference = Pedido.id` real que devuelve `GET /v1/payments/{id}` — nunca se confía en el query param a ciegas. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de pago (momento de creación de la preferencia de Checkout Pro, no del webhook). |
| `fecha_confirmacion` | DATETIME | SÍ | NULL | — | Fecha y hora en que MercadoPago confirmó el pago exitosamente (momento del webhook o de la sincronización). Una vez cargada no se sobrescribe. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (pedido_id)`

---

### Tabla: AlertaWebhookMp

**Descripción:** Rastro persistente de casos del webhook o la sincronización de MercadoPago que el sistema no resuelve automáticamente (migraciones `V15`, `V17`, `V18`, `V22`). Solo registra: no modifica el pedido ni `Pago`. No tiene relación con `Pago` ni con `CuentaMercadoPago`. La consulta de las alertas por pantalla o endpoint no existe todavía.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la alerta. |
| `pedido_id` | INT | SÍ | NULL | FK → Pedido.id, `ON DELETE SET NULL` | Pedido involucrado (el reclamado por la notificación o el que recibió el pago). |
| `mp_payment_id` | VARCHAR(50) | NO | — | NN | `id` del pago en MercadoPago que originó la alerta. |
| `mp_external_reference` | VARCHAR(120) | SÍ | NULL | — | `external_reference` que devolvió MercadoPago para ese pago. |
| `motivo` | ENUM MotivoAlertaWebhookMp | NO | — | NN | Causa de la alerta (ver ENUM). |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora en que se registró la alerta. |
| `ip_origen` | VARCHAR(45) | SÍ | NULL | — | IP de la request que disparó la alerta. |
| `monto_esperado` | DECIMAL(10,2) | SÍ | NULL | — | Solo para `SPLIT_NO_APLICADO` (migración `V22`): `marketplace_fee` que se envió en la preferencia (`cargo_servicio_cliente + cargo_servicio_comercio`). |
| `monto_capturado` | DECIMAL(10,2) | SÍ | NULL | — | Solo para `SPLIT_NO_APLICADO`: monto de la entrada de comisión de marketplace que devolvió MercadoPago en `fee_details`, o NULL si esa entrada faltaba. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (pedido_id)` | `INDEX (mp_payment_id)`

**Reglas de negocio:**
- Los motivos `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO`, `PAGO_APROBADO_DUPLICADO` y `SPLIT_NO_APLICADO` son idempotentes por (pedido, pago, motivo): un aviso repetido no genera una segunda fila.

---

### Tabla: NotaCredito

**Descripción:** *(Reembolso total implementado el 2026-09-25 para `RECHAZADO`, `EXPIRADO` y la cancelación por suspensión de comercio — ver `ReembolsoService`. `CANCELADO`/`ANULADO` y el reembolso parcial por ítem siguen pendientes, marcados con TODO en `PedidoService`.)* Solicitud de reembolso al cliente. Se genera automáticamente ante eventos que implican devolución de dinero. Vinculada N:1 con `Pago` — desde 2026-08-28 (ver `docs/DECISIONES.md`) un mismo pago puede tener más de una nota de crédito asociada, una por cada cancelación/anulación parcial de ítems de su pedido (además del caso de reembolso total ya existente). El job periódico reintenta los reembolsos fallidos hasta un máximo de 5 intentos; al superarlos, emite la notificación T27 al Administrador.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la nota de crédito. |
| `pago_id` | INT | NO | — | FK → Pago.id, NN | Pago sobre el cual se realiza el reembolso. Ya **no** es UNIQUE desde 2026-08-28: un mismo pago puede tener varias notas de crédito (reembolso total, o una por cada cancelación/anulación parcial de ítems). |
| `monto` | DECIMAL(10,2) | NO | — | NN | Monto a reembolsar. Antes de 2026-08-28 siempre igual al `Pago.monto` (solo reembolso total); con la cancelación parcial de ítems puede ser un monto parcial, igual a la suma de los `DetallePedido.subtotal` cancelados/anulados en esa nota. |
| `motivo` | ENUM MotivoNotaCredito | SÍ | NULL | — | Origen de la nota de crédito. Agregado 2026-09-25 (V23). Nullable en el schema por compatibilidad; el código siempre lo completa. |
| `estado` | ENUM EstadoNotaCredito | NO | `'PENDIENTE'` | NN | Estado del proceso de reembolso ante la API de MercadoPago. |
| `intentos` | INT | NO | `0` | NN | Contador de intentos reales de solicitud de reembolso contra MercadoPago (una nota que nunca se intentó queda en 0). Diseño: máximo 5 con job de reintentos (pendiente); hoy un único intento. |
| `refund_id_mp` | VARCHAR(50) | SÍ | NULL | — | ID del reembolso en MercadoPago (`refund_id`). Se popula al confirmar el reembolso exitoso por la API. |
| `mp_payment_id` | VARCHAR(50) | SÍ | NULL | — | Id del pago de MercadoPago que se reembolsa (copia de `Pago.id_transaccion_mp` al crear la nota). Agregado 2026-09-25 (V23). |
| `ultimo_error` | VARCHAR(500) | SÍ | NULL | — | Último error del intento de reembolso (respuesta real de MercadoPago) o motivo de la revisión manual. Se limpia al procesarse con éxito. Agregado 2026-09-25 (V23). |
| `fecha_emision` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación de la nota de crédito (momento en que se origina la solicitud de reembolso). |
| `fecha_proceso` | DATETIME | SÍ | NULL | — | Fecha y hora en que el reembolso fue procesado exitosamente por MercadoPago. Se registra al pasar a `PROCESADO`. |
| `fecha_fallido` | DATETIME | SÍ | NULL | — | Fecha y hora en que se alcanzó el máximo de intentos fallidos. Se emite notificación T27 al Administrador en este momento. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (pago_id)` | `INDEX (estado)`

**Reglas de negocio:**
- **Criterio de pago reembolsable (corregido 2026-09-25):** `Pago.mp_estado = 'approved'` **y** `Pago.fecha_confirmacion` no nula. `Pago.id_transaccion_mp` por sí solo NO sirve: también se completa en pagos rechazados.
- Reembolso total: monto = `Pago.monto` completo (incluye el cargo de servicio; Bajoneá no retiene nada), pedido a `POST /v1/payments/{id}/refunds` con el `access_token` del Dueño y `X-Idempotency-Key` por intento.
- Flujo implementado: `PENDIENTE → PROCESADO` (éxito) o `PENDIENTE → FALLIDO` (error de MercadoPago, con el error en `ultimo_error`). Si la cuenta de MercadoPago del comercio está desvinculada, la nota nace directamente en `PENDIENTE_REVISION_MANUAL` y no se llama a MercadoPago. No se crea una nota nueva si las existentes (`PENDIENTE`/`PROCESADO`/`PENDIENTE_REINTENTO`/`PENDIENTE_REVISION_MANUAL`) ya cubren el monto del pago.
- Diseño pendiente de implementar: job periódico de reintentos (`PENDIENTE_REINTENTO`, hasta 5 intentos) y notificación T27 al Administrador al pasar a `FALLIDO`.
- `CANCELADO_POR_SISTEMA` sin pago confirmado (timeout de `PENDIENTE_PAGO`) nunca llama al reembolso ni genera nota.
- **Agregado 2026-08-28:** una `NotaCredito` puede corresponder a un reembolso total del pedido (sin ningún `DetallePedido` asociado, criterio anterior a esta fecha) o a un reembolso parcial originado por uno o más `DetallePedido.nota_credito_id` apuntando a ella (cancelación/anulación de ítems puntuales). Sin ningún Service/Controller que implemente esta segunda vía todavía — ver nota de alcance en `Tabla: DetallePedido` y en `docs/DECISIONES.md`.

---

## 10. Relaciones entre Tablas

| # | Tabla Origen | Campo FK | Tabla Destino | Tipo | Cardinalidad | Descripción |
|---|-------------|---------|--------------|------|-------------|-------------|
| 1 | `Localidad` | `provincia_id` | `Provincia` | N:1 | N localidades → 1 provincia | Cada localidad pertenece a una provincia. |
| 2 | `Persona` | `id` | `Usuario` | 1:1 | 1 persona = 1 usuario | Herencia por tabla compartida; PK idéntica. |
| 3 | `PersonaFisica` | `id` | `Persona` | 1:1 | 1 persona física = 1 persona | Subtipo concreto de Persona. |
| 4 | `PersonaJuridica` | `id` | `Persona` | 1:1 | 1 persona jurídica = 1 persona | Subtipo concreto de Persona. Mutuamente excluyente con PersonaFisica. |
| 5 | `Cliente` | `id` | `PersonaFisica` | 1:1 | 1 cliente = 1 persona física | Rol de negocio. Una misma persona física puede ser Cliente y Empleado; ver "Combinaciones de roles y contexto del Empleado" (sección 12). |
| 6 | `Administrador` | `id` | `PersonaFisica` | 1:1 | 1 administrador = 1 persona física | Rol de negocio. Un Administrador solo puede combinarse con Cliente (regla escrita, sin mecanismo hoy). |
| 7 | `Empleado` | `id` | `PersonaFisica` | 1:1 | 1 empleado = 1 persona física | Rol de negocio. Un Empleado solo puede combinarse con Cliente: no puede ser Dueno ni Administrador. |
| 8 | `Dueno` | `id` | `PersonaJuridica` | 1:1 | 1 Dueno = 1 persona jurídica | Rol de negocio. Titular de uno o varios comercios. |
| 9 | `Comercio` | `dueno_id` | `Dueno` | N:1 | N comercios → 1 Dueno | Un mismo Dueno puede administrar varios comercios. |
| 10 | `Direccion` | `localidad_id` | `Localidad` | N:1 | N direcciones → 1 localidad | Ubicación geográfica de la dirección. |
| 11 | `Direccion` | `cliente_id` | `Cliente` | N:1 | N direcciones → 1 cliente | Direcciones de entrega registradas por el cliente. |
| 12 | `Direccion` | `comercio_id` | `Comercio` | 1:1 | 1 dirección ↔ 1 comercio | Dirección operativa única del comercio (UNIQUE). |
| 13 | `HistorialEstadoUsuario` | `usuario_id` | `Usuario` | N:1 | N registros → 1 usuario | Historial de transiciones de estado del usuario. |
| 14 | `Horario` | `comercio_id` | `Comercio` | N:1 | N horarios → 1 comercio | Franjas horarias de atención del comercio. |
| 15 | `RedSocial` | `comercio_id` | `Comercio` | N:1 | N links → 1 comercio | Links de contacto y redes sociales del comercio. |
| 16 | `Token` | `usuario_id` | `Usuario` | N:1 | N tokens → 1 usuario | Tokens de seguridad generados para el usuario. |
| 17 | `Sesion` | `usuario_id` | `Usuario` | N:1 | N sesiones → 1 usuario | Historial de sesiones del usuario. |
| 18 | `Notificacion` | `usuario_id` | `Usuario` | N:1 | N notificaciones → 1 usuario | Notificaciones emitidas al usuario. |
| 19 | `Soporte` | `usuario_id` | `Usuario` | N:1 | N mensajes → 1 usuario | Mensajes de soporte enviados por el usuario. |
| 20 | `Soporte` | `administrador_id` | `Administrador` | N:1 | N mensajes → 1 administrador | Administrador que atendió el mensaje. |
| 21 | `Reclamo` | `pedido_id` | `Pedido` | 1:1 | 1 reclamo ↔ 1 pedido | Un reclamo por pedido (UNIQUE). |
| 22 | `Reclamo` | `administrador_id` | `Administrador` | N:1 | N reclamos → 1 administrador | Administrador que resolvió el reclamo. |
| 23 | `HistorialEstadoComercio` | `comercio_id` | `Comercio` | N:1 | N registros → 1 comercio | Historial de transiciones de estado del comercio. |
| 24 | `HistorialEstadoComercio` | `administrador_id` | `Administrador` | N:1 | N registros → 1 administrador | Administrador que ejecutó la transición (NULL si fue el sistema o el Dueno). |
| 24b | `HistorialCambioComercio` | `historial_estado_comercio_id` | `HistorialEstadoComercio` | N:1 | N cambios → 1 fila de historial | Campos que el Dueno cambió al re-solicitar un comercio rechazado (`ON DELETE CASCADE`). |
| 24c | `HistorialCierreComercio` | `comercio_id` | `Comercio` | N:1 | N registros → 1 comercio | Cierres y reaperturas manuales del comercio. |
| 24d | `HistorialCierreComercio` | `actor_usuario_id` | `Usuario` | N:1 | N registros → 1 usuario | Usuario que cerró o abrió el comercio (NULL si fue el sistema). |
| 25 | `ConfiguracionTarifa` | `administrador_id` | `Administrador` | N:1 | N configs → 1 administrador | Configuraciones de tarifa registradas por el admin. |
| 26 | `CuentaMercadoPago` | `dueno_id` | `Dueno` | 1:1 | 1 cuenta ↔ 1 Dueno | Credenciales OAuth MP del Dueno, compartidas por todos sus comercios (UNIQUE). |
| 27 | `EmpleadoComercio` | `empleado_id` | `Empleado` | N:1 | N relaciones → 1 empleado | Comercios donde opera el empleado. |
| 28 | `EmpleadoComercio` | `comercio_id` | `Comercio` | N:1 | N relaciones → 1 comercio | Empleados que operan el comercio. |
| 29 | `Producto` | `comercio_id` | `Comercio` | N:1 | N productos → 1 comercio | Catálogo de productos del comercio. |
| 30 | `Producto` | `categoria_id` | `Categoria` | N:1 | N productos → 1 categoría | Clasificación del producto. |
| 31 | `ImagenProducto` | `producto_id` | `Producto` | N:1 | N imágenes → 1 producto | Galería de imágenes del producto (máx. 5). |
| 32 | `ProductoTag` | `producto_id` | `Producto` | N:1 | N registros → 1 producto | Unión M:N: tags de un producto. |
| 33 | `ProductoTag` | `tag_id` | `Tag` | N:1 | N registros → 1 tag | Unión M:N: productos con un tag dado. |
| 34 | `GrupoExtra` | `comercio_id` | `Comercio` | N:1 | N grupos → 1 comercio | Grupos de extras configurados por el comercio. |
| 35 | `Extra` | `grupo_extra_id` | `GrupoExtra` | N:1 | N extras → 1 grupo | Opciones individuales dentro de un grupo. |
| 36 | `ProductoGrupoExtra` | `producto_id` | `Producto` | N:1 | N registros → 1 producto | Unión M:N: grupos de extras de un producto. |
| 37 | `ProductoGrupoExtra` | `grupo_extra_id` | `GrupoExtra` | N:1 | N registros → 1 grupo | Unión M:N: productos que ofrecen un grupo dado. |
| 38 | `Carrito` | `cliente_id` | `Cliente` | 1:1 | 1 carrito ↔ 1 cliente | Carrito persistente y único por cliente (UNIQUE). |
| 39 | `Carrito` | `comercio_id` | `Comercio` | N:1 | N carritos → 1 comercio | Comercio activo en el carrito del cliente. |
| 40 | `ItemCarrito` | `carrito_id` | `Carrito` | N:1 | N ítems → 1 carrito | Contenido del carrito. |
| 41 | `ItemCarrito` | `producto_id` | `Producto` | N:1 | N ítems → 1 producto | Producto incluido en el ítem del carrito. |
| 42 | `ItemCarritoExtra` | `item_carrito_id` | `ItemCarrito` | N:1 | N extras → 1 ítem | Extras seleccionados para un ítem del carrito. |
| 43 | `ItemCarritoExtra` | `extra_id` | `Extra` | N:1 | N registros → 1 extra | Extra elegido en el carrito. |
| 44 | `Pedido` | `cliente_id` | `Cliente` | N:1 | N pedidos → 1 cliente | Pedidos realizados por el cliente. |
| 45 | `Pedido` | `comercio_id` | `Comercio` | N:1 | N pedidos → 1 comercio | Pedidos recibidos por el comercio. |
| 46 | `Pedido` | `direccion_id` | `Direccion` | N:1 | N pedidos → 1 dirección | Dirección de entrega (solo `DOMICILIO`). |
| 47 | `DetallePedido` | `pedido_id` | `Pedido` | N:1 | N detalles → 1 pedido | Ítems snapshooteados al confirmar el pedido. |
| 48 | `DetallePedido` | `producto_id` | `Producto` | N:1 | N detalles → 1 producto | Referencia histórica al producto detallado. |
| 49 | `DetallePedidoExtra` | `detalle_pedido_id` | `DetallePedido` | N:1 | N extras → 1 detalle | Extras snapshooteados de un ítem del pedido. |
| 50 | `DetallePedidoExtra` | `extra_id` | `Extra` | N:1 | N registros → 1 extra | Referencia histórica al extra pedido. |
| 51 | `HistorialEstadoPedido` | `pedido_id` | `Pedido` | N:1 | N registros → 1 pedido | Trazabilidad de transiciones de estado. |
| 52 | `Pago` | `pedido_id` | `Pedido` | 1:1 | 1 pago ↔ 1 pedido | Pago asociado al pedido (UNIQUE). |
| 53 | `NotaCredito` | `pago_id` | `Pago` | N:1 | N notas → 1 pago | Solicitud(es) de reembolso asociadas al pago. Pasó de 1:1 a N:1 el 2026-08-28 (ya no UNIQUE) para permitir una nota de crédito parcial por cada cancelación/anulación de ítems, además de la nota de reembolso total. |
| 54 | `Dueno` | `persona_fisica_id` | `PersonaFisica` | 1:1 | 1 Dueno = 1 persona física | Titular legal del negocio, misma persona física que ya está asociada al mismo Usuario/Persona (UNIQUE). |
| 55 | `DetallePedido` | `nota_credito_id` | `NotaCredito` | N:1 | N ítems → 1 nota de crédito | Nota de crédito parcial asociada a la cancelación/anulación de este ítem puntual. Agregada 2026-08-28; NULL mientras `estado = ACTIVO`. |
| 56 | `AlertaWebhookMp` | `pedido_id` | `Pedido` | N:1 | N alertas → 1 pedido | Rastro de casos no resueltos del webhook de MercadoPago (`ON DELETE SET NULL`). |
| 57 | `CodigoVinculacionMp` | `dueno_id` | `Dueno` | N:1 | N intentos → 1 Dueno | Intentos de vinculación OAuth de MercadoPago. |
| 58 | `HistorialCambioNombreUsuario` | `usuario_id` | `Usuario` | N:1 | N cambios → 1 usuario | Auditoría de los cambios de nombre de usuario (`ON DELETE CASCADE`). |
| 59 | `InvitacionEmpleado` | `comercio_id` | `Comercio` | N:1 | N invitaciones → 1 comercio | *Implementada (`V30`).* Invitaciones enviadas para operar el comercio. |
| 60 | `InvitacionEmpleado` | `invitado_por_usuario_id` | `Usuario` | N:1 | N invitaciones → 1 usuario | *Implementada (`V30`).* Dueno que envió la invitación. |
| 61 | `InvitacionEmpleado` | `usuario_aceptante_id` | `Usuario` | N:1 | N invitaciones → 1 usuario | *Implementada (`V30`).* Usuario que la aceptó (`NULL` hasta entonces). |
| 62 | `HistorialEmpleadoComercio` | `comercio_id` | `Comercio` | N:1 | N eventos → 1 comercio | *Implementada (`V31`).* Historial del equipo del comercio. |
| 63 | `HistorialEmpleadoComercio` | `empleado_comercio_id` | `EmpleadoComercio` | N:1 | N eventos → 1 relación | *Implementada (`V31`).* Relación afectada (nulable: eventos de invitación). |
| 64 | `HistorialEmpleadoComercio` | `invitacion_id` | `InvitacionEmpleado` | N:1 | N eventos → 1 invitación | *Implementada (`V31`).* Invitación afectada (nulable: eventos de la relación). |
| 65 | `HistorialEmpleadoComercio` | `actor_usuario_id` | `Usuario` | N:1 | N eventos → 1 usuario | *Implementada (`V31`).* Quien ejecutó el evento. |
| 66 | `HistorialEdicionComercio` | `comercio_id` | `Comercio` | N:1 | N registros → 1 comercio | *Implementada (`V32`, tramo E3, bloque A1).* Registro de ediciones del catálogo y el perfil del comercio. |
| 67 | `HistorialEdicionComercio` | `usuario_id` | `Usuario` | N:1 | N registros → 1 usuario | *Implementada (`V32`, tramo E3, bloque A1).* Quien hizo la acción. |
| 68 | `DocumentoComercio` | `comercio_id` | `Comercio` | N:1 | N documentos → 1 comercio | Documentos de habilitación del comercio (v1.28). |
| 69 | `DocumentoComercio` | `administrador_id` | `Administrador` | N:1 | N documentos → 1 administrador | Quien resolvió el documento por última vez; `NULL` mientras está `PENDIENTE`. |
| 70 | `DocumentoComercio` | `subido_por_usuario_id` | `Usuario` | N:1 | N documentos → 1 usuario | Quien lo subió (siempre el Dueno). |
| 71 | `DocumentoComercioArchivo` | `documento_id` | `DocumentoComercio` | 1:1 | 1 contenido = 1 documento | El binario del documento, en tabla aparte. |

---

## 11. Restricciones UNIQUE — Resumen

| Tabla | Campo(s) | Descripción |
|-------|----------|-------------|
| `Usuario` | `email` | Email único en toda la plataforma. |
| `Usuario` | `nombre_usuario` | Nombre de usuario (credencial de login) único en toda la plataforma, sin importar el rol. |
| `PersonaFisica` | `dni` | DNI único en toda la plataforma. |
| `PersonaJuridica` | `cuit` | CUIT único en toda la plataforma. |
| `Direccion` | `comercio_id` | Un comercio tiene exactamente una dirección. |
| `Token` | `token` | Valor de token irrepetible (UUID v4 en el diseño original; código numérico de 6 dígitos en el MVP desde el Tramo 16.12 para los tipos existentes en ese momento — ver `docs/modelo-mvp.md`). |
| `CuentaMercadoPago` | `dueno_id` | Un Dueno tiene como máximo una cuenta MP, compartida por todos sus comercios. |
| `CuentaMercadoPago` | `mp_user_id_activo` | Una cuenta de MercadoPago activa pertenece a un solo Dueno (índice único sobre la columna generada, migración `V27`). |
| `RedSocial` | `(comercio_id, tipo)` | Un comercio no puede tener dos links activos del mismo tipo (validado a nivel aplicación, solo filas activas). |
| `EmpleadoComercio` | `(empleado_id, comercio_id)` | Un empleado no puede tener más de una relación con el mismo comercio. |
| `InvitacionEmpleado` | `(comercio_id, email, pendiente_clave)` | *Implementada (`V30`).* Una sola invitación pendiente por comercio y email (la columna generada es `NULL` fuera de `PENDIENTE`). |
| `InvitacionEmpleado` | `(email, codigo, pendiente_clave)` | *Implementada (`V30`).* Un código no se repite entre las invitaciones pendientes de un mismo email. |
| `Categoria` | `nombre` | Nombre de categoría único. |
| `Tag` | `nombre` | Nombre de tag único. |
| `Carrito` | `cliente_id` | Un cliente tiene exactamente un carrito. |
| `Reclamo` | `pedido_id` | Máximo un reclamo por pedido. |
| `Pago` | `pedido_id` | Exactamente un pago por pedido. |
| `CodigoVinculacionMp` | `identificador_intento` | Cada intento de vinculación OAuth de MercadoPago tiene un `state` irrepetible. |
| `ProductoTag` | `(producto_id, tag_id)` | PK compuesta; evita tags duplicados por producto. |
| `ProductoGrupoExtra` | `(producto_id, grupo_extra_id)` | PK compuesta; evita grupos de extras duplicados por producto. |
| `Dueno` | `persona_fisica_id` | Un Dueno tiene como máximo una `PersonaFisica` titular; cada `PersonaFisica` puede estar asociada a lo sumo un `Dueno`. |

---

## 12. Reglas de Negocio Transversales

### Combinaciones de roles y contexto del Empleado

> Decidido el 2026-10-05 (ver `docs/DECISIONES.md`). Implementado en parte en el tramo E1 (bloques A1 y A2, 2026-10-06): `InvitacionEmpleado`, `HistorialEmpleadoComercio`, el nuevo `EstadoEmpleadoComercio` y el servicio de matriz de roles (`MatrizRolesService`, que lee las capacidades de una cuenta con un `existsById` por tabla de subtipo y rechaza invitar a un Dueno o Administrador). Sigue **planificado** (A3 a A5, E2 a E4): aceptar invitaciones, endpoints, pantallas, el contexto del Empleado en cada request y `HistorialEdicionComercio`.

- **Regla de combinaciones (regla de negocio):** un Administrador es Administrador o Cliente; un Dueno es Dueno o Cliente; un Empleado es Empleado o Cliente. Un Cliente puede sumar el rol Empleado por invitación. Un Dueno no puede ser Empleado de otro local y un Administrador no puede ser Empleado ni Dueno.
- **Alcance:** solo se construye y se hace cumplir "Empleado + Cliente" y que un Empleado nunca sea Dueno ni Administrador. "Dueno + Cliente" y "Administrador + Cliente" quedan como regla escrita sin mecanismo: hoy ni el Dueno ni el Administrador tienen fila `Cliente` y las rutas de Cliente exigen `ROLE_CLIENTE`. Un Cliente existente tampoco puede pasar a Dueno (registrar un comercio con un email o DNI existentes responde `409`) y no se construye en este bloque.
- **No existe multirol físico:** `Usuario.rol` es una sola columna y el token de sesión lleva un solo rol. Quien es Empleado conserva `rol = CLIENTE`; el contexto "Empleado de un comercio" se resuelve por request con el encabezado `X-Comercio-Id` (el mismo mecanismo del selector de comercio del Dueno) y la relación `EmpleadoComercio` `ACTIVO` comprobada contra la base en cada request. El valor `EMPLEADO` de `RolUsuario` y de `TipoToken.INVITACION_EMPLEADO` existen en la base pero no se usan.
- **Validación de la matriz:** al invitar, si el email pertenece a un Dueno o a un Administrador, no se crea la invitación y el Dueno ve el mensaje genérico "No se puede invitar a este email" (sin revelar el tipo de cuenta); se vuelve a validar al aceptar. Se decide mirando las filas de subtipo (`Administrador`, `Dueno.persona_fisica_id`, `Empleado`, `Cliente`), no `Usuario.rol`.
- **Ex Empleado:** quien fue Empleado (aunque la relación esté `INACTIVO`) no puede registrar un comercio con esa cuenta. Es una limitación conocida; los casos raros se resuelven por soporte.
- **Estados de la relación:** `ACTIVO`/`INACTIVO` en la base. La fila nace al aceptar la invitación, ya `ACTIVO`, o se reactiva (misma fila). Reactivar sin código solo si lo dio de baja el Dueno; si renunció o se canceló la invitación hace falta una invitación nueva. En pantalla además se ve "Pendiente" y "Vencida", derivados de `InvitacionEmpleado`.
- **Comercio no operativo:** un Empleado ve en su selector los comercios `SUSPENDIDO` y `CERRADO_TEMPORALMENTE` con aviso. Puede despachar, entregar (también un pedido `LISTO_PARA_RETIRAR`) y anular los pedidos ya aceptados (el servidor responde `409` a todo lo demás: aceptar pedidos nuevos, tocar productos o el perfil, abrir o cerrar). Las entregas de los pedidos `EN_CAMINO` no las confirma el comercio: las confirma el Cliente o el sistema (aviso a los 75 minutos y autoconfirmación a los 90). El Dueno queda sin cambios por ahora; la diferencia se resuelve en el tramo de rediseño de la suspensión. `INACTIVO`, `RECHAZO_DEFINITIVO`, `PENDIENTE` y `RECHAZADO` no aparecen. Las relaciones no se tocan por cambios de estado del comercio.
- **Pedido propio:** un Empleado puede pedir en su propio comercio como Cliente pero no puede gestionar sus propios pedidos (se valida por el id del usuario); no recibe la notificación de "pedido nuevo" de su propio pedido.
- **Permisos delegables (lista blanca por ruta exacta; todo lo no clasificado queda bloqueado):** 17 escrituras (9 de productos con sus imágenes y firmas, 3 de comercio —datos operativos, cerrar y abrir— más la edición de horarios y 5 de pedidos: aceptar, rechazar, despachar, entregar y anular), más las lecturas del perfil reducido (sin razón social, CUIT, condición de IVA, tipo de sociedad, domicilio fiscal, fecha de inicio ni representante), productos, pedidos y ventas, y las notificaciones con el encabezado del comercio. Del comercio el Empleado edita solo la descripción, el teléfono y los horarios; el nombre, la foto, la dirección y el tipo de comercio los ve en solo lectura. Futuros delegables: extras y grupos de extras. La edición de horarios ya es delegable desde el tramo T1 de la Fase 2 (`PUT /comercios/perfil/horarios`). Exclusivo del Dueno: alta adicional y corrección o re-solicitud de comercio, nombre, foto, dirección y tipo de comercio, redes sociales, todo lo de MercadoPago (incluido el enlace de pago de un pedido), datos fiscales, la gestión del equipo (invitar, reenviar, cancelar, desactivar, reactivar, actividad) y la futura documentación de habilitación.
- **Sesión única:** un login en otro dispositivo cierra la sesión anterior en ambos contextos (Cliente y Empleado).

### Ciclo de vida del usuario y propagación al comercio

> Aplica específicamente al rol Dueno: sus cambios de estado propagan a TODOS los comercios que administra. Los cambios de estado de un Empleado no propagan ningún efecto sobre los comercios donde opera — solo afectan su propio acceso (login/sesión).

| Evento | Estado Usuario resultante | Estado Comercio resultante |
|--------|--------------------------|--------------------------|
| Registro (sin verificar email) | `PENDIENTE` | — |
| Verificación de email | `ACTIVO` | — |
| 3 intentos fallidos de login o cambio de contraseña | `BLOQUEADO` | `CERRADO_TEMPORALMENTE` (solo los que estaban en `APTO_VENTA`) |
| Recuperación de contraseña exitosa (desbloqueo) | `ACTIVO` | `APTO_VENTA` si sigue cumpliendo la regla de seguir vendiendo (cuenta MP activa y un documento aprobado), o `APROBADO` si no (si era `CERRADO_TEMPORALMENTE`) |
| Suspensión por Administrador | `SUSPENDIDO` | `SUSPENDIDO` |
| Levantamiento de suspensión por Administrador | `ACTIVO` | `APROBADO` |
| Inactivación automática (3 meses sin actividad) | `INACTIVO` | `INACTIVO` |
| Reactivación por token de reactivación | `ACTIVO` | `APTO_VENTA` si cumple la regla de seguir vendiendo, o `APROBADO` si no (si era `INACTIVO`); confirmar dos veces el mismo código restaura una sola vez |
| Aprobación del Administrador con el Dueno `BLOQUEADO` y cuenta MP activa | `BLOQUEADO` | `CERRADO_TEMPORALMENTE` (no `APTO_VENTA`) |
| Vinculación de MercadoPago con el Dueno `BLOQUEADO` | `BLOQUEADO` | `CERRADO_TEMPORALMENTE` los que estaban `APROBADO` |

### Suspensión de la cuenta de un Cliente (v1.29)

- **Quién y cómo.** Solo el Administrador suspende y levanta (`PUT /api/v1/administrador/clientes/{id}/suspender` y `/levantar-suspension`), y solo a un usuario con rol `CLIENTE` (un Empleado es un Cliente). Un Dueño responde `409` "Todavía no se puede suspender a un Dueño desde acá" y un Administrador `409` (nunca se suspende; tampoco a uno mismo). Motivo al suspender: 10 a 500 caracteres, visible para la persona. La suspensión es indefinida. Motivo al levantar: opcional, hasta 500 caracteres, se guarda en el historial y viaja en el aviso T29.
- **Prevalece sobre el bloqueo.** Suspender una cuenta `BLOQUEADA` la pisa; levantar la deja `ACTIVO` con `intentos_fallidos = 0`. Una cuenta que estaba `PENDIENTE` (sin verificar) vuelve a `PENDIENTE`, no a `ACTIVO`.
- **Login.** Primero se comprueba la contraseña y recién después se revela el estado: contraseña incorrecta en una cuenta suspendida da el mensaje genérico, sin intentos restantes y sin sumar intentos; contraseña correcta da `409` con `data.codigo = CUENTA_SUSPENDIDA` y `data.motivo`, sin crear sesión. Con la sesión ya abierta, la siguiente request responde `401` con el mismo código y motivo (el filtro JWT mira el estado del usuario en cada request). Recuperar la contraseña cambia la contraseña pero no levanta la suspensión; la verificación del email solo activa cuentas `PENDIENTE`.
- **Efectos.** Los pedidos ya pagados siguen su curso. Los pedidos `PENDIENTE_PAGO` se cancelan (`CANCELADO_POR_SISTEMA`, `motivo_timeout = SUSPENSION_CLIENTE`), cada uno en su propia transacción, después del commit de la suspensión. Un pago aprobado que llega después sobre un pedido todavía sin pagar o ya cancelado se devuelve entero en el acto (nota de crédito `SUSPENSION_CLIENTE`). El carrito se conserva; el checkout y "Ir a pagar" responden `409` `CUENTA_SUSPENDIDA`. Un Cliente suspendido que es Empleado no puede operar ningún comercio (las escrituras del comercio y las transiciones de pedido comprueban el estado de quien actúa dentro de la transacción).
- **Avisos.** Aviso dentro de la app (T28 al suspender, T29 al levantar) y un email con un solo intento; el resultado queda en `notificacion` (canal `EMAIL`, `ENVIADO` o `FALLIDO`) y el Administrador puede reenviar el último fallido (`POST /api/v1/administrador/clientes/{id}/suspension/reenviar-email`).
- **Pago aprobado sobre un pedido ya cancelado, por cualquier causa.** Siempre termina en reembolso total (motivo `SUSPENSION_CLIENTE` si el Cliente está suspendido y `CANCELACION_CLIENTE` en cualquier otro caso); antes solo dejaba una alerta y la plata quedaba retenida.

### Suspensión de un comercio (v1.30)

- **Quién y cómo.** Solo el Administrador (`PUT /api/v1/administrador/comercios/{id}/suspender` con motivo de 10 a 500 caracteres, `PUT .../levantar-suspension` con mensaje opcional de hasta 500, `GET .../suspension/previa` con los pedidos por estado y `POST .../suspension/reenviar-email`). Se suspenden `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE`; cualquier otro estado da `409`. La suspensión es indefinida.
- **Origen y fecha.** Se guardan `suspension_origen`, `suspendido_desde` y `motivo_suspension`. Re-suspender uno `INDIVIDUAL` da `409`; uno de origen `DUENO` pasa a `INDIVIDUAL` con el motivo nuevo y conserva `suspendido_desde`. Un comercio de origen `DUENO` no se levanta individualmente (`409`: hay que levantar la suspensión del Dueño).
- **Levantar.** El destino lo decide `AptitudVentaComercioService` con la regla de seguir vendiendo (cuenta de Mercado Pago activa y al menos un documento aprobado; un documento en revisión no frena): `APTO_VENTA`, o `APROBADO` si falta algo, o `CERRADO_TEMPORALMENTE` si cumple pero la cuenta del Dueño está `BLOQUEADO`. El cierre manual no se toca. Se limpian los tres campos.
- **La suspensión prevalece.** Mientras dure, aprobar documentos, vincular Mercado Pago, bloquear o restaurar la cuenta del Dueño y el cierre manual no cambian el estado del comercio.
- **Pedidos.** Suspender no toca ningún pedido. `PENDIENTE_CONFIRMACION_COMERCIO`: el equipo solo puede rechazar (reembolso inmediato; aceptar da `409` `COMERCIO_SIN_OPERACION`, también para el Dueño) y sigue el vencimiento de 30 minutos. `EN_PREPARACION`: el equipo despacha o anula; si no, el sistema lo cancela con reembolso total a los 90 minutos de `suspendido_desde` (`TIMEOUT_PREPARACION_SUSPENSION`, nota `SUSPENSION_COMERCIO`, aviso T11 al Cliente). `LISTO_PARA_RETIRAR`: el equipo entrega o cierra como `NO_RETIRADO`; si no, el sistema lo cierra como `NO_RETIRADO` sin reembolso a los 90 minutos contados desde que quedó listo o desde `suspendido_desde`, lo que haya pasado después (`TIMEOUT_RETIRO_SUSPENSION`, aviso T36). `EN_CAMINO`: no se toca. `PENDIENTE_PAGO`: "Ir a pagar" da `409`; un pago aprobado que llega con el comercio suspendido cancela el pedido y se devuelve en el acto (nota `SUSPENSION_COMERCIO`). Levantar la suspensión detiene los dos topes sin escribir nada (los procesos revalidan, con el comercio y el pedido bloqueados, que el comercio siga suspendido).
- **Solo lectura.** Con el comercio suspendido el Dueño y el Empleado no editan productos, precios, perfil, horarios ni redes (`409` `COMERCIO_SUSPENDIDO`) y no abren ni cierran (`409` `COMERCIO_NO_OPERATIVO`); el equipo no se invita, no se da de baja y no acepta una invitación pendiente; no se desvincula Mercado Pago. Siguen permitidos ver pedidos, estadísticas y documentos, subir documentos y vincular Mercado Pago.
- **Avisos.** Al Dueño, T16 al suspender y T29 al levantar: aviso dentro de la app con el motivo (o el mensaje) y un email con un solo intento después del commit, con rastro por comercio (`notificacion`, canal `EMAIL`, `ENVIADO` o `FALLIDO`); el Administrador puede reenviar el último fallido. A los Empleados `ACTIVO` con la cuenta no suspendida, avisos solo dentro de la app, sin motivo y sin email (`COMERCIO_SUSPENDIDO_EQUIPO` y `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO`).
- **Pago aprobado sobre un pedido cancelado, por cualquier causa.** Siempre termina en reembolso total: `SUSPENSION_CLIENTE` si el Cliente está suspendido, `SUSPENSION_COMERCIO` si lo está el comercio y `PAGO_TARDIO` en cualquier otro caso.
- **Concurrencia.** Orden de bloqueo: usuarios del Dueño y de los Empleados activos (compartido, id ascendente), relaciones, cuenta de Mercado Pago del Dueño (solo al levantar), comercio. Los procesos de 90 minutos toman un pedido por transacción: usuarios, comercio compartido y pedido, y revalidan estado y fecha con todo bloqueado.

### Solicitud de comercio: rechazo, corrección y rechazo definitivo

| Evento | Estado Comercio resultante | Historial |
|--------|---------------------------|-----------|
| Alta (primer comercio o adicional) | `PENDIENTE` (`cantidad_resolicitudes = 0`) | — |
| El Administrador aprueba | `APROBADO`, o `APTO_VENTA` si el Dueno tiene una `CuentaMercadoPago` activa | `PENDIENTE → APROBADO` (con el Administrador) y, si corresponde, `APROBADO → APTO_VENTA` (sin administrador) |
| El Administrador rechaza (motivo obligatorio) | `RECHAZADO` | `PENDIENTE → RECHAZADO` |
| El Dueno corrige y vuelve a solicitar (hasta 3 veces por comercio) | `PENDIENTE` (`cantidad_resolicitudes + 1`, `fecha_resolicitud`) | `RECHAZADO → PENDIENTE` + un registro por campo cambiado en `HistorialCambioComercio` |
| El Administrador rechaza una re-solicitud y ya se usaron todas (decide el servidor), o rechaza pidiendo el rechazo definitivo | `RECHAZO_DEFINITIVO` | `PENDIENTE → RECHAZO_DEFINITIVO` |

`RECHAZO_DEFINITIVO` no tiene salida desde la aplicación. Notificaciones al Dueno (tipo `COMERCIO_RECHAZADO`): "Tu comercio {nombre} fue rechazado. Motivo: …" y "Tu comercio {nombre} fue rechazado de forma definitiva. Motivo: …" (sin comillas). La re-solicitud no genera ninguna notificación al Administrador.

### Ciclo de vida del pedido

```
PENDIENTE_PAGO ──[webhook aprobado]──→ PENDIENTE_CONFIRMACION_COMERCIO ──[comercio acepta]──→ EN_PREPARACION
                                                                              │
                                                          DOMICILIO: ──→ EN_CAMINO ──→ ENTREGADO
                                                          RETIRO:    ──→ LISTO_PARA_RETIRAR ──→ ENTREGADO
                                                                                              └─→ NO_RETIRADO

PENDIENTE_PAGO ──[timeout 30 min]──────────────────────→ CANCELADO_POR_SISTEMA (sin reembolso)
PENDIENTE_PAGO ──[pago rechazado por MP]───────────────→ sin cambio de estado (queda en PENDIENTE_PAGO con pago_estado RECHAZADO; se puede reintentar hasta el timeout)
PENDIENTE_CONFIRMACION_COMERCIO ──[timeout 30 min]─────→ EXPIRADO (con reembolso)
PENDIENTE_CONFIRMACION_COMERCIO ──[comercio rechaza]───→ RECHAZADO (con reembolso)
EN_PREPARACION ──[comercio anula]──────────────────────→ ANULADO (con reembolso)
EN_PREPARACION ──[90 min desde la suspensión del comercio]─→ CANCELADO_POR_SISTEMA (motivo TIMEOUT_PREPARACION_SUSPENSION, con reembolso; la suspensión por sí sola no toca el pedido)
EN_CAMINO      ──[90 min sin confirmación]─────────────→ ENTREGADO (fuente_entrega: SISTEMA)
LISTO_PARA_RETIRAR ──[90 min desde que quedó listo o desde la suspensión]──→ NO_RETIRADO (actor SISTEMA, motivo TIMEOUT_RETIRO_SUSPENSION, sin reembolso)
LISTO_PARA_RETIRAR ──[Dueño o Empleado, tras 60 min listo]─→ NO_RETIRADO (sin reembolso)
```

> **Caso borde pago tardío:** si llega un pago aprobado y el pedido ya está en `CANCELADO_POR_SISTEMA` (timeout procesado antes del webhook), el diseño prevé generar el reembolso inmediatamente, ya que el cobro efectivamente ocurrió. Implementado hoy: solo se registra una alerta `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO` en `AlertaWebhookMp`; el pedido no se modifica y no se reembolsa (flujo de `NotaCredito` pendiente). Un segundo pago aprobado con otro id sobre un pedido ya pagado registra `PAGO_APROBADO_DUPLICADO`.

### Integridad de montos en pedidos

- `DetallePedido.precio_unitario` = `Producto.precio` al momento de confirmar. Inmutable post-inserción.
- `DetallePedido.subtotal` = `precio_unitario × cantidad`. Calculado al insertar.
- Si el ítem tiene extras seleccionados, el costo de los extras se suma al subtotal del ítem: `SUM(DetallePedidoExtra.precio_unitario) × DetallePedido.cantidad` — cada extra se multiplica por la cantidad del producto padre (criterio confirmado, ver tabla `DetallePedidoExtra`).
- `Pedido.subtotal` = suma de todos los `DetallePedido.subtotal` del pedido (incluyendo extras). Calculado al crear.
- `Pedido.total` = `subtotal + cargo_servicio_cliente`. Calculado al crear.
- `marketplace_fee` de la preferencia de Checkout Pro = `Pedido.cargo_servicio_cliente + Pedido.cargo_servicio_comercio`, enviado ya calculado en pesos (monto absoluto, no porcentaje). MercadoPago acredita el pago completo en la cuenta del comercio y transfiere ese monto a la cuenta dueña de la aplicación. Al aprobarse el pago, el sistema compara ese monto contra el `fee_details` del pago; si no coincide se registra `SPLIT_NO_APLICADO` en `AlertaWebhookMp` sin bloquear nada.
- `Pago.monto` = `Pedido.total`. Diseño pendiente de implementar: verificarlo al procesar el webhook; hoy el webhook y la sincronización no lo verifican.

### Gestión de reembolsos

- Los reembolsos siempre se canalizan a través de `NotaCredito`. Nunca se emiten directamente desde `Pedido`.
- `CANCELADO_POR_SISTEMA` sin pago confirmado (timeout de `PENDIENTE_PAGO`, con el pago sin resolver o rechazado) **no** genera `NotaCredito`.
- Reembolso total implementado (2026-09-25) para `RECHAZADO`, `EXPIRADO` y la cancelación por suspensión de comercio. Pendiente: `CANCELADO` y `ANULADO` (todavía sin endpoint real; solo cambian de estado, con un TODO en `PedidoService`) y el reembolso parcial por ítem.
- Máximo 5 intentos de reembolso vía API de MP. Al agotar los intentos: `estado = FALLIDO`, notificación T27.

### Documentos del comercio y aptitud de venta (v1.28)

- **Quién:** el Dueno sube y ve los documentos de su comercio; el Administrador los revisa y los puede ver por comercio; el Empleado no los ve ni los sube.
- **Regla de `APTO_VENTA` (única fuente: `AptitudVentaComercioService`):** entrar exige cuenta de MercadoPago activa + al menos un documento `APROBADO` + ningún documento `PENDIENTE`; seguir exige cuenta activa + al menos un `APROBADO`. Con la cuenta del Dueno `BLOQUEADO`, el comercio que cumpliría queda en `CERRADO_TEMPORALMENTE`.
- **Interruptor:** `comercio.documentacion.requerida` (variable `COMERCIO_DOCUMENTACION_REQUERIDA`), `true` por defecto; con `false` los documentos se ignoran y la regla es la de antes de la v1.28 (solo MercadoPago).
- **Eventos que recalculan** (`MotivoRecalculo`): documento subido, aprobado, rechazado, revocado o eliminado; MercadoPago vinculado o desvinculado; cuenta del Dueno bloqueada o restaurada; comercio aprobado. Queda previsto `SUSPENSION_LEVANTADA` para el tramo de la suspensión (no implementado).

| Escenario | Resultado |
|-----------|-----------|
| `APROBADO` con MercadoPago sube su primer documento | `APROBADO` (en revisión) |
| …el Administrador lo aprueba | `APTO_VENTA` (aviso `COMERCIO_APTO_VENTA`) |
| `APTO_VENTA` sube un segundo documento, o le rechazan uno extra | `APTO_VENTA` |
| El Administrador revoca el único aprobado | `APROBADO` (aviso `COMERCIO_SIN_APTITUD`) |
| Revoca uno de dos aprobados | `APTO_VENTA` |
| Desvincula MercadoPago | `APROBADO` |
| Vuelve a vincular con documentos aprobados y ninguno en revisión | `APTO_VENTA` |
| El Dueno elimina el documento que estaba en revisión | recalcula: puede pasar a `APTO_VENTA` |
| MercadoPago sin documentos, o documentos sin MercadoPago | `APROBADO` |
| Cuenta del Dueno bloqueada con el comercio `APTO_VENTA` | `CERRADO_TEMPORALMENTE`; ningún evento de documentos lo mueve; al recuperar la contraseña se evalúa la regla de seguir vendiendo |
| Aprobar el último documento con la cuenta bloqueada | `CERRADO_TEMPORALMENTE` (sin pasar por `APTO_VENTA`) |
| Comercio `SUSPENDIDO` | no cambia |

- **Pedidos en curso** al perder la aptitud: los ya aceptados siguen su flujo; no nacen pedidos nuevos (`PedidoService.confirmarPedido` revalida `APTO_VENTA` bajo bloqueo compartido).

### Gestión del carrito

- El carrito persiste entre sesiones; es el mismo registro siempre (no se crea uno nuevo por sesión).
- El carrito pasa a `activo = false` al cerrar sesión, inactivarse la cuenta o expirar la sesión.
- El carrito se limpia (ítems eliminados, `comercio_id = NULL`) únicamente al recibir confirmación de pago.
- Ante timeout o rechazo de pago: el carrito permanece intacto para facilitar el reintento del cliente.

---

*Diccionario de Datos — Proyecto Bajoneá — Versión 1.28*

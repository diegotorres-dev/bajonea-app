# MAPEO DFD NIVEL 2 — TRAMO H (P7 Procesos automáticos)

Relevamiento de solo lectura. El código manda: cuando difiere de la documentación se registra como desvío. Rutas relativas a `03. Implementación/backend/src/main/java/com/bajonea/backend/` salvo indicación. Líneas aproximadas.

Convenciones: **NO RELEVADO** = no lo leí en esta sesión. Desvíos desde D-54, dudas desde C-38. Lo ya relevado en los Tramos A a G no se repite (ver Tramo E para los jobs de pedidos).

---

## 0. Inventario de procesos automáticos

`BajoneaApplication.java:8` tiene `@EnableScheduling`. No hay configuración propia de pool del programador (el grep de `TaskScheduler`, `ScheduledExecutor` y `@PostConstruct` solo dio el runner de arranque). Todos los `@Scheduled` usan `fixedDelay` (60 s o 300 s después de terminar la corrida anterior) salvo la inactivación, que usa `cron`. Ninguno tiene bloqueo distribuido: la coordinación entre instancias depende de la idempotencia de cada proceso (la inactivación pide explícitamente una sola instancia).

| # | Proceso | Clase y método | Intervalo | Propiedad que lo habilita | Defecto (código) | Perfil `test` |
|---|---|---|---|---|---|---|
| 1 | Reapertura del cierre manual | `services/ReaperturaComerciosJob#reabrirComerciosVencidos` (:39) | `fixedDelay = 60_000` | `comercio.reapertura.job-habilitado` | `true` | `false` (`application-test.properties:33`) |
| 2 | Vencimiento de invitaciones de Empleado | `services/InvitacionVencimientoJob#vencerInvitaciones` (:39) | `fixedDelay = 60_000` | `invitacion.vencimiento.job-habilitado` | `true` | `false` (:24) |
| 3 | Inactivación por falta de uso | `services/InactivacionCuentaJob#programada` (:31) | `cron = "${inactividad.cron:0 30 3 * * *}"`, `zone = "${app.zona-horaria:America/Argentina/Ushuaia}"` | `inactividad.job-habilitado` | `true` | `false` (:76) |
| 4 | Cierre de turno + envío del resumen | `services/CierreTurnoJob#abrirYCerrarTurnos` (:45) | `fixedDelay = 60_000` | `turno.cierre.job-habilitado` | `true` | `false` (:46) |
| 5–11 | Pedidos (7 métodos; solo la tabla, detalle en Tramo E) | `services/PedidoSchedulerService` | ver abajo | `pedido.jobs.habilitado` | `true` | `false` (:29) |
| — | Asignación de turnos a pedidos anteriores a V39 (no es `@Scheduled`) | `services/TurnoBackfillRunner#alArrancar`, `@EventListener(ApplicationReadyEvent)`, hilo propio `turno-backfill` | una vez al arrancar | `turno.backfill.habilitado` | `true` | `false` (:37) |

`PedidoSchedulerService` (:29-:75): `expirarPagosVencidos` 60 s; `avisar75MinYAutoconfirmar` 60 s; `expirarPedidosSinRespuestaComercio` 300 s; `autoconfirmarRetirosPorSuspension` 300 s; `cancelarPreparacionPorSuspension` 60 s; `rechazarPendientesPorSuspension` 60 s; `procesarPedidosSinAtencionPorSuspensionDeDueno` 60 s. El Javadoc de la clase (:9) dice "Los 5 jobs" y el de `ejecutar` habla de "cuatro procesos": hay 7 métodos (ver D-59).

Atajos del perfil `test` para dispararlos a pedido (`controllers/TestController.java`): `POST /api/v1/test/jobs/reapertura-comercios?ahora=` (:119), `/jobs/vencimiento-invitaciones?ahora=` (:128), `/jobs/inactivacion-cuentas?ahora=` (:159), `/jobs/backfill-turnos` (:167), `/jobs/cierre-turnos?ahora=` (:173, corre en un hilo aparte con `CompletableFuture`), `/jobs/pedidos/{nombre}?ahora=` (:257). Más `PUT /test/usuarios/{id}/ultimo-acceso` (:137) y `PUT /test/pedidos/{id}/envejecer-creacion` (:152) para armar la inactivación.

Otras propiedades de estos procesos (todas con el valor por defecto escrito en el código, ninguna en `application.properties`; `application-production.properties` solo se buscó por grep y no define ninguna de estas): `inactividad.cron` (`0 30 3 * * *`), `inactividad.meses` (3), `inactividad.tope-por-corrida` (200); `turno.cierre.gracia-minutos` (30), `espera-maxima-minutos` (120), `dias-atras` (3), `email-intentos-maximos` (5), `email-retroceso-minutos` (`10,30,60`), `email-envio-vencido-minutos` (15) (`config/TurnoCierreProperties.java:15-20`); `turno.pago-fuera-franja-dias` (7); `email.envio-habilitado` (`true` en `application.properties:26`, `false` en test); `app.zona-horaria` (defecto `America/Argentina/Ushuaia`, tomado de la expresión del cron). Pedidos: `pedido.timeout.pago-minutos=30`, `aviso-en-camino-minutos=75`, `autoconfirmacion-en-camino-minutos=90`, `respuesta-comercio-minutos=30`, `retiro-suspension-minutos=90` (`application.properties:44-48`).

**Procesos que NO existen como job** (la documentación sugiere lo contrario, ver D-54, D-55): expiración de tokens, pase del carrito a inactivo, reencolado de resúmenes de turno `FALLIDO`, reenvío automático de avisos de cuenta.

**Sobre la agrupación P7.01 a P7.05.** Coincide con el código para P7.01, P7.02, P7.03 y P7.05, que son cuatro `@Scheduled` independientes. **P7.04 no es un proceso con disparador propio**: la cascada de la inactivación ocurre dentro de la misma transacción de cada cuenta de P7.03 (sub-proceso, no job aparte), y la reactivación es un flujo iniciado por la persona o el Administrador (login, recuperación de contraseña, código por email o `PUT /administrador/cuentas/{id}/reactivar`), no automático. Sugerencia: dibujar P7.04 como "Efectos en cadena de la inactivación y reactivación de la cuenta" colgando de P7.03, y agregar P7.06 "Procesos de pedidos" (los 7 de la tabla, ya relevados) y P7.07 "Asignación de turnos al arrancar" (una vez, hilo aparte; no estudiado a fondo, ver NO RELEVADO).

---

## P7.01 — Reapertura automática de comercios

### 1. Disparador
- `ReaperturaComerciosJob.java:39`, `@Scheduled(fixedDelay = 60_000)`. Si `habilitado` es falso, retorna sin hacer nada (:41-43). Llama a `reabrirComerciosVencidos(disponibilidadComercioService.ahora())` (:44); `ahora()` es `LocalDateTime.now(clock)` con la zona de `app.zona-horaria` (`DisponibilidadComercioService.java:60`).
- Hilo: el del programador por defecto de Spring (sin configuración propia; ver C-42).
- Si estuvo caído: se pone al día solo. Cada comercio se evalúa contra el momento de **su propio** cierre (última fila `CERRADO` del historial), no contra la última corrida (Javadoc :13-18; `CierreComercioService.java:119-133`).

### 2. Alcance
- Consulta: `ComercioRepository.findIdsCerradosManualmente` (:112): `SELECT c.id FROM Comercio c WHERE c.cerradoManualmente = true ORDER BY c.id`. Sin filtro de estado del comercio, sin límite por corrida, sin cargar entidades.
- Una transacción por comercio: `CierreComercioService` es `@Transactional` a nivel de clase (:54) y el job llama una vez por id (:54-62).

### 3. Pasos de `reabrirSiVencido(comercioId, ahora)` (`CierreComercioService.java:114-139`)
1. `bloquearComercio` (:141-146): `findById` + `entityManager.refresh(..., PESSIMISTIC_WRITE)` (`SELECT ... FOR UPDATE`; el `refresh` evita una foto vieja).
2. Si `cerradoManualmente` ya es falso → `return false` (:116-118).
3. Busca la última fila de `historial_cierre_comercio` con acción `CERRADO` (`findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc`).
4. Si no hay fila `CERRADO`: `log.warn` "…ninguna fila CERRADO en el historial: se reabre" y reabre (:121-123).
5. Si hay: `horarios = horarioRepository.findVigentesDesde(comercioId, fecha del cierre)` y `proximoInicioDeFranja(horarios, momentoDelCierre)` (`DisponibilidadComercioService.java:187-203`: busca hasta 7 días adelante, solo versiones de horario vigentes en la fecha de cada apertura, y toma la primera apertura **estrictamente posterior** al momento del cierre).
   - Sin franja → `log.warn` "…ninguna franja vigente: se reabre" y reabre (:129-130).
   - `ahora` anterior al inicio → `return false` (no reabre).
6. Reabre: `setCerradoManualmente(false)`, `comercioRepository.save`, y escribe `historial_cierre_comercio` con `accion = REABIERTO`, `actor_rol = SISTEMA`, `actor_usuario_id = NULL`, `fecha_hora = ahora` truncado a segundos (:135-137).
- Orden de bloqueo: solo toma `comercio`, no toma usuario ni cuenta de Mercado Pago (no actúa un usuario), ver Javadoc :35-47.

### 4. Decisiones (rombos)
| Decisión | Valores |
|---|---|
| ¿`cerrado_manualmente` sigue en `true` con la fila bloqueada? | no → termina sin escribir; sí → sigue |
| ¿Hay fila `CERRADO` en el historial? | no → reabre + warn; sí → sigue |
| ¿Hay una próxima franja? | no → reabre + warn; sí → sigue |
| ¿`ahora` ≥ inicio de esa franja? | no → no reabre; sí → reabre |

**Estados que reabre y cuáles no:** el job **no mira `comercio.estado`**. Todo comercio con la bandera en `true` se evalúa, sea `APROBADO`, `APTO_VENTA`, `CERRADO_TEMPORALMENTE`, `SUSPENDIDO` o `INACTIVO`. Reabrir solo apaga la bandera; no cambia `estado`. Un comercio en `CERRADO_TEMPORALMENTE` (bloqueo de cuenta del Dueño) sigue figurando como no abierto porque `DisponibilidadComercioService.calcular` considera `bloqueadoPorCuenta` aparte (:233-235). Un comercio `INACTIVO` o `SUSPENDIDO` con la bandera prendida también recibe la reapertura (ver C-43).

### 5. Errores e idempotencia
- Excepción en un comercio: `catch (RuntimeException)` en el bucle, `log.error("No se pudo evaluar la reapertura del comercio {}")` y sigue con el siguiente (:55-61). La bandera queda en `true` y se reintenta al minuto siguiente.
- Idempotencia: bloqueo `FOR UPDATE` + revalidación de la bandera con la fila bloqueada; una segunda instancia o el cierre/apertura manual simultáneos quedan serializados.

### 6. Efectos visibles
- Sin avisos ni emails. Cambia `abiertoAhora` / `cerradoManualmente` en las respuestas del panel y del catálogo, y deja la fila `REABIERTO`/`SISTEMA` que ve la pestaña Actividad del Dueño. Texto del catálogo al estar cerrado (`DisponibilidadComercioService.textoReapertura`, :205-215): "Reabre hoy a las HH:mm", "Reabre mañana a las HH:mm", "Reabre el {día} a las HH:mm". Los rótulos del interruptor del panel no los leí (NO RELEVADO, solo `CLAUDE.md`).

### 7. Propiedades
`comercio.reapertura.job-habilitado` (true / false en test). Sin otras. Retorna la cantidad de reabiertos (usada por el atajo de test); el job programado no escribe log de la corrida (ver D-58).

### 9. Comparación con la documentación
- `requisitos-funcionales-sistema.md` L104-110 coincide con el código salvo L110 (ver **D-56**).

---

## P7.02 — Vencimiento de invitaciones de Empleados

### 1. Disparador
- `InvitacionVencimientoJob.java:39`, `@Scheduled(fixedDelay = 60_000)`, `habilitado` (:41-43). Llama a `vencerInvitaciones(LocalDateTime.now(clock))` envuelto en `try/catch (RuntimeException)` con `log.error` (:44-48). Reloj de la aplicación (`Clock`), el mismo con el que se escribe `fecha_vencimiento`; nunca `NOW()` de la base.
- Si estuvo caído: la primera corrida pasa a `VENCIDA` todo lo vencido (no hay ventana); mientras tanto el listado ya informa "vencida" (`InvitacionEmpleadoService`, Javadoc :71-77) y `invitar`/`reenviar` pasan a `VENCIDA` las pendientes vencidas del par (:629-636, red de seguridad).

### 2. Alcance
- Lotes de 500 (`InvitacionVencimientoService.TAMANO_LOTE`, :23). Por lote: `InvitacionEmpleadoRepository.findIdsVencidasByEstado(PENDIENTE, ahora, PageRequest 0..500)`: `i.estado = :estado AND i.fechaVencimiento <= :ahora ORDER BY i.id ASC`, **sin bloqueo** (:139-145). El job repite lotes mientras `seleccionadas >= 500` (`hayMas`, :29-31 y :55-66).
- Una transacción corta por lote (`@Transactional` en `vencerLote`, :34).

### 3. Pasos de `vencerLote(ahora)` (`InvitacionVencimientoService.java:34-44`)
1. Leer ids (lectura común, sin `FOR UPDATE`: un bloqueo por rango se interbloquea con aceptar/invitar/reenviar por el índice único parcial `pendiente_clave`, ver Javadoc :12-17 y `InvitacionEmpleadoRepository` :122-128).
2. Si no hay ids → `ResultadoLote(0, 0)`.
3. Un único `UPDATE` por clave primaria (`marcarVencidas`, :147-161): `SET estado = 'VENCIDA', fecha_resolucion = fecha_vencimiento WHERE id IN :ids AND estado = 'PENDIENTE' AND fecha_vencimiento <= :ahora`. Repite estado y fecha en el `WHERE` (es una lectura actual), así que si otra transacción aceptó, canceló o reenvió en el medio, esa fila no cambia.
4. Efecto colateral en el esquema (`V30__crear_invitacion_empleado.sql:13`): la columna generada `pendiente_clave` pasa de `1` a `NULL`, liberando los índices únicos `uq_inv_pendiente_comercio_email` y `uq_inv_pendiente_email_codigo`.
- **No** escribe `historial_empleado_comercio`, **no** crea avisos, **no** envía email y **no** toca `empleado_comercio` (una invitación pendiente no tiene relación todavía; una relación previa `INACTIVA` queda como estaba).

### 4. Decisiones
| Decisión | Valores |
|---|---|
| ¿Estado de la invitación? | solo `PENDIENTE` se procesa; `ACEPTADA`, `CANCELADA`, `REEMPLAZADA`, `VENCIDA`, `INVALIDADA` no se tocan (`EstadoInvitacionEmpleado.java:3-10`) |
| ¿`fecha_vencimiento <= ahora`? | no → sigue pendiente |
| ¿Quedan más de 500? | sí → otro lote |

### 5. Errores e idempotencia
Excepción en la corrida: se registra y se reintenta al minuto. Idempotente: la segunda ejecución no encuentra nada. Dos instancias: la segunda recibe 0 filas afectadas.

### 6. Efectos visibles (frontend)
- Estado "Vencida" en "Ver equipo → Solicitudes": `equipo-vistas.js:42` (`VENCIDA: { texto: 'Vencida', punto: 'vencido' }`), `INVALIDADA` = "Código bloqueado" (:43). `textoVencida(fechaVencimiento)` (:117-127): "Vencida hoy", "Vencida hace 1 día", "Vencida hace N días" (calculado con `Date.now()` del navegador, ver C-46). Usos: `equipo-comercio.js:149` y :329, `admin-equipo.js:101`.
- Luego de vencida: se puede **reenviar** o **cancelar** (A8). Código del servidor: ver `InvitacionEmpleadoService`.

### 7. Propiedades
`invitacion.vencimiento.job-habilitado` (true / false en test). `InvitacionEmpleadoService.VIGENCIA_DIAS = 7` (:94), `MAX_INTENTOS_CODIGO = 5` (:95), `TOPE_POR_HORA = 5` envíos por hora por comercio (:93). El log de la corrida solo se escribe si `total > 0` ("Invitaciones de empleado pasadas a VENCIDA: {}", `InvitacionVencimientoJob.java:62-64`).

### Subflujo asociado: aviso de regularización (T35)
No es parte del job; ocurre al **invitar** o **reenviar** (`InvitacionEmpleadoService.java:579-583`). Si la cuenta existente del email no está `ACTIVO`: `InvitacionRegularizacionService.registrarYEnviar` y luego el Dueño recibe `InvitacionNoAptaException(MENSAJE_NO_SE_PUEDE_INVITAR)` (409 genérico "No se puede invitar a este email"; el front muestra "No pudimos invitar a este email.", `equipo-comercio.js:34-35`).
- **Tope diario**: 3 en 24 horas corridas por destinatario (`TOPE_POR_VENTANA = 3`, `VENTANA = 24 h`, `InvitacionRegularizacionService.java:32-33`), contado sobre `notificacion` con `tipo = INVITACION_EMPLEADO`, `canal = EMAIL` y `usuario_id` del destinatario (`countByUsuarioIdAndTipoAndCanalAndFechaCreacionAfter`, :48-49). Si ya hay 3 → no escribe ni envía, pero el Dueño igual recibe el mismo 409. El conteo no está serializado entre Dueños distintos (puede pasarse en 1 o 2, Javadoc :23-25).
- Fila: `registrarEmailEnviado` con mensaje "Invitación de {comercio} no enviada porque {motivo}" y estado `ENVIADO` **antes** de enviar (ver C-44). Email recién después del commit (`EjecucionPostCommit`), un solo intento, sin reintento.
- Motivos y acciones (`MotivoRegularizacionInvitacion.java:4-7`): BLOQUEADA "tu cuenta está bloqueada" / "Recuperá tu contraseña desde el inicio de sesión."; SUSPENDIDA "tu cuenta está suspendida" / "Contactá a soporte."; INACTIVA "tu cuenta está inactiva" / "Iniciá sesión para reactivarla."; SIN_VERIFICAR "todavía no verificaste tu email" / "Verificá tu email para activar tu cuenta.".
- Email (`EmailService.java:111-118`): asunto `"Un comercio quiso invitarte a trabajar en Bajoneá"`. Cuerpo: `"{Comercio} quiso invitarte a su equipo en Bajoneá, pero no pudimos enviarte la invitación porque {motivo}.\n\n{acción}\n\nDespués, pedile al comercio que te invite de nuevo.\n\nSi no esperabas este mensaje, ignoralo."` Nombra solo al comercio.
- Email de invitación normal (`EmailService.java:92-105`): asunto `"{Dueño} te invitó a trabajar en {Comercio}"`; cuerpo incluye "Tu código: {código}", "Vence en 7 días." y el enlace `{app.frontend-base-url}/invitacion-empleado.html`.

### 9. Comparación con la documentación
`requisitos-funcionales-sistema.md` L251-260 coincide (vencimiento a 7 días, estado guardado, sin historial ni avisos, tope 5/hora y 3/día). Sin desvíos propios; ver D-58 (registro de ejecución).

---

## P7.03 — Inactivación de cuentas por falta de uso

### 1. Disparador
- `InactivacionCuentaJob.java:31`: `@Scheduled(cron = "${inactividad.cron:0 30 3 * * *}", zone = "${app.zona-horaria:America/Argentina/Ushuaia}")`, método `programada` (:32). Si `habilitado` es falso no hace nada (:33-35). Llama a `servicio.inactivarVencidas(servicio.ahora())` y registra siempre un `log.info` "Inactivación por falta de uso: {} candidatas, {} inactivadas, {} omitidas, {} con falla" (:37-39); una excepción general queda en `log.error` (:40-42).
- Si el backend estuvo caído a las 03:30: **no hay recuperación** de la corrida perdida; la próxima es la del día siguiente (con `cron`, Spring no recupera ejecuciones pasadas). Una sola instancia por diseño (Javadoc :12-15).

### 2. Alcance
`InactividadCuentaRepository.candidatos(corte, tope)` (JDBC, solo lectura, `InactividadCuentaRepository.java:35-39`): `SELECT u.id, u.rol FROM usuario u WHERE {CONDICION} ORDER BY u.fecha_ultimo_acceso, u.id LIMIT ?`, con `corte = ahora.minusMonths(3)` (`InactivacionCuentaService.java:97`; meses calendario) y `tope = 200` (las de acceso más viejo primero).

`CONDICION` (:26-31), una sola fuente que se reutiliza para revalidar (`sigueElegible`, :41-45):
- `u.estado = 'ACTIVO'` (excluye `PENDIENTE`, `BLOQUEADO`, `SUSPENDIDO` e `INACTIVO`);
- `u.rol <> 'ADMINISTRADOR'`;
- `u.fecha_ultimo_acceso < corte` (estricto);
- `NOT EXISTS` pedido de la persona como comprador (`p.cliente_id = u.id`) en `PENDIENTE_PAGO`, `PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO` o `LISTO_PARA_RETIRAR` (:24);
- `NOT EXISTS` pedido en esos mismos estados en cualquier comercio de la que es Dueño;
- `NOT EXISTS` pedido de cualquier estado, creado desde el corte (`p.fecha_creacion >= corte`), en cualquier comercio de la que es Dueño (un Dueño con ventas recientes cuenta como activo).
- **Aviso previo: no existe** (decisión de Diego, dicc. L2348).

Cada candidata se procesa en su **propia transacción** (`TransactionTemplate.execute`, :108); un fallo se cuenta en `conFalla`, se loguea (`log.error`, :114-117) y sigue.

### 3. Pasos por cuenta (`InactivacionCuentaService.inactivar`, :122-154)
Fuera de la transacción: si `rol == DUENO`, lee los ids de sus comercios inactivables con `comercioRepository.findIdsByDuenoIdAndEstadoIn(usuarioId, ESTADOS_INACTIVABLES)` (`APROBADO`, `APTO_VENTA`, `CERRADO_TEMPORALMENTE`, `AptitudVentaComercioService.java:50-51`) (:104-107).

Dentro de la transacción:
1. `usuarioRepository.findByIdConBloqueo` (`FOR UPDATE`, primera sentencia). Si no existe o `estado != ACTIVO` → `OMITIDA` (:124-127).
2. Por cada id de comercio: `entityManager.find(Comercio, id, PESSIMISTIC_WRITE)` (:128-134). Sin lecturas comunes antes.
3. Revalida con `sigueElegible(usuarioId, corte)` (lectura común, ve lo último confirmado). Falso → `OMITIDA` (:135-137).
4. Si es Dueño y apareció un comercio inactivable que no se bloqueó → `log.warn` y `OMITIDA` (queda para la noche siguiente) (:138-141, 156-167).
5. `estadoUsuarioService.cambiar(usuario, INACTIVO, "Inactividad", null)` (`EstadoUsuarioService.java:43-64`): setea estado, `fecha_actualizacion`, guarda y escribe `historial_estado_usuario` (origen `ACTIVO`, destino `INACTIVO`, motivo `Inactividad`, administrador `NULL`).
6. `cerrarSesiones` (:169-177): todas las sesiones activas del usuario (`findActivasDelUsuario`) → `activa = false`, `tipo_cierre = INACTIVIDAD`, `fecha_cierre = ahora`.
7. Por cada comercio bloqueado: `aptitudVentaComercioService.inactivarPorInactividad` (:231-238): si el estado sigue en `ESTADOS_INACTIVABLES`, `comercioService.registrarTransicionAutomatica` → `comercio.estado = INACTIVO` + fila de `historial_estado_comercio` (administrador `NULL`, motivo `"Inactivación automática de la cuenta del Dueño por falta de uso"`, `ComercioService.java:290-305`). Los comercios en otro estado (`PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO`, `SUSPENDIDO`, `INACTIVO`) no se tocan.
8. `avisoCuentaService.avisarInactivacion(usuarioId, email, inactivados)` (`AvisoCuentaService.java:81-93`, `Propagation.MANDATORY`): crea el aviso `CUENTA_INACTIVADA` (T24) para la persona y un `COMERCIO_INACTIVADO` (T25) por cada comercio inactivado, y programa el email **después del commit** con `EjecucionPostCommit` (:91-92).
9. Después del commit: `enviarYRegistrar` (:189-199) envía el email (un solo intento, sin transacción abierta) y abre una transacción aparte para escribir una fila `notificacion` de canal `EMAIL` con `ENVIADO` o `FALLIDO` (`NotificacionService.registrarResultadoEmail`, :130-153). Si registrar el resultado falla, solo `log.error`.

### 4. Decisiones
| Decisión | Valores |
|---|---|
| ¿Estado de la cuenta con la fila bloqueada? | `ACTIVO` sigue; otro → omitida |
| ¿Sigue elegible tras bloquear? | sí/no (no → omitida) |
| ¿Rol? | `DUENO` → bloquea e inactiva comercios; `CLIENTE` (incluye Empleado) → solo la cuenta |
| ¿Estado del comercio? | `APROBADO`, `APTO_VENTA`, `CERRADO_TEMPORALMENTE` → `INACTIVO`; resto sin tocar |
| ¿Salió el email? | `ENVIADO` / `FALLIDO` (fila `EMAIL`; sin reintento) |

### 5. Errores e idempotencia
Por cuenta: excepción → `conFalla`, la transacción se revierte entera (estado, sesiones, comercios y avisos) y queda para la noche siguiente. No hay reintento del email ni reenvío manual para `CUENTA_INACTIVADA` (el reenvío del Administrador solo cubre suspensión y levantamiento, `AvisoCuentaService.prepararReenvio`, :304-322; ver C-40). Idempotencia: el filtro `estado = 'ACTIVO'` + el bloqueo de la fila hacen que una segunda corrida o una segunda instancia no repita nada.

### 6. Efectos visibles (textos literales)
- Aviso en la app (T24, `CUENTA_INACTIVADA`, audiencia `CLIENTE`): `"Tu cuenta quedó inactiva por falta de uso."`
- Aviso en la app (T25, `COMERCIO_INACTIVADO`, audiencia `DUENO`, con `comercio_id` y entidad `COMERCIO`): `"Tu comercio '{nombre}' dejó de estar disponible porque tu cuenta quedó inactiva."` Estos avisos solo los ve la persona cuando reactiva la cuenta.
- Email (`EmailService.java:149-160`, canal Resend; mismo método de envío que los avisos de cuenta). Asunto: `"Tu cuenta de Bajoneá quedó inactiva por falta de uso"`. Cuerpo: `"Tu cuenta de Bajoneá quedó inactiva porque pasaron 3 meses sin que la uses.\n\n"` + (si hay comercios) `"Tus comercios ({nombre1, nombre2}) dejaron de estar disponibles: no aparecen en el catálogo ni reciben pedidos nuevos hasta que reactives tu cuenta.\n\n"` + `"Para volver, iniciá sesión con tu usuario y tu contraseña y elegí reactivar tu cuenta. No perdés ningún dato.\n\nEquipo de Bajoneá"`. No hay email separado para T25 (ver D-57).
- Pantallas: el login muestra "Tu cuenta está inactiva" (ver sección Reactivación).

### 7. Propiedades
`inactividad.job-habilitado` (true / false en test), `inactividad.cron`, `inactividad.meses` (3), `inactividad.tope-por-corrida` (200). `email.envio-habilitado` (en test se registra destinatario y asunto, `EmailService.java:313-321`).

### 9. Comparación con la documentación
Coincide con `diccionario-de-datos.md` L2346-2353 y `requisitos-funcionales-sistema.md` L19, L33, L133-135. Desvíos: D-55 (carrito), D-57 (T25). El texto del encargo ("cancelar y reembolsar pedidos en curso" y "aviso previo") ya no aplica: **una cuenta con pedido en curso queda exenta** y no hay aviso previo.

---

## P7.04 — Cascada de la inactivación y reactivación de la cuenta

### A. Cascada al inactivar (dentro de la transacción de P7.03)
| Elemento | Qué pasa | Dónde |
|---|---|---|
| Cuenta | `ACTIVO → INACTIVO`, historial con motivo `Inactividad` | `EstadoUsuarioService.cambiar` |
| Sesión | todas las activas cierran con `INACTIVIDAD` | `InactivacionCuentaService.java:169-177` |
| Comercios del Dueño | `APROBADO`/`APTO_VENTA`/`CERRADO_TEMPORALMENTE` → `INACTIVO`; el resto no | `AptitudVentaComercioService.java:231-238` |
| Pedidos en curso | **no se tocan ni se reembolsan**: la cuenta con pedido en curso (como comprador o en alguno de sus comercios) no se inactiva | `InactividadCuentaRepository.CONDICION` |
| Reembolsos | ninguno | — |
| Empleados | `empleado_comercio` sin cambios (la relación sigue `ACTIVO`); el Empleado ve el comercio `INACTIVO` en solo lectura y las escrituras dan `409` `COMERCIO_INACTIVO` (solo grep: `ComercioActivoService.java:45`, :159-160) | NO RELEVADO a fondo |
| Carrito | **no se modifica** (ver D-55) | — |
| Tokens pendientes | no se invalidan | no hay código |
| `cerrado_manualmente` | no se limpia (ver C-43) | — |
| Avisos | T24 + un T25 por comercio inactivado; un email | `AvisoCuentaService.avisarInactivacion` |

### A2. Cascada del bloqueo de cuenta (relevado por pedido; ver también Tramo C del bloqueo)
`AuthService.registrarIntentoFallido` (:452-464): al tercer intento fallido (`MAX_INTENTOS_FALLIDOS = 3`, :76) → `estadoUsuarioService.cambiar(usuario, BLOQUEADO, "Bloqueo de cuenta por intentos fallidos", null)`, cierra la sesión activa con `FORZADO` y, si es Dueño, `propagarBloqueoAComercio` (:480-489): recorre sus comercios `APROBADO`/`APTO_VENTA` y `AptitudVentaComercioService.cerrarPorBloqueo` (:213-221) pasa a `CERRADO_TEMPORALMENTE` **solo** los `APTO_VENTA` (revalidados con `refresh` + `PESSIMISTIC_WRITE` por clave primaria). No toca pedidos, reembolsos, Empleados ni carrito, y no manda aviso ni email (el motivo "Bloqueo de cuenta por intentos fallidos" queda solo en el historial). Se deshace al recuperar la contraseña (`confirmarRecuperacionPassword`, :289-310).

### B. Reactivación de la cuenta inactiva (todo por `ReactivacionCuentaService.reactivar`, único camino que saca de `INACTIVO`)
`ReactivacionCuentaService.java:33-44` (`Propagation.MANDATORY`, la fila del usuario ya bloqueada por quien llama): si `estado != INACTIVO` → `false` sin hacer nada; si no, `EstadoUsuarioService.cambiar(→ ACTIVO)` (esto también fija `fecha_ultimo_acceso = ahora`, :51-53), `intentos_fallidos = 0` y, si es Dueño, `AptitudVentaComercioService.restaurar(usuarioId, INACTIVO, motivo)` (:246-257): cada comercio `INACTIVO` se bloquea por clave primaria y se recalcula con `decidir(...)` (:76-108): vuelve a `APTO_VENTA` si hay cuenta de Mercado Pago activa y (si la documentación es requerida) al menos un documento aprobado; si no, a `APROBADO`. Un comercio `SUSPENDIDO` no cambia (la inactivación nunca lo tocó).

**Cuatro entradas:**
1. **Usuario y contraseña desde el login** (la que ofrece la pantalla).
   - `AuthService.login` (:108-145): para una cuenta `INACTIVO`, con contraseña correcta, `intentos = 0` y lanza `CuentaInactivaException` → `409` con `data.codigo = CUENTA_INACTIVA` y `data.comercios` (lista `{comercioId, nombre, estadoActual, resultado: VUELVE | SIGUE_SUSPENDIDO}`, vacía si no es Dueño; `ComerciosAlReactivarService`). Con contraseña incorrecta: mensaje genérico con `intentosRestantes`, cuenta el intento sin cambiar el estado (`registrarIntentoFallidoDeCuentaInactiva`, :175-180); con 3 intentos fallidos responde `409` "Cuenta bloqueada. Recuperá tu contraseña para desbloquearla" aunque el estado siga `INACTIVO` (`exigirSinIntentosAgotados`, :169-173).
   - Frontend (`js/auth.js:208-222`): ante ese 409 vacía el campo de contraseña y abre `mostrarPantallaCuentaInactiva` (`js/cuenta-inactiva.js`) con el usuario y la contraseña **solo en variables en memoria** (se descartan al cerrar, en `pagehide` y al reactivar). Pantalla: título `"Tu cuenta está inactiva"`, texto `"Pasaron más de 3 meses sin que ingresaras, así que la dejamos en pausa. Tus datos y tus pedidos están a salvo."`, para Dueños la sección `"Tus comercios"` con `"{nombre} vuelve a estar disponible."` o `"{nombre} sigue suspendido. Si creés que es un error, escribinos."`, botones `"Reactivar mi cuenta"` (`"Reactivando…"` mientras espera), `"Contactar a Soporte"` (`soporte.html?tipo=NO_PUEDO_ENTRAR`) y `"Volver a ingresar"`; error por defecto `"No pudimos reactivar tu cuenta. Probá de nuevo."` (`cuenta-inactiva.js:7, 56-164`).
   - `POST /auth/reactivar-cuenta/con-credenciales` (`AuthService.reactivarConCredenciales`, :153-167): público; cuenta inexistente o no inactiva → el mismo 401 de credenciales incorrectas sin contar intentos; con la cuenta inactiva aplica el mismo tope de 3 intentos; si todo está bien reactiva (motivo historial `"Reactivación de cuenta"`, comercios `"Restauración por reactivación de cuenta"`) e **inicia sesión** (`iniciarSesion`). El front guarda el toast `"Cuenta reactivada. ¡Qué bueno verte de nuevo!"` y sigue el camino del login normal (`auth.js:42, 216-220`).
2. **Código de 6 dígitos por email** (existe en el servidor y en `reactivar-cuenta.html`, **sin enlace desde ninguna pantalla**: el grep no encontró ningún enlace a esa página; ver C-47). `POST /auth/reactivar-cuenta` (`solicitarReactivacionCuenta`, :404-412): si el email existe, en **cualquier estado**, invalida los tokens pendientes del mismo tipo, crea un token `REACTIVACION_CUENTA` de 6 dígitos con vencimiento a 24 h (`EXPIRACION_REACTIVACION_CUENTA_HORAS = 24`, :78) y manda el email después del commit; respuesta uniforme (no revela estado). `POST /auth/reactivar-cuenta/confirmar` (`confirmarReactivacionCuenta`, :425-433): toma primero la fila del usuario, valida el código (5 intentos fallidos lo agotan, `MAX_INTENTOS_TOKEN_VERIFICACION = 5`, :80; el cuerpo de `obtenerTokenValidoPorCodigo` NO RELEVADO), lo consume y llama a `reactivar`; si la cuenta no estaba inactiva el código se consume igual y no pasa nada. **No inicia sesión.** Email (`EmailService.java:77-85`): asunto `"Tu código de reactivación de cuenta — Bajoneá"`, cuerpo `"Recibimos una solicitud para reactivar tu cuenta en Bajoneá.\n\nTu código de reactivación es: {código}\n\nIngresá este código en la pantalla de reactivación de cuenta de la app para volver a activarla. El código vence en 24 horas.\n\nSi vos no solicitaste esta reactivación, podés ignorar este email.\n\nEquipo de Bajoneá"`. Pantalla: "Ingresá tu email y te enviaremos un código de 6 dígitos para reactivarla. El código vence en 24 horas." / "Te enviamos un código de 6 dígitos a tu email. Ingresalo para reactivar tu cuenta." (`reactivar-cuenta.html:21, 39`), botón `"Reactivar cuenta"`.
3. **Recuperar la contraseña** (`confirmarRecuperacionPassword`, :289-310): si la cuenta es `INACTIVO` llama a `reactivar` (motivo `"Recuperación de contraseña"`, comercios `"Restauración por recuperación de contraseña"`) y cierra la sesión activa con `FORZADO`; una `SUSPENDIDO` no se reactiva.
4. **Administrador**: `PUT /administrador/cuentas/{id}/reactivar` y vista previa `GET .../reactivar/previa` (`ReactivacionCuentaAdminService`, :26-70+; motivo `"Reactivación por el Administrador"`, comercios `"Reactivación de la cuenta del Dueño por el Administrador"`). Una cuenta no inactiva → `409` `"La cuenta no está inactiva"`; Administrador → `409`. El resto del cuerpo y `admin-reactivar.js` no se leyeron (NO RELEVADO).

**Qué se restituye:** estado `ACTIVO`, intentos en 0, último acceso, comercios `INACTIVO` → `APTO_VENTA`/`APROBADO` (con una fila de historial por comercio, sin administrador salvo la vía Administrador). **Qué no:** la sesión previa (ya cerrada), avisos creados (siguen ahí, no leídos), el carrito (nunca se tocó).

**Avisos al restaurar los comercios** (`AptitudVentaComercioService.avisarCambio`, :289-298; solo si `avisar = true`, que es el caso de `restaurar`): destino `APTO_VENTA` desde `APROBADO` → T40 `COMERCIO_APTO_VENTA` "Tu comercio {nombre} ya puede recibir pedidos."; cualquier destino `APROBADO` → T41 `COMERCIO_SIN_APTITUD` "Tu comercio {nombre} dejó de recibir pedidos: {faltante}." con `faltante` = "falta vincular Mercado Pago y tener un documento aprobado" / "falta vincular Mercado Pago" / "falta tener un documento aprobado" / "no cumple los requisitos para vender" (:300-313). Al reactivar un `INACTIVO` el origen **no** es `APROBADO`, así que **no** se emite T40 al volver a `APTO_VENTA`, y sí T41 si vuelve a `APROBADO` (ver C-38). Cuándo emite T40/T41 en general: `recalcular(..., avisar = true)` desde MP vinculado/desvinculado, documento aprobado/rechazado/revocado/subido/eliminado y restauración de cuenta (los llamadores no se relevaron, NO RELEVADO); la aprobación del comercio usa `avisar=false` (:157-158); el cierre por bloqueo no avisa (:212-221).

### 9. Comparación con la documentación
- `requisitos-funcionales-sistema.md` L45: "el código por email existe en el servidor, pero la pantalla ya no lo ofrece" → coincide.
- Carrito: D-55. T25: D-57.

---

## P7.05 — Cierre de turno automático y su email

### 1. Disparador
`CierreTurnoJob.java:45`, `@Scheduled(fixedDelay = 60_000)`, `habilitado` (:47-49), `try/catch` con `log.error` (:50-54); `abrirYCerrarTurnos(disponibilidadComercioService.ahora())`. Dos fases independientes en la misma corrida. Si estuvo caído: se pone al día en la primera corrida dentro de la ventana de `turno.cierre.dias-atras` (3 días); los cierres más viejos que eso se pierden (ver más abajo).

### 2. Fase 1 — Cierres (`CierreTurnoService`)
- `candidatos(ahora)` (`@Transactional(readOnly = true)`, :73-111), tres consultas y recorrido en memoria, sin bloqueos:
  1. `ComercioRepository.findElegiblesParaCierreDeTurno` (:122-123): comercios con `estado IN (APTO_VENTA, SUSPENDIDO, CERRADO_TEMPORALMENTE)` (`ESTADOS_ELEGIBLES`, :46-47) → **`APROBADO`, `INACTIVO`, `PENDIENTE`, `RECHAZADO` no generan cierre**.
  2. `horarioRepository.findVigentesDesdeIn(ids, hoy − (3+1) días)` agrupados por comercio; un comercio sin franjas vigentes no tiene turnos (:93-96).
  3. `cierreTurnoRepository.findUltimoFinDesde(ids, hoy − (3+2) días)`: último `fin` por comercio (el piso).
- Reglas: `hasta = ahora − 30 min` (gracia); `desdeVentana = ahora − 3 días`. Si el comercio no tiene último cierre en los últimos 5 días → solo cierra **su último turno terminado** (`ultimoTurnoTerminado`, y solo si terminó antes de `hasta`, :97-103); si lo tiene → todos los turnos con fin en `(max(ultimoFin, desdeVentana), hasta]`, de viejo a nuevo (:105-108). Evita una avalancha de mails al desplegar o tras reactivar/vincular.
- `cerrar(candidato, ahora)` (`@Transactional(isolation = REPEATABLE_READ)`, :113-136), una por comercio y turno:
  1. ¿Hay un pedido `PENDIENTE_PAGO` creado antes del fin del turno (`existsByComercioIdAndEstadoCreadoAntesDe`)? Sí → si `ahora < fin + 120 min` devuelve `DIFERIDO`; si pasó el tope, `log.warn` y cierra igual.
  2. `resumenTurnoService.cifras(comercioId, turno)` (`ResumenTurnoService.java:89-102`): `agregarTurno` sobre los pedidos del turno con `ESTADOS_FACTURADOS` (`EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `NO_RETIRADO`, :32-34); `vendido` y `comision` de esa agregación, `neto = vendido − comision`, `cantidadPedidos` = pedidos del turno (de la agregación), `pendientes` = **todos** los `PENDIENTE_CONFIRMACION_COMERCIO` del comercio sin importar el turno (:90-92). Mismo código que usa el panel, por eso el email y el panel no calculan distinto.
  3. `avisa = estado == APTO_VENTA || cantidadPedidos > 0 || pendientes > 0`; inserta (`CierreTurnoInsercionRepository.insertar`, SQL NO RELEVADO) con `email_estado = PENDIENTE` si avisa, o `OMITIDO` con motivo `"Comercio no operativo sin pedidos ni pendientes"` si no.
  4. Resultado: `CERRADO` si insertó; `YA_CERRADO` si el `UNIQUE (comercio_id, turno_fecha, horario_id)` ya existía (`V41__cierre_turno.sql:21`).
- Bucle en el job (:62-82): agrupa por comercio; `DIFERIDO` → `break` (no sigue con los turnos siguientes de ese comercio, para mantener el orden); excepción → `log.error` y `break` del comercio; `YA_CERRADO` continúa. La única escritura es el `INSERT`, cuyas claves foráneas toman bloqueos compartidos sobre `comercio` y `horario` (hojas del orden global, Javadoc :34-39). No toma `FOR UPDATE`.

### 3. Fase 2 — Envío (`CierreTurnoEnvioService`, sin transacción abierta durante Resend)
1. `recuperarEnviandoVencidos(ahora)` (:52-67): filas `ENVIANDO` con `email_envio_iniciado < ahora − 15 min` vuelven a `PENDIENTE` (`recuperarEnviando`, repite la condición de antigüedad) → el envío es "al menos una vez". `log.warn` si recuperó alguna.
2. `enviarPendientes(ahora)` (:69-90): `findPorEnviar(ahora)` (`CierreTurnoRepository.java:71-80`, join con comercio, Dueño, persona física, usuario y horario): `email_estado = PENDIENTE AND (email_proximo_intento IS NULL OR <= ahora)` ordenado por Dueño, `fin`, `id`. Se agrupa **por Dueño**; un Dueño que falla no frena a los demás (`catch` con `log.error`).
3. `enviarAlDueno` (:92-153):
   - Si `usuario.estado != ACTIVO` → `omitir` cada cierre con motivo `"La cuenta del Dueño no está activa"` (estado `OMITIDO`, **definitivo**: reactivar después no reenvía). Esto cubre `BLOQUEADO`, `SUSPENDIDO`, `INACTIVO` y `PENDIENTE`.
   - Reclama en una transacción corta (`reclamar`: `PENDIENTE → ENVIANDO` con `email_envio_iniciado = ahora`, por clave primaria; devuelve 1 solo si ganó). Sin reclamos propios → termina.
   - Arma el mensaje con `ResumenTurnoMensajeBuilder.armar(nombre, cierres)` y llama a `EmailService.enviarResumenTurno(email, asunto, cuerpo, claveDeIdempotencia)` **sin transacción**. Un **solo mail por Dueño y por corrida** con todos sus cierres reclamados. Clave de idempotencia `"cierre-turno-{ids ordenados}-i{máx. intentos}"` (:155-159), enviada como cabecera `Idempotency-Key` (`EmailService.java:331-333`).
   - Éxito: `marcarEnviado` por cierre (`ENVIADO`, `email_fecha_envio`, limpia próximo intento y reclamo).
   - Falla: `intentos + 1`; si `>= 5` → `registrarFallaDefinitiva` (`FALLIDO`, `log.error`); si no → `registrarFallaConReintento` (`PENDIENTE`, `email_proximo_intento = ahora + retroceso(intentos)`, `log.warn`). Retroceso (`TurnoCierreProperties.retrocesoParaIntento`, :22-25): intento 1 → 10 min, 2 → 30, 3 → 60, 4 → 60, 5 → definitivo (son 4 esperas, 10/30/60/60). El error de Resend se guarda recortado a 500 caracteres (`email_ultimo_error`).
- `FALLIDO` queda solo en base y log: no hay pantalla ni reproceso (el reencolado es por SQL manual, `docs/LISTA-DE-DESPLIEGUE.md`, no leído).

### 4. Decisiones
| Decisión | Valores |
|---|---|
| Estado del comercio | `APTO_VENTA` (siempre avisa); `SUSPENDIDO` y `CERRADO_TEMPORALMENTE` (avisa solo con pedidos o pendientes, si no `OMITIDO`); resto sin cierre |
| ¿Hay `PENDIENTE_PAGO` creado antes del fin? | sí y `< 120 min` → `DIFERIDO`; sí y vencido el tope → cierra con warn; no → cierra |
| ¿Ya existe el cierre (`UNIQUE`)? | sí → `YA_CERRADO` |
| Estado del Dueño al enviar | `ACTIVO` → envía; otro → `OMITIDO` definitivo |
| Resultado del envío | `ENVIADO` / reintento (`PENDIENTE`) / `FALLIDO` tras 5 intentos |
| Cantidad de cierres del Dueño en la corrida | 1 → asunto con neto o "sin pedidos"; ≥ 2 → asunto genérico |

### 5. Errores e idempotencia
Fila que falla al cerrar: log y `break` de ese comercio, reintenta al minuto. Corrida interrumpida entre reclamo y resultado: `ENVIANDO` → recuperación a los 15 min → `PENDIENTE` (con la **misma** clave de idempotencia si no cambió `email_intentos`, así Resend puede deduplicar; el plazo de deduplicación de Resend no se verificó). Una falla del servicio de email nunca afecta el cierre ni a otros Dueños (`ResultadoEnvioEmail`, `EmailService.java:127-133`, no relanza).

### 6. Efectos visibles (textos literales, `ResumenTurnoMensajeBuilder.java`)
Montos en formato argentino (`$127.116`, `$1.234,50`; sin centavos si son cero, :105-113); días en minúscula con `dd/MM` ("lunes 03/11"); rango `"de HH:mm a HH:mm"` más `" (día siguiente)"` si el cierre es anterior a la apertura (:100-103).
- **Un cierre.** Asunto: `"Cerró tu turno en {Comercio}: neto {monto}"` o `"Cerró tu turno en {Comercio}: sin pedidos"` (:45-46). Cuerpo: `"Hola {nombre},\n\nCerró el turno de {Comercio} del {día dd/MM}, {rango}.\n\n"` + (sin pedidos) `"No hubo pedidos en este turno.\n"` o `"Vendido en el turno: {$}\nComisión de Bajoneá: {$}\nNeto del turno: {$}\nPedidos del turno: {n}\n"` + (si hay pendientes) `"\nQuedó 1 pedido sin responder al cerrar el turno. No está incluido en estos montos.\n"` o `"\nQuedaron {n} pedidos sin responder al cerrar el turno. No están incluidos en estos montos.\n"` + `"\nPodés ver el detalle en el panel de Bajoneá.\n\nEquipo de Bajoneá"`.
- **Varios cierres.** Asunto `"Cerraron los turnos de tus comercios"`. Cuerpo: `"Hola {nombre},\n\nCerraron estos turnos:\n\n"` y por cada uno `"{Comercio} — {día dd/MM}, {rango}\n"` + (sin pedidos) `"No hubo pedidos en este turno.\n"` o los cuatro renglones de montos + (si hay pendientes) `"Pedidos sin responder al cierre: {n} (no incluidos en estos montos)\n"` + línea en blanco; cierra con la misma firma.
- A quién: solo al Dueño titular, al email de su `usuario` (`CierrePorEnviar.getEmailDueno`) y con su nombre de pila (`pf.nombre`); el Empleado **no** lo recibe. No hay enlaces ni botones. El saludo usa `"Hola {nombre}"`.
- Pantallas: **ninguna** pantalla de cierre de turno ni de bandeja de resúmenes (grep de `cierre-turno`, `cierreTurno`, `Cerró tu turno` sobre `frontend/` sin resultados). Lo más cercano es el rótulo del turno del panel (Tramo T2, ya relevado).

### 7. Propiedades
Ver el inventario. `V41__cierre_turno.sql`: columnas `inicio`, `fin`, `cantidad_pedidos`, `vendido`, `comision`, `neto`, `pendientes_al_cierre`, `fecha_cierre`, `email_estado` (`PENDIENTE`/`ENVIANDO`/`ENVIADO`/`FALLIDO`/`OMITIDO`, defecto `PENDIENTE`), `email_intentos`, `email_proximo_intento`, `email_envio_iniciado`, `email_fecha_envio`, `email_ultimo_error`; `UNIQUE uq_cierre_turno (comercio_id, turno_fecha, horario_id)`; índice `(email_estado, email_proximo_intento)`; FK sin cascada a `comercio` y `horario`. Log de la corrida solo si cerró algo, envió o hubo falla (`CierreTurnoJob.java:99-102`).

### 9. Comparación con la documentación
`requisitos-funcionales-dueño.md` L292-302 y HU-D13 (`Historias de Usuario - Dueño.md` L172-183) coinciden con el código (30 min, espera máxima de 2 h, un mail por Dueño, asunto con neto, reintentos 10/30/60/60 y 5 intentos, `OMITIDO` por cuenta no activa y no reenviar después, ventana de 5 días). Solo D-58 (registro de ejecución).

---

## Desvíos (código ≠ documentación)

- **D-54 — No existe el job de expiración de tokens.** `requisitos-funcionales-sistema.md` L46-48 ("Un job periódico procesa los tokens con `fecha_vencimiento <= NOW()` y `estado = PENDIENTE`, actualizando su estado a `EXPIRADO`") y L313; `requisitos-no-funcionales.md` L118 ("expiración de tokens") lo dan por existente. El código no tiene ningún `@Scheduled` de tokens y `EstadoToken.EXPIRADO` no se escribe en ningún lugar de `backend/src/main/java` (grep sin resultados). Cómo se rechaza un token vencido en el momento de consumirlo vive en `obtenerTokenValidoPorCodigo` (no leído).
- **D-55 — El carrito no pasa a inactivo.** `requisitos-funcionales-sistema.md` L241-242 ("pasar el carrito a estado inactivo al detectar que la sesión … ha expirado o cerrado manualmente / cuando el usuario sea inactivado automáticamente") y `diccionario-de-datos.md` L2358 ("pasa a `activo = false` al cerrar sesión, inactivarse la cuenta o expirar la sesión"). La columna `carrito.activo` existe (`V1__baseline_bajonea_final.sql:37`, defecto 1) pero la entidad `Carrito` no la mapea (solo `id`, `cliente`, `comercio`) y nada escribe `carrito.activo` (grep). La inactivación no toca el carrito.
- **D-56 — Comercio sin franjas y reapertura.** `requisitos-funcionales-sistema.md` L110: "Un comercio sin franjas horarias cargadas no se reabre solo." En `CierreComercioService.java:127-130`, si `proximoInicioDeFranja` no encuentra ninguna franja vigente, el job **reabre** el comercio y deja un `log.warn`. (El mismo texto está en `CLAUDE.md`, tramo C1: "sin franjas no reabre".)
- **D-57 — T25 no tiene email propio.** `requisitos-funcionales-sistema.md` L182 y `diccionario-de-datos.md` L689 dan a T25 `COMERCIO_INACTIVADO` canal "Email". El código crea solo el aviso en la app por comercio (`AvisoCuentaService.java:85-89`); el único email de la inactivación es el de T24, que nombra a los comercios afectados dentro del cuerpo.
- **D-58 — El registro de ejecución de los jobs es parcial.** `requisitos-funcionales-sistema.md` L311-317 y RNF L118 piden que todos los procesos automáticos registren su ejecución según la taxonomía de logs. Hoy: `InactivacionCuentaJob` siempre escribe el resumen; `CierreTurnoJob` solo si cerró, envió o falló algo; `InvitacionVencimientoJob` solo si venció alguna; `ReaperturaComerciosJob` no escribe nada por corrida (solo `warn` por comercio y `error` por falla). `PedidoSchedulerService` no registra nada en esa clase (lo que haga `PedidoService` no se leyó).
- **D-59 — Comentarios de `PedidoSchedulerService` desfasados.** El Javadoc de la clase dice "Los 5 jobs" (:9) y el de `ejecutar` "uno de los cuatro procesos" (:79); la clase tiene 7 métodos `@Scheduled`.

---

## Dudas (decisiones de Diego)

- **C-38 — Avisos T40/T41 al reactivar una cuenta de Dueño.** Al reactivar, un comercio `INACTIVO` que vuelve a `APTO_VENTA` **no** genera aviso (T40 solo sale desde `APROBADO`), y uno que vuelve a `APROBADO` recibe T41 "dejó de recibir pedidos: falta vincular Mercado Pago…" aunque nunca haya estado a la venta. El diccionario (L702) admite T41 "al restaurar la cuenta"; ¿se quiere un aviso de "vuelve a estar disponible" y un T41 distinto para el caso de un comercio que no vendía?
- **C-39 — Carrito en la inactivación.** ¿Se implementa el pase del carrito a inactivo (documentado, D-55) o se corrige la documentación?
- **C-40 — Email de inactivación sin reintento ni reenvío.** Un solo intento; un `FALLIDO` queda en `notificacion` sin vía de reenvío (el reenvío manual cubre solo suspensión y levantamiento). Como no hay aviso previo y la persona no ve la campana, el email es su único canal.
- **C-41 — "3 meses" escrito a mano.** El email ("pasaron 3 meses") y la pantalla ("Pasaron más de 3 meses") tienen el número fijo, mientras que `inactividad.meses` es configurable.
- **C-42 — Un solo hilo de programación.** Sin configuración propia, Spring usa un programador de un hilo: los 11 `@Scheduled` (más la inactivación diaria) se serializan. Un cierre de turno largo (hay mediciones de 16 s con 2000 comercios) retrasa reaperturas, vencimientos y procesos de pedidos. El tamaño por defecto del programador es conocimiento del framework, no verificado en esta sesión.
- **C-43 — Bandera de cierre manual en comercios no operativos.** La inactivación no limpia `cerrado_manualmente` y la reapertura sigue evaluando comercios `INACTIVO` o `SUSPENDIDO` con la bandera prendida. ¿Es lo deseado?
- **C-44 — Fila de regularización "ENVIADO" antes de enviar.** `registrarEmailEnviado` escribe la fila con `ENVIADO` aunque el envío falle o esté deshabilitado; el tope de 3/24 h cuenta intentos, no emails entregados.
- **C-45 — Zona horaria de `fecha_ultimo_acceso` al iniciar sesión.** `AuthService.iniciarSesion` (:184), las sesiones y `ComercioService.registrarTransicionAutomatica` (:293, :302) usan `LocalDateTime.now()` de la JVM, mientras que el corte de la inactivación usa el `Clock` de `app.zona-horaria`. Con la JVM en otra zona hay un desfase de horas (irrelevante frente a 3 meses, pero no es el reloj único).
- **C-46 — "Vencida hace N días" con el reloj del navegador.** `textoVencida` calcula con `Date.now()` del cliente y la fecha de vencimiento del servidor; con un reloj desajustado puede decir "hoy" o "hace 1 día" mal.
- **C-47 — `reactivar-cuenta.html` huérfana.** La pantalla del código por email sigue existiendo y funcionando, pero ninguna pantalla enlaza a ella. ¿Se retira junto con `/auth/reactivar-cuenta` y `/confirmar`, o se deja como respaldo?
- **C-48 — Cuenta inactiva con 3 intentos fallidos.** Sigue `INACTIVO` (no pasa a `BLOQUEADO`) pero el login muestra el banner de "Tu cuenta está bloqueada por intentos fallidos" y exige recuperar la contraseña. En el DFD, ¿se dibuja como estado propio o dentro de "cuenta inactiva"?

---

## NO RELEVADO

- Cuerpos de `PedidoService` (los 7 procesos de pedidos), `TurnoBackfillService`, `TurnoPedidoService`, `CierreTurnoInsercionRepository` (SQL del `INSERT`), `PedidoRepository.agregarTurno` y `existsByComercioIdAndEstadoCreadoAntesDe`.
- `DisponibilidadComercioService`: `dentroDeFranja`, `turnosTerminadosEntre`, `ultimoTurnoTerminado` (solo la firma y los comentarios).
- `AuthService.obtenerTokenValidoPorCodigo` / `consumirToken` / `TokenService.crear`; `AuthController` (rutas públicas de reactivación).
- `InvitacionEmpleadoService` fuera de las líneas citadas (invitar, reenviar, cancelar, aceptar).
- `ComercioActivoService` más allá del grep (comportamiento del Empleado con comercio `INACTIVO`); resolución del equipo al emitir avisos y si filtra cuentas `INACTIVO` del Empleado.
- Llamadores de `AptitudVentaComercioService.recalcular` (qué endpoints disparan T40/T41).
- `ReactivacionCuentaAdminService` desde la línea 70, `AdministradorController`, `js/admin-reactivar.js`, `js/admin-clientes.js`, `js/admin-duenos.js`, `reactivar-cuenta.html` completo, `js/equipo-comercio.js` y `js/admin-equipo.js` fuera de las líneas citadas.
- Interruptor de cierre del panel (`js/cierre-comercio.js`) y sus textos "Recibiendo pedidos"/"Pedidos pausados"; `js/sonido-avisos.js` (no aparece en estos flujos: no se abrió).
- `application-production.properties` (solo grep, sin resultados para estas propiedades); `ClockConfig`.
- Documentación: `requisitos-funcionales-cliente.md`, `-empleado.md` (solo un grep), `Historias de Usuario` salvo HU-D13, `alcance-y-limitaciones.md` (solo grep), `CONCURRENCIA-Y-TRANSACCIONES.md` (no leído), `LISTA-DE-DESPLIEGUE.md`, RNF fuera de L118; el `diccionario-de-datos.md` solo en las secciones citadas.
- Pruebas (Java, Playwright, Newman, estreses) de estos procesos.

---

## Archivos revisados

Backend (`backend/src/main/java/com/bajonea/backend/`): `BajoneaApplication`; `services/` `ReaperturaComerciosJob`, `CierreComercioService`, `DisponibilidadComercioService` (parcial), `InvitacionVencimientoJob`, `InvitacionVencimientoService`, `InvitacionRegularizacionService`, `InvitacionEmpleadoService` (grep), `InactivacionCuentaJob`, `InactivacionCuentaService`, `ReactivacionCuentaService`, `ReactivacionCuentaAdminService` (parcial), `ComerciosAlReactivarService`, `AvisoCuentaService`, `EstadoUsuarioService`, `AptitudVentaComercioService`, `ComercioService` (grep y :290-305), `AuthService` (parcial), `CierreTurnoJob`, `CierreTurnoService`, `CierreTurnoEnvioService`, `ResumenTurnoMensajeBuilder`, `ResumenTurnoService` (parcial), `NotificacionService` (parcial), `EmailService` (parcial), `PedidoSchedulerService`, `TurnoBackfillRunner`; `config/TurnoCierreProperties`; `controllers/TestController` (:115-180); `repositories/` `InactividadCuentaRepository`, `CierreTurnoRepository`, `ComercioRepository` (grep), `InvitacionEmpleadoRepository` (parcial); `enums/` `TipoNotificacion`, `EstadoInvitacionEmpleado`, `MotivoRegularizacionInvitacion`; `entities/Carrito` (grep).
Recursos: `application.properties`, `application-test.properties`, `application-production.properties` (grep), `db/migration/V30__crear_invitacion_empleado.sql`, `V41__cierre_turno.sql`, `V1__baseline_bajonea_final.sql` (grep de `carrito`).
Frontend (`frontend/`): `js/auth.js` (:40-65, :150-270, :775-905), `js/cuenta-inactiva.js`, `js/equipo-vistas.js` (:105-135 y grep), `js/equipo-comercio.js` (grep), `js/admin-equipo.js` (grep), `reactivar-cuenta.html` (grep); grep de `cierre-turno` sobre `frontend/`.
Documentación: `01. Análisis de Requerimientos/04. Requisitos Funcionales/requisitos-funcionales-sistema.md` (L44-50, L100-135, L250-318), `requisitos-funcionales-dueño.md` (L284-312), `07. Historias de Usuario/Historias de Usuario - Dueño.md` (L170-197), `05. Requisitos No Funcionales/requisitos-no-funcionales.md` (grep), `03. Alcance y Limitaciones/alcance-y-limitaciones.md` (grep); `02. Diseño/.../diccionario-de-datos.md` (grep y L2335-2364).

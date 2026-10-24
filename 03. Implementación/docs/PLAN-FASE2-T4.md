# Plan del Tramo T4 de la Fase 2: email por cierre de turno (2026-10-22)

Plan de trabajo, sin código todavía. Sale de `docs/AUDITORIA-FASE2-TURNOS.md` (punto 9: secciones 6, 9 y 10; "aud. N" = sección N), de las decisiones de Diego para este tramo y de una relectura del código **tal como quedó después de T3** (último commit `b9a2409`). Formato como `docs/PLAN-FASE2-T3.md`: verificación previa, decisiones fijadas, reglas de dominio, entrega A (backend, tests y estrés), entrega B de cierre (sin pantallas: documentación y regresión), orden, riesgos y tests que cambian de significado. Un commit solo cuando Diego confirme.

Reglas de este tramo: ningún `.html`, `.css`, `.js` ni `.ts` nuevo o tocado lleva comentarios (`CLAUDE.md` §4.11); las entidades no llevan comentarios (§4.8); no se ejecuta ninguna migración fuera de `bajonea_test`; no se toca `application.properties` ni `Bajonea-Local.postman_environment.json` (cambios locales de Diego): todos los valores por defecto nuevos viven en el código.

---

## 0. Verificación previa (hecha hoy, solo lectura)

| Pregunta | Resultado |
|---|---|
| Siguiente migración libre | **`V41`** (la última es `V40__item_carrito_precio_visto.sql`). Sin conflicto con la auditoría, que ya decía `V41` |
| Cómo se envía hoy un email | `EmailService` (Resend 4.13.0, `resend-java`). Cinco métodos transaccionales de texto plano, todos por `enviarTextoPlano` (`EmailService.java:110-131`), que **captura `ResendException` y `RuntimeException`, hace `log.warn` y no devuelve nada**. Con `email.envio-habilitado=false` (perfil `test`) solo registra destinatario y asunto, nunca el cuerpo. Remitente `mail.from` (`MAIL_FROM`); `resend.api-key` (`RESEND_API_KEY`). Los otros emails salen con `EjecucionPostCommit`; el del cierre **no** (el job no tiene una transacción que lo dispare: sale en su propia fase) |
| Cómo se testea el envío | `EmailServiceTest` arma `new EmailService(resend)` con un `Resend`/`Emails` de Mockito y fija `remitente` y `envioHabilitado` por `ReflectionTestUtils`. Los tests de integración usan `@MockitoBean` (ya hay varios, p. ej. `ActividadComercioIntegrationTest`). En Playwright/Newman no hay forma de ver el mail: el perfil `test` no llama a Resend |
| SDK de Resend | `ResendException` expone `getStatusCode()`, `getErrorName()` y `getResponseBody()`; `Emails.send(opciones, RequestOptions)` acepta **`idempotencyKey`** (verificado en el JAR 4.13.0). **No verificado:** cuánto tiempo guarda Resend una clave ni qué responde ante la misma clave con un envío que había fallado |
| Límites de Resend | Verificado hoy en la documentación oficial: **10 requests por segundo por equipo** (compartido por todas las claves), `429` con `retry-after`; el plan Free tiene cuota diaria por día calendario UTC (`429` `daily_quota_exceeded`). **No verificado:** el tope numérico de la cuota Free ni el plan que tiene Bajoneá, ni la reputación del remitente `info@bajonea.ar` para un envío por turno |
| Jobs existentes | `ReaperturaComerciosJob` (bandera `comercio.reapertura.job-habilitado`, método público `reabrirComerciosVencidos(LocalDateTime)`, una transacción por comercio por un servicio aparte, `try/catch` por comercio), `InvitacionVencimientoJob` (bandera `invitacion.vencimiento.job-habilitado`, mismo molde, toma el `Clock`), `PedidoSchedulerService` (`pedido.jobs.habilitado`; la expiración de pagos corre cada 60 s y la del comercio sin respuesta **cada 300 s**), `TurnoBackfillRunner`. Los cuatro tienen su bandera en `false` en `application-test.properties` y un atajo `POST /api/v1/test/jobs/...?ahora=` en `TestController`. Molde elegido: `ReaperturaComerciosJob` + `InvitacionVencimientoJob` |
| Cifras del turno | `ResumenTurnoService.calcular` (privado) arma, con `PedidoRepository.agregarTurno(comercioId, turnoFecha, turnoHorarioId, facturables)`, `cantidad` (**todos** los pedidos con ese turno, cualquier estado), `vendido` (suma de `subtotal` de los facturables), `comision` (suma de `cargo_servicio_comercio` de los facturables) y `neto = vendido - comision`; `pendientes` = `countByComercioIdAndEstado(comercioId, PENDIENTE_CONFIRMACION_COMERCIO)` (todos los del comercio, no los del turno). `ESTADOS_FACTURADOS` (5 estados) es privado del paquete. El turno sale de `DisponibilidadComercioService.turnoDe` / `ultimoTurnoTerminado` (records `Turno(horario, inicio, fin)`; 23:59 vale 24:00; cruce de medianoche) |
| Quién es el Dueño de un comercio y su email | `comercio.dueno_id` → `dueno` → `persona_juridica` → `persona` → `usuario` (cadena `@MapsId`: el `id` de Dueño es el `id` de `usuario`). `usuario.email` es el mail de la cuenta y `usuario.estado` el estado; el nombre está en `dueno.persona_fisica` (`nombre`). `comercio.email` ya es nulo/opcional desde el tramo 1 del registro y **no** se usa |
| Horarios de varios comercios | `HorarioRepository.findVigentesDesdeIn(comercioIds, fechaDesde)` ya existe (una consulta para todos) |
| Pedidos pendientes de pago | `pedido.estado = 'PENDIENTE_PAGO'` con `fecha_creacion`; vencen a los `pedido.timeout.pago-minutos` = 30 (`application.properties:40`) por la expiración de 60 s. Índices existentes: `idx_pedido_comercio`, `idx_pedido_estado`, `idx_pedido_fecha_creacion` |
| Última clave `UNIQUE`/patrón de alta idempotente | `CarritoInsercionRepository` (`INSERT ... ON DUPLICATE KEY UPDATE`, primera sentencia). Molde para insertar el cierre |
| Siguientes números libres | specs de Playwright **`77`**, `78`; carpeta de Newman **`76`** (la `75` es la de T3, va última); runner de estreses: id nuevo `cierres` (hoy son 22) |
| Cuántos Dueños y comercios hay | **No verificado**: no hay datos reales de `practicas3` en esta pasada; el dimensionamiento de la sección 6 usa 2000 comercios sintéticos |

Sin verificar, a propósito: el comportamiento de Resend ante una clave de idempotencia repetida, su cuota Free y el plan contratado (marcado arriba), la reputación del remitente, y el costo real del `CREATE TABLE`/FK en el MariaDB del servidor (tabla nueva, vacía: sin riesgo esperable).

---

## 1. Decisiones fijadas que mandan en este tramo

| Tema | Decisión de Diego |
|---|---|
| Cuándo se cierra un turno | `fin del turno + turno.cierre.gracia-minutos` (30 por defecto, configurable) **y** sin pedidos `PENDIENTE_PAGO` creados antes del `fin` del turno |
| Pedidos sin resolver | Los `PENDIENTE_CONFIRMACION_COMERCIO` al cierre se informan como "pendientes al cierre", **fuera del neto**; la foto no se recalcula después |
| Un mail | **Uno por corrida del job y por Dueño**, con todos sus cierres pendientes de aviso, desglosado por comercio; se envía **aunque el total sea 0** |
| Cuenta del Dueño | Si `usuario.estado` no es `ACTIVO`, el cierre queda `OMITIDO` (se persiste, no se envía) |
| Reintentos | Retroceso de 10, 30 y 60 minutos, tope de 5 intentos, con estado de envío persistido |
| Falla de Resend | Nunca bloquea el cierre persistido ni a los demás Dueños (cada Dueño y cada comercio con su propio `try/catch`) |
| Job | `@Scheduled(fixedDelay = 60_000)` que decide con el `Clock`; bandera `turno.cierre.job-habilitado` (`false` en `application-test.properties`); método público `abrirYCerrarTurnos(LocalDateTime ahora)`; atajo `POST /api/v1/test/jobs/cierre-turnos?ahora=` |
| Instancias | Una sola instancia del backend; igual, el reclamo del envío es por clave primaria (`UPDATE ... WHERE email_estado = 'PENDIENTE'`) |
| Tabla | `cierre_turno`, `UNIQUE (comercio_id, turno_fecha, horario_id)` |
| Contenido | Texto plano a nombre del Dueño: bruto (vendido), comisión y neto, cantidad de pedidos y pendientes al cierre, **con las mismas cifras del `resumen-turno` de T2** |
| `EmailService.enviarResumenTurno` | Devuelve el resultado en vez de tragar la excepción |
| Migración | `V41` |
| Fuera del tramo | Pantallas (no hay), estadísticas (T5), mail a Empleados, historial visible del cierre en el panel, reembolsos o ajustes retroactivos del cierre |

---

## 2. Reglas de dominio que el tramo implementa

### 2.1 Qué comercios entran y qué turnos se cierran

1. Comercios elegibles: los de un conjunto de estados (ver pregunta 2; recomendación: `APTO_VENTA` siempre; `SUSPENDIDO` y `CERRADO_TEMPORALMENTE` también, pero el aviso solo sale si hubo pedidos o pendientes; `APROBADO` e `INACTIVO` nunca, porque no pueden recibir pedidos). Los que nunca vendieron (`PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO`) quedan afuera. Se juzga por el estado **actual** del comercio.
2. Un turno es candidato si `fin + gracia <= ahora` y `fin > ahora - turno.cierre.dias-atras` (3 por defecto; se pone al día si el backend estuvo caído) y no existe su fila `(comercio_id, turno_fecha, horario_id)` en `cierre_turno`.
3. Turnos que se leen: todas las versiones de `horario` con `vigente_hasta >= ahora.fecha - (dias-atras + 1)` (incluye las recién cerradas por una edición de horarios: una edición no cambia la identidad de un turno ya terminado, porque el cierre apunta a la fila vieja por `horario_id`).
4. **Comercio sin ningún cierre previo** (recién aprobado, recién vinculado a Mercado Pago o primer despliegue): solo se cierra su **último turno terminado**, no los 3 días. Evita una avalancha de mails en blanco en el despliegue y tras vincular la cuenta (ver pregunta 3).
5. Comercio sin franjas vigentes: no tiene turnos, no hay cierre ni mail (sin sorpresas: el panel ya dice "Sin horario cargado").

### 2.2 Cuándo se difiere un cierre

Si el comercio tiene algún pedido `PENDIENTE_PAGO` con `fecha_creacion < fin` del turno, el cierre **se difiere** a una corrida posterior. Como la preferencia y el pedido vencen a los 30 minutos (la expiración corre cada 60 s), con la gracia de 30 minutos casi nunca se difiere más de uno o dos minutos. **Tope** (pregunta 4): `turno.cierre.espera-maxima-minutos` = 120 desde el `fin`; pasado ese tope se cierra igual y se escribe un `log.warn` (protege contra una expiración de pagos caída). Un pago confirmado **después** del cierre no recalcula la foto (decisión de Diego).

### 2.3 La foto del cierre

Dentro de **una transacción por comercio y turno** (servicio aparte, igual que la reapertura): verificar el diferimiento, leer las cifras y los pendientes en el mismo snapshot (`REPEATABLE READ`) y registrar la fila con `INSERT ... ON DUPLICATE KEY UPDATE` (afectadas 0 filas = otra corrida ya lo cerró, se descarta sin error). Las cifras salen del **mismo cálculo que el panel**: se extrae `ResumenTurnoService.calcular` a un método público que recibe `(comercioId, turno)` y lo comparten el panel y el cierre (una sola fuente de `ESTADOS_FACTURADOS`, `agregarTurno` y `pendientes`). Un test fija que el cierre de un turno terminado coincide con lo que `resumen-turno` mostraba un segundo antes.

Columnas de `cierre_turno`: `id`, `comercio_id` (FK), `turno_fecha`, `horario_id` (FK sin cascada), `inicio`, `fin`, `cantidad_pedidos`, `vendido`, `comision`, `neto`, `pendientes_al_cierre`, `fecha_cierre`, `email_estado` (`PENDIENTE`, `ENVIANDO`, `ENVIADO`, `FALLIDO`, `OMITIDO`), `email_intentos`, `email_proximo_intento`, `email_envio_iniciado`, `email_fecha_envio`, `email_ultimo_error` (500 caracteres). Índices: el `UNIQUE` y `(email_estado, email_proximo_intento)`. Montos `decimal(14,2)` (suman columnas `decimal(10,2)`). Sin comentarios en el SQL.

### 2.4 El envío (una fase aparte, sin transacción abierta)

1. **Recuperación:** las filas `ENVIANDO` con `email_envio_iniciado` más viejo que `turno.cierre.email-envio-vencido-minutos` (15) vuelven a `PENDIENTE` (el proceso cayó entre el reclamo y el resultado; reenvío "al menos una vez"). Se leen los ids y se actualiza cada uno por clave primaria.
2. **Selección:** filas `PENDIENTE` con `email_proximo_intento` nulo o vencido, agrupadas por Dueño en memoria (una consulta con el comercio, el usuario y el nombre del Dueño; sin entidades completas).
3. **Por cada Dueño, en su propio `try/catch`:**
   - Cuenta no `ACTIVO`: cada fila pasa a `OMITIDO` con el motivo ("La cuenta del Dueño no está activa") por `UPDATE ... WHERE id = ? AND email_estado = 'PENDIENTE'`. Se juzga en cada intento, no solo al cerrar.
   - Si no, **reclamo por clave primaria** fila por fila (`PENDIENTE` → `ENVIANDO`, `email_envio_iniciado = ahora`); las que no afectaron fila las ganó otra corrida y se descartan.
   - Con lo reclamado se arma **un solo mensaje** (sección 4) y se llama a `EmailService.enviarResumenTurno(...)`, sin ninguna transacción ni bloqueo abiertos.
   - Resultado `ENVIADO` o `DESHABILITADO` (perfil `test`): las filas pasan a `ENVIADO` con `email_fecha_envio`. `FALLIDO`: `email_intentos + 1`; si llegó al tope (5) pasa a `FALLIDO` definitivo con `log.error`; si no, vuelve a `PENDIENTE` con `email_proximo_intento = ahora + retroceso` (10, 30, 60 y 60 minutos: la lista es `turno.cierre.email-retroceso-minutos` y se repite el último valor) y `email_ultimo_error` (código HTTP y nombre del error de Resend, recortado). Todas las escrituras del resultado llevan `WHERE id = ? AND email_estado = 'ENVIANDO'`.
4. **Idempotency-Key** de Resend (pregunta 9): `cierre-turno-<ids ordenados>-i<intentos>`. Cubre el reenvío tras una recuperación (mismo intento = misma clave) sin dedupe entre intentos distintos.

`EmailService`: los cinco métodos actuales siguen igual (llaman al nuevo núcleo privado que devuelve el resultado y lo ignoran). Nuevo `enviarResumenTurno(destinatario, asunto, cuerpo, idempotencyKey)` devuelve un `ResultadoEnvioEmail` (`ENVIADO` con el id de Resend, `FALLIDO` con código y error, `DESHABILITADO`). Con el envío deshabilitado solo registra destinatario y asunto, nunca el cuerpo.

### 2.5 Probar el envío sin Resend real

- Java: `@MockitoBean` de `EmailService` (o `Resend`) en los tests de integración; `EmailServiceTest` con el `Resend` simulado cubre los tres resultados.
- Playwright, Newman y estrés: el perfil `test` devuelve `DESHABILITADO` y el cierre queda `ENVIADO`. Para ejercitar fallas y reintentos sin Resend: un contador de **fallas simuladas** en `EmailService` (solo se consulta con el envío deshabilitado) que fija el atajo `PUT /api/v1/test/email-resumen-turno/fallas?cantidad=N` (las próximas N llamadas devuelven `FALLIDO`). Pregunta 8.
- Para ver el resultado: `GET /api/v1/test/cierres-turno?comercioId=` devuelve las filas de `cierre_turno` (sin entidades); `POST /api/v1/test/jobs/cierre-turnos?ahora=` devuelve un `ResultadoCorrida` (cierres creados, diferidos, omitidos, mails enviados, cierres enviados, fallidos en la corrida). El texto exacto del mail lo fija un test unitario del armador (función pura), no un spec de punta a punta.
- Tiempo: los specs fijan `ahora` en el job y estampan los pagos con `PUT /api/v1/test/pedidos/{id}/pago-aprobado?ahora=` (ya existe), así que no hace falta esperar ni mover el reloj del backend.

---

## 3. Entrega A: backend, tests y estrés

### A1. Migración, entidad, repositorio y propiedades

- `V41__cierre_turno.sql` (2.3). Entidad `CierreTurno` (sin comentarios, `@Setter` campo por campo, sin setter en `id`), enum `EstadoEmailCierreTurno`, `CierreTurnoRepository` (claves existentes desde una fecha para una lista de comercios, comercios con algún cierre, filas por enviar, reclamos y resultados por clave primaria, inserción `ON DUPLICATE KEY UPDATE` por consulta nativa).
- `TurnoCierreProperties` (`@Component @ConfigurationProperties(prefix = "turno.cierre")`, `@Getter @Setter`, valores por defecto en el código): `gracia-minutos` 30, `espera-maxima-minutos` 120, `dias-atras` 3, `email-intentos-maximos` 5, `email-retroceso-minutos` `10,30,60`, `email-envio-vencido-minutos` 15. La bandera `job-habilitado` va aparte con `@Value` (`true` por defecto) como en los otros jobs.
- Hecho cuando: `reset-db` aplica `V41` sobre `bajonea_test`, `SHOW CREATE TABLE cierre_turno` coincide y `EnumsContraBaseDeDatosIntegrationTest` compara el nuevo ENUM contra el enum de Java.

### A2. Email con resultado y armador del mensaje

- `ResultadoEnvioEmail`; núcleo privado en `EmailService`; `enviarResumenTurno`; contador de fallas simuladas con su setter. `ResumenTurnoMensajeBuilder` (función pura: dos entradas, un cierre o varios, asunto y cuerpo).
- Hecho cuando: los 5 métodos existentes se comportan igual (tests actuales intactos) y el resultado distingue los tres casos.

### A3. Turnos terminados y cifras compartidas

- `DisponibilidadComercioService.turnosTerminadosEntre(horarios, desde, hasta)`: arma los `Turno` cuyo `fin` está en `(desde, hasta]`, con la misma lógica de vigencia por fecha de apertura, cruce de medianoche y 23:59 = 24:00 que `ultimoTurnoTerminado`.
- `ResumenTurnoService`: se extrae el cálculo de cifras a un método público reutilizable; `obtener` y `obtenerParaEmpleado` quedan con la misma salida.
- Hecho cuando: los tests actuales de resumen y de disponibilidad pasan sin cambios y los nuevos cubren la ventana (cruce de medianoche, edición de horarios, fin exacto).

### A4. `CierreTurnoService` (foto)

- Un método transaccional por comercio y turno (2.3) y un método de solo lectura que arma los candidatos de toda la corrida con tres consultas (comercios elegibles, `findVigentesDesdeIn`, claves existentes) y recorre en memoria. Ordena por `fin` ascendente dentro del comercio. Aplica las reglas 2.1 y 2.2.
- Orden de bloqueo: la transacción **solo lee sin bloqueos** y su única escritura es el `INSERT` en `cierre_turno`, cuyas FK toman bloqueos compartidos sobre `comercio` y `horario` (hojas, sin otro bloqueo sostenido). Sin cambio del orden global (`docs/CONCURRENCIA-Y-TRANSACCIONES.md`); se anota la fila nueva como hoja.

### A5. Envío y job

- `CierreTurnoEnvioService` (fase 2.4, cada escritura por clave primaria y en su transacción corta) y `CierreTurnoJob`: `@Scheduled(fixedDelay = 60_000)` + `abrirYCerrarTurnos(LocalDateTime ahora)` (fase de cierres, recuperación y envío, devuelve el `ResultadoCorrida`). Un comercio o Dueño que falla se loguea con `log.error` y no frena a los demás. Si la bandera está en `false` la corrida programada no hace nada.
- Hecho cuando: una corrida con `ahora` posterior al fin + gracia crea la fila, envía un mail por Dueño y deja el estado correcto; una segunda corrida igual no hace nada.

### A6. Atajos de test y limpieza

- `TestController`: `POST /jobs/cierre-turnos`, `GET /cierres-turno`, `PUT /email-resumen-turno/fallas`; `application-test.properties`: `turno.cierre.job-habilitado=false` con el mismo estilo de comentario de las otras propiedades. `AtajosDeTestEnElPerfilTestTest` y `AtajosDeTestFueraDelPerfilTest` suman los tres atajos.
- **Limpieza:** `postman/limpiar-datos-postman.sql` agrega `DELETE FROM cierre_turno` antes de borrar `horario` y `comercio`. `tests/helpers/multicomercio.ts:86` y `stress-locks-tramoPrecios.mjs:259` borran `horario` por SQL: seguirán andando porque esos comercios nunca corren el job (un `DELETE` de `horario` con un cierre apuntando fallaría por la FK), pero se anota en el README de Playwright.

### A7. Pruebas Java

- **Nuevos (unitarios):** `ResumenTurnoMensajeBuilderTest` (asunto y cuerpo exactos para un comercio, varios comercios, total 0, solo pendientes, turno que cruza la medianoche, formato de montos); `CierreTurnoServiceTest` (candidatos: gracia exacta, `PENDIENTE_PAGO` que difiere, tope de espera, ventana de 3 días, comercio sin historial = último turno, estados elegibles, sin franjas, edición de horarios con la fila vieja); `CierreTurnoJobTest` (bandera, un comercio o un Dueño que falla no frena a los demás, igual molde que `ReaperturaComerciosJobTest`); `CierreTurnoEnvioServiceTest` (retroceso 10, 30, 60, tope de 5, `OMITIDO`, `ENVIANDO` huérfano, resultado de cada fila por clave primaria).
- **Ampliados:** `EmailServiceTest` (tres resultados; fallas simuladas con el envío deshabilitado; el cuerpo nunca llega al log; los cinco métodos viejos siguen tragando la excepción); `DisponibilidadComercioServiceTest` (`turnosTerminadosEntre`); `EnumsContraBaseDeDatosIntegrationTest`.
- **Integración contra `bajonea_test`:** `CierreTurnoIntegrationTest` (comercio real, franjas, pedidos pagados con `confirmarPagoAprobado(ahora)`: el cierre coincide con `resumen-turno`; el neto no incluye los pendientes y estos salen en `pendientes_al_cierre`; total 0 igual envía; segunda corrida idempotente; Dueño con dos comercios = un solo envío con dos cierres; cuenta bloqueada = `OMITIDO` y reactivada no se reenvía; falla de Resend simulada = reintentos con la hora esperada y `FALLIDO` al quinto; la falla de un Dueño no impide el envío del siguiente; pago confirmado después del cierre no cambia la foto).
- **Concurrencia (hilos con latches):** `CierreTurnoConcurrenciaIntegrationTest`: dos corridas simultáneas = una fila y un envío por cierre (cuenta de llamadas al `EmailService` simulado); cierre contra edición de horarios, contra suspensión del comercio y contra un pago aprobado en el mismo instante, sin `Deadlock found`; corrida contra recuperación de un `ENVIANDO` huérfano.
- **No cambian** (verificado por lectura): `ResumenTurnoService*Test` salvo que pasan por el método extraído; `PedidoServiceVistaEmpleadoTest`, `ClasificacionRutasComercioTest` (no hay rutas nuevas fuera de `/test`).

### A8. API, Newman y estrés

- **Playwright API** `77-cierre-turno-api.spec.ts`: comercio con franja, pedidos pagados con `pago-aprobado?ahora=` en distintos estados (entregado, rechazado, expirado, pendiente), job con `ahora` antes de la gracia (0 cierres), justo después (1 cierre con cifras iguales al `resumen-turno` leído antes), turno con `PENDIENTE_PAGO` (diferido y luego cerrado), turno que cruza la medianoche, total 0, Dueño con dos comercios (`mailsEnviados` 1, `cierresEnviados` 2), cuenta del Dueño bloqueada (`OMITIDO`), fallas simuladas (`PENDIENTE` con `email_proximo_intento` esperado y luego `ENVIADO`; tope 5 = `FALLIDO`), segunda corrida sin efecto, Empleado/Cliente/Administrador sin acceso a nada nuevo, atajos inexistentes fuera del perfil `test`. El spec apaga las fallas simuladas en `afterAll` y en `finally`.
- **Newman:** constructor `build-cierre-turno-tramoT4-postman.mjs`, carpeta `76`, **última** (la `75` es la de T3). Calcula el `ahora` del job por requests anteriores; los demás constructores no se tocan.
- **Estrés** `stress-locks-tramoCierreTurno.mjs`, id `cierres` en `correr-estreses.mjs`, 8 o más rondas: (1) N corridas simultáneas del job sobre 20 o más comercios con turno terminado: exactamente una fila por turno, `suma(cierresEnviados)` igual a la cantidad de filas y ningún `5xx`; (2) las corridas contra ediciones de horarios (T1), pagos aprobados, suspensión y bloqueo de cuenta en paralelo: sin `5xx` ni `Deadlock found`, y las cifras de cada fila coinciden con lo que SQL calcula sobre los pedidos con ese turno **cuando no hay pagos concurrentes** (con pagos concurrentes solo se exige que la fila sea una de las dos versiones coherentes); (3) fallas simuladas intermitentes: ningún cierre queda perdido (todo `ENVIADO`, `FALLIDO` solo si se agotaron 5 intentos) y ningún `ENVIANDO` huérfano al terminar; (4) volumen sintético, ver sección 6.
- **Mutaciones ("las pruebas muerden"):** cerrar sin esperar la gracia o sin el diferimiento por `PENDIENTE_PAGO`; sin tope de espera; cifras calculadas aparte del panel (`ESTADOS_FACTURADOS` distinto); contar los pendientes dentro del neto; no enviar con total 0; un mail por cierre en vez de por Dueño; enviar con la cuenta bloqueada; enviar desde dentro de una transacción; omitir el reclamo por clave primaria (doble envío); omitir `WHERE email_estado = 'ENVIANDO'` en el resultado; no capturar la excepción de un Dueño (frena a los demás); no avanzar `email_intentos`; retroceso fijo; no recuperar el `ENVIANDO` huérfano; ignorar el `UNIQUE`; recorrer 3 días para un comercio sin historial; borrar la bandera del job de test.

### A9. Verificación de la entrega A

`mvnw clean` y las dos pasadas del proyecto sobre base reseteada, Newman completo, Playwright de API, runner completo de estreses (22 + el nuevo) y las mutaciones. Entregable: archivos tocados, evidencia por punto, tests que cambian de significado (sección 7, ninguno si Diego confirma). **Punto de corte: informe a Diego antes de la entrega B.**

---

## 4. El mensaje (para que Diego lo apruebe)

Texto plano, sin enlaces, firmado como los otros mails del proyecto. Etiquetas iguales a las del panel ("Vendido en el turno", "Comisión", "Neto del turno", "Pedidos del turno"). La hora del turno usa la convención del proyecto ("20:00 a 02:00 (día siguiente)", nunca "+1"). Los montos con formato argentino y sin centavos cuando son cero. Sin nombres de estados internos.

**Un comercio.** Asunto: `Cerró tu turno en Pizzería Popular: vendiste $128.400`

```
Hola Diego,

Cerró el turno de Pizzería Popular del jueves 22/10, de 20:00 a 02:00 (día siguiente).

Vendido en el turno: $128.400
Comisión de Bajoneá: $1.284
Neto del turno: $127.116
Pedidos del turno: 23

Quedaron 2 pedidos sin responder al cerrar el turno. No están incluidos en estos montos.

Podés ver el detalle en el panel de Bajoneá.

Equipo de Bajoneá
```

**Un comercio sin ventas.** Asunto: `Cerró tu turno en Pizzería Popular: sin pedidos`. Cuerpo: igual, con "No hubo pedidos en este turno." en lugar de los montos (y la línea de pendientes si corresponde).

**Más de un comercio.** Asunto: `Cerraron los turnos de tus comercios`

```
Hola Diego,

Cerraron estos turnos:

Pizzería Popular — jueves 22/10, de 20:00 a 02:00 (día siguiente)
Vendido en el turno: $128.400
Comisión de Bajoneá: $1.284
Neto del turno: $127.116
Pedidos del turno: 23
Pedidos sin responder al cierre: 2 (no incluidos en estos montos)

Corner Coffee Shop — jueves 22/10, de 12:00 a 15:00
No hubo pedidos en este turno.

Podés ver el detalle en el panel de Bajoneá.

Equipo de Bajoneá
```

Detalles a tener en cuenta al leerlo: el "Vendido" es el bruto (subtotal de los pedidos que llegaron a prepararse, entregarse o cerrarse como no retirados), igual que en el panel; los pedidos sin responder son los pendientes **de todo el comercio** al momento del cierre, como el contador "Pendientes" del panel (pregunta 5). Un pedido que el comercio acepta después del cierre sí suma al panel pero no al mail: es la consecuencia de que la foto no se recalcula.

---

## 5. Entrega B: cierre (sin pantallas)

No hay frontend. Esta entrega es documentación, regresión final y checklist.

- Documentación: `CLAUDE.md` (§1bis: ítem del T4; §3 componentes nuevos; §5 entidad `CierreTurno` y `ResumenTurnoService` compartido; §6 la fila de la fase; §9 pendientes), `docs/DECISIONES.md` (una entrada por decisión), `docs/diccionario-de-datos.md` y su copia en `docs/entregables-01-02/` (tabla `cierre_turno`; versión nueva), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (el job solo lee sin bloqueos; `cierre_turno` es hoja; el envío no sostiene ninguna transacción), `docs/APRENDIZAJES-TECNICOS.md`, `docs/LISTA-DE-DESPLIEGUE.md` (variables `turno.cierre.*`, la bandera `TURNO_CIERRE_JOB_HABILITADO`, `RESEND_API_KEY` y `MAIL_FROM` obligatorios, instancia única, el SQL para reencolar un cierre `FALLIDO`, el aviso de que el primer arranque cierra solo el último turno de cada comercio, los límites de Resend con lo verificado y lo no verificado), `docs/entregables-01-02/` (requisitos funcionales e historias del Dueño y del Comercio, `CAMBIOS.md`), `testing/playwright/README.md` (los tres atajos y la regla de apagar las fallas simuladas), `docs/MAPEO-ARCHIVOS-FASE2-T4.md` y `docs/PROGRESO-FASE2-T4.md`.
- Regresión completa: `mvnw test` (dos pasadas), Newman, Playwright completo (inestables conocidos `01:101`, `27:497` y `52:437`) y todos los estreses.
- Checklist para Diego con evidencia por punto. **Sin commit hasta su confirmación.**

---

## 6. Costo de recorrer comercios y turnos

- **Cada 60 segundos:** 3 consultas (comercios elegibles, `findVigentesDesdeIn` de todos, claves de `cierre_turno` desde `hoy - 4`) más 1 consulta de filas por enviar, todas indexadas o de tamaño acotado, más un recorrido en memoria: comercios × (días de la ventana + 1) × filas de horario vigentes (típico 14). Con 2000 comercios son del orden de cien mil iteraciones, milisegundos. El diferimiento por `PENDIENTE_PAGO` se consulta **solo para los turnos candidatos sin fila** (es decir, casi nunca): usa `idx_pedido_comercio` y filtra por estado y fecha.
- **Dimensionamiento a medir** (escenario 4 del estrés, método de `docs/LISTA-DE-DESPLIEGUE.md`): 2000 comercios sintéticos con 14 franjas y 30000 pedidos; una pasada sin nada que cerrar y una con 2000 cierres pendientes; se informa el tiempo de cada una. El número exacto de comercios reales no está verificado.
- **Envío:** secuencial por Dueño, a unos 300 a 500 ms por llamada: bien por debajo de los 10 pedidos por segundo de Resend aun con cientos de Dueños cerrando a la misma hora. Un pico de cierres simultáneos (todos los locales cierran a las 23:00) no genera una corrida más larga que unos minutos.
- **Crecimiento de la tabla:** una fila por comercio y turno: unos miles por día en el peor caso, sin necesidad de archivar en esta fase.

## 7. Zona horaria, comercios sin franjas y suspendidos

- **Zona:** todo sale del `Clock` único (`America/Argentina/Ushuaia`, sin horario de verano); el job usa `DisponibilidadComercioService.ahora()`. Las horas del mail son las del comercio y no se convierten. No se usa `zone` en `@Scheduled`.
- **Sin franjas:** sin cierre y sin mail. Con franjas vigentes que se editan: ver 2.1 punto 3.
- **Suspendido o con la cuenta bloqueada:** el comercio `SUSPENDIDO` o `CERRADO_TEMPORALMENTE` sigue teniendo turnos y puede tener pedidos en curso; se registra su cierre y el aviso solo se manda si hubo pedidos o pendientes (pregunta 2). Con la cuenta del Dueño bloqueada el estado de envío es `OMITIDO`.

## 8. Riesgos y puntos de atención

| # | Riesgo | Cómo se maneja |
|---|---|---|
| 1 | Doble envío por dos corridas simultáneas o por un proceso caído entre el envío y el resultado | Reclamo por clave primaria con condición de estado; recuperación de `ENVIANDO` vencido; Idempotency-Key por intento. El reenvío tras una caída sigue siendo "al menos una vez" (aceptado) |
| 2 | Cuota diaria Free de Resend (`daily_quota_exceeded`, `429`): cinco intentos en unas dos horas se agotan y el cierre queda `FALLIDO` aunque la cuota se renueve a las 00:00 UTC (21:00 en Ushuaia) | No se construye reproceso automático; se documenta el `UPDATE` de reencolado en la lista de despliegue y el `log.error` del `FALLIDO` lo hace visible. Verificar el plan de Resend antes de producción |
| 3 | Avalancha de mails en el primer arranque o al vincular Mercado Pago | Regla 2.1 punto 4 (comercio sin historial = solo el último turno terminado) |
| 4 | Un pago tardío o una aceptación del comercio después del cierre hace que el mail y el panel difieran | Diseñado: la foto no se recalcula; el mail aclara los pendientes. El panel de un turno terminado sigue calculando en vivo |
| 5 | Pedidos `PENDIENTE_PAGO` colgados porque la expiración no corre | Tope de espera de 120 minutos con `log.warn` |
| 6 | Un `DELETE FROM horario` por SQL (limpieza de datos de prueba) falla si hay un cierre apuntando | Se agrega el borrado de `cierre_turno` en `limpiar-datos-postman.sql`; los helpers de test que borran `horario` no corren el job para esos comercios |
| 7 | El Empleado no recibe el mail ni ve comisión ni neto | Decisión de Diego: el mail es del Dueño |
| 8 | Un Dueño con muchos comercios recibe un mail largo | Un solo mensaje por corrida; sin tope por ahora |
| 9 | La contraseña, el código o datos sensibles en el log | El cuerpo del mail nunca se registra; el asunto lleva el nombre del comercio y el monto bruto, igual que el asunto de las invitaciones lleva nombres (se acepta) |
| 10 | Cambios locales de Diego en `application.properties` y `Bajonea-Local.postman_environment.json` | No se tocan: los valores por defecto viven en el código y la bandera de test va en `application-test.properties` |

## 9. Tests existentes que cambian de significado

**Ninguno**, siempre que se confirme el diseño. Lo que sí se actualiza: `EmailServiceTest`, `DisponibilidadComercioServiceTest`, `EnumsContraBaseDeDatosIntegrationTest`, `AtajosDeTestEnElPerfilTestTest` y `AtajosDeTestFueraDelPerfilTest` crecen sin cambiar sus expectativas actuales; `postman/limpiar-datos-postman.sql` suma un `DELETE`; `application-test.properties` suma una bandera. `ResumenTurnoService` se refactoriza sin cambiar su salida, así que los specs `71`, `73`, `37`, `38` y los de Java del resumen deben pasar tal cual (se corren completos para confirmarlo). El runner de estreses pasa de 22 a 23.

## 10. Preguntas abiertas para Diego, con recomendación

1. **Texto del mail (sección 4):** asunto y cuerpo de los tres ejemplos. Recomiendo aprobarlos así, sin enlace al panel (en este proyecto solo la invitación lleva enlace). ¿Querés otro tono, o que el asunto no incluya el monto?
2. **¿Qué comercios generan cierre?** Recomiendo `APTO_VENTA` siempre; `SUSPENDIDO` y `CERRADO_TEMPORALMENTE` registran el cierre pero solo avisan si hubo pedidos o pendientes; `APROBADO` e `INACTIVO` nunca (no pueden vender). Alternativa: solo `APTO_VENTA`.
3. **Comercio sin ningún cierre previo:** recomiendo cerrar solo su último turno terminado (en vez de los 3 días), para no mandar mails vacíos en el primer despliegue ni después de vincular Mercado Pago.
4. **Tope a la espera de los `PENDIENTE_PAGO`:** recomiendo 120 minutos desde el fin (`turno.cierre.espera-maxima-minutos`), pasados los cuales se cierra igual con un aviso en el log. Sin tope, un fallo de la expiración de pagos frena los mails para siempre.
5. **"Pendientes al cierre":** recomiendo contar todos los pendientes del comercio (igual que el panel). Alternativa: solo los pagados dentro del turno; discrepa del panel.
6. **Retroceso exacto:** recomiendo 10, 30, 60 y 60 minutos, tope de 5 intentos (la tercera espera se repite), y que un `FALLIDO` definitivo quede solo en la base y en el log (con el SQL de reencolado en la lista de despliegue). ¿Querés además una vía para reencolarlo desde la pantalla del Administrador? Recomiendo no, en esta fase.
7. **Cuenta del Dueño no `ACTIVO`:** recomiendo `OMITIDO` definitivo, como decidiste, evaluado en cada intento. Si la cuenta se reactiva después, ese cierre no se envía.
8. **Fallas simuladas en el perfil `test`** (contador en `EmailService` + atajo): recomiendo sí; es la única forma de probar reintentos de punta a punta sin Resend real. Es código de producción que solo se consulta con el envío deshabilitado, mismo criterio que `PrecioBloqueoProperties`.
9. **Idempotency-Key de Resend:** recomiendo usarla (`cierre-turno-<ids>-i<intento>`). Está soportada por el SDK 4.13.0; no pude verificar la retención ni su comportamiento ante un envío previo fallido, por eso la clave cambia en cada intento.
10. **Asunto con el monto:** el asunto muestra la venta bruta (dato de negocio en el listado de la bandeja). Recomiendo dejarlo así; si preferís privacidad, el asunto pasa a "Cerró tu turno en X".
11. **Instancias:** se asume una sola; el reclamo por clave primaria queda de todos modos. Si producción corriera varias, el job sirve sin cambios.

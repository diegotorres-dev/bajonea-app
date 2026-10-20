# Auditoría de la Fase 2: cadena de turnos (2026-10-19)

Auditoría de solo lectura. No se modificó ningún archivo salvo este documento, no se tocó ninguna base, no se ejecutó ninguna migración ni test, no se hizo commit. Todo lo que se afirma sale de leer código, migraciones, tests y docs, con ruta de archivo; lo que no pude verificar está en la sección 11. No se estiman tiempos: el tamaño se da en piezas (capas, migraciones, tests).

Los puntos son los de `docs/AUDITORIA-ETAPA-FINAL.md`: 13 (edición de horarios), 11 (facturación por turno), 12 (precios no modificables en franja), 9 (email por turno cerrado) y 8 (estadísticas del Dueño).

---

## 0. Discrepancias con el prompt y con la auditoría anterior (leer primero)

1. **Siguiente migración libre: `V38`, como dice el prompt.** `docs/AUDITORIA-ETAPA-FINAL.md` decía `V36`; desde entonces entraron `V36` (registro de comercio, tramo 1) y `V37` (nombre único, tramo 2). El punto 10 de esa auditoría ya está hecho y no entra acá.
2. **`ReaperturaComerciosJob` no tiene bandera de habilitación.** `backend/src/main/java/com/bajonea/backend/services/ReaperturaComerciosJob.java:28` es un `@Scheduled(fixedDelay = 60_000)` pelado; `InvitacionVencimientoJob` y `PedidoSchedulerService` sí tienen su propiedad (`invitacion.vencimiento.job-habilitado`, `pedido.jobs.habilitado`, ambas en `application-test.properties`). O sea: en el perfil `test` la reapertura corre sola cada 60 s. La auditoría anterior proponía copiar "el patrón de `ReaperturaComerciosJob` con propiedad"; ese patrón hay que tomarlo de los otros dos jobs.
3. **La lista de tests que "muestran o comparan Facturado hoy" de la auditoría anterior no coincide con el código.** Citaba specs `43`, `52`, `64`, `05`, `30`, `31` y builders `A2b`, `A3`. Buscando `Facturado hoy|Ventas de hoy|totalFacturadoHoy|resumen-hoy` los consumidores reales son los de la sección 4.4 (specs `21`, `37`, `38`, `47`, más `50` y `59` que solo nombran la ruta).
4. **Los dos casos "horaCierre igual" y "horaCierre anterior" de validación hoy esperan `400` y pasan a ser válidos** (`testing/playwright/scripts/build-matriz-comercio-postman.mjs:275-276`; mensaje "La hora de cierre debe ser posterior a la hora de apertura" en `ValidadorDatosNegocioComercio.java:73-77`; y el frontend repite la regla en `frontend/js/comercio-form.js:617` y `:804`). El prompt dice "menor o igual indica cruce": con "igual" una franja pasa a durar 24 horas, y un error de tipeo (`08:00`–`08:00`) deja de ser un error. Lo discuto en la pregunta 1.
5. **`TipoEntidadEdicion.HORARIO` y los textos "Editó los horarios" ya existen** (`enums/TipoEntidadEdicion.java`, `ActividadComercioService.java:272,281,290`) pero ningún código los emite. La Actividad del Dueño ya está lista para mostrar la edición de horarios; solo falta el emisor.
6. **`CLAUDE.md` §1bis dice que el Empleado "edita solo descripción, teléfono y horarios"**, pero hoy no existe ningún endpoint para editar horarios de un comercio aprobado (lo confirma `ComercioService` y `DelegacionEmpleado`, que tiene 23 rutas y ninguna de horarios). La decisión "el Empleado hereda la edición" es la que cierra ese cabo.
7. **El job "con la zona Ushuaia" no necesita `zone` en `@Scheduled`.** Todos los jobs del proyecto son `fixedDelay` y toman la hora del `Clock` de `ClockConfig` (`Clock.system(zona)`, por defecto `America/Argentina/Ushuaia`). Para el cierre de turno conviene lo mismo: un `fixedDelay` de 60 s que decide con el `Clock`, no un `cron`, porque cada comercio cierra a una hora distinta.
8. **El "Facturado hoy" del Dueño es neto y el "Ventas de hoy" del Empleado es bruto** (`PedidoService.java:735-751`). Tu decisión ("Vendido en el turno" bruto para los dos, comisión y neto solo para el Dueño) cambia el número que ve el Dueño en el panel: pasa de neto a bruto. Los tests que fijan el neto del Dueño se reescriben (sección 4.4).
9. **Los comercios de prueba de toda la suite tienen una sola franja `00:00`–`23:59` del día de hoy** (`testing/playwright/tests/helpers/backend.ts:731`, `helpers/multicomercio.ts:36`). Es el dato que condiciona el bloqueo de precios en tests (sección 5.5).

---

## 1. Modelo y diseño transversal (lo que los cinco puntos comparten)

### 1.1 Estado actual, con rutas

| Pieza | Hoy |
|---|---|
| Tabla `horario` | `id`, `comercio_id`, `dia_semana`, `hora_apertura`, `hora_cierre`; solo índice `idx_horario_comercio`; sin vigencia ni unicidad (`V1__baseline_bajonea_final.sql:247-256`) |
| Entidad | `entities/Horario.java`, `@Builder`, sin vigencia |
| Repositorio | `HorarioRepository.findByComercioId` y `findByComercioIdIn`: devuelven todas las filas |
| Validación | `ValidadorDatosNegocioComercio.validarHorarios` (`:73-95`): cierre posterior a apertura, sin superposición dentro del mismo día; no mira días vecinos |
| Escritura | alta (`RegistroService.java:235-243`) y corrección de un rechazado (`ComercioEdicionService.reemplazarHorarios`, `:169-198`: `deleteAll` + `saveAll`). **No hay edición de un comercio aprobado.** |
| Lectura de disponibilidad | `DisponibilidadComercioService` (146 líneas): `dentroDeFranja` (`:54-61`, solo mira las filas de hoy), `proximoInicioDeFranja` (`:75-91`), `momentoDeReferencia` (`:129-137`), `finDeFranja` (`:139-141`, 23:59 vale hasta 24:00) |
| "Hoy" del panel | día calendario (`PedidoService.pedidosLlegadosPagadosHoy`, `:753-764`) |
| Fecha del pago | no se guarda; se deriva de `historial_estado_pedido` (`PedidoService.fechasPagoAprobado`, `:1041-1051`, `min(fecha_hora)` de la fila `PENDIENTE_CONFIRMACION_COMERCIO`) |
| Turno / cierre de turno | no existe en ningún archivo de `backend/src/main` ni de `frontend` (`grep -i turno`: cero resultados) |

### 1.2 Modelo propuesto

- **Una fila `horario` por franja, que puede cruzar la medianoche.** El día de la fila es el de apertura. Cruza si `hora_cierre <= hora_apertura` (ver pregunta 1 sobre el "igual").
- **Vigencia:** `vigente_desde date NOT NULL DEFAULT '2000-01-01'`, `vigente_hasta date NULL` (inclusive). Una edición no borra: cierra las filas vigentes con `vigente_hasta = hoy` y crea las nuevas con `vigente_desde = mañana`. El registro y la corrección de un rechazado siguen siendo inmediatos y sin versionado (el comercio todavía no vende).
- **El valor por defecto `'2000-01-01'` es lo que mantiene vivos los `INSERT` a mano** de los tests (`helpers/multicomercio.ts:85-93` inserta en `horario` por SQL) y de `TestSupportService.java:195-203`.
- **Turno = `(comercio_id, turno_fecha, horario_id)`**, con `turno_fecha` la fecha de apertura (un pedido de madrugada pertenece al turno del día anterior). `horario_id` apunta a la versión de la fila, así que el turno de un día pasado no cambia aunque después se edite el horario.
- **Convención 23:59.** Recomiendo mantener `finDeFranja` (23:59 vale hasta 24:00) para las franjas que no cruzan: los datos de demostración (`datos-prueba/scripts/datos-fase1.mjs:76,170,218,262,300`) y toda la suite usan `23:59`. Con franjas que cruzan, "hasta medianoche" también se puede escribir `00:00` como cierre; las dos formas conviven. Si se quitara la convención, el comercio `00:00`–`23:59` quedaría cerrado un minuto por día. (Pregunta 2.)

### 1.3 Cómo cambia `DisponibilidadComercioService`

Nuevas firmas (sin comentarios, mismo estilo del servicio): la clase recibe siempre **todas las versiones relevantes** y filtra por fecha en memoria, para que las consultas sigan siendo una por comercio.

```java
public record TurnoRef(LocalDate fecha, Integer horarioId, LocalDateTime inicio, LocalDateTime fin) {}

public boolean dentroDeFranja(List<Horario> horarios, LocalDateTime ahora)
public Optional<TurnoRef> turnoDe(List<Horario> horarios, LocalDateTime instante)
public Optional<TurnoRef> ultimoTurnoTerminado(List<Horario> horarios, LocalDateTime instante, int diasAtras)
public LocalDateTime finDelTurno(Horario horario, LocalDate fecha)
public Optional<LocalDateTime> proximoInicioDeFranja(List<Horario> horarios, LocalDateTime desde)
static List<Horario> vigentesEn(List<Horario> todas, LocalDate fecha)
static boolean cruzaMedianoche(Horario horario)
```

| Método | Cambio |
|---|---|
| `dentroDeFranja` | Una fila de hoy (vigente hoy) con el día de hoy contiene el instante si, sin cruce, `apertura <= t < finDeFranja(cierre)`; con cruce, `t >= apertura`. Una fila de **ayer** (vigente ayer) con el día de ayer y cruce lo contiene si `t < cierre`. Es una condición más que hoy. Con 7 filas de una misma versión el costo es constante. |
| `turnoDe` | Nuevo. Misma regla que `dentroDeFranja`, devuelve `(fecha de apertura, horarioId, inicio, fin)`. |
| `finDelTurno` | Nuevo. `fecha.atTime(cierre)`, más un día si cruza; 23:59 sin cruce vale `fecha + 1 día 00:00`. |
| `ultimoTurnoTerminado` | Nuevo, para el pago fuera de franja. Recorre hasta `diasAtras` días hacia atrás (recomiendo 7), arma los turnos de cada fecha con `vigentesEn` y devuelve el de mayor `fin <= instante`. |
| `proximoInicioDeFranja` | Mismo recorrido de 7 días hacia adelante, pero cada fecha candidata usa `vigentesEn(todas, fecha)`: una versión que empieza mañana ya cuenta para la reapertura. |
| Reapertura tras cierre manual | La regla ("primera franja que **empieza** después de la última fila `CERRADO`") no cambia. Lo que cambia es el resultado: con una fila por turno, un cierre manual a las 23:30 en un turno `20:00`–`02:00` **no** reabre a las 00:00 (hoy sí, porque la segunda fila empieza a las 00:00; es la limitación que documenta el Javadoc de la clase, líneas 28-30). Esa limitación desaparece. |
| `textoReapertura` | No cambia (es una función de dos instantes). Con crucen, "Reabre hoy/mañana a las HH:mm" sigue siendo correcto porque usa el inicio de la franja, no su fin. |
| `calcular(...)`, `puedeCambiarCierre` | Sin cambio de lógica: usan `dentroDeFranja`. Cerrar y abrir a mano vale "dentro del turno", incluida la cola de madrugada. |

`HorarioRepository` pasa a tener `findVigentesDesde(comercioId, fechaDesde)` y su variante `In`: `vigente_hasta IS NULL OR vigente_hasta >= :fechaDesde`. La lectura normal usa `hoy - 1` (cubre la cola de ayer); el cierre de turno y el backfill pasan una fecha más vieja. **Nunca se debe seguir usando `findByComercioId` en caminos calientes** (los 15 s de polling de `MisComerciosService` lo llamarían con todo el historial de ediciones).

### 1.4 Todos los lugares que leen o escriben un horario, y qué cambia

| # | Lugar | Qué hace hoy | Cambio |
|---|---|---|---|
| 1 | `RegistroService.java:235-243` | alta de las filas | Sigue inmediato (`vigente_desde` por defecto). Acepta filas que cruzan. |
| 2 | `ComercioEdicionService.reemplazarHorarios` (`:169-198`) | `deleteAll` + `saveAll`; lo usa la corrección de un rechazado | **Se mantiene** (el comercio nunca vendió, no hay pedidos ni cierres que apunten a esas filas). Hay que extraer la comparación de franjas, que se reutiliza en la edición versionada. |
| 3 | `ComercioCorreccionService.java:103` | lee las filas para precargar el formulario | Sin cambio funcional (todas las filas son vigentes en un rechazado). |
| 4 | `ValidadorDatosNegocioComercio.validarHorarios` | cierre > apertura; superposición por día | **Reescribir.** Expandir cada franja a intervalos en minutos de la semana (con vuelta de domingo a lunes) y comprobar superposición entre todas, cruzando días. Compartido por registro, alta adicional, corrección y edición. |
| 5 | `ComercioService.java:83, 361, 405` | arman `aEmpleadoResponseDTO`, `aResponseDTO`, `aPublicoResponseDTO` con todas las filas | Filtrar por vigencia (`vigentesEn(hoy)`); los DTO de edición suman las filas pendientes (`vigente_desde > hoy`). `listarAprobados` (`:200-204`) hoy hace una consulta de horarios **por comercio**; aprovechar para pasar a `findVigentesDesdeIn`. |
| 6 | `ComercioService.validarAceptaPedidos` (`:226-230`) | `dentroDeFranja` sobre todas las filas | Cambia solo por reutilizar las lecturas nuevas. Lo llaman `CarritoService.agregarItem` y `PedidoService.confirmarPedido` (`:176`). |
| 7 | `CierreComercioService.java:91-94` y `:112-124` | `dentroDeFranja` al cerrar/abrir; `proximoInicioDeFranja` al reabrir | Misma lectura vigente. En `reabrirSiVencido`, si no hay ninguna franja la función devuelve `false` para siempre y el comercio queda con `cerrado_manualmente = 1` (hueco existente, sección 8). |
| 8 | `MisComerciosService.java:44`, `MisComerciosEmpleadoService.java:44` | `findByComercioIdIn` en el polling de 15 s | Pasar a la variante vigente. Es el camino más frecuente del sistema: mantener una sola consulta agrupada. |
| 9 | `AdministradorService.java:199, 376` | horarios del comercio en el listado y detalle del Administrador | Filtrar vigentes; opcional mostrar el cambio programado. |
| 10 | `TestSupportService.java:195-203` | clona las filas de un comercio de prueba | Copiar también `vigente_desde`/`vigente_hasta`. |
| 11 | `util/ComercioTextoLegible.horarios` (`:80`) | texto "Lunes 09:00-13:00; ..." para el historial de cambios de la corrección | Marcar las que cruzan ("Lunes 20:00-02:00 (+1)"). |
| 12 | Edición de un comercio aprobado | no existe | **Nuevo:** `PUT /api/v1/comercios/perfil/horarios`, delegable. |

Frontend que lee o escribe horarios: `js/comercio-form.js` (`initHorarios` `:560`, validación `:617` y `:804`, superposición `:600`, `:766`, `:812`), `js/auth.js:340-387` (registro), `js/agregar-comercio.js`, `js/comercio-corregir.js` (`:93`, `:220-298`), `js/catalogo.js:77-86` (`resumenHorarioHoy`), `js/comercio.js:640` y `:1977-1985` (`pintarHorariosParaEmpleado`), `js/admin.js:629-641` y `:2021-2024`, `comercio-perfil.html:212`.

### 1.5 Concurrencia transversal (orden global de `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, sección "Orden global de bloqueos")

Las filas de `horario` y de `cierre_turno` son **hojas debajo de `comercio`**: se escriben siempre con el comercio ya tomado y no se toman antes de nada. El orden global no cambia. Las lecturas de horarios nunca llevan bloqueo (REPEATABLE READ).

---

## 2. Punto 13: edición de horarios

**a) Qué existe hoy.** Sección 1.1 y 1.4. Además: no hay endpoint de edición para un comercio aprobado (`ComercioController` solo tiene `PUT /comercios/perfil`, `.../perfil/datos-operativos`, `cerrar`, `abrir`); el perfil muestra los horarios en solo lectura; la corrección de un rechazado es el único camino de escritura posterior al alta.

**b) Qué cambiar, capa por capa.**

- **Migración / entidad:** `Horario` suma `vigenteDesde` (con `@Builder.Default` a `2000-01-01`, para que los `Horario.builder()` de ~20 tests y de `RegistroService` sigan compilando) y `vigenteHasta`.
- **Repositorio:** consultas vigentes (1.3); una consulta de pendientes (`vigente_desde > hoy`).
- **Servicio nuevo `HorarioEdicionService`** (o método en `ComercioEdicionService`): recibe la lista nueva, valida (4 en 1.4), compara contra las filas vigentes; tres casos de estado:
  1. Igual a lo vigente: borra los pendientes si los hay (cancela un cambio programado) y responde sin cambios.
  2. Distinta: cierra las vigentes abiertas con `vigente_hasta = hoy` (si no estaban cerradas ya), **borra los pendientes anteriores** (no tienen pedidos ni turnos que los referencien) e inserta las nuevas con `vigente_desde = mañana`.
  3. Lista vacía: `400` ("Cargá al menos una franja").
- **Historial:** `historial_edicion_comercio` con `TipoEntidadEdicion.HORARIO`, `AccionEdicion.EDITAR` y `detalle` con el nombre del campo y la fecha desde la que rige; `HistorialEdicionComercioService.registrar` ya sirve tal cual. La Actividad ya trae el texto "Editó los horarios".
- **Controller:** `ComercioController`, `PUT /api/v1/comercios/perfil/horarios`, con `ComercioActivo` como primer parámetro (regla del bloque A2 de E3: el resolver corre antes de leer el cuerpo). Respuesta: vigentes más pendientes con su `rigeDesde`.
- **Seguridad:** ruta nueva exacta en `config/security/DelegacionEmpleado` (pasan a 24) y en `ClasificacionRutasComercioTest` (`delegable(...)`). Guard de estado como `editarDatosOperativos`: el Empleado con el comercio `SUSPENDIDO` recibe `409 COMERCIO_SUSPENDIDO`; con `CERRADO_TEMPORALMENTE` puede.
- **DTO de respuesta:** `HorarioResponseDTO` suma `cruzaMedianoche`; los DTO de perfil suman `horariosPendientes`.
- **Frontend (entrega B):** vista "Editar horarios" en `comercio-perfil.html` reutilizando `initHorarios` (`comercio-form.js`), con "termina al día siguiente" cuando cierre <= apertura, aviso "Rige desde mañana" y el cambio programado visible; la fila "Editar horarios" también para el Empleado (hoy `pintarHorariosParaEmpleado` solo lee). Corregir `resumenHorarioHoy` (`catalogo.js:77`) y `textoHorarios` (`admin.js:2021`) para filas que cruzan.

**c) Migraciones y riesgo con datos.**

- `V38`, estructura: `vigente_desde`, `vigente_hasta`, índice `(comercio_id, vigente_desde, vigente_hasta)` y un `CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)`. Es aditiva y las filas existentes quedan vigentes desde siempre. Riesgo bajo.
- `V39`, fusión de pares `23:59` + `00:00`, **solo después de revisar la consulta de candidatos a mano**. La regla de fusión tiene que ser estricta, porque los comercios 24 horas (`00:00`–`23:59` los 7 días, que es exactamente lo que usan los comercios de prueba) **no son pares a fusionar**: una fila `D 00:00-23:59` seguida de `D+1 00:00-23:59` cumpliría "cierra 23:59 / abre 00:00" y se fusionaría en un turno de 48 horas. Condición propuesta: fila A con `cierre = 23:59` **y `apertura > 00:00`**, fila B del día siguiente (con vuelta de domingo a lunes) con `apertura = 00:00` y `cierre < apertura de A`. Si `cierre de B >= apertura de A` el resultado dura 24 horas o más y no se puede representar: queda para decisión manual. No pude ejecutar la consulta de revisión contra `bajonea_practicas3`; los datos de demostración del repo (`datos-fase1.mjs`) no tienen ningún par (no hay franjas con apertura `00:00` y no cruzan).
- Riesgo de la fusión: una apertura legítima a las `00:00` sin continuidad no se debe tocar; por eso la revisión previa.

**d) Impacto exacto en tests.**

- **Java:** `DisponibilidadComercioServiceTest` (270 líneas, 20 `@Test`, todas con filas de un solo día) se reescribe y crece; `ReaperturaComerciosJobTest` (4 `@Test`) y `CierreComercioServiceTest` (390 líneas, 27 `@Test`) cambian la forma de armar horarios; `ComercioServiceValidarAceptaPedidosTest`, `ComercioServiceCatalogoPublicoTest`, `MisComerciosServiceTest`, `MisComerciosEmpleadoIntegrationTest`, `ComercioEdicionServiceTest`, `ComercioCorreccionServiceTest`, `ComercioTextoLegibleTest`, `ComercioServiceBloqueoVigenteTest` y `RegistroComercioFase1IntegrationTest` construyen `Horario` y siguen compilando con el `@Builder.Default`, pero los que prueban la validación de cierre/apertura cambian de expectativa. Nuevos: edición (tres casos de estado), validación circular, `turnoDe`, `ultimoTurnoTerminado`, `ClasificacionRutasComercioTest` (24 rutas delegables), `EscriturasEmpleadoHttpIntegrationTest` (el Empleado edita horarios).
- **Playwright:** el payload de registro no cambia (`HorarioInput`), así que los specs que registran (`13`, `17`, `22`–`25`, `30`, `31`, `33`, `35`–`38`, `42`, `63`, `67`) siguen igual; cambian el spec `13` (wizard: hoy no hay caso de cierre menor) y `24:522` (mensaje de superposición, si el texto cambia). Nuevos: spec de edición API, spec de edición UI (Dueño y Empleado), spec de cambio programado ("rige mañana").
- **Newman:** `build-matriz-comercio-postman.mjs:275-276` invierte su expectativa (cierre igual y anterior pasan a ser válidos o a depender de la pregunta 1); `build-multicomercio-tramo6a-postman.mjs` (carpeta 53, 20 menciones de horarios), `build-multicomercio-tramo3a-postman.mjs:250` (superpuestos) y los constructores `2a`, `E2`, `registro-comercio-fase1` registran horarios y no cambian. Carpeta nueva.
- **Estreses:** los 18 scripts registran `00:00`–`23:59` del día y no cambian. Nuevo estrés de edición de horarios contra cerrar/abrir, reapertura, aceptar pedido y edición de precio.

**e) Concurrencia.** La edición es una escritura del comercio: `usuario` (S) → `empleado_comercio` (S, si es Empleado) → `comercio` `FOR UPDATE` directo → filas de `horario` → `historial_edicion_comercio`. Es exactamente el patrón de `editarDatosOperativos`, `cerrar` y `abrir`; **leer el comercio con bloqueo compartido y subirlo a exclusivo reproduce el interbloqueo de A2 (126 `Deadlock found`)**, así que se toma `FOR UPDATE` desde la primera lectura y `iniciarEscritura` va primero. Con eso la edición se serializa contra `cerrar`/`abrir`, contra la reapertura (que toma `comercio` `FOR UPDATE`) y contra otra edición. Contra el pago y el guard de precios no hay cruce de bloqueos: leen sin bloqueo y las filas son insert-only más un `UPDATE` de `vigente_hasta` en filas que siguen valiendo hoy; la foto de una lectura siempre es coherente.

Riesgo real de **semántica**, no de bloqueos: un turno que empieza hoy y cruza la medianoche (`20:00`–`02:00`) sigue vigente bajo la versión vieja hasta las 02:00 de mañana, mientras la versión nueva ya rige desde las 00:00 de mañana. Si la nueva tiene una franja mañana `01:00`–`05:00` se solapan sin que ninguna validación lo vea (cada versión es válida por sí sola). Recomiendo validar la **cola de los turnos de hoy contra las filas nuevas de mañana** y rechazar el cambio con un mensaje claro (pregunta 3).

**f) Preguntas abiertas.** 1 (cierre igual a apertura), 2 (convención 23:59), 3 (cola de turnos que cruzan contra versión nueva). Respuestas recomendadas en la sección 9.

---

## 3. Punto 11: facturación por turno

**a) Qué existe hoy.** `PedidoService`: `ESTADOS_FACTURADOS` (`:137-139`: `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `NO_RETIRADO`), `obtenerResumenHoy` (`:735-742`, neto) y `obtenerResumenHoyEmpleado` (`:744-751`, bruto), `pedidosLlegadosPagadosHoy` (`:753-764`: **carga todos los pedidos pagados del comercio** con `findLlegadosPagadosByComercioId` y filtra el día en Java), `fechasPagoAprobado` (`:1041-1051`). `confirmarPagoAprobado` (`:260-282`) cambia el estado, escribe el historial con `LocalDateTime.now(clock).truncatedTo(SECONDS)` (`registrarHistorial`, `:1009-1018`) y no guarda la fecha del pago en el pedido. Tabla `pedido` (`V1:343-372`): índices `idx_pedido_cliente`, `idx_pedido_comercio`, `idx_pedido_estado`, `idx_pedido_fecha_creacion`.

**b) Qué cambiar, capa por capa.**

- **Entidad `Pedido`:** `fechaPagoConfirmado`, `turnoFecha`, `turnoHorarioId` (nulos).
- **`PedidoService.confirmarPagoAprobado`:** después de `setEstado`, estampar los tres campos con **un solo** `LocalDateTime` del `Clock` (el mismo que usa el historial, para que `fecha_pago_confirmado` y la fila del historial no difieran), dentro de la transacción que ya tiene el pedido `FOR UPDATE`. Regla de asignación:
  1. `turnoDe(horarios, instante)` → ese turno.
  2. Si no hay (pago fuera de toda franja) → `ultimoTurnoTerminado(horarios, instante, 7)`.
  3. Si tampoco → `turnoFecha`/`turnoHorarioId` quedan `NULL` (el panel los agrupa por día de `fecha_pago_confirmado`).
- **Resumen:** reemplazar `resumen-hoy` por `resumen-turno` (recomendación: nombres de campo nuevos, sin compatibilidad; no hay consumidores externos). Contenido: el turno (`fecha`, `inicio`, `fin`, `estado` `EN_CURSO` / `TERMINADO` / `SIN_TURNO`), `vendido` (bruto: suma de `subtotal` de los pedidos facturables del turno), `cantidadPedidos`, `cantidadPendientes`. Solo para el Dueño: `comision` (suma de `cargoServicioComercio`) y `neto` (`vendido - comision`). El Empleado recibe un DTO sin `comision` ni `neto`, como hoy (`ResumenPedidosHoyEmpleadoResponseDTO` ya es un DTO aparte; `PedidoServiceVistaEmpleadoTest:262` fija su conjunto de campos).
- **Qué turno muestra el panel:** el turno en curso; entre turnos, el último terminado, rotulado como tal. **`cantidadPendientes` debe contar los pendientes del comercio sin filtrar por turno**: un pedido pendiente del turno anterior no puede desaparecer del contador al cambiar de turno (hoy el contador es "de hoy"; con turno, un filtro por turno escondería pedidos sin responder).
- **Consulta:** agregación en la base (`SUM(subtotal)`, `SUM(cargo_servicio_comercio)`, `COUNT(*)` con `WHERE comercio_id = ? AND turno_fecha = ? AND turno_horario_id = ? AND estado IN (facturables)`), en vez de cargar entidades. Elimina el costo creciente de `pedidosLlegadosPagadosHoy`.
- **Frontend:** `js/comercio.js:84-91` (`normalizarResumen`: `etiquetaVentas` `'Ventas de hoy'` / `'Facturado hoy'` desaparece), `:487-505` (`renderMetricas`), `:670` (la llamada); `comercio-dashboard.html:21` (`data-testid="metricas-dashboard"`). Rótulos: "Vendido en el turno" para los dos roles; el Dueño suma "Comisión" y "Neto del turno" como segunda línea. "Pedidos hoy" pasa a "Pedidos del turno".
- **Retiro de lo viejo:** `ResumenPedidosHoyResponseDTO` y `ResumenPedidosHoyEmpleadoResponseDTO` (el Javadoc del primero está desactualizado: dice que solo cuenta `EN_PREPARACION`).

**c) Migraciones y riesgo con datos.**

- `V40`: `ALTER TABLE pedido ADD fecha_pago_confirmado datetime NULL, ADD turno_fecha date NULL, ADD turno_horario_id int NULL` (FK a `horario(id)`, sin cascada), e índices `(comercio_id, turno_fecha, turno_horario_id)` y `(comercio_id, fecha_pago_confirmado)`. Riesgo: `ALTER` sobre una tabla grande; en MariaDB 10.4 el `ADD COLUMN` nulo puede ser instantáneo y los índices se crean sin copiar la tabla, **no verificado contra la versión del servidor**.
- **Backfill:** `fecha_pago_confirmado` desde `historial_estado_pedido` con un `UPDATE ... JOIN (SELECT pedido_id, MIN(fecha_hora) ... WHERE estado = 'PENDIENTE_CONFIRMACION_COMERCIO' GROUP BY pedido_id)`, igual que hoy (`HistorialEstadoPedidoRepository.findPrimeraEntradaAEstadoPorPedido`). No cuenta el literal viejo `PENDIENTE` (queda en el ENUM por `V6`); es la misma regla que ya usan `findLlegadosPagadosByComercioId` y `llegoPagado`.
- `turno_*` del backfill: las filas actuales de `horario` valen para cualquier fecha pasada porque nunca hubo edición de un comercio aprobado (la corrección borra y recarga solo en rechazados, que no tienen pedidos). Recomiendo **no hacerlo en SQL** (cruce de medianoche, vuelta de semana, "último turno terminado" en SQL son fáciles de equivocar y duplican la lógica): un proceso de una sola vez en Java que use `DisponibilidadComercioService.turnoDe` y `ultimoTurnoTerminado`, idempotente (`WHERE turno_fecha IS NULL AND fecha_pago_confirmado IS NOT NULL`), apagado en el perfil `test`. Los que no se puedan asignar quedan `NULL`.
- Riesgo con datos: pedidos con un pago fuera de todo turno histórico, o de comercios sin franjas, quedan `NULL`. Es esperado y se agrupan por día.

**d) Impacto exacto en tests.** Sección 4.4 (lista completa).

**e) Concurrencia.** Bajo. El estampado ocurre dentro de `confirmarPagoAprobado`, que ya toma `bloquearParaActualizarConEquipo` (usuarios → relaciones → pedido `FOR UPDATE`); el resto del flujo (webhook, sincronización, atajo de test) pasa por ahí. Lee `horario` sin bloqueo. `fk_pedido_turno_horario` agrega una lectura bloqueante compartida de la fila de `horario` al hacer `UPDATE pedido`: es una hoja debajo de `comercio`, nadie la toma antes que el pedido ni escribe `horario` teniendo un pedido, y la edición solo cierra/inserta filas (no hay `DELETE` de filas con pedidos), así que no hay ciclo. **Limpieza SQL:** `postman/limpiar-datos-postman.sql:64` hace `DELETE FROM horario` y fallaría si quedaran pedidos que lo referencian; hay que borrar antes los pedidos de esos comercios (la limpieza ya borra pedidos; verificar el orden al implementar).

**f) Preguntas abiertas.** 4 (pago fuera de franja y ventana de búsqueda), 9 (qué muestra el panel entre turnos), 10 (backfill en Java), 12 (nombres de campo nuevos).

---

## 4. Reemplazo de "Facturado hoy" por "Vendido en el turno"

### 4.1 Todos los lugares que lo muestran o lo comparan

**Backend (`backend/src/main`):** `PedidoService.java:137` (lista de estados), `:735-764`; `PedidoController.java:123-128` (`GET /comercio/resumen-hoy`, ramifica por `ComercioActivo.esEmpleado()`); `config/security/DelegacionEmpleado.java:29`; DTO `ResumenPedidosHoyResponseDTO` y `ResumenPedidosHoyEmpleadoResponseDTO`.

**Frontend:** `js/comercio.js:87-89` (`normalizarResumen`), `:490-491` (`renderMetricas`), `:670`; `comercio-dashboard.html:21`.

### 4.2 Qué pasa con la ruta

Recomiendo una ruta nueva `GET /api/v1/pedidos/comercio/resumen-turno` (delegable) en lugar de renombrar los campos de `resumen-hoy`; la ruta vieja se elimina. Es un cambio de contrato que toca los tests de 4.4, pero los deja con un nombre honesto. Alternativa más barata: dejar la ruta y los nombres `totalFacturadoHoy`/`cantidadPedidosHoy` con otro significado; la desaconsejo porque `Hoy` pasaría a mentir en el JSON y en los tests de 4.4.

### 4.3 Qué cambia en lo que ve cada rol

| | Hoy | Después |
|---|---|---|
| Dueño | "Facturado hoy" = neto del día | "Vendido en el turno" (bruto) + "Comisión" + "Neto del turno" |
| Empleado | "Ventas de hoy" = bruto del día | "Vendido en el turno" (bruto), sin comisión ni neto |
| Mail y estadísticas | no existen | bruto, comisión y neto, solo Dueño |

### 4.4 Tests que lo muestran o lo comparan (con archivo y línea)

- **Java:** `PedidoNoRetiradoServiceTest.java:425-426` (neto `9900` y bruto `10000`); `PedidoNoRetiradoHttpIntegrationTest.java:324-334` (cuatro lecturas de `resumen-hoy`, Dueño y Empleado, antes y después de cerrar como no retirado); `PedidoServiceVistaEmpleadoTest.java:253-269` (conjunto de campos del Empleado, línea 262); `ClasificacionRutasComercioTest.java:68` (la ruta).
- **Playwright:** `21-multicomercio-tramo1.spec.ts:131,158-160,206,328-331` (`cantidadPedidosHoy`); `37-empleado-acceso-api.spec.ts:87,127,326,452-475` (`CAMPOS_RESUMEN`, bruto vs neto, `ESTADOS_FACTURADOS`); `38-empleado-acceso-ui.spec.ts:430-472,1087,1129` (rótulos "Ventas de hoy" / "Facturado hoy", `metricas-dashboard`); `47-pedidos-no-retirado-api.spec.ts:236-239`; `50-empleado-matriz-delegable-api.spec.ts:59` y `59-equipo-gestion-empleado-ui.spec.ts:591` (solo nombran la ruta).
- **Newman (constructores):** `build-empleado-tramoE2-postman.mjs` (10 menciones), `build-multicomercio-tramo1-postman.mjs` (5), `build-pedidos-no-retirado-tramoE3-A4b-postman.mjs` (3), `build-empleado-tramoE3-A5-postman.mjs` (1, carpeta 66, la matriz de rutas delegables). La colección `postman/Bajonea-MVP.postman_collection.json` tiene 68 coincidencias, todas generadas por esos constructores.
- **Estreses:** `stress-locks-empleado-e2.mjs` y `stress-locks-tramoE3-A4b.mjs` (una mención cada uno).
- **Docs que citan el rótulo:** `CLAUDE.md` (8), `docs/entregables-01-02/requisitos-funcionales-empleado.md`, `requisitos-funcionales-comercio.md`, `CAMBIOS.md`.

---

## 5. Punto 12: precios no modificables dentro de una franja

**a) Qué existe hoy.**

- **Un único camino de escritura del precio:** `PUT /api/v1/productos/{id}` → `ProductoService.editarProducto` (`ProductoService.java:98-150`; el cambio se detecta en `:124` con `compareTo` y se escribe en `:136`). El alta fija el precio inicial (`:85`) y queda libre. `PATCH .../estado`, imágenes y firmas no tocan el precio. Es delegable: lo usan el Dueño y el Empleado.
- **El carrito no guarda el precio.** `item_carrito` no tiene columna de precio; `CarritoService.java:245-250` y `PedidoService.confirmarPedido` (`:198-208`) leen `producto.getPrecio()` vigente. O sea que "se cobra el precio vigente" ya ocurre; falta el aviso. El pedido sí guarda el precio: `DetallePedido.precioUnitario` (`:240`), así que un cambio de precio posterior no toca pedidos existentes.
- `PedidoRequestDTO` solo tiene `tipoEntrega` y `direccionId`; no existe `totalEsperado` ni `precioVisto` en ningún archivo.

**b) Qué cambiar, capa por capa.**

- **Guard:** en `ProductoService.editarProducto`, solo si el precio cambió y **al final de las validaciones de estado** (después del guard de suspensión del Empleado y de "descontinuado"), consultar `DisponibilidadComercioService.dentroDeFranja(horarios, ahora)`; `409` con `ConflictoComercioException` y código `PRECIO_BLOQUEADO_EN_FRANJA`, mensaje sin nombres internos: "No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario." Mismo guard para Dueño y Empleado. Es franja pura: no mira `cerrado_manualmente` ni el estado del comercio. Orden: tiene que ir **después** de los guards existentes porque `42-empleado-escrituras-api.spec.ts:253` y `:490` mandan `precio` distinto esperando `409 COMERCIO_SUSPENDIDO` o `404`; si el guard de franja fuera primero taparía esos códigos.
- **Aviso de cambio de precio:** `item_carrito.precio_visto decimal(10,2) NULL`, estampado al agregar y al cambiar cantidad (`CarritoService.agregarItem`, bajo el bloqueo del carrito que ya existe); `CarritoResponseDTO` devuelve por ítem `precioCambio` (`true` si `precio_visto` difiere del vigente) y el nuevo total; `PedidoRequestDTO.totalEsperado`; `confirmarPedido` compara con `subtotal + cargo` ya calculado y responde `409` `PRECIO_CAMBIO` con los montos nuevos si difiere.
- **Frontend:** `js/comercio.js` y el formulario de producto (mostrar el `409` con `mostrarAvisoFijo`, ya existe para los `409` de reglas del comercio); `js/carrito.js:323` y `js/checkout.js:110,372` (aviso, nuevo total, reconfirmación y envío de `totalEsperado`). Opcional: deshabilitar el campo precio con "Se puede cambiar fuera de tu horario".

**c) Migraciones.** `V42`: `ALTER TABLE item_carrito ADD COLUMN precio_visto decimal(10,2) NULL`. Sin riesgo con datos: los carritos existentes quedan sin aviso. Cuidado futuro: `item_carrito_extra` no tiene `ON DELETE CASCADE` (aviso ya documentado en `CLAUDE.md` para el bloque de Extras); no afecta a esta columna.

**d) Impacto exacto en tests.** Ver 5.5.

**e) Concurrencia.** El guard corre con el producto ya bloqueado (`usuario` → relación → `comercio` `S` → `producto` `X`, orden de A5b) y lee `horario` sin bloqueo: sin bloqueos nuevos. Además hay una exclusión natural en el tiempo: los pedidos solo se aceptan dentro de una franja (`validarAceptaPedidos`) y el precio solo se cambia fuera de ella, así que la carrera "cambio el precio mientras el Cliente confirma" queda reducida a la ventana de una edición hecha un instante antes de que la franja abra. `totalEsperado` se compara dentro de la transacción de `confirmarPedido`, con los productos leídos como hoy. Riesgo residual: un carrito armado ayer y confirmado hoy tras una edición nocturna del precio, que es justo lo que cubre el aviso.

**f) Preguntas abiertas.** 8 (`totalEsperado` opcional u obligatorio), 11 (qué hacer con la suspensión y el cierre temporal por bloqueo de cuenta: la franja pura los trata igual).

### 5.5 El reloj en tests y cuántos tests editan precio hoy

**El problema.** `Clock` es un bean `Clock.system(zona)` (`ClockConfig`) y Playwright, Newman y los estreses golpean un backend real que no se puede mover en el tiempo. Los comercios de toda la suite tienen una franja `00:00`–`23:59` **de hoy** (`helpers/backend.ts:731`, `helpers/multicomercio.ts:36`): si el guard está siempre encendido, **todo test que cambie un precio recibe `409` el día entero.**

**Tests que cambian un precio hoy** (observados; hay llamadas escondidas en helpers y en `precio` aleatorio de los estreses, así que el conteo exacto no está verificado):

| Capa | Dónde |
|---|---|
| Playwright API | `42-empleado-escrituras-api.spec.ts:131` (200 esperado), `:253` y `:490` (esperan `409`/`404` previos al guard); `50-empleado-matriz-delegable-api.spec.ts:62` y `:124` (matriz: 200 para el Empleado); `51-catalogo-orden-bloqueo-api.spec.ts:185` (ráfagas); `21-multicomercio-tramo1.spec.ts:248` (404 cruzado, no se ve afectado) |
| Playwright UI | `06-crud-productos.spec.ts:155` (editar nombre y precio), `53-empleado-edicion-ui.spec.ts:294,312,372`; `15-crud-productos-validaciones.spec.ts` (solo valida el input) |
| Java | `EscriturasEmpleadoIntegrationTest.java:208,347`, `EscriturasCatalogoOrdenDeBloqueoIntegrationTest.java:179,212`, `HistorialEdicionComercioIntegrationTest.java:150-190`, `PertenenciaCruzadaDelegablesIntegrationTest.java:186` |
| Newman (constructores) | `build-empleado-tramoE3-A1-postman.mjs:88-89`, `-A2-postman.mjs:264,441`, `-A5-postman.mjs:259,284`, `build-catalogo-orden-tramoE3-A5b-postman.mjs:262`, `build-multicomercio-tramo1-postman.mjs:278` |
| Estreses | `stress-locks-tramoE3-A1.mjs:126`, `-A2.mjs:224`, `-A2b.mjs:298,359`, `-A3.mjs:224`, `-A5.mjs:226,302,416`: **editan con precio aleatorio en cada ráfaga** |

**Recomendación (1 + 2 de la auditoría anterior, concretada):**

1. **Propiedad `precio.bloqueo-en-franja.habilitado`**, por defecto `true`, en `false` en `application-test.properties`, expuesta como un `@ConfigurationProperties` con setter (igual que `PedidoTimeoutProperties`) para que los tests Java la den vuelta **sin crear un contexto nuevo**. Con eso ninguna de las filas de la tabla cambia.
2. **Atajo `PUT /api/v1/test/precio-bloqueo?habilitado=`** en `TestController` (`@Profile("test")`, cubierto por los tests de "atajos fuera del perfil") para encender el guard en un spec dedicado; ese spec lo deja apagado en `afterAll`. Con `workers: 1` no hay interferencia entre specs.
3. **Spec dedicado con reloj real y franja calculada alrededor de ahora**, usando `tests/helpers/zona.ts` (`hoyEnZona`, `fechaHoraSqlEnZona`): se registra un comercio con una franja que contiene el instante (`ahora - 30 min` a `ahora + 30 min`; como la franja puede cruzar la medianoche, esto **requiere el punto 13 hecho**: hoy no se puede cargar una franja `23:50`–`00:20`) y otro con una franja que no lo contiene (`ahora + 2 h` a `ahora + 3 h`). Casos: precio distinto en franja → `409 PRECIO_BLOQUEADO_EN_FRANJA` (Dueño y Empleado); mismo precio y otros campos en franja → `200`; fuera de franja → `200`; con `cerrado_manualmente = 1` dentro de franja → sigue `409`; alta de producto en franja → `201`; comercio sin franjas → `200`.
4. **Java:** `DisponibilidadComercioServiceTest` ya usa un `Clock` fijo; el test del guard igual, sin tocar la propiedad global.

Un reloj mutable inyectable a nivel aplicación toca unos 100 usos (`ClockConfig`, `PedidoService`, `DisponibilidadComercioService`, jobs, `MercadoPagoPagoService`) y no da más cobertura.

---

## 6. Punto 9: email por turno cerrado

**a) Qué existe hoy.** `EmailService` (Resend): cinco métodos transaccionales, todos de texto plano y todos por `enviarTextoPlano` (`:110-131`), que **captura `ResendException` y `RuntimeException` y solo hace `log.warn`**: no devuelve resultado, no reintenta. Con `email.envio-habilitado=false` (perfil `test`) solo registra el destinatario y el asunto. `EjecucionPostCommit` (`util/`) manda el email después del commit. Jobs `@Scheduled`: `PedidoSchedulerService` ×4, `ReaperturaComerciosJob`, `InvitacionVencimientoJob`.

**b) Qué cambiar.**

- **Tabla `cierre_turno`** (`V41`): `id`, `comercio_id`, `turno_fecha`, `horario_id`, `inicio`, `fin`, `cantidad_pedidos`, `vendido`, `comision`, `neto`, `pendientes_al_cierre`, `fecha_cierre`, `email_estado` (`PENDIENTE`/`ENVIANDO`/`ENVIADO`/`FALLIDO`/`OMITIDO`), `email_intentos`, `email_proximo_intento`, `email_ultimo_error`; `UNIQUE (comercio_id, turno_fecha, horario_id)`.
- **`CierreTurnoService`** (calcula y persiste la foto, una transacción por comercio y turno) y **`CierreTurnoJob`** (`@Scheduled(fixedDelay = 60_000)`, bandera `turno.cierre.job-habilitado` en `false` en `application-test.properties`, `abrirYCerrarTurnos(LocalDateTime ahora)` público para los tests, igual que `ReaperturaComerciosJob.reabrirComerciosVencidos(LocalDateTime)`). Endpoint de test `POST /api/v1/test/jobs/cierre-turnos?ahora=`.
- **Selección de turnos por cerrar:** por cada comercio con franjas (cualquier estado excepto los que nunca vendieron: `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO`), turnos de los últimos 3 días cuyo `fin + gracia` ya pasó y que no tienen fila en `cierre_turno` (se pone al día si el backend estuvo caído). Se genera aunque el total sea 0.
- **`EmailService.enviarResumenTurno(...)`** que **devuelva el resultado** (`ENVIADO`, `FALLIDO` con el error, `DESHABILITADO` en el perfil `test`); los cinco métodos existentes se dejan como están.
- **Contenido:** a nombre del Dueño, un mensaje por corrida del job con todos los turnos del Dueño que cerraron y están en `PENDIENTE`, con una sección por comercio (bruto, comisión, neto, cantidad de pedidos, pendientes sin resolver). Si el Dueño tiene un solo comercio es lo normal: un mail por cierre. Destinatario: el email de la cuenta del Dueño (`usuario.email`); si la cuenta no está `ACTIVO`, el cierre queda `OMITIDO`.
- **Reintentos:** `PENDIENTE` → `ENVIANDO` con `UPDATE ... WHERE id = ? AND email_estado = 'PENDIENTE'` (por clave primaria: gana quien afecta una fila); ante falla vuelve a `PENDIENTE`, `email_intentos + 1`, `email_proximo_intento` con retroceso (10, 30 y 60 minutos), `email_ultimo_error`; superado el tope (5) queda `FALLIDO` con `log.error`. Una falla de Resend **nunca** bloquea el cierre persistido ni a los demás Dueños: cada Dueño se procesa en su propio `try/catch`.
- **Gracia** configurable, y esperar a que no queden pedidos `PENDIENTE_PAGO` creados antes del `fin` del turno (pregunta 5). Sin la gracia, un pago confirmado a las 22:59:58 que hace commit a las 23:00:03, o uno que entra 10 minutos después de cerrar (la preferencia vence a los 30), queda fuera de la foto y el email **no coincide** con el panel.

**c) Migraciones.** `V41` (`cierre_turno`). Sin riesgo con datos. `UNIQUE` con `INSERT ... ON DUPLICATE KEY UPDATE` (patrón de `CarritoInsercionRepository`) para ser idempotente con dos instancias.

**d) Impacto en tests.** Aditivo: `EmailServiceTest` crece; Java nuevos (`CierreTurnoServiceTest`, un integration test con hilos para dos corridas simultáneas, reintentos con un `Resend` simulado); un spec de API que ejecuta el atajo y lee `cierre_turno` por un endpoint de test (Playwright no puede leer el mail) y una carpeta de Newman; ninguna pantalla. Dependen de este tramo: `application-test.properties` (bandera nueva).

**e) Concurrencia.** El job no escribe sobre `pedido`. Lee con una sola consulta agregada bajo REPEATABLE READ (sin bloqueos) y escribe `cierre_turno`, cuyas claves foráneas (`comercio`, `horario`) toman bloqueos compartidos sobre hojas: es la primera instrucción de su transacción, no sostiene otros bloqueos, y la edición de horarios (`comercio` X → `horario`) y la suspensión (`comercio` X) solo esperan unos milisegundos. Orden respetado (`comercio` → `horario` → `cierre_turno`). Al-menos-una-vez: un proceso caído entre el envío y el `UPDATE` a `ENVIADO` repite el mensaje; se acepta. El reclamo por clave primaria evita los bloqueos de rango (`index_merge` de `empleado_comercio`, ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md`).

**f) Preguntas abiertas.** 5 (gracia y pendientes al cierre), 6 (un mail por corrida y Dueño), 7 (cuenta del Dueño no `ACTIVO`), 14 (una instancia o varias en producción).

---

## 7. Punto 8: estadísticas del Dueño

**a) Qué existe hoy.** `resumen-hoy` (ver 4), `ActividadComercioService` (lista por cursor de pedidos, ediciones, cierres y equipo, sin agregados), `MetricasAdminResponseDTO` (conteos del Administrador). No hay estadística por rango ni librería de gráficos (frontend vanilla). `findLlegadosPagadosByComercioId` carga entidades completas.

**b) Qué cambiar.**

- **Backend:** `EstadisticasComercioService` con consultas de agregación nativas sobre `pedido` (y no sobre entidades): `GET /api/v1/comercios/estadisticas?desde=&hasta=&agrupar=TURNO|DIA`, **solo Dueño y fuera de `DelegacionEmpleado`** (`exclusivo(...)` en `ClasificacionRutasComercioTest`; usa `X-Comercio-Id` como el resto de la operación del Dueño, así que es por comercio, no por Dueño).
- **Contenido mínimo** (flujo de pedidos y cuánto fue ganando): por turno o por día, cantidad de pedidos por estado final (entregados, rechazados, expirados, cancelados, anulados, no retirados), `vendido`, `comision` y `neto` de los facturables, y ticket promedio. Los pedidos con `turno_fecha` nulo se agrupan por `DATE(fecha_pago_confirmado)`.
- **Consultas:** `WHERE comercio_id = ? AND turno_fecha BETWEEN ? AND ? GROUP BY turno_fecha, turno_horario_id` y `GROUP BY estado`, servidas por el índice `(comercio_id, turno_fecha, turno_horario_id)` de `V40`. Rango máximo (recomiendo 92 días) y `400` si se pasa.
- **Frontend:** `comercio-estadisticas.html` + `js/estadisticas.js`, solo para `esContextoDueno()` (el Empleado no ve la fila de acceso, igual que "Ver equipo"); barras en CSS/SVG a mano, sin dependencias; dos rangos fijos (últimos 7 y 30 días) y el selector turno/día. Entrada desde el perfil del Dueño. Nuevo data-testid por componente.

**c) Migraciones.** Ninguna propia: viaja con `V40` (columnas e índices del punto 11). Es la razón por la que 8 depende de 11.

**d) Impacto en tests.** Aditivo: spec de API (agregados contra datos conocidos, Dueño sí, Empleado `403`, Administrador `403`, comercio ajeno `404`), spec de UI, `ClasificacionRutasComercioTest`, test Java del servicio, carpeta de Newman. Con 30000 pedidos sintéticos medir las consultas (el método de `docs/LISTA-DE-DESPLIEGUE.md` §7).

**e) Concurrencia.** Lecturas puras sin bloqueos; no toman `pedido`. Una estadística nunca ve un cierre a medias porque `cierre_turno` es insert-only y las agregaciones leen `pedido` directamente.

**f) Preguntas abiertas.** 12, 15 (si las estadísticas por comercio son suficientes frente a "todos mis comercios").

---

## 8. Qué pasa con los comercios sin franjas

- **Registro y corrección:** no pueden quedar sin franjas (`RegistroComercioRequestDTO.horarios` es `@NotEmpty`). La edición nueva también rechaza la lista vacía con `400`.
- **Hoy, si ocurre por SQL o por un dato viejo:** `dentroDeFranja` es `false` siempre; el comercio nunca acepta pedidos ni puede cerrar/abrir (`409 FUERA_DE_HORARIO`); el catálogo lo muestra `CERRADO_HORARIO` sin texto de reapertura; y si estaba cerrado a mano **queda cerrado para siempre**: `CierreComercioService.reabrirSiVencido` (`:119-123`) devuelve `false` cuando `proximoInicioDeFranja` es vacío. Es un hueco existente, chico, que conviene cerrar en el tramo del punto 13 (reabrir y avisar en el log, como ya hace la rama sin fila `CERRADO`).
- **Con los turnos:** no hay turno que cerrar ni mail; el panel dice "Sin horario cargado"; los pedidos pagados (si los hubiera) quedan con `turno_*` nulo y se agrupan por día; `ultimoTurnoTerminado` devuelve vacío.
- **Versionado:** la edición mantiene siempre al menos una fila vigente en cada fecha (cierra las viejas en `hoy` y abre las nuevas en `mañana`), así que no puede producir un día sin franjas.

---

## 9. Preguntas abiertas para Diego, con recomendación

1. **¿`hora_cierre = hora_apertura` es una franja de 24 horas o un error?** Recomiendo **rechazarla** (un error de tipeo no debería abrir 24 horas) y que "24 horas" siga siendo `00:00`–`23:59` (o `00:00`–`00:00` entendido como cierre a medianoche, que sí es menor-o-igual a cualquier apertura posterior). El prompt dice "menor o igual"; con rechazo del igual queda "menor" en la práctica.
2. **¿Se conserva la convención `23:59` = `24:00` para franjas que no cruzan?** Recomiendo **sí** (sección 1.2).
3. **¿Qué hacer cuando la cola de un turno que cruza (de la versión vieja) se solapa con una franja de la versión nueva de mañana?** Recomiendo **rechazar la edición** con un mensaje que nombre el turno ("Tu turno de hoy termina a las 02:00 de mañana"). Alternativa: correr la vigencia al día siguiente de esa cola, que hace que el cambio "rija desde pasado mañana" y complica la explicación.
4. **Pago fuera de toda franja:** recomiendo asignarlo al **último turno terminado dentro de 7 días**; si no hay, `NULL` y se agrupa por día.
5. **Gracia del cierre y pedidos sin resolver:** recomiendo `turno.cierre.gracia-minutos = 30` (igual al vencimiento de la preferencia de pago) más **esperar a que no queden pedidos `PENDIENTE_PAGO` creados antes del fin**; los `PENDIENTE_CONFIRMACION_COMERCIO` que sigan sin resolverse al cierre se informan como "pendientes al cierre", fuera del neto, y la foto no se vuelve a calcular. Sin esto el mail y el panel difieren.
6. **Un mail por corrida y por Dueño** con todos los cierres pendientes, desglosado por comercio (lo normal: un comercio por mail), enviado aunque el total sea 0. El prompt dice "uno por cierre de turno" y "desglose por comercio": las dos cosas se cumplen así. Con un comercio que tiene turno de mediodía y de noche son 2 mails diarios.
7. **Cuenta del Dueño no `ACTIVO` (bloqueada, inactiva):** recomiendo `OMITIDO` (no se envía y queda registrado).
8. **`totalEsperado` obligatorio u opcional en `POST /pedidos/cliente`:** recomiendo **opcional en la API** (`null` = no se compara) y que el frontend **siempre** lo mande. Hacerlo obligatorio rompe `crearPedido` (`helpers/backend.ts:562`) y 65 llamadas en 39 archivos de tests y builders, y 3 clases Java de pedidos.
9. **Qué muestra el panel entre turnos:** el último turno terminado, rotulado, y **"Pendientes" cuenta todos los pendientes del comercio**, no los del turno.
10. **Backfill de `turno_*`:** en Java (proceso de una sola vez que reutiliza `turnoDe`), no en SQL.
11. **Bloqueo de precios con el comercio `SUSPENDIDO`/`CERRADO_TEMPORALMENTE`:** recomiendo franja pura (se bloquea igual): es lo que se pidió y no hay motivo para distinguir.
12. **Nombres de campo:** recomiendo `resumen-turno` con campos nuevos y eliminar `resumen-hoy`, en vez de reinterpretar `totalFacturadoHoy`.
13. **`ReaperturaComerciosJob` sin bandera:** conviene sumarla (`comercio.reapertura.job-habilitado`) aunque sea ajeno a la cadena, porque el spec de turnos va a depender de reaperturas deterministas.
14. **¿Producción corre una o varias instancias del backend?** Con una sola, el reclamo del email por clave primaria sobra; con varias es necesario. Está implementado igual; solo cambia cuánto estrés de varias corridas simultáneas hay que justificar.
15. **Estadísticas:** ¿por comercio (como hoy el resto del panel, con `X-Comercio-Id`) o también un total del Dueño? Recomiendo **por comercio** en esta fase.

---

## 10. Tamaño real del trabajo y orden recomendado

Piezas, no tiempos. A = backend y tests (mvnw, Playwright de API, Newman, estrés); B = pantallas y tests de UI.

| Tramo | Punto | A | B |
|---|---|---|---|
| T1 | 13 Modelo de turno y edición de horarios | `V38`, `V39` (con revisión manual previa), `Horario`, `HorarioRepository`, validador circular, `DisponibilidadComercioService` reescrito, `HorarioEdicionService`, ruta `PUT /comercios/perfil/horarios` + `DelegacionEmpleado` + `ClasificacionRutasComercioTest`, DTO con `cruzaMedianoche` y pendientes, actividad, lecturas de los 12 lugares de 1.4; Java (≈ 6 clases tocadas, 4 nuevas), spec nuevo, carpeta Newman nueva, estrés nuevo | `comercio-form.js` (cruce, superposición circular, mensajes), vista "Editar horarios" (Dueño y Empleado), `catalogo.js`, `admin.js`; spec UI nuevo |
| T2 | 11 + 4 Pedido por turno, resumen, "Vendido en el turno" | `V40` (columnas, índices, backfill de fecha), estampado en `confirmarPagoAprobado`, proceso de backfill de turno, `resumen-turno`, DTO nuevos, borrado de los viejos; tests de 4.4 reescritos; spec y carpeta nuevos; atajo de test con `fechaPago` | `comercio.js` y `comercio-dashboard.html`; specs `38` ajustado |
| T3 | 12 Precios | propiedad + atajo de test, guard en `editarProducto`, `V42`, `precioCambio` y `totalEsperado`, spec dedicado; ninguna fila de 5.5 cambia con la propiedad apagada | aviso en carrito y checkout, `409` del formulario de producto |
| T4 | 9 Email por cierre de turno | `V41`, `CierreTurno*`, `EmailService.enviarResumenTurno` con resultado, job con bandera, atajos, reintentos; Java con hilos y `Resend` simulado; spec y carpeta | ninguna |
| T5 | 8 Estadísticas | `EstadisticasComercioService`, ruta exclusiva del Dueño, tests, medición con 30000 pedidos | `comercio-estadisticas.html` y `js/estadisticas.js`; spec UI |

**Orden recomendado dentro de la cadena:** T1 → T2 → T3 → T4 → T5.

- T1 primero porque todo lee "franja" y "turno" de ahí, y porque el spec dedicado del bloqueo de precios (T3) necesita poder cargar una franja que cruce la medianoche.
- T2 antes que T4 y T5: `cierre_turno` y las estadísticas leen las columnas de `pedido` que agrega `V40`.
- T3 puede ir antes que T2 sin costo (solo necesita el `dentroDeFranja` nuevo de T1); lo pongo después porque tiene el mayor arrastre de tests (la propiedad de test lo contiene, pero el spec dedicado y los cambios de carrito/checkout suman superficie) y conviene tener ya el panel por turno resuelto.
- Un riesgo temprano a reducir en T1: la revisión manual de la fusión `23:59` + `00:00` en `bajonea_practicas3` antes de aplicar `V39`.

**Estreses por tramo:** T1 (edición de horarios vs `cerrar`/`abrir` vs reapertura vs aceptar pedido vs edición de precio), T2 (pago vs edición de horarios), T4 (dos corridas del job, caída de Resend), T3 y T5 no toman locks nuevos (se cubren con tests y la medición de T5).

---

## 11. Archivos leídos, lo que no pude verificar

**Leí directamente unos 30 archivos** (varios de forma parcial, por rango): `CLAUDE.md`, `docs/AUDITORIA-ETAPA-FINAL.md` (puntos 8, 9, 11, 12, 13 y la sección 3), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (orden global y bloques A0 a A6), `DisponibilidadComercioService`, `Horario`, `HorarioRepository`, `CierreComercioService`, `ReaperturaComerciosJob`, `ValidadorDatosNegocioComercio`, `ComercioEdicionService`, `ComercioService`, `PedidoService`, `ProductoService`, `EmailService`, `ClockConfig`, `PedidoRepository`, `HistorialEstadoPedidoRepository`, `ComercioTextoLegible`, `TestSupportService`, `ClasificacionRutasComercioTest`, los enums `TipoEntidadEdicion` y `CampoCambioComercio`, `V1__baseline_bajonea_final.sql`, `V6__rename_pendiente...sql`, `application-test.properties`, `tests/helpers/zona.ts`, `frontend/js/comercio.js` (rangos) y `PedidoRequestDTO`. Otros 100 o más archivos los rastreé solo por búsqueda (rutas y líneas citadas); no los leí enteros.

**No pude verificar:**
- La versión real de MariaDB del servidor, el costo del `ALTER TABLE pedido` y si `ADD COLUMN`/índices son en línea; tampoco la expresión `GENERATED` de `V37` en ese motor (ajena a este tramo).
- Los datos reales de `bajonea_practicas3`: si existen pares `23:59` + `00:00` a fusionar, cuántos pedidos pagados quedarían sin turno, ni si hay comercios sin franjas.
- Los límites de tasa y de tamaño de Resend, y la reputación del remitente `info@bajonea.ar` para un envío diario por comercio.
- El conteo exacto de tests que cambian un precio: están los que vi y los que quedan escondidos tras helpers y `precio` aleatorio.
- La composición exacta de las carpetas de la colección de Newman (no abrí el JSON: trabajé desde los constructores).
- Si los tests Java corren bajo el perfil `test` (asumo que sí por el uso de `bajonea_test`; no lo confirmé en las anotaciones de cada clase).
- El código de `MisComerciosService`, `MisComerciosEmpleadoService`, `AdministradorService` y de las pantallas de perfil más allá de las líneas citadas.
- `docs/LISTA-DE-DESPLIEGUE.md` y `docs/APRENDIZAJES-TECNICOS.md`, que no leí en esta pasada.

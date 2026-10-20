# Plan del Tramo T1 de la Fase 2: modelo de turno y edición de horarios (2026-10-19)

Plan de trabajo, sin código todavía. Sale de `docs/AUDITORIA-FASE2-TURNOS.md` (secciones 1, 2, 8, 9 y 10; "aud. N" = sección N) y de las respuestas de Diego del 2026-10-19. Formato como el de `docs/PLAN-FASE1-REGISTRO-TRAMO2.md`: entrega A (backend, tests y estrés), entrega B (pantallas y tests de UI), checklist y un commit solo cuando Diego confirma. Este tramo cubre el punto 13 de la auditoría de la etapa final y deja listos los cimientos de T2 a T5 (pedido por turno, precios, email de cierre, estadísticas), que **no** entran acá.

Regla de este tramo, de `CLAUDE.md` §4.11: ningún `.html`, `.css`, `.js` ni `.ts` nuevo o tocado lleva comentarios.

---

## 0. Verificación previa (hecha hoy, solo lectura de código y docs)

No se tocó ninguna base. Lo que sale de leer el código:

| Pregunta | Resultado |
|---|---|
| Quién escribe `horario` hoy | Solo el alta (`RegistroService.java:235-243`), la corrección de un rechazado (`ComercioEdicionService.reemplazarHorarios`, `:169-198`, con `deleteAll` + `saveAll`) y `TestSupportService.java:195-203` (clon de prueba). No hay edición de un comercio aprobado |
| Dónde se lee | 12 lugares (aud. 1.4). Solo 4 clases de test Java stubean `horarioRepository.findByComercioId*` (9 stubs: `ComercioServiceValidarAceptaPedidosTest` 3, `CierreComercioServiceTest` 3, `ComercioEdicionServiceTest` 2, `ComercioServiceCatalogoPublicoTest` 1) y 6 construyen `Horario.builder()` |
| Orden del `ENUM dia_semana` | `'LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO'` (`V1:250`): `dia_semana + 0` da 1 a 7 en ese orden. La consulta de candidatos de la fusión lo usa; **la verifica Diego** al ejecutarla |
| Ningún dato de `datos-fase1.mjs` es candidato a fusión | Ninguna franja de demostración abre a las `00:00` (aud. 2.c) |
| Plantilla de la edición | `ComercioService.editarDatosOperativos` (`:111-138`): `iniciarEscritura` → comercio con `refresh(PESSIMISTIC_WRITE)` → `validarComercioModificable(actor, estado)` (solo bloquea al Empleado con `SUSPENDIDO`) → historial |
| Seguridad | `DelegacionEmpleado` tiene 23 rutas; `ClasificacionRutasComercioTest` las clasifica una por una y falla si falta alguna |
| Jobs | `ReaperturaComerciosJob.java:28` es el único `@Scheduled` sin bandera de habilitación (patrón a copiar: `InvitacionVencimientoJob`, `@Value(...:true)` en el constructor) |

Sin verificar, a propósito: el comportamiento del `CHECK` y de los índices compuestos de la `V38` en la 10.4.32 del servidor (se prueba al aplicar sobre `bajonea_test`, A1), y los datos de `practicas3` (los mira Diego con la consulta del anexo).

---

## 1. Decisiones fijadas que mandan en este tramo

| Tema | Decisión |
|---|---|
| Qué es un turno | Una fila `horario` por franja de atención; puede cruzar la medianoche. El día de la fila es el de apertura. Cruza si `hora_cierre < hora_apertura` |
| `cierre = apertura` | **Se rechaza** (`400`). "24 horas" se carga como `00:00` a `23:59` (resp. 1) |
| Convención `23:59` | Se conserva: para una franja que no cruza, `23:59` vale `24:00` (resp. 2). `00:00` como cierre de una franja que cruza vale medianoche, y las dos formas conviven |
| Vigencia | `vigente_desde` y `vigente_hasta` (inclusivo). Edición: cierra lo vigente con `vigente_hasta = hoy` e inserta lo nuevo con `vigente_desde = mañana`. Registro y corrección de un rechazado siguen inmediatos y sin versionado |
| Cola de un turno que cruza | **Se rechaza la edición** si la cola (la parte de mañana) de un turno de hoy se solapa con una franja de la versión nueva, con un mensaje que nombra el turno (resp. 3) |
| Quién edita | El Dueño y, por herencia, el Empleado (ruta delegable). Con el comercio `SUSPENDIDO` el Empleado recibe `409 COMERCIO_SUSPENDIDO`; con `CERRADO_TEMPORALMENTE` puede |
| Lista vacía | `400`: el comercio no puede quedar sin franjas |
| Fusión de pares `23:59` + `00:00` | Solo con la regla estricta de la aud. 2.c y **después de que Diego revise la consulta de candidatos** en phpMyAdmin. Yo no la corro sobre ninguna base |
| Bandera de la reapertura | `comercio.reapertura.job-habilitado` (`true` por defecto, `false` en el perfil `test`) (resp. 13) |
| Migraciones | `V38` (estructura). `V39` (fusión) solo si la consulta de Diego muestra candidatos; si no hay ninguno no se escribe y T2 sigue en `V40` (Flyway admite huecos) |
| Fuera del tramo | Columnas del pedido, resumen por turno, precios, email de cierre y estadísticas (T2 a T5) |

Cierres de T2 a T5 también respondidos por Diego (4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15): se recogen en sus propios planes, no se repiten acá.

---

## 2. Reglas de dominio que el tramo implementa

### 2.1 Validación de franjas (compartida por registro, alta adicional, corrección y edición)

1. Cada franja: `dia_semana`, `hora_apertura` y `hora_cierre` obligatorios; `cierre == apertura` → `400` "La hora de cierre no puede ser igual a la de apertura. Si atendés las 24 horas, cargá de 00:00 a 23:59." (campo `horarios`).
2. Expansión a la semana: cada franja se pasa a un intervalo `[inicio, fin)` en minutos desde el lunes 00:00 sobre una semana de 10080. Sin cruce: `fin = inicio + (cierre - apertura)`, con `cierre = 23:59` contado como 1440. Con cruce: `fin = inicio + (1440 - apertura) + cierre`. Una franja que cruza dura siempre menos de 24 horas.
3. Superposición entre **todas** las franjas, con vuelta de domingo a lunes (se comparan también con `± 10080`). Dentro del mismo día se mantiene el mensaje actual ("Ya tenés un horario cargado el X de A a B, que se superpone con este"); entre días distintos, un mensaje que nombra los dos turnos ("El turno del viernes de 20:00 a 02:00 se superpone con el del sábado de 01:00 a 05:00").
4. Adyacentes sin solapar siguen siendo válidas (`20:00`–`23:59` más `00:00`–`02:00` del día siguiente: dos turnos).

### 2.2 Edición versionada (`vigente_desde` / `vigente_hasta`)

Con el comercio tomado `FOR UPDATE`:
1. Se borran las filas **pendientes** (`vigente_desde > hoy`): no tienen turnos ni pedidos que las referencien.
2. Se reabren las filas con `vigente_hasta = hoy` (solo pueden haber sido cerradas por una edición de hoy): vuelven a `NULL`. Queda como base el conjunto vigente con `vigente_hasta IS NULL` y `vigente_desde <= hoy`.
3. Si la lista nueva es igual a la base (mismas franjas, sin importar el orden ni los ids) → no cambia nada: es la cancelación de un cambio programado.
4. Si es distinta: se validan las franjas (2.1), se valida la **cola** (2.3), se cierra la base con `vigente_hasta = hoy` y se insertan las nuevas con `vigente_desde = mañana`.
5. Queda siempre al menos una fila vigente en cada fecha, así que no hay ventana sin franjas (a diferencia de `deleteAll` + `saveAll`).

### 2.3 Cola de los turnos que cruzan

Un turno que empieza hoy y cruza sigue vigente bajo la versión vieja hasta su cierre de mañana. Para cada fila de la base (día = hoy, cruza) se calcula el intervalo `[mañana 00:00, mañana + cierre)` y se compara con las franjas nuevas cuyo día es el de mañana. Si se solapan: `409`/`400` (se define al implementar; recomiendo `400` en el campo `horarios`, porque es un error del dato y no de un estado) con el mensaje "Tu turno de hoy (viernes de 20:00 a 02:00) termina el sábado a las 02:00 y se superpone con la franja del sábado de 01:00 a 05:00. Movela para que empiece después de las 02:00."

### 2.4 Lectura (`DisponibilidadComercioService`)

Las firmas de aud. 1.3 (`dentroDeFranja`, `turnoDe`, `ultimoTurnoTerminado`, `finDelTurno`, `proximoInicioDeFranja`, `vigentesEn`, `cruzaMedianoche`). En T1 se implementan **todas**, aunque `turnoDe`, `ultimoTurnoTerminado` y `finDelTurno` solo las usa T2: así T1 deja probado el modelo completo y T2 no vuelve a tocar este servicio. `ultimoTurnoTerminado` recibe `diasAtras` (7 en T2).

---

## 3. Entrega A: backend, tests y estrés

### A1. Migración `V38` y entidad

- `V38__horario_vigencia.sql`: `vigente_desde date NOT NULL DEFAULT '2000-01-01'`, `vigente_hasta date NULL`, índice `(comercio_id, vigente_desde, vigente_hasta)` y `CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)`. El índice compuesto empieza por `comercio_id`: queda como soporte de la clave foránea y `idx_horario_comercio` se elimina (verificar en la base que la FK acepte el cambio; si no, se conserva). Sin comentarios en el SQL.
- `Horario`: `vigenteDesde` con `@Builder.Default` a `2000-01-01` y `vigenteHasta`; así los 6 archivos de test que hacen `Horario.builder()` y las clases de producción que lo usan (`RegistroService`, `ComercioEdicionService`, `TestSupportService`) compilan sin cambios. Sin comentarios en la entidad (§4.8).
- `bajonea_test`: `scripts/reset-db.mjs` corre Flyway y aplica la `V38`. En `practicas3` la aplica Flyway cuando Diego arranca su backend.
- Verificación: tras el reset, `SHOW CREATE TABLE horario`; un `INSERT` de SQL puro sin las columnas nuevas sigue funcionando (es lo que hacen `helpers/multicomercio.ts:85-93` y `TestSupportService`); el `CHECK` rechaza `vigente_hasta < vigente_desde`.
- Hecho cuando: `mvnw test` arranca limpio con la `V38` aplicada.

### A2. Fusión de pares `23:59` + `00:00` (`V39`, condicionada a la revisión de Diego)

**Paso previo, de Diego, antes de que yo escriba nada:** ejecutar en phpMyAdmin la consulta del **anexo 9.1** sobre `bajonea_practicas3` (y sobre cualquier otra base con datos reales), pegarme el resultado de las siete consultas y decidir caso por caso.

- **Sin candidatos (consulta Q1 vacía):** `V39` no se escribe. T1 sigue sin fusión.
- **Con candidatos aprobados:** `V39__fusionar_franjas_que_cruzan_medianoche.sql`, aplicada por Flyway solo cuando el backend arranque sobre esa base. Contenido: (1) crea `horario_fusion_respaldo` (comercio, filas A y B con día, apertura y cierre originales, fecha); (2) la llena con la misma regla de Q1; (3) actualiza la fila A (`hora_cierre` = el cierre de B); (4) borra la fila B por su `id` desde el respaldo. Nadie referencia `horario.id` todavía (T2 agrega `pedido.turno_horario_id`), así que el borrado es seguro. La tabla de respaldo no tiene entidad (`ddl-auto=validate` no la ve) y se elimina en una migración posterior, cuando Diego confirme que no hace falta revertir.
- **La regla es la estricta de la aud. 2.c:** fila A con `cierre = 23:59` y `apertura > 00:00`; fila B del día siguiente (domingo → lunes) con `apertura = 00:00` y `cierre < apertura de A`. Las filas `00:00`–`23:59` (comercios 24 horas) **no** son A ni B de ningún par. Los casos que cumplen los extremos pero no el último filtro (resultado de 24 horas o más) y las aperturas `00:00` sin pareja **no se tocan**; Q2 y Q3 los muestran para que Diego decida.
- Hecho cuando: Diego confirma que no hay nada que fusionar o aprueba la lista exacta de pares.

### A3. Repositorio y `DisponibilidadComercioService`

- `HorarioRepository`: `findVigentesDesde(comercioId, fechaDesde)` y `findVigentesDesdeIn(comercioIds, fechaDesde)` (`vigente_hasta IS NULL OR vigente_hasta >= fechaDesde`), y `findPendientes(comercioId, hoy)` (`vigente_desde > hoy`). `findByComercioId` y `findByComercioIdIn` quedan solo para la corrección y el clon de prueba; ningún camino caliente los usa.
- `DisponibilidadComercioService`: las firmas de 2.4. La lectura normal pasa `hoy - 1` (cubre la cola de ayer); `calcular(Comercio)` y `calcular(Comercio, List<Horario>, LocalDateTime)` mantienen su forma. `finDeFranja` (23:59 → 24:00) se aplica solo a franjas que no cruzan. Se actualiza el Javadoc de la clase: desaparece la limitación de "las franjas que cruzan la medianoche no se unen".
- Reapertura tras cierre manual: el cierre a las 23:30 en un turno `20:00`–`02:00` ya no reabre a las 00:00, reabre en el inicio del turno siguiente (cambia de significado un caso, ver 7).
- Hecho cuando: `DisponibilidadComercioServiceTest` (reescrito y ampliado) cubre sin cruce, con cruce, cola de ayer, vigencia por fecha, versión pendiente que ya cuenta para `proximoInicioDeFranja`, `turnoDe`, `ultimoTurnoTerminado` y `finDelTurno`.

### A4. Validador de franjas

- `ValidadorDatosNegocioComercio.validarHorarios` (`:73-95`) se reescribe según 2.1 y se extrae a un componente reutilizable que también use la edición (`ValidadorHorarios`). Lo comparten `RegistroService`, el alta adicional, la corrección y la edición, así que el orden de los mensajes es el mismo en los cuatro.
- `ComercioTextoLegible.horarios` (`:80`) marca las que cruzan ("Viernes 20:00-02:00 (+1)"); lo usa el historial de cambios de la corrección. `ComercioTextoLegibleTest` se amplía.

### A5. Servicio y endpoint de edición

- `HorarioEdicionService` (nuevo): `editarHorarios(ComercioActivo actor, List<HorarioRequestDTO>)` según 2.2 y 2.3. Orden de bloqueo: `historialEdicionComercioService.iniciarEscritura(actor)` (usuario y, si es Empleado, relación) → comercio con `refresh(PESSIMISTIC_WRITE)` **desde la primera lectura** (leerlo compartido y subirlo reproduce el interbloqueo de A2 de E3) → `validarComercioModificable(actor, estado)` → filas de `horario` → `historial_edicion_comercio` en la misma transacción. Solo registra historial si hubo cambio efectivo (incluida la cancelación de un pendiente: `detalle` "cancelación del cambio de horarios programado").
- `ComercioController`: `PUT /api/v1/comercios/perfil/horarios`, con `ComercioActivo` como **primer parámetro** (regla del bloque A2 de E3: el resolver corre antes de leer el cuerpo, para que un Empleado inactivo con cuerpo inválido reciba el `404` y no el `400`). Cuerpo: `ComercioHorariosRequestDTO { List<HorarioRequestDTO> horarios }` con `@NotEmpty` y `@Valid`. Respuesta: `HorariosComercioResponseDTO { vigentes, pendientes, rigeDesde }`.
- `DelegacionEmpleado`: ruta exacta `PUT /api/v1/comercios/perfil/horarios` (pasa a 24). `ClasificacionRutasComercioTest`: `delegable("PUT /api/v1/comercios/perfil/horarios")`.
- Historial: `TipoEntidadEdicion.HORARIO` + `AccionEdicion.EDITAR` + `detalle` con el nombre del campo y la fecha desde la que rige; la Actividad ya trae el texto "Editó los horarios" (`ActividadComercioService.java:281`), sin cambios.
- Hecho cuando: los casos de 2.2 (igual, distinta, repetida el mismo día, cancelación) y 2.3 devuelven lo esperado y no dejan filas a medias.

### A6. Lecturas y DTOs (los 12 lugares de aud. 1.4)

- `HorarioResponseDTO`: suma `cruzaMedianoche`. `ComercioResponseDTO`, `ComercioEmpleadoResponseDTO`, `MiComercioResponseDTO` y los públicos devuelven solo los **vigentes de hoy**; los dos primeros suman `horariosPendientes` y `horariosRigenDesde` (así la pantalla de edición no necesita una ruta de lectura nueva y la lista delegable no crece más).
- `ComercioService` (`:83, :226, :361, :405`), `CierreComercioService` (`:91, :112`), `MisComerciosService` (`:44`), `MisComerciosEmpleadoService` (`:44`), `AdministradorService` (`:199, :376`), `TestSupportService` (`:195`, copia también la vigencia): pasan a las lecturas vigentes, siempre **una consulta agrupada** (el polling de 15 s de `MisComercios*` es el camino más frecuente del sistema). `listarAprobados` deja de hacer una consulta de horarios por comercio.
- `ComercioCorreccionService` (`:103`) y `ComercioEdicionService.reemplazarHorarios` se mantienen (el comercio rechazado nunca vendió); lo único que cambia es que usan el validador nuevo y aceptan filas que cruzan.
- Hecho cuando: ningún DTO ni servicio devuelve filas pendientes o vencidas como si fueran vigentes (test Java con una versión pasada, una vigente y una pendiente).

### A7. Bandera de la reapertura y hueco "sin franjas"

- `ReaperturaComerciosJob`: constructor con `@Value("${comercio.reapertura.job-habilitado:true}")` (patrón de `InvitacionVencimientoJob`); la corrida programada no hace nada con `false`; `reabrirComerciosVencidos(LocalDateTime)` sigue funcionando a pedido (el atajo `POST /api/v1/test/jobs/reapertura-comercios` lo llama directo). `application-test.properties`: `comercio.reapertura.job-habilitado=false`. Efecto en tests: los specs `30` y `31` usan el atajo; ningún test debería depender de la reapertura automática de fondo (se verifica corriendo la suite).
- **Propuesta, a confirmar por Diego (sección 8, punto 3):** cerrar el hueco existente de `CierreComercioService.reabrirSiVencido` (`:119-123`): un comercio con `cerrado_manualmente` y sin ninguna franja vigente no reabre nunca. Con la edición que impide la lista vacía no se puede generar por la aplicación, pero sí por SQL. Propongo reabrir con un `log.warn`, igual que la rama "sin fila `CERRADO`". Cambia el significado de `CierreComercioServiceTest:383` (`sinFranjasElJobNoReabreSolo`).

### A8. Pruebas Java

- Nuevos: `HorarioEdicionServiceTest` (con repositorios simulados: orden de bloqueos, tres estados, cola, lista vacía, Empleado con `SUSPENDIDO`), `ValidadorHorariosTest` (circular, domingo a lunes, adyacentes, `23:59`, `cierre = apertura`), `HorarioEdicionIntegrationTest` (contra `bajonea_test`: vigencia por fecha, cancelación del pendiente, nunca una lectura sin filas con ediciones en hilos), `EscriturasEmpleadoHttpIntegrationTest` (el Empleado edita; Empleado inactivo `404` aun con cuerpo inválido), `HorarioEdicionConcurrenciaIntegrationTest` (edición contra `cerrar`, `abrir`, la reapertura y otra edición, con latches).
- Que cambian de significado o se tocan: `DisponibilidadComercioServiceTest` (270 líneas, 20 `@Test`), `CierreComercioServiceTest` (3 stubs, 27 `@Test`, el `:383`), `ReaperturaComerciosJobTest` (4 `@Test`, bandera), `ComercioServiceValidarAceptaPedidosTest` (3 stubs), `ComercioServiceCatalogoPublicoTest` (1), `ComercioEdicionServiceTest` (2), `MisComerciosServiceTest`, `MisComerciosEmpleadoIntegrationTest`, `ClasificacionRutasComercioTest`, `PertenenciaCruzadaDelegablesIntegrationTest` (suma la ruta nueva), `RegistroComercioFase1IntegrationTest`.

### A9. Pruebas de API, Newman y estrés

- Playwright API, specs nuevos (el siguiente libre es el `68`):
  - `68-horarios-edicion-api.spec.ts`: edición del Dueño y del Empleado; `409 COMERCIO_SUSPENDIDO` y `CERRADO_TEMPORALMENTE` permitido; `404` para Cliente sin relación, Administrador `403`; lista vacía `400`; `cierre = apertura` `400`; franja que cruza `201`/`200`; superposición mismo día, entre días y domingo a lunes; cola del turno de hoy contra franja de mañana (el mensaje nombra el turno); cambio programado visible en `horariosPendientes` y las lecturas vigentes **no** lo muestran; segunda edición el mismo día reemplaza al pendiente; edición idéntica a la vigente cancela el pendiente; Actividad del Dueño muestra "Editó los horarios".
  - `69-horarios-cruce-medianoche-api.spec.ts`: con franjas calculadas alrededor de ahora (`tests/helpers/zona.ts`; una franja que cruza siempre se puede armar: `ahora - 30 min` a `ahora + 30 min` aunque pase la medianoche): abierto/cerrado en el catálogo, cierre y apertura manual dentro del turno (incluida la cola de madrugada cuando el reloj real lo permite), reapertura con `?ahora=` explícito en el atajo.
- Newman: constructor nuevo `build-horarios-tramoT1-postman.mjs` (carpeta `73`, va **último**; las carpetas `71` y `72` son las del tramo anterior). Se ajusta `build-matriz-comercio-postman.mjs:275-276` (cierre igual → `400` con el mensaje nuevo; cierre anterior pasa a válido) y la carpeta de la matriz de rutas delegables `66` (`build-empleado-tramoE3-A5-postman.mjs`, nombre y lista: 24 rutas).
- Estrés nuevo `stress-locks-tramoHorarios.mjs`, registrado en `correr-estreses.mjs`, 8 o más rondas:
  1. Ediciones simultáneas del mismo comercio, Dueño y Empleado: todas `200`/`4xx` esperadas, estado final con una sola generación pendiente y lo vigente cerrado una sola vez.
  2. Edición contra `cerrar`, `abrir` y la reapertura (atajo): sin `5xx`, sin `Deadlock found`.
  3. Edición contra bloqueo de cuenta del Dueño y suspensión del Administrador (ambos toman el comercio `FOR UPDATE`).
  4. Edición contra desactivación del Empleado (relación `FOR UPDATE`): la edición pendiente del Empleado da `404` consistente.
  5. Lecturas de catálogo, `mis-comercios` y perfil en paralelo con ediciones: **nunca** una lectura con cero franjas vigentes ni con pendientes mezclados (invariante de 2.2.5).
  6. Edición contra `confirmarPedido` y creación/edición de productos: sin `5xx`.
  Más el runner completo de los estreses una vez: los 18 existentes registran `00:00`–`23:59` y no deberían cambiar.
- Mutaciones ("las pruebas muerden"): quitar el `FOR UPDATE` del comercio en la edición, quitar `iniciarEscritura`, no reabrir las filas cerradas hoy (la cancelación no funciona), no filtrar por vigencia en una lectura (un DTO muestra pendientes), quitar la vuelta de domingo a lunes del validador, quitar el chequeo de la cola, aplicar `finDeFranja` también a las que cruzan.

### A10. Verificación de la entrega A

`mvnw test` (las dos pasadas del proyecto), Newman completo desde base reseteada, Playwright de API, runner de estreses completo y mutaciones. Entregable: lista de archivos tocados y evidencia por punto. **Punto de corte: informe a Diego antes de la entrega B.**

---

## 4. Entrega B: pantallas y tests de UI

**Pantallas que necesitan mockup, para que Diego las elija antes de que se escriba una línea de frontend** (cada una con las variantes que propongo y una recomendada; el sistema de diseño es el de `css/styles.css`):

| # | Mockup | Qué tiene que definir | Variantes propuestas |
|---|---|---|---|
| **M1** | Vista "Editar horarios" del **Dueño** (en `comercio-perfil.html`, como las otras vistas `perfil-view`) | Dónde está la entrada en la lista del perfil; cómo se ve la lista de turnos; aviso "Los cambios rigen desde mañana" y confirmación; cómo se ve un **cambio programado** (qué rige hoy y qué regirá desde mañana, con opción de cancelarlo) | **A (recomendada):** fila "Horarios" dentro de "Mi comercio"; pantalla con el mismo asistente que el registro (pestañas "Horario fijo" y "Personalizado") y una tarjeta fija arriba "Rige hoy" / "Desde mañana". **B:** una lista de turnos por día, editable con hoja inferior por turno, sin pestañas. **C:** solo el modo "Personalizado" (filas de día + horas) |
| **M2** | Vista "Editar horarios" del **Empleado** | Dónde entra (hoy el perfil del Empleado tiene cinco filas y "Editar datos del comercio" solo toca descripción y teléfono); si ve el cambio programado de otro; cómo se explica que el cambio rige desde mañana | **A (recomendada):** fila nueva "Horarios" en "Editar datos del comercio", junto a descripción y teléfono, que abre la misma pantalla de M1 con el mismo aviso. **B:** fila propia en la lista del perfil del Empleado, debajo de "Editar datos del comercio" |
| **M3** | **Selector de franja que cruza la medianoche** (se usa en registro, alta adicional, corrección y las dos ediciones) | Cómo se carga y se entiende un turno `20:00` a `02:00` sin que el usuario crea que cometió un error | **A (recomendada):** los mismos dos campos de hora y una leyenda automática debajo ("Termina el sábado a las 02:00") cuando cierre < apertura. **B:** un interruptor "Termina al día siguiente" que queda marcado solo si cierre < apertura y no se puede dejar inconsistente. **C:** el cierre con un selector "mismo día / día siguiente" al lado de la hora |

Incluidos en M1 y M3 (no necesitan mockup aparte): el mensaje de error de la cola de un turno que cruza (texto en el campo) y la leyenda "(+1)" en los resúmenes. **Hasta que Diego elija, la entrega B no empieza** (se arma el cuerpo de la entrega con el resto, sin estas tres pantallas).

### B1. `initHorarios` y la validación (sin mockup)

- `js/comercio-form.js`: `franjasSeSuperponen` (`:166`) y `mensajeConflictoHorario` (`:170`) pasan a una función de intervalos de semana con cruce y vuelta de domingo a lunes, igual que el validador del servidor; las validaciones de `:617` (por fila), `:804` (franja rápida) y `:812` (`validar`) cambian de "cierre posterior a apertura" a "cierre distinto de apertura" con el mensaje nuevo. `resumen` (`renderResumenFijo`, `:640-657`) agrega la leyenda de cruce que defina M3.
- Se verifica la consola del navegador en las cuatro pantallas que usan `initHorarios`: `registro-comercio.html` (`auth.js:340-387`), `agregar-comercio.html` (`agregar-comercio.js`), `comercio-corregir.html` (`comercio-corregir.js:93, :220-298`) y la vista nueva.
- Nota de diseño: `initHorarios` lee ids fijos del DOM (`horario-list`, `tab-horario-fijo`, `dia-chip-row`, `error-horarios`, ...); la vista nueva del perfil repite ese bloque de markup, como ya lo repiten las otras tres páginas.

### B2. Vista "Editar horarios" (Dueño y Empleado) — **requiere M1 y M2**

- `comercio-perfil.html`: sección `view-editar-horarios` (`perfil-view is-hidden`) y la fila de entrada; `js/comercio.js`: carga de `horarios` y `horariosPendientes` del perfil, envío a `PUT /comercios/perfil/horarios`, toast de éxito ("Horarios guardados. Rigen desde mañana."), `409` de reglas del comercio con `mostrarAvisoFijo`, `400` de franjas en el campo, y botón para cancelar el cambio programado. Para el Empleado se esconde o muestra según `contextoPuedeEditarCatalogo()`/el contexto, y el `409 COMERCIO_SUSPENDIDO` sale como en "Editar datos del comercio".
- `pintarHorariosParaEmpleado` (`comercio.js:1977`) muestra lo vigente y, si hay, el cambio programado.

### B3. Lecturas de horarios en el resto del frontend (sin mockup, solo texto)

- `js/catalogo.js:77-86` (`resumenHorarioHoy`, usada en `:410` y `:1045`) y `js/comercio.js:640`: la franja de hoy puede tener "(+1)"; la cola de madrugada de la franja de ayer se muestra como "Hasta las 02:00" cuando corresponde. `js/admin.js:629-641` y `:2021-2024` (`textoHorarios`) muestran el cruce.

### B4. Pruebas de UI

- Specs existentes a revisar: `13-registro-comercio-wizard` (paso 3, mensajes), `25-multicomercio-tramo3b-...-ui` y `23-...-ui` (usan `initHorarios`), `31` y `33` (franjas de apertura), `38` y `53` (perfil del Empleado), `61`/`60` (administrador, modal de comercio con horarios).
- Specs nuevos (siguiente número libre: `70`): `70-horarios-edicion-ui.spec.ts`, con las variantes que elija Diego: carga de un turno que cruza y su leyenda, error de superposición circular y de cola, edición del Dueño y del Empleado, cambio programado visible y cancelación, `409` del Empleado con el comercio `SUSPENDIDO`, sin scroll horizontal a 375 px, sin errores de consola.
- `docs/DATA-TESTID-FASE17.md`: testids nuevos.

### B5. Cierre del tramo

- Documentación: `CLAUDE.md` (§1bis, §5 `Horario`, §6, §7.2: 24 rutas delegables), `docs/DECISIONES.md` (una entrada por decisión), `docs/diccionario-de-datos.md` (columnas de `horario`, y `horario_fusion_respaldo` si se creó), `docs/APRENDIZAJES-TECNICOS.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (la edición toma el comercio `FOR UPDATE`; `horario` es hoja debajo de `comercio`; sin cambios al orden global), `docs/LISTA-DE-DESPLIEGUE.md` (V38/V39 y la revisión previa de la fusión), requisitos funcionales y historias del Dueño y del Empleado en `docs/entregables-01-02/` (hoy `requisitos-funcionales-empleado.md` y `CAMBIOS.md` ya hablan de horarios delegables), `docs/MAPEO-ARCHIVOS-FASE2-T1.md`.
- Regresión completa: `mvnw test`, Newman, Playwright completo (inestables conocidos `01:101` y `27:497`), todos los estreses.
- Checklist para Diego con evidencia por punto. **Sin commit hasta su confirmación.**

---

## 5. Orden de trabajo y dependencias

0. **Antes de empezar:** Diego ejecuta la consulta del anexo 9.1 en `practicas3` y elige los mockups M1, M2 y M3. Las dos cosas no frenan la entrega A, salvo A2.
1. A1 (`V38`, entidad) → A3 (repositorio y `DisponibilidadComercioService`) → A4 (validador) → A5 (servicio y endpoint) → A6 (lecturas y DTOs): el servidor queda completo.
2. A7 (bandera) en cualquier momento antes de A9, porque los specs de reapertura la necesitan.
3. A2 (`V39`) **solo si** hay candidatos aprobados; no bloquea nada de lo demás.
4. A8 (tests Java) en paralelo con cada paso; A9 (API, Newman, estrés) y A10 (verificación). **Corte: informe a Diego.**
5. B1 (validación en el frontend, sin mockup) puede empezar al cerrar A4; B2 y B4 esperan los mockups; B3 y B5 al final.

## 6. Riesgos y puntos de atención

| Riesgo | Cómo se maneja |
|---|---|
| Fusionar un comercio 24 horas (`00:00`–`23:59` de días seguidos) en un turno de 48 horas | Regla estricta (`apertura > 00:00` en la fila A); consulta de candidatos con Q5 que lista las filas 24 horas para ver que **no** son candidatas; respaldo en `horario_fusion_respaldo`; la corre Diego |
| La cola de un turno que cruza se solapa con la versión nueva de mañana sin que ninguna validación por versión lo vea | Validación de la cola al editar (2.3), con test y mutación |
| `Deadlock found` en la edición contra `cerrar`/`abrir`/bloqueo de cuenta | Mismo patrón que `editarDatosOperativos`: `iniciarEscritura` primero y comercio `FOR UPDATE` desde la primera lectura; estrés con los escenarios 2 a 4 |
| Una lectura ve una ventana sin franjas durante la edición | Las filas son insert-only más un `UPDATE` de `vigente_hasta` en filas que siguen valiendo hoy; el estrés lo comprueba (escenario 5) |
| Un camino caliente sigue llamando `findByComercioId` y arrastra todo el historial de ediciones | Reemplazo de los 12 lugares; revisión por `grep` antes del cierre |
| Un `INSERT` de SQL puro de tests o seeds rompe con las columnas nuevas | `DEFAULT '2000-01-01'` y `vigente_hasta` nulo; verificado en A1 |
| La bandera `comercio.reapertura.job-habilitado=false` deja un test que dependía de la reapertura de fondo | Se corre toda la suite; los specs `30`/`31` y los estreses `C1`/`C2` usan el atajo |
| Franja `23:59` + franja que cruza en convivencia | Pruebas de `finDeFranja` solo para las que no cruzan; `00:00` como cierre de una que cruza vale medianoche |
| Cambios locales de Diego en `application.properties` y `Bajonea-Local.postman_environment.json` | No se tocan: las propiedades nuevas llevan su valor por defecto en el código y la de test va en `application-test.properties` |
| La Actividad del Dueño muestra "Editó los horarios" sin detalle de cuáles | Aceptado: el `detalle` lleva solo nombres de campos, nunca valores (regla de `historial_edicion_comercio`) |

## 7. Tests existentes que cambian de significado

| Test | Antes | Ahora |
|---|---|---|
| `build-matriz-comercio-postman.mjs:275` (cierre igual a apertura) | `400` "posterior a la hora de apertura" | `400` con el mensaje nuevo de "no puede ser igual" |
| `build-matriz-comercio-postman.mjs:276` (cierre anterior a apertura) | `400` | Válido: es un turno que cruza (se espera `201`) |
| `CierreComercioServiceTest:383` `sinFranjasElJobNoReabreSolo` | No reabre | Reabre con aviso en el log (solo si Diego confirma la propuesta de A7) |
| Javadoc de `DisponibilidadComercioService` (líneas 28-30) y `lasFranjasPartidasSeEvaluanPorSeparado` | Un cierre en el primer tramo de una franja partida reabre en la segunda fila | Esa limitación solo existe para dos filas separadas; el turno que cruza es una fila y reabre en el turno siguiente |
| `DisponibilidadComercioServiceTest`: `dentroDeFranja...`, `proximoInicio...` | Filas de un solo día, sin vigencia | Mismas expectativas (se mantienen), más cruce y vigencia; firmas con lista vigente |
| `Matriz de las 23 rutas delegables` (carpeta `66`, spec `50`, `PertenenciaCruzadaDelegablesIntegrationTest`) | 23 rutas | 24 rutas |
| Tests del frontend de `13`, `25`, `31`, `33` que dependan del texto "posterior a la hora de apertura" | Mensaje viejo | Mensaje nuevo (por `grep` solo se encontró `13:291-296` para superposición y ninguno para "posterior" en tests Playwright) |

## 8. Qué necesito de Diego

1. **Ejecutar la consulta del anexo 9.1 en `bajonea_practicas3`** y pasarme el resultado de las siete (o decirme que Q1 y Q2 vienen vacías).
2. **Elegir M1, M2 y M3** (tabla de la entrega B).
3. **Una decisión chica:** ¿cierro en este tramo el hueco "comercio cerrado a mano y sin franjas no reabre nunca" (A7)? Recomiendo **sí**: son tres líneas, un test que cambia de significado y no puede generarse por la aplicación luego de este tramo, solo por SQL.
4. Confirmar que `V39` queda condicionada a esos resultados (no la escribo hasta tenerlos).

---

## 9. Anexos

### 9.1 Consultas de candidatos a fusión (solo lectura, para phpMyAdmin)

Todas son `SELECT`. No modifican nada. `dia_semana + 0` devuelve la posición en el `ENUM` (`LUNES` = 1 ... `DOMINGO` = 7); `% 7 + 1` hace la vuelta de domingo a lunes.

**Q1. Pares fusionables con la regla estricta** (los únicos que fusionaría la `V39`):

```sql
SELECT c.id AS comercio_id, c.nombre, c.estado,
       a.id AS fila_a, a.dia_semana AS dia_a, a.hora_apertura AS apertura_a, a.hora_cierre AS cierre_a,
       b.id AS fila_b, b.dia_semana AS dia_b, b.hora_apertura AS apertura_b, b.hora_cierre AS cierre_b,
       a.dia_semana AS dia_resultante, a.hora_apertura AS apertura_resultante, b.hora_cierre AS cierre_resultante
FROM horario a
JOIN horario b ON b.comercio_id = a.comercio_id
JOIN comercio c ON c.id = a.comercio_id
WHERE a.hora_cierre = '23:59:00'
  AND a.hora_apertura > '00:00:00'
  AND b.hora_apertura = '00:00:00'
  AND b.hora_cierre < a.hora_apertura
  AND (b.dia_semana + 0) = ((a.dia_semana + 0) % 7) + 1
ORDER BY c.id, a.dia_semana + 0, a.hora_apertura;
```

**Q2. Casi pares que NO se fusionan** (cumplen los extremos pero el resultado duraría 24 horas o más: `cierre de B >= apertura de A`):

```sql
SELECT c.id AS comercio_id, c.nombre, c.estado,
       a.id AS fila_a, a.dia_semana AS dia_a, a.hora_apertura AS apertura_a, a.hora_cierre AS cierre_a,
       b.id AS fila_b, b.dia_semana AS dia_b, b.hora_apertura AS apertura_b, b.hora_cierre AS cierre_b
FROM horario a
JOIN horario b ON b.comercio_id = a.comercio_id
JOIN comercio c ON c.id = a.comercio_id
WHERE a.hora_cierre = '23:59:00'
  AND a.hora_apertura > '00:00:00'
  AND b.hora_apertura = '00:00:00'
  AND b.hora_cierre >= a.hora_apertura
  AND (b.dia_semana + 0) = ((a.dia_semana + 0) % 7) + 1
ORDER BY c.id, a.dia_semana + 0, a.hora_apertura;
```

**Q3. Aperturas a las 00:00 sin pareja** (no se tocan; son las que no debe fusionar una regla ingenua):

```sql
SELECT c.id AS comercio_id, c.nombre, c.estado, b.id AS fila_b, b.dia_semana, b.hora_apertura, b.hora_cierre
FROM horario b
JOIN comercio c ON c.id = b.comercio_id
WHERE b.hora_apertura = '00:00:00'
  AND NOT EXISTS (
    SELECT 1 FROM horario a
    WHERE a.comercio_id = b.comercio_id
      AND a.hora_cierre = '23:59:00'
      AND a.hora_apertura > '00:00:00'
      AND b.hora_cierre < a.hora_apertura
      AND (b.dia_semana + 0) = ((a.dia_semana + 0) % 7) + 1
  )
ORDER BY c.id, b.dia_semana + 0;
```

**Q4. Ambigüedades** (una fila A con más de una B, o una B con más de una A; debería dar vacío):

```sql
SELECT 'A con varias B' AS caso, a.comercio_id, a.id AS fila, COUNT(*) AS cantidad
FROM horario a
JOIN horario b ON b.comercio_id = a.comercio_id
WHERE a.hora_cierre = '23:59:00' AND a.hora_apertura > '00:00:00'
  AND b.hora_apertura = '00:00:00' AND b.hora_cierre < a.hora_apertura
  AND (b.dia_semana + 0) = ((a.dia_semana + 0) % 7) + 1
GROUP BY a.comercio_id, a.id
HAVING COUNT(*) > 1
UNION ALL
SELECT 'B con varias A', b.comercio_id, b.id, COUNT(*)
FROM horario a
JOIN horario b ON b.comercio_id = a.comercio_id
WHERE a.hora_cierre = '23:59:00' AND a.hora_apertura > '00:00:00'
  AND b.hora_apertura = '00:00:00' AND b.hora_cierre < a.hora_apertura
  AND (b.dia_semana + 0) = ((a.dia_semana + 0) % 7) + 1
GROUP BY b.comercio_id, b.id
HAVING COUNT(*) > 1;
```

**Q5. Comercios 24 horas** (filas `00:00`–`23:59`; no son candidatas a nada, la consulta solo sirve para verlas):

```sql
SELECT c.id AS comercio_id, c.nombre, c.estado, COUNT(*) AS dias_24_horas
FROM horario h
JOIN comercio c ON c.id = h.comercio_id
WHERE h.hora_apertura = '00:00:00' AND h.hora_cierre = '23:59:00'
GROUP BY c.id, c.nombre, c.estado
ORDER BY c.id;
```

**Q6. Filas que ya tienen el cierre menor o igual a la apertura** (la aplicación no las deja cargar, así que debería dar vacío; si no, hay datos cargados a mano):

```sql
SELECT c.id AS comercio_id, c.nombre, h.id AS fila, h.dia_semana, h.hora_apertura, h.hora_cierre
FROM horario h
JOIN comercio c ON c.id = h.comercio_id
WHERE h.hora_cierre <= h.hora_apertura
ORDER BY c.id, h.dia_semana + 0;
```

**Q7. Comercios sin ninguna franja**:

```sql
SELECT c.id AS comercio_id, c.nombre, c.estado, c.cerrado_manualmente
FROM comercio c
LEFT JOIN horario h ON h.comercio_id = c.id
WHERE h.id IS NULL
ORDER BY c.id;
```

**Cómo leer el resultado:**
- **Q1** es lo único que la `V39` fusionaría: por cada fila, A pasa a `apertura_resultante`–`cierre_resultante` (cruza) y B se borra. Si hay una sola fila que no querés fusionar, avisame y se saca de la lista antes de escribir la migración.
- **Q2, Q3, Q5, Q6 y Q7** no se tocan; sirven para que veas qué hay. Si Q4 o Q6 devuelven filas, hay datos raros que conviene mirar antes de seguir.
- Si Q1 y Q2 vienen vacías, no hay nada que fusionar y `V39` no se escribe.

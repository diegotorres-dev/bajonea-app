# Plan del Tramo T2 de la Fase 2: pedido por turno y "Vendido en el turno" (2026-10-20)

Plan de trabajo, sin código todavía. Sale de `docs/AUDITORIA-FASE2-TURNOS.md` (secciones 3, 4, 9 y 10; "aud. N" = sección N), de las decisiones de Diego (4, 9, 10 y 12 de la auditoría, más el reparto de rótulos entre Dueño y Empleado) y de una relectura del código **tal como quedó después de T1** (commits `f59c95a` y `149a825`). Formato como `docs/PLAN-FASE2-T1.md`: entrega A (backend, tests y estrés), entrega B (pantallas y tests de UI), orden, riesgos y lista de tests que cambian de significado. Un commit solo cuando Diego confirme.

Reglas de este tramo: ningún `.html`, `.css`, `.js` ni `.ts` nuevo o tocado lleva comentarios (`CLAUDE.md` §4.11); las entidades no llevan comentarios (§4.8); no se ejecuta ninguna migración fuera de `bajonea_test`; no se toca `application.properties` ni `Bajonea-Local.postman_environment.json` (cambios locales de Diego).

---

## 0. Verificación previa (hecha hoy, solo lectura)

| Pregunta | Resultado |
|---|---|
| Siguiente migración libre | **`V39`** (la última es `V38__horario_vigencia.sql`). La auditoría decía `V40` para esto porque contaba una fusión `V39` que se descartó; los números `V41` (`cierre_turno`) y `V42` (`precio_visto`) de la auditoría **se corren un lugar** y se reasignan en sus tramos |
| Dónde se pasa un pedido a `PENDIENTE_CONFIRMACION_COMERCIO` | **Un solo lugar** de producción: `PedidoService.confirmarPagoAprobado` (`:260-282`, línea `:268`). Lo llaman el webhook, la sincronización y los atajos de test (`TestSupportService.confirmarPagoAprobado` y `...ConRegistro`). Es el único punto donde hay que estampar |
| Qué ya existe de T1 y se reutiliza | `DisponibilidadComercioService`: `record Turno(horario, inicio, fin)`, `turnoDe(horarios, ahora)`, `ultimoTurnoTerminado(horarios, ahora, diasAtras)`, `finDelTurno`, `vigenteEn`, `ahora()`; `HorarioRepository.findVigentesDesde(comercioId, fechaDesde)` y las variantes `In` y con bloqueo. **Cero código nuevo de cálculo de turnos** |
| "Hoy" del panel hoy | `pedidosLlegadosPagadosHoy` (`PedidoService:753`) carga **todos** los pedidos pagados del comercio (`findLlegadosPagadosByComercioId`) y filtra el día en Java, con `fechasPagoAprobado` (`min(fecha_hora)` del historial). Se reemplaza por una agregación en la base |
| Neto y bruto hoy | Dueño: `subtotal - cargoServicioComercio` (neto). Empleado: `subtotal` (bruto). Con la decisión nueva, **el número principal del Dueño pasa de neto a bruto** y el neto es un campo aparte |
| Quién consume `resumen-hoy` | Backend: `PedidoController:123`, `DelegacionEmpleado:29`, los dos DTO `ResumenPedidosHoy*`. Frontend: solo `frontend/js/comercio.js` (`:89-92`, `:492-494`, `:672`) y `comercio-dashboard.html:21`. Nada más del frontend lo llama |
| `postman/limpiar-datos-postman.sql` | Ya borra `pedido` (`:59`) **antes** de `horario` (`:64`): la FK nueva no lo rompe (la aud. 3.e lo dejaba como duda) |
| Tests que borran `horario` por SQL | `CarritoIntegrationBase:78`, `CierreComercioIntegrationTest:164,216`, `EscriturasEmpleadoIntegrationTest:136,550`, `HorarioEdicionIntegrationTest:203,219`, más `docs/db/multicomercio-tramo1-borrar-segundo-comercio.sql:29`. Con la FK `pedido.turno_horario_id` fallarían **si ya hubiera un pedido con turno asignado**; se verifica caso por caso en A6 (riesgo 6) |
| Pedidos creados por SQL en tests | Hay tests que insertan `pedido` e `historial_estado_pedido` a mano (`CarritoIntegrationBase` y los de actividad). Esos pedidos **no tendrán** `turno_*` ni `fecha_pago_confirmado`; ninguno consulta el resumen (verificado por `grep`: solo `PedidoNoRetirado*Test`, `PedidoServiceVistaEmpleadoTest` y los specs de la sección 7 lo leen, y todos pasan por el flujo real o por mocks) |

Sin verificar, a propósito: el costo y la forma (en línea o con copia de tabla) del `ALTER TABLE pedido` y del `ADD FOREIGN KEY` en la MariaDB 10.4 del servidor (se prueba sobre `bajonea_test` en A1; en `practicas3` lo aplica Flyway cuando Diego arranque su backend), y los volúmenes reales de pedidos de `practicas3`.

---

## 1. Decisiones fijadas que mandan en este tramo

| Tema | Decisión |
|---|---|
| Qué es el turno de un pedido | `(comercio_id, turno_fecha, turno_horario_id)`: `turno_fecha` es la fecha de **apertura** del turno (un pago de madrugada pertenece al turno del día anterior) y `turno_horario_id` apunta a la versión de la fila `horario` (el turno de un día pasado no cambia aunque después se edite el horario) |
| Cuándo se asigna | Al confirmarse el pago, en `confirmarPagoAprobado`, con **un solo instante** del `Clock` que se usa también para la fila del historial y para `fecha_pago_confirmado` |
| Pago dentro de un turno | Ese turno (`turnoDe`) |
| **Decisión 4:** pago fuera de toda franja | Va al **último turno terminado dentro de 7 días** (`ultimoTurnoTerminado(..., 7)`). Si no hay, `turno_*` queda `NULL` |
| **Decisión 9:** qué muestra el panel | El turno en curso; entre turnos, el **último turno terminado, rotulado** como tal; sin ninguno, estado sin turno. **"Pendientes" cuenta todos los pendientes del comercio**, no los del turno |
| **Decisión 10:** backfill | `fecha_pago_confirmado` en SQL dentro de `V39`; `turno_*` en **Java**, proceso de una sola vez, idempotente, apagado en el perfil `test` |
| **Decisión 12:** ruta | `GET /api/v1/pedidos/comercio/resumen-turno` con campos nuevos; **se elimina** `resumen-hoy` (ruta, DTOs, entrada de `DelegacionEmpleado`) |
| Qué ve cada rol | "Vendido en el turno" (**bruto**: suma de `subtotal`) lo ven Dueño y Empleado. **Comisión** y **neto del turno** solo el Dueño; el DTO del Empleado no lleva esos campos |
| Qué cuenta como vendido | Los mismos estados facturables de hoy (`ESTADOS_FACTURADOS`: `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `NO_RETIRADO`). "Pedidos del turno" cuenta todos los que llegaron pagados al turno, sin importar cómo terminaron (igual que hoy) |
| Cantidad de rutas delegables | Se mantiene en **24**: `resumen-hoy` sale y `resumen-turno` entra |
| Fuera del tramo | Precios (T3), email de cierre (T4), estadísticas (T5), y que `PedidoResponseDTO.fechaPagoAprobado` lea la columna nueva en lugar del historial (queda como mejora posterior) |

---

## 2. Reglas de dominio que el tramo implementa

### 2.1 Asignación de turno (`TurnoPedidoService`, nuevo)

`asignar(Integer comercioId, LocalDateTime instante)` devuelve `Optional<AsignacionTurno(LocalDate fecha, Integer horarioId)>`:

1. `horarios = horarioRepository.findVigentesDesde(comercioId, instante.toLocalDate().minusDays(8))`, sin bloqueo (cubre la cola de ayer y los 7 días hacia atrás con todas las versiones).
2. `turnoDe(horarios, instante)` → si hay, ese turno.
3. Si no, `ultimoTurnoTerminado(horarios, instante, 7)`.
4. Si tampoco, vacío (`turno_*` = `NULL`).

La fecha es `turno.inicio().toLocalDate()` y el id `turno.horario().getId()`. La cantidad de días (7) es una propiedad `turno.pago-fuera-franja-dias` con valor por defecto en el código.

### 2.2 Resumen del turno (`ResumenTurnoService`, o método de `PedidoService`)

1. `ahora = disponibilidadComercioService.ahora()`; `horarios = findVigentesDesde(comercioId, hoy - 8)`.
2. `turnoDe(horarios, ahora)` → estado `EN_CURSO`; si no, `ultimoTurnoTerminado(horarios, ahora, 7)` → estado `TERMINADO`; si no, `SIN_TURNO`.
3. Agregación en la base por `(comercio_id, turno_fecha, turno_horario_id)`: `count(*)`, `sum(subtotal)` y `sum(cargo_servicio_comercio)` de los facturables. Una sola consulta.
4. `cantidadPendientes` = pedidos del comercio en `PENDIENTE_CONFIRMACION_COMERCIO`, sin filtrar por turno.
5. `SIN_TURNO`: `vendido`, `comision`, `neto` y `cantidadPedidos` en cero y turno nulo; `cantidadPendientes` sí se informa.

### 2.3 Forma de las respuestas

- **Dueño** `ResumenTurnoResponseDTO`: `estado` (`EN_CURSO` / `TERMINADO` / `SIN_TURNO`), `turno { fecha, inicio, fin, cruzaMedianoche }` (nulo si `SIN_TURNO`; `inicio` y `fin` como cadena sin zona, como `noRetiradoDisponibleDesde`), `vendido`, `comision`, `neto`, `cantidadPedidos`, `cantidadPendientes`.
- **Empleado** `ResumenTurnoEmpleadoResponseDTO`: lo mismo **sin** `comision` ni `neto`. Un test fija el conjunto de campos (como `PedidoServiceVistaEmpleadoTest:262`), para que la comisión no se pueda deducir.
- El controller sigue ramificando por `ComercioActivo.esEmpleado()`.

### 2.4 Backfill

- **`V39` (SQL):** `fecha_pago_confirmado` desde el historial, con la misma regla que ya usan `findLlegadosPagadosByComercioId` y `llegoPagado`: `MIN(fecha_hora)` de la fila `PENDIENTE_CONFIRMACION_COMERCIO` (no cuenta el literal viejo `PENDIENTE` de `V6`).
- **`TurnoBackfillService` (Java):** recorre los pedidos con `turno_fecha IS NULL AND fecha_pago_confirmado IS NOT NULL`, por comercio: lee las versiones de `horario` **una vez** por comercio, asigna con `TurnoPedidoService.asignar(comercio, fecha_pago_confirmado)` y escribe con `UPDATE pedido SET turno_fecha=?, turno_horario_id=? WHERE id=? AND turno_fecha IS NULL` por clave primaria, en lotes de 500 (JDBC batch). Idempotente y seguro con dos instancias o con pagos nuevos en paralelo (el `AND turno_fecha IS NULL` impide pisar un estampado de `confirmarPagoAprobado`).
- Se dispara una vez al arrancar (`ApplicationReadyEvent`, en un hilo aparte para no frenar el arranque), con la propiedad `turno.backfill.habilitado` (`true` por defecto, `false` en `application-test.properties`). Loguea cuántos asignó y cuántos quedaron sin turno. Los que no se pueden asignar (comercio sin franjas en la ventana) quedan `NULL` y se reintentan en cada arranque: **cuando Diego vea el log de la primera corrida en producción, apaga la propiedad** (va a `docs/LISTA-DE-DESPLIEGUE.md`).
- Atajo de test `POST /api/v1/test/jobs/backfill-turnos` (perfil `test`), cubierto por la prueba existente de "atajos fuera del perfil".

---

## 3. Entrega A: backend, tests y estrés

### A1. Migración `V39` y entidad

- `V39__pedido_turno.sql`: `ADD COLUMN fecha_pago_confirmado datetime NULL, turno_fecha date NULL, turno_horario_id int NULL`; índices `(comercio_id, turno_fecha, turno_horario_id)` y `(comercio_id, fecha_pago_confirmado)`; `FOREIGN KEY fk_pedido_turno_horario (turno_horario_id) REFERENCES horario(id)` sin cascada; el `UPDATE ... JOIN` del backfill de la fecha. `idx_pedido_comercio` queda redundante: se decide al aplicar (como con `DROP KEY` en `V38`; la FK a `comercio` lo necesita si no hay otro índice que empiece por `comercio_id`, y el nuevo compuesto empieza por `comercio_id`). Sin comentarios en el SQL.
- `Pedido`: `fechaPagoConfirmado` (`LocalDateTime`), `turnoFecha` (`LocalDate`), `turnoHorarioId` (`Integer`, columna simple, no asociación, para no cargar `Horario` en cada lectura); `@Setter` por campo, sin comentarios (§4.8). Los `Pedido.builder()` de producción y de test siguen compilando (campos nulos).
- Verificación: tras `reset-db` sobre `bajonea_test`, `SHOW CREATE TABLE pedido`; un `INSERT` de SQL puro sin las columnas nuevas sigue funcionando; la FK rechaza un `turno_horario_id` inexistente; el `UPDATE` de la fecha deja `fecha_pago_confirmado` igual al `MIN` del historial en todos los pedidos con esa fila (consulta de control).
- Hecho cuando: `mvnw test` arranca limpio con la `V39`.

### A2. Estampado en `confirmarPagoAprobado`

- `TurnoPedidoService.asignar` (2.1) y `PedidoService.confirmarPagoAprobado(Integer)`: calcula **un** `instante = LocalDateTime.now(clock).truncatedTo(SECONDS)` después del bloqueo del pedido, pone `estado`, `pagoEstado`, `fechaPagoConfirmado`, `turnoFecha` y `turnoHorarioId`, y escribe la fila del historial **con ese mismo instante** (`registrarHistorial` gana una sobrecarga con la fecha; las demás transiciones no cambian). Idempotente como hoy: si el pedido ya no está en `PENDIENTE_PAGO`, no toca nada.
- Sobrecarga `confirmarPagoAprobado(Integer pedidoId, LocalDateTime instante)` que usa el atajo de test (`PUT /api/v1/test/pedidos/{id}/pago-aprobado?ahora=`, parámetro opcional; también con `registrarPago=true`) para poder probar cualquier instante (23:30 de un turno que cruza, madrugada, fuera de franja) sin mover el reloj de la aplicación. La ruta pública nunca recibe el instante.
- Hecho cuando: un test de integración confirma que, para todo pedido pagado, `fecha_pago_confirmado` = `fecha_hora` de su fila de historial.

### A3. Resumen por turno y baja del resumen de hoy

- `PedidoRepository`: agregación `resumenDeTurno(comercioId, turnoFecha, turnoHorarioId, estadosFacturables)` (proyección con `cantidad`, `vendido`, `comision`) y `contarPorComercioYEstado(comercioId, estado)`; se prueban con 30000 pedidos sintéticos (el método de `docs/LISTA-DE-DESPLIEGUE.md`) para decidir si hace falta un índice `(comercio_id, estado)`.
- `PedidoService` (o `ResumenTurnoService` nuevo): 2.2 y 2.3; `ResumenTurnoResponseDTO`, `ResumenTurnoEmpleadoResponseDTO` y el enum `EstadoResumenTurno`.
- `PedidoController`: `GET /comercio/resumen-turno` (con `ComercioActivo` como primer parámetro) y se borra `resumen-hoy`. Se borran `pedidosLlegadosPagadosHoy`, `contarPendientes`, `obtenerResumenHoy`, `obtenerResumenHoyEmpleado` y los dos DTO `ResumenPedidosHoy*` (el Javadoc del primero ya estaba desactualizado).
- `DelegacionEmpleado`: cambia la ruta (siguen 24). `ClasificacionRutasComercioTest`: `delegable("GET /api/v1/pedidos/comercio/resumen-turno")`.
- Hecho cuando: las tres variantes de `estado` devuelven lo esperado con relojes fijos, el Empleado no recibe `comision` ni `neto`, y `GET .../resumen-hoy` responde `404`.

### A4. Backfill

- `TurnoBackfillService` y su disparador (2.4), propiedad `turno.backfill.habilitado` (`false` en `application-test.properties`), atajo de test y registro en la lista de despliegue.
- Hecho cuando: sobre una base con pedidos pagados sin `turno_*` (insertados por SQL en el test) asigna lo esperado, vuelve a correr sin cambiar nada, deja `NULL` a un comercio sin franjas y no pisa un pedido estampado en paralelo.

### A5. Pruebas Java

- **Nuevos:** `TurnoPedidoServiceTest` (relojes fijos: dentro de turno; turno que cruza, pago a las 01:30 → turno de ayer; fuera de franja → último terminado; fuera de franja y a más de 7 días → vacío; versiones de horario: una edición posterior no cambia el turno ya asignado), `ResumenTurnoServiceTest` (EN_CURSO, TERMINADO, SIN_TURNO, pendientes de un turno anterior que siguen contando, facturables vs no facturables, bruto/comisión/neto), `PedidoTurnoEstampadoIntegrationTest` (contra `bajonea_test`: estampado y coincidencia con el historial; idempotencia; webhook doble), `TurnoBackfillIntegrationTest` (2.4), `TurnoEstampadoConcurrenciaIntegrationTest` (pago contra edición de horarios, con latches).
- **Reescritos:** `PedidoNoRetiradoServiceTest:425-426`, `PedidoNoRetiradoHttpIntegrationTest:324-334`, `PedidoServiceVistaEmpleadoTest:253-269`, `ClasificacionRutasComercioTest:68`, `PertenenciaCruzadaDelegablesIntegrationTest` (ruta). Ver sección 7.

### A6. Pruebas de API, Newman y estrés

- **Playwright API** (siguiente número libre: `71`):
  - `71-pedido-turno-api.spec.ts`: franjas calculadas alrededor de ahora (`tests/helpers/zona.ts`, patrón del spec `69`): pago dentro del turno asigna `turno_*`; pago con `?ahora=` en la madrugada de un turno que cruza va al turno de ayer; fuera de franja va al último terminado; comercio sin franjas queda `NULL`; la edición de horarios posterior no cambia el turno del pedido; el `GET resumen-turno` en los tres estados; Dueño con comisión y neto, Empleado sin; pendientes de otro turno siguen contando; `resumen-hoy` da `404`; Cliente sin relación `400`/`404` y Administrador `403`.
  - `72-pedido-turno-backfill-api.spec.ts`: backfill por el atajo sobre pedidos con `turno_*` borrados por SQL; segunda corrida sin cambios.
- **Newman:** constructor nuevo `build-pedido-turno-tramoT2-postman.mjs` (carpeta `74`, va **último**; la `73` es la de T1). Se ajustan `build-empleado-tramoE2-postman.mjs`, `build-multicomercio-tramo1-postman.mjs`, `build-pedidos-no-retirado-tramoE3-A4b-postman.mjs` y `build-empleado-tramoE3-A5-postman.mjs` (matriz de rutas, carpeta `66`). La colección `postman/Bajonea-MVP.postman_collection.json` se regenera con los constructores, nunca a mano.
- **Estrés** nuevo `stress-locks-tramoTurnos.mjs`, registrado en `correr-estreses.mjs`, 8 o más rondas:
  1. Pagos simultáneos de pedidos del mismo comercio contra ediciones de horarios (el pago toma `pedido` y luego `horario` compartido por la FK; la edición toma `comercio` y `horario` exclusivo): sin `5xx`, sin `Deadlock found`, todos los pedidos con turno asignado.
  2. Pagos contra `cerrar`/`abrir`, bloqueo de cuenta y suspensión: sin `5xx`.
  3. `resumen-turno` en paralelo con pagos y cambios de estado: nunca una cifra que no coincida con la suma de la base en el mismo instante (se compara contra una lectura de control).
  4. Backfill (atajo) en paralelo con pagos nuevos: ningún pedido estampado queda pisado.
  5. Pago contra el vencimiento de pago y contra el webhook duplicado: un solo estampado.
  Más el runner completo de los estreses una vez (los 20 existentes no deberían cambiar).
- **Mutaciones ("las pruebas muerden"):** estampar con un segundo `now()` en lugar del mismo instante; no revisar `vigenteEn` al asignar (turno de otra versión); omitir `AND turno_fecha IS NULL` en el backfill; filtrar `Pendientes` por turno; devolver `comision` al Empleado; contar `PENDIENTE_PAGO` en el turno; usar `subtotal - cargo` como vendido; olvidar la cola de ayer en `turnoDe` (madrugada).

### A7. Verificación de la entrega A

`mvnw test` (las dos pasadas del proyecto), Newman completo desde base reseteada, Playwright de API, runner de estreses completo y mutaciones. Entregable: lista de archivos tocados, evidencia por punto y el costo medido de la agregación con 30000 pedidos. **Punto de corte: informe a Diego antes de la entrega B.**

---

## 4. Entrega B: pantallas y tests de UI

### Pantallas que necesitan mockup (Diego las elige antes de escribir una línea de frontend)

El sistema de diseño es el de `css/styles.css` (el panel hoy es una `stats-bar` de tres columnas con `stats-bar__value` y `stats-bar__label`). Las variantes dibujan "turno que cruza la medianoche" con el texto "20:00 a 02:00 (día siguiente)" (nunca "+1").

| # | Mockup | Qué tiene que definir | Variantes propuestas |
|---|---|---|---|
| **P1** | **Panel del Dueño** (`comercio-dashboard.html`) con "Vendido en el turno", comisión y neto | Dónde van el desglose y cuánto pesa cada número; qué es lo principal (el bruto) | **A (recomendada):** la `stats-bar` de tres columnas de hoy (Vendido en el turno, Pedidos del turno, Pendientes) y debajo una línea con "Comisión $X · Neto $Y". **B:** tarjeta destacada con "Vendido en el turno" en grande y el desglose (comisión, neto) debajo, y una fila con Pedidos y Pendientes. **C:** `stats-bar` de tres y el desglose en una hoja inferior que se abre al tocar "Vendido en el turno" |
| **P2** | **Panel del Empleado** | Cómo se ve sin comisión ni neto, sin que parezca que falta algo | **A (recomendada):** la misma `stats-bar` de P1-A sin la línea de desglose. **B:** la misma `stats-bar` con "Vendido en el turno" como única cifra monetaria y más aire. (No se propone mostrar un candado ni "solo el Dueño": el Empleado no tiene que saber que existe una comisión) |
| **P3** | **Rótulo del turno y estado sin turno** (Dueño y Empleado) | Cómo se distingue el turno en curso del último terminado; qué se muestra sin ningún turno | **Rótulo — A (recomendada):** línea sobre las métricas con punto de color y horario ("En curso · 20:00 a 02:00 (día siguiente)" / "Terminó · 12:00 a 15:00"); **B:** chip de estado a la derecha del saludo; **C:** banner informativo solo cuando el turno terminó. **Sin turno — A (recomendada):** rótulo "Sin turno por ahora", Vendido y Pedidos con guion y Pendientes con su cifra; **B:** las tres métricas en cero con la leyenda; **C:** se esconden Vendido y Pedidos y queda solo Pendientes |

**Hasta que Diego elija P1, P2 y P3, la entrega B no empieza.** Lo que no necesita mockup se puede adelantar (B1 y B3).

### B1. Datos y texto (sin mockup)

- `js/comercio.js`: `normalizarResumen` (`:84-93`) lee los campos nuevos y deja de elegir la etiqueta por rol (`etiquetaVentas` desaparece); la llamada pasa a `/pedidos/comercio/resumen-turno` (`:672`); el rótulo del turno usa `js/horarios.js` (texto "día siguiente") y `js/fechas.js`.
- `renderMetricas` (`:487-505`): rótulos "Vendido en el turno", "Pedidos del turno", "Pendientes"; el desglose solo si el resumen trae `comision` y `neto` (es decir, para el Dueño; el frontend no decide por `esContextoEmpleado()`, decide por la presencia del dato).
- Recarga programada al **fin del turno mostrado** (`setTimeout` hasta `turno.fin`), además de `pageshow` y `visibilitychange` que ya existen, para que el rótulo no quede viejo si el panel está abierto al cambiar de turno. Sin polling nuevo.

### B2. Panel (Dueño y Empleado) — **requiere P1, P2 y P3**

- `comercio-dashboard.html`: el contenedor de métricas pasa a tener slot de rótulo y slot de desglose; `css/styles.css` solo si la variante elegida lo necesita (sin comentarios).
- `docs/DATA-TESTID-FASE17.md`: `metricas-dashboard` se conserva; nuevos `turno-rotulo`, `turno-estado`, `metrica-vendido`, `metrica-comision`, `metrica-neto`, `metrica-pedidos`, `metrica-pendientes`.

### B3. Pruebas de UI

- Specs existentes a reescribir: `38-empleado-acceso-ui` (`:430-472`, `:1088`, `:1130`: rótulos "Ventas de hoy" y "Facturado hoy", y el encabezado de la ruta).
- Spec nuevo (siguiente número libre: `73`): `73-pedido-turno-ui.spec.ts`: Dueño ve vendido, comisión y neto y los números coinciden con `resumen-turno`; Empleado ve vendido y **no** ve comisión ni neto (ni en el DOM); turno en curso, último terminado y sin turno; rótulo del turno que cruza; "Pendientes" de un turno anterior sigue contando; recarga al fin del turno (con una franja que termina en pocos minutos o con el tiempo de la página adelantado); sin scroll horizontal a 375 px (`tests/helpers/layout.ts`); sin errores de consola.

### B4. Cierre del tramo

- Documentación: `CLAUDE.md` (§1bis, §5 `Pedido`, §6, §7.2: ruta delegable), `docs/DECISIONES.md` (una entrada por decisión), `docs/diccionario-de-datos.md` (tres columnas de `pedido`), `docs/APRENDIZAJES-TECNICOS.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (`horario` como hoja que ahora también toma la FK de `pedido`), `docs/LISTA-DE-DESPLIEGUE.md` (`V39`, el `ALTER` sobre `pedido`, el log del backfill y cuándo apagarlo), requisitos funcionales y historias del Dueño y del Empleado en `docs/entregables-01-02/` (hoy citan "Facturado hoy" y "Ventas de hoy"), `docs/MAPEO-ARCHIVOS-FASE2-T2.md`.
- Regresión completa: `mvnw test`, Newman, Playwright completo (inestables conocidos `01:101` y `27:497`) y todos los estreses.
- Checklist para Diego con evidencia por punto. **Sin commit hasta su confirmación.**

---

## 5. Orden de trabajo y dependencias

0. **Antes de empezar la entrega B:** Diego elige P1, P2 y P3. No frena la entrega A.
1. A1 (`V39`, entidad) → A2 (estampado) → A3 (resumen y baja del resumen de hoy) → A4 (backfill): el servidor queda completo.
2. A5 (Java) en paralelo con cada paso; A6 (API, Newman, estrés) y A7 (verificación). **Corte: informe a Diego.**
3. B1 puede empezar al cerrar A3; B2 y B3 esperan los mockups; B4 al final.
4. T3 a T5 no entran. T4 y T5 leen las columnas y los índices de esta `V39`.

## 6. Riesgos y puntos de atención

| # | Riesgo | Cómo se maneja |
|---|---|---|
| 1 | El `ALTER TABLE pedido` y la FK pueden copiar la tabla en la 10.4 del servidor | Se prueba en `bajonea_test`; se anota en la lista de despliegue; el `ADD COLUMN` nulo y los índices son aditivos. No se aplica en `practicas3` hasta que Diego arranque su backend |
| 2 | **Bloqueos:** `UPDATE pedido ... turno_horario_id` toma una lectura compartida de la fila de `horario` (FK) mientras la edición de horarios la toma exclusiva | `horario` es hoja debajo de `comercio`; el pago toma `pedido` y luego `horario`, la edición toma `comercio` y `horario` y nunca `pedido`: no hay ciclo. Lo cubren `TurnoEstampadoConcurrenciaIntegrationTest` y el escenario 1 del estrés, con mutación |
| 3 | El instante del historial y el de `fecha_pago_confirmado` se desfasan por un segundo y el turno se asigna a otro | Un solo `instante` por pago, pasado a las tres escrituras; prueba de igualdad contra el historial |
| 4 | El panel cambia de significado: el Dueño ve el bruto donde antes veía el neto | Decidido por Diego; se avisa en la entrega y el neto sigue visible en el desglose |
| 5 | **Observación sobre la decisión 4:** como los turnos se repiten cada semana, "último turno terminado dentro de 7 días" casi siempre encuentra uno (también para un comercio nuevo, porque las filas valen desde `2000-01-01`); `turno_*` solo queda `NULL` si el comercio no tiene ninguna fila vigente en esos 8 días | No es un defecto. La consecuencia es que el "agrupar por día" de los pedidos sin turno (T5) casi nunca se usa. Se deja como Diego lo decidió |
| 6 | La FK rompe los tests que hacen `DELETE FROM horario` si el comercio ya tiene un pedido con turno | Revisión caso por caso en A5 (los 7 lugares de la sección 0; en `CarritoIntegrationBase` y `CierreComercioIntegrationTest` el borrado es previo a crear pedidos). Si alguno falla, se ajusta el orden del test; la FK no se debilita |
| 7 | Pedidos pagados con anterioridad a `V39` sin `turno_*` no cuentan en el resumen hasta que corra el backfill | El panel y el backfill conviven: durante el arranque inicial de producción hay una ventana corta. Se documenta; el backfill corre en cuanto levanta el backend |
| 8 | Hoy el resumen se arma con todos los pedidos del comercio en memoria; la agregación nueva cambia el plan de consulta | Medición con 30000 pedidos (método de `docs/LISTA-DE-DESPLIEGUE.md`) y decisión sobre un índice `(comercio_id, estado)` para el conteo de pendientes |
| 9 | Pedidos creados por SQL en tests no tienen `turno_*` | Ningún test que los use consulta el resumen (sección 0); los specs nuevos crean los pedidos por el flujo real |
| 10 | El backfill reescanea cada arranque los pedidos que quedan `NULL` | Se apaga con la propiedad después de la primera corrida (lista de despliegue); el costo lo cubre el índice `(comercio_id, turno_fecha, ...)` |
| 11 | Cambios locales de Diego en `application.properties` y `Bajonea-Local.postman_environment.json` | No se tocan: las propiedades nuevas llevan su valor por defecto en el código y la de test va en `application-test.properties` |

## 7. Tests existentes que cambian de significado

| Test | Antes | Ahora |
|---|---|---|
| `PedidoNoRetiradoServiceTest:425-426` | Neto `9900` (Dueño) y bruto `10000` (Empleado) en `totalFacturadoHoy` | `vendido` = `10000` para los dos; `neto` = `9900` solo en el DTO del Dueño; los repositorios simulados cambian a la agregación nueva |
| `PedidoNoRetiradoHttpIntegrationTest:324-334` | Cuatro lecturas de `resumen-hoy` y `totalFacturadoHoy` (Dueño y Empleado, antes y después de cerrar como no retirado) | `resumen-turno` y `vendido`: la cifra sigue sin cambiar al pasar de listo a no retirado, ahora igual para los dos |
| `PedidoServiceVistaEmpleadoTest:253-269` | Conjunto de campos `{totalFacturadoHoy, cantidadPedidosHoy, cantidadPendientes}` del Empleado | Conjunto nuevo sin `comision` ni `neto` |
| `ClasificacionRutasComercioTest:68`, `PertenenciaCruzadaDelegablesIntegrationTest` | `GET .../resumen-hoy` delegable | `GET .../resumen-turno` delegable (siguen 24) |
| `21-multicomercio-tramo1.spec.ts:131,158-160,206,328-331` | `cantidadPedidosHoy` | `cantidadPedidos` y la ruta nueva |
| `37-empleado-acceso-api.spec.ts:89,129,328,452-477` | `CAMPOS_RESUMEN`; el Dueño recibe el neto y el Empleado el bruto en el mismo campo | Campos nuevos; `vendido` bruto para los dos, `neto` solo para el Dueño; "sin comisión" para el Empleado |
| `38-empleado-acceso-ui.spec.ts:430-472,1088,1130` | Rótulos "Ventas de hoy" (Empleado) y "Facturado hoy" (Dueño); "Pedidos hoy"; encabezado de la ruta | "Vendido en el turno" para los dos, desglose solo del Dueño, "Pedidos del turno" |
| `47-pedidos-no-retirado-api.spec.ts:236-239` | `totalFacturadoHoy` neto/bruto | `vendido` y `neto` |
| `50-empleado-matriz-delegable-api.spec.ts:59`, `59-equipo-gestion-empleado-ui.spec.ts:591` | Solo nombran la ruta | Ruta nueva |
| Newman: `build-empleado-tramoE2` (`:329-351,398,434,510-519`), `build-multicomercio-tramo1` (`:211-254,365-371`), `build-pedidos-no-retirado-tramoE3-A4b` (`:283-343`), `build-empleado-tramoE3-A5` (`:256`, matriz de la carpeta `66`) | `resumen-hoy`, `totalFacturadoHoy`, `cantidadPedidosHoy`, "Facturado neto" | Ruta y campos nuevos; los textos "Facturado neto" y "bruto" se reescriben |
| Estreses `stress-locks-empleado-e2.mjs:167` y `stress-locks-tramoE3-A4b.mjs:249` | Lectura de `resumen-hoy` | Lectura de `resumen-turno` |
| Documentos que citan los rótulos | `CLAUDE.md`, `docs/entregables-01-02/requisitos-funcionales-*.md`, `CAMBIOS.md`, `testing/playwright/README.md` | Rótulos nuevos |

## 8. Qué necesito de Diego

1. **Elegir P1, P2 y P3** (tabla de la entrega B). Puede hacerse mientras corre la entrega A.
2. **Confirmar dos detalles chicos del backend:** (a) el backfill de `turno_*` corre una vez al arrancar el backend y se apaga con una propiedad después de la primera corrida (recomendado), en lugar de una tabla de "procesos ya ejecutados"; (b) la FK de `pedido.turno_horario_id` queda sin cascada (recomendado: un pedido con turno nunca puede quedar apuntando a una fila borrada).
3. Nada más antes de empezar la entrega A: no hay que revisar datos en `practicas3` para este tramo (el backfill de `turno_*` es de aplicación, no de SQL).

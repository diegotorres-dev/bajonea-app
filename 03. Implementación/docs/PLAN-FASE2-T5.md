# Plan del Tramo T5 de la Fase 2: estadísticas del Dueño (2026-10-24)

Plan de trabajo, sin código todavía. Sale de `docs/AUDITORIA-FASE2-TURNOS.md` (punto 8: secciones 7, 9 y 10; "aud. N" = sección N), de las decisiones de Diego para este tramo y de una relectura del código **tal como quedó después de T4** (último commit `eb79138`). Formato como `docs/PLAN-FASE2-T3.md`: verificación previa, decisiones fijadas, reglas de dominio, entrega A (backend, tests y estrés), entrega B (pantalla y tests de UI), orden, riesgos y tests que cambian de significado. Un commit solo cuando Diego confirme.

Reglas de este tramo: ningún `.html`, `.css`, `.js` ni `.ts` nuevo o tocado lleva comentarios (`CLAUDE.md` §4.11); las entidades no llevan comentarios (§4.8); no se ejecuta ninguna migración fuera de `bajonea_test` (este tramo **no tiene migración**); no se toca `application.properties` ni `Bajonea-Local.postman_environment.json` (cambios locales de Diego).

---

## 0. Verificación previa (hecha hoy, solo lectura, más una medición en `bajonea_test`)

| Pregunta | Resultado |
|---|---|
| Migración | **Ninguna.** `V39` ya agregó `pedido.fecha_pago_confirmado`, `turno_fecha`, `turno_horario_id` y los índices `idx_pedido_turno (comercio_id, turno_fecha, turno_horario_id)` e `idx_pedido_fecha_pago (comercio_id, fecha_pago_confirmado)`. La última migración es `V41` (T4). La auditoría ya lo anticipaba (aud. 7.c) |
| Qué filas tienen turno | Todo pedido que llegó pagado: `confirmarPagoAprobado` estampa `fecha_pago_confirmado` y el turno (`TurnoPedidoService.asignar`). Los que **nunca se pagaron** (`PENDIENTE_PAGO`, `CANCELADO_POR_SISTEMA` con `TIMEOUT_PAGO`) tienen las tres columnas en `NULL` y **no entran** a las estadísticas: la condición `turno_fecha` en rango (o `fecha_pago_confirmado` en rango) los deja afuera sin un filtro extra. Los pagados de un comercio sin franjas, o anteriores al backfill, tienen `turno_*` en `NULL` pero sí `fecha_pago_confirmado`: son los "sin turno" de Diego |
| Cifras que se reutilizan | `ResumenTurnoService` (panel y cierre de turno): lista `ESTADOS_FACTURADOS` (`EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `NO_RETIRADO`; hoy `static final` de paquete), `vendido` = suma de `subtotal` de los facturables, `comision` = suma de `cargo_servicio_comercio`, `neto` = diferencia, `cantidadPedidos` = `COUNT(*)` de todos los del turno (cualquier estado). Se reutilizan **la lista y las definiciones**, no el método: `cifras(...)` agrega **un** turno por llamada y pediría una consulta por turno. La coincidencia con el panel y el mail la fija un test (A5) |
| Consulta existente a imitar | `PedidoRepository.agregarTurno` (JPQL con `sum(case when p.estado in :facturables ...)`). La nueva agrupa además por `estado` y devuelve filas `(turno_fecha, turno_horario_id, estado, cantidad, vendido, comision)` |
| **Literal viejo `PENDIENTE` en el ENUM** | `SHOW COLUMNS` en `bajonea_test` confirma que `pedido.estado` conserva `PENDIENTE` (V6 no lo quita) y que el enum Java `EstadoPedido` **no lo tiene** (`EnumsContraBaseDeDatosIntegrationTest` lo tolera con `Set.of("PENDIENTE")`). Una consulta JPQL que proyecte `p.estado` revienta al leer una fila con ese literal. **La consulta de estadísticas tiene que ser nativa y devolver el estado como `String`** (el literal viejo se cuenta como "en curso"). En `bajonea_test` hoy no hay filas con `PENDIENTE`; en `practicas3` puede haberlas (sin verificar) |
| Estados de un pedido pagado | `PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR` (en curso); `ENTREGADO`, `NO_RETIRADO` (facturados y terminados); `RECHAZADO`, `ANULADO`, `CANCELADO`, `CANCELADO_POR_SISTEMA` (por suspensión del comercio, ya pagado), `EXPIRADO` (el comercio no respondió) |
| Ruta y seguridad | Cualquier mapping nuevo bajo `/api/v1/comercios/**` hereda el matcher `hasRole("DUENO")`; el Empleado (un Cliente con relación) y el Administrador reciben `403`. Fuera de `DelegacionEmpleado` (siguen **24** rutas delegables). `ClasificacionRutasComercioTest` falla al arrancar si el mapping no está clasificado: hay que sumar `exclusivo("GET /api/v1/comercios/estadisticas")`. El método del controller lleva `ComercioActivo` como **primer parámetro** (regla de A2) y usa `X-Comercio-Id` (por comercio, no por Dueño) |
| Cómo se arma una pantalla del Dueño | Las vistas del perfil viven dentro de `comercio-perfil.html` (`view-equipo`, `view-editar-horarios`, ...) con su módulo (`js/equipo-comercio.js`, importado por `js/comercio.js`); cada fila de la lista nace `disabled` y se habilita al final de `initComercioPerfil` (carrera conocida: toda fila nueva se suma a esa lista y a `IDS_ACCIONES_PERFIL` de `36-empleado-invitacion-ui.spec.ts:617`). Para el Empleado `prepararVistasDelPerfil(true)` quita del DOM la sección del Dueño, así que una fila nueva en esa sección **no aparece** para el Empleado sin código extra. Hay módulos de dibujo con `h`/`crearSvg` (`js/form-utils.js`), `segmented-control` y `stats-bar` en `css/styles.css`, `textoRangoTurno`/`formatearPrecio` en `js/turno-resumen.js` (este último no se exporta) y `diaDeHoyEnZonaComercio` en `js/fechas.js`. **No hay ninguna librería de gráficos** (frontend vanilla) |
| Cómo se prueban los volúmenes | Método de T4 (`stress-locks-tramoCierreTurno.mjs`, escenario 4): `INSERT ... SELECT` con `seq_1_to_N` de MariaDB sobre `bajonea_test`, medición, borrado. Reutilizo el método |

### Medición con 30000 pedidos (hecha hoy)

Base `bajonea_test` (MariaDB 10.4.32). Peor caso a propósito: **un solo comercio** con 30000 pedidos pagados repartidos en 119 días, dos turnos por día, 4 % sin turno, estados mezclados (50 % entregados) y 900 pedidos más que nunca se pagaron (30900 filas del comercio). Tres corridas cada consulta; los tiempos son del servidor de base de datos, sin el recorrido en Java ni la red:

| Consulta | Filas devueltas | Tiempo |
|---|---|---|
| Por turno y estado, 7 días | 126 | 3,6 a 7,0 ms |
| Por turno y estado, 30 días | 540 | 11,3 a 23,8 ms |
| Por turno y estado, 92 días (el tope) | 1656 | 33 a 45 ms |
| Sin turno, por día de pago y estado, 92 días | 263 | 2,6 a 4,5 ms |
| Sin turno, 7 días | 20 | 1,8 a 3,9 ms |

`EXPLAIN`: las dos consultas usan `idx_pedido_turno` (la de "sin turno" con `comercio_id` y `turno_fecha IS NULL`, ~2100 filas estimadas; la de rango con `comercio_id` y condición de índice sobre `turno_fecha`, ~14000 estimadas, `Using temporary; Using filesort` por el `GROUP BY` sobre 540 a 1656 grupos). Con `FORCE INDEX` y con literales en vez de variables el plan y los tiempos son los mismos. **El costo escala con el historial total del comercio más que con el rango pedido** (recorre las entradas del comercio en el índice); con 30900 filas sigue lejos de ser un problema. **Conclusión: no hace falta ningún índice nuevo** (un índice cubriente con `estado`, `subtotal` y `cargo_servicio_comercio` ensancharía una tabla caliente por un beneficio que hoy no se necesita). Lo que sí queda para A6: medir el recorrido completo por HTTP con el escenario de volumen. Los datos sintéticos se borraron: `bajonea_test` volvió a 375 pedidos y 990 comercios, sin restos.

Sin verificar a propósito: el costo en Java de mapear hasta ~1700 filas y armar la respuesta (se mide en A6); y el comportamiento en `practicas3` (volumen real y filas con `PENDIENTE`).

---

## 1. Decisiones fijadas que mandan en este tramo

| Tema | Decisión |
|---|---|
| Quién | Solo el Dueño. Exclusivo: fuera de `DelegacionEmpleado`; Empleado y Administrador reciben `403`, sin token `401` |
| Alcance | Por comercio (`X-Comercio-Id`, obligatorio para el Dueño: sin header `400`, no numérico `400`, comercio ajeno `404`), nunca un total de todos los comercios del Dueño |
| Qué muestra | Flujo de pedidos y cuánto fue ganando: por turno o por día, pedidos por resultado final, vendido, comisión y neto, y ticket promedio |
| Rangos | Dos botones fijos en la pantalla (últimos 7 y 30 días) y un selector "por día / por turno". La API es general: `desde` y `hasta`, tope de **92 días** (inclusive) |
| Fuente | Consultas de agregación sobre `pedido` con `turno_fecha` y `turno_horario_id`; los pagados sin turno se agrupan por `DATE(fecha_pago_confirmado)` |
| Gráficos | CSS o SVG a mano, sin librerías |
| Migración | Ninguna. Sin índices nuevos (sección 0) |
| Fuera del tramo | Estadísticas de Empleado (cada uno ve las suyas), total del Dueño entre comercios, exportación a CSV, comparación con el período anterior, productos más vendidos, horarios pico, estadísticas por producto, gráficos interactivos |

---

## 2. Reglas de dominio que el tramo implementa

### 2.1 Contrato

`GET /api/v1/comercios/estadisticas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&agrupar=DIA|TURNO` (`agrupar` por defecto `DIA`).

- `400` si falta `desde` o `hasta`, si el formato no es de fecha, si `desde > hasta`, si el rango (ambos extremos inclusive) supera 92 días ("El rango no puede superar los 92 días") o si `agrupar` no es uno de los dos valores. `hasta` en el futuro **no** es error (no hay datos y evita un `400` por un reloj de dispositivo adelantado).
- Respuesta (`ApiResponse`, mensaje "Estadísticas obtenidas correctamente"): `desde`, `hasta`, `agrupar`, `totales` y `periodos`.
- `totales` y cada período llevan: `pedidos` (los que llegaron pagados, de cualquier estado), `facturados` (los de estado facturable), `vendido`, `comision`, `neto`, `ticketPromedio` y `resultados`.
- `resultados` es un mapa con las siete categorías siempre presentes (en cero si no hay): `ENTREGADO`, `NO_RETIRADO`, `RECHAZADO`, `CANCELADO` (`CANCELADO` y `CANCELADO_POR_SISTEMA`), `ANULADO`, `EXPIRADO` y `EN_CURSO` (`PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR` y el literal viejo `PENDIENTE`). La API no expone nombres de estados internos del pedido: expone una categoría de resultado (enum `CategoriaResultadoPedido`), y el frontend traduce a texto.
- `periodos` (de la fecha más vieja a la más nueva): con `agrupar=DIA`, **todos** los días del rango (los vacíos con ceros, para que el eje del gráfico sea continuo), con `fecha`. Con `agrupar=TURNO`, solo los turnos con pedidos, con `fecha` (la de apertura), `turno` (`horarioId`, `inicio`, `fin`, `cruzaMedianoche`, armados con las mismas reglas que `TurnoResumenResponseDTO`) y, para los pagados sin turno de un día, **un período más de ese día con `turno = null`** (el frontend lo rotula "Sin turno asignado").

### 2.2 Cómo se agrupa y se suma

1. Una consulta nativa por turno: `SELECT turno_fecha, turno_horario_id, estado, COUNT(*), SUM(subtotal), SUM(cargo_servicio_comercio) FROM pedido WHERE comercio_id = ? AND turno_fecha BETWEEN ? AND ? GROUP BY turno_fecha, turno_horario_id, estado`. `vendido` y `comision` se suman en Java solo para los estados facturables (los mismos de `ResumenTurnoService`, que pasan a ser públicos o a vivir en un solo lugar para que no haya dos listas).
2. Una consulta nativa para los sin turno: `... WHERE comercio_id = ? AND turno_fecha IS NULL AND fecha_pago_confirmado >= ? AND fecha_pago_confirmado < ? GROUP BY DATE(fecha_pago_confirmado), estado` (el rango de `fecha_pago_confirmado` es el de la consulta y queda sargable; `DATE()` solo en el `SELECT` y el `GROUP BY`).
3. Una lectura de los `horario` referenciados (`findAllById` de los `turno_horario_id` que aparecieron) para `inicio`, `fin` y `cruzaMedianoche`; son filas-versión, así que sirven aunque los horarios se hayan editado después.
4. **Agrupar por día** suma en Java los turnos de la misma `turno_fecha` más los "sin turno" de esa fecha de pago. El día es el de **apertura del turno** (igual que el panel y el mail): un pedido pagado a la 01:00 de un turno que abrió ayer cuenta en ayer. Es una decisión a confirmar (D2).
5. `neto = vendido - comision`. `ticketPromedio = vendido / facturados`, `HALF_UP` a 2 decimales, `null` con 0 facturados (el frontend muestra el guion de T2). El ticket es bruto, como "Vendido".
6. Las estadísticas son **vivas**, no una foto: si un pedido `EN_PREPARACION` se anula después, `vendido` baja. El mail de cierre de turno (T4) es una foto y puede diferir del número actual del mismo turno. Es esperado y se explica en el riesgo 4.

### 2.3 Concurrencia

Lectura pura en una transacción `readOnly`, sin bloqueos (REPEATABLE READ: las dos consultas ven la misma foto). No toma `pedido`, `comercio` ni `horario`, no cambia el orden global. Una estadística nunca ve un cierre a medias porque lee `pedido` directamente (aud. 7.e).

---

## 3. Entrega A: backend, tests y estrés

### A1. DTOs, enum y constantes

- `CategoriaResultadoPedido` (7 valores) con su mapeo desde el nombre del estado (`String`, incluido el literal viejo `PENDIENTE`; un valor desconocido se cuenta como `EN_CURSO` y se registra con `log.warn`, nunca rompe la respuesta).
- `EstadisticasComercioResponseDTO`, `PeriodoEstadisticasResponseDTO`, `TotalesEstadisticasResponseDTO` (o un tipo común para totales y período) y reutilización de `TurnoResumenResponseDTO` para el turno.
- `ResumenTurnoService.ESTADOS_FACTURADOS` pasa a ser accesible (público o movido a `EstadoPedido`/una clase de constantes) y el servicio nuevo lo usa; ningún tercer lugar define "facturable".
- Hecho cuando: compila y un test de enum fija el mapeo de los 12 estados Java y del literal viejo.

### A2. Repositorio

- Dos métodos nativos en `PedidoRepository` con proyecciones de interfaz (`FilaEstadisticaTurno`, `FilaEstadisticaDia`): estado como `String`, cantidad `Long`, montos `BigDecimal` (nulos se tratan como cero).
- Hecho cuando: el `EXPLAIN` de las dos consultas desde un test de integración sobre `bajonea_test` usa `idx_pedido_turno` (el test lo comprueba leyendo el plan, para que un cambio de índice futuro lo rompa a propósito).

### A3. Servicio

- `EstadisticasComercioService` (`@Transactional(readOnly = true)`): valida parámetros (excepción de validación mapeada a `400` con los textos de 2.1), ejecuta las dos consultas, lee los horarios, arma períodos y totales, rellena los días vacíos y calcula neto y ticket.
- Hecho cuando: los casos de 2.2 dan los números esperados con datos armados a mano.

### A4. Controller y seguridad

- `EstadisticasComercioController` (`/api/v1/comercios/estadisticas`, `ComercioActivo` primero, `@RequestParam` de `desde`, `hasta`, `agrupar`). `SecurityConfig` no cambia (el matcher `hasRole("DUENO")` de `/api/v1/comercios/**` ya cubre la ruta).
- `ClasificacionRutasComercioTest`: `exclusivo("GET /api/v1/comercios/estadisticas")`.
- Hecho cuando: Dueño `200`; Empleado, Cliente sin relación y Administrador `403`; sin token `401`; sin header `400`; header no numérico `400`; comercio de otro Dueño `404`.

### A5. Pruebas Java

- **Nuevos:**
  - `EstadisticasComercioServiceTest` (repositorios simulados): validaciones (rango de 92 contra 93, `desde > hasta`, `agrupar` inválido, faltantes), `HALF_UP` del ticket, ticket nulo con 0 facturados, neto, relleno de días, mapeo de categorías, literal viejo `PENDIENTE`, estado desconocido.
  - `EstadisticasComercioIntegrationTest` (contra `bajonea_test`, datos por SQL): turnos que cruzan la medianoche (día de apertura), dos turnos el mismo día, pedidos sin turno (por día de pago), un día con turno y sin turno mezclados, pedidos nunca pagados fuera, otro comercio del mismo Dueño sin mezclar, rango con bordes inclusivos, fila con estado `PENDIENTE` por SQL (no revienta), horario editado después (el turno conserva su versión), **coincidencia con `ResumenTurnoService.cifras` y con el cierre de turno** (`vendido`, `comision`, `neto`, `pedidos` del mismo turno), y el plan de las consultas (A2).
  - `EstadisticasComercioHttpIntegrationTest`: roles y códigos de A4, forma de la respuesta y mensajes de `400`.
- **Ajustados:** `ClasificacionRutasComercioTest` (una línea). Ninguno otro.

### A6. Pruebas de API, Newman y estrés

- **Playwright API** (siguiente número libre: `78`): `78-estadisticas-api.spec.ts`. Datos en dos capas: algunos pedidos por el flujo real (`crearPedido` + `confirmarPagoTest`, como el spec `71`) para probar que lo que el panel cuenta llega a las estadísticas, y el resto por SQL (`sqlTest`) para fechas pasadas, estados terminales y turnos que cruzan la medianoche. Casos: totales y períodos exactos contra la suma hecha en el propio test; modo `DIA` con días vacíos; modo `TURNO` con dos turnos y un "sin turno"; las siete categorías; pedido anulado después que baja `vendido`; rangos 7/30/92/93; parámetros inválidos; seguridad de A4; comercio con cero pedidos (todo en cero, `ticketPromedio` nulo); un Dueño con dos comercios (cada uno ve lo suyo, `X-Comercio-Id` distinto); una cuenta de Empleado del mismo comercio recibe `403`.
- **Newman:** constructor nuevo `build-estadisticas-tramoT5-postman.mjs`, carpeta `77` (va **última**; la `76` es la de T4). Los constructores existentes no se tocan.
- **Estrés** nuevo `stress-locks-tramoEstadisticas.mjs`, registrado en `correr-estreses.mjs` como `estadisticas`. No toma locks, así que sus escenarios son de **consistencia con escrituras y de volumen**, no de orden de bloqueo:
  1. Ráfagas de lecturas de estadísticas mientras corren pagos, aceptar/rechazar/anular, ediciones de horarios y cierres de turno: ningún `5xx`, ningún `Deadlock found`, y en cada respuesta `sum(periodos) == totales` y `sum(resultados) == pedidos`.
  2. Con el backend quieto al final, `totales` y cada período coinciden con un `SELECT` independiente sobre la base (y con `resumen-turno` para el último turno).
  3. Dos Dueños en paralelo: ninguno ve datos del otro.
  4. **Volumen** (como el escenario 4 de T4): 30000 pedidos en un comercio, tiempos HTTP de 7, 30 y 92 días en ambos modos, 20 repeticiones, **p95 por debajo de los 300 ms para 92 días por turno** (objetivo a confirmar con la medición; la de la base fue de 45 ms), y borrado de los datos sintéticos en `finally`.
- **Mutaciones ("las pruebas muerden"):** omitir el filtro por `comercio_id`; contar pedidos nunca pagados; otra lista de facturables; `neto` sin restar la comisión; ticket dividido por `pedidos` en vez de `facturados`; rango exclusivo en el borde; ignorar la rama de los sin turno; contar dos veces un día con turno y sin turno; agrupar el día por la fecha de pago en vez de la de apertura; no rellenar los días vacíos; límite de 92 corrido en uno; truncar en vez de `HALF_UP`; quitar la ruta de `exclusivo` (el Empleado entra); proyectar `p.estado` como enum (revienta con `PENDIENTE`).

### A7. Verificación de la entrega A

`mvnw test` (las dos pasadas del proyecto), Newman completo desde base reseteada, Playwright de API, runner de estreses completo (incluido `estadisticas`, y los demás para confirmar que no cambian) y mutaciones. Entregable: lista de archivos tocados, evidencia por punto y los tests que cambian de significado de la sección 7 (ninguno de resultado). **Punto de corte: informe a Diego antes de la entrega B.**

---

## 4. Entrega B: pantalla y tests de UI

### Pantallas que necesitan mockup (Diego las elige antes de escribir una línea de frontend)

El sistema de diseño es el de `css/styles.css` (`stats-bar`, `segmented-control`, tarjetas, puntito más texto para estados). Sin colores de fondo nuevos para los avisos. Dueño en 375 px como pantalla de referencia.

| # | Mockup | Qué tiene que definir | Variantes propuestas |
|---|---|---|---|
| **M1** | **La pantalla de estadísticas** (contenido, gráfico y orden) | Qué hay arriba, cómo se dibuja "cuánto fue ganando", cómo se ven los resultados de los pedidos, y qué pasa en 375 px con 30 días por turno (hasta ~60 barras) | **A (recomendada):** encabezado con el nombre del comercio; selector de rango (7 / 30 días) y de agrupación (por día / por turno) como dos `segmented-control`; cuatro tarjetas en 2×2 (Vendido, Neto, Pedidos, Ticket promedio; la comisión como subtexto del Neto); gráfico de barras de "Vendido" por período, con la parte inferior de cada barra más oscura para el neto, y debajo "Cómo terminaron los pedidos" (siete filas con barra de proporción y cantidad) y, al pie, el detalle por período como lista (fecha o turno, pedidos, vendido, neto). **B:** mismo orden pero con la `stats-bar` de tres columnas (Vendido, Neto, Pedidos) y el ticket promedio como una línea aparte, y el gráfico apilado neto / comisión. **C:** sin gráfico grande: una lista de períodos donde cada fila trae una mini barra horizontal proporcional al vendido, arriba los totales y al pie los resultados; escala sola a 60 períodos, pero es la menos "gráfica". Cada variante debe resolver 60 barras: ancho mínimo de barra con desplazamiento interno del gráfico (no de la página), o agrupación visual por día en el modo turno |
| **M2** | **Dónde se entra desde el perfil del Dueño** | Posición y forma de la entrada, y si abre una vista interna o una página propia | **A (recomendada):** una fila nueva "Estadísticas" en la lista del perfil del Dueño, entre "Editar horarios" y "Ver datos legales" (ícono de barras), que abre una vista dentro de `comercio-perfil.html` como "Ver equipo" (botón de volver, mismo guard de contexto Dueño, el Empleado no la tiene porque no ve esa sección). **B:** la misma fila con un subtítulo "Vendido en los últimos 7 días: $X", que obliga a una consulta de estadísticas extra cada vez que se abre el perfil. **C:** la misma fila, pero abre una página propia `comercio-estadisticas.html` (permite entrar por dirección directa y probar sin pasar por el perfil, a costa de un guard, un encabezado y un comportamiento de volver propios) |
| **M3** | **El estado sin datos** | Cómo se ve cuando el rango no tiene pedidos (comercio nuevo o semana sin ventas) y qué se ofrece | **A (recomendada):** misma pantalla con los selectores activos y las tarjetas en "$0" / "–"; el gráfico y las listas se reemplazan por un bloque de estado vacío ("Todavía no hay pedidos en estos 7 días") con un botón "Ver los últimos 30 días" cuando hay otro rango disponible; el comercio que nunca vendió muestra el texto sin botón. **B:** estado vacío a pantalla completa, sin selectores ni tarjetas. **C:** gráfico con ejes y las barras en cero, más una línea de texto debajo |

Los estados de carga (esqueletos, como pide el proyecto en vez de datos fijos) y de error (banner con "Reintentar") no necesitan mockup: usan los patrones existentes.

**Hasta que Diego elija M1, M2 y M3 la entrega B no empieza.** La entrega A no depende de ninguno.

### B1. Entrada y vista

- Según M2: fila nueva en `comercio-perfil.html` (nace `disabled`, se habilita al final de `initComercioPerfil` y se suma a `IDS_ACCIONES_PERFIL` del spec `36`), vista `view-estadisticas`, enlace de volver, y un módulo `js/estadisticas.js` importado por `js/comercio.js` (patrón de `js/equipo-comercio.js`; sin crecer más el archivo de 3366 líneas).
- `js/fechas.js` suma un helper para "hace N días" en la zona del comercio (junto a `diaDeHoyEnZonaComercio`); `formatearPrecio` de `js/turno-resumen.js` se exporta para no duplicarlo una vez más.

### B2. Datos y estado

- Un `apiFetch` a `/comercios/estadisticas` con `desde`, `hasta` y `agrupar` (el header `X-Comercio-Id` lo agrega `js/api.js` solo a las rutas de `RUTAS_DEL_DUENO`, una expresión regular con lista cerrada: `comercios/(perfil|redes-sociales|cerrar|abrir|equipo)` entre otras; **verificado que `comercios/estadisticas` no está**, así que hay que sumarla o el Dueño recibiría `400` por header ausente).
- Rangos: 7 días = hoy menos 6 a hoy; 30 días = hoy menos 29 a hoy (ambos en la zona del comercio). Sin sondeo de 15 s: es un reporte, se pide al abrir la vista y al cambiar un selector; el resultado de cada combinación vive en memoria mientras la vista esté abierta.
- Al cambiar de comercio con el selector, la vista se rehace con el comercio nuevo (o se cierra). Los `404` y `403` siguen el manejo global de pérdida de acceso.

### B3. Gráficos y texto

- Gráfico de barras en SVG armado con `crearSvg` (o barras en CSS según M1), colores con las variables de `styles.css`, `role="img"` con un resumen en `aria-label` y la lista de períodos como alternativa textual para quien no ve el gráfico. Etiquetas de los períodos: día "12/10", turno "12/10 20:00 a 02:00 (día siguiente)" (nunca "+1"), sin turno "Sin turno asignado".
- Texto de ayuda breve: "El día corresponde al turno que abrió ese día". Textos de resultado en lenguaje del Dueño ("Entregados", "No retirados", "Rechazados", "Cancelados", "Anulados", "Sin respuesta" para `EXPIRADO`, "En curso"); ningún nombre interno de estado.
- Montos en formato argentino, sin decimales como el resto del panel; ticket promedio redondeado igual.
- `docs/DATA-TESTID-FASE17.md`: `btn-estadisticas`, `view-estadisticas`, `estadisticas-rango-7`, `estadisticas-rango-30`, `estadisticas-agrupar-dia`, `estadisticas-agrupar-turno`, `estadisticas-vendido`, `estadisticas-neto`, `estadisticas-comision`, `estadisticas-pedidos`, `estadisticas-ticket`, `estadisticas-grafico`, `estadisticas-resultados`, `estadisticas-periodos`, `estadisticas-vacio`, `estadisticas-error`.

### B4. Pruebas de UI

- Spec nuevo (siguiente número libre: `79`): `79-estadisticas-ui.spec.ts`. El Dueño abre la vista desde el perfil; cifras visibles contra datos sembrados; cambio de 7 a 30 días y de día a turno (con la respuesta real, no simulada, más un caso con `page.route` para el estado de error y el reintento); estado sin datos con y sin botón al otro rango; días vacíos en el gráfico; turno que cruza la medianoche rotulado "(día siguiente)"; "Sin turno asignado"; el Empleado no ve la fila; un Dueño con dos comercios ve los datos del activo y se rehace al cambiar; sin scroll horizontal a 375 px (`tests/helpers/layout.ts`) incluso con 30 días por turno; sin errores de consola.
- Corrida de verificación de los specs que enumeran el perfil del Dueño (`36`, `38`, `53`, `55`, `58`).

### B5. Cierre del tramo

- Documentación: `CLAUDE.md` (§1bis, tramo T5; §6 si corresponde), `docs/DECISIONES.md` (una entrada por decisión: D1 a D6 de la sección 8), `docs/APRENDIZAJES-TECNICOS.md` (consulta nativa por el literal viejo `PENDIENTE`; el costo escala con el historial del comercio), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (lectura pura, sin bloqueos), `docs/DATA-TESTID-FASE17.md`, requisitos funcionales y historias del Dueño en `docs/entregables-01-02/` (con `CAMBIOS.md`), `docs/MAPEO-ARCHIVOS-FASE2-T5.md`, `docs/PROGRESO-FASE2-T5.md` y `testing/playwright/README.md`. El diccionario de datos **no cambia** (sin migración).
- Regresión completa: `mvnw test`, Newman, Playwright completo (inestables conocidos `01:101`, `27:497` y `52:437`) y todos los estreses.
- Checklist para Diego con evidencia por punto. **Sin commit hasta su confirmación.**

---

## 5. Orden de trabajo y dependencias

0. **Antes de la entrega B:** Diego elige M1, M2 y M3. No frena la A.
1. A1 → A2 → A3 → A4: el servidor queda completo. A5 en paralelo con cada paso; A6 y A7 al final. **Corte: informe a Diego.**
2. B1 a B3 esperan los mockups; B4 al final de ellos; B5 cierra.
3. Es el último tramo de la Fase 2: al confirmarse T5 se puede cerrar la Fase 2 completa (T1 a T5) en `CLAUDE.md` si Diego lo decide.

---

## 6. Riesgos y puntos de atención

| # | Riesgo | Cómo se maneja |
|---|---|---|
| 1 | **Literal viejo `PENDIENTE` del ENUM**: una consulta JPQL que proyecte el estado como enum revienta con esa fila (en `practicas3` puede haberlas; en `bajonea_test` no) | Consulta nativa con estado `String`, `PENDIENTE` y cualquier valor desconocido cuentan como "en curso" con `log.warn`; test de integración con una fila por SQL; una mutación lo cubre |
| 2 | **Qué es un "día"**: por fecha de apertura del turno (igual que el panel y el mail) un pedido pagado a la 01:00 cuenta en el día anterior, distinto del día calendario | D2; texto de ayuda en pantalla; los "sin turno" van por el día calendario del pago (la única fecha que tienen), así que en un mismo día pueden mezclarse las dos reglas. Documentado, probado con un caso de cada una |
| 3 | **Las estadísticas son vivas, el mail de T4 es una foto**: el mismo turno puede mostrar un `vendido` distinto si después se anula o se rechaza algo ya aceptado | Se documenta y se explica en `docs/DECISIONES.md`; la pantalla no promete coincidir con el mail. El test de coincidencia (A5) compara contra el panel y el cierre **sin cambios posteriores** |
| 4 | **Costo con el historial del comercio**: la consulta recorre las entradas del comercio en `idx_pedido_turno` y filtra el rango con condición de índice; el costo crece con la antigüedad del comercio, no con el rango | Medido hoy: 45 ms para 92 días con 30900 filas de un solo comercio. Sin índice nuevo. El escenario de volumen de A6 fija un p95 y un `EXPLAIN` fija el plan; si algún día hiciera falta, un índice cubriente es una migración aparte |
| 5 | **Pedidos anteriores al backfill o de comercios sin franjas** tienen `turno_*` en `NULL` | Cubiertos por la rama de los "sin turno"; en modo turno aparecen como "Sin turno asignado" |
| 6 | **Rango calculado con el reloj del dispositivo**: un teléfono con la hora mal armaría un rango corrido en un día | `hasta` en el futuro no es error; el rango se arma con la zona de Ushuaia (`diaDeHoyEnZonaComercio`) como el resto del frontend. La alternativa de un parámetro `dias` resuelto por el servidor evita el problema, pero cambia el contrato que Diego describió (D3) |
| 7 | **Pantalla con muchos períodos** (30 días por turno son ~60 barras en 375 px) | M1 lo obliga a resolverlo; B4 verifica que la página no haga scroll horizontal |
| 8 | **Tamaño de la respuesta** en 92 días por turno (cientos de períodos, cada uno con siete categorías) | Unas decenas de KB; la pantalla solo pide 7 y 30 días. No se pagina |
| 9 | **Lista de filas del perfil**: una fila nueva sin habilitarse a tiempo repite la carrera conocida del perfil | La fila nace `disabled` y se habilita al final de `initComercioPerfil`; se agrega a `IDS_ACCIONES_PERFIL` y la corrida de B4 la verifica |
| 10 | **Datos de prueba de `practicas3`**: las estadísticas de comercios de demostración serán poco informativas | Sin impacto funcional. Si Diego quiere datos de muestra para ver la pantalla, es una tarea aparte con SQL (no la hago salvo que la pida) |
| 11 | Cambios locales de Diego en `application.properties` y `Bajonea-Local.postman_environment.json` | No se tocan: este tramo no necesita propiedades nuevas |

## 7. Tests existentes que cambian de significado

**Ninguno cambia de resultado.** El tramo es aditivo: una ruta nueva, una consulta nueva, una vista nueva y ninguna columna ni propiedad nueva.

| Dónde | Qué | Estado |
|---|---|---|
| `ClasificacionRutasComercioTest` | Falla al arrancar con un mapping nuevo sin clasificar | Se le suma `exclusivo(...)`; las 24 rutas delegables no cambian |
| `36-empleado-invitacion-ui.spec.ts:617` (`IDS_ACCIONES_PERFIL`) | Espera que las acciones del perfil del Dueño estén habilitadas | Se suma `btn-estadisticas` para no hacer clic sobre una fila todavía `disabled` |
| `38`, `53`, `55`, `58` | Enumeran filas del perfil o abren "Ver equipo" por `data-testid` | No deberían cambiar (las enumeraciones con `toHaveText` son de la lista del Empleado y del Cliente); se corren completos en B4 |
| `ResumenTurnoServiceTest`, `ResumenTurnoHttpIntegrationTest`, `CierreTurno*` | Usan `ESTADOS_FACTURADOS` | Sin cambio de resultado; si la constante cambia de lugar, se ajusta el `import` |
| `EnumsContraBaseDeDatosIntegrationTest` | Compara el ENUM de la base con el Java | Sin cambio (no hay migración ni enum físico nuevo; `CategoriaResultadoPedido` es solo de la API) |
| Newman, estreses y Playwright existentes | No llaman a la ruta nueva | Sin cambio |
| Documentos | `CLAUDE.md`, requisitos y historias del Dueño | Se actualizan en B5 |

## 8. Qué necesito de Diego

1. **Elegir M1, M2 y M3** (tabla de la entrega B). M2 conviene antes de empezar B1; M1 y M3 antes de B3.
2. **D1: el contrato de la API.** Recomiendo `desde` y `hasta` con tope de 92 días (la pantalla manda las dos fechas de sus botones de 7 y 30 días). Alternativa: un parámetro `dias` resuelto por el servidor, que no depende del reloj del dispositivo pero fija el rango en "hasta hoy".
3. **D2: el "día" es el día de apertura del turno** (un pedido de la 01:00 de un turno que abrió ayer cuenta en ayer, igual que el panel). Los pagados sin turno van por el día de pago. Recomiendo esto por coherencia con el panel y el mail; la alternativa es el día calendario del pago.
4. **D3: las siete categorías de resultado**, con `CANCELADO` y `CANCELADO_POR_SISTEMA` juntos como "Cancelados" y `EXPIRADO` mostrado como "Sin respuesta". La alternativa es separar "cancelado por el cliente" de "cancelado por suspensión del comercio".
5. **D4: el ticket promedio es bruto** (`vendido / pedidos facturados`, igual que "Vendido"), no neto ni con el cargo del cliente. Los pedidos en preparación, en camino o listos cuentan como facturados, igual que en el panel.
6. **D5: sin índice nuevo** (45 ms medidos para 92 días con 30900 pedidos de un comercio). Recomiendo no tocar la base en este tramo.
7. **D6: los días sin pedidos aparecen en cero en el modo "por día"** (eje continuo), y en el modo "por turno" solo aparecen los turnos con pedidos. Recomiendo así; rellenar los turnos vacíos exigiría reconstruir los horarios vigentes de cada día pasado.
8. **Confirmar que el Empleado no ve nada de esto**, ni siquiera un resumen reducido (hoy ve "Vendido en el turno" en el panel y nada más).

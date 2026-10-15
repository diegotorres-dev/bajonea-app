# Auditoría de E4 — Rol Empleado: gestión del equipo (Fase 1, solo lectura)

Fecha: 2026-10-14. Alcance: lectura del código y de la documentación; no se tocó código, tests, migraciones ni base. Todo lo que dice "necesita tu OK" es una propuesta, no está implementado. Las pruebas de este documento son de lectura (clases, archivos y líneas citadas); no se corrió nada contra ninguna base.

Documentos leídos: `CLAUDE.md`, `docs/DECISIONES.md` (entradas de E1 a E3 y las de las lecciones de bloqueo), `docs/entregables-01-02/AUDITORIA-EMPLEADO-FASE1.md` (no está en `docs/`, está en `docs/entregables-01-02/`), `docs/AUDITORIA-E3.md` (no se leyó: lo que importa de E3 para E4 está en `DECISIONES.md`, `CONCURRENCIA-Y-TRANSACCIONES.md` y `APRENDIZAJES-TECNICOS.md`), `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/APRENDIZAJES-TECNICOS.md` y los requisitos de Empleado, Dueño, Administrador y Sistema de `docs/entregables-01-02/`.

---

## 1. Resumen corto

- **El esquema de E4 ya está.** `empleado_comercio` (ACTIVO/INACTIVO, `fecha_baja`), `historial_empleado_comercio` con sus seis motivos (`BAJA_DUENO`, `RENUNCIA` y `REACTIVACION` incluidos), el tipo `EMPLEADO_DESACTIVADO` con audiencia `CLIENTE_O_DUENO`, `purgarAvisosDelComercio` y el listado del equipo con los inactivos ya existen. **E4 no necesita migraciones** (el último Flyway es `V34`). Solo se agregaría una migración si Diego elige guardar el motivo de la baja en la relación en vez de calcularlo del historial (no lo recomiendo).
- **Lo que falta es todo el comportamiento:** no hay endpoint de desactivar, reactivar ni renunciar; el único cambio de estado de la relación fuera de aceptar una invitación es el atajo de test `PUT /api/v1/test/comercios/{c}/empleados/{e}/estado`, que no escribe historial ni avisos. No hay lectura del historial. No hay nada del Administrador sobre el equipo.
- **Cuatro hallazgos cambian el plan** (sección 4): (1) `/api/v1/empleados/**` cae en `anyRequest().authenticated()` de `SecurityConfig`: la renuncia necesita un matcher propio o la podría llamar cualquier rol; (2) "reactivar directo solo si lo dio de baja el Dueño" no tiene dónde leerse hoy: hay que calcularlo del historial y las relaciones inactivas que dejó el atajo de test no tienen fila, así que quedan "no reactivables"; (3) la hoja de pérdida de acceso dice "{comercio} te sacó del equipo" ante **cualquier** pérdida (renuncia en otra pestaña, comercio inactivado), y distinguir la causa sin romper el 404 idéntico es posible con un endpoint de solo lectura sobre la relación propia; (4) reactivar directo puede dejar una relación ACTIVA con una invitación PENDIENTE del mismo email, y la aceptación posterior escribe una fila `ACEPTACION` incoherente.
- **Estimación de bloques:** backend A1 a A4, pantallas B1 a B3, más una pasada previa de mockups (sección 12). Orden de bloqueo sin sorpresas: encaja en el global; los tres riesgos reales son el `UPDATE` por rango (ya conocido), la mejora de bloqueo si se lee la relación con compartido antes de escribirla y el cruce reactivar/invitar.

---

## 2. Lo que ya existe (con evidencia)

### 2.1 Relación (punto 1)

| Pieza | Dónde | Estado |
|---|---|---|
| Entidad | `entities/EmpleadoComercio` (`id`, `empleado`, `comercio`, `estado`, `fechaAlta`, `fechaBaja`) | Existe. Setters de `estado` y `fechaBaja`. |
| Tabla | `V1` + `V29`: `uq_empleado_comercio (empleado_id, comercio_id)`, `idx_empleado_comercio_comercio`, `idx_empleado_comercio_empleado`; `estado` ENUM('ACTIVO','INACTIVO') | Existe. |
| Enums | `EstadoEmpleadoComercio {ACTIVO, INACTIVO}`; `MotivoHistorialEmpleado {INVITACION, ACEPTACION, INVITACION_CANCELADA, BAJA_DUENO, RENUNCIA, REACTIVACION}` | Existen. El ENUM físico de `historial_empleado_comercio.motivo` (`V31`) ya tiene los seis. |
| Bloqueo `FOR UPDATE` por par | `EmpleadoComercioRepository.findByEmpleadoIdAndComercioIdConBloqueo` (usa la clave única) | Existe. |
| Lectura compartida | `leerEstadoConBloqueoCompartido` (relación) y `leerRelacionesConBloqueoCompartido` (por ids) | Existen, las usan la revalidación de escrituras y el fan-out. |
| Listado del equipo | `InvitacionEmpleadoService.listarEquipo` → `findEquipoByComercioId`: **devuelve activos e inactivos** (sin filtro de estado); `MiembroEquipoResponseDTO` ya trae `estado` y `fechaBaja` | Existe. Es el frontend (`miembrosActivos` en `js/equipo-comercio.js`) el que filtra a ACTIVO. |
| Reactivación por invitación | `InvitacionEmpleadoService.aceptar`: si la relación existe `INACTIVO` la pasa a `ACTIVO`, limpia `fechaBaja`, escribe una fila `ACEPTACION` y otra `REACTIVACION` (INACTIVO→ACTIVO, actor = el invitado) y purga avisos | Existe. Es la única vía real hoy. |
| Invitar a un inactivo | `validarDestinatario` solo bloquea si ya es `ACTIVO` (`existsByEmpleadoIdAndComercioIdAndEstado`) | Ya permite "invitación nueva reusa la fila". |
| Atajo de test | `TestSupportService.cambiarEstadoRelacionEmpleado` / `PUT /api/v1/test/comercios/{c}/empleados/{e}/estado?estado=` | Toma la relación `FOR UPDATE`, setea estado y `fechaBaja`, **no toca historial ni avisos**. Lo usan unos 15 archivos de `testing/playwright` (`atajoEstadoRelacion` en `tests/helpers/empleado.ts`, los specs 37 y 42, siete estreses y seis constructores de Newman). |
| Endpoints de desactivar, reactivar, renunciar, listar inactivos con motivo | — | **No existen.** |

### 2.2 Historial (punto 2)

- Tabla `historial_empleado_comercio` (`V31`): `id`, `comercio_id` (NOT NULL), `empleado_comercio_id` (NULL), `invitacion_id` (NULL), `estado_origen`, `estado_destino` (ambos NULL permitido), `motivo` (NOT NULL), `actor_usuario_id` (NULL permitido, FK a `usuario`), `fecha_hora`. `CHECK ck_hec2_referencia`: tiene que haber relación o invitación. Índices `idx_hec2_comercio_fecha (comercio_id, fecha_hora)`, `idx_hec2_relacion`, `idx_hec2_invitacion`, `idx_hec2_actor`. Entidad `HistorialEmpleadoComercio` y `HistorialEmpleadoComercioRepository` (con una única consulta, `findByComercioIdOrderByFechaHoraDescIdDesc`, **que nadie usa**: no hay lectura del historial).
- Qué escribe hoy (`InvitacionEmpleadoService`):
  - `INVITACION` (en `enviar`, también al reenviar): invitación, sin relación, origen/destino NULL, actor = Dueño.
  - `INVITACION_CANCELADA` (`cancelar`): ídem, actor = Dueño.
  - `ACEPTACION` (`aceptar`): invitación **y** relación, origen NULL, destino ACTIVO, actor = el invitado.
  - `REACTIVACION` (solo si `aceptar` encontró la relación INACTIVA): origen INACTIVO, destino ACTIVO, actor = el invitado.
- No escribe nada para vencimiento, reemplazo ni invalidación de invitaciones (a propósito: el requisito lista solo los seis eventos).
- **Qué faltaría** para baja, renuncia y reactivación directa: tres escrituras nuevas en el servicio de desactivar/reactivar/renunciar (`BAJA_DUENO`: origen ACTIVO, destino INACTIVO, actor Dueño; `RENUNCIA`: ídem, actor Empleado; `REACTIVACION` directa: origen INACTIVO, destino ACTIVO, actor Dueño, **sin** `invitacion_id`). Sin migración. La forma "reactivación directa vs. por invitación" se distingue por tener o no `invitacion_id` y por el actor.
- **Forma de lectura propuesta (necesita tu OK):** sumar una cuarta fuente `EQUIPO` (enum `FuenteActividad`, al final: `ordinal 3`, el cursor `(fecha, fuente, id)` sigue siendo válido) a `ActividadComercioService`. Cada fila reutiliza `ActividadComercioItemResponseDTO`: `id = "EQUIPO-n"`, `actorUsuarioId` y `actorNombre` (join a `persona_fisica`), `actorRol` (`DUENO` si el actor es el Dueño del comercio, si no `EMPLEADO`), `accion` = el motivo, `accionTexto` ("Invitó a ana@x.com", "Dio de baja a Ana Pérez", "Ana Pérez dejó de trabajar en el comercio", "Reactivó a Ana Pérez", "Aceptó la invitación", "Canceló la invitación a ana@x.com"), `entidadTipo` = `EMPLEADO` o `INVITACION`, `entidadId`, `entidadNombre` (nombre y apellido del Empleado o el email de la invitación). Ventajas: el Dueño ya tiene la pestaña Actividad con chips, paginación por cursor y sondeo; el Administrador la reutiliza con `ActividadComercioService.listar(Integer comercioId, ...)` (la sobrecarga ya existe y es pública); el orden entre fuentes es el real (todas escriben con el `Clock` único). Costo: una consulta más por página cuando no hay filtro (cuatro, no tres). Alternativa si preferís verlo separado: `GET /comercios/equipo/historial` con la misma forma, pero hay que duplicar paginación y cliente.

### 2.3 Avisos (punto 4)

- `TipoNotificacion.EMPLEADO_DESACTIVADO(CLIENTE_O_DUENO)` existe en Java y en el ENUM de la base (`V34`); `AudienciaNotificacionTest` fija su audiencia. `INVITACION_EMPLEADO(DUENO)` es T33 (aceptación) y se emite hoy.
- `NotificacionService`: `crearParaCliente` acepta `CLIENTE` o `CLIENTE_O_DUENO` (aviso personal, `comercio_id = NULL`) y `crearParaDueno` acepta `DUENO` o `CLIENTE_O_DUENO` (con `comercio_id`). Es decir, **T32 va por `crearParaCliente` y T34 por `crearParaDueno`** y el sistema rechaza cualquier otro camino.
- **Cómo se ve T32 en la campana del Cliente:** el filtro personal (`findPersonalesPushByUsuarioId` y `countPersonalesPushNoLeidasByUsuarioId`) es `canal = PUSH AND comercio_id IS NULL`. Como T32 se crea sin `comercio_id`, **pasa el filtro** (es la excepción "se deja pasar T32" de `requisitos-funcionales-sistema.md`); no depende de la entidad. `NotificacionResponseDTO` no trae el tipo, solo mensaje, leída, fecha, `entidadTipo` y `entidadId`; `js/notificaciones.js` solo arma el enlace "Ver pedido" para `entidadTipo === 'PEDIDO'`, así que T32 con `entidadTipo = COMERCIO` y el id del comercio se ve como una fila de texto sin enlace. Sin cambio de frontend.
- **T32 no se purga con el purgado del comercio** (`purgarAvisosDelComercio` borra por `usuario_id` y `comercio_id`; T32 tiene `comercio_id` NULL): queda para siempre en la campana personal. Es lo deseable.
- Purgado: `purgarAvisosDelComercio(usuarioId, comercioId)` busca los ids y borra con `deleteAllByIdInBatch` (por clave primaria). Hoy lo llama solo `aceptar` (al crear o reactivar). Su Javadoc dice que "la desactivación y la renuncia (tramo E4) tienen que hacer el mismo purgado".
- T34 (renuncia → Dueño): `crearParaDueno(duenoId, comercioId, texto, EMPLEADO_DESACTIVADO, COMERCIO, comercioId)`. Aparece en el panel del Dueño con ese comercio abierto.

### 2.4 Pérdida de acceso (punto 5)

- Disparadores en el frontend: (a) `apiFetch` (`js/api.js`): una respuesta `404` con `data.codigo === 'COMERCIO_NO_DISPONIBLE'` **y** header `X-Comercio-Id` **y** `esContextoEmpleado()` llama `perderAccesoAlComercio()`; (b) `verificarComercioActivo` (`js/comercio-activo.js`, sondeo de 15 s a `GET /empleados/mis-comercios`): si el comercio activo no está en la lista, `perderAccesoAlComercio()`; (c) `prepararPaginaComercio` si el resolver no encuentra el comercio.
- `perderAccesoAlComercio` (`js/api.js:403`): marca `accesoPerdido` (después de eso `apiFetch` rechaza las rutas de comercio con `ApiError(0)`), limpia el contexto, olvida el último contexto si era ese comercio, consulta si quedan otros comercios y muestra la hoja bloqueante "Ya no tenés acceso a este comercio" con `"{nombre} te sacó del equipo."` (o "El comercio te sacó del equipo.") y `Entendido`, que lleva al selector o al inicio de Cliente. Los textos están fijos en `js/api.js` y los asserta el spec 38 (líneas ~799 a ~906).
- **Qué sabe el frontend de la causa: nada.** El `404` es idéntico en los tres casos (desactivado, comercio inexistente/ajeno, estado no accesible) y el sondeo solo ve "ya no está en la lista". El texto "te sacó del equipo" ya es incorrecto hoy cuando la causa es un comercio que pasó a `INACTIVO`/`RECHAZADO` (anotado en `DECISIONES.md`, entrada del 2026-10-11, pregunta 3).

### 2.5 Frontend del Dueño (punto 7)

- `js/equipo-comercio.js` (817 líneas). Vista `view-equipo` de `comercio-perfil.html` (líneas ~282 a ~299): encabezado, `#equipo-tabs` (tres pestañas armadas desde `PESTANAS`: `equipo`, `solicitudes`, `actividad`), `#equipo-lista`, pie `#equipo-footer` con "Invitar" (se oculta en Actividad, `actualizarPie`).
- Mi equipo: `pintarMiembros` filtra `miembrosActivos` (ACTIVO) y pinta `crearFilaMiembro` (avatar con iniciales, nombre, email, `crearEstado` con `ESTADO_MIEMBRO`, que **ya tiene** `INACTIVO: {texto:'Inactivo', punto:'inactivo'}`); **la fila de miembro no tiene botón de menú**.
- Solicitudes: `crearFilaInvitacion` con `crearAccionMenuFila` (⋯ → `abrirMenuInvitacion`, hoja inferior `product-modal-sheet` con acciones `profile-link` "Reenviar código" y "Cancelar invitación" peligro; `abrirConfirmacionCancelar` con hoja `modal-sheet`, botón de peligro `equipo-hoja__peligro` y "Volver").
- Sondeo de 15 s (`iniciarActualizacion`, `INTERVALO_POLLING_COMERCIOS_MS`): llama `cargar({conEsqueleto:false})`; compara una firma `JSON.stringify({miembros, invitaciones+detalle})` con la anterior y solo repinta si cambió (`firmaDe`, `firmaPintada`). Como `miembros` incluye `estado` y `fechaBaja`, un cambio de ACTIVO a INACTIVO **ya dispara el repintado** sin tocar el sondeo; la pestaña Actividad no se refresca sola.
- Estilos reutilizables: `.equipo-fila`, `.equipo-avatar` / `.selector-avatar--panel`, `.profile-link` / `.profile-link--danger`, `.modal-sheet`, `.equipo-hoja__peligro`, `.equipo-confirmar__titulo`, `.chip-row` / `.chip` (filtros de Actividad), `.segmented-control`.
- El header `X-Comercio-Id` ya viaja en `/comercios/equipo...` (`RUTAS_DEL_DUENO` de `js/api.js`), así que rutas nuevas bajo `/comercios/equipo/` lo heredan sin cambios.
- Dónde entran: Desactivar y Reactivar como acciones del ⋯ en `crearFilaMiembro` (mismo patrón que la invitación); inactivos como grupo propio en Mi equipo (ver Pregunta 3); historial como chip "Equipo" en Actividad (si se aprueba la fuente `EQUIPO`).

### 2.6 Frontend del Empleado (punto 8)

- Perfil dentro del comercio: `comercio-perfil.html` líneas 52 a 77: `#seccion-lista-empleado` con cuatro filas (`btn-ver-datos-comercio`, `btn-editar-datos-comercio`, `btn-editar-datos`, `btn-cambiar-cuenta`) y la sección "Sesión" con `Cerrar sesión` (`profile-link--danger`). Se llena en `js/comercio.js` `iniciarPerfilDelEmpleado` (línea ~2099): los botones nacen `disabled` y se habilitan al final. La renuncia entra como una fila nueva con `profile-link--danger` (probablemente en "Sesión", encima de "Cerrar sesión"); el texto del botón queda para los mockups (los requisitos dicen "Dejar de trabajar en este comercio").
- Dos confirmaciones: ya existe el patrón (`modal-sheet` con botón de peligro + "Volver"). Para la doble confirmación se encadenan dos hojas.
- `perderAccesoAlComercio` y sus textos: sección 2.4. `abrirHojaCambiarCuenta` (`js/selector-contexto.js:176`) y el selector (`seleccionar-contexto.html`) leen `GET /empleados/mis-comercios`; al renunciar el comercio sale solo de esa lista.
- La ruta de la renuncia, `/empleados/comercios/{id}/renunciar`, **no** matchea `RUTAS_DE_COMERCIO` ni `RUTAS_DEL_DUENO`, así que no manda `X-Comercio-Id`, no se bloquea con `accesoPerdido` y un `404` no dispara la hoja de pérdida. Después de renunciar con éxito hay que limpiar el contexto antes de navegar (si no, el sondeo de 15 s o la próxima request disparan la hoja "te sacó del equipo" sobre una renuncia propia).

### 2.7 Administrador (punto 9)

- `AdministradorController` (`/api/v1/administrador/**`, `hasRole("ADMINISTRADOR")` en `SecurityConfig`): no tiene nada del equipo. `GET /administrador/comercios` lista APROBADO, APTO_VENTA y SUSPENDIDO (`listarComerciosAprobados`); `ComercioAdminResponseDTO` no trae equipo.
- `js/admin.js`: `mostrarModalDetalleComercio(comercio, onSuspendido)` (línea ~811): `renderComercioDetailSections` + botón "Suspender" (solo APROBADO/APTO_VENTA) + "Cerrar". "Ver equipo" va junto a "Suspender". `admin-comercios.html` carga `initAdminComercios`. No hay una vista de equipo; hay que crear una (recomiendo una página `admin-comercio-equipo.html?id=N` con pestañas de solo lectura, no otro modal encima del modal).
- 404 para comercio inexistente: el patrón del Administrador es `RecursoNoEncontradoException("Comercio no encontrado")` (p. ej. `suspenderComercio`); no hace falta el `404` idéntico `COMERCIO_NO_DISPONIBLE` porque el Administrador ve todos los comercios. Endpoints propuestos (necesitan tu OK): `GET /api/v1/administrador/comercios/{id}/equipo` (misma forma que `EquipoComercioResponseDTO`; hay que refactorizar `listarEquipo(ComercioActivo)` a `listarEquipo(Integer comercioId)`, el método solo usa `comercioId`) y `GET /api/v1/administrador/comercios/{id}/actividad?limite&cursor&fuente` (delegando en `ActividadComercioService.listar(Integer, ...)`). Sin escrituras, sin bloqueos.
- `apiFetch` no manda `X-Comercio-Id` en `/administrador/**` (no matchea `RUTAS_DEL_DUENO`).

---

## 3. Lo que falta (resumen por pieza)

Backend: servicio nuevo de gestión de la relación (desactivar, reactivar, renunciar), con las tres escrituras de historial, T32/T34, purgado, reglas de aptitud al reactivar, y la lectura de motivo de baja; tres endpoints (más el de "acceso propio" si se aprueba); fuente `EQUIPO` en la actividad; dos endpoints del Administrador; ampliar `MiembroEquipoResponseDTO` (`motivoBaja`/`puedeReactivar`); matcher en `SecurityConfig`; clasificación en `ClasificacionRutasComercioTest`.

Frontend: acciones del ⋯ en miembros, grupo/sección de inactivos, chip "Equipo", renuncia del Empleado con doble confirmación, nueva copia de la hoja de pérdida, página de equipo del Administrador y botón en el modal.

Pruebas: ver sección 10.

---

## 4. Hallazgos que cambian el plan

### H1 — `/api/v1/empleados/**` no tiene matcher de rol más que `mis-comercios`
`SecurityConfig` solo declara `GET /api/v1/empleados/mis-comercios` → `hasRole("CLIENTE")`. Una ruta nueva `PUT /api/v1/empleados/comercios/{id}/renunciar` caería en `anyRequest().authenticated()`: la podría llamar un Dueño o un Administrador (el servicio igual daría `404` por no tener relación, pero la regla de seguridad de este proyecto es "cerrado por defecto"). **Propuesta:** agregar `auth.requestMatchers(HttpMethod.PUT, "/api/v1/empleados/comercios/*/renunciar").hasRole("CLIENTE")` (ruta exacta, no comodín) y clasificarla `PROPIO` en `ClasificacionRutasComercioTest`, cuyo `PREFIJOS` ya incluye `/api/v1/empleados`. *Necesita tu OK.*

### H2 — "Lo dio de baja el Dueño" no se puede leer hoy
No hay columna de motivo en `empleado_comercio`. Para decidir si se puede reactivar directo hay que mirar la **última fila de historial con destino INACTIVO** de esa relación (`BAJA_DUENO` ⇒ reactivable; `RENUNCIA` ⇒ no) y, ojo, que después no haya una fila `REACTIVACION` (si la hay, la relación estaría ACTIVA). Consecuencias:
- Las relaciones que quedaron `INACTIVO` por el **atajo de test** o cargadas a mano (tests Java con `datos.vincularEmpleado(..., "INACTIVO", ...)`, specs 36/37/42, y cualquier dato de `practicas3`) **no tienen ninguna fila**: regla propuesta, sin fila ⇒ no reactivable directo (hace falta invitación). Para que los tests de E4 puedan armar una relación reactivable sin usar el endpoint real, el atajo debería aceptar un parámetro opcional `motivo=BAJA_DUENO|RENUNCIA` que escriba la fila (sin parámetro se comporta como hoy; los consumidores actuales no cambian).
- `MiembroEquipoResponseDTO` necesita `motivoBaja` (`BAJA_DUENO` / `RENUNCIA` / `null`) y `puedeReactivar` calculados en una sola consulta agrupada (no por fila). Ya estaba anotado como pendiente en `DECISIONES.md` (entrada de B3 de E1, pregunta abierta 2). *Necesita tu OK.* Alternativa: columna `motivo_baja` en `empleado_comercio` (migración `V35`): más simple de leer pero duplica la fuente de verdad; no la recomiendo.

### H3 — La hoja de pérdida dice "te sacó del equipo" aunque no haya sido eso
Ver 2.4. Con E4 hay tres causas reales: desactivación del Dueño, renuncia propia (en otra pestaña o dispositivo; en la misma pestaña se evita limpiando el contexto) y comercio que ya no está accesible. Opciones, de menor a mayor cambio (detalle de riesgo en la sección 5):
- **C (sin backend):** copia neutra ("Ya no tenés acceso a este comercio" + "Mirá tus avisos") y que T32 en la campana personal explique. Costo cero; se pierde la precisión.
- **A (recomendada, necesita tu OK):** `GET /api/v1/empleados/comercios/{id}/acceso` (solo `CLIENTE`, ignora `X-Comercio-Id`) que responde sobre la **relación propia**: `{ estado: "ACTIVO" | "INACTIVO", motivoBaja: "BAJA_DUENO" | "RENUNCIA" | null, comercioAccesible: boolean }`, y `404` con el mismo cuerpo `COMERCIO_NO_DISPONIBLE` si no existe relación. El frontend lo pide una sola vez al detectar la pérdida.
- **B (descartada):** agregar la causa al cuerpo del `404` del resolver. Rompe la regla de "idéntico" a nivel de cuerpo y obliga a leer más en cada resolución fallida.

### H4 — Reactivar directo contra una invitación pendiente
`validarDestinatario` deja invitar a una relación `INACTIVO`. Si el Dueño la invita y después la reactiva directo (o desde otra pestaña), queda una relación ACTIVA con una invitación PENDIENTE vigente; si la persona la acepta, `aceptar` no reactiva nada (`reactivada = false`), no purga, escribe una fila `ACEPTACION` con la relación ya ACTIVA y manda al Dueño "aceptó tu invitación y ya es parte del equipo". Propuesta (necesita tu OK, ver Decisión no prevista 3): reactivar directo responde `409` si hay una invitación `PENDIENTE` vigente del mismo email en ese comercio ("Hay una invitación pendiente para esta persona. Cancelala primero."). La carrera invitar vs. reactivar queda cerrada si las dos toman primero la fila del usuario del Dueño en el mismo orden y la lectura de las invitaciones va después del bloqueo (ver 6.5).

### H5 — El `listarEquipo` del Dueño ya devuelve inactivos, pero con `vence en N días` dependiente de la zona del navegador
No cambia el plan, pero E4 toca ese DTO: conviene agregar `diasRestantes` (o un instante con zona) a las invitaciones, ya pendiente desde B3 de E1 (pregunta abierta 3). Lo marco como opcional dentro de A3.

---

## 5. Concurrencia (puntos 3, 5 y 6 en su parte de bloqueos)

### 5.1 Orden global y dónde entra cada operación

Orden vigente (`CONCURRENCIA-Y-TRANSACCIONES.md`, `CLAUDE.md` §1bis): `usuario` (id ascendente si son varios) → `invitacion_empleado` (por clave primaria, ascendente) → `empleado_comercio` → `comercio` → `pedido`… → `carrito` (última hoja).

**Desactivar (Dueño)** — `PUT /api/v1/comercios/equipo/miembros/{empleadoId}/desactivar` (propuesto):
1. `usuario` del Dueño y `usuario` del Empleado con `LOCK IN SHARE MODE`, en id ascendente (los dos FK del historial y del aviso).
2. `empleado_comercio` por el par `(empleadoId, comercioId)` con `FOR UPDATE` (`findByEmpleadoIdAndComercioIdConBloqueo`, usa `uq_empleado_comercio`, es `const`). **Primera lectura de esa fila; no leerla antes con compartido** (mejora de bloqueo, lección de A2).
3. Con la fila bloqueada: validar estado (si ya está INACTIVO, ver 5.3), `setEstado(INACTIVO)` y `setFechaBaja(ahora)` **sobre la entidad ya cargada**: Hibernate emite `UPDATE ... WHERE id = ?` (por clave primaria, como exige el contrato de E4; no usar JPQL de actualización masiva ni `UPDATE ... WHERE empleado_id AND comercio_id`).
4. `INSERT` del historial (FK a comercio, relación y usuario: toma compartidos que ya cumplen el orden o son compatibles).
5. Purgado por clave primaria de los avisos del comercio del Empleado (`purgarAvisosDelComercio`) y `INSERT` de T32 (FK al usuario del Empleado, ya tomado).
6. El comercio no se lee ni se escribe: solo toma compartido por la FK del historial (compatible con todo salvo un `FOR UPDATE` del comercio, que espera sin ciclo: el que tiene el comercio exclusivo nunca pide la relación ni los usuarios de este flujo después).

**Reactivar (Dueño)** — `PUT .../miembros/{empleadoId}/reactivar`: 1 igual; después `invitacion_empleado` (leer ids sin bloqueo, bloquear por clave primaria ascendente con `findByIdInConBloqueo`) solo si se opta por el cierre automático de pendientes; con la opción 409 de H4 alcanza una lectura posterior al bloqueo de usuarios; `empleado_comercio` `FOR UPDATE`; validar motivo de la última baja y aptitud de la cuenta; `setEstado(ACTIVO)`, `setFechaBaja(null)`; historial `REACTIVACION`; `purgarAvisosDelComercio` (igual que aceptar).

**Renunciar (Empleado)** — `PUT /api/v1/empleados/comercios/{comercioId}/renunciar`: el Dueño se conoce por una lectura simple del comercio (`comercio.dueno_id`); usuarios Dueño y Empleado en id ascendente con compartido; relación `FOR UPDATE`; mismo cuerpo que desactivar con motivo `RENUNCIA`, T34 al Dueño con `crearParaDueno`.

Coexistencia con lo que ya hay (por qué no hay ciclo): el fan-out (`PedidoService.bloquear`, `conEquipo`) toma usuarios con compartido en id ascendente, **después** las relaciones con compartido por clave primaria y por último el pedido `FOR UPDATE`. Desactivar toma los mismos usuarios con compartido (compatibles) y la relación `FOR UPDATE`: espera a que el fan-out termine o gana y el fan-out lee `INACTIVO` en su paso 3 (esa semántica la documentó A4). Una escritura delegada toma usuario → relación compartida → comercio: espera a desactivar y después ve `INACTIVO` → `404` (A2). Los exclusivos del comercio (`cerrar`, `abrir`, `datos-operativos`, suspensión, bloqueo de cuenta) nunca piden relación ni los usuarios de este flujo después de tener el comercio, así que desactivar con su compartido de comercio por FK no cierra ciclo; **igual lo cubre un escenario de estrés** (S8).

Un login del Empleado (`usuario FOR UPDATE`) encolado detrás del compartido de desactivar mientras otra transacción tiene ese usuario compartido: razonado sobre el orden de cola de InnoDB como en 5bis (no reproducido): quien tiene los usuarios no necesita esperar nada más que la relación.

### 5.2 Escenarios de estrés a cubrir y su prueba de que muerde

Propongo un estrés nuevo, `stress-locks-empleado-e4.mjs` (id `e4` en `ESTRESES` de `correr-estreses.mjs`), con escrituras reales (HTTP), no con el atajo; los invariantes se comprueban contra la base con `mysql.exe` (mismo método que A2 a A6) y el log del backend (`Deadlock found` / `Lock wait timeout` en 0).

| # | Escenario | Invariante | Mutación que lo hace fallar |
|---|---|---|---|
| S1 | Desactivar vs. las 17 escrituras delegadas + 5 acciones de pedido en curso del Empleado (matriz acotada a las más críticas: crear/editar producto, `datos-operativos`, cerrar, aceptar, entregar) | Toda escritura del Empleado confirmada tiene fecha ≤ `fecha_baja`; las posteriores dan `404` y no escriben | M1: sacar `FOR UPDATE` de la relación en desactivar (leerla común) |
| S2 | Desactivar ‖ reactivar (dos pestañas del Dueño, N rondas) | Estado final coherente con la última fila de historial; historial alterna sin dos bajas ni dos reactivaciones seguidas; ningún `500` | M2: leer la relación con `LOCK IN SHARE MODE` y escribirla después (mejora de bloqueo → `Deadlock found`) |
| S3 | Renunciar ‖ desactivar | Una sola fila de baja (la de quien ganó); el que perdió responde `200` idempotente sin fila; **a lo sumo uno** de T32/T34 por baja | M3: no revalidar el estado después del bloqueo (dos filas e ambos avisos) |
| S4 | Doble desactivación (dos pestañas) | Una fila de historial, un T32, `fecha_baja` de la primera | M3 (ídem) |
| S5 | Reactivar ‖ invitar de nuevo (y ‖ aceptar) | Nunca queda ACTIVO + invitación `PENDIENTE` vigente del mismo par; `ACEPTACION` solo con relación que estaba INACTIVA o recién creada | M4: reactivar sin comprobar invitaciones pendientes |
| S6 | Fan-out (pedidos pagados en paralelo) con desactivación y reactivación en medio | Destinatarios = relaciones ACTIVAS en el paso 3; nadie desactivado recibe copia con fecha > `fecha_baja`; exactamente un T32 | M5: leer las relaciones del fan-out sin bloqueo (ya cubierto por A4; se repite con el endpoint real) |
| S7 | Renuncia vs. escrituras propias del Empleado (otra pestaña) | Igual que S1 | M1 |
| S8 | Desactivar/reactivar vs. `cerrar`, `abrir`, `datos-operativos`, suspensión del Administrador y bloqueo de cuenta del Dueño | Cero `Deadlock found`, cero `5xx` | M6: tomar el comercio `FOR UPDATE` dentro de desactivar |
| S9 | Purgado: desactivar con cientos de avisos del comercio mientras entran avisos por fan-out | Cero `Deadlock found`; no quedan avisos del comercio del Empleado con fecha ≤ `fecha_baja`; T32 intacto | M7: purgar con `DELETE ... WHERE usuario_id AND comercio_id` (bloqueo de hueco) |
| S10 | Reactivar una `RENUNCIA` ‖ la persona acepta una invitación nueva | Reactivación directa rechazada (`409`), la relación queda ACTIVA solo por la invitación, una sola fila `REACTIVACION` | M8: decidir "reactivable" con una lectura común del historial (foto vieja) |

Más tests Java de integración con latches (como `NotificacionesEquipoConcurrenciaIntegrationTest`) para S1, S3, S6 y S10 con el bloqueo retenido en una sesión aparte (técnica del A2 documentada en `APRENDIZAJES-TECNICOS.md`).

### 5.3 Idempotencia (propuesta, ver Decisión no prevista 1)
Desactivar una relación ya INACTIVA, reactivar una ACTIVA y renunciar a una INACTIVA: `200` con el estado actual, **sin fila de historial ni aviso nuevos**, como el cierre manual (`CierreComercioService`). Es lo que ya sugería la auditoría del 2026-10-05 (punto 7 de riesgos). Desactivar sin relación en ese comercio: `404` "Miembro no encontrado".

### 5.4 Pérdida de acceso, riesgo de filtrar información (punto 5)
- Con la opción A el endpoint solo habla de la relación **del que pregunta**: sin relación responde el mismo `404 COMERCIO_NO_DISPONIBLE` que un comercio inexistente o ajeno, así que un tercero no gana información. Un ex miembro aprende lo que ya sabe (su motivo de baja) y que el comercio no está accesible para él.
- No mezclar la causa en el `404` del resolver (H3, opción B).
- Para el mensaje de comercio inaccesible (cuarta causa) conviene `comercioAccesible: false` y copia neutra ("{comercio} ya no está disponible"), sin decir el motivo del comercio (puede estar suspendido o inactivado; el Empleado no tiene por qué saberlo).

### 5.5 Cruce reactivar/invitar/aceptar (H4)
Todas las operaciones del Dueño sobre el equipo toman primero la fila de su usuario: `invitar` y `reenviar` en exclusivo (`findByIdConBloqueo`), `cancelar` en compartido. Para que reactivar y invitar se serialicen, reactivar debería tomar la del Dueño en **exclusivo** (como invitar), o bien comprobar las invitaciones pendientes después de un bloqueo que ya espera a la de invitar. Recomiendo exclusivo (una fila, un orden, costo: serializa las operaciones del equipo de un mismo Dueño, que son pocas y cortas). Ojo: con exclusivo en el Dueño y compartido en el Empleado, el id ascendente decide cuál se toma primero (misma regla que `bloquearUsuariosEnOrden` de `aceptar`).

---

## 6. Reglas al reactivar (punto 6)

Qué pasa **hoy** (solo la vía invitación, `InvitacionEmpleadoService.aceptar` → `validarCuentaExistente`): matriz de roles (`MatrizRolesService.puedeSerEmpleado`: nunca Dueño ni Administrador) → estado de la cuenta (`MensajesEstadoCuenta.conflictoDeLogin`: PENDIENTE, BLOQUEADO, INACTIVO, SUSPENDIDO dan `409`) → edad (`EDAD_MINIMA_EMPLEADO = 18` contra la fecha declarada) → comercio aceptable (`APROBADO`, `APTO_VENTA`, `CERRADO_TEMPORALMENTE` o `SUSPENDIDO`; no `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO` ni `INACTIVO`). Al invitar (`validarDestinatario`): matriz, ya-es-del-equipo, estado de cuenta (con aviso de regularización por email, tope 3 por día) y edad; el comercio tiene que estar **operativo** (`APROBADO`/`APTO_VENTA`).

Qué haría falta para la reactivación directa (propuesta):
- Extraer `validarCuentaExistente` a una pieza compartida (hoy es privada de `InvitacionEmpleadoService`, que ya agrupa invitar/aceptar/validar) y llamarla desde reactivar con la **misma** lista: matriz, estado, edad. La edad es declarada e inmutable por el perfil (el perfil del Cliente solo edita nombre, apellido y teléfono), así que para una persona que ya fue Empleado nunca debería fallar; igual se incluye por simetría y por defensa.
- Mensaje al Dueño ante una cuenta no apta: genérico, sin revelar el estado ("No se puede reactivar a esta persona") — la misma política de privacidad que invitar. Enviar o no el email de regularización (`InvitacionRegularizacionService`, que hoy es de "invitación no enviada") es la Pregunta abierta 5.
- Estado del comercio: desactivar debe poder hacerse con el comercio en cualquier estado que el Dueño pueda abrir (el resolver del Dueño lo permite en cualquiera); reactivar lo exigiría **operativo** como invitar. (Decisión no prevista 4.)
- Reactivar una `RENUNCIA` o una relación sin fila de baja: `409` con el mensaje "Esta persona dejó el equipo por su cuenta. Para que vuelva, invitala de nuevo." (código estable para el frontend).

---

## 7. Resto del backend: puntos finos

- **`MiembroEquipoResponseDTO`/`listarEquipo`:** agregar `motivoBaja`, `puedeReactivar` y, opcional, `diasRestantes` en invitaciones. El motivo sale de una sola consulta sobre `historial_empleado_comercio` (última fila con destino INACTIVO por relación, solo para relaciones INACTIVAS del comercio); índice `idx_hec2_relacion` alcanza para el volumen real.
- **`ClasificacionRutasComercioTest`:** las dos rutas del Dueño (`PUT /api/v1/comercios/equipo/miembros/{empleadoId}/desactivar` y `/reactivar`) hay que clasificarlas `EXCLUSIVO` (hoy 5 rutas de equipo ya están así, líneas ~99 a ~103); la renuncia, `PROPIO`; el endpoint de acceso, `PROPIO`. El test falla si un mapping de esos prefijos queda sin clasificar, y verifica el comportamiento de seguridad real contra la categoría.
- **`/api/v1/administrador/**`** ya es `hasRole("ADMINISTRADOR")`; los dos endpoints de lectura no necesitan matcher nuevo.
- **No hay cambios en `ComercioActivoService`**: no se debe tocar el resolver ni el `404` idéntico.
- **Cuenta del Empleado bloqueada/suspendida/inactiva:** `AuthService.propagarBloqueoAComercio` solo actúa si el rol es Dueño; la relación de un Empleado bloqueado sigue ACTIVA y sigue recibiendo copias del fan-out. No es de E4 (decidido en el 2026-10-05 que las relaciones no se tocan por estados de cuenta), pero lo dejo anotado para que no sorprenda en las pruebas.
- **Migraciones:** ninguna.

---

## 8. Riesgos

1. **Mejora de bloqueo / bloqueos de rango (alto, ya conocido):** leer la relación con compartido y escribirla; `UPDATE` o `DELETE` por `empleado_id` + `comercio_id` o por `usuario_id` + `comercio_id` (bloqueos de hueco y `index_merge` en MariaDB 10.4). Mitigación: entidad cargada con `FOR UPDATE` y escrita por clave primaria; purgado por ids.
2. **Atajo de test que no escribe historial (medio):** deja relaciones INACTIVAS "no reactivables". Mitigación: parámetro `motivo` opcional; documentarlo en el Javadoc.
3. **Textos de la hoja de pérdida en el spec 38 (medio):** ~10 tests asertan "te sacó del equipo"; cambiarlos es parte de B2.
4. **Pestaña Actividad con 4 fuentes (bajo):** una consulta más por página; el cursor depende del `ordinal` de `FuenteActividad` (se agrega al final).
5. **Sondeo de 15 s y estados intermedios en la UI del Dueño (medio):** desactivar desde dos dispositivos del mismo Dueño; el repintado por firma ya lo soporta; hay que decidir si el menú queda abierto cuando la fila cambió de estado.
6. **Doble confirmación del Empleado y la hoja bloqueante (medio):** si la renuncia termina y el sondeo de otra pestaña ve la pérdida, aparece la hoja equivocada (H3).
7. **WebKit / iPhone (sin probar):** `playwright.config.ts` solo tiene el proyecto `chromium`; las hojas inferiores usan `document.body.style.overflow = 'hidden'` (en iOS no bloquea el scroll del fondo), foco y `100vh`/áreas seguras; antecedente en `docs/MAPEO-ARCHIVOS-TRAMO-FIX-IPHONE-WEBKIT.md`. La renuncia es una acción destructiva con dos hojas encadenadas: es el flujo con más riesgo de comportarse distinto en iOS. Deuda declarada, no se puede cerrar sin un iPhone.
8. **Documentación desfasada (bajo):** `requisitos-funcionales-empleado.md` (línea ~106) todavía dice que "Vencida" se calcula "sin un proceso automático" (desde A8 es un estado guardado con `InvitacionVencimientoJob`).

Flakes probables en las pruebas de E4: sondeos de 15 s (usar `expect.poll` con timeout ≥ 40 s como el spec 36), la hoja bloqueante de pérdida de acceso (en `38` ya hay tests sensibles al orden de eventos), el ancho a 375 px del spec 36 (`36:541`, inestable conocido), `27:497`, `01:100` y los de Cloudinary (`06`, `53`, `51`), más la regla de **sesión única por cuenta**: un test que haga login por UI del Dueño y del Empleado a la vez es seguro (cuentas distintas); uno que use dos veces la misma cuenta, no.

---

## 9. Frontend: detalle de lo que entra

**B1 (Dueño), `js/equipo-comercio.js` + `comercio-perfil.html` + `css/styles.css`:**
- Menú ⋯ en `crearFilaMiembro` (mismo componente que `crearAccionMenuFila`), con "Desactivar" (peligro) para ACTIVO y "Reactivar" para INACTIVO con `puedeReactivar`. Una sola confirmación (hoja `modal-sheet` + `equipo-hoja__peligro`), `ocupar(...)`, errores del servidor con `mensajeDeError`.
- Inactivos: grupo "Inactivos" dentro de Mi equipo (después de los activos; contador de la pestaña sigue siendo solo activos) con el motivo ("Dado de baja" / "Renunció") a partir de `motivoBaja`. Un inactivo que no se puede reactivar muestra un texto "Para que vuelva, invitalo de nuevo" y no el botón.
- Actividad: chip "Equipo" (`FILTROS_ACTIVIDAD` suma `{id:'equipo', texto:'Equipo', fuente:'EQUIPO'}` y su `TEXTO_VACIO_ACTIVIDAD`); `crearFilaActividad` ya muestra `entidadNombre` y acción.
- Sondeo y firma: sin cambios; `firmaDe` ya cubre `estado`, `fechaBaja` y los campos nuevos del DTO.

**B2 (Empleado):** fila nueva en `#lista-perfil-empleado` o en la sección "Sesión" (`id`, `data-testid`, nacida `disabled` y habilitada al final, como las demás), hojas de doble confirmación, llamada a `/empleados/comercios/{id}/renunciar`, función nueva en `js/api.js` (p. ej. `salirDelComercio`) que limpia contexto y último contexto (`clearContexto` + `olvidarUltimoContexto`) y navega a `RUTA_SELECTOR_CONTEXTO` o al inicio de Cliente según queden otros comercios (`consultarSiQuedanOtrosComercios` ya existe) **sin** pasar por `perderAccesoAlComercio`. `perderAccesoAlComercio` + `mostrarAvisoAccesoPerdido`: nuevas copias por causa (necesita endpoint A) y por defecto copia neutra.

**B3 (Administrador):** botón "Ver equipo" en `mostrarModalDetalleComercio` junto a "Suspender", visible para cualquier estado listado; página `admin-comercio-equipo.html?id=N` + función de `js/admin.js` que reutilice la presentación de filas de `js/equipo-comercio.js`. Ojo: `equipo-comercio.js` está atado a `getComercioActivoId`, `getComercioActivoEnMemoria` y a la vista `view-equipo`; hay que extraer las funciones de dibujo (`crearFilaMiembro`, `crearFilaInvitacion` sin menú, `crearFilaActividad`, `crearSeparadorDeDia`) a un módulo sin dependencia del comercio activo. Es el cambio de frontend con más riesgo de regresión sobre pantallas ya verificadas (specs 36 y 55).

---

## 10. Tests (punto 10; todo verificado con grep)

**Playwright (último spec: `55-actividad-dueno-ui`):** los nuevos arrancan en el 56. Specs existentes que E4 afecta:
- `35-empleado-invitacion-api` (49 tests): el listado del equipo y la reactivación por invitación; el contrato del DTO crece (campos nuevos, aditivo).
- `36-empleado-invitacion-ui` (47): `36:1126` ("Mi equipo muestra solo a los integrantes activos") arma un INACTIVO con `UPDATE` SQL directo y asserta que **no se ve** (`36:1150`): cambia con la sección de inactivos. Los tests de menú de miembros ("los miembros no tienen menú", `36:1104`) también.
- `37-empleado-acceso-api` (32), `42-empleado-escrituras-api` (29), `45-notificaciones-equipo-api` (10), `50-empleado-matriz-delegable-api` (6): usan `atajoEstadoRelacion`; siguen andando con el atajo; conviene sumar variantes con el endpoint real.
- `38-empleado-acceso-ui` (63): líneas ~799 a ~906 aseran los textos exactos de la hoja de pérdida ("{nombre} te sacó del equipo.", "El comercio te sacó del equipo.", "Elegí con qué cuenta seguir."); cambian con B2.
- `54-empleado-notificaciones-ui` (11) y `55-actividad-dueno-ui` (16): el segundo asserta los tres chips y `FILTROS_ACTIVIDAD`; el chip "Equipo" lo toca.
- **Specs nuevos propuestos:** `56` API (desactivar/reactivar/renunciar, historial, avisos, 404 idéntico, reglas de aptitud), `57` API (Administrador: equipo y actividad, seguridad por rol), `58` UI Dueño, `59` UI Empleado (renuncia, hoja de pérdida con causas), `60` UI Administrador.

**Tests Java** (88 archivos; los de equipo/invitaciones/relación/avisos): `EquipoComercioControllerIntegrationTest` (16), `InvitacionEmpleadoIntegrationTest` (32), `InvitacionEmpleadoAceptacionIntegrationTest` (23; la parte de reactivación por invitación y el escenario de relación ya ACTIVA con invitación pendiente de H4), `ComercioActivoServiceResolverEmpleadoIntegrationTest` (9), `MisComerciosEmpleadoIntegrationTest` (4), `NotificacionesEquipoIntegrationTest` (11) y `NotificacionesEquipoConcurrenciaIntegrationTest` (3; su arnés usa el atajo), `EscriturasEmpleadoIntegrationTest` (20), `AudienciaNotificacionTest`, `ClasificacionRutasComercioTest`, `EnumsContraBaseDeDatosIntegrationTest` (sin cambios si no hay migración) y el helper `DatosPruebaEmpleado.vincularEmpleado` (sumar variantes con historial).

**Newman:** la colección tiene 68 carpetas; la última es la `67` (Orden único de bloqueo del catálogo, E3 A5b). **La próxima carpeta libre es la `68`.** Constructor nuevo `build-empleado-tramoE4-postman.mjs` (se corre después de `build-catalogo-orden-tramoE3-A5b-postman.mjs`; la carpeta `56` de E1 y la `66` quedan como están, salvo ajustes a mano si cambia el contrato del equipo).

**Estreses:** `stress-locks-empleado-e4.mjs` nuevo (sección 5.2), registrado en `ESTRESES` de `correr-estreses.mjs` como `{ id: 'e4', archivo: 'stress-locks-empleado-e4.mjs', descripcion: ... }`. El escenario 6 de `a5` y el arnés de `a4` que hoy usan el atajo (o una sesión de `mysql.exe`) se mantienen; E4 agrega la variante con el endpoint real.

---

## 11. Documentación a tocar al cerrar E4

Internos: `CLAUDE.md` (§1bis: ítem del rol Empleado con el estado de E4; §3 componentes; §6 fila E4 y fila E3 si cambia; §7.2; §7bis endpoints nuevos; §9 pendientes), `docs/DECISIONES.md` (entrada nueva), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (bloque de E4 y la fila de cada operación en el orden global), `docs/APRENDIZAJES-TECNICOS.md` (lo que salga de las mutaciones), `docs/diccionario-de-datos.md` (v1.18: fuente `EQUIPO`, campos del DTO, texto de T32/T34), `testing/playwright/README.md`, `docs/MAPEO-ARCHIVOS-TRAMO-E4*.md` (si se mantiene la costumbre).

De `docs/entregables-01-02/` (copias para `01.` y `02.`, las pasa Diego a mano): `CAMBIOS.md`, `diccionario-de-datos.md`, `requisitos-funcionales-empleado.md` (estados de la relación — corregir el desfasaje de "Vencida" —, renuncia, hoja de pérdida), `requisitos-funcionales-dueño.md`, `requisitos-funcionales-administrador.md` (Ver equipo), `requisitos-funcionales-sistema.md` (T32/T34, historial, estado de implementación), `Historias de Usuario - Empleado.md` (HU-E05, HU-E06), `Historias de Usuario - Dueño.md`, `Historias de Usuario - Administrador.md`, `alcance-y-limitaciones.md` (sin verificar su contenido en esta auditoría).

---

## 12. Propuesta de bloques

**B0 — Mockups primero** (no es código): tres pantallas clave (Mi equipo con inactivos y menú ⋯ con Desactivar/Reactivar; perfil del Empleado con la fila de renuncia y las dos hojas; "Ver equipo" del Administrador) y el nombre del botón de renuncia.

**Backend**
- **A1 — Desactivar y reactivar (Dueño).** Servicio nuevo de gestión de la relación (orden de bloqueo de 5.1), `PUT .../miembros/{empleadoId}/desactivar` y `/reactivar`, historial `BAJA_DUENO`/`REACTIVACION`, T32, purgado, reglas de aptitud (extraer la validación de cuenta), `motivoBaja`/`puedeReactivar` en el DTO, parámetro `motivo` en el atajo de test, clasificación de rutas, tests Java con latches (S1, S2, S4, S10), Newman carpeta 68 (parte 1), spec 56 (parte 1).
- **A2 — Renuncia.** `PUT /empleados/comercios/{id}/renunciar`, matcher de `SecurityConfig` (H1), T34, endpoint de acceso propio (si se aprueba), tests (S3, S7), spec 56 (parte 2).
- **A3 — Historial y Administrador.** Fuente `EQUIPO` en la actividad, refactor `listarEquipo(Integer)`, los dos endpoints del Administrador, `diasRestantes` opcional, spec 57, carpeta 68 (parte 2).
- **A4 — Cierre y verificación.** Estrés `e4` completo con las mutaciones (S1 a S10), regresión de los 17 estreses anteriores y del A5, corridas de `mvnw test` (dos pasadas), Newman completo, Playwright completo, documentación (sección 11).

**Pantallas**
- **B1 — Dueño** (spec 58), **B2 — Empleado** (spec 59, ajuste del spec 38), **B3 — Administrador** (spec 60, extracción de funciones de dibujo).

Corte distinto al que pediste: **no hace falta un bloque aparte para el historial del lado Dueño**; entra con la fuente `EQUIPO` en A3 y el chip en B1. Si preferís el endpoint de historial separado, A3 crece (paginación propia) y B1 gana una vista. Y propongo que A2 salga **antes** que A3 porque B2 (la renuncia) no depende del historial ni del Administrador y desbloquea antes la prueba manual del flujo completo de pérdida de acceso.

---

## 13. Cambios de backend propuestos (todos "necesita tu OK")

1. Servicio y endpoints `PUT /api/v1/comercios/equipo/miembros/{empleadoId}/desactivar` y `/reactivar` (exclusivos del Dueño; `X-Comercio-Id` obligatorio; `200` idempotente; sin cuerpo). *Necesita tu OK.*
2. `PUT /api/v1/empleados/comercios/{comercioId}/renunciar` (solo `CLIENTE`, ignora `X-Comercio-Id`) más el matcher de `SecurityConfig`. *Necesita tu OK.*
3. `GET /api/v1/empleados/comercios/{comercioId}/acceso` (solo `CLIENTE`), para distinguir la causa de la pérdida sin romper el `404` idéntico. *Necesita tu OK; alternativa C sin backend.*
4. Fuente `EQUIPO` en `ActividadComercioService` / `FuenteActividad` y los textos de cada motivo. *Necesita tu OK.*
5. `GET /api/v1/administrador/comercios/{id}/equipo` y `/actividad` (solo lectura). *Necesita tu OK.*
6. `MiembroEquipoResponseDTO`: `motivoBaja`, `puedeReactivar`; `InvitacionEmpleadoResponseDTO`: `diasRestantes` (opcional). *Necesita tu OK.*
7. Atajo de test `cambiarEstadoRelacionEmpleado` con `motivo` opcional (perfil `test`, no es producción). *Necesita tu OK.*
8. Extraer la validación de cuenta de `InvitacionEmpleadoService` para compartirla con la reactivación. Refactor interno, sin cambio de contrato. *Necesita tu OK.*

---

## 14. Decisiones no previstas (que surgieron al auditar y que conviene fijar)

1. **Idempotencia vs. `409`** al repetir desactivar/reactivar/renunciar. Recomendación: `200` idempotente sin fila de historial ni aviso (como el cierre manual). Alternativa: `409` como reenviar y cancelar invitaciones.
2. **Quién ve el motivo de baja:** `motivoBaja` en el DTO del Dueño (y del Administrador) — el Empleado sin relación no ve nada. Recomendación: sí.
3. **Reactivar directo con una invitación pendiente del mismo email:** `409` (H4) o cierre automático de la pendiente (`CANCELADA` más fila de historial). Recomendación: `409`, más simple y sin bloqueos extra de invitaciones.
4. **Estado del comercio:** desactivar en cualquier estado; reactivar solo con el comercio operativo (como invitar). Recomendación: esta.
5. **Edad al reactivar:** se incluye la comprobación aunque en la práctica no pueda fallar.
6. **El Empleado que renuncia no es el Cliente de pedidos en curso del comercio ni los afecta:** cualquier otro miembro o el Dueño sigue pudiendo actuar (no hay pedidos asignados, decidido).
7. **Renunciar con el comercio en cualquier estado:** se acepta aunque el comercio no sea accesible para el Empleado (si no, no podría irse de un comercio inactivado). Recomendación: la renuncia solo exige relación ACTIVA y no usa el resolver por estado.
8. **Texto de T32 y T34 (propuesta, a ajustar en mockups):** T32 "{Comercio} te dio de baja del equipo. Ya no tenés acceso a ese comercio." — T34 "{Nombre Apellido} dejó de trabajar en {Comercio}." (con `entidadTipo = COMERCIO` y `entidadId` = el comercio).
9. **La confirmación del nombre del botón de renuncia** y su ubicación se deciden en mockups (los requisitos dicen "Dejar de trabajar en este comercio").

---

## 15. Preguntas abiertas (con recomendación)

1. ¿Aprobás la fuente `EQUIPO` en la actividad (en vez de un endpoint de historial aparte)? **Sí**, por reutilización total para el Dueño y el Administrador.
2. ¿Aprobás el endpoint de acceso propio (opción A de H3), o preferís la copia neutra sin backend (opción C)? **A**, porque corrige además el texto falso actual; si querés cero superficie nueva, **C** es aceptable.
3. ¿Dónde se ven los inactivos del Dueño: un grupo "Inactivos" dentro de Mi equipo, o una pestaña propia? **Grupo dentro de Mi equipo** (el contador "Mi equipo · N" sigue contando solo activos).
4. ¿Reactivar directo con una invitación pendiente: `409` o cierre automático? **`409`.**
5. ¿Se manda el email de regularización al reactivar a una cuenta no apta, como al invitar? **No**: el Dueño ya conoce a la persona y no hay ninguna invitación enviada; el `409` genérico alcanza.
6. ¿El Administrador puede ver el equipo de **cualquier** comercio (incluso `PENDIENTE`, `RECHAZADO`) o solo los que se listan en `admin-comercios.html` (APROBADO, APTO_VENTA, SUSPENDIDO)? **Cualquier comercio existente**, así el endpoint no depende de qué listado lo invoque; el botón solo aparece donde ya hay modal.
7. ¿Avisar al Empleado cuando lo **reactivan**? No está en lo decidido y `EMPLEADO_DESACTIVADO` no encaja; requeriría un tipo nuevo y una migración del ENUM. **No por ahora.**
8. ¿`diasRestantes` en las invitaciones dentro de A3? **Sí**, es barato y cierra el riesgo de zona horaria anotado en E1.

FASE 1 COMPLETA: espero tu OK.

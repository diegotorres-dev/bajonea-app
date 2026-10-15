# Auditoría previa del tramo E3 — Rol Empleado: operación delegada

> **DOCUMENTO HISTÓRICO (2026-10-14, bloque A5).** Esta es la auditoría de solo lectura previa al tramo E3, escrita el 2026-10-12 y **no se reescribió**: refleja lo que se sabía antes de implementar. Varias cosas cambiaron al implementar y la fuente vigente es `docs/DECISIONES.md` (entradas de E3, bloques A0 a A6 y A5), `CLAUDE.md` (§1bis, §7.2) y `docs/CONCURRENCIA-Y-TRANSACCIONES.md`. Diferencias principales: son **18 escrituras delegables** (no 19; el cierre como no retirado sumó una y el perfil se partió en `datos-operativos`), `DelegacionEmpleado` tiene **23 rutas**; las migraciones llegan a **`V34`** (`V32` es `historial_edicion_comercio`, no `actividad_comercio`); el servicio de autorización explícito `ActorComercioService` no existe (lo hacen `ComercioActivoService.exigirRelacionActiva` y los guards estáticos); las acciones de pedido sí toman el lock del pedido (A0); `anular` y toda devolución generan la nota de crédito en la misma transacción (A0 y A0b); y las preguntas abiertas del final ya están resueltas.

> **Entrega B cerrada en el código (2026-10-14).** Las pantallas de E3 se hicieron en cuatro etapas, cada una con su spec de Playwright: etapa 1, pedidos del comercio (spec 52); etapa 2, edición del comercio, productos y cierre del Empleado (spec 53); etapa 3, campana y notificaciones del Empleado (spec 54); etapa 4, pestaña Actividad del Dueño (spec 55), que sumó el filtro opcional `fuente` al endpoint de actividad. Detalle y resultados de cada etapa en `docs/DECISIONES.md` (2026-10-14). Pendiente de la confirmación de Diego; el pulido de interfaz queda para una pasada aparte.

Fecha: 2026-10-12. Auditoría de **solo lectura**: no se modificó código, tests ni migraciones, no se levantó el backend, no se corrió nada contra `bajonea_practicas3` y no se leyeron contraseñas de prueba ni el environment de Postman. El único archivo creado es este.

**Regla para todas las entregas futuras del tramo (E3 y siguientes): ningún archivo `.html`, `.css` ni `.js` puede llevar comentarios en el código.**

Estado de partida verificado: último commit `74fddbb` (E2 B6), última migración `V31`, `git status` con `application.properties` modificado y los tres elementos sin seguimiento que ya conocías (`run-local.ps1`, `scripts/migrar-flyway/`, `tmp-capturas/`); no se tocó ninguno.

Documentos leídos: `CLAUDE.md`, `docs/DECISIONES.md` (decisiones del 2026-10-05 y entradas de E1/E2, incluidas A5 y B6), `requisitos-funcionales-empleado.md`, `Historias de Usuario - Empleado.md`, `requisitos-funcionales-comercio.md` y `requisitos-funcionales-sistema.md` (catálogo T1 a T35), `diccionario-de-datos.md` (v1.12), `docs/entregables-01-02/CAMBIOS.md`, `AUDITORIA-EMPLEADO-FASE1.md` (secciones 5, 6, 7 y 12), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` y `docs/DATA-TESTID-FASE17.md` (convención). Más el código de `controllers/`, `services/`, `config/security/`, `repositories/`, `dto/`, las migraciones, los specs 35 a 38, los helpers y builders de testing y los archivos de `frontend/` que se nombran abajo.

---

## 0. Resumen y hallazgos que cambian el plan

El diseño decidido es coherente con el código real. La base de E2 (resolver con actor, lista blanca por ruta exacta, prueba de clasificación, DTO reducido de perfil y de pedidos) está lista para abrir las escrituras. Lo que hay que saber **antes** de empezar, porque contradice o matiza lo decidido:

1. **`anular` NO genera reembolso hoy.** `PedidoService.anularPedido` (línea 404) y `cancelarPedido` (línea 383) tienen un `// TODO: genera reembolso, pendiente de NotaCredito`. El enum `MotivoNotaCredito.ANULACION_COMERCIO` existe y no se usa. El contexto de este tramo dice "los reembolsos son automáticos y el Empleado puede rechazar y anular": es cierto para `rechazar` (lleva `procesarReembolsoTotal(RECHAZO_COMERCIO)`), pero no para `anular`. Delegar `anular` sin cerrar esto deja a un Empleado anulando pedidos pagados sin devolver el dinero. Es la "tarea 2" que el tramo de NotaCredito dejó pendiente. Propuesta: bloque A0, una línea más en `anularPedido` con su test (cambia también al Dueño). Pregunta abierta 1.
2. **El comercio no puede "confirmar entregas de pedidos `EN_CAMINO`".** La decisión 27 y los requisitos lo prometen para el Empleado con el comercio suspendido o cerrado temporalmente, pero no existe endpoint del comercio para eso: `PUT /pedidos/comercio/{id}/entregar` exige `LISTO_PARA_RETIRAR` ("El pedido no está listo para retirar"); la entrega de un `EN_CAMINO` la confirma el Cliente (`PUT /pedidos/cliente/{id}/entregar`) o el sistema a los 90 minutos. Lo único que el Empleado puede "terminar" es entregar un `LISTO_PARA_RETIRAR`. Pregunta abierta 2.
3. **`aceptar`, `rechazar`, `despachar`, `entregar` y `anular` no toman ningún bloqueo** (`obtenerPedidoDelComercio` usa `findById`; `Pedido` no tiene `@Version`). `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (fila de "Doble aceptación/rechazo") lo dejó a propósito sin lock porque había "un solo Comercio operando"; con varios operadores (Dueño más Empleados) deja de ser un supuesto válido: dos personas que aprietan "Aceptar" y "Rechazar" a la vez dejan el pedido `RECHAZADO` con la notificación "aceptado" ya enviada, un doble historial y un reembolso disparado. Los cuatro jobs (`expirarPedidosSinRespuestaComercio` y los otros tres) tampoco bloquean. Propuesta: usar `bloquearParaActualizar` (ya existe, `refresh` con `PESSIMISTIC_WRITE`, lo usa `MercadoPagoPagoService`) en las cinco acciones y volver a verificar estado dentro del lock en los jobs. Cambia también al Dueño.
4. **Hoy ninguna escritura valida el estado del comercio**, salvo `cerrar`/`abrir`. Un Dueño puede crear productos, editar el perfil o aceptar pedidos con el comercio en cualquier estado. El guard "comercio no operativo" de la decisión 27 es **solo para el Empleado** (el Dueño queda para el tramo de suspensión), así que habrá una asimetría deliberada.
5. **La foto del comercio y las imágenes de producto solo validan el dominio de Cloudinary, no la carpeta.** `PUT /comercios/perfil/foto`, `POST /productos/{id}/imagenes` y `PATCH .../url` aceptan cualquier URL de `res.cloudinary.com`. La validación por carpeta ya existe (`CloudinaryService.validarFotoPerfilComercio`) pero solo la usa la corrección de comercios rechazados. Con más gente escribiendo conviene aplicarla. Es un hueco previo (también del Dueño), pero E3 lo agranda.
6. **`PUT /comercios/perfil` y `PUT /comercios/perfil/foto` devuelven `ComercioResponseDTO` completo** (razón social, CUIT, domicilio fiscal, representante). Y las cinco acciones de pedidos devuelven `PedidoResponseDTO` completo (cargos, `clienteId`, `pagoEstado`). Hay que ramificar por actor igual que ya hacen `GET /comercios/perfil` y `GET /pedidos/comercio`.
7. **Un `403` en el frontend manda a `acceso-denegado.html`** (`js/api.js`, rama `response.status === 403 && hadToken`). Por eso "No podés gestionar tus propios pedidos" y el guard de comercio no operativo tienen que ser `409`, no `403`.
8. **Las notificaciones del comercio y las del Cliente hoy se mezclan para un mismo usuario**, y el listado del Cliente muestra todas las del usuario. Con el fan-out, un Empleado vería en su campana de Cliente los "Nuevo pedido recibido" del comercio. Se resuelve por tipo de notificación, sin columna nueva ni migración (sección 5).
9. **V32 está libre** y no choca con nada. El DDL aprobado el 2026-10-05 sirve; propongo un solo cambio (columna `actor_nombre`, snapshot), que hay que aprobar porque el DDL era tuyo (sección 6).

---

## 1. Inventario de escrituras del Dueño

Se recorrieron todos los `POST`, `PUT`, `PATCH` y `DELETE` bajo `/comercios`, `/productos`, `/pedidos/comercio`, `/notificaciones`, `/oauth/mercadopago` y `/empleados`. **El número de 19 escrituras delegables se confirma**: 9 de productos, 5 de comercio (perfil, foto, cierre) y 5 de pedidos. Ninguna usa `@Version` ni lock salvo las dos de cierre. Los servicios (`ProductoService`, `ComercioService`, `PedidoService`) son `@Transactional` de clase.

### 1.1 Las 19 delegables

Todas devuelven hoy lo que dice la columna "DTO" sin distinguir actor. Ninguna dispara email. "Actor hoy" es lo que queda registrado: en productos y perfil, nada.

| # | Método y ruta | Controller → servicio | Validaciones | Transacción y locks | Notificaciones | Actor hoy | DTO hoy (y qué recibiría el Empleado) |
|---|---|---|---|---|---|---|---|
| 1 | `POST /productos` | `ProductoController.crearProducto` → `ProductoService.crearProducto(comercioId, req)` | `@Valid ProductoRequestDTO` (nombre ≤150, descripción ≤2000, precio > 0, categoría y tags existentes); nombre a Title Case | Transacción de clase, sin lock | Ninguna | Ninguno | `ProductoResponseDTO` (sin dato sensible): igual |
| 2 | `PUT /productos/{id}` | `editarProducto` | Igual; `409` si `DESCONTINUADO`; `409` si no tiene ninguna imagen | Reemplaza los tags (delete e insert); sin lock: gana la última escritura | Ninguna | Ninguno | `ProductoResponseDTO`: igual |
| 3 | `PATCH /productos/{id}/estado` | `cambiarEstado` | Mapa de transiciones (`DESCONTINUADO` es final); `409` si no corresponde | Sin lock | `PRODUCTO_REMOVIDO_CARRITO` a cada Cliente que lo tenía en el carrito (`limpiarCarritosActivos`) | Ninguno | `ProductoResponseDTO`: igual |
| 4 | `POST /productos/{id}/cloudinary/firma` | `generarFirmaImagen` | Producto del comercio; `409` si ya tiene 5 imágenes | Solo lectura (no escribe) | Ninguna | n/a | `CloudinarySignatureResponseDTO` (api key pública, firma): igual |
| 5 | `POST /productos/{id}/imagenes` | `agregarImagen` | `@ValidarUrlCloudinary` (solo dominio); límite de 5 (leer, comprobar, escribir: sin lock) | Sin lock | Ninguna | Ninguno | `ImagenProductoResponseDTO`: igual |
| 6 | `DELETE /productos/{id}/imagenes/{imagenId}` | `eliminarImagen` | Imagen del producto; recalcula la principal | Sin lock | Ninguna | Ninguno | `ApiResponse<Void>`: igual |
| 7 | `PATCH /productos/{id}/imagenes/{imagenId}/orden` | `reordenarImagen` | `@Valid OrdenImagenRequestDTO` | Sin lock | Ninguna | Ninguno | `ImagenProductoResponseDTO`: igual |
| 8 | `POST /productos/{id}/imagenes/{imagenId}/recorte/firma` | `generarFirmaRecorteImagen` | Producto e imagen del comercio | Solo lectura | Ninguna | n/a | Firma: igual |
| 9 | `PATCH /productos/{id}/imagenes/{imagenId}/url` | `actualizarUrlImagen` | `@Valid UrlImagenRequestDTO` (solo dominio) | Sin lock | Ninguna | Ninguno | `ImagenProductoResponseDTO`: igual |
| 10 | `PUT /comercios/perfil` | `ComercioController.editarPerfil` → `ComercioService.editarPerfil(comercioId, req)` | `@Valid ComercioPerfilRequestDTO` (nombre, descripción, teléfono argentino, email de contacto, delivery y retiro: al menos uno); sin chequeo de duplicado ni de estado | Sin lock; **siempre** actualiza `fechaModificacion`, haya o no cambio | Ninguna | Ninguno | **`ComercioResponseDTO` completo con datos fiscales y representante → reducir** (`ComercioEmpleadoResponseDTO`) |
| 11 | `POST /comercios/perfil/foto/firma` | `generarFirmaFotoPerfil` | Solo existe el comercio | Solo lectura; carpeta `comercios/{id}/perfil/` | Ninguna | n/a | Firma: igual |
| 12 | `PUT /comercios/perfil/foto` | `actualizarFotoPerfil` | `@ValidarUrlCloudinary` (solo dominio, **sin carpeta**) | Sin lock | Ninguna | Ninguno | **`ComercioResponseDTO` completo → reducir** |
| 13 | `PUT /comercios/cerrar` | `ComercioController.cerrar` → `CierreComercioService.cerrar(comercioId, duenoId, ActorCierre.DUENO)` | `409` si el comercio no es operativo; `409` fuera de franja; idempotente | `usuario` en `LOCK IN SHARE MODE` → `comercio` en `PESSIMISTIC_WRITE` (`refresh`); una fila en `historial_cierre_comercio` solo si cambia la bandera | Ninguna | `ActorCierre.DUENO` y **`duenoId` fijos** (el controller pasa `comercio.duenoId()`) | `CierreComercioResponseDTO` (4 flags): igual |
| 14 | `PUT /comercios/abrir` | `abrir` | Idem | Idem | Ninguna | Idem | Idem |
| 15 | `PUT /pedidos/comercio/{id}/aceptar` | `PedidoController.aceptarPedido` → `PedidoService.aceptarPedido(ComercioActivo, id)` | Pedido del comercio y que haya llegado pagado; estado debe ser `PENDIENTE_CONFIRMACION_COMERCIO` (`409`) | **Sin lock** (`findById`) | `PEDIDO_ACEPTADO` al Cliente | `ActorPedido.DUENO` con `comercioActivo.duenoId()` fijo (línea 278) | **`PedidoResponseDTO` completo → `PedidoEmpleadoResponseDTO`** |
| 16 | `PUT /pedidos/comercio/{id}/rechazar` | `rechazarPedido` | Igual; `RechazoPedidoRequestDTO` (motivo; si es `OTRO`, comentario obligatorio) | Sin lock; `procesarReembolsoTotal(RECHAZO_COMERCIO)` diferido a después del commit | `PEDIDO_RECHAZADO` al Cliente | Idem (línea 304) | Idem |
| 17 | `PUT /pedidos/comercio/{id}/despachar` | `avanzarAEntregaEnCurso` | Estado `EN_PREPARACION`; destino `EN_CAMINO` (domicilio) o `LISTO_PARA_RETIRAR` (retiro) | Sin lock | `PEDIDO_EN_CAMINO` o `PEDIDO_LISTO_RETIRO` al Cliente | Idem (línea 331) | Idem |
| 18 | `PUT /pedidos/comercio/{id}/entregar` | `confirmarEntregaComercio` | Estado `LISTO_PARA_RETIRAR` | Sin lock | **Ninguna** (el Cliente no recibe aviso de la entrega confirmada por el comercio) | Idem (línea 367) | Idem |
| 19 | `PUT /pedidos/comercio/{id}/anular` | `anularPedido` | Estado `EN_PREPARACION`; `@Valid AnulacionPedidoRequestDTO` (motivo obligatorio, ≤500) | Sin lock; **sin reembolso (TODO)** | `PEDIDO_ANULADO_COMERCIO` al Cliente, con el motivo escrito | Idem (línea 403) | Idem |

### 1.2 Las exclusivas del Dueño (no se delegan)

| Escritura | Motivo |
|---|---|
| `POST /comercios`, `POST /comercios/nuevo/foto/firma`, `PUT /comercios/{id}/resolicitud`, `POST /comercios/{id}/correccion/foto/firma` | Alta adicional y corrección de rechazados: datos fiscales y estructura de aprobación. Por id en la ruta, no usan `ComercioActivo`. |
| `POST/PUT/DELETE /comercios/redes-sociales` (3) | Decisión 25: redes sociales exclusivas del Dueño. |
| `POST /comercios/equipo/invitaciones`, `.../{id}/reenviar`, `PUT .../{id}/cancelar` | Gestión del equipo. |
| `DELETE /oauth/mercadopago/desvincular` | Todo Mercado Pago es del Dueño (la vinculación entra por `GET /oauth/mercadopago/iniciar`). |
| `PUT /notificaciones/comercio/{comercioId}/leidas` | Pantallas de estado del Dueño; por id en la ruta. |
| `PUT /notificaciones/{id}/leida` | **Propia de cualquier usuario** (valida que la notificación sea suyo): ya funciona para el Empleado tal cual. No se delega, no hace falta. |

Total de escrituras en el módulo del Comercio: 19 delegables, 12 exclusivas y 1 propia.

### 1.3 Lecturas que E3 suma a la lista blanca (no son escrituras)

- `GET /notificaciones` y `GET /notificaciones/no-leidas/contador`: hoy "PROPIAS"; pasan a **compartidas con header opcional** (sin header = contexto Cliente; con header = comercio del Empleado). Sección 5.
- `GET /pedidos/comercio/{id}/trazabilidad` (propuesto): quién atendió cada paso del pedido. Sección 3.
- `GET /comercios/equipo/actividad` (exclusivo del Dueño, bajo `equipo/**`): la pestaña "Actividad". Sección 6.
- `GET /categorias` y `GET /tags` ya están abiertos a cualquier autenticado: sirven para el formulario de producto sin cambios.

---

## 2. Autorización

### 2.1 Cómo extender `DelegacionEmpleado`, `SecurityConfig` y la prueba de clasificación

- **`DelegacionEmpleado.RUTAS`** (hoy 4 lecturas) pasa a 4 + 19 + las lecturas nuevas de arriba, siempre por **método y ruta exacta** con el patrón del controller (`{id}`, `{imagenId}`), nunca comodines. `SecurityConfig` ya hace el `for` sobre la lista y abre cada ruta a `hasAnyRole("DUENO","CLIENTE")` por delante de los matchers `hasRole("DUENO")`: no necesita cambios de forma. Los matchers de `/productos/**`, `/comercios/**` y `/pedidos/comercio/**` siguen de red de seguridad para todo lo que no se liste.
- **`ClasificacionRutasComercioTest`**: pasar las 19 líneas `exclusivo(...)` a `delegable(...)` y sumar las rutas nuevas. Hoy las dos de notificaciones están como `PROPIO` y no sirven como delegables, porque la regla del test es "delegable = `400` a Cliente sin header", y para el Cliente `GET /notificaciones` sin header es un `200`. Hace falta una **quinta categoría `COMPARTIDO`** con sus propias aserciones: Cliente sin header `200`; Cliente con header de un comercio ajeno `404`; Dueño sin header `400`; Administrador sin header `200` (lista la suya) y con header ignorado.
- Pruebas nuevas que recomiendo, en el mismo estilo "contrato verificable": (a) **forma de la respuesta**: llamar cada delegable como Empleado y comprobar que el JSON no contiene `cargoServicioComercio`, `cargoServicioCliente`, `clienteId`, `pagoEstado`, `cuit`, `razonSocial`, `domicilioFiscal`, `representante` ni `mp*` (una sola prueba parametrizada que cubra los casos de las secciones 1 y 4); (b) **cada `TipoNotificacion` está clasificado** como del Cliente, del comercio o de ambos (sección 5); (c) **`ComercioActivo` es el primer parámetro** de cada delegable (ver 2.5).
- La prueba de clasificación tiene hoy una aserción vieja que se rompe sola al delegar: el test de Playwright `37` línea 475 ("un Empleado activo recibe 403 en escrituras de perfil, productos, pedidos y cierre", 13 intentos) y la carpeta 57 de Newman (negativos con `403` del Empleado en escrituras). Hay que reescribirlos (sección 9).

### 2.2 Cómo se resuelve `ComercioActivo` hoy y dónde se pierde el actor

`ComercioActivoService.resolver(usuarioId, rol, header)` arma `ComercioActivo(comercioId, duenoId, actorUsuarioId, actorRol, estadoComercio)`. Para el Empleado hace **una lectura sin bloqueo** (`EmpleadoComercioRepository.findComercioAccesible`) en el momento de resolver el argumento del controller, **antes** de que empiece la transacción del servicio. El actor se pierde en estos puntos:

| Dónde | Qué recibe hoy | Problema |
|---|---|---|
| `ProductoService` (9 métodos de escritura) | `Integer comercioId` | No sabe quién actúa: no puede registrar actividad ni re-verificar la relación. |
| `ComercioService.editarPerfil`, `actualizarFotoPerfil`, `generarFirmaFotoPerfil` | `Integer comercioId` | Idem. |
| `ComercioController.cerrar` y `abrir` | pasa `comercio.duenoId()` como "usuario que actúa" y `ActorCierre.DUENO` | Con un Empleado quedaría el Dueño como autor del cierre: incorrecto y silencioso. Hay que pasar `comercio.actorUsuarioId()` y el actor según `actorRol`. |
| `PedidoService` (5 acciones) | Sí recibe `ComercioActivo`, pero registra `registrarHistorial(pedido, ActorPedido.DUENO, comercioActivo.duenoId())` en las cinco | Mismo problema; y no vuelve a verificar la relación. |

Propuesta: los 19 métodos de servicio reciben `ComercioActivo` entero (como ya hace `PedidoService`) y llaman, **como primera línea**, a un único punto de control nuevo (la llamo `ActorComercioService.confirmarEscritura(ComercioActivo, AccionComercio)`):

1. Si el actor es Empleado: `usuarioRepository.leerIdConBloqueoCompartido(actorUsuarioId)` y después una **lectura nativa con `LOCK IN SHARE MODE`** de `empleado_comercio.estado` (no una consulta JPQL, que puede devolver la entidad ya cargada y vieja por el *open-in-view*; mismo motivo y mismo patrón que `leerEstadoConBloqueoCompartido` de `usuario` y de `comercio`). Si no es `ACTIVO`: `ComercioNoDisponibleException` (el mismo `404` con el mismo código).
2. Guard de estado del comercio (2.4) solo para el Empleado.
3. Para el Dueño no hace nada (conserva el comportamiento actual).

Recomiendo la llamada **explícita** y no un aspecto (`@Around`): el orden entre el aspecto y el interceptor de transacciones es frágil, y la llamada explícita queda a la vista. Para que no se olvide en ningún método, una prueba de servicio parametrizada de **19 casos**: dejar la relación en `INACTIVO` y llamar al servicio con el `ComercioActivo` ya resuelto; esperado `404` y cero filas escritas.

### 2.3 Qué pasa si la baja del Empleado ocurre en medio de una escritura

Hoy (E2) las lecturas no bloquean y eso está bien. Para las escrituras, sin el paso 1 de arriba: el Empleado resuelve su relación `ACTIVO`, el Dueño lo da de baja (E4), y la escritura del Empleado igual se completa unos milisegundos después de la baja. Con la lectura `LOCK IN SHARE MODE` en la transacción de la escritura:

- Si la escritura toma primero su bloqueo compartido, la baja (que pide la fila `FOR UPDATE`, ver `findByEmpleadoIdAndComercioIdConBloqueo`) **espera a que la escritura termine**: la escritura queda como hecha por un Empleado todavía activo y la baja se aplica después. Equivale a ordenarlas en el tiempo.
- Si la baja entra primero, la escritura ve `INACTIVO` y responde `404`; el frontend ya sabe qué hacer con ese código (`perderAccesoAlComercio`).
- Orden de bloqueo vigente: `usuario` → `invitacion_empleado` → `empleado_comercio` → `comercio`. El camino del Empleado queda `usuario(actor)` → `empleado_comercio` (S) → `comercio` o `pedido`. Es compatible con el orden del equipo: nunca se toma `comercio` antes que la relación.
- **Punto delicado (deadlock con el bloqueo de cuenta del Dueño)**: ya ocurrió en C1 y C2. Un `INSERT` en `notificacion`, `historial_*` o `actividad_comercio` toma un bloqueo compartido sobre la fila de `usuario` (clave foránea). Si una acción de pedido mantiene un bloqueo sobre `comercio` y después inserta una notificación al Dueño, se cruza con el bloqueo de cuenta por intentos fallidos (que tiene `usuario` y pide `comercio`). Por eso: **las acciones de pedido no deben bloquear `comercio`** (bloquean `pedido`; el estado del comercio se lee sin lock, ver 2.4), y las que sí lo hacen (`cerrar`/`abrir`) toman antes la fila del usuario, como hoy. Esto exige un script de estrés nuevo (sección 9).

### 2.4 Comportamiento actual del Dueño con el comercio `SUSPENDIDO` y `CERRADO_TEMPORALMENTE`, y regla para el Empleado

El resolver deja pasar al Dueño en **cualquier** estado. Las únicas escrituras que miran el estado son `cerrar` y `abrir` (`409` "Este comercio no está operativo" si no es `APROBADO` ni `APTO_VENTA`). Todo lo demás no valida nada.

| Escritura | Dueño hoy, `SUSPENDIDO` | Dueño hoy, `CERRADO_TEMPORALMENTE` | Regla propuesta para el Empleado |
|---|---|---|---|
| Productos (1 a 9) y foto/firma (4, 8, 11) | Permitida | Permitida | `409` en ambos estados |
| Perfil (10) y foto (12) | Permitida | Permitida | `409` en ambos estados |
| Cerrar y abrir (13, 14) | `409` | `409` | `409` (ya lo da el servicio) |
| Aceptar (15) y rechazar (16) | Permitida, pero al suspender se cancelan los pedidos `PENDIENTE_CONFIRMACION_COMERCIO` y `EN_PREPARACION`, así que no hay nada que aceptar | Permitida (los pendientes no se tocan al bloquear la cuenta; vencen a los 30 minutos con reembolso) | `409` en ambos estados |
| Despachar (17) y anular (19) | Permitida pero sin pedidos `EN_PREPARACION` (se cancelaron) | Permitida con pedidos `EN_PREPARACION` existentes | `409` en ambos estados (**ver pregunta 3**: puede dejar pedidos `EN_PREPARACION` varados) |
| Entregar (18) | Permitida: los `LISTO_PARA_RETIRAR` quedan con su temporizador de 90 minutos | Permitida | **Permitida** (excepción de la decisión 27) |

Detalles de implementación: el guard es una tabla en `ActorComercioService` (`ESTADOS_OPERATIVOS` y un `Set<AccionComercio>` de acciones permitidas fuera de ellos, hoy solo `ENTREGAR_PEDIDO`). El estado se lee **sin bloqueo** dentro de la transacción de la escritura, después de los bloqueos de la relación (así la lectura consistente se toma tarde y es reciente); `ComercioActivo.estadoComercio` solo es la foto del momento de resolver. Una suspensión que llegue justo después se serializa por el bloqueo de `pedido` (la suspensión cancela los pedidos activos con el lock de cada fila). Para el Dueño no se agrega ningún guard (queda para el tramo de suspensión). Si hay que mostrarle al Empleado "por qué no puede", el mensaje de `409` ya existe: "Este comercio no está operativo".

### 2.5 Orden de parámetros en los controllers

Hoy varios controllers declaran `@Valid @RequestBody` **antes** que `ComercioActivo`. Spring resuelve los argumentos en orden, así que un cuerpo inválido da `400` antes de que se evalúe la autorización, y un Cliente sin relación recibe `400` o `404` según el cuerpo. Es información inocua (nunca revela nada del comercio), pero hace los resultados menos predecibles y los tests más frágiles. Propongo `ComercioActivo` como **primer parámetro** de los 19 controllers y una prueba por reflexión que lo exija. Pequeño cambio mecánico; los tests que hoy esperan `400` por cuerpo inválido con un Dueño siguen igual (el Dueño pasa la resolución).

---

## 3. Trazabilidad del actor

### 3.1 Cómo se registra hoy

| Estructura | Columnas de actor | Estado |
|---|---|---|
| `historial_estado_pedido` | `actor_rol` ENUM(`CLIENTE`,`DUENO`,`SISTEMA`,`EMPLEADO`) y `actor_usuario_id` (FK a `usuario`), más `motivo_timeout` | Ya admite `EMPLEADO` (migración `V8`). `PedidoService.registrarHistorial(pedido, actorRol, actorUsuarioId)`. |
| `historial_cierre_comercio` | `actor_rol` ENUM(`DUENO`,`EMPLEADO`,`SISTEMA`), `actor_usuario_id`, con `CHECK` que exige usuario salvo `SISTEMA` | Ya admite `EMPLEADO` (`V28`). |
| `nota_credito` | No guarda actor (se vincula al pago y al motivo) | No hace falta: el actor del rechazo queda en `historial_estado_pedido`. |
| `historial_estado_comercio`, `historial_empleado_comercio` | Administrador y actor de equipo | No participan en E3. |

Para sumar `EMPLEADO` en pedidos y cierre no hace falta migración: el cambio es de código. En `PedidoService`, las cinco llamadas pasan de `(ActorPedido.DUENO, comercioActivo.duenoId())` a `(actor desde comercioActivo.actorRol(), comercioActivo.actorUsuarioId())`. En el cierre, el controller deja de fijar `ActorCierre.DUENO`. Los enums Java `ActorPedido` y `ActorCierre` ya tienen `EMPLEADO`; `RolActorComercio` (E2) tiene `DUENO` y `EMPLEADO`; hace falta un mapeo chico `RolActorComercio` → cada enum.

### 3.2 Dónde se guarda y cómo se muestra "quién atendió el pedido" (sin que lo vea el Cliente)

- **Dónde:** ya está guardado, por transición, en `historial_estado_pedido` (`actor_usuario_id`). No hace falta columna en `pedido`.
- **Cómo se lee:** el `PedidoResponseDTO` lo usa el Cliente, el Dueño y los jobs; agregarle la trazabilidad ahí la expondría al Cliente. Propongo un **endpoint separado de solo lectura**, `GET /pedidos/comercio/{id}/trazabilidad`, delegable (lo ven Dueño y Empleados), que devuelve una lista `{estado, actorRol, actorNombre, fechaHora}` por transición y se carga al abrir el detalle. Una consulta con `JOIN` a `persona_fisica` por `actor_usuario_id`. Para el actor `DUENO` el nombre sale de la misma cadena (`usuario → persona → persona_fisica`, que en el Dueño es el representante, porque `dueno.persona_fisica` comparte clave con la persona); para `SISTEMA`, "Sistema". El nombre es el **actual** de la persona (sin snapshot, decisión 29), y se mantiene aunque el Empleado esté `INACTIVO` porque el `usuario` nunca se borra.
- **Alternativa descartada:** sumar un campo opcional al `PedidoResponseDTO` y limpiarlo para el Cliente. Funciona, pero un descuido en cualquier endpoint nuevo lo filtra; un endpoint distinto no tiene ese riesgo.
- **Cierre y reapertura:** el requisito dice que el nombre de quien cerró o reabrió se muestra "en el detalle del panel del comercio". Propongo mostrarlo como subtítulo del interruptor ("Pedidos pausados por María G.") y en la pestaña Actividad del Dueño. Requiere sumar `cerradoPorNombre` a `CierreComercioResponseDTO` y a `MiComercioResponseDTO`/`MiComercioEmpleadoResponseDTO` (que el sondeo de 15 s ya trae) con una lectura de la última fila `CERRADO` del historial (`DisponibilidadComercioService` ya la consulta). Pregunta abierta 9.

---

## 4. DTOs de respuesta: lo que el Empleado no debe ver

Mismo criterio que `EstadoReembolsoEmpleado`, `ComercioEmpleadoResponseDTO` y `PedidoEmpleadoResponseDTO` de E2: el controller ramifica por `comercio.esEmpleado()` y arma el DTO reducido; el del Dueño no cambia.

| Escritura | Qué filtra hoy | Propuesta |
|---|---|---|
| 15 a 19 (acciones de pedido) | `PedidoResponseDTO` completo: `cargoServicioCliente`, `cargoServicioComercio`, `clienteId`, `pagoEstado` | Devolver `PedidoEmpleadoResponseDTO.desde(...)` al Empleado. Sumarle el campo `esPedidoPropio` (ver 4.1). |
| 10 y 12 (perfil y foto) | `ComercioResponseDTO` completo (razón social, CUIT, condición de IVA, tipo de sociedad, domicilio fiscal, fecha de inicio, representante, motivo de rechazo) | Devolver `ComercioEmpleadoResponseDTO`; sumarle `emailContacto` (la A5 lo dejó afuera "hasta E3": para editarlo el Empleado tiene que verlo). |
| 1 a 9 (productos) | `ProductoResponseDTO`: id, nombre, descripción, precio, categoría, comercio (id y nombre), estado, imágenes, tags | Sin datos sensibles: igual para ambos. |
| 13 y 14 (cierre) | `CierreComercioResponseDTO`: cuatro indicadores | Igual (más `cerradoPorNombre` si se acepta la pregunta 9). |
| 4, 8 y 11 (firmas) | `CloudinarySignatureResponseDTO` (firma, marca de tiempo, api key pública, cloud name, carpeta, preset) | Igual: no son secretos. |

### 4.1 Campo `esPedidoPropio` en el pedido del Empleado

`PedidoEmpleadoResponseDTO` excluye `clienteId` a propósito (A5). Para la etiqueta "Tu pedido" el servidor calcula `esPedidoPropio = pedido.clienteId == actorUsuarioId` y lo agrega al DTO reducido (para el Dueño no hace falta: un Dueño no es Cliente). La validación real de "no podés gestionar tus propios pedidos" va en el servicio de las cinco acciones, por id de usuario, con `ConflictoDeNegocioException` (`409`, nunca `403`, ver el hallazgo 7). También se aplica **dentro del lock del pedido** (no en el controller).

---

## 5. Notificaciones

### 5.1 Inventario de emisiones reales (tipos que el código crea hoy)

| Tipo (código T) | Emisor | A quién llega hoy | Cambio en E3 |
|---|---|---|---|
| `NUEVO_PEDIDO` (T1) | `PedidoService.confirmarPagoAprobado` (línea 230) | Dueño | **Fan-out** a Dueño y Empleados activos, sin el Cliente del pedido |
| `PEDIDO_ACEPTADO` (T2), `PEDIDO_RECHAZADO` (T3), `PEDIDO_EN_CAMINO` (T5), `PEDIDO_LISTO_RETIRO` (T6) | `aceptar`, `rechazar`, `despachar` | Cliente | Sin cambio |
| `AVISO_75MIN_SIN_CONFIRMACION` (T7), `PEDIDO_AUTOCONFIRMADO` (T8) | `avisar75MinYAutoconfirmar` | Cliente | Sin cambio (T8) |
| `PEDIDO_CANCELADO_CLIENTE` (T9) | `cancelarPedido` (línea 385) | Dueño | **Fan-out** |
| `PEDIDO_ANULADO_COMERCIO` (T10) | `anularPedido` | Cliente | Sin cambio |
| `PEDIDO_CANCELADO_SISTEMA` (T11) | `notificarCancelacionSistema` | Cliente | Sin cambio (el email que promete el catálogo no se envía hoy) |
| `PEDIDO_EXPIRADO_CLIENTE` (T12) | `expirarPedidosSinRespuestaComercio` | Cliente | Sin cambio |
| `PEDIDO_EXPIRADO_COMERCIO` (T13) | idem (línea 573) | Dueño | **Fan-out** |
| `COMERCIO_APROBADO`, `COMERCIO_RECHAZADO` (T14, T15), `COMERCIO_SUSPENDIDO` (T16) | `AdministradorService` (líneas 288, 330) | Dueño | Sin cambio: administrativas, solo el Dueño |
| `PRODUCTO_REMOVIDO_CARRITO` (T23) | `ProductoService.limpiarCarritosActivos` | Cliente | Sin cambio |
| `PEDIDO_CERRADO_TIMER_SUSPENSION` (T26) | `autoconfirmarRetirosPorSuspension` | Cliente | Sin cambio |
| `INVITACION_EMPLEADO` (T33) | `InvitacionEmpleadoService` (línea 339) | Dueño | Sin cambio |
| `INVITACION_EMPLEADO` (canal `EMAIL`) | `InvitacionRegularizacionService` | Persona invitada (rastro, no se lista) | Sin cambio |
| `PEDIDO_AUTOCONFIRMADO_COMERCIO` (T30) | **nadie** | nadie | Se emite al final del tramo (5.5) |

Tipos que existen en el ENUM y **no se emiten** hoy: T17 y T18 (`NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`), T19 a T22, T24, T25, T27 (`REEMBOLSO_FALLIDO_DEFINITIVO`), T28, T29, T32 y T34 (`EMPLEADO_DESACTIVADO`, es E4). No afectan a E3.

### 5.2 Cómo se arma el destinatario y cómo se evita el duplicado

Hoy cada emisión resuelve el destinatario con `pedido.getComercio().getDueno().getPersonaJuridica().getPersona().getUsuario().getId()` (una cadena de cuatro saltos repetida en tres sitios). Propongo un método `NotificacionService.crearParaEquipoOperativo(Comercio, Integer clienteDelPedido, mensaje, tipo, entidadTipo, entidadId)` que:

1. Arma el conjunto de destinatarios: el Dueño más los `usuario` de las relaciones `empleado_comercio` en `ACTIVO` del comercio (una consulta; ya existe la forma en `findEquipoByComercioId`).
2. **Excluye al Cliente del pedido** (decisión 28: un Empleado no recibe el "pedido nuevo" de su propio pedido; vale para T1, T9, T13 y T30).
3. Usa un `LinkedHashSet<Integer>` para no repetir un id (defensivo: la regla de roles impide que un Dueño sea Empleado, pero cuesta una línea).
4. Hace un `crear(...)` por destinatario dentro de la misma transacción de la emisión. Como las emisiones ya son idempotentes por estado del pedido (T1 solo cuando pasa de `PENDIENTE_PAGO`; T9 y T13 solo una vez por transición), la idempotencia del fan-out hereda esa garantía; con el lock del pedido (hallazgo 3) deja de depender de la suerte.

### 5.3 Leída y no leída

Cada fila de `notificacion` tiene su propio `leida` y su propio `usuario_id`; al hacer el fan-out cada persona tiene **su copia** y la marca por separado con `PUT /notificaciones/{id}/leida` (ya valida que sea suya; no requiere delegación). Consecuencias: (a) el Dueño y los Empleados no se pisan; (b) crece el volumen (N filas por evento, N = 1 + empleados activos; irrelevante a la escala del proyecto); (c) no existe "marcar como leída para todos". `PUT /notificaciones/comercio/{id}/leidas` (todas las del comercio) sigue siendo del Dueño y solo lo usan las pantallas de estado, el Empleado no la necesita.

### 5.4 Qué hace falta para que el Empleado tenga campana

Backend:

1. **`GET /notificaciones` y `GET /notificaciones/no-leidas/contador`**: `NotificacionService.listar/contarNoLeidas` usan `ComercioActivoService.resolverSiCorresponde`, que hoy devuelve vacío salvo para el Dueño. Hay que extenderlo: rol `CLIENTE` **con header presente** resuelve como Empleado (relación `ACTIVO`, mismo `404` único); sin header, contexto Cliente. Cambio de comportamiento a decidir (pregunta 10): un Cliente que hoy manda `X-Comercio-Id` y recibe sus notificaciones pasaría a recibir `404` si no es Empleado de ese comercio; el frontend nunca manda el header en contexto Cliente, y el spec `26` tiene dos tests que lo ejercitan (líneas 174 y 270) y habría que actualizar.
2. **Separar por tipo** las dos audiencias, sin columna nueva (el problema real es que un Empleado que además compró en su propio comercio tiene, bajo el mismo `usuario_id` y la misma entidad `PEDIDO`, notificaciones de las dos audiencias). Dos conjuntos de tipos en código: *del comercio* (`NUEVO_PEDIDO`, `PEDIDO_CANCELADO_CLIENTE`, `PEDIDO_EXPIRADO_COMERCIO`, `PEDIDO_AUTOCONFIRMADO_COMERCIO`, más las administrativas y de equipo que solo reciben Dueños) y *del Cliente* (el resto; `EMPLEADO_DESACTIVADO` lo ve también el Cliente porque concierne a la persona). Las consultas de comercio (`findByUsuarioIdAndComercioId`, el contador, el marcado y `contarNoLeidasPorComercio`) agregan `AND n.tipo IN (...)`; las del Cliente (`findPushByUsuarioId...`, `countPushNoLeidasByUsuarioId`) agregan `AND n.tipo NOT IN (...)`. Una prueba exige que cada `TipoNotificacion` esté clasificado, para que uno nuevo no aparezca en las dos listas por omisión.
3. **`MisComerciosEmpleadoService`** devuelve hoy `cantidadNotificacionesNoLeidas = 0L` fijo: pasa a usar `contarNoLeidasPorComercio(usuarioId)` (ya existe, una consulta agrupada) con el filtro por tipo. Es lo que alimenta el punto de la campana y el sondeo de 15 s.

Frontend: `js/catalogo.js` línea 147 (`!esContextoEmpleado()` esconde la campana) y línea 93 (`esContextoDueno()` en el badge); `js/comercio.js` línea 466 (`renderHeaderDashboard`, solo `esContextoDueno()`); `js/notificaciones.js` línea 107 (`exigirContextoCliente` redirige al Empleado), línea 118 (`usuario.rol === 'DUENO'` para `prepararPaginaComercio`) y línea 73 (el enlace "Ver pedido" depende de `rol === 'DUENO'`, el Empleado necesita `comercio-pedido-detalle.html`). Sección 8.

### 5.5 T30 (aviso de pedido autoconfirmado), ítem separable

- **Dónde está el proceso:** `PedidoService.avisar75MinYAutoconfirmar()` (línea 527), invocado por `PedidoSchedulerService` cada 60 segundos. Para cada pedido `EN_CAMINO` lee la fecha de entrada al estado desde `historial_estado_pedido`; a los 75 minutos manda el aviso `AVISO_75MIN_SIN_CONFIRMACION` al Cliente (una sola vez, vía `primerAvisoEmitido`) y a los `pedido.timeout.autoconfirmacion-en-camino-minutos=90` hace `marcarEntregado(pedido, FuenteEntrega.SISTEMA)`, registra el historial con `ActorPedido.SISTEMA` y `MotivoTimeoutPedido.TIMEOUT_ENTREGA` y manda `PEDIDO_AUTOCONFIRMADO` (T8) al Cliente.
- **Cómo se enviaría el aviso:** justo después de la notificación al Cliente, un `crearParaEquipoOperativo(..., PEDIDO_AUTOCONFIRMADO_COMERCIO, PEDIDO, pedido.getId())` con el texto "El pedido #N se marcó como entregado automáticamente". Sin migración: el valor ya está en el ENUM de Java y en el de la base (`V1`). Misma exclusión del Cliente del pedido.
- Se puede sacar sin afectar nada: no toca ninguna firma ni ningún DTO. Pertenece a la entrega A, último bloque.
- **Estado (2026-10-14):** implementado en el bloque A6, con el bloqueo uniforme del equipo en cada pasada (`bloquearParaActualizarConEquipo`), el texto "El pedido #N se confirmó automáticamente como entregado porque el cliente no respondió en M minutos." (M de la configuración) y sin migración. Ver `docs/DECISIONES.md`, 2026-10-14, bloque A6.

---

## 6. `actividad_comercio` (V32)

> **Reemplazada el 2026-10-12 (Diego).** La tabla planificada pasa a ser `historial_edicion_comercio` (entidad `HistorialEdicionComercio`): registra altas, ediciones, bajas y cambios de estado de productos, imágenes, perfil y horarios, hechos por el Dueño o por un Empleado, sin valores anteriores, con `entidad_nombre` como snapshot, **sin** columna `actor_nombre` y **sin** registros de pedidos ni de cierres (esos ya tienen `historial_estado_pedido` e `historial_cierre_comercio`). La pestaña Actividad junta las tres fuentes en una lista por fecha. El DDL vigente está en `docs/diccionario-de-datos.md`, tabla `HistorialEdicionComercio`; el que sigue es el propuesto originalmente y queda solo como registro. **Implementada el 2026-10-12 en el bloque A1 (`V32`, con el prefijo `hed` en los nombres de índices y claves foráneas porque `fk_hec_comercio` ya existía); ver `docs/DECISIONES.md`.**

### 6.1 DDL propuesto

`V32` está libre: el directorio de migraciones llega a `V31__crear_historial_empleado_comercio.sql` (31 archivos), `git ls-files` no tiene ninguna `V32` y ningún nombre de tabla, índice o constraint propuesto choca con los existentes (prefijo `act_`). El DDL es el aprobado el 2026-10-05 **más una columna** (`actor_nombre`):

```sql
CREATE TABLE `actividad_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `actor_rol` enum('DUENO','EMPLEADO') NOT NULL,
  `actor_nombre` varchar(201) NOT NULL,
  `entidad_tipo` enum('PRODUCTO','IMAGEN_PRODUCTO','PEDIDO','COMERCIO','HORARIO','RED_SOCIAL','GRUPO_EXTRA','EXTRA') NOT NULL,
  `entidad_id` int(11) DEFAULT NULL,
  `entidad_nombre` varchar(150) DEFAULT NULL,
  `accion` enum('CREAR','EDITAR','ELIMINAR','CAMBIAR_ESTADO','ABRIR','CERRAR') NOT NULL,
  `detalle` varchar(255) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_act_comercio_fecha` (`comercio_id`,`fecha_hora`,`id`),
  KEY `idx_act_usuario` (`usuario_id`),
  CONSTRAINT `fk_act_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_act_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Justificación de cada decisión:

- **`actor_nombre` (snapshot, `VARCHAR(201)` = 100 + espacio + 100):** es el único cambio sobre el DDL aprobado y lo pediste explícitamente. Un registro de actividad tiene que decir lo mismo dentro de un año aunque la persona edite su nombre (el perfil permite cambiar nombre y apellido). Evita además el `JOIN usuario → persona → persona_fisica` por fila al paginar. Contraparte: la trazabilidad de pedidos (sección 3.2) usa el nombre actual por `JOIN`, según la decisión 29; los dos criterios conviven y se pueden unificar más adelante.
- **Sin snapshot de valores anteriores** (decisión 17): `detalle` guarda texto breve y **nunca datos personales ni valores** de campos como teléfono o email; para ediciones lista los *nombres* de los campos ("Editó: nombre, teléfono").
- **`entidad_nombre`** (≤150, truncado en el servicio): el nombre del producto o comercio al momento de la acción; sobrevive a renombres y descontinuaciones.
- **`entidad_id` sin FK** a propósito (apunta a cinco tablas distintas); nullable por si en el futuro hay acciones sin entidad.
- **`accion` chico y estable**, las transiciones de pedido van como `CAMBIAR_ESTADO` con el texto en `detalle` ("Pedido #12: aceptado").
- **Índice `(comercio_id, fecha_hora, id)`** sirve a la paginación descendente por comercio; `idx_act_usuario` lo exige la clave foránea.
- **`fecha_hora`**: el servicio la escribe explícitamente con el mismo reloj que la entidad que registra (para pedidos, `LocalDateTime.now()` como `historial_estado_pedido`; para cierre, la hora del cierre), así las filas de actividad e historial quedan alineadas. El `DEFAULT current_timestamp()` queda de red de seguridad.
- Hay que actualizar `diccionario-de-datos.md` (v1.13) y los ER/relacional; las entidades Java son `ActividadComercio` con `@Setter` por campo, sin comentarios y con los enums `TipoEntidadActividad` y `AccionActividad` (ya descritos en el diccionario). Hibernate valida con `ddl-auto=validate`: las columnas `enum` se mapean como en las demás entidades.

### 6.2 ¿Registra también el Dueño?

**Recomendación: sí, el Dueño también.** Razones: (a) la decisión 17 y el DDL aprobado lo dicen (`actor_rol` admite `DUENO`, y la fila describe "redes sociales" del Dueño); (b) si solo se registra al Empleado, el Dueño no puede reconstruir la secuencia cuando él y un Empleado tocan el mismo producto o pedido; (c) es el mismo punto de código, sin ramas por actor; (d) en E4 el Administrador necesita la línea de tiempo completa; (e) costo: un `INSERT` por acción, despreciable. Contra: ruido, y duplica lo que ya guardan los historiales; se mitiga en pantalla con un filtro por persona (por defecto "Todos"). Nota: tu encargo describe solo "todo cambio hecho por un Empleado"; el resto del diseño ya decidido incluye al Dueño, de modo que recomiendo seguir ese y confirmarlo (pregunta 5).

### 6.3 Qué se registra y dónde se escribe

- **Dónde:** desde el propio servicio de cada escritura, dentro de su transacción, solo ante un **cambio efectivo**, por un `ActividadComercioService.registrar(ComercioActivo, entidadTipo, entidadId, entidadNombre, accion, detalle)` (resuelve el nombre del actor y trunca los textos). No por aspecto ni por el controller (el nombre de la entidad y si hubo cambio real solo se conocen en el servicio).
- **Puntos de escritura (16 auditados de los 19, más 3 del Dueño):** `crearProducto`, `editarProducto`, `cambiarEstado` (el de `DESCONTINUADO` se registra como `CAMBIAR_ESTADO`), `agregarImagen` (`CREAR` sobre `IMAGEN_PRODUCTO`), `eliminarImagen`, `reordenarImagen`, `actualizarUrlImagen`, `editarPerfil`, `actualizarFotoPerfil`, `cerrar`, `abrir`, `aceptar`, `rechazar`, `despachar`, `entregar`, `anular`; las tres firmas (4, 8, 11) no cambian datos y no se registran. Del Dueño sin delegar: `RedSocialService.agregar/editar/darDeBaja`.
- **"Cambio efectivo" en el perfil:** hoy `editarPerfil` pisa los campos siempre. `ComercioEdicionService` ya tiene `actualizarDatosBasicos`, `actualizarModalidades` y `actualizarFoto`, que devuelven `List<CambioComercio>` con solo lo que realmente cambió (los usa la corrección de rechazados); la edición del perfil debe pasar a usarlos, y de ahí sale el `detalle`. De paso `fechaModificacion` deja de actualizarse sin cambios.
- **Cierre y pedidos:** duplican `historial_cierre_comercio` y `historial_estado_pedido` a propósito (decisión 17). `cerrar`/`abrir` ya saben si cambió la bandera (cerrar dos veces no escribe).

### 6.4 Paginación, retención y lectura

- **Lectura del Dueño:** `GET /api/v1/comercios/equipo/actividad?limite=30&cursor=<fechaHora|id>&usuarioId=` (exclusivo; ya cae bajo `/comercios/**` con `hasRole("DUENO")`, hay que clasificarlo `EXCLUSIVO` en la prueba). Respuesta: `{ items: [{id, fechaHora, actorUsuarioId, actorNombre, actorRol, entidadTipo, entidadId, entidadNombre, accion, detalle}], siguienteCursor }`. Paginación por cursor sobre `(fecha_hora, id)` descendente (la tabla es solo de inserción, el cursor no se corre con altas nuevas); `limite` por defecto 30, máximo 100. Se agrega un filtro por `usuarioId` (el índice de comercio más el filtro alcanza a esta escala). El endpoint del Administrador de E4 (`GET /administrador/comercios/{id}/actividad`) reutiliza el mismo servicio.
- **Retención:** sin borrado en E3. Estimación: del orden de decenas de acciones por día por comercio, unos 400 bytes por fila, menos de 10 MB por comercio y año. Se deja anotado como pendiente un borrado a los 24 meses junto con el resto de políticas de retención; no se implementa ahora.
- **Frontend:** `js/equipo-comercio.js` ya tiene el esqueleto de pestañas (`PESTANAS` y `PINTORES_DE_PESTANA`, dejadas listas en A7/A8 para "Actividad").

---

## 7. Edición de datos del comercio por el Empleado

| Tema | Estado real |
|---|---|
| Campos editables hoy (`PUT /comercios/perfil`) | `nombre`, `descripcion`, `telefono`, `emailContacto`, `aceptaDelivery` y `aceptaRetiro` (al menos uno de los dos; `ComercioValidaciones`). Seis campos. |
| **No** editables (ningún endpoint) | `tipoComercio` (aunque `HU-CO01` y el requisito lo listan: es el desvío ya documentado en DECISIONES; `ComercioEdicionService.actualizarTipo` existe pero solo lo usa la corrección de rechazados), dirección del local, horarios. Dirección y horarios quedan "futuros delegables". |
| Foto de perfil | Dos pasos: `POST /comercios/perfil/foto/firma` (carpeta `comercios/{comercioId}/perfil/`, preset `bajonea_imagenes_mvp`, sin importar quién la pide) y `PUT /comercios/perfil/foto`. Cloudinary nombra el archivo; no queda registro de quién subió el binario (la actividad registra quién confirmó la URL). |
| ¿Dispara re-aprobación o cambia el estado? | **No.** `editarPerfil` y `actualizarFotoPerfil` solo cambian los campos y `fechaModificacion`; no tocan `estado` ni crean fila de historial de estado. Coincide con la decisión 26. |
| ¿Valida duplicado de nombre y dirección? | No (solo el alta adicional lo hace). Un Empleado podría renombrar el comercio a un nombre repetido; el Dueño ya puede hoy. |
| Exclusivo del Dueño | Todo lo fiscal y legal (razón social, CUIT, condición de IVA, tipo de sociedad, domicilio fiscal, fecha de inicio, representante), redes sociales, Mercado Pago, equipo, alta y corrección. |
| Hueco de seguridad previo | La confirmación de la foto (`PUT .../foto`) y las URLs de imágenes de producto validan el dominio pero no la carpeta. Propuesta: `validarFotoPerfilComercio(comercioId, url)` (ya existe) y una validación equivalente `productos/{comercioId}/{productoId}/` en `agregarImagen` y `actualizarUrlImagen`. |

Una consideración de producto (pregunta 6): el nombre del comercio es la marca pública; los requisitos dicen que el Empleado lo puede editar, el código lo permitiría, y no se ve razón técnica para limitarlo, pero conviene que lo confirmes.

---

## 8. Frontend: qué tocar

Todos los archivos nuevos o editados sin comentarios (`.html`, `.css`, `.js`) y con `data-testid` en kebab-case español (convención de `docs/DATA-TESTID-FASE17.md`; hay que documentar los nuevos).

| Tema | Archivos y funciones |
|---|---|
| **`contextoPuedeOperar()` hoy `false` para el Empleado** | `js/api.js:161`: pasa a ser verdadero también para el Empleado (`esContextoComercio()`). Reaparecen de golpe el interruptor, las acciones de pedido, el alta y la edición de productos y la edición del comercio (los usos son `comercio.js:604, 1176, 2278, 2287, 2342`). Conviene sumar un `puedeOperarAhora()` que además mire el estado del comercio en memoria (suspendido o cerrado temporalmente: solo la acción de entregar). |
| Ramas de solo lectura del panel | `js/comercio.js`: `initComercioDashboard` (598), banner y textos neutros (620 a 626: `esContextoEmpleado() ? 'Este comercio'`, aviso de no operativo), `normalizarResumen` (83, etiqueta "Ventas de hoy" se mantiene), `renderHeaderDashboard` (454). |
| Campana | `js/catalogo.js:93` y `147`; `js/comercio.js:466` y `pintarBadgeBell`; `js/comercio-activo.js` (el contador del Empleado vendrá del backend en `cantidadNotificacionesNoLeidas`); `js/notificaciones.js` líneas 73, 107 y 118. |
| Interruptor de cierre | `js/cierre-comercio.js` y `montarSwitchCierre` (se monta si `contextoPuedeOperar()`); subtítulo con quién cerró (si se acepta la pregunta 9). |
| Pedidos | `initComercioPedidos` (690), `renderPedidoActivoCard` (520), `renderPedidoDetalleComercio` (1060 a 1190: acciones en 1176; sumar etiqueta "Tu pedido" y esconder acciones si `esPedidoPropio`; bloque de trazabilidad), `normalizarPedido` (69, sumar `esPedidoPropio`), `renderAccionesPendiente/EnPreparacion/ListoParaRetirar` (899, 995, 1038: el `onActualizado` recibe la respuesta de la acción, que ahora será la reducida, y el normalizador ya tolera las dos formas). Aviso del servidor "No podés gestionar tus propios pedidos" (`409`) como toast/banner. |
| Productos | `initComercioProductos` (2212; `contextoPuedeOperar()` ya gobierna el menú y el botón de crear), `initComercioProductoForm` (**2354, hoy `exigirDueno`: pasar a `exigirContextoComercio`**), `mostrarModalAccionProducto` (2091), `js/cloudinary.js`. |
| Edición del comercio | `js/comercio.js`: `prepararVistasDelPerfil` (1654: hoy quita `view-editar-perfil` para el Empleado), `iniciarPerfilDelEmpleado` (1684), `initComercioPerfil` (1715), el manejador de `input-avatar` (foto) y el formulario `view-editar-perfil` de `comercio-perfil.html`. El Empleado necesita una fila "Editar datos del comercio" (pregunta 7) y la foto; sin legales, equipo, Mercado Pago ni redes. |
| Pestaña Actividad | `js/equipo-comercio.js` (sumar `actividad` a `PESTANAS` y `PINTORES_DE_PESTANA`, endpoint nuevo, paginación por cursor, filtro por persona), `comercio-perfil.html` (`view-equipo`), `css/styles.css`. Solo Dueño (el Empleado no ve "Ver equipo"). |
| Aviso de comercio no operativo | Banners de `AVISO_COMERCIO_NO_OPERATIVO`; deshabilitar acciones; mensaje del `409`. |

### 8.1 Ítem B7: hoja "Vas a pasar a tu cuenta personal"

Perfil del Empleado dentro del comercio: se reemplazan las filas "Editar datos personales" y "Cambiar contraseña" por **una sola** fila "Editar datos personales" que abre una hoja inferior con título "Vas a pasar a tu cuenta personal", texto "Tus datos personales se editan desde tu cuenta de Cliente. Después podés volver a {comercio} con Cambiar de cuenta.", botón "Continuar" (cambia el contexto a Cliente y va directo a `perfil.html`) y botón "Cancelar".

- **Archivos que toca:** `frontend/comercio-perfil.html`, `frontend/js/comercio.js`, `frontend/js/selector-contexto.js` (o `js/contexto.js`) para la hoja nueva, y `frontend/js/api.js` solo si se reutiliza el estilo de hoja bloqueante de `perderAccesoAlComercio` (la hoja de pérdida de acceso es la referencia; la nueva se cierra con "Cancelar" y no redirige). `entrarEnContexto(tipo, comercioId, comercioNombre)` navega siempre al inicio del contexto: hay que darle un parámetro de destino (`perfil.html`) o hacer el cambio con `setContexto(CLIENTE)` más navegación directa.
- **Qué se puede borrar de `comercio-perfil.html`:** la sección `view-editar-datos` completa (líneas 212 a 263, el formulario de datos personales con nombre, apellido, teléfono, nombre de usuario, email y DNI) y, para el Empleado, la fila `cambiar-password-link` y la vista `view-cambiar-password` (siguen existiendo para el Dueño, que usa su propio formulario `form-cambiar-password` inline en `comercio.js:1941`). En `prepararVistasDelPerfil` se simplifican la lista del Empleado y los `quitar(...)`.
- **Qué se puede borrar de `js/comercio.js`:** el `import` de `./perfil-cuenta.js` (línea 21), las llamadas a `enlazarCambioPassword` y `enlazarEdicionDatosPersonales` en `iniciarPerfilDelEmpleado` (1699 a 1711), la carga de `GET /clientes/perfil` de ese perfil y el manejo de su error.
- **Qué NO se puede borrar de `js/perfil-cuenta.js`:** nada. Sigue teniendo un consumidor, `js/cliente.js` (líneas 9, 130 y 137, el perfil del Cliente), y sus parámetros `mostrarVista` y `alActualizarDatos` los sigue pasando. Queda como módulo de un solo consumidor; reabsorberlo en `cliente.js` es opcional y no lo recomiendo.
- **Tests del spec 38 afectados** (los números de línea son de hoy): **552** (perfil de cinco filas → cuatro: "Ver datos del comercio", "Editar datos personales", "Cambiar de cuenta", "Cerrar sesión"; y `btn-cambiar-password` deja de existir), **605** (editar datos dentro del layout del comercio → ahora abre la hoja y "Continuar" lleva a `perfil.html` en contexto Cliente), **641** y **669** (cambiar contraseña desde el perfil del Empleado → se eliminan o pasan a ser "la fila ya no existe"; el cambio de contraseña del Cliente sigue cubierto por el spec 11), **1256** (375 px: recorre `btn-editar-datos`, `btn-volver-perfil` y `btn-volver-perfil-password`; se ajusta, y se suma la hoja nueva). No se ven afectados 580 (ver datos), 687 (cerrar sesión), 699 y 716 (Dueño) ni 403 (no hay enlaces a `perfil.html`: la hoja navega por código). Se suman unos 6 tests nuevos de la hoja (abre, Cancelar no cambia nada, Continuar cambia el contexto y llega a `perfil.html`, "Cambiar de cuenta" desde allí vuelve al comercio, texto con el nombre del comercio, 375 px). El item se hace en la entrega B, antes de reabrir la edición del comercio.

---

## 9. Tests y herramientas

### 9.1 Qué se rompe o hay que reescribir

| Dónde | Qué |
|---|---|
| `37-empleado-acceso-api.spec.ts:475` | "Empleado recibe 403 en escrituras de perfil, productos, pedidos y cierre" (13 intentos): deja de ser cierto; se reemplaza por un test de qué sigue en `403` (equipo, redes, Mercado Pago, alta; el segundo test, línea 498, queda) y por la matriz positiva. |
| Spec `37`, otros | El describe "El 404 del resolver no distingue ningún caso" (línea 523) y el de lecturas siguen. |
| `38-empleado-acceso-ui.spec.ts` | Todo el bloque "Panel del Empleado: solo lectura" (líneas 433 a 758: ~22 tests; ya no es solo lectura), "Pantallas compartidas" (1109, 1143: `exclusivas` y header), `1091` ("un comercio que pasa a suspendido no saca al Empleado"), `736`, y los de perfil (sección 8.1). Se actualizan los textos y las expectativas; el bloque de reembolso (759 a 850), pérdida de acceso (851 a 1107) y selector (137 a 293) se mantienen. |
| `26-multicomercio-tramo4-api.spec.ts:174 y 270` | Si se acepta el cambio de la pregunta 10 (el Cliente con header). |
| Newman, carpeta 57 | El constructor `build-empleado-tramoE2-postman.mjs` tiene negativos con `403` en escrituras; hay que reescribirlos y agregar la carpeta 58 con un constructor nuevo `build-empleado-tramoE3-postman.mjs` (siempre último en el orden de ejecución). |
| `ClasificacionRutasComercioTest` | Pasar 19 líneas a delegables, categoría `COMPARTIDO`, rutas nuevas. |
| Tests Java de notificaciones | `NotificacionServiceTest`, `NotificacionesPorComercioIntegrationTest` (los filtros por tipo cambian las consultas). |

### 9.2 Cómo simular a un Empleado en cada capa y qué falta

- **Java:** `DatosPruebaEmpleado` (Dueño con comercio aprobado, Cliente con credenciales, filas de empleado y cambios de estado por JDBC) y `ComercioActivo` (constructor directo con `RolActorComercio.EMPLEADO`). **Falta** una fábrica `ComercioActivo.delEmpleado(...)` (simétrica a `delDueno`) y un helper que cree un pedido en un estado dado para el servicio (existe de forma local en `PedidoServiceReembolsoTest`, convendría compartirlo).
- **Playwright (API):** `sumarAlEquipo` (invita y acepta de punta a punta), `atajoEstadoRelacion` (`PUT /test/comercios/{id}/empleados/{id}/estado`), `ponerEstadoComercio` (SQL), `confirmarPagoTest`, `crearPedido`, `crearProducto`, `sqlTest`. **Falta:** un atajo para correr un job de pedidos con una fecha dada (`POST /api/v1/test/jobs/pedidos/{nombre}?ahora=`), necesario para T13 y T30 (hoy los jobs de pedidos corren solos en el perfil `test`, solo los de invitaciones y reapertura se pueden disparar a pedido); conviene además apagar su ejecución automática en el perfil `test` con una propiedad igual a la de invitaciones. Para la actividad se puede leer por SQL (`sqlTest`) hasta que exista el endpoint del Dueño, y después por el endpoint.
- **Playwright (UI):** `abrirComoEmpleado` y `crearEmpleado` (spec 38) y los helpers de `helpers/empleado.ts`; **falta** un helper para sembrar un pedido propio del Empleado (Cliente que además es Empleado compra en su comercio) y uno para sembrar actividad.
- **Newman:** el constructor de la carpeta 57 es la plantilla (identidades aleatorias, variables `e2_*`); la nueva usará `e3_*`.
- **Estrés:** `stress-locks-empleado-e2.mjs` es la plantilla. Escenarios nuevos: S1 baja del Empleado contra escrituras (productos, perfil, pedidos); S2 dos operadores (Dueño y Empleado, o dos Empleados) sobre el mismo pedido con acciones contradictorias; S3 acción de pedido contra el bloqueo de cuenta del Dueño y contra su login (el cruce de la sección 2.3); S4 fan-out de notificaciones contra el login del Empleado; S5 acción del Empleado contra la suspensión del comercio; S6 job de vencimiento contra aceptar y rechazar. Criterio: solo `200`, `404`, `409`; cero `Deadlock found` ni `Lock wait timeout`.

### 9.3 Estimación de tests nuevos (orden de magnitud, sin los modificados)

| Entrega | Capa | Estimado |
|---|---|---|
| A | Java (servicio, integración, clasificación, forma de respuesta, matriz de 19 sobre la relación inactiva, fan-out, filtros de notificaciones, actividad, guard de estado, lock de pedido) | 60 a 80 |
| A | Playwright API (spec nuevo `39`) | 55 a 75 |
| A | Newman (carpeta 58) | 150 a 220 requests |
| A | Estrés | 6 escenarios |
| B | Playwright UI (spec nuevo `40`; incluye B7 y actividad) | 50 a 65 |
| B | Playwright modificados (specs 37 y 38, y 26 si se acepta) | 35 a 45 |

---

## 10. Riesgos

| # | Riesgo | Análisis y mitigación |
|---|---|---|
| 1 | Baja del Empleado durante una escritura | Sección 2.3: lectura `LOCK IN SHARE MODE` de la relación dentro de la transacción; la baja espera o la escritura da `404`. Prueba de 19 casos y estrés S1. |
| 2 | Dos operadores sobre el mismo pedido | Hallazgo 3. Lock del pedido en las cinco acciones (`bloquearParaActualizar`), revalidación del estado dentro del lock; la segunda llamada recibe `409` "El pedido ya fue resuelto". Los jobs que cambian estado (vencimiento sin respuesta, autoconfirmación, pagos vencidos, retiro por suspensión) también bloquean cada pedido y revalidan. Hay una variante rápida y menos invasiva (`@Version` optimista en `Pedido`, ya listada como pendiente de v2), pero el lock pesimista es coherente con el resto del proyecto y con `MercadoPagoPagoService`. |
| 3 | Idempotencia | Las acciones ya son idempotentes por estado (la segunda recibe `409`, no repite efectos); con el lock deja de haber historial doble y notificaciones contradictorias. `cerrar`/`abrir` ya devuelven `200` sin escribir si no cambia. La actividad solo se escribe ante cambio efectivo. |
| 4 | Reembolsos cuando rechaza o anula un Empleado | `rechazar` ya dispara `procesarReembolsoTotal` después del commit, con el token del **Dueño** (`cuentaMercadoPagoService.buscarActivaPorDueno`), no del actor: el Empleado nunca toca Mercado Pago. Si la cuenta está desvinculada queda `PENDIENTE_REVISION_MANUAL`. El Empleado ve solo el estado reducido (`EstadoReembolsoEmpleado`). **`anular` no reembolsa (hallazgo 1)**: resolver antes de delegarla. |
| 5 | Emails | El flujo de pedidos y productos no envía emails (el único `EmailService` activo es auth e invitaciones). E3 no suma ninguno; los T11 y T35 con email del catálogo no cambian. |
| 6 | Acceso a recursos de otro comercio con `X-Comercio-Id` manipulado | El resolver devuelve `404` único salvo relación `ACTIVO` con ese comercio. Los servicios verifican además que producto, imagen y pedido pertenezcan al comercio (`obtenerProductoDelComercio`, `obtenerImagenDelProducto`, `obtenerPedidoDelComercio`), de modo que un Empleado de A no toca un recurso de B aunque conozca el id; hay que cubrirlo con tests de pertenencia cruzada de las 19. |
| 7 | Imágenes ajenas | Hallazgo 5: validar carpeta en foto del comercio e imágenes de producto. |
| 8 | Fuga por DTO | Prueba de forma de respuesta (2.1) y DTO reducido en las 7 respuestas listadas en la sección 4. |
| 9 | Fuga de notificaciones entre contextos | Separación por tipo (5.4) y prueba de clasificación. |
| 10 | Deadlocks nuevos | 2.3. El fan-out inserta N notificaciones (bloqueo compartido sobre cada `usuario` receptor): se hace **después** de los bloqueos de `pedido`, y las acciones de pedido no bloquean `comercio`. Estrés S3 y S4. |
| 11 | Estado del comercio cambia entre la resolución y la transacción | Se lee dentro de la transacción (2.4). La suspensión se serializa por el lock de `pedido`. |
| 12 | Cierre del Dueño y del Empleado a la vez | Ya serializado por `comercio FOR UPDATE`; el resultado es idempotente. |
| 13 | El `403` del frontend | Nunca devolver `403` por reglas de negocio hacia el Empleado (hallazgo 7). Una escritura exclusiva del Dueño llamada por error desde el panel del Empleado sí daría `403` y redirigiría a `acceso-denegado.html`: la prueba de "ninguna pantalla compartida llama a un endpoint exclusivo" del spec 38 (línea 1109) lo cubre y debe mantenerse. |
| 14 | Orden de parámetros | 2.5. |
| 15 | Cuenta del Empleado bloqueada o suspendida | La sesión se cierra al bloquear/suspender y `JwtAuthenticationFilter` la valida en cada request; no hay un camino de escritura con sesión muerta. Sin cambios. |

---

## 11. Estructura de entregas propuesta

Cada entrega con su prueba completa (mvnw, Playwright, Newman, estrés), checklist y commit, como en E1 y E2. T30 queda como ítem separado al final de la A.

### Entrega A — backend y tests

| Bloque | Contenido | Tamaño | Depende de |
|---|---|---|---|
| **A0** | Endurecimiento previo (requiere tus respuestas 1 y 4): reembolso en `anular` (`ANULACION_COMERCIO`) con test; lock del pedido en las cinco acciones y revalidación en los jobs; validación de carpeta en foto del comercio e imágenes de producto. | Chico | — |
| **A1** | `V32`, entidad, repositorio, enums y `ActividadComercioService`; `GET /comercios/equipo/actividad` del Dueño; diccionario v1.13. | Mediano | — |
| **A2** | Autorización de escrituras: `ActorComercioService` (relación `LOCK IN SHARE MODE`, guard de estado), 19 servicios con `ComercioActivo`, lista blanca de 19 + lecturas nuevas, `ComercioActivo` como primer parámetro, categoría `COMPARTIDO` y prueba de forma de respuesta, DTO reducido en perfil y foto (con `emailContacto`), `ComercioActivo.delEmpleado`. | **Pesado** | A0 |
| **A3** | Pedidos: actor dinámico en historial y cierre, pedido propio (`esPedidoPropio`, `409`), DTO reducido de las cinco acciones, `GET /pedidos/comercio/{id}/trazabilidad`, registro de actividad en los 19 puntos y redes sociales. | **Pesado** | A1, A2 |
| **A4** | Notificaciones: fan-out (T1, T9, T13), separación por tipo, `GET /notificaciones` y contador para el Empleado, contador de `mis-comercios`. | Mediano | A2 |
| **A5** | Tests: Java, spec `39`, carpeta 58 de Newman, estrés `stress-locks-empleado-e3.mjs`, atajos de test (jobs de pedidos), reescritura de los tests que se rompen (sección 9.1). | **Pesado** | A1 a A4 |
| **A6 (separable)** | T30: aviso de pedido autoconfirmado a Dueño y Empleados. | Chico | A4 |

### Entrega B — pantallas y tests de UI

| Bloque | Contenido | Tamaño | Depende de |
|---|---|---|---|
| **B1** | `contextoPuedeOperar()` y guards: panel, interruptor, pedidos con acciones, "Tu pedido", trazabilidad, avisos de comercio no operativo, `exigirContextoComercio` en el formulario de producto. | Pesado | A2, A3 |
| **B2** | Edición del comercio y foto para el Empleado; productos (CRUD, imágenes). | Mediano | A2 |
| **B3** | Campana y pantalla de notificaciones en contexto Empleado. | Mediano | A4 |
| **B4** | Pestaña "Actividad" del Dueño. | Mediano | A1 |
| **B5** | **B7**: hoja "Vas a pasar a tu cuenta personal" y limpieza del perfil. | Chico | — (independiente) |
| **B6** | Tests de UI: spec `40` nuevo, actualización de `37`/`38`, `data-testid` documentados. | Pesado | B1 a B5 |

**La entrega más pesada es la A** (A2, A3 y A5 son los tres bloques grandes: refactor de 19 servicios con relación y estado verificados en transacción, DTO reducidos y actividad, más la mayor parte de los tests y del estrés). Dentro de la B, lo pesado es B1 por la cantidad de pantallas que cambian de comportamiento a la vez. Orden sugerido: A0 → A1 → A2 → A3 → A4 → A5 → A6 → (aprobación) → B5 → B1 → B2 → B3 → B4 → B6.

---

## Decisiones no previstas

Cosas que decidí o asumí al escribir esta auditoría y que no estaban en el pedido:

1. **Ubicación del informe:** `docs/AUDITORIA-E3.md`, como pediste; no actualicé `docs/entregables-01-02/CAMBIOS.md` ni `DECISIONES.md` (no corresponde a una auditoría de lectura).
2. **Número de escrituras:** confirmé 19 por enumeración (9 + 5 + 5); las tres firmas de Cloudinary cuentan como delegables aunque no escriban datos, porque pasan por el mismo `ComercioActivo` y se autorizan igual.
3. **Reducción de `GET /notificaciones` a categoría `COMPARTIDO`:** agregué una quinta categoría a la prueba de clasificación; la existente (`PROPIO`) no describe un endpoint que cambia de comportamiento con el header.
4. **Endpoint de trazabilidad separado** en lugar de sumar el campo al `PedidoResponseDTO`: evita que el Cliente pueda verlo por descuido.
5. **Snapshot `actor_nombre`:** apliqué tu pedido de "snapshot del nombre del actor", que cambia el DDL que habías aprobado; es la única desviación del DDL.
6. **Dueño también registrado en la actividad:** seguí la decisión 17 y el DDL aprobado (que admite `DUENO`), aunque tu encargo habla solo del Empleado.
7. **Lock pesimista de `Pedido` y reembolso de `anular` como bloque A0:** son cambios al comportamiento del Dueño; los propuse como previos porque la delegación los vuelve críticos.
8. **`409` en lugar de `403`** para el pedido propio y el guard de estado: por el comportamiento del frontend (`acceso-denegado.html` en todo `403`).
9. **No incluí cambios para la pestaña "Actividad" del Administrador ni la baja de Empleados** (E4), ni la suspensión del comercio (tramo aparte).
10. **No verifiqué en ejecución** ninguna de las afirmaciones sobre comportamiento (todo es lectura de código y de documentos): por ejemplo la carrera del pedido sin lock y los cruces de bloqueo están razonados, no reproducidos; el estrés los confirmará o los descartará.

## Preguntas abiertas

1. **`anular` sin reembolso.** ¿Aprobás implementar `procesarReembolsoTotal(ANULACION_COMERCIO)` en `anularPedido` (y de paso `CANCELACION_CLIENTE` en `cancelarPedido`) como bloque A0 de E3, o preferís delegar `anular` recién cuando eso esté resuelto? Recomendación: A0 de E3, solo `anular` (la cancelación del Cliente es otro tramo).
2. **Entregas de pedidos `EN_CAMINO` con el comercio no operativo.** No existe endpoint del comercio para confirmarlas. ¿Se quita esa promesa de los requisitos y de la decisión 27 (queda solo "entregar `LISTO_PARA_RETIRAR`") o se agrega un endpoint? Recomendación: quitarla; el Cliente y el temporizador de 90 minutos ya cierran esos pedidos.
3. **`CERRADO_TEMPORALMENTE` por bloqueo de cuenta del Dueño.** Con la regla de la decisión 27 un Empleado no puede despachar ni anular los pedidos `EN_PREPARACION` que ya estaban en marcha, y esos pedidos no tienen temporizador: quedan varados hasta que el Dueño recupere la cuenta. ¿Querés permitir `despachar` y `anular` (y `entregar`) para el Empleado en ese estado puntual, o dejarlo como está? Recomendación: permitir `despachar`, `entregar` y `anular`, no `aceptar` ni `rechazar`, solo en `CERRADO_TEMPORALMENTE`.
4. **Lock pesimista en `Pedido`.** ¿Confirmás hacerlo en E3 (cambia también al Dueño) en lugar de dejarlo para v2 como dice `CONCURRENCIA-Y-TRANSACCIONES.md`? Recomendación: sí.
5. **Actividad del Dueño.** ¿Registramos también las acciones del Dueño (recomendado) o solo las del Empleado?
6. **¿El Empleado puede renombrar el comercio?** (`nombre` es la marca pública.)
7. **Perfil del Empleado en E3:** ¿"Ver datos del comercio" (solo lectura) se mantiene y se suma "Editar datos del comercio", o se reemplaza por una sola fila de edición? Recomendación: mantener ambas, porque dirección y horarios siguen sin edición.
8. **Snapshot `actor_nombre`:** ¿aprobás agregar esa columna al DDL de `V32`?
9. **Quién cerró el comercio:** ¿se muestra el nombre en el subtítulo del interruptor (requiere `cerradoPorNombre` en dos DTO y una lectura extra en el sondeo) o solo en la pestaña Actividad del Dueño? Recomendación: solo en la pestaña Actividad de esta entrega; el subtítulo queda como mejora.
10. **Cliente con `X-Comercio-Id` en `GET /notificaciones`:** ¿pasa a `404` si no es Empleado de ese comercio (recomendado, evita mostrar la lista del Cliente donde se espera la del comercio) o sigue ignorándose el header?
11. **`entregar` no avisa al Cliente.** Hoy `confirmarEntregaComercio` no crea ninguna notificación al Cliente; el catálogo T1 a T35 tampoco lo contempla. ¿Queda así?
12. **Fecha de `fecha_hora` de la actividad:** reloj de la JVM como `historial_estado_pedido` (recomendado) o `-03:00` explícito como el cierre. Mantengo la primera.
13. **WebKit/iPhone** sigue sin probar en todos los tramos de UI; ¿se incluye en la entrega B?

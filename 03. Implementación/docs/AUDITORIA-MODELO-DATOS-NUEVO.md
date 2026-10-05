# Auditoría: código actual vs. modelo de datos nuevo (bajonea_final)

Fecha de auditoría: 2026-08-26
Última migración Flyway aplicada en el código: `V17__notificacion_pedido_id.sql`

Auditoría de solo lectura. No se modificó ningún archivo de `backend/`, `frontend/`, `postman/`, `testing/`, `.claude/` ni ninguna base de datos. Fuentes usadas, en el orden pedido: `docs/diccionario-de-datos.md` (v1.3), `docs/bajonea_final.sql`, `CLAUDE.md`, `docs/DECISIONES.md`, `docs/modelo-mvp.md`, `docs/codigo-actual.md`, `docs/MAPEO-ARCHIVOS-TRAMO16.29.md`, `docs/DATA-TESTID-FASE17.md`, las 17 migraciones Flyway aplicadas, y lectura directa de las 24 Entities/23 Repositories/57 DTOs/16 Services/14 Controllers actuales. No hubo acceso directo de solo-lectura a ninguna base de datos MySQL en esta sesión (ni `bajonea` ni `bajonea_final`) — la comparación física se hizo contra `docs/bajonea_final.sql`, tal como habilita el punto 3.10 del pedido cuando no hay conexión disponible.

## Resumen ejecutivo

El hallazgo más importante de esta auditoría es que el cambio es **mucho más grande** de lo que describe el punto 1.4 del pedido. No son "6 tablas nuevas + 1 modificación estructural": `docs/diccionario-de-datos.md` pasó de una versión v1.2 recortada al alcance del MVP (23 tablas, la misma que documenta `docs/modelo-mvp.md` y la que el código implementa hoy) a una versión **v1.3 que es el modelo completo del proyecto** — 41 tablas en `bajonea_final.sql`. De esas 41, 24 ya existen hoy en el código (con cambios de columnas pendientes en varias) y **17 son completamente nuevas**. De esas 17, solo 6 son las que menciona el pedido de auditoría (`RedSocial`, `GrupoExtra`, `Extra`, `ProductoGrupoExtra`, `ItemCarritoExtra`, `DetallePedidoExtra`). Las otras 11 — `Empleado`, `Dueño`, `EmpleadoComercio`, `CuentaMercadoPago`, `ConfiguracionTarifa`, `HistorialEstadoUsuario`, `HistorialEstadoPedido`, `Soporte`, `Reclamo`, `Pago`, `NotaCredito` — son exactamente las entidades que `CLAUDE.md` §1 excluye **explícitamente y por nombre** del MVP desde el principio del proyecto ("Explícitamente fuera del MVP: MercadoPago/Pago... reclamos, soporte... suspensión de comercio/cliente... historial de estados..."). En criollo: la base `bajonea_final` no es una ampliación puntual del MVP — es el diccionario del "proyecto completo" que `CLAUDE.md` viene manteniendo deliberadamente afuera desde la Fase 0.

El código actual (backend, frontend, Postman, Playwright) está **100% construido sobre el modelo viejo**, sin ninguna excepción. Se comprobó con `grep` exhaustivo sobre la totalidad de `backend/src/main/java`, `frontend/`, la colección de Postman y los 9 specs de Playwright: cero coincidencias de `RedSocial`, `GrupoExtra`, `Extra`, `Empleado`, `Dueño`/`Dueno`, `CuentaMercadoPago`, `ConfiguracionTarifa`, `Soporte`, `Reclamo`, `NotaCredito`, `HistorialEstadoUsuario`, `HistorialEstadoPedido`, en cualquier capa. `RolUsuario` sigue en sus 3 valores originales (`CLIENTE`, `COMERCIO`, `ADMINISTRADOR`, sin `DUENO`/`EMPLEADO`), `EstadoPedido` sigue en sus 3 valores recortados (`PENDIENTE`, `EN_PREPARACION`, `RECHAZADO`, sin los otros 8 del diccionario nuevo), y `Comercio` sigue siendo 1:1 con `PersonaJuridica` (no `N:1` contra un `Dueño`). Esto no es un hallazgo de "algo roto" — es la confirmación de que la migración de código **todavía no arrancó en absoluto**, ni parcialmente: las 17 migraciones Flyway existentes (`V1` a `V17`) no tocan ninguna tabla nueva.

Esto es coherente con lo que se ve en `docs/DECISIONES.md`: las dos únicas entradas de hoy (2026-08-26) son **documentación pura** — ajustes al propio `diccionario-de-datos.md` y a los requisitos funcionales, sin ningún cambio de código mencionado. Y hay más evidencia externa a `03. Implementación`: la carpeta `01. Análisis de Requerimientos` tiene cambios sin commitear que agregan documentos completos nuevos para los roles Dueño y Empleado (`requisitos-funcionales-dueño.md`, `requisitos-funcionales-empleado.md`, casos de uso e historias de usuario propias de cada uno) y `02. Diseño` tiene un Diagrama Entidad-Relación v3 nuevo (reemplazando al v2) — es decir, el rediseño ya venía gestándose a nivel de Análisis/Diseño antes de esta sesión, y `bajonea_final` es su primera materialización física. Nada de esto está reflejado todavía en `03. Implementación` (ni en `CLAUDE.md`, ni en el código).

El punto de mayor riesgo técnico no es ninguna de las 6 tablas del pedido — es el cambio de modelo de propiedad de `Comercio`. Hoy `ComercioService`, `ProductoService`, `PedidoService` y `AuthService` resuelven "¿cuál es el comercio de este usuario logueado?" con un patrón 1 a 1 estricto (`ComercioRepository.findByPersonaJuridicaId(usuarioId)`, ver hallazgo §11) — asumen que un usuario autenticado con rol `COMERCIO` **es** un único comercio. El modelo nuevo separa `Dueño` (puede tener N comercios) de `Empleado` (opera comercios de otro sin ser su dueño), lo cual rompe esa asunción en las 4 capas de servicio a la vez, no en una sola tabla — es un cambio arquitectónico, no un agregado de columnas. Le sigue en riesgo el bloque de Extras: si se implementa sin tocar el cálculo de totales (`CarritoService`/`PedidoService` hoy solo hacen `precio × cantidad`, confirmado leyendo el código), el sistema no fallaría con un error visible — cobraría de menos silenciosamente.

En términos de magnitud de trabajo pendiente (sin poner horas/días): las 6 tablas del pedido son un tramo de trabajo razonable y acotado, comparable a los tramos ya cerrados de Fase 16. El resto del modelo nuevo (Dueño/Empleado, MercadoPago, Soporte/Reclamo, la máquina de estados completa de Pedido, los dos históricos que faltan) es, en tamaño, comparable a repetir buena parte de las Fases 4 a 17 del proyecto — no es una fase más, es varias fases nuevas que hoy no existen en el índice de `CLAUDE.md` §6.

## 1. Entidades JPA

### 1.1 Las 6 tablas nuevas mencionadas en el pedido de auditoría

| Entidad | Existe en código | Coincide con diccionario | Relaciones nuevas presentes | Observaciones |
|---|---|---|---|---|
| `RedSocial` | No | N/A | N/A | Sin archivo `RedSocial.java`. Tabla depende solo de `Comercio` (ya existe) — es la más aislada de las 6. |
| `GrupoExtra` | No | N/A | N/A | Sin archivo. Depende solo de `Comercio` (ya existe). |
| `Extra` | No | N/A | N/A | Sin archivo. Depende de `GrupoExtra` (tampoco existe). |
| `ProductoGrupoExtra` | No | N/A | N/A | Sin archivo. Unión M:N `Producto`↔`GrupoExtra`, mismo patrón que la ya existente `ProductoTag` (`@EmbeddedId` + `@MapsId` doble) — puede reusar ese patrón como referencia directa. |
| `ItemCarritoExtra` | No | N/A | N/A | Sin archivo. Depende de `ItemCarrito` (existe) y `Extra` (no existe). |
| `DetallePedidoExtra` | No | N/A | N/A | Sin archivo. Depende de `DetallePedido` (existe) y `Extra` (no existe). |

### 1.2 `foto_perfil_url`: movimiento de `Comercio` a `Usuario`

- **`Usuario.java`** (leído completo): no tiene campo `fotoPerfilUrl`. Solo `id`, `email`, `passwordHash`, `rol`, `estado`, `intentosFallidos`, `fechaRegistro`, `fechaUltimoAcceso`, `fechaActualizacion`.
- **`Comercio.java`** (leído completo): conserva `fotoPerfilUrl` (`@Column(name = "foto_perfil_url", length = 500)`, sin `nullable = false`, es decir nullable) — la ubicación vieja, sin mover.
- Diferencia de nullability entre fuentes: en `bajonea_final.sql`, `comercio.foto_perfil_url` sigue siendo `NOT NULL` (línea 250) — el diccionario nuevo **no** liberó esa columna, solo agregó `usuario.foto_perfil_url` como columna nueva y separada, nullable. La entidad actual la tiene nullable por una excepción documentada del MVP (`docs/modelo-mvp.md`, nota de alcance 4: "no se pide en el registro"). Esto importa para la Fase futura que aborde este punto: si el criterio es simplemente "agregar `usuario.foto_perfil_url`" sin tocar `comercio.foto_perfil_url`, hay que decidir explícitamente si esta última vuelve a ser obligatoria (como dice `bajonea_final.sql`) o se mantiene la excepción ya vigente del MVP — ver pregunta abierta §12.4.
- No existe ningún endpoint `PATCH /usuarios/{id}/foto-perfil` ni controller `UsuarioController` (confirmado por listado completo de los 14 controllers actuales). Cliente y Administrador no tienen ninguna vía de subir foto de perfil hoy.

### 1.3 El resto del modelo nuevo (11 tablas más, no nombradas en el pedido pero reales)

Ninguna de estas 11 tablas tiene entidad, y las 11 corresponden literalmente a la lista "Explícitamente fuera del MVP" / "Entidades que NO entran al MVP" de `CLAUDE.md` §1 y `docs/modelo-mvp.md` §11:

| Entidad nueva | Módulo | Nota |
|---|---|---|
| `Empleado` | Identidad | Subtipo de `PersonaFisica`, rol nuevo `EMPLEADO`. No existe `RolUsuario.EMPLEADO`. |
| `Dueño` | Identidad | Subtipo de `PersonaJuridica`, reemplaza la relación directa `Comercio ↔ PersonaJuridica` por `Comercio → Dueño (N:1) → PersonaJuridica (1:1)`. No existe `RolUsuario.DUENO`. Ver §11. |
| `EmpleadoComercio` | Comercio | Unión M:N `Empleado`↔`Comercio` con estado propio. |
| `CuentaMercadoPago` | Comercio | Credenciales OAuth de MercadoPago del Dueño. `CLAUDE.md` §1: "Explícitamente fuera del MVP: MercadoPago/Pago". |
| `ConfiguracionTarifa` | Comercio | Cargos de servicio cliente/comercio, congelados en cada `Pedido`. |
| `HistorialEstadoUsuario` | Identidad | `CLAUDE.md` §1 la nombra explícitamente como fuera de alcance. |
| `HistorialEstadoPedido` | Operaciones | Ídem — fuente de los timestamps de cada transición del pedido, hoy inexistente porque el MVP no tiene esas transiciones. |
| `Soporte` | Atención | Mensajes de descargo de usuarios suspendidos. `CLAUDE.md` §1: "fuera del MVP: reclamos, soporte". |
| `Reclamo` | Atención | Ídem. |
| `Pago` | Operaciones | Registro de pago vía webhook MP. |
| `NotaCredito` | Operaciones | Reembolsos. |

### 1.4 Entidades existentes que necesitan cambios de columnas o relaciones

| Entidad | Coincide con diccionario nuevo | Qué falta |
|---|---|---|
| `Usuario` | No | Falta `foto_perfil_url` (ver 1.2). El resto de columnas coincide. |
| `Comercio` | No | Sigue con `personaJuridica: PersonaJuridica` (`@OneToOne`, PK propia `@GeneratedValue`) en vez de `dueño: Dueño` (`@ManyToOne`). Le faltan `cerrado_manualmente`, `fecha_resolicitud`, `mp_vinculado` (ya excluidas a propósito por `docs/modelo-mvp.md` nota 4, previo a este cambio de modelo). Sin relaciones a `RedSocial`/`GrupoExtra`/`EmpleadoComercio`/`CuentaMercadoPago`. |
| `Producto` | Parcial | Sin `List<ProductoGrupoExtra>` / relación a `GrupoExtra`. El resto (`comercio`, `categoria`, `nombre`, `precio`, `estado`, timestamps) coincide. |
| `ItemCarrito` | Parcial | Sin `List<ItemCarritoExtra>`. Resto coincide. |
| `DetallePedido` | Parcial | Sin `List<DetallePedidoExtra>`. Resto coincide. |
| `Carrito` | Parcial | Sin campo `activo` (ya excluido a propósito, `docs/modelo-mvp.md` nota 7). No es un gap nuevo de este cambio. |
| `Pedido` | No | Le faltan ~12 columnas del diccionario nuevo: `pago_estado`, `cancelado_por`, `fuente_entrega`, `fecha_entrega`, `suspension_retiro_expira`, `primer_aviso_emitido`, `motivo_rechazo` (existe pero como enum recortado), `cargo_servicio_cliente`, `cargo_servicio_comercio`, `total` (hoy solo existe `subtotal`). `estado` sigue en el enum recortado de 3 valores. |
| `Direccion` | Sí, estructuralmente | Dato positivo: `Direccion.java` ya tiene `cliente: Cliente` como `@ManyToOne` simple, **sin** ninguna restricción `UNIQUE` ni `@OneToOne` sobre `cliente_id` — la tabla ya soporta múltiples direcciones por cliente a nivel de schema. La limitación de "1 sola dirección" es puramente de capa de aplicación (`RegistroService`/`ClienteService`, que hoy solo crean/leen una fila), no de modelo de datos. Este punto no necesita ninguna migración de columna, solo lógica de servicio + UI nueva si se decide habilitarlo. |
| `Horario` | Sí | Ya coincide campo a campo con la tabla `horario` de `bajonea_final.sql` (implementada en la Fase 16a, antes de este cambio de modelo). Sin gap. |

## 2. Repositorios

Ningún repositorio de las 6 tablas del pedido existe (`RedSocialRepository`, `GrupoExtraRepository`, `ExtraRepository`, `ProductoGrupoExtraRepository`, `ItemCarritoExtraRepository`, `DetallePedidoExtraRepository`) ni de las 11 tablas adicionales de §1.3. Los 23 repositorios actuales son exactamente los 24 entities de hoy menos `ProductoTagId` (que no tiene repositorio propio, es `@Embeddable`).

Dato relevante para cuando se aborde el punto de Dueño/Empleado: `ComercioRepository` expone `findByPersonaJuridicaId(Integer usuarioId)` como su finder principal para resolver "el comercio de este usuario" (usado en 4 Services, ver §11) — ese finder por sí solo va a quedar obsoleto/ambiguo el día que un mismo `Dueño` pueda tener más de un `Comercio`.

## 3. DTOs

No existe ningún DTO de request/response para las 6 entidades nuevas (crear/editar `RedSocial`, `GrupoExtra`, `Extra`; agregar `Extra` a un ítem de carrito/pedido). Tampoco para `Empleado`/`Dueño`/`EmpleadoComercio`/etc.

Los DTOs existentes que tocan los dos puntos del pedido siguen 100% en el modelo viejo:

| DTO | Capa/Rol | Estado | Observaciones |
|---|---|---|---|
| `RegistroComercioRequestDTO` | Registro de Comercio | Modelo viejo | Trae `fotoPerfilUrl` (opcional, `@ValidarUrlCloudinary`) como campo propio del comercio a registrar — coherente con `Comercio.fotoPerfilUrl` actual, no con `Usuario.fotoPerfilUrl` del modelo nuevo. |
| `ComercioPerfilRequestDTO` | Autoservicio de perfil de Comercio | Modelo viejo | A propósito **no** incluye `fotoPerfilUrl` (tiene su propio par de endpoints, ver §5) — ninguno de los dos apunta a `Usuario`. |
| `FotoPerfilComercioRequestDTO` | Autoservicio de perfil de Comercio | Modelo viejo | `url` validada contra Cloudinary; persiste en `Comercio.fotoPerfilUrl`. |
| `ComercioResponseDTO` / `ComercioAdminResponseDTO` / `ComercioPublicoResponseDTO` | Lectura de Comercio (3 variantes por rol) | Modelo viejo | Las 3 exponen `fotoPerfilUrl` como propiedad del comercio. Ninguna tiene el campo separado a nivel `Usuario` (no habría de dónde sacarlo: no existe la columna). |
| `CarritoResponseDTO` / `ItemCarritoResponseDTO` | Carrito | Sin extras | Sin ningún campo de extras seleccionados ni su subtotal. |
| `PedidoResponseDTO` / `DetallePedidoResponseDTO` | Pedido | Sin extras | Ídem — sin extras, y sin los campos nuevos de `Pedido` (pago, cancelación, entrega) por no existir en la Entity. |

Regla del proyecto (anotaciones de validación solo en `dto/request/`, nunca en Entities) se sigue cumpliendo en todo lo que ya existe — no hay ninguna violación encontrada en el código actual, y no hay nada que auditar todavía del lado de los DTOs nuevos porque no existen.

## 4. Services — lógica de negocio

| Regla de negocio nueva (del diccionario v1.3) | Estado | Ubicación esperada | Observación |
|---|---|---|---|
| Reemplazo de extra si `GrupoExtra.cantidad_maxima = 1`; acumulación si `> 1` | Faltante | `CarritoService` | Sin ningún rastro — no hay ni la tabla para soportarlo. |
| Validar `GrupoExtra.obligatorio = true` con ≥1 `Extra` elegido al confirmar pedido | Faltante | `PedidoService.confirmarPedido` | Ídem. |
| Total del carrito = suma de `ItemCarritoExtra.precio_unitario × cantidad del ítem padre` | Faltante | `CarritoService` (método `calcularSubtotal`, leído: hoy hace únicamente `producto.precio × item.cantidad`, sin ningún término de extras) | **Riesgo si se libera a medias:** si el día de mañana se agrega la tabla `ItemCarritoExtra` y la UI para elegirlos pero no se toca este cálculo, el sistema no da error — cobra de menos silenciosamente. Mismo riesgo espejado en `PedidoService` al confirmar el pedido (`DetallePedido.subtotal`/`Pedido.subtotal`). |
| `RedSocial`: alta con "al menos 1 link activo" (validado a nivel aplicación) | Faltante | Ningún Service | Sin tabla, sin Service. |
| `RedSocial`: único `(comercio_id, tipo)` entre filas activas (no es constraint SQL, es de aplicación) | Faltante | Ídem | — |
| Propagación de estado `Usuario`(Dueño) → todos sus `Comercio` (`BLOQUEADO→CERRADO_TEMPORALMENTE`, etc.) | Faltante | Ningún Service | Hoy no aplica: un `Usuario` de rol `COMERCIO` ya **es** el único comercio (1:1), así que el concepto de "propagar a todos los comercios de un dueño" no tiene análogo actual — es lógica enteramente nueva, no una extensión de algo existente. |
| Selector de "comercio activo" para un Dueño con N comercios / selector de contexto Cliente↔Empleado al iniciar sesión | Faltante | `AuthService` / JWT | Mencionado como decisión de UX ya tomada con Diego en `docs/DECISIONES.md` (2026-08-26), pero sin ningún diseño técnico todavía en `03. Implementación` — ni claim nuevo en el JWT, ni endpoint. Ver §12.3. |
| Validación de `Comercio.fotoPerfilUrl`/`Usuario.fotoPerfilUrl` obligatoria en algún punto del flujo | Parcial/ambiguo | `RegistroService` | Hoy el campo es opcional en el registro de Comercio (excepción MVP ya documentada). El modelo nuevo la vuelve NOT NULL a nivel `Comercio` en el schema pero la mueve conceptualmente a `Usuario` (nullable ahí) — no está claro cuál de las dos reglas debería regir de acá en adelante. Ver §12.4. |
| El resto de reglas de negocio de `Empleado`/`Dueño`/`MercadoPago`/`Soporte`/`Reclamo`/`ConfiguracionTarifa` (todo el §12 del diccionario nuevo) | Faltante | — | Sin ningún Service, ninguna excepción, ningún rastro. |

## 5. Controllers / Endpoints

| Endpoint esperado | Existe | Método | Observaciones |
|---|---|---|---|
| CRUD de `RedSocial` (alta/edición/baja de links, desde `ComercioController` o uno nuevo) | No | — | Ningún endpoint. |
| CRUD de `GrupoExtra`/`Extra` (desde `ProductoController` o uno nuevo) | No | — | Ningún endpoint. |
| Asociar/desasociar `GrupoExtra` a un `Producto` | No | — | `ProductoRequestDTO` no tiene ningún campo de grupos de extras. |
| Seleccionar `Extra` al agregar un producto al carrito | No | — | `ItemCarritoRequestDTO` no tiene campo de extras. |
| `PATCH /usuarios/{id}/foto-perfil` (o equivalente) | No | — | No existe `UsuarioController`. Confirmado contra el listado completo de los 14 controllers actuales y un grep de `foto-perfil`/`FotoPerfil` en todo `controllers/` — los únicos 2 hits son los ya conocidos de `ComercioController` (perfil de Comercio) y el de registro en `AuthController` (`generarFirmaFotoPerfilRegistro`, firma pre-registro para la foto de Comercio, no de Usuario). |
| Cualquier endpoint de `Empleado`/`Dueño`/`EmpleadoComercio` (invitar, aceptar invitación, listar empleados de un comercio, cambiar de comercio activo) | No | — | Sin controller. |
| Cualquier endpoint de MercadoPago/Pago/NotaCredito/Soporte/Reclamo | No | — | Sin controller. |

Los 51 endpoints de producción actuales (14 Controllers) siguen intactos y sin relación con ninguno de estos puntos.

## 6. Migraciones de Flyway

Última migración: `V17__notificacion_pedido_id.sql`. Se revisaron las 17 (`V1` a `V17`) — ninguna crea, altera ni menciona ninguna de las tablas/columnas del modelo nuevo (`red_social`, `grupo_extra`, `extra`, `producto_grupo_extra`, `item_carrito_extra`, `detalle_pedido_extra`, `dueno`, `empleado`, `empleado_comercio`, `cuenta_mercado_pago`, `configuracion_tarifa`, `historial_estado_usuario`, `historial_estado_pedido`, `soporte`, `reclamo`, `nota_credito`, `pago`, `usuario.foto_perfil_url`) — grep sobre el directorio completo de migraciones, cero coincidencias. El primer número libre para la próxima migración es `V18`.

**`V13__seed_admin.sql`** (contenido leído completo): 4 `INSERT` planos, sin ningún `INSERT IGNORE`/`ON DUPLICATE KEY`, que crean `admin@bajonea.ar` en `usuario`/`persona`/`persona_fisica`/`administrador`. Como Flyway solo ejecuta cada migración una vez por base (registrada en `flyway_schema_history`), en el camino normal (`flyway migrate` sobre una base nueva, de punta a punta) esto no genera conflicto. El riesgo real es más específico: si en algún momento se necesita reparar/rebasear el historial de Flyway (`flyway repair`, restaurar un dump parcial, o cualquier operación que deje la tabla `flyway_schema_history` sin el registro de `V13` pero la fila de `admin@bajonea.ar` ya presente en `usuario`), el re-intento de `V13` chocaría contra el `UNIQUE(email)` y fallaría la migración completa. No encontré, revisando `docs/DECISIONES.md`, ninguna entrada previa que ya documentara este riesgo puntual — el pedido de auditoría lo menciona como "ya detectado y pendiente de análisis", pero no hay una entrada anterior localizable con ese análisis. Ver pregunta abierta §12.1.

Este riesgo no es exclusivo del modelo nuevo — ya existe hoy — pero cobra más relevancia si el abordaje del modelo nuevo termina requiriendo rehacer `bajonea_final` desde cero varias veces durante el desarrollo (siembra de datos de prueba, reintentos), escenario mucho más probable que en el día a día actual.

## 7. Frontend

Pantallas con impacto real (no se revisaron las 33 pantallas actuales una por una, solo las que tocan alguno de los dos puntos del pedido):

| Pantalla | Impacto |
|---|---|
| `comercio-producto-form.html` | Sin ningún UI para asociar grupos de extras al producto — confirmado, ni el `.html` ni `js/comercio.js` mencionan "grupo"/"extra" en ningún atributo, testid o función. |
| `carrito.html` / modal de producto en `comercio-detalle.html` | Sin ningún UI de selección de extras al agregar un producto al carrito. |
| `comercio-perfil.html` | Sin ningún UI de redes sociales — la pantalla actual solo edita nombre/descripción/teléfono/email de contacto/delivery/retiro/foto, ya inventariado en `docs/DATA-TESTID-FASE17.md`. |
| `perfil.html` (Cliente) / pantallas de Administrador | Sin ningún UI de subida de foto de perfil — hoy solo `comercio-perfil.html` tiene ese flujo (vía Cloudinary), porque solo `Comercio` tenía el campo. |
| `registro-comercio.html` | El JS que arma el `POST /auth/registro/comercio` (`js/auth.js`) sigue mandando `fotoPerfilUrl` como parte del body del comercio, coherente con el backend actual (`Comercio.fotoPerfilUrl`) — el día que el campo se mueva a `Usuario`, este armado de body tiene que moverse junto con el DTO. |

Regla de cero comentarios en `.html`/`.css`/`.js` no se vio afectada — no se tocó ningún archivo de frontend en esta auditoría.

## 8. Postman

- Cero requests para cualquiera de los endpoints nuevos esperados (ni podrían existir, dado que el backend no los tiene).
- Un hallazgo concreto y accionable para cuando se aborde el punto de `foto_perfil_url`: la colección tiene un test real que depende literalmente de que el campo viva en `Comercio` —
  ```
  pm.test('fotoPerfilUrl quedo actualizada', () => pm.expect(json.data.fotoPerfilUrl).to.include('postman-foto-perfil'));
  ```
  contra la respuesta de `PUT /comercios/perfil/foto`. Si el campo se mueve a `Usuario` sin que este test se actualice (y sin mover el propio endpoint), el assertion queda rota.
- Sin ninguna otra referencia a redes sociales, extras, `dueño`/`dueno` o `empleado` en el resto de la colección (8715 líneas revisadas por grep completo, sin resultados).

## 9. Playwright E2E

Los 9 specs (`01` a `09`, 1724 líneas totales) están 100% sobre el modelo viejo — grep de `RedSocial`/`GrupoExtra`/`Extra`/`dueño`/`dueno`/`empleado` sobre el directorio completo de tests: cero coincidencias.

Ningún spec hace ninguna aserción literal sobre el campo `fotoPerfilUrl` (cero coincidencias de `fotoPerfilUrl`/`foto_perfil` en `testing/playwright/tests/`) — de hecho, `01-registro-y-verificacion.spec.ts` ni siquiera menciona la palabra "foto" en ningún punto, lo que sugiere que el flujo de registro de Comercio probado por Playwright no ejercita el paso opcional de carga de foto (consistente con que el campo es opcional desde el Tramo 16.22). Esto es una buena noticia puntual: el movimiento de `foto_perfil_url` de `Comercio` a `Usuario`, tal como está hoy la suite, **no rompería ningún spec por nombre de campo o flujo probado** — a diferencia de Postman (§8), que sí tiene una aserción literal en riesgo.

Ninguno de los 9 specs prueba nada relacionado a `GrupoExtra`/`Extra` (no podrían, la funcionalidad no existe) ni a roles `Empleado`/`Dueño`. El día que se implemente el bloque de Extras, `06-crud-productos.spec.ts` (305 líneas, cubre alta/edición de producto y su galería) es el candidato natural a extenderse, no a romperse.

## 10. Discrepancias entre diccionario de datos y el .sql real de bajonea_final

Se revisaron los 41 `CREATE TABLE` de `bajonea_final.sql` línea por línea contra las tablas correspondientes de `diccionario-de-datos.md` (columnas, tipos, nullability, defaults, enums, índices, UNIQUE). Los 31 valores de `TipoNotificacion`, los 11 de `EstadoPedido`, los 18 de `TipoPersonaJuridica`, los 12 de `TipoComercio`, los 7 de `TipoRedSocial` y el resto de los enums coinciden exactamente entre ambas fuentes — consistente con que el propio `.sql` se autodescribe como "Generado a partir de: Diccionario de Datos v1.3".

Se encontró **una discrepancia real, puntual**: el diccionario nombra la entidad y su columna FK como **`Dueño`**/**`dueño_id`** (con ñ) de forma consistente en todo el documento — tabla `Dueño` (§3), columna `Comercio.dueño_id` (§4), columna `CuentaMercadoPago.dueño_id` (§4), y las filas 8, 9 y 26 de la tabla de relaciones (§10). El `.sql` real, en cambio, usa **`dueno`**/**`dueno_id`** (sin ñ) en las 3 tablas donde aparece (`dueno`, `comercio.dueno_id`, `cuenta_mercado_pago.dueno_id`), con un comentario inline explícito en el propio script: *"Tabla: Dueno (normalizado sin 'ñ' por decisión de Diego — evita riesgos de encoding en entidades JPA, filesystem y herramientas)"*. Es decir: la decisión de sacar la ñ ya se tomó y ya está aplicada en el schema físico, pero **no se retro-propagó** al texto del diccionario, que sigue escribiendo "Dueño"/`dueño_id` en su prosa y sus tablas. No es una contradicción de fondo (ambas fuentes coinciden en que es una relación N:1 nueva) — es un desalineamiento de nombre de columna/entidad entre el documento que se supone es la fuente de verdad número uno y el script que ya refleja la decisión real. Vale la pena corregir el diccionario antes de generar cualquier migración nueva, para no tener que elegir "a mano" entre dos grafías al momento de escribir la Entity JPA.

No se encontraron otras discrepancias de columnas, tipos, nullability, defaults ni índices entre las dos fuentes.

## 11. Hallazgos de "referencias huérfanas" (código que referencia algo que ya no existe en el modelo nuevo)

No hay, en sentido estricto, código que referencie una tabla/columna que el modelo nuevo *eliminó* (el modelo nuevo no elimina nada del modelo viejo, solo agrega y reestructura). El hallazgo real de esta sección es distinto y más importante: código que asume una **relación** que el modelo nuevo cambia de cardinalidad.

- **`ComercioRepository.findByPersonaJuridicaId(Integer usuarioId)`** — usado directamente por `obtenerComercioDelUsuario(Integer usuarioId)` en `ComercioService.java:118-119`, y el mismo patrón de "1 usuario autenticado → 1 comercio" se repite en otros 3 Services (confirmado por grep): `ProductoService.java`, `PedidoService.java` y `AuthService.java`. Los 4 asumen que el `usuarioId` del JWT identifica sin ambigüedad a un único `Comercio`, porque hoy `Comercio.personaJuridica` es `@OneToOne` y comparte, en los hechos, identidad 1:1 con el usuario que se registró. El modelo nuevo reemplaza esa relación por `Comercio.dueño_id` (`N:1` contra `Dueño`) — un mismo `Dueño` puede tener varios `Comercio` — y además introduce `Empleado`, un `Usuario` distinto del `Dueño` que también necesita poder operar un `Comercio` sin ser su propietario. El día que se aborde el bloque Dueño/Empleado, estas 4 resoluciones "usuario → su comercio" dejan de ser válidas tal cual están y necesitan algún mecanismo de contexto (comercio activo seleccionado, o el `comercioId` viajando explícito en cada request en vez de inferirse del JWT).
- **`RolUsuario`** (`CLIENTE`, `COMERCIO`, `ADMINISTRADOR`) y toda `SecurityConfig.RUTAS_PUBLICAS`/`hasRole("COMERCIO")` — construidos sobre un rol `COMERCIO` que el diccionario nuevo no tiene (lo reemplaza por `DUENO`/`EMPLEADO`). No es una referencia a algo "borrado" de una tabla, pero sí a un valor de enum y un concepto de autorización que el modelo nuevo reorganiza de raíz.

## 12. Preguntas abiertas para Diego

1. **`V13__seed_admin.sql`**: el pedido de auditoría lo describe como "el problema ya detectado y pendiente de análisis", pero no encontré ninguna entrada previa en `docs/DECISIONES.md` que lo documente. ¿Es una observación nueva de esta misma sesión de armado del pedido, o hay contexto/hilo previo que no llegué a encontrar?
2. **Alcance formal del cambio**: dado que el modelo nuevo no es una ampliación puntual sino, en la práctica, el "proyecto completo" que `CLAUDE.md` §1 viene excluyendo desde el inicio — ¿el plan es abordarlo como una enmienda formal de alcance del MVP (mismo mecanismo ya usado 3 veces para `Sesion`, `HistorialEstadoComercio` y `Horario`), o como una redefinición completa de qué es "el MVP" a esta altura del proyecto? Esto cambia bastante cómo se debería actualizar `CLAUDE.md` §1 antes de escribir la primera línea de código nuevo.
3. **Selector de contexto Dueño/Empleado**: `docs/DECISIONES.md` (2026-08-26) ya fija la decisión de UX (selector al iniciar sesión, mismo mecanismo que "comercio activo" del Dueño) pero sin ningún diseño técnico todavía — ¿el claim `sesionId`/`rol` actual del JWT alcanza con un claim adicional (`comercioActivoId`), o hace falta repensar `JwtService`/`JwtAuthenticationFilter` más a fondo?
4. **`foto_perfil_url` — ¿obligatoria o no?**: `bajonea_final.sql` mantiene `comercio.foto_perfil_url` como `NOT NULL` (igual que el diccionario completo original), mientras que el MVP actual la dejó nullable a propósito. El modelo nuevo suma `usuario.foto_perfil_url` (nullable, para los 4 roles) sin aclarar si `comercio.foto_perfil_url` conserva algún sentido en paralelo o si directamente desaparece a favor de la de `Usuario`. ¿Cuál es la intención real: reemplazo completo (borrar `comercio.foto_perfil_url`, como sugiere la sección 1.4 "Modificación estructural" del pedido) o coexistencia?
5. **`bajonea` vs. `bajonea_final`**: ¿la idea es migrar `bajonea` (la base de desarrollo actual, con datos reales/demo) in-place mediante nuevas migraciones Flyway que la lleven a la estructura de `bajonea_final`, o `bajonea_final` reemplaza a `bajonea` directamente y se abandona el historial de Flyway actual (`V1`-`V17`) a favor de arrancar de cero? Esto determina si las próximas migraciones son `ALTER TABLE` incrementales o si se re-versiona todo desde una migración baseline nueva.
6. **Cambios sin commitear fuera de `03. Implementación`**: `01. Análisis de Requerimientos` y `02. Diseño` tienen bastante trabajo en progreso sin commitear (documentos nuevos de Dueño/Empleado, ERD v3 reemplazando al v2, diagramas de flujo con versión Mermaid nueva). No es parte del alcance de esta auditoría tocarlos, pero vale la pena que quede explícito que ese trabajo existe y está pendiente de decisión sobre cuándo commitearlo.
7. **Aclaración de "redes sociales" en `alcance-y-limitaciones.md`**: confirmado que el texto aclaratorio ya está escrito en el archivo (línea 176-178: "Esto no incluye la publicación de enlaces de contacto a las redes del comercio..."), pero **no** hay ninguna entrada correspondiente en `docs/DECISIONES.md` que registre esa aclaración — se agregó la entrada mínima pedida en la sección 5 de este trabajo, pero la aclaración de fondo en sí (por qué se decidió así, cuándo) sigue sin un registro propio más allá de esta auditoría.

## 13. Propuesta de orden de abordaje (borrador para discutir, no un plan cerrado)

1. **Corregir la discrepancia `Dueño`/`Dueno` en el diccionario** (§10) antes de escribir cualquier Entity nueva — es gratis y evita tener que elegir la grafía a mano después.
2. **`foto_perfil_url`**: el cambio más aislado de los dos puntos nombrados en el pedido — toca `Usuario`, `Comercio`, ~6 DTOs, 2-3 endpoints, el flujo de Cloudinary, 2 pantallas de frontend y 1 assertion de Postman. Depende de resolver primero la pregunta abierta §12.4.
3. **`RedSocial`**: depende solo de `Comercio` (ya existe), es una tabla autocontenida sin impacto en cálculos de dinero ni en pedidos — el segundo candidato más aislado.
4. **Bloque de Extras completo** (`GrupoExtra`, `Extra`, `ProductoGrupoExtra`, `ItemCarritoExtra`, `DetallePedidoExtra`): el más interconectado de las 6 tablas del pedido — toca `Producto`, `Carrito`/`ItemCarrito` y `Pedido`/`DetallePedido` a la vez, y **obliga** a tocar el cálculo de totales en `CarritoService`/`PedidoService` en el mismo momento en que se agregan las tablas, no después (ver riesgo de §4). Requiere UI nueva tanto del lado Comercio (configurar grupos/extras) como Cliente (elegirlos).
5. **Dueño/Empleado**: separado a propósito del resto — es el cambio de mayor riesgo arquitectónico de todo el modelo nuevo (§11), toca autenticación/JWT y 4 Services a la vez, y probablemente amerita su propia decisión formal de diseño (respuesta a §12.3) antes de tocar código, igual que se hizo con `Sesion` en su momento.
6. **MercadoPago, Soporte, Reclamo, ConfiguracionTarifa, `HistorialEstadoUsuario`/`HistorialEstadoPedido`, máquina de estados completa de `Pedido`**: todo lo que `CLAUDE.md` §1 excluye hoy explícitamente por nombre. Antes de tocar código acá, corresponde la misma conversación formal de "enmienda de alcance" que ya se usó 3 veces en el proyecto (§12.2) — no debería empezar a construirse como si fuera un tramo más de una fase ya en curso.

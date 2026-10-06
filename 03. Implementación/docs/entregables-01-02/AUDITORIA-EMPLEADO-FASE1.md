# Auditoría Fase 1 — Rol Empleado (solo lectura)

Fecha: 2026-10-05. Alcance: relevamiento del código real (backend, frontend, pruebas) y del esquema de `bajonea_test` (MariaDB 10.4.32, Flyway hasta `V28`). No se modificó ningún archivo del repo salvo este informe, no se aplicó DDL y no se tocó `bajonea_practicas3`. Todo el DDL de este documento es **propuesta pendiente de aprobación de Diego**. No incluye contraseñas de prueba.

Regla de lectura: "gana el código". Donde el código real difiere de la documentación o de lo decidido, está en la sección 0.

---

## 0. Hallazgos que contradicen lo recordado, lo decidido o la documentación

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| H1 | **No existe multirol.** `usuario.rol` es una sola columna `enum('CLIENTE','DUENO','EMPLEADO','ADMINISTRADOR')`, el JWT lleva un solo `rol`, `SecurityConfig` y el frontend (16 guardas `usuario.rol !== 'DUENO'`) asumen un rol por sesión. Solo "Empleado = Empleado o Cliente" es viable con el modelo físico actual. "Dueño = Dueño o Cliente" y "Admin = Admin o Cliente" **no tienen soporte**: el Dueño no tiene fila `cliente`, ni dirección de entrega, ni carrito, y `/carrito`, `/pedidos/cliente`, `/clientes` exigen `ROLE_CLIENTE`. El admin sembrado no tiene fila `cliente`. | `Usuario.java`, `JwtService.java:31-41`, `SecurityConfig.java:109-118`, `RegistroService.java`, `reset-db.mjs` paso 5 | La matriz decidida solo se puede **enforzar** hoy para el par Empleado↔{Dueño, Admin}. Los otros pares quedan como regla sin mecanismo. |
| H2 | **La validación de matriz "al registrar comercios" es hoy inalcanzable y ya está bloqueada por accidente.** `registrarComercio` siempre crea un `Usuario` nuevo con `rol = DUENO`; un email existente (de cualquier rol) da `409 Ya existe una cuenta registrada con ese email`; el DNI es único (`uq_persona_fisica_dni`) y también da `409`. **No existe camino Cliente → Dueño.** Un Empleado o ex Empleado no puede registrar comercio hoy porque no puede reutilizar su email ni su DNI. | `RegistroService.java` (`validarEmailUnico`, `existsByDni`), `persona_fisica.dni UNIQUE` | Construir "Cliente existente pasa a Dueño" es una funcionalidad nueva, fuera de esta fase. Hay que decidir si se hace (pregunta Q3). |
| H3 | La base ya tiene valores de ENUM que Java no tiene, y al revés: `usuario.rol` incluye `EMPLEADO` y `token.tipo` incluye `INVITACION_EMPLEADO` (desde `V1`), pero `RolUsuario` y `TipoToken` Java no los tienen. `TipoNotificacion` (`INVITACION_EMPLEADO`, `EMPLEADO_DESACTIVADO`), `ActorPedido.EMPLEADO` y `ActorCierre.EMPLEADO` ya existen en Java **y** en base. | `V1__baseline...sql`, `V8`, `V9`, `V28`, enums Java | Para el diseño recomendado no hace falta migrar ninguno de esos ENUM. |
| H4 | La documentación está desactualizada respecto de lo decidido: el diccionario dice que `EmpleadoComercio` nace `PENDIENTE` "hasta que el empleado confirma su email (token `INVITACION_EMPLEADO`)", que `Cliente`/`Admin`/`Empleado` son "mutuamente excluyentes" (tabla de relaciones, filas 5-7) y que el rol `EMPLEADO` está "reservado". `DECISIONES.md` 2026-08-26 ya dice lo contrario sobre Cliente+Empleado. | `diccionario-de-datos.md` líneas 157, 327, 902-920, 1545-1547 | Actualizar el diccionario al implementar. **Resuelto el 2026-10-05** (solo documentación): el diccionario v1.11 y los requisitos ya describen el estado decidido, marcado como planificado. |
| H5 | **`GET /comercios/perfil`, `PUT /comercios/perfil` y `PUT /comercios/perfil/foto` devuelven `ComercioResponseDTO` con razón social, CUIT, condición IVA, tipo de sociedad, domicilio fiscal, fecha de inicio y el `representante` (incluye DNI).** Delegarlos tal cual filtraría datos fiscales al Empleado. | `ComercioResponseDTO.java`, `ComercioController.java:113-139` | Hace falta un DTO reducido para el Empleado (o campos nulos según el actor). |
| H6 | **Ninguna escritura valida el estado del comercio.** `ProductoService`, `ComercioService.editarPerfil`, `PedidoService.aceptar/rechazar/...` no miran `Comercio.estado`; solo lo hacen `CierreComercioService` (409 si no es operativo) y `validarAceptaPedidos`. Hoy "sin operar" se logra solo en el frontend (flag `operativo` de `mis-comercios`). Además, durante `SUSPENDIDO` el Dueño **debe poder** entregar los pedidos `LISTO_PARA_RETIRAR` (el timer de 90 min presupone que sigue operando). | `ProductoService.obtenerComercio`, `ComercioActivoService.resolver`, `PedidoService.cancelarPedidosPorSuspensionComercio` | "SUSPENDIDO sin operar" para el Empleado exige un guard de servidor y una excepción para `entregar` (pregunta Q6). |
| H7 | Varias filas de la matriz de permisos decidida **no tienen endpoint todavía**: extras y grupos de extras (Bloque 4), edición de horarios (solo existe `reemplazarHorarios` dentro de la corrección de un comercio `RECHAZADO`), ventas (solo `GET /pedidos/comercio/resumen-hoy` y el listado), documentación de habilitación. | `grep` de controllers | Se clasifican por adelantado; se enchufan cuando existan. |
| H8 | Notificaciones: (a) el listado y el contador del **Cliente** traen *todas* las notificaciones del usuario (`findByUsuarioIdOrderByFechaCreacionDesc`); un Cliente que también es Empleado vería mezcladas las de sus pedidos y las de su comercio. (b) `PEDIDO_AUTOCONFIRMADO_COMERCIO`, `COMERCIO_INACTIVADO` y `REEMBOLSO_FALLIDO_DEFINITIVO` existen como tipo pero **nunca se emiten**. (c) `canal` es siempre `PUSH`. (d) `entidad_tipo` solo admite `PEDIDO` y `COMERCIO`. | `NotificacionService`, `NotificacionRepository`, `grep` de `crear(` | Ver sección 7. |
| H9 | **Ningún cambio de datos del comercio dispara re-aprobación hoy.** `PUT /comercios/perfil` (nombre, descripción, teléfono, email, modalidades) y la foto se aplican directo, sin cambio de estado ni aviso al Administrador, y sin escribir `historial_cambio_comercio` (ese historial solo se usa en la corrección de un `RECHAZADO`). | `ComercioService.editarPerfil` | Delegar edición al Empleado no abre un hueco de re-aprobación. |
| H10 | La propiedad de URL base del frontend **ya existe**: `app.frontend-base-url` (`FRONTEND_BASE_URL`; default `http://localhost:5501`, y `https://bajonea.ar` en `application-production.properties`). La usa Mercado Pago para los `back_urls`. | `application*.properties`, `MercadoPagoPagoService.java:102` | No hace falta propiedad nueva. |
| H11 | Los Términos y Condiciones **no se persisten**: el checkbox de `registro-cliente.html` solo bloquea el envío en el frontend; el DTO `RegistroClienteRequestDTO` no tiene campo. | `auth.js:508`, DTO | Ver Q4. |
| H12 | Un Cliente sin dirección no puede hacer checkout con delivery y **no hay CRUD de direcciones** (C41 pospuesta). `ClienteService` tolera `direccion = null`, pero `confirmarPedido` exige `direccionId` para domicilio. Una cuenta nueva creada por invitación (Usuario + Cliente + Empleado) sin dirección quedaría como Cliente a medias. | `ClienteService.java:87`, `PedidoService.java:136-145` | Ver Q4. |
| H13 | **El historial de la relación no puede colgar de `empleado_comercio` para los eventos de invitación**: la fila "nace o se reactiva al aceptar", así que `invitación` e `invitación cancelada` ocurren cuando la fila todavía no existe (cuenta nueva) o sin transición de estado. | Decisión vs. modelo | El DDL propuesto usa FK nullable a la relación y a la invitación (sección 12). |
| H14 | El Administrador **no tiene controles sobre un `Usuario`** (no bloquea, suspende ni inactiva cuentas): solo suspende comercios (`PUT /administrador/comercios/{id}/suspender`) y lista clientes/comercios en solo lectura. `EstadoUsuario.SUSPENDIDO` no tiene vía real de alta. | `AdministradorController.java` | "Ver equipo" es una lectura nueva; no hay nada que coordinar con acciones sobre usuario. |
| H15 | El actor de cada transición **ya se guarda** (`historial_estado_pedido.actor_rol` + `actor_usuario_id`; `historial_cierre_comercio` igual) pero **ningún DTO lo expone**: `PedidoResponseDTO` no tiene actor. Los 5 sitios de `PedidoService` y los 2 de `ComercioController` fijan `DUENO` a mano. | `PedidoResponseDTO.java`, `PedidoService.java:276,302,329,365,401`, `ComercioController.java:148,155` | Ver sección 6. |
| H16 | `GET /pedidos/comercio/{id}/pago` devuelve `urlPago` (checkout de Mercado Pago) y **no lo usa el frontend**. | `PedidoController.java:75`, grep en `frontend/js` | Se clasifica exclusivo del Dueño. |
| H17 | Sesión única por usuario: `login` toma la fila `usuario` con `FOR UPDATE`, cierra la sesión activa (`FORZADO`) y crea otra; `sesion` no tiene índice único sobre (`usuario_id`, `activa`). Para un Cliente-Empleado la sesión es una sola para ambos contextos. | `AuthService.login`, DDL `sesion` | Compatible con el diseño recomendado (sección 2). |

Línea de estado: bloque 0 (hallazgos) completo.

---

## 1. Esquema real

**`empleado`** (idéntica en `V1` y `bajonea_test`): `id int PK`, `fecha_creacion datetime DEFAULT current_timestamp()`; `FK id → persona_fisica(id)`. Es subtipo de `persona_fisica`, igual que `cliente` y `administrador`.

**`empleado_comercio`**: `id AI PK`, `empleado_id` FK→`empleado`, `comercio_id` FK→`comercio`, `estado enum('PENDIENTE','ACTIVO','DESACTIVADO') NOT NULL DEFAULT 'PENDIENTE'`, `fecha_alta datetime DEFAULT current_timestamp()`, `fecha_baja datetime NULL`; `UNIQUE uq_empleado_comercio (empleado_id, comercio_id)`, índices por comercio y por empleado. Sin `fecha_modificacion`.

**Filas en `bajonea_test`:** `empleado` = 0, `empleado_comercio` = 0 (consultado). En `practicas3` no consulté: SQL en la sección 13.

**Enums relacionados:**
- Java: **no existe** `EstadoEmpleadoComercio` (solo en el diccionario). Existen `ActorPedido{CLIENTE,DUENO,SISTEMA,EMPLEADO}`, `ActorCierre{DUENO,EMPLEADO,SISTEMA}`, `TipoNotificacion` con `INVITACION_EMPLEADO` y `EMPLEADO_DESACTIVADO`, `RolUsuario{CLIENTE,DUENO,ADMINISTRADOR}` (sin `EMPLEADO`), `TipoToken{VERIFICACION_EMAIL,RECUPERACION_PASSWORD,REACTIVACION_CUENTA}` (sin `INVITACION_EMPLEADO`), `EstadoUsuario{PENDIENTE,ACTIVO,BLOQUEADO,SUSPENDIDO,INACTIVO}`, `EstadoComercio` de 8 valores.
- Base: `usuario.rol` incluye `EMPLEADO`; `token.tipo` incluye `INVITACION_EMPLEADO`; `notificacion.tipo` incluye los dos tipos; `historial_estado_pedido.actor_rol` incluye `EMPLEADO`; `historial_cierre_comercio.actor_rol` incluye `EMPLEADO`.
- **No hay Entity JPA ni Repository de `Empleado`/`EmpleadoComercio`** (ni de invitaciones). Solo hay referencias en enums, comentarios y el diccionario.

**`token`:** `usuario_id NOT NULL`, `token varchar(36) UNIQUE` (global; los códigos son de 6 dígitos, espacio de 1.000.000, ver `TokenService`), `estado`, `intentos_fallidos`. Como exige `usuario_id` y el invitado puede no tener cuenta, **el `token` no sirve para invitaciones**: confirma la decisión de estructura propia.

**¿`ddl-auto=validate` afecta?**
- Valida solo las entidades mapeadas contra tablas/columnas/tipos; **no compara los miembros de un `enum` de MySQL** (el proyecto ya lo ejerce con `EnumType.STRING` sobre ENUM nativo).
- Tablas nuevas no mapeadas no molestan. Si se mapea una Entity nueva, su tabla tiene que existir antes: Flyway corre antes de Hibernate en el mismo arranque, así que migración y Entity viajan en el mismo release.
- Riesgo real, no de `validate`: si queda una fila con un valor que el `enum` Java no tiene (`DESACTIVADO` si el Java solo declara `ACTIVO`/`INACTIVO`), la carga falla con `IllegalArgumentException` en tiempo de ejecución. Por eso la migración de datos y el enum Java deben salir juntos.

**¿Es seguro cambiar `DESACTIVADO`→`INACTIVO` y sacar `PENDIENTE`?** Con 0 filas (como `bajonea_test`) sí, trivialmente. Con filas hay que hacerlo en tres pasos, mismo patrón que `V9`: (1) ampliar el ENUM con `INACTIVO`, (2) `UPDATE ... SET estado='INACTIVO' WHERE estado='DESACTIVADO'` y decidir qué hacer con `PENDIENTE` (borrar o convertir; si no, el paso 3 falla por "Data truncated" en modo estricto), (3) reducir el ENUM. SQL para contar en `practicas3`: sección 13.

Línea de estado: bloque 1 (esquema) completo.

---

## 2. Roles, sesión, JWT y contexto activo

**Cómo se guarda el rol hoy.** `usuario.rol` (un valor) + filas de subtipo con el mismo id: `persona(id=usuario.id)` → `persona_fisica(id)` → `cliente(id)` / `administrador(id)` / `empleado(id)`; el Dueño cuelga de `persona_juridica(id)` (`dueno.id`) **y** de `persona_fisica` (`dueno.persona_fisica_id`, único: el representante). La exclusión mutua entre subtipos es solo convención: ningún constraint la impide.

**Dueño que también es Cliente.** No se resuelve hoy (H1). Físicamente un Dueño podría tener una fila `cliente` (mismo `persona_fisica.id`), pero nada la crea y las rutas de Cliente exigen `ROLE_CLIENTE`.

**JWT.** Claims: `sub` = id de usuario, `userId`, `rol`, `sesionId`, `iat`, `exp` (24 h). No lleva comercio ni contexto. `JwtAuthenticationFilter` valida firma, que `sub == userId` y que la `Sesion` siga `activa`; arma `AuthenticatedUser(userId, sesionId, rol)` y la autoridad `ROLE_<rol>` **a partir del claim, sin leer la base**.

**Sesión única.** `login` bloquea `usuario FOR UPDATE`, cierra la sesión activa previa y crea otra. Recuperar/cambiar contraseña, bloqueo y logout también cierran la sesión. Un login en otro dispositivo invalida la sesión del primero.

**`SecurityConfig` (orden de evaluación, primero que matchea gana).** Públicas → `/productos/**` y `/comercios/**` = `DUENO` → `GET /categorias|tags` = autenticado → resto de categorías/tags y `/administrador/**` = `ADMINISTRADOR` → `/carrito`, `/pedidos/cliente`, `/clientes` = `CLIENTE` → `/pedidos/comercio/**`, `/oauth/mercadopago/**`, `PUT /notificaciones/comercio/**` = `DUENO` → cualquier otra = autenticado.

**`ActorPedido` en `PedidoService`.** `DUENO` fijado en 5 sitios (aceptar `:276`, rechazar `:302`, despachar `:329`, entregar comercio `:365`, anular `:401`), siempre con `comercioActivo.duenoId()` como `actor_usuario_id`; `CLIENTE` en 3 (`:198, :352, :380`) y `SISTEMA` en los jobs. `ComercioController` fija `ActorCierre.DUENO` en `:148` y `:155` (el servicio ya recibe el actor por parámetro).

**`ComercioActivoService.resolver(duenoId, header)` y llamadores.** Header `X-Comercio-Id` obligatorio para el Dueño (400 si falta, vacío o no numérico); `findByIdAndDuenoId` o `404` genérico; devuelve `ComercioActivo(comercioId, duenoId)` **sin mirar estado**. Llamadores: `ComercioActivoArgumentResolver` (lo inyecta en `ComercioController` ×6 operaciones, `ProductoController` ×10, `PedidoController` ×8, `RedSocialController` ×4) y `NotificacionService` (`resolverSiCorresponde`, que devuelve vacío si el rol no es `DUENO`). Los endpoints que no declaran `ComercioActivo` ignoran el header. Hay un hueco de ventana: la resolución corre en una transacción de solo lectura **anterior** a la del servicio que escribe.

### Diseños para representar el contexto activo (Cliente o Empleado de un comercio)

**Diseño 1 — Rol base intacto + contexto por header + autorización por relación en el resolver (recomendado).**
- JWT sin cambios (`rol = CLIENTE` para la cuenta Cliente/Empleado). El contexto "Empleado de X" es el header `X-Comercio-Id` que ya existe; `ComercioActivoService` pasa a resolver un **actor**: Dueño si el comercio es suyo, Empleado si existe `empleado_comercio ACTIVO` para el usuario autenticado, si no `404` idéntico. `ComercioActivo` suma `actorUsuarioId`, `actorRol` (`DUENO`/`EMPLEADO`) y `estadoComercio`.
- `SecurityConfig`: se mantienen los matchers `hasRole("DUENO")` como **default de bloqueo** y se antepone una **lista blanca explícita** (método + ruta) de endpoints delegables con `authenticated()`; en ellos la autorización real es el resolver. Los exclusivos del Dueño siguen cerrados sin tocar nada.
- Ventajas: reutiliza el mecanismo multi-comercio ya probado (selector, per-tab con `sessionStorage`, `ComercioActivo`); la autorización se evalúa contra la base en cada request (una desactivación corta el acceso en la siguiente request, sin token viejo); no cambia el contrato de login/JWT; sirve igual para varias relaciones (Empleado de 3 comercios).
- Riesgos de escalada: (a) un endpoint delegable que **no declare** `ComercioActivo` quedaría abierto a cualquier autenticado por la lista blanca → mitigar con un test de arranque que recorra `RequestMappingHandlerMapping` y falle si un mapping de la lista blanca no tiene el parámetro, o con un `AuthorizationManager` propio que exija la relación a nivel de seguridad; (b) aflojar un comodín (`/comercios/**` a `authenticated()`) expondría alta adicional, MP y equipo a cualquier Cliente → la lista blanca es por ruta exacta, nunca por comodín; (c) ambigüedad en endpoints compartidos (`/notificaciones`): resolver por *presencia del header* (con header = contexto comercio; sin header = Cliente; Dueño sin header sigue siendo `400`).
- Cambios: backend (`ComercioActivoService`, `ComercioActivo`, `SecurityConfig`, 5 sitios `ActorPedido`, 2 `ActorCierre`, DTO de perfil reducido, `NotificacionService`); frontend (abstraer `usuario.rol !== 'DUENO'` a un contexto: 16 guardas + `comercioParaLaRequest` de `api.js`); login sin cambios (el frontend consulta `GET /empleados/mis-comercios` tras el login y muestra el selector).

**Diseño 2 — Contexto como claim del JWT, re-emitido al cambiar de contexto.**
- Claim `ctx` (`CLIENTE` | `EMPLEADO:{comercioId}`); `POST /auth/contexto` valida la relación y emite un JWT nuevo con el **mismo `sesionId`**; el filtro arma `ROLE_EMPLEADO`/`ROLE_CLIENTE` según el claim y `SecurityConfig` usa `hasRole`.
- Ventajas: reglas por URL con roles reales; el contexto viaja firmado.
- Riesgos: el claim queda obsoleto hasta que expire (24 h) si se desactiva al Empleado → el filtro tendría que volver a consultar la relación en cada request (anula la ventaja de "token autocontenido"); **rompe el contexto por pestaña** (el token vive en `localStorage` y es único: dos pestañas con contextos distintos se pisan) salvo mover el token a `sessionStorage` (reescribe la lógica de sesión y el aviso de "sesión cerrada en otro dispositivo"); hay que re-emitir token en cada cambio de comercio.
- Cambios: `JwtService`, `JwtAuthenticationFilter`, `AuthenticatedUser`, endpoint nuevo, `api.js` (token por contexto), todos los tests de sesión.

**Diseño 3 — Rol `EMPLEADO` persistido y autoridades múltiples derivadas (`CLIENTE`+`EMPLEADO`) en el JWT.**
- Al aceptar la invitación se agrega `EMPLEADO` a una lista de roles; el backend no tiene noción de contexto, solo de capacidades; el frontend elige la vista.
- Ventajas: la más simple de modelar en `SecurityConfig`.
- Riesgos: el JWT queda con permisos que pueden estar vencidos (desactivación); un mismo request podría ejercer capacidades de Cliente y Empleado a la vez (compra a su propio comercio, notificaciones mezcladas, H8); requiere cambiar `usuario.rol` por una lista o tabla de roles (migración + tocar login, filtros, DTOs) y no escala bien al "Dueño o Cliente" que se decidió.

**Recomendación: Diseño 1.** Es el único que conserva el contexto por pestaña, corta accesos en la siguiente request y reutiliza el patrón multi-comercio ya testeado. Las salvaguardas obligatorias son la lista blanca por ruta exacta y el test de clasificación de mappings (sección 5).

Línea de estado: bloque 2 (roles, sesión, JWT, diseños) completo.

---

## 3. Registro y matriz de roles

- **Registrar Cliente con email existente** (cualquier rol): `409 "Ya existe una cuenta registrada con ese email"`; con nombre de usuario ocupado/reservado: `409`; con DNI existente: `409 "Ya existe una cuenta registrada con ese DNI"`. **Registrar comercio**: mismas tres validaciones más CUIT único y DNI del representante único. El DNI es único global (`persona_fisica.dni`).
- **¿Un Cliente existente puede pasar a Dueño?** No (H2). El alta de comercio adicional (`POST /comercios`) es solo para un Dueño ya existente. Si se construyera, exigiría los datos fiscales completos (`RegistroComercioRequestDTO`: CUIT, razón social, condición IVA, tipo de sociedad, domicilio fiscal, fecha de inicio de actividades, datos del representante, datos del negocio) más la rama de reutilización de `Usuario`/`PersonaFisica` que hoy no existe.
- **Campos del registro de Cliente:** nombre, apellido, DNI, fecha de nacimiento, teléfono, nombre de usuario, email, contraseña, dirección (calle, número, piso/depto, código postal, localidad) y foto opcional. **Términos y Condiciones:** solo checkbox en el frontend, no se envía ni se guarda (H11).
- **Dónde enchufar la validación bidireccional de la matriz.** Un único componente `MatrizRolesService` (o `ValidadorRolesPersona`) que, dado un `usuarioId`/`email`, devuelva las capacidades reales leyendo las filas de subtipo (`administrador`, `dueno.persona_fisica_id`, `empleado`, `cliente`) y no `usuario.rol`. Se invoca en: (1) creación de la invitación (si el email es de un Dueño o Administrador → "No se puede invitar a este email"); (2) aceptación de la invitación, **revalidando** (una persona pudo volverse Dueño/Admin entre el envío y la aceptación); (3) un eventual alta Cliente→Dueño (si Diego decide construirla): bloquear si hay fila `empleado` (activa o histórica, "ex Empleado") o `administrador`; (4) cualquier alta de Admin futura. Hoy los puntos (3) y (4) no existen.
- Dado que el seed del Admin y el alta de Dueño no crean fila `cliente`, "Admin o Cliente" y "Dueño o Cliente" no se pueden cumplir sin construir el alta de la fila `cliente` en esas cuentas; hay que decidirlo (Q3).

Línea de estado: bloque 3 (registro y matriz) completo.

---

## 4. Límites, tokens y emails

**Mecanismo existente (códigos de verificación, recuperación y reactivación).**
- Expiración: vencimiento por fila (24 h verificación y reactivación, 30 min recuperación); se evalúa al validar, sin job.
- Invalidación: `generarToken` marca `UTILIZADO` todos los pendientes del mismo tipo antes de crear uno nuevo (reenviar invalida el anterior); el uso exitoso marca `UTILIZADO`.
- Intentos: `token.intentos_fallidos`; 5 fallos → `UTILIZADO` y `409 "Superaste el máximo..."` (`noRollbackFor` en `AuthService` para que el contador persista).
- **Topes por hora o por día: no existen** para ninguno de esos tres flujos (reenviar es ilimitado). La única limitación por tasa del proyecto es `RateLimitFotoRegistroFilter` (en memoria, por IP, ventana de 60 s, solo firmas de Cloudinary del pre-registro).
- Unicidad: `token` es único **global** sobre un espacio de 6 dígitos; `TokenService` reintenta ante colisión. Las invitaciones, al ir en tabla propia identificadas por email + código, no consumen ese espacio.

**¿Sirve reutilizarlo para los topes de invitación y de email de regularización sin crear tablas?**
- *5 envíos por hora por comercio:* sí, sin tabla extra, **si cada envío es una fila de `invitacion_empleado`** (reenviar = fila nueva y la anterior pasa a `REEMPLAZADA`): el tope es `COUNT(*) WHERE comercio_id = ? AND fecha_creacion > ahora - 1 h`.
- *3 emails de regularización por día por destinatario:* **no hay estructura reutilizable en `token`** (no hay invitación que lo respalde, no se crea invitación). Opciones: (a) fila en `notificacion` (`usuario_id` = destinatario, `tipo = INVITACION_EMPLEADO`, `canal = EMAIL`, `estado = ENVIADO`), que es exactamente el uso previsto de `canal`/`estado` (T31 "Email (+ Push si ya tiene cuenta)") y **no requiere tabla ni ENUM nuevo**; cuesta agregar `AND canal = 'PUSH'` a las consultas del listado y del contador para que esas filas no aparezcan en la campana; (b) contador en memoria como el filtro de Cloudinary (se pierde al reiniciar, no sirve con más de una instancia); (c) tabla mínima `aviso_regularizacion` (email, fecha). **Recomiendo (a)**; (c) si Diego prefiere pureza antes que no sumar tablas. Aplica solo cuando el email ya tiene un `Usuario` (si no hay cuenta no hay motivo de regularización).
- *5 intentos fallidos por código:* columna `intentos_fallidos` en la invitación (mismo patrón que `token`).

**Emails con Resend.** `EmailService` (`com.resend:resend-java`) arma texto plano y envía con `mail.from`; hay 3 plantillas (verificación, recuperación, reactivación) en métodos con asunto y cuerpo fijos. El envío nunca relanza excepciones (log `warn`). Con `email.envio-habilitado=false` (perfil `test`) no llama a Resend y registra solo destinatario y asunto. Config: `resend.api-key`, `mail.from`, `email.envio-habilitado`. Hay que sumar 2 plantillas nuevas (invitación; regularización con motivo) y 1 de aviso opcional.

**URL base.** Reutilizar `app.frontend-base-url` (H10): el link del email es `{app.frontend-base-url}/invitacion-empleado.html`, sin código ni email en la URL (el código va en el texto del email). `Caddyfile` sirve los `.html` planos, no hace falta ruta nueva.

Línea de estado: bloque 4 (límites, tokens, emails) completo.

---

## 5. Matriz de permisos endpoint por endpoint

Criterio: **DELEGABLE** = el Empleado ACTIVO puede ejecutarlo (con el resolver de actor); **EXCLUSIVO** = solo el Dueño (queda bajo `hasRole("DUENO")`, bloqueado por defecto); **PROPIO** = no depende de comercio (sobre la propia cuenta); **FUTURO** = aún no existe. Todo lo que no figure como DELEGABLE queda cerrado.

| Método y ruta | Clasificación | Notas |
|---|---|---|
| `POST /api/v1/comercios` | EXCLUSIVO | Alta de comercio adicional. |
| `GET /comercios/mis-comercios` | EXCLUSIVO | El Empleado usa `GET /empleados/mis-comercios` (nuevo). |
| `GET /comercios/alta-adicional/elegibilidad` | EXCLUSIVO | |
| `POST /comercios/nuevo/foto/firma` | EXCLUSIVO | |
| `GET /comercios/{id}/correccion` | EXCLUSIVO | Incluye datos fiscales del Dueño. |
| `PUT /comercios/{id}/resolicitud` | EXCLUSIVO | Re-solicitud de comercio rechazado. |
| `POST /comercios/{id}/correccion/foto/firma` | EXCLUSIVO | |
| `GET /comercios/perfil` | DELEGABLE con DTO reducido | Sin datos fiscales ni `representante` (H5). |
| `PUT /comercios/perfil` | DELEGABLE | Nombre, descripción, teléfono, email, modalidades. Sin re-aprobación (H9). |
| `POST /comercios/perfil/foto/firma` | DELEGABLE | |
| `PUT /comercios/perfil/foto` | DELEGABLE | Respuesta con DTO reducido. |
| `PUT /comercios/cerrar`, `PUT /comercios/abrir` | DELEGABLE | `ActorCierre.EMPLEADO` ya existe. |
| `GET/POST/PUT {id}/DELETE {id} /comercios/redes-sociales` (4) | EXCLUSIVO | Decidido: el Empleado no toca redes sociales. |
| `POST /productos`, `PUT /productos/{id}`, `GET /productos` | DELEGABLE | |
| `PATCH /productos/{id}/estado` | DELEGABLE | Incluye `DESCONTINUADO`. |
| `POST /productos/{id}/cloudinary/firma`, `POST .../imagenes`, `DELETE .../imagenes/{imagenId}`, `PATCH .../imagenes/{imagenId}/orden`, `POST .../imagenes/{imagenId}/recorte/firma`, `PATCH .../imagenes/{imagenId}/url` | DELEGABLE | 7 endpoints de galería. |
| `GET /pedidos/comercio` (historial) y `GET /pedidos/comercio/resumen-hoy` (ventas del día) | DELEGABLE | Decidido: historial y ventas. |
| `PUT /pedidos/comercio/{id}/aceptar`, `/rechazar`, `/despachar`, `/entregar`, `/anular` | DELEGABLE | Hoy escriben `ActorPedido.DUENO` (H15). |
| `GET /pedidos/comercio/{id}/pago` | EXCLUSIVO | Devuelve `urlPago` de MP; sin uso en el frontend (H16). |
| `GET /oauth/mercadopago/iniciar`, `/desvinculacion/previa`, `/cuenta`, `DELETE /oauth/mercadopago/desvincular` | EXCLUSIVO | Mercado Pago. |
| `GET /oauth/mercadopago/callback` | Público (no aplica) | Redirect de MP, autenticado por `state`. |
| `GET /notificaciones`, `GET /notificaciones/no-leidas/contador` | DELEGABLE con header | Con `X-Comercio-Id` y relación activa devuelven solo las operativas del comercio (sección 7). |
| `PUT /notificaciones/{id}/leida` | PROPIO | Ya valida que la notificación sea del usuario. |
| `PUT /notificaciones/comercio/{id}/leidas` | EXCLUSIVO | Pantallas de estado del Dueño. |
| `POST/PATCH/DELETE /usuarios/{id}/foto-perfil...` (3) | PROPIO | Autenticado; valida que `id` sea el propio. |
| `GET /categorias`, `GET /tags` | Ya abiertos a cualquier autenticado | Necesarios para el formulario de producto. |
| `/auth/cambiar-password`, `/auth/logout` | PROPIO | |
| `/clientes/**`, `/carrito/**`, `/pedidos/cliente/**` | Contexto Cliente | `ROLE_CLIENTE`; el Empleado (rol `CLIENTE`) los usa en su contexto Cliente. |
| `/administrador/**` | EXCLUSIVO del Admin | Se suman `GET /administrador/comercios/{id}/equipo` y la actividad, solo lectura. |
| Nuevos (a crear) `/comercios/equipo/**` (invitar, reenviar, cancelar, desactivar, listar, actividad) | EXCLUSIVO | Header `X-Comercio-Id`. |
| Nuevos (a crear) `GET /empleados/mis-comercios`, `PUT /empleados/comercios/{id}/renunciar` | PROPIO del Empleado | Validan relación del usuario autenticado; sin header. |
| Nuevos (a crear, públicos) `POST /auth/invitaciones-empleado/validar` y `/aceptar` | Públicos | Se suman a `RUTAS_PUBLICAS`; ver sección 12. |
| Extras / grupos de extras (Bloque 4) | FUTURO, DELEGABLE | |
| Edición de horarios | FUTURO, DELEGABLE | |
| Documentación de habilitación | FUTURO, EXCLUSIVO | |

**Mecanismo "bloqueado por defecto".** La lista blanca de delegables es por ruta exacta en `SecurityConfig`, antes de los comodines `hasRole("DUENO")`. Un test de arranque que enumere todos los mappings bajo `/comercios`, `/productos`, `/pedidos/comercio`, `/oauth/mercadopago`, `/notificaciones` y falle si alguno no está clasificado (y si uno delegable no declara `ComercioActivo`) convierte la matriz en un contrato verificable.

**Re-aprobación.** Ninguno de los cambios delegables dispara re-aprobación ni re-solicitud hoy (H9). Si en el futuro un cambio de datos pasara a exigir aprobación (por ejemplo la futura documentación de habilitación), esa pieza queda exclusiva del Dueño por decisión.

Línea de estado: bloque 5 (matriz de permisos) completo.

---

## 6. Trazabilidad

**Dónde enchufar el registro de actividad.** Un `ActividadComercioService.registrar(comercioActivo, entidadTipo, entidadId, entidadNombre, accion, detalle)` llamado **desde los servicios, dentro de la misma transacción de la escritura**, solo cuando hubo cambio efectivo. No recomiendo AOP ni el controller (el nombre de la entidad y si hubo cambio real solo se conocen en el servicio). Puntos de escritura delegables hoy:
- `ProductoService`: `crearProducto`, `editarProducto`, `cambiarEstado`, `agregarImagen`, `eliminarImagen`, `reordenarImagen`, `actualizarUrlImagen`.
- `ComercioService`: `editarPerfil`, `actualizarFotoPerfil`.
- `PedidoService`: `aceptarPedido`, `rechazarPedido`, `avanzarAEntregaEnCurso`, `confirmarEntregaComercio`, `anularPedido`.
- `CierreComercioService.cerrar/abrir` (solo cuando cambia la bandera; cerrar dos veces no escribe fila).
- Futuro: extras, horarios.
- Del Dueño (no delegables, para que la vista del Dueño sea completa): `RedSocialService` (agregar/editar/baja) y los eventos de equipo (esos ya quedan en el historial de la relación).
Aproximadamente 20 puntos. Los eventos de pedido y de cierre duplican lo que ya guardan `historial_estado_pedido` e `historial_cierre_comercio`: es aceptable (una sola consulta por comercio para la bitácora) y evita unir tres tablas.

**Actor hoy.** `historial_estado_pedido`: `actor_rol` (`CLIENTE/DUENO/SISTEMA/EMPLEADO`) + `actor_usuario_id` (FK a `usuario`, `RESTRICT`), `motivo_timeout`. `historial_cierre_comercio`: `actor_rol` (`DUENO/EMPLEADO/SISTEMA`) + `actor_usuario_id`, con `CHECK` que exige usuario salvo `SISTEMA`. Ambos ya están listos para `EMPLEADO`.

**Mostrar el nombre del actor en el detalle del pedido, incluso inactivo.** No hace falta nada nuevo en base: `actor_usuario_id` apunta al `usuario` (que nunca se borra) y el nombre sale de `persona_fisica` por join, sin depender de `empleado_comercio.estado`. Cambios: (1) `PedidoResponseDTO` suma una lista de transiciones o, mínimo, `atendidoPor` por transición con `nombre`, `apellido`, `actorRol`, `fechaHora`; (2) una consulta que traiga el historial del pedido con el join a `persona_fisica`; (3) el actor se resuelve en `registrarHistorial` desde `ComercioActivo.actorRol()`/`actorUsuarioId()` en vez de `ActorPedido.DUENO` fijo. El nombre mostrado es el actual de la persona (no hay snapshot); si hubiera que congelarlo habría que guardar el nombre en la fila (no recomendado). Para la vista del Cliente conviene mostrar solo "el comercio" y reservar el nombre del actor al panel del comercio (pregunta Q12).

Línea de estado: bloque 6 (trazabilidad) completo.

---

## 7. Notificaciones

**Filtrado por comercio para el Dueño.** `notificacion` no tiene columna de comercio: pertenece al comercio si es `entidad_tipo = COMERCIO` con ese id o `entidad_tipo = PEDIDO` de un pedido de ese comercio (`NotificacionRepository.findByUsuarioIdAndComercioId`, contador y marcado). `GET /notificaciones` y el contador exigen header para el Dueño; un solo polling de 15 s a `mis-comercios` alimenta la campana.

**Destinatarios hoy.** Siempre `comercio.getDueno()...getUsuario().getId()` en: `NUEVO_PEDIDO` (`PedidoService:228`), `PEDIDO_CANCELADO_CLIENTE` (`:383`), `PEDIDO_EXPIRADO_COMERCIO` (`:554`), y los administrativos `COMERCIO_APROBADO/RECHAZADO` y `COMERCIO_SUSPENDIDO` (`AdministradorService:290, :328`). El resto va al Cliente. `ProductoService:370` notifica al Cliente por producto removido del carrito.

**Cómo hacer que cada Empleado ACTIVO reciba las operativas.** Un helper `destinatariosOperativos(comercio)` = Dueño + usuarios de `empleado_comercio ACTIVO` del comercio, y `notificacionService.crear` por cada uno en las 3 emisiones operativas (pedido nuevo, cancelado por el cliente, expirado por falta de respuesta). Las administrativas (`COMERCIO_*`), de cobro (`REEMBOLSO_FALLIDO_DEFINITIVO`, y todo lo de Mercado Pago) siguen solo al Dueño. La lectura del Empleado reutiliza `findByUsuarioIdAndComercioId` con su propio `usuario_id`: como cada Empleado recibe su copia, no hace falta tocar la consulta para ese sentido. El fan-out lee `empleado_comercio` dentro de transacciones que ya tienen el pedido y el comercio; es una lectura simple, sin bloqueos nuevos.
- `PEDIDO_AUTOCONFIRMADO_COMERCIO` ("Dueño y Empleados activos", T30) hoy no se emite a nadie (H8); si Diego quiere que exista, es una emisión nueva en `avisar75MinYAutoconfirmar`.
- **Contexto Cliente del Empleado:** el listado y el contador del Cliente deben dejar de traer todo: restringir a notificaciones sin entidad o con `PEDIDO` cuyo `pedido.cliente_id = usuario` y excluir `entidad_tipo = COMERCIO` (H8a). Si además se prohíbe que un Empleado le compre a su propio comercio (Q2) se evita la ambigüedad de un mismo pedido apareciendo en ambos contextos.

**`EMPLEADO_DESACTIVADO` sin migración.** Para el aviso al desactivado: `crear(usuarioEmpleado, "...", EMPLEADO_DESACTIVADO, COMERCIO, comercioId)`; para la renuncia: la misma notificación al Dueño con otro texto. `COMERCIO` ya es un `entidad_tipo` válido, así que el aviso queda asociado al comercio y se ve bajo el selector del Dueño. El desactivado la verá en el listado del Cliente (sin filtro por comercio); aceptable porque es un aviso que le concierne (si se aplica el filtro del punto anterior hay que dejar pasar este tipo).

Línea de estado: bloque 7 (notificaciones) completo.

---

## 8. Estados de comercio frente a cada camino

| Estado | Operar (escrituras API) | Catálogo público | `mis-comercios` | Frontend del Dueño |
|---|---|---|---|---|
| `PENDIENTE` | Sin guard de estado (H6) | No | `operativo=false` | Pantalla `comercio-pendiente`. |
| `APROBADO` (sin MP) | Sin guard; `cerrar/abrir` sí (409 si no operativo) | No | `operativo=true` | Dashboard; banner "Vinculá Mercado Pago". No recibe pedidos (`validarAceptaPedidos` pide `APTO_VENTA`). |
| `APTO_VENTA` | Todo | Sí | `operativo=true` | Dashboard completo. |
| `CERRADO_TEMPORALMENTE` (Dueño bloqueado) | `cerrar/abrir` 409; el resto sin guard | Sí, con `estadoApertura = CERRADO_TEMPORALMENTE`; no admite pedidos (409) | `operativo=false` | Grupo "Otros", sin acción. |
| `SUSPENDIDO` | Sin guard; pedidos en curso cancelados; `LISTO_PARA_RETIRAR` sigue y vence en 90 min | No | `operativo=false` | "Otros", sin acción. |
| `INACTIVO` | Sin guard | No | `operativo=false` | "Otros". Se restaura al reactivar la cuenta del Dueño. |
| `RECHAZADO` | Sin guard | No | `operativo=false` | `comercio-rechazado`. |
| `RECHAZO_DEFINITIVO` | Sin guard | No | `operativo=false` | `comercio-rechazo-definitivo`. |

Definición única de "operativo": `ComercioActivoService.esOperativo` = `APROBADO` o `APTO_VENTA`.

**Aplicación al Empleado.** `GET /empleados/mis-comercios` debería devolver las relaciones `ACTIVO` con `estado` y `operativo` del comercio, **excluyendo `INACTIVO` y `RECHAZO_DEFINITIVO`** (sale del selector) y también `PENDIENTE`/`RECHAZADO` (nunca operó ahí; Q7). `SUSPENDIDO` y `CERRADO_TEMPORALMENTE` se muestran con aviso y sin acción. En servidor el resolver, cuando el actor es Empleado, debe rechazar escrituras en comercios no operativos con `409`, **salvo `entregar`** de un pedido `LISTO_PARA_RETIRAR` en `SUSPENDIDO` (H6, Q6). Recomiendo evaluar el mismo guard para el Dueño en una fase aparte (hoy es solo frontend).

Línea de estado: bloque 8 (estados de comercio) completo.

---

## 9. Frontend

**`api.js`.** `RUTAS_DEL_DUENO` (regex) decide a qué rutas agrega `X-Comercio-Id`; `comercioParaLaRequest` exige `usuario.rol === 'DUENO'` y excluye `RUTAS_DEL_DUENO_SIN_HEADER` (`/notificaciones/comercio/…`); opciones `comercioId` (forzar un comercio), `sinComercio` (no mandar header), `handleRedGlobally` (sin redirect en errores de red), `conMensaje`, `handle401Globally`, `handle5xxGlobally`. Token y usuario en `localStorage`; comercio activo en `sessionStorage['bajonea_comercio_activo']` = `{usuarioId, comercioId}` (por pestaña) más `localStorage['bajonea_ultimo_comercio_<usuarioId>']`. El `403` redirige a `errores/acceso-denegado.html`; el `401` muestra el modal de sesión cerrada.

**`comercio-activo.js` / `selector-comercio.js`.** Resuelven una vez por carga con `GET /comercios/mis-comercios`: selección de la pestaña → último usado → primer operativo; sin operativos van a la pantalla de estado (`RUTA_POR_ESTADO`); lista vacía vuelve al login. Polling de 15 s (`verificarComercioActivo`) que expulsa si el activo deja de ser operativo. `prepararPaginaDueno` es el guard de las pantallas operativas. La franja bajo el header muestra el comercio activo; el panel "Tus comercios" (mantener apretado el avatar del perfil) agrupa Operativos / Pendientes / Rechazados / Otros y ofrece "Agregar comercio" y el aviso de vincular Mercado Pago.

**Panel y perfil del Dueño.** 4 pestañas (`renderBottomNavComercio`: Panel, Productos, Pedidos, Perfil) solo para `rol === 'DUENO'`. Perfil (`comercio-perfil.html`): editar perfil, **ver datos legales**, **Mercado Pago** (vincular, desvincular, modal de bloqueo), cambiar contraseña, cerrar sesión, foto. Dashboard: interruptor de cierre manual, métricas del día, pedidos activos.

**Qué ocultar para el Empleado:** "Ver datos legales" y la vista de datos fiscales; todo Mercado Pago (enlace del perfil, vista `?vista=mercadopago`, aviso y botón de vincular del panel, callback `vinculacionMp`); "Agregar comercio"; los grupos Pendientes/Rechazados del panel; el aviso "Vinculá Mercado Pago"; las pantallas `comercio-corregir`, `comercio-pendiente/rechazado/rechazo-definitivo`, `agregar-comercio`; el acceso a "Equipo" y "Actividad". Quedan: panel (con cierre y métricas), productos, pedidos, editar datos y foto, cambiar contraseña, renunciar.

**Lugares donde el rol está cableado** (hay que pasarlos a un contexto `{tipo, actor, comercioId}`): `api.js` `comercioParaLaRequest`; `comercio-activo.js:85`; `selector-comercio.js:494`; `comercio.js:208, 339, 543, 630, 1132, 1535, 2008, 2146`; `agregar-comercio.js:67`; `comercio-corregir.js:101`; `notificaciones.js:107-114`; `catalogo.js:93, 147, 159`. `resolverHomePorRol` (`auth.js:96`) tiene tres ramas fijas.

**Login y registro.** `login.html` → `initLogin` → `setSesion` → `redirigirPostLogin` → `resolverHomePorRol`. Footer del login con "Registrate" y "Reactivar mi cuenta"; **el botón "Tengo una invitación" va ahí**, junto a esos links (`login.html:51-52`). `registro-tipo-cuenta.html` ofrece Cliente o Comercio.

**Pantallas nuevas:** `invitacion-empleado.html` (email + código; ramas cuenta nueva/existente; luego va al login); selector de contexto post-login (Cliente / Empleado de X; recordar el último por usuario como hoy el "último comercio"); entrada "Cambiar a modo Empleado" en `perfil.html` y viceversa; pantalla "Ya no tenés acceso a ningún comercio" (**no existe**: hoy solo hay `errores/*` y las pantallas de estado de comercio); "Equipo" del Dueño (miembros, invitaciones vigentes con reenviar/cancelar, desactivar, actividad); renuncia con doble confirmación; "Ver equipo" del Admin.

Línea de estado: bloque 9 (frontend) completo.

---

## 10. Administrador

El detalle de comercio del Admin tiene dos superficies: `admin-comercio-detalle.html` (comercios pendientes; muestra Dueño y otros comercios, no tiene equipo porque un pendiente no opera) y el **modal de detalle de `admin-comercios.html`** (`mostrarModalDetalleComercio`, `admin.js:811`), que para `APROBADO`/`APTO_VENTA` ya tiene el botón "Suspender". **"Ver equipo" va en ese modal**, junto a Suspender, y abre una vista de solo lectura alimentada por un endpoint nuevo `GET /administrador/comercios/{id}/equipo` (miembros `ACTIVO`/`INACTIVO` con historial resumido, invitaciones vigentes y, si se quiere, la actividad del comercio, también solo lectura).

**Controles actuales del Admin sobre un usuario: ninguno** (H14): lista clientes y comercios, aprueba/rechaza comercios, suspende comercios, gestiona categorías, tags, tarifas y reembolsos. No hay bloqueo/suspensión/inactivación de `Usuario`.

Línea de estado: bloque 10 (Administrador) completo.

---

## 11. Pruebas

**Playwright** (`testing/playwright`, 34 specs, `workers: 1` permanente, base `bajonea_test`). Afectados:
- **Aserciones de `403` para un Cliente sobre rutas del Dueño que pasen a delegables** (con el Diseño 1 un Cliente sin relación recibe `404` genérico, no `403`): `30-cierre-manual-comercio-api` (cerrar/abrir) seguro; revisar los builders `build-matriz-comercio-postman.mjs` y `build-multicomercio-tramo*-postman.mjs`. Las aserciones de `22`, `24`, `26`, `28` son sobre endpoints exclusivos y siguen en `403`.
- `02-login`, `13-registro-comercio-wizard`, `selector.ts` (helper): el botón nuevo del login y el selector de contexto.
- `09-notificaciones` y los specs de notificaciones por comercio: filtro nuevo del Cliente y fan-out a Empleados.
- `05`, `16` (pedido): `registrarHistorial` con actor dinámico (el Dueño sigue siendo `DUENO`).
- `14-perfil-comercio`: DTO reducido solo para el Empleado; el del Dueño no cambia.
- Nuevos (propuesta): `35-empleado-invitacion-api`, `36-empleado-invitacion-ui`, `37-empleado-permisos-api` (la matriz entera: lo delegable pasa, lo exclusivo da `403`/`404`, un Empleado desactivado pierde acceso en la siguiente request), `38-empleado-operacion-ui` (selector, panel recortado, pedidos, renuncia), `39-equipo-dueno-ui`, `40-admin-ver-equipo`, y `34`-style para el límite de comercio no operativo.

**Newman/Postman.** Los builders `build-multicomercio-tramo{1,2a,3a,4a,5a,6a,7a,8a}-postman.mjs` se ejecutan en ese orden y el último agrega la carpeta `55`; el nuevo sería `build-empleado-tramo1a-postman.mjs` (carpeta `56`, siempre último). `postman/Bajonea-MVP.postman_collection.json` es la fuente versionada; el MCP de Postman descarta los scripts de la pestaña Tests en items anidados (limitación ya documentada), así que se mantiene por builders.

**Estrés** (`scripts/stress-locks-*.mjs`, 5 existentes). Propuesta `stress-locks-empleado.mjs`: aceptar × cancelar × reenviar la misma invitación; dos aceptaciones del mismo código; desactivar × `aceptar` pedido; renuncia × baja del Dueño; 6 invitaciones simultáneas contra el tope de 5 por hora.

**Cuentas y seeds.** Las suites crean sus datos por API (`registrarYVerificarCliente`, `registrarYVerificarComercio`, etc.); hay que sumar helpers `invitarEmpleado`, `aceptarInvitacion`, `obtenerCodigoInvitacionTest`. `reset-db.mjs` solo siembra el Admin y la tarifa; no hace falta seed de Empleado ni de invitaciones. Para `practicas3`, Diego agrega localmente una cuenta Empleado en `docs/CUENTAS-DE-PRUEBA.local.md` (archivo ignorado por git); no se versionan credenciales.

**Atajo para códigos de email.** `GET /api/v1/test/token?email=&tipo=` (`@Profile("test")`, ruta pública bajo `RUTAS_PUBLICAS`) lee la tabla `token` y solo cubre los `TipoToken`. **Como las invitaciones van en tabla propia no lo cubre**: hay que sumar un atajo `GET /api/v1/test/invitaciones-empleado/codigo?email=&comercioId=` y otro para vencer una invitación (`PUT .../{id}/vencer`), ambos solo en perfil `test`. El perfil `test` tiene `email.envio-habilitado=false` (no se llama a Resend).

**Tests Java.** Hoy hay 34 clases de test en `services` (ninguna de empleado). Nuevos: invitación (límites, estados, concurrencia), resolver de actor, `MatrizRolesService`, test de clasificación de mappings, fan-out de notificaciones, integración de desactivar-mientras-opera.

Línea de estado: bloque 11 (pruebas) completo.

---

## 12. DDL propuesto (sin aplicar)

Próxima migración Flyway libre: `V29`. Cuatro migraciones separadas (una por cambio) facilitan el rollback. **Nada de lo siguiente necesita valor nuevo de ENUM en tablas existentes.**

### V29 — Estado de la relación (`INACTIVO`, sin `PENDIENTE`)

```sql
ALTER TABLE `empleado_comercio`
  MODIFY COLUMN `estado` ENUM('PENDIENTE','ACTIVO','DESACTIVADO','INACTIVO') NOT NULL DEFAULT 'ACTIVO';
UPDATE `empleado_comercio` SET `estado` = 'INACTIVO' WHERE `estado` = 'DESACTIVADO';
DELETE FROM `empleado_comercio` WHERE `estado` = 'PENDIENTE';
ALTER TABLE `empleado_comercio`
  MODIFY COLUMN `estado` ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO';
```

Justificación: refleja la decisión (la fila nace al aceptar, ya `ACTIVO`; "pendiente" se muestra desde invitaciones vigentes). Antes de correrlo en una base con datos, ejecutar el SQL (b) y (c) de la sección 13; el `DELETE` de `PENDIENTE` solo es inocuo si no hay filas (no hay FK que cuelgue de `empleado_comercio`). `fecha_baja` conserva su significado (se llena al pasar a `INACTIVO`, se limpia al reactivar); el motivo y el actor quedan en el historial de la relación.

### V30 — Invitaciones

```sql
CREATE TABLE `invitacion_empleado` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `email` varchar(254) NOT NULL,
  `codigo` char(6) NOT NULL,
  `estado` enum('PENDIENTE','ACEPTADA','CANCELADA','REEMPLAZADA','VENCIDA','INVALIDADA') NOT NULL DEFAULT 'PENDIENTE',
  `intentos_fallidos` int(11) NOT NULL DEFAULT 0,
  `invitado_por_usuario_id` int(11) NOT NULL,
  `usuario_aceptante_id` int(11) DEFAULT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_vencimiento` datetime NOT NULL,
  `fecha_resolucion` datetime DEFAULT NULL,
  `pendiente_clave` tinyint(1) GENERATED ALWAYS AS (CASE WHEN `estado` = 'PENDIENTE' THEN 1 ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_pendiente_comercio_email` (`comercio_id`,`email`,`pendiente_clave`),
  UNIQUE KEY `uq_inv_pendiente_email_codigo` (`email`,`codigo`,`pendiente_clave`),
  KEY `idx_inv_comercio_fecha` (`comercio_id`,`fecha_creacion`),
  KEY `idx_inv_email_estado` (`email`,`estado`),
  KEY `idx_inv_invitado_por` (`invitado_por_usuario_id`),
  KEY `idx_inv_aceptante` (`usuario_aceptante_id`),
  CONSTRAINT `fk_inv_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_inv_invitado_por` FOREIGN KEY (`invitado_por_usuario_id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `fk_inv_aceptante` FOREIGN KEY (`usuario_aceptante_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Justificación: una fila por **envío** (reenviar = fila nueva, la anterior `REEMPLAZADA`; da el tope de 5 por hora con un `COUNT`); `codigo` en texto plano, igual que `token.token`, porque un hash de 6 dígitos casi no agrega protección y el atajo de test necesita leerlo; `email` normalizado (trim + minúsculas); la columna generada `pendiente_clave` (mismo patrón que `V27`) da dos únicos parciales: una sola invitación pendiente por (comercio, email) y email + código sin ambigüedad entre pendientes; el vencimiento se evalúa de forma perezosa y al invitar se pasa la anterior vencida a `VENCIDA` en la misma transacción (sin job). No hay FK a `usuario` por el email porque el invitado puede no existir.

### V31 — Historial de la relación empleado-comercio

```sql
CREATE TABLE `historial_empleado_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `empleado_comercio_id` int(11) DEFAULT NULL,
  `invitacion_id` int(11) DEFAULT NULL,
  `estado_origen` enum('ACTIVO','INACTIVO') DEFAULT NULL,
  `estado_destino` enum('ACTIVO','INACTIVO') DEFAULT NULL,
  `motivo` enum('INVITACION','ACEPTACION','INVITACION_CANCELADA','BAJA_DUENO','RENUNCIA','REACTIVACION') NOT NULL,
  `actor_usuario_id` int(11) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hec2_comercio_fecha` (`comercio_id`,`fecha_hora`),
  KEY `idx_hec2_relacion` (`empleado_comercio_id`),
  KEY `idx_hec2_invitacion` (`invitacion_id`),
  KEY `idx_hec2_actor` (`actor_usuario_id`),
  CONSTRAINT `fk_hec2_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_hec2_relacion` FOREIGN KEY (`empleado_comercio_id`) REFERENCES `empleado_comercio` (`id`),
  CONSTRAINT `fk_hec2_invitacion` FOREIGN KEY (`invitacion_id`) REFERENCES `invitacion_empleado` (`id`),
  CONSTRAINT `fk_hec2_actor` FOREIGN KEY (`actor_usuario_id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `ck_hec2_referencia` CHECK (`empleado_comercio_id` IS NOT NULL OR `invitacion_id` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Justificación: honra los 6 motivos decididos (H13): `INVITACION` e `INVITACION_CANCELADA` cuelgan de `invitacion_id` (sin transición de estado: origen/destino nulos), `ACEPTACION`/`REACTIVACION`/`BAJA_DUENO`/`RENUNCIA` cuelgan de la relación con origen y destino. `comercio_id` redundante a propósito para listar el historial de un comercio sin joins. `actor_usuario_id` nulo no se usa hoy (todos los eventos tienen actor), queda permitido por si más adelante hay un actor `SISTEMA`.

### V32 — Actividad por comercio

```sql
CREATE TABLE `actividad_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `actor_rol` enum('DUENO','EMPLEADO') NOT NULL,
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

Justificación: tabla única de escrituras (comercio, usuario, rol, qué tocó, qué hizo, cuándo) sin valores anteriores. `accion` es un conjunto chico y estable (las transiciones de pedido van como `CAMBIAR_ESTADO` con el texto en `detalle`, p. ej. "Pedido #12: aceptado") para no tener que migrar el ENUM cada vez que aparezca un endpoint; `entidad_tipo` ya incluye `GRUPO_EXTRA`/`EXTRA` para el Bloque 4. `entidad_nombre` es el nombre en el momento de la acción (el producto puede renombrarse o descontinuarse). Paginado por `(fecha_hora, id)` descendente. La ve el Dueño completa y el Admin en solo lectura; el Empleado no.

### Notas sobre ENUMs y entidades Java (no son DDL)

- No se agrega ningún valor a `usuario.rol`, `token.tipo`, `notificacion.tipo`, `notificacion.entidad_tipo`, `historial_estado_pedido.actor_rol` ni `historial_cierre_comercio.actor_rol`.
- Java: agregar `EstadoEmpleadoComercio{ACTIVO,INACTIVO}`, `EstadoInvitacionEmpleado`, `MotivoHistorialEmpleado`, `TipoEntidadActividad`, `AccionActividad`, y las entidades/repositorios nuevos. `RolUsuario` y `TipoToken` **no** hay que ampliarlos con el Diseño 1.
- Si se elige la opción (a) de la sección 4 para los avisos de regularización, no hay DDL adicional; con la opción (c) sería una quinta tabla mínima.

Línea de estado: bloque 12 (DDL propuesto) completo.

---

## 13. SQL para que Diego corra en `bajonea_practicas3` (phpMyAdmin, base seleccionada)

Todas son lecturas.

```sql
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;
```

**(a) Cuentas que ya rompen la matriz de roles** (una persona con más de un rol entre Administrador, Dueño y Empleado):

```sql
SELECT u.id, u.email, u.rol,
       (a.id IS NOT NULL) AS es_admin,
       (d.id IS NOT NULL) AS es_dueno,
       (e.id IS NOT NULL) AS es_empleado,
       (c.id IS NOT NULL) AS es_cliente
FROM persona_fisica pf
JOIN usuario u ON u.id = pf.id
LEFT JOIN administrador a ON a.id = pf.id
LEFT JOIN dueno d ON d.persona_fisica_id = pf.id
LEFT JOIN empleado e ON e.id = pf.id
LEFT JOIN cliente c ON c.id = pf.id
WHERE (a.id IS NOT NULL) + (d.id IS NOT NULL) + (e.id IS NOT NULL) > 1;
```

Perfil de combinaciones reales (para ver qué roles conviven hoy):

```sql
SELECT u.rol,
       (c.id IS NOT NULL) AS cliente, (a.id IS NOT NULL) AS administrador,
       (d.id IS NOT NULL) AS dueno, (e.id IS NOT NULL) AS empleado,
       COUNT(*) AS cuentas
FROM usuario u
LEFT JOIN cliente c ON c.id = u.id
LEFT JOIN administrador a ON a.id = u.id
LEFT JOIN dueno d ON d.id = u.id
LEFT JOIN empleado e ON e.id = u.id
GROUP BY u.rol, cliente, administrador, dueno, empleado;
```

**(b) Cantidad de filas de empleado y empleado_comercio:**

```sql
SELECT 'empleado' AS tabla, COUNT(*) AS filas FROM empleado
UNION ALL SELECT 'empleado_comercio', COUNT(*) FROM empleado_comercio;

SELECT estado, COUNT(*) AS filas FROM empleado_comercio GROUP BY estado;
```

**(c) Datos que invalidarían los cambios de ENUM propuestos** (todos deberían dar 0 filas o confirmar qué hay que convertir):

```sql
SELECT 'usuario.rol=EMPLEADO' AS control, COUNT(*) AS filas FROM usuario WHERE rol = 'EMPLEADO'
UNION ALL SELECT 'token.tipo=INVITACION_EMPLEADO', COUNT(*) FROM token WHERE tipo = 'INVITACION_EMPLEADO'
UNION ALL SELECT 'notificacion INVITACION_EMPLEADO/EMPLEADO_DESACTIVADO', COUNT(*) FROM notificacion WHERE tipo IN ('INVITACION_EMPLEADO','EMPLEADO_DESACTIVADO')
UNION ALL SELECT 'historial_estado_pedido.actor_rol=EMPLEADO', COUNT(*) FROM historial_estado_pedido WHERE actor_rol = 'EMPLEADO'
UNION ALL SELECT 'historial_cierre_comercio.actor_rol=EMPLEADO', COUNT(*) FROM historial_cierre_comercio WHERE actor_rol = 'EMPLEADO'
UNION ALL SELECT 'empleado_comercio PENDIENTE (se borrarian)', COUNT(*) FROM empleado_comercio WHERE estado = 'PENDIENTE'
UNION ALL SELECT 'empleado_comercio DESACTIVADO (pasan a INACTIVO)', COUNT(*) FROM empleado_comercio WHERE estado = 'DESACTIVADO'
UNION ALL SELECT 'empleado_comercio sin empleado o sin comercio', COUNT(*) FROM empleado_comercio ec
  LEFT JOIN empleado e ON e.id = ec.empleado_id LEFT JOIN comercio c ON c.id = ec.comercio_id
  WHERE e.id IS NULL OR c.id IS NULL;

SHOW COLUMNS FROM empleado_comercio LIKE 'estado';
SHOW COLUMNS FROM usuario LIKE 'rol';
SHOW COLUMNS FROM token LIKE 'tipo';
```

Línea de estado: bloque 13 (SQL para Diego) completo.

---

## 14. Riesgos de concurrencia

Orden de bloqueo vigente del proyecto: `usuario` → `cuenta_mercado_pago` → `comercio` → pedidos/tablas hijas; las lecturas con bloqueo compartido son consultas nativas `LOCK IN SHARE MODE` (MariaDB 10.4 no entiende el `FOR SHARE` que genera Hibernate). Todo lo nuevo debe entrar en ese orden: **`usuario` (en id ascendente si son dos) → `invitacion_empleado` → `empleado_comercio` → `comercio` (compartido)**.

1. **Aceptar × cancelar × reenviar la misma invitación.** Aceptar identifica por email + código: leer las invitaciones `PENDIENTE` del email con `FOR UPDATE` (id ascendente). El que gane cambia el estado; los demás encuentran `CANCELADA`/`REEMPLAZADA`/`ACEPTADA` y responden el mismo error genérico "código incorrecto o vencido". El único parcial `uq_inv_pendiente_comercio_email` impide dos pendientes del mismo par aunque dos reenvíos corran a la vez.
2. **Dos aceptaciones del mismo código con cuenta nueva.** El lock de invitación las serializa; el resto de la protección ya existe: `crearUsuario` traduce la violación de `uq_usuario_email`/`uq_usuario_nombre_usuario`, y el DNI es único.
3. **Un mismo Empleado aceptando dos invitaciones (de comercios distintos) a la vez.** Las dos necesitan crear la fila `empleado` si no existe: tomar `usuario FOR UPDATE` antes de `existsById(empleado)`; si no, uno de los `INSERT` falla por clave primaria.
4. **Tope de 5 envíos por hora.** `COUNT` + `INSERT` tiene carrera (podrían salir 6). Tomar `usuario` del Dueño que invita con `FOR UPDATE` (entra en el orden y serializa los envíos de ese Dueño) o aceptar el exceso de uno. Recomiendo el lock del Dueño.
5. **Tope de 3 emails de regularización por día.** Mismo criterio; el exceso de 1-2 es inocuo, no justifica locks.
6. **Desactivar mientras el Empleado opera.** La resolución de la relación corre en una transacción anterior a la de la escritura. Opciones: (A) aceptar la ventana de milisegundos (la acción ocurrió "mientras estaba activo" y queda registrada con su actor); (B) en cada **escritura** re-verificar la relación dentro de la transacción con `LOCK IN SHARE MODE` sobre `empleado_comercio`, mientras que desactivar toma la misma fila `FOR UPDATE`: o la escritura confirma antes de la baja o ve `INACTIVO` y responde `404`. Recomiendo (B) para escrituras y (A) para lecturas; el costo es un lock compartido por request escritora y se centraliza en un único método.
7. **Desactivar × reactivar por reinvitación × renuncia.** Todas operan sobre la misma fila de `empleado_comercio`: `FOR UPDATE`, revisar el estado actual y no escribir una segunda fila de historial si ya está en el estado destino (idempotente, como el cierre manual).
8. **Fan-out de notificaciones.** Lee `empleado_comercio ACTIVO` sin bloqueo; un Empleado desactivado entre la lectura y el `INSERT` recibe una notificación de más (inocuo).
9. **Bloqueo de cuenta del Dueño.** `AuthService.propagarBloqueoAComercio` solo toca comercios; las relaciones no se tocan (decidido). El Empleado de un comercio `CERRADO_TEMPORALMENTE` lo ve con aviso.
10. **Login del Empleado en otro dispositivo** cierra su sesión previa (sesión única) en ambos contextos: es comportamiento actual, no un riesgo nuevo, pero hay que comunicarlo en la UI del selector.

---

## 15. Decisiones para Diego y preguntas abiertas (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| Q1 | Diseño del contexto en JWT/selector. | Diseño 1 (rol base intacto, contexto por `X-Comercio-Id`, autorización por relación, lista blanca por ruta exacta + test de clasificación). |
| Q2 | ¿Un Empleado puede comprarle a su propio comercio? | Bloquear en `agregarItem` y `confirmarPedido` (`409`): evita autoservicio de aceptar/rechazar/reembolsar sus propios pedidos y la mezcla de contextos en notificaciones. |
| Q3 | ¿Se construye "Cliente existente pasa a Dueño" y las filas `cliente` para Dueño/Admin ("Dueño o Cliente", "Admin o Cliente")? | No en esta fase. Hoy esos pares no existen; fijar con tests el `409` actual al registrar comercio con email o DNI existentes. Dejar la matriz como regla escrita para esos pares. |
| Q4 | Cuenta nueva por invitación: ¿qué datos pide y qué pasa con los Términos? | Pedir lo mismo que el registro de Cliente (incluida la dirección, porque el Cliente no puede pedir delivery sin ella y no hay CRUD de direcciones) más aceptación de Términos y Condiciones; sumar un campo `aceptaTerminos` validado en backend (hoy solo frontend). Confirmar si el alta por invitación pide dirección o si se pospone con el CRUD de direcciones. |
| Q5 | ¿El código de la invitación verifica el email (cuenta nueva `ACTIVO` sin pasar por `VERIFICACION_EMAIL`)? | Sí: se envía solo a ese email y es la misma prueba de control. |
| Q6 | "Comercio no operativo sin operar" vs. entregar pedidos en `SUSPENDIDO`. | Guard de servidor para Empleado (409) en escrituras de comercio no operativo, con excepción de `entregar` sobre `LISTO_PARA_RETIRAR`; decidir en fase aparte si se aplica también al Dueño. |
| Q7 | ¿Qué estados ve el Empleado en el selector? ¿Se puede invitar a un comercio no aprobado? | Selector: operativos + `SUSPENDIDO` + `CERRADO_TEMPORALMENTE` con aviso; fuera `INACTIVO`, `RECHAZO_DEFINITIVO`, `PENDIENTE`, `RECHAZADO`. Invitar solo con comercio operativo. |
| Q8 | Historial de la relación: ¿incluye los eventos de invitación? | Sí, con FK nullable a invitación (DDL de la sección 12). Alternativa: solo transiciones de la relación y que la invitación lleve su propio ciclo de vida. |
| Q9 | Contador de 3 emails de regularización por día. | Reutilizar `notificacion` (`canal = EMAIL`) para no sumar tabla; filtrar `canal = 'PUSH'` en listados. Si prefiere pureza, tabla mínima. |
| Q10 | Fallos de código por (email, código): ¿se cuentan sobre todas las invitaciones pendientes del email? Riesgo de DoS (alguien que conozca el email puede invalidarlas con 5 intentos). | Aceptar el precedente de verificación/recuperación (el Dueño reenvía); no sumar controles por IP. |
| Q11 | ¿Aviso al Dueño cuando acepta una invitación? | Sí, notificación operativa al Dueño (`EMPLEADO_DESACTIVADO` no aplica; usar `INVITACION_EMPLEADO`, que ya existe, dirigida al Dueño). Confirmar. |
| Q12 | ¿El nombre del actor del pedido lo ve también el Cliente? | No: solo el panel del comercio (Dueño y Empleados). |
| Q13 | ¿`PEDIDO_AUTOCONFIRMADO_COMERCIO` (T30) se emite? | Hoy no se emite a nadie; decidir si se suma como parte de esta fase o queda fuera. |
| Q14 | ¿La relación se reactiva automáticamente al aceptar una reinvitación de un ex Empleado? | Sí (decidido: reinvitar reutiliza la misma fila); validar en la aceptación que la persona siga cumpliendo la matriz de roles. |
| Q15 | Documentos a actualizar al implementar. | `diccionario-de-datos.md` (`EmpleadoComercio` sin `PENDIENTE`, tabla de relaciones sin "mutuamente excluyente"), `CLAUDE.md` §1bis/§3/§5/§7, alcance y limitaciones. |

---

## 16. Plan de fases sugerido (no se implementa nada en esta auditoría)

1. **E1 — Esquema y modelo:** V29-V32, entidades/repositorios/enums, test de esquema.
2. **E2 — Invitación y acceso:** endpoints públicos de validar/aceptar, envío y emails, límites, matriz de roles, `GET /empleados/mis-comercios`, resolver de actor y lista blanca en `SecurityConfig` con el test de clasificación.
3. **E3 — Operación delegada:** DTO de perfil reducido, actor dinámico en `PedidoService`/`CierreComercioService`, guard de estado, actividad, notificaciones con fan-out y filtro del Cliente.
4. **E4 — Equipo y administración:** gestión del equipo del Dueño (reenviar, cancelar, desactivar, historial), renuncia, "Ver equipo" del Admin.
5. **E5 — Frontend:** contexto en `api.js`, selector de contexto, ocultamientos, `invitacion-empleado.html`, botón del login, pantalla "Ya no tenés acceso".
6. **E6 — Pruebas:** specs 35-40, builder Newman `9a`, estrés, tests Java, actualización de `403`→`404` donde corresponda.

Línea de estado: auditoría completa; informe listo para revisión de Diego.

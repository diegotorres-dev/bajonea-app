# Auditoría corta del tramo E1 — Rol Empleado: esquema e invitaciones (solo lectura)

Fecha: 2026-10-05. Alcance: relevamiento del código real (backend, frontend, pruebas) y de `bajonea_test` (MariaDB 10.4.32, Flyway hasta `V28`, consultas de solo lectura) para codificar E1. No se modificó ningún archivo salvo este informe, no se aplicó DDL, no se tocó `bajonea_practicas3` y no hay contraseñas de prueba. Todo código que aparece abajo es una **firma propuesta**, sin comentarios.

Base de lectura: `docs/DECISIONES.md` (entradas del 05/10/2026), `docs/entregables-01-02/AUDITORIA-EMPLEADO-FASE1.md` y `CLAUDE.md`. Regla: "gana el código"; las diferencias están en la sección 0.

---

## 0. Hallazgos que contradicen lo decidido o la documentación

| # | Hallazgo | Evidencia | Impacto en E1 |
|---|---|---|---|
| E1-1 | **Los Términos y Condiciones del registro de Cliente no se validan en el servidor** y el campo `aceptaTerminos` ni siquiera existe en el DTO. Hoy un `POST /auth/registro/cliente` sin el campo da `201` (Jackson ignora propiedades desconocidas, el default de Spring Boot) y hay una prueba de Newman que **exige** ese comportamiento. | `RegistroClienteRequestDTO.java`; `registro-cliente.html:147`; `auth.js` (la casilla solo bloquea el paso); `build-matriz-cliente-postman.mjs:255` ("sin aceptaTerminos (campo solo frontend, backend debe aceptar igual)") | Decisión 11 pide validarlo en el alta por invitación. Si se unifica, hay que tocar frontend, Playwright, Newman y estreses (sección 2). Pregunta Q1. |
| E1-2 | **Los cuatro estados visibles de la invitación (Activo, Inactivo, Pendiente, Vencida) no cubren `INVALIDADA`** (5 intentos fallidos), que sí está en el DDL aprobado de `V30`. | `AUDITORIA-EMPLEADO-FASE1.md` §12 (V30) vs decisión 13 | "Ver equipo" necesita mostrar algo para una invitación invalidada. Pregunta Q4. |
| E1-3 | **Las filas de regularización (`notificacion` con `canal = EMAIL`) aparecerían en la campana del titular desde E1**, no desde E3: el listado y el contador del Cliente traen todas las filas del usuario sin mirar el canal. | `NotificacionRepository.findByUsuarioIdOrderByFechaCreacionDesc` y `countByUsuarioIdAndLeidaFalse` (usados por `NotificacionService.listar/contarNoLeidas` cuando no hay comercio activo) | Hay que filtrar `canal = 'PUSH'` en esas dos consultas dentro de E1 (lista completa en la sección 4). |
| E1-4 | **Una respuesta `409` no puede deshacer lo que justamente tiene que quedar guardado.** Al invitar a una cuenta no apta, el Dueño recibe un `409` genérico pero la fila de `notificacion` (`EMAIL`) tiene que persistir para que el tope de 3 por día cuente. Igual el contador de intentos fallidos del código. Con el rollback por defecto de Spring ambos se perderían. | `AuthService` ya lo resolvió con `noRollbackFor` de clase (hallazgo del Tramo 16.11) | Hay que usar `noRollbackFor` **por excepción específica** (no de clase) y ordenar todas las validaciones antes de cualquier escritura (sección 5). |
| E1-5 | **Riesgo de interbloqueo en el orden de bloqueo que propuso la auditoría de la Fase 1 (§14.4).** Invitar toma `usuario` del Dueño `FOR UPDATE` y después escribe en `invitacion_empleado`; aceptar bloquea la invitación y recién después inserta la notificación al Dueño, cuya clave foránea toma un bloqueo compartido sobre la misma fila de `usuario` del Dueño. Son dos transacciones que se esperan mutuamente. | Análisis sobre `NotificacionService.crear` (`getReferenceById` + `INSERT` con FK a `usuario`) y el patrón ya documentado en `docs/APRENDIZAJES-TECNICOS.md` | Aceptar tiene que tomar la fila del Dueño (compartida) **antes** de bloquear la invitación (sección 5). Cierra el escenario S3 del estrés. |
| E1-6 | **Los límites por IP de los endpoints públicos no funcionarían en producción tal como está el backend.** No hay `server.forward-headers-strategy` en ningún `application*.properties`, así que detrás del proxy de Railway `request.getRemoteAddr()` es la IP del proxy y todos los clientes comparten el mismo contador. Además `RateLimitFotoRegistroFilter` está atado a dos rutas fijas y comparte un solo contador por IP. | `grep` de `forward-headers`/`X-Forwarded` (sin resultados); `RateLimitFotoRegistroFilter.java:54` | Hay que generalizar el filtro y decidir la configuración del proxy (Q8). Mismo defecto de datos hoy en `Sesion.ip_origen`. |
| E1-7 | **El asistente de registro de Cliente no es reutilizable tal cual**: vive entero dentro de `initRegistroCliente()` en `auth.js` (unas 220 líneas con ids fijos de `registro-cliente.html`). El de Comercio sí se había extraído a `comercio-form.js`. | `auth.js:375-595` | Entrega B necesita extraer un `cliente-form.js` compartido antes de armar `invitacion-empleado.html` (sección 8). |
| E1-8 | **La foto de perfil se sube a Cloudinary antes de crear la cuenta** (carpeta `usuarios/pre-registro/`, firma pública con límite de 5 por minuto por IP compartido con el registro de Comercio). Si el alta falla después de subirla queda una imagen huérfana. | `cloudinary.js:89`, `CloudinaryService.generarFirmaFotoPerfilRegistroCliente` | El alta por invitación hereda el mismo comportamiento; no hace falta endpoint nuevo. |
| E1-9 | `usuario.email_verificado` existe en la base (`NOT NULL DEFAULT 0`) pero **ninguna entidad ni servicio lo usa**: la verificación solo pasa `estado` a `ACTIVO`. | `Usuario.java`; `SHOW CREATE TABLE usuario` | La cuenta nueva por invitación nace `ACTIVO` (el código prueba el email); la columna sigue en `0` como en todas las cuentas. Sin cambios. |
| E1-10 | `dueno.id`, `persona_juridica.id`, `persona_fisica.id` y `usuario.id` del Dueño **son el mismo número** (una sola `Persona` cuelga de las dos ramas). | `RegistroService.registrarComercio` | La matriz de roles se puede leer con `existsById(usuarioId)` sobre `administrador`, `dueno`, `empleado` y `cliente`, sin joins. |
| E1-11 | Registrar un comercio con el email o el DNI de un Empleado (activo o ex Empleado) **ya da `409`** hoy, sin código nuevo: el email y el DNI son únicos globales. | `RegistroService.registrarComercio`; `uq_usuario_email`; `uq_persona_fisica_dni` | La regla "un ex Empleado no puede registrar un comercio" se cumple sola; en E1 solo se agregan pruebas que la fijen (hallazgo H2 de la auditoría anterior, confirmado). |
| E1-12 | **No hace falta tocar `SecurityConfig` para los endpoints del Dueño**: `/api/v1/comercios/**` ya es `hasRole("DUENO")`. Solo hay que agregar **dos rutas exactas** a `RUTAS_PUBLICAS` y la palabra `equipo` a la expresión regular `RUTAS_DEL_DUENO` de `api.js`. | `SecurityConfig.java` (matchers en `securityFilterChain`, línea 109); `api.js:9` | Menos superficie de cambio en seguridad en E1 (la lista blanca llega en E2). |
| E1-13 | **El DDL aprobado de `V29` a `V32` no necesita cambios**: ni el código ni la base de `bajonea_test` lo contradicen. Se revisaron los índices únicos con columna generada (el mismo patrón que `V27`, que funciona en 10.4.32), los tamaños de clave de los dos únicos parciales y los motivos del historial. | `V27`, `V9`, `SHOW CREATE TABLE` de `empleado_comercio` y `notificacion` | Se aplican tal cual (sección 12). |

Contexto verificado en `bajonea_test`: `empleado` y `empleado_comercio` tienen 0 filas y el último Flyway aplicado es el 28. `bajonea_practicas3` no se consultó: las consultas de lectura previas a `V29` están en la sección 13 de la auditoría de la Fase 1 y las corre Diego.

Línea de estado: bloque 0 (hallazgos) completo.

---

## 1. Registro de Cliente actual y qué se reutiliza

**Campos del request** (`RegistroClienteRequestDTO`, validaciones solo acá, nunca en entidades):

| Campo | Validación |
|---|---|
| `nombre`, `apellido` | `@NotBlank`, `@ValidarFormatoNombre`, `@Size(max = 100)`; el setter colapsa espacios |
| `dni` | `@NotBlank`, `@ValidarFormatoDni`; el setter quita puntos, guiones y espacios |
| `fechaNacimiento` | `@NotNull`, `@ValidarFechaNacimientoPlausible` |
| `telefono` | `@NotBlank`, `@ValidarTelefonoArgentino`, `@Size(max = 30)` |
| `nombreUsuario` | `@NotBlank`, `@ValidarNombreUsuario`, `@Size(max = 20)`; el setter normaliza a minúsculas (`NombreUsuarioPolicy`) |
| `email` | `@NotBlank`, `@ValidarFormatoEmail`, `@Size(max = 254)`; el setter hace `trim` y minúsculas |
| `password` | `@NotBlank`, `@ValidarPasswordSegura` |
| `direccion` | `@NotNull @Valid DireccionRequestDTO` (`calle`, `numero`, `pisoDepto` opcional, `codigoPostal`, `localidadId`, `principal`) |
| `fotoPerfilUrl` | opcional, `@ValidarUrlCloudinary`, `@Size(max = 500)` |

**Qué hace el servicio** (`RegistroService.registrarCliente`, una transacción): valida email único, nombre de usuario disponible y DNI único (`409` con mensaje propio cada uno), resuelve la localidad, crea `Usuario` (`CLIENTE`, `PENDIENTE`) → `Persona` → `PersonaFisica` → `Cliente` → `Direccion` (principal) y manda el código de verificación. Los nombres y la calle se normalizan con `TextoUtils.aTitleCase`. Una carrera sobre el email o el nombre de usuario se traduce con `saveAndFlush` más captura de `uq_usuario_*`.

**Frontend:** dos pasos dentro de la misma página (datos personales con foto opcional, nombre de usuario con disponibilidad en vivo, contraseña con medidor y confirmación, casilla de Términos; después dirección con selector Provincia → Localidad). La foto se recorta localmente (`crop.js`), queda en memoria y recién al enviar se pide la firma pública `POST /auth/registro/cliente/foto-firma`, se sube directo a Cloudinary y se manda la URL.

**Términos y Condiciones hoy:** casilla en el frontend que bloquea el paso 1; no se envía ni se guarda; la etiqueta es un `<span class="link">` sin destino (no existe ninguna página de términos).

**Reutilización para el alta por invitación**

| Pieza | Estado | Qué hacer |
|---|---|---|
| Campos y validaciones del DTO | Reutilizables | Extraer una clase base `DatosClienteRequestDTO` (todo menos `email` y `aceptaTerminos`) y que `RegistroClienteRequestDTO` la extienda. Precedente exacto: `RegistroComercioRequestDTO extends DatosNegocioComercioRequestDTO`; el JSON del registro no cambia. |
| Cadena de inserción `Usuario → … → Direccion` | Reutilizable | Extraer de `registrarCliente` un método interno `crearClienteActivable(datos, email, estadoInicial)` que devuelva el `Cliente`; `registrarCliente` lo llama con `PENDIENTE` y manda el código de verificación; el alta por invitación lo llama con `ACTIVO` y no manda nada. |
| Chequeos de unicidad (`validarEmailUnico`, nombre de usuario, DNI, localidad) | Reutilizables | Mismos mensajes y mismas excepciones. |
| Firma pública de foto y subida | Reutilizable sin cambios | `POST /auth/registro/cliente/foto-firma` ya es público. |
| Wizard del frontend | **No reutilizable tal cual** (E1-7) | Extraer `js/cliente-form.js` (datos personales, dirección, foto, términos) con los mismos ids y `data-testid`, para que `registro-cliente.html` y `invitacion-empleado.html` lo compartan. |
| `bindNombreUsuario`, `crearInputOtp`, `initGeografiaSelects`, validadores, `abrirEditorRecorte`, `showToast` | Reutilizables | Ya son funciones exportadas. |

Línea de estado: bloque 1 (registro de Cliente) completo.

---

## 2. Unificación de Términos y Condiciones: impacto exacto

**Propuesta técnica.** En la clase base nueva, `Boolean aceptaTerminos` con `@NotNull` y `@AssertTrue` (los dos: `@AssertTrue` solo deja pasar `null`) y mensaje "Tenés que aceptar los Términos y Condiciones". Validación en el DTO, como el resto: los servicios no cambian y las pruebas de Java que llaman a `RegistroService` directo no pasan por Bean Validation.

**Qué falla si el servidor lo exige en `/auth/registro/cliente`** (y qué no):

| Capa | Sitios que registran clientes | Falla si no se toca | Cómo arreglarlo |
|---|---|---|---|
| Frontend | `auth.js` arma el `payload` sin el campo | Todo registro real de Cliente da `400` | Una línea: `aceptaTerminos` leído de la casilla. Como Jackson ignora campos desconocidos, el frontend puede salir antes que el backend sin romper nada. |
| Playwright, API | `tests/helpers/backend.ts:265` (`registrarCliente`, usado por `registrarYVerificarCliente` en 26 specs: 01, 02, 04, 05, 08, 10, 11, 12 y 16 a 33) y `tests/19-nombre-usuario.spec.ts:180` (`registroCrudo`, 8 tests de "Registro por API") | Casi toda la suite (desde el `beforeAll` de cada spec) | Agregar `aceptaTerminos: true` en el helper y en `registroCrudo` (**2 sitios**). |
| Playwright, UI | `01-registro-y-verificacion` (sitios 73, 122, 303, 322) y `19-nombre-usuario` (267, 403) | **Nada**: ya tildan `input-acepta-terminos` porque el frontend lo exige | Sin cambios. No hay ninguna prueba de UI del caso "sin aceptar". |
| Newman, constructores | `build-matriz-cliente-postman.mjs` (función `req` → `adaptarAutenticacion`, que ya inyecta `nombreUsuario` en esa ruta), `build-matriz-comercio-postman.mjs` (línea 507, mismo adaptador), y un cuerpo propio en cada uno de `build-multicomercio-tramo2a` (129), `3a` (114), `5a` (152), `6a` (176) y `7a` (158) | Todos los `201` esperados | Una línea en `adaptarAutenticacion` de los dos constructores `matriz-*` cubre 66 de las 67 requests de la carpeta 22 y las de las carpetas 24 a 30, 41, 42, 46 y 47; 5 edits puntuales en los constructores de tramo. |
| Newman, colección | 94 requests `POST /auth/registro/cliente` en total (carpeta 22: 67; resto: 27). Las carpetas **02** (2) y **09** (4) no tienen constructor | Idem | Edición directa del JSON o un script de un solo uso para esas 6; más el cuerpo del `pm.sendRequest` de la carrera de la carpeta 46 (`build-matriz-cliente-postman.mjs:719`). |
| Newman, expectativa a invertir | `Registro Cliente - sin aceptaTerminos (campo solo frontend, backend debe aceptar igual)` (`build-matriz-cliente-postman.mjs:255`) | Pasa de `201` a `400` | Reescribir la request como negativa (`400`, campo `aceptaTerminos`) y sumar una con `false`. |
| Estreses | `stress-locks-tramo5a.mjs:105`, `stress-locks-tramoC1.mjs:106`, `stress-locks-tramoC2.mjs:106` (`stress-locks-tramoC3` y `tramo2a` no registran clientes) | `registro cliente` lanza error | 3 edits de una línea. |
| Tests de Java | `MercadoPagoCuentaUnicaIntegrationTest`, `NotificacionesPorComercioIntegrationTest`, `TokenColisionIntegrationTest`, `TokenEspacioLlenoIntegrationTest` (JSON → DTO → `registroService` directo) y `NombreUsuarioTest` | **Nada** (no pasan por `@Valid`) | Sin cambios; sumar tests propios del campo. |
| Documentación | Hallazgo H11 de la auditoría de la Fase 1, `CLAUDE.md`, `docs/DECISIONES.md`, `alcance-y-limitaciones.md` | — | Anotar el cambio. |

Resumen: **unos 14 sitios de código a editar a mano** (1 frontend, 2 Playwright, 2 adaptadores de los constructores `matriz-*`, 5 constructores de tramo, 3 estreses y 1 cuerpo de carrera dentro de Newman) más las 6 requests de las carpetas 02 y 09, y **regenerar la colección**; ninguna prueba de UI ni de Java se rompe. El riesgo es de mecánica, no de lógica.

**Qué no resuelve:** la aceptación sigue sin persistirse (no existe columna) y no hay página de Términos. **Actualización 2026-10-06 (decisión de Diego):** se valida y NO se guarda, y no se planea guardarla ni crear una página de Términos ni versionarlos: no es un requisito del proyecto, y estar registrado da por aceptados los términos. No es una limitación pendiente. La validación en el servidor del registro de Cliente ya está hecha (bloque A0, sin la clase base `DatosClienteRequestDTO`, que queda para el bloque A3).

Línea de estado: bloque 2 (unificación de Términos y Condiciones) completo.

---

## 3. Atajo de test para tokens y códigos

**Cómo funciona hoy.** `TestController` (`@Profile("test")`, ruta `/api/v1/test/**` pública en `RUTAS_PUBLICAS` pero que **no existe fuera del perfil `test`**: sin bean no hay ruta) expone `GET /test/token-verificacion?email=` y `GET /test/token?email=&tipo=` (cualquier `TipoToken`). `TestSupportService.obtenerTokenPendiente` busca el `Usuario` por email y devuelve el último `Token` `PENDIENTE` del tipo pedido. Playwright lo usa vía `obtenerCodigoTest`; Newman, con una request previa que guarda la variable de entorno. `application-test.properties` apaga el envío (`email.envio-habilitado=false`): `EmailService` solo escribe en el log destinatario y asunto, **nunca el cuerpo**.

**Qué hace falta para invitaciones.** El atajo actual no sirve: lee `token` por `usuario_id` y el invitado puede no tener cuenta. Nuevos, solo bajo `@Profile("test")` en `TestController`/`TestSupportService`:

| Atajo | Para qué |
|---|---|
| `GET /api/v1/test/invitaciones-empleado/codigo?email=&comercioId=` | Devuelve el código de la invitación `PENDIENTE` más reciente de ese par (el código va en texto plano en la tabla). Lo usan Playwright y Newman. |
| `PUT /api/v1/test/invitaciones-empleado/{id}/vencer` | Deja `fecha_vencimiento` en el pasado, para probar "vencida" sin esperar 7 días. |
| `GET /api/v1/test/emails-regularizacion/cantidad?email=` | Cantidad de filas `canal = EMAIL` del destinatario en las últimas 24 horas (no hay otra forma de observar el envío). |

Los tests de Java no necesitan nada de esto: sus pruebas de integración ya reemplazan `EmailService` con `@MockitoBean` (patrón de `NotificacionesPorComercioIntegrationTest`), de modo que el contenido del email (código, enlace, motivo) se verifica ahí con un `ArgumentCaptor`. Playwright también puede leer o modificar filas con `sqlTest`, pero Newman no, y por eso se agregan los endpoints.

Línea de estado: bloque 3 (atajo de test) completo.

---

## 4. Emails, notificaciones y tope de regularización

**Servicio.** `EmailService` (Resend, `com.resend:resend-java`): métodos con asunto y cuerpo de **texto plano** (`enviarVerificacion`, `enviarRecuperacionPassword`, `enviarReactivacionCuenta`) sobre un `enviarTextoPlano` privado que nunca relanza excepciones. Remitente de `mail.from` (`info@bajonea.ar` en producción); el bean `Resend` sale de `MailConfig` con `resend.api-key`. Con `email.envio-habilitado=false` no se llama a Resend.

**Propiedad de URL base.** `app.frontend-base-url` ya existe (`FRONTEND_BASE_URL`; default `http://localhost:5501`, `https://bajonea.ar` en `application-production.properties`). El enlace del email es `{app.frontend-base-url}/invitacion-empleado.html`, sin código ni email. El `Caddyfile` (`try_files {path} {path}.html`) y el servidor de desarrollo de Playwright (puerto 5501) sirven ese archivo sin configuración nueva.

**Dónde enchufar.** Dos métodos nuevos en `EmailService` (misma firma de estilo): `enviarInvitacionEmpleado(destinatario, nombreComercio, codigo, vencimiento)` y `enviarRegularizacionInvitacion(destinatario, motivo, nombreComercio)`. Los llama el servicio de invitaciones **después** de escribir (dentro de la transacción es aceptable porque el envío no falla hacia afuera; lo más prolijo es mandarlo al confirmar con `TransactionSynchronization`, como hace `ReembolsoService` después del commit, para no mandar un código de una transacción que luego se revierte).

**Cómo se prueban sin mandar emails reales.** Java: `@MockitoBean EmailService` con captor. `EmailServiceTest` ya cubre el log con el envío apagado (3 pruebas): sumar 3 para las plantillas nuevas (que el cuerpo lleve código y enlace, que el log no filtre el cuerpo). Playwright y Newman: perfil `test` + los atajos de la sección 3.

**Tope de 3 emails de regularización por día.** Se cuenta en `notificacion` con `tipo = INVITACION_EMPLEADO`, `canal = EMAIL`, `usuario_id` = destinatario (la fila exige `usuario_id`, y solo hay regularización cuando la cuenta ya existe). Ventana de 24 horas corridas desde `LocalDateTime.now()` en Java (mismo criterio que los 30 días corridos del nombre de usuario; la zona horaria depende de la JVM, limitación ya documentada). El `estado` de la fila se guarda `ENVIADO`: `EmailService` no devuelve resultado, así que significa "se intentó". Índice existente `idx_notificacion_usuario_leida (usuario_id, leida)` alcanza para filtrar por usuario.

**Consultas y contadores de notificaciones que hay que revisar por el canal.** Se listaron todas (las 7 consultas propias de `NotificacionRepository`, la última nativa y agrupada, más el `findById` de `marcarLeida`):

| Consulta | Quién la usa | ¿Ve filas `EMAIL`? | Acción en E1 |
|---|---|---|---|
| `findByUsuarioIdOrderByFechaCreacionDesc` | `NotificacionService.listar` (Cliente y Administrador, sin comercio activo) | **Sí** (`entidad_tipo` nulo no la excluye) | Agregar `canal = PUSH` |
| `countByUsuarioIdAndLeidaFalse` | `NotificacionService.contarNoLeidas` (idem) | **Sí** | Agregar `canal = PUSH` |
| `findByUsuarioIdAndLeidaFalse` | Nadie (sin uso) | Sí | Borrarla o filtrarla; no tiene llamadores |
| `findByUsuarioIdAndComercioId` | `listar` del Dueño con header | No (filtra por `entidad_tipo` + `entidad_id`; la fila de regularización no lleva entidad) | Sin cambio; opcional sumar el canal por defensa |
| `countNoLeidasByUsuarioIdAndComercioId` | `contarNoLeidas` del Dueño | No | Idem |
| `marcarLeidasByUsuarioIdAndComercioId` | pantallas de estado del Dueño | No | Idem |
| `contarNoLeidasPorComercio` (nativa) | `MisComerciosService` (`mis-comercios`) | No | Idem |
| `marcarLeida(id)` (`findById` + dueño) | `PUT /notificaciones/{id}/leida` | Solo si el usuario adivina el id | Sin cambio |

El frontend no recibe `tipo` ni `canal` (`NotificacionResponseDTO` solo trae mensaje, leída, fecha y entidad), así que no hay nada que ocultar del lado del cliente. Las filas `PUSH` nacen `PENDIENTE` y nunca pasan a `ENVIADO`; el estado de las filas push hoy no significa nada.

**Aviso al Dueño cuando el invitado acepta.** `notificacionService.crear(duenoId, mensaje, INVITACION_EMPLEADO, COMERCIO, comercioId)` con canal `PUSH`: queda bajo el comercio en el selector del Dueño sin tocar las consultas.

Línea de estado: bloque 4 (emails y notificaciones) completo.

---

## 5. Entidades, repositorios, alta en una transacción y orden de bloqueo

**Estado real.** No hay entidad ni repositorio de `Empleado`, `EmpleadoComercio`, invitaciones ni historial (confirmado con `grep`). Las tablas `empleado` y `empleado_comercio` existen con 0 filas.

**Piezas nuevas (nombres propuestos).**

| Tipo | Elementos |
|---|---|
| Enums | `EstadoEmpleadoComercio{ACTIVO, INACTIVO}`, `EstadoInvitacionEmpleado{PENDIENTE, ACEPTADA, CANCELADA, REEMPLAZADA, VENCIDA, INVALIDADA}`, `MotivoHistorialEmpleado{INVITACION, ACEPTACION, INVITACION_CANCELADA, BAJA_DUENO, RENUNCIA, REACTIVACION}` (`RolUsuario` y `TipoToken` no se amplían) |
| Entidades | `Empleado` (mismo molde que `Cliente`: `@MapsId` sobre `PersonaFisica`, más `fechaCreacion`), `EmpleadoComercio` (`@ManyToOne` a `Empleado` y `Comercio`, `@Enumerated(EnumType.STRING)` sobre el ENUM nativo, `fechaAlta`, `fechaBaja`; el `UNIQUE` `uq_empleado_comercio` ya existe), `InvitacionEmpleado`, `HistorialEmpleadoComercio`. `ActividadComercio` se mapea en E3. |
| Repositorios | `EmpleadoRepository`, `EmpleadoComercioRepository`, `InvitacionEmpleadoRepository`, `HistorialEmpleadoComercioRepository`, y `InvitacionInsercionRepository` (JDBC) |
| Servicios | `MatrizRolesService`, `InvitacionEmpleadoService` (invitar, reenviar, cancelar, validar, aceptar, listar equipo), `InvitacionRegularizacionService` (tope y email) |

**Mapeo del ENUM nuevo y `ddl-auto=validate`.** Hibernate no compara los miembros de un ENUM de MariaDB (`EstadoComercio` ya funciona así). La migración `V29` y el enum Java `EstadoEmpleadoComercio` tienen que salir en el mismo release: si hubiera una fila con `DESACTIVADO` y el enum Java no la declara, la carga falla en tiempo de ejecución. `empleado_comercio` está vacía por construcción, y `V29` hace el cambio en tres pasos (ampliar, convertir, reducir), igual que `V9`.

**Insertar el código de forma segura.** El `UNIQUE` `uq_inv_pendiente_email_codigo` puede chocar (dos invitaciones pendientes al mismo email con el mismo código). Un `save` de JPA que choque marca la transacción como solo-rollback; por eso el proyecto ya tiene `TokenInsercionRepository` (JDBC + `DuplicateKeyException` + reintento, y `TokenRollbackOnlyIntegrationTest` que documenta el bug). `InvitacionInsercionRepository` repite ese patrón y reutiliza `CodigoTokenGenerador` (código de 6 dígitos con `SecureRandom`).

**Alta por invitación con cuenta nueva: una sola transacción.** Orden de escritura (todas las validaciones antes de la primera escritura):

1. `Usuario` (`CLIENTE`, `ACTIVO`, `intentosFallidos = 0`, `saveAndFlush` con la misma traducción de `uq_usuario_email` y `uq_usuario_nombre_usuario`).
2. `Persona` → `PersonaFisica` (nombre y apellido en Title Case, DNI, nacimiento, teléfono) → `Cliente` → `Direccion` principal.
3. `Empleado` (`@MapsId` de la misma `PersonaFisica`).
4. `EmpleadoComercio` (`ACTIVO`) o reactivación de la fila existente (`INACTIVO` → `ACTIVO`, `fecha_baja` en `NULL`).
5. Invitación `ACEPTADA` (`usuario_aceptante_id`, `fecha_resolucion`).
6. Historial: `ACEPTACION` (y `REACTIVACION` si se reutilizó la fila).
7. Notificación al Dueño.

Con cuenta existente se salta el paso 1 y el 2.

**Orden de bloqueo propuesto** (ajustado respecto de la auditoría anterior, ver E1-5): `usuario` en id ascendente (modo `FOR UPDATE` para el que muta, compartido para el que solo se referencia) → `invitacion_empleado` (`FOR UPDATE`, id ascendente) → `empleado_comercio` (`FOR UPDATE`) → `comercio` (`LOCK IN SHARE MODE`, con la misma consulta nativa que ya existe para el estado).

- **Invitar y reenviar:** `usuario` del Dueño `FOR UPDATE` (serializa el tope de 5 por hora de ese Dueño; contiende con su login, que ya toma la misma fila, sin riesgo) → lee el estado del comercio con bloqueo compartido → marca como `VENCIDA` las pendientes vencidas del par y, en el reenvío, la anterior como `REEMPLAZADA` → cuenta los envíos de la última hora → inserta.
- **Cancelar:** `usuario` del Dueño en modo compartido (`leerIdConBloqueoCompartido`, por la FK del historial) → invitación `FOR UPDATE` → historial.
- **Aceptar:** (a) lectura **sin** bloqueo de las invitaciones pendientes del email para conocer al Dueño y al comercio; (b) `usuario` del invitado (si existe) y del Dueño, ambos tomados en id ascendente; (c) invitaciones pendientes del email `FOR UPDATE` y se re-evalúan código, vigencia e intentos; (d) `empleado_comercio`; (e) estado del comercio; (f) escrituras. Con cuenta nueva no hay fila de `usuario` del invitado que bloquear: alcanza con el bloqueo de la invitación para serializar dos aceptaciones del mismo código, y la restricción única del email cubre el resto.

**Por qué el orden de aceptar evita el interbloqueo.** Aceptar tiene que tener la fila del Dueño antes de la invitación, igual que invitar; así ningún camino espera la invitación mientras sostiene la fila del Dueño en el sentido opuesto. Es la misma regla que ya documenta el proyecto para el bloqueo de cuenta (`usuario` antes que `comercio`).

**Qué excepciones no deshacen la transacción** (E1-4): el servicio no usa `noRollbackFor` de clase. Define dos subclases propias, `CodigoInvitacionInvalidoException` (mapea a `401`, extiende `CredencialesInvalidasException`) e `InvitacionNoAptaException` (mapea a `409`, extiende `ConflictoDeNegocioException`), y las declara en `noRollbackFor` solo de `validar`, `aceptar` e `invitar`. Los contadores y la fila de regularización se escriben antes de lanzar, y ninguna escritura de negocio ocurre antes de la última validación.

Línea de estado: bloque 5 (entidades, transacción y bloqueos) completo.

---

## 6. Matriz de roles: dónde se valida y con qué mensajes

**Componente.** `MatrizRolesService.capacidadesDe(usuarioId)` devuelve qué filas de subtipo existen (`administrador`, `dueno`, `cliente`, `empleado`) y se apoya en `existsById` por el id del usuario (E1-10). No lee `usuario.rol` (es una sola columna y no tiene multirol real).

**Puntos de enchufe.**

| Momento | Regla | Respuesta |
|---|---|---|
| **Invitar** | Si el email pertenece a un Dueño o a un Administrador, o a una cuenta que no esté `ACTIVO` | `409` con el mensaje único **"No se puede invitar a este email"** (sin decir por qué). No se crea la invitación. Si la cuenta existe y no es de Dueño ni Administrador (bloqueada, suspendida, inactiva, sin verificar) se manda además el email de regularización dentro del tope de 3 por día. A Dueños y Administradores nunca se les manda nada. |
| **Invitar (ya es del equipo)** | Relación `ACTIVO` con ese comercio | `409` "Esa persona ya es parte de tu equipo". Es dato del propio Dueño, no filtra nada ajeno. |
| **Invitar (ya hay una vigente)** | Existe una pendiente del mismo par | `409` "Ya hay una invitación pendiente para ese email. Podés reenviarla." |
| **Aceptar** | Se **revalida** con el estado de ese momento: la cuenta existente tiene que ser `CLIENTE`, `ACTIVO` y sin filas de `dueno` o `administrador` | Quien llegó acá probó el código, así que se le puede contestar con motivo: `409` con el texto de regularización que corresponda (bloqueada, suspendida, inactiva, sin verificar) o `409` "No se puede aceptar esta invitación con esta cuenta" para rol incompatible. Estado del comercio: Q5. |
| **Registrar comercio** | Email o DNI de un Empleado o ex Empleado | Ya da `409` por unicidad (E1-11); no hay código nuevo. Solo pruebas. |
| **Registrar cliente / nueva cuenta por invitación** con DNI de otra persona | `existsByDni` | `409` "Ya existe una cuenta registrada con ese DNI" (el mismo mensaje y la misma filtración de DNI que tiene hoy el registro). |

**Errores existentes que se reutilizan:** `ConflictoDeNegocioException` (`409`), `CredencialesInvalidasException` (`401`, con `data`), `ValidacionException` (`400`), `RecursoNoEncontradoException` (`404`). Se agregan solo las dos subclases de la sección 5. Los mensajes del paso de regularización repiten los de `MENSAJES_LOGIN_CONFLICTO` del login para no inventar un tercer vocabulario.

**Pares sin mecanismo.** "Dueño o Cliente" y "Administrador o Cliente" siguen siendo regla escrita, sin construir (decisión 2). `MatrizRolesService` ya queda con la forma para sumarlos.

Línea de estado: bloque 6 (matriz de roles) completo.

---

## 7. Endpoints propuestos de E1

Convenciones del proyecto: cuerpo `ApiResponse<T>` (`mensaje` + `data`) siempre, `201` al crear, `409` para reglas de negocio, `401` para códigos incorrectos (precedente de verificación y recuperación), `404` idéntico para recurso ajeno o inexistente. Los del Dueño usan `X-Comercio-Id` obligatorio vía `ComercioActivo` (como el resto de la operación del Dueño) y quedan cubiertos por el matcher `/api/v1/comercios/**` → `hasRole("DUENO")`: sin header o no numérico `400`, comercio ajeno o inexistente `404`, rol distinto de Dueño `403`.

### 7.1 Dueño (seguridad: `DUENO`, ya cubierta)

| Verbo y ruta | Entrada | Salida | Códigos |
|---|---|---|---|
| `POST /api/v1/comercios/equipo/invitaciones` | `{ email }` (mismas validaciones y normalización que el registro) | `InvitacionEmpleadoResponseDTO { id, email, estado, fechaCreacion, fechaVencimiento }`, mensaje "Invitación enviada a {email}" | `201`; `400` formato de email o header; `404` comercio ajeno; `409` comercio no operativo, "No se puede invitar a este email", ya es del equipo, pendiente existente, tope ("Alcanzaste el máximo de 5 invitaciones por hora. Probá de nuevo a las HH:mm") |
| `GET /api/v1/comercios/equipo` | — | `EquipoComercioResponseDTO { miembros: [ { empleadoId, nombre, apellido, email, fotoPerfilUrl, estado, fechaAlta, fechaBaja } ], invitaciones: [ { id, email, estado, fechaCreacion, fechaVencimiento } ] }` | `200` |
| `POST /api/v1/comercios/equipo/invitaciones/{invitacionId}/reenviar` | — | `InvitacionEmpleadoResponseDTO` de la nueva fila; la anterior queda `REEMPLAZADA` | `200`; `404` invitación de otro comercio o inexistente; `409` ya aceptada, cancelada o reemplazada ("Esta invitación ya no se puede reenviar"); `409` tope |
| `PUT /api/v1/comercios/equipo/invitaciones/{invitacionId}/cancelar` | — | mensaje "Invitación cancelada" | `200`; `404`; `409` si no está pendiente. Es `PUT` con nombre de acción (mismo criterio que `/aceptar`, `/rechazar`): la invitación no se borra, queda `CANCELADA` |

El listado muestra las invitaciones `PENDIENTE` (con `fechaVencimiento` posterior a ahora → "Pendiente"; anterior → "Vencida", calculado sin job) y las `INVALIDADA`; no muestra las `CANCELADA`, `REEMPLAZADA` ni `ACEPTADA` (la aceptada aparece como miembro). Miembros: `ACTIVO` e `INACTIVO` ordenados por `fecha_alta`. "Listar equipo" y "consultar el equipo" son el mismo `GET` (una sola respuesta alimenta la pantalla); si se prefiere partirlo en `/equipo` y `/equipo/invitaciones`, es un cambio de forma trivial (Q9).

### 7.2 Públicos (seguridad: `permitAll` por **ruta exacta**, agregadas a `RUTAS_PUBLICAS`; el frontend las llama con `auth: false`)

| Verbo y ruta | Entrada | Salida | Códigos |
|---|---|---|---|
| `POST /api/v1/auth/invitaciones-empleado/validar` | `{ email, codigo }` (el código son 6 dígitos) | `{ comercioNombre, comercioFotoPerfilUrl, cuentaExistente, fechaVencimiento }` | `200`; `400` formato; `401` **mensaje único** para todo lo demás (ver abajo); `429` límite por IP |
| `POST /api/v1/auth/invitaciones-empleado/aceptar` | `{ email, codigo, aceptaTerminos?, cuentaNueva? }`; `cuentaNueva` es `DatosClienteRequestDTO` (nombre, apellido, dni, fechaNacimiento, telefono, nombreUsuario, password, direccion, fotoPerfilUrl); con cuenta existente se manda solo email y código | `{ comercioNombre, cuentaCreada, relacionReactivada }`, mensaje "Ya sos parte del equipo de {comercio}" | `200` (Q6); `400` datos de cuenta inválidos (mismo mapa `{campo: mensaje}` que el registro) o falta `cuentaNueva`/`aceptaTerminos` cuando la cuenta no existe; `401` mensaje único; `409` nombre de usuario en uso, DNI duplicado, cuenta no apta, rol incompatible, comercio no disponible; `429` |

**Respuestas idénticas y protección anti-abuso.**
- Un email inexistente, sin invitación pendiente, un código incorrecto, vencido, reemplazado, cancelado o invalidado dan **la misma respuesta**: `401` "El código es incorrecto o la invitación ya no está vigente. Pedí que te reenvíen la invitación." Sin `intentosRestantes` y sin diferenciar vencimiento de agotamiento (a diferencia de la verificación de email, que hoy sí devuelve intentos restantes y un `409` distinto al agotarlos; acá revelaría que existe una invitación para ese email). Q3.
- Cada código incorrecto suma un intento a **todas** las invitaciones pendientes del email (el tope de 5 por código del que habla la decisión 7); al llegar a 5 pasa a `INVALIDADA`. El contador se guarda aunque se responda `401` (E1-4). `validar` y `aceptar` cuentan igual, por una única rutina de resolución.
- `validar` informa `cuentaExistente` solo a quien ya probó el código.
- Si hay cuenta, `aceptar` la usa y **ignora** cualquier `cuentaNueva` (jamás modifica una cuenta existente); si no hay, exige `cuentaNueva` y `aceptaTerminos`.
- Límite por IP: filtro generalizado (`RateLimitPublicoFilter`) con mapa ruta → límite y un contador por grupo (hoy es uno solo por IP); valores de partida 10 por minuto para `validar` y `aceptar`, con propiedades `app.rate-limit.*`, y subidos en `application-test.properties` como ya se hace con la foto. Falta resolver la IP real detrás del proxy (E1-6, Q8).

Línea de estado: bloque 7 (endpoints) completo.

---

## 8. Frontend de E1

**Archivos a crear o tocar**

| Archivo | Acción |
|---|---|
| `js/cliente-form.js` | **Nuevo.** Extracción del asistente de `initRegistroCliente`: campos, validaciones en vivo, foto con recorte, dirección con `initGeografiaSelects`, términos. Mismos ids y `data-testid`. |
| `js/auth.js` | Quedar con el cableado de `initRegistroCliente` sobre el módulo nuevo; sumar `aceptaTerminos` al payload; `initLogin` sin cambios de lógica. |
| `invitacion-empleado.html` + `js/invitacion-empleado.js` | **Nuevos.** Pantalla pública con cuatro vistas (código, cuenta existente, cuenta nueva y éxito); la cuenta nueva usa el asistente de dos pasos del registro de Cliente (ver abajo). |
| `login.html` | Botón "Tengo una invitación" en el pie, junto a "Registrate" y "Reactivar mi cuenta" (`login.html:51-52`). |
| `registro-tipo-cuenta.html` | La línea "¿Te invitaron a un comercio? Tengo una invitación" (es la pantalla de elección de tipo de cuenta; Q10). |
| `comercio-perfil.html` + `js/comercio.js` | Enlace "Equipo" en la lista "Mi comercio" y vista `view-equipo` (el mismo patrón de `perfil-view` + `mostrarVista` + `data-volver-perfil` que usan "Editar datos" y "Ver datos legales"). `comercio.js` ya tiene ~2200 líneas: la lógica va en un `js/equipo-comercio.js` nuevo, importado desde ahí. |
| `js/api.js` | Sumar `equipo` a `RUTAS_DEL_DUENO` (`comercios\/(perfil|redes-sociales|cerrar|abrir|equipo)`) para que viaje `X-Comercio-Id`. |
| `css/styles.css` | Solo si hace falta: los puntos de estado del equipo pueden reutilizar `.pedido-estado` y su variante de color. |

**Componentes reutilizables.** `crearInputOtp(contenedor, { onComplete })` con `getValor/reset/marcarError/marcarExito` (`otp.js`); `.step-progress` y la barra de progreso (la función `mostrarPaso` está copiada dentro de cada `init*`; conviene un helper chico al extraer); `initGeografiaSelects`; `abrirEditorRecorte` + `subirFotoPerfilRegistroCliente`; `bindNombreUsuario` (exportado de `auth.js`); `showToast` y `renderEmptyState` (`catalogo.js`); la hoja inferior es `.modal-backdrop` + `.modal-sheet` (como `mostrarModalFotoPerfilComercio`); skeletons y banners existentes.

**`invitacion-empleado.html` (pantalla pública)**
1. Email + código con OTP (`validar`); error genérico bajo el campo del código.
2. Si `cuentaExistente`: confirmación "Te invitaron a trabajar en {comercio}" y botón "Aceptar invitación". Si no: los pasos de datos personales y dirección del asistente compartido, con la casilla de Términos validada por el servidor.
3. Éxito con botón "Iniciar sesión" (no inicia sesión solo, decisión 11).
Los textos de error del paso 1 y del tope (`429`) se resuelven sin redirigir.

**Cómo se comporta `apiFetch` en pantallas públicas.** Con `auth: false` no manda `Authorization`, así que un `401` no dispara la ventana de "Sesión cerrada" (`hadToken` es falso) y no se limpia ninguna sesión guardada. Un error `5xx` o de red redirige por defecto a `errores/500.html` o `sin-conexion.html` y pierde lo cargado en el asistente: para esta pantalla conviene `handle5xxGlobally: false` y `handleRedGlobally: false` (las opciones ya existen). Si el visitante tenía otra sesión abierta en el navegador, conviene que el botón final la cierre (`clearSesion`) antes de ir al login.

**"Ver equipo" del Dueño.** Vista nueva dentro de `comercio-perfil.html` (no es una pestaña del pie): encabezado con el comercio activo, lista de miembros (Activo / Inactivo), lista de invitaciones (Pendiente / Vencida / invalidada) con "Reenviar" y "Cancelar" (confirmación en hoja inferior), botón "Invitar" que abre una hoja con el campo de email. Vacío con `renderEmptyState`. En E1 solo existe el actor Dueño; ocultar el enlace para el Empleado llega en E2.

**Lo que ya está en el frontend y se preserva.** Ninguna prueba cuenta o selecciona los enlaces del pie del login ni los del selector de tipo de cuenta (se buscó por `data-testid`), así que agregar los botones no rompe nada.

Línea de estado: bloque 8 (frontend) completo.

---

## 9. Concurrencia: escenarios para `scripts/stress-locks-empleado-e1.mjs`

Mismo formato que los estreses `stress-locks-*.mjs` existentes (ráfagas con `Promise.all`, verificación del estado final contra la API y la base de test). Cada escenario se repite varias rondas.

| # | Escenario | Resultado esperado |
|---|---|---|
| S1 | Aceptar × cancelar la misma invitación (10 rondas) | Un solo ganador. Si gana aceptar: invitación `ACEPTADA` + relación `ACTIVO` + una fila `ACEPTACION`. Si gana cancelar: `CANCELADA`, sin relación, el aceptar da `401` genérico. Nunca ambos. |
| S2 | Dos aceptaciones del mismo email y código con cuenta nueva | Un `200` y un `401`; **1** `usuario`, **1** `empleado`, **1** `empleado_comercio`, **1** notificación al Dueño. |
| S3 | Aceptar × reenviar (y además el Dueño invitando de nuevo) | Se confirma el orden de bloqueo de E1-5: **cero** interbloqueos (`1213`) ni `500`. Nunca dos `PENDIENTE` para el mismo par; si ganó el reenvío, el código viejo da `401` y el nuevo funciona. |
| S4 | Seis invitaciones simultáneas del mismo Dueño a emails distintos (tope de 5 por hora) | Exactamente 5 `200` y 1 `409`; 5 filas en la ventana. |
| S5 | Dos invitaciones simultáneas al mismo email | Un `200` y un `409` ("ya hay una pendiente"); un solo `PENDIENTE`. |
| S6 | Un Empleado nuevo acepta a la vez dos invitaciones de comercios distintos (cuenta ya existente, sin fila `empleado`) | Los dos aceptan, **1** fila `empleado`, 2 relaciones. |
| S7 | Veinte códigos erróneos en paralelo (con el correcto mezclado) | Sin `500`; los intentos nunca pasan de 5 por invitación; invalidación consistente; si el correcto entró antes del quinto fallo, acepta. |
| S8 | Aceptar × tres intentos fallidos de login del invitado (bloqueo de cuenta) | Sin interbloqueo; resultado coherente (la cuenta queda `BLOQUEADA` y la aceptación o bien ocurrió completa o bien dio `409`). |
| S9 | Aceptar × bloqueo de la cuenta del Dueño (login con contraseña errónea, 3 intentos) | Sin interbloqueo entre `usuario`, `invitación` y `comercio`; mismo criterio que `stress-locks-tramoC3`. |
| S10 | Invitar a la misma cuenta bloqueada cuatro veces en paralelo | Sin `500`; filas `EMAIL` del destinatario acotadas (exceso de 1 o 2 aceptado y documentado, no justifica un lock). |
| S11 | Cancelar × reenviar × aceptar a la vez | Un único estado final consistente; ningún `PENDIENTE` huérfano. |

Línea de estado: bloque 9 (concurrencia) completo.

---

## 10. Pruebas, cuentas de prueba y volumen

**Playwright** (hoy 34 specs, `workers: 1` permanente). Nuevos: `35-empleado-invitacion-api.spec.ts` (~30 tests) y `36-empleado-invitacion-ui.spec.ts` (~20 tests); mantienen la numeración de la auditoría de la Fase 1 (37 a 40 quedan para E2 a E4). Modificados: `helpers/backend.ts` (sumar `aceptaTerminos` en `registrarCliente`, y helpers `invitarEmpleado`, `reenviarInvitacion`, `cancelarInvitacion`, `obtenerCodigoInvitacionTest`, `vencerInvitacionTest`, `aceptarInvitacion`), `19-nombre-usuario.spec.ts` (`registroCrudo`), y una prueba nueva en `01-registro-y-verificacion.spec.ts` ("sin aceptar términos"). No se pisa `selector.ts` ni `multicomercio.ts`.

Casos de la API (35): invitar bien; email mal formado `400`; sin header `400` y con comercio ajeno `404`; un Cliente recibe `403`; email de Dueño y de Administrador devuelven el mismo `409`; cuenta bloqueada, inactiva, sin verificar → `409` + fila de regularización contada (tope de 3 por día); pendiente existente `409`; tope de 5; reenviar (código nuevo, anterior `REEMPLAZADA`); cancelar y cancelar ajena `404`; `validar` ok y todos los fallos idénticos; 5 intentos → invalidada; vencida con el atajo; aceptar con cuenta nueva (login posterior ok, filas `cliente` y `empleado`, dirección); aceptar con cuenta existente; segunda aceptación; `aceptaTerminos` ausente o falso `400`; DNI y nombre de usuario duplicados; revalidación de matriz al aceptar (el invitado se volvió bloqueado); notificación al Dueño visible bajo el comercio; el equipo lista miembros e invitaciones; aislamiento entre dos comercios del mismo Dueño; ex Empleado no registra comercio (`409`).

Casos de UI (36): botón del login y enlace del registro; flujo con cuenta nueva (asistente completo, foto, errores de campo mapeados); flujo con cuenta existente; código incorrecto sin ventana de "Sesión cerrada"; "Ver equipo" (vacío, invitar, reenviar, cancelar, vencida); viewport móvil.

**Newman.** Nuevo constructor `build-empleado-tramoE1-postman.mjs` (carpeta `56`, siempre último, mismo formato que el `8a` que agrega la carpeta `55`); ~65 requests y ~120 aserciones; variables en `Bajonea-Local.postman_environment.json`. Ajustes a los constructores y a la colección por la unificación de Términos (sección 2). La colección actual tiene 1517 requests definidas.

**Estrés.** `stress-locks-empleado-e1.mjs` (sección 9).

**Java** (39 clases hoy): `InvitacionEmpleadoServiceTest` (~25, con simulaciones), `InvitacionEmpleadoIntegrationTest` (~12 contra `bajonea_test`: unicidad, tope, transacción única de alta, reactivación de fila), `MatrizRolesServiceTest` (~10), `EmailServiceTest` (+3), `NotificacionServiceTest` (+3 por el filtro de canal), `RateLimitPublicoFilterTest` (~4), más la prueba de esquema (el arranque con `validate` contra las tablas nuevas, que ya cubre `BajoneaApplicationTests`). Total ≈ 55.

**Cuentas y semillas.** Ninguna semilla nueva: las suites crean sus datos por API; `reset-db.mjs` solo siembra el Administrador y la tarifa, y con `V29` a `V32` en el repositorio el reset de `bajonea_test` los aplica solo. Para `practicas3` Diego agrega a mano su cuenta de Empleado en `docs/CUENTAS-DE-PRUEBA.local.md` (archivo ignorado por git).

**Cantidad estimada de tests nuevos en E1:** ~50 de Playwright, ~65 requests de Newman, ~55 de Java, 11 escenarios de estrés. Más el ajuste de unos 14 sitios por Términos y Condiciones.

Línea de estado: bloque 10 (pruebas) completo.

---

## 11. División de E1 en entregas A y B

### Entrega A — backend y tests

| Bloque | Contenido | Verificación |
|---|---|---|
| A0 | Unificación de Términos y Condiciones: clase base `DatosClienteRequestDTO`, `aceptaTerminos` en `RegistroClienteRequestDTO`, ajustes de Playwright (helper y `registroCrudo`), Newman (adaptadores y constructores), estreses y colección. Se puede commitear solo (si Diego aprueba Q1). | `mvnw test`; reset de `bajonea_test`; Playwright y Newman verdes antes de seguir. |
| A1 | `V29` a `V32` + enums, entidades y repositorios (sin servicios); `reset-db.mjs` corre las migraciones. | Arranque con `validate`; `SELECT` de las tablas nuevas; prueba de esquema. |
| A2 | `MatrizRolesService`, `InvitacionEmpleadoService` (invitar, reenviar, cancelar, listar), inserción JDBC de códigos, emails (invitación y regularización), tope de 3 por día en `notificacion`, filtro `canal = PUSH` y aviso al Dueño. | Java unitarios e integración. |
| A3 | Validar y aceptar (cuenta nueva y existente), extracción de `crearClienteActivable` en `RegistroService`, orden de bloqueo, rutas públicas exactas en `RUTAS_PUBLICAS` y filtro de límite por IP generalizado. | Java de integración con concurrencia simple. |
| A4 | Endpoints del Dueño `/comercios/equipo/**` y el DTO del equipo. | Playwright 35 parcial. |
| A5 | Atajos de test del perfil `test`, specs de Playwright 35, carpeta 56 de Newman y estrés; documentación (`DECISIONES.md`, `CLAUDE.md`, diccionario v1.12 si cambia). | `mvnw test`, Playwright completo, Newman completo, estrés. |

### Entrega B — frontend y tests de UI

| Bloque | Contenido |
|---|---|
| B1 | Extracción de `cliente-form.js` (sin cambios de comportamiento: el spec 01, el 19 y los de registro deben seguir en verde) y `aceptaTerminos` en el payload. |
| B2 | `invitacion-empleado.html` + `js/invitacion-empleado.js`. |
| B3 | Botón del login y línea del registro. |
| B4 | "Equipo" en el perfil del Dueño (`js/equipo-comercio.js`, regex de `api.js`). |
| B5 | Spec 36 y ajustes de los specs existentes; verificación en viewport móvil. |

### Riesgos

1. **Interbloqueos en aceptar** (E1-5): se cierran con el orden propuesto y con S3, S8 y S9; es el punto más delicado de A3.
2. **Rollback que borra lo que debe quedar** (E1-4): excepciones específicas, no de clase.
3. **Regresión del registro de Cliente** al extraer el asistente (B1): es la parte con más superficie de UI existente; se mitiga haciendo B1 primero y sin cambiar ids.
4. **Mecánica de la unificación de Términos** (A0): unos 14 sitios y regenerar la colección; error típico: un cuerpo de Newman sin el campo.
5. **IP detrás del proxy** (E1-6): el límite por IP queda inútil en producción sin configurar `forward-headers-strategy`.
6. **Orden de migración en producción:** `V29` y el enum Java tienen que ir juntos; hay que confirmar con la consulta de la sección 13 de la auditoría anterior que `practicas3` tiene cero filas en `empleado_comercio`.
7. **Colisión del código de 6 dígitos** entre invitaciones pendientes del mismo email: insertar con el patrón JDBC con reintento (probabilidad ínfima, pero el costo de fallar es una transacción rota).

Línea de estado: bloque 11 (entregas y riesgos) completo.

---

## 12. DDL: no hace falta cambiar `V29` a `V32`

Se verificó contra el código y `bajonea_test` y se confirman tal como están en la sección 12 de `AUDITORIA-EMPLEADO-FASE1.md`. Observaciones:
- Los dos únicos parciales de `V30` sobre `pendiente_clave` usan el mismo patrón que `V27` (columna `STORED` con `CASE`), que ya funciona en 10.4.32; los tamaños de clave quedan muy por debajo del límite de InnoDB.
- Alcanza con los índices `idx_inv_comercio_fecha` (tope de 5 por hora) e `idx_inv_email_estado` (invitaciones pendientes del email al aceptar).
- `V32` (`actividad_comercio`) no la usa ningún código de E1: queda como tabla vacía hasta E3. Si Diego prefiere no sumar superficie en E1, `V32` puede pasar a E3 sin cambiar su contenido. Q7.

Línea de estado: bloque 12 (DDL) completo.

---

## 13. Decisiones para Diego y preguntas abiertas (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| Q1 | ¿Se **unifica** ahora la validación de Términos y Condiciones también en el registro de Cliente (opción A), solo en el alta por invitación (B), o se pospone? | **A**, como bloque A0 independiente y commiteable antes de lo demás. Evita dos comportamientos distintos para el mismo formulario y el costo es mecánico (sección 2). |
| Q2 | ¿Se persiste la aceptación (fecha y versión) y se crea una página de Términos? | **Resuelta por Diego el 2026-10-06: no.** Se valida sin guardar y no se planea guardar ni crear la página ni versionar los términos (no es un requisito del proyecto). No hay `V33` ni limitación pendiente. |
| Q3 | Código incorrecto: ¿respuesta idéntica sin intentos restantes (recomendada) o como la verificación de email (con intentos y un `409` al agotar)? | **Idéntica y sin intentos restantes**: no revela que existe una invitación para ese email. El Dueño reenvía si hace falta. |
| Q4 | ¿Cómo se rotula una invitación `INVALIDADA` en "Ver equipo"? | "Código bloqueado" con "Reenviar", distinta de "Vencida". Suma un quinto estado visible a los cuatro decididos. **Aprobado por Diego (2026-10-06).** |
| Q5 | ¿Se puede aceptar una invitación si el comercio ya no está operativo? | Permitir si el comercio está `APROBADO`, `APTO_VENTA`, `CERRADO_TEMPORALMENTE` o `SUSPENDIDO` (los mismos que ve el Empleado en el selector, decisión 27); rechazar con `409` si está `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO` o `INACTIVO`. Invitar sigue exigiendo operativo. |
| Q6 | Código de estado de aceptar y reenviar. | `200` ambos (el reenvío devuelve la fila nueva); `201` quedaría natural solo si se considera que crea un recurso. |
| Q7 | ¿`V32` (`actividad_comercio`) va en E1 como se decidió o en E3? | Mantenerla en E1 como está decidido (DDL ya aprobado, sin código); pasarla a E3 solo si querés reducir superficie. |
| Q8 | IP real detrás del proxy: ¿se agrega `server.forward-headers-strategy` a `application-production.properties`? | Sí, y verificarlo en `practicas3`/Railway antes de contar con el límite; de paso arregla `Sesion.ip_origen`. Los valores de partida de 10 por minuto son una propuesta. **Decidido el 2026-10-06: queda en la lista de despliegue.** |
| Q9 | ¿"Listar equipo" y "consultar el equipo" son un solo `GET /comercios/equipo` (recomendado) o dos? | Uno solo. |
| Q10 | ¿Dónde va "una línea en el registro"? | En `registro-tipo-cuenta.html` (la pantalla que elige tipo de cuenta), no dentro del formulario de Cliente. |
| Q11 | ¿El email de regularización nombra al comercio que invitó? | Sí, el nombre del comercio (dato público); sin ningún dato del Dueño. |
| Q12 | ¿"Por día" del tope de 3 es calendario o 24 horas corridas? | 24 horas corridas (criterio de los 30 días corridos del nombre de usuario). |
| Q13 | ¿Los emails de regularización se cuentan aunque falle el envío? | Sí: se cuenta el intento (`EmailService` no devuelve resultado). |
| Q14 | Alta por invitación con cuenta existente: ¿se exige `aceptaTerminos`? | No; vale solo para cuentas nuevas (decisión 11) y se ignora cualquier `cuentaNueva` si el email ya tiene cuenta. |

Línea de estado: auditoría E1 completa; informe listo para revisión de Diego.

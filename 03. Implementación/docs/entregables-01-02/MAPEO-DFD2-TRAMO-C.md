# MAPEO DFD NIVEL 2 — TRAMO C (P2.01 a P2.05)

Relevamiento de solo lectura hecho el 2026-11-16 sobre el código real (`backend/`, `frontend/`) y contrastado con `01. Análisis de Requerimientos`. No se modificó ningún archivo de código ni se tocó git. Las rutas son relativas a `03. Implementación/`; `S/` = `backend/src/main/java/com/bajonea/backend/`, `F/` = `frontend/`.

**Hallazgos que cambian el dibujo de los diagramas (leer primero):**

1. **Aprobar o rechazar un comercio NO manda email.** Solo crea una notificación in-app al Dueño (`COMERCIO_APROBADO` / `COMERCIO_RECHAZADO`). La pantalla de éxito del registro y `comercio-pendiente.html` prometen un email, y la tabla T14/T15 de `requisitos-funcionales-sistema.md` dice "App + Email". El código no lo hace (D-01).
2. **Los documentos no van a Cloudinary.** Se suben por `multipart/form-data` al backend, que los valida por firma de bytes y los guarda como `LONGBLOB` en MySQL (`documento_comercio_archivo`). El componente de firma Cloudinary solo se usa para la foto de perfil del comercio y las imágenes de producto (D-02).
3. **No existe "reemplazar" un documento, ni vencimientos, ni job de documentos.** Se sube uno nuevo; el rechazado queda como constancia; el único borrado posible es el de un documento propio `PENDIENTE` (borra binario y fila).
4. **No hay aviso al Administrador por una solicitud nueva ni por una re-solicitud.** Los tipos `NUEVO_COMERCIO_PENDIENTE` y `NUEVA_RESOLICITUD_COMERCIO` existen en el enum Java y en el ENUM de MySQL, pero nada los emite (coincide con los docs, que los marcan "sin emisor").
5. **La aptitud (`APTO_VENTA`) tiene una única fuente de verdad:** `AptitudVentaComercioService` (regla pura `decidir`). Se recalcula por evento, no por job.

---

## P2.01 — Solicitud de alta de comercio (primer alta y alta adicional)

### 1. Disparadores y actores

| | Primer alta (registro del Dueño) | Alta adicional (multi-comercio) |
|---|---|---|
| Pantalla | `F/registro-comercio.html` + `initRegistroComercio` (`F/js/auth.js:290`), wizard de 4 pasos (Negocio, Legales y cuenta, Horarios, Redes y términos) | `F/agregar-comercio.html` + `initAgregarComercio` (`F/js/agregar-comercio.js`), wizard de 3 pasos (Negocio, Horarios, Redes y términos). **Sin enlaces desde otras pantallas**; se entra por dirección directa (según CLAUDE.md §1bis, tramo multi-comercio 2B) |
| Rol | Público, sin sesión | `DUENO` autenticado |
| Endpoint | `POST /api/v1/auth/registro/comercio` (`AuthController.registrarComercio`, `S/controllers/AuthController.java:77`) | `POST /api/v1/comercios` (`ComercioController.altaAdicional`, `S/controllers/ComercioController.java:61`) |
| Auxiliares | `POST /auth/registro/comercio/foto-firma` (público, límite 5/min por IP: `RateLimitPublicoFilter`, grupo `foto-registro`, `app.rate-limit.foto-registro-por-minuto`); `GET /auth/comercio-nombre/disponibilidad?nombre=` (público, grupo `disponibilidad`, 30/min por IP); `GET /auth/nombre-usuario/disponibilidad` | `GET /comercios/alta-adicional/elegibilidad`; `POST /comercios/nuevo/foto/firma`; `GET /comercios/nombre/disponibilidad?nombre=&comercioId=` (solo Dueño, no delegable) |
| Resolución del comercio | No aplica (todavía no existe) | **No usa `X-Comercio-Id`**: los 4 endpoints actúan sobre el Dueño (`usuario.userId()` = `dueno.id`), no sobre un comercio. Ver `ComercioController` Javadoc líneas 56-60 |
| Seguridad | Ruta pública en `RUTAS_PUBLICAS` | `/api/v1/comercios/**` → `hasRole("DUENO")` (`SecurityConfig.java:150`); un Empleado (rol `CLIENTE`) recibe `403`. No está en `DelegacionEmpleado` |

### 2. Entradas del usuario y validaciones

Backend: `DatosNegocioComercioRequestDTO` (compartido), `RegistroComercioRequestDTO extends` ese DTO, `AltaComercioAdicionalRequestDTO extends` ese DTO. Frontend: `F/js/comercio-form.js` (`initCamposNegocio`, `initDatosLegales`, `initHorarios`, `initRedesSociales`, `initFotoComercio`).

**Datos del negocio (ambos flujos):**

| Campo | Backend | Mensaje backend (literal) | Frontend |
|---|---|---|---|
| `nombre` | `@NotBlank`, `@Pattern(.*[\p{L}0-9].*)`, `@Size(max=150)` | "El nombre del comercio es obligatorio" / "Ingresá un nombre de comercio válido" / "El nombre no puede superar los 150 caracteres" | "El nombre del comercio es obligatorio"; "Ingresá un nombre de comercio válido." (con punto); disponibilidad en vivo al salir del campo |
| `descripcion` | `@Size(max=2000)` (opcional) | "La descripción no puede superar los 2000 caracteres" | opcional |
| `telefono` | `@NotBlank`, `@ValidarTelefonoArgentino`, `@Size(max=30)` | "El teléfono de contacto es obligatorio" | "El teléfono de contacto es obligatorio" / "Ingresá un número de teléfono válido (cod. área + número)" |
| `tipoComercio` | `@NotNull` | "Seleccioná el tipo de comercio" | "Seleccioná el tipo de comercio." |
| `aceptaDelivery`/`aceptaRetiro` | booleanos; regla cruzada en `ComercioValidaciones.validarModalidadesEntrega` | "El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)" (`ValidacionException` → 400) | "Debés ofrecer al menos una modalidad de entrega." |
| `direccion` | `DireccionRequestDTO`: `calle` (obl., ≤150, con letra/número), `numero` (obl., ≤10, solo dígitos), `pisoDepto` (≤30, opc.), `codigoPostal` (obl., `@ValidarCodigoPostalArgentino`), `localidadId` (obl., ≤15) | "La calle es obligatoria", "Solo se permiten números", "Ingresá un código postal válido (4 dígitos o formato CPA)", "Seleccioná tu localidad" | idénticos más "Seleccioná una provincia."; la provincia es campo de solo lectura (Tierra del Fuego) |
| `horarios` | `@NotEmpty` + `@Valid` (`HorarioRequestDTO` solo `@NotNull` sin mensaje) | "No debe estar vacío" | "Cargá al menos una franja horaria de atención." / "Completá el día y el horario de todas las franjas cargadas." |
| `fotoPerfilUrl` | `@NotBlank`, `@ValidarUrlCloudinary` (solo dominio `res.cloudinary.com`), `@Size(max=500)` | "Agregá una foto de perfil de tu comercio" | "Agregá una foto de perfil de tu comercio"; archivo: JPG/PNG/WEBP, máx. 5 MB ("Formato no permitido. Usá JPG, PNG o WEBP." / "La imagen no puede superar los 5 MB.", `F/js/cloudinary.js`) con recorte |
| `redesSociales` | `@NotEmpty`, `@Size(max=5)`, `@Valid`; cada una `RedSocialRequestDTO` | "Debés cargar al menos una red social", "No podés cargar más de 5 redes sociales", "Seleccioná el tipo de red social", "El link es obligatorio", "Ingresá un link válido" (`@Pattern ^(?=.*\p{L})(?=.*\.)\S+$`), "El link no puede superar los 500 caracteres" | "Cargá al menos una red social.", "Seleccioná el tipo de cada red social cargada.", "El link es obligatorio en cada red social cargada.", "Ingresá un link válido para cada red social cargada.", "No podés cargar dos redes sociales del mismo tipo. Eliminá la que se repite." |
| `aceptaTerminos` | `@NotNull` + `@AssertTrue`; **se valida y no se guarda** | "Tenés que aceptar los Términos y Condiciones" | casilla con enlaces a `terminos.html` y `privacidad.html` |

`TipoRedSocial`: `INSTAGRAM, FACEBOOK, TIKTOK, WHATSAPP, X, SITIO_WEB, OTRO`. `RedSocialRequestDTO.setUrl` normaliza con esquema (`TextoUtils.normalizarUrlConEsquema`).

**Solo en el primer alta (`RegistroComercioRequestDTO`):**

| Campo | Obligatorio | Validación |
|---|---|---|
| `cuit` | sí | `@ValidarCuit` "El CUIT debe tener 11 dígitos numéricos" (módulo 11); el setter deja solo dígitos |
| `domicilioFiscal` | sí | ≤255, con letra/número |
| `razonSocial`, `condicionIva`, `tipoSociedad`, `fechaInicioActividades` | **no** (V36) | `razonSocial` ≤150; `fechaInicioActividades` `@PastOrPresent` "La fecha ingresada no es válida" |
| Representante: `nombreRepresentante`, `apellidoRepresentante`, `dniRepresentante`, `telefonoRepresentante`, `fechaNacimientoRepresentante` | sí | letras, `@ValidarFormatoDni`, teléfono argentino, `@ValidarFechaNacimientoRepresentante` (18 años mínimo, techo 120). Frontend: "Debe ser mayor de 18 años", "La fecha ingresada no puede ser anterior a 120 años" |
| `nombreUsuario`, `email`, `password` | sí | `@ValidarNombreUsuario` (8-20, letras y números), `@ValidarFormatoEmail` (≤254, setter a minúsculas), `@ValidarPasswordSegura`. Frontend suma "Las contraseñas no coinciden", "Debes confirmar la contraseña" |

El comercio **no pide email propio** desde V36 (la columna `comercio.email` quedó `NULL`-able; el DTO ya no lo recibe).

**Solo en el alta adicional:** no hay datos fiscales, representante, email ni contraseña (se reutilizan los del Dueño). `AltaComercioAdicionalRequestDTO` agrega únicamente `aceptaTerminos`. El frontend informa "Usamos los datos fiscales y la cuenta de MercadoPago de tu cuenta. No hace falta cargarlos de nuevo." (o sin "y la cuenta de MercadoPago" si no está vinculada).

### 3. Secuencia de validaciones y decisiones (orden real)

**Primer alta** — `RegistroService.registrarComercio` (`@Transactional` de clase):
1. Bean Validation del body → `400` con mapa `{campo: mensaje}` (`GlobalExceptionHandler.handleMethodArgumentNotValid`; los "obligatorio" se ordenan primero).
2. `validarEmailUnico` → `409` "Ya existe una cuenta registrada con ese email".
3. `validarNombreUsuarioDisponible` → `409` `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` ("Ese nombre de usuario ya está en uso" según el handler).
4. CUIT repetido → `409` "Ya existe una cuenta registrada con ese CUIT".
5. DNI del representante repetido → `409` "Ya existe una cuenta registrada con ese DNI".
6. `ValidadorDatosNegocioComercio.validar`: (a) horarios (`ValidadorHorarios.validar`), (b) redes sin tipo repetido → `400` "No podés cargar dos redes sociales del mismo tipo", (c) modalidades, (d) localidad: inexistente → `404` "La localidad indicada no existe"; existente pero no habilitada → `400` con `{"direccion.localidadId": "Esa localidad todavía no está disponible"}`. Habilitadas: Río Grande `94008010`, Ushuaia `94015020`, Tolhuin `94011010` (`geografia.localidades-habilitadas`, valor por defecto en `LocalidadesHabilitadas`).
7. `NombreComercioService.validar(nombre, null)` → `409` "Ya existe un comercio con ese nombre. Elegí otro." (única en toda la plataforma; ver punto 4).
8. Escrituras (ver punto 4).

Reglas de horarios (`ValidadorHorarios.validar`): cierre igual a apertura → `400` "La hora de cierre no puede ser igual a la de apertura. Si atendés las 24 horas, cargá de 00:00 a 23:59."; cierre < apertura = turno que cruza la medianoche (válido); superposición medida sobre semana circular: mismo día → "Ya tenés un horario cargado el {día} de {apertura} a {cierre}, que se superpone con este"; días distintos → "El turno del {día} de {HH:mm} a {HH:mm} se superpone con el del {día} de {HH:mm} a {HH:mm}".

**Alta adicional** — `AltaComercioAdicionalService.altaAdicional` (`@Transactional`):
1. Bean Validation (igual que arriba, sin los campos fiscales).
2. `duenoRepository.findByIdConBloqueo` (`FOR UPDATE`, **primera sentencia**) → `404` "Dueño no encontrado".
3. Elegibilidad (`esElegible`): tiene ≥1 comercio `APROBADO` o `APTO_VENTA`, **o** tiene ≥1 comercio y todos están `RECHAZO_DEFINITIVO`. Si no → `409` "Para agregar un nuevo comercio, necesitás tener al menos uno aprobado previamente". (Pendientes, rechazados corregibles, suspendidos, inactivos o `CERRADO_TEMPORALMENTE` solos **no** habilitan.)
4. `CloudinaryService.validarFotoNuevoComercio(duenoId, url)`: la URL debe ser `https://res.cloudinary.com/{cloudName}/image/upload/[v123/]duenos/{duenoId}/comercios-nuevos/{archivo}` → si no, `400` "La foto de perfil no es válida. Subila de nuevo desde el formulario."
5. `RegistroService.crearComercio` → `ValidadorDatosNegocioComercio.validar` + `NombreComercioService.validar` (mismos pasos 6 y 7 de arriba) y escrituras.

**Sin tope** de comercios por Dueño ni de altas pendientes. Teléfono repetible.

### 4. Efectos sobre la base de datos

**Primer alta**, todo en una sola transacción (rollback total si algo falla):

| Orden | Tabla | Qué se escribe |
|---|---|---|
| 1 | `usuario` | `rol=DUENO`, `estado=PENDIENTE`, `intentos_fallidos=0`, hash BCrypt, `fecha_registro`; `saveAndFlush` (traduce `uq_usuario_nombre_usuario` y `uq_usuario_email` a `409`) |
| 2 | `persona` | 1:1 con `usuario` (`@MapsId`) |
| 3 | `persona_fisica` | representante (nombre/apellido en Title Case, DNI, nacimiento, teléfono) |
| 4 | `persona_juridica` | CUIT, domicilio fiscal; razón social/condición IVA/tipo sociedad/fecha inicio pueden ser `NULL` |
| 5 | `dueno` | enlaza `persona_juridica` y `persona_fisica` |
| 6 | `comercio` | `estado=PENDIENTE`, `nombre` (Title Case), `descripcion`, `telefono`, `tipo_comercio`, `acepta_delivery`, `acepta_retiro`, `foto_perfil_url`, `fecha_registro`; `cantidad_resolicitudes=0`, `cerrado_manualmente=0` por defecto |
| 7 | `direccion` | 1 fila del comercio (`principal` por defecto false para comercio; `eliminada=false`) |
| 8 | `horario` | una fila por franja; `vigente_desde` queda en el valor por defecto de la entidad `2000-01-01`, `vigente_hasta` `NULL` |
| 9 | `red_social` | una fila por red; `UNIQUE (comercio_id, tipo)` |
| 10 | `token` | `VERIFICACION_EMAIL`, 24 h (`TokenService.crear`) |

**Alta adicional**: pasos 6 a 9 sobre el `dueno` existente; no crea `usuario`/`persona`/`persona_*`/`dueno`/`token`. Con `usuario.estado` del Dueño no se valida nada en este servicio (ver C-03).

**Estados:** el comercio nace `PENDIENTE` (ambos flujos). **No escribe `historial_estado_comercio`** (un comercio nace sin transición; `RegistroService.crearComercio` lo documenta). **No crea documentos**: nacen cuando el Dueño sube el primero, y solo se puede subir con el comercio ya aprobado (ver P2.03).

**Unicidad del nombre (V37):** columna generada `comercio.nombre_unico` (`TRIM(REGEXP_REPLACE(nombre,'[[:space:]]+',' '))`, `NULL` si `RECHAZO_DEFINITIVO`) con `UNIQUE uq_comercio_nombre_unico`, colación `utf8mb4_unicode_ci` (ignora mayúsculas y tildes; la `ñ` cuenta como `n`). Un `RECHAZADO` retiene el nombre. `NombreComercioService` consulta con la misma expresión para el aviso amable; si otra transacción gana la carrera, `GlobalExceptionHandler` traduce la violación del índice al mismo `409` "Ya existe un comercio con ese nombre. Elegí otro."

**Qué queda fuera de la transacción:** la subida de la foto a Cloudinary ocurre antes, desde el navegador (firma + subida directa); si el alta falla después, el asset queda huérfano en Cloudinary (no hay borrado).

### 5. Efectos secundarios

- **Email al Dueño (solo primer alta):** código de verificación de 6 dígitos (`EmailService.enviarVerificacion`) vía `EjecucionPostCommit.ejecutar` (sale recién tras el commit). El método devuelve `void`; ante un fallo de envío el alta **ya está confirmada** y no se avisa al usuario (puede reenviar el código desde `verificar-email.html`).
- **Email en el alta adicional:** ninguno. **Email al Administrador:** ninguno en ningún flujo.
- **Notificaciones:** ninguna al Administrador (ver hallazgo 4). La solicitud "aparece" en `GET /administrador/comercios/pendientes` y suma al contador `comerciosPendientes` de `GET /administrador/metricas`.
- **Cloudinary:** firma con `upload_preset=bajonea_imagenes_mvp` (formatos `jpg,jpeg,png,webp`, 5 MB y ancho máx. 1200 px, configurados en el preset, no en código). Carpeta primer alta: `comercios/pre-registro/`; alta adicional: `duenos/{duenoId}/comercios-nuevos/`.
- **Jobs / auditoría:** ninguno al crear.

### 6. Respuesta al usuario

- Primer alta: `201` con "Comercio registrado correctamente, verificá tu email" y `UsuarioResponseDTO` (`id, email, rol, estado, fotoPerfilUrl`). Pantalla de éxito: "Te enviamos un código de 6 dígitos a tu email. Verificá tu cuenta y luego un administrador va a revisar tu comercio y te vamos a avisar por email cuando quede aprobado." + botón "Ingresar código de verificación".
- Alta adicional: `201` con "Comercio enviado a revisión. Te avisamos cuando lo resuelva el equipo de Bajoneá" y el perfil (`ComercioResponseDTO`). Pantalla: "{nombre} está en revisión. El equipo de Bajoneá revisará tu solicitud y te notificaremos cuando tengamos una respuesta".
- No elegible: pantalla "Todavía no podés agregar otro comercio" + "Para agregar un nuevo comercio, necesitás tener al menos uno aprobado previamente" + "Volver al inicio".
- Errores: `409` de nombre → se marca el campo y el banner "Revisá los campos marcados."; `400` con campos → vuelve al paso que corresponde (negocio paso 1, horarios paso 2/3, redes y términos último paso); otros → `error.message` del servidor. Subida de foto fallida → vuelve al paso 1 con el mensaje.
- Salir con datos cargados: modal "Vas a perder lo que cargaste" / "Seguir cargando".

### 7. Transiciones de estado

Comercio: *(nada)* → `PENDIENTE`. Usuario (primer alta): *(nada)* → `PENDIENTE` (pasa a `ACTIVO` al verificar el email). Documentos: no existen todavía.

### 8. Concurrencia

- Alta adicional: `FOR UPDATE` sobre `dueno` como primera sentencia → dos altas simultáneas del mismo Dueño se serializan y la segunda ve al comercio insertado por la primera.
- Carrera entre Dueños distintos por el mismo nombre: la resuelve el índice único `uq_comercio_nombre_unico` (`409` traducido).
- Registro: carrera por email/nombre de usuario resuelta por los índices `uq_usuario_*` (`saveAndFlush` + traducción). CUIT/DNI: la validación `exists` previa no tiene bloqueo; no hay mapeo del índice único en el alta de comercio (ver C-04).
- Sin idempotencia explícita: reenviar el mismo POST crea otro comercio solo si el nombre es distinto (el mismo nombre da `409`).

### 9. Desvíos código ↔ documentación

- **D-01 (email de aprobación/rechazo)**: ver P2.02. El texto de la pantalla de éxito del registro ("te vamos a avisar por email cuando quede aprobado") no se cumple.
- **D-03** `requisitos-funcionales-dueño.md` (sección de alta adicional) dice que se "reutilizan los datos fiscales"; coincide con el código. Sin desvío; se anota como confirmación.
- **D-04** La foto del primer alta (`comercios/pre-registro/`) **no se valida contra la carpeta** al registrar: `RegistroService.registrarComercio` solo exige `@ValidarUrlCloudinary` (dominio). Una URL de cualquier carpeta de `res.cloudinary.com` (incluso de otra cuenta de Cloudinary) pasa. En el alta adicional y en la corrección sí se valida carpeta y cuenta (`CloudinaryService.validarFotoNuevoComercio` / `validarFotoPerfilComercio`). Los docs no lo especifican; `RegistroComercioRequestDTO` documenta solo "viaja en este mismo body".
- **D-05** `ComercioDatosOperativosRequestDTO` (Javadoc) todavía dice "los horarios no tienen todavía un endpoint de edición"; desde T1 existe `PUT /comercios/perfil/horarios` (comentario viejo en código; no cambia el comportamiento).
- **D-06** `requisitos-funcionales-empleado.md` (líneas ~214 y ~251) lista "email de contacto" entre los datos del perfil reducido del Empleado; el DTO `ComercioEmpleadoResponseDTO` ya no lo tiene (desde V36 el comercio no tiene email de contacto).

### 10. Dudas

- **C-01** `RegistroService.crearComercio` no escribe `historial_estado_comercio` para el estado inicial `PENDIENTE`. ¿Es intencional que el historial arranque recién en la primera transición? (El Javadoc lo afirma; el DFD debería mostrar "sin historial" en el alta.)
- **C-02** `Horario.vigenteDesde` por defecto `2000-01-01` en el alta: ¿se acepta como "vigente desde siempre"? Lo respalda el `DEFAULT` de V38.
- **C-03** El alta adicional no revisa el estado de la cuenta del Dueño (`BLOQUEADO`, `SUSPENDIDO`). El filtro JWT ya impide autenticar con esos estados, así que quizá no hace falta; el código del servicio no lo valida por su cuenta.
- **C-04** La validación de CUIT/DNI en el primer alta es un `exists` sin bloqueo y no hay traducción del índice único a un `409` limpio (sí la hay en `ComercioEdicionService.actualizarDatosLegales`). No se verificó si una carrera real devuelve `500`.

---

## P2.02 — Revisión de la solicitud por el Administrador y re-solicitud por el Dueño

### 1. Disparadores y actores

**Bandeja y resolución (Administrador, rol `ADMINISTRADOR`, `/api/v1/administrador/**`; sin `X-Comercio-Id`):**

| Pantalla | Endpoint |
|---|---|
| Dashboard `admin-dashboard.html` (contadores) | `GET /administrador/metricas` → `comerciosPendientes`, `resolicitudesPendientes`, … |
| `admin-comercios-pendientes.html` (solicitudes nuevas) | `GET /administrador/comercios/pendientes` |
| `admin-comercio-detalle.html?id=` | reutiliza el listado de pendientes (filtra por id en el cliente, `initAdminComercioDetalle`) |
| `admin-resolicitudes.html` / `admin-resolicitud-detalle.html` | `GET /administrador/comercios/resolicitudes` |
| Aprobar / rechazar | `PUT /administrador/comercios/{comercioId}/resolver` (`AdministradorController.resolverAprobacion`) |
| Listado general | `GET /administrador/comercios` (todos los estados) |

**Re-solicitud (Dueño):** `comercio-rechazado.html` ("Tu solicitud fue rechazada") → `comercio-corregir.html?id=N` (`F/js/comercio-corregir.js`).

| Acción | Endpoint (todos `DUENO`, comercio **por id en la ruta**, sin `X-Comercio-Id`) |
|---|---|
| Precarga | `GET /api/v1/comercios/{comercioId}/correccion` |
| Foto | `POST /api/v1/comercios/{comercioId}/correccion/foto/firma` |
| Reenviar | `PUT /api/v1/comercios/{comercioId}/resolicitud` |

### 2. Entradas y validaciones

**Resolver** (`AprobacionComercioRequestDTO`): `aprobar` `@NotNull` (sin mensaje propio), `motivo` `@Size(max=500)` (sin mensaje propio), `definitivo` opcional.

| Regla | Dónde | Texto |
|---|---|---|
| Rechazar exige motivo | `AdministradorService.resolverAprobacion` (servicio, no Bean Validation) | `400` "El motivo es obligatorio al rechazar un comercio" |
| `definitivo=true` solo al rechazar | ídem | `400` "El rechazo definitivo solo se puede indicar al rechazar un comercio" |
| Frontend: motivo de rechazo | modal `mostrarModalRechazarComercio` (`F/js/admin.js:537`), textarea con tope `MAX_MOTIVO=500`, botón deshabilitado con el motivo vacío | "El motivo es obligatorio para rechazar una solicitud." (el campo se llama "Motivo del rechazo", placeholder "Describí el motivo del rechazo...") |
| Interruptor "Rechazo definitivo" | mismo modal; en la última re-solicitud queda activado y bloqueado ("Bloqueado: este intento ya es el último.") | avisos "Esta es la última re-solicitud: el rechazo será definitivo." / "El rechazo definitivo no se puede deshacer." |
| Confirmación al rechazar | texto del modal | "El comercio recibirá una notificación con el motivo del rechazo." |

**Re-solicitud** (`ReSolicitudComercioRequestDTO extends DatosNegocioComercioRequestDTO`): mismas reglas del alta para los datos del negocio (sin `aceptaTerminos`), más `legales` (`DatosLegalesComercioRequestDTO`, completo o ausente) y `tokenVersion` (`@NotNull` "Falta la versión de la solicitud. Volvé a abrir la corrección", `@PositiveOrZero` "La versión de la solicitud no es válida"). Frontend en `comercio-corregir.js`: textos "Vas a perder lo que cambiaste" / "Seguir editando", "Enviando solicitud...", "No pudimos cargar la solicitud. Intentá nuevamente.", "Revisá los campos marcados.", "Revisá los horarios cargados.", botón "Recargar los datos" ante el `409` de versión.

### 3. Secuencia en el servicio

**Resolver — `AdministradorService.resolverAprobacion` (`@Transactional`):**
1. `400` por motivo faltante / `definitivo` con aprobar (arriba).
2. `findDuenoIdById` → `404` "Comercio no encontrado".
3. `administradorRepository.findById` → `404` "Administrador no encontrado".
4. **Solo al aprobar:** `exigirDuenoNoSuspendido` (lee `usuario.estado` con `LOCK IN SHARE MODE`) → `409` "El Dueño tiene la cuenta suspendida. Levantá la suspensión primero."; después `aptitudVentaComercioService.leerDueno(duenoId)` (estado `BLOQUEADO` del usuario y cuenta de Mercado Pago, bloqueando `cuenta_mercado_pago FOR UPDATE`).
5. `comercioRepository.findByIdConBloqueo` (`FOR UPDATE`) → `404` "Comercio no encontrado"; si no está `PENDIENTE` → `409` "El comercio ya fue resuelto".
6. Destino: aprobar → `APROBADO`; rechazar → `RECHAZADO`, salvo `RECHAZO_DEFINITIVO` si `definitivo=true` **o** `cantidad_resolicitudes >= comercio.resolicitudes.max` (3; lo decide el servidor, no la pantalla).
7. Escribe `comercio.estado` + `fecha_modificacion`; inserta `historial_estado_comercio` (administrador, origen `PENDIENTE`, destino, `motivo`, fecha).
8. Solo al aprobar: `AptitudVentaComercioService.recalcular(..., COMERCIO_APROBADO, ...)`: si el Dueño tiene cuenta de Mercado Pago activa **y** (documentación no requerida **o** ≥1 documento `APROBADO` sin `PENDIENTE`) → pasa a `APTO_VENTA` (segunda fila de historial, automática, motivo "Vinculación automática de cuenta de Mercado Pago"); si además la cuenta del Dueño está `BLOQUEADO` → `CERRADO_TEMPORALMENTE` con motivo "Bloqueo de cuenta vigente al aprobar". Como un comercio recién aprobado no tiene documentos, **en la práctica con la documentación exigida queda `APROBADO`** hasta que se apruebe un documento.
9. Notificación al Dueño (ver punto 5).

**Re-solicitud — `ComercioCorreccionService.reSolicitar` (`@Transactional`):**
1. `duenoRepository.findByIdConBloqueo` (`FOR UPDATE`) → `404` "Comercio no encontrado".
2. `comercioRepository.findByIdAndDuenoIdConBloqueo` (`FOR UPDATE`) → `404` "Comercio no encontrado" (ajeno o inexistente, idéntico).
3. Estado `PENDIENTE` → `409` "Este comercio ya fue enviado nuevamente a revisión"; cualquier estado distinto de `RECHAZADO` → `404` "Comercio no encontrado".
4. `cantidad_resolicitudes >= 3` → `409` "Ya usaste todas las re-solicitudes disponibles para este comercio".
5. `tokenVersion` ≠ id de la última fila de historial con destino `RECHAZADO` (0 si no hay) → `409` "La solicitud cambió desde que abriste la corrección. Volvé a abrirla para continuar".
6. `legales != null` pero el Dueño ya tuvo un comercio aprobado (`AprobacionPreviaDueno.duenoTuvoComercioAprobado`) → `409` "No podés modificar los datos fiscales ni del representante".
7. `ValidadorDatosNegocioComercio.validar` + `NombreComercioService.validar(nombre, comercioId)` (excluye su propio id).
8. `ComercioEdicionService.*` aplica cambios y los acumula: nombre/descripción/teléfono, tipo, modalidades, foto (si cambia valida carpeta `comercios/{comercioId}/perfil/` → `400` "La foto de perfil no es válida. Subila de nuevo desde el formulario."), dirección (actualiza en el lugar), horarios (`reemplazarHorarios`: **borra todas las filas de `horario` del comercio** y las inserta de nuevo, sin versionado), redes (`sincronizarRedes`: baja/alta/revive por `UNIQUE (comercio_id, tipo)`), y legales (CUIT/DNI repetidos → `409` "Ya existe una cuenta registrada con ese CUIT"/"…con ese DNI").
9. Sin ningún cambio → `409` "Modificá al menos un dato antes de volver a solicitar".
10. `cantidad_resolicitudes + 1`, `fecha_resolicitud = now`, `registrarTransicionAutomatica(RECHAZADO → PENDIENTE, "Nueva solicitud del Dueño")` (sin administrador) y una fila por campo en `historial_cambio_comercio` (`valor_anterior`/`valor_nuevo`).

### 4. Efectos sobre la base de datos

- Resolver: `comercio` (`estado`, `fecha_modificacion`), `historial_estado_comercio` (1 o 2 filas), `notificacion` (1 fila). Lee `usuario`, `cuenta_mercado_pago`, `documento_comercio` (con bloqueo compartido) al aprobar.
- Re-solicitud: `comercio` (`cantidad_resolicitudes`, `fecha_resolicitud`, `fecha_modificacion`, campos editados), `direccion`, `horario` (borra y reinserta), `red_social`, `persona_juridica`/`persona_fisica` (solo si `legales`), `historial_estado_comercio` (1 fila), `historial_cambio_comercio` (N filas, `ON DELETE CASCADE` desde el historial).
- **Reinicio:** la re-solicitud **no** reinicia `cantidad_resolicitudes` (lo incrementa); no reinicia documentos (aún no hay). El comercio vuelve a `PENDIENTE` y reaparece en la bandeja de re-solicitudes (`cantidad_resolicitudes > 0`), no en la de nuevas.
- Todo dentro de una transacción; si falla algo (p. ej. un `409`) se revierte entero y **no se gasta el intento**.

### 5. Efectos secundarios

- **Notificación in-app (única):** `notificacionService.crearParaDueno` con `entidad_tipo=COMERCIO`, `comercio_id`, en la misma transacción. Textos literales: aprobado → "Tu comercio {nombre} fue aprobado" (o "… fue aprobado y ya podés vender" si quedó `APTO_VENTA`); rechazo corregible → "Tu comercio {nombre} fue rechazado. Motivo: {motivo con punto final} Corregilo y volvé a solicitarlo."; rechazo definitivo → "Tu comercio {nombre} fue rechazado de forma definitiva. Motivo: {motivo}".
- **Email al Dueño: NO se envía** (D-01). El único `emailService` que ve la resolución de un comercio es el de suspensión (`AvisoCuentaService`), no este.
- **Al Administrador:** nada ni en alta ni en re-solicitud (ver hallazgo 4).
- Cloudinary: ninguno en la resolución. La corrección usa la firma `comercios/{comercioId}/perfil/`; el asset viejo **no se borra**.
- Jobs: ninguno.

### 6. Respuesta al usuario

- Administrador: `200` "Comercio resuelto correctamente" (`data: null`); el frontend vuelve a la bandeja (`onResuelto`). Etiqueta "Comercio adicional" en las tarjetas con `esAdicional` y "Intento N de 3" / "Último intento" en re-solicitudes. En el detalle de re-solicitud muestra el motivo del rechazo anterior y los campos cambiados (antes/ahora), ocultando los fiscales si el comercio es adicional.
- Dueño (`PUT .../resolicitud`): `200` "Comercio enviado nuevamente a revisión. Te avisamos cuando lo resuelva el equipo de Bajoneá" + perfil. Pantallas: `comercio-pendiente.html` "En revisión — Tu solicitud fue enviada correctamente y está siendo evaluada por el equipo de Bajoneá. Te informaremos vía email" (D-01); `comercio-rechazado.html` "Tu solicitud fue rechazada" con "Podés corregir los datos y volver a solicitarla. Te quedan N intentos." / "Te queda 1 intento." o, sin intentos, "Ya usaste todos los intentos para volver a solicitar este comercio. Si creés que se trata de un error, contactá a soporte."; botón "Corregir y volver a solicitar" (oculto sin intentos); `comercio-rechazo-definitivo.html` para `RECHAZO_DEFINITIVO`.

### 7. Transiciones de estado del comercio

`PENDIENTE → APROBADO | RECHAZADO | RECHAZO_DEFINITIVO` (por el Administrador); `APROBADO → APTO_VENTA` (automática, 2.ª fila de historial) o `APROBADO → CERRADO_TEMPORALMENTE` (Dueño bloqueado); `RECHAZADO → PENDIENTE` (Dueño, "Nueva solicitud del Dueño"). `RECHAZO_DEFINITIVO` no tiene salida desde la aplicación.

### 8. Concurrencia

Orden de bloqueo `usuario → cuenta_mercado_pago → comercio → documentos`. Dos resoluciones simultáneas: la segunda recibe `409` "El comercio ya fue resuelto". Re-solicitud y resolución concurrentes: ambas toman `comercio FOR UPDATE` y revalidan estado, la segunda ve lo que dejó la primera. `tokenVersion` protege contra pestañas viejas. Dos re-solicitudes del mismo Dueño se serializan por `dueno FOR UPDATE`.

### 9. Desvíos

- **D-01** `requisitos-funcionales-sistema.md` tabla de notificaciones: **T14 "Comercio aprobado — Dueño — App + Email" y T15 "Comercio rechazado — Dueño — App + Email"**. El código solo crea la notificación in-app. Además `F/registro-comercio.html` (éxito: "te vamos a avisar por email cuando quede aprobado") y `F/comercio-pendiente.html` ("Te informaremos vía email") prometen email. El texto del panel de marca de `comercio-pendiente.html` ("Te avisamos por acá apenas lo aprobemos") sí es coherente.
- **D-07** Frontend vs backend: el modal de rechazo del Administrador y el de documentos usan `MAX_MOTIVO = 500`; para comercios es correcto (`@Size(max=500)`), pero para documentos el backend admite **255** (ver P2.04, D-10).
- **D-08** `AprobacionComercioRequestDTO`: `@NotNull` y `@Size(max=500)` sin `message`, por lo que un body inválido devuelve el mensaje por defecto de Bean Validation (no hay texto en español definido). Los docs piden "motivo obligatorio" sin especificar el texto.
- **D-09** La bandeja de pendientes (`listarComerciosPendientes`) no define orden en el repositorio (`findByEstadoAndCantidadResolicitudes` sin `ORDER BY`); el frontend ordena por `fechaRegistro` ascendente (`F/js/admin.js:496`). La de re-solicitudes ordena en el servicio por `fecha_resolicitud` ascendente y luego id. Los docs dicen "la más antigua primero" solo para re-solicitudes.

### 10. Dudas

- **C-05** `reemplazarHorarios` (corrección de un rechazado) borra y reinserta todas las filas sin `vigente_desde`/`vigente_hasta` explícitos (quedan con el default `2000-01-01`); ¿es el comportamiento deseado frente al versionado de `PUT /perfil/horarios`? Es coherente porque el comercio rechazado no opera, pero conviene dibujarlo como flujo distinto.
- **C-06** El historial `RECHAZADO → PENDIENTE` guarda `administrador_id = NULL` y el mismo flujo de aprobación deja el `motivo` del Administrador solo en la fila de rechazo; el motivo de rechazo que ve el Dueño se obtiene de `historial_estado_comercio` (última fila con destino `RECHAZADO`/`RECHAZO_DEFINITIVO`).
- **C-07** Con `comercio.documentacion.requerida=true` y un comercio aprobado sin documentos, `recalcular` no escribe transición ni aviso (queda `APROBADO`). ¿El DFD debería mostrar esa rama como "aprobado sin cambio de aptitud"? Sí es lo que ocurre.

---

## P2.03 — Subida de documentos del comercio por el Dueño

### 1. Disparadores y actores

- Pantalla `F/comercio-documentacion.html` + `F/js/documentos.js` (fila "Documentación" del perfil; botón "Subir documento"; enlaces desde `F/js/pasos-vender.js` con `&subir=1`). Hoja "Subir documento".
- Rol: **solo `DUENO`** (`/api/v1/comercios/**` es `hasRole("DUENO")`; ninguna ruta de documentos figura en `DelegacionEmpleado`). Un Empleado recibe `403`.
- Comercio: `ComercioActivo` por `X-Comercio-Id` (obligatorio; `ComercioActivoService`: header ausente/blanco `400` "Falta indicar el comercio", no numérico `400` "El comercio indicado no es válido", ajeno `404` "Comercio no encontrado" con `data.codigo=COMERCIO_NO_DISPONIBLE`).
- Endpoints (`DocumentoComercioController`, `/api/v1/comercios/documentos`): `GET` (lista y cupos), `GET /requisitos`, `POST` (multipart, `201`), `DELETE /{id}`, `GET /{id}/archivo`.

### 2. Entradas

`SubirDocumentoComercioRequestDTO` (`multipart/form-data`):

| Campo | Backend | Frontend |
|---|---|---|
| `tipo` | `@NotNull` "Elegí el tipo de documento" | "Elegí el tipo de documento" |
| `descripcion` | `@Size(max=100)` "La descripción puede tener hasta 100 caracteres"; `@AssertTrue` "Contanos qué documento es" si el tipo es `OTRO`; se guarda solo con `OTRO` | "Contanos qué documento es" |
| `archivo` | `@NotNull` "Elegí el archivo que vas a subir" | "Elegí el archivo que vas a subir" |

Tipos (`TipoDocumentoComercio`): `LIBRETA_SANITARIA` "Libreta sanitaria", `CARNET_MANIPULACION_ALIMENTOS` "Carnet de manipulación de alimentos", `HABILITACION_COMERCIAL` "Habilitación comercial", `OTRO` "Otro".

Archivo: PDF, JPG, PNG o WebP; máx. **8 MB** (`comercio.documentacion.max-bytes`); frontend valida extensión (`pdf, jpg, jpeg, png, webp`) y tamaño: "Ese formato no está permitido. Subí un archivo PDF, JPG, PNG o WebP." / "El archivo pesa {x} y el máximo es {y}. Probá sacando la foto con menos calidad o subí un PDF más liviano." / "El archivo está vacío. Elegí otro."

### 3. Secuencia en el servicio (`DocumentoComercioService.subir`)

Antes de abrir transacción (nada retiene un bloqueo):
1. tamaño `<= 0` → `400` `DOCUMENTO_FORMATO_NO_PERMITIDO` "El archivo está vacío".
2. tamaño `> maxBytes` → `400` `DOCUMENTO_TAMANO_EXCEDIDO` "El archivo pesa {peso real} y el máximo es 8 MB".
3. `archivo.getBytes()`; error de lectura → `400` "No pudimos leer el archivo. Probá de nuevo".
4. Firma de bytes (`FirmaArchivo.detectar`, nunca extensión ni `Content-Type`) → `400` `DOCUMENTO_FORMATO_NO_PERMITIDO` "Solo se aceptan archivos PDF, JPG, PNG o WebP".
5. `nombreSeguro` (sin ruta ni caracteres de control, máx. 255).

Dentro de `TransactionTemplate`:
6. `leerDueno(duenoId)` (usuario compartido + `cuenta_mercado_pago FOR UPDATE`) y `bloquearComercio` (`FOR UPDATE` con `refresh`).
7. Estado del comercio ∉ {`APROBADO`, `APTO_VENTA`, `CERRADO_TEMPORALMENTE`, `SUSPENDIDO`} → `409` `COMERCIO_ESTADO_NO_PERMITE_DOCUMENTOS` "Tu comercio no puede recibir documentos en este momento". (Un `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO` o `INACTIVO` **no** puede subir.)
8. Total ≥ 20 → `409` `DOCUMENTO_CUPO_TOTAL` "Llegaste al máximo de 20 documentos por comercio" (los rechazados cuentan).
9. En revisión ≥ 5 → `409` `DOCUMENTO_CUPO_REVISION` "Ya tenés 5 documentos en revisión. Esperá a que los revisemos para subir otro".
10. Inserta fila y binario; **recalcula la aptitud** (`MotivoRecalculo.DOCUMENTO_SUBIDO`).

Otros endpoints: `eliminar` → `404` "Documento no encontrado" (ajeno/inexistente), `409` `DOCUMENTO_NO_ELIMINABLE` "Solo podés eliminar documentos que todavía están en revisión"; `GET archivo` → `404` "Documento no encontrado".

### 4. Efectos sobre la base de datos

- `documento_comercio`: `tipo`, `descripcion` (solo `OTRO`), `nombre_original`, `tipo_mime` (por firma), `tamano_bytes`, `estado=PENDIENTE`, `fecha_subida` (reloj único), `subido_por_usuario_id` (= `actorUsuarioId`).
- `documento_comercio_archivo`: `documento_id` (PK/FK), `contenido LONGBLOB` (tabla aparte para que los listados no lean el binario).
- Recalcular: puede pasar el comercio `APTO_VENTA → APROBADO` si ya no cumple la regla de seguir (no aplica al subir: subir solo agrega un `PENDIENTE`, que no corta la aptitud de seguir, pero sí **impide entrar** a `APTO_VENTA` mientras haya pendientes).
- Eliminar: borra `documento_comercio_archivo` y `documento_comercio`; recalcula (`DOCUMENTO_ELIMINADO`), lo que puede **habilitar** la entrada a `APTO_VENTA` si era el único pendiente.
- Todo en una transacción; `max_allowed_packet` de MySQL debe ser ≥ 16 MB (lista de despliegue).

### 5. Efectos secundarios

- **Cloudinary: no interviene.** No hay firma, carpeta ni borrado de assets.
- **Reemplazo:** no existe. Para "reemplazar", el Dueño elimina el `PENDIENTE` (solo propios en revisión) o sube uno nuevo; un `RECHAZADO` se conserva como constancia ("Subir uno nuevo" abre la hoja de subida).
- **Notificaciones / email:** ninguno al subir (ni al Dueño ni al Administrador; el Administrador lo ve en el contador `documentosPendientes` de las métricas).
- **Descarga:** `GET /{id}/archivo` con `Content-Type` real, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`; el frontend lo pide con `fetch` y el header `Authorization` a un blob (nunca token en la URL). `Caddyfile` suma `blob:` a `frame-src` para el PDF.
- **Jobs:** ninguno. **Vencimiento:** ninguno.

### 6. Respuesta al usuario

- Éxito `201`: "Documento subido. Lo vamos a revisar a la brevedad"; toast "Documento enviado. Lo estamos revisando."; eliminar: "Documento eliminado" (`200`).
- Errores: banner en la hoja con `mensajeConSugerencia` (agrega sugerencias por código: `DOCUMENTO_TAMANO_EXCEDIDO` "Probá sacando la foto con menos calidad o subí un PDF más liviano.", `DOCUMENTO_FORMATO_NO_PERMITIDO` "Si es una foto, guardala como JPG o PNG.", `COMERCIO_ESTADO_NO_PERMITE_DOCUMENTOS` "Volvé a intentarlo cuando tu comercio esté operativo."); sin conexión: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo."; timeout de subida 180 s.
- Pantalla: secciones "En revisión", rechazados (con motivo), aprobados; con comercio suspendido: "El comercio está suspendido. Podés subir documentos, pero no vuelve a vender hasta que se levante la suspensión."; sin documentos: "Para vender necesitás al menos un documento aprobado. Lo revisamos y te avisamos por acá." y lista "Qué podés subir". Confirmación de descarte "¿Descartar los cambios?" / "Seguir editando"; confirmación de eliminar "¿Eliminar este documento?".

### 7. Transiciones

Documento: *(nada)* → `PENDIENTE`; `PENDIENTE → eliminado` (borrado físico). Comercio: ninguna directa, pero el recalculo puede dejarlo en `APROBADO`/`APTO_VENTA` según la regla de P2.04. Con el comercio `SUSPENDIDO` subir/eliminar **no** lo saca de ahí.

### 8. Concurrencia

Orden `usuario → cuenta_mercado_pago → comercio (FOR UPDATE) → documento (FOR UPDATE) → resto`. Los contadores de cupo se leen con bloqueo compartido de `documento_comercio` (`estadosDelComercioConBloqueoCompartido`), con el comercio ya bloqueado: dos subidas simultáneas no superan el cupo. Eliminar y resolver el mismo documento: el segundo encuentra otro estado (`409`).

### 9. Desvíos

- **D-02** La consigna del tramo asume "componente de subida Cloudinary (firma + subida directa)". **No es así**: los documentos son privados, entran por el backend y viven en la base. (Los docs, `requisitos-funcionales-dueño.md` línea ~329-335, lo describen correctamente: "validados por su contenido".) Hay que dibujar el flujo con el binario atravesando el backend, no con una nube externa.
- **D-10** Backend: `ResolverDocumentoRequestDTO.motivo` `@Size(max=255)` y columna `motivo_rechazo varchar(255)`; **frontend**: `F/js/admin-documentos.js:114` usa `maxlength = MAX_MOTIVO` (500, constante de `F/js/admin-hojas.js:6`). Un motivo de 256 a 500 caracteres pasa el control de pantalla y el servidor lo rechaza con `400` ("El motivo puede tener hasta 255 caracteres"). Los docs (`requisitos-funcionales-administrador.md`) dicen 255.
- **D-11** `requisitos-funcionales-dueño.md`: "la exigencia de documentos es un interruptor de configuración (`comercio.documentacion.requerida`)". Coincide; en `application.properties` el valor por defecto está en la clase (`DocumentacionComercioProperties.requerida=true`), no explícito en el archivo.

### 10. Dudas

- **C-08** `INACTIVO` no figura entre los estados que permiten subir (`ESTADOS_QUE_PERMITEN_SUBIR`), aunque sí cuenta en `ESTADOS_CON_COMERCIO_APROBADO` de los requisitos; es coherente con "inactivo = solo lectura", pero los docs de Dueño no lo mencionan explícitamente.
- **C-09** El borrado de un documento propio `PENDIENTE` es físico y no deja auditoría (no hay historial de documentos). ¿Se desea registrar quién subió y eliminó? Hoy solo `subido_por_usuario_id` de las filas que subsisten.

---

## P2.04 — Revisión de documentos por el Administrador y cálculo de `APTO_VENTA`

### 1. Disparadores y actores

Rol `ADMINISTRADOR` (`/api/v1/administrador/**`, sin `X-Comercio-Id`). Pantallas: `admin-documentos.html` (bandeja), `admin-documento-revision.html?id=&comercioId=` (revisión), botón "Ver documentos" del modal de cada comercio (`F/js/admin-documentos.js`).

| Acción | Endpoint (`DocumentoAdministradorController`) |
|---|---|
| Bandeja | `GET /administrador/documentos/pendientes` (más antiguos primero) |
| Documentos de un comercio | `GET /administrador/comercios/{comercioId}/documentos` |
| Archivo | `GET /administrador/documentos/{id}/archivo` |
| Resolver | `PUT /administrador/documentos/{id}/resolver` |

### 2. Entradas

`ResolverDocumentoRequestDTO`: `aprobar` `@NotNull` "Indicá si aprobás o rechazás el documento"; `motivo` `@Size(max=255)` "El motivo puede tener hasta 255 caracteres"; `@AssertTrue` "El motivo es obligatorio al rechazar un documento". Frontend: modal "Rechazar documento" ("El Dueño va a ver este motivo y podrá subir un documento nuevo.") con "El motivo es obligatorio."; "¿Aprobar este documento?"; "Revocar aprobación" ("… Si era el único aprobado, el comercio deja de recibir pedidos."); toasts "Documento aprobado", "Documento rechazado", "Aprobación revocada".

### 3. Secuencia (`RevisionDocumentoService.resolver`)

1. Lee `comercio_id` del documento y `dueno_id` del comercio (fuera de la transacción) → `404` "Documento no encontrado" / "Comercio no encontrado".
2. `TransactionTemplate`: `leerDueno`, `bloquearComercio`, `documento FOR UPDATE`.
3. Reglas: **aprobar** solo sobre `PENDIENTE`; **rechazar** sobre `PENDIENTE` y sobre `APROBADO` (revocación); un `RECHAZADO` no se resuelve → `409` `DOCUMENTO_YA_RESUELTO` "El documento ya fue resuelto".
4. Escribe `estado`, `motivo_rechazo` (`null` al aprobar), `fecha_resolucion`, `administrador_id`.
5. `aptitudVentaComercioService.recalcular(comercio, entradas, motivo, null)` con motivo `DOCUMENTO_APROBADO` / `DOCUMENTO_RECHAZADO` / `DOCUMENTO_REVOCADO`.
6. Notificación al Dueño.

### 4. Regla exacta de `APTO_VENTA` (`AptitudVentaComercioService.decidir`, función pura)

Entradas: estado actual, Dueño `BLOQUEADO`, cuenta de Mercado Pago activa (`cuenta_mercado_pago.activa`), nº de documentos `APROBADO`, nº `PENDIENTE`, interruptor `comercio.documentacion.requerida` (por defecto `true`).

- `puedeEntrar = MP activa && (!requerida || (aprobados ≥ 1 && pendientes == 0))`
- `puedeSeguir = MP activa && (!requerida || aprobados ≥ 1)`

| Estado actual | Resultado |
|---|---|
| `APROBADO` | `puedeEntrar` → `APTO_VENTA` (o `CERRADO_TEMPORALMENTE` si el Dueño está bloqueado); si no → `APROBADO` |
| `APTO_VENTA` | `!puedeSeguir` → `APROBADO`; si sigue y Dueño bloqueado → `CERRADO_TEMPORALMENTE`; si no → `APTO_VENTA` |
| `SUSPENDIDO` | **no se mueve** salvo motivo `SUSPENSION_LEVANTADA` (lo decide `destinoAlLevantarSuspension`) |
| `CERRADO_TEMPORALMENTE`, `INACTIVO` | solo se mueven con motivo `DUENO_RESTAURADO` (y sin bloqueo): `puedeSeguir` → `APTO_VENTA`, si no → `APROBADO` |
| otros (`PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO`) | no participan |

**Cuándo se recalcula** (`MotivoRecalculo`): `COMERCIO_APROBADO` (aprobación), `MP_VINCULADO`/`MP_DESVINCULADO` (`recalcularComerciosDelDueno`, todos los comercios del Dueño), `DOCUMENTO_SUBIDO`/`ELIMINADO`/`APROBADO`/`RECHAZADO`/`REVOCADO`, `DUENO_BLOQUEADO`/`DUENO_RESTAURADO` (`cerrarPorBloqueo`, `restaurar`) y `SUSPENSION_LEVANTADA`. No hay job de recálculo.

**Si se invalida un documento después:** rechazar o revocar el **último** documento `APROBADO` de un comercio `APTO_VENTA` lo baja a `APROBADO` (`!puedeSeguir`); si quedan otros aprobados sigue vendiendo. Subir un documento nuevo o que rechacen uno extra no corta las ventas. Con documentación exigida, la entrada a `APTO_VENTA` además requiere **ningún documento en revisión**.

### 5. Efectos secundarios

- **Notificación in-app al Dueño** (`crearParaDueno`, con `comercio_id`):
  - aprobar: "Tu documento «{etiqueta}» de {comercio} fue aprobado." (`DOCUMENTO_APROBADO`);
  - rechazar: "Tu documento «{etiqueta}» de {comercio} fue rechazado. Motivo: {motivo}. Subí uno nuevo." (`DOCUMENTO_RECHAZADO`);
  - revocar: "Se revocó la aprobación de tu documento «{etiqueta}» de {comercio}. Motivo: {motivo}. Subí uno nuevo." (`DOCUMENTO_RECHAZADO`);
  - cambio de aptitud (`avisarCambio`): `APROBADO → APTO_VENTA`: "Tu comercio {nombre} ya puede recibir pedidos." (`COMERCIO_APTO_VENTA`); cualquier `→ APROBADO`: "Tu comercio {nombre} dejó de recibir pedidos: {falta vincular Mercado Pago | falta tener un documento aprobado | falta vincular Mercado Pago y tener un documento aprobado | no cumple los requisitos para vender}." (`COMERCIO_SIN_APTITUD`).
- **Email: ninguno** (coincide con los docs: "no recibe email").
- **Historial:** cada cambio de estado deja fila en `historial_estado_comercio` (`administrador_id` nulo, motivo: "Documento aprobado por el Administrador", "Documento rechazado por el Administrador", "Documento revocado por el Administrador", "Documento subido para revisión", "Documento pendiente eliminado", "Vinculación automática de cuenta de Mercado Pago", "Desvinculación de cuenta de Mercado Pago", "Bloqueo de cuenta", "Restauración de cuenta", "Suspensión levantada", "Bloqueo de cuenta vigente al aprobar / al vincular Mercado Pago / al revisar la documentación"). Los documentos no tienen historial propio (solo `administrador_id` y `fecha_resolucion` de la última resolución).
- **Vencimientos / jobs:** no hay vencimiento de documentos ni job. (Para P7: los jobs de este dominio son `ReaperturaComerciosJob` `@Scheduled(fixedDelay = 60_000)` y, fuera de este tramo, `CierreTurnoJob`; ninguno procesa documentos.)

### 6. Respuesta

`200` "Documento aprobado" / "Documento rechazado" con el `DocumentoComercioResponseDTO`. La pantalla de revisión muestra vista previa (imagen o PDF por blob), datos del comercio ("Mercado Pago: vinculado/sin vincular", `cuentaMercadoPagoVinculada`), "Otros documentos de este comercio" y "Tu decisión". Bandeja vacía: "No hay documentos por revisar." / "Cuando un comercio suba un documento, va a aparecer acá." Efecto en el Dueño: bloque "Para empezar a vender" (`F/js/pasos-vender.js`: pasos "Comercio aprobado", "Vincular Mercado Pago"/"Mercado Pago vinculado", "Subir documentación"/"Documentación en revisión"/"Documentación aprobada"/"Tenés un documento rechazado"), con un "Todo listo / Tu comercio ya puede recibir pedidos." de un solo uso.

### 7. Transiciones

Documento: `PENDIENTE → APROBADO`, `PENDIENTE → RECHAZADO`, `APROBADO → RECHAZADO` (revocación). `RECHAZADO` es terminal. Comercio: ver tabla de `decidir`.

### 8. Efectos sobre visibilidad y pedidos cuando cambia la aptitud

- `APTO_VENTA` y `CERRADO_TEMPORALMENTE` son los estados que lista el catálogo (`ComercioService.ESTADOS_VISIBLES_EN_CATALOGO`); `listarAprobados` expone `estado=APTO_VENTA` y `estadoApertura`. Al volver a `APROBADO` el comercio **sale del catálogo** y no acepta pedidos nuevos (`validarAceptaPedidos` → `409` "Este comercio no está aceptando pedidos en este momento"; `CERRADO_TEMPORALMENTE` → "Este comercio está cerrado en este momento"; `SUSPENDIDO` → `ConflictoComercioException.SIN_PEDIDOS`). `confirmarPedido` revalida `APTO_VENTA` con lectura bloqueante.
- Los **pedidos en curso no se tocan**: perder la aptitud no cancela ni reembolsa nada (el webhook, la sincronización y las acciones del comercio no revisan la aptitud).

### 9. Concurrencia

Mismo orden que P2.03; el documento se toma `FOR UPDATE` y se revalida el estado dentro de la transacción. Dos revisiones simultáneas del mismo documento: la segunda recibe `409` `DOCUMENTO_YA_RESUELTO`. Una vinculación de Mercado Pago concurrente espera (toma `cuenta_mercado_pago FOR UPDATE` antes que el comercio).

### 10. Desvíos y dudas

- **D-10** (ver P2.03) motivo de documento: 500 en pantalla vs. 255 en servidor/base.
- **D-12** `requisitos-funcionales-dueño.md` (línea ~143) dice que al vincular Mercado Pago "los comercios Aprobados … que además tienen al menos un documento aprobado y ninguno en revisión pasan automáticamente a Apto para Venta": coincide con `decidir`. Pero `CLAUDE.md` §1bis (tramo C1/C2, anterior a Fase 4) describe todavía la regla de solo-Mercado-Pago; es un desvío de la memoria de proyecto, no del código.
- **C-10** Revocar el único aprobado de un comercio `APTO_VENTA` con pedidos `PENDIENTE_CONFIRMACION_COMERCIO` en curso: el comercio sigue pudiendo aceptarlos? `ComercioService.validarAceptaPedidos` solo se llama al agregar al carrito y confirmar el pedido; `PedidoService.aceptar` no chequea aptitud (por eso la tabla de arriba dice "no se tocan"). Conviene que Diego confirme que es intencional.
- **C-11** No hay un tope de re-subidas tras múltiples rechazos más allá del cupo total de 20 (los rechazados cuentan): un Dueño que acumula 20 rechazados queda sin poder subir y sin forma de borrarlos (solo se eliminan `PENDIENTE`). No hay acción de limpieza en la aplicación.

---

## P2.05 — Datos, horarios y redes sociales del comercio (Dueño y Empleado)

### 1. Disparadores, actores y resolución

Pantallas: `F/comercio-perfil.html` con vistas `view-editar-perfil` (Dueño), `view-editar-datos-comercio` (Empleado), `view-editar-horarios` (ambos). **Redes sociales: no existe pantalla de edición** (D-13).

Resolución del comercio: `X-Comercio-Id` → `ComercioActivoArgumentResolver` / `ComercioActivoService.resolver` (Dueño: el comercio debe ser suyo en cualquier estado; Cliente-Empleado: relación `empleado_comercio` `ACTIVO` comprobada contra la base en cada request y comercio en {`APROBADO`, `APTO_VENTA`, `SUSPENDIDO`, `CERRADO_TEMPORALMENTE`, `INACTIVO`}; Administrador: nunca). Todo rechazo de acceso es el mismo `404` `COMERCIO_NO_DISPONIBLE`.

| Operación | Endpoint | Dueño | Empleado | En `DelegacionEmpleado` |
|---|---|---|---|---|
| Ver perfil | `GET /comercios/perfil` | `ComercioResponseDTO` completo | `ComercioEmpleadoResponseDTO` reducido | sí |
| Editar datos completos | `PUT /comercios/perfil` | nombre, descripción, teléfono, modalidades | **`403`** (matcher `hasRole("DUENO")`) | no |
| Editar descripción y teléfono | `PUT /comercios/perfil/datos-operativos` | sí (respuesta completa) | sí (respuesta reducida) | sí |
| Foto de perfil | `POST /comercios/perfil/foto/firma`, `PUT /comercios/perfil/foto` | sí | `403` | no |
| Horarios | `PUT /comercios/perfil/horarios` | sí | sí | sí (ruta n.º 24) |
| Redes sociales | `GET/POST/PUT/DELETE /comercios/redes-sociales[/{id}]` | sí | `403` | no |

Nombre, dirección, tipo de comercio y datos fiscales **no tienen endpoint de edición** para un comercio aprobado (la dirección, el tipo y la foto solo se corrigen en la re-solicitud de un rechazado; el CUIT y el representante solo ahí y solo si nunca hubo aprobación).

### 2. Entradas y validaciones

**`PUT /comercios/perfil/datos-operativos`** (`ComercioDatosOperativosRequestDTO`):
- `descripcion`: `@Size(max=2000)` "La descripción no puede superar los 2000 caracteres." (con punto). **No es obligatoria: si el cuerpo no la trae (o trae `null`), el servidor la deja en `null`** — `editarDatosOperativos` asigna `comercio.setDescripcion(request.getDescripcion())` incondicionalmente, es decir **se borra**. El frontend del Empleado envía `descripcionInput.value.trim() || null` (vaciar el campo también la borra).
- `telefono`: `@NotBlank` "No debe estar vacío", `@ValidarTelefonoArgentino`, `@Size(max=30)`.
- Cualquier otra propiedad (`nombre`, `aceptaDelivery`, `horarios`, etc.): recogida por `@JsonAnySetter`; `@AssertTrue isSoloDescripcionYTelefono` falla con el mensaje **"Solo se pueden enviar la descripción y el teléfono"**. Respuesta `400` con `data = {"soloDescripcionYTelefono": "Solo se pueden enviar la descripción y el teléfono"}` y `mensaje = "soloDescripcionYTelefono: Solo se pueden enviar la descripción y el teléfono"` (formato `campo: mensaje` de `handleMethodArgumentNotValid`). No cambia nada.
- Frontend (Empleado): "Ingresá el teléfono del comercio." / "Ingresá un teléfono argentino válido (código de área + número)."; toast "Datos actualizados correctamente"; el `409` sale en un aviso fijo.

**`PUT /comercios/perfil`** (`ComercioPerfilRequestDTO`, solo Dueño): `nombre` `@NotBlank` "No debe estar vacío" + `@Pattern` "Ingresá un nombre de comercio válido" + `@Size(max=150)`; `descripcion` `@Size(max=2000)`; `telefono` igual que arriba; `aceptaDelivery`/`aceptaRetiro` (al menos una: `400` "El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)"). Nombre repetido → `409` "Ya existe un comercio con ese nombre. Elegí otro." (solo si cambia). Frontend: "Ingresá el nombre de tu comercio.", "El nombre no puede contener solo caracteres especiales.", "Ingresá tu teléfono.", "Debés ofrecer al menos una modalidad de entrega."; toast "Datos actualizados correctamente".

**`PUT /comercios/perfil/horarios`** (`ComercioHorariosRequestDTO`): `horarios` `@NotEmpty` "Cargá al menos un horario de atención"; cada franja `diaSemana`/`horaApertura`/`horaCierre` `@NotNull`. Reglas de `ValidadorHorarios` (ver P2.01: cierre = apertura, superposición en semana circular, cierre < apertura = cruza la medianoche; `23:59` vale `24:00`). **Días sin franja = cerrado ese día** (no hay indicador). Horario partido = 2+ filas del mismo día.

**Redes sociales** (`RedSocialRequestDTO`, endpoints de `RedSocialController`): tipos permitidos `INSTAGRAM, FACEBOOK, TIKTOK, WHATSAPP, X, SITIO_WEB, OTRO`; URL con letra y punto, sin espacios, ≤500; el servidor normaliza el esquema.

### 3. Secuencia en el servicio

**Datos operativos — `ComercioService.editarDatosOperativos`:**
1. `HistorialEdicionComercioService.iniciarEscritura(actor)`: `EstadoUsuarioService.exigirNoSuspendido` (cuenta del actor) y, si es Empleado, `exigirRelacionActiva` (`LOCK IN SHARE MODE` sobre `empleado_comercio`; relación inactiva → `404` `COMERCIO_NO_DISPONIBLE`).
2. `comercio FOR UPDATE` (`refresh`).
3. `validarComercioModificable`: Empleado y estado no accesible → `404`; **`SUSPENDIDO` → `409` `COMERCIO_SUSPENDIDO` "El comercio está suspendido: por ahora no se puede modificar."** (aplica también al Dueño desde el cierre de la Fase 5); **`INACTIVO` → `409` `COMERCIO_INACTIVO` "El comercio está inactivo: por ahora no se puede modificar."** `CERRADO_TEMPORALMENTE` sí permite editar.
4. Compara contra lo guardado; actualiza `descripcion`, `telefono`, `fecha_modificacion`.
5. Solo si hubo cambio efectivo: inserta `historial_edicion_comercio` (`entidad_tipo=COMERCIO`, `accion=EDITAR`, `detalle` con los **nombres** de los campos, nunca valores, ≤255).

**Horarios — `HorarioEdicionService.editarHorarios` (versionado, rige desde mañana):**
1. `iniciarEscritura`; `comercio FOR UPDATE`; `validarComercioModificable` (mismos `404`/`409`).
2. `ValidadorHorarios.validar(nuevos)` (`400` con los textos de P2.01).
3. Lee las filas vigentes con bloqueo (`horario` es hoja bajo `comercio`); borra el cambio programado anterior si había; compara franjas ignorando el orden.
4. Si son iguales a lo vigente: cancela el cambio programado ("Canceló el cambio de horarios programado") o no hace nada.
5. Si difieren: `validarColaDelTurnoDeHoy` (si un turno de hoy cruza la medianoche y la franja nueva de mañana empieza antes de su cierre → `400` "Tu turno de hoy ({día} de {HH:mm} a {HH:mm}) termina el {día} a las {HH:mm} y se superpone con la franja del {día} de {HH:mm} a {HH:mm}. Movela para que empiece después de las {HH:mm}."); cierra lo vigente con `vigente_hasta = hoy` e inserta lo nuevo con `vigente_desde = mañana`. Detalle de auditoría: "Editó: horarios (rigen desde dd/MM/yyyy)". Respuesta: vigentes, pendientes y `rigeDesde` (`HorariosComercioResponseDTO`).
6. `historial_edicion_comercio` con `entidad_tipo=HORARIO`.

**Redes sociales — `RedSocialService`** (Dueño; cada método: `iniciarEscritura` + `exigirComercioModificable` con lectura compartida del comercio): `agregar` → `409` "El comercio ya tiene una red social activa de tipo {TIPO}" / "El comercio ya tiene el máximo de 5 redes sociales activas"; reactiva una dada de baja del mismo tipo (por `UNIQUE (comercio_id, tipo)`); `editar` → `404` "Red social no encontrada" (ajena/inexistente); `darDeBaja` pone `fecha_baja` (baja lógica). Todas dejan `historial_edicion_comercio` (`RED_SOCIAL`, `CREAR`/`EDITAR`/`ELIMINAR`).

### 4. Efectos sobre la base de datos

`comercio` (descripción, teléfono, nombre, modalidades, `fecha_modificacion`), `horario` (inserta nuevas filas con `vigente_desde`, cierra las vigentes con `vigente_hasta`, borra el cambio programado), `red_social` (alta/baja lógica/edición), `historial_edicion_comercio` (siempre en la misma transacción y solo ante cambio efectivo). Las lecturas de horario solo devuelven lo vigente más lo programado.

### 5. Efectos secundarios

- Emails y notificaciones: **ninguno** (ni al Dueño cuando edita el Empleado; no hay aviso de edición).
- Cloudinary: solo la foto de perfil (`comercios/{comercioId}/perfil/`, validada en `PUT /perfil/foto` y en `actualizarFoto` de la re-solicitud); el asset anterior no se borra.
- Auditoría: la pestaña "Actividad" del Dueño y la ficha del Administrador leen `historial_edicion_comercio` (el rol del actor, `EMPLEADO` o `DUENO`, queda registrado).
- Jobs: `ReaperturaComerciosJob` (`@Scheduled(fixedDelay=60_000)`) reabre comercios cerrados a mano en la primera franja siguiente y se apoya en los horarios vigentes (relación con el cierre manual, abajo).

### 6. Respuesta al usuario

Éxito `200`: "Perfil actualizado correctamente" (datos operativos y perfil), "Foto de perfil actualizada correctamente", "Horarios actualizados correctamente"; redes: `201` "Red social agregada correctamente", "Red social actualizada correctamente", "Red social dada de baja correctamente". Toasts del frontend: "Datos actualizados correctamente", "Horarios guardados. Rigen desde mañana.", "No hiciste cambios en los horarios", "Cambio de horarios cancelado". Errores: `409` de reglas de negocio → aviso fijo; `400` de horarios → `error-horarios`.

### 7. Relación con el cierre manual y el estado abierto/cerrado

`DisponibilidadComercioService` calcula abierto/cerrado con el reloj único (`Clock`, `app.zona-horaria`, por defecto `America/Argentina/Ushuaia`) sobre las franjas vigentes: `abiertoAhora` = dentro de una franja y no `cerrado_manualmente`; `puedeCambiarCierre` solo dentro de una franja y con el comercio `APROBADO`/`APTO_VENTA`. Cerrar/abrir son endpoints aparte (`PUT /comercios/cerrar|abrir`, delegables); editar horarios no cambia `cerrado_manualmente`; el cambio rige desde mañana, así que no afecta el turno de hoy. Los turnos que cruzan la medianoche son una sola fila con `hora_cierre < hora_apertura` (el día es el de apertura). El cierre manual solo frena pedidos nuevos.

### 8. Comportamiento según el estado del comercio

| Estado | Dueño | Empleado |
|---|---|---|
| `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO` | edita (no hay guard) salvo que `ComercioActivoService` lo resuelva; no hay pantalla del panel normal (va a estado) | sin acceso (`404`) |
| `APROBADO`, `APTO_VENTA` | edita | edita datos operativos y horarios |
| `CERRADO_TEMPORALMENTE` | edita | edita |
| `SUSPENDIDO` | `409` `COMERCIO_SUSPENDIDO` | `409` `COMERCIO_SUSPENDIDO` |
| `INACTIVO` | `409` `COMERCIO_INACTIVO` | `409` `COMERCIO_INACTIVO` (ve en solo lectura) |

### 9. Concurrencia

Orden `usuario → empleado_comercio → comercio (FOR UPDATE directo, no compartido y luego exclusivo: dos ediciones a la vez se interbloquearían) → horario/historial`. `HistorialEdicionComercioService.registrar` vuelca (`flush`) las escrituras pendientes antes de insertar para no mejorar bloqueos. Una desactivación del Empleado concurrente espera a la escritura y la siguiente ve `INACTIVO` → `404`.

### 10. Desvíos y dudas

- **D-13** `F/js/api.js:27` incluye `redes-sociales` en `RUTAS_DEL_DUENO` y el backend tiene los 4 endpoints (`RedSocialController`), pero **ninguna pantalla los llama** (búsqueda de `redes-sociales` en `frontend/js`: solo esa línea). Las redes solo se cargan en el alta y se corrigen en la re-solicitud de un rechazado; un comercio aprobado no puede editarlas desde la interfaz. `requisitos-funcionales-dueño.md` líneas ~386 ("Gestionar los enlaces a redes sociales") asumen que sí.
- **D-14** `requisitos-funcionales-empleado.md` (~línea 156): "no puede modificar … la descripción, el teléfono ni los horarios (responde conflicto 409 …)" con comercio suspendido; coincide con el código. El Dueño recibe el mismo `409` (cambio de Fase 5, S2); la memoria `CLAUDE.md` §9 lo da aún como hueco abierto ("el Dueño puede editar productos y perfil con el comercio `SUSPENDIDO`"): **está desactualizada respecto del código** (`ComercioActivoService.validarComercioModificable` aplica a `actor` Dueño y Empleado).
- **D-15** `ComercioPerfilRequestDTO.telefono` y `ComercioDatosOperativosRequestDTO.telefono` usan `@NotBlank` sin mensaje propio ("No debe estar vacío"), mientras que el alta usa "El teléfono de contacto es obligatorio"; mismos campos, textos distintos según el flujo.
- **D-16** Borrar la descripción: los docs (`requisitos-funcionales-empleado.md`) no aclaran que omitirla la borra. El código la borra (descripción opcional, sin distinguir "no vino" de "vino vacío").
- **C-12** `PUT /comercios/perfil` (Dueño) no valida con `validarComercioModificable` para `RECHAZADO`/`PENDIENTE`; el panel normal no se muestra en esos estados, pero la API sí lo aceptaría. No se verificó con una llamada real.
- **C-13** El cambio de horarios que cae en el **mismo día** reemplaza al programado sin dejar rastro del reemplazado (solo el último detalle de auditoría). ¿Se necesita historial de versiones de horario? Hoy las filas viejas quedan con `vigente_hasta` en la tabla `horario`.
- **C-14** `RedSocialService.agregar` revive una red dada de baja y registra `AccionEdicion.CREAR`: ¿se debe distinguir "reactivó" de "creó" en la actividad?

---

## Lista consolidada de desvíos (D-xx)

| ID | Resumen | Proceso |
|---|---|---|
| D-01 | T14/T15 y las pantallas de éxito prometen email al aprobar/rechazar un comercio; el código solo crea notificación in-app | P2.01, P2.02 |
| D-02 | Los documentos no usan Cloudinary: multipart al backend, validación por firma de bytes, `LONGBLOB` en MySQL | P2.03 |
| D-03 | Confirmación: el alta adicional reutiliza datos fiscales (coincide con los docs) | P2.01 |
| D-04 | La foto del primer alta no se valida contra carpeta/cuenta de Cloudinary (solo dominio) | P2.01 |
| D-05 | Javadoc de `ComercioDatosOperativosRequestDTO` desactualizado (dice que no hay edición de horarios) | P2.01 / P2.05 |
| D-06 | `requisitos-funcionales-empleado.md` lista "email de contacto" que ya no existe (V36) | P2.01 / P2.05 |
| D-07 | Tope 500 en el modal de rechazo: correcto para comercios, incorrecto para documentos | P2.02 / P2.04 |
| D-08 | `AprobacionComercioRequestDTO` sin mensajes propios en `aprobar`/`motivo` | P2.02 |
| D-09 | Bandeja de pendientes sin `ORDER BY` en el repositorio; el orden lo da el frontend | P2.02 |
| D-10 | Motivo de rechazo de documento: 500 en pantalla vs. 255 en servidor y base | P2.03 / P2.04 |
| D-11 | `comercio.documentacion.requerida` por defecto `true` solo en la clase, no en `application.properties` | P2.03 |
| D-12 | `CLAUDE.md` §1bis (C1/C2) describe la aptitud solo con Mercado Pago; el código exige además documentos (Fase 4) | P2.04 |
| D-13 | Endpoints de redes sociales sin pantalla; un comercio aprobado no puede editarlas desde la UI | P2.05 |
| D-14 | `CLAUDE.md` §9 dice que el Dueño puede editar con el comercio `SUSPENDIDO`; el código ya lo bloquea | P2.05 |
| D-15 | Mensajes de teléfono distintos entre alta y edición | P2.05 |
| D-16 | Omitir la descripción en datos operativos la borra; no está documentado | P2.05 |

## Lista consolidada de dudas (C-xx)

C-01 (sin historial al nacer `PENDIENTE`), C-02 (`vigente_desde` por defecto en el alta), C-03 (alta adicional sin chequeo de estado de la cuenta), C-04 (carrera de CUIT/DNI sin traducción del índice), C-05 (`reemplazarHorarios` sin versionado en la corrección), C-06 (motivo de rechazo leído del historial), C-07 (aprobado sin documentos queda `APROBADO` sin aviso), C-08 (`INACTIVO` no puede subir documentos), C-09 (sin auditoría del borrado de documentos), C-10 (pedidos en curso tras perder la aptitud), C-11 (20 rechazados bloquean la subida sin forma de limpiar), C-12 (`PUT /perfil` sin guard para estados no operativos previos a la aprobación), C-13 (historial de versiones de horario), C-14 (`CREAR` vs reactivar una red dada de baja).

## Archivos revisados

**Backend** (`backend/src/main/java/com/bajonea/backend/`): `controllers/` `AuthController`, `ComercioController`, `AdministradorController`, `DocumentoComercioController`, `DocumentoAdministradorController`, `RedSocialController`; `services/` `RegistroService`, `AltaComercioAdicionalService`, `ComercioCorreccionService`, `ComercioEdicionService`, `ComercioService`, `AdministradorService`, `AptitudVentaComercioService`, `DocumentoComercioService`, `RevisionDocumentoService`, `HorarioEdicionService`, `ValidadorHorarios`, `ValidadorDatosNegocioComercio`, `NombreComercioService`, `CloudinaryService`, `RedSocialService`, `ComercioActivoService`, `AprobacionPreviaDueno`, `LocalidadesHabilitadas`, `HistorialEdicionComercioService`, `NotificacionService`; `dto/request/` `DatosNegocioComercioRequestDTO`, `RegistroComercioRequestDTO`, `AltaComercioAdicionalRequestDTO`, `ReSolicitudComercioRequestDTO`, `DatosLegalesComercioRequestDTO`, `DireccionRequestDTO`, `HorarioRequestDTO`, `ComercioHorariosRequestDTO`, `ComercioPerfilRequestDTO`, `ComercioDatosOperativosRequestDTO`, `RedSocialRequestDTO`, `AprobacionComercioRequestDTO`, `SubirDocumentoComercioRequestDTO`, `ResolverDocumentoRequestDTO`; `config/` `DocumentacionComercioProperties`, `ComercioResolicitudesProperties`, `security/DelegacionEmpleado`, `security/SecurityConfig` (líneas 91-152), `security/RateLimitPublicoFilter`; `enums/` `EstadoComercio`, `TipoDocumentoComercio`, `TipoRedSocial`, `TipoNotificacion`; `util/ComercioValidaciones`; `exceptions/GlobalExceptionHandler`. Migraciones: `V1__baseline_bajonea_final.sql`, `V36`, `V37`, `V38`, `V43`.

**Frontend** (`frontend/`): `registro-comercio.html`, `agregar-comercio.html`, `comercio-pendiente.html`, `comercio-rechazado.html`; `js/auth.js` (`initRegistroComercio`), `js/agregar-comercio.js`, `js/comercio-corregir.js`, `js/comercio-form.js`, `js/cloudinary.js`, `js/admin.js`, `js/admin-hojas.js`, `js/admin-documentos.js`, `js/documentos.js`, `js/documentos-comun.js`, `js/pasos-vender.js`, `js/comercio.js` (perfil, horarios, datos del Empleado), `js/api.js`.

**Documentación:** `01. Análisis de Requerimientos/04. Requisitos Funcionales/` `requisitos-funcionales-administrador.md`, `requisitos-funcionales-dueño.md`, `requisitos-funcionales-empleado.md`, `requisitos-funcionales-sistema.md`.

## Observaciones para otros procesos

- **P7 (jobs):** `ReaperturaComerciosJob` `@Scheduled(fixedDelay = 60_000)` (reabre comercios cerrados a mano; apoya P2.05 por los horarios vigentes). Los documentos y la aptitud **no** tienen job. Los jobs de turno (`CierreTurnoJob`) y de inactividad quedan fuera de este tramo.
- **P8 (emails):** el único email de este tramo es el código de verificación del primer alta (`EmailService.enviarVerificacion`, `EjecucionPostCommit`). No hay email de aprobación/rechazo de comercio ni de documentos (D-01). Los emails de suspensión/levantamiento (`AvisoCuentaService`) son del tramo de suspensiones.
- **P2.09 (suspensiones):** `SUSPENDIDO` bloquea la edición de perfil, horarios y redes (`COMERCIO_SUSPENDIDO`); permite subir/revisar documentos sin cambiar el estado; solo `SuspensionComercioService.levantar` decide el destino con `destinoAlLevantarSuspension`.
- **P1.02:** los pasos 1 a 7 del primer alta (cadena `usuario → persona → persona_fisica/juridica → dueno`) están descritos arriba por contexto; el detalle de verificación de email y de la contraseña corresponde a P1.02.
- **Mercado Pago:** vincular/desvincular dispara `recalcularComerciosDelDueno` (cambia el estado de todos los comercios del Dueño); el detalle es del proceso de cobros.

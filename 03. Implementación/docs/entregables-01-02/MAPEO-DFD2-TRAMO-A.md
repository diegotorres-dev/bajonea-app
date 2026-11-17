# MAPEO DFD Nivel 2 — Tramo A: acceso y sesión

Informe de solo lectura, tomado del código real el 2026-11-16. Cubre P1.01 a P1.07. No contiene propuestas de refactor: describe lo que el código hace hoy.

Convenciones del informe:
- Las rutas de archivo son relativas a `03. Implementación/`. `BE` = `backend/src/main/java/com/bajonea/backend/`. `FE` = `frontend/`.
- `archivo:línea` indica dónde está el texto o la condición citada. Cuando el archivo se leyó por fragmentos y la línea exacta no se capturó, se cita solo el archivo y el método.
- Todo texto entre comillas es literal del código.
- "NO EXISTE EN EL CÓDIGO" significa que se buscó y no hay nada.
- Hecho canónico = los que figuran en el pedido de la tarea.

---

## 0. Componentes comunes (se citan desde las secciones)

### C1. Formato de respuesta y errores
- Toda respuesta es `ApiResponse` con `mensaje` y `data` (`BE controllers/AuthController.java`).
- Error de validación de DTO (`MethodArgumentNotValidException`): HTTP 400, `data` = mapa `{campo: mensaje}`, `mensaje` = `"campo: msg; campo2: msg"` (`BE exceptions/GlobalExceptionHandler.java:218-228`).
- No hay orden entre campos: Bean Validation evalúa todas las restricciones del DTO y devuelve todas las violaciones. Por campo, gana siempre la restricción de "obligatorio" (`NotBlank`/`NotNull`/`NotEmpty`) sobre las demás (`GlobalExceptionHandler.java:201, 230-237`).
- JSON ilegible o con una fecha de calendario inexistente: HTTP 400 `"El cuerpo de la solicitud contiene datos con formato inválido"` (`GlobalExceptionHandler.java:248-252`). Corre antes que Bean Validation.
- `ConflictoDeNegocioException` → 409, `data` null (`GlobalExceptionHandler.java:133-136`).
- `CredencialesInvalidasException` → 401, `data` = lo que cargue la excepción (`GlobalExceptionHandler.java:112-115`).
- `RecursoNoEncontradoException` → 404 (`GlobalExceptionHandler.java:107-110`).
- `ValidacionException` → 400, `data` null (`GlobalExceptionHandler.java:191-194`).
- `ValidacionCamposException` → 400, `data` = mapa de errores (`GlobalExceptionHandler.java:196-199`).
- `GeneracionTokenException` → 500 (`GlobalExceptionHandler.java:154-157`).
- `DataIntegrityViolationException` con UNIQUE `uq_usuario_nombre_usuario` → 409 `"Ese nombre de usuario ya está en uso"`. Otro UNIQUE → 409 `"Ya existe un registro con alguno de los datos ingresados"`. Cualquier otra violación → 500 `"No se pudo procesar la solicitud, intentá nuevamente"` (`GlobalExceptionHandler.java:75-99`).

### C2. Transacciones
- `RegistroService` es `@Transactional` de clase (`BE services/RegistroService.java:62`). Cualquier `RuntimeException` revierte todo.
- `AuthService` es `@Transactional(noRollbackFor = { CredencialesInvalidasException.class, ConflictoDeNegocioException.class })` (`BE services/AuthService.java:73`). Por eso se confirman los contadores de intentos fallidos aunque el método termine lanzando 401 o 409.
- Los emails salen con `EjecucionPostCommit.ejecutar(...)`: después del commit, fuera de la transacción (`RegistroService.java:327`, `AuthService.java:250, 267, 410`).
- `EmailService` nunca relanza el error de Resend: devuelve un resultado y deja un `log.warn` (`BE services/EmailService.java:340-354`). Un email caído no revierte nada.

### C3. Generación de códigos (`TokenService`, `CodigoTokenGenerador`)
- Código de 6 dígitos: `String.format("%06d", secureRandom.nextInt(1_000_000))` (`BE services/CodigoTokenGenerador.java:14-20`).
- `TokenService.crear` (`BE services/TokenService.java:54-84`):
  - genera, consulta si el valor ya existe (`existeValor`) y reintenta;
  - hasta `token.generacion.max-intentos` = 20 (`application.properties:53`);
  - inserta por JDBC: `INSERT INTO token (usuario_id, tipo, token, fecha_creacion, fecha_vencimiento, estado, intentos_fallidos) VALUES (?, ?, ?, ?, ?, ?, 0)` (`BE repositories/TokenInsercionRepository.java:29-31`);
  - si se agotan los intentos: HTTP 500 `"No pudimos generar el código de verificación. Intentá nuevamente en unos instantes."` (`TokenService.java:83`).
- El `UNIQUE` del valor es global (no por usuario ni tipo). `token.token` es `VARCHAR(36)` (`BE entities/Token.java`).

### C4. Emails (Resend, texto plano)
Remitente `mail.from`; con `email.envio-habilitado=false` (perfil test) no se llama a Resend (`EmailService.java:313-321`). Los tres emails de este tramo:

- **Verificación** (`EmailService.java:54-64`)
  - Asunto: `"Tu código de verificación — Bajoneá"`.
  - Cuerpo: `"¡Gracias por registrarte en Bajoneá!\n\nTu código de verificación es: <código>\n\nIngresá este código en la pantalla de verificación de la app para activar tu cuenta. El código vence en 24 horas y podés usarlo hasta 5 veces antes de que se invalide — si eso pasa, o si el código venció, podés pedir uno nuevo desde la misma pantalla.\n\nSi vos no solicitaste esta cuenta, podés ignorar este email: nadie va a poder activarla sin acceso a esta casilla.\n\nEquipo de Bajoneá"`.
- **Recuperación** (`EmailService.java:66-75`)
  - Asunto: `"Tu código de recuperación de contraseña — Bajoneá"`.
  - Cuerpo: `"Recibimos una solicitud para restablecer tu contraseña en Bajoneá.\n\nTu código de recuperación es: <código>\n\nIngresá este código en la pantalla de recuperación de contraseña de la app junto con tu nueva contraseña. El código vence en 30 minutos.\n\nSi vos no solicitaste este cambio, podés ignorar este email: tu contraseña actual sigue siendo válida.\n\nEquipo de Bajoneá"`.
- **Reactivación** (`EmailService.java:77-85`)
  - Asunto: `"Tu código de reactivación de cuenta — Bajoneá"`.
  - Cuerpo: `"Recibimos una solicitud para reactivar tu cuenta en Bajoneá.\n\nTu código de reactivación es: <código>\n\nIngresá este código en la pantalla de reactivación de cuenta de la app para volver a activarla. El código vence en 24 horas.\n\nSi vos no solicitaste esta reactivación, podés ignorar este email.\n\nEquipo de Bajoneá"`.

### C5. Validación de código por email (`obtenerTokenValidoPorCodigo`, `AuthService.java:563-588`)
La usan verificar email (POST), validar-codigo y confirmar de recuperación, y confirmar de reactivación. Orden exacto:
1. `usuarioRepository.findByEmail(email)` → si no existe: 401 `"Código incorrecto o vencido"`.
2. Token `PENDIENTE` más reciente del usuario y tipo (`findFirstByUsuarioIdAndTipoAndEstadoOrderByFechaCreacionDesc`) → si no hay: 401 `"Código incorrecto o vencido"`.
3. `fechaVencimiento.isBefore(LocalDateTime.now())` → 409 `"El código venció. Solicitá uno nuevo."` Se evalúa antes de comparar el código, así que con el token vencido un código errado no suma intentos. El estado del token queda `PENDIENTE` (ver Desvío D-07).
4. Código distinto: suma `intentos_fallidos`. Al llegar a 5 pone `estado = UTILIZADO` y `fecha_uso = now` (`AuthService.java:529-536`). Después:
   - si `restantes <= 0`: 409 `"Superaste el máximo de intentos permitidos. Solicitá un nuevo código."`;
   - si no: 401 `"Código incorrecto. Te quedan " + restantes + " intento(s)."`, con `data = {intentosRestantes: N}`.
5. Código igual: devuelve el token.

`MAX_INTENTOS_TOKEN_VERIFICACION = 5` (`AuthService.java:80`). Los contadores se confirman gracias a `noRollbackFor` (C2).

### C6. Filtro JWT: errores 401/403 de sesión
- `JwtAuthenticationFilter` (`BE config/security/JwtAuthenticationFilter.java:57-108`):
  - sin header `Authorization: Bearer` deja pasar (la regla de la ruta decide);
  - firma/expiración inválida → 401;
  - `subject != userId` → 401;
  - sesión inexistente o `activa = false` → 401.
- Cuerpo del 401: `"No autenticado: token ausente, inválido, expirado o sesión cerrada"`, `data` null (`BE config/security/CustomAuthenticationEntryPoint.java:39-40`).
- Cuenta `SUSPENDIDO` con sesión: 401 con `mensaje = "Tu cuenta fue suspendida"` y `data = {codigo: "CUENTA_SUSPENDIDA", motivo}`. Las rutas `/api/v1/soporte/` pasan igual si la sesión está activa o fue cerrada con `tipo_cierre = SUSPENSION` (`JwtAuthenticationFilter.java:76-92`).
- 403: `"No tiene permisos para acceder a este recurso"` (`CustomAccessDeniedHandler.java:73-74`).
- Frontend ante un 401 con token guardado: `clearSesion()` y modal `"Sesión cerrada"` / `"Tu sesión terminó. Iniciá sesión de nuevo."` (`FE js/api.js:327-334, 674-678`). El modal es el mismo para sesión cerrada, token vencido o login en otro dispositivo.

### C7. Rate limit de endpoints públicos (`RateLimitPublicoFilter`)
- Solo para: `/auth/registro/comercio/foto-firma` y `/auth/registro/cliente/foto-firma` (5/min por IP), `/auth/invitaciones-empleado/validar|aceptar` (10/min) y `/auth/nombre-usuario/disponibilidad` + `/auth/comercio-nombre/disponibilidad` (30/min) (`BE config/security/RateLimitPublicoFilter.java:47-66`).
- Respuesta al excederse: HTTP 429 `{"mensaje":"Demasiadas solicitudes. Esperá un minuto e intentá de nuevo.","data":null}` (`RateLimitPublicoFilter.java:97`).
- NO EXISTE límite por IP en `login`, `registro/*`, `verificar`, `reenviar-verificacion`, `recuperar-password*` ni `reactivar-cuenta*`. La defensa de esos endpoints es el contador por cuenta o por código.
- La IP es `request.getRemoteAddr()`.

### C8. Rutas públicas de este tramo (`SecurityConfig.java:98-127`)
Públicas por ruta exacta o patrón `/api/v1/auth/registro/**`: `login`, `nombre-usuario/disponibilidad`, `comercio-nombre/disponibilidad`, `verificar/**`, `verificar`, `reenviar-verificacion`, `recuperar-password`, `recuperar-password/validar-codigo`, `recuperar-password/confirmar`, `reactivar-cuenta`, `reactivar-cuenta/confirmar`, `reactivar-cuenta/con-credenciales`.

No están en esa lista, así que exigen JWT: `logout` y `cambiar-password` (caen en `anyRequest().authenticated()`, `SecurityConfig.java:159`).

---

## P1.01 Registro de Cliente

### 1. Funciones y archivos
- Controlador: `BE controllers/AuthController.java:50-55` `registrarCliente`.
- Servicio: `BE services/RegistroService.java:83-90` `registrarCliente` → `crearCliente` (`:100-130`) → `crearUsuario` (`:279-302`), `crearPersona` (`:304-307`), `construirDireccion` (`:309-319`), `enviarVerificacion` (`:321-328`).
- Validaciones de negocio: `BE services/ValidadorDatosNegocioComercio.java:51-63` `obtenerLocalidad`. `BE services/LocalidadesHabilitadas.java`.
- Repositorios: `UsuarioRepository` (`existsByEmail`, `existsByNombreUsuario`, `saveAndFlush`), `PersonaFisicaRepository` (`existsByDni`, `save`), `PersonaRepository`, `ClienteRepository`, `DireccionRepository`, `TokenInsercionRepository`.
- Endpoints auxiliares:
  - `AuthController.java:57-62` `GET /auth/nombre-usuario/disponibilidad` → `RegistroService.consultarDisponibilidadNombreUsuario` (`:261-271`).
  - `AuthController.java:71-75` `POST /auth/registro/cliente/foto-firma` → `CloudinaryService.generarFirmaFotoPerfilRegistroCliente` (`BE services/CloudinaryService.java:99-101`).

### 2. Endpoint
| Endpoint | Método | Ruta | Rol | `X-Comercio-Id` | Público |
|---|---|---|---|---|---|
| Registro | POST | `/api/v1/auth/registro/cliente` | ninguno | no | sí (`/auth/registro/**`) |
| Disponibilidad de usuario | GET | `/api/v1/auth/nombre-usuario/disponibilidad?nombreUsuario=` | ninguno | no | sí; 30/min por IP |
| Firma de foto | POST | `/api/v1/auth/registro/cliente/foto-firma` | ninguno | no | sí; 5/min por IP |

### 3. Entradas y validaciones (en el orden de ejecución)
**Request** (`RegistroClienteRequestDTO` extiende `DatosClienteRequestDTO`):
`nombre`, `apellido`, `dni`, `fechaNacimiento`, `telefono`, `nombreUsuario`, `password`, `direccion{calle, numero, pisoDepto, codigoPostal, localidadId, principal}`, `fotoPerfilUrl` (opcional), `email`, `aceptaTerminos`.

**Paso 0 — normalización en los setters** (antes de validar):
- `nombre`/`apellido`: `trim` y colapso de espacios (`DatosClienteRequestDTO.java:74-80, 110-115`).
- `dni`: se quitan `.`, `-` y espacios (`:82-84`).
- `telefono`: se quitan espacios, `(`, `)` y `-` (`:90-92`).
- `nombreUsuario`: `trim` + minúsculas (`NombreUsuarioPolicy.normalizar`, `:94-96`).
- `email`: `trim` + minúsculas (`RegistroClienteRequestDTO.java:40-42`).

**Paso 1 — Bean Validation del DTO** (400, formato C1):

| Campo | Condición | Mensaje literal |
|---|---|---|
| `nombre` | `@NotBlank` | `"El nombre es obligatorio"` |
| `nombre` | `@ValidarFormatoNombre`: `^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[-' ][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$` | `"El nombre solo puede contener letras"` |
| `nombre` | `@Size(max=100)` | `"El nombre no puede superar los 100 caracteres"` |
| `apellido` | `@NotBlank` | `"El apellido es obligatorio"` |
| `apellido` | formato | `"El apellido solo puede contener letras"` |
| `apellido` | `@Size(max=100)` | `"El apellido no puede superar los 100 caracteres"` |
| `dni` | `@NotBlank` | `"El DNI es obligatorio"` |
| `dni` | `@ValidarFormatoDni`: `\d{7,8}` | `"El DNI debe tener un formato válido"` |
| `fechaNacimiento` | `@NotNull` | `"La fecha de nacimiento es obligatoria"` |
| `fechaNacimiento` | `@ValidarFechaNacimientoPlausible`: no futura y no anterior a hoy − 120 años (`LocalDate.now()` de la JVM) | `"La fecha ingresada no es válida"` |
| `fechaNacimiento` | `@EdadMinima(anios = 14)` sobre el getter (`RegistroClienteRequestDTO.java:48-52`): futura → `"La fecha ingresada no es válida"`; si no, `!fechaNacimiento.isAfter(hoy.minusYears(14))` con el `Clock` de la app | `"Tenés que tener al menos 14 años para registrarte"` |
| `telefono` | `@NotBlank` | `"El teléfono es obligatorio"` |
| `telefono` | `@ValidarTelefonoArgentino`: tras sanitizar, `^\+549\d{10}$` | `"Ingresá un número de teléfono válido (cod. área + número)"` |
| `telefono` | `@Size(max=30)` | `"El teléfono no puede superar los 30 caracteres"` |
| `nombreUsuario` | `@NotBlank` | `"El nombre de usuario es obligatorio"` |
| `nombreUsuario` | `@ValidarNombreUsuario` (`NombreUsuarioPolicy`): solo `[A-Za-z0-9]` | `"Solo se permiten letras y números"` |
| `nombreUsuario` | al menos una letra | `"El nombre de usuario debe contener al menos una letra."` |
| `nombreUsuario` | largo mínimo 8 | `"El nombre de usuario debe tener al menos 8 caracteres"` |
| `nombreUsuario` | largo máximo 20 (también `@Size(max=20)`) | `"El nombre de usuario no puede superar los 20 caracteres"` |
| `password` | `@NotBlank` | `"La contraseña es obligatoria"` |
| `password` | `@ValidarPasswordSegura`: `^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,72}$` | `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"` |
| `direccion` | `@NotNull @Valid` | `"La dirección es obligatoria"` |
| `direccion.calle` | `@NotBlank`; `@Size(max=150)`; `@Pattern .*[\p{L}0-9].*` | `"La calle es obligatoria"`; `"La calle no puede superar los 150 caracteres"`; `"La calle no puede contener solo caracteres especiales"` |
| `direccion.numero` | `@NotBlank`; `@Size(max=10)`; `^\d+$` | `"El número es obligatorio"`; `"El número no puede superar los 10 caracteres"`; `"Solo se permiten números"` |
| `direccion.pisoDepto` | `@Size(max=30)`; `\s*|.*[\p{L}0-9].*` | `"El piso/departamento no puede superar los 30 caracteres"`; `"El piso/departamento no puede contener solo caracteres especiales"` |
| `direccion.codigoPostal` | `@NotBlank`; `^\d{4}$` o CPA `^[A-Za-z]\d{4}[A-Za-z]{3}$` | `"El código postal es obligatorio"`; `"Ingresá un código postal válido (4 dígitos o formato CPA)"` |
| `direccion.localidadId` | `@NotBlank`; `@Size(max=15)` | `"Seleccioná tu localidad"`; `"La localidad no puede superar los 15 caracteres"` |
| `fotoPerfilUrl` | `@ValidarUrlCloudinary`: esquema `https` y host exacto `res.cloudinary.com`; `@Size(max=500)` | `"La URL debe pertenecer al dominio de Cloudinary"`; `"La foto de perfil no puede superar los 500 caracteres"` |
| `email` | `@NotBlank`; `@ValidarFormatoEmail` `^[^\s@]+@[^\s@]+\.[^\s@]+$`; `@Size(max=254)` | `"El email es obligatorio"`; `"Ingresá un email válido"`; `"El email no puede superar los 254 caracteres"` |
| `aceptaTerminos` | `@NotNull` y `@AssertTrue` | `"Tenés que aceptar los Términos y Condiciones"` (ambas) |

Las claves de error de la dirección llegan como `direccion.calle`, `direccion.numero`, etc.

**Paso 2 — reglas del servicio** (`RegistroService.crearCliente`, `:100-130`; todas antes de la primera escritura):
1. `validarEmailUnico` (`:247-251`): `usuarioRepository.existsByEmail(email)` → 409 `"Ya existe una cuenta registrada con ese email"`.
2. `validarNombreUsuarioDisponible` (`:273-277`): `NombreUsuarioPolicy.esReservado(...)` o `existsByNombreUsuario` → 409 `"Ese nombre de usuario ya está en uso"`. Reservados (`NombreUsuarioPolicy.java:17-19`): `administrador`, `administrator`, `bajonea`, `soporte`, `support`, `comercio`, `cliente`, `empleado`, `duenio`, `superadmin`.
3. `personaFisicaRepository.existsByDni(dni)` → 409 `"Ya existe una cuenta registrada con ese DNI"` (`:103-105`). La tabla `persona_fisica` es compartida: choca también con el DNI del representante de un Dueño.
4. `obtenerLocalidad` (`ValidadorDatosNegocioComercio.java:51-63`):
   - la localidad no existe → 404 `"La localidad indicada no existe"`;
   - existe pero no está habilitada → 400 con `data = {"direccion.localidadId": "Esa localidad todavía no está disponible"}`.
   - Habilitadas por defecto: `94008010,94015020,94011010` (Río Grande, Ushuaia, Tolhuin) (`BE services/LocalidadesHabilitadas.java`, valor por defecto de `geografia.localidades-habilitadas`).
5. Red de seguridad: `saveAndFlush` del usuario traduce `uq_usuario_nombre_usuario` y `uq_usuario_email` a los dos 409 anteriores (`:290-301`).

La edad de 14 años NO se vuelve a validar en el servicio: vive solo en el DTO.

### 4. Pasos en orden exacto
Todo dentro de una transacción (C2).
1. Lecturas de unicidad (paso 2).
2. `INSERT usuario`: `nombre_usuario`, `email`, `password_hash` (BCrypt, `PasswordEncoder` de `SecurityConfig`), `rol = CLIENTE`, `estado = PENDIENTE`, `intentos_fallidos = 0`, `foto_perfil_url`, `fecha_registro = LocalDateTime.now()`. `fecha_ultimo_acceso` la completa `@PrePersist` con `fecha_registro` (`BE entities/Usuario.java`). Es `saveAndFlush`.
3. `INSERT persona` (id compartido con el usuario).
4. `INSERT persona_fisica`: `nombre`, `apellido` (con `TextoUtils.aTitleCase`), `dni`, `fecha_nacimiento`, `telefono`.
5. `INSERT cliente`.
6. `INSERT direccion`: `calle` (Title Case), `numero`, `piso_depto`, `codigo_postal` (`TextoUtils.normalizarCodigoPostal`), `localidad_id`, `cliente_id`, `principal = true`, `eliminada = false`, `fecha_creacion = now`.
7. `TokenService.crear(usuario, VERIFICACION_EMAIL, now + 24 h)` (C3): `INSERT token` con `estado = PENDIENTE`. Vencimiento: `EXPIRACION_VERIFICACION_EMAIL_HORAS = 24` (`RegistroService.java:65`).
8. Se registra el envío del email de verificación para después del commit (C4).
9. Commit. Después del commit: `emailService.enviarVerificacion(email, codigo)`.

- NO se escribe ninguna fila en `historial_estado_usuario` al registrarse (Desvío D-09).
- NO se escribe `usuario.email_verificado` (la columna existe en la base pero la entidad no la mapea; Desvío D-07).
- Locks: ninguno explícito. La unicidad la garantizan los `UNIQUE`.
- Llamadas externas dentro de la transacción: ninguna. Cloudinary lo sube el frontend antes de este POST (ver sección 7).

### 5. Salidas
- **201** `"Cliente registrado correctamente, verificá tu email"` (`AuthController.java:54`), con `data = {id, email, rol: "CLIENTE", estado: "PENDIENTE", fotoPerfilUrl}`. `nombre` no viaja (se omite si es null).
- **No se inicia sesión**: no hay token JWT ni fila en `sesion`.
- Errores: 400 (C1, paso 3.1 y localidad no habilitada), 404 `"La localidad indicada no existe"`, 409 (email, nombre de usuario, DNI), 500 (C1).

### 6. Efectos secundarios
- Email de verificación (C4), destinatario el email del registro, un solo intento.
- Si el email falla: `EmailService` no lanza, deja un `log.warn`. La transacción ya está confirmada: el usuario existe `PENDIENTE` con el token vigente 24 h. Puede pedir otro código con `POST /auth/reenviar-verificacion` (P1.03). No hay aviso in-app.
- Avisos in-app: ninguno. Jobs: ninguno.

### 7. Frontend
- Pantalla `FE registro-cliente.html`; lógica `FE js/auth.js:255-277` `initRegistroCliente` + `FE js/cliente-form.js` `montarFormularioCliente`. Entrada previa: `registro-tipo-cuenta.html`.
- Asistente de 2 pasos con rótulos `"1. Datos personales"` y `"2. Dirección"`.
- Foto de perfil opcional: avatar con recorte 1:1 (`abrirEditorRecorte`). Validación de archivo en cliente (`FE js/cloudinary.js`):
  - tipos `image/jpeg`, `image/png`, `image/webp`;
  - máximo 5 MB;
  - mensajes: `"Formato no permitido. Usá JPG, PNG o WEBP."` y `"La imagen no puede superar los 5 MB."`.
  - La subida ocurre al enviar el paso 2 (`POST /auth/registro/cliente/foto-firma` y luego `POST https://api.cloudinary.com/v1_1/<cloud>/image/upload`, `subirFotoPerfilRegistroCliente`). Si falla: banner con el mensaje del error o `"No pudimos subir la foto. Intentá nuevamente."` y no se envía el registro.
- Validaciones del cliente en el paso 1 (botón de continuar), en este orden:
  1. nombre de usuario (formato y disponibilidad en vivo, textos `"Verificando…"` / `"Nombre de usuario disponible"` / `"Ese nombre de usuario ya está en uso"`);
  2. nombre: `"El nombre es obligatorio"` / `"El nombre solo puede contener letras"`;
  3. apellido (ídem);
  4. DNI: `"El DNI es obligatorio"` / `"El DNI debe tener un formato válido"`;
  5. fecha de nacimiento: `"La fecha de nacimiento es obligatoria"` / `"La fecha ingresada no es válida"`;
  6. edad: `"Tenés que tener al menos 14 años para poder registrarte."`;
  7. email: `"El email es obligatorio"` / `"Ingresá un email válido"`;
  8. teléfono: `"El teléfono es obligatorio"` / `"Ingresá un número de teléfono válido (cod. área + número)"`;
  9. contraseña: `"La contraseña es obligatoria"` / `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"`;
  10. confirmar: `"Debes confirmar la contraseña"` / `"Las contraseñas no coinciden"`;
  11. términos: `"Tenés que aceptar los Términos y Condiciones"`.
- Casilla: `"Acepto los Términos y Condiciones y la Política de Privacidad"` (`FE js/form-utils.js`, `crearCheckboxTerminos`). Los dos enlaces abren `terminos.html` y `privacidad.html` en una pestaña nueva.
- Paso 2: calle, número, piso/depto, código postal, provincia (fija en Tierra del Fuego) y localidad.
- Éxito: se oculta el asistente y aparece `"Revisá tu email"` / `"Te enviamos un código de 6 dígitos. Ingresalo en la pantalla de verificación para activar tu cuenta y empezar a pedir en Bajoneá."` con el botón `"Ingresar código de verificación"`, que enlaza a `verificar-email.html?email=<email>`. No hay redirección automática ni login.
- Errores del servidor:
  - 409 de nombre de usuario → marca el campo, vuelve al paso 1 y banner `"Revisá los campos marcados."`;
  - 400 con `data` por campo → mapea cada error a su campo y vuelve al paso 1 o 2;
  - cualquier otro error (incluidos los 409 de email y de DNI, que no traen `data`) → vuelve al paso 2 y muestra `error.message` en el banner. El email y el DNI son campos del paso 1 pero el mensaje se ve en el paso 2.

### 8. Desvíos
Ver sección B: D-03, D-07, D-09, D-13, D-14, D-15.

---

## P1.02 Registro de Dueño

### 1. Funciones y archivos
- Controlador: `BE controllers/AuthController.java:77-82` `registrarComercio`.
- Servicio: `BE services/RegistroService.java:132-180` `registrarComercio`. Además `crearComercio` (`:199-221`), `guardarHorarios`, `guardarRedesSociales`.
- Validaciones de negocio: `BE services/ValidadorDatosNegocioComercio.java:39-44` `validar`; `BE services/NombreComercioService` (`validar`); `BE services/ValidadorHorarios`; `BE util/ComercioValidaciones.validarModalidadesEntrega`.
- Repositorios: `PersonaJuridicaRepository.existsByCuit`, `PersonaFisicaRepository.existsByDni`, `DuenoRepository`, `ComercioRepository`, `DireccionRepository`, `HorarioRepository`, `RedSocialRepository`, `TokenInsercionRepository`.
- Cloudinary: `AuthController.java:84-88` `POST /auth/registro/comercio/foto-firma` → `CloudinaryService.generarFirmaFotoPerfilRegistro` (`BE services/CloudinaryService.java:91-93`, carpeta `comercios/pre-registro/`).
- Disponibilidad del nombre del comercio: `AuthController.java:64-69` `GET /auth/comercio-nombre/disponibilidad` → `NombreComercioService.consultarDisponibilidad`.

### 2. Endpoint
| Endpoint | Método | Ruta | Rol | `X-Comercio-Id` | Público |
|---|---|---|---|---|---|
| Registro | POST | `/api/v1/auth/registro/comercio` | ninguno | no | sí |
| Firma de foto | POST | `/api/v1/auth/registro/comercio/foto-firma` | ninguno | no | sí; 5/min por IP |
| Disponibilidad de nombre de comercio | GET | `/api/v1/auth/comercio-nombre/disponibilidad?nombre=` | ninguno | no | sí; 30/min por IP |

### 3. Entradas y validaciones
**Request** (`RegistroComercioRequestDTO` extiende `DatosNegocioComercioRequestDTO`):
- Negocio: `nombre`, `descripcion`, `telefono`, `tipoComercio`, `aceptaDelivery`, `aceptaRetiro`, `direccion`, `horarios[]`, `fotoPerfilUrl`, `redesSociales[]`.
- Fiscales: `razonSocial` (opcional), `cuit`, `condicionIva` (opcional), `tipoSociedad` (opcional), `domicilioFiscal`, `fechaInicioActividades` (opcional).
- Representante: `nombreRepresentante`, `apellidoRepresentante`, `dniRepresentante`, `telefonoRepresentante`, `fechaNacimientoRepresentante`.
- Cuenta: `nombreUsuario`, `email`, `password`, `aceptaTerminos`.
- NO EXISTE en el request ni en el servicio un campo de foto personal del Dueño. `crearUsuario` se llama con `fotoPerfilUrl = null` (`RegistroService.java:144`). La única foto del registro es la del comercio.

**Paso 0 — normalización** (`RegistroComercioRequestDTO.java:157-190`):
- `razonSocial`: `trim`, vacío pasa a null.
- `cuit`: solo dígitos.
- `nombreUsuario`: `trim` + minúsculas.
- `email`: `trim` + minúsculas.
- `nombreRepresentante` y `apellidoRepresentante`: `trim` y colapso de espacios.
- `dniRepresentante`: se quitan `.`, `-` y espacios.

**Paso 1 — Bean Validation** (400, C1). Campos propios de este endpoint:

| Campo | Condición | Mensaje literal |
|---|---|---|
| `nombre` | `@NotBlank`; `@Pattern .*[\p{L}0-9].*`; `@Size(max=150)` | `"El nombre del comercio es obligatorio"`; `"Ingresá un nombre de comercio válido"`; `"El nombre no puede superar los 150 caracteres"` |
| `descripcion` | `@Size(max=2000)` | `"La descripción no puede superar los 2000 caracteres"` |
| `telefono` | `@NotBlank`; teléfono argentino; `@Size(max=30)` | `"El teléfono de contacto es obligatorio"`; `"Ingresá un número de teléfono válido (cod. área + número)"`; `"El teléfono no puede superar los 30 caracteres"` |
| `tipoComercio` | `@NotNull` | `"Seleccioná el tipo de comercio"` |
| `direccion` | `@NotNull @Valid` | `"La dirección es obligatoria"` (más los mensajes de la dirección de P1.01) |
| `horarios` | `@NotEmpty @Valid` | `"No debe estar vacío"` |
| `fotoPerfilUrl` | `@NotBlank`; host `res.cloudinary.com`; `@Size(max=500)` | `"Agregá una foto de perfil de tu comercio"`; `"La URL debe pertenecer al dominio de Cloudinary"`; `"La foto de perfil no puede superar los 500 caracteres"` |
| `redesSociales` | `@NotEmpty`; `@Size(max=5)` | `"Debés cargar al menos una red social"`; `"No podés cargar más de 5 redes sociales"` |
| `razonSocial` (opcional) | `@Pattern .*[\p{L}0-9].*`; `@Size(max=150)` | `"La razón social no puede contener solo caracteres especiales"`; `"La razón social no puede superar los 150 caracteres"` |
| `cuit` | `@NotBlank`; `@ValidarCuit` | `"El CUIT es obligatorio"`; `"El CUIT debe tener 11 dígitos numéricos"` |
| `domicilioFiscal` | `@NotBlank`; `@Pattern .*[\p{L}0-9].*`; `@Size(max=255)` | `"El domicilio fiscal es obligatorio"`; `"El domicilio fiscal no puede contener solo caracteres especiales"`; `"El domicilio fiscal no puede superar los 255 caracteres"` |
| `fechaInicioActividades` (opcional) | `@PastOrPresent` | `"La fecha ingresada no es válida"` |
| `aceptaTerminos` | `@NotNull`, `@AssertTrue` | `"Tenés que aceptar los Términos y Condiciones"` |
| `nombreUsuario` | igual que Cliente (obligatorio, formato 8-20, `@Size(max=20)`) | mismos textos que P1.01 |
| `email` | `@NotBlank`; formato; `@Size(max=254)` | `"El email es obligatorio"`; `"Ingresá un email válido"`; `"El email no puede superar los 254 caracteres"` |
| `password` | `@NotBlank`; segura | `"La contraseña es obligatoria"`; `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"` |
| `nombreRepresentante` / `apellidoRepresentante` | `@NotBlank`; formato nombre; `@Size(max=100)` | `"El nombre es obligatorio"` / `"El apellido es obligatorio"`; `"El nombre solo puede contener letras"` / `"El apellido solo puede contener letras"`; `"El nombre no puede superar los 100 caracteres"` / `"El apellido no puede superar los 100 caracteres"` |
| `dniRepresentante` | `@NotBlank`; `\d{7,8}` | `"El DNI es obligatorio"`; `"El DNI debe tener un formato válido"` |
| `telefonoRepresentante` | `@NotBlank`; teléfono argentino; `@Size(max=30)` | `"El teléfono es obligatorio"`; `"Ingresá un número de teléfono válido (cod. área + número)"`; `"El teléfono no puede superar los 30 caracteres"` |
| `fechaNacimientoRepresentante` | `@NotNull`; `@ValidarFechaNacimientoRepresentante`: futura; anterior a 120 años; menor de 18 | `"La fecha de nacimiento es obligatoria"`; `"La fecha ingresada no es válida"`; `"La fecha ingresada no puede ser anterior a 120 años"`; `"Debe ser mayor de 18 años"` |

**CUIT** (`BE validation/validators/CuitValidator.java`):
- Debe ser `\d{11}`.
- Tiene dígito verificador módulo 11 con multiplicadores `{5,4,3,2,7,6,5,4,3,2}`: `11 - (suma % 11)`; `11 → 0`; `10 → inválido`.
- El frontend replica el algoritmo (`FE js/validators.js` `esCuitValido`).

**Paso 2 — reglas del servicio** (`RegistroService.registrarComercio`, `:132-142`, en este orden):
1. `validarEmailUnico` → 409 `"Ya existe una cuenta registrada con ese email"`.
2. `validarNombreUsuarioDisponible` → 409 `"Ese nombre de usuario ya está en uso"`.
3. `personaJuridicaRepository.existsByCuit(cuit)` → 409 `"Ya existe una cuenta registrada con ese CUIT"`. El CUIT es único.
4. `personaFisicaRepository.existsByDni(dniRepresentante)` → 409 `"Ya existe una cuenta registrada con ese DNI"`.
5. `validadorDatosNegocio.validar` (`ValidadorDatosNegocioComercio.java:39-44`), en este orden:
   - `ValidadorHorarios.validar(horarios)`;
   - `validarRedesSociales`: tipos repetidos → 400 `"No podés cargar dos redes sociales del mismo tipo"`;
   - `ComercioValidaciones.validarModalidadesEntrega(aceptaDelivery, aceptaRetiro)`;
   - `obtenerLocalidad` (404 `"La localidad indicada no existe"` / 400 `{"direccion.localidadId": "Esa localidad todavía no está disponible"}`).
   - Los textos de `ValidadorHorarios` y `ComercioValidaciones` no se transcribieron (no leídos). Ver sección C.
6. `nombreComercioService.validar(nombre, null)` → 409 `"Ya existe un comercio con ese nombre. Elegí otro."` (texto confirmado por `FE js/form-utils.js:143`; la constante del servidor es `NombreComercioService.MENSAJE_NOMBRE_EN_USO`). Red de seguridad: el UNIQUE `uq_comercio_nombre_unico` (`GlobalExceptionHandler.java:86-89`).

### 4. Pasos en orden exacto
Todo en una transacción (C2).
1. Validaciones del paso 2.
2. `INSERT usuario`: `rol = DUENO`, `estado = PENDIENTE`, `foto_perfil_url = NULL`, resto igual que P1.01.
3. `INSERT persona`.
4. `INSERT persona_fisica` con los datos del representante (nombre y apellido en Title Case).
5. `INSERT persona_juridica`: `razon_social` (Title Case, puede ser null), `cuit`, `condicion_iva`, `tipo_sociedad`, `domicilio_fiscal`, `fecha_inicio_actividades`.
6. `INSERT dueno` (`persona_juridica`, `persona_fisica`, `fecha_creacion = now`).
7. `crearComercio` (`:199-221`):
   - `INSERT comercio`: `nombre` (Title Case), `descripcion`, `telefono`, `tipo_comercio`, `acepta_delivery`, `acepta_retiro`, `estado = PENDIENTE`, `fecha_registro = now`, `foto_perfil_url`, `dueno_id`;
   - `INSERT direccion` con `comercio_id`;
   - `INSERT horario` (uno por franja);
   - `INSERT red_social` (una por red, `fecha_creacion = now`).
8. `TokenService.crear(VERIFICACION_EMAIL, now + 24 h)`; email post-commit.

- El registro SÍ crea un comercio (estado `PENDIENTE`, revisado después por el Administrador). No escribe `historial_estado_comercio` (`RegistroService.java:186`).
- Locks: ninguno explícito. Llamadas externas dentro de la transacción: ninguna.

**Foto del comercio (Cloudinary)** — el backend solo firma y valida la URL:
- La firma (`CloudinaryService.firmar`) incluye `timestamp`, `folder = "comercios/pre-registro/"` y `upload_preset = "bajonea_imagenes_mvp"`. Respuesta: `{signature, timestamp, apiKey, cloudName, folder, uploadPreset}`.
- El servidor NO valida tipo de archivo ni tamaño. Validación en el cliente: JPG/PNG/WebP, máximo 5 MB (`FE js/cloudinary.js`). La restricción real de Cloudinary depende del preset, que no figura en el repo.
- Al registrar, el backend solo valida que la URL sea `https` y de host `res.cloudinary.com` (`@ValidarUrlCloudinary`). NO valida la carpeta `comercios/pre-registro/` ni la cuenta de Cloudinary, a diferencia de otros flujos (`validarFotoPerfilComercio`, `validarFotoNuevoComercio`, `CloudinaryService.java:115-137`). Ver D-06.

**Impedir que un Dueño o Administrador sea Empleado**:
- En el registro NO EXISTE ninguna comprobación sobre este punto. La separación sale de otros mecanismos:
  - el Dueño tiene `usuario.rol = DUENO`;
  - `MatrizRolesService.capacidadesDe` / `puedeSerEmpleado` (`BE services/MatrizRolesService.java:35-56`): `puedeSerEmpleado = !administrador && !dueno`;
  - se hace cumplir al invitar y al aceptar una invitación (`AptitudCuentaEmpleadoService`, tramo E1; fuera de este tramo).
- Un email o DNI ya usado por un Cliente/Empleado no puede reutilizarse para registrar un comercio (409 por email/DNI).

### 5. Salidas
- **201** `"Comercio registrado correctamente, verificá tu email"` (`AuthController.java:81`), con `data = {id, email, rol: "DUENO", estado: "PENDIENTE", fotoPerfilUrl: null}`.
- Sin token ni sesión.
- Errores: 400 (C1, redes repetidas, localidad no habilitada, horarios o modalidades), 404 localidad, 409 (email, usuario, CUIT, DNI, nombre de comercio), 500.

### 6. Efectos secundarios
- Email de verificación (C4), igual que P1.01. Si el envío falla no se revierte nada.
- No hay aviso al Administrador al registrarse. Aparece en la bandeja de pendientes. Otros efectos del tramo de aprobación: fuera de este mapa.

### 7. Frontend
- Pantalla `FE registro-comercio.html`; lógica `FE js/auth.js:290-473` `initRegistroComercio`; componentes en `FE js/comercio-form.js` (`initFotoComercio`, `initCamposNegocio`, `initDatosLegales`, `initHorarios`, `initRedesSociales`).
- 4 pasos:
  1. negocio (foto del comercio, nombre, teléfono, tipo, modalidades, dirección);
  2. legales + cuenta;
  3. horarios;
  4. redes sociales + términos.
- Foto del comercio: obligatoria en el cliente, `"Agregá una foto de perfil de tu comercio"` (`comercio-form.js:356-357`). Recorte 1:1 y misma validación de archivo que Cliente.
- Paso 2 (`auth.js:348-383`), validaciones en orden:
  1. nombre de usuario;
  2. datos legales (`initDatosLegales().validar()`: CUIT, domicilio fiscal, representante; razón social opcional);
  3. email;
  4. contraseña;
  5. confirmación.
- CUIT: filtra a dígitos (máx. 11) y valida con `esCuitValido`: `"El CUIT es obligatorio"` / `"El CUIT debe tener 11 dígitos numéricos"`. Domicilio fiscal: `"El domicilio fiscal es obligatorio"` / `"El domicilio fiscal no puede contener solo caracteres especiales"`. Los campos opcionales (razón social, tipo de sociedad, condición IVA, fecha de inicio) están en una sección plegable.
- Envío (`auth.js:398-472`):
  1. valida términos (`"Tenés que aceptar los Términos y Condiciones"`);
  2. recolecta horarios y redes;
  3. botón `"Registrando comercio..."`;
  4. sube la foto a Cloudinary (si falla: vuelve al paso 1 con banner `error.message` del error de Cloudinary o `"No pudimos subir la foto. Intentá nuevamente."`);
  5. `POST /auth/registro/comercio`.
- Éxito: `"Registro enviado"` / `"Te enviamos un código de 6 dígitos a tu email. Verificá tu cuenta y luego un administrador va a revisar tu comercio y te vamos a avisar por email cuando quede aprobado."` y botón `"Ingresar código de verificación"` (`verificar-email.html?email=`). No hay login automático.
- Texto a verificar: la pantalla promete `"te vamos a avisar por email cuando quede aprobado"`. En el código leído de este tramo no hay un email de aprobación (el aviso al Dueño es in-app). No se auditó el tramo de aprobación. Ver sección C.
- Errores: 409 de usuario → paso 2; 409 de nombre de comercio → paso 1; 400 con `data` → al paso que corresponda con `"Revisá los campos marcados."`; otros → paso 4 (o paso 3 si hay error de horarios) con `error.message`.

### 8. Desvíos
Ver sección B: D-06, D-07, D-09, D-13.

---

## P1.03 Verificación de email y reenvío de código

### 1. Funciones y archivos
- Controlador: `BE controllers/AuthController.java:112-117` `verificarEmailConCodigo`; `:119-125` `reenviarVerificacion`; `:106-110` `verificarEmail` (ruta legada por valor del token).
- Servicio: `BE services/AuthService.java:218-224` `verificarEmailConCodigo`; `:231-235` `activarSiEstabaPendiente`; `:237-251` `reenviarVerificacion`; `:202-208` `verificarEmail`; `:521-527` `generarToken`; `:563-588` `obtenerTokenValidoPorCodigo`; `:590-594` `consumirToken`.
- `BE services/EstadoUsuarioService.java:43-64` `cambiar`.
- Repositorios: `UsuarioRepository.findByEmailConBloqueo`, `findByEmail`; `TokenRepository` (`findFirstByUsuarioIdAndTipoAndEstadoOrderByFechaCreacionDesc`, `findByUsuarioIdAndTipoAndEstado`, `findByTokenAndEstado`, `saveAll`, `save`); `HistorialEstadoUsuarioRepository`.

### 2. Endpoint
| Endpoint | Método | Ruta | Rol | `X-Comercio-Id` | Público |
|---|---|---|---|---|---|
| Verificar con código | POST | `/api/v1/auth/verificar` | ninguno | no | sí |
| Reenviar código | POST | `/api/v1/auth/reenviar-verificacion` | ninguno | no | sí |
| Verificar por valor del token (legado) | GET | `/api/v1/auth/verificar/{token}` | ninguno | no | sí |

### 3. Entradas y validaciones
**POST `/auth/verificar`** (`VerificarCodigoRequestDTO`; sin normalización del email):
- `email`: `@NotBlank` `"No debe estar vacío"`; `@Email` `"Ingresá un email con formato válido"`.
- `codigo`: `@NotBlank` `"No debe estar vacío"`; `@Pattern \d{6}` `"El código debe tener 6 dígitos numéricos"`.

**POST `/auth/reenviar-verificacion`** (`ReenviarVerificacionRequestDTO`):
- `email`: `@NotBlank` `"No debe estar vacío"`; `@Email` `"Ingresá un email con formato válido"`.

**GET `/auth/verificar/{token}`**: sin DTO.

**Reglas del servicio de `verificarEmailConCodigo`** (en orden):
1. `findByEmailConBloqueo(email)` (`SELECT ... FOR UPDATE`; null si no existe).
2. `obtenerTokenValidoPorCodigo(email, codigo, VERIFICACION_EMAIL)` (C5): 401 `"Código incorrecto o vencido"` / 409 `"El código venció. Solicitá uno nuevo."` / 401 `"Código incorrecto. Te quedan N intento(s)."` / 409 `"Superaste el máximo de intentos permitidos. Solicitá un nuevo código."`.
3. `consumirToken` (`UTILIZADO`, `fecha_uso = now`).
4. `activarSiEstabaPendiente`: solo si el usuario está `PENDIENTE`.

**Reglas de `reenviarVerificacion`** (en orden):
1. `findByEmail(email)` sin lock → 404 `"No existe una cuenta con ese email"`.
2. `estado != PENDIENTE` → 409 `"Esta cuenta ya está verificada"`. El mismo texto se devuelve para cuentas `ACTIVO`, `BLOQUEADO`, `SUSPENDIDO` e `INACTIVO`.

**Reglas de `GET /verificar/{token}`** (`obtenerTokenValido`, `:541-554`):
- `findByTokenAndEstado(token, PENDIENTE)` → 401 `"Token inválido o ya utilizado"`.
- tipo distinto → 401 `"Token inválido para esta operación"`.
- vencido → 401 `"Token expirado"`.
- Este camino busca por el valor del código, sin email y sin contador de intentos. El frontend no lo usa (D-16).

### 4. Pasos en orden exacto
**Verificar (POST)**:
- Lecturas: `usuario` por email con `FOR UPDATE`; `usuario` por email (otra vez, dentro de `obtenerTokenValidoPorCodigo`); `token` más reciente `PENDIENTE` del tipo.
- Validación del código (C5).
- Escrituras:
  - `UPDATE token`: `estado = UTILIZADO`, `fecha_uso = now`.
  - Si el usuario está `PENDIENTE`: `EstadoUsuarioService.cambiar(usuario, ACTIVO, "Verificación de email", null)`:
    - `UPDATE usuario`: `estado = ACTIVO`, `motivo_suspension = NULL`, `suspendido_desde = NULL`, `fecha_actualizacion = ahora`, `fecha_ultimo_acceso = ahora` (con el `Clock` de la app, truncado a segundos);
    - `INSERT historial_estado_usuario`: `usuario`, `administrador = NULL`, `estado_origen = PENDIENTE`, `estado_destino = ACTIVO`, `motivo = "Verificación de email"`, `fecha_hora`.
  - Si el usuario no está `PENDIENTE`: consume el código y no cambia nada (`AuthService.java:226-230`).
- Intentos fallidos: se persisten aunque la respuesta sea error (C2).
- NO se escribe `usuario.email_verificado` (D-07). NO se crea sesión.
- Un solo bloque transaccional; sin llamadas externas.

**Reenviar (POST)**:
1. Lecturas (usuario, tokens pendientes).
2. `generarToken` (`:521-527`):
   - lee los tokens `PENDIENTE` del usuario y del tipo y los marca `UTILIZADO` (no completa `fecha_uso`; el reenvío invalida el código anterior);
   - `TokenService.crear(...)` con vencimiento `now + 24 h`: nuevo token con `intentos_fallidos = 0`.
3. Email de verificación post-commit (C4).

### 5. Salidas
- Verificar: 200 `"Email verificado correctamente"`, `data` null. Errores: 400 (DTO), 401 `"Código incorrecto o vencido"`, 401 `"Código incorrecto. Te quedan N intento(s)."` (con `data {intentosRestantes}`), 409 `"El código venció. Solicitá uno nuevo."`, 409 `"Superaste el máximo de intentos permitidos. Solicitá un nuevo código."`.
- Reenviar: 200 `"Si la cuenta existe y está pendiente de verificación, se envió un nuevo código"` (`AuthController.java:124`). Errores: 400, 404 `"No existe una cuenta con ese email"`, 409 `"Esta cuenta ya está verificada"`, 500 (generación de código).
- El mensaje 200 del reenvío sugiere una respuesta genérica, pero el servicio devuelve 404/409 que distinguen si la cuenta existe y su estado (D-04).

### 6. Efectos secundarios
- Verificación exitosa: usuario `PENDIENTE → ACTIVO`, fila en `historial_estado_usuario`, `fecha_ultimo_acceso` actualizada. Sin email ni aviso.
- Reenvío: email de verificación (C4), los códigos previos quedan `UTILIZADO`.
- Jobs: ninguno. NO EXISTE el job que pase tokens a `EXPIRADO` que describe el diccionario (`EstadoToken.EXPIRADO` nunca se asigna; D-07).
- Límites de reenvío en el servidor: NO EXISTEN (ni espera ni tope por hora). La espera de 30 s es solo de interfaz.

### 7. Frontend
- Pantalla `FE verificar-email.html`; `FE js/auth.js:475-616` `initVerificarEmail`; entrada de código `FE js/otp.js`.
- Texto con email en la URL: `"Te enviamos un código de 6 dígitos al email <email>. Ingresalo acá para activar tu cuenta. El código vence: si ya no te sirve, pedí uno nuevo."`.
- Sin email en la URL: se muestra el campo email y el texto `"Ingresá el email con el que te registraste y el código de 6 dígitos que te enviamos. El código vence: si ya no te sirve, pedí uno nuevo."`.
- El envío se dispara al completar los 6 dígitos o con el botón `"Verificar cuenta"` (`"Verificando..."`). Validaciones previas: `"El email es obligatorio"`, `"Ingresá un email válido"`, `"Ingresá el código de 6 dígitos."`.
- Reenvío (botón `"Reenviar código"` / `"Pedir un código nuevo"`):
  - banner `"Te enviamos un nuevo código."`;
  - espera de 30 s con el botón deshabilitado y el rótulo `"Reenviar código (N s)"` (`ESPERA_REENVIO_SEGUNDOS = 30`, `auth.js:545`);
  - si falla: banner con `error.message` (por ejemplo `"No existe una cuenta con ese email"` o `"Esta cuenta ya está verificada"`) o `"No pudimos reenviar el código. Intentá nuevamente."`.
- Errores del servidor:
  - 409 → pantalla `"No pudimos verificar tu cuenta"` con el mensaje del servidor (o `"El código no es válido o ya venció. Pedí uno nuevo para continuar."`) y los botones `"Pedir un código nuevo"` / `"Ir al inicio de sesión"`;
  - 401 → error bajo el campo del código (`error.message` o `"El código ingresado es incorrecto."`);
  - otro → banner `"No pudimos verificar tu cuenta. Intentá nuevamente."`.
- Éxito: `"Email verificado"` / `"Tu cuenta ya está activa. Ya podés iniciar sesión en Bajoneá."` y botón `"Ir al inicio de sesión"`. No hay inicio de sesión automático.
- Origen desde el login: el banner de PENDIENTE enlaza a `verificar-email.html` sin email (ver P1.04).

### 8. Desvíos
Ver sección B: D-04, D-07, D-09, D-16, D-18.

---

## P1.04 Inicio de sesión

### 1. Funciones y archivos
- Controlador: `BE controllers/AuthController.java:90-96` `login`.
- Servicio: `BE services/AuthService.java:107-145` `login`; `:182-200` `iniciarSesion`; `:445-450` `validarEstadoParaLogin`; `:452-464` `registrarIntentoFallido`; `:480-489` `propagarBloqueoAComercio`; `:505-512` `cerrarSesionActivaSiExiste`; `:169-180` caminos de cuenta inactiva.
- `BE services/MensajesEstadoCuenta.java:19-27`; `BE services/EstadoUsuarioService.java`; `BE services/ComerciosAlReactivarService.java`; `BE config/security/JwtService.java:31-44`.
- Repositorios: `UsuarioRepository.findByNombreUsuarioConBloqueo`, `SesionRepository`, `ComercioRepository`.
- Excepciones: `CredencialesInvalidasException`, `CuentaSuspendidaException`, `CuentaInactivaException`.

### 2. Endpoint
`POST /api/v1/auth/login`. Rol requerido: ninguno (público). No usa `X-Comercio-Id`. Sin rate limit por IP (C7).

### 3. Entradas y validaciones
- Body `LoginRequestDTO`: `nombreUsuario`, `password`.
- Normalización: `nombreUsuario` con `trim` + minúsculas; no se valida formato (`LoginRequestDTO.java:27-29`).
- Validación del DTO: ambos `@NotBlank` con `"No debe estar vacío"`.
- Identificación: SOLO por nombre de usuario. El email no es credencial: no hay `findByEmail` en `login`.

**Orden exacto de los chequeos del servicio** (`AuthService.java:107-145`):
1. `findByNombreUsuarioConBloqueo` (`SELECT ... FOR UPDATE` por `nombre_usuario`). Si no existe: 401 `"Usuario o contraseña incorrectos"`, `data` null.
2. Si el estado NO es `SUSPENDIDO` ni `INACTIVO`: `validarEstadoParaLogin` — antes de comparar la contraseña:
   - `PENDIENTE` → 409 `"Verificá tu email antes de iniciar sesión"`;
   - `BLOQUEADO` → 409 `"Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"`;
   - `ACTIVO` → sigue.
3. Si el estado es `INACTIVO`: `exigirSinIntentosAgotados`. Si `intentos_fallidos >= 3` → 409 `"Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"` (el estado no cambia). Corre antes de la contraseña.
4. `passwordEncoder.matches(password, password_hash)` (BCrypt). Si NO coincide:
   - `SUSPENDIDO` → 401 `"Usuario o contraseña incorrectos"`, `data` null, sin sumar intentos;
   - `INACTIVO` → `registrarIntentoFallidoDeCuentaInactiva` (+1, sin bloquear) → 401 `"Usuario o contraseña incorrectos"` con `data {intentosRestantes: max(3 - intentos, 0)}`;
   - `ACTIVO` → `registrarIntentoFallido`: +1 en `intentos_fallidos`. Al llegar a 3 (`MAX_INTENTOS_FALLIDOS = 3`): `EstadoUsuarioService.cambiar(BLOQUEADO, "Bloqueo de cuenta por intentos fallidos", null)`, cierra la sesión activa (`FORZADO`) y `propagarBloqueoAComercio` (solo si es `DUENO`: los comercios `APROBADO`/`APTO_VENTA` pasan a `CERRADO_TEMPORALMENTE` por `aptitudVentaComercioService.cerrarPorBloqueo`). Luego `save`. Responde 401 `"Usuario o contraseña incorrectos"` con `data {intentosRestantes: max(3 - intentos, 0)}`.
5. Contraseña correcta:
   - `SUSPENDIDO` → 409 `"Tu cuenta fue suspendida"`, `data {codigo: "CUENTA_SUSPENDIDA", motivo}`;
   - `INACTIVO` → `intentos_fallidos = 0`, `save`; 409 `"Cuenta inactiva. Solicitá la reactivación de tu cuenta"`, `data {codigo: "CUENTA_INACTIVA", comercios: [...]}`. Para un `DUENO` la lista sale de `ComerciosAlReactivarService.deDueno` (`{comercioId, nombre, estadoActual, resultado: VUELVE | SIGUE_SUSPENDIDO}`); para los demás roles es `[]`;
   - `ACTIVO` → `iniciarSesion`.

- Comparador con hash dummy cuando el usuario no existe: NO EXISTE EN EL CÓDIGO. Si el usuario no existe se lanza el 401 en el paso 1, sin llamar a BCrypt (D-01).
- Un email verificado no se chequea aparte: el único chequeo es `estado == PENDIENTE`. `usuario.email_verificado` no se lee en ningún lado.

### 4. Pasos en orden exacto
- Todo el método corre en una única transacción (C2, con `noRollbackFor`). La fila del usuario queda bloqueada `FOR UPDATE` desde el paso 1 hasta el commit, incluida la comparación BCrypt.
- Lecturas: `usuario` por `nombre_usuario`; `comercio` del Dueño (`findByDuenoIdOrderByFechaRegistroAscIdAsc`) si bloquea; `sesion` activa.

**`iniciarSesion`** (`:182-200`), solo con cuenta `ACTIVO`:
1. `UPDATE usuario`: `intentos_fallidos = 0`, `fecha_ultimo_acceso = LocalDateTime.now()`.
2. `cerrarSesionActivaSiExiste(usuario, FORZADO)`: `UPDATE sesion` de la sesión con `activa = true`: `activa = false`, `tipo_cierre = FORZADO`, `fecha_cierre = now`.
3. `INSERT sesion`: `usuario_id`, `activa = true`, `fecha_inicio = LocalDateTime.now()`, `ip_origen = request.getRemoteAddr()`, `navegador = User-Agent`. `tipo_cierre`, `fecha_cierre` y `dispositivo` quedan en `NULL` (`dispositivo` nunca se completa).
4. `jwtService.generarToken(usuario, sesion.getId())`.

**JWT** (`JwtService.java:31-44`):
- Claims: `sub` = id del usuario, `userId`, `rol` (`usuario.getRol().name()`), `sesionId`, `iat`, `exp`.
- Vencimiento: `jwt.expiration-ms=86400000` (24 h) (`application.properties:22`).
- Firma HMAC con `jwt.secret`.
- El rol del JWT es uno solo. El Empleado viaja con `rol = CLIENTE`. El contexto de comercio no está en el token: lo resuelve el header `X-Comercio-Id` contra `empleado_comercio` en cada request.

- Política de sesión: sesión única. Un login nuevo cierra la anterior con `tipo_cierre = FORZADO`. NO se envía email ni aviso al otro dispositivo (no hay ningún envío en `iniciarSesion` ni en `cerrarSesionActivaSiExiste`). La sesión vieja recibe 401 en su próxima request (C6).
- Qué queda afuera de la transacción: nada (el login no envía emails).

**Empleado**: el login no distingue al Empleado. Devuelve `rol = CLIENTE` y no incluye ningún dato de comercios. El frontend consulta aparte `GET /empleados/mis-comercios` (ver sección 7).

### 5. Salidas
- **200** `"Login exitoso"`, `data = {token, usuario: {id, email, rol, estado, fotoPerfilUrl, nombre}}`. `nombre` sale de `personaFisicaRepository.findNombreByUsuarioId` (`AuthService.java:596-600`).
- Errores:
  - 400 (`"No debe estar vacío"` por campo);
  - 401 `"Usuario o contraseña incorrectos"` (con o sin `intentosRestantes`);
  - 409 `"Verificá tu email antes de iniciar sesión"`;
  - 409 `"Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"`;
  - 409 `"Tu cuenta fue suspendida"` (`CUENTA_SUSPENDIDA`);
  - 409 `"Cuenta inactiva. Solicitá la reactivación de tu cuenta"` (`CUENTA_INACTIVA`).

### 6. Efectos secundarios
- Bloqueo al 3er intento fallido: usuario `ACTIVO → BLOQUEADO` (+ fila en `historial_estado_usuario`, motivo `"Bloqueo de cuenta por intentos fallidos"`, sin administrador); sesión activa cerrada `FORZADO`; si es Dueño, comercios `APROBADO`/`APTO_VENTA` → `CERRADO_TEMPORALMENTE` (una fila de `historial_estado_comercio` por comercio, motivo `"Bloqueo de cuenta por intentos fallidos"`).
- Emails y avisos in-app: ninguno en este flujo.
- Con la contraseña correcta, un `intentos_fallidos` previo se pone en 0 (activo e inactivo).
- Jobs relacionados: `InactivacionCuentaJob` (03:30, fuera de este flujo; ver P1.05).

### 7. Frontend
- Pantalla `FE login.html`; `FE js/auth.js:89-253` `initLogin`. Título `"Bienvenido de vuelta"`, subtítulo `"Ingresá con tu nombre de usuario y contraseña."`. Enlaces: `"¿Olvidaste tu contraseña?"`, `"Registrate"`, `"Tengo una invitación"`.
- Validación del cliente: `"Completá tu nombre de usuario y tu contraseña."` / `"Ingresá tu nombre de usuario."` / `"Ingresá tu contraseña."`. Botón `"Ingresando..."` mientras envía. El nombre de usuario se envía en minúsculas.
- Errores:
  - 401: `"Usuario o contraseña incorrectos. Intentá nuevamente."`. Si `intentosRestantes === 1`: aviso `"Cuidado: si fallás una vez más, tu cuenta se bloqueará."` (`auth.js:201-203`). Con `intentosRestantes === 0` (3er intento, la cuenta ya quedó bloqueada) NO muestra ningún aviso de bloqueo: solo el 401 genérico (D-11).
  - 409 `CUENTA_SUSPENDIDA`: hoja inferior `"Cuenta suspendida"` con el caja `"Motivo"`; botones `"Contactar a Soporte"` (`soporte.html?tipo=APELACION_CUENTA`) y `"Cerrar"` (`FE js/cuenta-suspendida.js`, `abrirHojaCuentaSuspendida`).
  - 409 `CUENTA_INACTIVA`: pantalla completa (ver P1.07).
  - 409 `"Verificá tu email antes de iniciar sesión"`: banner de advertencia `"Todavía no verificaste tu email. Ingresá el código de 6 dígitos que te enviamos al registrarte en la pantalla de verificación."` con enlace a `verificar-email.html` (sin email en la URL; esa pantalla lo pide).
  - 409 `"Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"`: banner de error `"Tu cuenta está bloqueada por intentos fallidos. Recuperá tu contraseña para desbloquearla."` con enlace a `recuperar-password.html` y enlace `"Contactar a Soporte"` (`soporte.html?tipo=NO_PUEDO_ENTRAR`).
  - Otro 409: banner con `error.message`.
- Éxito (`auth.js:187-193`): `setSesion(token, usuario)` (guarda token y usuario en `localStorage`) y `redirigirPostLogin`:
  - `CLIENTE`: consulta `GET /empleados/mis-comercios`. Si el error es cualquiera, trata como Cliente. Si hay al menos un comercio: `seleccionar-contexto.html`. Si no: contexto Cliente y `index.html`. Con contexto Empleado guardado en la pestaña: `comercio-dashboard.html`.
  - `ADMINISTRADOR`: `admin-dashboard.html`.
  - `DUENO`: `resolverComercioActivo()` (`GET /comercios/mis-comercios`):
    - sin comercios: error interno y banner `"No pudimos verificar el estado de tu comercio. Intentá nuevamente."`;
    - destino operativo (`APROBADO`/`APTO_VENTA`/`SUSPENDIDO` ...): `comercio-dashboard.html`;
    - solo `PENDIENTE`/`RECHAZADO`/`RECHAZO_DEFINITIVO`: `comercio-pendiente.html?id=`, `comercio-rechazado.html?id=` o `comercio-rechazo-definitivo.html?id=`;
    - ninguno operativo ni de estado (por ejemplo solo cerrados o inactivos): banner de advertencia `"Tu comercio no está operativo en este momento. "` + enlace `"Contactar a Soporte"` (`soporte.html?tipo=APELACION_COMERCIO`) + `" para más información."`.
- El token vive en `localStorage` (`bajonea_token`); el contexto del Empleado en `sessionStorage`.

### 8. Desvíos
Ver sección B: D-01, D-02, D-05, D-08, D-11, D-13.

---

## P1.05 Cierre de sesión (manual, automático, forzado e inactividad)

### 1. Funciones y archivos
- Manual: `BE controllers/AuthController.java:171-175` `logout`; `BE services/AuthService.java:435-443` `logout`.
- Forzado: `AuthService.java:505-512` `cerrarSesionActivaSiExiste(usuario, FORZADO)`, llamado en `:187` (login), `:304` y `:307` (recuperación), `:331` (cambio de contraseña desde perfil) y `:458` (bloqueo por 3 intentos).
- Inactividad: `BE services/InactivacionCuentaService.java:169-177` `cerrarSesiones` (`INACTIVIDAD`); `BE services/InactivacionCuentaJob.java`.
- Suspensión: `BE services/SuspensionUsuarioService.java:192` y `BE services/SuspensionDuenoService.java:422` asignan `SUSPENSION` (fuera de la lista del pedido, pero existe en el enum).
- Invalidación: `BE config/security/JwtAuthenticationFilter.java` (C6); `BE repositories/SesionRepository.java` (`leerEstadoDeSesion`, `findActivasDelUsuario`, `findByUsuarioIdAndActivaTrue`).
- Enum: `BE enums/TipoCierreSesion.java`: `MANUAL`, `AUTOMATICO`, `FORZADO`, `SUSPENSION`, `INACTIVIDAD`.

### 2. Endpoint
`POST /api/v1/auth/logout`. Rol: cualquiera autenticado (JWT; cae en `anyRequest().authenticated()`). No usa `X-Comercio-Id`. No es público. Sin body. El cierre forzado, el de inactividad y el de suspensión no tienen endpoint propio: ocurren dentro de los flujos de P1.04, P1.06 y del job.

### 3. Entradas y validaciones
- Logout: sin body. El `sesionId` sale del JWT (`AuthenticatedUser.sesionId()`).
- Validaciones: la sesión debe existir (`findById`) → si no, 404 `"Sesión no encontrada"`. Un token de una sesión ya cerrada o inexistente no llega al servicio: el filtro responde 401 (C6).

### 4. Pasos y asignación de `tipo_cierre`
| Tipo | Quién lo dispara | Condición | Dónde se asigna |
|---|---|---|---|
| `MANUAL` | El usuario | `POST /auth/logout` | `AuthService.java:440` |
| `FORZADO` | El sistema | un login exitoso con otra sesión activa; bloqueo por 3 intentos; recuperación de contraseña (estado distinto de `SUSPENDIDO`); cambio de contraseña desde perfil | `AuthService.java:187, 304, 307, 331, 458` |
| `INACTIVIDAD` | `InactivacionCuentaJob` | cuenta `ACTIVO` con `fecha_ultimo_acceso < ahora - 3 meses` y sin las exenciones del job | `InactivacionCuentaService.java:173` |
| `SUSPENSION` | Administrador al suspender | suspensión de Cliente o de Dueño | `SuspensionUsuarioService.java:192`, `SuspensionDuenoService.java:422` |
| `AUTOMATICO` | NADIE | NO EXISTE EN EL CÓDIGO: ninguna línea asigna este valor | — |

**Logout manual**:
1. `sesionRepository.findById(sesionId)`.
2. `UPDATE sesion`: `activa = false`, `tipo_cierre = MANUAL`, `fecha_cierre = LocalDateTime.now()`.
3. Una transacción; sin locks; sin llamadas externas.

**Forzado**: `UPDATE sesion` de la sesión `activa = true` del usuario (`findByUsuarioIdAndActivaTrue`): `activa = false`, `tipo_cierre = FORZADO`, `fecha_cierre = now`. Se ejecuta con la fila del usuario ya bloqueada.

**Inactividad** (`InactivacionCuentaService`):
- `InactivacionCuentaJob.programada` corre con `@Scheduled(cron = "${inactividad.cron:0 30 3 * * *}", zone = "${app.zona-horaria:America/Argentina/Ushuaia}")`, es decir todos los días a las 03:30 de Ushuaia. Habilitado por `inactividad.job-habilitado` (por defecto `true`; `false` en el perfil test).
- Candidatas: `InactividadCuentaRepository.candidatos(corte, tope)` con `corte = ahora - 3 meses` (`inactividad.meses`, por defecto 3), tope 200 por corrida (`inactividad.tope-por-corrida`). Condición (`InactividadCuentaRepository.CONDICION`): `u.estado = 'ACTIVO'`, `u.rol <> 'ADMINISTRADOR'`, `fecha_ultimo_acceso < corte`, sin pedidos en curso como comprador (`PENDIENTE_PAGO`, `PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`), sin pedidos en curso en ninguno de sus comercios y sin pedidos creados desde el corte en sus comercios. Quedan afuera por la condición `estado = 'ACTIVO'`: suspendidos, pendientes, bloqueados e inactivos.
- Cada cuenta va en su propia transacción: `usuario FOR UPDATE`, comercios inactivables por clave primaria con `FOR UPDATE`, revalida elegibilidad; luego `EstadoUsuarioService.cambiar(INACTIVO, "Inactividad", null)`, `cerrarSesiones` (`INACTIVIDAD`), comercios `→ INACTIVO` y aviso.
- Qué dura una sesión por tiempo: NO EXISTE un cierre por inactividad de sesión. Una sesión sigue en `activa = true` en la base aunque el JWT haya vencido (24 h): el filtro la rechaza por expiración de la firma, pero la fila no se actualiza. Solo se cierra cuando la misma cuenta inicia sesión de nuevo (`FORZADO`). No hay configuración de "tiempo de inactividad de sesión" en el código ni en `application.properties`. El único temporizador de inactividad es el de 3 meses de cuenta (`inactividad.meses`).
- Frontend: NO EXISTE un temporizador de inactividad ni de cierre automático en `FE js/` (búsqueda sin resultados).

### 5. Salidas
- Logout: 200 `"Sesión cerrada correctamente"`, `data` null. Errores: 401 (sesión cerrada o token inválido, C6), 404 `"Sesión no encontrada"`.
- Forzado, inactividad y suspensión: no tienen respuesta propia. La sesión afectada recibe 401 en la próxima request (C6); en el caso de suspensión, 401 con `CUENTA_SUSPENDIDA`.
- Error cuando no hay sesión activa en logout: el filtro devuelve 401 `"No autenticado: token ausente, inválido, expirado o sesión cerrada"`; `AuthService.logout` no tiene un mensaje específico de "no hay sesión activa".

### 6. Efectos secundarios
- Logout: ninguno (sin email ni aviso).
- Inactividad (`AvisoCuentaService.avisarInactivacion`, `BE services/AvisoCuentaService.java:81-93`):
  - aviso in-app `CUENTA_INACTIVADA`: `"Tu cuenta quedó inactiva por falta de uso."`;
  - por cada comercio inactivado, aviso `COMERCIO_INACTIVADO` al Dueño: `"Tu comercio '<nombre>' dejó de estar disponible porque tu cuenta quedó inactiva."`;
  - email post-commit, un solo intento: asunto `"Tu cuenta de Bajoneá quedó inactiva por falta de uso"`; cuerpo `"Tu cuenta de Bajoneá quedó inactiva porque pasaron 3 meses sin que la uses.\n\n[Tus comercios (<lista>) dejaron de estar disponibles: no aparecen en el catálogo ni reciben pedidos nuevos hasta que reactives tu cuenta.\n\n]Para volver, iniciá sesión con tu usuario y tu contraseña y elegí reactivar tu cuenta. No perdés ningún dato.\n\nEquipo de Bajoneá"` (`EmailService.java:149-160`).
- Cambios de estado de otras entidades por inactividad: usuario `ACTIVO → INACTIVO` (historial `"Inactividad"`), comercios `APROBADO`/`APTO_VENTA`/`CERRADO_TEMPORALMENTE → INACTIVO` (motivo `"Inactivación automática de la cuenta del Dueño por falta de uso"`). Los pedidos no se cancelan (cuentas con pedidos en curso quedan exentas).

### 7. Frontend
- Logout manual: `FE js/auth.js:897-904` `logout(destino = 'login.html')`: llama `POST /auth/logout`, ignora cualquier error, `clearSesion()` (borra token, usuario, comercio activo y contexto) y navega a `login.html`.
- 401 con token guardado (sesión cerrada por login en otro dispositivo, por vencimiento del JWT, por bloqueo, por recuperación de contraseña o por inactividad): `clearSesion()` y modal `"Sesión cerrada"` / `"Tu sesión terminó. Iniciá sesión de nuevo."` (`FE js/api.js:327-334, 674-678`). No distingue la causa.
- 401/409 con `CUENTA_SUSPENDIDA` y token: pantalla completa `"Tu cuenta fue suspendida"` (`FE js/cuenta-suspendida.js`, `mostrarPantallaCuentaSuspendida`), con `"Mis consultas"`, `"Contactar a Soporte"` y `"Cerrar sesión"`; no borra la sesión hasta `"Cerrar sesión"`.
- Cambio de contraseña desde perfil: `clearSesion()` y `login.html?passwordActualizada=1` (ver P1.06).

### 8. Desvíos
Ver sección B: D-02, D-05, D-13.

---

## P1.06 Recuperación y cambio de contraseña (incluye desbloqueo de cuenta bloqueada)

### 1. Funciones y archivos
- Controlador: `BE controllers/AuthController.java:127-133` `solicitarRecuperacionPassword`; `:135-140` `validarCodigoRecuperacionPassword`; `:142-147` `confirmarRecuperacionPassword`; `:164-169` `cambiarPasswordDesdePerfil`.
- Servicio: `BE services/AuthService.java:261-269`, `:278-280`, `:289-310`, `:312-332`; `:452-464` `registrarIntentoFallido`; `:498-503` `restaurarComercioSiCorresponde`; `:521-527` `generarToken`.
- `BE services/AptitudVentaComercioService.restaurar`; `BE services/ReactivacionCuentaService.reactivar`; `BE services/EstadoUsuarioService.cambiar`.
- Repositorios: `UsuarioRepository`, `TokenRepository`, `SesionRepository`, `ComercioRepository`.

### 2. Endpoint
| Endpoint | Método | Ruta | Rol | `X-Comercio-Id` | Público |
|---|---|---|---|---|---|
| Solicitar código | POST | `/api/v1/auth/recuperar-password` | ninguno | no | sí |
| Validar código | POST | `/api/v1/auth/recuperar-password/validar-codigo` | ninguno | no | sí |
| Confirmar | POST | `/api/v1/auth/recuperar-password/confirmar` | ninguno | no | sí |
| Cambio desde perfil | POST | `/api/v1/auth/cambiar-password` | cualquier rol autenticado | no | no |

### 3. Entradas y validaciones
**Solicitar** (`RecuperacionPasswordRequestDTO`): `email` `@NotBlank` `"No debe estar vacío"`; `@Email` `"Ingresá un email con formato válido"`. Sin normalización.

**Validar código** (`ValidarCodigoRecuperacionRequestDTO`): `email` (igual); `codigo` `@NotBlank` `"No debe estar vacío"`, `\d{6}` `"El código debe tener 6 dígitos numéricos"`.

**Confirmar** (`ConfirmarRecuperacionPasswordRequestDTO`): `email`, `codigo` (igual que arriba) y `nuevaPassword` `@NotBlank` `"No debe estar vacío"`, `@ValidarPasswordSegura` `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"` (8 a 72).

**Cambio desde perfil** (`CambioPasswordPerfilRequestDTO`): `passwordActual` `@NotBlank` `"No debe estar vacío"`; `passwordNueva` `@NotBlank` `"No debe estar vacío"` y segura (mismo mensaje).

**Reglas del servicio**:
- Solicitar (`:261-269`): `usuarioRepository.findByEmail(email).ifPresent(...)`. Si el email no existe, no pasa nada visible.
- Validar código (`:278-280`): `obtenerTokenValidoPorCodigo(email, codigo, RECUPERACION_PASSWORD)` (C5). No consume el código.
- Confirmar (`:289-310`):
  1. `findByEmailConBloqueo(email)` (`FOR UPDATE`; el resultado no se usa; sirve de serialización).
  2. `obtenerTokenValidoPorCodigo` (C5).
  3. `consumirToken`.
  4. Cambia el hash y `intentos_fallidos = 0`.
- Cambio desde perfil (`:312-332`), en este orden:
  1. `findByIdConBloqueo(usuarioId)` → 404 `"Usuario no encontrado"`.
  2. Contraseña actual incorrecta → `registrarIntentoFallido` → 401 `"La contraseña actual es incorrecta"`, `data {intentosRestantes}`.
  3. Nueva igual a la actual (`matches`) → 400 `"La nueva contraseña debe ser distinta a la actual"`.
- La condición "la nueva no puede repetir la anterior" existe SOLO en el cambio desde perfil. La recuperación NO la valida (D-10).

### 4. Pasos en orden exacto
**Solicitar**:
1. Lee el usuario por email (sin lock).
2. `generarToken(usuario, RECUPERACION_PASSWORD, now + 30 min)` (`EXPIRACION_RECUPERACION_PASSWORD_MIN = 30`, `AuthService.java:77`): marca `UTILIZADO` los tokens `PENDIENTE` previos del mismo tipo y crea uno nuevo (C3).
3. Email de recuperación post-commit (C4).
- Se genera el token para CUALQUIER estado de cuenta (`PENDIENTE`, `ACTIVO`, `BLOQUEADO`, `SUSPENDIDO`, `INACTIVO`). No hay espera ni límite en el servidor (la regeneración reinicia el contador de 5 intentos).

**Confirmar** (`:289-310`): tras consumir el token y fijar la contraseña, ramas por estado del usuario:
- `INACTIVO` → `ReactivacionCuentaService.reactivar(usuario, "Recuperación de contraseña", "Restauración por recuperación de contraseña", null)`: usuario `→ ACTIVO` (con historial y `fecha_ultimo_acceso`), `intentos_fallidos = 0`, y si es Dueño se restauran sus comercios `INACTIVO`. Luego cierra la sesión activa (`FORZADO`).
- `SUSPENDIDO` → solo cambia la contraseña. La cuenta sigue suspendida, no se cierran sesiones y no se restauran comercios (`AuthService.java:300-301`).
- Cualquier otro estado (`PENDIENTE`, `ACTIVO`, `BLOQUEADO`): `EstadoUsuarioService.cambiar(usuario, ACTIVO, "Recuperación de contraseña", null)`, cierra la sesión activa (`FORZADO`), y si es Dueño restaura los comercios `CERRADO_TEMPORALMENTE` (`restaurarComercioSiCorresponde`: `APTO_VENTA` o `APROBADO` según Mercado Pago y documentos, motivo `"Restauración por recuperación de contraseña"`). Para un usuario `ACTIVO`, `cambiar` no escribe nada (ya estaba en ese estado) pero la sesión se cierra y los comercios se restauran igual.
- Columnas que cambian al desbloquear una cuenta `BLOQUEADO`: `usuario.password_hash`, `usuario.intentos_fallidos = 0`, `usuario.estado = ACTIVO`, `usuario.motivo_suspension = NULL`, `usuario.suspendido_desde = NULL`, `usuario.fecha_actualizacion`, `usuario.fecha_ultimo_acceso`, más `INSERT historial_estado_usuario` (`BLOQUEADO → ACTIVO`) y `UPDATE token`.
- Una cuenta `PENDIENTE` que recupera la contraseña pasa a `ACTIVO` sin verificar el email por el flujo de verificación (el código llegó a su email).
- Sesiones tras el cambio: las sesiones activas se cierran con `FORZADO` salvo en la cuenta `SUSPENDIDO`. NO se envía email de aviso de cambio de contraseña (NO EXISTE EN EL CÓDIGO). No hay inicio de sesión automático.

**Cambio desde perfil**:
- Tras la validación: `UPDATE usuario` (`password_hash`, `intentos_fallidos = 0`) y `cerrarSesionActivaSiExiste(FORZADO)`: cierra incluso la sesión desde la que se hizo el cambio.
- Contraseña actual incorrecta: `registrarIntentoFallido` suma 1; al llegar a 3: `BLOQUEADO` (historial `"Bloqueo de cuenta por intentos fallidos"`), cierre `FORZADO` de la sesión y, si es Dueño, comercios `→ CERRADO_TEMPORALMENTE`.
- Por la política `noRollbackFor` (C2), el contador y el bloqueo se confirman aunque la respuesta sea 401.
- El código de recuperación y el de cambio con sesión comparten el contador `usuario.intentos_fallidos` solo en el cambio desde perfil y el login; el de los códigos de recuperación es `token.intentos_fallidos` (5 por código).

### 5. Salidas
- Solicitar: 200 `"Si existe una cuenta asociada a ese email, vas a recibir un código para continuar"` (idéntico exista o no el email). Errores: 400 (DTO), 500 (generación de código).
- Validar código: 200 `"Código válido"`. Errores: 401 `"Código incorrecto o vencido"` / 401 `"Código incorrecto. Te quedan N intento(s)."` / 409 `"El código venció. Solicitá uno nuevo."` / 409 `"Superaste el máximo de intentos permitidos. Solicitá un nuevo código."`.
- Confirmar: 200 `"Contraseña actualizada correctamente"`. Errores: los mismos de validar código y 400 de la contraseña.
- Cambio desde perfil: 200 `"Contraseña cambiada correctamente"`. Errores: 400, 401 `"La contraseña actual es incorrecta"` (con `intentosRestantes`), 400 `"La nueva contraseña debe ser distinta a la actual"`, 404 `"Usuario no encontrado"`, 401 de sesión (C6; una cuenta `SUSPENDIDO` recibe 401 `CUENTA_SUSPENDIDA`).
- Vencimiento del código de recuperación: 30 minutos (confirmado en código y en el texto del email).

### 6. Efectos secundarios
- Email de recuperación (C4), un solo intento.
- Confirmación exitosa: estado, sesiones y comercios según la rama (sección 4). Sin email de aviso. Sin aviso in-app. Sin job.
- Comportamiento con cuentas: `SUSPENDIDA` (cambia la contraseña y sigue suspendida), `INACTIVA` (se reactiva) y `BLOQUEADA` (se desbloquea); ver sección 4.

### 7. Frontend
- Pantalla `FE recuperar-password.html`; `FE js/auth.js:618-780` `initRecuperarPasswordSolicitar`.
- Texto inicial: `"Ingresá tu email y te enviaremos un código de 6 dígitos para restablecer tu contraseña. El código vence en 30 minutos."`. Validaciones: `"Ingresá tu email."` / `"Ingresá un email con formato válido."`. Botón `"Enviar código de recuperación"` (`"Enviando..."`).
- Paso del código: `"Ingresá tu código"` / `"Te enviamos un código de 6 dígitos a tu email."`. Al completar los 6 dígitos llama a `/recuperar-password/validar-codigo`: éxito → paso de contraseña; error → error bajo el campo del código con `error.message`. Botón `"Reenviar código"`: llama de nuevo a `/recuperar-password` y muestra `"Te enviamos un nuevo código."`; NO tiene cuenta regresiva ni espera (a diferencia de la verificación).
- Paso de contraseña: `"Elegí tu nueva contraseña"`, `"Nueva contraseña"`, `"Confirmá tu nueva contraseña"`, botón `"Restablecer contraseña"` (`"Guardando..."`). Validaciones: `"Ingresá una nueva contraseña."`, `"Repetí tu contraseña."`, `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número."`, `"Las contraseñas ingresadas no coinciden."`.
- Éxito: `"Contraseña actualizada"` / `"Ya podés iniciar sesión con tu nueva contraseña."` con `"Ir al inicio de sesión"`. Sin login automático. En 401/409 vuelve al paso del código con el banner `error.message`.
- Cambio desde perfil (Cliente: `FE js/perfil-cuenta.js:262-320`; Dueño: `FE js/comercio.js`, bloque de `form-cambiar-password`):
  - validaciones: `"Ingresá tu contraseña actual."`, `"Ingresá una nueva contraseña."`, `"Repetí tu nueva contraseña."`, `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número."`, `"Las contraseñas ingresadas no coinciden."`;
  - botón `"Guardar nueva contraseña"` (`"Guardando..."`);
  - éxito: `clearSesion()` y redirección a `login.html?passwordActualizada=1`, donde se muestra el banner `"Tu contraseña se actualizó. Iniciá sesión con tu nueva contraseña."`;
  - 401: `"La contraseña actual no es correcta."`; con `intentosRestantes === 1`: banner `"Cuidado: si fallás una vez más, tu cuenta se bloqueará."`;
  - con `intentosRestantes === 0` (cuenta bloqueada): modal `"Cuenta bloqueada"` / `"Tu contraseña fue ingresada incorrectamente varias veces y tu cuenta fue bloqueada por seguridad. Para volver a ingresar, recuperá tu contraseña."` (`FE js/api.js:336-344`; `FE js/catalogo.js:129-139`).

### 8. Desvíos
Ver sección B: D-04 (análogo), D-10, D-12, D-14, D-15, D-18, D-19.

---

## P1.07 Reactivación de cuenta inactiva (vista previa)

### 1. Funciones y archivos
- Reactivación con credenciales: `BE controllers/AuthController.java:98-104` `reactivarConCredenciales`; `BE services/AuthService.java:153-167`.
- Reactivación efectiva (único camino que saca de `INACTIVO`): `BE services/ReactivacionCuentaService.java:33-44` `reactivar`.
- Qué pasa con los comercios (texto de la vista previa): `BE services/ComerciosAlReactivarService.java:25-37` `deDueno`.
- Vía de código por email: `AuthController.java:149-155` `solicitarReactivacionCuenta`; `:157-162` `confirmarReactivacionCuenta`; `AuthService.java:404-412` y `:425-433`.
- Vía del Administrador: `BE controllers/AdministradorController.java:229-240` (`vistaPreviaReactivarCuenta`, `reactivarCuenta`); `BE services/ReactivacionCuentaAdminService.java` (`vistaPrevia`, `reactivar`).
- Restauración de comercios: `BE services/AptitudVentaComercioService.restaurar`.

### 2. Endpoint
| Endpoint | Método | Ruta | Rol | `X-Comercio-Id` | Público |
|---|---|---|---|---|---|
| Vista previa (la ve el propio usuario) | POST | `/api/v1/auth/login` (respuesta 409 `CUENTA_INACTIVA`) | ninguno | no | sí |
| Reactivar con credenciales | POST | `/api/v1/auth/reactivar-cuenta/con-credenciales` | ninguno | no | sí |
| Solicitar código (sin entrada en la UI) | POST | `/api/v1/auth/reactivar-cuenta` | ninguno | no | sí |
| Confirmar código (sin entrada en la UI) | POST | `/api/v1/auth/reactivar-cuenta/confirmar` | ninguno | no | sí |
| Vista previa del Administrador | GET | `/api/v1/administrador/cuentas/{usuarioId}/reactivar/previa` | ADMINISTRADOR | no | no |
| Reactivar (Administrador) | PUT | `/api/v1/administrador/cuentas/{usuarioId}/reactivar` | ADMINISTRADOR | no | no |

- NO EXISTE un endpoint de vista previa para el propio usuario: la "vista previa" es el cuerpo `data` del 409 del login (`comercios`) más la pantalla `"Tu cuenta está inactiva"`.

### 3. Entradas y validaciones
**Reactivar con credenciales**: body `LoginRequestDTO` (mismas validaciones y normalización que el login: `"No debe estar vacío"`). En el servicio, en este orden (`AuthService.java:153-167`):
1. `findByNombreUsuarioConBloqueo` → 401 `"Usuario o contraseña incorrectos"` si no existe.
2. Estado distinto de `INACTIVO` → 401 `"Usuario o contraseña incorrectos"`, sin contar intentos. No revela el estado real.
3. `exigirSinIntentosAgotados`: `intentos_fallidos >= 3` → 409 `"Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"`. Se evalúa antes de comparar la contraseña.
4. Contraseña incorrecta → `registrarIntentoFallidoDeCuentaInactiva` (+1) → 401 `"Usuario o contraseña incorrectos"` con `data {intentosRestantes: max(3 - intentos, 0)}`.
5. Contraseña correcta → `reactivar`.

**Reactivar con código** (sin entrada en la UI):
- Solicitud `ReactivacionCuentaRequestDTO`: `email` `@NotBlank`/`@Email` (mismos mensajes que recuperación).
- Confirmación `ConfirmarReactivacionCuentaRequestDTO`: `email`, `codigo` (`\d{6}`).
- Pasos: `findByEmail(...).ifPresent(...)`. Genera token `REACTIVACION_CUENTA` con vencimiento 24 h (`EXPIRACION_REACTIVACION_CUENTA_HORAS = 24`) para CUALQUIER estado. Email `"Tu código de reactivación de cuenta — Bajoneá"` (C4). Respuesta 200 `"Si existe una cuenta asociada a ese email, vas a recibir un código para continuar"`.
- Confirmación: `findByEmailConBloqueo` (serializa), C5, `consumirToken`, `ReactivacionCuentaService.reactivar(...)`. Si la cuenta no estaba `INACTIVO`, el código se consume y no pasa nada (mismo 200). 200 `"Cuenta reactivada correctamente"` (sin sesión).

**Administrador**:
- Previa (`vistaPrevia`): rol del usuario → si es `ADMINISTRADOR`: 409 `"No se puede reactivar la cuenta de un Administrador"`; usuario inexistente: 404 `"Usuario no encontrado"`. Devuelve `{usuarioId, rol, estado, comercios}`; solo lectura, sin locks.
- Reactivar (`reactivar`): mismas reglas. Si la cuenta no está `INACTIVO`: 409 `"La cuenta no está inactiva"`. Toma el lock del administrador (compartido) y del usuario (`FOR UPDATE`) en orden ascendente de id. 200 `"Cuenta reactivada correctamente"`, `data {usuarioId, estado}`.

### 4. Pasos en orden exacto (reactivación efectiva)
`ReactivacionCuentaService.reactivar` (exige transacción con la fila del usuario bloqueada):
1. Si el estado no es `INACTIVO`: devuelve `false` y no hace nada.
2. `EstadoUsuarioService.cambiar(usuario, ACTIVO, motivoUsuario, administradorId)`: `UPDATE usuario` (`estado = ACTIVO`, `fecha_actualizacion`, `fecha_ultimo_acceso = ahora`) e `INSERT historial_estado_usuario` (`INACTIVO → ACTIVO`). Motivo de usuario: `"Reactivación de cuenta"` (credenciales y código), `"Recuperación de contraseña"` (recuperación) o `"Reactivación por el Administrador"` (Administrador).
3. `usuario.intentos_fallidos = 0`.
4. Si el rol es `DUENO`: `AptitudVentaComercioService.restaurar(usuarioId, INACTIVO, motivoComercios)`: los comercios `INACTIVO` vuelven a `APTO_VENTA` o `APROBADO` según Mercado Pago y documentos, cada uno con su fila de `historial_estado_comercio` (motivos `"Restauración por reactivación de cuenta"`, `"Restauración por recuperación de contraseña"` o `"Reactivación de la cuenta del Dueño por el Administrador"`). Los comercios suspendidos por separado no se tocan.
5. Solo para credenciales: `iniciarSesion` (P1.04): `fecha_ultimo_acceso`, cierre `FORZADO` de sesión previa, `INSERT sesion`, JWT.

- Qué NO se reactiva: relaciones `empleado_comercio`, pedidos, productos ni cuentas de Mercado Pago (la inactivación no los tocó).
- Estado resultante: usuario `ACTIVO`, `intentos_fallidos = 0`.
- Inicio de sesión automático: SÍ en `reactivar-cuenta/con-credenciales` (devuelve `LoginResponseDTO`); NO en el código por email ni en la recuperación ni en el Administrador.
- Una transacción; sin llamadas externas; sin emails.

**Vista previa de comercios** (`ComerciosAlReactivarService.deDueno`, solo lectura): para cada comercio del Dueño en estado `INACTIVO` devuelve `resultado = VUELVE`; en estado `SUSPENDIDO`, `resultado = SIGUE_SUSPENDIDO`; los demás estados no figuran.

### 5. Salidas
- Con credenciales: 200 `"Cuenta reactivada correctamente"`, `data = {token, usuario}` (el mismo `LoginResponseDTO` del login). Errores: 400, 401 `"Usuario o contraseña incorrectos"` (con `intentosRestantes` cuando cuenta el intento), 409 `"Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"`.
- Vista previa: 409 del login con `mensaje = "Cuenta inactiva. Solicitá la reactivación de tu cuenta"`, `data = {codigo: "CUENTA_INACTIVA", comercios: [{comercioId, nombre, estadoActual, resultado}]}`.
- Código por email: 200 `"Si existe una cuenta asociada a ese email, vas a recibir un código para continuar"` y 200 `"Cuenta reactivada correctamente"`; errores de C5.
- Administrador: 200 `"Vista previa obtenida correctamente"`; 200 `"Cuenta reactivada correctamente"`; 404 `"Usuario no encontrado"`; 409 `"No se puede reactivar la cuenta de un Administrador"` / `"La cuenta no está inactiva"`.

### 6. Efectos secundarios
- Cambios de estado: usuario `INACTIVO → ACTIVO` (+ historial) y, para un Dueño, comercios `INACTIVO → APTO_VENTA/APROBADO` (+ historial por comercio).
- Emails y avisos in-app: ninguno al reactivar. El email de la inactivación (`"Tu cuenta de Bajoneá quedó inactiva por falta de uso"`) se envía al momento de inactivar, ver P1.05.
- Jobs: `InactivacionCuentaJob` (diario 03:30) es quien deja la cuenta en `INACTIVO`. Regla de elegibilidad en P1.05. Una cuenta reactivada vuelve a tener `fecha_ultimo_acceso = ahora`, así que no se reinactiva hasta pasados otros 3 meses.

### 7. Frontend
- Entrada: el 409 `CUENTA_INACTIVA` del login (`FE js/auth.js:208-222`). La contraseña tipeada se guarda solo en una variable en memoria, el campo se vacía (`passwordInput.value = ''`) y se pasa a `mostrarPantallaCuentaInactiva` (`FE js/cuenta-inactiva.js`, `mostrarPantallaCuentaInactiva`).
- Pantalla completa:
  - título `"Tu cuenta está inactiva"`;
  - texto `"Pasaron más de 3 meses sin que ingresaras, así que la dejamos en pausa. Tus datos y tus pedidos están a salvo."`;
  - si es Dueño con comercios afectados: sección `"Tus comercios"` con `"<nombre> vuelve a estar disponible."` o `"<nombre> sigue suspendido. Si creés que es un error, escribinos."`;
  - botones `"Reactivar mi cuenta"` (se vuelve `"Reactivando…"`, con el estado `"Reactivando tu cuenta…"`), `"Contactar a Soporte"` (`soporte.html?tipo=NO_PUEDO_ENTRAR`) y `"Volver a ingresar"`.
- Reactivar: `POST /auth/reactivar-cuenta/con-credenciales`. Error: caja de alerta con `error.message` o `"No pudimos reactivar tu cuenta. Probá de nuevo."`. Éxito: cierra la pantalla, `setSesion(token, usuario)`, guarda el toast pendiente `"Cuenta reactivada. ¡Qué bueno verte de nuevo!"` y aplica `redirigirPostLogin` (igual que un login normal). Las credenciales se descartan al reactivar, al volver, con Escape y en `pagehide`.
- `FE reactivar-cuenta.html` + `initReactivarCuentaSolicitar` (`auth.js:782-895`) existen (`"Reactivar tu cuenta"`, `"Cuenta reactivada"` / `"Tu cuenta ya está activa de nuevo. Ya podés iniciar sesión."`), pero ninguna página ni script del frontend enlaza a ellas (búsqueda de `reactivar-cuenta.html` sin resultados). El texto de la pantalla dice `"El código vence en 24 horas."`.
- Administrador: `FE js/admin-reactivar.js` y menú de Clientes/Dueños (fuera del detalle de este mapa).

### 8. Desvíos
Ver sección B: D-13, D-17, D-19. La vista previa para el propio usuario no es un endpoint: es el 409 del login.

---

## A. Inventario propuesto

El código sugiere los siguientes ajustes sobre los 7 diagramas. No son cambios al código.

1. **P1.06 conviene dividirlo en dos diagramas.**
   - P1.06a Recuperación de contraseña: 3 endpoints públicos, códigos de 6 dígitos de 30 min, desbloqueo y reactivación implícita.
   - P1.06b Cambio de contraseña con sesión: endpoint autenticado, contraseña actual, contador de 3 intentos que bloquea la cuenta, cierre de la sesión propia.
   - Motivo: actores, validaciones y efectos distintos (la repetición de la contraseña anterior solo se valida en el cambio con sesión).
2. **P1.01 y P1.02 comparten un subproceso** "firma y subida de foto a Cloudinary" (dos endpoints públicos de firma, rate limit 5/min por IP). Se puede dibujar una sola vez y referenciarla.
3. **P1.07 está repartido en 4 caminos** (credenciales, código, recuperación de contraseña y Administrador). Conviene dibujar el principal (credenciales) y mostrar los otros 3 como entradas al mismo proceso `ReactivacionCuentaService.reactivar`.
4. **Falta un diagrama para la inactivación automática por falta de uso** (`InactivacionCuentaJob`/`InactivacionCuentaService`): es el origen del estado `INACTIVO` que consume P1.07 y el único generador de cierres `INACTIVIDAD` de P1.05. No está en el inventario.
5. **Falta la consulta de disponibilidad de nombre de usuario** (`GET /auth/nombre-usuario/disponibilidad`, público, rate limit 30/min): es un flujo de datos propio del registro.
6. **Falta el flujo posterior al login del Cliente que es Empleado**: `GET /empleados/mis-comercios` y la pantalla `seleccionar-contexto.html`, que deciden el contexto de la sesión (resuelto por `empleado_comercio` y `X-Comercio-Id`). Corresponde probablemente al Tramo del Empleado.
7. **El cambio de nombre de usuario del Cliente** (`AuthService.cambiarNombreUsuario`, expuesto en `ClienteController`) pertenece al tramo de perfil, no a este.
8. **P1.04 y P1.05 comparten la sesión única**: el cierre `FORZADO` por login concurrente está dentro de `iniciarSesion`. Se puede mostrar una sola vez y referenciarlo.

---

## B. Desvíos consolidados (de mayor a menor importancia)

**D-01 (alto). No hay comparación con hash dummy cuando el usuario no existe.**
`AuthService.login` (`:110-111`) lanza el 401 antes de llamar a BCrypt. Una consulta a un usuario inexistente responde más rápido que a uno existente (diferencia de tiempo observable). Contrasta con el requisito de mensaje genérico (`requisitos-funcionales-generales.md:66`), que solo cubre el texto.

**D-02 (alto). `TipoCierreSesion.AUTOMATICO` nunca se asigna y no existe cierre por vencimiento ni por inactividad de sesión.**
- Documentos: el diccionario lo describe como "Cierre por expiración del tiempo de sesión inactiva", y el requisito (`requisitos-funcionales-generales.md:73-75`) habla de "cierre ... automático" y "por vencimiento".
- Código: el JWT vence a las 24 h (`jwt.expiration-ms=86400000`), pero la fila de `sesion` queda `activa = true` hasta el próximo login de esa cuenta. No hay job ni temporizador del frontend.
- Lo único que existe es la inactivación de CUENTA a los 3 meses (`INACTIVIDAD`).

**D-03 (medio-alto). El estado `PENDIENTE` y `BLOQUEADO` se revela sin comprobar la contraseña.**
`validarEstadoParaLogin` (`:445-450`) devuelve 409 antes de comparar la contraseña, para cualquiera que conozca un nombre de usuario. Solo `SUSPENDIDO` e `INACTIVO` se protegen detrás de la contraseña (como describe `requisitos-funcionales-generales.md:15`).
Observación relacionada: el login no tiene límite por IP, así que quien conozca un nombre de usuario puede bloquear esa cuenta con 3 intentos.

**D-04 (medio-alto). Reenvío de verificación: enumera cuentas y no tiene tope en el servidor.**
- El controlador responde un 200 genérico (`"Si la cuenta existe y está pendiente de verificación, se envió un nuevo código"`), pero el servicio lanza 404 `"No existe una cuenta con ese email"` y 409 `"Esta cuenta ya está verificada"` (`AuthService.java:238-243`).
- No hay espera ni tope por hora en el servidor; la espera de 30 s es solo del frontend. Cada reenvío crea un código con `intentos_fallidos = 0`.
- Recuperación y reactivación sí tienen respuesta genérica; también sin espera ni tope.

**D-05 (medio). El aviso de "sesión cerrada" no distingue el login en otro dispositivo y no hay email.**
Requisitos (`requisitos-funcionales-generales.md:46, 75`): "el aviso lo dice". Código: el modal siempre dice `"Tu sesión terminó. Iniciá sesión de nuevo."` (`FE js/api.js:327-334`). No hay email ni aviso al otro dispositivo.

**D-06 (medio). Foto del registro de Dueño.**
- No existe una foto personal del Dueño en el registro (`usuario.foto_perfil_url` queda `NULL`); el requisito dice que puede cargarla y editarla desde su cuenta (`requisitos-funcionales-dueño.md:30`).
- La foto del comercio (obligatoria) solo se valida en el servidor por esquema `https` y host `res.cloudinary.com`: no se valida carpeta ni cuenta (otros flujos sí). El tipo y el tamaño solo se validan en el frontend (JPG/PNG/WebP, 5 MB).

**D-07 (medio). Columnas y estados del diccionario sin uso.**
- `usuario.email_verificado` existe en la base (`V1`, `DEFAULT 0`) pero la entidad no la mapea y nada la escribe: queda en 0 para siempre. El diccionario dice que pasa a `true` al verificar.
- `EstadoToken.EXPIRADO` nunca se asigna y no existe el job periódico que el diccionario describe. Un token vencido queda `PENDIENTE`.

**D-08 (medio). Fechas con la zona de la JVM, no la de Ushuaia.**
`AuthService`, `TokenService` y `RegistroService` usan `LocalDateTime.now()` (por ejemplo `fecha_ultimo_acceso`, `sesion.fecha_inicio`, `fecha_registro`, vencimientos de tokens). `EstadoUsuarioService` y los jobs usan el `Clock` de `America/Argentina/Ushuaia`. Contraste con el hecho canónico de zona única. Documentado como pendiente en `CLAUDE.md` §9.

**D-09 (medio). El registro no escribe la fila inicial de `historial_estado_usuario`.**
El diccionario (`diccionario-de-datos.md`, tabla Usuario) dice que al registrarse se inserta una fila con `estado_origen = NULL` y `estado_destino = PENDIENTE`. `RegistroService` no escribe historial; la primera fila aparece al verificar (`PENDIENTE → ACTIVO`).

**D-10 (medio). La recuperación de contraseña no exige que sea distinta de la anterior y no avisa por email.**
El requisito (`requisitos-funcionales-generales.md:114`) pide "ser distinta a la contraseña anterior". Solo `cambiarPasswordDesdePerfil` lo valida (400 `"La nueva contraseña debe ser distinta a la actual"`). Tampoco existe email de aviso tras cambiar la contraseña.

**D-11 (medio). El 3er intento fallido del login no avisa del bloqueo.**
El servidor responde 401 con `intentosRestantes: 0` y deja la cuenta `BLOQUEADO`. El frontend solo reacciona a `intentosRestantes === 1` (`auth.js:201-203`): en el 3er intento muestra el error genérico y el bloqueo recién se ve en el 4º. En el cambio desde perfil sí hay modal con `intentosRestantes === 0`.

**D-12 (medio). El contador `intentos_fallidos` no se resetea al bloquear.**
El diccionario dice que tras 3 intentos fallidos `intentos_fallidos` se resetea a 0. El código lo deja en 3 y lo pone en 0 en la recuperación, en el login exitoso o en la reactivación.

**D-13 (bajo). Documentación de desfasada respecto del código en textos y flujo.**
- La pantalla de éxito del registro de Dueño dice `"te vamos a avisar por email cuando quede aprobado"`; en el código de este tramo no hay email de aprobación (tramo de aprobación no auditado; ver C-02).
- En P1.01 los 409 de email y DNI se muestran en el banner del paso 2 aunque pertenecen al paso 1.
- El diccionario de datos de `Token` todavía menciona "UUID" y "enlace".

**D-14 (bajo). Mensaje de edad.**
Backend `"Tenés que tener al menos 14 años para registrarte"`; frontend `"Tenés que tener al menos 14 años para poder registrarte."`.

**D-15 (bajo). Reglas de contraseña.**
`CLAUDE.md` §5bis dice "mínimo 8 caracteres, 1 mayúscula, 1 número (sin símbolo)". El código exige 8 a 72 caracteres con mayúscula, minúscula y número (`PasswordSeguraValidator`); coincide con los requisitos (`requisitos-funcionales-generales.md:114`), no con `CLAUDE.md`.

**D-16 (bajo). `GET /auth/verificar/{token}` sigue público.**
Valida por el valor del código sin email ni contador de intentos (`AuthService.java:202-208, 541-554`). No lo usa el frontend. Contradice la regla de 5 intentos por código y "sin links".

**D-17 (bajo). La reactivación por código por email sigue viva.**
Hay endpoints (`/auth/reactivar-cuenta`, `/auth/reactivar-cuenta/confirmar`) y una pantalla (`reactivar-cuenta.html`) sin entrada desde ningún enlace, tal como indica `requisitos-funcionales-generales.md:104`. El código se genera para cualquier estado de cuenta.

**D-18 (bajo). Los DTO de verificación, recuperación y reactivación no normalizan el email** (sin `trim` ni minúsculas, a diferencia del registro y del login con nombre de usuario). El efecto depende de la collation de la columna `email` (ver C-01).

**D-19 (bajo). La recuperación de contraseña activa cuentas `PENDIENTE`** (rama "cualquier otro estado": `cambiar(..., ACTIVO)`), y para un `ACTIVO` cierra la sesión y restaura comercios aunque no haya nada que restaurar.

**D-20 (bajo). `fecha_ultimo_acceso`.** El diccionario la declara nullable; la migración `V52` la dejó `NOT NULL DEFAULT current_timestamp()` y `Usuario` la completa en `@PrePersist`.

---

## C. Dudas de negocio

C-01. Los DTO de recuperación, verificación y reactivación comparan el email tal cual llega. ¿Se espera que `Usuario.email` sea insensible a mayúsculas por la collation de la base? El código no lo garantiza y no se verificó la collation real.

C-02. La pantalla de éxito del registro de Dueño promete un email cuando el comercio quede aprobado. ¿Existe ese email de aprobación en el tramo del Administrador? No se auditó aquí; en el código leído hay aviso in-app al Dueño pero no se leyó ningún envío de email de aprobación.

C-03. ¿El 409 de `PENDIENTE` y `BLOQUEADO` antes de la contraseña (D-03) es intencional? El requisito solo protege a `SUSPENDIDO` e `INACTIVO`.

C-04. ¿Hay que cerrar la fila de `sesion` cuando vence el JWT (24 h), o `AUTOMATICO` quedó como valor reservado? El código no lo usa y no hay tiempo de sesión inactiva configurado (D-02).

C-05. ¿El registro de Dueño debe aceptar foto personal? Hoy el único campo de foto del registro es la del comercio (D-06).

C-06. Los textos de `ValidadorHorarios` y `ComercioValidaciones.validarModalidadesEntrega` (errores 400 del registro de Dueño) no se transcribieron en este informe porque esas clases no se leyeron. Se pueden agregar si el diagrama P1.02 necesita esos mensajes.

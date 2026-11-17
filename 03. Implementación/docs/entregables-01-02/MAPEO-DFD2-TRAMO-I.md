# MAPEO DFD NIVEL 2 — TRAMO I (P8 Soporte + cierres pendientes)

Relevamiento de solo lectura del código (2026-11-16). El código es la fuente de verdad; donde contradice a la documentación se anota el desvío (D-60 en adelante) o la cuestión abierta de negocio (C-49 en adelante). No se modificó ningún archivo salvo este informe.

**Alcance y límites de este relevamiento (honestidad sobre lo verificado):**
- P8 y los ítems 1 a 4 de la Parte 2 se leyeron completos en el código (controladores, servicios, repositorios, DTO, migración, frontend).
- Ítem 5 (scheduler): conclusión por configuración (no hay ningún bean ni propiedad de pool). **No se observó un volcado de hilos con la aplicación corriendo.**
- Ítem 6 (reglas de `CONCURRENCIA-Y-TRANSACCIONES.md`): relevamiento **por muestreo**, no exhaustivo (ver sección). No se auditó `PedidoService`, `ProductoService` ni el resto de los módulos contra el documento completo.
- Ítem 7: solo inventario de nombres de archivo y de test; no se ejecutó ninguna suite.
- Los mensajes de validación del DTO se copiaron del código; el mensaje de `400` por `tipo` con valor de enum inexistente sale del handler genérico de `HttpMessageNotReadableException` (no se probó contra la aplicación).

Todas las rutas de archivo son relativas a `03. Implementación/`. `B` = `backend/src/main/java/com/bajonea/backend`, `F` = `frontend`.

---

# PARTE 1 — DIAGRAMAS DE P8 SOPORTE

## Propuesta de estructura de diagramas (justificación)

Los 5 diagramas de la lista calzan con el código **salvo P8.05**, que no tiene sustento: no existe ningún vínculo entre un ticket y una suspensión (ver P8.05). Propongo **fusionar P8.05 en P8.04** (la bandeja solo muestra "Cuenta suspendida" y un enlace "Ver cuenta"; el levantamiento ocurre en otro proceso, S1/S3). Además, P8.01 y P8.02 comparten un único método (`SoporteService.crear`), por lo que conviene dibujar el núcleo una vez y mostrar las dos entradas.

## Datos comunes de P8

**Estados del ticket** (`B/enums/EstadoTicketSoporte.java`; columna `ticket_soporte.estado`): `ESPERA_SOPORTE` (valor inicial; le toca a Soporte), `ESPERA_PERSONA` (le toca a la persona), `CERRADO`.
**Tipos de ticket** (`TipoTicketSoporte`): `APELACION_CUENTA`, `APELACION_COMERCIO`, `NO_PUEDO_ENTRAR`, `COMERCIO_RECHAZADO_DOCUMENTOS_COBROS`, `OTRA`.
**Autor del mensaje** (`AutorMensajeSoporte`): `PERSONA`, `SOPORTE`. El mensaje no tiene "estado" propio; solo `email_enviado` (booleano) en `ticket_soporte_mensaje`.

**Transiciones del ticket** (`B/services/ConversacionSoporte.agregarMensaje`, `SoporteAdminService.cerrar`):

| De | A | Quién | Condición |
|---|---|---|---|
| (alta) | `ESPERA_SOPORTE` | Persona (con o sin sesión) | `cantidad_mensajes = 1`, primer mensaje `PERSONA` |
| `ESPERA_SOPORTE` | `ESPERA_PERSONA` | Administrador (`responder`) | mensaje `SOPORTE`, total < 20 |
| `ESPERA_PERSONA` | `ESPERA_SOPORTE` | Persona (`responder`/`mensajes`) | mensaje `PERSONA`, total < 20 |
| `ESPERA_SOPORTE` o `ESPERA_PERSONA` | `CERRADO` | Sistema, automático | al insertar el mensaje N.º 20 (`MAX_MENSAJES = 20`), `cerrado_en = ahora` |
| `ESPERA_SOPORTE` o `ESPERA_PERSONA` | `CERRADO` | Administrador (`PUT /{id}/cerrar`) | solo si no está `CERRADO` |
| `CERRADO` | — | nadie | no hay reapertura; escribir en una cerrada → `409` |

La persona solo cierra por el tope; **solo Soporte puede cerrar a mano**. No hay reapertura en el código (no hay endpoint ni estado de reapertura).

**Endpoints públicos (sin JWT)** — cuatro rutas exactas en `RUTAS_PUBLICAS` de `B/config/security/SecurityConfig.java`: `POST /api/v1/soporte/publico/consultas`, `/consultas/ver`, `/consultas/responder`, `/codigos/reenviar`.

**Cómo se protegen los públicos:** (1) límites persistidos en base `soporte_limite` (`B/services/SoporteLimiteService.java`, filas con `SELECT … FOR UPDATE`); (2) validación de DTO; (3) mensaje uniforme `404` para email/código/combinación incorrectos. **NO hay** honeypot, captcha, ni limitador en memoria: `RateLimitPublicoFilter` (`B/config/security/RateLimitPublicoFilter.java`) **no incluye ninguna ruta de Soporte** (`GRUPO_POR_RUTA` solo trae fotos de registro, invitaciones y disponibilidad; verificado por lectura completa del mapa). Búsqueda de `honeypot|captcha|recaptcha|turnstile` en `backend/src/main`, `frontend/js` y `frontend/*.html`: sin resultados.

**Jobs asociados a P8:** ninguno. Los 11 métodos `@Scheduled` del backend son: `CierreTurnoJob` (1), `InactivacionCuentaJob` (1), `InvitacionVencimientoJob` (1), `PedidoSchedulerService` (7), `ReaperturaComerciosJob` (1). **Ninguno limpia `soporte_limite` ni cierra tickets por antigüedad.** Ver C-49.

**Límites de `soporte_limite`** (`B/config/SoporteProperties.java`, prefijo `soporte`, valores por defecto del código; `application.properties` no los define):

| Propiedad | Valor | Uso |
|---|---|---|
| `consultasPorDiaEmail` | 3 | consultas creadas por email en `ventanaConsultasHoras` |
| `consultasAbiertasEmail` | 3 | tickets no `CERRADO` por email |
| `consultasPorDiaIp` | 10 | consultas por IP en la ventana |
| `intentosFallidosPorHoraEmail` | 30 | accesos fallidos por email |
| `intentosFallidosPorHoraIp` | 10 | accesos fallidos por IP |
| `reenviosPorHoraEmail` / `Ip` | 3 / 3 | pedidos de reenvío de códigos |
| `ventanaConsultasHoras` | 24 | ventana **móvil** de las consultas (ver D-61) |
| `ventanaIntentosMinutos` | 60 | ventana de intentos y reenvíos |
| `codigoMaxIntentosColision` | 10 | reintentos al generar el código |

Claves de `soporte_limite.clave` (`utf8mb4_bin`, PK): `CREAR_EMAIL|<email>`, `CREAR_IP|<ip>`, `INTENTO_EMAIL|<email>`, `INTENTO_IP|<ip>`, `REENVIO_EMAIL|<email>`, `REENVIO_IP|<ip>`. Las `CREAR_*` **solo sirven de cerrojo** (cantidad siempre 0): el conteo de consultas sale de `ticket_soporte`. Las `INTENTO_*` y `REENVIO_*` sí llevan contador y ventana (`ventana_inicio`). Siempre se toma la fila del email antes que la de la IP.

**Tablas** (migración `B/../resources/db/migration/V49__soporte.sql`): `ticket_soporte` (`codigo` varchar(8) `ascii_bin` único, `email` varchar(254), `usuario_id` nullable FK, `tipo`, `estado`, `ip` varchar(45), `cantidad_mensajes` con `CHECK` 0–20, `creado_en`, `actualizado_en`, `cerrado_en`, `CHECK` de coherencia estado/cierre), `ticket_soporte_mensaje` (`ticket_id`, `autor`, `texto` varchar(1000), `creado_en`, `email_enviado`), `soporte_limite` (`clave`, `cantidad`, `ventana_inicio`). La migración también hace `DROP TABLE IF EXISTS soporte` (la tabla vieja vacía).

**Código de consulta** (`B/services/CodigoConsultaGenerador.java`): 8 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31 símbolos, sin 0/O/1/I/L), `SecureRandom`. `normalizar(...)` quita espacios y guiones y pasa a mayúsculas (se aplica solo al código **entrante**; el generado ya es canónico).

**Respuesta de error uniforme** (`B/exceptions/GlobalExceptionHandler.java`): validación de DTO → `400` con `mensaje = "campo: mensaje; campo2: mensaje2"` y `data` = mapa campo→mensaje; `LimiteSoporteException` → `429`; `ConflictoDeNegocioException` → `409`; `RecursoNoEncontradoException` → `404`; `ServicioNoDisponibleException` → `503`; cuerpo ilegible → `400` "El cuerpo de la solicitud contiene datos con formato inválido".

**Errores de negocio como resultado:** `B/services/ResultadoSoporte.java`: los errores (límites, turno, inexistente) se devuelven dentro de la transacción y se lanzan con `obtener()` **después del commit**, para que el conteo de un fallo se confirme y no se revierta con filas de contador nuevas.

**Emails** (`B/services/EmailService.java:241-269`, `B/services/AvisoSoporteService.java`): salen por `EjecucionPostCommit` (después del commit, sin transacción), **un solo intento, sin reintento**; no se registran destinatario ni asunto en el log. Tres plantillas (texto plano, firmadas "Equipo de Bajoneá"):

| Método | Asunto (literal) | Cuerpo (literal, con saltos) |
|---|---|---|
| `enviarSoporteConsultaRecibida(dest, codigo)` | `Recibimos tu consulta — Bajoneá` | "Recibimos tu consulta y vamos a responderte lo antes posible." / "El código de tu consulta es: {codigo}" / "Ver mi consulta: {enlace}" / "Guardá el código: con tu email y ese código podés ver la respuesta y seguir la conversación aunque no puedas iniciar sesión." / "Equipo de Bajoneá" |
| `enviarSoporteRespuesta(dest, codigo)` | `Soporte respondió tu consulta — Bajoneá` | "Soporte respondió tu consulta {codigo}." / "Ver mi consulta: {enlace}" / "Equipo de Bajoneá" |
| `enviarSoporteCodigos(dest, codigos)` | `Tus códigos de consulta — Bajoneá` | "Estos son los códigos de tus consultas abiertas en Bajoneá:" / una línea `{codigo}: {enlace}` por código / "Con tu email y el código podés ver la respuesta y seguir la conversación." / "Si no pediste este email, podés ignorarlo." / "Equipo de Bajoneá" |

`{enlace}` = `B/util/SoporteEnlaces.enlaceConsulta`: `{frontend-base-url}/soporte-consulta.html#codigo=<código>&email=<email>` (datos en el **fragmento `#`**, regla 18 de `CLAUDE.md`). Con `email.envio-habilitado=false` no se envía (el resultado es `DESHABILITADO`); existe un atajo de prueba `PUT /api/v1/test/email-soporte/fallas?cantidad=` (`B/controllers/TestController.java:201`, perfil `test`).

**Seguridad con la cuenta suspendida** (`B/config/security/JwtAuthenticationFilter.java:49-87`): `PREFIJO_SOPORTE = "/api/v1/soporte/"`. Una cuenta `SUSPENDIDO` con sesión activa, o con sesión cerrada **con `tipo_cierre = SUSPENSION`**, puede usar rutas que empiecen con ese prefijo; en cualquier otra ruta recibe `401` con `data.codigo = CUENTA_SUSPENDIDA`. Una sesión cerrada por logout u otro motivo sigue dando `401` genérico incluso en Soporte. Matcher: `auth.requestMatchers("/api/v1/soporte/**").authenticated()` (cualquier rol).

---

## P8.01 — Consulta sin sesión (Visitante) y código de acceso

**Funciones y archivos**
- Controlador: `B/controllers/SoporteController.java` → `crearSinSesion` (línea 42).
- Servicio: `B/services/SoporteService.java` → `crearSinSesion` (101) → `crear(...)` (208); `B/services/SoporteLimiteService.bloquearCreacion` (38); `B/services/AvisoSoporteService.avisarConsultaRecibida` (39); `B/services/CodigoConsultaGenerador.generar`.
- Repositorios: `B/repositories/TicketSoporteRepository` (`countByEmailAndCreadoEnAfter`, `countByEmailAndEstadoNot`, `countByIpAndCreadoEnAfter`), `B/repositories/TicketSoporteInsercionRepository.insertar` (JDBC), `B/repositories/MensajeSoporteRepository.save` (JPA), `B/repositories/SoporteLimiteRepository.bloquear`.

**Endpoint:** `POST /api/v1/soporte/publico/consultas`. Público (sin JWT). No usa `X-Comercio-Id`. IP = `HttpServletRequest.getRemoteAddr()` (`ip()` en `SoporteService:279` recorta a 45 caracteres; `null`/vacío → `"desconocida"`).

**Entradas** (`B/dto/request/CrearConsultaSoporteRequestDTO.java`), validaciones en orden de declaración (los errores se agrupan en un solo `400`):
1. `email`: `@NotBlank` "El email es obligatorio"; `@ValidarFormatoEmail` "Ingresá un email válido"; `@Size(max=254)` "El email no puede superar los 254 caracteres". El setter lo pasa a `trim().toLowerCase`.
2. `tipo`: `@NotNull` "Elegí el motivo de tu consulta" (enum `TipoTicketSoporte`).
3. `mensaje`: `@NotBlank` "Escribí tu mensaje"; `@Size(min=10, max=1000)` "El mensaje debe tener entre 10 y 1000 caracteres". El setter hace `trim()`.
Resultado de validación fallida: `400` (formato en "Respuesta de error uniforme").

**Pasos en orden exacto** (todo en `transaccion.execute` de `SoporteService.crear`):
1. (solo con sesión) `usuarioRepository.leerIdConBloqueoCompartido(usuarioId)`; si no existe → error "Usuario no encontrado" (404). Para el Visitante no aplica.
2. `ahora = LocalDateTime.now(clock)` truncado a segundos.
3. `limites.bloquearCreacion(email, ip, ahora)`: `INSERT … ON DUPLICATE KEY UPDATE clave = clave` + `SELECT … FOR UPDATE` de `CREAR_EMAIL|email` y después `CREAR_IP|ip` (cerrojos; no cuentan).
4. `desde = ahora − 24 h`. Si `COUNT(ticket_soporte WHERE email AND creado_en > desde) >= 3` → resultado de error `LimiteSoporteException("Ya enviaste 3 consultas hoy. Probá de nuevo mañana o esperá la respuesta de Soporte.")` (429).
5. Si `COUNT(ticket_soporte WHERE email AND estado <> 'CERRADO') >= 3` → `LimiteSoporteException("Ya tenés 3 consultas abiertas. Esperá a que Soporte las responda para enviar otra.")` (429).
6. Si `COUNT(ticket_soporte WHERE ip AND creado_en > desde) >= 10` → `LimiteSoporteException("Se enviaron demasiadas consultas desde tu conexión. Probá de nuevo más tarde.")` (429).
7. Generación de código y alta con reintento por colisión: hasta `codigoMaxIntentosColision` (10) veces, `generar()` + `INSERT INTO ticket_soporte (codigo, email, usuario_id, tipo, estado='ESPERA_SOPORTE', ip, cantidad_mensajes=1, creado_en, actualizado_en)`; ante `DuplicateKeyException` reintenta con otro código **dentro de la misma transacción** (JDBC, para no marcar rollback-only). Si agota → `ServicioNoDisponibleException("No pudimos crear tu consulta. Probá de nuevo en unos minutos.")` (503; no queda nada guardado, se lanza como excepción dentro de la transacción).
8. `mensajeRepository.save(MensajeSoporte{ticketId, autor=PERSONA, texto=mensaje, creadoEn=ahora, emailEnviado=true})`. (`email_enviado=true` se escribe siempre para mensajes de la persona; no existe email para ellos.)
9. `avisos.avisarConsultaRecibida(email, codigo)` → registra el envío para después del commit.
Después del commit: se envía el email "Recibimos tu consulta — Bajoneá" a `email` (un intento).

**Salidas**
- `201`, mensaje "Recibimos tu consulta", `data` = `ConsultaSoporteCreadaResponseDTO{id, codigo, estado=ESPERA_SOPORTE}`.
- Errores: `400` (validación), `429` (los tres límites, con el mensaje literal de arriba), `503` (agotó el código), `500` genérico si algo inesperado.
- Si el email de Resend falla, **no hay efecto visible**: la respuesta ya fue `201` y no se marca el fallo (el mensaje de la persona lleva `email_enviado=true` igual).

**Efectos secundarios:** una fila en `ticket_soporte`, una en `ticket_soporte_mensaje`, filas `CREAR_EMAIL|…` y `CREAR_IP|…` en `soporte_limite` (se crean aunque el límite se supere: el cerrojo se toma antes de contar); un email al solicitante. **No se emite ningún aviso in-app ni push al Administrador** (ver D-60 y C-50). El Administrador se entera por el contador `consultasSoporteEsperando` de las métricas.

**Frontend**
- Pantalla `F/soporte.html` + `F/js/soporte.js` (`initSoporte`); helpers en `F/js/soporte-comun.js`.
- Título "Contactar a Soporte"; texto "Te respondemos por email."; enlace a `faq.html` ("Preguntas frecuentes"); campos: "Tu email" (placeholder `nombre@ejemplo.com`), "Tipo de consulta" (select, primera opción "Elegí una opción"), "Contanos qué pasó" (textarea, `maxlength=1000`, contador `{n} / 1000 · mínimo 10`), texto de privacidad con enlace "Política de privacidad" (`privacidad.html`), botón "Enviar consulta" ("Enviando…" mientras carga).
- `?tipo=` de la URL preselecciona el motivo si es válido (`tipoValido`). Los enlaces del frontend con `?tipo=` son: `NO_PUEDO_ENTRAR` (login con cuenta bloqueada: `F/js/auth.js:50`; cuenta inactiva: `F/js/cuenta-inactiva.js:75`), `APELACION_COMERCIO` (`F/js/auth.js:168`, `F/js/comercio-suspendido.js:59`), `APELACION_CUENTA` (`F/js/cuenta-suspendida.js:77,118`), `OTRA` (`F/js/reclamos-comun.js:101`); `F/js/ayuda.js:53` y `F/faq.html` van sin `tipo`.
- Opciones del select (`TIPOS_CONSULTA`, `F/js/soporte-comun.js`): "Quiero apelar la suspensión de mi cuenta", "Quiero apelar la suspensión de mi comercio", "No puedo entrar", "Mi comercio fue rechazado o tengo problemas con documentos o cobros", "Otra consulta".
- Errores: `400` con mapa por campo → mensaje bajo el campo (`error-soporte-email|tipo|mensaje`) y foco al primero; el resto (429, 409, 503…) en un aviso `role="alert"` (`aviso-soporte`) con el texto del servidor (`mensajeDeApi`); sin conexión: "No pudimos conectar. Revisá tu conexión e intentá de nuevo."; por defecto "No pudimos enviar tu consulta. Probá de nuevo.". Opciones del `apiFetch`: `handle5xxGlobally:false`, `handleRedGlobally:false`, `noIdempotente: { texto: 'tu email' }` (control de reintento seguro).
- Éxito (`pintarExito`): título "Recibimos tu consulta"; "Guardá este código. Lo necesitás si querés ver la consulta sin iniciar sesión."; el código en grande (con `aria-label` letra por letra); "También te lo mandamos a {email}."; botones "Copiar código" (toast "Código copiado"; si falla el portapapeles, toast de error "No pudimos copiarlo solo. Quedó seleccionado para que lo copies.") y "Ver mi consulta" → `soporte-consulta.html#codigo=…&email=…` (sin sesión).

**Desvíos y cuestiones:** D-60, D-61, D-62, C-49, C-50, C-51.

---

## P8.02 — Consulta con sesión (Cliente, Dueño, Empleado)

**Funciones y archivos**
- Controlador: `SoporteController.crearConSesion` (70), `misConsultas` (79), `contador` (86), `miConsulta` (91), `responder` (98).
- Servicio: `SoporteService.crearConSesion` (171) → `crear(...)` (mismo núcleo que P8.01), `misConsultas` (175), `miConsulta` (183), `responderConSesion` (189), `contador` (200), `emailDe` (269).
- Repositorios: `TicketSoporteRepository` (`findDelUsuario`, `findDelUsuarioPorId`, `findIdDelUsuarioPorId`, `contarDelUsuarioPorEstado`), `UsuarioRepository.findById` y `leerIdConBloqueoCompartido`.

**Endpoints:** todos exigen JWT de **cualquier rol** (`authenticated()`; ver "Seguridad con la cuenta suspendida" arriba). **Ninguno exige ni envía `X-Comercio-Id`**: `RUTAS_DEL_DUENO` de `F/js/api.js:27` no incluye `/soporte` (verificado), así que un Dueño o un Empleado (que es `rol = CLIENTE`) consultan con su propio usuario, sin contexto de comercio.

| Método y ruta | Función |
|---|---|
| `POST /api/v1/soporte/consultas` | crear (`201`) |
| `GET /api/v1/soporte/mis-consultas` | listado propio |
| `GET /api/v1/soporte/mis-consultas/contador` | cuántas esperan respuesta de la persona |
| `GET /api/v1/soporte/mis-consultas/{id}` | detalle |
| `POST /api/v1/soporte/mis-consultas/{id}/mensajes` | responder (`200`, mensaje "Enviamos tu mensaje") |

**Entradas**
- Crear: `B/dto/request/CrearConsultaSoporteSesionRequestDTO.java` — `tipo` (`@NotNull` "Elegí el motivo de tu consulta") y `mensaje` (`@NotBlank` "Escribí tu mensaje", `@Size(10..1000)` "El mensaje debe tener entre 10 y 1000 caracteres"). **No lleva email**: sale de `usuario.email` en minúsculas (`emailDe`); si el usuario no existe → `404` "Usuario no encontrado".
- Responder: `MensajeSoporteRequestDTO.texto` (`@NotBlank` "Escribí tu mensaje", `@Size(max=1000)` "El mensaje no puede superar los 1000 caracteres"; sin mínimo).

**Pasos (crear):** idénticos a P8.01 pasos 1–9, con `usuarioId` informado: se toma `usuario` compartido (`leerIdConBloqueoCompartido`) antes de los cerrojos; los límites **se aplican igual** por email (el del usuario) y por IP; `ticket_soporte.usuario_id` queda con el usuario. Email "Recibimos tu consulta — Bajoneá" al email de la cuenta, con el mismo enlace por fragmento (que sirve **sin** sesión).

**Pasos (leer):** `misConsultas`: `SELECT t FROM TicketSoporte t WHERE t.usuarioId = :usuarioId OR t.email = :email ORDER BY t.actualizadoEn DESC, t.id DESC`; `miConsulta` y `responderConSesion` buscan por `id AND (usuarioId = :usuarioId OR email = :email)`; ajeno o inexistente → `404` "Consulta no encontrada" (`MENSAJE_CONSULTA_NO_ENCONTRADA`). `contador` = `COUNT` de las propias en `ESPERA_PERSONA`.

**Pasos (responder con sesión):** en una transacción: busca solo el id (`findIdDelUsuarioPorId`) → `findByIdConBloqueo` (`FOR UPDATE`, primera lectura de la consulta) → `ConversacionSoporte.agregarMensaje(ticket, PERSONA, texto, ahora)`: (a) `CERRADO` → `409` "Esta consulta está cerrada. Si necesitás algo más, enviá una consulta nueva."; (b) estado distinto de `ESPERA_PERSONA` → `409` "Soporte todavía no respondió. Vas a poder escribir cuando lo haga."; (c) inserta el mensaje (`autor=PERSONA`, `email_enviado=true`), suma 1 a `cantidad_mensajes`, `actualizado_en=ahora`; si el total llega a 20 → `CERRADO` y `cerrado_en`; si no → `ESPERA_SOPORTE`. **El mensaje N.º 20 lo escribe quien le tocaba, y cierra.** No se envía ningún email ni aviso al Administrador al escribir la persona.

**Salidas:** `ConsultaSoporteResponseDTO` (id, código, tipo, estado, `cantidadMensajes`, `maxMensajes`=20, fechas, `puedeResponder` = estado `ESPERA_PERSONA`, `aviso`, lista de mensajes con `emailEnviado = null` para la persona). `aviso` (`ConversacionSoporte.avisoParaLaPersona`): `CERRADO` con 20 mensajes → "Llegamos al máximo de mensajes de esta consulta. Si necesitás algo más, enviá una consulta nueva."; `CERRADO` por cierre → "Esta consulta está cerrada. Si necesitás algo más, enviá una consulta nueva."; `ESPERA_SOPORTE` → "Soporte todavía no respondió. Vas a poder escribir cuando lo haga."; `ESPERA_PERSONA` → `null`.

**Efectos secundarios y vínculo con suspensión:** no hay aviso in-app ni push a nadie. El vínculo con la suspensión es **solo de acceso**: la cuenta `SUSPENDIDO` puede llamar todas estas rutas (filtro JWT), y el frontend ofrece "Contactar a Soporte" (`?tipo=APELACION_CUENTA`) y "Mis consultas" en la pantalla de sesión suspendida (`F/js/cuenta-suspendida.js:77,118,119`). No hay lógica que cambie la suspensión por un ticket.

**Frontend**
- Entrada "Mis consultas a Soporte": fila en el Perfil del Cliente (`F/js/cliente.js:136`), del Dueño/Empleado (`F/js/comercio.js:2582`), pantalla Ayuda (`F/js/ayuda.js:59`) y menú de escritorio del Cliente ("Mis consultas", `F/js/cliente-escritorio.js:124`). `enlazarMisConsultas` (`F/js/soporte-mis-consultas.js`) habilita la fila, navega a `mis-consultas.html` y consulta `GET /soporte/mis-consultas/contador`: si `esperandoTuRespuesta > 0` muestra el número y cambia el `aria-label` ("Mis consultas a Soporte, N espera/esperan tu respuesta").
- `F/mis-consultas.html`/`soporte-mis-consultas.js` (`initMisConsultas`): sin token → redirige a `login.html`; título "Mis consultas a Soporte"; lista ordenada `ESPERA_PERSONA`, `ESPERA_SOPORTE`, `CERRADO` y por `actualizadoEn` desc; cada fila: tipo, "Enviada el dd/mm/aaaa", estado; vacío: "Todavía no hiciste ninguna consulta" / "Cuando le escribas a Soporte, vas a ver acá la conversación y las respuestas."; error: "No pudimos cargar tus consultas." con "Reintentar"; botón "Nueva consulta" → `soporte.html`.
- Crear: `soporte.html` con sesión (`conSesion = getToken() && usuario`): el campo email aparece deshabilitado con el email de la cuenta y la ayuda "Es el email de tu cuenta."; envía a `POST /soporte/consultas` solo con `{tipo, mensaje}` (`auth: true`); `noIdempotente: { texto: 'Mis consultas a Soporte', enlace: 'mis-consultas.html' }`. Éxito: mismo bloque que P8.01 pero el botón "Ver mi consulta" va a `soporte-consulta.html?id={id}`.
- Detalle: `F/soporte-consulta.html?id=N` + `F/js/soporte-consulta.js` (`iniciarConSesion`); estados mostrados (`ESTADOS_DE_LA_PERSONA`): "Te toca responder", "Esperando a Soporte", "Cerrada"; caja de respuesta "Tu respuesta" (textarea, contador, botón "Enviar respuesta" → "Enviando…"), deshabilitada con "Esperando la respuesta de Soporte." si no le toca; tras enviar: toast "Respuesta enviada"; `404` → "No encontramos esa consulta." con "Ir a mis consultas"; un `409` al responder recarga la consulta y muestra el mensaje del servidor; consulta cerrada: "Consulta cerrada. Si necesitás algo más, enviá una consulta nueva." con "Enviar una consulta nueva" (`soporte.html`) o, si fue por tope, el `aviso` del servidor.

**Desvíos y cuestiones:** D-63, C-52.

---

## P8.03 — Acceso por código, mensajes de seguimiento y límites anti-abuso

**Funciones y archivos**
- Controlador: `SoporteController.verSinSesion` (49), `responderSinSesion` (56), `reenviarCodigos` (63).
- Servicio: `SoporteService.verSinSesion` (105), `responderSinSesion` (126), `reenviarCodigos` (151), `escribirComoPersona` (252), `detalle` (262); `SoporteLimiteService.bloquearIntentos` (44), `registrarFallo` (56), `intentarReenvio` (67); `ConversacionSoporte`; `AvisoSoporteService.enviarCodigos` (49).
- Repositorios: `TicketSoporteRepository.findByEmailAndCodigo`, `findIdByEmailAndCodigo`, `findByIdConBloqueo`, `findByEmailAndEstadoNotOrderByIdAsc`; `SoporteLimiteRepository`.

**Endpoints (públicos, sin JWT, sin `X-Comercio-Id`):** `POST /api/v1/soporte/publico/consultas/ver`, `POST /…/consultas/responder`, `POST /…/codigos/reenviar`.

**Entradas**
- `ver` (`AccesoConsultaSoporteRequestDTO`): `email` (mismas tres validaciones, con trim/minúsculas) y `codigo` (`@NotBlank` "El código es obligatorio"; `@Size(max=30)` "El código es demasiado largo").
- `responder` (`ResponderConsultaSoportePublicaRequestDTO`): `email`, `codigo` como arriba y `texto` (`@NotBlank` "Escribí tu mensaje"; `@Size(max=1000)` "El mensaje no puede superar los 1000 caracteres").
- `reenviar` (`ReenviarCodigosSoporteRequestDTO`): solo `email`.

**Pasos — acceso/seguimiento (`verSinSesion`/`responderSinSesion`, una transacción):**
1. `codigo = normalizar(codigo)` (sin espacios/guiones, mayúsculas); `ip` normalizada.
2. `limites.bloquearIntentos(email, ip, ahora)`: cerrojos `INTENTO_EMAIL|email` y luego `INTENTO_IP|ip`; `bloqueado` si el contador del email llegó a 30 **o** el de la IP a 10 dentro de la ventana de 60 min desde `ventana_inicio`.
3. Si `bloqueado` → error `LimiteSoporteException("Hiciste demasiados intentos. Probá de nuevo en una hora.")` (429), **sin consultar** (aunque el código sea correcto).
4. Si el código no tiene exactamente 8 caracteres se trata como no encontrado sin consultar; si no, `findByEmailAndCodigo` (ver) o `findIdByEmailAndCodigo` (responder).
5. No encontrado → `registrarFallo` (suma 1 a `INTENTO_EMAIL` y a `INTENTO_IP`; si la ventana venció, reinicia en 1 con `ventana_inicio=ahora`) y `RecursoNoEncontradoException("No encontramos una consulta con esos datos. Revisá el email y el código.")` (404). Es el **mismo `404`** para email inexistente, código incorrecto o combinación ajena.
6. Encontrado: `ver` devuelve la conversación (**un acceso correcto no suma ni resetea intentos**); `responder` → `escribirComoPersona` (mismo flujo que P8.02: `FOR UPDATE`, turno, tope de 20, `409` con los mismos mensajes). No se envía email al escribir la persona.

**Pasos — reenvío de códigos (`reenviarCodigos`):**
1. `limites.intentarReenvio(email, ip, ahora)`: cerrojos `REENVIO_EMAIL|` y `REENVIO_IP|`; si alguno ya llegó a 3 en la ventana → `LimiteSoporteException("Hiciste demasiados intentos. Probá de nuevo en una hora.")` (429). Si no, suma 1 a ambos **siempre** (existan o no consultas).
2. Lee `ticket_soporte WHERE email = ? AND estado <> 'CERRADO' ORDER BY id`; si hay códigos → `avisos.enviarCodigos(email, codigos)` (después del commit; un intento; asunto "Tus códigos de consulta — Bajoneá").
3. La respuesta es **siempre la misma**: `200`, mensaje "Si hay consultas con ese email, te mandamos los códigos. Revisá tu bandeja de entrada.", `data = null`.

**Salidas:** `ver` → `200` "Consulta obtenida correctamente" + `ConsultaSoporteResponseDTO` (mensajes con `emailEnviado = null`); `responder` → `200` "Enviamos tu mensaje"; errores `400`, `404`, `409`, `429`. Una consulta `CERRADO` se puede **ver** pero no responder.

**Efectos secundarios:** filas `INTENTO_*`/`REENVIO_*` en `soporte_limite` (se crean aunque el email no exista: crecimiento no acotado, ver C-49); email de códigos si hay consultas abiertas. Efecto lateral conocido (documentado en `docs/CONCURRENCIA-Y-TRANSACCIONES.md`): el envío del email en el mismo pedido hace que la respuesta con consultas tarde más (canal lateral de tiempo).

**Frontend** (`F/soporte-consulta.html` + `F/js/soporte-consulta.js`, `iniciarPublica`)
- Si la URL trae fragmento (`#codigo=…&email=…`), `leerFragmento` lo lee **y limpia la URL con `history.replaceState`** antes de consultar; con ambos datos consulta directo (skeleton mientras carga); si falla, muestra el formulario de acceso con el email precargado y el mensaje del servidor.
- Formulario de acceso: título "Ver mi consulta", "Ingresá el email y el código que te dimos al enviar la consulta.", campos "Tu email" y "Código" (placeholder "Por ejemplo, ABCD-2345"), botón "Ver mi consulta" ("Buscando…"), botón de texto "¿Perdiste el código?".
- Reenvío: título "¿Perdiste el código?", "Escribí tu email y te mandamos los códigos de tus consultas.", botón "Reenviar código" ("Enviando…"), "Volver a ver mi consulta"; respuesta del servidor en un banner informativo; error por defecto "No pudimos reenviar el código. Probá de nuevo.".
- Conversación: igual que P8.02, pero enviando a `POST /soporte/publico/consultas/responder` con `{email, codigo, texto}`; un `409` recarga la conversación con `…/ver`. Un `429` aparece como mensaje de error en el formulario de acceso.

**Desvíos y cuestiones:** D-62, C-49, C-53.

---

## P8.04 — Bandeja del Administrador, respuesta y cierre de consulta (incluye lo que sería P8.05)

**Funciones y archivos**
- Controlador: `B/controllers/SoporteAdministradorController.java` → `listar`, `detalle`, `responder`, `cerrar`, `reenviarEmail`.
- Servicio: `B/services/SoporteAdminService.java` → `listar` (68-100), `detalle` (103), `responder` (110), `cerrar` (126), `reenviarEmail` (143), `contarQueEsperan` (166), `armarDetalle` (170); `B/services/ConversacionSoporte`; `B/services/AvisoSoporteService.avisarRespuesta`/`reenviarRespuesta`.
- Repositorio: `TicketSoporteRepository` (`bandejaMasViejasPrimero`, `bandejaMasNuevasPrimero`, `findCuentasPorEmail` nativa, `findIdsConEmailSinEnviar` nativa, `findByIdConBloqueo`, `countByEstado`), `MensajeSoporteRepository` (`findFirstByTicketIdAndAutorOrderByIdDesc`, `marcarEmailEnviado`). Métrica: `B/services/AdministradorService.java:288` (`ticketSoporteRepository.countByEstado(ESPERA_SOPORTE)` → `consultasSoporteEsperando`).

**Endpoints** (rol `ADMINISTRADOR` por el matcher `/api/v1/administrador/**`; no usan `X-Comercio-Id`; no públicos):

| Método y ruta | Descripción |
|---|---|
| `GET /api/v1/administrador/soporte?estado=&email=&limite=&pagina=` | bandeja |
| `GET /api/v1/administrador/soporte/{id}` | detalle con cuenta asociada |
| `POST /api/v1/administrador/soporte/{id}/mensajes` | responder (`200` "Respuesta enviada") |
| `PUT /api/v1/administrador/soporte/{id}/cerrar` | cerrar (`200` "Consulta cerrada") |
| `POST /api/v1/administrador/soporte/{id}/reenviar-email` | reintentar el email (`200`, "Email reenviado" o "No se pudo enviar el email. Probá de nuevo.") |

**Entradas**
- `estado` = `FiltroBandeja` (`ESPERAN`, `RESPONDIDAS`, `CERRADAS`; por defecto `ESPERAN`; un valor inválido → error de conversión de parámetro); `email` opcional (trim/minúsculas, comparación exacta); `limite` por defecto 50, máximo 200 (mínimo 1); `pagina` por defecto 0.
- Responder: `MensajeSoporteRequestDTO.texto` (`@NotBlank` "Escribí tu mensaje"; `@Size(max=1000)` "El mensaje no puede superar los 1000 caracteres").

**Pasos**
- **Listar:** transacción de solo lectura; `ESPERAN` = `estado = ESPERA_SOPORTE` por `actualizadoEn` asc (más viejas primero), `RESPONDIDAS` = `ESPERA_PERSONA` asc, `CERRADAS` = `CERRADO` desc. Con los emails de la página resuelve en **una consulta** las cuentas por email (`usuario`/`dueno`/`persona_fisica`/`empleado`) para marcar `cuentaSuspendida` (estado `SUSPENDIDO`) y en otra los ids con email sin enviar (`emailPendienteDeReenvio`). **El front pide las tres listas en paralelo con `limite=200`.**
- **Detalle:** lectura sin bloqueo; `armarDetalle` incluye `ip` del ticket, `puedeResponder` (estado `ESPERA_SOPORTE`), `emailPendienteDeReenvio`, `cuentaAsociada` (usuarioId, nombre y apellido, estado, rol, `esEmpleado`; `null` si el email no corresponde a ninguna cuenta; para un Dueño el nombre es el del representante) y los mensajes con `emailEnviado` visible. **No incluye datos de comercio ni de suspensión (motivo, fecha).**
- **Responder:** una transacción: `findByIdConBloqueo` (`FOR UPDATE`, primera lectura del ticket); `agregarMensaje(ticket, SOPORTE, texto, ahora)` — `CERRADO` → `409` "Esta consulta está cerrada. Si necesitás algo más, enviá una consulta nueva."; fuera de turno (estado distinto de `ESPERA_SOPORTE`) → `409` "Todavía no respondió la persona. Podés escribir cuando lo haga."; inserta el mensaje con `email_enviado=false`; `cantidad_mensajes+1`; pasa a `ESPERA_PERSONA`, o a `CERRADO` si es el mensaje 20. Luego `avisos.avisarRespuesta(...)` → **después del commit**: envía "Soporte respondió tu consulta — Bajoneá" (un intento) y marca `ticket_soporte_mensaje.email_enviado` con el resultado en una transacción corta aparte; si esa marca falla, solo `log.error`. Devuelve el detalle recargado.
- **Cerrar:** `FOR UPDATE`; si ya `CERRADO` → `409` "Esta consulta ya está cerrada."; si no, `estado=CERRADO`, `cerrado_en` y `actualizado_en = ahora`. **No envía email ni aviso a la persona** al cerrar; la persona lo ve en la consulta ("Esta consulta está cerrada…").
- **Reenviar email:** lectura sin bloqueo del último mensaje `SOPORTE`; si su `email_enviado` es verdadero o no hay → `409` "No hay ningún email fallido para reenviar"; si no, envía **sin transacción** (un intento) y marca por clave primaria; la respuesta trae `emailPendienteDeReenvio` actualizado (el controlador elige el mensaje "Email reenviado" / "No se pudo enviar el email. Probá de nuevo.").
- Concurrencia: dos Administradores que responden o cierran a la vez se serializan por el `FOR UPDATE`; el segundo recibe el `409` de turno o de cerrada. Dos "Reenviar email" simultáneos pueden duplicar el email (caso conocido y aceptado en la documentación de concurrencia).

**Salidas:** `ConsultaSoporteAdminResumenResponseDTO` (id, código, tipo, email, estado, cantidad, fechas, `cuentaSuspendida`, `emailPendienteDeReenvio`) y `ConsultaSoporteAdminDetalleResponseDTO` (detalle completo + `cuentaAsociada`). `404` "Consulta no encontrada" para un id inexistente.

**Efectos secundarios:** email a la persona solo al **responder** (no al cerrar); ningún aviso in-app. Métrica `consultasSoporteEsperando` en el dashboard (`MetricasAdminResponseDTO`), mostrada como insignia del ítem "Soporte" de la barra lateral y en la tarjeta del panel (`F/js/admin-shell.js:32`, `F/js/admin.js:269-275`). **No hay job** de cierre automático por inactividad.

**Frontend** (`F/admin-soporte.html` + `F/js/admin-soporte.js`)
- Acceso: si el usuario no es `ADMINISTRADOR` → `login.html`. Título "Soporte". Tres chips "Esperan N", "Respondidas N", "Cerradas N" (cuenta `200+` si llega al límite); contador "Mostrando N consulta(s)"; vacíos: "No hay consultas esperando tu respuesta.", "No hay consultas respondidas esperando a la persona.", "Todavía no cerraste ninguna consulta."; error: "No pudimos cargar las consultas." con "Reintentar".
- Fila: tipo, email (cortable antes de la arroba), "hace…", marcas "Cuenta suspendida" y "No se envió el email".
- **Escritorio (≥1024 px al cargar):** maestro-detalle (la lista no navega: `pushState` a `admin-soporte.html?id=N`, panel "Elegí una consulta / Va a aparecer acá, con toda la conversación."), navegación con flechas, Home y End, **sondeo cada 15 s** (`INTERVALO_SONDEO_MS`) que recarga las tres listas y, si no hay texto en curso, el detalle abierto. **Móvil:** la fila navega a `admin-soporte.html?id=N` (página de detalle).
- Detalle: cabecera con tipo, email, "Enviada el dd/mm/aaaa hh:mm" y estado ("Espera tu respuesta" / "Esperando a la persona" / "Cerrada"); bloque "Cuenta asociada" (nombre, "{rol} · {estado}", enlace "Ver cuenta" → `admin-duenos.html?id=N` si es `DUENO`, `admin-clientes.html?id=N` si es `CLIENTE`, ninguno para `ADMINISTRADOR`; rol mostrado "Cliente y Empleado" si `esEmpleado`); hilo (autor "Soporte"/"Persona"); si hay email fallido, banner "No se envió el email / La persona no recibió tu última respuesta por email. Podés reenviarlo." con "Reenviar email" ("Reenviando…"; toast "Email reenviado" o error "No se pudo enviar el email. Probá de nuevo."); caja "Tu respuesta" con botón "Responder" (deshabilitada: "Esperando la respuesta de la persona."); toast "Respuesta enviada"; botón "Cerrar consulta" → hoja "Cerrar consulta" con "La persona no va a poder escribir más en esta consulta. Si necesita algo más, tiene que enviar una consulta nueva.", botones "Cerrar consulta" ("Cerrando…") y "Cancelar", toast "Consulta cerrada". Consulta cerrada: "Consulta cerrada." sin caja.
- Un `409` al responder recarga el detalle y muestra el mensaje del servidor; `404` → "No encontramos esa consulta." con "Volver a Soporte".

**Desvíos y cuestiones:** D-60, D-64, C-50, C-54.

---

## P8.05 — Levantamiento de suspensión desde Soporte (**no existe en el código; fusionar con P8.04**)

**Evidencia (archivos y búsquedas revisados):**
1. `B/controllers/SoporteAdministradorController.java` completo: solo cinco endpoints (listar, detalle, responder, cerrar, reenviar email); ninguno toca suspensiones.
2. `B/services/SoporteAdminService.java` completo: no importa ni referencia `SuspensionUsuarioService`, `SuspensionComercioService`, `SuspensionDuenoService` ni `EstadoUsuarioService`.
3. Búsqueda de `TicketSoporte|ticket_soporte|SoporteService` en todo `B/` fuera de los archivos propios de Soporte: **un único resultado**, `B/services/AdministradorService.java:99,288` (solo el `COUNT` de métricas). Ningún servicio de suspensión (S1, S2, S3) consulta ni cierra tickets.
4. `V49__soporte.sql`: `ticket_soporte` no tiene columna de suspensión, comercio ni motivo; el único vínculo es el email (y `usuario_id` si escribió con sesión).
5. Frontend: `F/js/admin-soporte.js` solo ofrece el enlace "Ver cuenta" → `admin-clientes.html?id=N` o `admin-duenos.html?id=N` (rutas de S1/S3, que aceptan `?id=` para mostrar una ficha). **No hay botón "Levantar suspensión" en la pantalla de Soporte.** Una suspensión de comercio por separado (S2) no se refleja en la cuenta asociada (solo el estado de la cuenta, no el del comercio).

**Lo que sí hay:** la bandeja marca `cuentaSuspendida` (estado de la cuenta del email = `SUSPENDIDO`) y el detalle muestra el estado de la cuenta; el Administrador levanta la suspensión por los procesos propios del Cliente/Dueño (`PUT /administrador/clientes/{id}/levantar-suspension`, S1; S3 para Dueño), sin que el ticket lo dispare, lo registre ni lo cierre. Por lo tanto **no hay un diagrama propio**; en P8.04 alcanza con una nota "Navegación a la ficha de la cuenta (P1)".

**Desvíos y cuestiones:** C-54.

---

# PARTE 2 — CIERRES PENDIENTES

## 2.1 `AptitudVentaComercioService` — llamadores y avisos T40/T41

Archivo: `B/services/AptitudVentaComercioService.java`. Métodos públicos: `decidir` (pura, estática), `leerDueno`, `leerDuenoRestaurado`, `bloquearComercio`, `contarDocumentos`, `recalcular` (dos sobrecargas), `destinoAlLevantarSuspension`, `recalcularComerciosDelDueno`, `cerrarPorBloqueo`, `inactivarPorInactividad`, `restaurar`. Todos `Propagation.MANDATORY`. Usa `NotificacionService.crearParaDueno` (aviso in-app).

**Llamadores y qué evento dispara cada uno** (búsqueda de `aptitudVentaComercioService.`):

| Llamador (archivo:línea) | Método usado | Evento / `MotivoRecalculo` |
|---|---|---|
| `AdministradorService.java:327,356` | `leerDueno`, `recalcular(..., avisar=false)` | Aprobación del comercio por el Administrador (`COMERCIO_APROBADO`); no avisa T40 (ya lo hace el aviso de aprobación). Si el Dueño está bloqueado, detalle "Bloqueo de cuenta vigente al aprobar". |
| `MercadoPagoOAuthService.java:189` | `recalcularComerciosDelDueno` | `MP_VINCULADO` (callback OAuth con éxito) |
| `MercadoPagoOAuthService.java:241` | `recalcularComerciosDelDueno` | `MP_DESVINCULADO` |
| `DocumentoComercioService.java:149-178` | `leerDueno`, `bloquearComercio`, `contarDocumentos`, `recalcular` | `DOCUMENTO_SUBIDO` |
| `DocumentoComercioService.java:184-196` | idem | `DOCUMENTO_ELIMINADO` (borra un pendiente propio) |
| `RevisionDocumentoService.java:82-103` | `leerDueno`, `bloquearComercio`, `recalcular` | el motivo que corresponda: `DOCUMENTO_APROBADO`, `DOCUMENTO_RECHAZADO` o `DOCUMENTO_REVOCADO` |
| `AuthService.java:486` (`propagarBloqueoAComercio`) | `cerrarPorBloqueo` | bloqueo de cuenta del Dueño (solo comercios `APTO_VENTA` → `CERRADO_TEMPORALMENTE`; no avisa) |
| `AuthService.java:502` (`restaurarComercioSiCorresponde`) | `restaurar(duenoId, origen, motivo)` | desbloqueo/recuperación de contraseña/reactivación (`DUENO_RESTAURADO`) |
| `ReactivacionCuentaService.java:41` | `restaurar(…, INACTIVO, …)` | reactivación de cuenta inactiva (`DUENO_RESTAURADO`) |
| `InactivacionCuentaService.java:148` | `inactivarPorInactividad` | inactivación automática (S6): `APROBADO`/`APTO_VENTA`/`CERRADO_TEMPORALMENTE` → `INACTIVO`; no avisa |
| `SuspensionComercioService.java:110,159,174` | `bloquearComercio`, `leerDueno`, `destinoAlLevantarSuspension` | suspender y levantar la suspensión de un comercio (S2) |
| `SuspensionDuenoService.java:149,215-247` | `bloquearComercio`, `leerDuenoRestaurado`, `destinoAlLevantarSuspension` | suspender y levantar la cuenta del Dueño (S3) |
| `TestSupportService.java:119,136-153,404-405` | varios | atajos del perfil `test` (documento aprobado, vincular Mercado Pago simulado) |

**Regla de decisión** (`decidir`, líneas 76-108): `puedeEntrar = cuentaMP && (!docRequerida || (aprobados>=1 && pendientes==0))`; `puedeSeguir = cuentaMP && (!docRequerida || aprobados>=1)`. `APROBADO`→`APTO_VENTA` si `puedeEntrar` (o `CERRADO_TEMPORALMENTE` si el Dueño está bloqueado); `APTO_VENTA`→`APROBADO` si pierde `puedeSeguir`; `SUSPENDIDO` solo se mueve con `SUSPENSION_LEVANTADA`; `CERRADO_TEMPORALMENTE`/`INACTIVO` solo con `DUENO_RESTAURADO` y sin bloqueo (`APTO_VENTA` si `puedeSeguir`, si no `APROBADO`).

**Avisos T40 y T41 — existen los dos** (`TipoNotificacion.java:46-47`, `COMERCIO_APTO_VENTA(DUENO)` y `COMERCIO_SIN_APTITUD(DUENO)`), emitidos **únicamente** desde `AptitudVentaComercioService.avisarCambio` (líneas 289-298) a través de `avisar` → `NotificacionService.crearParaDueno(duenoId, comercioId, mensaje, tipo, COMERCIO, comercioId)` (aviso in-app con `comercio_id`; **sin email**). Se invocan dentro de `recalcular(..., avisar=true)`, es decir con la transición `APROBADO→APTO_VENTA`, o cualquier transición con destino `APROBADO`:
- **T40 `COMERCIO_APTO_VENTA`**: cuando `destino == APTO_VENTA && origen == APROBADO`. Destinatario: el Dueño (no el equipo). Texto literal: `"Tu comercio {nombre} ya puede recibir pedidos."` Se emite en `MP_VINCULADO`, `DOCUMENTO_APROBADO`, etc.; **no** se emite al aprobar el comercio (`avisar=false`) ni al restaurar la cuenta (el origen es `CERRADO_TEMPORALMENTE`/`INACTIVO`) ni al levantar una suspensión (esa ruta usa `destinoAlLevantarSuspension`, que no escribe ni avisa).
- **T41 `COMERCIO_SIN_APTITUD`**: cuando `destino == APROBADO` (desde `APTO_VENTA`, o desde `CERRADO_TEMPORALMENTE`/`INACTIVO` al restaurar). Texto: `"Tu comercio {nombre} dejó de recibir pedidos: {faltante}."` con `faltante` = "falta vincular Mercado Pago y tener un documento aprobado" / "falta vincular Mercado Pago" / "falta tener un documento aprobado" / "no cumple los requisitos para vender". Con el comercio `CERRADO_TEMPORALMENTE` por bloqueo no se emite (`cerrarPorBloqueo` no avisa).
- Para `INACTIVO`→`APROBADO` al restaurar, T41 dice "dejó de recibir pedidos" aunque el comercio no estuviera recibiendo (inactivo) — ver D-64.

Diagrama propio: **no hace falta** (es un servicio compartido). Alcanza con una nota en cada proceso llamador (P2 comercio, P3 documentos, P1 cuenta, P5 Mercado Pago) y un cuadro de "regla de aptitud" en P2.

## 2.2 `TurnoBackfillRunner` (backfill de turnos al arrancar)

- `B/services/TurnoBackfillRunner.java`: `@Component`, método `alArrancar()` con `@EventListener(ApplicationReadyEvent.class)`. Lee `turno.backfill.habilitado` (por defecto `true` en el código; **`application.properties` no la define**; el perfil `test` la pone en `false`, `application-test.properties:37`).
- **Disparo/hilo:** si está habilitado, crea un `Thread` propio llamado `turno-backfill` (daemon) que ejecuta `TurnoBackfillService.ejecutar()`; no demora el arranque ni usa el scheduler. Captura `RuntimeException` y registra `log.error("No se pudo completar la asignación de turnos a pedidos anteriores", e)`; el proceso no se reintenta hasta el próximo arranque.
- `B/services/TurnoBackfillService.java`: `ejecutar()` lee los `comercio_id` distintos de `pedido WHERE turno_fecha IS NULL AND fecha_pago_confirmado IS NOT NULL`; por cada comercio (con `try/catch` por comercio: un error se registra y se sigue): lee `MIN(fecha_pago_confirmado)` y las versiones de `horario` con `horarioRepository.findVigentesDesde`, recorre los pedidos en lotes de 500 por `id`, asigna con `TurnoPedidoService.asignar` (misma regla que el pago) y **escribe** `UPDATE pedido SET turno_fecha=?, turno_horario_id=? WHERE id=? AND turno_fecha IS NULL` en una transacción por lote. Los que no se pueden asignar (comercio sin franjas en la ventana) quedan sin turno y se cuentan aparte. Al final `log.info("Asignación de turnos a pedidos anteriores: {} asignados, {} sin turno")`.
- **Idempotencia:** sí (condición `turno_fecha IS NULL` en cada `UPDATE`, nunca pisa un turno asignado; segura con varias instancias). Solo toma la fila de `pedido` y la lectura compartida de `horario` por la FK. Atajo de prueba `POST /api/v1/test/jobs/backfill-turnos` (`TestController:167`).
- **Qué pasa si falla:** el error por comercio se registra y continúa; el error global se registra y termina; no hay marca de "ya corrió": se reintenta solo en el siguiente arranque y recorre únicamente lo pendiente.
- **Diagrama propio:** no; **nota dentro de P7** (Automatismos) como "proceso de una sola vez al arrancar", disparador evento, no cron. Se anota que `turno.backfill.habilitado` conviene apagarlo después de la primera corrida (doc de la fase T2).

## 2.3 `admin-reactivar.js`

- Archivo `F/js/admin-reactivar.js`; exporta `abrirHojaReactivarCuenta({ usuarioId, nombre, opener, alExito, alConflicto, devolverFocoA })`. Es un componente de hoja modal (no una pantalla propia) usado desde `F/js/admin-clientes.js:335` (menú de Clientes) y `F/js/admin-dueno-suspension.js:374` (hoja de Dueños).
- **Endpoints:** `GET /api/v1/administrador/cuentas/{usuarioId}/reactivar/previa` (vista previa) y `PUT /api/v1/administrador/cuentas/{usuarioId}/reactivar` (`AdministradorController.java:229,235` → `ReactivacionCuentaAdminService.vistaPrevia`/`reactivar`). `reactivar` toma el usuario del Administrador (compartido) y el de la cuenta (`FOR UPDATE`) en id ascendente y delega en `ReactivacionCuentaService.reactivar(usuario, "Reactivación por el Administrador", "Reactivación de la cuenta del Dueño por el Administrador", administradorId)`; una cuenta que no está inactiva → `409` "La cuenta no está inactiva"; un Administrador como objetivo → `409` "No se puede reactivar la cuenta de un Administrador"; `404` "Usuario no encontrado". Respuesta `200` "Cuenta reactivada correctamente".
- **Textos y botones:** título de la hoja "Reactivar a {nombre}"; caja "Qué va a pasar" con "Podrá ingresar y comprar de nuevo." y "Se anota en su historial que la reactivaste vos."; para un Dueño, lista de comercios con "Se restablecen N de M comercios" (cada uno con "Vuelve") y, por cada comercio que sigue, "{nombre} – Sigue suspendido / Se suspendió aparte. Hay que levantarlo desde su ficha."; esqueleto mientras carga la previa; si la previa falla: "{mensaje} Igual podés reactivar la cuenta." con el mensaje por defecto "No pudimos calcular el detalle."; botones "Reactivar cuenta" ("Reactivando…") y "Cancelar"; éxito: cierra, toast "Cuenta reactivada" y llama `alExito` (recarga la lista y enfoca la fila); error: aviso fijo con el mensaje o "No pudimos reactivar la cuenta. Probá de nuevo.", y ante `409` llama `alConflicto` (recarga). Con foco atrapado, Escape y clic en el fondo para cerrar.
- **Diagrama propio:** no hace falta; ya está relevado el proceso en P7.04 (Tramo H). Alcanza con una nota en P1/P2 "Reactivar cuenta (Administrador)".

## 2.4 `sonido-avisos.js`

- Archivo `F/js/sonido-avisos.js`; UI en `F/js/sonido-interruptor.js` (`crearInterruptorSonido`). Preferencia: `localStorage['bajonea_sonido_avisos']`; **activada salvo que valga `'0'`** (por defecto activada; si `localStorage` falla, activada).
- **Cuándo suena** (`reproducirDing`): un tono sinusoidal de ~0,42 s (880 → 1175 Hz) por Web Audio, solo si `sonidoActivado()` (o `forzar`), si existe el contexto de audio y se logró reanudar (los navegadores exigen un gesto: `prepararAudio` escucha `click` y `keydown` para `resume()`).
- **Disparo desde avisos** (`vigilarAvisos(clave, noLeidas)`): guarda por clave `{previo, ultimoId, ocupado}`; la primera lectura solo fija la línea base (si hay no leídas pide `GET /notificaciones` con `segundoPlano:true` para el id más nuevo sin leer); cuando el contador **cambia** y es mayor que cero, vuelve a pedir `GET /notificaciones` y suena **solo si el id más nuevo sin leer supera al último visto**; si baja a 0 solo actualiza. Errores de red: ignorados.
- **Quién lo llama:** `F/js/cliente-escritorio.js:36` (clave `'cliente'`, dentro de `consultarAvisos`, sondeo de 15 s, iniciado por `suscribirAvisosCliente` desde `F/js/catalogo.js:185`; también por `refrescarAvisosCliente` de `notificaciones.js`) y `F/js/comercio-activo.js:41-44` (clave `comercio-{id}`, con el contador de `mis-comercios`, sondeo de 15 s). Además `F/js/comercio.js:307` reproduce el ding (con `prepararAudio`) al detectar que el comercio cambió de estado, y espera `ESPERA_ANTES_DE_NAVEGAR_CON_SONIDO_MS` antes de navegar. El import de `vigilarAvisos` en `F/js/catalogo.js:12` no tiene uso en ese archivo (solo importado).
- **Interruptor** (`crearInterruptorSonido`): tarjeta "Sonido de avisos" / "Suena cuando llega una notificación nueva."; interruptor con "Sonido activado"/"Sonido desactivado"; si el audio está bloqueado, ayuda "Para que suene, tocá una vez en esta pantalla." y botón "Activar sonido"; toasts "Sonido de avisos activado" / "Sonido de avisos desactivado"; al activar reproduce un ding de muestra. Montado en `sonido-slot` del perfil del Cliente (`F/js/cliente.js:137`) y del comercio (`F/js/comercio.js:708,2583`). **El Administrador no usa sonido** (no llama a `vigilarAvisos` ni monta el interruptor).
- **Diagrama propio:** no; **nota en P6 (Notificaciones)**, "Sonido del navegador, preferencia local (no persistida en servidor)".

## 2.5 Scheduler (C-42)

- `@EnableScheduling` en `B/BajoneaApplication.java:8`. **No hay** ningún bean `TaskScheduler`/`ThreadPoolTaskScheduler`/`SchedulingConfigurer`, ni `@EnableAsync`/`@Async`, ni ninguna propiedad `spring.task.scheduling.*` en `application.properties`, `application-production.properties` ni `application-test.properties` (búsqueda de `scheduling|spring.task|ThreadPoolTask|ScheduledExecutor|SchedulingConfigurer|@Async|@EnableAsync` en `backend/src/main`: solo las importaciones y los `@Scheduled`).
- **Conclusión por configuración:** los 11 métodos `@Scheduled` (Spring Boot 3.5.16, según `pom.xml`) comparten el planificador que crea la autoconfiguración de Spring Boot, cuyo tamaño de pool por defecto es 1: **un único hilo**. Es una conclusión derivada de la ausencia de configuración y del comportamiento por defecto de Spring Boot; **no se verificó con un volcado de hilos con la aplicación en marcha**. Consecuencia: si un proceso tarda (por ejemplo `CierreTurnoJob` midió ~16 s con 2000 comercios según `CLAUDE.md`), los demás esperan; `fixedDelay` evita solapar al mismo método, no a los distintos.
- Métodos: `CierreTurnoJob.abrirYCerrarTurnos` (`fixedDelay 60_000`), `InactivacionCuentaJob` (cron `${inactividad.cron:0 30 3 * * *}`, zona `app.zona-horaria`), `InvitacionVencimientoJob` (`fixedDelay 60_000`), `ReaperturaComerciosJob` (`fixedDelay 60_000`) y siete en `PedidoSchedulerService` (`expirarPagosVencidos` 60 s, `avisar75MinYAutoconfirmar` 60 s, `expirarPedidosSinRespuestaComercio` 300 s, `autoconfirmarRetirosPorSuspension` 300 s, `cancelarPreparacionPorSuspension` 60 s, `rechazarPendientesPorSuspension` 60 s, `procesarPedidosSinAtencionPorSuspensionDeDueno` 60 s; controlados por `pedido.jobs.habilitado`, por defecto `true`). El javadoc de `PedidoSchedulerService` (línea 9) dice "Los 5 jobs" pero hay 7 métodos (D-65). No hay ningún job de reintento de reembolsos (ver P7 en la Parte 3).
- `TurnoBackfillRunner` **no** usa el scheduler (hilo propio, ítem 2.2).

## 2.6 Reglas de `CONCURRENCIA-Y-TRANSACCIONES.md` que el código no respeta (relevamiento por muestreo)

Metodología: se contrastó el documento (orden global de bloqueos, §Soporte, reglas 16 y 17 de `CLAUDE.md`) con: todo el módulo de Soporte; `AptitudVentaComercioService` y sus llamadores directos (`SuspensionComercioService.suspender`, `SuspensionDuenoService` en el tramo de bloqueo de comercios, `AuthService.propagarBloqueoAComercio`/`restaurar`, `ReactivacionCuentaAdminService.reactivar`); todos los llamados directos a `EmailService` (búsqueda `emailService.` en `B/`); `REQUIRES_NEW`; `open-in-view`. **No se auditaron** `PedidoService`, `ProductoService`, `CarritoService`, `ReembolsoService`, `NotificacionService`, `InvitacionEmpleadoService` ni los módulos restantes contra el documento.

**Resultados (hallazgos de código frente a documento):**
1. **Ninguna violación de código encontrada** del orden `usuario → … → comercio → pedido → pago → carrito → soporte_limite → ticket_soporte → mensaje` en Soporte: `crear` toma el `usuario` compartido, luego los cerrojos email antes que IP, luego cuenta y escribe; `verSinSesion`/`responderSinSesion` toman `INTENTO_EMAIL` y `INTENTO_IP` antes de la primera lectura común; `responder`/`cerrar` del Administrador toman primero `ticket_soporte` con `FOR UPDATE`.
2. **`SuspensionComercioService.suspender`** (línea 108) toma usuarios y relaciones, luego `bloquearComercio`; **no toma `cuenta_mercado_pago`**, a diferencia de la aprobación y la vinculación. No contradice el orden (omite un eslabón intermedio) pero la tabla del orden global dice "`dueno`, después `cuenta_mercado_pago`... (aprobación, vinculación y desvinculación)", sin incluir la suspensión: sin desvío de código, solo una precisión.
3. **Regla 16 / 17:** sin `REQUIRES_NEW` en el código (solo aparece en un comentario de `ColaPostTransaccion.java:30`); `spring.jpa.open-in-view=false` (`application.properties:11`); todos los envíos de email van por `EjecucionPostCommit` salvo `CierreTurnoEnvioService.java:123` (llamada directa a `emailService.enviarResumenTurno`, documentada como "sin ninguna transacción abierta durante la llamada") y `AvisoSoporteService.reenviarRespuesta`/`enviarYMarcar` (fuera de transacción, por diseño).
4. **Desvío de documentación (no de código):** `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, sección Soporte, dice "5 intentos por hora" (y "los 5 intentos por hora de su acceso") y el nombre del test cita "TreintaIntentos"; el código vigente usa **30** (`SoporteProperties.intentosFallidosPorHoraEmail = 30`). Ver D-66.
5. No relevado: orden de bloqueo de los módulos restantes.

## 2.7 Tests que cubren P8 y los ítems 1 a 4 (solo inventario)

**P8 — backend (`backend/src/test/java/com/bajonea/backend/services/`):**
- `SoporteSesionIntegrationTest` (10 tests) — consulta con sesión, `mis-consultas`, ajenas, usuario suspendido.
- `SoporteLimitesIntegrationTest` (16 tests): `laCuartaConsultaDelDiaDeUnEmailSeRechazaConSuMensaje`, `lasConsultasCerradasSiguenContandoParaElLimiteDelDia`, `conTresConsultasAbiertasDeAyer…`, `alCerrarUnaDeLasAbiertasDeAyer…`, `laOnceavaConsultaDeUnaMismaIp…`, `elLimiteDeEmailNoAfectaAOtroEmail…`, `despuesDeTreintaIntentosFallidos…`, `despuesDeDiezIntentosFallidosDeUnaIp…`, `losAccesosCorrectosNoCuentanComoIntentosFallidos`, `conVeintinueveIntentosFallidos…`, `alguienQueSoloConoceElEmailNoPuedeDejarSinAcceso…`, `cuandoPasaLaVentanaDeUnaHora…`, `elReenvioDeCodigosRespondeSiempreLoMismo…`, `elReenvioSoloIncluyeLasConsultasNoCerradas…`, `elReenvioTieneUnMaximoDeTresPorHora…`, `unaConsultaCreadaConLosTresLimitesEnSuNivelNoDejaFilasDeContadorSinUsar`.
- `SoporteConversacionIntegrationTest` (13 tests) — turnos, tope de 20, cerrada.
- `SoporteAdminIntegrationTest` (11 tests) — bandeja, responder, cerrar, reenviar email.
- `SoporteHttpIntegrationTest` (9 tests) — contrato HTTP y seguridad (rutas públicas, suspendido).
- `SoporteConcurrenciaIntegrationTest` (11 métodos de prueba listados; no se verificó cómo se repiten): `diezConsultasSimultaneasDelMismoEmailCreanComoMaximoTres`, `veinteConsultasSimultaneasDeLaMismaIp…`, `dosRespuestasSimultaneasDeSoporte…`, `unaRespuestaDeSoporteContraUnCierre…`, `unaRespuestaDeLaPersonaContraUnCierre…`, `dosMensajesSimultaneosDeLaPersona…`, `elMensajeVeinteDisputado…`, `elMensajeDiecinueveDeLaPersona…`, `losIntentosFallidosSimultaneosDeUnEmailNoPasanDeTreinta`, `losIntentosFallidosSimultaneosDeUnaIpNoPasanDeDiez`, `losReenviosSimultaneosDeCodigos…`.
- `SoporteEmailsIntegrationTest` (7), `SoporteEmailsPoolDiminutoIntegrationTest` (3), `EmailServiceSoporteTest` (7), `SoporteColisionDeCodigoIntegrationTest` (2); base común `SoporteIntegrationBase`.
- **Playwright** (`testing/playwright/tests/`): `91-soporte-sin-sesion-ui.spec.ts`, `92-soporte-con-sesion-ui.spec.ts`, `93-soporte-administrador-ui.spec.ts` (UI; solo se contó la cantidad de tests del 93: 13; los de 91 y 92 no se contaron), `133-escritorio-admin-documentos-soporte-tarifas-ui.spec.ts` y `105-toast-sesion-ayuda-ui.spec.ts`, `107-reintentos-seguros-ui.spec.ts` (mencionan Soporte). No hay spec de API de Soporte en Playwright.
- **Otros:** Newman `build-soporte-fase5s4-postman.mjs` (carpeta 88 según `CLAUDE.md`), `stress-locks-tramoSoporte.mjs` (id `soporte`), `mutaciones-soporte-s4.mjs`.

**Ítem 1 (`AptitudVentaComercioService`):** `AptitudVentaComercioServiceTest` (26 tests), `DocumentoComercioAptitudIntegrationTest` (16 tests, tabla de escenarios), además de los tests de documentos/suspensión citados en el relevamiento de sus tramos.
**Ítem 2 (`TurnoBackfill`):** `TurnoBackfillIntegrationTest` (7 tests: `asignaElTurnoALosPedidosPagados…`, `laEscrituraNoPisaUnTurnoQueSeAsignoDespuesDeLeerElLote`, `unComercioSinFranjas…`, `usaLaVersionDelHorarioQueRegiaCadaDia`, `laMigracionRellenaLaFechaDelPago…`, `laClaveForaneaDelTurno…`, `unInsertDeSqlPuro…`) y spec Playwright `72-pedido-turno-backfill-api.spec.ts`. El `Runner` (disparo al arrancar) no tiene un test propio identificado (el perfil `test` lo desactiva).
**Ítem 3 (`admin-reactivar.js`):** Playwright `99-reactivar-cuenta-administrador-ui.spec.ts` (también tocan el flujo `98-cuenta-inactiva-login-ui.spec.ts`, `10-recuperacion-y-reactivacion.spec.ts`).
**Ítem 4 (`sonido-avisos.js`):** Playwright `104-sonido-avisos-ui.spec.ts` (también aparece en `110`, `126`, `143`, `150`, `151`).

---

# PARTE 3 — DATOS PARA EL CHEQUEO CRUZADO CONTRA EL DFD NIVEL 1

Los flujos son los que el código ejecuta hoy (sin interpretar la documentación).

## Flujos de P8 (Soporte)

| Flujo | Origen | Destino | Tablas / almacenes |
|---|---|---|---|
| Consulta nueva sin sesión (email, tipo, mensaje) | Visitante | P8 | `ticket_soporte`, `ticket_soporte_mensaje`, `soporte_limite` |
| Consulta nueva con sesión (tipo, mensaje) | Cliente, Dueño o Empleado | P8 | `usuario` (lectura del email y bloqueo compartido), `ticket_soporte`, `ticket_soporte_mensaje`, `soporte_limite` |
| Email "Recibimos tu consulta" | P8 | Persona solicitante (por Resend) | — (no se marca fallo) |
| Código y datos de la consulta (id, código, estado) | P8 | Persona solicitante (respuesta HTTP y pantalla) | — |
| Acceso a la conversación con email + código | Visitante | P8 | `soporte_limite` (intentos), `ticket_soporte`, `ticket_soporte_mensaje` |
| Conversación (mensajes, estado, aviso) | P8 | Visitante / Cliente / Dueño / Empleado | `ticket_soporte`, `ticket_soporte_mensaje` |
| Mensaje de seguimiento de la persona | Visitante (con código) / Cliente, Dueño, Empleado (con sesión) | P8 | `ticket_soporte` (estado, contador), `ticket_soporte_mensaje`, `soporte_limite` (solo sin sesión) |
| Pedido de reenvío de códigos (email) | Visitante | P8 | `soporte_limite` (reenvíos), `ticket_soporte` |
| Email "Tus códigos de consulta" | P8 | Visitante (por Resend) | — |
| Listado de mis consultas y contador | Cliente, Dueño, Empleado | P8 | `usuario`, `ticket_soporte` |
| Bandeja y detalle de consultas | Administrador | P8 | `ticket_soporte`, `ticket_soporte_mensaje`, `usuario`, `dueno`, `persona_fisica`, `empleado` |
| Respuesta de Soporte | Administrador | P8 | `ticket_soporte` (estado, contador), `ticket_soporte_mensaje` |
| Email "Soporte respondió tu consulta" | P8 | Persona solicitante (por Resend) | `ticket_soporte_mensaje.email_enviado` (marca del resultado) |
| Cierre de consulta | Administrador | P8 | `ticket_soporte` (estado, `cerrado_en`) |
| Reenvío manual del email de respuesta | Administrador | P8 → Persona (por Resend) | `ticket_soporte_mensaje.email_enviado` |
| Cierre automático por el mensaje N.º 20 | P8 (interno, al escribir) | — | `ticket_soporte` |
| Contador de consultas que esperan (métrica) | P8 | Administrador (dashboard, insignia y tarjeta) | `ticket_soporte` (lectura vía `AdministradorService`) |

**No existe** en el código: flujo P8 → P6 (aviso in-app de nueva consulta al Administrador; `NUEVO_MENSAJE_SOPORTE` sin emisor), flujo P8 → P1/P2 (levantar una suspensión desde un ticket) ni job de P7 sobre Soporte.

## Flujos de P7 (Automatismos y Configuración), tal como el código los ejecuta

| Flujo | Origen | Destino | Tablas / almacenes |
|---|---|---|---|
| Reapertura automática de comercios (cada 60 s) | Planificador (`ReaperturaComerciosJob`) | Comercio (estado de apertura) | `comercio` (`cerrado_manualmente`), `historial_cierre_comercio`, `horario` |
| Vencimiento de invitaciones (cada 60 s) | Planificador (`InvitacionVencimientoJob`) | Invitación de Empleado | `invitacion_empleado` |
| Inactivación de cuentas (diario 03:30) | Planificador (`InactivacionCuentaJob`) | Persona (cuenta), Dueño (comercios) | `usuario`, `sesion`, `historial_estado_usuario`, `comercio`, `historial_estado_comercio`, `notificacion`; email por Resend |
| Cierre de turno y email al Dueño (cada 60 s) | Planificador (`CierreTurnoJob`) | Dueño | `cierre_turno`, `pedido`, `horario`; email por Resend |
| Asignación de turnos a pedidos anteriores (una vez al arrancar, hilo propio) | `TurnoBackfillRunner` | Pedido | `pedido`, `horario` |
| Expiración de pagos vencidos (60 s, 30 min) | Planificador (`PedidoSchedulerService`) | Pedido, Cliente | `pedido`, `historial_estado_pedido`, `notificacion` |
| Aviso a los 75 min y autoconfirmación a los 90 min (60 s) | Planificador | Cliente, Dueño y equipo | `pedido`, `historial_estado_pedido`, `notificacion` |
| Expiración de pedidos sin respuesta del comercio (300 s, 30 min) | Planificador | Cliente, Dueño y equipo | `pedido`, `historial_estado_pedido`, `nota_credito`, `notificacion`; reembolso a Mercado Pago |
| Cierre como no retirado por comercio suspendido (300 s, 90 min) | Planificador | Cliente | `pedido`, `historial_estado_pedido`, `notificacion` |
| Cancelación de pedidos en preparación por suspensión (60 s) | Planificador | Cliente | `pedido`, `historial_estado_pedido`, `nota_credito`, `notificacion`; reembolso a Mercado Pago |
| Rechazo de pendientes por suspensión (60 s) | Planificador | Cliente | ídem |
| Pedidos sin atención por suspensión del Dueño (60 s) | Planificador | Cliente | ídem |
| Tarifa vigente al crear un pedido (lectura) | Configuración de tarifas | P4 (Pedido) | `configuracion_tarifa`, `pedido` |
| Configuración de tarifas (alta, historial) | Administrador | P7 | `configuracion_tarifa` |

Notas para el cruce con el DFD Nivel 1 (hechos del código, sin juzgar el DFD): (a) **no existe ningún job de reintento de reembolsos fallidos**; el reintento es manual (`POST /administrador/reembolsos/{id}/reintentar`); (b) el timeout de `PENDIENTE_CONFIRMACION_COMERCIO` en el código es 30 minutos (`pedido.timeout.respuesta-comercio-minutos=30`); (c) la inactivación usa 3 meses calendario (`inactividad.meses`), no 90 días; (d) la "propagación de estado Dueño → comercios" no es un job: ocurre dentro de la transacción de bloqueo/suspensión/inactivación; (e) las tarifas se aplican en `PedidoService.confirmarPedido` (flujo P7→P4 de lectura).

---

# RESUMEN — DESVÍOS Y CUESTIONES

## Desvíos (código vs documentación)

- **D-60** — `B/enums/TipoNotificacion.java:31` (`NUEVO_MENSAJE_SOPORTE`, T22) y `docs/diccionario-de-datos.md:651` ("Push al Administrador, nuevo mensaje de soporte de un usuario suspendido"): el código **no emite nunca** ese aviso (ni al crear ni al responder la persona); el Administrador solo ve el contador `consultasSoporteEsperando` (`AdministradorService.java:288`) con sondeo de 15 s en la bandeja.
- **D-61** — `B/services/SoporteService.crear` (`ventanaConsultasHoras=24`, `countByEmailAndCreadoEnAfter(ahora−24 h)`) y `CLAUDE.md`/mensajes ("3 consultas hoy", "por día"): el código usa una **ventana móvil de 24 horas**, no el día calendario; el mensaje al usuario dice "hoy" y "mañana".
- **D-62** — `B/services/SoporteLimiteService.java` y `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (Soporte): las claves `CREAR_EMAIL|`/`CREAR_IP|` **no llevan conteo** (cantidad siempre 0, solo cerrojo); el límite de creación se cuenta sobre `ticket_soporte`. La documentación describe todas las claves como "contador"; solo `INTENTO_*` y `REENVIO_*` lo son.
- **D-63** — `B/repositories/TicketSoporteRepository` (`findDelUsuario`, `findDelUsuarioPorId`, `findIdDelUsuarioPorId`, `contarDelUsuarioPorEstado`): "Mis consultas" y las operaciones con sesión se resuelven por `usuario_id = :id **OR** email = :email`; una consulta creada **sin sesión** con el email de la cuenta aparece en "Mis consultas" y la cuenta la puede responder con sesión. La documentación habla de "consultas de la persona" sin precisar este cruce.
- **D-64** — `B/services/AptitudVentaComercioService.avisarCambio` (289-298) y `docs/diccionario-de-datos.md:667` (T41 "dejó de recibir pedidos"): T41 se emite en toda transición con destino `APROBADO`, incluso al restaurar un comercio `INACTIVO`/`CERRADO_TEMPORALMENTE` (que no estaba vendiendo), con el texto "dejó de recibir pedidos". La documentación dice que se emite "si al restaurar la cuenta ya no la cumple" (coincide) pero no advierte que el texto es engañoso en el caso `INACTIVO`. Además `MotivoRecalculo.DUENO_BLOQUEADO` existe y tiene texto ("Bloqueo de cuenta") pero **ningún llamador lo usa** (el bloqueo usa `cerrarPorBloqueo` con un detalle fijo).
- **D-65** — `B/services/PedidoSchedulerService.java:9` (javadoc "Los 5 jobs") vs 7 métodos `@Scheduled` en el mismo archivo; `docs/DECISIONES.md`/`CLAUDE.md` hablan de "4 jobs" y "7 de la tabla" según la fecha.
- **D-66** — `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, sección Soporte ("5 intentos por hora", "los 5 intentos por hora de su acceso"): el código vigente permite **30 intentos fallidos por hora por email** y 10 por IP (`SoporteProperties`; `CLAUDE.md` ya lo dice, el documento de concurrencia quedó atrás).
- **D-67** — `B/services/SoporteService.crear` línea 240-246 y `ConversacionSoporte.agregarMensaje`: los mensajes de la persona se guardan con `email_enviado = true` siempre (no se envía ningún email por ellos), de modo que la columna significa "enviado o no aplica" para `PERSONA`; la documentación la describe solo para respuestas de Soporte.

## Cuestiones abiertas de negocio

- **C-49** — `soporte_limite` crece sin acotar y sin limpieza: se crea una fila `INTENTO_EMAIL|<email>` y `INTENTO_IP|<ip>` por cada acceso con email arbitrario (aunque no exista), `REENVIO_*` por cada pedido de reenvío y `CREAR_*` por cada alta; ningún job las purga (los 11 `@Scheduled` no incluyen Soporte). ¿Hace falta una limpieza periódica?
- **C-50** — El Administrador no recibe aviso (ni in-app ni email) por una consulta nueva ni por un mensaje de seguimiento; depende de abrir la bandeja o del contador. ¿Se emite `NUEVO_MENSAJE_SOPORTE` (T22)? ¿Hay un tiempo máximo de respuesta?
- **C-51** — El Visitante puede mandar emails "Recibimos tu consulta" a un email ajeno (hasta 3 por día y por email, 10 por IP); y no hay captcha ni honeypot en las rutas públicas. ¿Se acepta?
- **C-52** — Un Dueño o un Empleado escribe a Soporte sin contexto de comercio (no se envía `X-Comercio-Id` y `ticket_soporte` no guarda comercio): ¿debería el ticket indicar sobre qué comercio consulta, sobre todo para `APELACION_COMERCIO`?
- **C-53** — El reenvío de códigos manda el email en el mismo pedido (canal lateral de tiempo para saber si un email tiene consultas abiertas); y un tercero que conoce un email puede agotarle los 30 accesos por hora. ¿Se mantiene el diseño?
- **C-54** — No hay vínculo entre un ticket y una suspensión (S1/S2/S3): el Administrador lee el ticket y debe ir a otra pantalla a levantar la suspensión; ninguna acción deja constancia en el ticket. ¿Se requiere "Levantar suspensión desde Soporte" (P8.05) o queda como proceso separado? Tampoco hay reapertura de un ticket cerrado ni cierre automático por inactividad.
- **C-55** — IP del solicitante: se usa `request.getRemoteAddr()`; detrás de un proxy inverso todos los visitantes comparten la IP del proxy si `server.forward-headers-strategy` no está configurado (solo lo define `application-test.properties`; ya figura en la lista de despliegue). Afecta el límite de 10 consultas por día y 10 accesos fallidos por hora por IP.
- **C-56** — Scheduler de un solo hilo (ítem 2.5, por configuración, no verificado en ejecución): un proceso lento (cierre de turno, inactivación) demora a los demás; ¿se define un pool propio o se acepta?

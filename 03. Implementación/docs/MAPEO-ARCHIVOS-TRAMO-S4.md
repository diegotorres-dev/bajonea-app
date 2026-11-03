# Mapeo de archivos — Fase 5, tramo S4 (Soporte), entrega A (backend, migración y tests)

2026-11-03. Sin pantallas: la entrega B (formulario, consulta, "Mis consultas" dentro del Perfil, bandeja del Administrador y los botones "Contactar a Soporte") usa estos endpoints. Números: migración `V49`, carpeta `88` de Newman, spec `91` reservado para la entrega B, diccionario v1.34, estrés `soporte` (escenario 22). Los próximos libres son `V50` (Reclamos), carpeta `89`, spec `92` (el `91` es de la entrega B) y diccionario v1.35.

## Migración

| Archivo | Qué hace |
|---|---|
| `backend/src/main/resources/db/migration/V49__soporte.sql` | Elimina la tabla `soporte` (vacía, sin código) y crea `ticket_soporte`, `ticket_soporte_mensaje` y `soporte_limite` |

## Backend (main)

| Archivo | Qué es |
|---|---|
| `entities/TicketSoporte.java`, `entities/MensajeSoporte.java` | Entidades de la consulta y de sus mensajes |
| `enums/TipoTicketSoporte.java`, `EstadoTicketSoporte.java`, `AutorMensajeSoporte.java` | Tipo, turno y autor |
| `repositories/TicketSoporteRepository.java` | Consultas (bloqueo `FOR UPDATE` por id, por email y código, de un usuario, bandeja del Administrador por orden y por email, cuentas por email en una consulta, emails sin enviar) |
| `repositories/MensajeSoporteRepository.java` | Mensajes por consulta y marca de `email_enviado` por clave primaria |
| `repositories/TicketSoporteInsercionRepository.java` | Alta de la consulta por JDBC (colisión de código sin romper la transacción) |
| `repositories/SoporteLimiteRepository.java` | Filas de contador: crear con `ON DUPLICATE KEY UPDATE` y leer con `FOR UPDATE` |
| `services/SoporteService.java` | Crear (con y sin sesión), ver, responder, reenviar códigos, Mis consultas y contador |
| `services/SoporteAdminService.java` | Bandeja, detalle con cuenta asociada, responder, cerrar, reenviar el email, contador |
| `services/SoporteLimiteService.java` | Los límites (consultas, intentos fallidos, reenvíos) |
| `services/ConversacionSoporte.java` | Turnos, tope de 20 y cierre; compartido por la persona y Soporte |
| `services/ResultadoSoporte.java` | El valor o el error que se lanza después del commit |
| `services/AvisoSoporteService.java` | Los tres emails, después del commit, con el resultado marcado en el mensaje |
| `services/CodigoConsultaGenerador.java` | Código de 8 caracteres legibles |
| `services/EmailService.java` | `enviarSoporteConsultaRecibida`, `enviarSoporteRespuesta`, `enviarSoporteCodigos` (sin destinatario ni código en el log) y `simularFallasDeSoporte` |
| `util/SoporteEnlaces.java` | Enlace "Ver mi consulta" con el código y el email en el fragmento (`PAGINA_CONSULTA = soporte-consulta.html`) |
| `config/SoporteProperties.java` | Límites configurables (`soporte.*`, con los valores del pedido por defecto en el código) |
| `exceptions/LimiteSoporteException.java` y `GlobalExceptionHandler.java` | `429` con el mensaje de cada límite |
| `controllers/SoporteController.java` | `/api/v1/soporte` (cuatro rutas públicas bajo `/publico` y las rutas con sesión) |
| `controllers/SoporteAdministradorController.java` | `/api/v1/administrador/soporte` |
| `controllers/TestController.java` | `PUT /api/v1/test/email-soporte/fallas?cantidad=` (solo perfil `test`) |
| `dto/request/*Soporte*RequestDTO.java` (6) | Crear con y sin sesión, acceso por código, responder sin sesión, mensaje y reenvío de códigos |
| `dto/response/*Soporte*ResponseDTO.java` (9) | Creada, consulta, resumen, contador, mensaje, cuenta asociada y las dos vistas del Administrador |
| `config/security/SecurityConfig.java` | Cuatro rutas públicas exactas de `/soporte/publico` y `/soporte/**` autenticado |
| `config/security/JwtAuthenticationFilter.java` | Las rutas de `/api/v1/soporte/` pasan con la cuenta suspendida (sesión activa o cerrada por la suspensión) |
| `services/AdministradorService.java`, `dto/response/MetricasAdminResponseDTO.java` | `consultasSoporteEsperando` en las métricas del panel |
| `resources/application-test.properties` | `server.forward-headers-strategy=native` (el perfil de pruebas honra `X-Forwarded-For`) |

## Pruebas

| Archivo | Qué prueba |
|---|---|
| `SoporteConversacionIntegrationTest` (13) | Alta, tipos, código, turnos, tope de 20, cierre, acceso con email y código, HTML tal cual |
| `SoporteLimitesIntegrationTest` (14) | Límites por día, abiertas, IP, intentos fallidos y reenvíos, con los mensajes exactos |
| `SoporteSesionIntegrationTest` (10) | Con sesión, ajena = 404, cuenta suspendida por HTTP, filtro JWT |
| `SoporteAdminIntegrationTest` (11) | Bandeja, filtros, email, cuenta asociada, reenvío del email, sin consulta por fila |
| `SoporteHttpIntegrationTest` (9) | Contrato HTTP, validaciones, 404 idénticos, 429, quién entra a la bandeja |
| `SoporteConcurrenciaIntegrationTest` (11 × 8 = 88) | Las carreras |
| `SoporteEmailsIntegrationTest` (7), `SoporteEmailsPoolDiminutoIntegrationTest` (2), `EmailServiceSoporteTest` (7) | Emails y log |
| `SoporteColisionDeCodigoIntegrationTest` (2) | Colisión del código |
| `DatosUnicos` y los 9 tests que lo usan | Datos únicos sin colisiones |
| `testing/playwright/scripts/build-soporte-fase5s4-postman.mjs` | Carpeta `88` de Newman (141 requests) |
| `testing/playwright/scripts/stress-locks-tramoSoporte.mjs` | Estrés `soporte` (escenario 22) |
| `testing/playwright/scripts/mutaciones-soporte-s4.mjs` | 16 mutaciones con corrida base verde |
| `testing/playwright/scripts/stress-locks-tramoE3-A0.mjs` | Expectativa del motivo de la nota por quien rechazó (pendiente de S3.2) |
| `testing/playwright/scripts/correr-estreses.mjs` | Alta del estrés `soporte` y conteo de `Connection is not available` |

## Documentación

`docs/DECISIONES.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `docs/LISTA-DE-DESPLIEGUE.md`, `docs/entregables-01-02/CAMBIOS.md`, `docs/diccionario-de-datos.md` (v1.34) y su copia de `02. Diseño` (sin commitear).

---

# Entrega B (pantallas, specs y capturas) — 2026-11-03

Sin migraciones ni tablas nuevas. Números: Playwright specs `91`, `92` y `93` (el próximo libre es `94`), carpeta `88` de Newman ampliada (166 requests; la próxima libre sigue siendo `89`), diccionario sin cambios de versión (v1.34, con el tope de accesos fallidos corregido a 30). Última migración `V49`; la próxima, `V50` (Reclamos).

## Backend y pruebas del límite

| Archivo | Qué cambió |
|---|---|
| `config/SoporteProperties.java` | `intentosFallidosPorHoraEmail` pasa de 5 a 30 (la IP queda en 10) |
| `SoporteLimitesIntegrationTest` (16), `SoporteConcurrenciaIntegrationTest` | Los accesos fallidos se reparten en IP distintas para llegar a 30 por email; test nuevo de 29 intentos que todavía entran |
| `build-soporte-fase5s4-postman.mjs`, `stress-locks-tramoSoporte.mjs` | Carpeta `88` con 30 intentos desde tres IP y el 31 desde una cuarta; estrés con 40 accesos al mismo email |

## Frontend

| Archivo | Qué es |
|---|---|
| `soporte.html` + `js/soporte.js` | Formulario público (con sesión, el email viene de la cuenta y queda bloqueado) y pantalla de "Recibimos tu consulta" con el código |
| `soporte-consulta.html` + `js/soporte-consulta.js` | Ver y responder: sin sesión (fragmento `#codigo=…&email=…` que se lee y se borra con `history.replaceState`, o formulario con email y código, o reenvío del código) y con sesión (`?id=N`) |
| `mis-consultas.html` + `js/soporte-mis-consultas.js` | Lista de las consultas del usuario; `enlazarMisConsultas` pinta la fila y el contador en los Perfiles |
| `admin-soporte.html` + `js/admin-soporte.js` | Bandeja (Esperan / Respondidas / Cerradas) y detalle con cuenta asociada, responder, cerrar con confirmación y reenviar el email |
| `js/soporte-comun.js` | Tipos y estados, normalización del código, hilo de mensajes, caja de respuesta con contador y avisos |
| `perfil.html`, `comercio-perfil.html`, `js/cliente.js`, `js/comercio.js` | Fila "Mis consultas a Soporte" con contador (Cliente, Dueño en una sección "Ayuda" y Empleado dentro de su lista) |
| `js/admin.js` | Entrada "Soporte" en la grilla de gestión con `consultasSoporteEsperando` |
| `js/admin-clientes.js` | `?id=N` resalta un Cliente y muestra "Ver todos" (lo usa "Ver cuenta"; `admin-duenos.html` ya lo tenía) |
| `js/cuenta-suspendida.js`, `js/api.js` | Botones "Contactar a Soporte" y "Mis consultas"; la pantalla de sesión suspendida **ya no borra la sesión** hasta "Cerrar sesión" (Soporte con sesión la necesita) |
| `js/auth.js` | Enlace a Soporte en los avisos de cuenta bloqueada y de comercio no operativo del login |
| `js/comercio-suspendido.js` | Enlace a Soporte en la tarjeta de comercio suspendido (Dueño y Empleado) |
| `css/styles.css` | Estilos `soporte-*` y `profile-link__contador` |

## Pruebas

| Archivo | Tests |
|---|---|
| `tests/91-soporte-sin-sesion-ui.spec.ts` | 23: formulario, éxito, copiar código, fragmento, acceso manual, dato incorrecto, reenvío, turnos, tope de 20, límites, HTML literal |
| `tests/92-soporte-con-sesion-ui.spec.ts` | 16: Perfil de Cliente, Dueño y Empleado, Mis consultas, conversación, consulta ajena, cuenta suspendida, botones desde login y avisos |
| `tests/93-soporte-administrador-ui.spec.ts` | 13: panel, bandeja, detalle con y sin cuenta, responder, cerrar con confirmación, email fallido |
| `tests/helpers/soporte.ts` | IP por prueba (`X-Forwarded-For`), creación de consultas, capturas con reintento de escritura |
| Specs `84`, `86`, `89` y `90` | Ajustados: ya no afirman "sin Soporte"; el `84` espera que la sesión se mantenga en la pantalla de suspensión y se borre al cerrar; el `90` espera el foco del botón tras suspender (causa del inestable `90:157`) y espera con `expect.poll` el conteo de Dueños |
| `docs/capturas-soporte/` | 31 capturas a 375 px |

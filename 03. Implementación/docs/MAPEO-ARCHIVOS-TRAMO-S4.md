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

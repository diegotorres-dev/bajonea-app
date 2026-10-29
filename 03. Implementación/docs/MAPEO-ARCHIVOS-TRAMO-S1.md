# Mapeo de archivos — Fase 5, tramo S1 (suspensión de cuentas del Cliente)

Entrega A (backend, tests y documentación), 2026-10-27. La entrega B (pantallas y specs de Playwright de UI) no está hecha.

## Migración

| Archivo | Qué |
|---|---|
| `backend/src/main/resources/db/migration/V44__suspension_cuentas.sql` (nuevo) | `usuario.motivo_suspension`, `usuario.suspendido_desde` y `ck_usuario_suspension`; `historial_estado_usuario.administrador_id` (FK a `usuario`); `sesion.tipo_cierre` + `SUSPENSION`; `nota_credito.motivo` + `SUSPENSION_CLIENTE`, `RECLAMO`; `historial_estado_pedido.motivo_timeout` + `SUSPENSION_CLIENTE`. |

## Backend — código nuevo

| Archivo | Qué |
|---|---|
| `entities/HistorialEstadoUsuario.java`, `repositories/HistorialEstadoUsuarioRepository.java` | Entidad y repositorio de la tabla que ya existía en el baseline. |
| `services/EstadoUsuarioService.java` | Único punto que cambia `usuario.estado` (`cambiar`) y escribe el historial; regla de lectura `exigirNoSuspendido`. |
| `services/SuspensionUsuarioService.java` | Suspender, levantar, vista previa y reenvío del email (dos fases; orden de bloqueo; el bloqueo del objetivo es la primera lectura de la transacción). |
| `services/AvisoCuentaService.java` | Avisos T28 y T29: aviso dentro de la app, email de un solo intento después del commit, rastro `ENVIADO`/`FALLIDO` y reenvío. |
| `exceptions/CuentaSuspendidaException.java` | `409` con `data.codigo = CUENTA_SUSPENDIDA` y `data.motivo`. |
| `config/security/CuentaSuspendidaAuthenticationException.java` | Lo que el filtro JWT le pasa al entry point para el `401` con código y motivo. |
| `dto/request/SuspensionUsuarioRequestDTO.java`, `LevantamientoSuspensionRequestDTO.java` | Motivo de 10 a 500 caracteres (obligatorio) y motivo opcional de hasta 500. |
| `dto/response/SuspensionUsuarioResponseDTO.java`, `SuspensionClientePreviaResponseDTO.java` | Respuestas de suspender/levantar y de la vista previa. |

## Backend — código modificado

| Archivo | Cambio |
|---|---|
| `entities/Usuario.java` | Campos `motivoSuspension` y `suspendidoDesde`; `estado` sin `@Setter`; `aplicarEstado` (solo lo llama el servicio central). |
| `services/AuthService.java` | Login con la suspensión revelada después de la contraseña; recuperación y verificación ya no levantan una suspensión; todos los cambios de estado por el servicio central; la verificación del email toma la fila del usuario antes. |
| `config/security/JwtAuthenticationFilter.java`, `CustomAuthenticationEntryPoint.java` | El filtro lee sesión y estado del usuario en una consulta; cuenta suspendida = `401` con código y motivo. |
| `repositories/SesionRepository.java`, `UsuarioRepository.java`, `NotificacionRepository.java`, `PedidoRepository.java` | Consultas nuevas (estado de la sesión y la cuenta, rol y estado por id, sesiones activas, emails de aviso, pedidos por Cliente). |
| `services/PedidoService.java` | `confirmarPedido` bloquea una cuenta suspendida; `bloquear` lee el estado de todos los usuarios involucrados y rechaza al actor suspendido; `bloquearParaPago` (estado del Cliente y del comercio antes del pedido); pago aprobado con el Cliente suspendido = cancelar y reembolsar; `reembolsarPagoTardio` (H4); barrido de pedidos sin pagar. |
| `services/MercadoPagoPagoService.java` | `aplicarResultadoPago` con el nuevo bloqueo (cierra H10), reembolso del pago tardío (H4) y "Ir a pagar" bloqueado. |
| `services/HistorialEdicionComercioService.java`, `services/CierreComercioService.java` | Una cuenta suspendida no escribe en el comercio ni abre o cierra. |
| `services/EmailService.java` | Emails de suspensión y de levantamiento (devuelven el resultado) y falla simulada propia del perfil `test`. |
| `services/NotificacionService.java` | Rastro del email de cuenta (`registrarResultadoEmail`, `marcarResultadoEmail`, `ultimoEmail`). |
| `services/AdministradorService.java`, `dto/response/ClienteAdminResponseDTO.java` | El listado de Clientes trae `motivoSuspension` y `suspendidoDesde`. |
| `controllers/AdministradorController.java` | `PUT /clientes/{id}/suspender`, `PUT /clientes/{id}/levantar-suspension`, `GET /clientes/{id}/suspension/previa`, `POST /clientes/{id}/suspension/reenviar-email`. |
| `controllers/TestController.java`, `services/TestSupportService.java` | Atajos de test: `PUT /test/email-aviso-cuenta/fallas?cantidad=` y `GET /test/emails-cuenta?email=`. |
| `exceptions/GlobalExceptionHandler.java` | Handler de `CuentaSuspendidaException`. |
| `enums/TipoCierreSesion.java`, `MotivoNotaCredito.java`, `MotivoTimeoutPedido.java` | Valores nuevos (al final). |

## Tests

| Archivo | Qué |
|---|---|
| `SuspensionClienteIntegrationTest` (24 tests) | Servicio, login, filtro JWT, endpoints del Administrador, historial de todos los cambios, CHECK de `usuario`, actor suspendido. |
| `SuspensionClientePagoIntegrationTest` (12) | Webhook y sincronización con Mercado Pago simulado: pago antes y después de la suspensión, H4, carrera suspender contra pago (8 repeticiones). |
| `SuspensionClienteConcurrenciaIntegrationTest` (16) | Suspender contra checkouts (10 repeticiones), doble suspensión (5), suspender contra 30 logins. |
| `EstadoUsuarioCentralizadoTest` (4) | Nadie más cambia el estado de un usuario. |
| `EnumsContraBaseDeDatosIntegrationTest` (+3) | `sesion.tipo_cierre`, `nota_credito.motivo` y los estados del historial del usuario contra la base. |
| Ajustes a tests existentes | Constructores de `PedidoService` y `AuthService`; verificaciones de orden de bloqueo (`leerEstadoCuentaConBloqueoCompartido`); helper `DatosPruebaEmpleado.cambiarEstadoUsuario` (el CHECK exige motivo para `SUSPENDIDO`); spec `35-empleado-invitacion-api` (misma razón). |
| `testing/playwright/scripts/build-suspension-cliente-fase5s1-postman.mjs` | Carpeta `80` de Newman. |
| `testing/playwright/scripts/stress-locks-tramoSuspension.mjs` (+ id `suspension` en `correr-estreses.mjs`) | Estrés HTTP, extensible para S2. |
| `testing/playwright/scripts/mutaciones-suspension-s1.mjs` | Ejecutor de las mutaciones M1 a M15. |

## Documentación

`docs/diccionario-de-datos.md` (v1.29), `docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/entregables-01-02/CAMBIOS.md`, este archivo.

## Entrega B (pantallas, ajustes de backend y pruebas), 2026-10-28

Pendiente de la confirmación de Diego. El módulo de Soporte es el tramo S4: no hay ningún botón que lleve a Soporte; los lugares donde S4 lo va a sumar están marcados con un contenedor `suspension-acciones` (ver "Dónde va Soporte" más abajo).

### Backend

| Archivo | Cambio |
|---|---|
| `services/SuspensionUsuarioService.java` | Al levantar, la cuenta vuelve al estado que tenía antes de la suspensión (`estadoAlLevantar`, sale del historial): `PENDIENTE` y `INACTIVO` se conservan, `BLOQUEADO` y `ACTIVO` quedan `ACTIVO` (con intentos en cero), sin fila de historial o sin origen queda `ACTIVO`. Si queda `ACTIVO`, `fecha_ultimo_acceso` pasa a ahora. |
| `services/AdministradorService.java`, `dto/response/ClienteAdminResponseDTO.java` | El listado de Clientes suma `ultimoEmailAvisoFallido` (el último email de aviso que corresponde al estado de la cuenta: el de la suspensión si está suspendida, el del levantamiento si no; dos consultas agrupadas, sin N+1) y `estadoPrevioSuspension` (solo si está suspendida). El listado sigue sin paginar. |
| `repositories/NotificacionRepository.java` | `findUsuarioIdsConUltimoEmailFallido(tipo)`. |
| Tests | `SuspensionClienteIntegrationTest` pasa de 24 a 30 tests (levantar inactiva, activa, bloqueada, pendiente, sin historial, y el listado con los dos campos nuevos); `AdministradorServiceResolucionTest` ajustado al constructor. |
| `testing/playwright/scripts/mutaciones-suspension-s1.mjs` | Mutaciones M16 a M19. |
| `testing/playwright/scripts/build-suspension-cliente-fase5s1-postman.mjs` | La carpeta `80` pasa de 54 a 69 requests (el listado con los campos nuevos y el caso de un Cliente bloqueado que se suspende y se levanta). |

### Frontend

| Archivo | Qué |
|---|---|
| `frontend/js/cuenta-suspendida.js` (nuevo) | La hoja inferior del login (`abrirHojaCuentaSuspendida`) y la pantalla completa de la sesión abierta (`mostrarPantallaCuentaSuspendida`). Sin dependencias de otros módulos; el motivo se escribe con `textContent`; foco atrapado. |
| `frontend/js/api.js` | `apiFetch` reconoce `401` o `409` con `data.codigo = CUENTA_SUSPENDIDA` (también con `handle401Globally: false`): limpia la sesión y muestra la pantalla completa. Exporta `CODIGO_CUENTA_SUSPENDIDA`. |
| `frontend/js/auth.js` | El login reacciona al código y no al texto del mensaje (se quitó la entrada `Cuenta suspendida` de `MENSAJES_LOGIN_CONFLICTO`). |
| `frontend/js/admin-clientes.js` (nuevo) | El listado de Clientes del Administrador (`initAdminClientes`, antes en `admin.js`): buscador, filtros, contador, menú de acciones, y los modales de suspender y levantar. El filtrado se hace en el cliente. |
| `frontend/js/admin.js` | Se quitaron `initAdminClientes`, `renderClienteAdminRow` y las tablas de estados de usuario. |
| `frontend/admin-clientes.html` | Importa `js/admin-clientes.js`. |
| `frontend/css/styles.css` | Clases `suspension-*`, `cliente-busqueda`, `cliente-filtros`, `cliente-contador`, `cliente-menu`, `cliente-modal__*` y los ajustes de `cliente-admin-row`. |

### Pruebas

`testing/playwright/tests/84-suspension-cliente-ui.spec.ts` (15 tests a 375 px) y las 8 capturas de `docs/capturas-suspension/`.

### Dónde va Soporte (tramo S4)

1. `frontend/js/cuenta-suspendida.js`, hoja del login: contenedor `acciones-cuenta-suspendida` (debajo de "Cerrar").
2. `frontend/js/cuenta-suspendida.js`, pantalla completa de sesión abierta: contenedor `acciones-sesion-suspendida` (junto a "Cerrar sesión").
3. `frontend/js/auth.js`: el banner de cuenta bloqueada o inactiva y el de "Tu comercio no está operativo" siguen diciendo "Contactá a soporte" en texto, sin botón.
4. En S3 (Dueño suspendido) se va a necesitar la misma hoja y pantalla: reutilizan `cuenta-suspendida.js`.

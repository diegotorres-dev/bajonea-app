# Mapeo de archivos — Fase 5, tramo S6, entrega A: inactivación automática por falta de uso (2026-11-05)

Backend, migración `V52`, proceso diario, reactivación y tests. Sin pantallas: la entrega B (aviso de cuenta inactiva en el login y lo que haga falta en la ficha del Administrador) usa la API de abajo; su descripción está en la sección "Entrega B" al final de este archivo.

## Qué hace

- Una vez por día (03:30, zona `America/Argentina/Ushuaia`) el sistema pasa a `INACTIVO` las cuentas `ACTIVO` cuyo último acceso es anterior a hace 3 meses calendario. Quedan exentas: el Administrador, las cuentas suspendidas, pendientes y bloqueadas, y toda cuenta con un pedido en curso (como comprador o, si es Dueño, en cualquiera de sus comercios). Un Dueño también cuenta como activo si alguno de sus comercios recibió un pedido (en cualquier estado) en los últimos 3 meses.
- Al inactivar a un Dueño, sus comercios `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE` pasan a `INACTIVO` (el estado que ya existía): salen del catálogo y no reciben pedidos. Los suspendidos por separado, los pendientes y los rechazados no se tocan.
- Reactivar: con usuario y contraseña (inicia sesión), con el código del email (flujo que ya existía), recuperando la contraseña o por el Administrador. Los comercios `INACTIVO` vuelven a `APTO_VENTA` o `APROBADO` según Mercado Pago y documentos.

## Decisiones

| Tema | Decisión |
|---|---|
| Cascada a comercios | Se reutiliza `EstadoComercio.INACTIVO` (ya existía y `AptitudVentaComercioService` ya sabía restaurarlo). La alternativa de derivar el estado desde la cuenta del Dueño en cada consulta tocaba decenas de consultas y pantallas. |
| Umbral | `fecha_ultimo_acceso < ahora - 3 meses` (estricto: exactamente 3 meses todavía no vence). Configurable con `inactividad.meses`. |
| Pedido en curso | Los 4 estados pagados que ya usan las suspensiones más `PENDIENTE_PAGO` (un pago puede entrar por el webhook). |
| Fecha de acceso | La escribe el login y `EstadoUsuarioService.cambiar` cuando el destino es `ACTIVO` (verificación, desbloqueo, reactivación, fin de suspensión): sin eso una cuenta recién desbloqueada se inactivaría esa misma noche. |
| Login de cuenta inactiva | Verifica la contraseña primero. Correcta: `409` con `data.codigo = CUENTA_INACTIVA` y el mismo texto de siempre (el frontend vigente lo reconoce por el texto). Incorrecta: mensaje genérico, cuenta el intento, nunca cambia el estado; a los 3 intentos responde "cuenta bloqueada, recuperá tu contraseña". |
| Recuperar la contraseña de una cuenta inactiva | La reactiva (como ya hacía) y ahora también restaura sus comercios. Antes los dejaba `INACTIVO`. |
| Empleados con el comercio inactivo | Lo ven en solo lectura: `INACTIVO` se suma a los estados accesibles; modificar es `409 COMERCIO_INACTIVO`, aceptar pedidos es `409 COMERCIO_SIN_OPERACION`. |
| Aviso previo | No hay (decisión de Diego). |

## Migración `V52__inactividad_cuentas.sql`

```sql
UPDATE `usuario` SET `fecha_ultimo_acceso` = NOW();

ALTER TABLE `usuario`
  MODIFY COLUMN `fecha_ultimo_acceso` datetime NOT NULL DEFAULT current_timestamp(),
  ADD KEY `idx_usuario_estado_ultimo_acceso` (`estado`, `fecha_ultimo_acceso`);

ALTER TABLE `sesion`
  MODIFY COLUMN `tipo_cierre` enum('MANUAL','AUTOMATICO','FORZADO','SUSPENSION','INACTIVIDAD') NULL;

ALTER TABLE `pedido`
  ADD KEY `idx_pedido_comercio_fecha_creacion` (`comercio_id`, `fecha_creacion`);
```

Nadie queda inactivo el día del despliegue (todos quedan con la fecha de la migración). Los usuarios nuevos nacen con la fecha de registro (`@PrePersist` de `Usuario`; las inserciones por SQL toman el `DEFAULT`). Los tipos de aviso `CUENTA_INACTIVADA` y `COMERCIO_INACTIVADO` ya estaban en el ENUM de `notificacion.tipo`.

## API

| Ruta | Quién | Qué |
|---|---|---|
| `POST /api/v1/auth/login` | público | Cuenta inactiva con contraseña correcta: `409` `data.codigo = CUENTA_INACTIVA`. |
| `POST /api/v1/auth/reactivar-cuenta/con-credenciales` | público (ruta exacta) | Body igual al del login. Reactiva e inicia sesión (`LoginResponseDTO`). Cuenta que no existe o no está inactiva: `401` genérico sin contar intentos. |
| `PUT /api/v1/administrador/cuentas/{usuarioId}/reactivar` | Administrador | `200` con `{usuarioId, estado}`; `409` si no está inactiva o es un Administrador; `404` si no existe. |
| `POST /api/v1/test/jobs/inactivacion-cuentas?ahora=` | perfil `test` | Corre la inactivación ya, síncrona, y devuelve `{candidatos, inactivadas, omitidas, conFalla}`. |
| `PUT /api/v1/test/usuarios/{id}/ultimo-acceso?meses=&dias=&fecha=` | perfil `test` | Fija el último acceso. |
| `PUT /api/v1/test/pedidos/{id}/envejecer-creacion?meses=&dias=` | perfil `test` | Retrocede la fecha de creación de un pedido. |

## Archivos nuevos

- `backend/src/main/resources/db/migration/V52__inactividad_cuentas.sql`
- `repositories/InactividadCuentaRepository.java` — la condición de elegibilidad (una sola) para armar la lista y para revalidar.
- `services/InactivacionCuentaService.java`, `InactivacionCuentaJob.java` — la corrida y el programa diario.
- `services/ReactivacionCuentaService.java` — único camino que saca una cuenta de `INACTIVO`; `ReactivacionCuentaAdminService.java` — el endpoint del Administrador; `dto/response/ReactivacionCuentaResponseDTO.java`.
- `exceptions/CuentaInactivaException.java`.
- Tests: `InactividadTestBase`, `InactivacionCuentaIntegrationTest` (23), `ReactivacionCuentaIntegrationTest` (16), `InactivacionCuentaConcurrenciaIntegrationTest` (5), `InactivacionCuentaPoolDiminutoIntegrationTest` (1), `InactividadHttpIntegrationTest` (7).
- `testing/playwright/scripts/build-inactividad-fase5s6-postman.mjs` — carpeta `91` de Newman.

## Archivos modificados

`Usuario` (columna obligatoria y `@PrePersist`), `TipoCierreSesion` (`INACTIVIDAD`), `EstadoUsuarioService` (fija el acceso al pasar a `ACTIVO`), `AuthService` (login, `reactivarConCredenciales`, reactivación por código y recuperación sobre `ReactivacionCuentaService`), `AptitudVentaComercioService` (`inactivarPorInactividad`), `AvisoCuentaService` (`avisarInactivacion`), `EmailService` (`enviarCuentaInactivada`), `ComercioRepository`, `ComercioActivoService` y `ConflictoComercioException` (solo lectura del equipo), `AuthController`, `AdministradorController`, `SecurityConfig`, `GlobalExceptionHandler`, `TestController`, `TestSupportService`, `application-test.properties`, `AuthServiceBloqueoComercioTest` y `AuthServiceColisionCodigoTest` (el constructor ganó un parámetro) y `27-multicomercio-tramo4-selector.spec.ts` (ver `docs/DECISIONES.md`).

## Configuración

| Propiedad | Por defecto | |
|---|---|---|
| `inactividad.meses` | 3 | Umbral. |
| `inactividad.tope-por-corrida` | 200 | Cuentas por corrida; el resto queda para la noche siguiente (se toman primero las de acceso más viejo). |
| `inactividad.cron` | `0 30 3 * * *` | Hora diaria. |
| `inactividad.job-habilitado` | `true` (`false` en el perfil `test`) | |
| `app.zona-horaria` | `America/Argentina/Ushuaia` | Zona del cron y del corte. |


# Entrega B: pantalla de cuenta inactiva y acción del Administrador (2026-11-05)

Frontend, dos ajustes mínimos de API, specs de Playwright, una carpeta de Newman y capturas. Sin migraciones.

## Qué hace

- **Login.** Cuando el login responde `409` con `data.codigo = CUENTA_INACTIVA`, en vez del aviso con el enlace por código se abre la pantalla completa "Tu cuenta está inactiva" (`js/cuenta-inactiva.js`): texto "Pasaron más de 3 meses…", botón principal "Reactivar mi cuenta", "Contactar a Soporte" (`soporte.html?tipo=NO_PUEDO_ENTRAR`) y "Volver a ingresar". Un Dueño ve debajo "Tus comercios": "{nombre} vuelve a estar disponible." o "{nombre} sigue suspendido. Si creés que es un error, escribinos." (Cliente y Empleado no ven la lista).
- **Reactivar.** Llama a `POST /auth/reactivar-cuenta/con-credenciales` con el usuario y la contraseña que la persona acaba de escribir. Esos valores viven solo en una variable en memoria del módulo (el campo de contraseña del login se vacía al abrir la pantalla) y se descartan al reactivar, al volver, con Escape y en `pagehide`. Mientras tanto el botón dice "Reactivando…" y los otros dos quedan deshabilitados (`aria-disabled` en el enlace de Soporte). Si anda bien: `setSesion`, toast pendiente "Cuenta reactivada. ¡Qué bueno verte de nuevo!" y el mismo `redirigirPostLogin` de un login normal (Cliente al inicio, Empleado al selector de contexto, Dueño al panel). Si falla: bloque `role="alert"` con el mensaje de la API y el foco; los botones se vuelven a habilitar.
- **Administrador.** En Clientes, "Reactivar cuenta" (solo con la cuenta `INACTIVO`) aparece en el menú junto a "Suspender cuenta". En Dueños hay un filtro nuevo "Inactivos" y la hoja de acciones suma "Reactivar cuenta". Las dos abren la misma hoja "Reactivar a {nombre}" (`js/admin-reactivar.js`): "Qué va a pasar" ("Podrá ingresar y comprar de nuevo." y "Se anota en su historial que la reactivaste vos."), para un Dueño el detalle "Se restablecen N de M comercios" (o "Se restablece N comercio" si vuelven todos) con "Vuelve" en cada uno y una caja aparte "Sigue suspendido — Se suspendió aparte. Hay que levantarlo desde su ficha." por cada suspendido aparte, "Reactivar cuenta" y "Cancelar". Éxito: toast "Cuenta reactivada" y la lista se actualiza. Error: el mensaje exacto de la API en un aviso fijo con foco; un `409` además recarga la lista. Si no se puede calcular el detalle, el aviso dice "… Igual podés reactivar la cuenta.".

## Cambios de API

| Ruta | Cambio |
|---|---|
| `POST /api/v1/auth/login` | El `409` `CUENTA_INACTIVA` suma `data.comercios`: lista de `{comercioId, nombre, estadoActual, resultado}` con `resultado` `VUELVE` (comercio `INACTIVO`) o `SIGUE_SUSPENDIDO` (comercio `SUSPENDIDO`); vacía si la cuenta no es de un Dueño. Solo con la contraseña correcta: con una incorrecta la respuesta es la de siempre, sin `comercios` ni `codigo`. |
| `GET /api/v1/administrador/cuentas/{usuarioId}/reactivar/previa` | Nueva, solo Administrador, solo lectura y sin bloqueos: `{usuarioId, rol, estadoActual, comercios}` con la misma lista. `409` para un Administrador, `404` si no existe. |

Los comercios pendientes, rechazados o en cualquier otro estado no se listan. `ComerciosAlReactivarService` arma la lista para los dos caminos.

## Archivos nuevos

- Backend: `dto/response/ComercioAlReactivarResponseDTO.java`, `dto/response/ReactivacionCuentaPreviaResponseDTO.java`, `services/ComerciosAlReactivarService.java`.
- Frontend: `js/cuenta-inactiva.js`, `js/admin-reactivar.js`; estilos al final de `css/styles.css` (`.cuenta-inactiva__error` y `.btn[aria-disabled='true']`; el resto reutiliza `suspension-pantalla`, `suspension-que-pasa` y `dueno-restauracion`).
- Tests: `testing/playwright/tests/98-cuenta-inactiva-login-ui.spec.ts`, `99-reactivar-cuenta-administrador-ui.spec.ts`, `testing/playwright/scripts/build-inactividad-fase5s6b-postman.mjs` (carpeta `92` de Newman, 34 requests, se corre después del constructor de la `91`).
- Capturas: `docs/capturas-inactividad/` (10 archivos a 375 px).

## Archivos modificados

`CuentaInactivaException` (suma la lista), `AuthService` (la pasa al lanzarla), `ReactivacionCuentaAdminService` (`vistaPrevia`), `AdministradorController`, `AuthServiceBloqueoComercioTest` y `AuthServiceColisionCodigoTest` (el constructor ganó un parámetro), `ReactivacionCuentaIntegrationTest` (+5 tests) e `InactividadHttpIntegrationTest` (+2). Frontend: `js/api.js` (`CODIGO_CUENTA_INACTIVA`), `js/auth.js` (abre la pantalla y ya no mapea el texto "Cuenta inactiva…" al enlace), `login.html` (sin el enlace "Reactivar mi cuenta"), `js/comercio.js` (el panel del Dueño consume el toast pendiente), `js/admin-clientes.js`, `js/admin-duenos.js` y `js/admin-dueno-suspension.js`.

## Decisiones

| Tema | Decisión |
|---|---|
| Qué queda sin uso | `reactivar-cuenta.html` y su lógica de `auth.js` (`initReactivarCuentaSolicitar`: pedir el código por email y confirmarlo) se conservan, junto con sus endpoints, pero ya no se llega desde el login; solo por la dirección directa. Los specs `02` y `10` que los ejercitan navegan por la dirección y siguen pasando. |
| Recuperar la contraseña | "Olvidé mi contraseña" ya reactivaba la cuenta inactiva y devolvía sus comercios (entrega A); el spec `98` lo comprueba de punta a punta con el Dueño que tiene un comercio suspendido aparte. |
| Soporte con el email cargado | No se pudo: el login solo conoce el nombre de usuario, no el email. `soporte.html?tipo=NO_PUEDO_ENTRAR` preselecciona el tipo y la persona escribe su email. |
| Sesión abierta de una cuenta inactivada | La inactivación cierra la sesión (`INACTIVIDAD`): la próxima petición responde `401` y `apiFetch` muestra el modal "Sesión cerrada" y lleva al login, sin errores. El texto del modal habla de "otro dispositivo", que no es exacto para este caso; en la práctica no se da (el token dura 24 h y la cuenta inactiva lleva más de 3 meses sin acceder). |
| Toast tras la redirección | Se guarda con `guardarToastPendiente` y lo muestra la pantalla de destino (`catalogo.js` para el Cliente, `selector-contexto.js` para el Empleado y, desde ahora, el panel del Dueño). |
| Hoja de Dueños | La hoja de acciones del Dueño muestra "Reactivar cuenta" como acción principal y "Suspender cuenta" como secundaria cuando la cuenta está inactiva. |


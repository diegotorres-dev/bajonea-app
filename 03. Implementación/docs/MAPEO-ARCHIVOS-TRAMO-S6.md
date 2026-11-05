# Mapeo de archivos — Fase 5, tramo S6, entrega A: inactivación automática por falta de uso (2026-11-05)

Backend, migración `V52`, proceso diario, reactivación y tests. Sin pantallas: la entrega B (aviso de cuenta inactiva en el login y lo que haga falta en la ficha del Administrador) usa la API de abajo.

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

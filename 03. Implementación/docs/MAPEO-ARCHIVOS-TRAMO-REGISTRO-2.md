# Mapeo de archivos: Registro de Comercio, Tramo 2 (2026-10-19)

Nombre único de comercio y disponibilidad en vivo. Plan en `docs/PLAN-FASE1-REGISTRO-TRAMO2.md`, avance en `docs/PROGRESO-TRAMO2.md`, decisiones en `docs/DECISIONES.md` (entrada del 2026-10-19).

## Entrega A: backend y tests (commit `aaef7a2`)

| Archivo | Cambio |
|---|---|
| `backend/src/main/resources/db/migration/V37__comercio_nombre_unico.sql` | Nuevo: columna generada `STORED` `comercio.nombre_unico` (`utf8mb4_unicode_ci`, `NULL` en `RECHAZO_DEFINITIVO`) con `UNIQUE KEY uq_comercio_nombre_unico` |
| `services/NombreComercioService.java`, `repositories/ComercioNombreRepository.java` | Nuevos: `estaDisponible`, `validar` y `consultarDisponibilidad`, con la misma expresión SQL que el índice |
| `services/ValidadorComercioDuplicado.java` | Borrado (el chequeo por dirección queda redundante) |
| `services/RegistroService`, `AltaComercioAdicionalService`, `ComercioCorreccionService`, `ComercioService`, `ComercioEdicionService` | Validan el nombre antes de escribir; `saveAndFlush` en el alta y en la edición |
| `exceptions/GlobalExceptionHandler.java` | Mapea `uq_comercio_nombre_unico` a `409` con el mismo mensaje |
| `controllers/AuthController`, `controllers/ComercioController`, `dto/response/DisponibilidadNombreComercioResponseDTO` | `GET /auth/comercio-nombre/disponibilidad` y `GET /comercios/nombre/disponibilidad` |
| `config/security/SecurityConfig`, `RateLimitPublicoFilter` | Ruta pública exacta y grupo `disponibilidad` (también el nombre de usuario) |
| Tests Java | `NombreComercioUnicoIntegrationTest`, `NombreComercioRateLimitIntegrationTest`, `RegistroComercioNombreConcurrenciaIntegrationTest`, `GlobalExceptionHandlerNombreComercioTest` y ajustes de siete clases existentes |
| `testing/playwright/tests/65-...-api.spec.ts`, `66-...-api.spec.ts` | Nuevos |
| `testing/playwright/scripts/build-nombre-comercio-*-postman.mjs`, `lib/postman-nombre-comercio.mjs`, `stress-locks-tramoNombreUnico.mjs` | Nuevos: carpetas 71 y 72 de Newman y estrés registrado como `nombre` en `correr-estreses.mjs` |

## Entrega B: frontend y tests de UI

| Archivo | Cambio |
|---|---|
| `frontend/js/form-utils.js` | `bindDisponibilidad` (genérico: contador de secuencia, cuatro estados, ícono) y `bindNombreComercio`; `bindNombreUsuario` pasa a ser una llamada a `bindDisponibilidad` con los mismos ids y textos; `MENSAJE_NOMBRE_COMERCIO_EN_USO`, `normalizarNombreComercio`; opción `reservarEspacio` para que la línea de estado no desplace el formulario |
| `frontend/js/comercio-form.js` | `initCamposNegocio({ foto, disponibilidad })`; `validar()` es asíncrono y espera la consulta; devuelve `marcarNombreEnUso` |
| `frontend/js/auth.js`, `agregar-comercio.js`, `comercio-corregir.js` | `await negocio.validar()`; el `409` del envío vuelve al paso del negocio con el error bajo el campo; en la corrección `PREFIJO_MENSAJE_DUPLICADO` se reemplazó por el mensaje exacto |
| `frontend/js/comercio.js` | Perfil del Dueño: `bindNombreComercio` con el id del comercio activo y su nombre original; el guardado espera la consulta y no envía el `PUT` si está ocupado; el `409` queda bajo el campo |
| `frontend/registro-comercio.html`, `agregar-comercio.html`, `comercio-corregir.html`, `comercio-perfil.html` | `icono-nombre`/`estado-nombre` (o `icono-editar-nombre`/`estado-editar-nombre`) junto al campo del nombre |
| `testing/playwright/tests/67-nombre-comercio-disponibilidad-ui.spec.ts` | Nuevo |
| `testing/playwright/tests/23-...-ui.spec.ts` | El duplicado exacto ahora se avisa en vivo y bloquea el paso 1 |
| `docs/DATA-TESTID-FASE17.md` | `estado-nombre-comercio` e `icono-estado-nombre-comercio` |

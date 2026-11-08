# Mapeo de archivos — Tramo 2A: reintentos seguros y auditoría de notificaciones (2026-11-07)

Dos partes. El bloque 1 es un arreglo de frontend que quedó abierto en el Tramo 1b (un reintento tras un corte puede duplicar un envío). El bloque 2 es una auditoría de solo lectura del sistema de notificaciones (`docs/AUDITORIA-NOTIFICACIONES.md`). Sin cambios de backend, sin migraciones y sin tocar ningún token de color. Pendiente de la confirmación de Diego.

## Qué hace

- **Cuatro envíos que pueden duplicar ya no ofrecen "Reintentar" ante un timeout.** Crear pedido (`POST /pedidos/cliente`), crear producto (`POST /productos`), cargar documento (`POST /comercios/documentos`) y la consulta nueva a Soporte (`POST /soporte/consultas` y `/soporte/publico/consultas`) pasan a `apiFetch` la opción `noIdempotente: { texto, enlace }`. Cuando la solicitud se envió y no hubo respuesta (el `AbortError` del tiempo de espera, 15 s; 180 s en la subida de documentos), `apiFetch` muestra el aviso "Se cortó la conexión. Puede que ya se haya enviado: revisá {destino} antes de volver a enviar." con un botón "Cerrar" de 44 px, y lanza un `ApiError` con `data.codigo = 'TIMEOUT_AVISADO'` para que quien llamó rehabilite el botón sin mostrar otro error. Los datos del formulario siguen en pantalla.
- **Un fallo inmediato de conexión y un 5xx no cambian** para esas mutaciones: crear pedido y crear producto siguen con el aviso celeste y "Reintentar" (modo `aviso`), y la subida de documentos y la consulta a Soporte siguen con el banner de error de su formulario (nunca usaron el aviso global).
- **Solo el timeout cambia.** Una mutación común (por ejemplo, editar el perfil) con timeout sigue ofreciendo "Reintentar".
- **Elección del enlace: pestaña nueva.** El destino es un enlace con `target="_blank"` y `rel="noopener"`. Razón: tres de los cuatro formularios son largos o tienen un archivo ya elegido (producto con foto recortada, documento, consulta de Soporte) y navegar en la misma pestaña perdería lo escrito. Sin JWT ni anchors `#` en las URLs. El pedido lleva a `pedidos.html`, el producto a `comercio-productos.html`, el documento a `comercio-documentacion.html` y la consulta con sesión a `mis-consultas.html`.
- **Consulta a Soporte sin sesión.** No hay lista a la que mandar a quien no tiene cuenta: el aviso dice "revisá tu email" sin enlace (la consulta recibida llega por email con su código). Es una desviación consciente del enunciado, que pedía el enlace a Mis consultas a Soporte.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/js/red-aviso.js` | `mostrarAvisoTimeout({ texto, enlace })` y `cerrarAvisoTimeout()`: aviso `role="alert"` (clase `aviso-red aviso-red--timeout`) con título, texto con el enlace de destino y botón "Cerrar"; devuelve el foco al elemento que lo tenía. |
| `frontend/js/api.js` | Opción `noIdempotente` de `solicitar`; ante `AbortError` y modo de red distinto de `silencioso`, muestra el aviso y lanza el `ApiError` marcado. `esTimeoutAvisado(error)` exportada. |
| `frontend/css/styles.css` | `.aviso-red__cuerpo`, `.aviso-red__titulo` y `.aviso-red__enlace` (el aviso reutiliza `.aviso-red` y `.aviso-red__reintentar` para el botón, ya de 44 px). |
| `frontend/js/checkout.js` | Pasa `noIdempotente` (Mis pedidos) y, ante el timeout avisado, rehabilita "Ir a pagar". |
| `frontend/js/comercio.js` | Idem para crear producto (Productos); el envío termina sin otro mensaje. |
| `frontend/js/documentos.js` | Idem para la subida (Documentación); la hoja de subida queda abierta con el archivo elegido. |
| `frontend/js/soporte.js` | Idem para la consulta nueva: Mis consultas a Soporte con sesión, "tu email" sin enlace sin sesión. |

## Pruebas

| Spec | Qué cubre |
|---|---|
| `107-reintentos-seguros-ui` (nuevo, 13 tests, 375 px) | Para crear pedido, crear producto y cargar documento: timeout (aviso con texto, enlace correcto con `target` y `rel`, "Cerrar" de al menos 44 px, sin "Reintentar", formulario intacto, sin scroll horizontal, y al cerrar vuelve a quedar usable), fallo inmediato de conexión y 503 (no aparece el aviso de timeout; crear pedido y producto ofrecen "Reintentar", la subida de documentos mantiene su banner). Consulta a Soporte con sesión (enlace a Mis consultas) y sin sesión (sin enlace), y su error de formulario ante fallo de conexión y 503. Editar el perfil con timeout sigue ofreciendo "Reintentar". |

Mutación comprobada: sacar `noIdempotente` del checkout hace fallar el test de timeout de crear pedido; los demás se detectan por el aviso que dejarían de mostrar.

## Documentación

`docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `docs/DATA-TESTID-FASE17.md`, `docs/codigo-actual.md`, `docs/entregables-01-02/CAMBIOS.md` y `docs/entregables-01-02/alcance-y-limitaciones.md` (la limitación del reintento pasa a decir que el timeout de esos cuatro envíos ya no se reintenta). La auditoría es `docs/AUDITORIA-NOTIFICACIONES.md`.

## Resultado de las corridas

- Chromium: specs `101`, `105`, `106`, `107`, `91` y `92` (79 tests), 79/79.
- WebKit (`playwright.webkit.config.ts`): 72 pasaron, 4 fallaron, 3 no corrieron. Los 13 tests del `107` y todo el `106` pasaron. `101:31` pasó al repetirlo. `105:26` (el toast de éxito ya no está a los 2,4 s) falla 3 de 3, `91:124` falla por `Unknown permission: clipboard-write` (limitación del spec en WebKit) y `92:289` no llega a `mis-consultas.html` desde la pantalla de sesión suspendida. Ninguno ejercita el código de este tramo, pero no se corrió una línea base sin los cambios para confirmarlo; quedan abiertos para Diego.

# Mapeo de archivos — Multi-comercio, tramo 5, Entrega B (Mercado Pago con varios comercios: frontend y tests de UI)

Fecha: 2026-10-03. Objetivo: llevar a pantalla las reglas del backend de la Entrega A: modal de desvinculación con la previa, bloqueo por pedidos sin pagar, lista de comercios en la cuenta de cobro, aviso en el panel "Tus comercios", resultados nuevos del callback y refresco inmediato. **Sin cambios de backend, migraciones ni Newman.**

## Frontend modificado

| Archivo | Por qué |
|---|---|
| `frontend/comercio-perfil.html` | Vista `view-mercadopago`: skeleton `mp-estado-cargando` mientras llega el estado de la cuenta; en el estado "sin vincular" el texto "Esta cuenta va a cobrar por todos tus comercios" y su lista; en el estado "vinculada" el texto "Esta cuenta cobra por todos tus comercios" y su lista. No se movió la vista de lugar. |
| `frontend/js/comercio.js` | Reemplaza `mostrarModalConfirmarDesvincularMp` por `abrirModalDesvincularMp` (skeleton → previa → confirmación o bloqueo → DELETE; los botones se deshabilitan durante la llamada; el DELETE `409` vuelve a pedir la previa y muestra el bloqueo; `404` refresca y avisa con el mensaje del servidor). Textos de los estados en curso (`TEXTO_PEDIDOS_EN_CURSO`), texto del bloqueo y hora HH:mm sacada de la cadena `puedeReintentarDesde` sin crear un `Date`. `cargarEstadoMercadoPago` con skeleton y lista de comercios operativos tomada de la memoria de `mis-comercios` (sin pedirla de nuevo). `actualizarCuentaMercadoPago` = estado de la cuenta + `refrescarComercios()`. Resultados del callback `exito`, `error`, `cuenta-en-uso`, `cuenta-ya-vinculada` con el mismo `showToast`. Parámetro nuevo `?vista=mercadopago` (abre la vista de la cuenta de cobro). `limpiarParametrosMercadoPago` quita `vinculacionMp` y `vista` de la URL con `history.replaceState` y conserva otros parámetros. |
| `frontend/js/selector-comercio.js` | Aviso "Vinculá Mercado Pago para empezar a vender" con el botón "Vincular cuenta" (va a `comercio-perfil.html?vista=mercadopago`) en el panel, entre el título y la lista. Se muestra mientras algún comercio operativo esté en `APROBADO`; sin botón de cierre; se repinta con cada refresco de `mis-comercios`. No está en la franja. |
| `frontend/js/api.js` | Opción nueva `conMensaje` de `apiFetch` (devuelve `{ mensaje, data }` en vez de solo `data`). Hace falta para mostrar el mensaje del servidor al desvincular. Sin cambios para los demás llamadores. |
| `frontend/css/styles.css` | Clases nuevas al final: `panel-comercios__aviso*`, `mp-esqueleto-linea*`, `mp-cuenta-alcance`, `mp-comercios-lista`, `desvincular-mp__*`. Reutiliza `.banner-warning`, `.banner__accion`, `.btn-secondary`, `.skeleton` y las variables existentes. |

## Tests

| Archivo | Por qué |
|---|---|
| `testing/playwright/tests/29-multicomercio-tramo5-ui.spec.ts` (nuevo, 15 tests) | Los ocho casos pedidos: aviso del panel y su desaparición al vincular sin esperar el polling; lista y textos de la cuenta de cobro; modal con pedidos en curso en varios comercios (singular/plural) y Cancelar sin DELETE; sin pedidos en curso con skeleton; bloqueo con HH:mm (uno y varios clientes) y desvinculación posible cuando vencen; confirmación con actualización inmediata; carrera entre la previa y el DELETE; `404` al abrir el modal; callback con los cuatro valores, el desconocido y la limpieza del parámetro; pedidos en curso que siguen su flujo. Reutiliza `backend.ts`, `multicomercio.ts` y `selector.ts`; no agrega helpers nuevos. |
| `testing/playwright/README.md` | Filas de los specs 28 y 29 y estado de la corrida. |

Ningún test existente afirmaba los textos viejos del modal ni de la pantalla de la cuenta, así que no hubo que ajustar los specs 21 a 24 ni los helpers.

## Documentación

`docs/DECISIONES.md` (entrada de la Entrega B), `docs/DATA-TESTID-FASE17.md` (sección del tramo 5B), `CLAUDE.md` §1bis y `docs/entregables-01-02/` (las copias de los cinco documentos de la Entrega A, más `CAMBIOS.md`; la Entrega B suma dos criterios a HU-D04 y dos reglas a los requisitos del Dueño, solo en esas copias).

## Deuda de la prueba en iPhone / WebKit (no corre en esta máquina)

- No se agregó ningún SVG nuevo: el ícono del modal es `ICONS.alert`, ya usado por el modal anterior, dentro de `.modal-sheet__icon`, que ya fija el tamaño del `svg` (el problema conocido de WebKit con SVG sin tamaño explícito).
- No se agregó ningún gesto táctil nuevo. La única navegación nueva es un toque simple en "Vincular cuenta" del aviso del panel, que cambia de página con `window.location.href`.
- Sin probar en WebKit: el layout del modal (`.modal-sheet` con el bloque de pedidos en curso, lista con `overflow-wrap`), el skeleton animado y el aviso del panel (`.banner` en columna dentro de `.panel-comercios`, que es un contenedor flex con `overflow: hidden`). Conviene mirarlos en un iPhone real, en especial con nombres de comercio largos y varios comercios con pedidos en curso.

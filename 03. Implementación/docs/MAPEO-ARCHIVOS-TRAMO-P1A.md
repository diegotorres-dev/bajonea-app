# Mapeo de archivos — Tramo P1a de pulido: hojas de decisión unificadas (2026-11-08)

Solo frontend, pruebas y documentación. Sin backend (salvo el ajuste de Newman del bloque 0), sin migraciones y sin tocar ningún token de color: el naranja de marca `#ff4700` se conserva y el rojo de acción destructiva es `--color-error` (`#d93025`, 4,78:1 con texto blanco). Pendiente de la confirmación de Diego.

Hallazgos de `docs/AUDITORIA-NIELSEN.md` que cierra: **T02** (comportamiento común), **T03** (botón destructivo), **T04** (contenido y color de las hojas de suspensión), **T05** (separación de botones), **T07** (la hoja no se cierra antes de enviar), **K02** (consecuencia de anular y rechazar) y **A04** (color del rechazo de comercio). El contraste del naranja (T08) quedó descartado por decisión de Diego.

## Qué hace

- **Un solo comportamiento de hoja (`js/hoja.js`).** `activarHoja({ fondo, hoja, … })` aplica a cualquier hoja `role="dialog"` y `aria-modal`, `Escape`, cierre por el fondo, foco inicial, foco atrapado con `Tab`/`Shift+Tab`, bloqueo del scroll de la página y devolución del foco al `disparador` (con un `alCerrar` para el respaldo). `abrirHoja({ titulo, texto, parrafos, contenido, aviso, detalle, acciones, testid, testids, disparador, clase })` arma la hoja completa encima de eso.
- **Acción asíncrona (T07).** Una acción con `alPulsar` deja la hoja abierta mientras dura el pedido: el botón dice "Enviando…" (o `etiquetaEnviando`) y se deshabilita junto con los demás botones y los campos; `Escape` y el fondo no cierran; si falla, el error aparece **dentro** de la hoja (`role="alert"`) y lo escrito se conserva; solo se cierra al éxito. `validar()` corre antes de enviar y deja el mensaje debajo del campo con el foco en él. `deshabilitadaSi()` mantiene deshabilitado el botón hasta que se cumpla una condición (casilla de confirmación, motivo escrito) y `refrescarAcciones()` lo reevalúa.
- **Campos propios de la hoja.** `campoSelect`, `campoTextarea` (con contador opcional) y `campoCasilla`, todos con `textContent` (nunca `innerHTML`), el error debajo del campo y `aria-invalid`/`aria-describedby`. `crearAviso` (borde gris, ícono y fondo de la hoja; sin amarillo) y `crearDetalle` ("Ver detalle" con `<details>` y `<summary>` de 44 px).
- **Botones (T03 y T05).** Una sola variante `btn-peligro` (fondo `--color-error`, texto blanco, `hover` y `disabled` propios) para lo que destruye o no se puede deshacer; `btn-primary` para las confirmaciones que no destruyen; "Volver"/"Cancelar" siempre secundario con borde (`hoja__accion--segura`), debajo de la acción y a 12 px (un `gap` único del pie). Sin estilos inline de color ni de margen en las hojas migradas.
- **Consecuencia de anular y rechazar (K02).** Ver "Texto de consecuencia" más abajo.
- **Rechazo de comercio (A04).** Los dos rechazos usan `btn-peligro`. El interruptor de rechazo definitivo agrega una línea de advertencia propia ("El rechazo definitivo no se puede deshacer.") y cambia el texto del botón a "Rechazar definitivamente".
- **Hojas de suspensión (T04).** Sin cajas amarillas, crema ni verdes: las cajas pasan a borde gris sin relleno. El detalle por comercio, por pedido o el motivo anterior va en un "Ver detalle" cerrado por defecto; lo visible es una frase. El pie (acciones) queda siempre visible y el cuerpo de la hoja hace scroll interno. Título y subtítulo separados por 8 px.

## Texto de consecuencia (K02) y qué se verificó en el backend

Verificado leyendo `PedidoService.rechazarPedido` y `anularPedido` y `ReembolsoService.generarNotaYReembolsarTotal` (solo lectura): rechazar es solo desde `PENDIENTE_CONFIRMACION_COMERCIO` y anular solo desde `EN_PREPARACION`; las dos generan la nota de crédito por el **total** del pago en la misma transacción del cambio de estado y piden el reembolso a Mercado Pago después del commit (con la cuenta del comercio desvinculada la nota queda en revisión manual del Administrador). El código **no fija un plazo** de acreditación: depende de Mercado Pago, por eso el texto no promete días y copia la frase que ya usa la hoja de cancelar del Cliente. Ambas notifican al Cliente con el motivo y el comentario.

- Título: "¿Rechazar el pedido #N?" / "¿Anular el pedido #N?".
- Texto: "El cliente recibe la devolución de todo el pago por Mercado Pago. Puede demorar en verse en su cuenta." y "Le avisamos el motivo y tu comentario." (esa segunda frase responde a la observación de K02 sobre que no quedaba claro que el cliente lee el comentario).
- Se mantuvieron el motivo (obligatorio, de la lista) y el comentario (opcional; obligatorio con "Otro").

## Inventario de hojas (45 apariciones de `modal-backdrop`: 41 en `js/`, 1 en `css/styles.css`, 1 en `hoja.js` y el resto son la misma hoja con dos usos)

| Clasificación | Hoja | Archivo | Estado |
|---|---|---|---|
| Destructiva | Vaciar carrito | `carrito.js` | **Migrada** (`abrirHoja`) |
| Destructiva + formulario | Rechazar pedido | `comercio.js` | **Migrada** |
| Destructiva + formulario | Anular pedido | `comercio.js` | **Migrada** |
| Destructiva | Cerrar como no retirado | `comercio.js` | **Migrada** |
| Destructiva + casilla | Descontinuar producto | `comercio.js` | **Migrada** (fuera de la lista mínima; mismo patrón que la renuncia) |
| Destructiva | Eliminar documento | `documentos.js` | **Migrada** |
| Destructiva | Eliminar dirección | `direcciones.js` | **Migrada** |
| Destructiva | Desactivar miembro del equipo | `equipo-comercio.js` | **Migrada** |
| Destructiva | Cancelar invitación | `equipo-comercio.js` | **Migrada** |
| Destructiva + casilla | Renuncia del Empleado | `renuncia-empleado.js` | **Migrada** |
| Destructiva + formulario | Rechazar comercio | `admin.js` | **Migrada** |
| Confirmación | Aprobar comercio | `admin.js` | **Migrada** |
| Confirmación | Cerrar sesión (Cliente, Dueño/Empleado, Administrador) | `cliente.js`, `comercio.js`, `admin.js` | **Migradas** (tres) |
| Destructiva, varios estados | Desvincular Mercado Pago | `comercio.js` | **Parcial:** usa `activarHoja` (diálogo, `Escape`, foco atrapado y devuelto), `btn-peligro` y pie con 12 px; no usa `abrirHoja` porque pasa por tres estados (esqueleto, bloqueo, confirmación) con cierre de comercios en el medio |
| Formulario (suspender/levantar) | Suspender y levantar: Dueño, comercio, Cliente (6) | `admin-dueno-suspension.js`, `admin-comercio-suspension.js`, `admin-clientes.js`, `admin-hojas.js` | **Rediseñadas (T04).** Ya tenían `Escape`, foco atrapado, error adentro y cierre solo al éxito (con `atraparFoco`); lo que cambia es el contenido, el color, el pie fijo y `btn-peligro`; `admin-hojas.js` normaliza los botones del pie |
| Formulario | Motivo de rechazo/revocación de documento | `admin-documentos.js` | Solo cambio de clase a `btn-peligro` (ya cumplía el comportamiento común) |
| Formulario | Cerrar consulta de Soporte; resolver reclamo; reactivar cuenta | `admin-soporte.js`, `admin-reclamos.js`, `admin-reactivar.js` | Reciben el pie fijo, `btn-peligro` y el estilo nuevo por `admin-hojas.js`; sin más cambios |
| Formulario | Invitar al equipo | `equipo-comercio.js` | **No migrada:** formulario con lógica propia de rechazo genérico y email bloqueado (tramo de escritorio) |
| Formulario | Confirmar contraseña para cambiar el nombre de usuario | `perfil-cuenta.js` | **No migrada:** lógica propia de intentos y bloqueo |
| Confirmación | Confirmar tarifa (A03), nueva tarifa | `admin.js` | **No migradas:** A03 es otro hallazgo (mostrar "Antes → Ahora") |
| Confirmación | Vas a pasar a tu cuenta personal | `comercio.js` | **No migrada:** informativa, sin riesgo |
| Confirmación | Confirmar salida con cambios sin guardar | `comercio-form.js` | **No migrada:** compartida por varios formularios |
| Confirmación | Cierre manual del comercio | `cierre-comercio.js` | **No migrada:** ya era el modelo (`Escape`, foco, `role="dialog"`) |
| Confirmación | Conflicto de comercio al agregar al carrito | `catalogo.js` | **No migrada:** informativa con dos caminos |
| Confirmación | Descartar cambios de dirección / documento | `direcciones.js`, `documentos.js` | **No migradas:** viven dentro de un formulario de pantalla completa |
| Informativa | Sesión cerrada / acceso perdido | `api.js` (dos) | **No migradas:** hojas bloqueantes sin acción alternativa |
| Informativa | Cuenta suspendida | `cuenta-suspendida.js` | **No migrada:** pantalla del login |
| Selector | Foto de perfil (Cliente y comercio), acciones de producto, menús de dirección/miembro/invitación, cambiar cuenta, panel de comercios, detalle de producto | `cliente.js`, `comercio.js`, `direcciones.js`, `equipo-comercio.js`, `selector-contexto.js`, `selector-comercio.js`, `catalogo.js` | **No migradas:** selectores y menús (tramo de escritorio) |
| Subida / edición | Subir documento, recorte de imagen, detalle de comercio, categoría, tag | `documentos.js`, `crop.js`, `admin.js` | **No migradas:** hojas de subida o edición con su propio flujo |

## Archivos

### Creados

| Archivo | Para qué |
|---|---|
| `testing/playwright/tests/115-hojas-decision-comunes-ui.spec.ts` | Comportamiento común de las hojas migradas (vaciar carrito, cerrar sesión, rechazar y anular pedido). |
| `testing/playwright/tests/116-hojas-suspension-contenido-ui.spec.ts` | T04: sin cajas amarillas, "Ver detalle", pie siempre visible y capturas. |
| `testing/playwright/scripts/lib/newman-resumen.cjs` | Corre Newman como biblioteca y escribe solo el resumen (bloque 0). |
| `docs/capturas-pulido-p1/` | Capturas a 375 px de las hojas de suspender y levantar, para que Diego las revise. No van en una lista de commit. |

### Modificados

| Archivo | Cambio |
|---|---|
| `frontend/js/hoja.js` | Reescrito: `activarHoja`, `abrirHoja` ampliado, `campoSelect`, `campoTextarea`, `campoCasilla`, `crearAviso`, `crearDetalle`. |
| `frontend/js/comercio.js` | Hojas de rechazar, anular, no retirado, descontinuar y cerrar sesión con `abrirHoja`; desvincular Mercado Pago con `activarHoja`; los callers dejan de atrapar el error y lo relanzan para que lo muestre la hoja. |
| `frontend/js/carrito.js`, `cliente.js`, `admin.js`, `documentos.js`, `direcciones.js`, `equipo-comercio.js`, `renuncia-empleado.js` | Hojas migradas a `abrirHoja` (ver inventario). |
| `frontend/js/admin-hojas.js`, `admin-dueno-suspension.js`, `admin-clientes.js`, `admin-comercio-suspension.js`, `admin-documentos.js` | T04: contenido, "Ver detalle", pie fijo, `btn-peligro`. |
| `frontend/css/styles.css` | `.btn-peligro` (rojo `--color-error`, `hover`, `disabled`), estructura de `.hoja` (cuerpo con scroll y pie), `.hoja__aviso`, `.hoja__detalle`, `.hoja__casilla`, `.hoja-decision` (pie fijo de las hojas de administración), cajas sin relleno. Se borraron `equipo-hoja__peligro`, `renuncia-hoja__peligro`, `renuncia-hoja__casilla`, `renuncia-hoja__error` y `desvincular-mp__confirmar`. |
| `testing/playwright/scripts/correr-newman.mjs` | Usa `newman-resumen.cjs` en vez del reporter JSON (bloque 0). |
| `testing/playwright/scripts/build-empleado-tramoE2-postman.mjs`, `postman/Bajonea-MVP.postman_collection.json` | `limiteRespuestaComercio` en la lista blanca de la carpeta 57 (bloque 0). |

## Pruebas

Cifras exactas, causa de cada fallo y specs existentes que cambiaron: `docs/DECISIONES.md`, 2026-11-08. Resumen: Chromium completo 1651 tests (1534 pasaron; los 37 fallos y los 80 sin correr fueron una pérdida de internet a mitad de la corrida y se repitieron en verde, salvo un ajuste del propio spec 116); WebKit de los specs 101 a 116 (UI): 117 pasaron, 1 omitido a propósito y 1 fallo real (foco al cerrar en Safari) ya corregido; Newman completo 5039 requests y 7663 assertions sin fallas.

Un hallazgo de WebKit cambió `hoja.js` después del diseño original: `activarHoja` guarda el último botón o enlace tocado y lo usa como disparador cuando `document.activeElement` es el `body` (en Safari un botón no recibe el foco al tocarlo).

## Hallazgos de la auditoría

- **Resueltos:** T02 (en las hojas migradas; las demás quedan en la lista de arriba), T03, T04, T05, T07, K02 y A04.
- **Abiertos (otros tramos):** T08 descartado por Diego; T09, T12, T13, T15, T16 y K05 (P1b); T10 y T11 (escritorio); K03 (diferido por Diego); A03 (confirmación de tarifa). Los botones secundarios con borde rojo asignado inline en las páginas de detalle (`Rechazar pedido`, `Anular pedido`, `Rechazar` del Administrador) siguen con `style` inline: no son hojas y quedan para P1b.

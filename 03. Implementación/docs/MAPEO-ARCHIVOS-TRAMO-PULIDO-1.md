# Mapeo de archivos — Tramo 1 de pulido: correcciones graves de usabilidad (2026-11-07)

Solo frontend y pruebas. Sin migraciones, sin tablas nuevas y sin cambios de backend. Parte de `docs/AUDITORIA-NIELSEN.md` (2026-11-07) y resuelve C01, C02, C03, T01, K01 (parcial, ver más abajo), T06, T14 y T17, más el sonido de avisos que pidió Diego. Pendiente de la confirmación de Diego.

## Qué hace

- **Hoja de confirmación (C01 y C02).** "Cancelar pedido" y "Confirmar que recibí mi pedido" del Cliente ya no actúan de un toque: abren una hoja con la consecuencia. Cancelar un pedido pagado dice cuánto se devuelve ("Ya lo pagaste. Si lo cancelás, te devolvemos los $X a Mercado Pago…", X es el total real); sin pagar dice que no se cobra nada. La hoja sigue abierta mientras dura el envío ("Cancelando…"), muestra el error del servidor adentro y se cierra sola al éxito con el toast. El foco inicial va a "Volver", `Escape` y tocar el fondo cierran (salvo mientras se envía), el foco queda atrapado y vuelve al botón que la abrió.
- **Red (T01).** Los sondeos y lecturas de fondo no redirigen nunca a `errores/*.html`: fallan en silencio y, a la segunda falla seguida, aparece una franja fina "Sin conexión · reintentando…" bajo la cabecera que se va sola al recuperarse. Una acción del usuario (guardar, enviar, confirmar, cancelar) sin red, con timeout o con 5xx no navega: muestra un aviso celeste "Sin conexión. No perdiste nada: tus datos siguen acá." con "Reintentar" (44 px) que repite la misma llamada. La página de error a pantalla completa queda para la primera carga de una pantalla.
- **Panel del comercio (K01).** El panel y la lista de pedidos se recargan solos en cada ciclo de 15 s (solo con la pantalla visible, sin repintar si nada cambió). Un pedido que entró desde que se abrió la sesión del comercio lleva la etiqueta "Nuevo" y fondo suave hasta que se abre su detalle (`sessionStorage` por comercio). "Vence en N minutos" / "Respondé antes de 30 minutos" están implementados pero **apagados hasta que el backend mande el límite** (ver preguntas abiertas).
- **Sonido de avisos.** Un "ding" corto generado con Web Audio suena cuando el sondeo de la campana detecta un aviso no leído más nuevo (por id, no solo por contador) en el Cliente, el Dueño y el Empleado; no suena por los avisos que ya estaban al cargar. Interruptor "Sonido de avisos" (encendido por defecto, `localStorage`) en el perfil del Cliente, en el perfil del comercio (Dueño y Empleado) y en el panel del comercio; todos controlan la misma preferencia. Con el audio bloqueado por el navegador se explica y hay "Activar sonido".
- **Toast (T06).** Éxito 2,5 s; error 7 s con `role="alert"` y botón de cierre de 44 px; se pausa con el mouse, el foco o el toque; uno por vez.
- **Sesión terminada (T17).** El `401` ya no dice "iniciaste sesión en otro dispositivo": "Tu sesión terminó. Iniciá sesión de nuevo." El modal tiene `role="dialog"`, foco en el botón y `Escape` lleva al login.
- **Ayuda (T14).** Fila "Ayuda" ("Preguntas frecuentes, consultas y términos") en los perfiles del Cliente, el Dueño y el Empleado, que abre `ayuda.html`. El Administrador no la tiene (la pantalla lo manda a su panel).
- **Detalle del pedido del Cliente (C03).** El sondeo corre mientras el pedido no esté en un estado final y la pantalla esté visible.

## Archivos nuevos

| Archivo | Para qué |
|---|---|
| `frontend/js/hoja.js` | Helper `abrirHoja({ titulo, parrafos, acciones, testid })`: `role="dialog"`, `aria-modal`, foco inicial en la acción marcada `inicial`, `Escape`, fondo, trampa de foco, devolución del foco, estado de envío y error adentro. Solo lo usan las dos hojas nuevas; las existentes no se migraron. |
| `frontend/js/red-aviso.js` | Franja "Sin conexión" (`registrarFalloSegundoPlano` / `registrarExitoSegundoPlano`), aviso con "Reintentar" (`esperarReintento`) y `FalloRecuperable`. No importa nada. |
| `frontend/js/sonido-avisos.js` | Preferencia, `AudioContext`, `reproducirDing`, desbloqueo con el primer `click`/`keydown` y `vigilarAvisos(clave, noLeidas)`. |
| `frontend/js/sonido-interruptor.js` | Componente `crearInterruptorSonido()` (reutiliza `.cierre-card` y `.cierre-switch`). |
| `frontend/js/pedidos-nuevos.js` | Línea base, "Nuevo", pedidos vistos y texto de vencimiento. |
| `frontend/ayuda.html`, `frontend/js/ayuda.js` | Pantalla de Ayuda. |
| `testing/playwright/tests/101` a `105` | Specs nuevos (ver abajo). |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/js/api.js` | `apiFetch` se parte en un envoltorio y `solicitar`. Opción nueva `segundoPlano`. Modos de falla por llamada: `silencioso` (segundoPlano), `lanzar` (`handle…Globally: false` explícito, como siempre), `aviso` (mutaciones sin opción explícita) y `redirigir` (lecturas, como siempre). Modal de sesión terminada con texto neutro, `role="dialog"`, foco y `Escape`. |
| `frontend/js/pedidos.js` | Cancelar y confirmar recepción abren la hoja; el sondeo del detalle corre hasta un estado final y compara una firma (estado, pago, comercio no disponible, reembolso). |
| `frontend/js/catalogo.js` | `showToast` nuevo; `renderTopBar` suma `destinoVolver`; campana del Cliente con sondeo cada 15 s y detector de sonido. |
| `frontend/js/comercio-activo.js` | `refrescarComercios(opciones)`; el sondeo pasa `segundoPlano`; el detector de sonido toma el contador del comercio activo. |
| `frontend/js/comercio.js` | Panel y lista con recarga automática, "Nuevo", vencimiento y detalle que marca el pedido como visto; interruptor de sonido en panel y perfil; la fila Ayuda del Empleado entra en su lista. |
| `frontend/js/notificaciones.js` | El sondeo de la lista pasa `segundoPlano`. |
| `frontend/js/cliente.js` | Interruptor de sonido en el perfil. |
| `frontend/perfil.html`, `frontend/comercio-perfil.html`, `frontend/comercio-dashboard.html` | Fila Ayuda y `sonido-slot`. |
| `frontend/css/styles.css` | `.hoja*`, `.aviso-red*`, `.franja-sin-conexion`, `.sonido-avisos*`, `.pedido-card--nuevo`, `.etiqueta-nuevo`, `.pedido-card__vence`, `.toast__cerrar`, `.toast__texto`, `.profile-link__bloque`, `.profile-link__leyenda`. |
| `testing/playwright/tests/41-…`, `86-…` | Después de "Cancelar pedido" hacen clic en `btn-confirmar-cancelar-pedido`. |

## Decisiones no previstas

1. **Qué llamadas usan el aviso y cuáles redirigen.** Toda mutación (`method !== 'GET'`) sin opción explícita usa el aviso; las lecturas siguen redirigiendo, porque una lectura que falla es casi siempre la primera carga. Las llamadas con `handleRedGlobally: false` o `handle5xxGlobally: false` explícitos conservan su comportamiento (los 25 módulos que ya lo pasan no cambian).
2. **"Reintentar" no devuelve el control al código que llamó.** La promesa de `apiFetch` queda pendiente mientras el aviso está visible y se resuelve cuando el reintento anda, así que ningún sitio de llamada cambió y el botón de la pantalla sigue en "Enviando…". Limitación: ante un *timeout* de una mutación no idempotente, el primer pedido pudo haber llegado al servidor; reintentar podría duplicarlo (lo que se hace hoy con cualquier doble toque). Los pedidos y pagos tienen sus propias protecciones.
3. **5xx en una acción.** El texto es "Algo falló de nuestro lado. No perdiste nada: tus datos siguen acá." (el de "Sin conexión" no sería cierto), con el mismo botón.
4. **La campana del Cliente no tenía sondeo.** Se consultaba una sola vez al abrir. Se agregó un sondeo de 15 s (mismo intervalo que el resto), que además actualiza el punto de la campana sin recargar. Solo corre en las pantallas que dibujan la campana.
5. **El Administrador no tiene campana ni perfil**, así que no hay sonido ni interruptor para ese rol (la regla de "todos los roles con campana" lo cubre).
6. **Detector de sonido.** Cada sondeo trae un contador; solo si cambia (y no es cero) se pide `GET /notificaciones` y se compara el id más nuevo sin leer con el último visto. Un aviso nuevo que llega justo cuando se lee otro (contador igual) no suena. El detector arranca con el comercio ya resuelto: la primera versión tomaba la línea base en el primer sondeo y se tragaba lo que llegara en los primeros 15 s (lo encontró el spec).
7. **Desbloqueo del audio.** Se escucha `click` y `keydown` en captura, no `pointerdown`: con `pointerdown`, apretar "Activar sonido" ocultaba la ayuda antes del `click` y el botón no llegaba a actuar (lo encontró el spec).
8. **"Nuevo".** La línea base es la lista de ids al primer abrir el panel, la lista o un detalle del comercio en la pestaña (`sessionStorage`, por comercio, con respaldo en memoria si el almacenamiento falla). Un pedido "entra" si su id no estaba en esa lista y no se abrió su detalle.
9. **Rojo de la hoja.** Se usa `--color-error` (`#d93025`): 4,78:1 con texto blanco, no hizo falta una variante más oscura. El texto del error dentro de la hoja usa `#a6221a` sobre el fondo de error (6,4:1) porque `--color-error` sobre su fondo da 4,1:1.
10. **`Escape` en el modal de sesión terminada** lleva al login (no hay otra cosa útil que hacer con la sesión borrada), igual que la hoja de acceso perdido.
11. **Numeración de specs.** El prompt decía que el siguiente libre era el `100`, pero ya existía `100-textos-legales-ui`; los nuevos son `101` a `105`.
12. **Ayuda del Dueño.** La sección del perfil del Dueño ya se titula "Ayuda" (tenía "Mis consultas a Soporte"), así que ahora hay un título "Ayuda" con una fila "Ayuda" adentro. Es redundante; lo dejé así para no tocar el título.
13. **Toast.** Se agregaron `data-testid="toast-exito"` / `toast-error`; la clase `.toast` y el resto se conservan.

## Hallazgos de `AUDITORIA-NIELSEN.md`

**Resueltos:** C01, C02, C03, T01, T06, T14, T17.

**Resuelto en parte:** K01. El panel y la lista se actualizan solos y marcan "Nuevo"; el sonido cubre el aviso fuera de la pantalla. Falta que el backend mande el límite de respuesta para mostrar "Vence en N minutos".

**Siguen abiertos** (fuera de este tramo): T02, T03, T04, T05, T07 (las hojas existentes), T08 (contraste del naranja, decisión de Diego), T09, T10, T11, T12, T13, T15, T16, K02, K03, K04, K05, C04, C05, C06, P01 a P04, A01 y el resto de la lista que no figura arriba.

## Pruebas

Ver `docs/DECISIONES.md` (entrada del 2026-11-07) para los números de la corrida.

| Spec | Tests | Qué cubre |
|---|---|---|
| `101-red-errores-ui` | 4 | T01: guardado sin red y con 503 no navegan, "Reintentar" repite; sondeo sin red no navega y la franja aparece a la segunda falla y se va sola; 503 en la campana del Cliente. Falla con el código anterior (navegaba a `errores/sin-conexion.html`). |
| `102-hoja-confirmacion-pedido-ui` | 7 | C01 y C02: texto con el total real, pedido sin pagar, foco inicial, `Escape`, fondo, trampa de foco, error dentro de la hoja, envío en curso, recepción. |
| `103-panel-comercio-nuevos-ui` | 5 | K01: "Nuevo" en el panel y en la lista sin recargar, sin repintar si no hay cambios, desaparece al abrir el detalle, pedidos previos sin etiqueta, "Vence en N minutos" con el límite simulado y sin cuenta inventada si falta. |
| `104-sonido-avisos-ui` | 7 | Sonido del Cliente y del Dueño (no suena por lo previo ni sin cambios), interruptor persistente y compartido, sonido apagado, audio bloqueado. |
| `105-toast-sesion-ayuda-ui` | 13 | T06 (duración, alerta, cierre, pausa, uno por vez), T17, T14 en los tres roles y el Administrador, C03. |

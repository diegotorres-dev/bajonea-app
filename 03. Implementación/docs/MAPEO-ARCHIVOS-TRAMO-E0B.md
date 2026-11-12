# Mapeo de archivos — Interfaz de escritorio, tramo E0b: pantallas de acceso como app de escritorio (2026-11-08)

Solo frontend y pruebas. Sin cambios de backend, de colores ni de la versión móvil. Reemplaza la composición de las pantallas de acceso del tramo E0 (`docs/MAPEO-ARCHIVOS-TRAMO-E0.md`), que Diego rechazó: "no me sirve tener la interfaz de mobile solamente más grande, tiene que parecer una app nativa de escritorio".

## Regla de oro (para este y todos los tramos de escritorio)

Una pantalla de escritorio no es la pantalla móvil con más ancho. Antes de dar por cerrada una página se mira su captura a 1440 px y se comprueba:

1. ¿Hay una columna única de contenido apilado con grandes vacíos a los costados? Fallo.
2. ¿Los campos y botones ocupan todo el ancho de una columna angosta, como en el celular? Fallo (los campos se agrupan en dos columnas y los botones tienen su ancho natural, a los extremos o a la derecha).
3. ¿Barra de navegación inferior, encabezado de celular u hoja pegada abajo? Fallo.
4. ¿Aprovecha el ancho con una composición propia (panel de marca, pasos al costado, columnas, tablero)? Debe hacerlo.
5. ¿Hay hover, foco visible y se puede completar todo con teclado? Debe haberlo.
6. ¿La captura se parece al mockup? Debe parecerse.

## Bloque 0: diagnóstico del estado anterior (E0)

Capturas `antes-*` en `docs/capturas-escritorio-e0b/` (30 imágenes, 1440 px). Las 20 pantallas de acceso fallaban así:

| Pantallas | Puntos que fallaban |
|---|---|
| `login`, `verificar-email`, `recuperar-password`, `reactivar-cuenta`, `invitacion-empleado`, `soporte` | 1 (una sola columna de 480 px con 480 px vacíos a cada lado), 2 (campos y botón a todo el ancho de la tarjeta), 3 (cabecera blanca de celular), 4 (sin composición propia), 6 |
| `bienvenida` | 4 y 6 (logo a la izquierda y acciones a la derecha, pero dentro de una tarjeta con borde y sombra, sin ocupar la ventana) |
| `registro-cliente`, `registro-comercio` (4 pasos) | 1 (tarjeta de 720 px), 2 (barra de progreso de celular dentro de la tarjeta, botón "Continuar" a todo el ancho), 3 (flecha de volver de celular), 4, 6 |
| `registro-tipo-cuenta` | 2 (tarjetas de 330 px con chevron de lista de celular), 4, 6 |
| `seleccionar-contexto`, `terminos`, `privacidad`, `faq`, `soporte-consulta` | 1 (columna única), 4 (sin índice ni columnas), 6 |
| `errores/*`, `splash` | 1, 3, 4, 6 |
| Hoja de cuenta suspendida | 520 px en lugar de los 560 px del mockup |

## Qué se hizo

- **Pantalla partida** (`app-shell--acceso`): `login`, `bienvenida`, `verificar-email`, `recuperar-password`, `reactivar-cuenta`, `invitacion-empleado`, `soporte`, los 6 `errores/*` y `splash`. Panel naranja `#ff4700` a la izquierda (logo blanco de 40 px, titular de 48 px, bajada de 20 px y enlaces legales abajo; fijo al desplazarse) y columna blanca de 640 px (560 px entre 1024 y 1199 px) con el formulario centrado, de 420 px como máximo. Sin cabecera de celular. Los campos usan radio de 14 px. En las pantallas de error el panel lleva el código o el mensaje grande y las acciones quedan a la derecha con su ancho natural. En `invitacion-empleado` se conserva el botón de volver (arriba a la izquierda de la columna del formulario) porque esa pantalla tiene tres vistas.
- **Asistente con pasos al costado** (`app-shell--asistente`): `registro-comercio` (4 pasos) y `registro-cliente` (2 pasos). Cabecera de 72 px (logo, separador, título y "Salir del registro" de 44 px a la derecha), contenedor de 1280 px con la tarjeta "Tu avance" de 300 px (fija al desplazarse; número en círculo, activo con fondo `#fff1ea` y círculo naranja, completados con tilde, pendientes en gris, nota "Podés volver a un paso anterior sin perder lo que cargaste.") y la tarjeta de contenido (título de 32 px, foto de perfil en fila con círculo de 96 px, campos en grilla de 2 columnas con la descripción, la calle y la localidad a todo el ancho, modalidades de entrega como dos interruptores lado a lado) y, al pie, un separador con "Cancelar" (paso 1) o "Atrás" (pasos siguientes) a la izquierda y "Continuar" de ancho natural a la derecha.
- **Otras**: `registro-tipo-cuenta` (dos tarjetas de 470 px lado a lado con icono, título, descripción y botón), `seleccionar-contexto` (cabecera de 72 px y grilla de tarjetas), `terminos`, `privacidad` y `faq` (índice lateral fijo de 280 px y columna de texto de 720 px, sin tarjeta flotante), `soporte-consulta` (conversación a la izquierda y datos de la consulta a la derecha en 320 px) y la hoja de cuenta suspendida (diálogo de 560 px).

## Archivos nuevos

| Archivo | Qué es |
|---|---|
| `frontend/js/pasos-laterales.js` | `montarPasosLaterales(progreso)` arma la lista lateral a partir de las etiquetas de la barra de progreso y la sincroniza con un `MutationObserver`; `enlazarPasoAtras(fn)` enlaza los botones "Atrás" |
| `testing/playwright/tests/124-escritorio-partida-ui.spec.ts` | 27 tests `@escritorio` de la pantalla partida |
| `testing/playwright/tests/125-escritorio-asistente-y-paginas-ui.spec.ts` | 23 tests `@escritorio` del asistente, las tarjetas, el índice legal y la consulta de soporte |
| `docs/capturas-escritorio-e0b/` | Capturas `antes-*` y `despues-*` a 1440 px (no van al commit) |
| `docs/MAPEO-ARCHIVOS-TRAMO-E0B.md` | Este documento |

## Archivos modificados

- **`frontend/css/escritorio-acceso.css`**: reescrito (las clases `app-shell--ancho` y `app-shell--partido` del E0 ya no existen; `agregar-comercio` y `comercio-corregir` nunca las usaron).
- **HTML** (22): `login`, `bienvenida`, `verificar-email`, `recuperar-password`, `reactivar-cuenta`, `invitacion-empleado`, `soporte` y `errores/*` (6): clase `app-shell--acceso` y `<aside class="panel-marca" hidden>` después de `</main>`. `registro-comercio` y `registro-cliente`: `app-shell--asistente`, enlace "Salir del registro" (`hidden`) en la cabecera; `registro-comercio` además envuelve cada botón de paso en `.acciones-paso` con su botón "Cancelar" o "Atrás" y marca `nombre` y `descripcion` como `field--ancha`. `registro-tipo-cuenta` (`app-shell--tarjetas` y un botón decorativo `hidden` en cada tarjeta), `seleccionar-contexto` (`app-shell--contexto`), `soporte-consulta` (`app-shell--consulta`), `terminos`, `privacidad` y `faq` (`app-shell--legal`), `splash` (panel de marca).
- **JS**: `cliente-form.js` (`construirAccionesPaso`, opción `accionCancelar`, `montarPasosLaterales`, foto con `field--centrado`), `auth.js` (pasos laterales y "Atrás" en el registro de comercio; `accionCancelar` en el de cliente), `legal.js` (índice lateral).
- **Pruebas**: `121` y `122` (aserciones de la composición anterior: tarjeta de 480 y 720 px, `.landing-hero`, columna del selector de contexto, ancho de la hoja de cuenta suspendida).

## Decisiones no previstas

1. **Pasos laterales generados en JavaScript** a partir de las etiquetas existentes. El número en círculo no se puede obtener con CSS puro sin cambiar la versión móvil (el texto es "1. Negocio" y los tests lo comprueban), y envolver el número en un `span` hubiera cambiado el color del texto móvil. Ver `docs/APRENDIZAJES-TECNICOS.md`.
2. **`hidden` en contenedores sin `display`** para los elementos que solo existen en escritorio (un `hidden` directo sobre un `.btn` no funciona). Por eso cada botón "Cancelar" o "Atrás" va dentro de `.acciones-paso__secundaria[hidden]`.
3. **El pie legal de las pantallas partidas está dentro del panel** (`panel-legal-*`); el `legal-pie` original sigue en el HTML y se oculta. Duplica tres enlaces en el DOM, pero solo se muestra uno.
4. **"Atrás" en los pasos 2 a 4** (el mockup dice "Cancelar"): cancelar en un paso intermedio sería ambiguo (¿se pierde lo cargado?). "Cancelar" queda en el paso 1 y sale del registro.
5. **Columna de 560 px entre 1024 y 1199 px** (640 px desde 1200): con 640 px fijos a 1024 px el panel de marca queda en 384 px y el titular no entra.
6. **`soporte-consulta`** (acceso a la consulta sin sesión) es un formulario corto: se limita a 520 px; solo la conversación usa las dos columnas.
7. **Contraste:** blanco sobre `#ff4700` da 3,3:1. Cumple para el texto grande del panel y no para los enlaces legales de 14 px (subrayados y en negrita). Es una consecuencia de la paleta aprobada.
8. **Funciones no pedidas:** ninguna. Se agregaron el índice lateral de los textos legales y la nota "Podés volver…" porque están en el mockup.

## Pendiente (fuera de alcance, para E1)

`agregar-comercio.html` y `comercio-corregir.html` usan el mismo patrón de pasos pero no tienen shell de escritorio (nunca lo tuvieron); se hacen en E1 con el Dueño. Las pantallas de Cliente, Dueño, Empleado y Administrador siguen con la tarjeta de 460 px.

## Regla de oro: veredicto por pantalla (capturas `despues-*` a 1440 px en `docs/capturas-escritorio-e0b/`)

Puntos 1 a 6 de la regla. "Pasa" = cumple los seis; las observaciones no cambian el veredicto.

| Pantalla | Captura | Veredicto |
|---|---|---|
| `bienvenida` | `despues-01-bienvenida.png` | Pasa. Panel de marca y tres acciones de 420 px a la derecha (en la pantalla partida el botón a todo el ancho es lo que pide el mockup). |
| `login` y error | `despues-02-login.png`, `despues-03-login-error.png` | Pasa. Titular y bajada acordados, formulario de 420 px, botón de 52 px y enlaces de 44 px. |
| `registro-tipo-cuenta` | `despues-04-tipo-cuenta.png` | Pasa. Dos tarjetas lado a lado con icono, título, descripción y botón. |
| `registro-cliente` (2 pasos) | `despues-05-...paso1.png`, `despues-06-...paso2.png` | Pasa. Pasos al costado, foto en fila, grilla de 2 columnas, calle y localidad a todo el ancho, "Cancelar/Atrás" y "Crear mi cuenta" en los extremos. |
| `registro-comercio` (4 pasos) | `despues-07` a `despues-11` | Pasa. Mismo patrón; el paso 2 tiene un hueco al lado del teléfono personal (cantidad impar de campos) y no se inventó un campo para llenarlo. |
| `verificar-email` | `despues-12-verificar-email.png` | Pasa. |
| `recuperar-password` | `despues-13-recuperar-password.png` | Pasa. |
| `reactivar-cuenta` | `despues-14-reactivar-cuenta.png` | Pasa. |
| `invitacion-empleado` | `despues-15-invitacion-empleado.png` | Pasa, con una observación: conserva una barra mínima con el botón de volver (la pantalla tiene tres vistas). |
| `terminos`, `privacidad`, `faq` | `despues-16`, `despues-17`, `despues-17b` | Pasa. Índice lateral fijo y columna de texto; el pie de enlaces legales queda en fila. |
| `soporte` | `despues-18-soporte.png` | Pasa. |
| `soporte-consulta` | `despues-19-soporte-consulta.png` | Pasa. La captura muestra solo el formulario de acceso (520 px); la conversación con los datos a la derecha la verifica el spec `125` con una respuesta simulada, sin captura. |
| `errores/*` (6) | `despues-20` a `despues-25` | Pasa. Código o mensaje grande a la izquierda, acciones con ancho natural a la derecha. |
| Hoja de cuenta suspendida | `despues-26-hoja-cuenta-suspendida.png` | Pasa. Diálogo de 560 px sobre fondo oscuro. |
| `seleccionar-contexto` | `despues-27-seleccionar-contexto.png` | Pasa con observación: con dos cuentas la grilla es corta y queda mucho espacio libre debajo; es el contenido real de la pantalla. |
| `splash` | `despues-28-splash.png` | Pasa. Es transitoria (900 ms); panel de marca y barra de progreso a la derecha. |

## Cómo se demostró que la móvil no cambió

- **78 instantáneas** (26 páginas y estados × 375, 390 y 700 px; `testing/playwright/tmp-capturas/instantaneas-mobile.mjs`) tomadas con el árbol de trabajo comparadas contra las del estado anterior al tramo (`mobile-base`): **0 diferencias de píxeles** en las 78, dos veces (antes y después del último ajuste de `cliente-form.js`).
- El spec `123` (27 tests de la versión móvil) pasa en Chromium (390 px) y en WebKit (iPhone 13).
- Todo el CSS nuevo está dentro de `@media (min-width: 1024px)` y se carga con `<link media>`; los elementos nuevos del HTML llevan `hidden` en un contenedor sin regla `display` móvil (specs `124` y `125` lo verifican a 390 px: el panel de marca, los pasos laterales, el índice lateral, "Salir del registro", "Cancelar" y los botones decorativos no se muestran).

## Pruebas

- **Específicas** (proyecto `escritorio`, 1440×900): `121` 38, `122` 8, `124` 27 y `125` 23 tests (96 en total), más `123` en Chromium (27): `121` a `125` dan 123/123 en la última corrida. Cubren estructura (panel, pasos laterales, índice), medidas (panel de 800 px, columna de 640 px, formulario de 420 px, botón de 52 px, enlaces de 44 px, columna de pasos de 300 px, índice de 280 px, columna de texto de 720 px, datos de la consulta de 320 px), sin scroll horizontal a 1024, 1280, 1440 y 1920 px, orden de tabulación del login (formulario, enlaces y después los enlaces legales), `Enter` que envía, foco visible, hover, recorrido real del asistente (activo y completados, "Atrás" sin perder lo cargado) y los recorridos de `122` (login, registro de Cliente, registro de Comercio, recuperación, invitación de Empleado y selector de contexto).
- **Corrida completa** (`npx playwright test`, proyectos `chromium` a 390 px y `escritorio`, base reseteada, 1811 tests, 48,3 min): **1730 pasaron, 10 fallaron y 71 no corrieron** (los siguientes a un fallo en bloques en serie). Causa de las 10 fallas: el backend de la corrida se arrancó sin `MERCADOPAGO_API_BASE_URL=http://localhost:9099` (el simulado de Mercado Pago estaba levantado pero el backend no apuntaba a él) y `POST /pedidos/cliente/{id}/pago` respondió `409` en todos los specs que pagan un pedido (`94`, `95`, `96`, `97`, `102`, `103`, `104`, `105`, `106`, `111`). Repetidos esos 10 specs con el backend apuntando al simulado y la base reseteada: **98/98**. Es decir, los 1811 tests pasan; ninguna falla tiene relación con el tramo. No se registró ninguno de los inestables conocidos (`27:497`, `06:89`, `23:235`, `81:598`, `88:152`, `116:95`).
- **WebKit** (iPhone 13, specs `101` a `125`, tras el chequeo de conectividad con Cloudinary): **227 pasaron y 2 se omitieron** a propósito (los mismos dos de siempre: chips con salto de línea del `117` y foco por Tab del `108`), 0 fallaron. Los `@escritorio` no corren en WebKit.
- Cada vez que cambió el CSS o el HTML se repitió la serie `121` a `125`.

## Specs existentes cambiados

`121` (4 tests: el login, los asistentes, la dirección del comercio y la bienvenida comprobaban la tarjeta de 480 y 720 px y `.landing-hero`) y `122` (3 aserciones: la columna de la invitación, el ancho del selector de contexto y el ancho de 560 px de la hoja de cuenta suspendida). Ninguno de los demás cambió.


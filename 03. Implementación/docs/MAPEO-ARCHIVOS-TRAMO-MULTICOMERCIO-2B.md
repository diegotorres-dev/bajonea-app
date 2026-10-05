# Mapeo de archivos — Multi-comercio, tramo 2, Entrega B (frontend)

Fecha: 2026-09-30. Objetivo: la pantalla con la que un Dueño ya aprobado agrega un comercio (`agregar-comercio.html`, por dirección directa: ningún botón ni enlace la apunta todavía, eso es el tramo 4) y la bandeja/detalle del Administrador con el contexto del alta adicional. **Sin tablas, columnas, valores de ENUM ni migraciones nuevas.** La página nueva usa solo los endpoints sin `X-Comercio-Id`; no depende de `PROVISORIO_SELECTOR`.

## Refactor puro del wizard de registro (Paso 2)

| Archivo | Por qué |
|---|---|
| `frontend/js/comercio-form.js` (nuevo) | Módulo compartido con lo que antes vivía dentro de `initRegistroComercio`: constantes de etiquetas (tipo de sociedad, condición IVA, tipo de comercio, tipo de red social), `poblarSelect`, los validadores de campo (`validarCampo*`, `bindValidacionCampo`) y cuatro inicializadores reutilizables: `initFotoComercio` (foto con recorte, sin subir), `initCamposNegocio` (tipo, modalidades, provincia/localidad, validaciones del paso Negocio, lectura del payload), `initHorarios` (pestañas, franja rápida, filas, validación del paso) e `initRedesSociales` (filas, límite de 5, validación). También el mapa de errores del backend para los campos del negocio y tres predicados (`esCampoBackendDeNegocio/Horarios/RedesSociales`). No importa nada de `auth.js` (evita el ciclo). |
| `frontend/js/auth.js` | `initRegistroComercio` usa los inicializadores nuevos; quedaron en él solo el paso Legales, el nombre de usuario, el envío y el ruteo de errores. `auth.js` re-exporta las cuatro constantes de etiquetas (`LABELS_*`) para que `admin.js`, `catalogo.js` y `comercio.js` sigan importándolas de ahí sin cambios. Mejora de mapeo de errores: un error del backend sobre `horarios…` que no se mapea a un campo ahora lleva al paso de horarios (antes caía siempre en el último paso); no cambia nada de lo que asertan los specs (01, 13 y 14 dieron 22/22, igual que la base). |
| `frontend/registro-comercio.html` | Sin cambios (los ids y `data-testid` se conservan). Ya tenía el campo "Piso / Dpto" en el paso Negocio. |

## Página nueva (Paso 3)

| Archivo | Por qué |
|---|---|
| `frontend/agregar-comercio.html` (nuevo) | Skeleton de carga, pantalla de "no puede agregar", barra de 3 pasos (Negocio, Horarios, Redes), formulario del paso 1 (con el aviso de datos reutilizados y el campo "Piso / depto (opcional)"), pasos 2 y 3 con los mismos ids que el registro, y pantalla de confirmación. |
| `frontend/js/agregar-comercio.js` (nuevo) | Guarda de rol `DUENO` (si no, `login.html`); `GET /comercios/alta-adicional/elegibilidad` y `GET /oauth/mercadopago/cuenta` (si falla se trata como no vinculada) en paralelo; flecha atrás (paso anterior, o salida con confirmación si hay datos en el paso 1); subida de la foto con la firma de `POST /comercios/nuevo/foto/firma`; envío `POST /comercios`; ruteo de errores (409 y 400 con banner, 400 con mapa a los campos, vuelta al paso que corresponde). Todo texto dinámico entra con `textContent`. |
| `frontend/js/cloudinary.js` | Función nueva `subirFotoNuevoComercio` (firma + subida). |
| `frontend/css/styles.css` | Clases nuevas: `state-page__icon--warning`, `info-box--acento`, `foto-picker`. |

## Bandeja y detalle del Administrador (Paso 4)

| Archivo | Por qué |
|---|---|
| `frontend/js/admin.js` | Tarjeta de la bandeja: badge "Comercio adicional" al lado de "Nueva" si `esAdicional`. Detalle: `renderDuenoYOtrosComercios` (llamado al inicio de `renderComercioDetailSections`) muestra la tarjeta del representante con iniciales, la línea "Datos fiscales ya revisados y aprobados" solo si `esAdicional`, y la sección "Otros comercios de este Dueño" con el estado de cada uno; no muestra nada si `otrosComercios` viene vacío (modal de comercios aprobados incluido). Nombres de los otros comercios normalizados a Title Case como el resto. |
| `frontend/css/styles.css` | `request-card__badges` (badges que envuelven bajo el nombre si no entran), `status-badge--adicional/--exito/--error/--neutro`, `dueno-resumen*`, `otro-comercio-row*`. |

## Backend (solo textos)

| Archivo | Por qué |
|---|---|
| `backend/.../services/AltaComercioAdicionalService.java` | Los textos de los dos `409` pasan a constantes con el texto final (ver `docs/DECISIONES.md`). |
| `backend/.../AltaComercioAdicionalServiceTest.java` | Aserta los textos nuevos, literales. |

## Tests y herramientas

| Archivo | Por qué |
|---|---|
| `testing/playwright/tests/23-multicomercio-tramo2b-alta-adicional-ui.spec.ts` (nuevo) | 15 tests con viewport móvil (390×844): redirección de visitante y Cliente, skeleton, pantalla de "no puede agregar" (solo pendiente y suspendido), aviso con y sin MercadoPago, flujo completo hasta la confirmación (con SQL de lo persistido), duplicado exacto, error `400` con mapa a campo, flecha atrás entre pasos, confirmación de salida (seguir cargando y salir), salida directa sin datos, bandeja y detalle del Administrador con aprobación y aviso al Dueño, aprobación con cuenta de MercadoPago simulada (`APTO_VENTA`), y los textos finales de los `409`. |
| `testing/playwright/tests/22-multicomercio-tramo2a-alta-adicional.spec.ts` | La aserción del `409` de "no elegible" mira ahora `al menos uno aprobado` (texto nuevo). |
| `testing/playwright/scripts/build-multicomercio-tramo2a-postman.mjs` y `postman/Bajonea-MVP.postman_collection.json` | Mismo cambio de la subcadena esperada en los tres requests de "no elegible". |
| `testing/playwright/scripts/stress-locks-tramo2a.mjs` | Caso nuevo `CASO=primera-vinculacion`: dos primeras vinculaciones simultáneas de MercadoPago del mismo Dueño (solo mide e informa). |

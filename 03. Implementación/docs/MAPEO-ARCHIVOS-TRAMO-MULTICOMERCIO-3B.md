# Mapeo de archivos — Multi-comercio, tramo 3, Entrega B (frontend)

Fecha: 2026-10-01. Objetivo: las pantallas del Dueño y del Administrador para corregir y volver a solicitar un comercio rechazado, y el estado nuevo `RECHAZO_DEFINITIVO` en el frontend. **Sin tablas, columnas, valores de ENUM ni migraciones nuevas, y sin tocar el backend.** No se agregó ningún botón ni enlace hacia `comercio-corregir.html` ni `agregar-comercio.html` fuera de lo pedido (los enlaces desde las notificaciones y "Volver a mis comercios" llegan con el selector del tramo 4). No se tocó el bug del wizard que pierde datos ni `comercio-pendiente.html`. Mercado Pago real y la evidencia del ticket no se tocaron.

## Estado nuevo en rutas, guardas y badge (B1)

| Archivo | Por qué |
|---|---|
| `frontend/js/auth.js` | `resolverHomePorRol` devuelve `comercio-rechazo-definitivo.html` para un comercio en `RECHAZO_DEFINITIVO` (antes `null`). |
| `frontend/js/comercio.js` | `RUTA_POR_ESTADO` suma `RECHAZO_DEFINITIVO`. Funciones nuevas `initComercioRechazado` e `initComercioRechazoDefinitivo` (reemplazan el script inline de `comercio-rechazado.html`). |
| `frontend/js/admin.js` | `BADGE_ESTADO_COMERCIO` suma `RECHAZO_DEFINITIVO` con la etiqueta "Rechazo definitivo" (se ve en "Otros comercios de este Dueño"). |
| `frontend/js/catalogo.js` | Revisado: no enumera estados de comercio, nada que cambiar. Se agregó `crearBloqueMotivoRechazo` (bloque de motivo compartido). |
| `frontend/js/crop.js` | El botón "Confirmar" del recorte nace deshabilitado y se habilita cuando la imagen terminó de cargar. Nada más del recorte cambió. |

## Mudanza pura del paso Legales (B2)

| Archivo | Por qué |
|---|---|
| `frontend/js/comercio-form.js` | `initDatosLegales` (representante y datos fiscales, sin usuario, email ni contraseña): población de los selects, validadores de entrada, `validar()`, `leerPayload(construirTelefono)`, y `precargar`/`snapshot`. Constantes `CAMPOS_BACKEND_LEGALES`, `MAPA_ERRORES_LEGALES` y `MAPA_ERRORES_LEGALES_ANIDADOS` (claves `legales.*` del `PUT`). |
| `frontend/js/auth.js` | `initRegistroComercio` usa `initDatosLegales`; quedaron en él el nombre de usuario, el email, la contraseña y el envío. Se sacó `validarFechaNacimientoRepresentante` (ahora en `comercio-form.js`) y los imports que quedaron sin uso. |
| `frontend/registro-comercio.html` | Sin cambios. |

## Precarga y detección de cambios (B3)

| Archivo | Por qué |
|---|---|
| `frontend/js/comercio-form.js` | `initFotoComercio({ urlExistente })` pinta la foto existente y suma `tieneFoto()` (el paso Negocio ya no exige un archivo nuevo si hay foto). `initCamposNegocio` suma `precargar` (espera a `initGeografiaSelects`, después posiciona provincia y localidad) y `snapshot`; `quitarPrefijoTelefono`. `initHorarios` y `initRedesSociales` suman `precargar`. `mostrarModalConfirmarSalida` compartido. |
| `frontend/js/geografia.js` | `preseleccionarGeografia`: selecciona la provincia, espera a que carguen sus localidades y selecciona la localidad. |
| `frontend/js/agregar-comercio.js` | Usa el modal de salida compartido (mismos textos y `data-testid`). |
| `frontend/js/cloudinary.js` | `subirFotoCorreccionComercio(comercioId, file)` (firma de `POST /comercios/{id}/correccion/foto/firma` y subida). |

## Pantallas del Dueño (B4)

| Archivo | Por qué |
|---|---|
| `frontend/comercio-rechazado.html` | Rediseñada: skeleton, ícono de error, bloque de motivo, "Podés corregir… Te quedan N intentos." (singular "Te queda 1 intento."), "Corregir y volver a solicitar" y "Cerrar sesión" (secundario). Mantiene `motivo-rechazo-comercio` y `btn-cerrar-sesion`. |
| `frontend/comercio-rechazo-definitivo.html` (nuevo) | Skeleton, ícono de prohibido, motivo, texto fijo, "Agregar un comercio nuevo" (solo si la elegibilidad da `true`), "Contactar a soporte" (solo si `SOPORTE_CONTACTO_URL` no está vacía) y "Cerrar sesión". |
| `frontend/js/config.js` (nuevo) | `SOPORTE_CONTACTO_URL`, vacía. |
| `frontend/comercio-corregir.html` (nuevo) | Encabezado con atrás, título y badge "Intento N de M"; bloque de motivo; barra de pasos construida por JS; secciones Negocio, Legales (solo si puede), Horarios y Redes; pantalla de confirmación. |
| `frontend/js/comercio-corregir.js` (nuevo) | Guardas, carga con skeleton, precarga, pasos, detección de cambios para la confirmación de salida, envío con foto nueva opcional y `tokenVersion`, mapeo de errores (`400` por campo, `409` de versión con "Recargar los datos", `404` a la pantalla de estado). |

## Pantallas del Administrador (B5)

| Archivo | Por qué |
|---|---|
| `frontend/admin-dashboard.html` | Tarjeta "Re-solicitudes" (ícono de refresco, subtítulo "Comercios corregidos por su Dueño", resaltada en acento). |
| `frontend/admin-resolicitudes.html` (nuevo) | Lista con skeleton. |
| `frontend/admin-resolicitud-detalle.html` (nuevo) | Detalle con skeleton y badge de intento en el encabezado. |
| `frontend/js/admin.js` | Contador de la tarjeta (`metricas.resolicitudesPendientes`); `initAdminResolicitudes`, `initAdminResolicitudDetalle`, etiquetas legibles de los 21 campos (`CampoCambioComercio`), formato de valores (enums a etiqueta, fechas `dd/mm/aaaa`, horarios y redes en líneas), tarjeta por campo cambiado, foto lado a lado, bloque plegable "Sin cambios (N campos)". `mostrarModalRechazarComercio` reescrito: título "Rechazar solicitud" con el nombre del comercio, interruptor "Rechazo definitivo", aviso y bloqueo en el último intento; los dos detalles (solicitud nueva y re-solicitud) mandan `definitivo`. |
| `frontend/css/styles.css` | Clases nuevas: `app-header__pill`, `app-header--con-pill`, `motivo-rechazo*`, `banner__accion`, `alert-card--acento`, `alert-card__count--numero`, `switch-row__texto/__ayuda`, `switch-row--peligro/--bloqueado`, `aviso-ultimo-intento`, `btn-peligro`, `request-card__top--avatar/__avatar/__titulos/__sub/__badges--inicio`, `cambios-resumen`, `cambio-card`, `cambio-fila*`, `cambio-fotos`, `cambio-foto*`, `sin-cambios*`, `detail-row--multilinea`. Cada contenedor nuevo con ícono tiene su regla de tamaño (`.motivo-rechazo` no lleva ícono; `.aviso-ultimo-intento svg`, `.sin-cambios__foto`). |

## Tests y documentación (B6)

| Archivo | Por qué |
|---|---|
| `testing/playwright/tests/25-multicomercio-tramo3b-correccion-rechazados-ui.spec.ts` (nuevo) | 20 tests con viewport móvil (390×844 por defecto; `E2E_ANCHO`/`E2E_ALTO` para repetir en 360×800; `CAPTURAS=<nombre>` guarda capturas en `tmp-capturas/`). |
| `testing/playwright/tests/helpers/multicomercio.ts` (nuevo) | Fixtures y helpers del spec 24 con parámetros explícitos (Dueño rechazado, aprobado, clon con redes, reenvío por API, sesión por `localStorage`, login por UI). El spec 24 no se tocó. |
| `testing/playwright/tests/08-aprobacion-comercio.spec.ts` | Suma asserts de la pantalla de rechazo (intentos, botón de corrección) y del modal (nombre, interruptor apagado, `definitivo: false` en el body). Ninguno se relajó. |
| `testing/playwright/tests/17-validaciones-administrador.spec.ts` | Suma asserts de la tarjeta "Re-solicitudes" del dashboard y de la fila del interruptor en el modal. |
| `testing/playwright/tests/11-perfil-cliente.spec.ts` y `14-perfil-comercio.spec.ts` | Una línea cada uno en el test que falló de forma intermitente en las corridas completas: esperar a que la página termine de cargar el perfil antes de subir la foto o hacer clic (carrera preexistente del test, sin relación con este tramo). Fuera de lo pedido. |
| `testing/playwright/tmp-capturas/3b-390-*.png` y `3b-360-*.png` | Capturas de las pantallas nuevas (las genera el spec `25` con `CAPTURAS=390` o, con `E2E_ANCHO=360 E2E_ALTO=800`, `CAPTURAS=360`). |
| `docs/DATA-TESTID-FASE17.md` | Testids nuevos. |
| `docs/db/prueba-manual-multicomercio-3b.sql` y `…-limpieza.sql` (nuevos) | Para la prueba manual en `bajonea_practicas3` (los ejecuta Diego; probados solo contra `bajonea_test`). |
| `docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `CLAUDE.md`, requisitos e historias de usuario | Ver cada entrada. |

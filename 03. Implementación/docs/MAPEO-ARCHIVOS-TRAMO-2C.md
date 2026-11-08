# Mapeo de archivos — Tramo 2C: notificaciones (paginación, "Marcar todas" del Cliente y textos) (2026-11-07)

Backend, frontend, pruebas y documentación. Sin migraciones. Pendiente de la confirmación de Diego. No cambia ningún token de color (el naranja de marca sigue siendo `#ff4700`).

## Qué hace

- **"Marcar todas" para el Cliente, con ruta propia.** `PUT /api/v1/notificaciones/personales/leidas` marca como leídos los avisos personales de quien llama (canal `PUSH`, `comercio_id` nulo), en lotes de 500 por clave primaria (`UPDATE ... WHERE id IN (...) AND leida = false`), y devuelve la cantidad. Idempotente (la segunda vez devuelve `0`), solo los propios, no toca ningún aviso de comercio ni las filas de email, no usa `X-Comercio-Id`. Se eligió una ruta aparte (y no una rama sin encabezado del `PUT /leidas` del comercio) para que olvidar `X-Comercio-Id` en la ruta del comercio siga dando `400` y no marque otra cosa en silencio. Clasificada `PROPIO` en `ClasificacionRutasComercioTest`. Frontend: el botón del comercio (`btn-marcar-todas-leidas`) se reutiliza; en el Cliente nace oculto (`hidden`) y se muestra solo si hay avisos sin leer; sin hoja de confirmación; mismo toast ("Marcaste todos los avisos como leídos"); al terminar marca como leídos los avisos ya cargados, vuelve a pedir la primera página y recalcula si el botón se ve. Si todo lo cargado está leído pero hay otra página, consulta `GET /notificaciones/no-leidas/contador` para decidir si lo muestra (el contador cuenta todos). En la pantalla de notificaciones no hay campana: el punto de la campana y el contador de las otras pantallas leen del servidor al cargarse y en su propio sondeo.
- **Paginación por cursor.** `GET /api/v1/notificaciones` acepta `limite` (20 por defecto, 50 como máximo, `400` si es menor que 1) y `cursor` (`{fecha_creacion}_{id}` del último aviso entregado, `400` si no se puede interpretar). Orden `(fecha_creacion desc, id desc)`; se piden `limite + 1` filas para saber si hay otra página sin contar. Aplica al Cliente y al contexto de comercio (Dueño y Empleado). Los avisos de otro comercio o de otro usuario nunca entran: las consultas conservan sus filtros.
- **Contrato elegido.** `data` sigue siendo el **arreglo** de avisos y, si hay otra página, el encabezado `X-Siguiente-Cursor` trae el cursor para pedirla (ausente en la última página). Se descartó el patrón de la Actividad del Dueño (`{ items, siguienteCursor, hayMas }` dentro de `data`) porque cambiaría la forma de la respuesta para unos 35 specs de Playwright, las colecciones de Newman, los tests de Java y los consumidores del frontend (campana, sonido de avisos), sin que ninguno necesite el cursor. El costo: el encabezado hay que exponerlo por CORS (`setExposedHeaders`) y `apiFetch` suma la opción `conCabeceras`. Los consumidores que no paginan (las pruebas, `sonido-avisos.js`, que lee la primera página para el id más nuevo) no cambian.
- **"Ver más".** Botón de 44 px o más al final de la lista, con "Cargando…" y `aria-busy` mientras pide; se reemplaza el contenido de la lista con un solo `replaceChildren` (no pierde el scroll) y el foco pasa al primer aviso nuevo (`preventScroll`). El sondeo de 15 s refresca solo la primera página y la **fusiona**: conserva los avisos ya abiertos que son más viejos que el último de la primera página y el cursor donde estaba, de modo que no borra páginas ni parpadea (se repinta solo si cambia la firma de la lista). Si falla "Ver más", la lista queda como estaba y aparece un banner `role="alert"` ("No pudimos cargar más avisos.") con "Reintentar" (que recibe el foco), sin redirigir (`handleRedGlobally: false`, `handle5xxGlobally: false`). La pausa del sondeo con la pestaña oculta se conserva.
- **Textos de los avisos** (los ya creados no se migran): `NUEVO_PEDIDO` "Pedido nuevo #{n} de {Nombre Apellido}."; `AVISO_75MIN_SIN_CONFIRMACION` "Tu pedido #{n} sigue en camino. Si ya lo recibiste, confirmalo para cerrarlo."; `PEDIDO_RECHAZADO`, `PEDIDO_ANULADO_COMERCIO` y `PEDIDO_CANCELADO_SISTEMA` por la suspensión del comercio "Cancelamos tu pedido #{n} porque el comercio no está disponible. Te devolvemos el dinero." (incluye la cancelación de un pedido con el pago recién aprobado y la de un pedido en preparación vencido, que antes decían "…fue cancelado automáticamente: el comercio fue suspendido…"); `PEDIDO_EXPIRADO_COMERCIO` "El pedido #{n} se canceló porque nadie lo respondió a tiempo."; `COMERCIO_RECHAZADO` suma "Corregilo y volvé a solicitarlo." solo cuando el comercio queda en `RECHAZADO` (el rechazo definitivo, pedido por el Administrador o por haber agotado las re-solicitudes, no lo lleva: se verificó contra `AdministradorService.resolverAprobacion`); `DOCUMENTO_RECHAZADO` suma "Subí uno nuevo." en el rechazo y en la revocación (en ambos el documento queda `RECHAZADO` y se puede subir otro mientras el comercio esté operable); `CUENTA_INACTIVADA` (la campana) "Tu cuenta quedó inactiva por falta de uso." (el email no cambia); `RECLAMO_REEMBOLSO_DUENO` "Reembolsamos {monto} al Cliente por un reclamo del pedido #{n}." sin la oración de Mercado Pago. Para que el motivo escrito por una persona no deje un texto sin punto, `TextoUtils.conPuntoFinal` le agrega "." si no termina en `.`, `!` o `?` antes de la frase nueva.
- **Aviso leído sin destino.** Antes era un `<button disabled>` (sale del orden de tabulación y los lectores de pantalla lo saltean). Ahora es un `<div>` con el mismo `data-testid` y el mismo contenido. El aviso sin destino y sin leer sigue siendo un `<button type="button">` que solo lo marca leído; al lograrlo se reemplaza por el `<div>` y, si tenía el foco, se le da (`tabindex="-1"`) para no perder el lugar de quien navega con teclado. Con destino sigue siendo un `<a>`.

## Archivos modificados y creados

### Backend

| Archivo | Cambio |
|---|---|
| `controllers/NotificacionController.java` | `GET` con `limite` y `cursor` y el encabezado `X-Siguiente-Cursor`; `PUT /personales/leidas`. |
| `services/NotificacionService.java` | `listar(usuario, header, limite, cursor)` con `PaginaNotificaciones`, `Cursor` (interpretar y generar), `marcarLeidasPersonales`, `marcarPorIds` compartido. |
| `repositories/NotificacionRepository.java` | Las dos listas reciben `(fecha, id, Pageable)`; `findIdsPersonalesPushNoLeidasByUsuarioId`. |
| `config/security/SecurityConfig.java` | `setExposedHeaders(List.of("X-Siguiente-Cursor"))`. |
| `services/PedidoService.java` | Textos de `NUEVO_PEDIDO`, `AVISO_75MIN`, `PEDIDO_EXPIRADO_COMERCIO` y los de la cancelación por suspensión del comercio (`textoPorComercioNoDisponible`, `notificarCancelacionPorComercioNoDisponible`). |
| `services/AdministradorService.java`, `services/RevisionDocumentoService.java`, `services/AvisoCuentaService.java`, `services/AvisoReclamoService.java` | Textos de `COMERCIO_RECHAZADO`, `DOCUMENTO_RECHAZADO`, `CUENTA_INACTIVADA` y `RECLAMO_REEMBOLSO_DUENO`. |
| `util/TextoUtils.java` | `conPuntoFinal`. |
| `services/TestSupportService.java`, `controllers/TestController.java` | Atajo de test `POST /api/v1/test/usuarios/{id}/avisos-personales?cantidad=&leidas=` (perfil `test`), para sembrar avisos en Newman y en el estrés. **No forma parte del contrato de producción.** |

### Frontend

| Archivo | Cambio |
|---|---|
| `frontend/js/notificaciones.js` | Estado de la lista (`items`, `siguienteCursor`, `cargandoMas`, `errorMas`), "Ver más", fusión del sondeo, "Marcar todas" del Cliente, aviso leído sin destino como `div`, foco. |
| `frontend/js/api.js` | Opción `conCabeceras` (devuelve `{ data, cabeceras }`). |
| `frontend/css/styles.css` | `.notification-mas` (pie de la lista), `div.notification-item` (sin cursor de mano, con foco visible); se quitó `.notification-item:disabled`. |

### Pruebas

| Archivo | Cambio |
|---|---|
| `backend/src/test/.../NotificacionesPaginacionIntegrationTest.java` | **Nuevo.** Páginas con cursor sin repetir ni saltear, tope de 50, límite y cursor inválidos, un aviso nuevo que no corre las páginas, página exacta sin cursor, marcar personales (solo las propias, no las del comercio, otro usuario intacto, idempotente). |
| `backend/src/test/.../NotificacionServiceTest.java` | Adaptado a las nuevas firmas (`listarItems`, repositorio con `any()`). |
| `backend/src/test/.../ClasificacionRutasComercioTest.java` | Clasifica `PUT /notificaciones/personales/leidas` como `PROPIO`. |
| `InvitacionEmpleadoIntegrationTest`, `NotificacionesEquipoConcurrenciaIntegrationTest`, `NotificacionesPorComercioIntegrationTest`, `PedidoAutoconfirmadoConcurrenciaIntegrationTest` | `notificacionService.listar(..., null, null).items()`. |
| `AdministradorServiceResolucionTest`, `ReclamoResolverIntegrationTest`, `NotificacionesEquipoIntegrationTest`, `SuspensionComercioRechazoPendientesIntegrationTest`, `SuspensionDuenoIntegrationTest` | Textos nuevos (en las dos últimas, el aviso se busca con `LIKE` porque ahora lleva el número de pedido). |
| `testing/playwright/tests/112-notificaciones-marcar-todas-cliente-ui.spec.ts` | **Nuevo.** "Marcar todas" del Cliente y aviso leído sin destino (375 px; WebKit). |
| `testing/playwright/tests/113-notificaciones-ver-mas-ui.spec.ts` | **Nuevo.** "Ver más", scroll y foco, "Cargando…", contador total, sondeo que fusiona, error con "Reintentar" (375 px; WebKit). |
| `testing/playwright/tests/114-notificaciones-paginacion-api.spec.ts` | **Nuevo.** Contrato de la API: cursor, cabecera, límite, tope, `400`, exposición CORS, contador, `personales/leidas` (propias, idempotente, ignora el encabezado, lotes, `401`). |
| `testing/playwright/tests/helpers/avisos-cliente.ts` | **Nuevo.** `prepararClienteDeAvisos`, `sembrarAvisos`, `borrarAvisos`. |
| `108-notificaciones-tarjeta-ui.spec.ts` | El aviso sin destino ya leído es un `div` (antes `toBeDisabled`). |
| `22`, `24`, `45`, `88` (Playwright) | Textos nuevos. |
| `testing/playwright/scripts/build-notificaciones-paginacion-tramo2c-postman.mjs` | **Nuevo.** Carpeta `93` de Newman. Se corre después de los demás constructores. |
| `build-suspension-comercio-s21`, `build-suspension-dueno-fase5s3`, `build-reclamos-fase5s5`, `build-notificaciones-equipo-tramoE3-A4`, `build-multicomercio-tramo2a`, `build-multicomercio-tramo3a` y `postman/Bajonea-MVP.postman_collection.json` | Textos nuevos (el mismo reemplazo en los constructores y en la colección). |
| `testing/playwright/scripts/stress-locks-tramoNotificaciones2c.mjs`, `correr-estreses.mjs` | **Nuevo** estrés (id `notificaciones`): marcar mientras llegan avisos y se lee la lista paginada. |

## Fuera de alcance (no se tocó)

Dejar de crear `CUENTA_INACTIVADA` o `CLIENTE_SUSPENDIDO`; eliminar los 6 tipos sin emisor; cambiar destinos, sonido o la creación de avisos; campana o avisos para el Administrador; los demás hallazgos de `AUDITORIA-NIELSEN.md` y la interfaz de escritorio; notificaciones push.

# `data-testid` — referencia rápida (Fase 17, preparación)

Pasada completa sobre las 39 pantallas de `frontend/` (Paso A de la auditoría de Fase 17), agregando atributos `data-testid` a botones de acción, inputs de formulario, selects, indicadores de estado/datos dinámicos, contenedores repetidos de lista y modales — sin tocar estructura, estilos, ni lógica de negocio de ningún archivo. Cero comentarios agregados (regla `CLAUDE.md` §4.11), verificado con `grep` sobre los 39 `.html` y los 11 `.js` tocados. Sintaxis de los 11 archivos `.js` verificada con `node --check` sobre copias `.mjs` (método de Tramo 16.27/16.28).

**Convención aplicada** (ver el prompt original para el detalle completo): kebab-case en español, nombrado por acción/dato — no por tipo de elemento ni por pantalla —, `btn-<verbo>-<objeto>` para botones, `input-<campo>`/`select-<campo>` para formularios, `<dato>-<contexto>` para indicadores de lectura, sufijo `-{id}` del recurso real en contenedores repetidos de lista, `modal-<proposito>` para modales.

La mayor parte del contenido de `frontend/` se renderiza dinámicamente desde `frontend/js/*.js` (no hay casi HTML estático más allá de los shells `<div id="...">`) — por eso la tabla de abajo lista, para cada pantalla, tanto el `.html` como el/los `.js` que efectivamente inyectan los `data-testid` en el DOM.

## Spec 01 — Registro y verificación

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `registro-tipo-cuenta.html` | mismo `.html` | `btn-elegir-cliente`, `btn-elegir-comercio`, `btn-volver` |
| `registro-cliente.html` | mismo `.html` | `input-nombre`, `input-apellido`, `input-dni`, `input-fecha-nacimiento`, `input-telefono`, `input-email`, `input-password`, `btn-mostrar-password`, `input-confirmar-password`, `btn-mostrar-confirmar-password`, `input-acepta-terminos`, `indicador-fortaleza-password`, `mensaje-error-*` (uno por campo), `btn-continuar`, `mensaje-banner`, `input-calle`, `input-numero`, `input-piso-depto`, `input-codigo-postal`, `select-provincia`, `select-localidad`, `btn-crear-cuenta`, `btn-ir-a-verificar`, `btn-volver` |
| `registro-comercio.html` | mismo `.html` + `js/auth.js` (franjas de horario) | Mismo patrón que registro-cliente + `input-foto-comercio`, `btn-agregar-foto-comercio`, `btn-tipo-restaurante`, `btn-tipo-emprendimiento`, `input-tipo-comercio`, `btn-switch-delivery`, `btn-switch-retiro`, `input-razon-social`, `input-cuit`, `input-fecha-inicio-actividades`, `select-tipo-sociedad`, `select-condicion-iva`, `input-domicilio-fiscal`, `input-*-representante` (5 campos), `btn-continuar-2`, `lista-horarios`, `btn-agregar-horario`, `btn-registrar-comercio`. Dinámico (`js/auth.js`, `crearFilaHorario`): `fila-horario`, `select-dia-horario`, `input-apertura-horario`, `input-cierre-horario`, `btn-eliminar-horario` — **sin sufijo de id** (ver nota de ambigüedad más abajo) |
| `verificar-email.html` | mismo `.html` + `js/otp.js` | `mensaje-banner`, `input-codigo-verificacion` (contenedor), `input-codigo-digito-1` a `-6` (por dígito, `js/otp.js`), `mensaje-error-codigo`, `btn-verificar-cuenta`, `btn-reenviar-codigo`, `estado-verificacion-exito`, `btn-ir-a-login`, `estado-verificacion-error`, `mensaje-error-verificacion`, `btn-reenviar-codigo-error`, `btn-ir-a-login-error` |

## Spec 02 — Login

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `login.html` | mismo `.html` | `mensaje-banner`, `input-email`, `input-password`, `btn-mostrar-password`, `mensaje-error-login`, `mensaje-advertencia-bloqueo`, `btn-olvide-password`, `btn-ingresar`, `btn-ir-a-registro`, `btn-ir-a-reactivar-cuenta` |
| `recuperar-password.html` | mismo `.html` + `js/otp.js` | `mensaje-banner`, `input-email`, `mensaje-error-email`, `btn-enviar-codigo-recuperacion`, `btn-ir-a-login`, `mensaje-banner-codigo`, `input-codigo-verificacion` + dígitos, `mensaje-error-codigo`, `btn-reenviar-codigo`, `input-nueva-password`, `btn-mostrar-nueva-password`, `indicador-fortaleza-password`, `mensaje-error-nueva-password`, `input-confirmar-password`, `btn-mostrar-confirmar-password`, `mensaje-error-confirmar-password`, `btn-restablecer-password`, `btn-ir-a-login-exito`, `btn-volver` |
| `reactivar-cuenta.html` | mismo `.html` + `js/otp.js` | Mismo patrón que recuperar-password (código de reactivación): `btn-enviar-codigo-reactivacion`, `btn-reactivar-cuenta`, resto igual |

## Spec 04 — Carrito y checkout

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `carrito.html` | `js/carrito.js` (shell sin testids propios) | `btn-vaciar-carrito`, `modal-vaciar-carrito`, `btn-confirmar-vaciar-carrito`, `btn-cancelar-vaciar-carrito`, `btn-explorar-comercios` (vacío), `tarjeta-comercio-carrito`, por ítem: `item-carrito-{id}`, `btn-eliminar-item-carrito-{id}`, `btn-restar-cantidad-{id}`, `cantidad-item-carrito-{id}`, `btn-sumar-cantidad-{id}`, `subtotal-item-carrito-{id}`, `total-carrito`, `btn-confirmar-pedido` |
| `checkout.html` | mismo `.html` + `js/checkout.js` | `btn-volver`, `mensaje-banner`, `opciones-modalidad-entrega`, `btn-continuar-modalidad`, `btn-modalidad-domicilio`/`btn-modalidad-retiro`, `btn-confirmar-direccion`, `btn-confirmar-retiro`, `btn-editar-modalidad`, `total-carrito`, `btn-confirmar-pedido`, `modal-pedido-confirmado`, `mensaje-pedido-confirmado` (incluye el número real de pedido en el texto), `btn-volver-catalogo` |

## Spec 05 — Flujo de pedido completo (cobertura prioritaria)

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `index.html` | mismo `.html` + `js/catalogo.js` | `mensaje-saludo`, `fila-chips-filtro`, `lista-comercios`, `chip-filtro-todos`/`-restaurante`/`-emprendimiento`/`-delivery`/`-retiro`/`-abierto`, por comercio: `comercio-card-{id}` (contiene `estado-comercio`), `btn-notificaciones` + `contador-notificaciones`, `btn-perfil`, `btn-ingresar`, `btn-carrito-flotante` + `contador-carrito-flotante`, `btn-nav-inicio`/`-explorar`/`-carrito`/`-pedidos`/`-perfil`, `estado-vacio` |
| `comercio-detalle.html` | mismo `.html` + `js/catalogo.js` | `nombre-comercio`, `descripcion-comercio`, `estado-comercio`, `chip-filtro-todos`, `chip-categoria-{id}`, `chip-tag-{tag}`, por producto: `producto-item-{id}`; modal de producto: `modal-detalle-producto`, `btn-cerrar-modal-producto`, `btn-miniatura-producto`, `btn-restar-cantidad-producto`, `cantidad-producto-modal`, `btn-sumar-cantidad-producto`, `input-nota-producto`, `btn-agregar-carrito`, `btn-ir-a-login`; conflicto de comercio: `modal-conflicto-comercio`, `btn-vaciar-y-agregar`, `btn-cancelar-conflicto-comercio` |
| `carrito.html` | (ver Spec 04) | — |
| `checkout.html` | (ver Spec 04) | — |
| `pedidos.html` | mismo `.html` + `js/pedidos.js` | `lista-pedidos`, por pedido: `pedido-item-{id}` (contiene `estado-pedido`, `total-pedido`), `estado-vacio`, `btn-explorar-comercios` |
| `pedido-detalle.html` | `js/pedidos.js` + `js/catalogo.js` (`renderPedidoEstadoHeader`, compartido) | `cabecera-estado-pedido`, `estado-pedido`, `numero-pedido`, `motivo-rechazo-pedido`, `btn-ver-comercio` |
| `comercio-pedidos.html` | mismo `.html` + `js/comercio.js` | `fila-chips-filtro`, `lista-pedidos`, `chip-filtro-todos`/`-pendiente`/`-en_preparacion`/`-rechazado`, por pedido: `pedido-item-{id}` (`nombre-cliente-pedido`, `estado-pedido`, `total-pedido`) |
| `comercio-pedido-detalle.html` | `js/comercio.js` + `js/catalogo.js` | `cabecera-estado-pedido`, `estado-pedido`, `numero-pedido`, `motivo-rechazo-pedido`, `nombre-cliente-pedido`, `btn-aceptar-pedido`, `btn-rechazar-pedido`, `modal-rechazar-pedido` (`select-motivo-rechazo`, `mensaje-error-motivo-rechazo`, `input-comentario-rechazo`, `btn-confirmar-rechazo`, `btn-cancelar-rechazo`), `btn-anular-pedido`, `modal-anular-pedido` (`select-motivo-anulacion`, `mensaje-error-motivo-anulacion`, `input-comentario-anulacion`, `mensaje-error-comentario-anulacion`, `btn-confirmar-anulacion`, `btn-cancelar-anulacion`; desde el bloque A0b de E3 el motivo es un selector y `input-motivo-anulacion` ya no existe), `btn-ver-mis-pedidos` (no encontrado) |

## Spec 06 — CRUD de productos (Comercio)

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `comercio-productos.html` | mismo `.html` + `js/comercio.js` | `input-buscar-producto`, `fila-chips-filtro`, `lista-productos`, `btn-crear-producto`, `chip-filtro-producto-todos`/`-disponible`/`-agotado`/`-descontinuado`, por producto: `producto-item-{id}`, `btn-acciones-producto-{id}`; modal de acciones: `modal-acciones-producto`, `btn-editar-producto`, `btn-cambiar-estado-producto`, `btn-descontinuar-producto`, `btn-cancelar-modal-acciones`; modal de confirmación: `modal-confirmar-descontinuar`, `input-confirmar-irreversible`, `btn-confirmar-descontinuar`, `btn-cancelar-descontinuar` |
| `comercio-producto-form.html` | mismo `.html` + `js/comercio.js` | `mensaje-banner`, `galeria-fotos-producto`, `input-foto-producto`, `input-nombre-producto`, `input-descripcion-producto`, `input-precio-producto`, `select-categoria-producto`, `fila-chips-tags-producto` (`chip-tag-producto-{id}`), `btn-guardar-producto`, `btn-descontinuar-producto`, dinámicos de galería: `btn-eliminar-foto-producto-{index}`, `btn-agregar-foto-producto` |
| Editor de recorte (`js/crop.js`, `abrirEditorRecorte`) | modal propio, invocado desde `comercio-producto-form.html`/`js/comercio.js` (alta y recorte de imagen ya subida) | `modal-recorte-imagen` (contenedor), `canvas-recorte`, `input-zoom-recorte`, `btn-cancelar-recorte`, `btn-confirmar-recorte` — agregados en la preparación del spec 06 (ver nota 6 más abajo, actualizada) |

## Spec 07 — Categorías y tags (Administrador)

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `admin-categorias.html` | mismo `.html` + `js/admin.js` | `btn-volver`, `fila-chips-filtro`, `lista-categorias`, `btn-crear-categoria`, `chip-filtro-categoria-todas`/`-activas`/`-inactivas`, por categoría: `categoria-item-{id}`, `btn-editar-categoria-{id}`; modal: `modal-categoria`, `input-nombre-categoria`, `mensaje-error-nombre-categoria`, `btn-switch-categoria-activa`, `btn-guardar-categoria`, `btn-cancelar-categoria` |
| `admin-tags.html` | mismo `.html` + `js/admin.js` | Mismo patrón: `lista-tags`, `btn-crear-tag`, `chip-filtro-tag-todos`/`-activos`/`-inactivos`, `tag-item-{id}`, `btn-editar-tag-{id}`, `modal-tag`, `input-nombre-tag`, `mensaje-error-nombre-tag`, `btn-switch-tag-activo`, `btn-guardar-tag`, `btn-cancelar-tag` |

## Spec 08 — Aprobación de comercios (Administrador)

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `admin-dashboard.html` | mismo `.html` + `js/admin.js` | `nombre-admin`, `btn-comercios-pendientes`, `contador-comercios-pendientes`, `btn-resolicitudes`, `contador-resolicitudes-pendientes` (tramo multi-comercio 3B), `grilla-gestion-admin` (`tile-gestion-comercios`/`-clientes`/`-categorias`/`-tags`), `btn-cerrar-sesion`, `modal-confirmar-logout`, `btn-confirmar-logout`, `btn-cancelar-logout` |
| `admin-comercios-pendientes.html` | mismo `.html` + `js/admin.js` | `btn-volver`, `contador-pendientes`, `lista-comercios-pendientes`, por solicitud: `comercio-pendiente-item-{id}`, `btn-ver-solicitud-{id}` |
| `admin-comercio-detalle.html` | mismo `.html` + `js/admin.js` | `btn-volver`, `detalle-comercio-pendiente`, `btn-rechazar-comercio`, `btn-aprobar-comercio`; modal aprobar: `modal-confirmar-aprobacion`, `btn-confirmar-aprobacion`, `btn-cancelar-aprobacion`; modal rechazar: `modal-rechazar-comercio`, `nombre-comercio-rechazo`, `input-motivo-rechazo-comercio`, `mensaje-error-motivo-rechazo-comercio`, `aviso-ultimo-intento`, `fila-rechazo-definitivo`, `switch-rechazo-definitivo`, `ayuda-rechazo-definitivo`, `btn-confirmar-rechazo-comercio`, `btn-cancelar-rechazo-comercio` (los cuatro del interruptor y del aviso, desde el tramo multi-comercio 3B; el mismo modal lo usa la re-solicitud); no encontrado: `btn-ver-pendientes` |

## Spec 25 — Corrección de comercios rechazados (tramo multi-comercio 3B)

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `comercio-rechazado.html` | mismo `.html` + `js/comercio.js` (`initComercioRechazado`) | `skeleton-rechazado`, `motivo-rechazo-comercio` (bloque con el motivo del último rechazo), `texto-correccion` ("Podés corregir… Te quedan N intentos."), `btn-corregir-solicitud` (enlace a `comercio-corregir.html?id=N`), `btn-cerrar-sesion` |
| `comercio-rechazo-definitivo.html` | mismo `.html` + `js/comercio.js` (`initComercioRechazoDefinitivo`) + `js/config.js` | `skeleton-rechazo-definitivo`, `motivo-rechazo-comercio`, `texto-rechazo-definitivo`, `btn-agregar-comercio-nuevo` (solo si la elegibilidad da `true`), `btn-contactar-soporte` (solo si `SOPORTE_CONTACTO_URL` no está vacía), `btn-cerrar-sesion` |
| `comercio-corregir.html` | mismo `.html` + `js/comercio-corregir.js` + `js/comercio-form.js` | `btn-volver`, `badge-intento`, `skeleton-corregir-comercio`, `motivo-rechazo-correccion`, `mensaje-banner`, `btn-recargar-datos` (dentro del banner del `409` de versión), `texto-foto-cambiar`, `aviso-datos-legales`, `btn-continuar` (paso Negocio), `btn-continuar-legales`, `btn-continuar-horarios`, `btn-enviar-solicitud`, `pantalla-solicitud-recibida`, `btn-volver-inicio-exito`; modal de salida: `modal-confirmar-salida`, `btn-seguir-editando`, `btn-confirmar-salida`; el resto de los campos reutiliza los testids de `agregar-comercio.html` (negocio, horarios, redes) y de `registro-comercio.html` (representante y datos fiscales: `input-nombre-representante`, `input-cuit`, `select-tipo-sociedad`, …) |
| `admin-resolicitudes.html` | mismo `.html` + `js/admin.js` (`initAdminResolicitudes`) | `btn-volver`, `contador-resolicitudes`, `lista-resolicitudes`, por fila: `resolicitud-item-{id}`, `badge-intento-{id}`, `badge-ultimo-intento-{id}`, `btn-ver-resolicitud-{id}` |
| `admin-resolicitud-detalle.html` | mismo `.html` + `js/admin.js` (`initAdminResolicitudDetalle`) | `badge-intento`, `detalle-resolicitud`, `motivo-rechazo-anterior`, `resumen-cambios`, por campo cambiado: `cambio-{CAMPO}`, `cambio-antes-{CAMPO}`, `cambio-ahora-{CAMPO}` (la foto usa `cambio-foto-antes`/`cambio-foto-ahora`), `bloque-sin-cambios`, `resumen-sin-cambios`, `sin-cambio-{CAMPO}`, `btn-rechazar-comercio`, `btn-aprobar-comercio` (mismos que el detalle de solicitudes nuevas, con sus modales), `btn-ver-resolicitudes` (estado "no encontrada") |

`{CAMPO}` es uno de los 21 valores de `CampoCambioComercio` (`NOMBRE`, `DESCRIPCION`, `TELEFONO`, `EMAIL_CONTACTO`, `TIPO_COMERCIO`, `MODALIDADES`, `FOTO_PERFIL`, `DIRECCION`, `HORARIOS`, `REDES_SOCIALES`, `RAZON_SOCIAL`, `CUIT`, `CONDICION_IVA`, `TIPO_SOCIEDAD`, `DOMICILIO_FISCAL`, `FECHA_INICIO_ACTIVIDADES`, `REPRESENTANTE_NOMBRE`, `REPRESENTANTE_APELLIDO`, `REPRESENTANTE_DNI`, `REPRESENTANTE_TELEFONO`, `REPRESENTANTE_FECHA_NACIMIENTO`).

## Spec 09 — Notificaciones

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `notificaciones.html` | mismo `.html` + `js/notificaciones.js` | `lista-notificaciones`, `estado-vacio`, por notificación: `notificacion-item-{id}`, `btn-ver-pedido-notificacion-{id}` |
| Campana global | `js/catalogo.js` (`renderTopBar`) y `js/comercio.js` (`renderHeaderDashboard`) | `btn-notificaciones`, `contador-notificaciones` — presentes en la topbar de (casi) todas las pantallas de Cliente y Comercio |

## Resto de pantallas (tier final, cobertura razonable pero no exhaustiva)

| Pantalla | Archivo(s) | `data-testid` agregados |
|---|---|---|
| `admin-comercios.html` | mismo `.html` + `js/admin.js` | `btn-volver`, `lista-comercios-admin`, por comercio: `comercio-admin-item-{id}`, `btn-ver-detalle-comercio-{id}`; modal: `modal-detalle-comercio`, `btn-cerrar-modal-detalle-comercio` |
| `admin-clientes.html` | mismo `.html` + `js/admin.js` | `btn-volver`, `lista-clientes-admin`, por cliente: `cliente-item-{id}` (`estado-cliente`) |
| `perfil.html` (Cliente) | mismo `.html` + `js/cliente.js` | `nombre-cliente-perfil`, `email-cliente-perfil`, `btn-editar-datos`, `btn-cambiar-password`, `btn-cerrar-sesion`, formularios de editar datos y cambiar contraseña con `input-*`/`mensaje-error-*` por campo, `btn-guardar-datos`, `btn-guardar-password`; modal logout: `modal-confirmar-logout`, `btn-confirmar-logout`, `btn-cancelar-logout` |
| `comercio-perfil.html` | mismo `.html` + `js/comercio.js` | Mismo patrón que `perfil.html` + `btn-editar-perfil-comercio`, `btn-ver-legales`, `input-foto-comercio`, `btn-cambiar-foto-comercio`, `btn-switch-delivery`/`-retiro`, `legal-razon-social`/`-cuit`/`-condicion-iva`/`-tipo-sociedad`/`-domicilio-fiscal`/`-fecha-inicio` (solo lectura), `btn-guardar-perfil-comercio` |
| `comercio-dashboard.html` | mismo `.html` + `js/comercio.js` + `js/turno-resumen.js` | `mensaje-estado-comercio`, `mensaje-saludo`, `metricas-dashboard`, `turno-rotulo` (con `data-estado` `EN_CURSO`, `TERMINADO` o `SIN_TURNO`), `turno-estado` (el texto del rótulo), `metrica-vendido`, `metrica-pedidos`, `metrica-pendientes`, `desglose-turno-toggle`, `desglose-turno-panel`, `metrica-comision`, `metrica-neto` (los cuatro del desglose solo existen en el DOM del Dueño), `contador-pedidos-activos`, `lista-pedidos-activos` (reutiliza `pedido-item-{id}`/`estado-pedido`/`total-pedido` de `comercio.js`), `btn-notificaciones` |
| `comercio-pendiente.html` | mismo `.html` | `btn-ir-a-inicio` |
| `bienvenida.html` | mismo `.html` | `btn-ingresar`, `btn-crear-cuenta`, `btn-explorar-sin-registro` |
| `explorar.html` | mismo `.html` + `js/explorar.js` | `input-buscar-producto-explorar`, `fila-chips-categorias` (`chip-categoria-todas`/`-{id}`), `fila-chips-tags` (`chip-tag-{id}`), `lista-productos-explorar` (`producto-item-{id}`, `btn-ver-en-comercio-{id}`), `paginacion-explorar` (`btn-pagina-anterior`, `label-pagina-actual`, `btn-pagina-siguiente`) |
| `splash.html` | — | Ninguno — pantalla 100% automática (redirect por `setTimeout`), sin ningún elemento interactivo real que un test pudiera accionar |
| `errores/404.html` | mismo `.html` | `btn-volver-inicio`, `btn-ir-atras` |
| `errores/500.html` | mismo `.html` | `btn-reintentar`, `btn-volver-inicio` |
| `errores/acceso-denegado.html` | mismo `.html` | `btn-volver-inicio` |
| `errores/sesion-expirada.html` | mismo `.html` | `btn-ir-a-login` |
| `errores/sin-conexion.html` | mismo `.html` | `btn-reintentar`, `btn-volver-inicio` |
| `errores/timeout.html` | mismo `.html` | `btn-reintentar`, `btn-volver-inicio` |

## Totales

- **465** atributos `data-testid` agregados en la pasada original (39 `.html` + 11 `.js`: `otp.js`, `auth.js`, `carrito.js`, `checkout.js`, `catalogo.js`, `pedidos.js`, `comercio.js`, `admin.js`, `cliente.js`, `notificaciones.js`, `explorar.js`) + **5** agregados después en `js/crop.js` para la preparación del spec 06 (ver nota 6) = **470** en total.
- **0** comentarios agregados en ningún archivo (`grep "<!--"` y `grep "//"`/`"/\*"` sobre los archivos tocados, ambos en cero).
- **0** errores de sintaxis (`node --check` sobre copia `.mjs` de los 11 `.js` tocados, método ya usado en Tramo 16.27/16.28 porque `node --check` directo sobre `.js` con `import`/`export` sin `package.json` de tipo módulo no detecta con confiabilidad ciertos errores).

## Dudas resueltas durante esta pasada (ver también `docs/DECISIONES.md`)

1. **Elementos que coexisten en el DOM aunque nunca se muestran juntos** (ej. `estado-exito`/`estado-error` de `verificar-email.html`, o el botón "Reenviar código" del formulario principal vs. el de la pantalla de error): como ambos existen en el DOM al mismo tiempo (solo alternan visibilidad vía `.is-hidden`), un mismo `data-testid` en los dos generaría ambigüedad para Playwright (`getByTestId` encuentra ambos, incluso el oculto). Se resolvió sufijando el segundo con el nombre del estado (`btn-reenviar-codigo-error`, `btn-ir-a-login-error`, `btn-ir-a-login-exito`) en vez de dejarlos duplicados.
2. **Franjas de horario del wizard de registro de comercio** (`crearFilaHorario` en `js/auth.js`): no tienen ningún id real hasta que se guardan (son filas nuevas en un formulario, no filas de un carrito ya persistido), así que no hay ningún identificador único de recurso para usar como sufijo. Se dejaron con `data-testid` repetido sin sufijo (`fila-horario`, `select-dia-horario`, etc.) — exactamente el mismo patrón que ya usan las clases CSS de esas filas (`.horario-dia`, `.horario-apertura`) — para que un test las ubique con `.nth(i)`, un patrón estándar de Playwright para filas genéricas sin id.
3. **Tags como nombre en vez de id** (`chip-tag-${tag}` en `comercio-detalle.html`, catálogo público): el endpoint público de catálogo devuelve el tag como string suelto, no como objeto `{id, nombre}` — a diferencia de `comercio-producto-form.html`/`explorar.html`, que sí trabajan con la entidad `Tag` completa y usan `chip-tag-producto-{id}`/`chip-tag-{id}` (numérico). Se aceptó el nombre crudo como sufijo en los 2 lugares sin id disponible, sin normalizar (sin slug), porque agregar esa lógica sería más que "solo agregar el atributo".
4. **Ícono/botón sin texto en la galería de fotos** (miniaturas del modal de producto, `abrirModalProducto`): no tienen ningún dato que las distinga entre sí más allá del orden — se dejó `btn-miniatura-producto` repetido (mismo criterio que el punto 2) en vez de inventar un índice que ya expone `data-active` por otro lado.
5. **Componentes muy anidados y reutilizados entre roles** (`renderPedidoEstadoHeader`, `renderTopBar`, `pintarEstadoComercio`, `renderEmptyState`, todos en `js/catalogo.js`): al ser funciones compartidas por Cliente y Comercio (y a veces por varias pantallas del mismo rol), se les dio un único `data-testid` genérico (`estado-pedido`, `btn-volver`, `estado-comercio`, `estado-vacio`) que se repite consistentemente en cada pantalla donde se usan — nunca genera ambigüedad porque cada pantalla solo renderiza una instancia visible a la vez (o, en listas, queda anidado dentro de un contenedor con `-{id}` propio, como `pedido-item-{id}` conteniendo `estado-pedido`).
6. **Editor de recorte de imagen (`js/crop.js`) y widget de subida a Cloudinary (`js/cloudinary.js`)**: en la pasada original no se les agregó ningún `data-testid` — quedó explícitamente diferido a cuando se escribiera el spec 06. Resuelto en esa preparación (misma fecha del cierre de spec 06/05): `js/crop.js` sumó 5 testids (`modal-recorte-imagen`, `canvas-recorte`, `input-zoom-recorte`, `btn-cancelar-recorte`, `btn-confirmar-recorte`) siguiendo la convención ya usada (`modal-<proposito>`, `btn-<verbo>-<objeto>`, `input-<campo>`). `js/cloudinary.js` sigue sin ningún `data-testid`: es un módulo de servicio puro (firma + `fetch` a la API de Cloudinary + llamadas al backend), no renderiza ningún elemento DOM propio — no hay nada que un test pudiera seleccionar ahí, la interacción real pasa siempre por `js/crop.js` y por los botones de galería ya cubiertos en `comercio-producto-form.html`.

## Multi-comercio, tramo 5 (Entrega B) — Mercado Pago con varios comercios

Este documento no recogió los `data-testid` de los tramos 2 a 4 del multi-comercio (franja, panel, pantallas de estado: están en sus `MAPEO-ARCHIVOS-TRAMO-MULTICOMERCIO-*`); acá se documentan solo los del tramo 5B. Convención igual que arriba: kebab-case en español, `modal-<proposito>`, `btn-<verbo>-<objeto>`; los repetidos dentro de una lista comparten el testid y se ubican con `.nth()` o `toHaveText([...])`.

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `comercio-perfil.html` (vista de la cuenta de cobro) | `.html` | `mp-estado-cargando` (skeleton mientras llega `GET /oauth/mercadopago/cuenta`), `mp-texto-alcance-sin-vincular` ("Esta cuenta va a cobrar por todos tus comercios"), `mp-lista-comercios-sin-vincular`, `mp-texto-alcance-vinculada` ("Esta cuenta cobra por todos tus comercios"), `mp-lista-comercios-vinculada`. Ya existían: `mp-estado-pendiente`, `mp-estado-vinculado`, `btn-vincular-mercadopago`, `btn-desvincular-mercadopago`, `btn-ir-mercadopago`. |
| ídem | `js/comercio.js` | `mp-comercio-operativo` (un `<li>` por comercio operativo, repetido en las dos listas) |
| Modal de desvincular | `js/comercio.js` (`abrirModalDesvincularMp`) | `modal-desvincular-mp` (reemplaza a `modal-confirmar-desvincular-mp`, que dejó de existir), `esqueleto-desvincular-mp`, `titulo-desvincular-mp` (compartido por la confirmación y el bloqueo), `texto-desvincular-mp`, `bloque-pedidos-en-curso-desvincular-mp`, `linea-pedidos-en-curso-desvincular-mp` (una por comercio con pedidos en curso, repetido), `sin-pedidos-en-curso-desvincular-mp`, `nota-desvincular-mp`, `btn-confirmar-desvincular-mp` (ahora dice "Desvincular"), `btn-cancelar-desvincular-mp` |
| Bloqueo por pedidos sin pagar | `js/comercio.js` | `texto-bloqueo-desvincular-mp`, `pie-bloqueo-desvincular-mp`, `btn-entendido-desvincular-mp` |
| Panel "Tus comercios" | `js/selector-comercio.js` | `aviso-vincular-mercadopago`, `btn-aviso-vincular-mercadopago` ("Vincular cuenta") |

Totales de esta entrega: 19 testids nuevos (más `btn-confirmar-desvincular-mp` y `btn-cancelar-desvincular-mp`, que conservan su nombre) y 1 reemplazado. Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E2 (entrega B) — contexto y panel de solo lectura

Convención igual que arriba (kebab-case en español, `btn-<verbo>-<objeto>`, los repetidos dentro de una lista llevan el id del recurso como sufijo).

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `seleccionar-contexto.html` (selector después del login) | `.html` | `selector-contexto` (contenedor, oculto hasta cargar la lista), `titulo-selector-contexto`, `lista-contextos`, `ayuda-selector-contexto` |
| Selector y hoja "Cambiar de cuenta" | `js/selector-contexto.js` | `fila-contexto-cliente`, `fila-contexto-comercio-{id}`, `fila-contexto-comercio-{id}-subtitulo` y `fila-contexto-cliente-subtitulo` (las filas llevan además `data-resaltada="true"` cuando son el último contexto usado, y `aria-current` cuando son el actual), `etiqueta-estado-contexto-{id}` ("Suspendido" o "Cerrado temporalmente"), `tilde-contexto-actual`, `error-lista-contextos`, `btn-reintentar-contextos` |
| Hoja "Cambiar de cuenta" | `js/selector-contexto.js` | `hoja-cambiar-cuenta`, `titulo-cambiar-cuenta`, `btn-cerrar-hoja-cambiar-cuenta` (la `lista-contextos` de la hoja es la misma que usa el selector) |
| `perfil.html` (Cliente) | `.html` | `btn-cambiar-cuenta` (oculta salvo que el usuario sea Empleado de algún comercio) |
| `comercio-perfil.html` (perfil del Empleado) | `.html` | `btn-cambiar-cuenta`, `insignia-empleado-perfil`, `seccion-datos-comercio-empleado` (ahora en la vista interna "Datos del comercio"), `empleado-descripcion`, `empleado-direccion`, `empleado-telefono`, `empleado-horarios`, `empleado-estado`. `btn-mi-cuenta` y `seccion-cuenta-empleado` se eliminaron en la entrega B6 |
| ídem | `js/comercio.js` | `empleado-horario-{dia}` (`lunes` a `domingo`, un renglón por día) |
| Franja del comercio (Empleado) | `js/selector-comercio.js` | `franja-comercio-insignia-empleado` (el resto de los testids de la franja del Dueño se conserva: `franja-comercio`, `franja-comercio-nombre`, `franja-comercio-chip-cerrado`) |
| Pedidos del Empleado | `js/comercio.js` | `chip-reembolso-pedido` (en la tarjeta de la lista, dentro de `pedido-item-{id}`), `chip-reembolso-detalle` (en el detalle) |

Totales de esta entrega: 31 patrones de `data-testid` nuevos (4 en `seleccionar-contexto.html`, 12 en `js/selector-contexto.js`, 1 en `perfil.html`, 10 en `comercio-perfil.html`, 3 en `js/comercio.js` y 1 en `js/selector-comercio.js`). Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E2 (entrega B6) — perfiles en una sola lista y hoja de pérdida de acceso

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `perfil.html` (Cliente) y `comercio-perfil.html` (Empleado) | `.html` | `lista-perfil` (la lista única de filas; en `comercio-perfil.html` solo existe para el Empleado) |
| `comercio-perfil.html` (Empleado) | `.html` | `btn-ver-datos-comercio` (fila nueva), `btn-volver-perfil-datos-comercio` (volver de la vista "Datos del comercio"); en el contexto Empleado se reutilizan los testids del perfil del Cliente `btn-editar-datos`, `btn-cambiar-password`, `btn-cerrar-sesion`, `input-nombre`, `input-apellido`, `input-telefono`, `input-nombre-usuario`, `input-email`, `input-dni`, `btn-guardar-datos`, `input-password-*`, `btn-guardar-password` y `btn-volver-perfil`/`btn-volver-perfil-password` |
| Hoja de pérdida de acceso | `js/api.js` | `aviso-acceso-perdido` (el fondo de la hoja), `titulo-acceso-perdido`, `texto-acceso-perdido-1`, `texto-acceso-perdido-2`, `btn-entendido-acceso-perdido` |

Totales de esta entrega: 8 patrones nuevos (`lista-perfil`, `btn-ver-datos-comercio`, `btn-volver-perfil-datos-comercio` y los cinco de la hoja); se eliminaron 2 (`btn-mi-cuenta`, `seccion-cuenta-empleado`). Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E3 (entrega B, etapa 1): pedidos del comercio

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `comercio-pedidos.html` y panel | `js/comercio.js` | `aviso-comercio-no-operativo` (aviso del Empleado con el comercio suspendido o cerrado temporalmente), `chip-tu-pedido` (dentro de `pedido-item-{id}`) |
| `comercio-pedido-detalle.html` | `js/comercio.js` | `cargo-servicio-cliente-pedido` (línea "Cargo por servicio del cliente" del Empleado, entre `subtotal-pedido` y `total-pagado-pedido`), `nota-pedido-propio`, `aviso-accion-slot` (contenedor del aviso fijo), `btn-cerrar-no-retirado`, `ayuda-no-retirado`, `recorrido-pedido`, `recorrido-lista`, `recorrido-paso`, `recorrido-texto`, `recorrido-meta`, `recorrido-motivo`, `recorrido-error`; `btn-confirmar-retiro` ahora dice "Entregar" |
| Confirmación de no retirado | `js/comercio.js` | `modal-no-retirado`, `texto-modal-no-retirado`, `btn-confirmar-no-retirado`, `btn-cancelar-no-retirado` |
| Aviso fijo (compartido) | `js/form-utils.js` | `aviso-fijo` (el banner, con `role="alert"`), `aviso-fijo-texto` |

Totales de esta entrega: 17 patrones nuevos. Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E3 (entrega B, etapa 2): edición del comercio, productos y cierre

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `comercio-perfil.html` (Empleado), fila y vista "Editar datos del comercio" | `.html` | `btn-editar-datos-comercio` (fila nueva de la lista), `btn-volver-perfil-editar-datos-comercio`, `mensaje-banner-editar-datos-comercio` (contenedor del aviso fijo), `input-empleado-descripcion`, `input-empleado-telefono`, `mensaje-error-empleado-telefono`, `btn-guardar-datos-comercio` |
| Campos bloqueados de esa vista | `.html` | `titulo-campos-bloqueados` ("Solo el Dueño puede cambiarlos"), `campos-bloqueados` (contenedor), `campo-bloqueado-nombre`, `campo-bloqueado-foto`, `campo-bloqueado-direccion`, `campo-bloqueado-email`, `campo-bloqueado-modalidades` |
| Hoja "Vas a pasar a tu cuenta personal" | `js/comercio.js` | `modal-cuenta-personal`, `btn-continuar-cuenta-personal`, `btn-cancelar-cuenta-personal` |
| `comercio-productos.html` | `.html` | `aviso-productos-slot` (contenedor del aviso fijo de los 409 de la lista) |
| Panel, interruptor de cierre | `js/cierre-comercio.js` | `aviso-cierre-slot` (contenedor del aviso fijo, hermano del slot del interruptor) |

Totales de esta entrega: 18 patrones nuevos. Se eliminó de `comercio-perfil.html` la vista duplicada de datos personales del Empleado (`view-editar-datos`) con sus testids repetidos (`input-nombre`, `input-apellido`, `input-telefono`, `input-nombre-usuario`, `input-email`, `input-dni`, `btn-guardar-datos`, `btn-volver-perfil`, `mensaje-banner` y sus errores), que siguen existiendo una sola vez en `perfil.html` y, para el Dueño, en la vista de edición del comercio. El Empleado ya no tiene `btn-cambiar-password` ni la vista de cambio de contraseña en `comercio-perfil.html`. Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E3 (entrega B, etapa 3): campana y notificaciones

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `notificaciones.html` (Dueño y Empleado) | `js/notificaciones.js` | `btn-marcar-todas-leidas` (botón de texto "Marcar todas" en el encabezado, solo en contextos de comercio) |

Totales de esta entrega: 1 patrón nuevo. La campana del Empleado reutiliza `btn-notificaciones` y `contador-notificaciones` (ya existentes para el Dueño y el Cliente); "Ver pedido" y los avisos conservan `btn-ver-pedido-notificacion-{id}` y `notificacion-item-{id}`. Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E3 (entrega B, etapa 4): pestaña Actividad del Dueño

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `comercio-perfil.html`, vista "Ver equipo" | `.html`, `js/equipo-comercio.js` | `tab-equipo-actividad` (tercera pestaña, sin contador), `equipo-footer` (pie con el botón "Invitar", que se esconde en Actividad) |
| Filtros de la pestaña | `js/equipo-comercio.js` | `actividad-filtros` (grupo de chips), `chip-actividad-todo`, `chip-actividad-pedidos`, `chip-actividad-ediciones`, `chip-actividad-cierres` (todos con `aria-pressed`) |
| Estados de la lista | `js/equipo-comercio.js` | `actividad-contenido` (contenedor, con `aria-busy` mientras carga), `actividad-cargando` (esqueleto), `actividad-error`, `btn-reintentar-actividad`; el estado vacío reutiliza `estado-vacio` |
| Filas | `js/equipo-comercio.js` | `actividad-filas` (contenedor), `actividad-dia` (separador: Hoy, Ayer o fecha), `actividad-fila` (con `data-fuente` y `data-rol`), `actividad-nombre` (no existe en las acciones del Sistema), `actividad-rol` (chip), `actividad-accion`, `actividad-referencia` (entidad y detalle), `actividad-hora`, `actividad-avatar` (iniciales), `actividad-avatar-sistema` (engranaje) |
| Paginación | `js/equipo-comercio.js` | `btn-actividad-ver-mas` |

Totales de esta entrega: 22 patrones nuevos. Las pestañas anteriores conservan `tab-equipo-equipo` y `tab-equipo-solicitudes`. Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E4 (entrega B1): equipo del Dueño con activos e inactivos

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `comercio-perfil.html`, vista "Ver equipo", pestaña "Mi equipo" | `js/equipo-comercio.js` | `equipo-chips` (grupo de chips), `chip-miembros-activos`, `chip-miembros-inactivos` (ambos con `aria-pressed` y el contador en el texto: "Activos · N", "Inactivos · N"), `equipo-miembros-contenido` (contenedor de la lista o del vacío) |
| Fila de miembro (activo o inactivo) | `js/equipo-comercio.js` | `btn-menu-miembro-{empleadoId}` (botón de tres puntitos, `aria-label` "Más acciones de {Nombre}"); la fila conserva `equipo-miembro-{empleadoId}` (con `data-estado`), `equipo-nombre`, `equipo-email` y `equipo-estado` (en un inactivo dice "Dado de baja el DD/MM", "Renunció el DD/MM" o "Inactivo desde el DD/MM") |
| Menú de un miembro (hoja inferior) | `js/equipo-comercio.js` | `menu-miembro-equipo` (hoja), `menu-miembro-titulo`, `menu-miembro-subtitulo` (solo inactivos), `menu-miembro-nota` (solo quien renunció), `btn-desactivar-miembro`, `btn-reactivar-miembro`, `btn-invitar-de-nuevo`, `btn-cerrar-menu-miembro`, `aviso-reactivar-slot` (contenedor del error), `aviso-reactivar` (el aviso, con `role="alert"`) |
| Confirmación de desactivar | `js/equipo-comercio.js` | `hoja-desactivar-miembro`, `titulo-desactivar-miembro`, `texto-desactivar-miembro`, `btn-confirmar-desactivar-miembro`, `btn-volver-desactivar-miembro` |
| Pestaña Actividad, fuente Equipo | `js/equipo-comercio.js` | `chip-actividad-equipo` (quinto chip del grupo `actividad-filtros`), `actividad-icono-{MOTIVO}` (ícono de la línea: `INVITACION`, `INVITACION_CANCELADA`, `ACEPTACION`, `BAJA_DUENO`, `RENUNCIA`, `REACTIVACION`) |

Totales de esta entrega: 22 patrones nuevos. Los toasts de éxito y de error siguen sin `data-testid` (`.toast`, como en el resto de la aplicación). Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E4 (entrega B2): renuncia, pérdida de acceso según la causa

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `comercio-perfil.html` (Empleado), sección "Mi lugar en el equipo" | `.html`, `js/comercio.js` | `seccion-mi-lugar-equipo` (la sección; se quita del DOM para el Dueño), `btn-renunciar-equipo` (botón de texto rojo; nace `disabled`), `texto-ayuda-renuncia` (párrafo de ayuda), `renuncia-ayuda-comercio` (el nombre del comercio dentro del párrafo) |
| Hoja de renuncia | `js/renuncia-empleado.js` | `hoja-renuncia-empleado` (el fondo oscuro), `titulo-renuncia`, `texto-renuncia`, `check-renuncia-entiendo` (casilla), `error-renuncia` (mensaje de error con `role="alert"`, oculto si no hay error), `btn-confirmar-renuncia`, `btn-volver-renuncia` |
| Hoja de pérdida de acceso (en cualquier pantalla de comercio del Empleado) | `js/api.js` | `aviso-acceso-perdido` (el fondo; **suma el atributo `data-causa`** con `BAJA_DUENO`, `RENUNCIA`, `COMERCIO_NO_DISPONIBLE` o `SIN_CAUSA`), `icono-acceso-perdido` (círculo del ícono; con la clase `modal-sheet__icon--danger` solo en la baja del dueño), `titulo-acceso-perdido`, `texto-acceso-perdido-1` (el texto de la causa), `texto-acceso-perdido-2` ("Elegí con qué cuenta seguir."), `btn-entendido-acceso-perdido` |

Totales de esta entrega: 13 patrones nuevos (sin contar el atributo `data-causa` ni los testids que ya existían en la hoja, `aviso-acceso-perdido`, `titulo-acceso-perdido`, `texto-acceso-perdido-1`, `texto-acceso-perdido-2` y `btn-entendido-acceso-perdido`, que se conservan). El aviso "Dejaste de trabajar en {comercio}" es un toast (`.toast`) sin `data-testid`, como el resto. Sin comentarios en ningún archivo tocado.

## Rol Empleado, tramo E4 (entrega B3): equipo del comercio en solo lectura para el Administrador

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| Modal de detalle del comercio (`admin-comercios.html`) | `js/admin.js` | `seccion-equipo-comercio` (la sección "Equipo"; se quita si la lectura falla), `resumen-equipo-comercio` (la fila "Miembros": "2 activos · 1 inactivo"), `btn-ver-equipo-comercio` (enlace primario a la página del equipo). `btn-suspender-comercio` y `btn-cerrar-modal-detalle-comercio` se conservan |
| `admin-comercio-equipo.html` | `.html`, `js/admin-equipo.js` | `btn-volver`, `titulo-equipo`, `equipo-comercio-nombre` (subtítulo; oculto si no se conoce el nombre), `btn-actividad-equipo` (enlace a la Actividad), `equipo-tabs`, `tab-equipo-miembros`, `tab-equipo-solicitudes` (el texto incluye el contador: "Solicitudes 2"), `equipo-lista`, `equipo-cargando` (esqueleto) |
| Pestaña Miembros | `js/admin-equipo.js` | `equipo-chips`, `chip-miembros-activos`, `chip-miembros-inactivos` (el texto lleva el contador: "Activos 2"), `equipo-solo-lectura`, `equipo-miembros-contenido`, `equipo-filas`, `equipo-miembro-{empleadoId}` (la fila, con `data-estado`), `equipo-nombre`, `equipo-email`, `equipo-desde` ("En el equipo desde DD/MM/AAAA", nuevo en `js/equipo-vistas.js`), `equipo-motivo-baja` (la etiqueta del inactivo; clase `equipo-motivo--baja` o `equipo-motivo--renuncia`) |
| Pestaña Solicitudes | `js/admin-equipo.js` | `equipo-solicitudes-texto` (la leyenda), `equipo-solicitudes-contenido`, `equipo-filas`, `equipo-invitacion-{id}` (la fila, con `data-estado`), `equipo-email`, `equipo-invitada` ("Invitada el DD/MM/AAAA"), `equipo-estado` ("Vence en N días", "Vence en 1 día", "Vence hoy", "Vencida…" o "Código bloqueado") |
| Error de carga | `js/admin-equipo.js` | `equipo-error` (el aviso), `btn-reintentar-equipo` (no aparece en el 404 "Comercio no encontrado") |
| `admin-comercio-actividad.html` | `.html`, `js/admin-equipo.js`, `js/equipo-vistas.js` | `btn-volver`, `titulo-actividad`, `equipo-comercio-nombre`, `equipo-lista`; el resto son los de la Actividad del Dueño, que ahora salen de `js/equipo-vistas.js` y no cambian: `actividad-filtros`, `chip-actividad-{todo,pedidos,ediciones,cierres,equipo}`, `actividad-contenido`, `actividad-filas`, `actividad-fila` (con `data-fuente` y `data-rol`), `actividad-dia`, `actividad-nombre`, `actividad-rol`, `actividad-accion`, `actividad-referencia`, `actividad-hora`, `actividad-avatar`, `actividad-avatar-sistema`, `actividad-icono-{MOTIVO}`, `actividad-cargando`, `actividad-error`, `btn-reintentar-actividad`, `btn-actividad-ver-mas` |

Totales de esta entrega: 13 patrones nuevos (`seccion-equipo-comercio`, `resumen-equipo-comercio`, `btn-ver-equipo-comercio`, `btn-actividad-equipo`, `tab-equipo-miembros`, `tab-equipo-solicitudes`, `titulo-actividad`, `equipo-solo-lectura`, `equipo-desde`, `equipo-motivo-baja`, `equipo-solicitudes-texto`, `equipo-solicitudes-contenido` y `equipo-invitada`); el resto se reutiliza de la pantalla del Dueño con el mismo nombre. Sin comentarios en ningún archivo tocado.

## Cierre de E4: `data-testid` del bloque de invitar al equipo (E1) que no figuraban

Hueco heredado de la entrega B3 de E1, detectado al cierre de E4 comparando los `data-testid` de `js/equipo-comercio.js` y `js/equipo-vistas.js` con este documento. No hay cambios de código.

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| Hoja "Invitar al equipo" | `js/equipo-comercio.js` | `hoja-invitar-equipo`, `titulo-invitar-equipo`, `input-email-invitar`, `error-email-invitar` (error bajo el campo), `rechazo-invitar-equipo` con `rechazo-invitar-titulo` y `rechazo-invitar-cuerpo` (aviso fijo del rechazo genérico), `ayuda-invitar-equipo` ("Le llega un código que vale 7 días"), `btn-enviar-invitacion` |
| Hoja "No se pudo invitar" | `js/equipo-comercio.js` | `aviso-no-se-pudo-invitar`, `aviso-no-se-pudo-invitar-titulo`, `aviso-no-se-pudo-invitar-cuerpo`, `btn-cerrar-aviso-no-se-pudo-invitar` |
| Menú y cancelación de una invitación | `js/equipo-comercio.js` | `btn-menu-invitacion-{invitacionId}` (tres puntitos de la fila), `menu-invitacion-equipo` (hoja del menú), `btn-cerrar-menu-invitacion`, `titulo-cancelar-invitacion`, `btn-confirmar-cancelar-invitacion`, `btn-volver-cancelar-invitacion` |
| Detalle de una fila del equipo | `js/equipo-vistas.js` | `equipo-detalle` (segunda línea de la fila: "vence en N días", "En el equipo desde…", etc.) |

## Listado general de comercios del Administrador (estado visible en cada tarjeta)

| Pantalla | Archivo(s) | `data-testid` |
|---|---|---|
| `admin-comercios.html` | `js/admin.js` | `estado-comercio-{comercioId}` (etiqueta de estado de cada tarjeta, con `data-estado` igual al valor del servidor: `PENDIENTE`, `APROBADO`, `APTO_VENTA`, `RECHAZADO`, `RECHAZO_DEFINITIVO`, `SUSPENDIDO`, `CERRADO_TEMPORALMENTE` o `INACTIVO`; clases `status-badge--pendiente`, `--exito`, `--error` o `--neutro` según el estado). El resto (`comercio-admin-item-{id}`, `btn-ver-detalle-comercio-{id}`, `btn-ver-equipo-comercio`, `btn-suspender-comercio`, `btn-cerrar-modal-detalle-comercio`) no cambia. |

## Toasts de éxito (2026-10-15)

No se agregaron `data-testid`: los tests usan el selector `.toast` que ya existía. El componente suma atributos de accesibilidad: `role="status"` y `aria-live="polite"` (`js/catalogo.js`, `showToast`). Los textos nuevos que cubre el spec `62-toasts-exito-ui` son "Comercio cerrado", "Comercio abierto", "Cerraste el comercio" / "Cerraste N comercios", "Marcaste todos los avisos como leídos", "Vaciaste el carrito", "Quitaste {producto} del carrito", "Imagen eliminada", "Orden de las fotos actualizado", "Imagen actualizada", "Imagen agregada" y "Producto descontinuado".

## Registro de Comercio, Tramo 1 (2026-10-18)

| Pantalla | `data-testid` nuevos | `data-testid` que desaparecen |
|---|---|---|
| `registro-comercio.html`, `agregar-comercio.html`, `comercio-corregir.html`, `registro-cliente.html` y la cuenta nueva de `invitacion-empleado.html` | `input-provincia-fija`, `campo-provincia-fija`, `texto-provincia-fija` (provincia de solo lectura; `select-provincia` queda oculto) | `input-email-contacto`, `mensaje-error-email-contacto` (de los tres formularios de comercio) |
| `registro-comercio.html` (paso 2) y `comercio-corregir.html` (paso Legales) | `seccion-datos-adicionales`, `resumen-datos-adicionales` (sección plegable de razón social, tipo de sociedad, condición IVA e inicio de actividades) | — |
| Registro de Cliente, invitación, registro de Comercio y alta adicional | `bloque-terminos`, `enlace-terminos`, `enlace-privacidad` (el componente compartido; `input-acepta-terminos` y `mensaje-error-terminos` se conservan) | — |
| `terminos.html`, `privacidad.html` | `titulo-terminos`, `titulo-privacidad`, `aviso-texto-provisorio`, `enlace-ir-a-privacidad`, `enlace-ir-a-terminos` | — |
| `comercio-perfil.html` | `telefono-comercio-perfil`, `estado-localidad-comercio-perfil` | `email-comercio-perfil`, `input-email-contacto` (edición del Dueño), `campo-bloqueado-email` (vista del Empleado) |

## Registro de Comercio, Tramo 2 (entrega B, 2026-10-19)

| Pantalla | `data-testid` nuevos | `data-testid` que desaparecen |
|---|---|---|
| `registro-comercio.html` (paso 1), `agregar-comercio.html`, `comercio-corregir.html` y `comercio-perfil.html` (edición del Dueño) | `estado-nombre-comercio` (texto "Verificando…" o "Nombre disponible" bajo el campo del nombre) e `icono-estado-nombre-comercio` (ícono de 4 estados: la clase lleva `input-shell__status-icon--verificando`, `--disponible` o `--ocupado`). El texto de ocupado sale por `mensaje-error-nombre`, que ya existía. | — |


## Edición de horarios, Fase 2 T1 entrega B (2026-10-19)

| Pantalla | `data-testid` nuevos | `data-testid` que desaparecen |
|---|---|---|
| `comercio-perfil.html` (vista "Editar horarios", Dueño y Empleado) | `btn-editar-horarios` (la fila de entrada, una sola presente según el rol), `btn-volver-perfil-editar-horarios`, `mensaje-banner-editar-horarios`, `tarjeta-vigencia-horarios`, `horarios-rige-hoy`, `horarios-desde-manana-bloque`, `horarios-desde-manana`, `fila-horario-vigencia`, `btn-cancelar-cambio-horarios`, `aviso-rigen-manana`, `btn-guardar-horarios`; el asistente repite los de `registro-comercio.html` (`tab-horario-fijo`, `tab-horario-personalizado`, `fila-horario`, `btn-agregar-horario`, `mensaje-error-horarios`, `resumen-horarios-cargados`, ...) | — |
| `comercio-perfil.html` ("Ver datos del comercio" del Empleado) | `empleado-horario-pendiente` (una línea por franja del cambio programado) | — |
| `registro-comercio.html`, `agregar-comercio.html`, `comercio-corregir.html` y la vista "Editar horarios" | `leyenda-cruce-horario` (dentro de cada `fila-horario`, visible solo si el cierre es menor que la apertura) y `leyenda-cruce-franja-rapida` (bajo "Desde / Hasta" del horario fijo) | — |


## Precio bloqueado, aviso de precio cambiado y reconfirmación, Fase 2 T3 entrega B (2026-10-22)

| Pantalla | `data-testid` nuevos | `data-testid` que desaparecen |
|---|---|---|
| `comercio-producto-form.html` (edición, Dueño y Empleado) | `icono-precio-bloqueado` (candado a la derecha del campo precio; oculto salvo con el precio bloqueado) y `leyenda-precio-bloqueado` (texto "Se puede cambiar fuera de tu horario de atención" bajo el campo). El `409` de respaldo reutiliza `aviso-fijo` y `aviso-fijo-texto` | — |
| `carrito.html` y `checkout.html` (paso 3) | `item-precio-unitario-{id}` (la línea "$X c/u" de cada ítem), `item-precio-anterior-{id}` (el precio viejo tachado, solo si cambió) e `item-precio-cambio-{id}` (el puntito y "Cambió el precio") | — |
| `checkout.html` (paso 3) | `aviso-total-cambio` (el aviso arriba tras un `409 PRECIO_CAMBIO`) y `btn-confirmar-nuevo-total` (el botón "Confirmar con el nuevo total - $X"; reemplaza al `btn-confirmar-pedido` mientras los montos están actualizados) | `btn-confirmar-pedido` mientras dura el aviso (vuelve a existir si el Cliente recarga) |


## Estadísticas del Dueño, Fase 2 T5 entrega B (2026-10-24)

| Pantalla | `data-testid` nuevos | `data-testid` que desaparecen |
|---|---|---|
| `comercio-dashboard.html` | `btn-estadisticas` (el enlace "Ver estadísticas" debajo de `metricas-dashboard`; solo existe para el Dueño, el Empleado no lo tiene ni oculto) | — |
| `comercio-estadisticas.html` | `estadisticas-rango` (contenedor de los chips), `estadisticas-rango-7`, `estadisticas-rango-30`, `estadisticas-periodo` ("Del 25/09 al 24/10"), `estadisticas-contenido`, `estadisticas-esqueleto`, `estadisticas-cifras`, `estadisticas-vendido`, `estadisticas-comision`, `estadisticas-neto`, `estadisticas-ticket`, `estadisticas-grafico`, `estadisticas-barra` (una por día, con `data-fecha` `AAAA-MM-DD`), `estadisticas-eje-inicio`, `estadisticas-eje-fin`, `estadisticas-detalle`, `estadisticas-detalle-pista`, `estadisticas-detalle-fecha`, `estadisticas-detalle-vendido`, `estadisticas-detalle-pedidos`, `estadisticas-detalle-vacio`, `estadisticas-detalle-turnos`, `estadisticas-turno` (una por turno del día), `estadisticas-resultados`, `estadisticas-resultado` (una por categoría, con `data-categoria`), `estadisticas-vacio`, `estadisticas-vacio-texto`, `estadisticas-ver-30`, `estadisticas-error`, `estadisticas-reintentar` | — |


## Documentos del comercio, Fase 4 entrega B (2026-10-26)

| Pantalla | `data-testid` nuevos | `data-testid` que desaparecen |
|---|---|---|
| `comercio-dashboard.html` (solo Dueño, bloque "Para empezar a vender") | `slot-pasos-vender`, `pasos-vender`, `titulo-pasos-vender`, `lista-pasos-vender`, `paso-aprobado`, `paso-mercadopago`, `paso-documentacion` (cada uno con `data-estado` = `hecho`, `pendiente`, `revision` o `atencion`), `titulo-paso-{aprobado,mercadopago,documentacion}`, `texto-paso-{mercadopago,documentacion}`, `btn-pasos-vincular-mp`, `btn-pasos-subir-documentacion`, `btn-pasos-ver-documentacion`, `aviso-pasos-completos` y `btn-pasos-entendido` (el estado "Todo listo", que se muestra una sola vez) | — |
| Hoja "Tus comercios" (`selector-comercio.js`) | `aviso-pasos-vender` y `btn-aviso-pasos-vender` ("Ver pasos", lleva al panel) | `aviso-vincular-mercadopago`, `btn-aviso-vincular-mercadopago` |
| `comercio-perfil.html` | `btn-ir-documentacion` (fila "Documentación", solo Dueño) | — |
| `comercio-documentacion.html` | `btn-volver-documentacion`, `titulo-documentacion`, `aviso-documentacion`, `contenido-documentacion`, `documentacion-cargando`, `error-documentacion`, `btn-reintentar-documentacion`, `btn-subir-documento`, `explicacion-subida-deshabilitada`, `aviso-sin-documentos`, `tarjeta-que-podes-subir`, `tipo-documento-{CODIGO}`, `leyenda-formatos`, `ayuda-documentos`, `seccion-{rechazados,en-revision,aprobados}`, `titulo-seccion-{rechazados,en-revision,aprobados}`, `lista-documentos-{rechazados,en-revision,aprobados}`, `doc-fila-{id}` (con `data-estado`), `doc-nombre-{id}`, `doc-meta-{id}`, `doc-motivo-{id}`, `btn-ver-documento-{id}`, `btn-eliminar-documento-{id}`, `btn-subir-nuevo-{id}` | — |
| Hoja "Subir documento" | `fondo-hoja-subir`, `hoja-subir-documento`, `titulo-hoja-subir`, `btn-cerrar-hoja-subir`, `banner-hoja-subir`, `form-subir-documento`, `select-documento-tipo`, `error-documento-tipo`, `campo-documento-descripcion`, `input-documento-descripcion`, `error-documento-descripcion`, `input-documento-archivo`, `btn-elegir-archivo`, `fila-archivo-elegido`, `archivo-elegido-nombre`, `archivo-elegido-tamano`, `btn-quitar-archivo`, `ayuda-documento-archivo`, `error-documento-archivo`, `error-subida-documento` (el error del servidor), `btn-subir-documento-confirmar`, `btn-cancelar-subida`, `modal-descartar-documento`, `titulo-descartar-documento`, `btn-seguir-editando-documento`, `btn-descartar-documento` | — |
| Confirmación de eliminar | `modal-eliminar-documento`, `titulo-eliminar-documento`, `texto-eliminar-documento`, `btn-confirmar-eliminar-documento`, `btn-cancelar-eliminar-documento` | — |
| Visor (Dueño y Administrador) | `visor-documento`, `btn-cerrar-visor`, `visor-titulo`, `visor-archivo`, `visor-extra`, `visor-estado`, `visor-escenario`, `visor-cargando`, `visor-imagen`, `visor-pdf`, `visor-ayuda-pdf`, `visor-motivo`, `visor-error`, `btn-visor-reintentar`, `btn-abrir-pestana-nueva`, `btn-visor-subir-nuevo` | — |
| `notificaciones.html` (Dueño) | `btn-ver-destino-notificacion-{id}` (el enlace de los avisos de documentos y de aptitud para vender; el de los pedidos sigue siendo `btn-ver-pedido-notificacion-{id}`) | — |
| `admin-dashboard.html` | `btn-documentos-por-revisar`, `contador-documentos-por-revisar`, `subtitulo-documentos-por-revisar` | — |
| `admin-comercios.html` (modal de detalle) | `btn-ver-documentos-comercio` | — |
| `admin-documentos.html` (bandeja) | `titulo-documentos-revisar`, `resumen-documentos`, `lista-documentos-por-revisar`, `documentos-cargando`, `error-documentos`, `btn-reintentar-documentos`, `estado-vacio`, `estado-vacio-titulo`, `bandeja-documento-{id}`, `bandeja-comercio-{id}`, `bandeja-tipo-{id}`, `bandeja-archivo-{id}`, `bandeja-antiguedad-{id}`, `btn-revisar-documento-{id}` | — |
| `admin-documento-revision.html` | `titulo-revision-documento`, `aviso-revision`, `contenido-revision`, `error-revision`, `btn-reintentar-revision`, `btn-ir-bandeja`, `revision-comercio`, `revision-comercio-nombre`, `revision-dueno`, `revision-mercadopago`, `revision-conteo`, `revision-documento`, `revision-doc-nombre`, `revision-doc-meta`, `revision-doc-estado`, `revision-doc-motivo`, `vista-previa`, `vista-previa-imagen`, `vista-previa-pdf`, `vista-previa-error`, `btn-ver-pantalla-completa`, `btn-aprobar-documento`, `btn-rechazar-documento`, `btn-revocar-documento`, `revision-otros-titulo`, `revision-otros-lista`, `revision-otro-{id}`, `revision-otro-estado-{id}`, `modal-aprobar-documento`, `titulo-aprobar-documento`, `banner-aprobar-documento`, `btn-confirmar-aprobar-documento`, `btn-cancelar-aprobar-documento`, `modal-motivo-documento`, `fondo-modal-motivo-documento`, `titulo-motivo-documento`, `mensaje-motivo-documento`, `input-motivo-documento`, `contador-motivo-documento`, `error-motivo-documento`, `banner-motivo-documento`, `btn-confirmar-motivo-documento`, `btn-cancelar-motivo-documento` | — |

## Suspensión de cuentas del Cliente, Fase 5 S1 entrega B (2026-10-28)

| Pantalla | `data-testid` nuevos | `data-testid` que desaparecen |
|---|---|---|
| `login.html` (hoja inferior de cuenta suspendida, `js/cuenta-suspendida.js`) | `hoja-cuenta-suspendida` (el fondo), `titulo-cuenta-suspendida`, `motivo-cuenta-suspendida`, `acciones-cuenta-suspendida` (el lugar donde S4 suma "Contactar a Soporte"), `btn-cerrar-cuenta-suspendida` | — (el banner de "Cuenta suspendida" del login no tenía `data-testid` propio: usaba `mensaje-banner`) |
| Cualquier página con sesión (pantalla completa de "Tu cuenta fue suspendida") | `pantalla-sesion-suspendida` (el propio `alertdialog`), `titulo-sesion-suspendida`, `motivo-sesion-suspendida`, `que-pasa-ahora`, `que-pasa-pedidos-pagados`, `que-pasa-pedidos-nuevos`, `acciones-sesion-suspendida` (el lugar de S4), `btn-cerrar-sesion-suspendida` | — |
| `admin-clientes.html` | `input-buscar-cliente`, `btn-limpiar-busqueda`, `filtros-clientes`, `filtro-clientes-todos`, `filtro-clientes-suspendidos`, `filtro-clientes-bloqueados`, `filtro-clientes-inactivos`, `filtro-clientes-pendientes`, `contador-clientes`, `clientes-lista`, `clientes-vacio`, `clientes-sin-registros`, `aviso-clientes`, `btn-reintentar-clientes`, `btn-acciones-cliente-{id}`, `menu-acciones-cliente-{id}`, `accion-suspender-{id}`, `accion-levantar-{id}`, `accion-reenviar-{id}`, `email-fallido-{id}` | `cliente-item-{id}` y `estado-cliente` se conservan; cada fila ya no muestra DNI ni fecha de registro (no tenían `data-testid`) |
| Modal "Suspender a {nombre}" | `modal-suspender-cliente` (el `alertdialog`), `modal-suspender-cliente-fondo`, `modal-suspender-cliente-titulo`, `suspender-que-va-a-pasar`, `suspender-previa-cargando`, `input-suspender-motivo`, `contador-suspender-motivo`, `aviso-suspender`, `btn-confirmar-suspender`, `btn-cancelar-suspender` | — |
| Modal "Levantar suspensión" | `modal-levantar-suspension`, `modal-levantar-suspension-fondo`, `modal-levantar-suspension-titulo`, `levantar-suspension-actual`, `levantar-motivo-actual`, `levantar-que-va-a-pasar`, `input-levantar-mensaje`, `contador-levantar-mensaje`, `aviso-levantar`, `btn-confirmar-levantar`, `btn-cancelar-levantar` | — |

## Suspensión individual de un comercio, Fase 5 S2 entrega B1 (2026-10-29)

| Pantalla | `data-testid` nuevos | `data-testid` que desaparecen |
|---|---|---|
| `admin-comercios.html`, modal "Detalle del comercio" (`js/admin-comercio-suspension.js`), bloque de comercio suspendido | `suspension-comercio` (el bloque), `suspension-comercio-estado`, `suspension-comercio-desde`, `suspension-comercio-motivo`, `suspension-comercio-explicacion` (solo con origen `DUENO`), `email-fallido-comercio`, `btn-reenviar-email-comercio`, `btn-levantar-suspension-comercio` (deshabilitado con origen `DUENO`) | — (`btn-suspender-comercio` se conserva; ahora aparece con `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE`, y no con `SUSPENDIDO`) |
| Hoja "Suspender {comercio}" | `modal-suspender-comercio` (el `alertdialog`), `modal-suspender-comercio-fondo`, `modal-suspender-comercio-titulo`, `suspender-comercio-que-va-a-pasar`, `suspender-comercio-previa-cargando`, `input-suspender-comercio-motivo`, `contador-suspender-comercio-motivo`, `aviso-suspender-comercio`, `btn-confirmar-suspender-comercio`, `btn-cancelar-suspender-comercio` | `input-motivo-suspension`, `mensaje-error-motivo-suspension`, `btn-confirmar-suspension`, `btn-cancelar-suspension` (el modal anterior, reemplazado). `modal-suspender-comercio` se conserva como nombre pero ahora es el `alertdialog` de la hoja nueva. |
| Hoja "Levantar suspensión" | `modal-levantar-suspension-comercio`, `modal-levantar-suspension-comercio-fondo`, `modal-levantar-suspension-comercio-titulo`, `levantar-comercio-suspension-actual`, `levantar-comercio-motivo-actual`, `levantar-comercio-que-va-a-pasar`, `input-levantar-comercio-mensaje`, `contador-levantar-comercio-mensaje`, `aviso-levantar-comercio`, `btn-confirmar-levantar-comercio`, `btn-cancelar-levantar-comercio` | — |

## Comercio suspendido en los paneles del Dueño y del Empleado y en las pantallas del Cliente, Fase 5 S2 entrega B2 (2026-10-29)

| Pantalla | `data-testid` nuevos | `data-testid` que cambian o desaparecen |
|---|---|---|
| `comercio-dashboard.html` (Dueño y Empleado), `js/comercio-suspendido.js` | `tarjeta-comercio-suspendido` (en `mensaje-estado-comercio`), `titulo-comercio-suspendido`, `desde-comercio-suspendido` y `motivo-comercio-suspendido` (solo el Dueño), `ayuda-comercio-suspendido` | `aviso-comercio-no-operativo` ya no aparece con el comercio `SUSPENDIDO` (la tarjeta lo reemplaza); con `CERRADO_TEMPORALMENTE` sigue igual para el Empleado |
| Franja del comercio y panel "Tus comercios" (`js/selector-comercio.js`) | `franja-comercio-chip-suspendido`; grupo "Suspendidos" en el panel; `etiqueta-estado-comercio-{id}` también en el comercio activo suspendido | — |
| `comercio-pedidos.html` | `franja-pedidos-suspendido`, `franja-pedidos-suspendido-texto`, `texto-pedido-suspendido` (una línea en cada tarjeta de pedido en curso) | `aviso-comercio-no-operativo` ya no aparece con el comercio `SUSPENDIDO`: lo reemplaza la franja |
| `comercio-pedido-detalle.html` | `texto-pedido-suspendido` (sobre las acciones); `btn-aceptar-pedido` no se crea con el comercio suspendido | — |
| `comercio-perfil.html` | `bloqueo-suspension-editar-perfil-link`, `bloqueo-suspension-editar-horarios-link`, `bloqueo-suspension-editar-comercio-empleado-link`, `bloqueo-suspension-editar-horarios-empleado-link`, `bloqueo-suspension-btn-desvincular-mp` (la frase de cada control bloqueado); los botones `btn-editar-perfil-comercio`, `btn-editar-horarios`, `btn-foto-perfil-comercio`, `btn-editar-datos-comercio` y `btn-desvincular-mercadopago` quedan `disabled` | — |
| `comercio-productos.html` | `aviso-productos-suspendido`; `btn-crear-producto` oculto y sin `btn-acciones-producto-{id}` | — |
| Equipo dentro de `comercio-perfil.html` | `aviso-equipo-solo-lectura`; `equipo-footer` oculto y sin `btn-menu-miembro-*` ni `btn-menu-invitacion-*` | — |
| `pedidos.html` (Cliente) | `aviso-comercio-no-disponible-pedido` (pedido sin pagar con el comercio suspendido), `aviso-cancelado-por-suspension-pedido` (pedido cancelado por la suspensión); `estado-pedido` dice "Sin pagar" en el primer caso | — |
| `pedido-detalle.html` (Cliente) | `franja-comercio-no-disponible`, `ayuda-pago-comercio-no-disponible`; `btn-ir-a-pagar` deshabilitado y `btn-cancelar-pedido` también con un pedido sin pagar; `btn-ver-comercio` no aparece si el comercio ya no está en el catálogo | — |
| `checkout.html` y modal de producto | sin `data-testid` nuevos: el error `COMERCIO_SIN_PEDIDOS` usa `banner-cierre-comercio` y `btn-volver-al-catalogo` (los del cierre del comercio) | — |
| `comercio-documentacion.html` (cierre de S2) | `aviso-comercio-suspendido` (arriba, solo con el comercio suspendido; la explicación `explicacion-subida-deshabilitada` ya no aparece en ese caso porque `btn-subir-documento` queda habilitado) | — |

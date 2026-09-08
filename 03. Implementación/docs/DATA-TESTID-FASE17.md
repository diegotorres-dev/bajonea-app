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
| `comercio-pedido-detalle.html` | `js/comercio.js` + `js/catalogo.js` | `cabecera-estado-pedido`, `estado-pedido`, `numero-pedido`, `motivo-rechazo-pedido`, `nombre-cliente-pedido`, `btn-aceptar-pedido`, `btn-rechazar-pedido`, `modal-rechazar-pedido` (`select-motivo-rechazo`, `mensaje-error-motivo-rechazo`, `input-comentario-rechazo`, `btn-confirmar-rechazo`, `btn-cancelar-rechazo`), `btn-ver-mis-pedidos` (no encontrado) |

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
| `admin-dashboard.html` | mismo `.html` + `js/admin.js` | `nombre-admin`, `btn-comercios-pendientes`, `contador-comercios-pendientes`, `grilla-gestion-admin` (`tile-gestion-comercios`/`-clientes`/`-categorias`/`-tags`), `btn-cerrar-sesion`, `modal-confirmar-logout`, `btn-confirmar-logout`, `btn-cancelar-logout` |
| `admin-comercios-pendientes.html` | mismo `.html` + `js/admin.js` | `btn-volver`, `contador-pendientes`, `lista-comercios-pendientes`, por solicitud: `comercio-pendiente-item-{id}`, `btn-ver-solicitud-{id}` |
| `admin-comercio-detalle.html` | mismo `.html` + `js/admin.js` | `btn-volver`, `detalle-comercio-pendiente`, `btn-rechazar-comercio`, `btn-aprobar-comercio`; modal aprobar: `modal-confirmar-aprobacion`, `btn-confirmar-aprobacion`, `btn-cancelar-aprobacion`; modal rechazar: `modal-rechazar-comercio`, `input-motivo-rechazo-comercio`, `mensaje-error-motivo-rechazo-comercio`, `btn-confirmar-rechazo-comercio`, `btn-cancelar-rechazo-comercio`; no encontrado: `btn-ver-pendientes` |

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
| `comercio-dashboard.html` | mismo `.html` + `js/comercio.js` | `mensaje-estado-comercio`, `mensaje-saludo`, `metricas-dashboard`, `contador-pedidos-activos`, `lista-pedidos-activos` (reutiliza `pedido-item-{id}`/`estado-pedido`/`total-pedido` de `comercio.js`), `btn-notificaciones` |
| `comercio-pendiente.html` | mismo `.html` | `btn-ir-a-inicio` |
| `comercio-rechazado.html` | mismo `.html` | `email-usuario-rechazado`, `btn-cerrar-sesion` |
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

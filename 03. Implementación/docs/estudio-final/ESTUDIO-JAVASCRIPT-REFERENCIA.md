# ESTUDIO — Referencia rápida del JavaScript del frontend

> Material de estudio para el final del TFC Bajoneá. **Referencia superficial, no exhaustiva** —
> pensada para tener a mano por si preguntan algo puntual de JS, no para estudiarla de memoria.
> Basado en `frontend/js/` — **16 archivos, ~8500 líneas**.

---

## Lo primero, para ubicarte

El frontend de Bajoneá es **HTML, CSS y JavaScript puro** — **sin ningún framework**. No hay React,
ni Angular, ni Vue.

**Si te preguntan por qué:** porque el alcance del proyecto no lo justificaba. Un framework agrega
una capa de compilación, dependencias y complejidad que para 40 pantallas con formularios y listados
no aporta nada. Con JS moderno (módulos ES6, `fetch`, `async/await`) alcanza de sobra.

### Los tres conceptos que hay que tener claros

**1. Módulos ES6.** Cada archivo `.js` es un módulo: exporta funciones con `export` y usa las de
otros con `import`.

```javascript
import { apiFetch } from './api.js';
export async function initCatalogo() { ... }
```

**2. `async` / `await`.** Llamar al backend tarda. `async/await` permite escribir código que espera
una respuesta **sin bloquear el navegador**:

```javascript
const productos = await apiFetch('/catalogo/productos');   // espera acá, sin congelar la página
```

**3. El patrón `initXxx()`.** Cada pantalla tiene su función de inicialización, que el HTML importa
y llama. Ejemplo: `catalogo.html` llama a `initCatalogo()`. Ese es el punto de entrada de cada
pantalla.

### Regla del proyecto que conviene saber

**Ningún archivo de `frontend/` tiene comentarios.** Ni de encabezado, ni explicativos, ni código
comentado. Es una regla explícita del proyecto (CLAUDE.md, regla 11), verificada con `grep` sobre
toda la carpeta. Los nombres de función son lo que documenta.

---

# LOS 16 ARCHIVOS, DE UN VISTAZO

| Archivo | Líneas | De qué se ocupa |
|---|:---:|---|
| `api.js` | 148 | **El más importante.** Toda comunicación con el backend pasa por acá. |
| `validators.js` | 286 | Las validaciones de formulario, espejo de las del backend. |
| `auth.js` | 1655 | Login, los dos registros, verificación, recuperación. |
| `catalogo.js` | 1179 | Catálogo, detalle de comercio, y **los componentes compartidos de UI**. |
| `comercio.js` | 1820 | **El más grande.** Todas las pantallas del rol comercio. |
| `admin.js` | 1272 | Todas las pantallas del administrador. |
| `checkout.js` | 381 | El checkout del pedido. |
| `cliente.js` | 350 | Perfil del cliente. |
| `pedidos.js` | 339 | Historial y detalle de pedidos del cliente. |
| `carrito.js` | 295 | La pantalla del carrito. |
| `explorar.js` | 213 | Búsqueda global de productos con filtros. |
| `crop.js` | 162 | El editor de recorte de imágenes. |
| `notificaciones.js` | 145 | La campanita y el listado, con polling. |
| `otp.js` | 122 | El input de código de 6 dígitos. |
| `cloudinary.js` | 106 | Subida de imágenes en dos pasos. |
| `geografia.js` | 47 | El selector Provincia → Localidad. |

---

# 1. `api.js` — el archivo clave

**Si te preguntan una sola cosa de JavaScript, va a ser sobre este archivo.** Es el que centraliza
absolutamente toda la comunicación con el backend.

## Gestión de la sesión

| Función | Qué hace |
|---|---|
| `getToken()` | Devuelve el JWT guardado en `localStorage`. |
| `setSesion(token, usuario)` | Guarda el token y los datos del usuario tras el login. |
| `getUsuario()` | Devuelve el usuario guardado (parseado del JSON). |
| `clearSesion()` | Borra token y usuario — se usa en el logout. |

**Se guarda en `localStorage`**, que es el almacenamiento del navegador que sobrevive al cierre de
la pestaña. Por eso seguís logueado cuando volvés al sitio.

*(Si te preguntan por seguridad: `localStorage` es accesible desde JavaScript, así que un ataque de
XSS podría leer el token. La alternativa más segura son cookies `HttpOnly`, pero requieren manejo de
CSRF y una configuración más compleja. Es un trade-off conocido.)*

## `apiFetch(path, opciones)` — la función más importante de todo el frontend

**Toda** llamada al backend, sin excepción, pasa por acá. Hace seis cosas:

1. **Arma los headers**, incluido `Authorization: Bearer <token>` si estás logueado.
2. **Aplica un timeout de 15 segundos** con `AbortController` — si el backend no responde, corta.
3. **Hace el `fetch`** y parsea la respuesta JSON.
4. **Maneja los errores globalmente** (ver tabla abajo).
5. **Devuelve directamente el `data`** del `ApiResponse`, no el objeto completo.
6. Si algo falla de forma no manejable, **lanza un `ApiError`** con el status y los datos.

### El manejo global de errores — lo mejor de este archivo

```javascript
if (response.status >= 500)                      → redirige a errores/500.html
if (response.status === 401 && teníasToken)      → borra sesión + modal "Sesión cerrada"
if (response.status === 403 && teníasToken)      → redirige a errores/acceso-denegado.html
if (error de red)                                → redirige a errores/sin-conexion.html
if (timeout)                                     → redirige a errores/timeout.html
```

**Por qué esto está buenísimo:** **ninguna pantalla tiene que preocuparse por estos casos**. Están
resueltos en un solo lugar. Si mañana querés cambiar cómo se muestra un error de servidor, tocás
`api.js` y listo — no 40 archivos.

### El modal de "Sesión cerrada" — un detalle de UX que sale del backend

```javascript
function showSesionCerradaModal() {
  crearModalSesionCerrada({
    titulo: 'Sesión cerrada',
    texto: 'Detectamos que iniciaste sesión en otro dispositivo. Por seguridad, tu sesión en este dispositivo fue cerrada automáticamente.',
  });
}
```

**Esto es la contracara visible de la regla de sesión única del backend.** Cuando el
`JwtAuthenticationFilter` rechaza un token porque su sesión está `activa = false`, el frontend
recibe un 401 y **explica por qué**, en vez de tirar al usuario al login sin decir nada.

También existe `mostrarModalCuentaBloqueada()` para el caso de los 3 intentos fallidos.

### `handle401Globally` — el parámetro que evita un bug

```javascript
apiFetch(path, { handle401Globally: false })
```

Sirve para desactivar el manejo automático del 401. **Hace falta en el login**: cuando escribís mal
la contraseña, el backend devuelve 401, y sin este flag el frontend mostraría el modal de "sesión
cerrada"... cuando en realidad nunca hubo sesión. Con el flag, esa pantalla maneja el 401 a su
manera.

---

# 2. `validators.js` — las validaciones del lado del navegador

## El concepto clave: son un espejo, no un reemplazo

**Las validaciones del frontend NO reemplazan a las del backend, las duplican a propósito.**

| | Frontend | Backend |
|---|---|---|
| Para qué | **Experiencia de usuario** — feedback inmediato, sin esperar al servidor | **Seguridad** — es la validación real |
| ¿Se puede saltear? | **Sí**, con las herramientas de desarrollo del navegador | **No** |

**Si te preguntan por qué están duplicadas, esa tabla es la respuesta.** Un atacante puede desactivar
el JavaScript o mandar el request directo con curl. **El backend nunca confía en el frontend.**

## Las validaciones de formato (espejo de las anotaciones custom del backend)

| Función | Qué valida | Equivale en el backend a |
|---|---|---|
| `esEmailValido(email)` | Formato de email | `@ValidarFormatoEmail` |
| `esPasswordSegura(password)` | 8-72, mayúscula, minúscula, número | `@ValidarPasswordSegura` |
| `esCuitValido(cuit)` | 11 dígitos **+ dígito verificador módulo 11** | `@ValidarCuit` |
| `esDniValido(dni)` / `esDniClienteValido(dni)` | 7 u 8 dígitos | `@ValidarFormatoDni` |
| `esTelefonoValido(telefono)` | `+549` + 10 dígitos | `@ValidarTelefonoArgentino` |
| `esNombrePropioValido(valor)` / `esNombreClienteValido(valor)` | Solo letras, espacios, guiones | `@ValidarFormatoNombre` |
| `esCodigoPostalValido(cp)` | 4 dígitos o CPA | `@ValidarCodigoPostalArgentino` |
| `esFechaNacimientoValida(fecha)` | Mayor de 18 | `@MayorDeEdad` |
| `esFechaNacimientoClientePlausible(fecha)` | No futura, no más de 120 años | `@ValidarFechaNacimientoPlausible` |
| `esFechaNoFuturaValida(fecha)` | No puede ser futura | `@PastOrPresent` |
| `esPrecioValido(valor)` | Precio positivo y con formato | `@Positive` + `@Digits` |
| `esUrlRedSocialValida(url)` | Formato de link | El `@Pattern` de `RedSocialRequestDTO` |
| `excedeSubtotalMaximo(precio, cantidad)` | El tope de 99.999.999 | La validación de `PedidoService` |

**El detalle que vale la pena mencionar:** `esCuitValido` **implementa el mismo algoritmo módulo 11
de AFIP** que `CuitValidator.java`, incluida la constante `CUIT_MULTIPLICADORES = [5,4,3,2,7,6,5,4,3,2]`.
El usuario se entera de que el CUIT está mal **mientras lo escribe**, sin esperar el viaje al
servidor.

## Las funciones de normalización (espejo de `TextoUtils.java`)

| Función | Qué hace | Equivale a |
|---|---|---|
| `aTitleCase(valor)` | "JUAN carlos" → "Juan Carlos" | `TextoUtils.aTitleCase` |
| `normalizarCodigoPostal(cp)` | CPA a mayúsculas | `TextoUtils.normalizarCodigoPostal` |
| `normalizarUrlRedSocial(url)` | Le agrega `https://` si falta | `TextoUtils.normalizarUrlConEsquema` |
| `sanitizarDni(dni)` | Saca puntos y guiones | El setter manual del DTO |
| `sanitizarCuit(cuit)` | Deja solo dígitos | El setter manual del DTO |
| `colapsarEspacios(valor)` | "Juan   Carlos" → "Juan Carlos" | El setter manual del DTO |

**Sobre `aTitleCase`:** es la **misma lógica**, portada a mano de Java a JavaScript, para que el
usuario vea en el formulario exactamente lo que se va a guardar. Cuando se agregó en el backend,
**rompió 7 tests de Playwright** que esperaban el texto sin normalizar — es un ejemplo real de por
qué la sincronización importa.

## Las funciones de UI de errores

| Función | Qué hace |
|---|---|
| `mostrarErrorCampo(errorElId, mensaje)` | Pinta el mensaje de error debajo del input. |
| `limpiarErrorCampo(errorElId)` | Lo borra. |
| `limpiarErroresCampos(ids)` | Borra varios de una. |
| `mapearErroresBackend(errores, mapa)` | **Toma el mapa `{campo: mensaje}` del backend y lo pinta en el input correcto.** |
| `validarCamposSilencioso(campos)` | Valida sin mostrar errores — para habilitar/deshabilitar el botón. |
| `validarCamposRequeridosSilencioso(campos)` | Ídem, solo obligatorios. |
| `scrollAlPrimerError(contenedor)` | Lleva la vista al primer campo con error. |
| `calcularFortalezaPassword(password)` | Devuelve un nivel de fortaleza. |
| `aplicarFortalezaPassword(password, barras, label)` | Pinta la barrita de "débil / media / fuerte". |

**`mapearErroresBackend` es la contracara del `data` del `GlobalExceptionHandler`.** El backend
manda `{"email": "Ingresá un email válido", "password": "..."}` y esta función lo pinta debajo de
cada input. **Por eso el handler devuelve un mapa y no solo un string.**

---

# 3. `catalogo.js` — el catálogo Y los componentes compartidos

Este archivo tiene doble función: las pantallas del catálogo **y la biblioteca de componentes
visuales que usa todo el frontend**.

## Los componentes compartidos (los usa medio proyecto)

| Función | Qué hace |
|---|---|
| `renderTopBar(container, opciones)` | Dibuja el header: logo, volver, título, perfil, campanita, y una acción opcional. |
| `renderBottomNav(container, activo)` | La barra de navegación de abajo del cliente. |
| `showToast(mensaje, kind)` | Muestra un mensajito flotante ("Producto agregado"). |
| `renderEmptyState(container, titulo, texto, opciones)` | El estado vacío ("No hay productos todavía"). |
| `renderComercioCard(comercio)` | Dibuja la tarjeta de un comercio en el listado. |
| `pintarAvatarComercio(container, comercio)` | La foto redonda del comercio, con fallback si no tiene. |
| `pintarAvatarUsuario(container, url, texto)` | Ídem para el usuario. |
| `pintarEstadoComercio(el, abierto)` | El puntito verde/gris de "Abierto"/"Cerrado". |
| `renderPedidoEstadoHeader(container, opciones)` | El header de estado del pedido, **compartido entre cliente y comercio**. |
| `actualizarContadorCarrito()` | Actualiza el numerito del carrito en el header. |
| `crearAccionCarritoHeader()` | Arma el botón de carrito del header. |
| `manejarBloqueoPorCambioPassword(error)` | Maneja el caso especial de cuenta bloqueada. |

**Por qué están todos acá y no repetidos en cada pantalla:** un solo cambio actualiza todas las
pantallas a la vez. Cuando se rediseñaron los chips de estado de pedido, se tocó
`renderPedidoEstadoHeader` una vez y quedaron corregidas las pantallas de cliente **y** de comercio.

## `estadoHorario(horarios)` — el espejo de `estaAbiertoAhora` del backend

Calcula, del lado del navegador, si el comercio está abierto ahora mismo, mirando los horarios que
vinieron en el DTO. **Es la misma lógica que `ComercioService.estaAbiertoAhora`**, duplicada para
poder pintar el estado sin una llamada extra.

## Las pantallas

| Función | Pantalla | Qué hace |
|---|---|---|
| `initCatalogo()` | `catalogo.html` / `index.html` | Trae los comercios aprobados, los ordena (abiertos primero) y los pinta con chips de filtro. |
| `initComercioDetalle()` | `comercio-detalle.html` | El perfil del comercio con sus productos, el modal de producto y el stepper de "agregar al carrito". |

---

# 4. `auth.js` — el archivo de autenticación (1655 líneas)

| Función | Pantalla / uso | Qué hace |
|---|---|---|
| `initLogin()` | `login.html` | Valida, llama a `POST /auth/login`, guarda la sesión y redirige según el rol. |
| `resolverHomePorRol(usuario)` | — | Decide a dónde mandar a cada rol tras el login. |
| `initRegistroCliente()` | `registro-cliente.html` | El wizard de registro de cliente, paso por paso. |
| `initRegistroComercio()` | `registro-comercio.html` | **El wizard más complejo:** datos legales, comercio, horarios, redes sociales, representante, foto. |
| `initVerificarEmail()` | `verificar-email.html` | El input de 6 dígitos + reenvío de código. |
| `initRecuperarPasswordSolicitar()` | `recuperar-password.html` | Los 3 pasos: pedir código, validarlo, cambiar la contraseña. |
| `initReactivarCuentaSolicitar()` | `reactivar-cuenta.html` | Los 2 pasos de reactivación. |
| `logout(destino)` | Todas | Llama a `POST /auth/logout`, borra la sesión local y redirige. |
| `construirTelefono(digitos)` | — | **Concatena el prefijo `+549`** antes de mandar. |

## `resolverHomePorRol(usuario)` — el ruteo por rol

Después del login, cada rol va a un lugar distinto:

- **CLIENTE** → el catálogo.
- **ADMINISTRADOR** → `admin-dashboard.html`.
- **DUENO** → depende del **estado de su comercio**: si está aprobado, al dashboard; si está
  pendiente o rechazado, a las pantallas correspondientes.

**Es un guard de negocio, no solo de rol.** `SecurityConfig` protege por rol, pero **no** por estado
del comercio — eso lo resuelve el frontend.

## `construirTelefono(digitos)` — el par de `@ValidarTelefonoArgentino`

El campo del prefijo `+549` en el HTML **no es editable**; esta función lo concatena antes de
enviar. **Por eso el backend puede rechazar un teléfono sin prefijo en vez de completarlo:** desde
la app propia siempre viene bien, así que un valor sin prefijo solo puede venir de un cliente de API
fuera de contrato.

## Las constantes de etiquetas

```javascript
export const LABELS_TIPO_SOCIEDAD = { SA: 'Sociedad Anónima', SRL: '...' }
export const LABELS_CONDICION_IVA = { ... }
export const LABELS_TIPO_COMERCIO = { ... }
export const LABELS_TIPO_RED_SOCIAL = { ... }
```

**Traducen los valores técnicos de los enums a texto legible.** El backend manda
`RESPONSABLE_INSCRIPTO`; el usuario lee "Responsable Inscripto".

*(Es la misma idea que `MotivoRechazo.getEtiqueta()` del backend, resuelta acá del lado del cliente
para los enums que no tienen etiqueta propia.)*

---

# 5. `comercio.js` — el archivo más grande (1820 líneas)

| Función | Pantalla | Qué hace |
|---|---|---|
| `initComercioEstadoPagina(estadoEsperado)` | Todas | **Guard de estado:** verifica que el comercio esté en el estado que esa pantalla espera. |
| `initComercioDashboard()` | `comercio-dashboard.html` | Trae el resumen del día y los pedidos activos. |
| `initComercioPedidos()` | `comercio-pedidos.html` | Lista los pedidos con chips de filtro por estado. |
| `initComercioPedidoDetalle()` | `comercio-pedido-detalle.html` | El detalle, con aceptar/rechazar **solo si está `PENDIENTE`**. |
| `initComercioPerfil()` | `comercio-perfil.html` | Ver y editar el perfil, incluida la foto. |
| `initComercioProductos()` | `comercio-productos.html` | El listado de productos del comercio. |
| `initComercioProductoForm()` | `comercio-producto-form.html` | Alta y edición de producto, con la galería. |
| `renderBottomNavComercio(container, activo)` | — | La barra de navegación del comercio. |

## `initComercioEstadoPagina(estadoEsperado)` — el guard que el backend no hace

**Por qué existe:** `SecurityConfig` protege las rutas **por rol**, pero un dueño con comercio
`PENDIENTE` tiene el mismo rol `DUENO` que uno aprobado. **El backend no distingue.**

Esta función consulta el perfil del comercio y, si el estado no es el que la pantalla espera,
redirige (a "pendiente de aprobación" o a "rechazado").

**Ojo con cómo lo contás:** *"es un guard de experiencia de usuario, no de seguridad"*. La seguridad
real está en el backend: aunque alguien saltee esta pantalla a mano, `validarAceptaPedidos` del
`ComercioService` no lo va a dejar operar.

## Un detalle de diseño de `initComercioPedidoDetalle`

**Cuando el pedido está `EN_PREPARACION`, la pantalla no muestra ningún botón de acción.**

Es a propósito: `EstadoPedido` no tiene ninguna transición implementada después de
`EN_PREPARACION` (no existe "marcar como entregado"). **Mostrar un botón que no hace nada sería
peor que no mostrarlo.** Es el mismo criterio con el que se omitió la campanita del header de
administrador — no hay ninguna notificación que apunte a un admin, así que un ícono siempre en cero
sería un control sin función.

---

# 6. `admin.js` — el panel de administrador (1272 líneas)

| Función | Pantalla | Qué hace |
|---|---|---|
| `initAdminDashboard()` | `admin-dashboard.html` | Las métricas y los accesos rápidos. |
| `initAdminComerciosPendientes()` | `admin-comercios-pendientes.html` | La cola de aprobación. |
| `initAdminComercioDetalle()` | `admin-comercio-detalle.html` | La ficha completa + modales de aprobar/rechazar. |
| `initAdminComercios()` | `admin-comercios.html` | Los comercios aprobados, con modal de detalle. |
| `initAdminClientes()` | `admin-clientes.html` | El listado de clientes (solo lectura). |
| `initAdminCategorias()` | `admin-categorias.html` | CRUD de categorías. |
| `initAdminTags()` | `admin-tags.html` | CRUD de tags. |

**El flujo de rechazo** pide el motivo en un modal, con el campo obligatorio — el espejo de la
validación de `AdministradorService.resolverAprobacion`.

---

# 7. `carrito.js`, `checkout.js`, `pedidos.js`, `cliente.js`, `explorar.js`

| Archivo | Función principal | Qué hace |
|---|---|---|
| `carrito.js` | `initCarrito()` | Muestra el carrito con foto de cada producto, permite cambiar cantidades, eliminar, y vaciar. |
| `checkout.js` | `initCheckout()` | Elegir delivery o retiro, mostrar la dirección, confirmar el pedido. |
| `pedidos.js` | `initPedidosHistorial()` | El historial de pedidos del cliente. |
| `pedidos.js` | `initPedidoDetalle()` | El detalle de un pedido puntual. |
| `cliente.js` | `initPerfil()` | Ver y editar el perfil, con foto y cambio de contraseña. |
| `explorar.js` | `initExplorar()` | Búsqueda global de productos con filtros por categoría y tags. |

## Dos detalles de implementación que pueden preguntarte

**1. `initPedidoDetalle` no llama a un endpoint de detalle.** No existe `GET /pedidos/{id}`, así que
llama a `GET /pedidos/cliente` (que ya viene filtrado por el JWT) y **busca el pedido en la lista**.

**El beneficio:** como el listado ya está filtrado por el backend, **es imposible que te devuelva
un pedido ajeno**. Un endpoint por id tendría que verificar el dueño a mano.

**2. `carrito.js` tiene un `try/catch` que corrige un bug real.** Cuando se agregó la foto del
producto a cada línea del carrito, había que traerla con
`GET /catalogo/comercios/{id}/productos`. Pero si tenías un carrito viejo de un comercio que ya
**no está aprobado**, ese endpoint devuelve 404 y **la pantalla entera quedaba en blanco**. Se
resolvió con un `try/catch` que degrada a "sin foto" en vez de romper.

---

# 8. `notificaciones.js` — el polling

| Función | Qué hace |
|---|---|
| `initNotificaciones()` | Lista las notificaciones y permite marcarlas como leídas. |

## El polling — pregunta probable

El archivo tiene un `setInterval` que **cada 15 segundos** llama a
`GET /notificaciones/no-leidas/contador` y actualiza el numerito de la campanita.

```
cada 15s → GET /notificaciones/no-leidas/contador → actualiza el badge
```

**No es tiempo real de verdad.** La alternativa serían **WebSockets** (el servidor te avisa cuando
pasa algo), que es instantáneo pero mucho más complejo: requiere mantener una conexión abierta por
usuario y manejar reconexiones.

**Por qué polling alcanza acá:** la escala es chica y 15 segundos de demora en enterarte de un
pedido no rompe nada. Es la decisión de "lo simple que funciona" en vez de "lo sofisticado que no
hacía falta".

**Lo que sí se optimizó:** el polling llama al endpoint del **contador**, que devuelve solo un
número. La lista completa se trae únicamente cuando el usuario abre la campanita.

---

# 9. `cloudinary.js` — la subida de imágenes

| Función | Qué hace |
|---|---|
| `validarArchivoImagen(file)` | **Antes de subir:** valida tipo (jpg/png/webp) y tamaño (máx. 5 MB). |
| `subirImagenProducto(productoId, file, opciones)` | El flujo completo de 2 pasos para una imagen de producto. |
| `subirFotoPerfilComercio(file)` | Ídem para la foto del comercio. |
| `subirFotoPerfilUsuario(usuarioId, file)` | Ídem para la foto del usuario. |
| `subirFotoPerfilRegistroComercio(file)` | Durante el registro (sin login). |
| `subirFotoPerfilRegistroCliente(file)` | Ídem para cliente. |
| `eliminarImagenProducto(productoId, imagenId)` | Borra una imagen. |
| `reordenarImagenProducto(productoId, imagenId, orden)` | Cambia el orden. |
| `recortarImagenProducto(productoId, imagenId, file)` | Sube la versión recortada. |
| `eliminarFotoPerfilUsuario(usuarioId)` | Saca la foto de perfil. |

## `subirArchivoConFirma(firma, file)` — el corazón del flujo

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('api_key', firma.apiKey);
formData.append('timestamp', String(firma.timestamp));
formData.append('signature', firma.signature);
formData.append('folder', firma.folder);
formData.append('upload_preset', firma.uploadPreset);

await fetch(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
  method: 'POST', body: formData
});
```

**Fijate a dónde apunta el `fetch`: a `api.cloudinary.com`, NO al backend de Bajoneá.**

Eso es la prueba concreta de que **el archivo nunca pasa por el servidor propio**. El flujo es:

```
1. Frontend  →  Backend:     "dame una firma"        (POST .../firma)
2. Backend   →  Frontend:    la firma + metadatos
3. Frontend  →  Cloudinary:  el archivo + la firma   (POST directo)
4. Cloudinary→  Frontend:    la URL de la imagen
5. Frontend  →  Backend:     "guardá esta URL"       (POST/PUT/PATCH)
```

**Ventajas:** el servidor no gasta ancho de banda ni disco, y la firma —atada a una carpeta
específica— garantiza que la imagen se guarde donde corresponde.

## Validación duplicada, otra vez

`validarArchivoImagen` chequea tipo y tamaño **antes** de subir. Es UX: le avisás al usuario al
instante en vez de esperar a que suba 8 MB para que Cloudinary lo rechace.

**Pero la validación real está en el Upload Preset de Cloudinary**, configurado del lado del
servicio. El frontend valida por cortesía; **Cloudinary valida de verdad**.

---

# 10. `geografia.js` — el selector dependiente

| Función | Qué hace |
|---|---|
| `initGeografiaSelects(provinciaSelect, localidadSelect, provinciaPreferida)` | Arma el par de selectores. |
| `cargarLocalidades(provinciaId, localidadSelect)` (interna) | Trae las localidades de una provincia. |

**Cómo funciona el selector dependiente:**

1. Al arrancar, el selector de localidad está **deshabilitado**, con el texto "Elegí una provincia
   primero".
2. Se cargan las 24 provincias con `GET /geografia/provincias`.
3. Al cambiar la provincia, se dispara `cargarLocalidades`, que muestra "Cargando localidades..." y
   trae `GET /geografia/localidades?provinciaId=X`.
4. Recién ahí se habilita el selector de localidad.

**El parámetro `provinciaPreferida`** permite preseleccionar Tierra del Fuego, que es donde opera
Bajoneá. Un detalle chico de usabilidad: la mayoría de los usuarios no tiene que buscar su
provincia.

---

# 11. `otp.js` — el input de código de 6 dígitos

| Función | Qué devuelve |
|---|---|
| `crearInputOtp(container, { onComplete })` | Un objeto con métodos para controlar el input. |

**Los métodos del objeto que devuelve:** `getValor()`, `focus()`, `reset()`, `marcarError()`,
`marcarExito()`, `setDisabled(bool)`.

## Los detalles de usabilidad que tiene (más de los que parece)

- **Avanza solo:** escribís un dígito y el foco salta a la casilla siguiente.
- **Retrocede con Backspace:** si la casilla está vacía y apretás borrar, vuelve a la anterior.
- **Pegar funciona:** si copiás el código de 6 dígitos del mail y lo pegás, se reparte entre las 6
  casillas solo.
- **Solo números:** `input.value.replace(/\D/g, '')` filtra cualquier letra en el momento.
- **`autocomplete="one-time-code"`** en la primera casilla: en un celular, el sistema operativo
  **ofrece el código del SMS/mail automáticamente**.
- **`onComplete`** dispara la validación sola al completar los 6 dígitos, sin apretar ningún botón.
- **Estados visuales:** `marcarError()` pinta las casillas de rojo, `marcarExito()` de verde.

**Es un componente reutilizado en 3 pantallas:** verificación de email, recuperación de contraseña y
reactivación de cuenta. Es el correlato visual de los códigos de 6 dígitos que genera
`AuthService.generarValorToken`.

---

# 12. `crop.js` — el editor de recorte

| Función | Qué hace |
|---|---|
| `abrirEditorRecorte({ origen, aspectRatio, onConfirmar, onCancelar })` | Abre el modal para recortar una imagen antes de subirla. |

**Para qué sirve:** las fotos de producto se muestran en formato **4:3**. Si el usuario sube una foto
vertical, se vería mal recortada automáticamente. Este editor le deja **elegir qué parte se ve**.

**El `aspectRatio` está fijado en 4:3**, y de ahí sale el texto de "resolución recomendada:
1200×900px" que aparece en el formulario de producto — no es un número inventado, se deriva del
recorte real.

Usa los endpoints `/recorte/firma` y `/url` de `ProductoController`: sube la versión recortada como
un archivo nuevo y reemplaza la URL de la imagen existente.

---

# Preguntas típicas de mesa sobre el frontend

**"¿Usaste algún framework?"**
No, HTML, CSS y JavaScript puro con módulos ES6. Para el alcance del proyecto —formularios y
listados— un framework agregaba complejidad sin aportar nada.

**"¿Cómo hacés las llamadas al backend?"**
Todo pasa por una función `apiFetch` en `api.js`, que arma el header con el JWT, aplica un timeout
de 15 segundos, y maneja globalmente los errores 401, 403, 500, sin conexión y timeout. Ninguna
pantalla repite ese código.

**"¿Dónde guardás el token?"**
En `localStorage`, así sobrevive al cierre de la pestaña. La contrapartida es que es accesible desde
JavaScript; una cookie `HttpOnly` sería más segura pero requiere manejar CSRF.

**"¿Por qué validás en el frontend si ya validás en el backend?"**
Son propósitos distintos: el frontend valida para dar feedback inmediato al usuario, el backend
valida por seguridad. Las del frontend se pueden saltear con las herramientas de desarrollo; el
backend nunca confía en lo que le llega.

**"¿Cómo funcionan las notificaciones?"**
Con polling: un `setInterval` que cada 15 segundos consulta el contador de no leídas. No es tiempo
real; la alternativa serían WebSockets, más complejos de lo que este proyecto necesita.

**"¿Cómo subís las imágenes?"**
En dos pasos: el frontend pide una firma al backend, sube el archivo **directo a Cloudinary** con
esa firma, y después le manda al backend solo la URL. El `fetch` de subida apunta a
`api.cloudinary.com`, no a mi servidor.

**"¿Qué es el patrón `initXxx`?"**
Cada pantalla exporta una función de inicialización que su HTML importa y llama. Es el punto de
entrada de esa pantalla: trae los datos, pinta el DOM y engancha los eventos.

---

# Índice de archivos cubiertos en este documento

| Archivo | En una línea |
|---|---|
| `api.js` | `apiFetch` + gestión de sesión + manejo global de errores. **El más importante.** |
| `validators.js` | Las validaciones y normalizaciones, espejo de las del backend. |
| `auth.js` | Login, los dos registros, verificación, recuperación, logout. |
| `catalogo.js` | Catálogo, detalle de comercio, y los componentes visuales compartidos. |
| `comercio.js` | Todas las pantallas del rol comercio. El archivo más grande. |
| `admin.js` | Todas las pantallas del administrador. |
| `carrito.js` | La pantalla del carrito. |
| `checkout.js` | La confirmación del pedido. |
| `pedidos.js` | Historial y detalle de pedidos del cliente. |
| `cliente.js` | Perfil del cliente. |
| `explorar.js` | Búsqueda global con filtros. |
| `notificaciones.js` | La campanita y el listado, con polling cada 15 s. |
| `cloudinary.js` | La subida de imágenes en dos pasos. |
| `geografia.js` | El selector dependiente Provincia → Localidad. |
| `otp.js` | El input de código de 6 dígitos, reutilizado en 3 pantallas. |
| `crop.js` | El editor de recorte 4:3. |

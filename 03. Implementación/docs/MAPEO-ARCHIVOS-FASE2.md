# Mapeo de archivos — Fase 2 (Capitalize + orden de validaciones)

Detalle de qué archivos se tocaron en cada bloque de la Fase 2 y por qué. Fuente de verdad de las
decisiones y evidencia completa: `docs/DECISIONES.md`, entradas del 2026-08-31.

---

## Bloque 2.1 — Normalización "Capitalize"

### Backend — nuevo util + 4 Services

| Archivo | Cambio | Por qué |
|---|---|---|
| `backend/src/main/java/com/bajonea/backend/util/TextoUtils.java` | Archivo nuevo. `TextoUtils.aTitleCase(String)`, algoritmo carácter por carácter (mismo criterio de delimitador de palabra — espacio, guion, apóstrofe, slash — que la versión JS). | No existía ninguna clase de utilidades de texto en el backend; todo el mapeo de los Services es manual (sin `@PrePersist`/`@PreUpdate` en ninguna entidad del proyecto), así que el punto de normalización correcto es el Service, no la Entity. Una única función reutilizada en los 7 puntos, en vez de repetir la lógica. |
| `backend/.../services/RegistroService.java` | `TextoUtils.aTitleCase(...)` envolviendo `request.getNombre()`/`getApellido()` (Cliente y representante), `request.getRazonSocial()`, `request.getNombre()` (Comercio) y `request.getCalle()` (en `construirDireccion`, compartido por ambos flujos de alta). | Único punto de alta de `PersonaFisica`, `PersonaJuridica`, `Comercio` y `Direccion` — 5 de los 7 puntos de persistencia caen acá. |
| `backend/.../services/ClienteService.java` | `TextoUtils.aTitleCase(...)` en `editarPerfil()`, campos `nombre`/`apellido`. | Único endpoint de edición de datos personales del Cliente. |
| `backend/.../services/ComercioService.java` | `TextoUtils.aTitleCase(...)` en `editarPerfil()`, campo `nombre`. | Único endpoint de edición de perfil del Comercio (no incluye `razonSocial` ni dirección — ver nota abajo). |
| `backend/.../services/ProductoService.java` | `TextoUtils.aTitleCase(...)` en `crearProducto()` y `editarProducto()`, campo `nombre`. | Los 2 únicos puntos de persistencia de `Producto.nombre`. |

**Confirmado con Diego antes de tocar código:** `Direccion.calle` (más allá del alta),
`PersonaJuridica.razonSocial` y el `nombre`/`apellido` del representante de un Comercio no tienen
ningún endpoint de edición hoy — es una exclusión de diseño ya documentada (`ComercioPerfilRequestDTO`
lo dice en su propio Javadoc), no un hueco de esta fase. El Capitalize en el alta les alcanza.

**Excluido a propósito:** `Producto.descripcion` y `Comercio.descripcion` — nunca se les aplica
`TextoUtils.aTitleCase`, verificado con `SELECT` real que quedan intactas.

### Frontend — helper nuevo + 8 archivos con puntos de recepción de `apiFetch`

| Archivo | Cambio | Por qué |
|---|---|---|
| `frontend/js/validators.js` | `normalizarCampos(objeto, campos)` nuevo — reusa `aTitleCase()`, ya existente, sin tocarla. | Un solo helper reutilizado en los 8 archivos de abajo, en vez de repetir `objeto.campo = aTitleCase(objeto.campo)` en cada punto. |
| `frontend/js/cliente.js` | `normalizarCampos(...)` tras `GET`/`PUT /clientes/perfil` (`nombre`, `apellido`, `direccion.calle`). | Perfil propio del Cliente — 2 puntos de recepción. |
| `frontend/js/catalogo.js` | `normalizarCampos(...)` tras `GET /clientes/perfil` (saludo, avatar), `GET /catalogo/comercios` (lista, 2 puntos), `GET /catalogo/comercios/{id}/productos` (2 puntos), `GET /carrito` (conflicto de comercio). | Módulo compartido por el resto de las pantallas de Cliente (home, detalle de comercio, header). |
| `frontend/js/comercio.js` | Helpers locales `normalizarComercio()`/`normalizarPedido()`; aplicados tras cada `GET`/`PUT /comercios/perfil`, `GET`/`PUT /pedidos/comercio*` (listado, detalle, aceptar, rechazar, resumen-hoy) y `GET`/`POST`/`PATCH /productos*` (listado, form de edición, cambio de estado). | El archivo con más puntos de recepción (dashboard, perfil, productos y pedidos del rol Comercio). |
| `frontend/js/admin.js` | Helper local `normalizarComercioAdmin()`; aplicado tras `GET /administrador/perfil`, `GET /administrador/comercios/pendientes` (2 puntos), `GET /administrador/comercios`, `GET /administrador/clientes`. | Perfil de Admin + los 3 listados de comercios/clientes. `GET /categorias`/`GET /tags` explícitamente sin tocar (fuera de los 5 campos). |
| `frontend/js/pedidos.js` | Helpers locales `normalizarPedido()`/`normalizarComercios()`; aplicados en los 2 puntos (`Promise.all` de historial y detalle) que traen `pedidos` + `comercios`. | Historial y detalle de pedido del Cliente. |
| `frontend/js/checkout.js` | `normalizarCampos(...)` tras `GET /carrito`, `GET /catalogo/comercios`, `GET /clientes/perfil` y la respuesta de `POST /pedidos/cliente`. | Flujo de checkout completo. |
| `frontend/js/carrito.js` | `normalizarCampos(...)` centralizado dentro de `pintar(carrito)` (cubre `nombreComercio` del carrito y `nombreProducto` de cada ítem, sin importar si `carrito` llega del `GET` inicial o de una respuesta de alta/baja de ítem) + normalización de `comercios`/`productos` cacheados. | Único punto de render del carrito, reusado por las 3 vías de entrada (carga inicial, agregar, quitar). |
| `frontend/js/explorar.js` | `normalizarCampos(...)` tras `GET /catalogo/productos` (`nombre`, `nombreComercio` de cada resultado). | Búsqueda/exploración global de productos. |

**No se tocó** `frontend/js/auth.js` (no muestra datos ya persistidos, solo formularios de alta) ni
`frontend/js/geografia.js` (Provincia/Localidad, fuera de alcance).

**Evidencia de cierre:** `SELECT` real contra `bajonea_final` en los 7 puntos de backend (alta y
edición, Cliente + Comercio + Producto), verificación visual en el navegador real con datos
"sucios" insertados por SQL directo (para probar la capa defensiva independientemente del fix de
backend) en `index.html`, `perfil.html`, `comercio-perfil.html` y `comercio-productos.html`, y
`node --check` en verde en los 10 archivos tocados. Detalle completo, incluida una limitación de
caché del panel del navegador sorteada durante la verificación, en `docs/DECISIONES.md`.
**Pendiente de confirmación explícita de Diego para darse por cerrado.**

---

## Bloque 2.2 — Orden de validaciones (obligatorio antes que específico)

| Archivo | Cambio | Por qué |
|---|---|---|
| `frontend/js/auth.js` | Helper nuevo `validarCampoRequeridoYValido(...)`; reemplaza las 2 llamadas a `validarCampo(...)` de `fechaInicioActividades`/`fechaNacimientoRepresentante` dentro del array de validación del botón "Continuar" del paso 2. | Casos 1 y 2 tal como los describía el pedido: el validador específico (`esFechaNoFuturaValida`/`esFechaNacimientoValida`) también devuelve `false` en vacío, mostrando el mensaje equivocado. |
| `frontend/js/auth.js` | Una línea: `.filter((r) => r.tipo \|\| r.url)` agregado a la captura de `recolectarRedesSociales()`. | Caso 3 — diagnóstico real distinto del asumido en el prompt original: el chequeo de "0 filas" ya existía y ya estaba en el orden correcto, pero nunca se disparaba porque el formulario arranca con 1 fila vacía en el DOM (nunca hay "0 filas" en sentido literal). El fix es filtrar las filas sin ningún dato antes de contarlas, no reordenar nada. |

**No se tocó ningún archivo de backend** — la corrección es puramente de orden/lógica de
validación del lado del cliente; la regla de negocio real (mínimo 1 red social activa, validada a
nivel aplicación) no cambia.

**Evidencia de cierre:** verificación en el navegador real saltando directamente a los pasos 2 y 4
del wizard (manipulación de las clases `is-hidden` de cada `step-N`, mismo efecto que la función
privada `mostrarPaso()`, sin bypasear ninguna validación real) — 9 sub-casos confirmados leyendo
el `textContent` real del nodo de error/banner correspondiente (vacío → obligatorio; valor
inválido → mensaje específico; valor válido → sin error, por cada uno de los 3 campos). Detalle
completo en `docs/DECISIONES.md`. **Pendiente de confirmación explícita de Diego para darse por
cerrado.**

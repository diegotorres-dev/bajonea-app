# Mapeo pantallas ↔ archivos — Tramo 16.18 (crítico: validaciones de registro-comercio y alta de producto con fotos)

Primer sub-tramo del testing manual de Comercio (post-cierre de Fase 16), continuación directa del mismo patrón ya usado para Cliente en los Tramos 16.12-16.17. Cubre los puntos 1, 2, 5 y 6 del relevamiento original de bugs de Comercio. Se mapea punto↔archivos en vez de pantalla↔archivos, mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO16.12.md`.

Todo lo documentado acá fue verificado con interacción real en navegador (2 navegadores — Claude_Browser y Claude en Chrome, por una limitación real de subida de archivos de la primera) contra el backend real (perfil `test`, credenciales reales de Cloudinary, MySQL real) — ver `docs/DECISIONES.md`, entrada "Tramo 16.18" del 2026-07-29, para el detalle completo de decisiones y evidencia.

---

## Punto 1 — Validaciones reales de `registro-comercio.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/validators.js` | 4 funciones nuevas: `esCuitValido` (puerto exacto del algoritmo módulo 11 de `CuitValidator.java`), `esTextoConContenidoValido` (mismo criterio que `esCalleValida`, reusado para `nombre`/`razonSocial`/`domicilioFiscal`), `esFechaNoFuturaValida`, `esNombreProductoValido` (ver Punto 5). |
| `frontend/js/auth.js` (`initRegistroComercio`) | Reescrito completo con el patrón ya validado en `initRegistroCliente` (Tramo 16.12): `bindValidacionCampo` (blur en tiempo real) + `validarCampo` (bloqueo real en "Continuar") para los 19 campos de los 2 primeros pasos. `CAMPOS_STEP2_BACKEND_COMERCIO` nuevo para mapear errores 400 del backend al paso correcto. |
| `backend/.../dto/request/RegistroComercioRequestDTO.java` | `@Pattern` nuevo (`.*[\p{L}0-9].*`, mismo regex que `DireccionRequestDTO.calle`) en `nombre`, `razonSocial`, `domicilioFiscal` — bloquea "solo símbolos", que antes pasaba `@NotBlank` sin problema. `emailContacto` suma el mismo `@Pattern` de dominio-con-punto que ya tenía `email`. |

---

## Punto 2 — Reorden de secciones (Negocio → Legales → Horarios) + AFIP → ARCA

| Archivo | Cambio |
|---|---|
| `frontend/registro-comercio.html` | Wizard de 2 a 3 pasos reales: step-1 "Negocio" (sin cambios de campos), step-2 "Legales" (razón social...domicilio fiscal, representante, acceso a la plataforma) con botón "Continuar" (no submit), step-3 "Horarios" nuevo con el submit real. `step-progress` pasa de 2 a 3 barras/labels. Placeholder de `domicilioFiscal`: "...declarada ante AFIP" → "...ante ARCA" (único texto visible que mencionaba el organismo). |
| `frontend/js/auth.js` | `steps` array de `initRegistroComercio` extendido a 3 elementos; `back-btn` generalizado a "retroceder un paso cualquiera sea el actual" (antes solo distinguía paso 0/1); `continuar-btn-2` nuevo (valida Legales, avanza a Horarios sin submit); submit real movido al nuevo `form-step-3`. |

---

## Puntos 5/6 — Fotos de producto en la creación (no solo edición) + redirección correcta al crear

**Decisión de diseño (ver `docs/DECISIONES.md` para el detalle completo):** dado que `POST /productos/{id}/cloudinary/firma` firma la subida scoped al `productoId` real (Fase 11), es técnicamente imposible subir a Cloudinary antes de que el producto exista — las fotos quedan *staged* en el navegador (objetos `File` + preview local, sin red) hasta el submit, que crea el producto y sube las fotos staged en la misma acción.

| Archivo | Cambio |
|---|---|
| `frontend/comercio-producto-form.html` | `<p class="field__hint">Solo pesos enteros...</p>` (precio) eliminado. |
| `frontend/js/comercio.js` (`initComercioProductoForm`) | Reescrito: `fotosStaged` (array local, solo en creación) + `imagenes` (array real, edición) con un `renderGaleria()` que despacha a `renderGaleriaCreacion`/`renderGaleriaEdicion`. `crearBotonesReorden` (flechas ‹ ›, sin drag-and-drop) + `moverFotoStaged` (swap local, sin red) + `moverImagenSubida` (2× `PATCH .../orden` en paralelo, revierte si falla). Submit de creación: `POST /productos` → sube cada foto staged en orden → toast verde + redirect a `comercio-productos.html` si todo sale bien; si falla una foto a mitad de camino, redirige a `?id={id}&fotosParcial=1` (reemplaza el viejo `creado=1`) sin perder ni duplicar el producto. Validación de nombre: `esNombreProductoValido` agregado al array de `validarCamposSilencioso`. |
| `frontend/js/cloudinary.js` | `reordenarImagenProducto(productoId, imagenId, orden)` nuevo — wrapper de `PATCH /productos/{id}/imagenes/{imagenId}/orden`. |
| `frontend/css/styles.css` | `.photo-gallery__item-move` (+ `--left`/`--right`) nuevo — mismo estilo visual que `.photo-gallery__item-remove` ya existente, reposicionado abajo. |
| `backend/.../dto/request/OrdenImagenRequestDTO.java` | Nuevo — `{ orden }`, mismo patrón que el resto de los DTOs de imagen. |
| `backend/.../dto/request/ProductoRequestDTO.java` | `nombre` suma `@Pattern` (`^[\p{L}0-9][\p{L}0-9 ]*$`) — letras/dígitos/espacios, rechaza símbolos puros. |
| `backend/.../services/ProductoService.java` | `reordenarImagen(usuarioId, productoId, imagenId, nuevoOrden)` nuevo — sin recalcular `esPrincipal` (fuera de alcance, no pedido). |
| `backend/.../controllers/ProductoController.java` | `PATCH /productos/{id}/imagenes/{imagenId}/orden` nuevo. |

---

## Verificado en esta sesión (cierre formal)

- `./mvnw compile` → `BUILD SUCCESS`.
- Registro de comercio completo con datos reales: paso 1 con `nombre` en blanco (solo espacios) bloqueado con los 8 errores reales sin avanzar; paso 2 vacío bloqueado con los 13 errores reales; CUIT matemáticamente inválido rechazado, CUIT válido aceptado (algoritmo módulo 11 confirmado idéntico al de `CuitValidator.java`); paso 3 con submit real → `201`, comercio creado (id 47), verificado, aprobado por Administrador, login posterior exitoso.
- Alta de producto "Milanesa Napolitana" con 3 fotos (roja/verde/azul, generadas como `File`/`Blob` sintéticos vía `canvas.toBlob` + `DataTransfer` — el Browser pane de este entorno no soporta adjuntar archivos reales a un `<input type="file">`) adjuntadas en el mismo formulario de creación, reordenadas client-side antes del submit (confirmado por comparación de `blob:` URLs). Un solo submit disparó `POST /productos` (id 41) + 3× `POST /productos/41/imagenes` (`201` los 3), terminó en `comercio-productos.html` sin pantalla intermedia. URLs reales de Cloudinary confirmadas (`res.cloudinary.com/dhzqelo1n/.../productos/47/41/...`).
- Reorder en modo edición probado con las 3 fotos reales: 2× `PATCH .../orden` con `200`, orden persistido tras recargar la página. Eliminación de una foto en edición probada (`DELETE` real, 3→2 fotos).
- Segundo producto "Empanada de Pollo" (sin fotos) creado para confirmar que el flujo también funciona sin ninguna foto adjunta.
- Nombre de producto `"!!!!!!!!"` bloqueado con el mensaje real, sin crear el producto.
- Sin errores de consola en ningún paso.

**Incidente real de entorno (no de código):** el servidor estático compartido en el puerto 5501 devolvía una copia cacheada de `js/cloudinary.js` desde antes de los cambios — confirmado que el archivo en disco y las respuestas de `curl` directo ya tenían el contenido correcto. Resuelto levantando un servidor propio en el puerto 5599 (`.claude/launch.json`, config `frontend-fresh`).

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 4 (1, 2, 5, 6 — 5 y 6 documentados juntos por estar acoplados) |
| Archivos backend nuevos | 1 (`OrdenImagenRequestDTO.java`) |
| Archivos backend modificados | 4 (`RegistroComercioRequestDTO.java`, `ProductoRequestDTO.java`, `ProductoService.java`, `ProductoController.java`) |
| Endpoints backend nuevos | 1 (`PATCH /productos/{id}/imagenes/{imagenId}/orden`) |
| Archivos frontend modificados | 7 (`registro-comercio.html`, `comercio-producto-form.html`, `js/auth.js`, `js/validators.js`, `js/comercio.js`, `js/cloudinary.js`, `css/styles.css`) |
| Datos de prueba en la base real (a borrar por Diego) | Comercio id 47 "Pizzeria Test 1618" (`comercio1618@bajonea.test`) con productos id 41 "Milanesa Napolitana" (3 fotos reales en Cloudinary) y "Empanada de Pollo" |

Cierre confirmado por Diego el 2026-07-29.

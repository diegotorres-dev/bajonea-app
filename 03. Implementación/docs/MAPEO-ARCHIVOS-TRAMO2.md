# Mapeo pantallas ↔ archivos — Fase 16, Tramo 2

Relación exacta entre las 10 pantallas lógicas del catálogo de Fase 15 correspondientes a este tramo (Cliente: Home/Catálogo, Detalle de Comercio, Modal de Producto, Perfil) y los archivos generados en `frontend/`. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`.

Un archivo cubre más de una pantalla cuando esas pantallas son estados distintos de un mismo flujo (variantes según sesión/datos disponibles, vistas alternadas dentro de una misma página sin navegación real). Un archivo es 1:1 cuando la pantalla no comparte flujo con ninguna otra.

---

## C — Cliente (10 pantallas del tramo → 3 archivos, 1 pantalla pospuesta)

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| C01, C02, C03 | `frontend/catalogo.html` (+ `frontend/js/catalogo.js`, función `initCatalogo`) | 3 pantallas, 1 archivo. C01 (Home con comercios, sesión de Cliente activa), C02 (Home, visitante no autenticado) y C03 (Home sin comercios disponibles) son la misma página con el mismo `GET /catalogo/comercios` público — lo que cambia es el encabezado/saludo según `getUsuario()` (C01 vs C02) y si la lista resultante (tras aplicar filtros) queda vacía (C03), resuelto con un estado vacío reutilizable, no una pantalla aparte. |
| C04 | `frontend/comercio-detalle.html` (+ `frontend/js/catalogo.js`, función `initComercioDetalle`) | 1:1. Accedida vía `?id=<comercioId>` desde una tarjeta de `catalogo.html`. |
| C06 | Modal `abrirModalProducto()` en `frontend/js/catalogo.js` | Sin archivo `.html` propio — se abre sobre `comercio-detalle.html` al tocar un producto del menú, mismo patrón de modal inyectado en el DOM que `G05` (Tramo 1). |
| C37 | `frontend/perfil.html`, sección `#view-principal` (+ `frontend/js/cliente.js`, función `initPerfil`) | Vista inicial del archivo, sin necesidad de navegación. |
| C38 | `frontend/perfil.html`, sección `#view-editar-datos` | Alternada por JS (`is-hidden`) al tocar "Editar Datos Personales" desde `#view-principal`, sin recargar la página. |
| C41 | **No construida — pospuesta explícitamente.** | Ver `docs/DECISIONES.md`, 2026-07-21: ni `ClienteResponseDTO` ni `ClienteEditarPerfilRequestDTO` exponen la dirección del cliente, y no existe `DireccionController` ni endpoint equivalente. Decisión tomada con el usuario antes de generar código — no hay ningún elemento de UI para C41 en este tramo, ni siquiera un enlace roto. |
| C43 | `frontend/perfil.html`, sección `#view-cambiar-password` | Alternada por JS desde `#view-principal`. El estado de error (contraseña actual incorrecta) es el mismo formulario con un banner/`field__error` condicional según la respuesta real de `POST /auth/cambiar-password`, no una pantalla aparte. |
| C46 | Modal `mostrarModalConfirmarLogout()` en `frontend/js/cliente.js` | Sin archivo `.html` propio — se abre sobre `perfil.html` al tocar "Cerrar sesión" en `#view-principal`. |

---

## Resumen numérico

| | Cantidad |
|---|---|
| Pantallas lógicas del tramo | 10 |
| Construidas | 9 |
| Pospuestas (sin endpoint real) | 1 (C41) |
| Archivos `.html` nuevos | 3 (`catalogo.html`, `comercio-detalle.html`, `perfil.html`) |
| Archivos `.js` nuevos | 2 (`js/catalogo.js`, `js/cliente.js`) |
| Pantallas 1:1 con su archivo | 2 (C04, C37 como vista inicial) |
| Pantallas agrupadas en un archivo compartido | 5 (C01/C02/C03 en `catalogo.html`; C38/C43 como vistas alternadas de `perfil.html`) |
| Pantallas sin archivo `.html` propio (componentes modales) | 2 (C06, C46) |

---

## Cobertura real de Figma (MCP) en este tramo

La cuota mensual del MCP de Figma (plan Starter, seat View) seguía agotada al iniciar este tramo — confirmado con un intento real de `get_design_context` sobre C01 (`141:2568`), que devolvió el mismo error de límite que en el cierre del Tramo 1. **No se hizo ninguna llamada nueva a la API de Figma en este tramo.**

Todo el contenido real de Figma usado acá salió de **minar sin costo adicional** el volcado de `get_metadata` de la página completa ("MVP") que ya se había pagado y guardado en disco durante el Tramo 1 (`mcp-figma-get_metadata-1784595406339.txt`, 662.000 caracteres) — la metadata de Figma incluye el nombre real de cada capa de texto no dinámica como si fuera el `name` del nodo, así que se pudo recuperar texto/estructura real sin gastar cuota nueva. Node-ids localizados y minados de esa forma:

| Pantalla | node-id | Qué se recuperó |
|---|---|---|
| C01 | `141:2568` | Encabezado (ubicación "Río Grande", buscador — descartado, ver desvíos), saludo "Hola, Diego 👋" / "¿Qué comemos hoy?", fila de chips de filtro, 3 tarjetas de comercio de ejemplo (imagen + badge + nombre + 2 pills), bottom nav de 5 íconos. |
| C02 | `141:2746` | Mismo layout que C01 con tagline "Gastronomía local, a un click de distancia." y botón "Ingresar" en vez de ícono de perfil. |
| C03 | `141:2951` | Mismo encabezado que C01 (con ícono de notificaciones, confirmando que es la variante autenticada-vacía), sin tarjetas de comercio debajo. |
| C04 | `141:3067` | Encabezado con nombre del comercio, bloque de info (horario "11:00 - 23:00", dirección "San Martín 456"), pills de delivery/retiro, descripción con "Ver más", fila de chips, productos agrupados por categoría ("Pizzas", "Empanadas") con nombre + descripción + 2 pills (tags) + precio ("$4.500") + miniatura 80×80. |
| C06 | `141:3305` | Modal bottom-sheet con imagen 390×200, botón cerrar, nombre + precio, 3 pills (categoría/tags), descripción larga. Debajo del divisor había un stepper de cantidad y un botón de "Agregar al carrito" — **descartados**, ver desvíos. |
| C37 | `141:4641` | Encabezado, nombre + email + "Activo desde [mes]" (descartado, ver desvíos), sección "MI CUENTA" (Editar Datos Personales, Cambiar contraseña), sección "SESIÓN" (Cerrar sesión), bottom nav de 5 íconos (Inicio/Explorar/Carrito/Mis pedidos/Perfil). |
| C38 | `141:4782` | Campos NOMBRE/APELLIDO/TELÉFONO editables, EMAIL con nota "El email no se puede modificar.", DNI de solo lectura, botón "Guardar" en el encabezado. |
| C43 | `141:5045` | Banner "Por seguridad, ingresá tu contraseña actual.", campo CONTRASEÑA ACTUAL con error "La contraseña actual no es correcta." y "Intentos restantes: 2." (descartado el número exacto, ver desvíos), campo NUEVA CONTRASEÑA con medidor de fortaleza. |
| C46 | `141:5293` | Modal bottom-sheet, ícono, "¿Cerrar sesión?", "Podés volver a ingresar en cualquier momento.", botones "Sí, cerrar sesión" / "Cancelar". |

Como la metadata solo resuelve el texto de capas estáticas (las que son overrides de instancia de componente quedan como `"Text"` genérico), varias etiquetas puntuales —los chips de categoría de C01, los textos de las pills de C04/C06/C43— no se pudieron leer tal cual y se completaron con contenido real derivado de los campos que sí expone el backend (ver sección de desvíos).

---

## Desvíos reales encontrados entre el diseño de Figma y el contrato real del backend

1. **Buscador ("Buscá restaurantes o platos...") en C01/C02/C03 — omitido.** `docs/PANTALLAS-MVP-FASE15.md` §2.3 ya había resuelto que no existe búsqueda global (C07/C08 excluidas del catálogo de Fase 15); el único filtro real es categoría/tag dentro del menú de un comercio (`C04`). Mostrar un buscador sin ningún endpoint al que apuntar sería una pantalla muerta — se omitió por completo, no se dejó como control deshabilitado.
2. **"Activo desde [mes año]" en C37 — omitido.** `ClienteResponseDTO` no expone ninguna fecha de alta del `Usuario`. No hay dato real que mostrar ahí.
3. **Stepper de cantidad + botón "Agregar al carrito" en C06 — omitidos.** El Carrito no es parte de este tramo (tramo futuro de la Fase 16); el modal de producto quedó puramente informativo (imagen, nombre, precio, categoría/tags, descripción), sin ninguna acción de compra.
4. **"Intentos restantes: N" en C43 — reemplazado por una advertencia genérica.** El backend no expone el contador de intentos fallidos en la respuesta de `POST /auth/cambiar-password` (mismo mecanismo compartido con el login, que tampoco lo expone). Se aplicó el mismo patrón ya usado en `login.html` (Tramo 1): after 2 fallos consecutivos observados en la sesión del navegador, se muestra "Cuidado: si fallás una vez más, tu cuenta se bloqueará." en vez de un número que no se puede verificar contra la base real.
5. **Chips de filtro de C01 (categorías genéricas de Figma, no resueltas en la metadata) — reemplazados por filtros basados en campos reales.** En vez de adivinar el texto exacto de los ~7 chips originales, se construyeron 6 filtros sobre campos reales de `ComercioResponseDTO`: "Todos", "Restaurantes"/"Emprendimientos" (`tipoComercio`), "Delivery"/"Retiro" (`aceptaDelivery`/`aceptaRetiro`), "Abierto ahora" (calculado en el cliente a partir de `horarios` contra la hora real del dispositivo).
6. **Selector de ubicación ("Río Grande" con chevrons) en el encabezado — dejado como etiqueta estática, no como selector funcional.** El alcance del proyecto es exclusivamente Río Grande, Tierra del Fuego (`CLAUDE.md` §0); no hay ningún mecanismo de multi-ciudad en el backend. Mostrar chevrons de un selector que no selecciona nada sería una pantalla muerta.
7. **Filtro por tag en C04 resuelto del lado del cliente, no con el parámetro `tagId` del backend.** `GET /catalogo/comercios/{id}/productos?tagId=` filtra por el **id** del tag, pero `ProductoResponseDTO.tags` solo expone una lista de **nombres** de tag (`List<String>`) — no hay ningún endpoint público que resuelva nombre→id (`GET /tags` es exclusivo de rol `ADMINISTRADOR`). Se optó por traer todos los productos del comercio una vez y filtrar por nombre de tag en el navegador, en vez de inventar un endpoint o fabricar ids. El filtro por categoría sí usa el parámetro `categoriaId` real del backend (`categoriaId` sí viene expuesto en `ProductoResponseDTO`), combinable con el filtro de tag del lado del cliente.
8. **`GET /catalogo/comercios/{id}` singular no existe.** `CatalogoController` solo tiene `GET /catalogo/comercios` (lista) y `GET /catalogo/comercios/{id}/productos` (que valida el comercio pero no devuelve sus datos). `comercio-detalle.html` resuelve esto trayendo la lista completa y filtrando por `id` en el cliente — una vuelta extra innecesaria en un backend con más escala, aceptable al tamaño real del catálogo del MVP.

---

## Bugs reales encontrados y corregidos probando contra el navegador y el backend real

1. **`js/api.js` invalidaba la sesión real del usuario ante un `401` de negocio legítimo.** `POST /auth/cambiar-password` requiere autenticación y puede devolver `401` real por "contraseña actual incorrecta" (`CredencialesInvalidasException` en `AuthService`) — un `401` de negocio, no de sesión inválida. El manejo centralizado de `apiFetch` no distinguía ese caso de un `401` real de sesión cerrada: en el primer intento con contraseña incorrecta, borraba el token del usuario y mostraba (sin que se notara, porque el modal se inyecta fuera de `<main>`) el modal de "Sesión cerrada" — dejando al usuario sin sesión real aunque su token siguiera siendo válido. Corregido agregando la opción `handle401Globally` a `apiFetch` (`true` por defecto); `cliente.js` la pasa en `false` para esta llamada puntual, dejando que el error se maneje como lo que es: un error de formulario, no un cierre de sesión. Confirmado con `localStorage` antes/después del fix en el navegador real.
2. **`perfil.html` no reaccionaba a que el backend cierra la sesión activa tras un cambio de contraseña exitoso.** `AuthService.cambiarPasswordDesdePerfil` llama `cerrarSesionActivaSiExiste(usuario, TipoCierreSesion.FORZADO)` tras guardar la nueva contraseña — el JWT que el navegador sigue guardando queda inválido del lado del servidor, pero la pantalla volvía silenciosamente a `#view-principal` como si la sesión siguiera viva, hasta que la siguiente request autenticada (ej. cerrar sesión) fallaba con `401` de forma confusa. Corregido: tras un cambio de contraseña exitoso, `cliente.js` limpia la sesión local y redirige a `login.html?passwordActualizada=1`, que ahora muestra un banner informativo ("Tu contraseña se actualizó. Iniciá sesión con tu nueva contraseña.") agregado a `initLogin` en `js/auth.js`. Confirmado con un login real posterior usando la contraseña nueva.
3. **Overflow visual descartado como falso positivo — filtro de categoría "no respondía" al click.** Al probar con la herramienta de automatización, un click en el chip "Pizzas" no disparaba el filtro; investigado con `element.click()` directo vía JavaScript, que sí funcionó y confirmó la lógica de `pintarChips()`/`pintarProductos()` correcta (incluida la request real `GET .../productos?categoriaId=19`). Quedó confirmado que fue un problema de coordenadas obsoletas de la herramienta de clicks del navegador (afectó varias pruebas de esta sesión, incluido un login que no se envió), no un bug del código — documentado acá para que quien audite no lo confunda con un defecto real.

---

## Probado end-to-end contra el backend real (no simulado)

Con el backend Spring Boot real (`localhost:8080`) y el frontend servido por `python -m http.server` (`localhost:5500`), datos de prueba sembrados por SQL directo donde no había un flujo de UI para generarlos (categorías/tags/productos/imágenes — sin implementación de panel de Comercio todavía, tramo futuro) y por API real donde sí lo había (registro de Cliente y Comercio, verificación de email, aprobación de comercio):

- Catálogo sin sesión (`catalogo.html`, `localStorage` vacío): saludo de visitante, sin bottom nav, comercio real listado con badge "Abierto ahora"/"Cerrado" calculado correctamente contra el horario real cargado (confirmado con un comercio sin horario para el día real → "Cerrado hoy", y con horario agregado para el día real → "Abierto ahora").
- Los 6 chips de filtro de `catalogo.html` probados uno por uno contra los datos reales, incluido el estado vacío ("Sin resultados para este filtro").
- `comercio-detalle.html`: info real del comercio (horario de hoy, dirección, pills de delivery/retiro, descripción), productos agrupados por categoría real, precio formateado ("$4.500", "$5.200", "$3.800").
- Filtro por categoría real (`GET .../productos?categoriaId=19`, confirmado en el log de red) combinado con filtro por tag (client-side) — ambos aplicados a la vez, confirmado que el resultado es la intersección correcta.
- Modal de producto (C06): producto con 3 imágenes reales — navegación prev/next real, indicador de puntos actualizado; producto con 1 imagen — sin flechas ni puntos; producto `AGOTADO` — banner de advertencia real + miniatura con overlay "Agotado" en la fila del menú.
- `perfil.html` con un Cliente real: C37 con datos reales de `GET /clientes/perfil`; C38 edición de apellido con persistencia confirmada por `SELECT` directo tras el `PUT`; C43 con contraseña incorrecta (banner de error real, sin perder la sesión tras el fix) y luego con la contraseña correcta (cambio real confirmado con un login posterior usando la contraseña nueva); C46 con "Cancelar" (no cierra sesión) y con "Sí, cerrar sesión" (cierre real confirmado por `POST /auth/logout` → `200` antes del redirect).
- Todos los datos de prueba (comercio, productos, imágenes, categorías, tags, 2 clientes) eliminados al final, verificado con `SELECT`.

**Sin probar en este tramo:** carga de imágenes real vía Cloudinary para los productos de prueba (se insertaron URLs de `res.cloudinary.com` directo por SQL, no a través del flujo real de `ProductoController`/Cloudinary — no había necesidad de probar ESE flujo en este tramo, que ya fue cerrado en la Fase 11; acá solo se necesitaban URLs reales y accesibles para validar que el frontend las consume y renderiza bien, lo cual sí se hizo).

## Checklist de cierre del Tramo 2

- [x] `ClienteController` confirmado existente y funcional en vivo antes de tocar C37/C38/C41.
- [x] C41 pospuesta explícitamente, decisión tomada con el usuario antes de generar código (sin endpoint de dirección).
- [x] 9 de 10 pantallas del tramo construidas, ninguna con datos mockeados.
- [x] 8 desvíos Figma-vs-backend resueltos explícitamente, no colados en silencio.
- [x] Regla de "cero comentarios en frontend/" verificada con grep antes de dar por cerrado.
- [x] Recorrido manual completo contra el backend real, con 2 bugs reales de sesión encontrados y corregidos (más 1 falso positivo descartado y documentado).
- [x] Datos de prueba eliminados y verificados.

Con esto, el Tramo 2 de 9 de la Fase 16 queda cerrado.

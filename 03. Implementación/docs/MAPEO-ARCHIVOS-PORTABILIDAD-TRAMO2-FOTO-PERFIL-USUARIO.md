# Mapeo de archivos — Tramo 2: `foto_perfil_url` en `Usuario`

Fecha: 2026-08-27. Estado: código implementado (backend + frontend), compilación y sintaxis verificadas — **verificación end-to-end en navegador real bloqueada** por la misma causa que deja el Tramo 1 sin poder arrancar el backend de punta a punta (ver más abajo). **Pendiente de confirmación explícita de Diego**, no cerrado.

## Qué se hizo — Backend

| Archivo | Cambio |
|---|---|
| `backend/.../entities/Usuario.java` | Campo nuevo `fotoPerfilUrl` (`@Column(name = "foto_perfil_url", length = 500)`, nullable, sin `@NotNull`/validación — eso vive en los DTOs). |
| `backend/.../dto/response/UsuarioResponseDTO.java` | Campo nuevo `fotoPerfilUrl`, constructor con 5 parámetros (antes 4). |
| `backend/.../dto/response/ClienteResponseDTO.java` | Campo nuevo `fotoPerfilUrl`, constructor con 9 parámetros (antes 8). |
| `backend/.../dto/response/AdministradorResponseDTO.java` | Campo nuevo `fotoPerfilUrl`, constructor con 4 parámetros (antes 3). Javadoc actualizado (ya no dice "únicamente nombre/apellido"). |
| `backend/.../dto/request/FotoPerfilUsuarioRequestDTO.java` | Nuevo — `url` con `@NotBlank` + `@ValidarUrlCloudinary` + `@Pattern` de extensión, mismo patrón que `FotoPerfilComercioRequestDTO`. |
| `backend/.../dto/request/RegistroClienteRequestDTO.java` | Campo nuevo `fotoPerfilUrl`, opcional (`@ValidarUrlCloudinary` + `@Size(max=500)`, sin `@NotBlank`), mismo patrón que `RegistroComercioRequestDTO.fotoPerfilUrl`. |
| `backend/.../services/UsuarioService.java` | Nuevo — `generarFirmaFotoPerfil(idPath, usuarioIdAutenticado)` y `actualizarFotoPerfil(idPath, usuarioIdAutenticado, request)`. Ambos validan `idPath.equals(usuarioIdAutenticado)` y lanzan `RecursoNoEncontradoException` (404) si no coincide — no existe en el proyecto ningún patrón de "un rol actuando por otro usuario", así que el endpoint es estrictamente de autoservicio, aislamiento por 404 (nunca 403), mismo criterio que el resto del proyecto. |
| `backend/.../controllers/UsuarioController.java` | Nuevo — `POST /api/v1/usuarios/{id}/foto-perfil/firma` y `PATCH /api/v1/usuarios/{id}/foto-perfil`. Genérico sobre cualquier rol autenticado (sin regla propia en `SecurityConfig`: cae en `anyRequest().authenticated()`, que ya cubre cualquier rol). |
| `backend/.../services/CloudinaryService.java` | 2 métodos nuevos: `generarFirmaFotoPerfilUsuario(usuarioId)` (carpeta `usuarios/{id}/perfil/`) y `generarFirmaFotoPerfilRegistroCliente()` (carpeta fija `usuarios/pre-registro/`, sin id real, mismo criterio que `generarFirmaFotoPerfilRegistro` de Comercio). Javadoc de clase actualizado. |
| `backend/.../controllers/AuthController.java` | Endpoint nuevo público `POST /auth/registro/cliente/foto-firma` (sin JWT — el cliente todavía no existe al momento del registro), mismo patrón que el ya existente de Comercio. |
| `backend/.../config/security/RateLimitFotoRegistroFilter.java` | Generalizado de 1 ruta limitada (`Set<String>` en vez de un solo `String`) a 2: la de Comercio (ya existía) + la nueva de Cliente. Mismo rate limit (5/min por IP), misma ventana compartida. |
| `backend/.../services/RegistroService.java` | `crearUsuario(...)` suma un 4º parámetro `fotoPerfilUrl`. Cliente lo pasa (`request.getFotoPerfilUrl()`), Comercio pasa `null` (su propia foto sigue siendo un campo separado de `Comercio`, sin tocar). |
| `backend/.../services/ClienteService.java` | `aResponseDTO` suma `usuario.getFotoPerfilUrl()` al construir la respuesta. |
| `backend/.../services/AdministradorService.java` | `obtenerPerfil` suma `personaFisica.getPersona().getUsuario().getFotoPerfilUrl()`. |
| `backend/.../services/AuthService.java` | `aResponseDTO` (login) pasa `usuario.getFotoPerfilUrl()` al nuevo constructor de `UsuarioResponseDTO`. |

**No tocado, a propósito** (instrucción explícita del pedido): `ComercioController`, `ComercioService`, `Comercio.fotoPerfilUrl` (sigue `NOT NULL`, sigue siendo el logo del negocio, sin relación con `Usuario.fotoPerfilUrl`), registro de Administrador (no existe autorregistro).

## Qué se hizo — Frontend

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | Función nueva `pintarAvatarUsuario(container, fotoPerfilUrl, textoAlternativo)` — mismo patrón que la ya existente `pintarAvatarComercio` (foto si existe, inicial si no), pero genérica (recibe el texto alternativo en vez de derivarlo de un `comercio.nombre`). |
| `frontend/js/cloudinary.js` | 2 funciones nuevas: `subirFotoPerfilRegistroCliente(file)` (firma pública + subida, sin persistir hasta el registro) y `subirFotoPerfilUsuario(usuarioId, file)` (firma + subida + `PATCH /usuarios/{id}/foto-perfil`), mismo patrón que las 2 ya existentes de Comercio. |
| `frontend/registro-cliente.html` | Bloque de foto opcional agregado al inicio del paso 1 (avatar + input file oculto + botón "Agregar foto" + slot de error), mismo markup que el bloque ya existente en `registro-comercio.html`. |
| `frontend/js/auth.js` | `initRegistroCliente`: staging de archivo + editor de recorte (`abrirEditorRecorte`, 4:3→1:1 cuadrado, mismo que Comercio) + subida real antes de armar el payload del submit, mismo patrón que `initRegistroComercio`. Import de `subirFotoPerfilRegistroCliente` sumado. |
| `frontend/perfil.html` | Avatar de `view-principal` pasa de SVG genérico fijo a `<div id="perfil-avatar">` vacío (pintado por JS). Bloque de edición de foto agregado a `view-editar-datos` (avatar + input + botón "Cambiar foto"), mismo markup que `comercio-perfil.html`. |
| `frontend/js/cliente.js` | `initPerfil`: pinta ambos avatares al cargar (`pintarAvatarUsuario`, inicial = primera letra del nombre), wiring de `input-avatar`/`cambiar-foto-btn` con editor de recorte + `subirFotoPerfilUsuario(cliente.id, ...)` (nota: `Cliente.id` = `Usuario.id`, misma cadena `@MapsId` ya usada en el resto del proyecto). Imports de `pintarAvatarUsuario`, `validarArchivoImagen`, `subirFotoPerfilUsuario`, `CloudinaryUploadError`, `abrirEditorRecorte` sumados. |
| `frontend/admin-dashboard.html` | `.summary-card__icon` (antes texto fijo "AD") gana `id="admin-avatar"` para ser pintado por JS; input file oculto + botón "Cambiar foto" agregados junto al nombre del Administrador. |
| `frontend/js/admin.js` | `initAdminDashboard`: pinta el avatar al cargar (`pintarAvatarUsuario`, fallback `'AD'` si no hay foto — mismo texto que ya mostraba la pantalla) y wiring de subida (`subirFotoPerfilUsuario(perfil.id, ...)`, toasts en vez de banner porque este archivo no tiene un patrón de banner propio, usa `showToast` en todos lados). Imports sumados. |
| `frontend/css/styles.css` | `.summary-card__icon` gana `overflow: hidden` + regla `img { width/height:100%; object-fit:cover }` (antes solo pensado para un ícono SVG chico o texto fijo, sin soporte de imagen). Único uso de esa clase en el proyecto es `admin-dashboard.html`, sin riesgo de efecto secundario en otra pantalla. |

## Verificación real hecha en esta sesión

- `./mvnw compile` → `BUILD SUCCESS` (backend completo, incluidos los archivos nuevos).
- 5 archivos JS tocados/nuevos verificados con `node --check` vía copia a `.mjs` (método ya establecido en el Tramo 16.27/16.28 para sortear la ceguera de la autodetección de módulos de Node sin `package.json`): `auth.js`, `cliente.js`, `admin.js`, `catalogo.js`, `cloudinary.js` — los 5 sin errores de sintaxis.
- Cero comentarios confirmado por `grep` sobre los 9 archivos de frontend tocados (regla transversal 11 de `CLAUDE.md`).
- Contenido HTML de los 3 archivos tocados revisado a mano (estructura del bloque de foto, ids, `data-testid`).
- **No se pudo cargar `registro-cliente.html` en el navegador real**: la página dispara `initGeografiaSelects` al cargar, que llama al backend (`GET /geografia/provincias`) — sin backend corriendo (bloqueado, ver nota abajo), `js/api.js` redirige automáticamente a `errores/sin-conexion.html` antes de poder inspeccionar el DOM. Mismo problema para `perfil.html`/`admin-dashboard.html` (ambas hacen `apiFetch` de su propio perfil al cargar).

## Por qué no hay verificación end-to-end real (la ambigüedad central de esta sesión)

El Tramo 1 deja el backend sin poder completar `ddl-auto=validate` contra `bajonea_final` (bloqueado por el mismatch de `Comercio`, fuera de alcance — ver `docs/MAPEO-ARCHIVOS-PORTABILIDAD-TRAMO1-BASELINE-FLYWAY.md`). Como Hibernate valida **todas** las entidades al arrancar (no por endpoint), el backend no levanta en absoluto contra `bajonea_final` — ni para probar `PATCH /usuarios/{id}/foto-perfil`, ni el registro de Cliente con/sin foto, ni nada que dependa de una request HTTP real. Esto **no es un defecto de este tramo**: el código de `Usuario`/`Token` en sí valida limpio contra el esquema real (confirmado, ver Tramo 3) — el bloqueo viene enteramente de `Comercio`, que ningún tramo de esta sesión toca a propósito.

Se evaluó (y se descartó) excluir temporalmente `Comercio`/`Pedido`/`Notificacion` del escaneo de Hibernate solo para poder probar esto: el grafo de relaciones de esas 3 entidades es demasiado grande (`Producto`, `Direccion`, `Horario`, `HistorialEstadoComercio`, `Carrito`, etc. referencian a `Comercio`) — hubiera significado excluir casi medio modelo de datos, un cambio temporal más grande y más riesgoso que el problema que resuelve, y en la práctica hubiera sido empezar a "arreglar" Comercio por la puerta de atrás, exactamente lo que este prompt pide no hacer en esta sesión.

**Esto no se resolvió inventando una decisión de diseño — se documenta acá como la ambigüedad/bloqueo central para que Diego decida**, entre otras, estas opciones: (a) aceptar este tramo con evidencia de compilación + sintaxis + revisión manual, pendiente de una verificación end-to-end recién cuando el tramo de Comercio→Dueño esté resuelto; (b) autorizar en una sesión futura un parche mínimo de compatibilidad de `Comercio`/`Pedido`/`Notificacion` (sin la refactorización completa a Dueño) solo para destrabar el arranque y poder probar Tramos 2/3 de punta a punta antes de encarar el tramo grande.

## Archivos tocados — resumen

Backend nuevos: `UsuarioService.java`, `UsuarioController.java`, `FotoPerfilUsuarioRequestDTO.java` (3). Backend modificados: `Usuario.java`, `UsuarioResponseDTO.java`, `ClienteResponseDTO.java`, `AdministradorResponseDTO.java`, `RegistroClienteRequestDTO.java`, `CloudinaryService.java`, `AuthController.java`, `RateLimitFotoRegistroFilter.java`, `RegistroService.java`, `ClienteService.java`, `AdministradorService.java`, `AuthService.java` (12). Frontend modificados: `registro-cliente.html`, `perfil.html`, `admin-dashboard.html`, `js/auth.js`, `js/cliente.js`, `js/admin.js`, `js/catalogo.js`, `js/cloudinary.js`, `css/styles.css` (9).

# MAPEO DFD Nivel 2 — Tramo B: perfil, direcciones, equipo (Empleado) y suspensiones

Informe de solo lectura, tomado del código real el 2026-11-16. Cubre P1.08 a P1.14 y P1.16. Continúa el Tramo A (`MAPEO-DFD2-TRAMO-A.md` y `MAPEO-DFD2-TRAMO-A-COMPLEMENTO.md`). No contiene propuestas de refactor: describe lo que el código hace hoy.

Convenciones:
- Rutas relativas a `03. Implementación/`. `BE` = `backend/src/main/java/com/bajonea/backend/`. `FE` = `frontend/`. `DOC` = `docs/entregables-01-02/`.
- `archivo:línea` cuando la línea se vio en la lectura; si no, se cita solo archivo y método.
- Todo texto entre comillas es literal del código.
- "NO EXISTE EN EL CÓDIGO" = se buscó y no hay nada.
- Lo ya mapeado en el Tramo A se referencia como "Tramo A, C# / P1.xx" y no se repite: formato de errores (Tramo A C1), transacciones (C2), códigos de 6 dígitos (C3), emails (C4), filtro JWT (C6), rate limit público (C7), login con cuenta suspendida (P1.04), cierre de sesión por tipo (P1.05), cambio de contraseña con sesión (P1.06b), registro de Cliente y su disponibilidad de nombre de usuario (P1.01).
- No hay un "P1.17" escrito en los archivos del Tramo A; la disponibilidad de nombre de usuario figura en el Tramo A dentro de P1.01 y como faltante en su Sección A, punto 5. Acá se la referencia así.
- No se verificó contra la base de datos real ni contra la configuración de Cloudinary (el preset `bajonea_imagenes_mvp` se crea a mano en el panel de Cloudinary, no está en el código).

---

## 0. Componentes compartidos (se citan desde los diagramas)

### C1. Subida de foto de perfil a Cloudinary (firma + subida directa + confirmación)
El backend nunca recibe el archivo. Tres pasos, siempre en este orden:
1. El frontend pide una firma al backend (`POST …/firma`). `BE services/CloudinaryService.java` `firmar(folder)` arma `{signature, timestamp, apiKey, cloudName, folder, uploadPreset}` con `upload_preset = "bajonea_imagenes_mvp"`. Carpetas:
   - usuario: `usuarios/{usuarioId}/perfil/` (`generarFirmaFotoPerfilUsuario`);
   - comercio ya existente: `comercios/{comercioId}/perfil/` (`generarFirmaFotoPerfilComercio`);
   - registro (público): `usuarios/pre-registro/` y `comercios/pre-registro/` (Tramo A, C7: 5/min por IP).
2. El frontend sube el archivo directo a `https://api.cloudinary.com/v1_1/{cloudName}/image/upload` con `FormData` (`file, api_key, timestamp, signature, folder, upload_preset`) (`FE js/cloudinary.js` `subirArchivoConFirma`).
3. El frontend manda la URL resultante (`secure_url`) al backend, que la guarda.

Límites y formato:
- En el navegador (`FE js/cloudinary.js` `validarArchivoImagen`): tipos `image/jpeg`, `image/png`, `image/webp`; máximo 5 MB. Mensajes: `"Formato no permitido. Usá JPG, PNG o WEBP."` y `"La imagen no puede superar los 5 MB."`.
- En el selector de archivo: `accept="image/jpeg,image/png,image/webp"`.
- Antes de subir, el editor de recorte (`FE js/crop.js`, `abrirEditorRecorte`, `aspectRatio: 1`) devuelve un `blob`; el frontend lo convierte en `File` de tipo `image/jpeg`.
- En el servidor, el DTO (`FotoPerfilUsuarioRequestDTO`, `FotoPerfilComercioRequestDTO`) valida: `@NotBlank` `"No debe estar vacío"`; `@ValidarUrlCloudinary` `"La URL debe pertenecer al dominio de Cloudinary"` (https y host exacto `res.cloudinary.com`); `@Pattern (?i).*\.(jpg|jpeg|png|webp)$` `"La URL debe apuntar a un archivo jpg, jpeg, png o webp"`; `@Size(max=500)` `"La URL de la foto de perfil no puede superar los 500 caracteres"`.
- El comentario de `CloudinaryService` dice que el preset impone `allowed_formats jpg,jpeg,png,webp`, 5 MB máximo y ancho máximo 1200 px; no se pudo comprobar desde el código.

Si falla Cloudinary:
- Error de red al subir: `CloudinaryUploadError` `"No pudimos conectar con el servicio de imágenes. Probá nuevamente."`
- Respuesta de error: el mensaje de Cloudinary o `"No pudimos subir la imagen."`
- En ambos casos no se llama al backend para guardar nada: la foto anterior queda como estaba.

Foto anterior: NO EXISTE EN EL CÓDIGO ningún borrado de assets en Cloudinary (no hay `destroy`/`uploader` en `BE`). La URL vieja se pisa en la base y el archivo viejo queda en Cloudinary.

### C2. Cierre de sesiones por suspensión
`SuspensionUsuarioService.cerrarSesionesPorSuspension` y `SuspensionDuenoService.cerrarSesiones` hacen lo mismo: para cada fila de `sesion` activa del usuario (`sesionRepository.findActivasDelUsuario`) ponen `activa = false`, `tipo_cierre = SUSPENSION`, `fecha_cierre = ahora` (reloj único, truncado a segundos). Dentro de la misma transacción que el cambio de estado.
Efecto en el cliente de la sesión: en la siguiente request, el filtro JWT responde 401 con `data.codigo = "CUENTA_SUSPENDIDA"` (Tramo A, C6) y el frontend muestra la pantalla completa `"Tu cuenta fue suspendida"` (Tramo A, P1.05, sección 7).

### C3. Cambio de estado de cuenta: `EstadoUsuarioService.cambiar`
`BE services/EstadoUsuarioService.java` `cambiar(usuario, destino, motivo, administradorId)`: exige transacción abierta (`Propagation.MANDATORY`); si origen = destino no hace nada; si no, `usuario.aplicarEstado(destino, motivo solo si SUSPENDIDO, ahora)`, `fecha_actualizacion = ahora`, si destino `ACTIVO` pone `fecha_ultimo_acceso = ahora`; guarda y escribe una fila de `historial_estado_usuario` (`usuario_id`, `administrador_id` null si es el sistema, `estado_origen`, `estado_destino`, `motivo`, `fecha_hora`). Es el único camino que cambia `usuario.estado` (regla 14 de `CLAUDE.md`).

### C4. Avisos de cuenta (`AvisoCuentaService`)
`BE services/AvisoCuentaService.java`. Cada método es `Propagation.MANDATORY`: crea la fila de aviso dentro de la transacción del llamador y el email sale con `EjecucionPostCommit.ejecutar` (después del commit, sin transacción abierta, un solo intento). El resultado del email se registra en una fila `notificacion` de canal `EMAIL` (`ENVIADO` o `FALLIDO`). Un Administrador puede reenviar el último email fallido (`reenviarEmailFallido`, `reenviarEmailDuenoFallido`). Los textos están en cada diagrama.

### C5. Resolución del comercio activo (`X-Comercio-Id`) — usado por P1.10, P1.12, P1.14 y P1.16
`BE services/ComercioActivoService.java` `resolver(usuarioId, rol, header)`:
1. Rol distinto de `DUENO` y `CLIENTE` → 404 `"Comercio no encontrado"` (`data.codigo = "COMERCIO_NO_DISPONIBLE"`).
2. Header ausente o en blanco → 400 `"Falta indicar el comercio"`.
3. Header no numérico → 400 `"El comercio indicado no es válido"`.
4. `DUENO`: `comercioRepository.findByIdAndDuenoId`; si no es suyo → el 404 `COMERCIO_NO_DISPONIBLE`. Devuelve `ComercioActivo(comercioId, duenoId, actorUsuarioId = duenoId, actorRol = DUENO, estado)`.
5. `CLIENTE` (Empleado): `empleadoComercioRepository.findComercioAccesible(usuarioId, comercioId, ACTIVO, ESTADOS_ACCESIBLES_EMPLEADO)`; si no hay fila → el mismo 404. `ESTADOS_ACCESIBLES_EMPLEADO` = `APROBADO`, `APTO_VENTA`, `SUSPENDIDO`, `CERRADO_TEMPORALMENTE`, `INACTIVO` (`ComercioActivoService.java:43-45`). Devuelve `ComercioActivo` con `actorRol = EMPLEADO` y `duenoId` = el Dueño real.
6. `ADMINISTRADOR` → siempre 404.
La relación se lee de la base en cada request; no viaja en el JWT. Todos los rechazos (inexistente, ajeno, sin relación, relación `INACTIVO`, estado no accesible) son el mismo 404, mismo mensaje y mismo `data`.

### C6. Orden de bloqueo en operaciones de equipo y suspensión
`usuario` (en id ascendente cuando son dos) → `empleado_comercio` → `comercio` → pedido (ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md`). Los métodos de P1.10 a P1.14 lo documentan en su Javadoc; se repite en cada diagrama solo lo propio.

---

## P1.08 Perfil de Cliente y de Dueño

### 1. Funciones y archivos
**Cliente**
- Controlador: `BE controllers/ClienteController.java` `verPerfil`, `editarPerfil`, `cambiarNombreUsuario`.
- Servicio: `BE services/ClienteService.java` `verPerfil`, `editarPerfil`, `cambiarNombreUsuario` (delega en `AuthService.cambiarNombreUsuario`, `BE services/AuthService.java:344-391`), `aResponseDTO`.
- Foto: `BE controllers/UsuarioController.java` `generarFirmaFotoPerfil`, `actualizarFotoPerfil`, `eliminarFotoPerfil`; `BE services/UsuarioService.java`; `BE services/CloudinaryService.java` (C1).
- Repositorios: `ClienteRepository.findById`, `PersonaFisicaRepository.save`, `UsuarioRepository.save` y `findByIdConBloqueo`, `DireccionRepository.findPrincipalActivaByClienteId`, `HistorialCambioNombreUsuarioRepository.findByUsuarioIdAndFechaCambioAfterOrderByFechaCambioAsc` y `save`.
- Entidades: `Usuario`, `Persona`, `PersonaFisica`, `Cliente`, `Direccion`, `HistorialCambioNombreUsuario`.
- DTOs: `ClienteEditarPerfilRequestDTO`, `CambiarNombreUsuarioRequestDTO`, `FotoPerfilUsuarioRequestDTO`, `ClienteResponseDTO`, `UsuarioResponseDTO`, `CloudinarySignatureResponseDTO`.
- Cambio de contraseña desde el perfil: Tramo A, P1.06b (`AuthController` → `AuthService.cambiarPasswordDesdePerfil`).

**Dueño**
- Controlador: `BE controllers/ComercioController.java` `verPerfil` (`GET /comercios/perfil`), `editarPerfil` (`PUT /comercios/perfil`), `generarFirmaFotoPerfil` (`POST /comercios/perfil/foto/firma`), `actualizarFotoPerfil` (`PUT /comercios/perfil/foto`), `editarDatosOperativos` (`PUT /comercios/perfil/datos-operativos`, compartido con el Empleado).
- Servicio: `BE services/ComercioService.java` `verPerfil`, `editarPerfil`, `generarFirmaFotoPerfil`, `actualizarFotoPerfil`, `editarDatosOperativos`; `HistorialEdicionComercioService.iniciarEscritura` y `registrar`; `NombreComercioService.validar`; `ComercioActivoService.validarComercioModificable` y `exigirComercioModificable`.
- DTOs: `ComercioPerfilRequestDTO`, `ComercioDatosOperativosRequestDTO`, `FotoPerfilComercioRequestDTO`, `ComercioResponseDTO`.
- Datos fiscales: `BE services/ComercioEdicionService.java` `actualizarDatosLegales`, que NO se llama desde el perfil (solo desde `ComercioCorreccionService`, ver sección 4).

### 2. Endpoints
| Endpoint | Método y ruta | Rol | `X-Comercio-Id` |
|---|---|---|---|
| Ver perfil Cliente | GET `/api/v1/clientes/perfil` | `CLIENTE` (`SecurityConfig.java:154`, `/clientes/**`) | no (se ignora) |
| Editar datos del Cliente | PUT `/api/v1/clientes/perfil` | `CLIENTE` | no |
| Cambiar nombre de usuario | PUT `/api/v1/clientes/perfil/nombre-usuario` | `CLIENTE` | no |
| Firma de foto de usuario | POST `/api/v1/usuarios/{id}/foto-perfil/firma` | cualquier rol autenticado (cae en `anyRequest().authenticated()`, `SecurityConfig.java:159`) | no |
| Guardar foto de usuario | PATCH `/api/v1/usuarios/{id}/foto-perfil` | cualquier rol autenticado | no |
| Eliminar foto de usuario | DELETE `/api/v1/usuarios/{id}/foto-perfil` | cualquier rol autenticado | no |
| Ver perfil del comercio | GET `/api/v1/comercios/perfil` | `DUENO` o Empleado con relación `ACTIVO` (ruta delegable) | sí, obligatorio |
| Editar perfil del comercio | PUT `/api/v1/comercios/perfil` | solo `DUENO` | sí |
| Firma de foto del comercio | POST `/api/v1/comercios/perfil/foto/firma` | solo `DUENO` | sí |
| Guardar foto del comercio | PUT `/api/v1/comercios/perfil/foto` | solo `DUENO` | sí |
| Datos operativos | PUT `/api/v1/comercios/perfil/datos-operativos` | `DUENO` o Empleado | sí |

Para un Empleado, `GET /comercios/perfil` devuelve `ComercioEmpleadoResponseDTO` (sin datos fiscales ni del titular); para el Dueño `ComercioResponseDTO` completo.

### 3. Entradas y validaciones

**3.1 `PUT /clientes/perfil`** (`ClienteEditarPerfilRequestDTO`; todas las violaciones se devuelven juntas, 400, Tramo A C1):
| Campo | Condición | Mensaje |
|---|---|---|
| `nombre` | `@NotBlank` | `"El nombre es obligatorio"` |
| `nombre` | `@ValidarNombrePropio` (`^\p{L}[\p{L} '-]*$`, `NombrePropioValidator`) | `"Debe contener solo letras, espacios y guiones"` |
| `nombre` | `@Size(max=100)` | `"El nombre no puede superar los 100 caracteres"` |
| `apellido` | `@NotBlank` | `"El apellido es obligatorio"` |
| `apellido` | `@ValidarNombrePropio` | `"Debe contener solo letras, espacios y guiones"` |
| `apellido` | `@Size(max=100)` | `"El apellido no puede superar los 100 caracteres"` |
| `telefono` | `@NotBlank` | `"No debe estar vacío"` |
| `telefono` | `@ValidarTelefonoArgentino`: quita `[ ()-]` y exige `^\+549\d{10}$` | `"Ingresá un número de teléfono válido (cod. área + número)"` |
| `telefono` | `@Size(max=30)` | `"El teléfono no puede superar los 30 caracteres"` |

Normalización: el DTO no tiene setters de normalización (a diferencia del registro, Tramo A P1.01 paso 0). El servicio pasa `nombre` y `apellido` por `TextoUtils.aTitleCase`; el teléfono se guarda tal como vino (sin quitar espacios ni paréntesis; ver D-09).
Campos que NO se pueden editar: `email`, `dni`, `fechaNacimiento` (no están en el DTO; el JSON ignora lo que sobra).

**3.2 `PUT /clientes/perfil/nombre-usuario`** (`CambiarNombreUsuarioRequestDTO`): `nombreUsuario` (`@NotBlank` `"El nombre de usuario es obligatorio"`; `@ValidarNombreUsuario` con las mismas reglas del registro, Tramo A P1.01: `"Solo se permiten letras y números"`, `"El nombre de usuario debe contener al menos una letra."`, `"El nombre de usuario debe tener al menos 8 caracteres"`, `"El nombre de usuario no puede superar los 20 caracteres"`; `@Size(max=20)`); `passwordActual` (`@NotBlank` `"No debe estar vacío"`). El setter normaliza `NombreUsuarioPolicy.normalizar` (trim y minúsculas).

Reglas del servicio, en este orden exacto (`AuthService.cambiarNombreUsuario`, `:344-391`; todo en una transacción, `ClienteService.cambiarNombreUsuario` con `noRollbackFor = {CredencialesInvalidasException, ConflictoDeNegocioException}`):
1. `usuarioRepository.findByIdConBloqueo(usuarioId)` (`FOR UPDATE`); si no existe: 404 `"Usuario no encontrado"`.
2. Contraseña actual incorrecta → `registrarIntentoFallido(usuario)` y 401 `"La contraseña actual es incorrecta"` con `data = {intentosRestantes: N}`. A los 3 intentos fallidos la cuenta se bloquea (mismo mecanismo y cierre de sesión que el cambio de contraseña, Tramo A P1.06b). El intento fallido NO consume cupo de cambios de nombre.
3. Nombre igual al actual → 400 `"Ingresá un nombre de usuario distinto al actual"`.
4. `NombreUsuarioPolicy.esReservado(nuevo)` o `usuarioRepository.existsByNombreUsuario(nuevo)` → 409 `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` (el texto literal vive en `NombreUsuarioPolicy`, que no se abrió; es el mismo de "Ese nombre de usuario ya está en uso" del Tramo A C1 para la restricción única; ver C-03). La unicidad también la garantiza `uq_usuario_nombre_usuario` en la base.
5. Límite: `desde = ahora − 30 días`; se leen las filas de `historial_cambio_nombre_usuario` del usuario con `fecha_cambio > desde`, orden ascendente. Si hay 3 o más (`MAX_CAMBIOS_NOMBRE_USUARIO = 3`, `VENTANA_CAMBIO_NOMBRE_USUARIO_DIAS = 30`, `AuthService.java:88-89`): 409 `"Ya alcanzaste el máximo de 3 cambios de nombre de usuario en los últimos 30 días. Podés volver a intentarlo en N día."` / `"… N días."`, con `N = max(1, techo((fecha del cambio número (total − 3) + 30 días − ahora) en días))`.
6. Éxito: `usuario.nombreUsuario = nuevo`, `intentos_fallidos = 0`, `fecha_actualizacion = ahora`, `save`; inserta una fila `historial_cambio_nombre_usuario` (`usuario_id`, `nombre_usuario_anterior`, `nombre_usuario_nuevo`, `fecha_cambio`).

Ventana y alcance:
- Ventana móvil (rolling), no mes calendario: siempre "los últimos 30 días contados hacia atrás desde ahora".
- Solo cuenta los cambios exitosos (las filas del historial). Intentos con contraseña incorrecta o con nombre ocupado no consumen cupo.
- Tabla: `historial_cambio_nombre_usuario`; columna de fecha: `fecha_cambio`. Fecha con `LocalDateTime.now()` de la JVM (no el reloj único; ver C-04).
- Aplica solo al rol `CLIENTE` (la ruta está bajo `hasRole("CLIENTE")`). Un Dueño recibiría 403; no hay pantalla de Dueño para esto (RF Dueño lo confirma: "no tiene, en esta versión, una pantalla para ver ni cambiar su nombre de usuario"). Un Empleado (que es Cliente) lo cambia desde su cuenta de Cliente.
- No cierra sesiones (el JWT lleva el id, no el nombre).
- La disponibilidad en vivo mientras se escribe usa el mismo endpoint público del registro (`GET /auth/nombre-usuario/disponibilidad`, Tramo A P1.01, 30/min por IP).

**3.3 Foto de usuario**: DTO en C1. `{id}` de la ruta: si no es el usuario autenticado, 404 `"Usuario no encontrado"` (`UsuarioService.validarPropioUsuario`). La URL NO se valida contra la carpeta `usuarios/{id}/perfil/` (ver D-02). `DELETE` no necesita cuerpo.

**3.4 `PUT /comercios/perfil`** (`ComercioPerfilRequestDTO`):
| Campo | Condición | Mensaje |
|---|---|---|
| `nombre` | `@NotBlank` | `"No debe estar vacío"` |
| `nombre` | `@Pattern .*[\p{L}0-9].*` | `"Ingresá un nombre de comercio válido"` |
| `nombre` | `@Size(max=150)` | sin texto propio: el de Bean Validation por defecto |
| `descripcion` | `@Size(max=2000)` | `"La descripción no puede superar los 2000 caracteres."` |
| `telefono` | `@NotBlank` | `"No debe estar vacío"` |
| `telefono` | `@ValidarTelefonoArgentino` | `"Ingresá un número de teléfono válido (cod. área + número)"` |
| `telefono` | `@Size(max=30)` | sin texto propio |
| `aceptaDelivery`, `aceptaRetiro` | booleanos primitivos | — |

Reglas del servicio (`ComercioService.editarPerfil`), en orden:
1. `ComercioValidaciones.validarModalidadesEntrega`: al menos una modalidad (el texto exacto no se abrió; el frontend usa `"Debés ofrecer al menos una modalidad de entrega."`).
2. `historialEdicionComercioService.iniciarEscritura(actor)`: toma primero la fila del usuario que actúa.
3. Lee el comercio y `entityManager.refresh(PESSIMISTIC_WRITE)`.
4. `ComercioActivoService.validarComercioModificable(actor, estado)`: con el comercio `SUSPENDIDO` → 409 `"El comercio está suspendido: por ahora no se puede modificar."` (`data.codigo = COMERCIO_SUSPENDIDO`); con `INACTIVO` → 409 `"El comercio está inactivo: por ahora no se puede modificar."`. Vale para el Dueño y el Empleado.
5. Nombre: `TextoUtils.aTitleCase(nombre)`; si cambió, `nombreComercioService.validar(nombre, comercioId)` → 409 `"Ya existe un comercio con ese nombre. Elegí otro."` (índice único `uq_comercio_nombre_unico` como respaldo).
6. Guarda nombre, descripción, teléfono y modalidades (`saveAndFlush`; `fecha_modificacion = ahora`). Sin trim ni normalización de descripción y teléfono.
7. Si cambió algún campo, `historialEdicionComercioService.registrar(...)` escribe una fila de `historial_edicion_comercio` (tipo `COMERCIO`, acción `EDITAR`, `detalle` = nombres de campos, nunca valores) en la misma transacción.

**3.5 Foto del comercio** (`ComercioService.actualizarFotoPerfil`): DTO en C1; luego `iniciarEscritura`, refresh con `FOR UPDATE`, `validarComercioModificable`, y `cloudinaryService.validarFotoPerfilComercio(comercioId, url)`: la URL tiene que empezar con `https://res.cloudinary.com/{cloudName}/image/upload/` y estar en `comercios/{comercioId}/perfil/` (con o sin segmento `v123/`); si no, 400 `"La foto de perfil no es válida. Subila de nuevo desde el formulario."`. Si la URL cambió, fila `historial_edicion_comercio` con `"foto de perfil"`.

### 4. Pasos en orden exacto
**Ver perfil de Cliente** (`ClienteService.verPerfil`): `clienteRepository.findById(usuarioId)` (el id de `Cliente` es el de `Usuario`); si no existe 404 `"Cliente no encontrado"`. Arma `ClienteResponseDTO`: `id, nombre, apellido, dni, fechaNacimiento, telefono, nombreUsuario, email, direccion (la predeterminada activa, de solo lectura), fotoPerfilUrl`.

**Editar datos del Cliente** (`ClienteService.editarPerfil`, `@Transactional` de clase): carga el `Cliente`; escribe en `persona_fisica` (`nombre`, `apellido`, `telefono`, `fecha_modificacion`) y en `usuario` (`fecha_actualizacion`); no toma bloqueos explícitos. No hay historial, no hay aviso, no hay email. Respuesta 200 `"Perfil actualizado correctamente"`.

**Foto de usuario**:
- Firma: `generarFirmaFotoPerfil` → `CloudinaryService.generarFirmaFotoPerfilUsuario` (C1). 200 `"Firma generada correctamente"`.
- Guardar: `usuario.fotoPerfilUrl = url`, `fecha_actualizacion`, `save`. 200 `"Foto de perfil actualizada correctamente"`.
- Eliminar: `usuario.fotoPerfilUrl = null`. 200 `"Foto de perfil eliminada correctamente"`.

**Foto personal del Dueño**: los endpoints de foto de usuario aceptan cualquier rol autenticado, así que un Dueño podría usarlos por API; ninguna pantalla del Dueño los llama (`FE js/comercio.js` no importa `subirFotoPerfilUsuario`; solo `FE js/cliente.js` lo hace). El Dueño no tiene foto personal en la interfaz. El avatar de su perfil es la foto del comercio (`Comercio.foto_perfil_url`). Ver D-01.

**Datos fiscales del Dueño**: se muestran de solo lectura desde `ComercioResponseDTO` (`razonSocial`, `cuit`, `condicionIva`, `tipoSociedad`, `domicilioFiscal`, `fechaInicioActividades`). NO EXISTE endpoint de edición desde el perfil. El único camino que los cambia es la corrección de un comercio rechazado (`PUT /comercios/{id}/resolicitud` → `ComercioCorreccionService` → `ComercioEdicionService.actualizarDatosLegales`, solo si el Dueño nunca tuvo un comercio aprobado; fuera de este tramo). Esa corrección sí vuelve el comercio a `PENDIENTE` y deja registro por campo; el perfil normal no cambia ningún estado de revisión ni dispara avisos.

**Email**: no existe endpoint para cambiar el email de ningún rol. En la pantalla del Cliente el campo está `disabled` con `"El email no se puede modificar."`.
**Teléfono**: el del Cliente se edita sin verificación (no hay código ni email). El teléfono del comercio se edita sin verificación. El teléfono personal del Dueño y su DNI, nombre y apellido no se muestran ni se editan en ninguna pantalla (`/clientes/**` es solo `CLIENTE`).

**Qué es editable (resumen)**
| Dato | Cliente | Dueño |
|---|---|---|
| Nombre, apellido personales | sí | no (sin pantalla) |
| Teléfono personal | sí | no (sin pantalla) |
| Nombre de usuario | sí (3 cada 30 días) | no |
| Email | no (solo lectura) | no |
| DNI | no (solo lectura) | no |
| Fecha de nacimiento | no; el API la devuelve, la pantalla no la muestra | no |
| Contraseña | sí (Tramo A P1.06b) | sí (Tramo A P1.06b) |
| Foto de perfil personal | sí (editar y eliminar) | no hay pantalla |
| Foto del comercio | — | sí (solo reemplazar; no hay "eliminar") |
| Nombre, descripción, teléfono y modalidades del comercio | — | sí |
| Datos fiscales | — | solo lectura |
| Horarios | — | Tramo T1 (fuera de este informe) |

### 5. Salidas
- `GET /clientes/perfil` 200 `"Perfil obtenido correctamente"`; `PUT /clientes/perfil` 200 `"Perfil actualizado correctamente"`; `PUT /clientes/perfil/nombre-usuario` 200 `"Nombre de usuario actualizado correctamente"` (devuelve el `ClienteResponseDTO`).
- `GET /comercios/perfil` 200 `"Perfil obtenido correctamente"`; `PUT /comercios/perfil` y `PUT /comercios/perfil/datos-operativos` 200 `"Perfil actualizado correctamente"`; `PUT /comercios/perfil/foto` 200 `"Foto de perfil actualizada correctamente"`.
- Errores: 400 de validación (Tramo A C1), 401 `"La contraseña actual es incorrecta"`, 404 `"Cliente no encontrado"` / `"Usuario no encontrado"`, 409 y 400 de las secciones 3.2 y 3.4, 404 `"Comercio no encontrado"` (`COMERCIO_NO_DISPONIBLE`) sin header o con comercio ajeno (header ausente: 400 `"Falta indicar el comercio"`).

### 6. Efectos secundarios
- Ningún aviso in-app ni email en la edición de datos, de foto o de perfil del comercio.
- Cambio de nombre de usuario: una fila en `historial_cambio_nombre_usuario`; con 3 contraseñas incorrectas seguidas, bloqueo de cuenta (Tramo A P1.06b).
- Perfil del comercio: fila en `historial_edicion_comercio`. Esa fila la ven el Dueño y el Administrador en la pestaña "Actividad" (fuera de este informe).
- No hay jobs.

### 7. Frontend
**Cliente** (`FE perfil.html`, `FE js/cliente.js` `initPerfil`, `FE js/perfil-cuenta.js`):
- Guard: `exigirContextoCliente()` (un Empleado dentro de un comercio es redirigido a `comercio-dashboard.html`).
- Encabezado: avatar, `"{nombre} {apellido}"`, email.
- Filas (en este orden): `"Editar datos personales"`, `"Mis direcciones"`, `"Cambiar contraseña"`, `"Cambiar de cuenta"` (oculta; se muestra solo si `GET /empleados/mis-comercios` devuelve algo), `"Ayuda"`, `"Mis consultas a Soporte"`, `"Cerrar sesión"` (confirma con `"¿Cerrar sesión?"` / `"Podés volver a ingresar en cualquier momento."`, botones `"Sí, cerrar sesión"` y `"Cancelar"`).
- Todos los botones nacen `disabled` y se habilitan al terminar de cargar el perfil.
- Pantalla `"Editar datos personales"`: campos `Nombre`, `Apellido`, `Teléfono` (solo dígitos, máximo 10, el frontend antepone `+549` con `construirTelefono`), `Nombre de usuario` (hint `"Podés cambiar tu nombre de usuario hasta 3 veces cada 30 días."`, con indicador de disponibilidad en vivo), `Email` (disabled, `"El email no se puede modificar."`), `DNI` (disabled, `"El DNI no se puede modificar."`); botón `"Guardar"` (`"Guardando..."`).
- Validación en el navegador (mensajes): `"El nombre es obligatorio."`, `"El apellido es obligatorio."`, `"Debe contener solo letras, espacios y guiones"`, `"Ingresá tu teléfono."`, `"Ingresá un teléfono argentino válido (código de área + número)."`.
- Errores del servidor: los de campo (`nombre`, `apellido`, `telefono`) se pintan bajo cada campo; los demás en un banner `"No pudimos guardar tus datos. Intentá nuevamente."` o el mensaje del servidor.
- Éxito sin cambio de usuario: vuelve a la vista principal y toast `"Datos actualizados correctamente"`.
- Con nombre de usuario cambiado: primero se guardan los datos (`PUT /clientes/perfil`) y recién después se abre la hoja `"Confirmá tu contraseña"` (`"Por seguridad, ingresá tu contraseña para confirmar el cambio de nombre de usuario."`; placeholder `"Tu contraseña actual"`; botones `"Confirmar"` / `"Cancelar"`; `"Confirmando..."`). Errores: `"Ingresá tu contraseña actual."`, 401 `"La contraseña actual no es correcta."`, y con `intentosRestantes === 1` `"Cuidado: si fallás una vez más, tu cuenta se bloqueará."`. Una cuenta bloqueada la maneja `manejarBloqueoPorCambioPassword` (de `FE js/catalogo.js`, no se abrió). Éxito: toast `"Nombre de usuario actualizado correctamente"`. Otros errores: se cierra la hoja y se muestra el error en la pantalla de edición. Con `"Cancelar"` en la hoja, la hoja se cierra y la pantalla queda como estaba: los datos ya se guardaron y no hay toast (ver D-10).
- Foto: se toca el avatar. Sin foto, abre el selector de archivos; con foto, hoja `"Foto de perfil"` con `"Editar foto"`, `"Eliminar foto"` y `"Cancelar"`. Flujo C1 con recorte 1:1. Toasts: `"Foto de perfil actualizada"`, `"Foto de perfil eliminada"`; errores `"No pudimos subir la foto."`, `"No pudimos eliminar la foto."` o el mensaje del servidor / de Cloudinary.

**Dueño** (`FE comercio-perfil.html`, `FE js/comercio.js` `initComercioPerfil`):
- Encabezado: foto del comercio (botón `btn-foto-perfil-comercio`), nombre, teléfono, `"{estado} · {localidad}"`.
- Filas de "Mi comercio": `"Editar datos del comercio"`, `"Editar horarios"`, `"Ver datos legales"`, `"Ver equipo"`, `"Documentación"`, `"Cobros con Mercado Pago"`, `"Cambiar contraseña"`; luego sonido, `"Ayuda"`, `"Mis consultas a Soporte"`, `"Cerrar sesión"`.
- `"Editar datos del comercio"`: `Nombre del comercio` (con consulta de disponibilidad en vivo), `Descripción`, `Teléfono de contacto`, `Modalidades de entrega` (dos interruptores; `"Debés ofrecer al menos una modalidad."`), botón `"Guardar cambios"`. Éxito: vuelve a la vista principal y toast `"Datos actualizados correctamente"`. Errores: `"Ingresá el nombre de tu comercio."`, `"El nombre no puede contener solo caracteres especiales."`, `"Ingresá tu teléfono."`, `"Ingresá un teléfono argentino válido (código de área + número)."`, 409 de nombre en uso (se marca el campo), banner `"No pudimos guardar los cambios. Intentá nuevamente."`. Con el comercio suspendido las acciones de edición están protegidas (`protegerPorSuspension`).
- `"Datos legales"`: solo lectura (`Razón social`, `CUIT`, `Condición IVA`, `Tipo de sociedad`, `Domicilio fiscal`, `Fecha de inicio`).
- Foto del comercio: avatar → selector; con foto, hoja `"Foto de perfil"` con solo `"Editar foto"` y `"Cancelar"`. Toast `"Foto de perfil actualizada"` (éxito, verde).
- `"Cambiar contraseña"`: formulario con `Contraseña actual`, `Nueva contraseña` (barra de fortaleza), `Confirmá tu nueva contraseña`; éxito: `clearSesion()` y redirección a `login.html?passwordActualizada=1`. Detalle en Tramo A, P1.06b.
- El Empleado dentro de un comercio ve otra lista (`"Ver datos del comercio"`, `"Editar datos del comercio"` con solo descripción y teléfono y cinco campos con candado, `"Editar horarios"`, `"Editar datos personales"` que abre la hoja `"Vas a pasar a tu cuenta personal"`, `"Cambiar de cuenta"`) y no ve `"Cambiar contraseña"`.

### 8. Desvíos de este diagrama
D-01, D-02, D-04, D-09, D-10, D-11 (sección B).

---

## P1.09 Gestión de direcciones del Cliente

### 1. Funciones y archivos
- Controlador: `BE controllers/DireccionClienteController.java` `listar`, `crear`, `editar`, `marcarPredeterminada`, `eliminar`.
- Servicio: `BE services/DireccionClienteService.java` `listar`, `crear`, `editar`, `marcarPredeterminada`, `eliminar`, `bloquearCliente`, `obtenerActiva`. Localidad: `BE services/ValidadorDatosNegocioComercio.java` `obtenerLocalidad`; `BE services/LocalidadesHabilitadas.java` `contiene`.
- Repositorio: `DireccionRepository` (`findActivasByClienteId`, `findPrincipalActivaByClienteId`, `countByClienteIdAndEliminadaFalse`, `findByIdAndClienteIdAndEliminadaFalse`, `findActivasPorIdDescByClienteId`, `leerParaEntregaConBloqueoCompartido`), `UsuarioRepository.findByIdConBloqueo`, `ClienteRepository`.
- Entidades: `Direccion`, `Localidad`, `Provincia`, `Cliente`.
- DTOs: `DireccionClienteRequestDTO` (extiende `DireccionRequestDTO`), `DireccionClienteResponseDTO`.
- Pedido: `BE services/PedidoService.java` `confirmarPedido` (líneas 185-201 aprox.) lee la dirección y guarda una copia.

### 2. Endpoints
Todos bajo `/api/v1/clientes/direcciones`, rol `CLIENTE` (`/clientes/**`), sin `X-Comercio-Id`, fuera de la lista de rutas delegables (un Empleado administra sus direcciones como Cliente).
| Operación | Método y ruta | HTTP | Mensaje |
|---|---|---|---|
| Listar | GET `/` | 200 | `"Direcciones obtenidas correctamente"` |
| Alta | POST `/` | 201 | `"Dirección agregada correctamente"` |
| Editar | PUT `/{id}` | 200 | `"Dirección actualizada correctamente"` |
| Predeterminada | PUT `/{id}/principal` | 200 | `"Dirección predeterminada actualizada correctamente"` (devuelve la lista) |
| Baja | DELETE `/{id}` | 200 | `"Dirección eliminada correctamente"` (devuelve la lista) |

### 3. Entradas y validaciones (alta y edición)
`DireccionClienteRequestDTO` = `DireccionRequestDTO` (mismas reglas y mensajes del Tramo A, P1.01: `calle`, `numero`, `pisoDepto`, `codigoPostal`, `localidadId`, `principal`) más:
| Campo | Condición | Mensaje |
|---|---|---|
| `nombre` (alias privado, opcional) | `@Size(max=40)` | `"El nombre no puede superar los 40 caracteres"` |
| `referencia` (opcional) | `@Size(max=150)` | `"La referencia no puede superar los 150 caracteres"` |

Mensajes heredados (literales): `"La calle es obligatoria"`, `"La calle no puede superar los 150 caracteres"`, `"La calle no puede contener solo caracteres especiales"`, `"El número es obligatorio"`, `"El número no puede superar los 10 caracteres"`, `"Solo se permiten números"`, `"El piso/departamento no puede superar los 30 caracteres"`, `"El piso/departamento no puede contener solo caracteres especiales"`, `"El código postal es obligatorio"`, `"Ingresá un código postal válido (4 dígitos o formato CPA)"`, `"Seleccioná tu localidad"`, `"La localidad no puede superar los 15 caracteres"`.
Obligatorios: `calle`, `numero`, `codigoPostal`, `localidadId`. Opcionales: `pisoDepto`, `nombre`, `referencia`. `principal` solo se lee en el alta; en la edición se ignora.

Reglas del servicio:
- Localidad: `obtenerLocalidad(localidadId, "localidadId")`: no existe → 404 `"La localidad indicada no existe"`; existe pero no está habilitada → 400 con `data = {localidadId: "Esa localidad todavía no está disponible"}`.
- Habilitadas: propiedad `geografia.localidades-habilitadas`, con valor por defecto en el código `94008010,94015020,94011010` (`LocalidadesHabilitadas.java`; no está en `application.properties`). Según `CLAUDE.md` son Río Grande, Ushuaia y Tolhuin.
- Cupo: `countByClienteIdAndEliminadaFalse(usuarioId) >= 5` (`MAXIMO_ACTIVAS = 5`) → 409 `"Ya tenés el máximo de 5 direcciones. Eliminá una para agregar otra."` con `data.codigo = "DIRECCIONES_CUPO_MAXIMO"` (`ConflictoComercioException`). Las eliminadas no cuentan.
- Dirección ajena, inexistente o eliminada (editar, predeterminada, baja): 404 `"Dirección no encontrada"`.
- Última dirección: baja con una sola activa → 409 `"No podés eliminar tu única dirección. Agregá otra primero."` con `data.codigo = "ULTIMA_DIRECCION"`.

### 4. Pasos en orden exacto
**Alta** (`crear`, `@Transactional`):
1. `bloquearCliente`: `usuarioRepository.findByIdConBloqueo(usuarioId)` (`FOR UPDATE` sobre la fila `usuario` del Cliente; esto serializa las escrituras del mismo Cliente entre sí y con `confirmarPedido`, que toma esa fila con bloqueo compartido); después `clienteRepository.findById`. Falta → 404 `"Cliente no encontrado"`.
2. Localidad (400 / 404 de arriba).
3. Cupo (409).
4. Lee la predeterminada activa. `seraPrincipal = (no hay predeterminada) || request.principal`. Si hay predeterminada y la nueva lo será: la vieja pasa a `principal = false` (`saveAndFlush`; el `flush` va antes de insertar porque el índice único se evalúa por sentencia).
5. Inserta `Direccion`: `calle` en Title Case, `numero` y `pisoDepto` tal cual, `codigoPostal` normalizado (`TextoUtils.normalizarCodigoPostal`), `nombre` y `referencia` recortados (vacío → `null`), `principal`, `eliminada = false`, `fecha_creacion`. `saveAndFlush`.
- La primera dirección queda predeterminada sola (no hay predeterminada previa).
- Garantía en base: una sola predeterminada activa por Cliente (columna generada `principal_activa_cliente_id` con `UNIQUE`, migración `V42`, según `CLAUDE.md`).

**Editar**: `bloquearCliente`, `obtenerActiva` (404), localidad, y pisa `nombre`, `calle`, `numero`, `pisoDepto`, `codigoPostal`, `referencia`, `localidad`, `fecha_modificacion` (`saveAndFlush`). No toca `principal`. Una dirección usada en pedidos viejos se puede editar: el pedido guarda su propia copia (ver más abajo).

**Marcar predeterminada**: `bloquearCliente`, `obtenerActiva`; si ya lo es, no escribe; si no, baja la actual (`saveAndFlush`) y sube la elegida (`saveAndFlush`). Devuelve la lista (predeterminada primero, luego `id` descendente).

**Baja** (lógica): `bloquearCliente`, `obtenerActiva`, controla "última"; marca `eliminada = true`, `principal = false`, `fecha_baja = ahora`, `fecha_modificacion = ahora` (`saveAndFlush`). Si era la predeterminada, promueve la activa de mayor `id` (`findActivasPorIdDescByClienteId().get(0)`) con `principal = true`. Nunca queda el Cliente con direcciones activas y ninguna predeterminada.

**Historial en pedidos viejos**: al confirmar un pedido de entrega a domicilio, `PedidoService.confirmarPedido` lee la dirección con `leerParaEntregaConBloqueoCompartido` y copia `calle, numero, piso/depto, código postal, localidad, referencia` a columnas `entrega_*` del pedido (según `CLAUDE.md`, fase 3; `pedido.direccion_id` queda solo como origen). Dirección inexistente, de otro Cliente o eliminada → 404 `"Dirección no encontrada"`; sin `direccionId` en domicilio → 409 `"La dirección es obligatoria para entrega a domicilio"`. Editar o dar de baja la dirección después no cambia el pedido. El alias `nombre` no viaja al pedido.

### 5. Salidas
Éxitos de la tabla de la sección 2. Errores: 400 de validación; 400 `{localidadId: "Esa localidad todavía no está disponible"}`; 404 `"La localidad indicada no existe"`; 404 `"Dirección no encontrada"`; 404 `"Cliente no encontrado"`; 409 de cupo y de última dirección. El `GET /clientes/perfil` sigue devolviendo la predeterminada en el campo `direccion` (P1.08).

### 6. Efectos secundarios
Ninguno: sin avisos, sin emails, sin jobs, sin historial de direcciones (solo `fecha_modificacion` y `fecha_baja` en la misma fila).

### 7. Frontend
Módulo compartido `FE js/direcciones.js`; lo usan `FE perfil.html` (vista `view-direcciones`, fila `"Mis direcciones"`, `?seccion=direcciones` o `?vista=direcciones`, con `&desde=checkout` para volver al checkout) y `FE checkout.html` / `FE js/checkout.js` (paso de entrega a domicilio).
- Lista: grupo de radios `"Dirección predeterminada"`; cada fila con título (alias o `calle numero`), línea de calle, `"{localidad} · CP {codigoPostal}"`, menú de tres puntos con `"Editar"` y `"Eliminar"` (deshabilitado con `"Es tu única dirección"` cuando es la única). Botón `"Agregar dirección"`; con 5 queda deshabilitado y aparece un banner `"Llegaste al máximo de 5 direcciones. Podés eliminar alguna para agregar otra."` (`MENSAJE_CUPO_LLENO`, texto propio del frontend distinto del del servidor; ver D-13).
- Formulario (pantalla completa, título `"Agregar dirección"` / `"Editar dirección"`): `calle`, `número`, `piso/depto`, `código postal`, `nombre`, `referencia`, `Provincia` (campo fijo con `"Solo Tierra del Fuego por ahora"`), `localidad` (select cargado desde `GET /geografia/localidades?provinciaId=`, que solo trae las habilitadas) e interruptor de predeterminada (`"Se usa por defecto en tus pedidos a domicilio"`; si ya lo es, bloqueado: `"Es tu dirección predeterminada. Para cambiarla, elegí otra dirección como predeterminada"`).
- Mensajes de validación del navegador: `"La calle es obligatoria"`, `"La calle no puede contener solo caracteres especiales."`, `"El número es obligatorio"`, `"El número solo puede tener dígitos."`, `"El piso o departamento no puede contener solo caracteres especiales."`, `"El código postal es obligatorio"`, `"Ingresá un código postal válido (4 dígitos o formato CPA)."`, `"El nombre no puede contener solo caracteres especiales."`, `"La referencia no puede contener solo caracteres especiales."`, `"Seleccioná una localidad"`.
- Guardar: botón con `"Guardando..."`. En la edición, si se pidió ser predeterminada, hace dos llamadas: `PUT /{id}` y después `PUT /{id}/principal`; si la segunda falla, toast de error `"Guardamos los cambios, pero no pudimos dejarla como predeterminada"`. Toasts de éxito: `"Dirección agregada"`, `"Dirección actualizada"`.
- Elegir otra predeterminada desde la lista: `PUT /{id}/principal` y aviso `"{título} ahora es tu dirección predeterminada."` con botón `"Deshacer"` (6 s; el deshacer vuelve a llamar a `/principal` de la anterior).
- Baja: hoja `"¿Eliminar esta dirección?"` o `"¿Eliminar tu dirección predeterminada?"`; texto `"Los pedidos que ya hiciste con esta dirección no cambian."` y, si era la predeterminada, `" Tu dirección más reciente, {título}, pasa a ser la predeterminada."`; botones `"Eliminar"` (`"Eliminando…"`) y `"Cancelar"`. Toast con el mensaje del servidor (`"Dirección eliminada correctamente"`).
- Errores: 404 → `"Esa dirección ya no existe. Actualizamos tu lista."`; otros → el mensaje del servidor o `"No pudimos completar la acción. Probá de nuevo."`; carga de localidades `"No pudimos cargar las localidades. Cerrá esta pantalla e intentá de nuevo."`; carga de lista `"No pudimos cargar tus direcciones."` con reintentar.
- Checkout: `radiogroup` `"Dirección de entrega"` con la predeterminada preseleccionada, botón `"Agregar otra dirección"` (abre el mismo formulario con el interruptor apagado), enlace `"Administrar mis direcciones"` (guarda modalidad y elección en `sessionStorage` y va al perfil con `&desde=checkout`), `"Agregar dirección"` cuando no hay ninguna, y enlace `"Mis direcciones"` cuando el cupo está lleno.

### 8. Desvíos de este diagrama
D-12, D-13 (sección B).

---

## P1.10 Invitar Empleado

### 1. Funciones y archivos
- Controlador: `BE controllers/EquipoComercioController.java` `invitar`, `reenviar`, `cancelar`, `verEquipo`.
- Servicio: `BE services/InvitacionEmpleadoService.java` `invitar` (`:174-188`), `reenviar` (`:190-215`), `cancelar` (`:217-235`), `listarEquipo` (`:237-258`), `validarDestinatario` (`:568-588`), `validarTope` (`:612-623`), `enviar` (`:632-651`), `insertarConCodigoUnico` (`:658-678`). Otros: `AptitudCuentaEmpleadoService`, `MatrizRolesService`, `InvitacionRegularizacionService`, `CodigoTokenGenerador`, `EmailService.enviarInvitacionEmpleado` y `enviarRegularizacionInvitacion`, `NotificacionService.registrarEmailEnviado`, `InvitacionVencimientoJob` + `InvitacionVencimientoService` (vencimiento).
- Repositorios: `InvitacionEmpleadoRepository`, `InvitacionInsercionRepository` (INSERT por JDBC), `HistorialEmpleadoComercioRepository`, `EmpleadoComercioRepository`, `UsuarioRepository`, `ComercioRepository`, `DuenoRepository`.
- Entidades: `InvitacionEmpleado`, `HistorialEmpleadoComercio`, `Notificacion` (fila de regularización).
- DTOs: `InvitarEmpleadoRequestDTO`, `InvitacionEmpleadoResponseDTO`, `EquipoComercioResponseDTO`, `MiembroEquipoResponseDTO`.

### 2. Endpoints
Todos bajo `/api/v1/comercios/equipo`, solo `DUENO` (`SecurityConfig.java:150`, matcher `/comercios/**`), `X-Comercio-Id` obligatorio, fuera de la lista de rutas delegables: el Empleado NO invita, reenvía ni cancela.
| Operación | Método y ruta | HTTP | Mensaje |
|---|---|---|---|
| Invitar | POST `/invitaciones` | 201 | `"Invitación enviada a {email}"` |
| Reenviar | POST `/invitaciones/{invitacionId}/reenviar` | 200 | `"Invitación reenviada a {email}"` |
| Cancelar | PUT `/invitaciones/{invitacionId}/cancelar` | 200 | `"Invitación cancelada"` |
| Ver equipo | GET `/` | 200 | `"Equipo obtenido correctamente"` |

La invitación es por un comercio (el activo), con un solo dato: el email. No se invita a "varios comercios" a la vez.

### 3. Entradas y validaciones (invitar), en orden
**Request** (`InvitarEmpleadoRequestDTO`): `email`. El setter hace trim y minúsculas. Bean Validation: `@NotBlank` `"El email es obligatorio"`; `@ValidarFormatoEmail` `"Ingresá un email válido"`; `@Size(max=254)` `"El email no puede superar los 254 caracteres"`.

**Servicio** (`invitar`, `@Transactional(noRollbackFor = InvitacionNoAptaException)`):
1. Header y comercio del Dueño: C5 (400 / 404).
2. `bloquearDueno`: `usuarioRepository.findByIdConBloqueo(duenoId)` (`FOR UPDATE` sobre el usuario del Dueño; serializa el tope por hora y toda la secuencia). Falta → 404 `"Comercio no encontrado"`.
3. `comercioOperativo`: lee el estado con bloqueo compartido; si no es `APROBADO` ni `APTO_VENTA` → 409 `"Este comercio no puede invitar empleados en este momento"`. No hay chequeo de "solo lectura" propio: `SUSPENDIDO`, `CERRADO_TEMPORALMENTE`, `INACTIVO` y los demás estados caen en ese mismo 409.
4. `validarDestinatario(comercio, email)`, solo si el email ya tiene cuenta (sin cuenta, pasa):
   a. `aptitud.puedeSerEmpleado(id)` falso (la cuenta es de un Dueño o de un Administrador, `MatrizRolesService`) → 409 `"No se puede invitar a este email"` (`InvitacionNoAptaException`). No se escribe ni envía nada.
   b. Ya es `ACTIVO` en este comercio (`existsByEmpleadoIdAndComercioIdAndEstado`) → 409 `"Esa persona ya es parte de tu equipo"`.
   c. Cuenta con estado distinto de `ACTIVO` (`PENDIENTE`, `BLOQUEADO`, `SUSPENDIDO`, `INACTIVO`): `InvitacionRegularizacionService.registrarYEnviar` (ver sección 6) y 409 `"No se puede invitar a este email"`.
   d. Cuenta activa menor de 18 años (`tieneEdadParaEquipo`, `EDAD_MINIMA_EMPLEADO = 18`, con la fecha de nacimiento declarada) → 409 `"No se puede invitar a este email"`, sin email de regularización.
5. Pendiente vigente: invitaciones `PENDIENTE` del par (comercio, email) leídas con `FOR UPDATE`; si alguna tiene `fecha_vencimiento > ahora` → 409 `"Ya hay una invitación pendiente para ese email. Podés reenviarla."`.
6. Tope: `countByComercioIdAndFechaCreacionAfter(comercioId, ahora − 1 h) >= 5` (`TOPE_POR_HORA = 5`; cuenta todas las filas de invitación del comercio creadas en la última hora, o sea invitar y reenviar suman) → 409 `"Alcanzaste el máximo de 5 invitaciones por hora. Probá de nuevo a las HH:mm"` (hora = fecha de creación de la más antigua de esa hora + 1 h).
No hay tope de cantidad de empleados por comercio.

### 4. Pasos en orden exacto (escrituras)
En `enviar` (después de todas las validaciones; todo dentro de la transacción):
1. Las invitaciones `PENDIENTE` del par pasan a `REEMPLAZADA` si siguen vigentes, o a `VENCIDA` si ya pasó su fecha (red de seguridad), con `fecha_resolucion = ahora`; `flush`.
2. `insertarConCodigoUnico`: código de 6 dígitos (`CodigoTokenGenerador`), reintenta si ya existe un pendiente con ese código para el email (`existeCodigoPendiente`); INSERT por JDBC en `invitacion_empleado` (`comercio_id`, `email`, `codigo`, `estado = PENDIENTE`, `intentos_fallidos = 0`, `invitado_por_usuario_id`, `fecha_creacion = ahora`, `fecha_vencimiento = ahora + 7 días`); hasta `token.generacion.max-intentos` (20) intentos; si se agotan, 500 `"No pudimos generar el código de la invitación. Intentá nuevamente en unos instantes."`. Un choque por el índice del par (comercio, email) → 409 `"Ya hay una invitación pendiente para ese email. Podés reenviarla."`.
3. Fila en `historial_empleado_comercio` (`comercio_id`, `invitacion_id`, `motivo = INVITACION`, `actor_usuario_id` = el Dueño, `fecha_hora`).
4. Programa el email (`EjecucionPostCommit`).
- Vencimiento: 7 días (`VIGENCIA_DIAS = 7`); el estado `VENCIDA` lo guarda `InvitacionVencimientoJob` (`@Scheduled(fixedDelay = 60_000)`, `InvitacionVencimientoService.vencerLote`: `UPDATE … WHERE id IN (…)` sobre las `PENDIENTE` con `fecha_vencimiento <= ahora`, lotes de 500). Sin historial ni avisos al vencer.
- Intentos del código: 5 fallidos (`MAX_INTENTOS_CODIGO = 5`) → `INVALIDADA`.
- Código: se manda en el email, no hay link con el código. Entrada: pantalla `invitacion-empleado.html`.

**Reenviar** (`reenviar`): `bloquearDueno`; `comercioOperativo` (409 igual); lee la invitación por id y comercio con `FOR UPDATE` (no existe o es de otro comercio: 404 `"Invitación no encontrada"`); estado reenviable = `PENDIENTE`, `VENCIDA`, `INVALIDADA`, si no 409 `"Esta invitación ya no se puede reenviar"`; solo se puede reenviar la más nueva del par (`masNuevaDelPar`): si existe una más nueva, 409 `"Ya hay una invitación pendiente para ese email. Podés reenviarla."` (si esa es una pendiente vigente) o `"Esta invitación ya no se puede reenviar"`; después `validarDestinatario` (las mismas reglas 4a-4d, con los mismos 409), pendiente vigente (excluyendo la propia), tope, y `enviar`. La anterior queda `REEMPLAZADA` solo si era una pendiente vigente; una `VENCIDA` o `INVALIDADA` conserva su estado.

**Cancelar** (`cancelar`): `leerIdConBloqueoCompartido` del Dueño; invitación `FOR UPDATE` (404 `"Invitación no encontrada"`); estado cancelable = `PENDIENTE`, `VENCIDA`, `INVALIDADA`, si no 409 `"Esta invitación ya no se puede cancelar"`; comercio `SUSPENDIDO` → 409 `"El comercio está suspendido: el equipo se puede ver, pero no modificar"` (`COMERCIO_SUSPENDIDO`); si hay una más nueva del par → 409 `"Esta invitación ya no se puede cancelar"`; luego `estado = CANCELADA`, `fecha_resolucion = ahora` y fila `historial_empleado_comercio` (`INVITACION_CANCELADA`, actor el Dueño). Cancelar no exige comercio operativo (solo que no esté `SUSPENDIDO`).

### 5. Salidas
- Invitar: 201 con `InvitacionEmpleadoResponseDTO` (`id, email, estado, fechaCreacion, fechaVencimiento, diasRestantes`). `diasRestantes` solo si está `PENDIENTE` (techo de días, mínimo 1).
- Errores: los 400, 404 y 409 literales de las secciones 3 y 4, y 500 si no se genera código.
- Ver equipo: 200 con `{miembros, invitaciones}`; los miembros vienen de `empleado_comercio` (por `fecha_alta`, `id`) con motivo de baja y `puedeReactivar`; las invitaciones son la más reciente de cada email en estado `PENDIENTE`, `VENCIDA` o `INVALIDADA`; una `PENDIENTE` con fecha cumplida se informa como `VENCIDA`.

### 6. Efectos secundarios
**Email de invitación** (`EmailService.enviarInvitacionEmpleado`, destinatario = el email invitado, después del commit):
- Asunto: `"{nombreDueño} te invitó a trabajar en {nombreComercio}"` (nombre completo del Dueño; si falta su persona física, `"Un comercio"`).
- Cuerpo: `"Hola,\n\n{nombreDueño} te invitó a sumarte al equipo de {nombreComercio} en Bajoneá. Con tu cuenta vas a poder gestionar sus productos y pedidos.\n\nTu código: {código}\nVence en 7 días.\n\nCómo aceptarla:\n1. Entrá a {frontendBaseUrl}/invitacion-empleado.html\n2. Ingresá este email y el código.\n3. Si todavía no tenés cuenta, completá tus datos.\n\nTambién podés abrir Bajoneá y tocar «Tengo una invitación» en la pantalla de inicio de sesión.\n\nSi no esperabas este mensaje, ignoralo."`.
- El enlace es genérico (sin código, sin email, sin `#`). El envío no tiene reintentos y un fallo no revierte nada (Tramo A C2).

**Email de regularización** (cuenta existente no apta, `InvitacionRegularizacionService.registrarYEnviar`): si la cuenta ya recibió 3 o más en las últimas 24 h (`TOPE_POR_VENTANA = 3`, filas de `notificacion` con tipo `INVITACION_EMPLEADO`, canal `EMAIL` y ese usuario), no hace nada. Si no: inserta una fila `notificacion` (canal `EMAIL`, estado `ENVIADO`, mensaje `"Invitación de {comercio} no enviada porque {motivo}"`) y programa `EmailService.enviarRegularizacionInvitacion`:
- Asunto: `"Un comercio quiso invitarte a trabajar en Bajoneá"`.
- Cuerpo: `"{comercio} quiso invitarte a su equipo en Bajoneá, pero no pudimos enviarte la invitación porque {motivo}.\n\n{acción}\n\nDespués, pedile al comercio que te invite de nuevo.\n\nSi no esperabas este mensaje, ignoralo."`.
- `{motivo}` / `{acción}` por estado (`MotivoRegularizacionInvitacion`): `BLOQUEADO` `"tu cuenta está bloqueada"` / `"Recuperá tu contraseña desde el inicio de sesión."`; `SUSPENDIDO` `"tu cuenta está suspendida"` / `"Contactá a soporte."`; `INACTIVO` `"tu cuenta está inactiva"` / `"Iniciá sesión para reactivarla."`; `PENDIENTE` `"todavía no verificaste tu email"` / `"Verificá tu email para activar tu cuenta."`.
- Nombra solo al comercio, nunca al Dueño. Esa fila se conserva aunque el Dueño reciba el 409 (`noRollbackFor`).
- Sin aviso in-app al Dueño al invitar ni al reenviar.

### 7. Frontend
`FE js/equipo-comercio.js` (+ `FE js/equipo-vistas.js`), vista `view-equipo` dentro de `FE comercio-perfil.html` (fila `"Ver equipo"`, solo para el Dueño).
- Pestañas: `"Mi equipo"`, `"Solicitudes"`, `"Actividad"` (con contador en las dos primeras). El pie muestra `"Invitar"` salvo en Actividad. Actualización cada 15 s mientras la vista está abierta.
- Estados de invitación en pantalla: `"Pendiente"` (con `"vence en N días"`), `"Vencida"` (`"Vencida hace N días"` / `"Vencida hoy"`), `"Código bloqueado"` (la invitación `INVALIDADA`).
- Hoja `"Invitar al equipo"`: campo `Email`, ayuda `"Le llega un código que vale 7 días."`, botón `"Enviar invitación"` (`"Enviando..."`). Éxito: se cierra la hoja, toast con el mensaje del servidor (`"Invitación enviada a {email}"`), pasa a la pestaña Solicitudes y recarga.
- Todos los rechazos genéricos (`"No se puede invitar a este email"`) se muestran como un aviso fijo bajo el campo: título `"No pudimos invitar a este email."` y cuerpo `"Por privacidad no podemos contarte el motivo. Podés pedirle a esta persona que revise su correo y volver a intentar más tarde."`; el botón queda deshabilitado para ese email mientras no cambie. Los demás errores (`"Esa persona ya es parte de tu equipo"`, pendiente existente, tope, comercio no operativo) salen bajo el campo con el texto del servidor; por defecto `"No pudimos enviar la invitación. Probá de nuevo."`.
- Menú ⋯ de cada solicitud (todas las filas): `"Reenviar código"` y `"Cancelar invitación"`. Reenviar: toast con el mensaje del servidor; si el 409 es genérico, abre una hoja de aviso con `"Entendido"`; otro error: toast `"No pudimos reenviar la invitación. Probá de nuevo."`. Cancelar: hoja `"¿Cancelar la invitación a {email}?"` con `"Cancelar invitación"` (`"Cancelando…"`) y `"Volver"`; toast `"Invitación cancelada"`; error `"No pudimos cancelar la invitación. Probá de nuevo."`.
- Comercio `SUSPENDIDO`: aviso `"El comercio está suspendido: el equipo está en solo lectura."`.
- Vacíos: `"Todavía no tenés equipo"`, `"No hay miembros inactivos"`, `"No hay solicitudes"`; error de carga `"No pudimos cargar el equipo."`.

### 8. Desvíos de este diagrama
D-03, D-05 (en lo que toca al comercio no aceptable), D-14 (sección B).

---

## P1.11 Aceptar invitación y alta de Empleado

### 1. Funciones y archivos
- Controlador: `BE controllers/InvitacionEmpleadoPublicaController.java` `validar`, `aceptar`.
- Servicio: `BE services/InvitacionEmpleadoService.java` `validar` (`:270-281`), `aceptar` (`:298-366`), `resolver` (`:391-421`), `registrarIntentoFallido` (`:423-432`), `bloquearUsuariosEnOrden` (`:434-449`), `validarCuentaExistente` (`:479-487`), `validarDatosDeCuentaNueva` (`:489-509`), `validarComercioAceptable` (`:511-518`); `BE services/RegistroService.java` `crearCliente` (`:100-130`); `AptitudCuentaEmpleadoService`; `MatrizRolesService`; `MensajesEstadoCuenta`; `NotificacionService.crearParaDueno` y `purgarAvisosDelComercio`; `EmpleadoInsercionRepository` (`insertarEmpleadoSiNoExiste`, `insertarRelacionActivaSiNoExiste`).
- Repositorios: `InvitacionEmpleadoRepository`, `EmpleadoComercioRepository`, `HistorialEmpleadoComercioRepository`, `PersonaFisicaRepository`, `UsuarioRepository`.
- DTOs: `ValidarInvitacionEmpleadoRequestDTO`, `AceptarInvitacionEmpleadoRequestDTO` (con `DatosClienteRequestDTO cuentaNueva`), `InvitacionEmpleadoValidadaResponseDTO`, `InvitacionEmpleadoAceptadaResponseDTO`.

### 2. Endpoints
| Operación | Método y ruta | Rol | Público | Rate limit |
|---|---|---|---|---|
| Validar código | POST `/api/v1/auth/invitaciones-empleado/validar` | ninguno | sí (ruta exacta en `RUTAS_PUBLICAS`, `SecurityConfig.java:112`) | 10/min por IP (Tramo A C7) |
| Aceptar | POST `/api/v1/auth/invitaciones-empleado/aceptar` | ninguno | sí (`:113`) | 10/min por IP |
Sin `X-Comercio-Id`. Llega a la pantalla por el enlace del email o por el botón `"Tengo una invitación"` del login (`FE login.html`) o del registro.

### 3. Entradas y validaciones
**`validar`** (`ValidarInvitacionEmpleadoRequestDTO`): `email` (trim y minúsculas; `"El email es obligatorio"`, `"Ingresá un email válido"`, máximo 254) y `codigo` (`"El código es obligatorio"`, `@Pattern \d{6}` `"El código debe tener 6 dígitos numéricos"`).

**`aceptar`**: los mismos dos campos, más `aceptaTerminos` (`Boolean`, sin anotaciones en el DTO) y `cuentaNueva` (`@Valid DatosClienteRequestDTO`, con las mismas validaciones del registro de Cliente del Tramo A, P1.01: nombre, apellido, DNI, fecha de nacimiento plausible, teléfono, nombre de usuario, contraseña, dirección, foto opcional). El DTO no exige `cuentaNueva` ni `aceptaTerminos`: eso es regla del servicio.

**Reglas del servicio de `validar`**:
1. `resolver(email, codigo, ahora, false)`: busca las invitaciones `PENDIENTE` vigentes del email (`fecha_vencimiento > ahora`). Si no hay ninguna, o ninguna coincide con el código: suma 1 a `intentos_fallidos` de todas las vigentes del email (a los 5 pasan a `INVALIDADA` con `fecha_resolucion`) y lanza 401 `"El código es incorrecto o la invitación ya no está vigente. Pedí que te reenvíen la invitación."` (`CodigoInvitacionInvalidoException`, `noRollbackFor`: el contador sobrevive). El 401 es único: inexistente, vencida, cancelada, reemplazada, ya usada, invalidada y código errado dan el mismo texto, sin intentos restantes.
2. Con el código correcto: si el email tiene cuenta, `validarSePuedeAceptar` (cuenta existente y comercio, ver abajo); falla → 409.
3. 200 `"Invitación válida"` con `{comercioNombre, comercioFotoPerfilUrl, cuentaExistente, fechaVencimiento}`.

**Reglas del servicio de `aceptar`**, en orden:
1. `resolver(…, true)`: igual que arriba; además bloquea las filas `usuario` del invitado (si tiene cuenta) y del Dueño en id ascendente (C6) y las invitaciones por clave primaria.
2. Cuenta existente (`existente != null`) → `validarCuentaExistente`, en este orden:
   - rol incompatible (la cuenta es Dueño o Administrador) → 409 `"No se puede aceptar esta invitación con esta cuenta"`;
   - estado distinto de `ACTIVO` → 409 con el texto del login para ese estado (`MensajesEstadoCuenta.conflictoDeLogin`): `PENDIENTE` `"Verificá tu email antes de iniciar sesión"`, `BLOQUEADO` `"Cuenta bloqueada. Recuperá tu contraseña para desbloquearla"`, `INACTIVO` `"Cuenta inactiva. Solicitá la reactivación de tu cuenta"`, `SUSPENDIDO` `"Cuenta suspendida"`;
   - menor de 18 años → 409 `"Tenés que tener 18 años o más para sumarte a un equipo"`.
   La cuenta existente nunca se modifica, y se ignoran `cuentaNueva` y `aceptaTerminos`. No se pide contraseña ni nada más que email y código.
3. Cuenta inexistente → `validarDatosDeCuentaNueva`; junta errores y lanza 400 con el mapa: `cuentaNueva` `"Completá tus datos para crear tu cuenta"` si falta; `aceptaTerminos` `"Tenés que aceptar los Términos y Condiciones"` si no es `true`; `cuentaNueva.fechaNacimiento` `"Tenés que tener 18 años o más para trabajar en un comercio"` si da menos de 18 (el mensaje de 14 años no aparece nunca en este flujo); `cuentaNueva.direccion.localidadId` `"Esa localidad todavía no está disponible"` si la localidad existe y no está habilitada. Esto ocurre antes de crear nada.
4. Alta de la cuenta nueva: `RegistroService.crearCliente(cuentaNueva, email, ACTIVO)`: mismas reglas del Tramo A P1.01 paso 2 — email único, nombre de usuario disponible (409 `"Ese nombre de usuario ya está en uso"`), DNI único (409 `"Ya existe una cuenta registrada con ese DNI"`), localidad (404/400) — y escribe `usuario` (rol `CLIENTE`, estado `ACTIVO`), `persona`, `persona_fisica`, `cliente`, `direccion` principal. NO envía email de verificación ni crea token: el código de la invitación ya probó el email.
5. `invitacionRepository.flush()`; `insertarEmpleadoSiNoExiste(usuarioId)` (fila `empleado`, "insertar o no hacer nada"); `insertarRelacionActivaSiNoExiste(usuarioId, comercioId)` (fila `empleado_comercio` con `estado = ACTIVO`, `fecha_alta = ahora`). Si la relación ya existía, la lee con `FOR UPDATE`; si estaba `INACTIVO` la reactiva en la misma fila (`estado = ACTIVO`, `fecha_baja = null`). Si ya estaba `ACTIVO` no cambia nada (sin error).
6. `validarComercioAceptable`: lee el estado con bloqueo compartido; si no es `APROBADO`, `APTO_VENTA` o `CERRADO_TEMPORALMENTE` → 409 `"Esta invitación ya no está disponible"` (revierte toda la transacción, incluida la cuenta nueva). `SUSPENDIDO` también falla (ver D-03).
7. La invitación pasa a `ACEPTADA` (`usuario_aceptante_id`, `fecha_resolucion = ahora`).
8. Historial (`historial_empleado_comercio`): una fila `ACEPTACION` (origen null, destino `ACTIVO`, actor el invitado) y, si se reactivó, otra fila `REACTIVACION` (origen `INACTIVO`, destino `ACTIVO`).
9. Si la relación es nueva o se reactivó, `purgarAvisosDelComercio(invitadoId, comercioId)` borra por clave primaria sus avisos anteriores de ese comercio.
10. Aviso in-app al Dueño (ver sección 6).

### 4. Rol con el que queda el usuario y contexto
- No se cambia `usuario.rol`: queda `CLIENTE` (cuenta nueva o existente). No hay JWT nuevo ni inicio de sesión en `aceptar`.
- Ser Empleado = tener fila en `empleado` y una o más en `empleado_comercio` con `estado = ACTIVO`. El contexto "Empleado de X" se resuelve después en cada request con `X-Comercio-Id` (C5) y en la pantalla con el selector de P1.16.
- Un Cliente que ya es Empleado de otro comercio puede aceptar otra invitación: la fila `empleado` ya existe (no se duplica) y se agrega otra relación; no hay límite. Las relaciones de cada comercio son independientes (la baja en uno no afecta a los otros).
- Matriz de roles (Empleado = Empleado o Cliente): un Dueño o Administrador no puede aceptar (409 de arriba).

### 5. Salidas
200 `"Ya sos parte del equipo de {comercioNombre}"` con `{comercioNombre, cuentaCreada, reactivada}`. Errores: 400 (validación DTO y de cuenta nueva), 401 único del código, 409 (`"No se puede aceptar esta invitación con esta cuenta"`, estados de cuenta, edad, `"Esta invitación ya no está disponible"`, DNI o usuario duplicado).

### 6. Efectos secundarios
- Aviso in-app al Dueño (`NotificacionService.crearParaDueno`, tipo `INVITACION_EMPLEADO`, entidad `COMERCIO`, con `comercio_id`): `"{nombre} {apellido} aceptó tu invitación y ya es parte del equipo de {comercio}"`. Dentro de la transacción.
- Sin email al Dueño ni al Empleado. Sin aviso para el Empleado.
- La invitación aceptada queda `ACEPTADA`. Con el código correcto no se modifican las otras invitaciones del email; los intentos fallidos solo se suman cuando el código es incorrecto.

### 7. Frontend
`FE invitacion-empleado.html` + `FE js/invitacion-empleado.js` (cuatro vistas); la cuenta nueva usa `FE js/cliente-form.js` `montarFormularioCliente`.
- Vista `"Tengo una invitación"` (código): `Email` y `Código` (6 casillas, `crearInputOtp`), texto `"Pedile al comercio que te reenvíe el código si venció."`, botón `"Continuar"` (`"Verificando..."`). Validación: `"El email es obligatorio"`, `"Ingresá un email válido"`, `"Ingresá el código de 6 dígitos."`. Llama a `validar`. Errores: 401 en el campo del código (`error.message` o el texto único) y casillas en error; 400 por campo; resto en banner (`"No pudimos conectar. Probá de nuevo."` para red o 5xx; `"Demasiados intentos. Probá de nuevo en un minuto."` para 429).
- Vista `"Invitación"` (cuenta existente): avatar y nombre del comercio, `"Te invitaron a sumarte a su equipo."`, `"Cuenta: {email}"`, botón `"Aceptar invitación"` (`"Aceptando..."`). Errores en banner.
- Vista `"Crear tu cuenta"` (cuenta nueva): subtítulo `"Para sumarte a {comercio}"`; el asistente del registro de Cliente en dos pasos, sin email ni enlace a login, con edad mínima 18 (`"Tenés que tener 18 años o más para trabajar en este comercio."`, aviso en vivo al completar la fecha) y botón `"Crear cuenta y aceptar"` (`"Creando cuenta..."`). Un 409 con `"Ya existe una cuenta registrada con ese DNI"` se convierte en error del campo `cuentaNueva.dni`.
- Vista de éxito: `"Ya sos parte del equipo de {comercio}"` y botón de ir al login: cierra la sesión guardada si hay token, marca un aviso de un solo uso y va a `login.html`, donde aparece el toast `"Listo, ya podés ingresar"` (`FE js/auth.js`).
- El botón de volver: del código al login; de la cuenta nueva paso 2 al paso 1; de ahí al código.

### 8. Desvíos de este diagrama
D-03, D-15 (sección B).

---

## P1.12 Activar, desactivar y renunciar (Empleado) y asignación a comercios

### 1. Funciones y archivos
- Controladores: `BE controllers/EquipoComercioController.java` `desactivar`, `reactivar`; `BE controllers/EmpleadoController.java` `renunciar`, `acceso`, `misComercios`.
- Servicio: `BE services/GestionMiembroEquipoService.java` `desactivar` (`:86-105`), `reactivar` (`:107-149`), `renunciar` (`:159-183`), `bloquearUsuarios`, `bloquearRelacion`, `exigirComercioNoSuspendido`, `exigirComercioOperativo`; `BE services/AptitudCuentaEmpleadoService.java`; `BE services/AccesoEmpleadoService.java`; `BE services/NotificacionService.java` (`purgarAvisosDelComercio`, `crearParaCliente`, `crearParaDueno`).
- Repositorios: `EmpleadoComercioRepository`, `HistorialEmpleadoComercioRepository.findUltimaBaja`, `InvitacionEmpleadoRepository.findFirstByComercioIdAndEmailOrderByIdDesc`, `UsuarioRepository`, `ComercioRepository`.
- Entidades: `EmpleadoComercio`, `HistorialEmpleadoComercio`, `Notificacion`.
- DTOs: `MiembroEquipoResponseDTO`, `AccesoComercioEmpleadoResponseDTO`.

### 2. Endpoints
| Operación | Método y ruta | Rol | `X-Comercio-Id` | HTTP |
|---|---|---|---|---|
| Desactivar | PUT `/api/v1/comercios/equipo/miembros/{empleadoId}/desactivar` | `DUENO` | sí | 200 |
| Reactivar | PUT `/api/v1/comercios/equipo/miembros/{empleadoId}/reactivar` | `DUENO` | sí | 200 |
| Renunciar | PUT `/api/v1/empleados/comercios/{comercioId}/renunciar` | `CLIENTE` (`SecurityConfig.java:145`) | no (el comercio va en la ruta) | 200 |
| Acceso propio | GET `/api/v1/empleados/comercios/{comercioId}/acceso` | `CLIENTE` (`:146`) | no | 200 |
Mensajes de éxito: desactivar `"Miembro dado de baja"` o `"El miembro ya estaba inactivo"`; reactivar `"Miembro reactivado"` o `"El miembro ya estaba activo"`; renunciar `"Dejaste de trabajar en el comercio"` o `"Ya habías dejado de trabajar en este comercio"`; acceso `"Acceso obtenido correctamente"`. Las tres operaciones son idempotentes.

### 3. Entradas y validaciones
Sin cuerpo en ninguna. Parámetro de ruta `empleadoId` (id de usuario del Empleado) o `comercioId`.

**Desactivar** (orden):
1. C5 (400 / 404 del header).
2. `bloquearUsuarios(duenoId, empleadoId, exclusivo = false)`: si el Dueño y el Empleado son el mismo id → 404 `"Miembro no encontrado"`; toma las dos filas `usuario` con bloqueo compartido en id ascendente (`leerIdConBloqueoCompartido` / `leerEstadoConBloqueoCompartido`); falta el Empleado → 404 `"Miembro no encontrado"`; falta el Dueño → 404 `"Comercio no encontrado"`.
3. `bloquearRelacion` (`FOR UPDATE`): no hay relación del empleado con este comercio → 404 `"Miembro no encontrado"`.
4. `exigirComercioNoSuspendido`: comercio `SUSPENDIDO` → 409 `"El comercio está suspendido: el equipo se puede ver, pero no modificar"` (`COMERCIO_SUSPENDIDO`). Con `CERRADO_TEMPORALMENTE`, `INACTIVO` y los demás estados NO se bloquea.
5. Si la relación ya está `INACTIVO` → 200 sin escribir.

**Reactivar** (orden): igual 1-3, pero el Dueño se toma `FOR UPDATE` (serializa con invitar y reenviar); luego, si la relación ya está `ACTIVO` → 200 sin escribir; `exigirComercioOperativo` (si el comercio no es `APROBADO` ni `APTO_VENTA`: 409 `"Este comercio no puede reactivar empleados en este momento"`, `data.codigo = NO_OPERATIVO`); luego la última baja (`findUltimaBaja`): si no fue `BAJA_DUENO` → 409 `EMPLEADO_NO_REACTIVABLE` con `"Esta persona dejó el equipo por su cuenta. Para que vuelva, invitala de nuevo."` (si fue `RENUNCIA`) o `"Esta persona no se puede reactivar directamente. Para que vuelva, invitala de nuevo."` (si no hay registro de baja); invitación `PENDIENTE` vigente del email en este comercio → 409 `INVITACION_PENDIENTE` `"Hay una invitación pendiente para esta persona. Cancelala primero."`; aptitud de la cuenta (rol, estado `ACTIVO`, edad 18) distinta de `APTA` → 409 `"No se puede reactivar a esta persona"` (genérico, sin decir el motivo ni mandar email).

**Renunciar** (orden):
1. `comercioRepository.findDuenoIdById(comercioId)` (consulta propia, fuera de la transacción): no existe → 404 `"Comercio no encontrado"` con `data.codigo = COMERCIO_NO_DISPONIBLE`.
2. Transacción (`TransactionTemplate`): `bloquearUsuarios(duenoId, empleadoId, false, …)` con el mismo 404 si el Dueño o el Empleado no existen.
3. `findByEmpleadoIdAndComercioIdConBloqueo`: sin relación → el mismo 404 `COMERCIO_NO_DISPONIBLE` (indistinguible de un comercio inexistente).
4. Relación ya `INACTIVO` → 200 sin escribir (también si la bajó el Dueño). Funciona con el comercio en cualquier estado (no se lee el estado del comercio).
Un Dueño o Administrador que llame a `renunciar` recibe 403 de la seguridad.

### 4. Pasos en orden exacto
**Desactivar** (con la relación `ACTIVO`): `relacion.estado = INACTIVO`, `fecha_baja = ahora`; fila `historial_empleado_comercio` (`motivo = BAJA_DUENO`, `estado_origen ACTIVO`, `estado_destino INACTIVO`, `actor_usuario_id` = el Dueño; sin `invitacion_id`); `purgarAvisosDelComercio(empleadoId, comercioId)` (borra por clave primaria los avisos de ese comercio del Empleado); aviso al Empleado (ver sección 6). Todo en una transacción.

**Reactivar**: `relacion.estado = ACTIVO`, `fecha_baja = null`; fila `REACTIVACION` (origen `INACTIVO`, destino `ACTIVO`, actor el Dueño, sin invitación); `purgarAvisosDelComercio`; aviso al Empleado.

**Renunciar**: `estado = INACTIVO`, `fecha_baja = ahora`; fila `RENUNCIA` (actor el propio Empleado); `purgarAvisosDelComercio`; aviso al Dueño.

**Sesiones y acceso inmediato**: ninguna de las tres operaciones cierra sesiones ni toca el JWT del Empleado (su sesión es de Cliente y sigue vigente). El acceso al comercio se corta de inmediato porque cada request con `X-Comercio-Id` vuelve a consultar la relación (C5): la siguiente request del Empleado a ese comercio recibe 404 `COMERCIO_NO_DISPONIBLE`. Dentro de una escritura delegada, la relación se revalida con bloqueo compartido (`ComercioActivoService.exigirRelacionActiva`): una desactivación simultánea hace que la escritura responda el mismo 404.

**Estado "Inactivo" de la cuenta**: la relación `EmpleadoComercio` tiene solo `ACTIVO` e `INACTIVO`. La cuenta de Cliente del Empleado no cambia (sigue `ACTIVO` y puede comprar).

**Asignación y desasignación a comercios**: NO EXISTE endpoint de asignación manual. La única forma de que una persona quede asignada a un comercio es aceptar una invitación (P1.11), que crea o reactiva la relación de ese comercio. Un Empleado puede tener relaciones `ACTIVO` con varios comercios, del mismo Dueño o de distintos; cada una se maneja por separado. Sacarlo de un comercio (desactivar o renunciar) no toca sus otras relaciones. No hay regla de "último comercio": si pierde todos, sigue siendo un Cliente normal sin contexto de comercio (P1.16).

### 5. Salidas
200 con `MiembroEquipoResponseDTO` (`empleadoId, nombre, apellido, email, estado, fechaAlta, motivoBaja, puedeReactivar, cuentaSuspendida`) para desactivar y reactivar; 200 con `data` null para renunciar. `acceso` devuelve `{estado, motivoBaja (BAJA_DUENO, RENUNCIA o null), comercioAccesible}`; sin relación, 404 `COMERCIO_NO_DISPONIBLE`. Errores: los literales de la sección 3.

### 6. Efectos secundarios
- Desactivar: aviso in-app al Empleado (`crearParaCliente`, tipo `EMPLEADO_DESACTIVADO`, entidad `COMERCIO`, personal, sin `comercio_id`): `"{comercio} te dio de baja del equipo. Ya no tenés acceso a ese comercio."`. Sin email.
- Reactivar: aviso in-app al Empleado (tipo `EMPLEADO_REACTIVADO`): `"{comercio} te reactivó en el equipo. Ya podés volver a trabajar ahí."`. Sin email.
- Renunciar: aviso in-app al Dueño (`crearParaDueno`, tipo `EMPLEADO_DESACTIVADO`, con `comercio_id`): `"{nombre} {apellido} dejó de trabajar en {comercio}."`. Sin email.
- Los avisos viejos del comercio del Empleado se borran en las tres operaciones.
- Los tres hechos aparecen en la pestaña Actividad del Dueño y del Administrador (fuente `EQUIPO`): `"Dio de baja a {Nombre}"`, `"Dejó de trabajar en el comercio"`, `"Reactivó a {Nombre}"`.
- Sin jobs.

### 7. Frontend
**Dueño** (`FE js/equipo-comercio.js`, vista `"Ver equipo"`):
- `"Mi equipo"` con filtros `"Activos"` (por defecto) e `"Inactivos"`; cada integrante con ⋯.
- Integrante activo: hoja con `"Desactivar"`. Confirmación `"¿Desactivar a {nombre}?"`, texto `"{nombre} va a dejar de tener acceso a {comercio} y se le avisa. Si cambiás de idea, la podés reactivar desde Inactivos."`, botones `"Desactivar"` (`"Desactivando…"`) y `"Volver"`. Toast `"Desactivaste a {nombre}"`; error `"No pudimos desactivar a esta persona. Probá de nuevo."`.
- Integrante inactivo: si `puedeReactivar` → `"Reactivar"` con la leyenda `"Vuelve al equipo ahora, sin invitación"` (toast `"Reactivaste a {nombre}"`; error `"No pudimos reactivar a esta persona. Probá de nuevo."`); si no → `"Invitar de nuevo"` con la leyenda `"Le llega un código por email y tiene que aceptar"`; si renunció, nota `"Dejó el equipo por su cuenta. Para que vuelva, tiene que aceptar una invitación nueva."`.
- Textos de baja en la fila: `"Dado de baja el DD/MM"`, `"Renunció el DD/MM"`, o `"Inactivo"`.

**Empleado** (`FE comercio-perfil.html`, `FE js/renuncia-empleado.js` `abrirHojaRenuncia`):
- Sección `"Mi lugar en el equipo"`: botón `"Dejar de trabajar en este comercio"` y ayuda `"Dejás de formar parte del equipo de {comercio}. Tu cuenta sigue funcionando."`.
- Hoja `"¿Dejar de trabajar en {comercio}?"` con el texto `"Vas a salir del equipo y no vas a poder volver a operar en este comercio. Se le notificará al dueño. Tu cuenta y tus datos personales continuarán intactos."`, casilla obligatoria `"Entiendo que para volver el dueño me tiene que invitar de nuevo."` (el botón nace deshabilitado hasta marcarla), botones `"Dejar de trabajar"` (`"Saliendo…"`) y `"Volver"`.
- Errores en la hoja: `"No pudimos procesar tu salida del equipo. Intentá de nuevo."`, `"No pudimos conectar. Revisá tu conexión e intentá de nuevo."` (red), `"No encontramos este comercio entre los tuyos. Es posible que ya no formes parte del equipo."` (404), y el mensaje del servidor en un 409.
- Éxito (`completarRenuncia`, `FE js/api.js`): limpia el contexto, olvida el último contexto si era ese comercio, guarda el toast `"Dejaste de trabajar en {comercio}"` y redirige a `seleccionar-contexto.html` (que, si ya no le quedan comercios, lo manda a `index.html`).
- Pérdida de acceso por baja del Dueño: ver P1.16 (hoja `"Ya no tenés acceso a este comercio"`).

### 8. Desvíos de este diagrama
D-03, D-05, D-16 (sección B).

---

## P1.13 Suspender y levantar suspensión de Cliente (S1)

### 1. Funciones y archivos
- Controlador: `BE controllers/AdministradorController.java` `vistaPreviaSuspensionCliente`, `suspenderCliente`, `levantarSuspensionCliente`, `reenviarEmailSuspensionCliente`.
- Servicio: `BE services/SuspensionUsuarioService.java` `suspender`, `levantar`, `estadoAlLevantar`, `vistaPrevia`, `reenviarEmail`, `validarObjetivo`, `bloquearParaCambiar`, `cerrarSesionesPorSuspension`. Apoyo: `EstadoUsuarioService.cambiar` (C3), `AvisoCuentaService.avisarSuspension` y `avisarLevantamiento` (C4), `PedidoService.cancelarPedidosSinPagarPorSuspensionCliente`.
- Repositorios: `UsuarioRepository`, `SesionRepository`, `PedidoRepository`, `HistorialEstadoUsuarioRepository`.
- DTOs: `SuspensionUsuarioRequestDTO`, `LevantamientoSuspensionRequestDTO`, `SuspensionUsuarioResponseDTO`, `SuspensionClientePreviaResponseDTO`, `ClienteAdminResponseDTO`.

### 2. Endpoints
Todos bajo `/api/v1/administrador/**`, rol `ADMINISTRADOR` (`SecurityConfig.java:152`), sin `X-Comercio-Id`.
| Operación | Método y ruta | HTTP | Mensaje |
|---|---|---|---|
| Vista previa | GET `/clientes/{clienteId}/suspension/previa` | 200 | `"Vista previa obtenida correctamente"` |
| Suspender | PUT `/clientes/{clienteId}/suspender` | 200 | `"Cuenta suspendida correctamente"` |
| Levantar | PUT `/clientes/{clienteId}/levantar-suspension` | 200 | `"Suspensión levantada correctamente"` |
| Reenviar email | POST `/clientes/{clienteId}/suspension/reenviar-email` | 200 / 502 | mensaje según el resultado |
| Listado | GET `/clientes` | 200 | (`ClienteAdminResponseDTO`: `id, nombre, apellido, dni, email, estado, fechaRegistro, motivoSuspension, suspendidoDesde, ultimoEmailAvisoFallido, estadoPrevioSuspension`) |
Un Empleado es un Cliente: se suspende por estos mismos endpoints. Un Dueño se suspende por los de P1.14.

### 3. Entradas y validaciones
**Suspender** (`SuspensionUsuarioRequestDTO`): `motivo` (trim). `@NotBlank` `"Ingresá el motivo de la suspensión"`; `@Size(min=10, max=500)` `"El motivo debe tener entre 10 y 500 caracteres"`.
**Levantar** (`LevantamientoSuspensionRequestDTO`, cuerpo opcional): `motivo` opcional (vacío → `null`), `@Size(max=500)` `"El motivo no puede superar los 500 caracteres"`.

Reglas del servicio (`validarObjetivo`, antes de abrir la transacción):
1. El objetivo es el mismo Administrador → 409 `"No podés suspender tu propia cuenta"`.
2. `findRolById` no existe → 404 `"Usuario no encontrado"`.
3. Rol `ADMINISTRADOR` → 409 `"No se puede suspender a un Administrador"`.
4. Rol `DUENO` → 409 `"Un Dueño se suspende desde la lista de Dueños"`.
Ya suspendido → 409 `"La cuenta ya está suspendida"`. Levantar una no suspendida → 409 `"La cuenta no está suspendida"`. No hay restricción por el estado previo (se puede suspender `PENDIENTE`, `ACTIVO`, `BLOQUEADO` o `INACTIVO`).

### 4. Pasos en orden exacto
**Suspender** — dos fases:
- Fase 1 (una transacción corta, `TransactionTemplate`): bloqueo de los dos usuarios en id ascendente (el Administrador compartido y el Cliente `FOR UPDATE`, releído con `refresh`; es la primera lectura de la transacción) → revalida `estado == SUSPENDIDO` sobre la fila bloqueada → `EstadoUsuarioService.cambiar(usuario, SUSPENDIDO, motivo, administradorId)` (C3: `usuario.estado`, `motivo_suspension`, `suspendido_desde`, fila de `historial_estado_usuario` con el administrador) → `cerrarSesionesPorSuspension` (C2) → `avisoCuentaService.avisarSuspension` (aviso in-app y email programado, C4).
- Fase 2 (después del commit, no dentro de la fase 1 porque cada pedido toma la fila del Cliente): `PedidoService.cancelarPedidosSinPagarPorSuspensionCliente(clienteId)`: por cada pedido `PENDIENTE_PAGO` del Cliente, una transacción con `bloquearParaActualizar`; si sigue `PENDIENTE_PAGO` lo pasa a `CANCELADO_POR_SISTEMA` (`cancelado_por = SISTEMA`, `motivo = "Cuenta suspendida"`) y escribe historial de pedido (actor `SISTEMA`, motivo `SUSPENSION_CLIENTE`). Un pago aprobado posterior sobre un pedido ya cancelado se reembolsa siempre (CLAUDE.md, tramo S1).
- Pedidos pagados en curso (`PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`): no se tocan; siguen su curso.
- Respuesta: `{usuarioId, estado: SUSPENDIDO, pedidosSinPagarCancelados}`.

**Levantar** (una transacción): mismo bloqueo; revalida `estado == SUSPENDIDO`; `estadoAlLevantar`: el `estado_origen` de la última fila de historial con destino `SUSPENDIDO`; si fue `PENDIENTE` o `INACTIVO` vuelve a ese estado; en cualquier otro caso (incluida `BLOQUEADO` y la ausencia de fila) vuelve a `ACTIVO`. `intentos_fallidos = 0`; `EstadoUsuarioService.cambiar(usuario, destino, motivo, administradorId)` (limpia las columnas de suspensión); si el destino es `ACTIVO`, `fecha_ultimo_acceso = ahora`; `avisoCuentaService.avisarLevantamiento`. Respuesta `{usuarioId, estado: destino, pedidosSinPagarCancelados: 0}`. No restaura las sesiones cerradas.

**Vista previa**: lee el estado y cuenta los pedidos pagados en curso y los sin pagar del Cliente; no bloquea.

### 5. Salidas
200 con los DTO de la sección 4; errores literales de la sección 3; 400 de validación; 404 `"Usuario no encontrado"`. Reenviar email: 200 si salió, 502 si falló (mensajes según el controlador).

### 6. Efectos secundarios
- Suspender: aviso in-app al Cliente (`CLIENTE_SUSPENDIDO`): `"Tu cuenta fue suspendida. Motivo: {motivo}"`; email `"Tu cuenta de Bajoneá fue suspendida"`:
  `"Tu cuenta de Bajoneá fue suspendida.\n\nMotivo: {motivo}\n\nMientras la cuenta esté suspendida no vas a poder iniciar sesión ni hacer pedidos. Los pedidos que ya pagaste siguen su curso normal y los que todavía no pagaste se cancelaron.\n\nEquipo de Bajoneá"`.
- Levantar: aviso in-app (`SUSPENSION_LEVANTADA`): `"Levantamos la suspensión de tu cuenta."` + `" Mensaje del equipo: {motivo}"` si hay; email `"Tu cuenta de Bajoneá volvió a estar activa"`: `"Levantamos la suspensión de tu cuenta de Bajoneá. Ya podés iniciar sesión de nuevo.\n\n"` + (`"Mensaje del equipo: {motivo}\n\n"` si hay) + `"Equipo de Bajoneá"`.
- El email sale después del commit, un solo intento, con registro del resultado en `notificacion` (canal `EMAIL`); si falla, el listado marca `ultimoEmailAvisoFallido` y el Administrador puede reenviarlo.
- Si el Cliente suspendido es además Empleado: su relación `empleado_comercio` no cambia (sigue `ACTIVO`). Las escrituras del Empleado revalidan la cuenta (`EstadoUsuarioService.exigirNoSuspendido`, 409 `CUENTA_SUSPENDIDA`) y el equipo del Dueño lo muestra con `cuentaSuspendida` (sin el motivo).
- No hay jobs involucrados; la inactivación automática ignora a las cuentas `SUSPENDIDO` (regla 15 de `CLAUDE.md`).

**Lo que ve la persona suspendida** (conexión con Tramo A, P1.04 y P1.05):
- Sin sesión abierta, al iniciar sesión con la contraseña correcta: 409 `"Tu cuenta fue suspendida"` con `data {codigo: "CUENTA_SUSPENDIDA", motivo}`; con contraseña incorrecta, el 401 genérico sin sumar intentos. El frontend muestra la hoja `"Cuenta suspendida"` con el recuadro `"Motivo"` y botones `"Contactar a Soporte"` (`soporte.html?tipo=APELACION_CUENTA`) y `"Cerrar"` (`FE js/cuenta-suspendida.js` `abrirHojaCuentaSuspendida`).
- Con sesión abierta: la siguiente request da 401 con el mismo código y la app muestra la pantalla completa `"Tu cuenta fue suspendida"` con `"Qué pasa ahora"` (`"Tus pedidos ya pagados siguen su curso."`, `"No podés hacer pedidos nuevos."`), `"Contactar a Soporte"`, `"Mis consultas"` y `"Cerrar sesión"` (no borra la sesión hasta tocar `"Cerrar sesión"`; las rutas `/api/v1/soporte/` siguen funcionando).
- Recuperar la contraseña no levanta la suspensión (Tramo A, P1.06a).

### 7. Frontend
`FE admin-clientes.html` + `FE js/admin-clientes.js` (tabla desde 1024 px, tarjetas en móvil).
- Listado con buscador (`"Nombre o email"`, etiqueta `"Buscar por nombre o email"`), filtros `"Todos"`, `"Suspendidos"`, `"Bloqueados"`, `"Inactivos"`, `"Pendientes"` y columnas `Nombre`, `Email`, `Estado`, `Novedades`. Aviso `"No se envió el email"` cuando el último email de suspensión o levantamiento falló.
- Menú de acciones por fila: `"Suspender cuenta"` (si no está suspendida), `"Levantar suspensión"` (si lo está), `"Reactivar cuenta"` (si está inactiva) y `"Reenviar email"` (si el último falló).
- Hoja `"Suspender a {nombre}"`: subtítulo `"No podrá ingresar ni comprar."`, lista calculada de la vista previa (`"N pedido(s) pagado(s) sigue(n) su curso"`, `"N pedido(s) sin pagar se cancela(n)"`, o `"No tiene pedidos en curso"`; si falla: `"No pudimos calcular el detalle. Igual podés suspender la cuenta."`), campo `Motivo (lo va a ver la persona)` con placeholder `"Contale por qué se suspende la cuenta"` y mínimo 10 caracteres (el botón `"Suspender cuenta"` nace deshabilitado), `"Suspendiendo…"`, `"Cancelar"`. Éxito: toast `"Cuenta suspendida"` y recarga de la lista. Un 409 muestra `"{mensaje}. Cerrá esta ventana: la lista se actualiza."`; otro error `"No pudimos suspender la cuenta. Probá de nuevo."`.
- Hoja `"Levantar suspensión"`: nombre, recuadro `"Suspendida desde {fecha}"` con el motivo, un resumen del destino (`"Podrá ingresar y comprar de nuevo."`, + `"Estaba bloqueada: vuelve activa."`; o `"Vuelve a estar inactiva: tiene que reactivar su cuenta para ingresar."`; o `"Vuelve a estar pendiente: tiene que verificar su email para ingresar."`), campo opcional `Mensaje para la persona (opcional)`, botón `"Levantar suspensión"`. Éxito: toast `"Suspensión levantada"`; error `"No pudimos levantar la suspensión. Probá de nuevo."`.
- Reenviar: toast `"Email reenviado"` o error `"No pudimos reenviar el email. Probá de nuevo."`. Errores de lista: `"No pudimos actualizar la lista"`, `"No pudimos cargar los clientes."` con `"Reintentar"`.

### 8. Desvíos de este diagrama
D-07, D-08, D-17 (sección B).

---

## P1.14 Suspender y levantar suspensión de Dueño con cascada a sus comercios (S3)

### 1. Funciones y archivos
- Controlador: `BE controllers/AdministradorController.java` `vistaPreviaSuspensionDueno`, `suspenderDueno`, `levantarSuspensionDueno`, `reenviarEmailSuspensionDueno`, y el listado `GET /administrador/duenos`.
- Servicio: `BE services/SuspensionDuenoService.java` `suspender` (`:133-202`), `levantar` (`:204-277`), `vistaPrevia` (`:283-320`), `leerCandidatos`, `bloquearUsuarios`, `bloquearRelaciones`, `cerrarSesiones`. Reutiliza `SuspensionUsuarioService.estadoAlLevantar`, `EstadoUsuarioService.cambiar` (C3), `AptitudVentaComercioService` (`bloquearComercio`, `leerDuenoRestaurado`, `destinoAlLevantarSuspension`), `AvisoCuentaService` (`avisarSuspensionDueno`, `avisarLevantamientoDueno`, `avisarEmpleadosSuspensionComercio`, `avisarEmpleadosLevantamientoComercio`), `PedidoService` (`rechazarPendientesDelComercioSuspendido`, `procesarPedidosSinAtencionDelComercio`, jobs 6 y 7).
- Repositorios: `UsuarioRepository`, `SesionRepository`, `ComercioRepository`, `EmpleadoComercioRepository`, `HistorialEstadoComercioRepository`, `PedidoRepository`, `AdministradorRepository`.
- Entidades: `Usuario`, `Comercio` (columnas `suspension_origen`, `suspendido_desde`, `motivo_suspension`), `HistorialEstadoComercio`, `HistorialEstadoUsuario`, `EmpleadoComercio`.
- DTOs: `SuspensionUsuarioRequestDTO`, `LevantamientoSuspensionRequestDTO`, `SuspensionDuenoResponseDTO`, `SuspensionDuenoPreviaResponseDTO`, `DuenoAdminResponseDTO`.

### 2. Endpoints
`/api/v1/administrador/duenos/...`, rol `ADMINISTRADOR`, sin `X-Comercio-Id`.
| Operación | Método y ruta | HTTP | Mensaje |
|---|---|---|---|
| Vista previa | GET `/duenos/{duenoId}/suspension/previa` | 200 | `"Vista previa obtenida correctamente"` |
| Suspender | PUT `/duenos/{duenoId}/suspender` | 200 | `"Cuenta suspendida correctamente"` |
| Levantar | PUT `/duenos/{duenoId}/levantar-suspension` | 200 | `"Suspensión levantada correctamente"` |
| Reenviar email | POST `/duenos/{duenoId}/suspension/reenviar-email` | 200 / 502 | según resultado |
| Listado | GET `/duenos` | 200 | (`DuenoAdminResponseDTO`: `id, nombre, apellido, dni, email, estado, fechaRegistro, cantidadComercios, motivoSuspension, suspendidoDesde, ultimoEmailAvisoFallido, estadoPrevioSuspension`) |

### 3. Entradas y validaciones
Mismos DTO y reglas de motivo que P1.13. `validarObjetivo`: mismo Administrador → 409 `"No podés suspender tu propia cuenta"`; no existe → 404 `"Dueño no encontrado"`; rol `ADMINISTRADOR` → 409 `"No se puede suspender a un Administrador"`; rol distinto de `DUENO` → 404 `"Dueño no encontrado"`. Ya suspendida → 409 `"La cuenta ya está suspendida"`; levantar una no suspendida → 409 `"La cuenta no está suspendida"`.

### 4. Pasos en orden exacto
**Suspender**
1. `validarObjetivo`; `leerCandidatos(duenoId)`: sin bloqueo y fuera de la transacción, lee los ids de los comercios del Dueño y las relaciones `ACTIVO` de sus Empleados (los "candidatos" a recibir aviso; quien se suma después no lo recibe).
2. Una transacción: toma los usuarios en id ascendente (el Dueño `FOR UPDATE` y releído; el Administrador y cada Empleado candidato con bloqueo compartido), revalida `estado == SUSPENDIDO` → 409; bloquea las relaciones candidatas por clave primaria (los destinatarios son los `ACTIVO` con cuenta no suspendida).
3. Lee los comercios del Dueño (por id). Para cada uno con estado `APROBADO`, `APTO_VENTA` o `CERRADO_TEMPORALMENTE` lo bloquea `FOR UPDATE` (`aptitudVentaComercioService.bloquearComercio`) y revalida el estado. Los ya `SUSPENDIDO` por separado se registran como "ya suspendidos"; los `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO` e `INACTIVO` no se tocan.
4. Cambia el estado del Dueño a `SUSPENDIDO` (`EstadoUsuarioService.cambiar`, fila en `historial_estado_usuario` con motivo y administrador) y cierra sus sesiones (C2).
5. Cada comercio bloqueado pasa a `SUSPENDIDO` con `suspension_origen = DUENO`, `suspendido_desde = ahora`, `motivo_suspension = motivo`, `fecha_modificacion`, y una fila en `historial_estado_comercio` por comercio (`estado_origen` = el que tenía, `estado_destino = SUSPENDIDO`, `motivo`, `administrador_id`, `suspension_origen = DUENO`). El estado previo queda en esa fila de historial; la bandera `cerrado_manualmente` no se toca.
6. Avisos (ver sección 6).
7. Commit. Recién ahí, por cada comercio que quedó suspendido (los de ahora y los "ya suspendidos", en id ascendente): `PedidoService.rechazarPendientesDelComercioSuspendido(comercioId)` y `PedidoService.procesarPedidosSinAtencionDelComercio(comercioId)`, un pedido por transacción, de forma síncrona dentro de la misma request del Administrador.

**Qué pasa con los pedidos** (reutiliza la lógica de S2, no la duplica):
- `PENDIENTE_CONFIRMACION_COMERCIO`: se rechazan y reembolsan en el acto (estado `RECHAZADO`, actor `SISTEMA`, motivo de historial `SUSPENSION_COMERCIO`, nota de crédito `SUSPENSION_COMERCIO`; aviso `PEDIDO_RECHAZADO` al Cliente: `"Cancelamos tu pedido #{id} porque el comercio no está disponible. Te devolvemos el dinero."`).
- `EN_PREPARACION` y `LISTO_PARA_RETIRAR` de un comercio SIN Empleados activos (el Dueño está suspendido): `EN_PREPARACION` pasa a `ANULADO` (`motivo = "El comercio no está disponible"`, motivo de historial `SUSPENSION_DUENO_SIN_ATENCION`, reembolso total, aviso `PEDIDO_ANULADO_COMERCIO` con el mismo texto de arriba) y `LISTO_PARA_RETIRAR` a `CANCELADO_POR_SISTEMA` (con reembolso total). Con Empleados activos no se tocan: los atienden ellos, con los topes de 90 minutos de S2 (jobs de `PedidoService`; el detalle es de S2 y no se mapea acá).
- `EN_CAMINO`: no se toca. `PENDIENTE_PAGO`: no se tocan por la suspensión del Dueño (la vista previa los cuenta como `"ya no se puede pagar"`).
- Además hay dos barridos de seguridad cada 60 s (job 6: pendientes de cualquier comercio suspendido; job 7: pedidos sin atención de comercios suspendidos con Dueño suspendido), idempotentes, que reevalúan la condición completa.

**Empleados del Dueño**: no se cierran sus sesiones (son sesiones de Cliente) ni se tocan sus relaciones `empleado_comercio` (siguen `ACTIVO`). Entran al comercio en el estado accesible `SUSPENDIDO`, con los guards de la sección de P1.08 (no modifican productos ni perfil; no aceptan pedidos nuevos; sí pueden resolver los pedidos en curso). Reciben un aviso in-app (sección 6). **Invitaciones pendientes**: no se tocan (siguen `PENDIENTE`); al intentar aceptarlas con el comercio `SUSPENDIDO` dan 409 `"Esta invitación ya no está disponible"` (ver D-03 y C-05).

**Levantar**
1. `validarObjetivo`; `leerCandidatos`.
2. Transacción: bloquea usuarios (mismo orden) y relaciones; revalida `estado == SUSPENDIDO` → 409; `leerDuenoRestaurado(duenoId)` (cuenta de Mercado Pago activa, documentos y estado de la cuenta).
3. De los comercios del Dueño, solo considera los `SUSPENDIDO` (bloqueados `FOR UPDATE` y revalidados): los de `suspension_origen = DUENO` son "restaurables"; los suspendidos por separado (otro origen) "siguen suspendidos".
4. `estadoAlLevantar(duenoId)` (igual que P1.13: vuelve a `PENDIENTE`/`INACTIVO` si ese era el origen, si no a `ACTIVO`); `intentos_fallidos = 0`; `EstadoUsuarioService.cambiar`; si el destino es `ACTIVO`, `fecha_ultimo_acceso = ahora`.
5. Cada comercio restaurable: `destino = aptitudVentaComercioService.destinoAlLevantarSuspension(comercio, entradas)` — la regla de aptitud vigente (cuenta de Mercado Pago activa + documentos; con la cuenta no bloqueada), da `APTO_VENTA` o `APROBADO` (o `CERRADO_TEMPORALMENTE` si la cuenta quedó bloqueada; el detalle de esa regla es de la Fase 4 y del tramo C3); limpia `suspension_origen`, `suspendido_desde`, `motivo_suspension`; escribe fila de `historial_estado_comercio` (origen `SUSPENDIDO`, destino, `motivo`, administrador, `suspension_origen = DUENO`). El estado previo a la suspensión no se guarda como dato: el destino se recalcula con la regla vigente.
6. Avisos (sección 6). Los pedidos rechazados o anulados al suspender no vuelven.
- Respuesta de levantar: `{duenoId, estado, comerciosSuspendidos: [], comerciosRestaurados, comerciosQueSiguenSuspendidos, pedidosPendientesRechazados: 0, pedidosSinAtencionProcesados: 0}`. Respuesta de suspender: los ids de comercios suspendidos y las cantidades de pedidos rechazados y procesados.

**Vista previa**: tres consultas (comercios, pedidos agrupados por comercio y estado, Empleados activos por comercio). Por cada comercio informa el `efecto` (`SE_SUSPENDE` o `QUEDA_COMO_ESTA`, con el motivo `"Ya está suspendido por separado y sigue así"`, `"Todavía no fue aprobado"`, `"Fue rechazado"`, `"Está inactivo"` o `"No está operativo"`), los pedidos por estado, los Empleados activos y la `atencionDePedidos` (`ATENDIDOS_POR_EMPLEADOS`, `SE_ANULAN_AL_INSTANTE` o `SIN_PEDIDOS_EN_PREPARACION`), más los topes de minutos configurados.

### 5. Salidas
200 con `SuspensionDuenoResponseDTO` o `SuspensionDuenoPreviaResponseDTO`; errores de la sección 3 y 400 de validación; 502 en el reenvío de email fallido.

### 6. Efectos secundarios
**Suspender**
- Aviso in-app al Dueño, uno por cada comercio suspendido ahora (tipo `COMERCIO_SUSPENDIDO`, entidad `COMERCIO`, con `comercio_id`): `"Tu cuenta fue suspendida y tu comercio '{nombre}' quedó suspendido. Motivo: {motivo}"`. Se verán cuando se levante la suspensión (el Dueño no puede entrar).
- Email al Dueño (un solo email, después del commit, un intento; rastro en una fila `DUENO_SUSPENDIDO`), asunto `"Tu cuenta de Bajoneá fue suspendida"`:
  `"Tu cuenta de Bajoneá fue suspendida.\n\nMotivo: {motivo}\n\n"` + (con comercios: `"Se suspendieron tus comercios: {lista}.\n\nMientras estén suspendidos no aparecen en el catálogo ni reciben pedidos nuevos.\n\n"`; sin comercios: `"Todavía no tenías comercios aprobados, así que no se suspendió ninguno.\n\n"`) + `"Mientras la cuenta esté suspendida no vas a poder iniciar sesión. Los pedidos que ya estaban en preparación los atiende tu equipo, si tenés Empleados; si no, se cancelan y se devuelve el dinero a tus clientes.\n\nEquipo de Bajoneá"`.
- Avisos in-app a los Empleados activos con cuenta no suspendida, uno por comercio suspendido (`COMERCIO_SUSPENDIDO_EQUIPO`, con `comercio_id`, sin motivo ni email): `"El comercio '{nombre}' fue suspendido. Mientras dure no se aceptan pedidos nuevos."`.
- Avisos a los Clientes con pedidos afectados (arriba).
- Historial: `historial_estado_usuario` (una fila) e `historial_estado_comercio` (una por comercio); sesiones del Dueño cerradas con `SUSPENSION`.

**Levantar**
- Aviso in-app por cada comercio restaurado (`SUSPENSION_LEVANTADA`, con `comercio_id`): `"Levantamos la suspensión de tu cuenta y tu comercio '{nombre}' volvió a operar."` + `" Mensaje del equipo: {motivo}"` si hay.
- Email (`DUENO_SUSPENSION_LEVANTADA`), asunto `"Tu cuenta de Bajoneá volvió a estar activa"`: `"Levantamos la suspensión de tu cuenta de Bajoneá. Ya podés iniciar sesión de nuevo.\n\n"` + (`"Volvieron a operar: {lista}.\n\n"` si hay) + (`"Siguen suspendidos por separado: {lista}.\n\n"` si hay) + (`"Mensaje del equipo: {motivo}\n\n"` si hay) + `"Equipo de Bajoneá"`.
- Avisos in-app a los Empleados por cada comercio restaurado (`COMERCIO_SUSPENSION_LEVANTADA_EQUIPO`): `"Levantaron la suspensión del comercio '{nombre}'. Ya vuelve a funcionar con normalidad."`.

### 7. Frontend
`FE admin-duenos.html` + `FE js/admin-duenos.js` (lista) y `FE js/admin-dueno-suspension.js` (hojas).
- Lista de Dueños: buscador (`"Nombre o email"`), filtros `"Todos"`, `"Suspendidos"`, `"Bloqueados"`, `"Inactivos"`, fila con `"{email} · N comercios"`, fecha y motivo de la suspensión (`"Desde el {fecha}"`), `"No se envió el email"` con `"Reenviar"`, y `"Ver más"` de a 30. `?id=N` muestra a un solo Dueño con `"Ver todos"`. Vacíos: `"No hay dueños registrados"`, `"No hay dueños con esos filtros."`.
- Hoja de acciones del Dueño: `"Suspender cuenta"` o `"Levantar suspensión"`, y `"Reactivar cuenta"` si está inactivo; `"Cancelar"`.
- Hoja `"Suspender a {nombre}"`: subtítulo calculado de la vista previa (`"No va a poder ingresar. Su comercio se suspende."`, `"No va a poder ingresar. Sus N comercios se suspenden."`, `"No va a poder ingresar. N de sus M comercios se suspenden."`; si falla: `"No va a poder ingresar. Sus comercios se suspenden."`), una tarjeta por comercio con el chip `"Se suspende"` o `"Queda como está"` y líneas de pedidos (`"1 pendiente: se rechaza y se reembolsa ahora."`, `"N en preparación: los resuelven {quienes} en hasta N min."`, `"1 en preparación: se anula y se reembolsa ahora, porque no tiene Empleados activos."`, `"1 listo para retirar: se cancela y se reembolsa ahora, porque no tiene Empleados activos."`, `"1 en camino sigue igual."`, `"1 sin pagar ya no se puede pagar."`, `"Sin pedidos en curso."`), campo `Motivo (lo va a ver la persona)` (placeholder `"Contale por qué se suspende la cuenta"`, mínimo 10), botón `"Suspender al Dueño"`, `"Cancelar"`. Éxito: toast `"Dueño suspendido"`; error `"No pudimos suspender la cuenta. Probá de nuevo."`.
- Hoja `"Levantar suspensión"`: recuadro con la fecha y el motivo, subtítulo (`"Se restablece(n) N comercio(s)."` o `"No tiene comercios suspendidos."`), por comercio `"Vuelve"` o `"Sigue suspendido"` con la explicación `"Se suspendió aparte. Después de levantar al Dueño, lo levantás desde su ficha."`, nota `"Los pedidos que se rechazaron o anularon al suspender no vuelven."`, campo opcional `Mensaje para la persona (opcional)`, botón `"Levantar suspensión"`. Éxito: toast `"Suspensión levantada"`; error `"No pudimos levantar la suspensión. Probá de nuevo."`.
- En la ficha de un comercio del Administrador (`FE js/admin.js`, `FE js/admin-comercio-suspension.js`): el comercio suspendido por el Dueño explica que no se levanta solo, y se ofrece `"Ir al Dueño"` y `"Suspender solo este comercio"`; el suspendido por separado con el Dueño suspendido muestra `"Levantar suspensión"` deshabilitado (según `CLAUDE.md`, S3 entrega B; el texto literal de esos botones no se abrió).

### 8. Desvíos de este diagrama
D-06, D-07, D-08, D-17 (sección B).

---

## P1.16 Selección de contexto del Empleado tras el login

### 1. Funciones y archivos
- Backend: `BE controllers/EmpleadoController.java` `misComercios`, `acceso`; `BE services/MisComerciosEmpleadoService.java` `listar`; `BE services/AccesoEmpleadoService.java` `consultar`; `BE services/ComercioActivoService.java` (C5); `BE repositories/EmpleadoComercioRepository.java` `findAccesiblesDelEmpleado`, `findComercioAccesible`; `BE config/security/DelegacionEmpleado` (lista de rutas delegables); DTOs `MiComercioEmpleadoResponseDTO`, `AccesoComercioEmpleadoResponseDTO`.
- Frontend: `FE js/auth.js` `redirigirPostLogin`, `resolverHomePorRol`; `FE js/contexto.js`; `FE seleccionar-contexto.html` + `FE js/selector-contexto.js`; `FE js/api.js` (`setContexto`, `getContexto`, `getContextoGuardado`, `perderAccesoAlComercio`, `completarRenuncia`, header `X-Comercio-Id`); `FE js/comercio-activo.js` y `FE js/selector-comercio.js` (sondeo).

### 2. Endpoints
| Endpoint | Método y ruta | Rol | `X-Comercio-Id` |
|---|---|---|---|
| Comercios del Empleado | GET `/api/v1/empleados/mis-comercios` (`SecurityConfig.java:144`) | `CLIENTE` | no (se ignora) |
| Acceso a un comercio | GET `/api/v1/empleados/comercios/{comercioId}/acceso` (`:146`) | `CLIENTE` | no |
| Rutas de operación del comercio | `/comercios/perfil`, `/productos`, `/pedidos/comercio/...`, `/notificaciones` y otras de la lista delegable | `DUENO` o `CLIENTE` con relación `ACTIVO` | sí, obligatorio |
Un Dueño o un Administrador que llamen a `mis-comercios` reciben 403.

### 3. Entradas y validaciones
`mis-comercios` no tiene parámetros. `acceso` recibe `comercioId` en la ruta. El resolver (C5) valida el header en cada request de comercio; ver los códigos 400 y 404 literales ahí. Una ruta no clasificada como delegable es de uso exclusivo del Dueño: un Empleado recibe 403 de la seguridad (por ejemplo en rutas exclusivas del Dueño).

### 4. Pasos en orden exacto
**Qué devuelve el login a un Empleado**: el JWT y el usuario como a cualquier Cliente (rol `CLIENTE`, Tramo A P1.04); NO trae ningún dato de comercios ni de Empleado. El frontend se entera después.
1. `FE js/auth.js` `redirigirPostLogin(usuario)`: si `rol === 'CLIENTE'`, llama a `GET /empleados/mis-comercios` (`consultarComerciosDelEmpleado`); si falla, lo trata como lista vacía.
2. Si hay al menos un comercio, redirige a `seleccionar-contexto.html`. Si no hay ninguno, hace `setContexto(CLIENTE, null, false)` y va a `index.html` (`resolverHomePorRol`).

**`mis-comercios`** (`MisComerciosEmpleadoService.listar`): `findAccesiblesDelEmpleado(empleadoId, ACTIVO, ESTADOS_ACCESIBLES_EMPLEADO)`: relaciones `empleado_comercio` con `estado = ACTIVO` y comercio en `APROBADO`, `APTO_VENTA`, `SUSPENDIDO`, `CERRADO_TEMPORALMENTE` o `INACTIVO`, ordenadas por fecha de alta e id. Una consulta para los comercios, otra para los horarios vigentes de todos y una agrupada para los avisos no leídos por comercio (sin N+1). Cada ítem: `id, nombre, fotoPerfilUrl, estado, fechaRegistro, operativo` (solo `APROBADO` o `APTO_VENTA`), `cantidadNotificacionesNoLeidas`, `cerradoManualmente, abiertoAhora, puedeCambiarCierre, textoReapertura, fechaAlta`. Sin relaciones, lista vacía. NO aparecen los comercios `PENDIENTE`, `RECHAZADO` ni `RECHAZO_DEFINITIVO`, ni los de relaciones `INACTIVO`.

**Selector** (`FE js/selector-contexto.js` `initSeleccionarContexto`): exige usuario con `rol === 'CLIENTE'` (Dueño → `comercio-dashboard.html`, Administrador → `admin-dashboard.html`, sin sesión → `login.html`); pide `mis-comercios`; si la lista está vacía o la llamada falla: `setContexto(CLIENTE, null, false)` y va a `index.html`. Con uno o más comercios SIEMPRE muestra el selector (no se salta ni con uno solo): una fila `"Cliente"` más una fila por comercio.
- Fila del comercio: avatar, nombre, subtítulo `"Empleado"` + aviso por estado (`SUSPENDIDO`: `"Comercio suspendido. Solo podés resolver pedidos en curso."`; `CERRADO_TEMPORALMENTE`: `"No se aceptan pedidos nuevos."`) + `"Último que usaste"`, y chip `"Suspendido"` o `"Cerrado temporalmente"`.
- Al elegir: `entrarEnContexto(tipo, comercioId, nombre)` → `setContexto(...)` y navega: Cliente → `index.html`, Empleado → `comercio-dashboard.html`.

**Dónde se guarda la elección** (`FE js/api.js`): `sessionStorage['bajonea_contexto']` = `{tipo, comercioId, comercioNombre}` (por pestaña) y `localStorage['bajonea_ultimo_contexto_{usuarioId}']` = `"CLIENTE"` o `"EMPLEADO:{comercioId}"` (último usado). En una pestaña nueva sin contexto (`resolverContextoDeLaPestania`): si el último fue Empleado, vuelve a pedir `mis-comercios`; si ese comercio sigue en la lista, entra a él; si no (olvida el último) y hay otros comercios, va al selector; si no hay comercios, contexto Cliente.

**Cómo viaja `X-Comercio-Id`**: `apiFetch` lo agrega solo para rutas que coinciden con `RUTAS_DEL_DUENO` (`comercios/(perfil|redes-sociales|cerrar|abrir|equipo|estadisticas|documentos)`, `productos`, `pedidos/comercio`, `notificaciones`, salvo `notificaciones/comercio/`), y solo si el contexto es de comercio (Dueño o Empleado) y hay comercio activo; el valor es `getComercioActivoId()` (para el Empleado, el `comercioId` del contexto guardado). En contexto Cliente nunca viaja.

**Cómo valida el backend**: C5 en cada request. Los guards del Empleado por estado (`SUSPENDIDO`/`CERRADO_TEMPORALMENTE`/`INACTIVO`) son los de P1.08 y P1.12; con el comercio en `INACTIVO` el Empleado lo ve en solo lectura (`COMERCIO_INACTIVO` al modificar).

**Cambio de comercio y vuelta a Cliente**: fila `"Cambiar de cuenta"` en el perfil (`perfil.html`, visible solo si es Empleado de algún comercio; y en `comercio-perfil.html` del Empleado) abre la hoja `"Cambiar de cuenta"` (`abrirHojaCambiarCuenta`): vuelve a pedir `mis-comercios`, lista `"Cliente"` y cada comercio con el actual marcado (`"Cuenta actual"`), sin el texto `"Último que usaste"`; errores `"No pudimos cargar tus cuentas. Intentá nuevamente."` con `"Reintentar"`. Elegir una opción llama a `entrarEnContexto`. En el panel del Empleado, "Editar datos personales" abre la hoja `"Vas a pasar a tu cuenta personal"` (`"Para editar tus datos personales vas a salir de este comercio y entrar a tu cuenta de Cliente."`, botones `"Continuar"` y `"Cancelar"`) que cambia a contexto Cliente y va a `perfil.html`.

**Qué pantallas ve en cada modo**: en contexto Cliente, las del Cliente (`index.html`, carrito, pedidos, perfil, etc.); `exigirContextoCliente` redirige al panel si la pestaña está en contexto Empleado. En contexto Empleado, el panel del comercio (`comercio-dashboard.html`, productos, pedidos, perfil) con la insignia `"Empleado"`; `exigirContextoComercio` redirige al selector si no hay contexto o al login si el contexto no es de Empleado; `exigirDueno` manda al panel a un Empleado que entre a una pantalla exclusiva del Dueño (equipo, alta de comercios, Mercado Pago, estadísticas, documentación).

**Pérdida de acceso** (`FE js/api.js` `perderAccesoAlComercio`, una sola vez por carga): se dispara con un 404 con `data.codigo === "COMERCIO_NO_DISPONIBLE"` en una request con header en contexto Empleado, o por el sondeo de cada 15 s (`INTERVALO_POLLING_COMERCIOS_MS`, en `js/comercio-activo.js` y `js/selector-comercio.js`) cuando el comercio ya no aparece en `mis-comercios`. Limpia el contexto, olvida el último si era ese comercio, consulta `GET /empleados/comercios/{id}/acceso` (con espera máxima; si falla, causa genérica) y muestra una hoja bloqueante (`role="dialog"`, solo `"Entendido"`, Escape y clic fuera también continúan) según la causa:
- `INACTIVO` y `BAJA_DUENO`: `"Ya no tenés acceso a este comercio"` / `"{comercio} te dio de baja del equipo. Si creés que fue un error, comunicate con el dueño."`.
- `INACTIVO` y `RENUNCIA`: `"Dejaste de trabajar en este comercio"` / `"Ya no sos parte del equipo de {comercio}. Si querés volver, el dueño te tiene que invitar de nuevo."`.
- `ACTIVO` con `comercioAccesible = false`: `"Este comercio no está disponible"` / `"{comercio} no está disponible en este momento. Intentá más tarde o comunicate con el dueño."`.
- Cualquier otro caso: `"Ya no tenés acceso a este comercio"` / `"Ya no tenés acceso a este comercio."`.
- En todos, segunda línea `"Elegí con qué cuenta seguir."`. Al continuar, va a `seleccionar-contexto.html` (que, sin comercios, lleva a `index.html`).

**Empleado sin ningún comercio activo**: `mis-comercios` devuelve `[]`; no hay selector; el login lleva a `index.html` con contexto Cliente; la fila `"Cambiar de cuenta"` queda oculta. Todo sigue funcionando como Cliente.

### 5. Salidas
`mis-comercios` 200 `"Comercios obtenidos correctamente"` con la lista; `acceso` 200 `"Acceso obtenido correctamente"` con `{estado, motivoBaja, comercioAccesible}`. Errores: 403 para roles distintos de `CLIENTE`; 404 `"Comercio no encontrado"` (`COMERCIO_NO_DISPONIBLE`) para `acceso` sin relación; el 400 y 404 de C5 en las rutas de operación.

### 6. Efectos secundarios
Ninguno en backend (lecturas sin bloqueos). En el frontend: `localStorage` y `sessionStorage` (arriba), toast pendiente (`bajonea_toast_pendiente`) que muestra el selector (por ejemplo `"Dejaste de trabajar en {comercio}"`).

### 7. Frontend
`FE seleccionar-contexto.html` (título `"¿Cómo querés ingresar?"`, subtítulo `"Después podés cambiar de cuenta desde tu perfil."`), filas descritas arriba. No hay selector en el login ni en el registro.

### 8. Desvíos de este diagrama
D-05, D-18 (sección B).

---

## A. Inventario

| Diagrama | Endpoints | Archivos principales (BE / FE) |
|---|---|---|
| P1.08 Perfil Cliente y Dueño | GET/PUT `/clientes/perfil`; PUT `/clientes/perfil/nombre-usuario`; POST `/usuarios/{id}/foto-perfil/firma`, PATCH/DELETE `/usuarios/{id}/foto-perfil`; GET/PUT `/comercios/perfil`; POST `/comercios/perfil/foto/firma`; PUT `/comercios/perfil/foto`; PUT `/comercios/perfil/datos-operativos` | `ClienteController`, `ClienteService`, `AuthService.cambiarNombreUsuario`, `UsuarioController`, `UsuarioService`, `CloudinaryService`, `ComercioController`, `ComercioService`, `HistorialEdicionComercioService` / `perfil.html`, `cliente.js`, `perfil-cuenta.js`, `comercio-perfil.html`, `comercio.js`, `cloudinary.js`, `crop.js` |
| P1.09 Direcciones | GET/POST `/clientes/direcciones`; PUT `/{id}`; PUT `/{id}/principal`; DELETE `/{id}` | `DireccionClienteController`, `DireccionClienteService`, `ValidadorDatosNegocioComercio`, `LocalidadesHabilitadas`, `PedidoService.confirmarPedido` / `direcciones.js`, `perfil.html`, `checkout.js`, `geografia.js` |
| P1.10 Invitar Empleado | POST `/comercios/equipo/invitaciones`; POST `…/{id}/reenviar`; PUT `…/{id}/cancelar`; GET `/comercios/equipo` | `EquipoComercioController`, `InvitacionEmpleadoService`, `InvitacionRegularizacionService`, `AptitudCuentaEmpleadoService`, `MatrizRolesService`, `InvitacionVencimientoJob`, `EmailService` / `equipo-comercio.js`, `equipo-vistas.js` |
| P1.11 Aceptar invitación | POST `/auth/invitaciones-empleado/validar`; POST `/auth/invitaciones-empleado/aceptar` | `InvitacionEmpleadoPublicaController`, `InvitacionEmpleadoService`, `RegistroService.crearCliente`, `EmpleadoInsercionRepository` / `invitacion-empleado.html`, `invitacion-empleado.js`, `cliente-form.js`, `otp.js` |
| P1.12 Activar, desactivar, renunciar | PUT `/comercios/equipo/miembros/{id}/desactivar` y `/reactivar`; PUT `/empleados/comercios/{id}/renunciar`; GET `/empleados/comercios/{id}/acceso` | `GestionMiembroEquipoService`, `EquipoComercioController`, `EmpleadoController`, `AccesoEmpleadoService` / `equipo-comercio.js`, `renuncia-empleado.js`, `api.js` |
| P1.13 Suspender Cliente | GET `/administrador/clientes/{id}/suspension/previa`; PUT `…/suspender`; PUT `…/levantar-suspension`; POST `…/suspension/reenviar-email`; GET `/administrador/clientes` | `AdministradorController`, `SuspensionUsuarioService`, `EstadoUsuarioService`, `AvisoCuentaService`, `PedidoService.cancelarPedidosSinPagarPorSuspensionCliente` / `admin-clientes.js`, `cuenta-suspendida.js` |
| P1.14 Suspender Dueño | GET `/administrador/duenos/{id}/suspension/previa`; PUT `…/suspender`; PUT `…/levantar-suspension`; POST `…/suspension/reenviar-email`; GET `/administrador/duenos` | `SuspensionDuenoService`, `AptitudVentaComercioService`, `AvisoCuentaService`, `PedidoService` (jobs 6 y 7) / `admin-duenos.js`, `admin-dueno-suspension.js` |
| P1.16 Contexto del Empleado | GET `/empleados/mis-comercios`; GET `/empleados/comercios/{id}/acceso`; header `X-Comercio-Id` | `EmpleadoController`, `MisComerciosEmpleadoService`, `ComercioActivoService`, `AccesoEmpleadoService` / `auth.js`, `contexto.js`, `selector-contexto.js`, `api.js`, `comercio-activo.js`, `seleccionar-contexto.html` |

Sugerencias de agrupación para dibujar (sin tocar el código):
1. P1.08 conviene separar en dos diagramas: perfil de Cliente (datos, nombre de usuario, foto) y perfil de Dueño (perfil del comercio, foto del comercio, datos fiscales de solo lectura). Comparten solo la subida de foto (C1) y el cambio de contraseña (Tramo A).
2. P1.12 mezcla tres flujos con actores distintos (Dueño desactiva, Dueño reactiva, Empleado renuncia). "Asignación" no tiene flujo propio: es P1.11.
3. P1.13 y P1.14 comparten la fase de cuenta (bloqueo, estado, sesiones, aviso) y difieren en la cascada; se puede dibujar un subproceso común "Suspensión de cuenta" y la cascada de comercios y pedidos aparte.
4. El estado del selector de contexto (P1.16) y la pérdida de acceso (hojas por causa) son dos diagramas distintos: uno al entrar y otro permanente por el sondeo de 15 s.

---

## B. Desvíos contra la documentación (de mayor a menor importancia)

**D-01 (alto). La foto de perfil personal del Dueño (y la del Administrador) no tiene pantalla.**
- Docs: `requisitos-funcionales-dueño.md` ("El Dueño debe poder cargar y editar su foto de perfil personal desde su cuenta autenticada") y `requisitos-funcionales-generales.md` sección "Gestión de Foto de Perfil" ("Todo usuario … para los cuatro roles").
- Código: los endpoints `/usuarios/{id}/foto-perfil/*` aceptan cualquier rol autenticado, pero solo `FE js/cliente.js` los usa. `FE js/comercio.js` (perfil del Dueño) solo sube la foto del comercio. El Administrador no tiene pantalla de perfil con foto. El Dueño no puede cargar foto personal desde la interfaz.

**D-02 (alto). La foto de perfil de usuario no valida la carpeta.**
- Código: `UsuarioService.actualizarFotoPerfil` solo se apoya en el DTO (`@ValidarUrlCloudinary`: dominio `res.cloudinary.com` + extensión). `CloudinaryService` valida la carpeta para la foto del comercio, la de un comercio nuevo y las imágenes de producto, pero NO tiene un método equivalente para `usuarios/{id}/perfil/`. Un usuario puede guardar como foto cualquier imagen alojada en Cloudinary, aunque sea de otra cuenta o de otra carpeta, llamando a `PATCH /usuarios/{id}/foto-perfil` directo.
- El comentario del propio DTO del comercio (`ComercioPerfilRequestDTO`) ya reconoce que `@ValidarUrlCloudinary` "solo valida el dominio, no la propiedad del recurso".

**D-03 (medio). Una invitación no se puede aceptar con el comercio `SUSPENDIDO`.**
- Docs: `requisitos-funcionales-empleado.md` ("Se puede aceptar una invitación mientras el comercio esté Aprobado, Apto para Venta, Cerrado Temporalmente o Suspendido").
- Código: `InvitacionEmpleadoService.ESTADOS_ACEPTABLES = {APROBADO, APTO_VENTA, CERRADO_TEMPORALMENTE}` (`:126-127`). Con `SUSPENDIDO` `validar` y `aceptar` responden 409 `"Esta invitación ya no está disponible"`. Consecuencia: la suspensión de un Dueño (P1.14) o de un comercio deja inutilizables las invitaciones pendientes sin tocarlas.

**D-04 (medio). El Dueño sí está bloqueado con el comercio `SUSPENDIDO` o `INACTIVO`.**
- Docs: `requisitos-funcionales-dueño.md` ("hoy el Dueño no tiene las restricciones que sí tiene el Empleado (por ejemplo, puede editar productos y perfil con el comercio Suspendido): es un hueco conocido").
- Código: `ComercioActivoService.validarComercioModificable` aplica a Dueño y Empleado: 409 `"El comercio está suspendido: por ahora no se puede modificar."` y 409 `"El comercio está inactivo: por ahora no se puede modificar."`. `editarPerfil`, `actualizarFotoPerfil`, `editarDatosOperativos` y la firma de foto lo usan. El hueco ya no existe en estas operaciones (y `CLAUDE.md` §1bis todavía lo dice del bloque A2 de E3).

**D-05 (medio). El Empleado accede a comercios `INACTIVO`.**
- Docs: `requisitos-funcionales-empleado.md` ("No aparecen los comercios Inactivos, de Rechazo definitivo, Pendientes ni Rechazados" en el selector).
- Código: `ESTADOS_ACCESIBLES_EMPLEADO` incluye `INACTIVO` (`ComercioActivoService.java:43-45`), de modo que `mis-comercios` y el resolver lo aceptan; el selector tiene etiquetas solo para `SUSPENDIDO` y `CERRADO_TEMPORALMENTE`, y un comercio `INACTIVO` aparece sin etiqueta ni aviso.

**D-06 (medio). La cascada de suspensión del Dueño no toca "TODOS" los comercios.**
- Docs: `requisitos-funcionales-sistema.md` (línea 27: "cambiar automáticamente el estado de TODOS los comercios que administra a Suspendido y ocultarlos del catálogo").
- Código: solo pasan a `SUSPENDIDO` los `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE`; los `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO` e `INACTIVO` quedan igual, y los ya suspendidos por separado conservan su origen (`SuspensionDuenoService.SUSPENDIBLES`).

**D-07 (medio). Al levantar la suspensión de una cuenta vuelve a su estado anterior, no siempre a "activa".**
- Docs: `requisitos-funcionales-administrador.md` ("levantar la suspensión de un cliente, reactivando su cuenta").
- Código: `estadoAlLevantar` devuelve `PENDIENTE` o `INACTIVO` si ese era el origen; `ACTIVO` en los demás casos (incluida `BLOQUEADO`, con los intentos en 0). Aplica también al Dueño.

**D-08 (medio). `requisitos-funcionales-administrador.md` no documenta la suspensión de un Dueño.**
- Docs: la sección "Gestión de Usuarios" solo habla de suspender y levantar a un cliente. La suspensión de la cuenta de un Dueño, su vista previa, el listado de Dueños y el reenvío de email figuran solo de forma indirecta en `requisitos-funcionales-sistema.md` (líneas 25-31). Tampoco figuran el mínimo de 10 y el máximo de 500 caracteres del motivo.

**D-09 (bajo). Las reglas de edición de datos del Cliente difieren de las del registro.**
- `PUT /clientes/perfil` valida nombre y apellido con `@ValidarNombrePropio` (`^\p{L}[\p{L} '-]*$`, mensaje `"Debe contener solo letras, espacios y guiones"`), distinto de `@ValidarFormatoNombre` del registro (`^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[-' ][…]+)*$`, `"El nombre solo puede contener letras"`). El teléfono vacío dice `"No debe estar vacío"` (en el registro `"El teléfono es obligatorio"`). El DTO no normaliza (trim, espacios, quitar `()-` del teléfono) y el servicio guarda el teléfono tal como llegó, aunque la validación lo acepta con espacios o guiones (el frontend siempre manda `+549…`).
- En el perfil del comercio, `nombre` y `telefono` tienen `@Size` sin mensaje propio (`@Size(max = 150)`, `@Size(max = 30)`): el texto es el de Bean Validation por defecto, en el idioma del servidor.

**D-10 (bajo). Cambiar el nombre de usuario guarda antes los datos personales y no avisa si se cancela la confirmación.**
- `FE js/perfil-cuenta.js`: con el nombre de usuario modificado, primero se hace `PUT /clientes/perfil` y recién después se abre la hoja `"Confirmá tu contraseña"`. Si se toca `"Cancelar"`, los datos ya quedaron guardados, la hoja se cierra, no hay toast y la pantalla queda en la edición con el nombre de usuario sin cambiar.

**D-11 (bajo). El Dueño no tiene forma de ver ni editar sus datos personales.**
- Código: `/clientes/**` es `hasRole("CLIENTE")`; ninguna pantalla de Dueño muestra nombre, apellido, DNI, teléfono personal ni fecha de nacimiento. El perfil muestra solo el comercio. (`requisitos-funcionales-dueño.md` lo reconoce para el nombre de usuario; los demás datos personales no se mencionan.)

**D-12 (bajo). `requisitos-funcionales-cliente.md` no fija el tope de 5 direcciones ni la regla real de eliminación.**
- Docs: "La dirección principal no puede eliminarse si es la única registrada; primero debe designarse otra como principal." No menciona el máximo de 5 activas ni los campos `nombre` y `referencia`.
- Código: se puede eliminar la predeterminada si hay otra activa: se promueve sola la de mayor `id`; lo que se bloquea es eliminar la única dirección activa (409 `ULTIMA_DIRECCION`). El tope de 5 activas existe (409 `DIRECCIONES_CUPO_MAXIMO`).

**D-13 (bajo). El texto del cupo de direcciones del frontend difiere del del servidor.**
- Frontend: `"Llegaste al máximo de 5 direcciones. Podés eliminar alguna para agregar otra."` (con el botón deshabilitado). Servidor (carrera): `"Ya tenés el máximo de 5 direcciones. Eliminá una para agregar otra."`. Además, `pisoDepto` con solo espacios pasa la validación (`\s*`) y se guarda sin recortar.

**D-14 (bajo). Invitar exige comercio operativo; reenviar y cancelar no coinciden.**
- `invitar` y `reenviar` exigen `APROBADO`/`APTO_VENTA` (409 `"Este comercio no puede invitar empleados en este momento"`); `cancelar` solo bloquea `SUSPENDIDO` (409 `"El comercio está suspendido: el equipo se puede ver, pero no modificar"`); `desactivar` solo bloquea `SUSPENDIDO` y `reactivar` exige operativo (409 `"Este comercio no puede reactivar empleados en este momento"`, código `NO_OPERATIVO`). Es una asimetría deliberada del código; `requisitos-funcionales-dueño.md` solo describe la regla de invitar.

**D-15 (bajo). Alta por invitación: la cuenta nueva queda activa sin verificación de email y sin historial de estado visible en este flujo.**
- Código: `crearCliente(…, ACTIVO)`. Está documentado en `requisitos-funcionales-empleado.md` ("El código verifica el email"). Lo que no figura es que el aviso de aceptación solo se le manda al Dueño (nada al Empleado). Informativo.

**D-16 (bajo). Desactivar y renunciar no cierran sesiones ni avisan por email.**
- Código: solo cambian la relación, escriben historial y crean un aviso in-app. Coherente con `requisitos-funcionales-sistema.md` (línea 31-32: los cambios sobre la relación no tocan la cuenta), pero la documentación no dice que no se manda email al Empleado dado de baja (hoy el único canal es el aviso in-app, que el Empleado no ve si ya no tiene acceso al comercio: el aviso es personal, sin `comercio_id`, por lo que le llega a su cuenta de Cliente).

**D-17 (bajo). La pantalla de sesión suspendida usa el mismo texto para Dueños.**
- `FE js/cuenta-suspendida.js` `mostrarPantallaCuentaSuspendida` no distingue rol: dice `"Tus pedidos ya pagados siguen su curso."` y `"No podés hacer pedidos nuevos."`, pensados para Clientes. Para un Dueño suspendido, el email dice otra cosa (comercios suspendidos, pedidos atendidos por su equipo o cancelados).

**D-18 (bajo). El selector de contexto siempre se muestra aunque haya un solo comercio.**
- Documentado como "ve un selector a pantalla completa con 'Cliente' y cada comercio"; coincide, pero no existe la entrada directa para quien tiene un único comercio. Informativo.

---

## C. Dudas de negocio que el código no resuelve

**C-01.** ¿El Dueño debería poder cargar su foto personal (D-01)? Si la respuesta es sí, hay que agregar pantalla; si no, hay que corregir los requisitos.
**C-02.** ¿La foto de usuario debería validarse contra la carpeta `usuarios/{id}/perfil/` como las demás (D-02)?
**C-03.** El texto exacto de `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` (409 del cambio de nombre de usuario) no se abrió en este informe; conviene confirmarlo contra "Ese nombre de usuario ya está en uso" del Tramo A.
**C-04.** El límite de 3 cambios usa `LocalDateTime.now()` de la JVM y no el reloj único (`Clock`) del resto del código; con una zona de la JVM distinta de `America/Argentina/Ushuaia` la ventana de 30 días se corre unas horas.
**C-05.** Al suspender un Dueño (o un comercio), las invitaciones `PENDIENTE` quedan vivas pero no se pueden aceptar (D-03). ¿Deberían cancelarse, vencerse o aceptarse igual?
**C-06.** ¿Se debe avisar por email al Empleado dado de baja o que pierde acceso? Hoy solo recibe un aviso in-app personal.
**C-07.** ¿Debe suspenderse un Cliente que es Empleado afectar su relación con los comercios (por ejemplo, ocultarlo de "Mi equipo")? Hoy sigue `ACTIVO` y el equipo muestra `cuentaSuspendida`.
**C-08.** La suspensión de un Dueño recorre y procesa los pedidos de forma síncrona dentro de la request del Administrador (puede tardar con muchos pedidos); los barridos de 60 s son la red de seguridad. ¿Es aceptable ese tiempo de respuesta?
**C-09.** Al suspender a un Dueño, los pedidos `PENDIENTE_PAGO` de sus comercios no se cancelan por esa vía (siguen su propio vencimiento por falta de pago). ¿Es la regla buscada?
**C-10.** Un Empleado de un comercio `INACTIVO` entra en solo lectura (D-05). ¿Debe verlo en el selector?

### Cierre del informe

**(a) Endpoints que el código tiene y ninguna pantalla usa**
- `PATCH /usuarios/{id}/foto-perfil`, `POST …/firma` y `DELETE …`: solo los usa la pantalla del Cliente; ninguna del Dueño, Administrador o Empleado dentro de un comercio (el Empleado edita su foto pasando a su cuenta de Cliente).
- `PUT /comercios/perfil/datos-operativos`: lo usa solo la pantalla del Empleado; el Dueño edita con `PUT /comercios/perfil`.
- `GET /clientes/perfil` devuelve `fechaNacimiento` y `dni` (el `dni` se muestra, `fechaNacimiento` no).
- `GET /administrador/clientes/{id}/suspension/previa` y el equivalente del Dueño sí se usan; no se encontró ninguno sin uso en el módulo de suspensiones.

**(b) Flujos que dependen de algo no construido**
- La edición de datos personales y del nombre de usuario del Dueño (no hay pantalla ni ruta).
- La edición de datos fiscales desde el perfil del Dueño (no hay endpoint; solo la corrección de un comercio rechazado).
- La foto personal del Dueño (D-01).
- La asignación manual de un Empleado a un comercio (no hay endpoint; solo por invitación).
- El rediseño de la suspensión de comercios (tramo aparte, `CLAUDE.md` §1bis).

**(c) Emails y avisos que el código dispara y que no figuran (o figuran solo de forma indirecta) en la documentación**
- Aviso in-app al Dueño al aceptar una invitación (`"{nombre} {apellido} aceptó tu invitación y ya es parte del equipo de {comercio}"`): figura en el diccionario de datos pero no en los requisitos del Dueño.
- Avisos in-app `EMPLEADO_DESACTIVADO` / `EMPLEADO_REACTIVADO` y el aviso al Dueño por renuncia: figuran en el diccionario (v1.18 y v1.19) y en las historias del Empleado.
- Aviso in-app a los Empleados `COMERCIO_SUSPENDIDO_EQUIPO` y `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` al suspender o levantar a un Dueño: figuran en el código; en los requisitos del Administrador no hay mención.
- Emails de suspensión y levantamiento del Dueño (`DUENO_SUSPENDIDO`, `DUENO_SUSPENSION_LEVANTADA`) con la lista de comercios: no figuran en `requisitos-funcionales-administrador.md`.
- El email de regularización de invitación y su tope de 3 por día figuran en `requisitos-funcionales-dueño.md`.

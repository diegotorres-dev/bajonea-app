# Mapeo de archivos — Auditoría exhaustiva de Comercio (2026-09-03)

Documento de trazabilidad puro: lista todos los archivos leídos como fuente real para
producir `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md`. Ningún archivo listado acá fue modificado —
esta tarea fue estrictamente de lectura, salvo la creación de los 2 documentos nuevos de este
mismo tramo (este archivo y `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md`).

## Documentación previa (contexto, no fuente de verdad)

- `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` — punto de partida a contrastar, no reusado sin
  verificar contra el código real (ver Parte 3 del documento principal).
- `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` — referencia de estructura/formato de las 4 partes,
  y fuente de los formularios compartidos con Cliente (login, verificación, recuperación de
  contraseña, reactivación de cuenta) que no se re-auditaron campo por campo.
- `docs/diccionario-de-datos.md` — secciones "Tabla: Dueno" (líneas 636-654), "Tabla:
  Comercio" (656-698), "Tabla: Horario" (700-718), "Tabla: RedSocial" (720-739), "Tabla:
  CuentaMercadoPago" (742-765), "Tabla: EmpleadoComercio" (767-786).
- `docs/DECISIONES.md` — búsquedas puntuales: "orden no determinístico" / "ConstraintViolation"
  / "@Size(max = 72)" (líneas 5328, 5691-5706, 5770-5819) para confirmar el alcance real del
  fix de no-determinismo del 2026-09-01/03.
- `CLAUDE.md` (raíz del proyecto) — contexto general de fases, §1bis (alcance del proyecto
  completo), §7bis (contrato de endpoints).

## Backend — DTOs de request

- `backend/src/main/java/com/bajonea/backend/dto/request/RegistroComercioRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/HorarioRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/RedSocialRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/ComercioPerfilRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/FotoPerfilComercioRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/ProductoRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/ImagenProductoRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/OrdenImagenRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/UrlImagenRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/CambioEstadoProductoRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/AprobacionComercioRequestDTO.java`
- `backend/src/main/java/com/bajonea/backend/dto/request/RechazoPedidoRequestDTO.java`

## Backend — DTOs de response

- `backend/src/main/java/com/bajonea/backend/dto/response/ComercioResponseDTO.java`

## Backend — Entities

- `backend/src/main/java/com/bajonea/backend/entities/Comercio.java`

## Backend — Services

- `backend/src/main/java/com/bajonea/backend/services/ComercioService.java`
- `backend/src/main/java/com/bajonea/backend/services/RegistroService.java` (método
  `registrarComercio`, `validarHorarios`, `guardarHorarios`, `validarRedesSociales`,
  `guardarRedesSociales`)
- `backend/src/main/java/com/bajonea/backend/services/RedSocialService.java`
- `backend/src/main/java/com/bajonea/backend/services/ProductoService.java` (constantes
  `TRANSICIONES_VALIDAS`/`MAX_IMAGENES_POR_PRODUCTO`, métodos `cambiarEstado`,
  `agregarImagen`)
- `backend/src/main/java/com/bajonea/backend/util/ComercioValidaciones.java`

## Backend — Controllers

- `backend/src/main/java/com/bajonea/backend/controllers/RedSocialController.java`
- `backend/src/main/java/com/bajonea/backend/controllers/ComercioController.java` (solo
  firmas de endpoint vía `grep`)
- `backend/src/main/java/com/bajonea/backend/controllers/ProductoController.java` (solo
  firmas de endpoint vía `grep`)

## Backend — Enums

- `backend/src/main/java/com/bajonea/backend/enums/TipoComercio.java`
- `backend/src/main/java/com/bajonea/backend/enums/TipoPersonaJuridica.java`
- `backend/src/main/java/com/bajonea/backend/enums/CondicionIva.java`
- `backend/src/main/java/com/bajonea/backend/enums/TipoRedSocial.java`
- `backend/src/main/java/com/bajonea/backend/enums/DiaSemana.java`
- `backend/src/main/java/com/bajonea/backend/enums/MotivoRechazo.java`
- `backend/src/main/java/com/bajonea/backend/enums/EstadoProducto.java`
- `backend/src/main/java/com/bajonea/backend/enums/EstadoComercio.java`

## Frontend — HTML

- `frontend/registro-comercio.html`
- `frontend/comercio-perfil.html`
- `frontend/comercio-producto-form.html`
- `frontend/comercio-dashboard.html` (solo verificación de ausencia de `<input>`/`<textarea>`/`<select>`)
- `frontend/comercio-pedidos.html` (ídem)
- `frontend/comercio-pedido-detalle.html` (ídem)
- `frontend/comercio-pendiente.html` (ídem)
- `frontend/comercio-rechazado.html` (ídem)
- `frontend/comercio-productos.html` (conteo de inputs, confirma el input de búsqueda)
- `frontend/comercio-detalle.html` (solo el `<script type="module">` inicial, para confirmar
  que pertenece al rol Cliente vía `js/catalogo.js`, no a Comercio — descartado del inventario)

## Frontend — JS

- `frontend/js/comercio.js` (archivo completo, 1773 líneas — leído en tramos: 1-90, 444-527,
  528-651, 836-1088, 1089-1393, 1262-1393, 1394-1773)
- `frontend/js/auth.js` (función `initRegistroComercio`, líneas 632-1281, leída completa;
  además líneas 598-630 para las constantes `CAMPOS_STEP1_BACKEND_COMERCIO`/
  `CAMPOS_STEP2_BACKEND_COMERCIO`/`MAPA_ERRORES_REGISTRO_COMERCIO`)
- `frontend/js/validators.js` (archivo completo, 277 líneas)
- `frontend/js/cloudinary.js` (archivo completo, 107 líneas)

## Postman

- `postman/Bajonea-MVP.postman_collection.json` (620.856 bytes, 18.130 líneas) — recorrido
  completo vía script Python ad-hoc (nombre de carpeta + método + URL + nombre de cada
  request, volcado a un archivo temporal de trabajo, no versionado), filtrado con `grep` sobre
  las carpetas `00` a `32` para localizar cobertura real de Comercio/Producto/Redes
  Sociales/Administrador (aprobación)/Bloqueo de comercio/Rechazo de pedido.

## Playwright

- `testing/playwright/tests/01-registro-y-verificacion.spec.ts` (nombres de `test()`, no
  leído línea por línea)
- `testing/playwright/tests/05-pedido-flujo-completo.spec.ts` (ídem)
- `testing/playwright/tests/06-crud-productos.spec.ts` (ídem)
- `testing/playwright/tests/08-aprobacion-comercio.spec.ts` (ídem)
- Listado completo de `testing/playwright/tests/*.spec.ts` (vía `Glob`/`ls`) para confirmar
  que no existe ningún spec dedicado a `comercio-perfil.html` ni a `RedSocialController`.

## Comandos de búsqueda transversal (sin archivo de salida propio)

- `grep -rli "mercadopago"` sobre `frontend/` y `backend/src/main/java` → sin resultados,
  confirma ausencia total de integración MercadoPago en código.
- `grep -rn "redes-sociales|RedSocial|red-social|redSocial"` sobre `frontend/` → confirma que
  el único consumo real es dentro del payload de registro (`js/auth.js`), sin ningún llamado
  al `RedSocialController` fuera de eso.
- `grep -c "<input|<textarea|<select"` sobre las 6 pantallas de Comercio sin formulario
  aparente, para confirmar 0 campos reales.

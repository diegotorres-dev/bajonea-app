# Mapeo de archivos — Multi-comercio, tramo 3, Entrega A (backend y tests)

Fecha: 2026-10-01. Objetivo: que un Dueño pueda corregir un comercio rechazado y volver a solicitar su aprobación (hasta 3 veces por comercio), que el Administrador las vea en su propia bandeja con lo que cambió, y que exista el estado terminal `RECHAZO_DEFINITIVO`. **Sin tocar `frontend/`** (la Entrega B). Base de datos: solo las migraciones `V24`, `V25` y `V26`.

## Base de datos

| Archivo | Por qué |
|---|---|
| `backend/src/main/resources/db/migration/V24__agregar_rechazo_definitivo_a_estado_comercio.sql` (nuevo) | Agrega `'RECHAZO_DEFINITIVO'` (al final) al ENUM de `comercio.estado` y de `historial_estado_comercio.estado_origen` y `estado_destino`, conservando `NOT NULL` y el default. |
| `backend/src/main/resources/db/migration/V25__comercio_cantidad_resolicitudes.sql` (nuevo) | `comercio.cantidad_resolicitudes INT NOT NULL DEFAULT 0` (después de `fecha_resolicitud`). Sin ajuste de datos viejos. |
| `backend/src/main/resources/db/migration/V26__crear_historial_cambio_comercio.sql` (nuevo) | Tabla `historial_cambio_comercio` (una fila por campo cambiado, `UNIQUE (historial_estado_comercio_id, campo)`, FK `ON DELETE CASCADE`). |
| `backend/src/main/resources/application.properties` | `comercio.resolicitudes.max=3`. |

## Backend — modelo

| Archivo | Por qué |
|---|---|
| `enums/EstadoComercio.java` | Valor `RECHAZO_DEFINITIVO`. |
| `enums/CampoCambioComercio.java` (nuevo) | Los 21 campos que se comparan: 4 básicos, tipo, modalidades, foto, dirección, horarios, redes, 6 fiscales y 5 del representante. |
| `entities/Comercio.java` | Mapea `fechaResolicitud` (la columna ya existía sin mapear) y `cantidadResolicitudes`. |
| `entities/HistorialCambioComercio.java`, `repositories/HistorialCambioComercioRepository.java` (nuevos) | Entidad y repositorio de los cambios (consulta por lote para la bandeja). |
| `config/ComercioResolicitudesProperties.java` (nuevo) | Tope configurable (`comercio.resolicitudes.max`), mismo patrón que `PedidoTimeoutProperties`. |

## Backend — refactor sin cambio de comportamiento (A2)

| Archivo | Por qué |
|---|---|
| `services/ValidadorDatosNegocioComercio.java` (nuevo) | Superposición de horarios, redes repetidas, modalidades y localidad existente, extraídas de `RegistroService`; las comparten el registro, el alta adicional y la corrección (mismos mensajes y mismo orden). |
| `services/ValidadorComercioDuplicado.java` (nuevo) | El chequeo de duplicado de `AltaComercioAdicionalService`, parametrizado con el id de comercio a excluir. `RECHAZADO` no cuenta; `RECHAZO_DEFINITIVO` sí. |
| `services/AprobacionPreviaDueno.java` (nuevo) | Única derivación de "el Dueño ya tuvo un comercio aprobado" (historial con destino `APROBADO`, con respaldo en el estado actual). La usan la bandeja (`esAdicional`) y el permiso de corregir datos fiscales. |
| `services/RegistroService.java` | Usa `ValidadorDatosNegocioComercio`; el resto sin cambios. |
| `services/ComercioService.java` | `registrarTransicionAutomatica` devuelve la fila de historial; el motivo de rechazo también se obtiene para `RECHAZO_DEFINITIVO`. |
| `repositories/HistorialEstadoComercioRepository.java` | Última fila con desempate por id; última fila hacia un estado (para el token de versión y el motivo). |
| `util/ComercioTextoLegible.java` (nuevo) | Texto legible de dirección, horarios, redes y modalidades (una sola implementación para el valor anterior y el nuevo). |

## Backend — corrección y re-solicitud (A3, A4)

| Archivo | Por qué |
|---|---|
| `services/ComercioEdicionService.java`, `services/CambioComercio.java` (nuevos) | Operaciones reutilizables de edición (datos básicos, tipo, modalidades, foto, dirección, horarios, redes, datos legales); cada una recibe el comercio ya cargado y devuelve los cambios reales. Pensadas para reusar en la edición desde el perfil del comercio aprobado. |
| `services/ComercioCorreccionService.java` (nuevo) | Precarga, firma de foto y reenvío: bloqueo del Dueño → comercio, estado, tope, token de versión, permiso de datos legales, validaciones, duplicado, cambios, historial y contador. |
| `services/CloudinaryService.java` | `validarFotoPerfilComercio` (carpeta `comercios/{id}/perfil/`), con el chequeo de URL generalizado. |
| `services/AltaComercioAdicionalService.java` | Nueva regla de elegibilidad (aprobado/apto venta, o todos en rechazo definitivo); usa `ValidadorComercioDuplicado`. |
| `controllers/ComercioController.java` | `GET /{comercioId}/correccion`, `PUT /{comercioId}/resolicitud`, `POST /{comercioId}/correccion/foto/firma`. Sin `ComercioActivo`. `SecurityConfig` no cambia (`/api/v1/comercios/**` ya exige `DUENO`). |
| `repositories/ComercioRepository.java` | `findDuenoIdById` (escalar), `findByIdConBloqueo`, `findByIdAndDuenoIdConBloqueo`, conteos por Dueño y por solicitudes nuevas/re-solicitudes. |
| `repositories/RedSocialRepository.java` | `findByComercioId` (incluye las dadas de baja: las cuenta el `UNIQUE (comercio_id, tipo)`). |
| `dto/request/ReSolicitudComercioRequestDTO.java`, `dto/request/DatosLegalesComercioRequestDTO.java` (nuevos) | Body del reenvío (datos del negocio + bloque `legales` opcional + `tokenVersion`). |
| `dto/response/CorreccionComercioResponseDTO.java`, `DireccionCorreccionResponseDTO.java`, `DatosLegalesCorreccionResponseDTO.java` (nuevos) | Precarga (la dirección suma `provinciaId`). |

## Backend — Administrador (A5)

| Archivo | Por qué |
|---|---|
| `services/AdministradorService.java` | Pendientes sin re-solicitudes; `listarResolicitudes`; métricas con `resolicitudesPendientes`; `resolverAprobacion` con `definitivo`, el orden de bloqueo (id del Dueño escalar → cuenta de Mercado Pago → comercio `FOR UPDATE`) y el `409` si ya no está pendiente; avisos nuevos. |
| `controllers/AdministradorController.java` | `GET /administrador/comercios/resolicitudes`. |
| `dto/request/AprobacionComercioRequestDTO.java` | Campo opcional `definitivo` (compatible hacia atrás). |
| `dto/response/ReSolicitudComercioAdminResponseDTO.java`, `CambioComercioResponseDTO.java` (nuevos) | Bandeja de re-solicitudes. |
| `dto/response/ComercioAdminResponseDTO.java` | Suma `tipoSociedad`, `domicilioFiscal` y `fechaInicioActividades`. |
| `dto/response/MetricasAdminResponseDTO.java` | Suma `resolicitudesPendientes`. |

## Tests y scripts

| Archivo | Por qué |
|---|---|
| `backend/src/test/java/.../ComercioEdicionServiceTest.java`, `ComercioCorreccionServiceTest.java`, `AdministradorServiceResolucionTest.java`, `util/ComercioTextoLegibleTest.java` (nuevos), `AltaComercioAdicionalServiceTest.java` | Unitarios: normalización y diff de cada operación de edición, reglas y orden de bloqueo del reenvío y de la resolución, textos legibles, nueva elegibilidad. |
| `testing/playwright/tests/24-multicomercio-tramo3a-correccion-rechazados.spec.ts` (nuevo) | 41 tests a nivel API: precarga, `404` idénticos, reenvío, cambios por campo, token de versión, datos legales, duplicados, límite y rechazo definitivo, bandeja, métricas, elegibilidad, y que el estado nuevo no se cuele en suspensión, bloqueo, catálogo ni pedidos. |
| `testing/playwright/tests/22-multicomercio-tramo2a-alta-adicional.spec.ts` | El aviso de rechazo ya no lleva comillas. |
| `testing/playwright/tests/helpers/backend.ts` | `resolverComercio` acepta `definitivo`; `subirFotoCorreccionComercio`. |
| `testing/playwright/scripts/build-multicomercio-tramo3a-postman.mjs` (nuevo) | Genera la carpeta `51` de la colección de Postman (144 requests, 220 assertions). |
| `testing/playwright/scripts/build-multicomercio-tramo2a-postman.mjs` | Texto del aviso de rechazo sin comillas (carpeta `50` regenerada). |
| `testing/playwright/scripts/stress-locks-tramo2a.mjs` | Caso nuevo `CASO=tramo3a` (reenvíos dobles, resolución doble, aprobación de otros comercios del Dueño, vinculación de Mercado Pago, alta adicional y bloqueo, a la vez). |
| `testing/playwright/scripts/preparar-entorno-test.sh` (nuevo) | Resetea `bajonea_test`, levanta el backend en perfil `test` y fija la contraseña del admin para Newman. |
| `postman/Bajonea-MVP.postman_collection.json`, `postman/Bajonea-Local.postman_environment.json` | Carpeta `51` y sus variables; carpeta `50` regenerada. |
| `postman/limpiar-datos-postman.sql`, `docs/db/fase0-limpieza-bajonea-final.sql`, `docs/db/multicomercio-tramo1-borrar-segundo-comercio.sql` | Limpian también `historial_cambio_comercio`. |

### Escenarios de la carpeta `51` (`build-multicomercio-tramo3a-postman.mjs`)

Un Dueño por escenario, cada uno con su CUIT y DNI propios.

| Escenario | Qué cubre |
|---|---|
| K | Rechazado sin aprobados (el escenario principal): precarga, `404` idénticos, validaciones, datos legales, reenvío, bandeja y aprobación. |
| L | Otro Dueño rechazado: `404`, choque de CUIT y de DNI. |
| M | Dueño aprobado con un adicional rechazado de verdad (alta adicional y rechazo): datos fiscales bloqueados y duplicado. |
| N | Rechazo definitivo pedido por el Administrador y nueva regla de elegibilidad para agregar comercios. |
| O | Agota las 3 re-solicitudes; la tercera rechazada pasa a `RECHAZO_DEFINITIVO` por decisión del servidor. |
| P | Con cuenta de Mercado Pago: la re-solicitud aprobada nace `APTO_VENTA`. |

## Documentación

`docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `CLAUDE.md`, `docs/diccionario-de-datos.md` y su copia en `02. Diseño/03. Diagramas de Bases de Datos/03. Diccionario de Datos/` (v1.9), los diagramas Mermaid de ER y modelo relacional, y en `01. Análisis de Requerimientos`: requisitos funcionales de Administrador, Comercio, Dueño y Sistema (T18), alcance y limitaciones, e historias de usuario HU-A15 y HU-D09.

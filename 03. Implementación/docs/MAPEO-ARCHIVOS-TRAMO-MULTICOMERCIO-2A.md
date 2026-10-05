# Mapeo de archivos — Multi-comercio, tramo 2, Entrega A (backend y tests)

Fecha: 2026-09-30. Objetivo: que un Dueño ya aprobado pueda dar de alta comercios adicionales, que el Administrador los apruebe con contexto de los demás comercios del Dueño y que el bloqueo/restauración de cuenta deje trazabilidad. **Sin tocar `frontend/`** (la Entrega B). **Sin tablas, columnas, valores de ENUM ni migraciones nuevas.**

## Backend — trazabilidad del bloqueo (Paso 1)

| Archivo | Por qué |
|---|---|
| `services/AuthService.java` | `propagarBloqueoAComercio` y `restaurarComercioSiCorresponde` dejan una fila en `historial_estado_comercio` por cada comercio que cambian (sin administrador; motivos "Bloqueo de cuenta por intentos fallidos", "Restauración por recuperación de contraseña", "Restauración por reactivación de cuenta"). Para eso delegan en `ComercioService.registrarTransicionAutomatica`. `restaurarComercioSiCorresponde` recibe el motivo; la rama `INACTIVO` solo cambia por eso. Ahora también actualizan `fecha_modificacion` (antes no lo hacían). |
| `services/ComercioService.java` | `registrarTransicionAutomatica` pasa de `private` a `public` (la usan `AuthService` y `AdministradorService`). `activarAptoVenta(duenoId)` y `desactivarAptoVenta(duenoId)` leen los comercios con `FOR UPDATE`. |
| `repositories/ComercioRepository.java` | `findByDuenoIdConBloqueo` (lectura con `FOR UPDATE`), `existsByDuenoIdAndEstadoIn` (elegibilidad), `findByDuenoIdIn` (bandeja sin N+1). |
| `services/CuentaMercadoPagoService.java` | `vincular` y `desvincular` pasan a `saveAndFlush` (el orden de bloqueo importa: ver `docs/APRENDIZAJES-TECNICOS.md`). Método nuevo `existeActivaConBloqueo`. |
| `repositories/CuentaMercadoPagoRepository.java` | `findByDuenoIdConBloqueo` (`FOR UPDATE`, con la fila o con el hueco del índice único). |

## Backend — refactor de `RegistroService` (Paso 2)

| Archivo | Por qué |
|---|---|
| `dto/request/DatosNegocioComercioRequestDTO.java` (nuevo) | Superclase con los datos del negocio (nombre, descripción, teléfono, email de contacto, tipo, modalidades, dirección, horarios, foto, redes) y todas sus validaciones, en un solo lugar. |
| `dto/request/RegistroComercioRequestDTO.java` | Extiende la superclase y conserva sus campos fiscales, del representante y de la cuenta. Se quitó `@AllArgsConstructor`: con herencia habría generado un constructor que ya no recibe los campos heredados, y ningún código lo usaba (solo `new RegistroComercioRequestDTO()` en `NombreUsuarioTest`). El JSON del request no cambia. |
| `dto/request/AltaComercioAdicionalRequestDTO.java` (nuevo) | Extiende la superclase sin agregar campos. |
| `services/RegistroService.java` | `crearComercio(Dueno, DatosNegocioComercioRequestDTO)` (público): valida horarios, redes, modalidades y localidad, y crea el comercio `PENDIENTE` con su dirección, horarios y redes. `registrarComercio` valida en el mismo lugar de antes (antes de crear el usuario) y después llama a la variante privada, así que el orden de errores no cambia. |

## Backend — alta adicional (Paso 3)

| Archivo | Por qué |
|---|---|
| `services/AltaComercioAdicionalService.java` (nuevo) | Elegibilidad, firma de foto y el alta: bloqueo de la fila del Dueño (primera sentencia) → elegibilidad → foto → duplicado → `crearComercio`. Constantes `ESTADOS_QUE_HABILITAN` y `ESTADOS_EXCLUIDOS_DEL_DUPLICADO`. |
| `controllers/ComercioController.java` | `POST /api/v1/comercios` (201), `GET /api/v1/comercios/alta-adicional/elegibilidad`, `POST /api/v1/comercios/nuevo/foto/firma`. Ninguno declara `ComercioActivo`: ignoran `X-Comercio-Id`. `SecurityConfig` no cambia (`/api/v1/comercios/**` ya exige `DUENO`). |
| `dto/response/ElegibilidadAltaAdicionalResponseDTO.java` (nuevo) | `{ elegible }`. |
| `repositories/DuenoRepository.java` | `findByIdConBloqueo`. |
| `repositories/DireccionRepository.java` | `findByDuenoIdConComercioYLocalidad`: las direcciones de todos los comercios del Dueño en una consulta, base del chequeo de duplicado. |
| `services/CloudinaryService.java` | `generarFirmaFotoNuevoComercio` (carpeta `duenos/{duenoId}/comercios-nuevos/`) y `validarFotoNuevoComercio`. |
| `util/TextoUtils.java` | `normalizarParaComparar`. |

## Backend — aprobación y bandeja (Pasos 4 y 5)

| Archivo | Por qué |
|---|---|
| `services/AdministradorService.java` | `resolverAprobacion`: con cuenta de Mercado Pago activa (leída con `FOR UPDATE` antes de escribir el comercio) el comercio nace `APTO_VENTA` con dos filas de historial; los mensajes de aprobación llevan el nombre del comercio. `listarComerciosPendientes` calcula `esAdicional` y `otrosComercios` con dos consultas para todo el listado. `listarComerciosAprobados` deja los campos nuevos en su valor neutro. |
| `dto/response/ComercioAdminResponseDTO.java` | Suma `duenoId`, `esAdicional`, `otrosComercios`. |
| `dto/response/OtroComercioDuenoResponseDTO.java` (nuevo) | `id`, `nombre`, `estado`, `fotoPerfilUrl` de otro comercio del Dueño. |
| `repositories/HistorialEstadoComercioRepository.java` | `findComercioIdsConTransicionA`: ids de comercios que alguna vez pasaron a un estado, en una consulta. |

## Tests unitarios (Mockito, sin base)

| Archivo | Cubre |
|---|---|
| `util/TextoUtilsTest.java` (nuevo) | `normalizarParaComparar`. |
| `services/CloudinaryServiceFotoNuevoComercioTest.java` (nuevo) | Validación de la carpeta de la foto (propia, de otro Dueño, prefijo de id, otra cuenta, otras carpetas). |
| `services/AltaComercioAdicionalServiceTest.java` (nuevo) | Orden de las sentencias (bloqueo primero), elegibilidad, cada regla del duplicado, `RECHAZADO` excluido. |

## Playwright

| Archivo | Por qué |
|---|---|
| `tests/helpers/backend.ts` | `subirFotoNuevoComercio` (foto real a Cloudinary), `registrarComercioAdicional`, `payloadAltaAdicional`, más `sqlTest` y `suspenderComercio`. |
| `tests/22-multicomercio-tramo2a-alta-adicional.spec.ts` (nuevo) | 34 tests a nivel API: elegibilidad, firma, alta, validaciones, duplicados (incluido el paralelo), aprobación con y sin cuenta de Mercado Pago, rechazo, bandeja. |
| `tests/21-multicomercio-tramo1.spec.ts` | Asserts sobre el historial del bloqueo y la restauración; test nuevo de reactivación de cuenta con dos comercios. |
| `tests/08-aprobacion-comercio.spec.ts`, `tests/09-notificaciones.spec.ts` | El texto de la notificación de aprobación ahora incluye el nombre del comercio. |
| `README.md` | Filas de los specs 21 y 22. |
| `scripts/build-multicomercio-tramo2a-postman.mjs` (nuevo) | Genera la carpeta `50` de Postman y sus variables. |
| `scripts/stress-locks-tramo2a.mjs` (nuevo) | Prueba de estrés de bloqueos (aprobaciones + vinculación/desvinculación + altas + bloqueo de cuenta en paralelo). |

## Postman

| Archivo | Por qué |
|---|---|
| `postman/Bajonea-MVP.postman_collection.json` | Carpeta nueva `50 - Multi-comercio Tramo 2A (…)`: 118 requests. |
| `postman/Bajonea-Local.postman_environment.json` | Variables de esa carpeta. |

## Documentación

`docs/DECISIONES.md` (entrada del 2026-09-30), este archivo, `docs/APRENDIZAJES-TECNICOS.md` (orden de bloqueo y normalización de texto), `CLAUDE.md` (endpoints nuevos y reglas).

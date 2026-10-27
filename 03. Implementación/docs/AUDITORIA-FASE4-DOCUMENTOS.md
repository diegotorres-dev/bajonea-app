# Auditoría de Fase 4: documentos del comercio y nueva regla de `APTO_VENTA`

Fecha: 2026-10-25. Solo lectura: no se escribió código de producción, no hay migraciones, no se tocó ninguna base (las consultas de la sección 8 son `SELECT` sobre `bajonea_practicas3`) y no se llamó a ninguna API que modifique algo (Cloudinary incluido). Las decisiones que Diego ya tomó no se reabren; donde el código choca con una de ellas, está marcado como **CHOQUE**.

Resumen de la propuesta: un único servicio de aptitud (`AptitudVentaComercioService`) que es la única fuente de la regla y reemplaza a los seis lugares que hoy deciden `APROBADO` / `APTO_VENTA` por su cuenta; una tabla nueva `documento_comercio` con su historial; los archivos viajan por el backend (se validan) hacia Cloudinary con entrega autenticada; y una propiedad que activa la exigencia de documentación, para que los 71 specs y los 28 constructores de Newman que hoy llegan a `APTO_VENTA` solo con Mercado Pago no haya que reescribirlos.

---

## 1. Estado actual de `APTO_VENTA` (archivo y línea)

Rutas relativas a `backend/src/main/java/com/bajonea/backend/` salvo que diga `frontend/`.

### 1.1 Dónde se asigna (escrituras de estado)

| Disparador | Lugar | Qué hace |
|---|---|---|
| Aprobación del Administrador | `services/AdministradorService.java:278-279, 306-308` | Lee si el Dueño está `BLOQUEADO` (compartido) y si tiene cuenta MP activa (`existeActivaConBloqueo`, `FOR UPDATE`); aprobado con cuenta activa llama a `ComercioService.activarAptoVenta(comercio, bloqueado, motivo)`. |
| Vinculación de Mercado Pago | `services/MercadoPagoOAuthService.java:121-131` | `duenoBloqueadoConBloqueo`, `cuentaMercadoPagoService.vincular` y `comercioService.activarAptoVenta(duenoId, bloqueado)` sobre todos los comercios del Dueño. |
| Desvinculación de Mercado Pago | `services/MercadoPagoOAuthService.java:145-168` (167) | `cuentaMercadoPagoService.desvincular` y `comercioService.desactivarAptoVenta(duenoId)`: todo `APTO_VENTA` del Dueño vuelve a `APROBADO`. |
| Restauración al desbloquear | `services/AuthService.java:411-422` (415) | Recuperación de contraseña y reactivación: `CERRADO_TEMPORALMENTE` (o `INACTIVO`) vuelve a `APTO_VENTA` si `buscarActivaPorDueno(...).isPresent()`, si no a `APROBADO`. |
| Bloqueo de cuenta | `services/AuthService.java:390-399` | `APROBADO` / `APTO_VENTA` entran como candidatos; solo el que sigue en `APTO_VENTA` bajo `refresh` + `PESSIMISTIC_WRITE` pasa a `CERRADO_TEMPORALMENTE` (`ComercioService.java:336-343`). |
| Atajos de test | `services/TestSupportService.java:96-105` (`marcarAptoVenta`) y `:230-233` (MP simulada); endpoints `controllers/TestController.java:73` (`PUT /test/comercios/{id}/apto-venta`) y `:86` (`POST /test/duenos/{id}/mercadopago-simulada`) | Pasan por la misma `activarAptoVenta`. |
| Suspensión | `services/AdministradorService.java:341-375` (351) | `APROBADO` o `APTO_VENTA` → `SUSPENDIDO`. No hay "levantar suspensión". |

Las transiciones en sí viven en `services/ComercioService.java`: `activarAptoVenta` (289-311), `desactivarAptoVenta` (319-327), `cerrarTemporalmentePorBloqueoDeCuenta` (336-343) y `registrarTransicionAutomatica` (355, escribe `historial_estado_comercio` con administrador nulo).

### 1.2 Dónde se consulta (lecturas)

| Qué decide | Lugar |
|---|---|
| Un pedido o un ítem de carrito solo se acepta con `APTO_VENTA` (y el cierre manual, y el horario) | `services/ComercioService.java:223-249` (`validarAceptaPedidos`); llamado desde `services/CarritoService.java:85` y `services/PedidoService.java:172-174` (revalida bajo bloqueo compartido dentro de la transacción del pedido) |
| El catálogo público de comercios lista `APTO_VENTA` y `CERRADO_TEMPORALMENTE` | `services/ComercioService.java:203-221, 251-256`; el DTO público informa siempre `estado = APTO_VENTA` (`:441-444`) |
| El catálogo global de productos y sus filtros solo ven comercios `APTO_VENTA` | `services/ProductoService.java:211, 260` |
| "Operativo" del panel del Dueño y del Empleado = `APROBADO` o `APTO_VENTA` | `services/ComercioActivoService.java:46, 88, 159`; `dto/response/MiComercioResponseDTO.java` (campo `operativo`) |
| Cierre manual solo si el comercio vende | `services/CierreComercioService`; `frontend/js/apertura-comercio.js:3` (`ESTADO_CON_CIERRE = 'APTO_VENTA'`) |
| Cierre de turno y mail al Dueño | `services/CierreTurnoService.java:46, 128` (elegibles: `APTO_VENTA`, `SUSPENDIDO`, `CERRADO_TEMPORALMENTE`) |
| Alta de un comercio adicional exige al menos uno `APROBADO` o `APTO_VENTA` | `services/AltaComercioAdicionalService.java:44`; `services/AprobacionPreviaDueno.java:31` |
| Invitar al equipo | `services/InvitacionEmpleadoService.java:126` (acepta `APROBADO`, `APTO_VENTA`, `CERRADO_TEMPORALMENTE`, `SUSPENDIDO`) |
| Listado del Administrador (etiqueta "Listo para vender", acciones) | `frontend/js/admin.js:53, 869` |
| Panel del Dueño, "operativo" y aviso "Vinculá Mercado Pago para empezar a vender" | `frontend/js/comercio.js:283`; `frontend/js/selector-comercio.js:307, 370` |
| Historial de estado | `historial_estado_comercio` (una fila por transición; las automáticas no llevan administrador) |

### 1.3 Los dos huecos ya detectados

No sé con certeza a cuáles te referís. Mi lectura de lo que el código muestra hoy:

1. **Aprobación y vinculación con la cuenta del Dueño bloqueada** (tramo C3): ya están cerrados en el código. `AdministradorService.java:278` y `MercadoPagoOAuthService.java:121` leen el bloqueo antes de tocar cuenta y comercio y mandan el comercio directo a `CERRADO_TEMPORALMENTE`. La regla "ningún camino deja `APTO_VENTA` con la cuenta bloqueada" vale para esos dos caminos.
2. **Confirmación doble de la reactivación**: también cerrada en C3 (toma primero la fila del usuario).

**Dos huecos que sí siguen abiertos y que esta fase tiene que cerrar de todos modos:**

- **A. La restauración decide con una lectura sin bloqueo.** `AuthService.java:415` usa `buscarActivaPorDueno` (lectura común, snapshot de la transacción) mientras `desvincular` y `vincular` toman la cuenta `FOR UPDATE`. Una desvinculación confirmada en medio de la restauración puede dejar un comercio en `APTO_VENTA` sin cuenta. No lo reproduje; es una lectura de código, igual que el patrón que ya se corrigió para la aprobación. La función única de la sección 3.3 lo resuelve porque lee con bloqueo, en el mismo orden que la aprobación.
- **B. Los 12 comercios `APTO_VENTA` sin cuenta de Mercado Pago de la muestra** (sección 8) ya violan hoy el invariante "`APTO_VENTA` ⇒ cuenta activa". Es un efecto del `UPDATE` provisional; en cuanto el Dueño de uno de ellos se bloquee y se restaure, o vincule y desvincule, pasa a `APROBADO`.

Hallazgo lateral, anterior a esta fase: la búsqueda global de productos solo ve `APTO_VENTA` (`ProductoService.java:211, 260`) mientras el listado de comercios incluye `CERRADO_TEMPORALMENTE`. Un comercio cerrado por el bloqueo del Dueño sigue en el catálogo de comercios pero sus productos desaparecen de la búsqueda global. Probablemente no es intencional; no lo toco.

---

## 2. Cloudinary: cómo se sube hoy, qué hay que cambiar y cómo entregar privado

### 2.1 Hoy

- Subida directa del navegador a `https://api.cloudinary.com/v1_1/{cloud}/image/upload` con firma (`frontend/js/cloudinary.js:20-45`). El backend nunca recibe el binario.
- Firma: `CloudinaryService.firmar` (`services/CloudinaryService.java:157-166`) firma `timestamp`, `folder` y `upload_preset` con el secreto. Una sola preset, `bajonea_imagenes_mvp`, creada a mano en el panel: `allowed_formats` `jpg,jpeg,png,webp`, 5 MB, ancho máximo 1200 px, `quality auto`.
- Tipo de entrega **público** (`image/upload`); las URL son públicas por diseño (fotos de producto y de comercio).
- Cada flujo valida después que la URL esté en la carpeta que firmó el servidor (`validarUrlEnCarpeta`, `:130-139`).
- No existe ningún `MultipartFile` en el backend ni configuración de multipart: el valor por defecto de Spring es 1 MB por archivo.

### 2.2 Qué habría que cambiar para PDF privados

1. **Un preset o parámetros aparte para documentos.** No tocar `bajonea_imagenes_mvp`: ahí `allowed_formats` no incluye `pdf` y la transformación (`quality auto`, ancho 1200) degradaría una foto de libreta sanitaria. Subida desde el backend con el SDK (que ya está en el `pom.xml`) y parámetros explícitos: `type=authenticated`, `resource_type=image` (Cloudinary trata el PDF como imagen), carpeta `documentos/{comercioId}/`, sin transformaciones, `allowed_formats=jpg,png,webp,pdf`, `max_file_size`.
2. **Un ajuste de la cuenta, a mano.** Los planes gratuitos bloquean por defecto la **entrega** de PDF y ZIP; se habilita en `Settings → Security → "Allow delivery of PDF and ZIP files"` (fuente en el pie). Esta es la verificación que no puedo hacer yo (ver 2.4).
3. **Multipart en el backend**, hoy inexistente: `spring.servlet.multipart.max-file-size` y `max-request-size` (solo afecta a los endpoints multipart).

### 2.3 Cómo entregarlos de forma privada: tres opciones

| | Opción | Cómo funciona | Contra |
|---|---|---|---|
| **A** | **Subida directa firmada (como hoy) con `type=authenticated`** y URL firmada de corta vida al verlos | Se reutiliza el patrón actual. Para ver, el backend autoriza y devuelve `private_download_url` con expiración corta | El backend **no ve el archivo**: no puede validar el contenido real (solo lo que valga el preset de Cloudinary). Es el punto más débil frente al requisito "validar el contenido real y no solo la extensión". |
| **B (recomendada)** | **El navegador manda el archivo al backend (multipart); el backend valida y lo sube a Cloudinary como `authenticated`; para verlo, el navegador lo pide al backend con su sesión** (`fetch` con `Authorization` → `blob` → `URL.createObjectURL`) | El backend comprueba tamaño, tipo por firma de bytes y estructura mínima antes de guardar nada. Ninguna URL de Cloudinary llega al navegador, ni firmada. Cumple "sin JWT en URLs" (el archivo viaja en la respuesta, no hay enlace que compartir) y deja de depender de que Cloudinary entregue PDF públicamente | El archivo pasa dos veces por el backend; para decenas de documentos por mes no importa. Hay que manejar multipart y un tamaño de archivo en memoria acotado (10 MB). |
| **C** | Guardar el binario en MySQL (`LONGBLOB`) | Privacidad por construcción, borrado transaccional, cero dependencia de Cloudinary | Crece la base y los backups (100 comercios × 3 documentos × 3 MB ≈ 1 GB); lecturas pesadas con Hibernate. Alternativa si la verificación de 2.4 falla. |

Riesgos de B: (1) el `upload` a Cloudinary es una llamada externa y no puede ir dentro de la transacción que tiene los bloqueos: primero se valida y se sube, después se abre la transacción que inserta la fila; si la transacción falla (cupo, estado) se borra el archivo de Cloudinary después del rollback (`util/EjecucionPostCommit` existe para el camino inverso); se necesita un barrido para huérfanos. (2) Sin antivirus: la validación de bytes no detecta contenido malicioso dentro de un PDF; hay que servir siempre con `Content-Disposition`, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`, y nunca mostrar el nombre original con `innerHTML`. (3) Las pruebas automáticas no deberían subir a Cloudinary real cada vez: propongo una interfaz `AlmacenDocumentos` con la implementación de Cloudinary y otra en memoria para el perfil `test`, más un único spec de humo contra Cloudinary real.

### 2.4 Qué verificar (pasos exactos para Diego)

1. En Cloudinary → `Settings` → `Security` → bloque **PDF and ZIP files delivery**: ver si "Allow delivery of PDF and ZIP files" está tildado. Si no, tildarlo (afecta solo a esa cuenta; la cuenta es de prueba, la definitiva de `info@bajonea.ar` queda pendiente según `docs/DECISIONES.md`).
2. En `Media Library` → `Upload` → subir un PDF cualquiera de prueba, abrirlo y confirmar que se ve. Anotar si el asset queda como "Authenticated" o "Public".
3. Para el caso que importa (autenticado), la API que usaría la opción B es `private_download_url` / descarga con la clave del servidor, y **la documentación que encontré no aclara si el bloqueo de entrega de PDF también aplica a esa descarga** (el resultado de búsqueda no lo dice). Eso solo se sabe probándolo; propongo, cuando des el visto bueno al tramo, que el primer paso sea un spike de 30 minutos con un PDF real subido a un directorio `pruebas-documentos/` y borrado al terminar. No lo hice acá porque requiere llamar a Cloudinary.
4. Si la verificación 3 falla o el plan lo impide, la opción C (MySQL) es el plan B sin cambiar nada más del diseño (solo cambia la implementación de `AlmacenDocumentos`).

---

## 3. Modelo de datos propuesto (V43, sin escribirla)

### 3.1 Tablas

`documento_comercio` (una fila por documento subido):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `INT` PK, autoincremental | |
| `comercio_id` | `INT NOT NULL` | FK a `comercio`, sin cascada |
| `tipo` | `ENUM('LIBRETA_SANITARIA','HABILITACION_COMERCIAL','OTRO')` | Para ampliarlo, se agrega al final del ENUM: cambio de metadatos como en `V34`/`V35`; `EnumsContraBaseDeDatosIntegrationTest` ya compara los ENUM contra el enum Java |
| `descripcion` | `VARCHAR(100) NULL` | Obligatoria si `tipo = OTRO` (validación en el DTO) |
| `estado` | `ENUM('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE'` | |
| `motivo_rechazo` | `VARCHAR(255) NULL` | `CHECK` de coherencia con `estado` |
| `archivo_id` | `VARCHAR(255) NOT NULL` | Identificador en el almacén (public id de Cloudinary, o la clave interna en la opción C). **Nunca una URL.** |
| `archivo_mime`, `archivo_bytes`, `archivo_sha256`, `nombre_original` | | MIME comprobado por bytes, tamaño, hash (detecta el mismo archivo subido dos veces), nombre para mostrar |
| `subido_por_usuario_id` | `INT NOT NULL` | FK a `usuario` (siempre el Dueño; el Empleado no sube) |
| `fecha_subida` | `DATETIME NOT NULL` | Reloj único |
| `revisado_por_administrador_id`, `fecha_revision` | `INT NULL`, `DATETIME NULL` | |

Índices: `(comercio_id, estado)` para el recálculo y la lista del Dueño; `(estado, fecha_subida)` para la bandeja del Administrador. Sin vencimiento (decidido).

`historial_estado_documento_comercio`: tabla aparte, de solo agregar filas, con `documento_id`, `estado_origen` (nulo en el alta), `estado_destino`, `actor_usuario_id`, `actor_rol`, `motivo`, `fecha_hora`; `documento_id` con `ON DELETE CASCADE` (la baja de un pendiente se lleva su historial). **¿Hace falta o alcanza con las filas?** Alcanza con las filas para "rechazado queda en el historial", pero una revocación (`APROBADO → RECHAZADO`) pisa la fecha y el revisor de la aprobación anterior. Con una tabla chica se conserva toda la cadena (quién aprobó, quién revocó y por qué), que es lo que va a pedir el tramo de soporte y reclamos. La recomiendo; es el mismo patrón de `historial_estado_comercio`.

Cupos propuestos (configurables con valor por defecto en el código): 5 documentos pendientes y 30 filas en total por comercio.

### 3.2 Efecto en el diccionario

Versión 1.28: ENUM nuevos `TipoDocumentoComercio` y `EstadoDocumentoComercio`; tablas `DocumentoComercio` y `HistorialEstadoDocumentoComercio` (módulo Comercio); `TipoNotificacion` suma los avisos nuevos (sección 5); la descripción de `APTO_VENTA` en `EstadoComercio` cambia a la regla nueva; la línea "Regla de visibilidad y venta" se actualiza.

### 3.3 La función única de aptitud

`services/AptitudVentaComercioService` con dos métodos:

- `Aptitud calcular(comercioId)`: **pura**, sin escribir. Lee, con los bloqueos que ya tiene la transacción, (a) cuenta MP activa del Dueño, (b) cuentas de documentos aprobados y pendientes del comercio, (c) si el Dueño está bloqueado. Es lo que testean los tests unitarios con una tabla de verdad.
- `void aplicar(Comercio comercio, MotivoRecalculo motivo)`: llama a `calcular` y, si el destino difiere, escribe el estado con `ComercioService.registrarTransicionAutomatica` y el motivo.

Reglas (las que me pediste, más el cuidado del bloqueo):

- Estados que participan: `APROBADO`, `APTO_VENTA`, `CERRADO_TEMPORALMENTE`. Cualquier otro estado (`PENDIENTE`, `RECHAZADO`, `SUSPENDIDO`, `INACTIVO`, `RECHAZO_DEFINITIVO`) no se toca.
- **Para pasar a vender**: cuenta MP activa **y** al menos un documento `APROBADO` **y** ningún documento `PENDIENTE`.
- **Para seguir vendiendo** (ya en `APTO_VENTA`): cuenta MP activa **y** al menos un documento `APROBADO`. Un documento pendiente nuevo no corta las ventas. Ver el cuadro de la sección 3.4 y la pregunta 1.
- Con el Dueño `BLOQUEADO`, un comercio que cumple queda en `CERRADO_TEMPORALMENTE`, nunca en `APTO_VENTA` (la regla de C3, ahora en un solo lugar). Un comercio en `CERRADO_TEMPORALMENTE` por el bloqueo no cambia mientras dure el bloqueo; al restaurar se evalúa con la regla de "seguir vendiendo", porque entró ahí vendiendo.
- Se **reemplaza** `ComercioService.activarAptoVenta`, `desactivarAptoVenta` y el `cuentaMpActiva ? APTO_VENTA : APROBADO` de `AuthService.java:415-419`, y se lee la cuenta con bloqueo (cierra el hueco A).

### 3.4 Qué quiso decir "sigue vendiendo hasta que el Administrador rechace algo": tabla de escenarios

Comparo dos reglas. **Estricta**: el estado siempre es el resultado de la fórmula `MP ∧ aprobados ≥ 1 ∧ pendientes = 0`. **Recomendada**: la fórmula para entrar a `APTO_VENTA`, y para mantenerse solo `MP ∧ aprobados ≥ 1`. "A" = aprobados, "P" = pendientes. Todos los casos con el Dueño sin bloqueo salvo los marcados.

| # | Escenario | Estricta | Recomendada |
|---|---|---|---|
| 1 | `APROBADO`, MP activa, sube su primer documento (P=1) | `APROBADO` | `APROBADO` |
| 2 | …el Administrador lo aprueba (A=1, P=0) | `APTO_VENTA` | `APTO_VENTA` |
| 3 | `APTO_VENTA` (A=1) sube un segundo documento (P=1) | **`APROBADO` (deja de vender al subir)** | `APTO_VENTA` |
| 4 | …el Administrador aprueba el segundo | `APTO_VENTA` | `APTO_VENTA` |
| 5 | …el Administrador rechaza el segundo (A=1) | `APTO_VENTA` (después de haber estado cortado) | `APTO_VENTA` |
| 6 | El Administrador revoca el único aprobado (A=0) | `APROBADO` | `APROBADO` |
| 7 | El Administrador revoca uno de dos aprobados (A=1) | `APTO_VENTA` | `APTO_VENTA` |
| 8 | `APTO_VENTA` y el Dueño desvincula MP | `APROBADO` (igual que hoy) | `APROBADO` |
| 9 | `APROBADO` con A=1 y P=0 y el Dueño vincula MP | `APTO_VENTA` | `APTO_VENTA` |
| 10 | `APTO_VENTA` con P=1 y el Dueño elimina el pendiente | sin cambio | sin cambio |
| 11 | `APROBADO` por un pendiente (P=1, A=1) y el Dueño lo elimina | `APTO_VENTA` | `APTO_VENTA` |
| 12 | Cuenta de Mercado Pago activa, sin documentos aprobados | `APROBADO` ("falta documentación") | `APROBADO` |
| 13 | Documentos aprobados, sin cuenta de Mercado Pago | `APROBADO` ("falta Mercado Pago") | `APROBADO` |
| 14 | Dueño bloqueado (3 intentos) con el comercio en `APTO_VENTA` | `CERRADO_TEMPORALMENTE` | `CERRADO_TEMPORALMENTE` |
| 15 | …mientras está bloqueado, el Administrador revoca el único aprobado | sigue `CERRADO_TEMPORALMENTE` | sigue `CERRADO_TEMPORALMENTE` |
| 16 | …el Dueño recupera la cuenta | `APROBADO` (se evalúa al restaurar) | `APROBADO` |
| 17 | `APROBADO` que cumple todo y el Administrador aprueba el último documento con el Dueño bloqueado | `CERRADO_TEMPORALMENTE` (sin pasar por `APTO_VENTA`) | igual |
| 18 | Comercio `SUSPENDIDO` | no cambia, sube o no | no cambia |

Lectura: la única diferencia está en los casos 3 y 10/11 (documento pendiente sobre un comercio que ya vende). La estricta corta las ventas apenas el Dueño sube un documento nuevo, que va contra lo que pediste; la recomendada solo las corta cuando desaparece el último respaldo (casos 6 y 8). Lo que **no** puedo decidir yo: si el rechazo de un documento nuevo, cuando queda algún aprobado, debería cortar las ventas (la frase puede leerse así). Pregunta 1.

Pedidos en curso al perder la aptitud: igual que cuando se desvincula, los ya aceptados siguen su flujo (el comercio sigue operando lo que ya aceptó). No hace falta bloquear la pérdida de aptitud por documentos por pedidos `PENDIENTE_PAGO`, a diferencia de la desvinculación: la cuenta de cobro sigue activa y el pago llega bien. `PedidoService.confirmarPedido` ya revalida `APTO_VENTA` bajo bloqueo compartido en el momento de crear el pedido, así que no nacen pedidos nuevos.

### 3.5 Orden de bloqueo y dónde entran los documentos

Orden vigente: `usuario` → `empleado_comercio` → `dueno`/`cuenta_mercado_pago` → `comercio` → `producto`/`pedido` → `pago` → `carrito`. Los documentos entran **después de `comercio`**: `usuario` → `cuenta_mercado_pago` → `comercio` → **`documento_comercio`** → `producto`/`pedido`.

Todas las operaciones que cambian documentos o recalculan toman en ese orden: (1) el usuario Dueño, compartido (como `duenoBloqueadoConBloqueo`); (2) `cuenta_mercado_pago` del Dueño (como `existeActivaConBloqueo`); (3) el comercio `FOR UPDATE`; (4) la fila del documento `FOR UPDATE`, que es siempre la primera lectura de esa fila. El recuento de aprobados y pendientes sale de lecturas hechas con el comercio bloqueado; como todas las escrituras de documentos lo toman primero, el recuento no puede cambiar bajo los pies de quien recalcula. Es el mismo orden que ya usa `AdministradorService.resolverAprobacion` (dueño → cuenta → comercio), así que no aparece una arista nueva en el grafo de bloqueos. Mantenerlo exige que `vincular`/`desvincular` y la restauración usen la función con los bloqueos tomados por quien llama (la función no los toma, igual que las transiciones de hoy).

Qué no entra a la transacción: el envío del archivo a Cloudinary (antes de abrirla) y el borrado del archivo de un pendiente eliminado (después del commit).

---

## 4. Endpoints propuestos

Convenciones del proyecto: `ApiResponse` con `mensaje`, 404 idéntico para lo ajeno, validación en DTOs, `X-Comercio-Id` obligatorio para el Dueño. Las rutas del Dueño caen bajo `hasRole("DUENO")` de `/api/v1/comercios/**` (`config/security/SecurityConfig.java:139`) y **no se agregan a `DelegacionEmpleado`** (el Empleado no sube ni ve documentos, ya figura así en los requisitos); `ClasificacionRutasComercioTest` obliga a clasificarlas.

### Dueño

| Método y ruta | Qué hace | Códigos |
|---|---|---|
| `GET /api/v1/comercios/documentos` | Lista los documentos del comercio activo (todos los estados, con el motivo de rechazo) y el estado de requisitos | 200; 400 sin `X-Comercio-Id`; 404 comercio ajeno |
| `GET /api/v1/comercios/documentos/requisitos` | Solo los requisitos: `{ cuentaMercadoPagoVinculada, documentosAprobados, documentosPendientes, aptoParaVender, faltan: ["MERCADO_PAGO","DOCUMENTO_APROBADO","REVISION_PENDIENTE"] }`. Es lo que lee el panel para "qué falta para vender" | 200 |
| `POST /api/v1/comercios/documentos` (multipart: `tipo`, `descripcion`, `archivo`) | Sube un documento; nace `PENDIENTE` | 201; 400 (tipo, formato, `OTRO` sin descripción, archivo ilegible o vacío); 409 (cupo, estado del comercio no permite subir); 404 |
| `DELETE /api/v1/comercios/documentos/{id}` | Elimina un documento **pendiente** | 200 con `mensaje`; 404 (ajeno o inexistente); 409 (ya no está pendiente) |
| `GET /api/v1/comercios/documentos/{id}/archivo` | Devuelve el archivo (opción B) con las cabeceras de seguridad | 200; 404 |

Subir exige comercio `APROBADO`, `APTO_VENTA` o `CERRADO_TEMPORALMENTE`; con `SUSPENDIDO` y los demás estados, `409`. Pregunta 3.

### Administrador

| Método y ruta | Qué hace | Códigos |
|---|---|---|
| `GET /api/v1/administrador/documentos/pendientes` | Bandeja ordenada por fecha de subida, con comercio y Dueño; también un `documentosPendientes` en las métricas del dashboard | 200 |
| `GET /api/v1/administrador/comercios/{comercioId}/documentos` | Todos los documentos de un comercio con su historial | 200; 404 |
| `GET /api/v1/administrador/documentos/{id}/archivo` | El archivo | 200; 404 |
| `PUT /api/v1/administrador/documentos/{id}/resolver` (`{ aprobar, motivo }`) | Aprueba o rechaza; sobre un `APROBADO` con `aprobar=false` es una **revocación**; motivo obligatorio al rechazar o revocar. (Nombre en infinitivo, como `/comercios/{id}/resolver` ya confirmado en §7bis) | 200; 400 (falta motivo); 404; 409 (ya estaba en ese estado) |

El Administrador no necesita pruebas de concurrencia entre sus propias acciones (solo hay uno), pero el código igual toma el bloqueo del documento y valida el estado sobre la fila bloqueada.

### Límites y validación del contenido

- Tipos de archivo: PDF, JPG, PNG, WebP. El tipo **se decide por la firma de bytes** (`%PDF-`, `FF D8 FF`, `89 50 4E 47`, `RIFF....WEBP`), no por la extensión ni por el `Content-Type` que manda el navegador; el MIME que se guarda es el comprobado.
- Tamaño: 10 MB (fotos de celular de un documento superan con frecuencia los 5 MB de las imágenes de producto). Pregunta 8.
- Cupo: 5 pendientes y 30 en total por comercio, comprobado con el comercio bloqueado, de modo que dos subidas simultáneas no lo superen.
- Límite de ritmo de subidas por Dueño (hay un `RateLimitPublicoFilter`, pero es para rutas públicas; esta es autenticada, alcanza con el cupo).
- El nombre original se guarda solo para mostrarlo con `textContent`.
- Spring: `spring.servlet.multipart.max-file-size=10MB`, `max-request-size=11MB`; `MaxUploadSizeExceededException` mapeada a `400` con mensaje (el proyecto no usa 413).

---

## 5. Notificaciones

Estado real (corregí la cifra de "6 de 31"): hay **33 tipos** en `TipoNotificacion` y **22 tienen un emisor** en `services/`; ninguno de los 5 de audiencia Administrador (`NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`, `NUEVO_RECLAMO`, `NUEVO_MENSAJE_SOPORTE`, `REEMBOLSO_FALLIDO_DEFINITIVO`) emite, y `NotificacionService` solo tiene los caminos `crearParaCliente`, `crearParaDueno` y `crearParaEquipo`: **no existe un `crearParaAdministrador` ni una campana en el panel del Administrador** (ya anotado en la Fase 16). Los emails (Resend) son solo verificación, recuperación, reactivación, invitación, regularización y resumen de turno.

| Aviso | A quién | Canal | Propuesta |
|---|---|---|---|
| Documento aprobado | Dueño | Notificación | Tipo `DOCUMENTO_APROBADO` (audiencia `DUENO`, entidad `COMERCIO`, con `comercio_id`: no hace falta valor nuevo en `TipoEntidadNotificacion`). Texto con el nombre del comercio |
| Documento rechazado o revocado | Dueño | Notificación | `DOCUMENTO_RECHAZADO`, con el motivo en el texto |
| El comercio ya puede vender / dejó de poder | Dueño | Notificación | `COMERCIO_APTO_VENTA` y `COMERCIO_SIN_APTITUD` (nacen del cambio de estado en la función única; hoy vincular Mercado Pago no avisa nada) |
| Documento nuevo para revisar | Administrador | **Contador en el dashboard y bandeja**, no notificación | `documentosPendientes` en `MetricasAdminResponseDTO`, igual que `comerciosPendientes`. Una notificación no tiene dónde mostrarse sin campana |
| Email | Dueño | Ninguno en esta fase | Hoy ninguna resolución del comercio (aprobado, rechazado, suspendido) envía email; mantener el criterio. Pregunta 7 |

Los tipos nuevos son una migración de metadatos en `notificacion.tipo` (valores al final del ENUM, como `V34`/`V35`), incluida en V43.

---

## 6. Impacto en los tests (el mayor costo de la fase)

Cantidades relevadas con `grep` sobre el árbol actual:

| Capa | Dependen de llegar a `APTO_VENTA` solo con Mercado Pago |
|---|---|
| Playwright | `prepararAprobado(.., conMercadoPago=true)`: **59 specs, 132 llamadas**; `marcarAptoVenta`: 14 specs, 21 llamadas; `vincularMercadoPagoSimuladoTest`: 5 specs, 11 llamadas. 23 specs mencionan el literal `APTO_VENTA` (113 ocurrencias): la mayoría para comprobar estados, no para llegar a él |
| Newman | 28 de 34 constructores (`build-*-postman.mjs`) usan `apto-venta` o `mercadopago-simulada`; 152 menciones de `APTO_VENTA` en `postman/Bajonea-MVP.postman_collection.json` |
| Estrés | 24 de 25 `stress-locks-*.mjs` |
| Java | 52 clases mencionan `EstadoComercio.APTO_VENTA` (115 ocurrencias, casi todas fijan el estado directamente); solo 9 ejercitan la transición real (`AdministradorServiceResolucionTest`, `BloqueoVigenteIntegrationTest`, `CarritoIntegrationBase`, `ComercioServiceBloqueoVigenteTest`, `CuentaMercadoPagoServiceTest`, `EscriturasEmpleadoIntegrationTest`, `MercadoPagoCuentaUnicaIntegrationTest`, `MercadoPagoOAuthServiceDesvinculacionTest`, `PedidoTransicionesIntegrationTest`) |

El punto de entrada está concentrado en pocos lugares: en el backend `TestSupportService` (96-105, 230-233) y en los helpers `tests/helpers/backend.ts` (`marcarAptoVenta`, `vincularMercadoPagoSimuladoTest`) y `tests/helpers/multicomercio.ts` (`prepararAprobado`, `clonarComercioTest`), más el SQL directo de los estreses.

**Dos maneras de absorberlo:**

- **Opción 1 (recomendada): interruptor de la exigencia de documentación**, como `precio.bloqueo-en-franja.habilitado` (Fase 2, T3): `comercio.documentacion.requerida`, `true` por defecto en el código, `false` en el perfil `test`, y un atajo `PUT /api/v1/test/documentacion-requerida?habilitado=` que los specs nuevos encienden y apagan en un `finally`. Con la propiedad apagada la función de aptitud usa la fórmula de hoy (solo Mercado Pago) y **ningún spec, constructor ni estrés existente cambia**. Se suma: pruebas nuevas de la regla (Java unitarias con tabla de verdad, integración, concurrencia), carpeta 79 de Newman, specs 82 (API) y 83 (UI), un estrés. Costo estimado: el tramo mismo, sin arrastre. Riesgo: los flujos grandes quedan probados con la propiedad apagada; se compensa corriendo con la propiedad encendida los pocos specs que tocan el cambio de estado (28, 29, 32 a 34 y las carpetas de Mercado Pago y bloqueo) mediante un helper `aprobarDocumentacionTest(comercioId)` nuevo, que no hace falta usar en el resto.
- **Opción 2: regla siempre activa.** Hay que agregar el atajo `documentacion-aprobada` a los 4 helpers centrales y revisar a mano los specs que afirman "después de vincular, `APTO_VENTA`" (parte de los 23 specs con el literal, los 28 constructores y los 9 tests Java de transición). Mi estimación: entre dos y tres veces el costo del tramo completo, con riesgo alto de regresiones en los estreses de bloqueo.

El perfil `test` hoy depende de Cloudinary real para algunos specs (el 06 sube imágenes reales). Para los documentos propongo `AlmacenDocumentos` en memoria en `test` (sección 2.3).

---

## 7. Pantallas necesarias

**Dueño** (dentro del perfil del comercio y en el panel):

1. Sección "Documentación" en el perfil: lista por documento con tipo, nombre del archivo, chip de estado (Pendiente, Aprobado, Rechazado), fecha y, si está rechazado, el motivo visible sin tocar nada; acciones: ver, eliminar (solo pendiente), "Subir otro".
2. Hoja de subida: tipo (selector), descripción si es "Otro", selección de archivo con vista previa de nombre y tamaño, reglas de formato y tamaño, estados de carga y de error.
3. Bloque "Para empezar a vender" en el panel: tres requisitos con tilde (comercio aprobado, Mercado Pago, documentación aprobada) y qué falta. Reemplaza al aviso actual "Vinculá Mercado Pago para empezar a vender" (`frontend/js/selector-comercio.js:307, 370`) y generaliza el estado "Listo para vender" / "Falta algo".
4. Visor del archivo (imagen o PDF) en modal.
5. Estados vacíos y de error, el mensaje cuando el comercio perdió la aptitud ("Ya no podés recibir pedidos nuevos: falta …") y cómo se ve para el Empleado (no ve nada de esto).

**Administrador** (funcional y mínima; la pasada de Nielsen va al final):

6. Bandeja "Documentos pendientes" (comercio, Dueño, tipo, fecha, "Revisar").
7. Pantalla de revisión: visor, datos del comercio, historial del comercio y botones Aprobar / Rechazar (modal con motivo obligatorio). Para revocar, la misma pantalla sobre un documento aprobado.
8. Etiqueta de documentos en el detalle del comercio y contador en el dashboard.

**Mockups que haría falta pedirte:** (a) sección Documentación del Dueño con los tres estados, (b) hoja de subida, (c) bloque "Para empezar a vender" en el panel, (d) visor, (e) bandeja de revisión del Administrador, (f) pantalla de revisión con el modal de rechazo.

---

## 8. Datos reales (`bajonea_practicas3`, solo `SELECT`)

```sql
SELECT estado, COUNT(*) AS comercios FROM comercio GROUP BY estado ORDER BY estado;
SELECT c.estado, COUNT(*) AS comercios, SUM(cm.id IS NOT NULL) AS con_mp_activa
FROM comercio c LEFT JOIN cuenta_mercado_pago cm ON cm.dueno_id = c.dueno_id AND cm.activa = 1
GROUP BY c.estado ORDER BY c.estado;
SELECT c.id, c.nombre, c.estado, c.dueno_id, u.estado AS estado_cuenta_dueno,
       (SELECT COUNT(*) FROM cuenta_mercado_pago cm WHERE cm.dueno_id = c.dueno_id AND cm.activa = 1) AS mp_activa
FROM comercio c JOIN dueno d ON d.id = c.dueno_id JOIN usuario u ON u.id = d.id ORDER BY c.id;
SELECT id, dueno_id, activa, es_cuenta_prueba, fecha_vinculacion FROM cuenta_mercado_pago;
SELECT c.id, c.nombre, COUNT(p.id) pedidos FROM comercio c LEFT JOIN pedido p ON p.comercio_id = c.id
WHERE c.estado = 'APTO_VENTA' GROUP BY c.id ORDER BY c.id;
```

| Estado | Comercios | Con cuenta MP activa |
|---|---|---|
| `APTO_VENTA` | 13 | 1 |
| `APROBADO` | 5 | 0 |
| `SUSPENDIDO` | 2 | 1 |
| `PENDIENTE` | 2 | 0 |
| `RECHAZO_DEFINITIVO` | 1 | 0 |

Cuentas MP: dos, ambas activas y reales (`es_cuenta_prueba = 0`): Dueño 185 (Pizzería Popular, `APTO_VENTA`) y Dueño 259 ("Usuariotest", que está `SUSPENDIDO`, no `APTO_VENTA`: tu "otro" con Mercado Pago no es de los 13). **Los 12 comercios `APTO_VENTA` restantes no tienen cuenta MP** (ids 2 a 12 y 14), todos de Dueños `ACTIVO`. Solo Pizzería Popular tiene historia de ventas (86 pedidos, 2 en curso); Frozono tiene 1; los demás, 0. Hay 219 productos en comercios `APTO_VENTA`. `practicas3` está en la versión de Flyway `V41` (la `V42` de direcciones todavía no se aplicó).

**Qué pasaría al aplicar la regla (sin ejecutarlo):** la regla exige documentos aprobados y ninguno tiene documentos, así que **los 13 pasarían a `APROBADO`** si se recalculara todo: el catálogo quedaría vacío. Sin recálculo masivo, cada comercio cambiaría solo cuando ocurra un evento suyo (bloqueo y restauración, vincular, desvincular o un documento), y los 12 sin Mercado Pago ya cambiarían hoy por esos mismos eventos (hueco B).

**Recomendación:** (1) `V43` crea las tablas y **no toca ningún estado**; no hay recálculo masivo. (2) En `practicas3`, arrancar el backend con `COMERCIO_DOCUMENTACION_REQUERIDA=false` hasta que cargues documentos de verdad (el valor por defecto en el código es `true`, para que producción nunca arranque sin la exigencia por un olvido de configuración; anotar en `docs/LISTA-DE-DESPLIEGUE.md`). (3) Los 12 sin Mercado Pago quedan como están (hueco B), a menos que quieras vincularles una cuenta de prueba. Alternativa descartada: sembrar documentos aprobados de mentira en la base, porque no existiría ningún archivo real detrás.

---

## 9. Qué dejar previsto para la fase siguiente (suspensión, soporte y reclamos)

Solo dejar el hueco, sin implementarlo:

- **Levantar la suspensión**: el destino no debe estar escrito a mano; que `SUSPENDIDO → …` lo decida la misma función de aptitud (`MotivoRecalculo.SUSPENSION_LEVANTADA`). Eso evita un cuarto lugar con `APTO_VENTA` hardcodeado.
- **`MotivoRecalculo` como enum** desde ahora (hoy los motivos son textos sueltos en `historial_estado_comercio`).
- **El Administrador ve los documentos por comercio** (ruta `/administrador/comercios/{id}/documentos`) para poder consultarlos desde un caso de soporte o reclamo.
- **Una suspensión por documentación** (suspender a un comercio por un documento falso) es un motivo de suspensión posible: el campo `motivo` del historial de documentos y el de `historial_estado_comercio` ya alcanzan; no hace falta un campo nuevo.
- **Retención y borrado de datos personales**: la libreta sanitaria tiene datos personales; el tramo de cuenta e inactivación tendrá que decidir qué se guarda y por cuánto. Pregunta 9.
- Los tipos de aviso de la sección 5 quedan con audiencia y `comercio_id` desde el inicio, así que soporte puede reutilizarlos.

---

## 10. Plan por tramos

Formato de siempre: auditoría corta, entrega A (backend y tests), entrega B (pantallas y tests de UI), checklist y commit. Números libres confirmados: migración **V43** (la última es `V42__direccion_multiple_cliente.sql`), Newman **carpeta 79** (la última es la 78), Playwright **specs 82 (API) y 83 (UI)** (los últimos son 80 y 81), diccionario **v1.28**. Los estreses nuevos se agregan al runner con el id `documentos`. Estimaciones en sesiones de trabajo de la dimensión de las del T4 y T5:

| Tramo | Contenido | Estimación |
|---|---|---|
| **D0 spike** | Verificar con un PDF real la entrega autenticada en Cloudinary (sección 2.4) y decidir B o C | media sesión |
| **D1, entrega A** | `AptitudVentaComercioService` con la tabla de verdad, la propiedad de exigencia, reemplazo de los seis lugares (con la propiedad apagada se comporta como hoy), cierre del hueco A, orden de bloqueo, pruebas de regresión. Sin tablas ni endpoints nuevos | 1 sesión larga |
| **D2, entrega A** | `V43`, entidades, `AlmacenDocumentos` (Cloudinary y memoria), subir / listar / eliminar / requisitos del Dueño, validación por bytes, cupos, multipart, atajos de test, `ClasificacionRutasComercioTest`, diccionario v1.28 | 2 sesiones |
| **D3, entrega A** | Administrador: bandeja, resolver / revocar, métricas, notificaciones nuevas, carpeta 79, spec 82, estrés `documentos`, mutaciones | 1,5 sesiones |
| **D4, entrega B** | Pantallas del Dueño (sección, hoja de subida, bloque "Para empezar a vender", visor), generalización del aviso del panel, spec 83 | 2 sesiones |
| **D5, entrega B** | Pantallas del Administrador (bandeja, revisión, contador), spec 83 ampliado, regresión completa, cierre | 1,5 sesiones |

Total orientativo: 8 a 9 sesiones; D1 entrega valor por sí sola (cierra el hueco A) y se puede cerrar antes de empezar con archivos.

---

## 11. Preguntas abiertas (sin repetir lo ya decidido)

1. **¿El rechazo de un documento cuando queda algún aprobado corta las ventas?** Tu frase "sigue vendiendo hasta que el Administrador rechace algo" admite dos lecturas. *Recomiendo que no*: el comercio solo deja de vender si pierde Mercado Pago o su último documento aprobado (casos 3, 5 y 6 de la tabla); un documento extra rechazado no debería frenar un local con papeles válidos. Si preferís la lectura literal, cambia solo una línea de la función.
2. **¿"Al menos un documento aprobado" puede ser de cualquier tipo?** Con tres tipos, un `OTRO` aprobado alcanzaría para vender sin libreta sanitaria. *Recomiendo* una lista configurable de tipos requeridos (`comercio.documentacion.tipos-requeridos`), vacía al principio (= cualquiera), para completarla cuando investigues qué exige el municipio, sin migración.
3. **¿En qué estados del comercio se puede subir?** *Recomiendo* `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE`; con `SUSPENDIDO` y los demás, `409`.
4. **¿El Dueño puede eliminar un documento ya aprobado?** *Recomiendo que no*: elimina solo pendientes; para reemplazar uno aprobado sube otro y el Administrador revoca el viejo si hace falta.
5. **¿Cómo se guardan los archivos?** *Recomiendo* la opción B (el backend valida y sube a Cloudinary autenticado), condicionada al spike D0; si Cloudinary no entrega PDF autenticado en el plan gratuito, la opción C (MySQL).
6. **¿El aviso al Administrador es un contador en el dashboard o una campana nueva?** *Recomiendo* el contador y la bandeja: construir notificaciones de Administrador es un tramo propio (ningún tipo de ese rol emite hoy).
7. **¿Email al Dueño cuando se rechaza un documento?** *Recomiendo* solo notificación dentro de la app por ahora, como las demás resoluciones de comercio; el email se suma cuando haya plantillas.
8. **Límites:** 10 MB por archivo, 5 pendientes y 30 totales por comercio. ¿Te parecen bien?
9. **Retención de datos personales de los documentos** (Ley 25.326): ¿durante cuánto tiempo se guardan documentos de un comercio inactivo o con rechazo definitivo? *Recomiendo* no borrar nada automáticamente en este tramo y decidirlo en el de cuenta e inactivación.
10. **Muestra de `practicas3`:** ¿arrancamos con la exigencia apagada (`COMERCIO_DOCUMENTACION_REQUERIDA=false`) o preferís cargar documentos reales para al menos Pizzería Popular? *Recomiendo* apagarla.
11. **Qué ve el Cliente cuando un comercio pierde la aptitud:** hoy, al desvincular Mercado Pago, el comercio desaparece del catálogo. *Recomiendo* lo mismo para la pérdida por documentos (el cartel "Cerrado temporalmente" queda solo para el bloqueo del Dueño).

---

## 12. Riesgos y cosas que no cierran

- **Entrega de PDF en el plan gratuito de Cloudinary**: la documentación consultada confirma el bloqueo por defecto y el ajuste de seguridad, pero no aclara si alcanza a la descarga autenticada que usaría la opción B. Mientras no haya spike, el diseño tiene dos salidas (B o C) y una decisión pendiente.
- **Validación de contenido por bytes** no detecta un PDF malicioso ni un documento falso; es una defensa de formato, no de contenido. La revisión humana del Administrador es el control real.
- **Hay dos reglas de "operativo"**: `APROBADO` y `APTO_VENTA` son operativos para el panel, pero solo `APTO_VENTA` vende y solo él se cierra a mano. El frontend (`apertura-comercio.js`, `selector-comercio.js`) ya mezcla ambas nociones en dos constantes; hay que centralizarlas al generalizar "Para empezar a vender".
- **El hueco B** (12 comercios `APTO_VENTA` sin cuenta en la muestra) puede aparecer como "falla de la nueva regla" aunque ya existía; conviene decirlo antes de mostrar la muestra.
- **Subida fuera de la transacción**: un fallo entre la subida a Cloudinary y la inserción deja un archivo huérfano; el barrido de huérfanos tiene que existir desde el primer día, aunque sea manual.
- **Multipart es una superficie nueva** en un backend que hasta hoy no recibía binarios: límites, tiempos de espera del proxy de Railway y memoria del contenedor para 10 MB.
- **Cobertura de pruebas con la propiedad apagada** (opción 1 de la sección 6): los flujos de pedidos y bloqueo se prueban sin la exigencia; el riesgo está acotado a la función única, que tiene su propia tabla de verdad.
- **El comercio puede perder aptitud con pedidos `EN_PREPARACION`**: siguen su flujo, pero el Dueño ya no puede aceptar pedidos nuevos hasta recuperarla. Hace falta un mensaje claro en el panel.
- **Documentación de requisitos**: `requisitos-funcionales-dueño.md` línea 324 y `requisitos-funcionales-empleado.md` línea 312 mencionan "la futura documentación de habilitación"; al implementarse hay que reemplazarlas por la funcionalidad real (propongo el texto en el tramo D5).

Fuentes consultadas sobre Cloudinary: [documentación de la configuración de seguridad del entorno](https://cloudinary.com/documentation/dam_admin_product_environment_settings.md), [artículo sobre errores al cargar PDF en Cloudinary](https://dev.to/nerdincode/how-to-fix-failed-to-load-pdf-document-error-on-cloudinary-or-52il), [guía de control de acceso a los assets](https://www.Cloudinary.com/documentation/control_access_to_media) y [respuesta de soporte sobre descargas privadas](https://support.cloudinary.com/hc/en-us/community/posts/115000335289-private-URL).

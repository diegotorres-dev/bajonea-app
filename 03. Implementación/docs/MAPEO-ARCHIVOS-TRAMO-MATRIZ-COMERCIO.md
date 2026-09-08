# Mapeo de archivos — Parte A (fix password Comercio) + Fase 2 (matriz exhaustiva de Postman para Comercio) (2026-09-03)

No cerrado — a la espera de que Diego confirme el checklist completo antes de dar por
terminada esta fase, mismo criterio que `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md`.

## Parte A — fix de código

- `backend/src/main/java/com/bajonea/backend/dto/request/RegistroComercioRequestDTO.java`
  (líneas 137-139) — eliminado el `@Size(max = 72, message = "La contraseña no puede superar
  los 72 caracteres")` redundante del campo `password`, dejando `@NotBlank` + `@ValidarPasswordSegura`
  como única validación de formato. Mismo criterio ya aplicado a
  `RegistroClienteRequestDTO.password` el 2026-09-03 (ver `docs/DECISIONES.md`).

## Fase 2 — archivos nuevos

- `testing/playwright/scripts/matriz-comercio-runner.mjs` — helper reusable (no es parte de
  la suite de Playwright en sí, vive en `testing/` por ser infraestructura de testing del
  proyecto, mismo criterio que `scripts/reset-db.mjs`): funciones `post`/`put`/`patch`/`del`/`get`
  contra el backend real, `baseComercioPayload` (payload completo válido de
  `POST /auth/registro/comercio` con overrides por deep-merge), `registrarYVerificarYLogin`
  (registro + bypass de verificación vía `GET /test/token` + login, perfil `test` únicamente),
  y `runCase` (ejecuta un caso y lo imprime como NDJSON). Usado para generar evidencia real
  campo por campo antes de escribir cualquier request de Postman.
- `testing/playwright/scripts/build-matriz-comercio-postman.mjs` — script que arma los 9
  folders nuevos (33 a 41) como objetos de la colección de Postman, con los mensajes/status
  exactos verificados contra el backend real, y los inserta/actualiza en
  `postman/Bajonea-MVP.postman_collection.json` (reemplaza por nombre de folder si ya existe,
  para poder re-ejecutar el script sin duplicar). Re-ejecutable: `node
  testing/playwright/scripts/build-matriz-comercio-postman.mjs`.
- `docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-COMERCIO.md` — este archivo.

## Fase 2 — archivos modificados

- `postman/Bajonea-MVP.postman_collection.json` — pasó de 410 a 621 requests (+211). 9 folders
  nuevos, numerados 33 a 41 (continúa la numeración de los folders `22`-`32` de la matriz de
  Cliente del 2026-09-03):

  | Folder | Nombre | Items |
  |---|---|---|
  | 33 | Matriz Comercio - Registro Paso 1 (Negocio) | 33 |
  | 34 | Matriz Comercio - Registro Paso 2 (Legales) | 61 |
  | 35 | Matriz Comercio - Registro Paso 3 (Horarios) | 7 |
  | 36 | Matriz Comercio - Perfil (edicion) | 16 |
  | 37 | Matriz Comercio - Cambio de password desde perfil | 13 |
  | 38 | Matriz Comercio - Foto de perfil | 10 |
  | 39 | Matriz Comercio - CRUD de productos (campo por campo) | 32 |
  | 40 | Matriz Comercio - Gestion de imagenes de producto | 13 |
  | 41 | Matriz Comercio - Rechazo de pedido | 26 |

  Verificado con Newman contra el backend real (perfil `test`, `bajonea_test` recién
  reseteada): **211/211 requests, 366/366 assertions, 0 fallos** (corrida final, tras corregir
  las 8 aserciones de mensaje afectadas por el hallazgo de `Accept-Language` — ver más abajo).

## Alcance cubierto por formulario (según lo pedido en el prompt)

- **Wizard de registro — Paso 1 (Negocio):** `nombre` (vacío, 2 formatos inválidos, límite
  150/151), `descripcion` (límite 2000/2001), `telefono` (vacío, 2 formatos), `emailContacto`
  (vacío, 2 formatos), `tipoComercio` (12 valores válidos + null + fuera de enum),
  `aceptaDelivery`/`aceptaRetiro` (regla "al menos una"), `fotoPerfilUrl` (vacía, host
  inválido, esquema inválido), `direccion` (2 casos representativos — ver nota de alcance).
- **Wizard de registro — Paso 2 (Legales):** `razonSocial`, `cuit` (vacío + 2 formatos),
  `condicionIva` (5 valores + null + fuera de enum), `tipoSociedad` (18 valores + null + fuera
  de enum), `domicilioFiscal`, `fechaInicioActividades`, `nombreRepresentante`,
  `apellidoRepresentante`, `dniRepresentante` (incluye límite inferior 7 dígitos),
  `telefonoRepresentante`, `fechaNacimientoRepresentante` (incluye el caso de mensaje no
  determinístico, ver hallazgo 1), `email`, `password` (límite inferior 7/8 y determinismo de
  73 caracteres, 3 corridas).
- **Wizard de registro — Paso 3 (Horarios):** los 2 gaps reales que la auditoría marcó sin
  cobertura ni en Postman ni en Playwright — `horaCierre <= horaApertura` y superposición de
  horarios en el mismo día — más `diaSemana`/`horaApertura` null y `diaSemana` fuera de enum.
- **Edición de perfil de Comercio:** los 4 campos de texto + la regla "al menos una modalidad"
  (gap que la auditoría marcó como ya cerrado en el backend pero nunca testeado — ahora sí
  tiene test real).
- **Cambio de contraseña desde perfil (Comercio):** dominio sin cobertura previa, ahora
  completo (passwordActual/passwordNueva vacíos, formato inválido, determinismo de 73
  caracteres, contraseña actual incorrecta, caso válido con verificación de login real).
- **Foto de perfil de Comercio:** los 4 negativos de formato + el caso límite de 552
  caracteres que expone el bug real (ver hallazgo 2) + caso válido.
- **CRUD de productos:** `nombre`, `descripcion`, `precio` (cero, negativo, decimales, límite
  8/9 dígitos), `categoriaId` (null, inexistente), `tagIds` (vacío, límite 5/6, id
  inexistente).
- **Gestión de imágenes de producto:** `ImagenProductoRequestDTO.url`/`orden`,
  `OrdenImagenRequestDTO.orden`, `UrlImagenRequestDTO.url` (incluye la confirmación de que
  acepta `.pdf` a propósito, sin `@Pattern` de extensión).
- **Rechazo de pedido:** `motivo` faltante, `motivo` fuera de enum, obligatoriedad condicional
  de `comentario` cuando `motivo=OTRO` (vacío, string vacío, y solo espacios — confirma que el
  backend también hace `trim()`, no solo el frontend), límite superior de `comentario` (500/501).

**Fuera de alcance, según instrucción explícita del prompt:** Paso 4 del wizard (Redes
Sociales) no se testeó — ni el campo `redesSociales` dentro del payload de registro ni el CRUD
dedicado de `RedSocialController` (ya con cobertura excelente documentada en la auditoría,
folder `21`). `AprobacionComercioRequestDTO` tampoco (acción del rol Administrador, no un
formulario de Comercio).

## Hallazgos reales encontrados y reportados (sin corregir)

1. **`RegistroComercioRequestDTO.fechaNacimientoRepresentante` — mismo patrón de bug que el ya
   corregido en la Parte A, sin corregir todavía.** Una fecha futura viola simultáneamente
   `@Past` y `@MayorDeEdad`, ninguna de las dos de obligatoriedad — el mensaje que gana no es
   determinístico (confirmado con 4 corridas: 2 con "La fecha ingresada no es válida", 2 con
   "Debe ser mayor de 18 años"). No estaba documentado en
   `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md` — es un hallazgo nuevo de esta fase, exactamente el
   tipo de caso que esa auditoría advertía que podía existir en otros campos. El test de
   Postman correspondiente (folder 34) acepta cualquiera de los 2 mensajes posibles, sin
   fallar por esto — documentado explícitamente en el nombre del item.
2. **`PUT /comercios/perfil/foto` — una URL de más de 500 caracteres produce `500 Internal
   Server Error` en vez de un `400` con mensaje.** `FotoPerfilComercioRequestDTO.url` no tiene
   `@Size(max=500)` propio (ya señalado como hallazgo 4 de la auditoría, sin confirmar
   empíricamente en su momento). Confirmado ahora con una URL real de 552 caracteres, formato
   válido en todo lo demás: `500` con `"No se pudo procesar la solicitud, intentá nuevamente"`
   — la columna física (`comercio.foto_perfil_url VARCHAR(500)`) trunca/falla al persistir. El
   test de Postman (folder 38) documenta el bug explícitamente en el nombre del item y afirma
   el `500` como comportamiento actual, no como comportamiento deseado.
3. **Corrección a mi propio hallazgo inicial (ya no vigente): no hay ningún mensaje en inglés
   sin traducir.** Durante la construcción de esta matriz encontré varios campos sin `message`
   propio en su anotación (`ComercioPerfilRequestDTO.nombre` con `@Size`,
   `ProductoRequestDTO.categoriaId` con `@NotNull`, `HorarioRequestDTO.diaSemana`/`horaApertura`
   con `@NotNull`, `RechazoPedidoRequestDTO.motivo`/`comentario`) y usando mi propio script de
   verificación (Node `fetch`) obtuve mensajes en inglés ("must not be null", "size must be
   between 0 and 150"). **Esto resultó ser un artefacto de mi propia herramienta, no un bug
   real**: Node/undici envía por defecto el header `Accept-Language: *`, que Spring resuelve a
   inglés. Confirmado con `curl` (sin ese header) y con Newman (que tampoco lo envía): el
   servidor responde en **español** vía los mensajes por defecto ya traducidos de Hibernate
   Validator ("no debe ser nulo", "el tamaño debe estar entre 0 y 150") — el mismo idioma que
   ve cualquier cliente real (Postman, curl, un navegador). Los 8 items de Postman afectados se
   corrigieron para usar el mensaje real en español antes del cierre de esta fase (ver el
   detalle de la corrida de Newman más abajo). Lo que sí sigue siendo una observación válida,
   de severidad mucho menor y no un "bug de idioma": esos campos usan la redacción genérica de
   Hibernate Validator ("el tamaño debe estar entre X e Y", "no debe ser nulo") en vez de la
   redacción propia y más amigable que el resto de la app usa en sus mensajes personalizados
   (ej. "El nombre no puede superar los 150 caracteres"). Es una inconsistencia de tono, no de
   idioma ni de funcionalidad — se deja documentada acá por completitud, sin recomendar
   acción sobre ella en este tramo.

## Bugs de infraestructura de testing encontrados y corregidos en el camino

- **Backend huérfano en el puerto 8080 al iniciar la sesión**, con perfil `test` activo y
  datos residuales de una sesión previa nunca limpiados (52 usuarios, 15 comercios, etc. en
  `bajonea_test`). Confirmado con Diego que no había ninguna sesión paralela — el proceso
  (PID 18676) se mató y `bajonea_test` se reseteó con `npm run test:reset` antes de arrancar
  cualquier prueba nueva.
- **`admin_password` del entorno de Postman (`PostmanAdmin123`) no coincidía con la contraseña
  real de `admin@bajonea.ar` en la `bajonea_test` recién reseteada** (el seed de
  `scripts/reset-db.mjs` inserta un hash de contraseña desconocida a propósito, ver el
  comentario del propio script). Resuelto fijándola vía el flujo real de recuperación de
  contraseña (mismo mecanismo que `testing/playwright/tests/helpers/backend.ts`,
  `fijarPasswordAdminYLoguear`) antes de correr los folders 39/41 (que dependen de un login de
  Administrador para crear categorías/tags y aprobar el comercio de prueba).
- **Los comercios de prueba para el dominio de "Rechazo de pedido" quedaban "cerrados" y
  `POST /carrito/items` fallaba con `409`** porque el primer intento cargó `horarios` con una
  sola franja (`LUNES`), y la fecha real de la corrida (2026-09-03) es miércoles. Corregido
  registrando el comercio de ese dominio con las 7 franjas completas (`00:00:00`-`23:59:59`
  los 7 días), mismo patrón que "Comercio A"/"Comercio B" del resto de la colección.
- **CUITs de prueba inventados sin dígito verificador válido** causaron varios `400` de
  `@ValidarCuit` en las primeras corridas de exploración manual (no llegaron a la colección
  final, corregido antes de escribir los items de Postman). Los CUITs finales de la colección
  se calcularon con el algoritmo real módulo 11 de AFIP.

## Limpieza de datos de prueba

`bajonea_test` se reseteó por completo (`npm run test:reset`) como último paso, dejando
únicamente el seed baseline (`admin@bajonea.ar`, geografía). Verificado con `SELECT` directo:

```
usuarios=1 (solo admin@bajonea.ar) | comercios=0 | clientes=0 | productos=0 | pedidos=0 | categorias=0 | tags=0
```

El backend que esta sesión levantó en el puerto 8080 (perfil `test`) se detuvo al finalizar,
para no dejar un proceso huérfano corriendo (mismo tipo de situación encontrada al iniciar
esta sesión).

## Archivos leídos como fuente (sin modificar)

- `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md` (completo, 629 líneas) — fuente de verdad de mensajes
  exactos, regex y valores límite, usada tal cual sin re-derivar del código salvo para
  confirmar los 2 hallazgos nuevos.
- `backend/src/main/java/com/bajonea/backend/dto/request/RegistroComercioRequestDTO.java`,
  `RegistroClienteRequestDTO.java` (comparación para el fix de la Parte A).
- `backend/src/main/java/com/bajonea/backend/dto/request/FotoPerfilComercioRequestDTO.java`,
  `VerificarCodigoRequestDTO.java`, `ConfirmarRecuperacionPasswordRequestDTO.java`,
  `RecuperacionPasswordRequestDTO.java`, `ItemCarritoRequestDTO.java`, `PedidoRequestDTO.java`
  — confirmación puntual de forma de DTO antes de armar los payloads de setup.
- `backend/src/main/java/com/bajonea/backend/dto/response/LoginResponseDTO.java` — forma real
  de la respuesta de login (`{token, usuario: {...}}`).
- `backend/src/main/java/com/bajonea/backend/enums/TipoEntrega.java` — valores reales
  (`DOMICILIO`/`RETIRO`, no `DELIVERY` como se asumió en el primer intento).
- `backend/src/main/resources/application-test.properties`,
  `testing/playwright/scripts/reset-db.mjs`, `testing/playwright/package.json` — mecanismo de
  reset de `bajonea_test`.
- `postman/Bajonea-Local.postman_environment.json` — convención de `base_url`,
  `admin_email`/`admin_password` ya establecida por el proyecto.
- `postman/Bajonea-MVP.postman_collection.json` — estructura de folders existentes (22-32,
  formato de item/request/event) usada como plantilla exacta para los folders nuevos.

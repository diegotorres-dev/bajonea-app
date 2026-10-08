# Aprendizajes técnicos — Bajoneá

> Las contraseñas de prueba que figuraban en este documento se reemplazaron por referencias `‹CP-n›`; la correspondencia está en `docs/CUENTAS-DE-PRUEBA.local.md` (archivo local, no versionado).

Lecciones operativas y de herramientas que no son decisiones de diseño (esas viven en `docs/DECISIONES.md`) pero que conviene no volver a descubrir. Cada entrada nombra el síntoma, la causa real y qué hacer; el contexto completo está en la entrada de `docs/DECISIONES.md` que se cita.

---

## MercadoPago

### `es_cuenta_prueba` depende de `MERCADOPAGO_TEST_TOKEN` al momento de vincular

- **Síntoma:** al pagar con una tarjeta nueva aparece "Oh, no, algo anduvo mal", aunque el pago con una tarjeta guardada funcione. El pago devuelve el `init_point` de producción.
- **Causa:** `cuenta_mercado_pago.es_cuenta_prueba` se decide por la variable de entorno `MERCADOPAGO_TEST_TOKEN` cuando se vincula la cuenta (el backend manda `test_token` en el intercambio del código de OAuth), **no** inspeccionando la cuenta real. Si el backend arrancó sin la variable, cualquier vinculación nueva queda como no-test aunque la cuenta sea de prueba.
- **Qué hacer:** setear `MERCADOPAGO_TEST_TOKEN=true` **antes** de arrancar el backend (PowerShell: `$env:MERCADOPAGO_TEST_TOKEN="true"`), vincular la cuenta de prueba y recién ahí pagar. Una cuenta ya vinculada sin la variable hay que re-vincularla. El backend emite un WARN al arrancar (`MercadoPagoConfig`) si la variable no está seteada explícitamente; si lo ves y vas a usar una cuenta de prueba, frená y setéala.
- Ver `docs/DECISIONES.md`, 2026-09-25.

### `fee_details` devuelve `type = application_fee` aunque el split use `marketplace_fee`

- **Causa:** es solo el nombre con que MercadoPago informa nuestra comisión de marketplace en la respuesta de `GET /v1/payments/{id}`. No significa que se esté usando el mecanismo `application_fee` de la API de Pagos.
- **Qué hacer:** no "corregir" el filtro de `MercadoPagoPagoService` a `marketplace_fee` (la entrada de respuesta nunca se llama así) ni reintentar `application_fee` al crear la preferencia. Ver `docs/MERCADOPAGO-BAJONEA-FINAL.md`, sección "Split implementado y verificado".

### La aplicación de MercadoPago tiene que estar bajo la cuenta de Bajonea Split

- Para que el `marketplace_fee` llegue a la cuenta esperada en sandbox, `MERCADOPAGO_CLIENT_ID`/`_SECRET` deben ser los de una aplicación registrada bajo la cuenta de MercadoPago de Bajonea Split. Es un requisito de configuración, no de código.

---

## Base de datos y concurrencia

### Orden de bloqueo entre Dueño, Mercado Pago, comercio y usuario (tramo multi-comercio 2A)

- **Regla:** las transacciones que escriben estas filas las toman siempre en este orden: `dueno` → `cuenta_mercado_pago` → `comercio` → (las filas que se insertan referenciando a un padre, como `usuario` por la notificación). Ninguna transacción pide un bloqueo "hacia atrás".
- **Quién toma qué:** el alta adicional bloquea la fila del `dueno` (`SELECT … FOR UPDATE`, primera sentencia) y no espera a nadie más. La aprobación de un comercio bloquea la cuenta de Mercado Pago del Dueño (con la fila, o con el hueco del índice único si no hay) y recién después escribe el comercio. La vinculación/desvinculación escribe la cuenta y después lee los comercios con `FOR UPDATE`. El bloqueo de cuenta por intentos fallidos bloquea el `usuario` y actualiza comercios con lecturas comunes, sin `FOR UPDATE`.
- **Trampa real que apareció probando (deadlock de MySQL, reproducido con `testing/playwright/scripts/stress-locks-tramo2a.mjs`):** `repository.save(entidad)` sobre una entidad ya cargada **no ejecuta el `UPDATE` en ese momento**: Hibernate lo difiere hasta el commit, y una consulta posterior solo dispara el flush si toca las mismas tablas. La vinculación hacía `save(cuenta)` y después leía los comercios con `FOR UPDATE`, así que el `UPDATE` de la cuenta corría *después* de bloquear los comercios: orden invertido respecto de la aprobación → deadlock. Se arregló con `saveAndFlush` en `CuentaMercadoPagoService.vincular`/`desvincular`. **Cuando el orden de bloqueo importa, usar `saveAndFlush` (o un `FOR UPDATE` explícito), no `save`.** Un `INSERT` con `IDENTITY` sí se ejecuta enseguida.
- **`REPEATABLE READ` y lecturas comunes:** la foto de la transacción se toma en la primera lectura común. Una transacción que vio "no hay comercio aprobado" al principio no lo ve aunque otro lo confirme después. Por eso `ComercioService.activarAptoVenta(duenoId)`/`desactivarAptoVenta(duenoId)` leen los comercios con `FOR UPDATE` (una lectura con bloqueo ve siempre lo último confirmado): sin eso, una vinculación que llegara a mitad de una aprobación dejaba el comercio `APROBADO` con la cuenta ya vinculada.
- **Cada `INSERT` con clave foránea toma un bloqueo compartido sobre la fila padre.** Insertar en `historial_estado_comercio` pide S sobre la fila de `comercio`; insertar en `notificacion` pide S sobre la de `usuario`; insertar en `comercio` o en `cuenta_mercado_pago` pide S sobre la de `dueno`. Hay que contarlos al razonar sobre ciclos.
- **Lo que no hay que hacer:** bloquear el comercio antes que la cuenta (invierte el orden con la vinculación), ni usar `FOR UPDATE` en el bloqueo por intentos fallidos (esperaría la fila de un comercio que la aprobación ya tiene mientras la aprobación espera el `usuario` para la notificación).
- **Pendiente conocido, anterior a este tramo:** dos *primeras* vinculaciones simultáneas del mismo Dueño chocan por el `UNIQUE (dueno_id)` de `cuenta_mercado_pago`.

### Corrección de comercios rechazados: el mismo orden de bloqueo y por qué la resolución lee primero solo el id del Dueño (tramo multi-comercio 3A)

- **Regla (la misma del tramo 2A, extendida):** `dueno` → `cuenta_mercado_pago` → `comercio` → tablas hijas. El reenvío del Dueño (`ComercioCorreccionService.reSolicitar`) bloquea la fila de `dueno` como primera sentencia y después la del comercio (`findByIdAndDuenoIdConBloqueo`, `FOR UPDATE`); no toca `cuenta_mercado_pago`. La resolución del Administrador (`AdministradorService.resolverAprobacion`) lee solo el id del Dueño con una consulta escalar (`findDuenoIdById`), toma la cuenta de Mercado Pago con bloqueo (solo al aprobar) y recién después bloquea el comercio (`findByIdConBloqueo`) y revalida que siga `PENDIENTE`.
- **Por qué escalar:** el código anterior hacía `findById(comercio)` antes de pedir la cuenta. Eso carga la entidad en el contexto de persistencia y, en `REPEATABLE READ`, congela una foto de su estado: dos resoluciones simultáneas del mismo comercio podían las dos ver `PENDIENTE` y las dos escribir. Con la consulta escalar no queda ninguna entidad en memoria, así que la lectura `FOR UPDATE` trae lo último confirmado y el segundo en llegar ve que ya no está pendiente (`409`).
- **Token de versión del reenvío:** es el id de la fila de historial del último rechazo del comercio (`0` si no hay ninguna). El `PUT` lo compara dentro del bloqueo: una pestaña vieja (otro reenvío ya hecho, o un rechazo nuevo del Administrador) da `409` sin gastar un intento.
- **Una excepción dentro de la transacción revierte todo.** El reenvío aplica las ediciones en el lugar y, si ninguna cambió nada, lanza `409`; por eso cada operación de `ComercioEdicionService` escribe solo cuando el dato realmente cambió (un reenvío sin cambios no borra y vuelve a insertar los horarios).
- **Medido con `CASO=tramo3a` de `testing/playwright/scripts/stress-locks-tramo2a.mjs`** (12 rondas: dos reenvíos idénticos de cada comercio rechazado, doble resolución, aprobaciones de otros comercios del mismo Dueño, vinculación y desvinculación de Mercado Pago, alta adicional y bloqueo de cuenta, a la vez; y una segunda fase con rechazos del Administrador contra reenvíos con token viejo): sin ningún `5xx`, un solo ganador por carrera y `cantidad_resolicitudes` igual a las filas `RECHAZADO → PENDIENTE` del historial.
- **Dos Dueños que corrigen hacia el mismo CUIT:** el segundo espera el índice único `uq_persona_juridica_cuit` hasta que el primero confirma y recibe `409` (se atrapa `DataIntegrityViolationException`); no hay ciclo porque ninguno necesita nada del otro.

### Lecturas con bloqueo compartido: `FOR SHARE` no existe en MariaDB 10.4 (tramo multi-comercio 5A)

- **Síntoma:** `@Lock(LockModeType.PESSIMISTIC_READ)` sobre una consulta JPQL falla en el motor local con `You have an error in your SQL syntax ... near 'share'`: Hibernate genera `... for share` y MariaDB 10.4.32 solo entiende `LOCK IN SHARE MODE`. MySQL 8 acepta las dos formas. Lo encontró el test de integración contra `bajonea_test`; los tests con Mockito no lo habrían visto.
- **Qué se hizo:** las dos lecturas con bloqueo compartido del tramo (los pedidos `PENDIENTE_PAGO` de la desvinculación y el estado del comercio al crear un pedido) son consultas nativas con `LOCK IN SHARE MODE` (`PedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido`, `ComercioRepository.leerEstadoConBloqueoCompartido`), que funciona en MariaDB y en MySQL. Es sintaxis deprecada en MySQL 8 (todavía válida en 8.4); si algún día se retira, el reemplazo es `FOR SHARE` y hay que revisar el dialecto.
- **El estado se lee de la consulta, no de la entidad:** `entityManager.refresh(comercio, PESSIMISTIC_READ)` habría sido una alternativa, pero el `SELECT` nativo devuelve el estado confirmado más reciente y `PedidoService.confirmarPedido` valida con ese valor (`ComercioService.validarAceptaPedidos(comercio, estadoActual)`). Una lectura común posterior, en `REPEATABLE READ`, devolvería la foto de la transacción y dejaría crear un pedido sobre un comercio recién desvinculado.
- **Orden de bloqueo de la desvinculación:** `cuenta_mercado_pago` (`FOR UPDATE`) → todos los comercios del Dueño (`FOR UPDATE`) → pedidos `PENDIENTE_PAGO` de esos comercios (compartido, filas y no un `COUNT`). Es el orden de siempre (`dueno` → `cuenta_mercado_pago` → `comercio` → hijas) con los pedidos al final. Crear un pedido toma solo el comercio (compartido) y después inserta el pedido (el bloqueo de la clave foránea sobre el comercio ya lo tiene): no pide la cuenta. El webhook y la sincronización toman el pedido `FOR UPDATE` y leen la cuenta con lectura común: no hay ciclo con la desvinculación (que espera al pedido, no al revés). La cascada de suspensión de un comercio toma comercio y después pedidos, el mismo orden.
- **Por qué los comercios se bloquean antes de mirar los pedidos:** si la desvinculación mirara los pedidos primero, un pedido creado entre medio quedaría sobre una cuenta ya desvinculada. Con el comercio bloqueado `FOR UPDATE`, una creación de pedido en curso termina antes (la desvinculación espera) o espera a que la desvinculación termine (y ve el comercio en `APROBADO`).
- **Medido con `testing/playwright/scripts/stress-locks-tramo5a.mjs`** (15 rondas por escenario): dos Dueños vinculando la misma cuenta a la vez (exactamente un `200` y un `409`), pedidos creados mientras se desvincula (en ninguna ronda quedó un pedido `PENDIENTE_PAGO` sobre una cuenta inactiva), desvincular con un pago pendiente (`409` siempre) y vincular/desvincular intercalados del mismo Dueño. Sin ningún `5xx` ni deadlock; el log del backend solo muestra las violaciones esperadas de los índices únicos.
- **Dos primeras vinculaciones simultáneas del mismo Dueño** siguen chocando por `UNIQUE (dueno_id)` y responden `409` con el texto genérico "Ya existe un registro con alguno de los datos ingresados" (no con el de cuenta en uso). Es el pendiente conocido de antes de este tramo; no se corrigió.

### Normalización de texto para comparar (`TextoUtils.normalizarParaComparar`)

- Para decidir si dos textos escritos por personas son "el mismo": descompone en NFD, quita las marcas diacríticas (`\p{M}`), pasa a minúsculas, recorta y colapsa espacios. `null` y `""` dan lo mismo. La `ñ` se compara como `n` (también la quita, aunque para nombres de comercio y calles es lo que se busca).
- Solo para comparar: nunca para guardar ni mostrar (lo guardado sigue pasando por `aTitleCase`). Ambos lados de la comparación tienen que pasar por la función (lo guardado ya está en Title Case).
- El chequeo de comercio duplicado no tiene un `UNIQUE` en la base que lo respalde (no se puede expresar con esta normalización): lo hace la aplicación y se serializa con el bloqueo de la fila del Dueño.

---

## Testing

### Precondición de Newman: la contraseña de `admin@bajonea.ar` tras un reset

- **Síntoma:** todas las corridas de la colección de Postman fallan en cascada con un `401` del admin.
- **Causa:** `testing/playwright/scripts/reset-db.mjs` siembra `admin@bajonea.ar` (`nombre_usuario` `adminbajonea`) con un hash bcrypt de una contraseña desconocida. La colección espera `‹CP-1›` (variable del environment `postman/Bajonea-Local.postman_environment.json`).
- **Qué hacer:** con el backend en perfil `test`, fijar la contraseña por el flujo real de recuperación antes de correr Newman: (1) `POST /api/v1/auth/recuperar-password` con `{ "email": "admin@bajonea.ar" }`; (2) obtener el código real con `GET /api/v1/test/token?email=admin@bajonea.ar&tipo=RECUPERACION_PASSWORD`; (3) `POST /api/v1/auth/recuperar-password/confirmar` con `{ "email": "admin@bajonea.ar", "codigo": "<código>", "nuevaPassword": "‹CP-1›" }`. Es el mismo mecanismo que documenta la descripción de `admin_password` en el environment. Los specs de Playwright no lo necesitan: lo resuelven cada uno con `fijarPasswordAdminYLoguear` (`tests/helpers/backend.ts`).
- **Sugerencia futura, no implementada:** automatizar este paso dentro de `reset-db.mjs`.

### Playwright corre siempre con `workers: 1`

- No es una optimización pendiente. `admin@bajonea.ar` es una cuenta real compartida por 13 de los 19 archivos de spec y Bajoneá tiene **sesión única por cuenta** (`Sesion.activa`): un login nuevo invalida el anterior de la misma cuenta, por UI o por API. Con más de un worker dos specs se pisan y rompe el que pierde la carrera. Además el backend único de desarrollo y Cloudinary no toleran la concurrencia real: con paralelismo por defecto fallaban ~45 tests. Convención para specs nuevos: todo el setup por API de una cuenta va antes que su login por UI dentro del mismo test.

### `waitForURL` necesita comodín final cuando la redirección agrega query string

- **Síntoma:** un test de Playwright cuelga hasta el timeout en un `waitForURL` aunque la pantalla de destino ya cargó.
- **Causa:** las redirecciones posteriores a un alta o a una resolución agregan query string (por ejemplo `?productoCreado=1` o `?comercioResuelto=1`), y un patrón sin comodín final no matchea esa URL.
- **Qué hacer:** terminar el patrón con comodín: `**/pantalla.html*`.

### Los atajos de test no reemplazan la integración real

- `GET /api/v1/test/token`, `PUT /api/v1/test/comercios/{id}/apto-venta` y `PUT /api/v1/test/pedidos/{id}/pago-aprobado` existen solo bajo `@Profile("test")`. Saltean el paso externo pero ejecutan el mismo código de negocio que el flujo real. Sirven para poder testear, no prueban que MercadoPago funcione.

### El atajo de clonar comercios no copia las redes sociales

- `POST /api/v1/test/comercios/{id}/clonar` copia el comercio, su dirección y sus horarios, pero no sus redes sociales. Un clon no se puede reenviar en la corrección (exige al menos una red): el spec `24` copia las redes del original por SQL (`clonarConRedes`) después de clonar, y el caso `tramo3a` del script de estrés hace lo mismo.
- El clon tampoco tiene fila de historial aunque se cree `RECHAZADO` o `RECHAZO_DEFINITIVO`: la corrección lo trata como un rechazo sin motivo y con versión `0`.

### `BajoneaApplicationTests` no se corre con `mvn test` sin perfil `test`

- **Riesgo:** `BajoneaApplicationTests` es un `@SpringBootTest` que levanta el contexto completo. En el perfil por defecto usa el `spring.datasource.url` del entorno (`bajonea_final` en `application.properties`; `bajonea_practicas3` en el entorno de desarrollo de Diego), y con `flyway.enabled=true` migraría esa base y arrancaría los `@Scheduled` contra datos reales.
- **Qué hacer:** correr los tests unitarios de a uno con `mvnw test -Dtest=NombreDelTest` (los de `services/` y `validation/` son Mockito puro y no tocan ninguna base), o correr `mvn test` únicamente con el perfil `test` activo (apunta a `bajonea_test`). Nunca `mvn test` a secas.
- **Origen:** tramo multi-comercio 1 (`docs/DECISIONES.md`, 2026-09-29).

---

## Frontend / herramientas

### `node --check` no detecta la redeclaración de `const` en archivos `.js` con `import`/`export`

- **Síntoma:** un `SyntaxError` (por ejemplo `const label` duplicado en la misma función) deja la pantalla en blanco en el navegador, pero `node --check archivo.js` pasa.
- **Causa:** sin un `package.json` de tipo módulo, la autodetección de ESM de Node no cubre ese caso puntual.
- **Qué hacer:** verificar copiando el archivo a `.mjs` y corriendo `node --check` sobre la copia, o confiando en la carga real en el navegador. Ver `docs/DECISIONES.md` (Tramo 16.27) y `docs/MAPEO-ARCHIVOS-TRAMO16.27.md`.

### Un heredoc de Bash puede colapsar las barras invertidas y fallar con comillas

- **Síntoma:** un archivo escrito con `cat > archivo <<'EOF'` desde la herramienta de Bash llegó con `\\p{L}` convertido en `\p{L}` (una barra de menos) y no compiló ("illegal escape character"); otros comandos largos con heredocs fallaron con "unexpected EOF while looking for matching".
- **Qué hacer:** escribir los archivos con la herramienta de escritura de archivos (o con un script que se guarde con ella) y no con heredocs; después de escribir un `.java` con expresiones regulares, compilar y mirar las barras. Al editar archivos con Python en Windows, leer y escribir con `newline=''` para no cambiar los finales de línea (los archivos del proyecto son CRLF en el árbol de trabajo).

### Cada contenedor de íconos necesita su propia regla de tamaño (no hay una global)

- **Síntoma:** un ícono SVG nuevo se ve bien en Chromium pero queda invisible (0×0) en iPhone.
- **Causa:** ningún SVG del proyecto tiene `width`/`height` como atributos, y `styles.css` no tiene un `svg { ... }` general: el tamaño sale de una regla `.contenedor svg { width; height }` por cada contenedor. WebKit renderiza en 0×0 un SVG con `viewBox` y sin tamaño; Chromium lo estira al ancho del contenedor y por eso no avisa. Caso real: la "X" de `.schedule-chip__remove` (2026-09-30).
- **Qué hacer:** al agregar un ícono en un contenedor nuevo (o generado por JS con `innerHTML`), agregar la regla `.contenedor svg` con su tamaño en el mismo cambio. Para chequearlo sin un iPhone: un observador de DOM que marque todo `svg` sin atributos `width`/`height` y sin ninguna regla CSS con `width`/`height` que le aplique (así se encontró el caso). Ver `docs/DECISIONES.md` (2026-09-30, "Arreglos para iPhone/Safari") y `docs/MAPEO-ARCHIVOS-TRAMO-FIX-IPHONE-WEBKIT.md`.

### Los campos de texto tienen que tener 16px o más (zoom de iOS)

- **Síntoma:** en iPhone, al tocar un campo la página hace zoom y queda ampliada.
- **Causa:** iOS Safari hace zoom al enfocar un `input`, `select` o `textarea` con `font-size` menor a 16px.
- **Qué hacer:** `.input-shell input`, `.select-shell select` y `.textarea-shell textarea` van en 16px (hecho el 2026-09-30); los campos nuevos fuera de esos contenedores (estilos inline incluidos) también. Subir el tamaño puede cambiar el ancho intrínseco del campo y desbordar filas flex: revisar las filas de 3 o más columnas.

### WebKit de Playwright no arranca con una directiva de Control de aplicaciones de Windows

- **Síntoma:** `browserType.launch: Host system is missing dependencies` (`ngtcp2.dll`, `libsharpyuv.dll`, `libxml2.dll`, `libegl.dll`), aunque los archivos están en la carpeta del navegador; con la validación salteada el proceso muere con `exitCode=3236495362`.
- **Causa:** Windows bloquea esas DLL ("Una directiva de Control de aplicaciones bloqueó este archivo"); se ve corriendo `PrintDeps.exe` (en `ms-playwright/winldd-*`) sobre cada DLL.
- **Qué hacer:** no es un problema del proyecto ni de Playwright; hace falta decidir si se ajusta la directiva en esa máquina o se corre WebKit en otra (Mac, Linux o CI). Mientras tanto, `--project=chromium`.

### Dos primeras vinculaciones simultáneas de MercadoPago del mismo Dueño

Medido el 2026-09-30 (`CASO=primera-vinculacion` en `testing/playwright/scripts/stress-locks-tramo2a.mjs`): con un Dueño sin fila en `cuenta_mercado_pago`, dos vinculaciones a la vez dan `200 + 409` (o `200 + 200` si la segunda ya ve la fila de la primera). El `409` sale del manejador genérico de violación de integridad por `uq_cuenta_mp_dueno`; nunca aparece un `500`, queda una sola fila y el estado de los comercios es coherente. El perdedor recibe un mensaje genérico ("Ya existe un registro con alguno de los datos ingresados"). Detalle en `docs/DECISIONES.md`, 2026-09-30 (Entrega B).

### Una edición con script que corta "desde un texto hasta otro" puede duplicar o perder media archivo

- **Síntoma:** al mover el paso Legales de `auth.js` con un script de Python que recortaba `s[:a] + nuevo + s[b:]`, el archivo quedó con la mitad duplicada (`initRegistroComercio` contenía el código del registro de Cliente). Pasó el chequeo de sintaxis, así que solo se vio al leer el resultado.
- **Causa:** el texto de cierre (`const passwordInput = …`) aparecía antes que el de inicio, en otra función; con `b < a` el recorte repite lo que está entre los dos. El archivo tenía cambios sin commitear, así que `git` no tenía de dónde restaurarlo.
- **Qué hacer:** en cualquier edición con script, buscar cada marcador desde la posición del anterior, afirmar `a < b` antes de recortar, copiar el archivo a un lugar temporal antes de tocarlo y mirar el `diff` contra la copia. Si ya se rompió y no hay commit: el historial de archivos de Claude Code guarda la versión anterior a la primera edición de la sesión (`~/.claude/file-history/<id de sesión>/<hash>@v1`; se identifica por tamaño y por contenido). Contar finales de línea con Python (`bytes.count(b'\r\n')`), no con `grep -c $'\r'`, que dio resultados distintos entre invocaciones. Ver `docs/DECISIONES.md` (2026-10-01, Entrega B del tramo 3).

### `addInitScript` vuelve a escribir el `localStorage` en cada navegación

- **Síntoma:** un test que arma la sesión con `abrirComoUsuario` (init script con el token de la API) y después inicia sesión por la pantalla de login queda con la sesión vieja en la siguiente carga, y el backend responde `401` ("Sesión cerrada"): el login por UI invalidó la sesión anterior de esa cuenta (sesión única) y el init script vuelve a poner el token viejo antes de que corra la página.
- **Qué hacer:** si un test necesita las dos cosas con la misma cuenta, usar un contexto de navegador nuevo para el login por UI (o no armar la sesión por init script en esa página). Con cuentas distintas no hay problema.

### Un `FOR UPDATE` por consulta no refresca una entidad que ya está cargada (open-in-view)

- **Síntoma esperado, no ocurrido:** al cerrar un comercio, `findByIdConBloqueo` (JPQL con `PESSIMISTIC_WRITE`) devolvía la instancia que la resolución de `X-Comercio-Id` ya había cargado, con el valor de `cerrado_manualmente` de antes de esperar el bloqueo: dos cierres simultáneos habrían visto `false` los dos y habrían escrito dos filas `CERRADO`.
- **Causa:** `spring.jpa.open-in-view` está en su valor por defecto (activo), así que el `EntityManager` de la request es el mismo en la resolución del comercio activo y en el servicio. Hibernate no pisa el estado de una entidad ya administrada con el resultado de una consulta; solo aplica el bloqueo.
- **Qué hacer:** tomar la entidad con `findById` y llamar a `entityManager.refresh(entidad, LockModeType.PESSIMISTIC_WRITE)`, que emite el `SELECT ... FOR UPDATE` y vuelve a hidratar el estado con lo último confirmado (patrón de `CierreComercioService.bloquearComercio`, ya usado en `PedidoService`). Calcular la hora de la operación **después** del bloqueo: si se calcula antes, una transacción que esperó puede escribir una `fecha_hora` anterior a la fila previa. Probado con `CierreComercioIntegrationTest` y con `stress-locks-tramoC1.mjs`.
- **`@DynamicUpdate` en `Comercio`:** sin él, un `save` de una entidad que se leyó sin bloqueo (por ejemplo `editarPerfil`) escribe todas las columnas, incluida `cerrado_manualmente` con el valor viejo, y pisa un cierre confirmado en el medio. Con él solo se escriben las columnas que cambiaron. `CierreComercioIntegrationTest.unSaveConUnaEntidadCargadaAntesDelCierreNoPisaLaBandera` falla si se quita la anotación.
- **Proyección nativa con `LOCK IN SHARE MODE`:** `ComercioRepository.leerEstadoConBloqueoCompartido` devuelve una interfaz (`EstadoYCierreComercio`) con alias en la consulta nativa; el `tinyint(1)` se convierte bien a `boolean`. MariaDB 10.4 no entiende el `FOR SHARE` que genera Hibernate, de ahí la consulta nativa (ver la entrada del tramo 5).

### El bloqueo de cuenta del login y el cierre manual se cruzaban en deadlock (tramo C2)

- **Síntoma:** `stress-locks-tramoC2.mjs`, escenario 2 (tres intentos fallidos del Dueño contra `cerrar`/`abrir` del mismo comercio): 19 de 48 logins respondían `500` (`Deadlock found when trying to get lock`) y, cuando perdían dos, el comercio quedaba en `APTO_VENTA` con el Dueño bloqueado. Venía desde el C1 (el bloqueo ya actualizaba los comercios), solo que ningún test lo cruzaba.
- **Causa:** el login toma la fila del `usuario` con `FOR UPDATE` y después escribe el comercio (usuario → comercio). `cerrar` tomaba el comercio con `FOR UPDATE` y después insertaba la fila de `historial_cierre_comercio`, cuya clave foránea `actor_usuario_id` pide bloqueo compartido sobre el `usuario` (comercio → usuario). Ciclo clásico de dos transacciones.
- **Regla:** quien va a escribir una fila con clave foránea a un usuario **y** a bloquear otra fila toma primero el usuario (`UsuarioRepository.leerIdConBloqueoCompartido`, consulta nativa `LOCK IN SHARE MODE`) y recién después la otra. La que llega segunda espera a que la primera termine; si ganó el bloqueo de cuenta, el comercio ya no es operativo y el cierre da `409`. La reapertura automática (`SISTEMA`, sin usuario) no lo necesita.
- **Comportamiento conocido, no se corrige (decisión del tramo C3):** cualquier otra transacción que tome un comercio `FOR UPDATE` y después escriba algo con clave foránea al usuario del Dueño (la suspensión de un comercio por el Administrador, que notifica al Dueño) puede cruzarse con el tercer intento fallido de ese mismo Dueño. La ventana es de milisegundos y nunca apareció en el estrés; el arreglo sería el mismo (tomar el usuario antes).

### Bloquear todos los comercios del Dueño en el bloqueo de cuenta no es la solución (tramo C2)

- Lo pedía la intención de "decidir con lo último confirmado" y está documentado como trampa en la entrada del tramo 2A: una lectura `FOR UPDATE` de todos los comercios del Dueño espera la fila de un comercio pendiente que la aprobación ya tiene mientras la aprobación espera el `usuario` (que el login tiene bloqueado) para la notificación.
- **Qué se hace en cambio** (`ComercioService.cerrarTemporalmentePorBloqueoDeCuenta`): los candidatos salen de una lectura común (foto) y cada uno se vuelve a leer con `refresh` + `PESSIMISTIC_WRITE` por clave primaria. Un `APROBADO` de la foto entra como candidato por si una vinculación de Mercado Pago lo acaba de pasar a `APTO_VENTA`; un `APTO_VENTA` de la foto que una desvinculación acaba de pasar a `APROBADO` no se toca. Nunca se bloquea un comercio pendiente. El escenario 5 del estrés (aprobar un comercio pendiente contra el bloqueo) lo confirma sin deadlocks.

### Dos confirmaciones simultáneas del mismo código de recuperación restauraban dos veces (tramo C2)

- **Síntoma:** escenario 4 del estrés: tres `POST /auth/recuperar-password/confirmar` en paralelo con el mismo código respondían `200` las tres y cada comercio del Dueño recibía tres filas `CERRADO_TEMPORALMENTE → APTO_VENTA` (historial con la cadena rota).
- **Causa:** `confirmarRecuperacionPassword` leía el código pendiente con una lectura común: las tres transacciones lo veían pendiente antes de que la primera lo marcara usado.
- **Arreglo:** tomar primero la fila del usuario con `findByEmailConBloqueo` (mismo patrón y mismo orden que el login). La segunda y la tercera esperan, encuentran el código usado y responden `401` "Código incorrecto o vencido". Si el email no existe no hay fila que bloquear y sigue el mismo error genérico. **El mismo defecto estaba en `confirmarReactivacionCuenta`** (restaura los comercios `INACTIVO` con el mismo patrón) y se corrigió en el tramo C3 con el mismo arreglo (ver la entrada "Reactivación de cuenta: la confirmación también se serializa por usuario").

### Reactivación de cuenta: la confirmación también se serializa por usuario (tramo C3)

- **Síntoma esperado (mismo que el de la recuperación, tramo C2):** tres `POST /auth/reactivar-cuenta/confirmar` simultáneos con el mismo código respondían `200` y restauraban los comercios `INACTIVO` varias veces, con filas de historial duplicadas.
- **Arreglo:** `AuthService.confirmarReactivacionCuenta` toma primero la fila del usuario (`findByEmailConBloqueo`, `SELECT ... FOR UPDATE`) y recién después lee el código. La segunda y la tercera esperan, encuentran el código usado y responden `401`; hay una sola restauración y una sola fila `INACTIVO → APTO_VENTA` (o `APROBADO`) por comercio. Medido con el escenario 1 de `stress-locks-tramoC3.mjs` (12 rondas, tres confirmaciones simultáneas: siempre `200,401,401`).
- **Tests:** `AuthServiceBloqueoComercioTest` (el bloqueo de fila va antes de leer el código, con `inOrder`), `BloqueoVigenteIntegrationTest` (una segunda confirmación da `401` y el historial queda en una fila) y el spec `34`.

### Regla del bloqueo vigente: leer el estado del Dueño con bloqueo antes de la cuenta de cobro y el comercio (tramo C3)

- **Regla de negocio:** con la cuenta del Dueño `BLOQUEADO`, ningún camino puede dejar un comercio en `APTO_VENTA`. La aprobación del Administrador (con cuenta de Mercado Pago activa) y la vinculación de Mercado Pago (sobre los `APROBADO`) dejan el comercio en `CERRADO_TEMPORALMENTE`; un comercio que no llegaría a `APTO_VENTA` (un `APROBADO` sin cuenta de cobro) no cambia. Al desbloquear, la restauración de siempre lo pasa a `APTO_VENTA`/`APROBADO` según la cuenta activa.
- **Orden de bloqueo ampliado:** `usuario` → `cuenta_mercado_pago` → `comercio` → tablas hijas. `ComercioService.duenoBloqueadoConBloqueo` lee el estado con una consulta nativa `LOCK IN SHARE MODE` (`UsuarioRepository.leerEstadoConBloqueoCompartido`; devuelve lo último confirmado, no la foto de la transacción) y los tres llamadores la invocan **antes** de tomar la cuenta: `AdministradorService.resolverAprobacion` (solo al aprobar), `MercadoPagoOAuthService.procesarCallback` y el atajo de test `TestSupportService`. `ComercioService.activarAptoVenta` recibe el resultado como parámetro (no lo relee) para que nadie pueda olvidar el orden.
- **Por qué antes y no dentro de `activarAptoVenta`:** una lectura tardía del usuario (con la cuenta o el comercio ya bloqueados) vuelve a poner un bloqueo "hacia atrás". En InnoDB un pedido de bloqueo compartido que llega detrás de un `FOR UPDATE` ya en espera se encola, así que una vinculación con la cuenta bloqueada que pidiera el usuario tarde podría formar el ciclo aprobación → vinculación → login → aprobación. Es razonamiento sobre el orden de la cola; no se reprodujo, se evitó. Con la lectura al principio, además, desaparece la forma del deadlock documentado en el tramo 2A (la aprobación con el comercio bloqueado esperando el `usuario` para la notificación): ahora la aprobación ya tiene el `usuario` compartido cuando llega a la notificación.
- **Historial coherente:** la aprobación con el Dueño bloqueado deja dos filas (`PENDIENTE → APROBADO` del Administrador y `APROBADO → CERRADO_TEMPORALMENTE` automática, motivo "Bloqueo de cuenta vigente al aprobar"); la vinculación deja una (`APROBADO → CERRADO_TEMPORALMENTE`, "Bloqueo de cuenta vigente al vincular Mercado Pago"). No se escribe el paso intermedio por `APTO_VENTA` porque el comercio nunca estuvo ahí; la cadena (cada fila sale de donde terminó la anterior) se mantiene.
- **Cruce con el login:** el bloqueo por intentos fallidos toma el `usuario` con `FOR UPDATE`, y su lectura común posterior (la sesión activa) establece la foto de la transacción **después** de esa espera, así que ve lo que la aprobación o la vinculación ya confirmaron y lo cierra; si gana el bloqueo de cuenta, la aprobación lo ve `BLOQUEADO`. En los dos órdenes el comercio termina en `CERRADO_TEMPORALMENTE`.
- **Medido con `stress-locks-tramoC3.mjs`** (12 rondas por escenario): aprobaciones contra el bloqueo, vinculación contra el bloqueo, las tres cosas a la vez sobre el mismo Dueño, y un control con el Dueño activo (tres aprobaciones simultáneas siempre terminan `APTO_VENTA` con las dos filas de siempre). Invariante revisada en cada ronda con una consulta sobre toda la base: ningún comercio `APTO_VENTA` con el Dueño `BLOQUEADO`. Sin ningún `5xx` ni deadlock.


### Aceptar una invitación: insertar y capturar el choque, no leer con `FOR UPDATE` una fila que puede no existir (tramo E1, bloque A3)

- **Riesgo:** un `SELECT ... FOR UPDATE` por una clave que todavía no existe toma, bajo `REPEATABLE READ`, un bloqueo de intervalo (gap lock) y no uno de registro. Dos aceptaciones simultáneas de personas distintas toman el mismo intervalo de `empleado` o de `empleado_comercio` (el índice único `uq_empleado_comercio`) y después las dos insertan en él: cada una espera el intervalo de la otra y la base responde interbloqueo (`1213`). Con la tabla vacía, todas las altas caen en el mismo intervalo.
- **Arreglo:** `EmpleadoInsercionRepository` inserta por JDBC y captura `DuplicateKeyException` ("insertar y, si ya existe, no hacer nada"). Solo cuando el `INSERT` chocó se lee la fila existente con `FOR UPDATE`, ya por clave exacta (bloqueo de registro, sin intervalo) para reactivarla. Un `INSERT` duplicado por JDBC revierte únicamente su sentencia; un `save` de JPA marcaría la transacción como rollback-only (mismo motivo que `TokenInsercionRepository` e `InvitacionInsercionRepository`).
- **Detalle:** antes de insertar por JDBC hay que vaciar el contexto de persistencia (`flush`): `persona_fisica` y `cliente` tienen id asignado y Hibernate los escribe recién al vaciar, y `empleado` tiene una clave foránea hacia ellos.
- **Dos aceptaciones del mismo invitado en comercios distintos** se serializan por la fila de `usuario` del invitado (`FOR UPDATE`, tomada antes que las invitaciones), de modo que la segunda ve la fila de `empleado` que creó la primera sin necesitar ninguna lectura con bloqueo de una fila ausente.

### Leer antes de bloquear con proyecciones, no con entidades (tramo E1, bloque A3)

- Aceptar necesita conocer al Dueño antes de bloquear las invitaciones (el orden es `usuario` primero), así que lee las pendientes del email sin bloqueo. Esa lectura previa devuelve una proyección (`InvitacionPendienteVista`) y el id del invitado (`UsuarioRepository.findIdByEmail`), nunca entidades: una entidad ya cargada haría que la lectura posterior con `FOR UPDATE` devuelva la copia vieja del contexto de persistencia y no el estado confirmado (ver "Un `FOR UPDATE` por consulta no refresca una entidad que ya está cargada").
- Si entre la lectura previa y el bloqueo la invitación cambió (la reemplazó otra transacción), la rutina la trata como un código incorrecto en vez de bloquear filas fuera de orden.

### Un `409` de aceptar revierte todo, y por eso el estado del comercio se comprueba con la relación ya tocada (tramo E1, bloque A3)

- Solo `CodigoInvitacionInvalidoException` está en `noRollbackFor` de `validar` y `aceptar`: el contador de intentos tiene que sobrevivir al `401`. Cualquier otro error (`InvitacionNoAptaException`, `ConflictoDeNegocioException`, `ValidacionCamposException`) revierte la transacción completa, incluida la cuenta nueva ya escrita. Para respetar el orden de bloqueo `usuario` → invitaciones → `empleado_comercio` → `comercio`, el estado del comercio se lee con `LOCK IN SHARE MODE` después de tocar la relación, y un comercio no aceptable deshace las altas por rollback (la prueba `conElComercioEnUnEstadoNoPermitidoDa409YElRollbackNoDejaNadaConfirmado` lo verifica con datos confirmados de verdad; una prueba dentro de una transacción de test no puede, porque ve sus propias escrituras).

### El MariaDB local de test no tiene `STRICT_TRANS_TABLES` (tramo E1, bloque A3)

- **Síntoma:** un valor de `ENUM` inválido (por ejemplo un estado mal escrito en un `INSERT` por JDBC) se guarda como cadena vacía en vez de fallar.
- **Qué hacer:** no confiar en esa conducta ni en que "pasa en test". Verificar `SELECT @@sql_mode` en el servidor de producción (y en `bajonea_practicas3`) antes de desplegar: con el modo estricto un `INSERT` así falla. Los valores de `ENUM` de las altas por JDBC (`EmpleadoInsercionRepository`, `InvitacionInsercionRepository`) están escritos como literales o con `Enum.name()`, y los tests leen el estado de vuelta para detectarlo.

---

## Lista de despliegue

Pendientes que no son código y hay que revisar en cada entorno antes de contar con la función:

- **IP real detrás del proxy.** Sin `server.forward-headers-strategy` en `application-production.properties` (Railway), `request.getRemoteAddr()` es la IP del proxy: todos los clientes comparten el contador de `RateLimitPublicoFilter` (firma de fotos del registro y validar o aceptar invitaciones) y `Sesion.ip_origen` guarda la IP del proxy. Verificarlo en el entorno real antes de contar con el límite por IP. Decidido el 2026-10-06: queda acá, no se resuelve en el tramo E1.
- **`sql_mode` del servidor.** Ver la entrada de arriba: confirmar que el servidor de producción tiene el modo estricto.
- **Migraciones del rol Empleado.** `V29` (estado `ACTIVO`/`INACTIVO` de `empleado_comercio`) tiene que salir en el mismo release que el enum Java `EstadoEmpleadoComercio`; antes de aplicarla en un entorno con datos, confirmar con las consultas de la sección 13 de `docs/entregables-01-02/AUDITORIA-EMPLEADO-FASE1.md` que `empleado_comercio` no tiene filas con estados viejos.
- **Tope de 3 emails de regularización por destinatario.** El conteo y la escritura no están serializados entre Dueños distintos que inviten a la misma cuenta a la vez: el tope puede excederse en uno o dos envíos. Se acepta y no justifica un bloqueo (escenario S10 del estrés de E1).
- **Contraseñas en el environment de Postman.** `postman/Bajonea-Local.postman_environment.json` tiene 44 variables `*_password` con valor (10 `secret`, 34 `default`), todas de cuentas descartables que cada corrida crea y elimina. Antes de que el repositorio deje de ser privado hay que pasarlas a variables de entorno o dejarlas vacías (revisado el 2026-10-08, sin modificar el archivo).

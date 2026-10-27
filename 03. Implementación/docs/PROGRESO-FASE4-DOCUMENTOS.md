# Progreso — Fase 4: Documentos del comercio y nueva regla de "apto para venta"

Una línea por bloque. Estados: pendiente, en curso, hecho (pendiente de confirmación de Diego). Entrega A (backend, tests y documentación), entrega B (pantallas y spec `83` de UI) y verificación de cierre (2026-10-27, al final). Auditoría previa: `docs/AUDITORIA-FASE4-DOCUMENTOS.md`.

| Bloque | Estado | Detalle |
|---|---|---|
| Paso 0 — muestra de `practicas3` | hecho (2026-10-26) | Backups en `datos-prueba/backups/` (no commitear; la carpeta ya está en el `.gitignore` de la raíz). Los comercios 2 a 12 y 14, que se habían pasado a `APTO_VENTA` sin cuenta de Mercado Pago para la muestra del CENT 35, volvieron a `APROBADO` por ids explícitos (evidencia: historial "Habilitacion para demo…" y el `rollback.sql` del script). Antes: 13 `APTO_VENTA`, 5 `APROBADO`. Después: 1 `APTO_VENTA` (Pizzería Popular), 17 `APROBADO`; "Usuariotest" sigue `SUSPENDIDO`. `bajonea_final` intacta |
| Paso 1 — `V43` | hecho | Tablas `documento_comercio` y `documento_comercio_archivo` y cuatro tipos de aviso nuevos; no cambia el estado de ningún comercio. Aplicada en `bajonea_test` y en `practicas3` (Flyway `success = 1`; en `practicas3` Flyway aplicó también `V42`, que estaba pendiente). `max_allowed_packet` local 1 MB (se subió a 64 MB en caliente para las pruebas); multipart de Spring 16 MB por archivo y 17 MB por pedido (desvío explicado en `docs/DECISIONES.md`); recordatorio de despliegue en `docs/LISTA-DE-DESPLIEGUE.md` |
| Paso 2 — `AptitudVentaComercioService` | hecho | Una sola clase decide `APTO_VENTA`; reemplaza `activarAptoVenta` (dos formas), `desactivarAptoVenta`, `cerrarTemporalmentePorBloqueoDeCuenta` y la restauración de `AuthService` (cierra el hueco A: la cuenta de Mercado Pago se leía sin bloqueo al restaurar). `MotivoRecalculo` con `SUSPENSION_LEVANTADA` como enganche. Orden de bloqueo documentado en `docs/CONCURRENCIA-Y-TRANSACCIONES.md` |
| Paso 3 — endpoints | hecho | Dueño: `GET/POST /comercios/documentos`, `GET /requisitos`, `DELETE /{id}`, `GET /{id}/archivo`. Administrador: `GET /documentos/pendientes`, `GET /comercios/{id}/documentos`, `GET /documentos/{id}/archivo`, `PUT /documentos/{id}/resolver`, y `documentosPendientes` en las métricas. Rutas del Dueño fuera de `DelegacionEmpleado`, clasificadas como exclusivas en `ClasificacionRutasComercioTest`. Siete códigos de error estables |
| Paso 4 — tests | hecho | Ver el detalle abajo |
| Paso 5 — documentación | hecho | Diccionario v1.28; `docs/entregables-fase4/` con los cambios a requisitos e historias (listos para copiar) y la nota para la Política de Privacidad; `CONCURRENCIA-Y-TRANSACCIONES.md`, `LISTA-DE-DESPLIEGUE.md`, `APRENDIZAJES-TECNICOS.md`, `DECISIONES.md` y `CLAUDE.md` |

## Pruebas (entrega A)

**Java.** 137 tests nuevos: `AptitudVentaComercioServiceTest` (70: la tabla de verdad de la regla, las transiciones y el orden de los bloqueos), `DocumentoComercioAptitudIntegrationTest` (16: los escenarios de la sección 3.4 de la auditoría con el motor real), `DocumentoComercioHttpIntegrationTest` (28: contrato, firma de bytes, tamaño, cupos, estados que permiten subir, cabeceras del archivo, 404 de lo ajeno, Cliente/Empleado/Administrador/sin sesión, bandeja, métricas), `DocumentoComercioConcurrenciaIntegrationTest` (10 carreras y regresiones de bloqueo), `FirmaArchivoTest` (5), `TamanoLegibleTest` (2), `GlobalExceptionHandlerDocumentosTest` (4) y 2 en `EnumsContraBaseDeDatosIntegrationTest`. Se reescribieron o recortaron los tests que fijaban los métodos reemplazados (`AdministradorServiceResolucionTest`, `AuthServiceBloqueoComercioTest`, `ComercioServiceBloqueoVigenteTest`, `ComercioServiceCatalogoPublicoTest`, `MercadoPagoOAuthServiceDesvinculacionTest`, `BloqueoComercioIntegrationTest`, `AuthServiceColisionCodigoTest`). `mvnw test` en las dos pasadas documentadas: **1348 + 6, sin fallas** (base `bajonea_test` recién reseteada y el backend de pruebas detenido; pico de 67 conexiones a MariaDB).

**Carreras reales (solo las de dos actores distintos; el Administrador es uno solo).** Dos y tres subidas a la vez con 4 y 5 en revisión (con y sin cuenta de Mercado Pago), ocho subidas a la vez (nunca más de 5), el Dueño elimina un pendiente mientras el Administrador lo aprueba (con y sin cuenta), desvincular Mercado Pago contra aprobar el último documento, vincular contra aprobar, subir contra revocar el único aprobado, desvincular Mercado Pago mientras otra transacción tiene el usuario del Dueño exclusivo (determinista) y vincular con un comercio confirmado después de abrir la transacción.

**Defectos reales que encontró el estrés y se corrigieron (con regresión y mutación propias).** (1) `desvincular` no tomaba el usuario del Dueño antes que la cuenta y los comercios; con el aviso nuevo de pérdida de aptitud se interbloqueaba con un bloqueo de cuenta (36 `Deadlock found` en el estrés `c2`). (2) `recalcularComerciosDelDueno` usaba `refresh` común y bajo `REPEATABLE READ` no veía un comercio confirmado después de abrir la transacción (`EntityNotFoundException`, `500` en el estrés `2a`). Detalle en `docs/DECISIONES.md` y `docs/CONCURRENCIA-Y-TRANSACCIONES.md`.

**Newman.** Carpeta `79` (`build-documentos-fase4-postman.mjs`, siempre la última): 74 requests definidos (76 ejecutados: la colección hace un `GET /comercios/mis-comercios` extra tras cada login de Dueño), 113 assertions, 0 fallas, dos vueltas seguidas. Sube archivos reales (`fixtures/`), así que `correr-newman.mjs` pasa `--working-dir testing/playwright`. Corrida completa de la colección sobre base reseteada: **3819 requests, 5902 assertions, 0 fallas** (en una primera corrida falló una aserción de la carpeta 49, `[T4A] notificaciones con header B`, que esperaba que todo aviso del comercio B fuera de un pedido; ahora también llega el aviso de aptitud de venta y el constructor `build-multicomercio-tramo4a-postman.mjs` lo contempla).

**Playwright.** Spec `82` (API, 19 tests). Corrida completa: **1265 pasaron y falló 1**, el inestable conocido `27:497` (pasó 2 de 3 veces al repetirlo aislado). El spec de UI `83` es de la entrega B.

**Estrés.** `stress-locks-tramoDocumentos.mjs` (id `documentos` del runner, 5 escenarios por HTTP, 6 rondas: cupo con y sin cuenta, baja contra aprobación, Mercado Pago contra aprobación, bloqueo de cuenta contra aprobación, revocación contra subida, más las invariantes finales): sin `5xx`, sin interbloqueos. Corrida completa del runner (24 scripts, sin `carrito`, que pide el stub de Mercado Pago): **todos OK, 0 `Deadlock found` y 0 `Lock wait timeout`**, 54,9 min.

**Mutaciones.** 18 mutaciones manuales sobre el módulo nuevo (corrida con un script temporal que cambia una línea, corre las pruebas del módulo y restaura el archivo). **17 detectadas.** M17 sacar el usuario compartido de `desvincular` (la detecta el test determinista de interbloqueo) y M18 `refresh` común en `recalcularComerciosDelDueno` (la detecta el test del comercio confirmado después de abrir la transacción), ambas nacidas de defectos reales que encontró el estrés (ver más abajo). M1 entrar a `APTO_VENTA` sin exigir cero pendientes; M2 regla estricta (seguir vendiendo también exige cero pendientes); M3 la cuenta bloqueada no impide quedar a la venta; M4 exigencia apagada ignorada; M6 cuenta de Mercado Pago leída sin bloqueo; M7 sin límite de tamaño; M8 la baja no verifica el comercio del documento; M9 se puede eliminar un documento resuelto; M10 se puede subir con el comercio en cualquier estado; M11 sin cupo de revisión; M12 el tipo se acepta sin mirar los bytes; M13 un rechazado se vuelve a resolver; M14 aprobar sirve sobre cualquier estado; M15 rechazar no recalcula la aptitud; M5b sin bloqueo del comercio (detectada por dos tests nuevos, ver abajo). **Dos sobrevivieron al principio:** M5 (sin el bloqueo del comercio al subir) sobrevivía porque mis pruebas de carrera tenían siempre cuenta de Mercado Pago activa, y esa fila ya serializa; se agregaron dos tests sin cuenta (`sinCuentaDeMercadoPago…`) y M5b ahora se detecta. **Una sobrevive a propósito:** M16 (leer el documento sin `FOR UPDATE` al resolver) no rompe nada porque todo escritor de documentos ya tiene el comercio bloqueado; es defensa en profundidad, está en el código y documentada en `CONCURRENCIA-Y-TRANSACCIONES.md`. Además, la primera corrida del estrés dio interbloqueos reales porque el backend corría la clase mutada (ver `docs/APRENDIZAJES-TECNICOS.md`): confirma que la ausencia del bloqueo del comercio sin cuenta de Mercado Pago es observable por HTTP.

## Hallazgos fuera de alcance (anotados, no arreglados)

1. **Búsqueda global de productos vs. catálogo de comercios (confirmado: sigue igual).** `ProductoService.listarCatalogoGlobal` y `listarFiltrosDisponibles` (líneas 211 y 260) ven solo `APTO_VENTA`; el listado de comercios incluye también `CERRADO_TEMPORALMENTE`. Un comercio cerrado por el bloqueo de su Dueño sigue en el catálogo de comercios pero sus productos no aparecen en la búsqueda global.
2. **Aviso del panel desactualizado hasta la entrega B.** El panel del Dueño decía "Vinculá Mercado Pago para empezar a vender" para todo comercio `APROBADO`; lo reemplazó el bloque "Para empezar a vender" de la entrega B.
3. **Dos corridas completas de Java sin resetear la base chocan** con el nombre único de comercio (`Segundo comercio A4`, etc.). Resetear `bajonea_test` entre corridas completas. Y la suite de Java sin pasada especial deja `Too many connections` con el backend de pruebas levantado: se redujo `minimum-idle` del pool en el perfil de prueba (`application-test.properties`; el pico pasó de 152 a 66 conexiones).
4. **El árbol de trabajo mezcla la Fase 3 (sin commitear) con esta entrega**: ver el plan de commits al final.
5. **Newman completo necesita base reseteada**: después de Playwright el resumen JSON de Newman desbordó la longitud máxima de una cadena. Se corrió sobre una base recién reseteada.

## Entrega B — pantallas y tests de UI (2026-10-26; hecha, pendiente de la confirmación de Diego)

| Bloque | Estado | Detalle |
|---|---|---|
| Panel del Dueño: "Para empezar a vender" | hecho | `js/pasos-vender.js`. Lista de pasos con tilde, número, reloj (documento en revisión) o alerta (documento rechazado); se muestra solo al Dueño y con el comercio `APROBADO`. El estado "Todo listo" ("Tu comercio ya puede recibir pedidos.") se muestra una sola vez, cuando un comercio que el Dueño había visto incompleto pasa a `APTO_VENTA` (marca en `localStorage`), y después desaparece. Reemplaza al aviso viejo: la hoja "Tus comercios" ahora dice "Te faltan pasos para empezar a vender" con "Ver pasos" (spec `29` actualizado) |
| Pantalla "Documentación" | hecho | `comercio-documentacion.html` + `js/documentos.js`; fila "Documentación" en el perfil del Dueño (el Empleado no la tiene y la ruta directa lo manda al panel). Rechazados, en revisión y aprobados; estado vacío; cupos con explicación |
| Hoja "Subir documento" | hecho | Validación de formato y tamaño en el cliente, "Subiendo…" sin doble envío, errores del servidor con qué hacer, confirmación de descarte, foco devuelto |
| Visor | hecho | `js/documentos-comun.js`: `fetch` con `Authorization` a un blob (nunca un token en la URL), URL del objeto liberada al cerrar, imagen o `iframe` para PDF, "Abrir en pestaña nueva", motivo y "Subir uno nuevo" en los rechazados |
| Administrador | hecho | Tarjeta "Documentos por revisar" en el panel, bandeja `admin-documentos.html`, revisión `admin-documento-revision.html` (aprobar con confirmación, rechazar y revocar con motivo y contador, vista previa, otros documentos) y "Ver documentos" en el modal de cada comercio |
| Avisos del Dueño | hecho | Los cuatro tipos nuevos se leen con su texto y llevan a "Documentación" o al panel (`btn-ver-destino-notificacion-{id}`) |

**Cambios de backend que pidió la entrega B (aditivos, anotados porque la entrega A los dejaba fuera).** (1) `NotificacionResponseDTO.tipo`: la API no decía el tipo del aviso y sin él no se podía enlazar cada uno. (2) `DocumentoPendienteAdminResponseDTO.cuentaMercadoPagoVinculada` (una subconsulta en la bandeja): la revisión tiene que mostrar si el comercio tiene Mercado Pago. (3) `server.tomcat.max-swallow-size=32MB` (en la entrega B se puso 100MB; se bajó a 32MB en el cierre): **defecto real que encontró el spec**: con un archivo de más de 17 MB (el tope duro) el servidor respondía el `400` con el tamaño, pero Tomcat cortaba la conexión (descarta como máximo 2 MB del cuerpo restante) y el navegador solo veía `ERR_CONNECTION_RESET`, es decir, un "No pudimos conectarnos" sin explicación. Con la propiedad el navegador recibe el mensaje claro. (4) `Caddyfile`: `frame-src` suma `blob:`; sin eso el CSP bloquearía el PDF del visor en producción.

**Otros cambios.** `apiFetch` acepta `FormData` y suma las opciones `comoBlob` y `timeoutMs` (la subida usa 3 minutos en lugar de los 15 s generales, que habrían redirigido a la pantalla de timeout con un archivo grande en una conexión lenta). `comercios/documentos` entra en `RUTAS_DEL_DUENO` de `js/api.js` (manda `X-Comercio-Id`).

**Pruebas (entrega B).** Spec `83` (UI, 30 tests, a 375 px): los tres momentos del bloque y sus variantes (Vincular ahora, rechazado, pérdida de aptitud, aviso de la hoja de comercios, Empleado), pantalla vacía, subir (éxito con `Subiendo…`, doble clic con una sola subida, "Otro" con descripción, tamaño, formato, ejecutable disfrazado, más de 16 MB que llega al servidor), agrupación por estado con los `aria-label`, eliminar (con confirmación y con el documento ya resuelto), cupo de 5, descarte, visor de imagen y de PDF, visor de rechazado, avisos, y del Administrador el panel, la bandeja (orden y antigüedad, vacía y con error), la revisión (aprobar, rechazar, revocar, conflicto, sin documentos). Verifica sin scroll horizontal, objetivos táctiles de al menos 44 px, foco devuelto y que la URL no lleva token. **Chromium: 30/30. WebKit (iPhone 13 emulado, `playwright.webkit.config.ts`): 30/30.** Playwright completo en Chromium: **1295 pasaron y falló 1**, el inestable conocido `27:497` (pasó 1 de 3 al repetirlo aislado). 32 capturas en `docs/capturas-documentos/`.

**Hallazgos fuera de alcance de la entrega B (anotados, no arreglados).** (1) El visor de PDF depende del visor del navegador: en Safari de iPhone suele mostrar solo la primera página, por eso la pantalla ofrece "Abrir en pestaña nueva" (probar en un iPhone real). (2) La búsqueda global de productos sigue sin tocarse, como se pidió. (3) La línea de Mercado Pago de la revisión del Administrador: ver el punto 3 de la verificación de cierre.

## Verificación de cierre (2026-10-27; sin funcionalidades nuevas)

La entrega B había tocado backend (`tipo` en `NotificacionResponseDTO`, `cuentaMercadoPagoVinculada` en la bandeja, `max-swallow-size`) y el `Caddyfile` sin una pasada completa de Java, Newman ni estreses. Esta pasada la cierra. Todo contra `bajonea_test` recién reseteada, con el backend de pruebas levantado con `max-swallow-size=32MB`.

| Verificación | Resultado |
|---|---|
| `mvnw test` completo (dos pasadas, ver `docs/APRENDIZAJES-TECNICOS.md`) | **1349 + 6, 0 fallas, 0 errores, `BUILD SUCCESS`** (la pasada 1 suma un test respecto de la entrega A: `NotificacionResponseDTOTest`) |
| Cobertura del campo `tipo` de las notificaciones | Nuevo `NotificacionResponseDTOTest` (serializa el DTO y comprueba `tipo` y `entidadId` en el JSON); `NotificacionesPorComercioIntegrationTest` ahora afirma que todo aviso listado por el servicio trae `tipo`; carpeta `79` de Newman: `Todos los avisos exponen su tipo` en las dos consultas de avisos del Dueño y `cuentaMercadoPagoVinculada` en la bandeja del Administrador; el spec `82` ya lo cubría |
| Newman, colección completa | **3819 requests, 5904 assertions, 0 fallas** (617 s; 2 assertions más que en la entrega A, las nuevas de la carpeta `79`) |
| Estreses `documentos`, `a4` (avisos con fan-out), `c1`, `c2`, `c3` (cierre y bloqueo de cuenta, aptitud), `2a` (alta adicional) y `5a` (Mercado Pago, desvinculación) | **7/7 OK, 11,7 min; 0 `Deadlock found` y 0 `Lock wait timeout`** en el log del backend durante toda la sesión (estreses y Newman). No se corrió el dashboard del Administrador porque ningún estrés lo ejerce y las métricas no escriben |
| Playwright, specs `82`, `83` y `29` (64 tests) | **WebKit 64/64.** Chromium 63/64 en la primera corrida: falló `29:428` (`un valor desconocido no muestra ningún aviso...`), una carrera del propio test (leía `page.url()` sin esperar a que el frontend limpiara el parámetro `vinculacionMp`); pasó 10/10 aislado y se corrigió con `await expect.poll(...)` (spec `29` ahora **15/15 en Chromium y 15/15 en WebKit**). Los tests de documentos (`82` y `83`) pasaron todos en ambos navegadores, incluido el de más de 16 MB |

**1. `max-swallow-size`.** Bajado de `100MB` a `32MB` (`application.properties`, `CLAUDE.md`, `docs/DECISIONES.md`). Con 32 MB el test de 17,5 MB del spec `83` (`si un archivo de más de 16 MB llega al servidor, la pantalla muestra el mismo mensaje claro de tamaño`) sigue mostrando "El archivo pesa 17,5 MB y el máximo es 8 MB", en Chromium y en WebKit; no hay otro test de ese rango en el spec `82` ni en Java. Por encima de 32 MB la conexión se corta igual, pero el cliente no deja enviar nada mayor a 8 MB.

**2. `Content-Security-Policy` del `Caddyfile`.** El visor usa `<img>` con una URL `blob:` (imagen) e `<iframe>` con una URL `blob:` (PDF); no usa `<embed>` ni `<object>`. `img-src` ya incluía `blob:` (de antes, para los previews de foto) y `frame-src` lo suma esta entrega; `default-src 'self'` queda como respaldo y `object-src 'none'` no aplica a un `iframe`. **No hizo falta corregir nada.** Para no quedarnos con la lectura de la política, se la probó con la cabecera exacta del `Caddyfile` (servidor local con esa misma política) en el navegador integrado (Chromium con visor de PDF): el PDF servido como `blob:` en un `iframe` se renderiza en el visor y una imagen `blob:` se carga, sin violaciones del CSP. Límite de tamaño del cuerpo: el `Caddyfile` **no tiene ninguno** (ni `request_body` ni `max_size`), solo lo reporto.

**3. Línea de Mercado Pago en la revisión del Administrador (sin cambiar).** El endpoint de documentos por comercio (`GET /administrador/comercios/{id}/documentos`) devuelve solo la lista de documentos (`List<DocumentoComercioResponseDTO>`), sin ningún dato de Mercado Pago, y el listado de comercios del Administrador tampoco lo trae. Mostrarlo siempre exigiría ampliar la respuesta de ese endpoint (hoy una lista simple) o sumar un campo a `ComercioAdminResponseDTO`, es decir, tocar backend: **se dejó como está** y queda anotado. Hoy la pantalla de revisión muestra "Mercado Pago: vinculado/sin vincular" solo cuando el comercio tiene documentos en revisión (viene de la bandeja); al revocar un aprobado de un comercio sin pendientes esa línea no aparece.

**4. Documentos.** `docs/LISTA-DE-DESPLIEGUE.md` tiene la subsección "Documentos del comercio, entrega B: qué hay que desplegar y probar" (cambio del `Caddyfile`, `max_allowed_packet` de al menos 16 MB a verificar con Don Web, `max-swallow-size=32MB` y el visor de PDF de iPhone para probar en un iPhone real).

**No pude confirmar.** El visor de PDF en un iPhone real (WebKit emulado pasa, pero no equivale); el comportamiento de `max_allowed_packet` en el servidor de Don Web; el `Caddyfile` modificado en el despliegue real (se probó la política, no el servidor Caddy en sí); y el estado del resto de los estreses, que no se corrieron (se corrieron los 7 que tocan lo modificado).

## Plan de commits (2026-10-27; no se ejecutó nada: ni `add`, ni `commit`, ni `reset`, ni `restore`)

Armado con `git status --short` y clasificando cada hunk de los 65 archivos modificados. Todos los comandos se corren desde `03. Implementación` (el repo vive un nivel arriba).

**Qué hay en el árbol.** (1) Residuo de documentación de la Fase 2 (T1 a T5) que nunca se commiteó: `CLAUDE.md` y las copias de análisis (`01. Análisis de Requerimientos` y `02. Diseño`, 9 archivos). `docs/DECISIONES.md` y `docs/diccionario-de-datos.md` **no** tienen residuo (HEAD ya trae la v1.26): lo que difieren es solo Fase 3 (v1.27) y Fase 4 (v1.28). (2) Fase 3 (direcciones), entregas A y B. (3) Fase 4 (documentos), entregas A y B y esta verificación. (4) Lo que no debe entrar: `datos-prueba/backups/`, `testing/playwright/tmp-capturas/` (34 MB de capturas viejas del tramo multi-comercio 3B) y `backend/run-local.ps1` (script local).

**`.gitignore`.** `datos-prueba/backups/` **ya está ignorado**: el `.gitignore` de la raíz del repo tiene la línea `03. Implementación/datos-prueba/` (carpeta entera) y `git ls-files datos-prueba` no devuelve nada, es decir que ningún archivo de esa carpeta está trackeado. No hace falta agregar nada para eso. Para lo otro, dos líneas al final del `.gitignore` de la raíz:

```
03. Implementación/testing/playwright/tmp-capturas/
03. Implementación/backend/run-local.ps1
```

**Cómo separar un hunk mezclado.** En `git add -p`, `s` parte el hunk donde haya líneas de contexto; si todo es contiguo (`+` seguidos) usá `e`, que abre el hunk en el editor: para *no* agregar una línea `+`, borrala. Los hunks se reconocen por su primera línea. Antes de empezar, `git diff -U0 -- <archivo>` muestra los mismos hunks.

### Commit 0 — documentación residual de la Fase 2

```bash
cd "03. Implementación"
git add "../01. Análisis de Requerimientos" "../02. Diseño"
git add -p CLAUDE.md
git commit -m "docs(fase2): memoria de proyecto de los tramos T1 a T5 y copias de análisis con requisitos, historias y diccionario"
```

Hunks de `CLAUDE.md` (numeración de `git diff -U0`):

| Hunk | Primera línea | Va en |
|---|---|---|
| 1 | `+- **Registro de Comercio, Tramo 1 ...` (nueve líneas: Registro de Comercio, T1 a T5, Fase 3 y Fase 4 juntas) | `e`: acá las de Registro de Comercio y T1 a T5; las de "Fase 3" y "Fase 4" no se agregan |
| 2 | `+**Componentes del cierre de turno (Fase 2, T4).**` | este commit |
| 3 | `-9. **Direccion** — modelo completo` | commit 3 (Fase 3) |
| 4 | `-17. **ItemCarrito**` y `-18. **Pedido**` | commit 3 (Fase 3) |
| 5 | `-23. **Horario**` | este commit |
| 6 | `+28. **CierreTurno**` (y `+29. **DocumentoComercio**`, `+30. ...`) | `e`: la 28 acá; la 29 y la 30 en el commit 7 |
| 7, 8, 9, 10 | `-- **Delegables (23 rutas`, `-**Endpoints agregados`, `-- **Pendientes del login`, `+- **Pendientes del cierre de turno` | este commit |

### Commit 1 — Fase 3: backend, migración y tests de Java

```bash
git add backend/src/main/resources/db/migration/V42__direccion_multiple_cliente.sql
git add backend/src/main/java/com/bajonea/backend/controllers/DireccionClienteController.java backend/src/main/java/com/bajonea/backend/dto/request/DireccionClienteRequestDTO.java backend/src/main/java/com/bajonea/backend/dto/response/DireccionClienteResponseDTO.java backend/src/main/java/com/bajonea/backend/dto/response/DireccionEntregaResponseDTO.java backend/src/main/java/com/bajonea/backend/services/DireccionClienteService.java
git add backend/src/main/java/com/bajonea/backend/entities/Direccion.java backend/src/main/java/com/bajonea/backend/entities/Pedido.java backend/src/main/java/com/bajonea/backend/repositories/DireccionRepository.java backend/src/main/java/com/bajonea/backend/dto/response/PedidoEmpleadoResponseDTO.java backend/src/main/java/com/bajonea/backend/dto/response/PedidoResponseDTO.java backend/src/main/java/com/bajonea/backend/services/ClienteService.java backend/src/main/java/com/bajonea/backend/services/PedidoService.java backend/src/main/java/com/bajonea/backend/services/ValidadorDatosNegocioComercio.java
git add -p backend/src/main/java/com/bajonea/backend/exceptions/ConflictoComercioException.java
git add backend/src/test/java/com/bajonea/backend/services/DireccionClienteConcurrenciaIntegrationTest.java backend/src/test/java/com/bajonea/backend/services/DireccionClienteIntegrationTest.java backend/src/test/java/com/bajonea/backend/services/DireccionClienteServiceTest.java backend/src/test/java/com/bajonea/backend/services/DireccionRepositoryIntegrationTest.java backend/src/test/java/com/bajonea/backend/services/PedidoSnapshotDireccionIntegrationTest.java backend/src/test/java/com/bajonea/backend/services/PedidoServiceConfirmarPedidoLockTest.java
git commit -m "feat(direcciones): direcciones múltiples del Cliente (V42), copia de la dirección en el pedido, cupo de cinco y una sola predeterminada"
```

`ConflictoComercioException.java` tiene dos hunks (el Javadoc y las constantes) y en ambos se mezclan las dos fases: con `e` dejá `DIRECCIONES_CUPO_MAXIMO` y `ULTIMA_DIRECCION` (y su `<li>`) y borrá las líneas `+` de `DOCUMENTO_*` y `COMERCIO_ESTADO_NO_PERMITE_DOCUMENTOS`. `ComercioServiceBloqueoVigenteTest.java` nombra `DireccionRepository` pero es de la Fase 4.

### Commit 2 — Fase 3: specs, Newman y estrés

```bash
git add testing/playwright/tests/80-direcciones-api.spec.ts testing/playwright/tests/81-direcciones-ui.spec.ts testing/playwright/scripts/build-direcciones-fase3-postman.mjs testing/playwright/scripts/stress-locks-tramoDirecciones.mjs
git add testing/playwright/tests/12-carrito-checkout-explorar.spec.ts testing/playwright/tests/38-empleado-acceso-ui.spec.ts testing/playwright/tests/63-registro-comercio-fase1-api.spec.ts
git add -p testing/playwright/scripts/correr-estreses.mjs
git commit -m "test(direcciones): specs 80 y 81, carpeta de Newman y estrés de las direcciones del Cliente"
```

`correr-estreses.mjs` tiene un hunk con dos líneas: con `e` dejá la de `id: 'direcciones'` y borrá la de `id: 'documentos'`. La colección y el environment de Postman **no** van acá (commit 6): son un solo JSON con la carpeta `78` (Fase 3) y la `79` (Fase 4).

### Commit 3 — Fase 3: frontend y documentación

```bash
git add frontend/js/direcciones.js frontend/perfil.html frontend/js/checkout.js frontend/js/cliente.js frontend/js/pedidos.js
git add -p frontend/js/comercio.js
git add -p frontend/css/styles.css
git add docs/AUDITORIA-FASE3-DIRECCIONES.md docs/MAPEO-ARCHIVOS-FASE3-DIRECCIONES.md docs/PROGRESO-FASE3-DIRECCIONES.md docs/capturas-direcciones docs/entregables-fase3
git add -p docs/DECISIONES.md docs/diccionario-de-datos.md CLAUDE.md
git commit -m "feat(direcciones): pantallas de Mis direcciones, selector de dirección en el checkout y referencia en los pedidos; documentación de la Fase 3"
```

- `frontend/js/comercio.js`: solo el hunk 3 (`+  if (pedido.tipoEntrega === 'DOMICILIO' && pedido.direccion && pedido.direccion.referencia) {`); los demás (`montarPasosParaVender`, `documentacion-link`) son de la Fase 4.
- `frontend/css/styles.css` es **un solo hunk** (+999 líneas desde la línea 6449): lo de la Fase 3 llega hasta la regla `.summary-card__body .referencia-entrega` (línea 6742 aprox.) y desde `.doc-resumen` (línea 6744 aprox.) todo es de la Fase 4. Con `e`, borrá las líneas `+` desde `.doc-resumen` hasta el final del hunk.
- `docs/DECISIONES.md`: hunk único; con `e` dejá la entrada `## 2026-10-24 — Fase 3, direcciones múltiples ...` y borrá las `+` de las entradas de la Fase 4 (`## 2026-10-26 ...` y el ajuste de la verificación de cierre).
- `docs/diccionario-de-datos.md`: en el primer hunk la línea `Versión del modelo` tiene que quedar en `1.27` (con la nota de la v1.27, no la de la v1.28); van acá los hunks de `Direccion` (índices, reglas del cupo, `Pedido.entrega_*`); `DocumentoComercio`, sus ENUM y los tipos nuevos de `Notificacion` son de la Fase 4.
- `CLAUDE.md`: los hunks 3 y 4 de la tabla del commit 0 (filas 9, 17 y 18 de §5) y, del hunk 1, las líneas "Fase 3".

### Commit 4 — Fase 4: backend, migración y tests de Java

```bash
git add backend/src/main/resources/db/migration/V43__documento_comercio.sql
git add backend/src/main/java/com/bajonea/backend/entities/DocumentoComercio.java backend/src/main/java/com/bajonea/backend/entities/DocumentoComercioArchivo.java
git add backend/src/main/java/com/bajonea/backend/enums backend/src/main/java/com/bajonea/backend/repositories/DocumentoComercioRepository.java backend/src/main/java/com/bajonea/backend/repositories/DocumentoComercioArchivoRepository.java
git add backend/src/main/java/com/bajonea/backend/config/DocumentacionComercioProperties.java backend/src/main/java/com/bajonea/backend/util backend/src/main/java/com/bajonea/backend/exceptions
git add backend/src/main/java/com/bajonea/backend/dto
git add backend/src/main/java/com/bajonea/backend/services backend/src/main/java/com/bajonea/backend/controllers
git add backend/src/main/resources/application.properties backend/src/main/resources/application-test.properties
git add backend/src/test
git commit -m "feat(documentos): documentos del comercio (V43) y regla única de APTO_VENTA (Mercado Pago más documento aprobado), endpoints del Dueño y del Administrador"
```

Después del commit 1, lo que queda en esas carpetas es solo de la Fase 4 (los `add` por carpeta son seguros). Para comprobarlo antes de commitear: `git diff --cached --stat | grep -i direccion` no debe mostrar nada. `application.properties` y `application-test.properties`: todos sus hunks son de la Fase 4 (multipart, `max-swallow-size`, documentos, `minimum-idle`). Por eso no hay un `git add backend/` entero: `backend/run-local.ps1` no entra.

### Commit 5 — Fase 4: frontend y spec de UI

```bash
git add frontend/admin-documento-revision.html frontend/admin-documentos.html frontend/comercio-documentacion.html frontend/js/admin-documentos.js frontend/js/documentos-comun.js frontend/js/documentos.js frontend/js/pasos-vender.js
git add frontend/Caddyfile frontend/admin-dashboard.html frontend/comercio-dashboard.html frontend/comercio-perfil.html frontend/js/admin.js frontend/js/api.js frontend/js/comercio.js frontend/js/notificaciones.js frontend/js/selector-comercio.js frontend/css/styles.css
git add testing/playwright/tests/83-documentos-comercio-ui.spec.ts testing/playwright/tests/29-multicomercio-tramo5-ui.spec.ts
git commit -m "feat(documentos): pantalla de Documentación del Dueño, revisión del Administrador, bloque Para empezar a vender y visor de PDF"
```

### Commit 6 — Fase 4: spec de API, Newman, estrés y fixtures

```bash
git add testing/playwright/tests/82-documentos-comercio-api.spec.ts testing/playwright/scripts/build-documentos-fase4-postman.mjs testing/playwright/scripts/stress-locks-tramoDocumentos.mjs testing/playwright/scripts/correr-estreses.mjs testing/playwright/scripts/correr-newman.mjs testing/playwright/scripts/build-multicomercio-tramo4a-postman.mjs
git add testing/playwright/tests/helpers/backend.ts testing/playwright/fixtures/documento-prueba.pdf testing/playwright/fixtures/ejecutable-renombrado.pdf
git add postman/Bajonea-MVP.postman_collection.json postman/Bajonea-Local.postman_environment.json
git commit -m "test(documentos): spec 82, carpeta 79 de Newman (con la 78 de direcciones), estrés de documentos y fixtures"
```

El environment de Postman suma 528 líneas de variables de cuentas descartables de las dos fases; antes de que el repo deje de ser privado hay que vaciar sus `*_password` (ver `docs/LISTA-DE-DESPLIEGUE.md`).

### Commit 7 — Fase 4: documentación y capturas

```bash
git add docs/AUDITORIA-FASE4-DOCUMENTOS.md docs/PROGRESO-FASE4-DOCUMENTOS.md docs/capturas-documentos docs/entregables-fase4
git add docs/APRENDIZAJES-TECNICOS.md docs/CONCURRENCIA-Y-TRANSACCIONES.md docs/DATA-TESTID-FASE17.md docs/LISTA-DE-DESPLIEGUE.md docs/DECISIONES.md docs/diccionario-de-datos.md CLAUDE.md
git commit -m "docs(documentos): auditoría, progreso, decisiones, concurrencia, despliegue y diccionario v1.28 de la Fase 4"
```

Como en los commits 0 y 3 ya entraron las partes de la Fase 2 y de la Fase 3 de `DECISIONES.md`, `diccionario-de-datos.md` y `CLAUDE.md`, el `git add` entero de acá trae lo que quedó, que es la Fase 4.

### Verificación

```bash
git status --short            # al final solo deben quedar tmp-capturas y run-local.ps1 (si no los ignoraste)
git diff --cached --stat      # antes de cada commit
```

Para confirmar que cada commit intermedio compila: `cd backend && ./mvnw -q compile` después de cada uno (la Fase 3 no depende de nada de la Fase 4; la Fase 4 depende de la 3 solo por `ConflictoComercioException`).

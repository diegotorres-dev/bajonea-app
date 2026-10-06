# Testing E2E — Bajoneá (Fase 17)

Suite de Playwright + TypeScript contra el frontend y el backend reales de Bajoneá, corriendo contra una base de datos propia (`bajonea_test`), separada de `bajonea_final` (desarrollo).

## Antes de correr la suite

El backend de Bajoneá solo escucha en el puerto `8080`, tanto en desarrollo (`bajonea`) como en test (`bajonea_test`) — **nunca corren los dos al mismo tiempo**. Antes de una corrida de tests, asegurate de que el backend de desarrollo esté detenido.

1. **Resetear `bajonea_test`** a un estado limpio y conocido — recrea la base vacía, aplica el schema físico completo de `bajonea_final` (`V1__baseline_bajonea_final.sql`, directo vía `mysql`, sin Flyway) más el catálogo geográfico (seed real del ETL de Georef), levanta el backend una vez para que Flyway baselinee V1 y aplique V2 en adelante, y siembra `admin@bajonea.ar` directo por SQL (gap real de `V1__baseline_bajonea_final.sql`, que es schema-only y no trae ningún seed de admin — ver `docs/DECISIONES.md`, entrada del 2026-09-02, para el detalle completo y por qué el orden es ese):

   ```bash
   npm run test:reset
   ```

   Tarda ~15-30s (un solo arranque de Spring Boot). Es un paso manual, no corre solo antes de cada `npm test` — así una iteración rápida sobre un solo spec no paga ese costo cada vez. Volvé a correrlo cuando quieras partir de datos limpios de nuevo.

2. **Levantar el backend con el perfil `test`**, apuntando a `bajonea_test`, puerto `8080`:

   ```bash
   cd ../../backend
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=test
   ```

3. **El frontend se levanta solo.** `playwright.config.ts` tiene un `webServer` que corre `python .claude/scripts/dev-server-no-cache.py 5501 frontend` si el puerto `5501` todavía no está respondiendo — no hace falta levantarlo a mano salvo que prefieras tenerlo abierto vos mismo (el Browser pane de Claude Code, por ejemplo).

**Atajo para dejar todo listo desde cero** (detiene el backend del 8080, resetea `bajonea_test`, levanta el backend en perfil `test` y fija la contraseña del admin que espera Newman): `bash testing/playwright/scripts/preparar-entorno-test.sh`.

## Correr la suite

```bash
npm test              # toda la suite, headless
npm run test:ui       # modo UI interactivo (recomendado mientras se escribe un spec)
npx playwright test tests/01-registro-y-verificacion.spec.ts   # un spec puntual
npm run report        # abre el último reporte HTML
```

**Proyectos:** `npm test` y `npx playwright test` corren solo `chromium` (escritorio). WebKit (emulación de iPhone 13, 390×844) tiene su propia configuración, `playwright.webkit.config.ts`, y se corre con `npm run test:webkit`. **No corre en la máquina de Diego:** Windows bloquea 4 DLL del navegador con una directiva de Control de aplicaciones (ver `docs/APRENDIZAJES-TECNICOS.md`); probar en otra máquina o en un iPhone real. Para WebKit conviene sumar solo los specs de UI, no el `21` ni el `22` (son de API).

`playwright.config.ts` fija `workers: 1` siempre (no solo en CI) -- la suite corre en serie
por defecto, sin necesidad de pasar `--workers=1` a mano. **Es configuración permanente del
proyecto, no una limitación temporal ni una opción de performance:** `admin@bajonea.ar` es una
cuenta real compartida por 13 de los 19 archivos de spec (vía `fijarPasswordAdminYLoguear`,
`tests/helpers/backend.ts`) y Bajoneá tiene sesión única por cuenta, así que con más de un worker
dos specs pueden pisarse la recuperación de contraseña de esa cuenta y romper al que pierde la
carrera. Además el backend único de desarrollo y Cloudinary no toleran esa concurrencia --
confirmado real: con paralelismo por defecto fallaban ~45 tests. Ver `docs/DECISIONES.md`,
entrada del 2026-09-25.

Estado al 2026-10-06 (tramo E1, bloque A3, solo backend): **447/448 en la corrida completa** (`npx playwright test`, `workers: 1`, 16,1 min, desde una base reseteada con `preparar-entorno-test.sh`; sin specs nuevos). El único fallo, `11-perfil-cliente:74` (el campo `input-nombre` del formulario de edición no se hizo visible a tiempo), pasó 30/30 al correr el archivo entero 3 veces seguidas.

**Tests inestables conocidos** (no se corrigieron; fallan de forma intermitente en la corrida completa y pasan al repetirlos aislados): `01-registro-y-verificacion:100` (recorte de foto contra Cloudinary real), `11-perfil-cliente:74` y `11-perfil-cliente:134` (un formulario del perfil que tarda en abrirse o mostrar un campo), `12:251` (el reloj simulado de Playwright, `clock.pauseAt` con `Date.now()`) y `14-perfil-comercio:124` (un campo del perfil que tardó en mostrarse).

Estado anterior, al 2026-10-05 (tramo C3): **443/446 en la corrida completa** (`npx playwright test`, `workers: 1`, 15,8 min, desde una base reseteada con `preparar-entorno-test.sh`; 34 archivos de spec: el `34` nuevo de 10 tests y 3 aserciones de layout nuevas en el `31`). Los 3 que fallaron son inestables y no tienen relación con el tramo: pasan al repetirlos de forma aislada (01:100 recorte de foto contra Cloudinary real, 12:251 el reloj simulado de Playwright (`clock.pauseAt` con `Date.now()`), 14:124 un campo del perfil que tardó en mostrarse); en una de tres repeticiones aisladas volvió a fallar uno. Estado anterior, tramo C2: **433/433 en verde** (`npx playwright test`, `workers: 1`, 14,2 min, desde una base reseteada con `preparar-entorno-test.sh`; 33 archivos de spec, con el `32` nuevo de 13 tests y el `33` de 9). Registro histórico siguiente:

Estado al 2026-10-03 (tramo C1, Entrega B): **411/411 en verde** (`npx playwright test`, `workers: 1`, 12,9 min, desde una base reseteada con `preparar-entorno-test.sh`; 31 archivos de spec, con el `31` nuevo de 27 tests y el `30` de 15). Registro histórico siguiente:

Estado al 2026-10-03 (tramo 5): **369/369 en verde** (`npx playwright test`, `workers: 1`, 11,3 min, desde una base reseteada con `preparar-entorno-test.sh`; 29 archivos de spec, con el `29` nuevo de 15 tests). Registro histórico siguiente:

Estado al 2026-09-25: **137/137 tests en verde, sin exclusiones** en los 19 specs anteriores; el spec `20` (3 tests, revisión manual de reembolsos) se agregó después y pasa 3/3 (`npx playwright test --list`: 140 tests en 20 archivos; la suite completa de 140 todavía no se corrió junta).

## Estructura

20 specs en `tests/` (140 tests). Los `01`-`09` corresponden a los tramos de la Fase 16; los `10` en adelante se agregaron con las rondas de matrices y validaciones exhaustivas:

| Spec | Cubre |
|---|---|
| `01-registro-y-verificacion` | Registro de Cliente y Comercio, verificación de cuenta por código |
| `02-login` | Login de los roles, bloqueo de cuenta |
| `03-catalogo-publico` | Catálogo público de comercios y productos, sin autenticación |
| `04-carrito` | Carrito simplificado (1 comercio a la vez) |
| `05-pedido-flujo-completo` | Pedido → pago (vía `pago-aprobado` de test) → aceptación/rechazo → notificación, con 2 `browserContext` (Cliente y Comercio) |
| `06-crud-productos` | CRUD de producto del Comercio + galería Cloudinary |
| `07-crud-categorias-tags` | CRUD de Categoría y Tag (Administrador) |
| `08-aprobacion-comercio` | Aprobación/rechazo de Comercio (Administrador) |
| `09-notificaciones` | Notificaciones in-app vía polling |
| `10-recuperacion-y-reactivacion` | Recuperación de contraseña (3 pasos) y reactivación de cuenta (2 pasos) |
| `11-perfil-cliente` | Perfil de Cliente: datos personales, contraseña y foto |
| `12-carrito-checkout-explorar` | Carrito (stepper y nota), checkout y explorar con búsqueda y filtros |
| `13-registro-comercio-wizard` | Wizard de registro de Comercio |
| `14-perfil-comercio` | Perfil de Comercio: datos, contraseña y foto |
| `15-crud-productos-validaciones` | Validaciones de UI del CRUD de producto |
| `16-rechazo-pedido-validaciones` | Rechazo de pedido y obligatoriedad condicional del comentario |
| `17-validaciones-administrador` | Validaciones exhaustivas del Administrador (aprobación, listados, dashboard, categorías, tags) |
| `18-configuracion-tarifas` | Configuración de tarifas (Administrador) |
| `19-nombre-usuario` | Login por nombre de usuario, disponibilidad en vivo, registro y edición desde el perfil |
| `20-reembolsos-admin` | Revisión manual de reembolsos del Administrador: listado y filtros (datos sintéticos por SQL), reintento con cuenta desvinculada (real, sin salir a Mercado Pago) y reintento exitoso con la respuesta simulada |
| `21-multicomercio-tramo1` | Multi-comercio, tramo 1 (a nivel API): resolución del comercio activo por `X-Comercio-Id`, aislamiento entre comercios del mismo Dueño, bloqueo/restauración de cuenta y vinculación/desvinculación de Mercado Pago con N comercios, con el historial que dejan |
| `22-multicomercio-tramo2a-alta-adicional` | Multi-comercio, tramo 2A (a nivel API): elegibilidad, alta de un comercio adicional (validaciones, foto en la carpeta del Dueño, duplicados incluido el paralelo), aprobación con y sin cuenta de Mercado Pago, rechazo y datos de la bandeja del Administrador |
| `23-multicomercio-tramo2b-alta-adicional-ui` | Multi-comercio, tramo 2B (UI, viewport móvil): `agregar-comercio.html` (acceso, elegibilidad, formulario de 3 pasos, duplicado, confirmación de salida), bandeja y detalle del Administrador con la etiqueta "Comercio adicional" y los otros comercios del Dueño, aprobación con y sin cuenta de Mercado Pago simulada |
| `24-multicomercio-tramo3a-correccion-rechazados` | Multi-comercio, tramo 3A (a nivel API): precarga de la corrección (`404` idénticos), reenvío con cambios por campo, token de versión, datos fiscales (solo sin comercio aprobado previo, choque de CUIT/DNI), duplicados, límite de 3 re-solicitudes y rechazo definitivo, bandeja y métricas del Administrador, nueva elegibilidad para agregar comercios y que `RECHAZO_DEFINITIVO` no se cuele en suspensión, bloqueo, catálogo ni pedidos |
| `27-multicomercio-tramo4-selector` | Multi-comercio, tramo 4B (UI, viewport móvil): selector de comercio del Dueño (orden de entrada al login, franja en las 4 pestañas, panel "Tus comercios", pantallas de estado por `?id`, "Volver a mis comercios", campana y lista por comercio, polling único, mantener apretado el avatar, header `X-Comercio-Id`) |
| `28-multicomercio-tramo5-api` | Multi-comercio, tramo 5A (a nivel API): una cuenta de Mercado Pago por Dueño y una cuenta activa en un solo Dueño, `iniciar`, previa de la desvinculación (forma, aislamiento, `404`, `403`), desvinculación con y sin pedidos en `PENDIENTE_PAGO`, pedidos en curso que siguen su flujo, nota en revisión manual y revalidación de `APTO_VENTA` al crear el pedido |
| `29-multicomercio-tramo5-ui` | Multi-comercio, tramo 5B (UI, viewport móvil): aviso "Vinculá Mercado Pago" del panel "Tus comercios", lista de comercios operativos en la cuenta de cobro, modal de desvincular (pedidos en curso por comercio con singular/plural, sin pedidos, skeleton, Cancelar sin DELETE), bloqueo por pagos pendientes con la hora HH:mm, desvinculación con refresco inmediato, carrera entre la previa y el DELETE, `404`, resultados del callback `vinculacionMp` (con limpieza del parámetro) y pedidos en curso que siguen su flujo |
| `30-cierre-manual-comercio-api` | Cierre manual del comercio, tramo C1 (a nivel API): `PUT /comercios/cerrar` y `/abrir` con `X-Comercio-Id` (`404` de otro Dueño, `400` sin header o no numérico, `401`, `403` de Cliente), efecto sobre el perfil, `mis-comercios` y el catálogo (`estadoApertura`, `textoReapertura`), fila de historial con el actor, `409` fuera de horario y `409` de comercio no operativo, doble cierre y cierres simultáneos sin filas duplicadas, el `409` de cierre manual al agregar al carrito y al confirmar el pedido, pedidos en curso que siguen su camino y el job de reapertura vía endpoint de test (no reabre dentro de la franja, reabre al empezar la próxima, se pone al día, varios comercios) y el cierre masivo de un Dueño con tres comercios (abierto en franja `200`, fuera de su horario `409`, ya cerrado a mano `200` idempotente sin fila duplicada) |
| `31-cierre-manual-comercio-ui` | Cierre manual del comercio, tramo C1 Entrega B (UI, viewport móvil): interruptor del dashboard en sus tres estados (abierto, pausado, fuera de horario bloqueado) y con skeleton, confirmación solo al cerrar (Cancelar, Escape y fondo no llaman al backend; el estado persiste al recargar), sin doble clic, apertura directa, `409` y falla de red con mensaje corto, chip "Cerrado" en la franja y el panel solo para `APTO_VENTA` (un `APROBADO` sin Mercado Pago no muestra interruptor ni chip), reapertura automática reflejada por el polling sin recargar, catálogo con comercios cerrados atenuados y la etiqueta al final (`CERRADO_HORARIO` y `CERRADO_TEMPORALMENTE`), abiertos primero y filtro "Abierto ahora", detalle con `textoReapertura`, `409` por cierre al agregar al carrito y al confirmar el pedido (banner y "Volver al catálogo"), y el modal de bloqueo de la desvinculación de Mercado Pago en sus dos variantes con "Cerrar comercio(s)" (cierre masivo, un `409` de fuera de horario cuenta como éxito, una falla real informa "No se pudo cerrar: <nombre>") |
| `32-bloqueo-dueno-comercio-api` | Cierre manual, tramo C2 (a nivel API): Dueño con un comercio `APTO_VENTA`, uno `APROBADO` sin cobro y uno `SUSPENDIDO`; tres intentos fallidos cierran solo el `APTO_VENTA` (fila de historial) y no tocan los demás; el catálogo y los productos listan el comercio bloqueado con `estado` `APTO_VENTA`, `estadoApertura` `CERRADO_TEMPORALMENTE` y `textoReapertura` nulo; carrito y pedido dan `409` "Este comercio está cerrado en este momento"; la recuperación de contraseña restaura según la cuenta de Mercado Pago (también si se desvinculó durante el bloqueo); un cierre manual previo sigue vigente; un Dueño solo `APROBADO` no cambia ni escribe historial; bloqueos repetidos con varios comercios |
| `34-bloqueo-vigente-api` | Cierre manual, tramo C3 (a nivel API): con la cuenta del Dueño bloqueada y Mercado Pago activo, aprobar un comercio pendiente lo deja `CERRADO_TEMPORALMENTE` (historial: la fila del Administrador y una automática, sin pasar por `APTO_VENTA`), el catálogo lo muestra con `estadoApertura` `CERRADO_TEMPORALMENTE` y sin `textoReapertura`, y al desbloquear vuelve a `APTO_VENTA`; con el Dueño activo la aprobación sigue dejando `APTO_VENTA` con las dos filas de siempre; sin cuenta de cobro el comercio aprobado queda `APROBADO` sin fila extra; vincular Mercado Pago con la cuenta bloqueada deja `CERRADO_TEMPORALMENTE`; un rechazo no se ve afectado; la reactivación de cuenta restaura una sola vez y una segunda confirmación del mismo código da `401` |
| `33-bloqueo-dueno-comercio-ui` | Cierre manual, tramo C2 (UI, viewport móvil): tarjeta del comercio bloqueado atenuada con "Cerrado temporalmente" al final y después de los abiertos, filtro "Abierto ahora", detalle sin texto de reapertura, modal de producto sin "Agregar al carrito", `409` al agregar, al confirmar y al abrir el checkout (banner y "Volver al catálogo"), carrito sin aviso anticipado y tarjeta otra vez abierta al desbloquear |

Todos los elementos interactivos de `frontend/` tienen `data-testid` (convención documentada en `docs/DATA-TESTID-FASE17.md`) — preferir `getByTestId(...)` a selectores de clase CSS, que van a seguir moviéndose en rondas de pulido futuras.

## Base de datos de test

`bajonea_test` vive en el mismo MySQL que `bajonea` (XAMPP, `localhost:3306`), mismo charset/collation (`utf8mb4`/`utf8mb4_general_ci`). El backend la usa vía `backend/src/main/resources/application-test.properties` (perfil `test`) — Cloudinary y Resend quedan sin configurar a propósito en ese perfil: los E2E no llaman servicios externos reales (verificación de cuenta y recuperación de contraseña se resuelven vía `GET /api/v1/test/token`, el mismo bypass que ya usa la colección de Postman).

### Endpoints de test (`@Profile("test")`)

Solo existen bajo el perfil `test` y nunca simulan ni reemplazan la integración real: saltean el paso externo y ejecutan el mismo código de negocio que el flujo real.

| Endpoint | Para qué |
|---|---|
| `GET /api/v1/test/token-verificacion?email=` | Código de verificación de cuenta pendiente |
| `GET /api/v1/test/token?email=&tipo=` | Código de cualquier `TipoToken` (recuperación, reactivación, verificación) |
| `PUT /api/v1/test/comercios/{id}/apto-venta` | Pasa un comercio a `APTO_VENTA` sin vincular MercadoPago |
| `POST /api/v1/test/jobs/reapertura-comercios?ahora=` | Ejecuta el job de reapertura del cierre manual con la hora `ahora` (ISO local, opcional; sin ella usa la hora real en `-03:00`) y devuelve cuántos comercios reabrió |
| `PUT /api/v1/test/pedidos/{id}/pago-aprobado` | Fuerza `PENDIENTE_PAGO` → `PENDIENTE_CONFIRMACION_COMERCIO` llamando a `PedidoService.confirmarPagoAprobado`, la misma rutina del webhook real, sin tocar MercadoPago |

## Colección de Postman con Newman

La colección versionada es `postman/Bajonea-MVP.postman_collection.json` (793 requests definidos; la última corrida de Newman reportó 799 ejecutados y 1417 assertions, 0 fallos, ningún request bloqueado por depender de un pago real de MercadoPago -- la diferencia es de conteo, definiciones vs ejecuciones), con el environment `postman/Bajonea-Local.postman_environment.json`.

**Precondición no automatizada:** sobre una base recién reseteada (`npm run test:reset`), `admin@bajonea.ar` queda con una contraseña que no coincide con la que la colección espera (`PostmanAdmin123`, variable `admin_password`). Antes de correr Newman, con el backend en perfil `test`, hay que fijarla por el flujo real de recuperación: `POST /api/v1/auth/recuperar-password` con `{ "email": "admin@bajonea.ar" }`, obtener el código con `GET /api/v1/test/token?email=admin@bajonea.ar&tipo=RECUPERACION_PASSWORD` y `POST /api/v1/auth/recuperar-password/confirmar` con `{ "email", "codigo", "nuevaPassword": "PostmanAdmin123" }`. Si no se hace, todas las corridas fallan en cascada por un `401` del admin. Los specs de Playwright no lo necesitan (lo resuelven con `fijarPasswordAdminYLoguear`). *Sugerencia futura, no implementada:* automatizar este paso dentro de `scripts/reset-db.mjs`.

**Orden de los builders de Newman:** `build-multicomercio-tramo1`, `2a`, `3a`, `4a`, `5a`, `6a`, `7a` y `8a` (el `6a` es el del cierre manual, carpeta `53`; el `7a` el del bloqueo del Dueño, carpeta `54`; el `8a` el del bloqueo vigente, carpeta `55`), en ese orden y el `8a` siempre último. Última corrida (tramo C3): **1569 requests ejecutados, 2511 assertions, 0 fallos** (1517 definidos: la carpeta `55` suma 61). Los ejecutados superan a los definidos porque el script de test de la colección hace un `GET /comercios/mis-comercios` con `pm.sendRequest` después de cada login exitoso de un Dueño y Newman lo cuenta como request (52 en esta corrida: 46 logins de Dueño —6 en la carpeta `55` y 4 en la `54`— y 6 de la carrera de registros simultáneos de la carpeta `46`, que usa `pm.sendRequest` seis veces). El `1` reemplaza la carpeta 49 entera y el `4a` agrega requests a ella, así que el `4a` no se puede correr dos veces seguidas sin pasar antes por el `1`. La colección completa corre sobre una base recién reseteada (los emails, CUIT y DNI de las carpetas son fijos): última corrida del tramo C1 (Entrega B), 1438 requests y 2318 assertions, 0 fallos (la carpeta `53` suma el cierre masivo: 84 requests).

## Prueba de estrés de bloqueos

`scripts/stress-locks-tramoC3.mjs` (bloqueo vigente y reactivación) corre con `LOC=<id de Río Grande> CLOUDINARY_CLOUD_NAME=... [ROUNDS=12] [ESCENARIO=1..5]` y `admin@bajonea.ar` con la contraseña de Newman (`ADMIN_PASSWORD` para otra). Cinco escenarios: (1) tres confirmaciones simultáneas del mismo código de reactivación (una sola `200`, dos `401`, una sola fila de historial por comercio); (2) aprobación de comercios pendientes contra el bloqueo del mismo Dueño; (3) vinculación de Mercado Pago contra el bloqueo; (4) aprobación, vinculación y bloqueo a la vez; (5) control con el Dueño activo. En cada ronda de los escenarios 2 a 4 revisa con una consulta sobre toda la base que no haya ningún comercio `APTO_VENTA` con el Dueño `BLOQUEADO`, que cada comercio termine `CERRADO_TEMPORALMENTE` y que la cadena de historial no tenga saltos. Falla (código de salida 1) ante cualquier `5xx` o inconsistencia.

`scripts/stress-locks-tramoC2.mjs` (bloqueo de la cuenta del Dueño) corre con `LOC=<id de Río Grande> [ROUNDS=12] [CLIENTES=6] [ESCENARIO=1..5]` y `admin@bajonea.ar` con la contraseña de Newman. Para que la carrera sea real deja el contador del Dueño en 2 y dispara uno o dos logins fallidos. Cinco escenarios: (1) bloqueo contra confirmar pedido: ningún pedido que empezó después del bloqueo nace, los `201` coinciden con las filas de `pedido` y un pedido posterior da `409`; (2) bloqueo contra cerrar y abrir manual del mismo comercio (sin deadlock; historial de cierre alternado y bandera coherente); (3) bloqueo contra desvincular Mercado Pago (cadena de historial sin saltos y restauración según la cuenta); (4) bloqueos y desbloqueos repetidos con varios comercios, con tres confirmaciones simultáneas del mismo código de recuperación (una sola da `200`); (5) bloqueo contra la aprobación de otro comercio pendiente del mismo Dueño. Falla (código de salida 1) ante cualquier `5xx` o inconsistencia.

`scripts/stress-locks-tramoC1.mjs` (cierre manual) corre con `LOC=<id de Río Grande> CLOUDINARY_CLOUD_NAME=... [ROUNDS=12] [CLIENTES=6] [ESCENARIO=1..5]`. Cinco escenarios: (1) muchos cerrar y abrir simultáneos sobre un mismo comercio dejan un historial que alterna `CERRADO`/`REABIERTO`, termina igual que la bandera y no retrocede en `fecha_hora`; (2) cerrar contra confirmar pedido: ningún pedido que empezó después de la respuesta del cierre nace, y un pedido posterior siempre da `409`; (3) cerrar contra desvincular Mercado Pago, sin deadlocks; (4) ediciones de perfil y vinculaciones en paralelo con el cierre no pisan la bandera; (5) el job de reapertura contra cerrar y abrir. Falla (código de salida 1) ante cualquier `5xx` o inconsistencia.

`scripts/stress-locks-tramo2a.mjs` corre contra `bajonea_test` (backend en perfil `test`, puerto 8080) y requiere `admin@bajonea.ar` con la contraseña definida en el environment de Newman. Uso: `CLOUDINARY_CLOUD_NAME=... LOC=<id de Río Grande> ROUNDS=15 node scripts/stress-locks-tramo2a.mjs`.

Dispara en paralelo sobre un mismo Dueño la aprobación de varias altas pendientes, la vinculación simulada y la desvinculación de Mercado Pago, un alta adicional y, una de cada tres rondas, tres logins fallidos. Comprueba que no hubo ningún 5xx (un deadlock aparece como 500) y que el estado de cada comercio es coherente con la cuenta: con cuenta activa no queda ninguno en `APROBADO`; sin cuenta no queda ninguno en `APTO_VENTA`.

Casos aparte, con la variable `CASO`:

- `CASO=primera-vinculacion`: mide solo la carrera de dos primeras vinculaciones simultáneas de Mercado Pago de un mismo Dueño sin fila previa en `cuenta_mercado_pago` (informa, no corrige nada).
- `CASO=tramo3a`: ejercita la corrección y re-solicitud de comercios rechazados. De cada par de reenvíos idénticos pasa exactamente uno (el otro da 409); la resolución doble deja un solo ganador; `cantidad_resolicitudes` coincide con las filas `RECHAZADO -> PENDIENTE` del historial; y, en una segunda fase, un reenvío con el token viejo mientras el Administrador rechaza nunca puede dar 200.

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
| `PUT /api/v1/test/pedidos/{id}/pago-aprobado` | Fuerza `PENDIENTE_PAGO` → `PENDIENTE_CONFIRMACION_COMERCIO` llamando a `PedidoService.confirmarPagoAprobado`, la misma rutina del webhook real, sin tocar MercadoPago |

## Colección de Postman con Newman

La colección versionada es `postman/Bajonea-MVP.postman_collection.json` (793 requests definidos; la última corrida de Newman reportó 799 ejecutados y 1417 assertions, 0 fallos, ningún request bloqueado por depender de un pago real de MercadoPago -- la diferencia es de conteo, definiciones vs ejecuciones), con el environment `postman/Bajonea-Local.postman_environment.json`.

**Precondición no automatizada:** sobre una base recién reseteada (`npm run test:reset`), `admin@bajonea.ar` queda con una contraseña que no coincide con la que la colección espera (`PostmanAdmin123`, variable `admin_password`). Antes de correr Newman, con el backend en perfil `test`, hay que fijarla por el flujo real de recuperación: `POST /api/v1/auth/recuperar-password` con `{ "email": "admin@bajonea.ar" }`, obtener el código con `GET /api/v1/test/token?email=admin@bajonea.ar&tipo=RECUPERACION_PASSWORD` y `POST /api/v1/auth/recuperar-password/confirmar` con `{ "email", "codigo", "nuevaPassword": "PostmanAdmin123" }`. Si no se hace, todas las corridas fallan en cascada por un `401` del admin. Los specs de Playwright no lo necesitan (lo resuelven con `fijarPasswordAdminYLoguear`). *Sugerencia futura, no implementada:* automatizar este paso dentro de `scripts/reset-db.mjs`.

## Prueba de estrés de bloqueos

`scripts/stress-locks-tramo2a.mjs` corre contra `bajonea_test` (backend en perfil `test`, puerto 8080) y requiere `admin@bajonea.ar` con la contraseña definida en el environment de Newman. Uso: `CLOUDINARY_CLOUD_NAME=... LOC=<id de Río Grande> ROUNDS=15 node scripts/stress-locks-tramo2a.mjs`.

Dispara en paralelo sobre un mismo Dueño la aprobación de varias altas pendientes, la vinculación simulada y la desvinculación de Mercado Pago, un alta adicional y, una de cada tres rondas, tres logins fallidos. Comprueba que no hubo ningún 5xx (un deadlock aparece como 500) y que el estado de cada comercio es coherente con la cuenta: con cuenta activa no queda ninguno en `APROBADO`; sin cuenta no queda ninguno en `APTO_VENTA`.

Casos aparte, con la variable `CASO`:

- `CASO=primera-vinculacion`: mide solo la carrera de dos primeras vinculaciones simultáneas de Mercado Pago de un mismo Dueño sin fila previa en `cuenta_mercado_pago` (informa, no corrige nada).
- `CASO=tramo3a`: ejercita la corrección y re-solicitud de comercios rechazados. De cada par de reenvíos idénticos pasa exactamente uno (el otro da 409); la resolución doble deja un solo ganador; `cantidad_resolicitudes` coincide con las filas `RECHAZADO -> PENDIENTE` del historial; y, en una segunda fase, un reenvío con el token viejo mientras el Administrador rechaza nunca puede dar 200.

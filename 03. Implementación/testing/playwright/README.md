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

## Correr la suite

```bash
npm test              # toda la suite, headless
npm run test:ui       # modo UI interactivo (recomendado mientras se escribe un spec)
npx playwright test tests/01-registro-y-verificacion.spec.ts   # un spec puntual
npm run report        # abre el último reporte HTML
```

## Estructura

9 specs, un archivo por tramo de la Fase 16 (mismo orden), en `tests/`:

| Spec | Cubre |
|---|---|
| `01-registro-y-verificacion` | Registro de Cliente y Comercio, verificación de cuenta por código |
| `02-login` | Login de los 3 roles, bloqueo de cuenta, recuperación de contraseña |
| `03-catalogo-publico` | Catálogo público de comercios y productos, sin autenticación |
| `04-carrito` | Carrito simplificado (1 comercio a la vez) |
| `05-pedido-flujo-completo` | Pedido → aceptación → notificación, con 2 `browserContext` (Cliente y Comercio) |
| `06-crud-productos` | CRUD de producto del Comercio + galería Cloudinary |
| `07-crud-categorias-tags` | CRUD de Categoría y Tag (Administrador) |
| `08-aprobacion-comercio` | Aprobación/rechazo de Comercio (Administrador) |
| `09-notificaciones` | Notificaciones in-app vía polling |

Todos los elementos interactivos de `frontend/` tienen `data-testid` (convención documentada en `docs/DATA-TESTID-FASE17.md`) — preferir `getByTestId(...)` a selectores de clase CSS, que van a seguir moviéndose en rondas de pulido futuras.

## Base de datos de test

`bajonea_test` vive en el mismo MySQL que `bajonea` (XAMPP, `localhost:3306`), mismo charset/collation (`utf8mb4`/`utf8mb4_general_ci`). El backend la usa vía `backend/src/main/resources/application-test.properties` (perfil `test`) — Cloudinary y Resend quedan sin configurar a propósito en ese perfil: los E2E no llaman servicios externos reales (verificación de cuenta y recuperación de contraseña se resuelven vía `GET /api/v1/test/token`, el mismo bypass que ya usa la colección de Postman).

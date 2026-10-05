# Mapeo de archivos — Tramo 1: migración baseline de Flyway (`bajonea_final`)

Fecha: 2026-08-27. Estado: implementado y verificado en lo que es verificable dentro del alcance propio de este tramo — **pendiente de confirmación explícita de Diego**, no cerrado formalmente.

## Qué se hizo

1. Verificado en vivo contra `bajonea_final` (vía `mysql.exe`/`mysqldump.exe` de XAMPP, no solo contra `docs/bajonea_final.sql`): 41 tablas, esquema físico extraído con `mysqldump --no-data`. Confirmado que `token.estado`/`token.intentos_fallidos` y `usuario.foto_perfil_url` ya existen físicamente (sin necesidad de ninguna migración adicional para eso).
2. `backend/src/main/resources/db/migration/V1__baseline_bajonea_final.sql` (nuevo) — `CREATE TABLE` de las 41 tablas tal como existen hoy en `bajonea_final`, envuelto en `SET FOREIGN_KEY_CHECKS = 0/1` (el volcado de `mysqldump` queda en orden alfabético, no de dependencia de FK). Documento vivo del esquema, más que una migración pensada para ejecutarse literalmente contra `bajonea_final` — ver nota técnica abajo.
3. Las 17 migraciones viejas (`V1__geografia.sql` a `V17__notificacion_pedido_id.sql`) movidas a `backend/src/main/resources/db/migration-archivo-bajonea-vieja/` — no borradas, fuera del path que escanea Flyway.
4. `backend/src/main/resources/application.properties`:
   - `spring.datasource.url` → `bajonea_final` (antes `bajonea`).
   - `spring.flyway.baseline-on-migrate=true`, `spring.flyway.baseline-version=1`, `spring.flyway.baseline-description=...` — ver nota técnica.
5. `backend/src/main/resources/application-test.properties` — **sin tocar**, sigue apuntando a `bajonea_test` (base separada, dedicada a Playwright, no es "`bajonea`"). Ver "Consecuencia detectada" abajo.

## Nota técnica: por qué `V1` no se ejecuta literalmente

`bajonea_final` ya tiene las 41 tablas y datos reales (`Categoria`/`Tag`/`Provincia`/`Localidad`/1 Administrador ya sembrado) — correr el `CREATE TABLE` de `V1` tal cual fallaría con "table already exists". Se usó en cambio el mecanismo estándar de Flyway para adoptar una base preexistente (`baseline-on-migrate` + `baseline-version=1`, mismo valor que la versión del archivo `V1`): al arrancar contra una base sin `flyway_schema_history`, Flyway inserta un registro de tipo `BASELINE` para la versión 1 en vez de ejecutar el SQL de `V1`. Verificado en vivo:

```
installed_rank | version | description                                                        | type     | success
1              | 1       | bajonea_final ya existente antes de Flyway (Tramo 1, 2026-08-27) | BASELINE | 1
```

`V1__baseline_bajonea_final.sql` queda como documentación versionada del esquema y como script real para recrear el schema completo desde cero en un ambiente nuevo (ej. una base de test vacía), donde sí se ejecuta de verdad.

## Verificación de cierre — evidencia real

- Backend arrancado 3 veces contra `bajonea_final` real durante la sesión (una tras el baseline solo, una tras Tramo 3, una tras Tramos 2+3). Las 3 veces: Flyway aplica el baseline sin error, y Hibernate (`ddl-auto=validate`) falla en el mismo y único punto: `Schema-validation: missing column [persona_juridica_id] in table [comercio]`.
- Ese error es **exactamente el esperado**: `Comercio` sigue mapeando `persona_juridica_id` (columna que ya no existe en `bajonea_final`, reemplazada por `dueno_id`) — cambio de Comercio→Dueño explícitamente fuera de alcance de esta sesión (tramo propio, de mayor riesgo, pendiente de planificación aparte, ver `CLAUDE.md` §1bis). `Pedido` y `Notificacion` tienen mismatches propios documentados en `docs/MAPEO-IMPACTO-PORTABILIDAD-BAJONEA-FINAL.md` pero no llegan a evaluarse porque Hibernate falla en el primer mismatch que encuentra (`Comercio`).
- Esto confirma el checklist de Tramo 1 tal como está redactado ("si tira algún error acá, es señal de Entities que se resuelven en tramos futuros — documentar, no arreglar").

## Consecuencia detectada, no resuelta en este tramo

`testing/playwright/scripts/reset-db.mjs` (`npm run test:reset`, Fase 17) depende de que las migraciones viejas (`V1`-`V17`) sigan en `db/migration/`, con una coreografía propia (Flyway hasta V15 → seed geográfico → Flyway resto). Con el archivado de esas migraciones, ese script queda roto: contra una `bajonea_test` recién creada (vacía), la única migración visible es `V1__baseline_bajonea_final.sql` — como el schema está vacío, Flyway no baselinea (solo baselinea contra un schema no vacío) y sí ejecuta `V1` de verdad, pero el resultado es el esquema de `bajonea_final` **sin datos geográficos** (V1 es solo DDL) y sin ningún ajuste al flujo de 3 pasos que el script todavía espera. Además, aunque se corrigiera el script, la suite de Playwright igual no arrancaría contra ese esquema nuevo por el mismo motivo que el backend normal no arranca (`Comercio`/`Pedido`/`Notificacion`). **No se tocó `reset-db.mjs` ni `application-test.properties`** — arreglar esto pertenece a los tramos que resuelvan Comercio/Pedido/Notificacion, no a este.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `backend/src/main/resources/db/migration/V1__baseline_bajonea_final.sql` | Nuevo |
| `backend/src/main/resources/db/migration-archivo-bajonea-vieja/V1__geografia.sql` … `V17__notificacion_pedido_id.sql` | Movidos desde `db/migration/` (17 archivos) |
| `backend/src/main/resources/application.properties` | `spring.datasource.url` + 3 propiedades nuevas de baseline de Flyway |

## Pendiente / no resuelto en este tramo

- Backend no arranca de punta a punta contra `bajonea_final` (bloqueado por `Comercio`, fuera de alcance).
- `testing/playwright` queda sin una vía de reset funcional contra el esquema nuevo.

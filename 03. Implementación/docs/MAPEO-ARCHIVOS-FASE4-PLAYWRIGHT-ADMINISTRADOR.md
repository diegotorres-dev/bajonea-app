# Mapeo de archivos — Fase 4: Matriz exhaustiva de Playwright de Administrador (2026-09-04)

Sigue a `docs/AUDITORIA-EXHAUSTIVA-ADMINISTRADOR.md` (Fase 1) y
`docs/MAPEO-ARCHIVOS-FASE2-POSTMAN-ADMINISTRADOR.md` (Fase 2). Sin bloque previo de corrección de
bugs de aplicación — la Fase 2 no encontró ninguno nuevo, así que este tramo arranca directo en
Playwright.

**No cerrado** — a la espera de que Diego confirme el checklist completo, mismo criterio que el
resto de los tramos.

---

## Alcance cubierto

Los mismos 3 formularios/flujos con tabla campo por campo de la Fase 1/2, más los 2 listados de
solo lectura y el dashboard/logout que la auditoría de Fase 1 marcó con cobertura de Playwright
en cero:

1. Aprobación/rechazo de Comercio (`AprobacionComercioRequestDTO`).
2. Gestión de Categorías (`CategoriaRequestDTO`, CRUD completo).
3. Gestión de Tags (`TagRequestDTO`, CRUD completo).
4. Listado de comercios aprobados (`admin-comercios.html`) — cobertura nueva, antes en cero.
5. Listado de Clientes (`admin-clientes.html`) — cobertura nueva, antes en cero.
6. Dashboard y logout de Administrador — cobertura nueva, antes en cero.

Las 6 funcionalidades descartadas por Diego (re-solicitud de comercio rechazado, suspensión/
reactivación de comercios y de clientes, `ConfiguracionTarifa`, Reclamos, Soporte) no se tocaron
ni se mencionan como pendientes en ningún test nuevo — mismo criterio que la Fase 2. Los 4
formularios compartidos con Cliente/Comercio (Login, Verificación, Recuperación de contraseña,
Reactivación de cuenta) tampoco se re-testearon, ya cubiertos en los specs de esos roles.

Siguiendo el criterio del prompt de este tramo: los casos de puro formato de backend que Postman
ya prueba exhaustivamente (`@Size`/`@NotBlank` de `nombre`, boundary de `motivo` a 500/501
caracteres) **no se repitieron 1:1** acá — la matriz de Playwright se concentra en lo que solo
tiene sentido probar con navegador real (boundary visual de `maxlength`, habilitación de
botones, flujos de varios pasos con error intermedio, efectos en cascada entre dos sesiones).

---

## Archivo nuevo

`testing/playwright/tests/17-validaciones-administrador.spec.ts` — 14 tests, en 6 bloques
`test.describe` anidados dentro de un describe general. Nombrado con el siguiente número
disponible de la serie existente (16 specs ya numerados 01-16), separado de `07-crud-
categorias-tags.spec.ts`/`08-aprobacion-comercio.spec.ts` (flujo feliz) — mismo criterio que
`15-crud-productos-validaciones.spec.ts`/`16-rechazo-pedido-validaciones.spec.ts` ya usan para
Comercio: specs de validaciones separados de los de flujo feliz.

### Aprobación / rechazo de Comercio (4 tests)

1. **Boundary de `motivo` (500 caracteres) + contador en vivo + habilitación del botón.** Un
   solo test cubre las 3 cosas porque comparten el mismo campo: `fill()` con 495 caracteres
   (contador `495/500`, botón habilitado), tipeo real por teclado (`Control+End` + 10
   caracteres) para confirmar que el `maxlength="500"` nativo del `<textarea>` corta la entrada
   en 500 (solo entran 5 de los 10 caracteres tipeados), y `fill('')` para confirmar que el
   botón vuelve a deshabilitarse y el contador vuelve a `0/500`.
   - **Hallazgo de la propia escritura del test, no de la aplicación:** el primer intento usó la
     tecla `End` (no `Control+End`) para llevar el cursor al final antes de tipear los caracteres
     de más. Con 495 caracteres sin espacios, el `<textarea>` envuelve el texto en varias líneas
     visuales — `End` solo mueve el cursor al final de la línea visual actual, no al final real
     del contenido, así que los caracteres tipeados se insertaban en medio del texto en vez de al
     final. Corregido con `Control+End` (fin real del contenido). No es un bug de
     `admin-comercio-detalle.html` ni de `js/admin.js` — es un matiz de cómo Playwright simula
     teclado contra un `<textarea>` multilínea, dejado documentado acá (no como comentario en el
     `.ts` — regla de cero comentarios de este tramo) para que no se repita el mismo error en un
     spec futuro.
2. **Redes sociales reales en el detalle, y estado vacío si el comercio dio de baja todas.** Dos
   casos en un mismo test: (a) un comercio recién registrado (`registrarComercio`, que ya carga 1
   red social de Instagram por defecto) muestra "Redes Sociales" + "Instagram" en
   `admin-comercio-detalle.html`; (b) un comercio que, ya verificado, usa su propio autoservicio
   (`DELETE /comercios/redes-sociales/{id}`) para dar de baja la única red social que tiene,
   muestra "Sin redes sociales cargadas". El caso (b) es real, no simulado —
   `RedSocialService.darDeBaja` no exige un mínimo de redes activas restantes (a diferencia del
   alta en el registro, que sí exige entre 1 y 5), así que es una vía legítima para llegar al
   estado vacío que de otro modo sería inalcanzable (el registro siempre carga al menos una).
   Cierra el gap de Redes Sociales que la Fase 1/2 ya habían detectado y corregido en el backend
   — esta era la pieza de cobertura de Playwright que faltaba.
3. **Detalle de un comercio ya resuelto o inexistente → "No encontramos esta solicitud".** Un
   comercio aprobado (ya no está en `/administrador/comercios/pendientes`) y un id inexistente
   (`999999999`) llevan al mismo estado de error, con el botón "Ver pendientes" funcional.
4. **Efecto en cascada con 2 `browserContext` simultáneos.** El Dueño hace login por UI y queda
   sentado en `comercio-pendiente.html` (estado real `PENDIENTE`, sin polling ni recarga
   automática en esa pantalla). En paralelo, el Administrador (otro `browserContext`, misma
   sesión de test) aprueba el comercio. Sin ningún nuevo login del lado del Dueño, un solo
   `page.reload()` alcanza para que `initComercioEstadoPagina` vuelva a resolver
   `GET /comercios/perfil` y lo redirija a `comercio-dashboard.html`, con la notificación real
   (`contador-notificaciones = 1`) ya visible. Mismo patrón de doble contexto que
   `05-pedido-flujo-completo.spec.ts` ya usa para Cliente/Comercio, aplicado acá por primera vez
   a una resolución de Administrador — distinto del test ya existente en
   `08-aprobacion-comercio.spec.ts` (que hace logout+login secuencial en una sola página, no dos
   sesiones live en paralelo).

### Listado de comercios aprobados — `admin-comercios.html` (1 test)

Cobertura nueva de punta a punta: el comercio aprobado aparece en la lista
(`comercio-admin-item-{id}`), el modal de detalle (`modal-detalle-comercio`) muestra sus datos
reales incluidas las redes sociales ("Instagram"), y el botón "Cerrar" lo desmonta del DOM.

### Listado de Clientes — `admin-clientes.html` (1 test)

Cobertura nueva: un cliente real aparece en la lista (`cliente-item-{id}`) con nombre, apellido,
email y el badge de estado correcto ("Activo").

### Dashboard y logout de Administrador (2 tests)

5. **Conteo real de comercios pendientes, con el texto singular/plural correcto.** Se registra un
   comercio pendiente nuevo (garantiza `comerciosPendientes >= 1`, sin asumir un valor exacto —
   la base de test es compartida entre specs, así que un número hardcodeado sería frágil) y se
   deriva el texto esperado (`"1 solicitud..."` vs. `"N solicitudes..."`) a partir del conteo real
   devuelto por `GET /administrador/metricas`, capturado con `page.waitForResponse` antes de
   navegar. **Hallazgo de la propia escritura del test:** el primer intento asumía que
   `contador-comercios-pendientes` (el `<span data-count>` del lado derecho de la alerta)
   mostraba el número en texto — no es así: es un puntito CSS de 8×8px
   (`.alert-card__count`, sin contenido de texto en ningún punto de `initAdminDashboard`), que
   `js/admin.js` solo muestra/oculta según haya o no pendientes. El número real en texto vive en
   el subtítulo de la alerta (`[data-subtitulo]`), que es lo que el test efectivamente compara
   contra el conteo real. No es un bug de la aplicación — es una premisa incorrecta del test,
   corregida antes de dar el tramo por bueno.
6. **Logout real desde el dashboard.** Confirma el modal de confirmación, el cierre de sesión
   real (no simbólico — la Fase 7 del MVP ya lo documentó como logout real que cierra la
   `Sesion`), y que una navegación posterior a `admin-dashboard.html` redirige a login.

### Gestión de Categorías (3 tests) y Gestión de Tags (3 tests)

Estructura idéntica en ambos bloques (mismo patrón ya confirmado como réplica intencional entre
`CategoriaService`/`TagService`, ver `CLAUDE.md` §3):

7. **Boundary de `nombre` (100 caracteres) a nivel de input.** `fill()` con 95 caracteres +
   tipeo real de 10 caracteres más (`Control+End` no hizo falta acá — el `<input type="text">`
   es de una sola línea, sin el problema de wrap del `<textarea>` de arriba) confirma que solo
   entran 5 más, `maxlength="100"` real.
8. **Nombre vacío → error visible sin request al backend; completarlo permite crear con éxito.**
   Flujo de 2 pasos con error intermedio: intento de guardar vacío (el formulario de
   Categoría/Tag, a diferencia del de motivo de rechazo, **no** deshabilita el botón — por eso
   este caso sí es alcanzable desde la UI, a diferencia del `@NotNull` de `aprobar` documentado
   como inalcanzable en la Fase 1) → `mensaje-error-nombre-categoria`/`-tag` visible, confirmado
   con un listener de `request` que ningún `POST` se disparó → nombre válido → `201` real, item
   visible en el listado.
9. **Editar nombre + desactivar en el mismo guardado → 2 requests secuenciales (PUT + DELETE).**
   Caso no cubierto por `07-crud-categorias-tags.spec.ts` (que cambia nombre y toggle en guardados
   separados): acá ambos cambios se hacen en un solo "Guardar Cambios", confirmando que
   `mostrarModalCategoria`/`mostrarModalTag` disparan el `PUT` de nombre y el `DELETE` de baja
   como 2 requests reales (no uno solo), y que el resultado final (nombre editado + inactivo) se
   refleja correctamente en los chips de filtro.

---

## Archivos tocados

- `testing/playwright/tests/17-validaciones-administrador.spec.ts` — nuevo, 14 tests.
- `testing/playwright/tests/helpers/backend.ts` — 3 agregados, ninguno duplica lógica existente:
  - `apiDelete` — faltaba un helper genérico de `DELETE` (ya existían `apiGet`/`apiPost`/`apiPut`).
  - `eliminarTodasLasRedesSociales` — dar de baja, vía el autoservicio real del Comercio, la
    totalidad de sus redes sociales activas (usado para el caso "Sin redes sociales cargadas").
  - `buscarClienteAdminPorEmail` — mismo patrón que `buscarComercioPendientePorEmail` ya existente,
    pero contra `GET /administrador/clientes`.
- `docs/MAPEO-ARCHIVOS-FASE4-PLAYWRIGHT-ADMINISTRADOR.md` — este documento.

Ningún archivo de `backend/`, `frontend/`, ni ninguna migración Flyway, tocado en este tramo — no
hizo falta: los 2 hallazgos de la sesión fueron del propio test (`End` vs. `Control+End`, y la
premisa incorrecta sobre `contador-comercios-pendientes`), no de la aplicación.

---

## Evidencia real generada

### Corridas de Playwright contra `bajonea_test` recién reseteada

- **Solo el spec nuevo** (`17-validaciones-administrador.spec.ts`, `--workers=1`): 14/14 en
  verde, 2 fallos reales en el primer intento (ambos por las 2 premisas incorrectas del test
  documentadas arriba, no de la aplicación) — corregidos y reverificados en verde antes de seguir.
- **Regresión con los specs existentes de Administrador** (`07-crud-categorias-tags.spec.ts` +
  `08-aprobacion-comercio.spec.ts` + `17-validaciones-administrador.spec.ts`, `--workers=1`,
  sobre `bajonea_test` recién reseteada): **22/22 en verde**, reproducido en una corrida limpia
  después de un primer intento con 2 fallos por timeout (`07`, ambos en el test "CRUD completo...
  dar de baja y reactivar") que no se reprodujeron corriendo `07` en aislamiento ni en la corrida
  limpia siguiente — atribuido a acumulación de datos de corridas manuales previas dentro de la
  misma sesión (sin reset entre medio) más carga del sistema por Chromium apilado, no a una
  regresión real de ningún código tocado en este tramo. Documentado como aprendizaje: correr la
  regresión completa siempre sobre un reset fresco, no reusar el estado de una corrida anterior.

### `SELECT` directo contra `bajonea_test` (evidencia de persistencia real, no solo de UI)

Tras la corrida en verde, antes de la limpieza final:

```
comercio: Con Redes E2e (PENDIENTE, 1 red social activa) | Sin Redes E2e (PENDIENTE, 0 redes
        activas -- confirma la baja real vía autoservicio) | Cascada E2e (APROBADO, 1 red social)

categoria: id 26 "Categoría Combo E2E ... Editada", activo=0 -- confirma PUT (nombre) + DELETE
        (baja) reales, ambos aplicados

tag: id 21 "Tag Combo E2E ... Editado", activo=0 -- mismo patrón que categoria

notificacion: tipo=COMERCIO_APROBADO, entidad_tipo=COMERCIO, leida=0, para el Dueño del comercio
        de la cascada -- confirma que la notificación real (no solo el badge de UI) quedó
        persistida tras la resolución del Administrador en el otro browserContext
```

Todos los valores coinciden exactamente con lo esperado por cada test.

### Limpieza final

A diferencia de Postman (que corre contra la misma `bajonea_test` compartida y usa un script SQL
de limpieza dedicado), la convención ya establecida para Playwright en este proyecto es el reset
completo vía `npm run test:reset` (ver `testing/playwright/README.md` — ningún spec existente de
Administrador hace limpieza propia post-test, confían en el reset previo a la corrida siguiente).
Mismo criterio aplicado acá: corrido `npm run test:reset` una vez más al cierre de este tramo, y
confirmado con `SELECT COUNT(*)` en `0` para comercios/categorías/tags/usuarios con el patrón
`E2E`/`.e2e.` de este spec (y de cualquier corrida anterior) tras el reset.

---

## Reporte de bugs de aplicación encontrados (sin corregir, a criterio de Diego)

**Ninguno.** Los 2 hallazgos de este tramo (`End` vs. `Control+End` en un `<textarea>` que envuelve
texto, y la premisa incorrecta sobre qué contiene `contador-comercios-pendientes`) fueron ambos
del lado del test, no de `frontend/`/`backend/` — documentados arriba para que no se repitan en
un spec futuro, sin ningún cambio de código de aplicación.

---

## Cierre

**No cerrado** — pendiente de que Diego revise este documento y confirme:

- El alcance de los 6 formularios/pantallas cubiertos (3 con matriz de campo + 3 de cobertura
  nueva antes en cero), sin ampliar a las 6 funcionalidades descartadas.
- Los 14 tests nuevos de `17-validaciones-administrador.spec.ts` y los 3 agregados a
  `helpers/backend.ts`.
- Que ningún bug de aplicación quedó pendiente de este tramo (los 2 hallazgos fueron del test,
  no de la aplicación).
- Un commit final para este tramo, mismo criterio de "sugerencia, no regla rígida" que las Fases
  1 y 2.

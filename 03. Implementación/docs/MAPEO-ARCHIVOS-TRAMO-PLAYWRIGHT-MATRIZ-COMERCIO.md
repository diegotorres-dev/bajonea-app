# Mapeo del tramo — Matriz exhaustiva de testeo Playwright (Comercio), 2026-09-03

Insumo: `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md` (Fase 1, 4 partes) + la matriz exhaustiva de
Postman de Comercio ya cerrada (`docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-COMERCIO.md`, folders 33-41,
211 requests) con los 3 bugs reales de esa fase ya corregidos. Mismo criterio que el tramo
equivalente de Cliente (`docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md`): foco
exclusivo en lo que necesita navegador real — mensaje visible cerca del campo, bloqueo de
teclado en vivo, boundary visual de `maxlength`, habilitación/deshabilitación de botones,
flujos multi-paso con error intermedio, y lo específico del wizard de 4 pasos de Comercio (tabs
de horarios sobre el mismo array subyacente) — sin repetir mecánicamente la matriz de Postman ya
cerrada. **No cerrado — pendiente de confirmación explícita de Diego**, mismo criterio que el
resto de los tramos del proyecto.

---

## 1. Organización elegida

4 archivos nuevos, uno por bloque de formulario/flujo (mismo criterio "por bloque afín" que el
tramo de Cliente, no un archivo gigante ni uno por formulario individual):

| Archivo | Cubre | Tests |
|---|---|---|
| `13-registro-comercio-wizard.spec.ts` | Wizard de registro (4 pasos): retención de datos entre pasos, teclado en vivo, `maxlength`, tabs de horarios | 6 |
| `14-perfil-comercio.spec.ts` | Edición de perfil, cambio de contraseña, foto de perfil | 7 |
| `15-crud-productos-validaciones.spec.ts` | Validaciones de UI del form de producto que `06-crud-productos.spec.ts` (ya existente) no cubría | 5 |
| `16-rechazo-pedido-validaciones.spec.ts` | Obligatoriedad condicional del comentario cuando `motivo=OTRO` en el rechazo de pedido | 4 |

**22 tests nuevos en total**, sobre los 59 tests que ya tenía el proyecto tras el tramo de
Cliente (58/59 en verde + 1 aceptado) — **81 tests en total**. También se sumaron 3 helpers
genéricos a `tests/helpers/backend.ts` (`crearTag`, `agregarItemCarrito`, `crearPedido`),
reutilizables por cualquier spec futuro que necesite tags o pedidos por API sin pasar por la UI.

## 2. Qué se decidió NO repetir

- **CRUD de producto:** `06-crud-productos.spec.ts` (Fase 17 original) ya cubre de punta a
  punta crear/editar/ciclo de estados/límite de 5 fotos con Cloudinary real — no se duplicó
  nada de eso. `15-crud-productos-validaciones.spec.ts` cubre exclusivamente lo que ese
  archivo no ejercitaba: formateo de miles en vivo del precio, `maxlength` de nombre,
  categoría obligatoria, límite de 5 tags con mensaje visible, y normalización a Title Case
  al perder el foco.
- **Rechazo de pedido, flujo feliz:** `05-pedido-flujo-completo.spec.ts` ya cubre un rechazo
  real con motivo `SIN_STOCK` + comentario, cross-check contra el lado Cliente (estado,
  motivo, notificación). `16-rechazo-pedido-validaciones.spec.ts` no repite ese flujo — se
  concentra en la única rama que ese archivo no tocaba: `motivo=OTRO` con comentario vacío o
  de solo espacios.
- **Aprobación de Comercio:** ya cubierta por `08-aprobacion-comercio.spec.ts` (incluye el
  registro completo del wizard como setup) — no se tocó.
- **Redes sociales (paso 4 del wizard):** fuera de alcance por decisión explícita del prompt de
  esta sesión, mismo criterio que la Fase 2 de Postman de este mismo bloque. El único caso de
  humo del flujo feliz ya vive en `01-registro-y-verificacion.spec.ts` (registro completo de
  Comercio) — no se agregó cobertura exhaustiva nueva.
- **Casos de puro formato de backend** (límites de longitud exactos, formato de CUIT/DNI,
  enums, etc.) que Postman ya prueba exhaustivamente en los folders 33-41 — 1 caso de humo
  por variante cuando hacía falta, nunca la matriz completa repetida.

## 3. Wizard de registro de Comercio (`13-registro-comercio-wizard.spec.ts`)

- **Retención de datos al volver atrás con un error en paso 2:** paso 1 completo y válido →
  paso 2 con razón social vacía a propósito (resto del paso 2 completo) → error visible →
  `btn-volver` (el del wizard, no el del navegador) → los 6 campos de paso 1 conservan sus
  valores exactos, incluida la foto ya recortada (no vuelve a pedirla) → avanza de nuevo a
  paso 2 y los campos que sí se habían completado (CUIT, DNI del representante) siguen ahí,
  sin resetearse — cubre el punto explícito del prompt de esta sesión.
- **Teclado en vivo, paso 2:** CUIT, DNI del representante y teléfono del representante
  descartan letras/símbolos y truncan a su longitud máxima (11/8/10) mientras se tipea, no
  solo al enviar — mismo patrón ya confirmado para Cliente en la Fase 17 original.
  **Auditado y descartado a propósito:** el código postal (`codigoPostal`) NO tiene ningún
  listener de filtrado en tiempo real (a diferencia de DNI/teléfono/CUIT) — solo se valida al
  perder el foco (`bindValidacionCampo`), pese a que el prompt de esta sesión lo mencionaba
  junto a los otros 3 como candidato a "bloqueo de teclado en vivo". Se verificó el código
  real (`js/auth.js`) antes de escribir el test y se confirmó que ese comportamiento no existe
  — no se inventó un caso para un campo que no lo tiene.
- **`maxlength` boundary visual:** nombre del comercio (150) y razón social (150) — tipear 160
  caracteres deja como mucho 150 en el DOM, bloqueado por el HTML nativo, no solo un límite de
  backend.
- **Tabs de horarios sobre el mismo array subyacente:** una franja cargada vía "franja rápida"
  (tab "Horario fijo") y otra cargada a mano en el tab "Personalizado" conviven en el mismo
  `<div id="horario-list">` — cambiar de tab no pierde ninguna, confirmado leyendo el resumen
  "Ya cargaste" desde el tab "Horario fijo" después de haber cargado la segunda franja desde
  "Personalizado".
- **Superposición de horarios con mensaje visible en el DOM:** 2 franjas del mismo día que se
  pisan (09:00-13:00 y 12:00-16:00) muestran `mensaje-error-horarios` en vivo apenas se
  completa la segunda fila (sin enviar el formulario), y el botón "Continuar" del paso 3
  bloquea el avance con el mismo mensaje en el banner general — la superposición ya estaba
  cubierta en Postman (folder 35) a nivel de payload completo; acá se confirma que también se
  ve en el DOM cuando se carga interactivamente, campo por campo.

## 4. Perfil de Comercio (`14-perfil-comercio.spec.ts`)

- Nombre y teléfono vacíos: mensaje visible cerca de cada campo.
- Sacar las 2 modalidades de entrega bloquea el guardado (`mensaje-error-modalidad`); guardar
  con datos válidos actualiza el nombre visible en el header del perfil (con la advertencia de
  que `ComercioService` normaliza a Title Case al persistir, igual que Producto) y confirma
  el body real de la request (`aceptaDelivery`/`aceptaRetiro`).
- Cambio de contraseña: campos vacíos, contraseña débil, confirmación que no coincide — 3
  mensajes independientes. **2 intentos con la contraseña actual incorrecta muestran el aviso
  de "1 intento más" recién en el 2º intento** (`MAX_INTENTOS_FALLIDOS=3`, `AuthService`), sin
  llegar a bloquear la cuenta. Cambio exitoso cierra la sesión real (`clearSesion()` +
  redirect a `login.html?passwordActualizada=1`), la contraseña vieja deja de servir (`401`
  real en el login, mensaje visible) y la nueva sí loguea.
- **Foto de perfil — 2 tests:** subida real vía el editor de recorte (misma cuenta de
  Cloudinary del proyecto, mismo criterio que la Fase 17 original) actualiza el avatar visible
  tanto en la vista de edición como en la principal del perfil. Y la **confirmación visual del
  fix real de esta sesión** (`FotoPerfilComercioRequestDTO.url` con `@Size(max=500)`
  agregado): se intercepta únicamente la respuesta de Cloudinary (`page.route`) para
  controlar el largo exacto de la URL devuelta —algo que una subida real nunca produce— y se
  deja pasar el resto del flujo real: firma real, `PUT /comercios/perfil/foto` real contra el
  backend real, que ahora rechaza con `400` y el mensaje real de validación visible en el
  banner (`no puede superar los 500 caracteres`), sin romper la pantalla.

## 5. CRUD de producto — validaciones exclusivas de UI (`15-crud-productos-validaciones.spec.ts`)

- **Precio:** `formatearMilesInput` agrega separador de miles en cada tecleo (sin necesidad de
  blur); tipear un 9º dígito no llega a escribirse — el listener de `input` trunca a 8 dígitos
  antes de reformatear. **Hallazgo documentado, no un bug:** el mensaje de backend "El precio
  no puede tener más de 8 dígitos" (`comercio.js`, rama `esPrecioValido`) es, en la práctica,
  inalcanzable desde el teclado real — la única forma de generarlo sería pegar un valor ya
  formateado que el filtro en vivo no intercepte, caso no cubierto acá por no ser realista.
- Nombre: `maxlength=150` boundary visual.
- Categoría: dejarla en el placeholder bloquea el guardado (`mensaje-error-categoria-producto`)
  sin llegar a enviar la petición (confirmado escuchando el evento `request`).
- Tags: seleccionar un 6º tag lo bloquea con mensaje visible y el chip nunca queda marcado
  (`aria-pressed` sigue en `false`); sacar uno de los 5 ya elegidos libera un lugar real.
- Nombre: normalización a Title Case al perder el foco, visible antes de guardar (mismo
  criterio que `aTitleCase` del lado Comercio/Cliente).

## 6. Rechazo de pedido — `motivo=OTRO` (`16-rechazo-pedido-validaciones.spec.ts`)

- Sin comentario: el modal lo bloquea con `mensaje-error-comentario-rechazo` visible junto al
  textarea, sin llamar al backend (confirmado escuchando `request`); la etiqueta del campo
  cambia de "Comentario (opcional)" a "Comentario" apenas se elige `OTRO`.
- Comentario de solo espacios: también bloquea (el frontend hace `trim()`, igual que
  `PedidoService` del lado backend — ya confirmado por Postman, folder 41).
- Comentario válido con `OTRO`: rechaza de verdad (`200` real), body de la request confirmado.
- Cambiar de `OTRO` a un motivo distinto limpia el error ya mostrado y no exige comentario
  (`comentario: null` en el body real).

## 7. Helpers nuevos en `tests/helpers/backend.ts`

- `crearTag(request, adminToken, nombre)` — mismo patrón que `crearCategoria`, usado por
  `15-crud-productos-validaciones.spec.ts` para sembrar 6 tags de prueba.
- `agregarItemCarrito(request, clienteToken, productoId, cantidad)` y
  `crearPedido(request, clienteToken, tipoEntrega, direccionId)` — usados por
  `16-rechazo-pedido-validaciones.spec.ts` para dejar un pedido `PENDIENTE` real sin pasar por
  la UI de Cliente (el foco de ese spec es exclusivamente el modal de rechazo del lado
  Comercio). Ninguno de los 3 modifica una función ya existente — puramente aditivos.

## 8. Bugs propios encontrados y corregidos DURANTE la escritura (de mis tests, no de la app)

1. `expect(getByTestId('lista-horarios')).toBeVisible()` fallaba en 3 tests distintos por 2
   motivos relacionados pero no idénticos: (a) el contenedor vive dentro del tab
   "Personalizado", oculto por defecto (arranca en el tab "Horario fijo") — corregido a
   verificar `panel-horario-fijo`/`panel-horario-personalizado` según corresponda; (b) un
   `<div>` sin ninguna fila cargada colapsa a altura 0 y Playwright lo reporta "hidden" pese a
   que el panel que lo envuelve sí está visible — corregido a verificar el panel contenedor en
   vez del contenedor vacío, agregando el `toBeVisible` de `lista-horarios` recién después de
   la primera fila.
2. Testid equivocado: el banner de "email o contraseña incorrectos" del login usa
   `mensaje-error-login` (`#error-credenciales`), no `mensaje-banner` (`#banner-slot`) —
   confirmado leyendo `js/auth.js` (`initLogin`) tras el primer fallo.
3. **Mismo hallazgo ya documentado en el tramo de Cliente, confirmado ahora también en
   Comercio:** un valor de prueba de 5 caracteres ("debil") para "contraseña insegura" en
   `initComercioPerfil` (`comercio.js`, mismo patrón que `initClientePerfil`) dispara el
   `minlength=8` nativo del HTML (`input.checkValidity()`, usado como fallback en
   `validarCamposSilencioso` cuando no hay `validador` explícito) ANTES de llegar al mensaje
   real de complejidad de `esPasswordSegura()` — corregido a un valor de 8+ caracteres sin
   mayúscula/número ("password"). No es un bug nuevo, es la misma causa raíz ya reportada para
   Cliente, confirmada ahora en el código equivalente de Comercio.
4. `ComercioService` normaliza `nombre` a Title Case al persistir (mismo criterio que
   `ProductoService`/`RegistroService`) — la primera versión del test de edición de perfil
   comparaba contra el string sin normalizar; corregido pasando el valor esperado por
   `aTitleCase()` (ya importado del helper compartido).

## 9. Evidencia de la corrida final

- `npm run test:reset` corrido antes de la corrida y otra vez al cerrar el tramo, para dejar
  `bajonea_test` limpia — confirmado con `SELECT` directo: `usuario=1` (solo el admin
  sembrado), `comercio=0`, `producto=0`, `pedido=0`, `tag=0`, `categoria=0`.
- **22/22 en verde** corriendo los 4 archivos nuevos en aislamiento (`--workers=1`).
- **80/81 en verde** corriendo la suite completa del proyecto (`--workers=1`, los 16 archivos
  de spec) — el único fallo es `12-carrito-checkout-explorar.spec.ts`, el hallazgo de UI del
  stepper del modal de producto ya documentado como pendiente en
  `docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md` §8 (el botón "−" no refleja el piso
  visualmente hasta el primer click) — **no es un hallazgo nuevo de esta sesión, no se tocó ni
  se re-investigó**, fuera del alcance de Comercio.
- Persistencia real confirmada con `SELECT`/respuesta real donde corresponde: body de la
  request de rechazo de pedido (`motivo`/`comentario` reales), body de edición de perfil de
  Comercio, status `400` real del fix de `FotoPerfilComercioRequestDTO.url`.

## 10. Pendiente, no resuelto en este tramo

- El hallazgo del punto 8.1 de `docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md`
  (stepper del modal de producto) sigue sin corregir — no es responsabilidad de este tramo.
- El mensaje "El precio no puede tener más de 8 dígitos" de `comercio.js` (§5 de este
  documento) es, en la práctica, código muerto desde el teclado — no se propone ningún cambio,
  solo queda documentado para que Diego decida si vale la pena simplificarlo en un tramo de
  pulido futuro.
- Redes sociales (paso 4 del wizard) sigue sin cobertura exhaustiva, por decisión explícita de
  alcance de esta sesión (§2).

Con este tramo, y a la espera de la confirmación de Diego, queda completa la cobertura
exhaustiva de Playwright de Comercio (Fase 2 de Postman ya cerrada + este tramo). Queda
Administrador para una sesión aparte.

**No cerrado.** A la espera de que Diego confirme el checklist completo antes de dar por
terminado este tramo — mismo criterio que el resto de los tramos del proyecto.

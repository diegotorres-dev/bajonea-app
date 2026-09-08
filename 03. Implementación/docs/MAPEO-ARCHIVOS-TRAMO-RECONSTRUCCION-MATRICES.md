# Mapeo del tramo — Reconstrucción de las matrices exhaustivas de Postman (Cliente + Comercio) tras pérdida por `git checkout` accidental, 2026-09-03

No cerrado — a la espera de que Diego confirme el checklist completo antes de dar por
terminado este tramo, mismo criterio que el resto de los tramos del proyecto.

---

## 1. Diagnóstico real (más grave que lo que asumía el prompt de arranque)

El prompt de esta sesión asumía que solo se habían perdido las carpetas 22-41 (matrices de
Cliente y Comercio), con las carpetas 09-21 presuntamente intactas de tramos anteriores.
Verificado contra `git log`/`git diff` y contra la copia alojada en la nube del MCP de
Postman (workspace `Bajoneá MVP`, colección `2f87a596-ae5e-4f53-83d6-57f52839beb6`) **antes**
de tocar nada:

- El único commit que tocó jamás `postman/Bajonea-MVP.postman_collection.json` es
  `a50124e` (Fase 14, 2026-07-19) — 49 requests, carpetas 00-08.
- La copia en la nube está en el mismo estado exacto desde esa fecha (`updatedAt:
  2026-07-19T07:34:37Z`), 49 requests, carpetas 00-08.
- El archivo local, antes de esta sesión, coincidía byte a byte con ese commit (`git diff`
  vacío).

**Conclusión:** el `git checkout` no solo revirtió el error puntual del `JSON.stringify` —
borró **todo** el trabajo no commiteado desde Fase 14, incluidas las carpetas 09-21 (174
requests: Auth avanzado, Administrador nuevos endpoints, Categorías/Tags CRUD, Cliente
perfil, Comercio perfil/foto, extras de Carrito/Catálogo/Pedidos/Notificaciones, Bloqueo de
comercio, Autorización 401, Redes Sociales), no solo las 22-41 que el prompt asumía como
único daño.

Reportado a Diego antes de reconstruir nada. **Decisión de Diego:** reconstruir únicamente
22-41 en esta sesión (lo que pedía el prompt original) y dejar 09-21 documentado como una
pérdida aparte, pendiente de una sesión futura dedicada — esas 12 carpetas no tienen ningún
documento de auditoría equivalente que respalde sus mensajes/asserts exactos, así que
reconstruirlas bien exige re-derivar desde `docs/DECISIONES.md` y re-probar contra el
backend real, no una reconstrucción mecánica como la de este tramo.

## 2. Hallazgo clave que cambió el método: `build-matriz-comercio-postman.mjs` sigue en disco

`testing/playwright/scripts/build-matriz-comercio-postman.mjs` y su helper
`matriz-comercio-runner.mjs` **nunca se perdieron** — son archivos de testing, ajenos al
`git checkout` que solo tocó el JSON de la colección. Es un generador estático (sin llamadas
de red, todos los mensajes ya verificados hardcodeados) que arma las 9 carpetas 33-41 e
inserta/reemplaza por nombre en `postman/Bajonea-MVP.postman_collection.json` — diseñado
para ser re-ejecutable.

Se corrió tal cual (`node testing/playwright/scripts/build-matriz-comercio-postman.mjs`) y
se verificó la fidelidad comparando 2 de las 9 carpetas generadas contra el JSON completo ya
recuperado en `postman/RECOVERY-parcial/folder-34-completo.json` /
`folder-38-completo.json` (capturados por la sesión que cometió el error, antes de perder el
resto): **diff exactamente vacío en ambas carpetas** (61 items y 10 items respectivamente,
byte a byte idénticos tras normalizar JSON). Esto no es una reconstrucción aproximada de
33/35/36/37/39/40/41 — es la fuente original re-ejecutada.

No existe un script equivalente para las carpetas de Cliente (22-32) — se construyeron
directamente sobre la colección en la sesión que las armó, sin volcarse a un generador
propio. Para esas 11 carpetas hubo que escribir un generador nuevo (punto 4).

## 3. Bugs conocidos ya corregidos después de que se armaron las matrices — 2 casos ajustados

El prompt advertía explícitamente sobre esto para 2 casos puntuales de Comercio. Verificado
contra el código real del backend antes de dar por buena la reconstrucción — ambos ya
estaban corregidos, así que el script (y por lo tanto la colección) se actualizó para
reflejar el comportamiento de hoy, no el bug viejo:

1. **`RegistroComercioRequestDTO.fechaNacimientoRepresentante` — mensaje no determinístico
   entre `@Past` y `@MayorDeEdad`.** Código real hoy: el campo solo tiene `@MayorDeEdad`
   (sin `@Past`) — `MayorDeEdadValidator.isValid()` ya cubre el caso de fecha futura
   internamente (`fechaNacimiento.isAfter(LocalDate.now()) → false`), sin ninguna otra
   anotación compitiendo. El mensaje para una fecha futura es ahora **siempre**
   `"Debe ser mayor de 18 años"`, no una alternancia entre 2 mensajes. Corregido en
   `build-matriz-comercio-postman.mjs` (carpeta 34): el item pasó de "[bug conocido, no
   corregido]... acepta cualquiera de los 2 mensajes" a un `assertFieldMessage` único, y el
   nombre se actualizó a `[bug ya corregido - @Past eliminado, MayorDeEdadValidator ahora
   cubre fecha futura internamente]...`.
2. **`FotoPerfilComercioRequestDTO.url` de más de 500 caracteres → `500` en vez de `400`.**
   Código real hoy: el campo tiene `@Size(max = 500, message = "La URL de la foto de perfil
   no puede superar los 500 caracteres")` — mismo fix que ya se había aplicado a
   `FotoPerfilUsuarioRequestDTO` (Cliente) en una sesión previa, pero también presente en el
   DTO de Comercio sin que ningún documento leído en esta sesión lo mencionara
   explícitamente. Corregido en `build-matriz-comercio-postman.mjs` (carpeta 38): el item
   pasó de esperar `500` a esperar `400` con el mensaje exacto de arriba, y el nombre se
   actualizó a `[bug ya corregido - @Size(max=500) agregado al DTO]...`.

Ningún otro caso de las 9 carpetas de Comercio necesitó ajuste — el resto del script
generó exactamente lo mismo que ya estaba verificado en su momento (confirmado por el diff
vacío del punto 2, que cubre justo las 2 carpetas — 34 y 38 — donde vivían estos 2 bugs).

Del lado de Cliente, los 3 bugs que la sesión original había encontrado y luego corregido
(`docs/MAPEO-ARCHIVOS-TRAMO-BUGS-CLIENTE.md`, mismo día) ya estaban con su comportamiento
final documentado ahí mismo — la reconstrucción de las carpetas 22-32 se escribió
directamente con los mensajes ya corregidos (determinísticos), sin necesidad de ajustar nada
después de escribir el generador: `FotoPerfilUsuarioRequestDTO.url` de 501 caracteres → `400`
con mensaje dedicado (no `500`), `ClienteEditarPerfilRequestDTO.nombre`/`apellido` de 101
caracteres → mensaje único en español (no alternancia inglés/español), `password` de 73
caracteres en el registro → mensaje único de complejidad (no alternancia con el mensaje de
`@Size`). Los 3 confirmados contra el código real del backend antes de escribir el
generador.

## 4. Carpetas 22-32 (Cliente) — generador nuevo, escrito desde cero

Sin script previo que reconstruir, así que se escribió
`testing/playwright/scripts/build-matriz-cliente-postman.mjs`, mismo estilo y mismos
helpers (`req`, `item`, `assertStatusOnly`, `assertFieldMessage`, `assertTopLevelMessage`,
`deepMerge`, `s()`) que el generador de Comercio, para que ambos queden consistentes y
re-ejecutables de la misma forma.

Fuentes usadas, en este orden de confianza:

1. **Código real del backend** (`dto/request/*.java`, `validation/annotations/*.java`,
   `validation/validators/*.java`, `services/PedidoService.java`,
   `exceptions/GlobalExceptionHandler.java`) — mensajes, regex y límites exactos, leídos
   directo del código en vez de re-derivados de la auditoría en prosa. Más confiable que
   `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` para el texto literal de cada mensaje (la
   auditoría describe el comportamiento, no siempre cita el string exacto), pero la
   auditoría siguió siendo la referencia de qué casos cubrir por campo (vacío, 2 formatos
   inválidos, límite inferior/superior, alterno) y confirmó que no había ningún otro
   hallazgo sin corregir además de los ya cubiertos en el punto 3.
2. **`postman/all_requests.txt`** (dump de método + URL + nombre de request, capturado por
   la sesión que cometió el error, cubre las carpetas 00-32 completas) — nombres exactos de
   cada uno de los 187 requests, método HTTP y URL exactos, incluidos los emails literales
   usados en las cadenas de setup real (`postman.matrizverifreal@bajonea.test`,
   `postman.matrizrecupreal@bajonea.test`, `postman.matrizperfil@bajonea.test`,
   `postman.matrizperfilpw72@bajonea.test`, `postman.matrizperfilajeno@bajonea.test`,
   `postman.matrizcarrito@bajonea.test`, `postman.matrizcomerciocarrito@bajonea.test`,
   `postman.matrizcomerciosindelivery@bajonea.test`) — reproducidos tal cual, no
   inventados.
3. **`docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md`** — conteo de requests por
   carpeta (usado para verificar que cada carpeta reconstruida tuviera el número correcto de
   items antes de correr Newman) y los 3 bugs corregidos del punto 3.

Detalle por carpeta (todas con su conteo final verificado):

| Carpeta | Requests | Notas de reconstrucción |
|---|---|---|
| `22 - Matriz Cliente - Registro (campo por campo)` | 54 | Cada caso "debe aceptar" usa un email/DNI generado por contador interno del script (`baseClientePayload`) para evitar colisiones entre sí — el original probablemente hacía lo mismo o similar, no había forma de recuperar los valores literales exactos usados (no estaban en `all_requests.txt`, que no expone bodies), así que se generaron nuevos siguiendo el mismo criterio de unicidad. Sin impacto en la validez de la matriz: lo que se está probando es la regla de validación, no un valor de dato específico. |
| `23 - Matriz Cliente - Login` | 3 | Sin cambios de criterio. |
| `24 - Matriz Cliente - Verificacion de cuenta` | 11 | Email real de setup reproducido tal cual desde `all_requests.txt`. |
| `25 - Matriz Cliente - Recuperacion de password` | 18 | Ídem. |
| `26 - Matriz Cliente - Reactivacion de cuenta` | 7 | Sin setup real (no hace falta un código real para los casos de esta carpeta, todos son de formato). |
| `27 - Matriz Cliente - Perfil (datos personales)` | 20 | Setup propio (5 requests) que deja `matriz_perfil_token`/`matriz_perfil_usuario_id` en el entorno — **la carpeta 29 depende de estas 2 variables**, mismo orden relativo que debía tener la colección original (27 antes que 29). |
| `28 - Matriz Cliente - Cambio de password desde perfil` | 11 | Los 6 primeros casos (esperan `400`) reutilizan `matriz_perfil_token` de la carpeta 27 — no cambia contraseña real ni invalida sesión, así que es seguro reutilizarlo. El caso de 72 caracteres (espera éxito) usa un cliente aparte con su propio setup, porque un cambio exitoso invalida la sesión. |
| `29 - Matriz Cliente - Foto de perfil (Usuario)` | 12 | Depende de `matriz_perfil_token`/`matriz_perfil_usuario_id` de la carpeta 27. El caso de aislamiento entre usuarios usa `RecursoNoEncontradoException("Usuario no encontrado")` (404), confirmado leyendo `UsuarioService.validarPropioUsuario`. |
| `30 - Matriz Cliente - Carrito (alta y edicion de cantidad)` | 29 | Setup propio completo (cliente + comercio + categoría + producto), reutiliza `{{token_admin}}` global (seteado por la carpeta base `02 - Auth`, no por esta carpeta) para aprobar el comercio — igual que hacía el original según `all_requests.txt` (no hay ningún login de Admin listado ahí antes del paso de aprobación). Comercio armado con horario de 7 días completos (00:00-23:59) para no depender de qué día de la semana corra Newman. |
| `31 - Matriz Cliente - Checkout` | 15 | Depende del carrito dejado por la carpeta 30 (mismo cliente, mismo token) para los primeros 4 casos. Setup propio de un segundo comercio sin delivery para el caso de regla de negocio. |
| `32 - Matriz Cliente - Explorar (busqueda y filtros del catalogo)` | 7 | Endpoint público, sin token. Las aserciones de "vacío" verifican `json.data.productos.length === 0`; las de SQL-injection/XSS-like solo verifican `200` (no se afirma el contenido exacto, siguiendo el criterio "debe tratarse como texto literal, no romper" de la auditoría). |

**Total: 187 requests, coincide exacto con el original documentado
(`docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md`, sección 5).**

## 5. Verificación con Newman contra el backend real

Infraestructura: se encontró un backend huérfano en el puerto 8080 al iniciar la sesión
(mismo tipo de situación ya documentada en tramos anteriores) — confirmado con Diego que no
correspondía a ninguna sesión paralela real, así que se mató y se arrancó uno limpio con
`-Dspring-boot.run.profiles=test` contra `bajonea_test`, recién reseteada con
`npm run test:reset`. Contraseña de `admin@bajonea.ar` fijada a `PostmanAdmin123` (la que
usa `postman/Bajonea-Local.postman_environment.json`) vía el flujo real de recuperación de
contraseña — el seed de `reset-db.mjs` inserta un hash de contraseña desconocida a
propósito, mismo procedimiento ya usado en el tramo de la matriz de Comercio.

**Corrida completa de la colección reconstruida (447 requests: 00-08 + 22-41):**

```
requests:        447 executed,   0 failed
test-scripts:     447 executed,  12 failed
assertions:       776 executed,  69 failed
```

Las 69 assertions fallidas (12 test-scripts) están **100% confinadas a las carpetas 02-08**
(19 en `02 - Auth`, 8 en `03 - Administrador`, 23 en `04 - Productos`, 4 en `05 - Catálogo`,
5 en `06 - Carrito`, 14 en `07 - Pedidos`, 8 en `08 - Notificaciones`) — el archivo original,
intacto desde el commit de Fase 14, nunca tocado por esta sesión. Es el mismo drift ya
documentado en `CLAUDE.md` (Fase 17, "7 regresiones reales de drift": `redesSociales`/
`fotoPerfilUrl` ahora obligatorios en el registro de Comercio, formato de teléfono `+549`
más estricto, etc.) — no es un problema de esta reconstrucción, y corregirlo queda
explícitamente fuera del alcance de este tramo (mismo criterio que 09-21, ver punto 1).

**Cero fallos dentro de cualquier carpeta `Matriz` — verificado por búsqueda exhaustiva del
texto `Matriz` en la lista completa de fallos del reporte de Newman: no aparece ninguna
coincidencia.** Los 398 requests de las carpetas 22-41 (187 Cliente + 211 Comercio) pasaron
al 100%, en una sola corrida, sin necesidad de una segunda pasada correctiva.

## 6. Diferencia de conteo contra el número original — explicada, no oculta

El prompt original citaba "~410 requests" para 22-32 (Cliente) y 211 para 33-41 (Comercio).
El número real verificado contra `postman/RECOVERY-parcial/tree-completo-nombres.txt` (el
listado de nombres capturado antes de la pérdida, no una estimación) es **187** para 22-32,
no 410 — el "~410" del prompt en realidad se refería al total acumulado de las carpetas
00-32 (49 + 174 de las carpetas 09-21 + 187 de las matrices de Cliente = 410), no a las
matrices de Cliente en soledad. Confirmado con `postman/all_requests.txt` (410 líneas
totales, carpetas 00 a 32 inclusive) antes de escribir una sola línea del generador — no es
una discrepancia de la reconstrucción, es una lectura más precisa del número ya documentado.
El total real de las 20 carpetas de matrices (22-41) es **398** (187 + 211), y el total de
la colección completa reconstruida es **447** (49 + 398), no 621 (esa cifra sí incluía las
174 requests de 09-21 que quedaron fuera del alcance de esta sesión).

## 7. Limpieza de datos de prueba

`bajonea_test` reseteada por completo con `npm run test:reset` tras la corrida de Newman.
Verificado con `SELECT` directo:

```
usuarios=1 (solo admin@bajonea.ar) | comercios=0 | clientes=0 | productos=0 | pedidos=0 | categorias=0 | tags=0
```

Backend de esta sesión (perfil `test`, PID de Tomcat en 8080) detenido al finalizar, para no
dejar un proceso huérfano corriendo — mismo criterio que tramos anteriores.

## 8. Commit (excepción autorizada puntualmente por Diego para este tramo)

Único archivo commiteado: `postman/Bajonea-MVP.postman_collection.json` (447 requests,
carpetas 00-08 + 22-41). Nada más se agregó al commit — los 2 scripts generadores
(`build-matriz-comercio-postman.mjs` corregido, `build-matriz-cliente-postman.mjs` nuevo)
y este mismo documento quedan sin commitear, a la espera de que Diego decida si los quiere
versionar también (la regla general del proyecto sigue siendo "nunca commitear sin que Diego
lo pida explícitamente" — la excepción de esta sesión fue puntual para el archivo de
Postman).

Hash del commit: **`4f6f2496f1e4c6064c619b32da8c04ba22551bfe`**

## 9. Pendiente, no resuelto en este tramo

- **Carpetas 09-21 (174 requests)** — pérdida real detectada en este mismo tramo, fuera de
  alcance por decisión explícita de Diego (ver punto 1). Sin ningún documento de auditoría
  que respalde sus mensajes/asserts exactos — reconstruirlas bien requiere una sesión aparte
  que re-derive desde `docs/DECISIONES.md` y vuelva a probar contra el backend real.
- **Drift real en las carpetas 02-08** (69 assertions fallidas, ver punto 5) — ya documentado
  en `CLAUDE.md` (Fase 17), no introducido ni agravado por esta sesión, fuera del alcance
  pedido para este tramo.
- **`docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md`/`COMERCIO.md`** no se tocaron — siguen
  describiendo el estado de cuando se escribieron, ninguna corrección de este tramo se
  reflejó ahí (los 2 bugs del punto 3 ya estaban documentados como "corregidos en un tramo
  posterior" en `docs/MAPEO-ARCHIVOS-TRAMO-BUGS-CLIENTE.md`, y el de Comercio queda
  documentado por primera vez acá mismo).

**No cerrado.** A la espera de que Diego confirme el checklist completo antes de dar por
terminado este tramo.

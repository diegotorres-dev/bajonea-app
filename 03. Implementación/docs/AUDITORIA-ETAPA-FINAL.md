# Auditoría de la etapa final (2026-10-18)

Auditoría de solo lectura: no se modificó ningún archivo del proyecto salvo este documento, no se tocó ninguna base, no se ejecutó ningún test ni ninguna migración. Todo lo que se afirma sale de leer código, migraciones, tests y `docs/`; cuando algo no se pudo verificar, se dice. Las estimaciones de días son mías, calibradas contra la referencia que diste (E0 a E4 ≈ 13 días), no medidas. Una "pantalla" es un archivo `.html` de `frontend/`.

---

## 0. Discrepancias entre el prompt y lo que hay en el repositorio

1. **Extras: `docs/recorrido-trabajo-final.md` ya dice "QUITAR".** La lista final de ese archivo (después de "Fuera de este plan") dice "Extras de productos - QUITAR", y a la vez el Bloque 4 los tiene como punto 12. Tu prompt pide auditarlos y recomendar go o no-go. Auditados abajo; mi recomendación coincide con el "QUITAR".
2. **Don Web no figura en ninguna parte del repositorio.** `grep` de "donweb" y "don web" en `docs/`, `CLAUDE.md`, `backend/src` y `frontend/`: cero resultados. `application-production.properties` usa variables con forma de Railway (`MYSQL_PUBLIC_HOST`, `MYSQL_PUBLIC_PORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD`, `PORT`), y `frontend/Caddyfile` es una plantilla con `{{.StaticFileRoot}}` e `{{if .IndexFallback}}`, propia de un builder de plataforma (no verifiqué de cuál). `docs/LISTA-DE-DESPLIEGUE.md` no menciona ningún proveedor. Nada de esto se auditó contra Don Web: no conozco sus capacidades y no hay documentación en el repo.
3. **Nombre único: la regla actual es la inversa en un punto.** `ValidadorComercioDuplicado.ESTADOS_EXCLUIDOS_DEL_DUPLICADO = {RECHAZADO}`: hoy un `RECHAZADO` no cuenta como duplicado y un `RECHAZO_DEFINITIVO` sí. Tu decisión es "cuentan todos salvo `RECHAZO_DEFINITIVO`", o sea al revés. Hay tests que fijan la regla actual (`24-multicomercio-tramo3a-correccion-rechazados.spec.ts:818`, `22-...:449`).
4. **Recomendaciones de la mesa final: solo dos están documentadas.** `docs/mvp-terminado.md` ("Sección aparte — 2 puntos nuevos sugeridos por los profesores", puntos 18 y 19) y `docs/recorrido-trabajo-final.md` (Bloque 5: libreta sanitaria, tope de año de nacimiento, testing cross-browser). **No encontré en ningún documento** "persona jurídica solo con CUIT" ni "cambio de contraseña autenticado con token". Tampoco "pérdida de datos en formularios multipaso" como recomendación, aunque sí pude verificar el estado real del código (sección C).
5. **"El tramo A4 de E4 (estrés de carrito y cierre del backend)".** En el repo el bloque A4 de E4 se llama "cierre y verificación" (`docs/DECISIONES.md`, 2026-10-15). El estrés de carrito es `stress-locks-tramoE3-carrito.mjs` (mini-tramo del carrito de E3); corrió dentro del A4 de E4. Resultado en sección C.
6. **Reclamos: los requisitos dicen solo "pedido a domicilio ENTREGADO".** `docs/entregables-01-02/requisitos-funcionales-cliente.md:57` y `requisitos-funcionales-administrador.md:74-79`. Tu decisión suma `NO_RETIRADO`, que por definición es un retiro (solo existe desde `LISTO_PARA_RETIRAR` en modalidad `RETIRO`). Hay que decidir si un retiro `ENTREGADO` también reclama (pregunta 2.i).
7. **"Un pedido pertenece al turno de su pago confirmado": hoy el pedido no guarda cuándo se confirmó el pago.** No hay columna; `PedidoService.fechasPagoAprobado` la reconstruye desde `historial_estado_pedido` (fila `PENDIENTE_CONFIRMACION_COMERCIO`). Ver punto 11.
8. **Registro de Comercio no tiene aceptación de términos.** `RegistroComercioRequestDTO` no tiene `aceptaTerminos` ni `registro-comercio.html` un checkbox; solo el Cliente lo tiene (`DatosClienteRequestDTO`, `frontend/js/cliente-form.js`). Tu decisión "texto en los registros" implica agregarlo al de Comercio (y al alta adicional, que comparte DTO de negocio).
9. **Playwright no corre en viewport móvil.** `testing/playwright/playwright.config.ts`: un solo proyecto `chromium` con `devices['Desktop Chrome']` (1280×720). Existe `playwright.webkit.config.ts` (iPhone 13) pero no se corre en tu máquina (Windows, ver `docs/LISTA-DE-DESPLIEGUE.md` §6). Solo unos pocos specs fijan un viewport de 390 px (`23`, `25`, `27`).
10. **Siguiente migración libre: `V36`.** Última aplicada: `V35__tipo_notificacion_empleado_reactivado.sql`.
11. **Tu prompt habla de MariaDB 10.4.** Lo confirman `docs/APRENDIZAJES-TECNICOS.md` y `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (`LOCK IN SHARE MODE`); `application.properties` solo muestra una URL `jdbc:mysql`. No pude verificar la versión real del servidor.
12. **Árbol de trabajo con cambios sin commitear** (no son de esta auditoría): `backend/src/main/resources/application.properties`, `postman/Bajonea-Local.postman_environment.json`, `testing/playwright/tests/helpers/backend.ts`, y sin seguimiento `backend/run-local.ps1` y `testing/playwright/tmp-capturas/`.

---

## 1. Cuadro resumen

Días = días de trabajo con el ritmo de referencia, incluyendo tests, estreses donde hay locks y documentación. A = backend y tests; B = pantallas y tests de UI.

| # | Punto | A | B | Total | Riesgo | Depende de | Recomendación |
|---|---|---|---|---|---|---|---|
| 1 | Extras (GrupoExtra/Extra) | 6–7 | 3–4 | 9–11 | **Alto** | — | **Descartar (no-go)** |
| 2 | Reclamos | 2 | 1,5 | 3,5 | Medio | 3 (UI compartida), `NotaCredito` | Entrar, mínimo |
| 3 | Soporte | 1,5 | 1,5 | 3 | Bajo-medio | 4 | Entrar, mínimo |
| 4 | Suspensión (4 sujetos) | 3 | 1,5 | 4,5 | **Alto** | 3, 5 | **Reducir** (levantar suspensión de comercio + Cliente) |
| 5 | Libreta sanitaria | 3 | 1,5 | 4,5 | **Alto** | 4 (recalcular aptitud) | Entrar |
| 6 | FAQ | 0 | 0,5 | 0,5 | Bajo | 3 (enlace) | Entrar |
| 7 | Términos y Privacidad | 0,25 | 0,75 | 1 | Bajo | textos tuyos | Entrar |
| 8 | Estadísticas del Dueño | 1,5 | 1,25 | 2,75 | Medio | 11 | Entrar, mínimo |
| 9 | Email por turno cerrado | 2 | 0 | 2 | Medio | 11 | Entrar |
| 10 | Nombre único de comercio | 1,25 | 0,5 | 1,75 | Medio | — | Entrar primero |
| 11 | Facturación por turno | 2,5 | 1,25 | 3,75 | **Alto** | 13 | Entrar |
| 12 | Precios no modificables en franja | 1,25 | 0,75 | 2 | Medio | 13 | Entrar |
| 13 | Edición de horarios | 2 | 1,25 | 3,25 | **Alto** | — | Entrar (cabecera del modelo de turno) |
| 14 | Direcciones múltiples del Cliente | 1,5 | 1,5 | 3 | Medio | — | **Descartar o reducir** |
| E | Escritorio (opción 1, breakpoints) | 0 | 2–4 | 3 | Medio | Nielsen | Entrar, mínimo |
| N | Pasada de interfaz Nielsen (mobile) | 0 | 4–5 | 4,5 | Bajo-medio | — | Entrar, focalizada en severidad 3–4 |
| | **Total sin el punto 1** | | | **≈ 43** | | | |

**Cuatro semanas son 20 días hábiles, 24 si se trabaja sábados.** Todo lo decidido suma ≈ 43 días de mis estimaciones, así que **no entra**; el corte realista y el orden están en la sección 7.

---

## 2. Puntos 1 a 14

### Punto 1 — Extras (`GrupoExtra` / `Extra`)

**a) Qué existe hoy.**
- Solo base de datos: `V1__baseline_bajonea_final.sql` crea `grupo_extra` (comercio, nombre, `cantidad_maxima`, `obligatorio`, baja lógica), `extra` (grupo, nombre, `precio`), `producto_grupo_extra` (PK compuesta producto + grupo), `item_carrito_extra` y `detalle_pedido_extra` (snapshot de `precio_unitario`).
- Código: cero. Sin Entity, Repository, Service, Controller, DTO ni pantalla (`grep` de `GrupoExtra` en `backend/src` y `frontend/`: nada; `grupo_extra` aparece solo en el baseline).
- `docs/recorrido-trabajo-final.md` los marca "QUITAR".

**b) Qué falta.** Todo el módulo y el recálculo de totales.

**c) Capas y archivos.**
- Entidades: 5 nuevas (más sus Repository). Nuevos Service/Controller de catálogo de extras del comercio y DTOs.
- Tocar: `CarritoService` (alta de ítem con extras, validación de `cantidad_maxima` y `obligatorio`, recálculo; hoy el subtotal es `producto.precio × cantidad`, ver `CarritoService.java:245-250`), `PedidoService.confirmarPedido` (líneas ~199-245: validación de tope, subtotal, `DetallePedido`), `MercadoPagoPagoService` (monto de la preferencia), `ReembolsoService`/cancelación parcial por ítem (`detalle_pedido.estado`, `V2`), `TrazabilidadPedidoService`, DTOs de pedido del Dueño y del Empleado (`PedidoResponseDTO`, `PedidoEmpleadoResponseDTO`), `ProductoService` (baja de producto que limpia carritos: `prepararQuitarProducto`).
- Frontend: formulario de producto (`comercio-producto-form.html`, `comercio.js` ~3000 líneas), modal de producto del catálogo (`catalogo.js`/`comercio-detalle.html`), `carrito.js`, `checkout.js`, `pedido-detalle.html`, `comercio-pedido-detalle.html`.

**d) Migraciones.** Ninguna de estructura (las tablas existen). Riesgo con datos: bajo, tablas vacías. Atención: `fk_item_carrito_extra_item` no tiene `ON DELETE CASCADE` (lo anotó `CLAUDE.md` en el mini-tramo del carrito): cada `DELETE` en bloque de ítems (`ItemCarritoRepository`) tendría que borrar antes `item_carrito_extra`.

**e) Concurrencia.** Alto: agrega una hoja más al final del orden (`item_carrito_extra` después de `carrito`), obliga a rehacer el orden de bloqueo de las operaciones del carrito que se endurecieron en E3 (`CarritoVaciadoConcurrenciaIntegrationTest`, estrés `carrito`), y el Dueño que baja un extra compite con pedidos en curso y con carritos. Un extra dado de baja con carritos que lo tienen requiere la misma "baja en dos mitades" que ya existe para productos.

**f) Impacto en tests.** Todo test que compare totales: specs `04`, `05`, `12`, `16`, `21`, `28`, `40`, `42` a `44`, `46`; carpetas de Newman de carrito/pedido; builders `build-carrito-vaciado-*`, `build-pedidos-*`; estrés `carrito` y `A0`; Java: `CarritoService*`, `PedidoService*`, `CarritoVaciado*`. Solo agregar campos opcionales no los rompe, pero la cobertura nueva es grande.

**g) Estimación.** A 6–7 d (5 entidades, carrito, pedido, preferencia de MP, reembolso parcial, estrés), B 3–4 d (formulario del Dueño con grupos y extras, selección en el modal del Cliente, resumen en carrito/checkout/detalles). ≈ 9–11 d.

**h) Dependencias.** Ninguna hacia otros puntos; muchos puntos dependen de que los totales no cambien (11, 8, 9).

**i) Recomendación go / no-go: NO-GO.** Es el único punto cuyo costo toca el camino crítico del dinero (carrito, pedido, preferencia de MP, reembolsos), con la mayor superficie de tests, y no aparece en ninguna recomendación de los profesores. Ya figura como "QUITAR" en tu propio plan. Defensa: "contemplado en el modelo de datos (5 tablas en `bajonea_final`), diferido a una versión posterior". Si se hiciera igual, no entra en estas 4 semanas junto con el resto.
*Pregunta abierta:* ¿lo declaramos explícitamente fuera de alcance en `alcance-y-limitaciones.md` y el diccionario (v1.20) para la defensa? Recomiendo sí.

---

### Punto 2 — Reclamos

**a) Qué existe hoy.**
- Tabla `reclamo` en el baseline (`V1`): `pedido_id` único, `descripcion`, `estado` (`PENDIENTE`, `APROBADO`, `RECHAZADO`), `administrador_id`, `nota_resolucion` (varchar 500), fechas. Diccionario: `docs/entregables-01-02/diccionario-de-datos.md` §7 "Tabla: Reclamo".
- `TipoNotificacion` ya tiene `NUEVO_RECLAMO` (audiencia `ADMINISTRADOR`), `RECLAMO_APROBADO` y `RECLAMO_RECHAZADO` (audiencia `CLIENTE`), y existen en el ENUM de `notificacion.tipo` (`V34`). **Ningún código los emite** (`grep` en `src/main`: solo el enum).
- `PedidoService.java:888` dice al Cliente, en la notificación de autoconfirmación: "podés iniciar un reclamo o contactar al comercio". **El reclamo no existe**: la pantalla promete algo sin función.
- Entity/Repository/Service/Controller/DTO/pantallas: no existen.
- Reembolso: `ReembolsoService.generarNotaYReembolsarTotal(Pedido, MotivoNotaCredito)`; `MotivoNotaCredito` = `RECHAZO_COMERCIO`, `CANCELACION_CLIENTE`, `ANULACION_COMERCIO`, `SUSPENSION_COMERCIO`, `EXPIRACION_SIN_RESPUESTA`.

**b) Qué falta.** Entity/Repository/Service/Controller, DTOs, emisión de los 3 avisos, motivo `RECLAMO` en `MotivoNotaCredito` **y en el ENUM físico de `nota_credito.motivo`** (lo creó `V23` con la lista cerrada), pantalla del Cliente (iniciar y ver respuesta) y bandeja del Administrador.

**c) Capas y archivos.**
- Backend: `entities/Reclamo.java`, `enums/EstadoReclamo.java`, `repositories/ReclamoRepository.java`, `services/ReclamoService.java`, `controllers/ReclamoController.java` (Cliente: `POST /api/v1/pedidos/cliente/{id}/reclamo`, `GET` del propio) y rutas del Administrador en `AdministradorController` (`GET /administrador/reclamos`, `PUT /administrador/reclamos/{id}/resolver`); DTOs request/response; `MotivoNotaCredito`; `SecurityConfig` (dos matchers exactos).
- Frontend: `pedido-detalle.html` + `js/pedidos.js` (botón "Hacer un reclamo" en `ENTREGADO`/`NO_RETIRADO` dentro de la ventana, y la respuesta del Administrador), `admin-reclamos.html` + `js/admin.js` (2429 líneas), tile en `admin-dashboard.html` y métrica en `MetricasAdminResponseDTO`.
- "Solo los ve el Administrador": ni `PedidoResponseDTO`, ni `PedidoEmpleadoResponseDTO`, ni `TrazabilidadPedidoService`, ni `ActividadComercioService` deben incluirlo; hay un test de contrato para agregar.

**d) Migraciones.** `V36` (o la que toque): `ALTER TABLE nota_credito MODIFY motivo ENUM(...,'RECLAMO')` (cambio de metadatos si el valor va al final, como `V34`/`V35`). Si se quiere plazo máximo o canal de notificación, columnas nuevas sobre `reclamo` (tabla vacía: sin riesgo de datos).

**e) Concurrencia.** Crear: `usuario` del Cliente (compartido) → `INSERT reclamo` (la FK toma un bloqueo compartido sobre `pedido`); el `UNIQUE (pedido_id)` resuelve la carrera de doble envío (capturar `DuplicateKey` → `409`). Resolver: `usuario` del Administrador → `pedido` `FOR UPDATE` → `pago` → `nota_credito` (mismo orden que `anular`, ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md` "Orden global de bloqueos") → `reclamo`. La nota se crea en la transacción y solo la llamada a MP va después del commit (regla del bloque A0b). Dos Administradores resolviendo el mismo reclamo: leer el reclamo `FOR UPDATE` y revalidar `PENDIENTE`. Carrera contra un proceso automático: un reclamo solo existe sobre pedidos terminales, así que los jobs de pedidos no los tocan.

**f) Impacto en tests.** Casi nulo sobre lo existente (funcionalidad aditiva). Se rompe: cualquier test que compare el texto exacto de `PEDIDO_AUTOCONFIRMADO` si se modifica (spec `49`, `PedidoAutoconfirmadoEquipoIntegrationTest`); `EnumsContraBaseDeDatosIntegrationTest` (compara ENUM físicos contra enums Java: hay que mantener sincronizados `MotivoNotaCredito` y la columna). Nuevos: 1 spec API, 1 spec UI, 1 carpeta de Newman, tests Java del servicio.

**g) Estimación.** A 2 d, B 1,5 d (≈ 3,5 d). La bandeja del Administrador se comparte con Soporte (punto 3): si se hace una sola vista "Casos de atención" el B de ambos baja ~1 d.

**h) Dependencias.** `NotaCredito`/reembolso (ya hecho), Soporte (UI), Libreta no. **Riesgo propio:** `CLAUDE.md` deja pendiente "validar en sandbox cómo MercadoPago reparte el reembolso con `marketplace_fee`"; un reembolso de un pedido ya entregado (semanas después, con el split ya liquidado) no se probó nunca.

**i) Preguntas abiertas (con recomendación).**
1. ¿Plazo para reclamar? Recomiendo 7 días corridos desde `fecha_entrega` (o desde la última fila `NO_RETIRADO` del historial); hoy no hay ninguno.
2. ¿Entra un retiro `ENTREGADO`? Recomiendo sí (el Cliente retiró y reclama calidad) y a domicilio `ENTREGADO` sí; `NO_RETIRADO` solo retiros por definición.
3. ¿El reclamo aprobado reembolsa el total o admite monto parcial? Recomiendo total, con `monto` editable solo hacia abajo en una segunda versión; `nota_resolucion` obligatoria al rechazar.
4. ¿El Dueño se entera de que se le devolvió plata? "Solo los ve el Administrador" contradice el efecto financiero real (el reembolso sale de su cuenta de MP). Recomiendo un aviso al Dueño sin texto del Cliente ("se reembolsó el pedido #N por una resolución de Bajoneá"), o dejarlo asentado como límite conocido.
5. ¿Qué pasa con un reclamo aprobado de un pedido `NO_RETIRADO`? La decisión de A4b es "sin devolución"; el Administrador la revierte. Aceptable, solo documentarlo.

---

### Punto 3 — Soporte

**a) Qué existe hoy.**
- Tabla `soporte` (`V1`): `usuario_id` **NOT NULL**, `mensaje_descargo`, `atendido`, `administrador_id`, `resolucion` (`REACTIVADO` / `SUSPENSION_MANTENIDA`), fechas. Diccionario §7 "Tabla: Soporte" (el diseño es "descargo de un usuario suspendido", con sesión).
- `TipoNotificacion.NUEVO_MENSAJE_SOPORTE` (audiencia `ADMINISTRADOR`), sin emisor.
- Frontend: solo textos estáticos "Contactá a soporte": `js/auth.js:52` (cuenta suspendida), `js/auth.js:149` (comercio no operativo), `js/comercio.js:351` y `:375-378` (`SOPORTE_CONTACTO_URL` de `js/config.js:1`, **vacío**, por lo que el botón de `comercio-rechazo-definitivo.html:30` nunca se ve), `comercio-perfil.html:160`.
- Código de backend, pantallas: no existen.

**b) Qué falta.** Formulario público sin sesión, código de seguimiento, consulta por email + código, bandeja del Administrador, respuesta al usuario (por email, ya que quien consulta no tiene sesión), rate limit.

**c) Capas y archivos.**
- Backend: `entities/Soporte.java` (con columnas nuevas), `SoporteRepository`, `SoporteService`, `SoporteController` público (`POST /api/v1/soporte`, `POST /api/v1/soporte/consulta` con email + código en el cuerpo para no dejar el código en una URL), rutas del Administrador, `EmailService.enviarRespuestaSoporte`, `config/security/RateLimitPublicoFilter` (nuevo grupo de rutas, como el de invitaciones: `app.rate-limit.*-por-minuto`), `SecurityConfig` (`RUTAS_PUBLICAS` por ruta exacta; el test de clasificación de mappings falla si se olvida). `TipoNotificacion.NUEVO_MENSAJE_SOPORTE`: emisor hacia todos los Administradores (hay patrón en `NUEVO_COMERCIO_PENDIENTE`).
- Frontend: `soporte.html` + `js/soporte.js` (formulario y consulta), enlace desde `login.html`, desde los avisos de `auth.js` y `comercio-rechazo-definitivo.html` (reemplaza `SOPORTE_CONTACTO_URL`), bandeja en el Administrador.

**d) Migraciones.** `V36+`: `ALTER TABLE soporte` con `usuario_id` NULL, `email` varchar(254), `codigo_seguimiento` char(10) único, `motivo` ENUM (`CUENTA_SUSPENDIDA`, `COMERCIO_SUSPENDIDO`, `CONSULTA`, `OTRO`), `estado` (`ABIERTO`, `RESPONDIDO`, `CERRADO`), `respuesta` text, `fecha_respuesta`. Tabla vacía hoy (sin entidad): riesgo bajo.

**e) Concurrencia.** Bajo. Alta: `INSERT` con código único (reintento ante colisión, patrón `TokenInsercionRepository`/`InvitacionInsercionRepository`). Responder: `soporte` `FOR UPDATE` y revalidar estado; Administrador y email fuera de la transacción (`EjecucionPostCommit`). Sin cruce con pedidos/comercios salvo que "levantar suspensión" (punto 4) se dispare desde acá: ahí entra el orden `usuario` → `cuenta_mercado_pago` → `comercio`.

**f) Impacto en tests.** Aditivo. Cambia el contrato del enlace en `comercio-rechazo-definitivo.html` (tests de `comercio-rechazo-definitivo`, spec `25`: busca `btn-contactar-soporte`). Mutaciones nuevas del test de clasificación de rutas (`ClasificacionRutasComercioTest`/rutas públicas).

**g) Estimación.** A 1,5 d, B 1,5 d (≈ 3 d).

**h) Dependencias.** Punto 4 (suspensión: es su canal de apelación), punto 6 (FAQ enlaza a soporte), punto 2 (bandeja compartida).

**i) Preguntas abiertas.**
1. Anti-abuso sin sesión: no hay CAPTCHA en el proyecto. Recomiendo rate limit por IP (patrón existente) + límite por email por día + campo trampa; un CAPTCHA queda fuera.
2. ¿La respuesta del Administrador va solo por email o también queda en la consulta por código? Recomiendo ambas (la consulta es el respaldo si el mail cae).
3. ¿Los "descargos" (suspendido) y las consultas generales comparten tabla? Recomiendo sí, con `motivo`.

---

### Punto 4 — Suspensión (Cliente, Empleado, Dueño, Comercio)

**a) Qué existe hoy.**
- **Comercio:** `PUT /api/v1/administrador/comercios/{comercioId}/suspender` → `AdministradorService.suspenderComercio` (líneas 318-352): solo desde `APROBADO` o `APTO_VENTA` (`409` "Solo se puede suspender un comercio aprobado"), motivo libre (`SuspensionComercioRequestDTO`), fila en `historial_estado_comercio`, aviso `COMERCIO_SUSPENDIDO` al Dueño, y `PedidoService.cancelarPedidosPorSuspensionComercio`. **No existe forma de levantarla** (`grep`: sin endpoint, sin servicio; `TipoNotificacion.SUSPENSION_LEVANTADA` sin emisor).
- **Cliente / Empleado / Dueño:** solo el valor `EstadoUsuario.SUSPENDIDO` (`enums/EstadoUsuario.java`) y el mensaje de login "Cuenta suspendida" (`MensajesEstadoCuenta.java:25`), más `TipoNotificacion.CLIENTE_SUSPENDIDO`. No hay endpoint ni servicio que suspenda una cuenta, ni entidad para `historial_estado_usuario` (la tabla existe en `V1`).
- Cuenta bloqueada (distinto de suspendida): sí está completa (`AuthService`, líneas ~377-419: `propagarBloqueoAComercio` y `restaurarComercioSiCorresponde`).
- `AptitudCuentaEmpleadoService`/`MotivoRegularizacionInvitacion.java:28` ya traducen `SUSPENDIDO` al invitar.

**b) Qué falta.** Suspender y reactivar cuentas, levantar la suspensión del comercio, guard del Dueño con el comercio suspendido, matriz de efectos y avisos.

**Matriz propuesta.**

| Sujeto | Quién suspende | Motivos | Efecto sobre pedidos en curso | Cómo se levanta | Avisos |
|---|---|---|---|---|---|
| **Comercio** (existe) | Administrador | Texto libre obligatorio (ya) | `PENDIENTE_CONFIRMACION_COMERCIO` y `EN_PREPARACION` → `CANCELADO_POR_SISTEMA` con nota y reembolso total; `LISTO_PARA_RETIRAR` → timer y cierre `NO_RETIRADO`; `EN_CAMINO` y `PENDIENTE_PAGO` no se tocan (hueco conocido, tramo "rediseño de la suspensión") | **Nuevo:** `PUT /administrador/comercios/{id}/levantar-suspension`; vuelve a `APROBADO` y se recalcula `APTO_VENTA` (si hay MP activa y libreta aprobada, ver punto 5) | `COMERCIO_SUSPENDIDO` (existe) / `SUSPENSION_LEVANTADA` (existe el tipo) al Dueño y, nuevo, al equipo |
| **Dueño** | Administrador | Texto libre | Se suspenden todos sus comercios operativos (reusa la lógica de arriba, uno por uno, id ascendente) | Reactivar cuenta restaura comercios con el mismo recalcular de aptitud | Email al Dueño (no ve la app) + aviso a su equipo |
| **Cliente** | Administrador | Texto libre | `PENDIENTE_PAGO` se cancela; `PENDIENTE_CONFIRMACION_COMERCIO` se cancela con reembolso; los ya aceptados siguen; carrito vaciado; sesión cerrada | Administrador, o por Soporte (punto 3) | `CLIENTE_SUSPENDIDO` (existe el tipo) + email |
| **Empleado** | Es una cuenta de Cliente (`usuario.rol = CLIENTE`, ver `CLAUDE.md` §1bis): se suspende la cuenta como Cliente. La baja en un comercio ya existe (E4: desactivar / renuncia) | — | Sin sesión no opera; la relación `ACTIVO` queda y el fan-out de avisos lo sigue incluyendo | Mismo camino que Cliente | Email; al Dueño el aviso `EMPLEADO_DESACTIVADO` solo si se da de baja la relación |

**El hueco del Dueño con el comercio suspendido.** `ComercioActivoService.java:133-150` (`validarComercioModificable`) responde `409` `COMERCIO_SUSPENDIDO` **solo si el actor es Empleado**; `docs/LISTA-DE-DESPLIEGUE.md` §7 y `CLAUDE.md` §9 lo dejan como hueco conocido. Arreglo: aplicar el mismo guard al Dueño en productos, imágenes, `datos-operativos`, `perfil`; el Dueño ya toma el comercio compartido (`LOCK IN SHARE MODE`) como primera lectura desde el bloque A5b, así que el guard no agrega ningún bloqueo nuevo. Cuidado: para el Dueño no debe bloquear leer ni cerrar/abrir.

**c) Capas y archivos.** Backend: `AdministradorService` (levantar, suspender usuario), `AdministradorController`, `AuthService` (cerrar sesiones, reactivación), `PedidoService` (cancelar pedidos de un Cliente suspendido, nuevo método con `bloquearParaActualizar`), entidad + repo de `HistorialEstadoUsuario`, `EmailService`, `NotificacionService` (emisor de `SUSPENSION_LEVANTADA`, `CLIENTE_SUSPENDIDO`), `ComercioActivoService`. Frontend: botones en `admin-clientes.html`, `admin-comercios.html` (levantar), banner de login (`auth.js`), aviso en el panel del Dueño y del Empleado.

**d) Migraciones.** Probablemente ninguna: `usuario.estado` ya tiene `SUSPENDIDO`, `comercio.estado` ya lo tiene, `historial_estado_usuario` existe. Falta verificar si el ENUM de `historial_estado_comercio.estado_destino` y `historial_estado_usuario` contemplan los estados que se usen (`V12`, `V24` los ampliaron para comercio). Riesgo con datos: bajo.

**e) Concurrencia: alto.** Suspender un Dueño es una cascada: `usuario` (Dueño) → `cuenta_mercado_pago` → N `comercio` (id ascendente) → N × `pedido` (id ascendente) → `pago`/`nota_credito`, con Empleados y Clientes tocando los mismos pedidos. Reglas del proyecto: una transacción por pedido (como `cancelarPedidosPorSuspensionComercio`, que hoy corre dentro de la transacción del Administrador: todo o nada), usuarios involucrados primero con `LOCK IN SHARE MODE` en id ascendente, nunca leer el comercio con bloqueo compartido y después escribirlo (el bug de 126 `Deadlock found` de A2 ya documentado en `AdministradorService.suspenderComercio`). Suspender un Cliente compite con su propio checkout y con el webhook de pago: `usuario` primero, `carrito` última hoja. Estrés nuevo obligatorio (suspender vs. aceptar / pagar / cancelar / bloquear).

**f) Impacto en tests.** Los que dependen de que un `SUSPENDIDO` sea terminal o de que el Dueño pueda editar: `EscriturasEmpleadoIntegrationTest`, spec `42` (el guard para Dueño cambia), `32`-`34` (bloqueo), `61` (lista de Administrador con "Suspender"), carpetas `54` y `55` de Newman, estrés `C2`/`C3`/`A2`.

**g) Estimación.** A 3 d, B 1,5 d (≈ 4,5 d). Versión reducida (levantar suspensión de comercio + guard del Dueño + suspender/reactivar Cliente): ≈ 2,5 d.

**h) Dependencias.** Punto 5 (la función "recalcular aptitud" es la que decide `APROBADO` vs `APTO_VENTA` al levantar), punto 3 (canal de apelación).

**i) Preguntas abiertas (con recomendación).**
1. ¿Suspender un Dueño suspende todos sus comercios y cancela pedidos? Recomiendo sí, reusando la lógica del comercio.
2. ¿Qué pasa con los pedidos `EN_CAMINO` de un comercio suspendido? Recomiendo dejarlos terminar (los confirma el Cliente o el sistema) y documentarlo.
3. ¿Se suspende al Empleado como "persona" o solo se lo da de baja del comercio? Recomiendo lo segundo (E4 ya lo resuelve) y reservar `SUSPENDIDO` para cuentas de Cliente/Dueño.

---

### Punto 5 — Libreta sanitaria

**a) Qué existe hoy.** Nada de la libreta (`docs/mvp-terminado.md` punto 19: cero coincidencias en cuatro búsquedas; lo reconfirmé). Sí existe todo lo que la libreta toca:
- Estados: `EstadoComercio` = `PENDIENTE`, `APROBADO`, `APTO_VENTA`, `RECHAZADO`, `RECHAZO_DEFINITIVO`, `SUSPENDIDO`, `INACTIVO`, `CERRADO_TEMPORALMENTE`.
- `APTO_VENTA` se decide en: `ComercioService.activarAptoVenta` (líneas ~257-296), `desactivarAptoVenta` (~299-312), `AdministradorService.resolverAprobacion` (línea ~284), `MercadoPagoOAuthService.procesarCallback` (línea 131) y `desvincular` (línea 167), `AuthService.restaurarComercioSiCorresponde` (~402-419: "cuentaMpActiva ? APTO_VENTA : APROBADO"), y los atajos de `TestSupportService`/`TestController` (`POST /test/duenos/{id}/mercadopago-simulada`). Footprint de `APTO_VENTA`: 16 archivos de `src/main/java` (≈ 50 apariciones), 3 de `frontend/js`, 39 archivos de test Java, 21 specs de Playwright, 30 scripts, 115 apariciones en la colección de Postman.
- Se exige `APTO_VENTA` para ver el comercio en el catálogo y para pedir (`ComercioService.listarAprobados`, `validarAceptaPedidos`, `CarritoService.agregarItem`, `PedidoService.confirmarPedido`).
- Cloudinary: `CloudinaryService` con `UPLOAD_PRESET = "bajonea_imagenes_mvp"` (jpg, jpeg, png, webp, 5 MB, transformación entrante de ancho 1200 y `quality: auto`, ver Javadoc de la clase y `docs/LISTA-DE-DESPLIEGUE.md` §5).

**b) Qué falta.** Tabla de documentos, firma y preset para PDF, subida solo del Dueño, revisión del Administrador, nueva regla de aptitud, migración de los `APTO_VENTA` actuales, pantallas.

**c) Capas y archivos.**
- Backend: `entities/DocumentoComercio.java` (o `LibretaSanitaria`), `enums/EstadoDocumento`, repo, `DocumentoComercioService`, endpoints del Dueño (`POST /comercios/documentos/firma`, `POST /comercios/documentos`, `GET /comercios/documentos`; **exclusivos del Dueño**, no se agregan a `DelegacionEmpleado`) y del Administrador (`GET /administrador/documentos/pendientes`, `PUT .../{id}/resolver`), `CloudinaryService` (nueva firma con otro preset y carpeta `documentos/{comercioId}/`, parámetro `type`), `ComercioService.recalcularAptitud(Comercio)` que reemplaza las llamadas dispersas, `MercadoPagoOAuthService`, `AuthService`, `AdministradorService`, `TestSupportService` (los atajos de MP simulada deben dejar también un documento aprobado, o ningún test que necesite `APTO_VENTA` funciona).
- Frontend: `comercio-perfil.html`/`comercio.js` ("Documentación": subir, ver estado, motivo de rechazo), el aviso del panel del Dueño (hoy dice "vinculá Mercado Pago": `selector-comercio.js`/`comercio.js`), `admin-documentos.html` + `admin.js`, textos del banner del dashboard y del estado `APROBADO`.
- Notificaciones nuevas (tipo y audiencia): documento aprobado / rechazado (Dueño), nuevo documento pendiente (Administrador); sumar valores al ENUM `notificacion.tipo` (patrón `V34`/`V35`).

**d) Migraciones (V36 en adelante).**
- Tabla `documento_comercio` (id, `comercio_id` o `dueno_id`, `tipo`, `url`, `formato`, `estado` `PENDIENTE|APROBADO|RECHAZADO`, `administrador_id`, `motivo_rechazo`, `subido_por_usuario_id`, fechas) con un índice único parcial por (comercio, tipo, vigente).
- **Migración de datos:** `UPDATE comercio SET estado = 'APROBADO' WHERE estado = 'APTO_VENTA'` más una fila de `historial_estado_comercio` por comercio (patrón `registrarTransicionAutomatica`, motivo "Pasa a requerir documentación sanitaria"). **Riesgo real:** todos los comercios hoy vendiendo desaparecen del catálogo (`listarAprobados` solo lista `APTO_VENTA` y `CERRADO_TEMPORALMENTE`) hasta que el Administrador apruebe su libreta; los carritos con esos comercios dan `409` y no hay forma de que el Cliente lo entienda. Antes de la defensa hay que cargar y aprobar libretas de los comercios de demostración en `bajonea_practicas3`. Pedidos ya en `PENDIENTE_PAGO` de esos comercios: el webhook los confirma igual (el gate está en la creación del pedido).
- Cantidad de comercios afectados: no verificable sin acceso a la base (consulta de solo lectura sugerida: `SELECT estado, COUNT(*) FROM comercio GROUP BY estado`).

**e) Concurrencia: alto.** Es el cuarto actor sobre el mismo comercio: vincular MP, desvincular, aprobar comercio, aprobar documento, bloqueo/desbloqueo de la cuenta. Todos deben terminar en un único `recalcularAptitud` ejecutado **con el comercio `FOR UPDATE`** y releyendo ambas condiciones (MP activa, documento aprobado) bajo ese lock; así el estado converge sea cual sea el orden de llegada. Orden: `usuario` del Dueño (compartido, `duenoBloqueadoConBloqueo`) → `cuenta_mercado_pago` → `comercio` → `documento_comercio` (hoja). Aprobar el documento no debe tocar `pedido`. La regla del bloqueo del Dueño no cambia en lo esencial (`propagarBloqueoAComercio` solo cierra los `APTO_VENTA`), pero `restaurarComercioSiCorresponde` hoy dice `cuentaMpActiva ? APTO_VENTA : APROBADO` y pasa a depender también del documento; y `AdministradorService.resolverAprobacion` (hoy: MP activa → `APTO_VENTA`) hereda la condición, lo que además arregla un caso: un comercio recién aprobado nunca tendrá documento aprobado, así que nace `APROBADO`.
- Desvincular MP: la regla de "pagos pendientes bloquean" (`MercadoPagoOAuthService.desvincular`) no cambia.
- Estrés nuevo: aprobar documento vs. vincular MP vs. desvincular vs. bloquear cuenta vs. aprobar comercio, sobre el mismo comercio.

**Cloudinary y PDF (no verificado contra tu cuenta; sale de leer el código y de lo que sé del servicio):**
- El preset `bajonea_imagenes_mvp` rechaza PDF (`allowed_formats` jpg, jpeg, png, webp) y le aplica una transformación entrante de imagen. Hace falta **un segundo preset** (`bajonea_documentos`, signed, formatos jpg, jpeg, png y pdf, tamaño máximo a definir, sin transformación). Hay que crearlo a mano, también en la cuenta de producción (regla ya anotada en `docs/LISTA-DE-DESPLIEGUE.md` §5).
- Cloudinary sirve PDF bajo el tipo de recurso `image`; la validación de URL (`CloudinaryService.validarUrlEnCarpeta`) fija el prefijo `/image/upload/`, así que serviría tal cual para un documento **público**. Un documento sanitario no debería ser público: la opción privada es subir con `type=authenticated`, que cambia el prefijo de entrega a `/image/authenticated/` y exige URLs firmadas generadas por el backend en cada consulta (el Dueño y el Administrador las piden a un endpoint). Implica cambiar `firmar(folder)` (hoy firma solo `timestamp`, `folder`, `upload_preset`) para firmar también `type`, un validador de URL propio para documentos y un endpoint de URL firmada de vida corta.
- **Recomendación:** documentos `authenticated` (el costo es ~1 d extra de backend y vale la defensa: datos sanitarios del comercio). Alternativa mínima: pública con nombre no adivinable, dejándolo asentado como limitación. `ValidarUrlCloudinary` (solo host `res.cloudinary.com`) no cambia.
- `Caddyfile` ya permite `frame-src https:`; igual conviene abrir el PDF en pestaña nueva en vez de incrustarlo.
- Tests de subida: la cuenta de Cloudinary respondió `cloud_name is disabled` el 2026-10-18 (`docs/DECISIONES.md`); el helper `subirFotoPreRegistro` ya cae a una URL sintética (el backend valida prefijo y carpeta, no la existencia). Los tests nuevos tienen que usar el mismo recurso.

**f) Impacto en tests: el más grande de los puntos de negocio.** Todo test que necesite un comercio vendiendo depende de `APTO_VENTA`: 39 clases Java, 21 specs, 30 scripts/builders, 115 apariciones en Newman. El atajo `POST /api/v1/test/duenos/{id}/mercadopago-simulada` es el punto de apoyo: si además deja un documento `APROBADO` para cada comercio del Dueño, la mayoría no se entera. Se rompen los que prueban explícitamente "vincular MP ⇒ `APTO_VENTA`" (specs `28`, `32`, `34`, `29`, carpetas `52`, `54`, `55`, `EscriturasEmpleadoIntegrationTest`, `ComercioServiceBloqueoVigenteTest`) y los de aprobación con MP activa (`AdministradorServiceResolucionTest`).

**g) Estimación.** A 3 d (tabla, firma/preset, aptitud, migración, atajos, estrés), B 1,5 d (≈ 4,5 d); con documentos autenticados +1 d.

**h) Dependencias.** Punto 4 (levantar suspensión), punto 7 (nada). La fecha de entrega depende de que el preset exista en Cloudinary.

**i) Preguntas abiertas.**
1. ¿La libreta es por Dueño o por comercio? La libreta sanitaria es de la persona o de la habilitación del local; con varios comercios por Dueño recomiendo **por comercio**.
2. ¿El Administrador puede revocar una libreta ya aprobada? Recomiendo no en esta etapa (sin vencimiento, decisión tuya); si el Dueño sube una nueva, la anterior sigue vigente hasta que se resuelva la nueva.
3. ¿Qué ve el Cliente en un comercio sin libreta? Hoy lo ve "desaparecer". Recomiendo no mostrar nada nuevo (es lo mismo que un comercio sin MP).

---

### Punto 6 — Preguntas frecuentes (FAQ)

**a)** No existe nada (`grep` de "faq" y "Preguntas frecuentes": cero). **b)** Una pantalla estática. **c)** `frontend/faq.html` + enlace desde `perfil.html`, `comercio-perfil.html`, `login.html`, `bienvenida.html` y pie de las pantallas de error. Sin JS propio salvo acordeones. **d)** Sin migraciones. **e)** Sin concurrencia. **f)** Sin impacto; `docs/DATA-TESTID-FASE17.md` suma los testids. **g)** A 0, B 0,5 d. **h)** Soporte (enlace "¿No encontraste tu respuesta?"). **i)** El contenido de las preguntas lo tenés que dar vos; propongo 10 a 12 por rol (Cliente, Dueño, Empleado) y que la pantalla lea de un archivo JS estático versionado, sin backend.

---

### Punto 7 — Términos y Condiciones y Política de privacidad

**a) Qué existe hoy.**
- Cliente: `DatosClienteRequestDTO`/`RegistroClienteRequestDTO.aceptaTerminos` (`@NotNull` + `@AssertTrue`, mensaje "Tenés que aceptar los Términos y Condiciones"), checkbox en `js/cliente-form.js` (línea ~136 y vecinas), y la regla de `CLAUDE.md` §5bis: la aceptación se valida y **no se guarda**; no hay página de Términos ni versión ni fecha, y "no se planea hacerla" (decisión tuya).
- Comercio: no hay aceptación (discrepancia 8). Invitación de Empleado: `AceptarInvitacionEmpleadoRequestDTO` exige `aceptaTerminos` para la cuenta nueva.
- Textos de las políticas: no existen en ningún `.html`. Política de privacidad: ninguna mención.

**b) Qué falta.** `terminos.html`, `privacidad.html`, enlaces en los tres registros, y `aceptaTerminos` en el registro de Comercio (y en el alta adicional).

**c) Capas y archivos.** Frontend: dos páginas nuevas, `registro-cliente.html`/`cliente-form.js` (enlace a la página), `registro-comercio.html` + `comercio-form.js` (checkbox nuevo en el último paso), `invitacion-empleado.js`, `agregar-comercio.html`. Backend: `RegistroComercioRequestDTO.aceptaTerminos` (`@NotNull @AssertTrue`).

**d)** Sin migraciones (no se guarda). Si algún día se quisiera trazabilidad, sería `V` aparte; no entra.

**e)** Sin concurrencia.

**f) Impacto en tests: moderado y puramente mecánico** si el campo es obligatorio en el registro de Comercio: el helper central `registrarComercio` de `testing/playwright/tests/helpers/backend.ts`, 10 specs que arman el body a mano, 41 scripts (builders/estreses) que mencionan `registro/comercio`, 178 apariciones de `registro/comercio` en la colección de Newman, 9 clases Java que usan `RegistroComercioRequestDTO`, y el spec `13-registro-comercio-wizard`. Es la misma tarea que hizo A0 de E1 con `aceptaTerminos` del Cliente (se editaron a mano requests de las carpetas `02`, `09`, `42`, `47`). Mitigación: hacerlo en un solo paso con búsqueda y reemplazo y regenerar con los builders.

**g)** A 0,25 d, B 0,75 d, más ~0,5 d de tests (≈ 1,5 d total). **h)** Los textos legales los redactás o aprobás vos. **i)** ¿El texto se escribe a mano en HTML o se pide uno genérico? Recomiendo un texto propio corto, honesto sobre el alcance de un trabajo académico.

---

### Punto 8 — Estadísticas del Dueño

**a) Qué existe hoy.**
- `GET /api/v1/pedidos/comercio/resumen-hoy` (`PedidoController`, `PedidoService.obtenerResumenHoy`, líneas 735-742): total facturado de hoy (neto), pedidos de hoy y pendientes. El Empleado recibe su versión bruta (`obtenerResumenHoyEmpleado`).
- `PedidoService.pedidosLlegadosPagadosHoy` (línea ~752) **carga todos los pedidos pagados del comercio** (`PedidoRepository.findLlegadosPagadosByComercioId`, subconsulta `exists` sobre `historial_estado_pedido`) y filtra "hoy" en Java; el costo crece con el historial (256 ms por página con 30000 pedidos, `docs/LISTA-DE-DESPLIEGUE.md` §7, medido para la Actividad).
- `ActividadComercioService` (lista por cursor de pedidos, ediciones, cierres y equipo), `MetricasAdminResponseDTO` (conteos del Administrador).
- Pantalla: tarjetas del panel (`metrics-row` en `comercio-dashboard.html`, `js/comercio.js`), sin gráficos. No hay librería de gráficos (frontend vanilla).

**b) Qué falta.** Endpoint de estadísticas por rango, consultas agregadas con índice, pantalla.

**c) Capas y archivos.** Backend: `EstadisticasComercioService` (consultas nativas o JPQL de agregación sobre `pedido`), `EstadisticasComercioResponseDTO`, ruta en `ComercioController` (`GET /api/v1/comercios/estadisticas?desde=&hasta=&agrupar=DIA|TURNO`, solo Dueño, **fuera de `DelegacionEmpleado`**). Frontend: `comercio-estadisticas.html` + `js/estadisticas.js` (barras en SVG/CSS a mano, sin dependencias) o una sección nueva del perfil.
Contenido mínimo: pedidos por estado final por día, ingreso neto por día o turno, ticket promedio. "Flujo de pedidos y cuánto fue ganando", como pediste.

**d) Migraciones.** Conviene que viaje con el punto 11: columnas en `pedido` (`fecha_pago_confirmado`, `turno_fecha`, `turno_horario_id`) y un índice `(comercio_id, turno_fecha)`. Sin ellas la consulta tiene que unir con `historial_estado_pedido` para saber la fecha del pago. Riesgo con datos: la columna nueva se rellena desde el historial (ver punto 11).

**e) Concurrencia.** Bajo: lecturas puras bajo REPEATABLE READ, sin bloqueos (mismo criterio que `TrazabilidadPedidoService`). La consulta no debe tomar locks sobre `pedido`.

**f) Impacto en tests.** Aditivo. Cambia el implementador de `resumen-hoy` si se migra a la columna indexada (specs `43`, `52`, `64`; builders `A2b`, carpeta `60` de Newman; `PedidoServiceVistaEmpleadoTest`, `ActividadComercioIntegrationTest`).

**g)** A 1,5 d, B 1,25 d (≈ 2,75 d); versión mínima (solo flujo por día y ganancia neta por día): ≈ 2 d.

**h)** Depende de 11 (turno) para "por turno"; sin 11 solo sirve "por día".

**i) Preguntas.** ¿Rango fijo (últimos 7 y 30 días) o selector de fechas? Recomiendo dos rangos fijos y un modo "turno actual / anterior" (cero UI de calendario). ¿Lo ve el Empleado? Recomiendo no (coincide con "facturación por turno es solo para que el Dueño vea su cierre de caja").

---

### Punto 9 — Email por turno cerrado

**a) Qué existe hoy.**
- `EmailService` (Resend, `com.resend:resend-java`): métodos de verificación, recuperación, reactivación, invitación y regularización; **todos de texto plano** y todos pasan por `enviarTextoPlano`, que **captura cualquier `ResendException`/`RuntimeException` y solo hace `log.warn`** (no devuelve resultado ni reintenta). Con `email.envio-habilitado=false` (perfil `test`) solo loguea.
- `EjecucionPostCommit` (el email sale después del commit).
- Jobs `@Scheduled` existentes (6 métodos en 3 clases): `PedidoSchedulerService` ×4, `ReaperturaComerciosJob`, `InvitacionVencimientoJob`, todos `fixedDelay` de 60 s o 300 s, con bandera de habilitación y ejecución a pedido por `POST /api/v1/test/jobs/...?ahora=`.
- Reloj único `ClockConfig` (zona `app.zona-horaria`, por defecto `America/Argentina/Ushuaia`).
- Facturación por turno / cierre de turno: no existe.

**b) Qué falta.** Cierre de turno persistido, job, email con desglose, reintentos y estado de envío.

**c) Capas y archivos.** `entities/CierreTurno.java`, repo, `CierreTurnoService`, `CierreTurnoJob` (patrón `ReaperturaComerciosJob` + propiedad `turno.cierre.job-habilitado`), `EmailService.enviarResumenTurno(...)` **que devuelva éxito o error** (hoy no se puede saber si falló), plantilla de texto (el proyecto no tiene HTML en emails), `TestController` (`POST /test/jobs/cierre-turnos?ahora=`).

**d) Migraciones.** Tabla `cierre_turno` (ver sección 3). Sin riesgo con datos.

**e) Concurrencia.** Medio. El job no escribe sobre `pedido`; escribe `cierre_turno` con `UNIQUE (comercio_id, turno_fecha, horario_id)` e `INSERT ... ON DUPLICATE KEY UPDATE` (patrón `CarritoInsercionRepository`) para ser idempotente con dos instancias; lee los pedidos con una lectura consistente. Carrera real: un pago confirmado a las 22:59:58 que commitea a las 23:00:03 podría quedar fuera de la foto de las 23:00:00 → **gracia configurable** antes de calcular (propongo 5 minutos, `turno.cierre.gracia-minutos`). El estampado del turno en el pedido ocurre dentro de `confirmarPagoAprobado`, bajo el lock `FOR UPDATE` del pedido (orden global sin cambios).

**f) Impacto en tests.** Aditivo; `EmailServiceTest` crece. La plantilla es texto: sin riesgo de renderizado.

**g)** A 2 d, B 0 (≈ 2 d). **h)** 11 (cierre de turno y datos), 13 (franjas).

**i) Preguntas abiertas (críticas).**
1. **"Uno por Dueño con desglose por comercio"**: si el Dueño tiene tres comercios con turnos que cierran a horas distintas, ¿un mail por cierre o uno por día? Opciones: (a) un mail por cada corrida del job con todos los turnos de ese Dueño que cerraron desde el último envío (lo normal es un comercio por mail, el desglose aparece solo si coinciden); (b) un mail diario cuando cierra el último turno del día de todos sus comercios. **Recomiendo (a):** no requiere conocer "el último turno del día" (que cambia con los horarios editados) y es lo que el Dueño espera "al cerrar".
2. ¿"Neto" es `subtotal − cargo_servicio_comercio` como hoy (`PedidoService.obtenerResumenHoy`)? Recomiendo sí, y mostrar bruto, comisión y neto.
3. Comercios sin ventas en el turno: "se envía aunque sea 0" implica un mail por turno por comercio todos los días; confirmar que está bien con comercios con turno de mediodía y noche (2 mails diarios).

---

### Punto 10 — Nombre único de comercio

**a) Qué existe hoy (la restricción actual).**
- **Solo a nivel de aplicación, por Dueño, nombre + dirección.** `ValidadorComercioDuplicado.validar(duenoId, nombre, direccion, excluirComercioId)` compara contra `direccionRepository.findByDuenoIdConComercioYLocalidad(duenoId)`: nombre, calle, número, piso/depto y localidad normalizados con `TextoUtils.normalizarParaComparar` (NFD sin marcas diacríticas, minúsculas, espacios colapsados); el código postal no cuenta; excluye solo `RECHAZADO`. `MENSAJE_DUPLICADO` = "Ya tenés un comercio con ese nombre en esa dirección...". Dos Dueños distintos pueden repetir el nombre (spec `22:466`).
- Base de datos: `comercio.nombre` varchar(150) con colación `utf8mb4_unicode_ci` (insensible a mayúsculas y tildes); **sin ningún índice único** (solo `idx_comercio_dueno` e `idx_comercio_estado`).
- Quién escribe el nombre: alta (`RegistroService`), alta adicional (`AltaComercioAdicionalService`), corrección de un rechazado (`ComercioCorreccionService` → `ComercioEdicionService.actualizarDatosBasicos`, línea ~79) y **edición del perfil del Dueño** (`ComercioService.editarPerfil`, línea ~163, que hoy **no llama al validador**: se puede renombrar a un duplicado). Se aplica `TextoUtils.aTitleCase` antes de guardar.

**b) Qué falta.** Índice único global sobre el nombre normalizado, invertir la regla de estados, chequear en la edición del perfil, mensaje nuevo, detección previa de duplicados existentes.

**c) Capas y archivos.** `ValidadorComercioDuplicado` (pasa a consultar por nombre en toda la tabla), `ComercioService.editarPerfil`, `ComercioEdicionService.actualizarDatosBasicos`, `AltaComercioAdicionalService`, `RegistroService`, `GlobalExceptionHandler` (traducir `DataIntegrityViolationException` del índice a `409`, como se hizo con `V27`), `ComercioRepository` (consulta por nombre normalizado), frontend `comercio-form.js` (mensaje del paso 1) y `comercio-perfil` (error al editar).

**d) Migración y la columna generada.** Precedente: `V27__cuenta_mercado_pago_mp_user_id_activo_unico.sql` (columna `GENERATED ALWAYS AS (CASE WHEN activa = 1 THEN mp_user_id ELSE NULL END) STORED` + `UNIQUE`, no mapeada por JPA).
```sql
ALTER TABLE comercio
  ADD COLUMN nombre_unico varchar(150)
    GENERATED ALWAYS AS (CASE WHEN estado = 'RECHAZO_DEFINITIVO' THEN NULL
      ELSE LOWER(TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' '))) END) STORED,
  ADD UNIQUE KEY uq_comercio_nombre_unico (nombre_unico);
```
- Con la colación `utf8mb4_unicode_ci` la comparación del `UNIQUE` ya ignora mayúsculas y tildes (`Café` = `cafe`); la expresión solo agrega el recorte y el colapso de espacios. Ojo: la versión Java de `normalizarParaComparar` también quita marcas por NFD (`ñ` → `n`), mientras que la colación `unicode_ci` trata `ñ` y `n` como letras distintas. **Sin ajustar, la base y el validador discreparían en `ñ`**; propongo que el validador Java decida el mensaje amigable y la base sea la red de seguridad (nunca más permisiva que Java).
- Una generada STORED no puede referenciar columnas que cambian de estado sin que MariaDB la recalcule: lo hace solo en el `UPDATE` de `estado` (comportamiento esperado, igual que `mp_user_id_activo`). Pasar de `RECHAZO_DEFINITIVO` a otro estado no existe en el código.
- `REGEXP_REPLACE` existe en MariaDB desde 10.0.5, no verifiqué que `STORED` lo acepte en la 10.4 del servidor; **probarlo en una base descartable antes de commitear la migración**.
- **Detectar duplicados antes de migrar** (consulta de solo lectura, no ejecutada):
```sql
SELECT LOWER(TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' '))) AS clave, COUNT(*) AS n, GROUP_CONCAT(id) AS ids, GROUP_CONCAT(estado) AS estados
FROM comercio WHERE estado <> 'RECHAZO_DEFINITIVO'
GROUP BY clave HAVING n > 1;
```
Si hay filas, la migración falla al crear el índice (y Flyway deja la versión en fallida). Hay que resolverlas a mano antes (renombrar, o pasar a `RECHAZO_DEFINITIVO` las de prueba). Riesgo alto en `bajonea_practicas3` si quedan comercios de prueba con el mismo nombre; no pude ejecutarla.

**e) Concurrencia.** El `UNIQUE` hace la serialización: dos altas simultáneas del mismo nombre → una falla con `DataIntegrityViolationException` → `409`. Sin locks nuevos. Renombrar un comercio (edición del perfil) hoy ocurre con el comercio ya bloqueado; el `UPDATE` del nombre toma el índice único, sin cambio de orden. Cuidar que el aviso por bloqueo no se traduzca a `500` (el patrón de `V27` ya lo hace en `CuentaMercadoPagoService`).

**f) Impacto en tests: el más extenso de los chicos, por los nombres fijos.** Colisionarían dentro de una misma base:
- Specs/helpers: `helpers/backend.ts` genera `Comercio E2E ${suf}` (sufijo único: seguro); pero los builders de Newman y los estreses usan nombres literales repetidos: `Local Pedidos A0`, `Local Trazabilidad A3`, `Local Orden A5b`, `Local No Retirado A4b`, `Local Matriz A5`, `Local Escrituras A2`, `Local Equipo E4`, `Local Carrito E3`, `Local Avisos A4`, `Local Autoconfirmado A6`, `Local Actividad A2b`, `Comercio Matriz Base`, `Sucursal Postman Base`, `Multi Postman B Editado`, `Comercio Unico Editado`. Cada builder se corre una vez por base reseteada (regla vigente de Newman: "base reseteada en cada corrida"), así que **no colisionan hoy**; sí colisionan dos corridas sin reset, y los builders que registran varios comercios con el mismo nombre dentro de la misma corrida (`build-multicomercio-tramo2a`: 20 menciones de "duplicado"; `build-multicomercio-tramo3a`).
- **Los tests que prueban "mismo nombre, otra dirección es un comercio distinto" y "dos Dueños pueden tener el mismo nombre" cambian de significado**: `22-multicomercio-tramo2a-alta-adicional.spec.ts` (líneas 384-466), `24-...:796-827`, `23-...:277`, `AltaComercioAdicionalServiceTest`, `ComercioCorreccionServiceTest`, carpeta `50`-`51` de Newman. Hay que reescribirlos (más o menos 8 a 10 tests y 1 carpeta).
- Seeds: `datos-prueba/scripts/datos-fase1.mjs` y `datos-fase2.mjs` (nombres reales de comercios de demostración; no los leí en detalle) y `postman/limpiar-datos-postman.sql`.

**g)** A 1,25 d, B 0,5 d (≈ 1,75 d) más 0,5–1 d de reescritura de tests (incluido arriba). **h)** Ninguna. **i)** ¿Qué pasa con la dirección? La unicidad por nombre hace innecesario el chequeo por dirección: recomiendo **reemplazar** el chequeo actual (no sumarlo), y avisar al Dueño con un mensaje nuevo ("Ya existe un comercio con ese nombre. Elegí otro").

---

### Punto 11 — Facturación por turno

Ver el modelo único de turno en la sección 3. Resumen del punto:

**a) Qué existe hoy.** "Facturado hoy" = día calendario 00:00 a 24:00 (`PedidoService.pedidosLlegadosPagadosHoy`: `LocalDate.now(clock).atStartOfDay()` hasta +1 día), sumando `ESTADOS_FACTURADOS` = `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `NO_RETIRADO` (línea 137). Dueño: neto (`subtotal − cargoServicioComercio`). Empleado: bruto (`subtotal`). Sin concepto de turno en ningún lado.

**b) Qué falta.** Modelo de turno, estampado en el pedido, `cierre_turno`, resumen "del turno", pantalla.

**c) Capas y archivos.** `DisponibilidadComercioService` (nuevo `turnoDe`), `PedidoService.confirmarPagoAprobado` (estampar), `PedidoService.obtenerResumenHoy*` (pasan a "turno"), DTOs `ResumenPedidosHoy*ResponseDTO` (renombrar a "turno" o sumar campos), `entities/Pedido.java`, `CierreTurno*`, `comercio.js` (tarjetas del panel del Dueño y del Empleado).

**d) Migraciones.** `ALTER TABLE pedido ADD fecha_pago_confirmado, turno_fecha, turno_horario_id` + backfill desde `historial_estado_pedido` (fila `PENDIENTE_CONFIRMACION_COMERCIO`) + `INSERT` de `cierre_turno` para turnos pasados no es necesario. Backfill de `turno_*`: solo para pedidos con horario vigente conocido; los demás quedan en `NULL` y el panel los agrupa por día (documentarlo). Riesgo medio: `ALTER` sobre `pedido` (tabla grande en producción), pero `ADD COLUMN` NULL en MariaDB 10.4 es de metadatos o copia según la versión; no verificado.

**e) Concurrencia.** Bajo-medio. El estampado ocurre en la transacción que ya tiene el pedido `FOR UPDATE` (webhook y `sincronizar` comparten `aplicarResultadoPago`/`confirmarPagoAprobado`). Lee `horario` sin bloqueo.

**f) Impacto en tests.** Cambian: specs `43`, `52`, `64`, `05`, `30`, `31`; builders `A2b`, `A3`, `A5`; carpeta `60` y `64` de Newman; Java `PedidoServiceVistaEmpleadoTest`, `ActividadComercioIntegrationTest`, `PedidoNoRetiradoServiceTest` (suman en "facturado"). El nombre "Ventas de hoy" cambia de texto: `data-testid` y literales en specs `38`, `52`, `64`.

**g)** A 2,5 d, B 1,25 d (≈ 3,75 d). **h)** 13 (modelo de franja), 9 y 8 consumen. **i)** Ver sección 3 (pago fuera de franja, definición de "ventas del turno" para el Empleado, bruto vs neto).

---

### Punto 12 — Precios no modificables dentro de una franja

**a) Por dónde se puede cambiar hoy un precio.**
- **Un único endpoint:** `PUT /api/v1/productos/{id}` (`ProductoController.editarProducto` → `ProductoService.editarProducto`, líneas ~100-150: detecta el cambio con `producto.getPrecio().compareTo(request.getPrecio()) != 0`, escribe `producto.setPrecio` y registra "precio" en `historial_edicion_comercio`). Es una de las 17/18 escrituras delegables, así que **lo usan el Dueño y el Empleado** (`DelegacionEmpleado`).
- El alta (`POST /api/v1/productos`) fija el precio inicial: libre, como pediste.
- `PATCH /productos/{id}/estado`, imágenes y firmas no tocan el precio.
- No encontré importaciones ni cargas masivas en `src/main` ni otro `setPrecio` (`grep` de `setPrecio` y `.precio(`: solo `ProductoService`). `TestSupportService` no escribe precios. Fuera del backend: SQL a mano y los scripts de `datos-prueba/scripts/02-cargar-productos*.mjs` (que solo crean por el endpoint de alta).
- **El carrito no guarda el precio:** `item_carrito` no tiene columna de precio y `CarritoService`/`PedidoService.confirmarPedido` leen siempre `producto.getPrecio()` vigente (líneas 245-250 y 199-240). O sea "se cobra el precio vigente" ya es el comportamiento; **lo que falta es el aviso** (`grep` de "cambió"/"precio actual" en `carrito.js` y `checkout.js`: nada).

**b) Qué falta.** Guard de la franja, mensaje legible, aviso de cambio de precio en carrito/checkout, y el manejo del reloj en tests.

**c) Capas y archivos.**
- `ProductoService.editarProducto`: después de bloquear el producto (relación → comercio compartido → producto `FOR UPDATE`, orden de A5b) y **solo si el precio cambió**, consultar `DisponibilidadComercioService.dentroDeFranja(horarios, ahora)` (la franja, no `abiertoAhora`: el cierre manual **no** libera). Se lanza `ConflictoComercioException` con `data.codigo = PRECIO_BLOQUEADO_EN_HORARIO` y texto sin nombres internos, por ejemplo: "No podés cambiar precios mientras tu comercio está en horario de atención (hasta las 23:00). Hacelo fuera de ese horario." Mismo guard para Dueño y Empleado. Un comercio sin franjas no queda bloqueado.
- Aviso de cambio: `item_carrito` suma `precio_visto` (se estampa al agregar o al ver el carrito); `CarritoResponseDTO` devuelve `precioCambio` por ítem; `carrito.js` y `checkout.js` muestran un aviso y el total nuevo; `PedidoRequestDTO` recibe `totalEsperado` y `confirmarPedido` responde `409` con los montos nuevos si difiere (evita cobrar más sin que el Cliente lo vea).
- Frontend: `comercio-producto-form.html` + `comercio.js` (mostrar el `409` con `mostrarAvisoFijo`, ya existe para los `409` de reglas del comercio; deshabilitar el campo precio con texto "Se puede cambiar fuera de tu horario" es opcional).

**d) Migraciones.** `V36+`: `ALTER TABLE item_carrito ADD COLUMN precio_visto decimal(10,2) NULL`. Sin riesgo con datos (los carritos viejos quedan sin aviso).

**e) Concurrencia.** El guard corre con el producto ya bloqueado; lee `horario` sin bloqueo (si la edición de horarios, punto 13, versiona en lugar de borrar, una lectura vieja nunca ve un estado incoherente). Sin locks nuevos y sin cambio en el orden de A5b. Es la razón para hacer el guard dentro de `editarProducto` y no en el controller. El `totalEsperado` se compara dentro de la transacción de `confirmarPedido`, con el producto leído como hoy.

**Reloj en tests.** El `Clock` es un bean `Clock.system(zona)` (`ClockConfig`): no se puede mover en un backend ya levantado, y Playwright/Newman golpean un backend real. Opciones:
1. Propiedad `precio.bloqueo-en-franja.habilitado` (por defecto `true`; `false` en `application-test.properties`, igual que `pedido.jobs.habilitado` e `invitacion.vencimiento.job-habilitado`) más un atajo `PUT /api/v1/test/precio-bloqueo?habilitado=` (`TestController`, `@Profile("test")`, probado por los tests de "atajos fuera del perfil") para encenderlo en un spec dedicado.
2. En ese spec dedicado no hace falta mover el reloj: se registra un comercio con un horario calculado alrededor de "ahora" (el helper `tests/helpers/zona.ts` ya calcula la zona): una franja que contiene el instante → `409`; una que no → `200`. Así el guard se prueba de verdad, con reloj real.
3. Java: `DisponibilidadComercioServiceTest` ya usa un `Clock` fijo; el test del guard igual.
**Recomendación: 1 + 2.** Un reloj inyectable mutable a nivel de aplicación suma riesgo (afecta ~100 usos del reloj) y no da más cobertura.

**f) Impacto en tests: medio.** Con el bypass en el perfil `test` casi nada se rompe. Los tests que **editan precio** (con el flag en `true`) son los de `PUT /productos/{id}` con `precio` distinto: specs `06`, `15`, `42` (líneas 131, 254, 491), `50` (líneas 62, 124), `51` (línea 185), `53`, `21:248`; Newman: 16 requests `PUT /productos/{id}` (carpetas `14`, `49`, `58`, `59`, `66`, `67`), builders `A1`, `A2`, `A5`, `A5b`, `matriz-comercio`; estreses `A1` a `A6`, `A5` (36 menciones), `e4`; Java: `EscriturasCatalogoOrdenDeBloqueoIntegrationTest`, `EscriturasEmpleadoIntegrationTest`, `HistorialEdicionComercioIntegrationTest`, `PertenenciaCruzadaDelegablesIntegrationTest`. Con la propiedad en `false` en `application-test.properties` ninguno cambia; los que corren en el perfil por defecto sí.

**g)** A 1,25 d, B 0,75 d (≈ 2 d). **h)** 13 (la definición de franja y de "versión vigente"). **i) Preguntas.**
1. ¿Se bloquea también el campo `precio` cuando el comercio tiene `cerrado_manualmente`? Dijiste que sí (ni siquiera con el comercio cerrado); el guard usa franja pura.
2. ¿Bloquea la ventana de un turno que cruza medianoche en su tramo de madrugada? Debe, y lo da el modelo A.
3. ¿El aviso de cambio de precio exige reconfirmar? Recomiendo sí (`totalEsperado`).

---

### Punto 13 — Edición de horarios

**a) Qué existe hoy.**
- Entidad `Horario` (`dia_semana`, `hora_apertura`, `hora_cierre`; sin vigencia), validación `ValidadorDatosNegocioComercio.validarHorarios` (líneas 51-76): **`horaCierre` tiene que ser posterior a `horaApertura`** y no se pueden superponer dos franjas del mismo día. O sea: una franja que cruza medianoche solo se puede cargar como dos filas (`20:00-23:59` y `00:00-02:00` del día siguiente).
- Carga solo en el registro (`RegistroService.guardarHorarios`) y en la corrección de un comercio rechazado (`ComercioEdicionService.reemplazarHorarios`, línea 173: **borra todas las filas y carga las nuevas**). El Javadoc de esa clase dice "mañana, la edición de horarios".
- **No hay endpoint de edición** para un comercio aprobado: `alcance-y-limitaciones.md:247` ("edición de horarios... hoy no existe para nadie y es obligatoria a futuro (se delegará al Empleado)"). El perfil muestra los horarios en solo lectura.
- `DisponibilidadComercioService.dentroDeFranja`, `proximoInicioDeFranja`, `textoReapertura`, `finDeFranja` (23:59 ⇒ 24:00); el Javadoc documenta la limitación: "las franjas que cruzan la medianoche... no se unen: un cierre manual en el primer tramo de una franja partida se reabre en la segunda fila".
- Frontend: `comercio-form.js` `initHorarios` (pestañas "fijo" / "personalizado", filas por día).

**b) Qué falta.** Endpoint y servicio de edición, versionado por fecha, soporte de franja que cruza medianoche, historial, delegación al Empleado, pantalla de edición.

**c) Capas y archivos.** `ComercioEdicionService.reemplazarHorarios` (pasa a versionar), `ValidadorDatosNegocioComercio.validarHorarios`, `DisponibilidadComercioService`, `ReaperturaComerciosJob`/`CierreComercioService` (franjas), `ComercioController` (`PUT /comercios/perfil/horarios`), `DelegacionEmpleado` (suma una ruta exacta; el Empleado "edita solo descripción, teléfono y horarios" según `CLAUDE.md` §1bis, decisión 6 de E3), `HistorialEdicionComercioService` (`TipoEntidadEdicion` suma `HORARIO` o se registra como COMERCIO con campo "horarios"), `CampoCambioComercio.HORARIOS` (ya existe), DTOs y `comercio-perfil.html`/`comercio.js` (vista de edición, reusando `initHorarios`).

**d) Migraciones.** `ALTER TABLE horario ADD vigente_desde date NOT NULL DEFAULT '2000-01-01', ADD vigente_hasta date NULL, ADD KEY (comercio_id, vigente_desde)`; filas existentes quedan vigentes desde siempre. Una edición no borra: cierra las filas vigentes con `vigente_hasta = hoy` y crea las nuevas con `vigente_desde = mañana` ("rigen desde el día siguiente"). **Migración de datos de medianoche:** unir pares existentes (fila que cierra `23:59` el día D + fila que abre `00:00` el día D+1) en una fila con `hora_cierre = hora_cierre del segundo`; requiere una consulta de revisión manual previa, porque un comercio con una apertura legítima a las 00:00 sin continuidad no debe fusionarse.

**e) Concurrencia.** Medio. Escribir horarios debe tomar el comercio (`FOR UPDATE` directo, como `datos-operativos`/`cerrar`/`abrir`: leerlo compartido y escribirlo es el patrón que interbloqueó 126 veces, ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md`). Orden: relación (S) → comercio (X) → horarios. Con filas versionadas, el guard de precios y el cálculo de `abiertoAhora` leen sin bloqueo sin ver nunca un estado a medias (hoy el `deleteAll` + `saveAll` sí podría exponer una ventana sin franjas).

**f) Impacto en tests.** Cambia: `DisponibilidadComercioServiceTest` (20 tests, todos con filas de un día), `ReaperturaComerciosJob` tests, `CierreComercioServiceTest`, specs `13`, `25`, `30`, `31`, `33`, builder `build-multicomercio-tramo6a`, carpeta `53`; el helper de registro de Comercio manda `horarios` con la forma actual (se mantiene válida). Nuevo: spec de edición (API y UI), carpeta de Newman, Java, estrés de edición de horarios vs cerrar/abrir vs aceptar pedido.

**g)** A 2 d, B 1,25 d (≈ 3,25 d). **h)** Es la base de 11, 12, 9 y 8.

**i) Preguntas.**
1. ¿"Rigen desde el día siguiente" también para la **primera** carga? No: el registro sigue siendo inmediato (`vigente_desde` por defecto).
2. ¿Se edita también en `comercio-corregir`? Sí, sin versionado (el comercio todavía no vende).
3. ¿Qué pasa con un cierre manual cuando mañana cambia la franja? La reapertura usa "la primera franja que empieza después de la última fila `CERRADO`" (`DisponibilidadComercioService.momentoDeReferencia`): leer la versión vigente del día que corresponda, no la de hoy.

---

### Punto 14 — Múltiples direcciones del Cliente

**a) Qué existe hoy.**
- Base: `direccion` ya soporta N por Cliente: `cliente_id`, `principal`, `eliminada` (baja lógica), `fecha_baja`; el único `UNIQUE` es `uq_direccion_comercio` (una por comercio). `pedido.direccion_id` apunta a `direccion` (FK).
- Código: `DireccionRepository.findByClienteId(...)` devuelve **un `Optional`** (`ClienteService.java:87` lo usa); el Cliente se registra con una dirección (`RegistroService`) y `ClienteResponseDTO.direccion` es una sola, de solo lectura (Tramo 16.3). `ClienteController` expone `GET/PUT /clientes/perfil` y `PUT /clientes/perfil/nombre-usuario`; **no hay CRUD de direcciones**. `PedidoService.confirmarPedido` valida que la dirección sea del Cliente y no esté `eliminada` (ya soporta N), y el DTO de pedido recibe `direccionId`.
- Frontend: `perfil.html`/`cliente.js:113` muestra la única dirección; `checkout.js:213-259` toma `cliente.direccion` y la confirma; "C41 (editar dirección) pospuesta, sin endpoint real" (`CLAUDE.md` §6, Tramo 2).

**b) Qué falta.** CRUD de direcciones del Cliente (listar, agregar, editar, baja lógica, marcar principal), selector en el checkout, UI en el perfil.

**c) Capas y archivos.** `DireccionClienteService`, `DireccionClienteController` (`/api/v1/clientes/direcciones`), `ClienteService` (el DTO pasa a lista, manteniendo `direccion` como la principal por compatibilidad), `DireccionRepository` (listar activas), `PedidoService` (sin cambios de lógica), `frontend/perfil.html`/`js/cliente.js` (lista y formulario, reusando `js/geografia.js` y `DireccionRequestDTO`), `checkout.js` (selector).

**d)** Sin migraciones de esquema. Una dirección `principal` única por Cliente es una regla de aplicación (se podría reforzar con una columna generada, no hace falta). Riesgo con datos: bajo.

**e) Concurrencia.** Medio-bajo. Marcar principal: bloquear primero el `usuario` del Cliente, luego las direcciones del Cliente `FOR UPDATE` en id ascendente, y recién ahí cambiar `principal` (si no, dos clics dejan dos principales). Baja lógica de una dirección usada por un pedido en curso: es baja lógica y la FK no se rompe. Carrera con `confirmarPedido` (que ya valida `eliminada`): el pedido toma `usuario` S primero; la baja de dirección toma `usuario` S y la dirección X: sin ciclo mientras la dirección se lea con el mismo criterio dentro del pedido.

**f) Impacto en tests.** Cambian: specs `11`, `12`, `04`, `05` (checkout con dirección), `13`, `19`, la matriz de Cliente (`build-matriz-cliente-postman.mjs`, `MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md`), Java `ClienteServiceTest`. Aditivo en el resto si `direccion` se mantiene como "la principal".

**g)** A 1,5 d, B 1,5 d (≈ 3 d). **h)** Ninguna.

**i) Recomendación.** Es una mejora de comodidad sin vínculo con las decisiones de esta etapa y con impacto en el camino de compra. **Reducir a "editar la dirección" (3 endpoints y la UI del perfil, ≈ 1,5 d) o descartar**; si quedan días al final, hacerlo.

---

## 3. Modelo único de turno (puntos 8, 9, 11, 12, 13)

### 3.1 Qué hay hoy (resumen)

| Pieza | Hoy |
|---|---|
| Franja | Una fila `horario` por franja y día; `hora_cierre` > `hora_apertura` obligatorio; una franja de madrugada son dos filas |
| "Abierto ahora" | `DisponibilidadComercioService.dentroDeFranja` (solo mira el día de hoy; 23:59 vale hasta 24:00) |
| "Hoy" del panel | Día calendario, `PedidoService.pedidosLlegadosPagadosHoy` |
| Fecha de pago | No se guarda: se deriva de `historial_estado_pedido` |
| Cierre | Sin concepto; no hay tabla ni job de cierre de turno |

### 3.2 Una fila con indicador de cruce vs. filas enlazadas

| | **A. Una fila, el cruce se deduce** (`hora_cierre <= hora_apertura`) | **B. Filas enlazadas** (`franja_siguiente_id`) |
|---|---|---|
| Representación | Una fila por turno; el día de la fila es el de apertura | Dos filas por turno, una apuntando a la otra |
| `dentroDeFranja` | Mira las filas de hoy y las de ayer que cruzan: una condición más | Sin cambios |
| Turno de un instante | Directo: la fila contiene el instante (hoy, o ayer si cruza) | Hay que seguir la cadena para saber dónde empezó y dónde termina |
| Cierre manual y reapertura | Se resuelve: el turno es uno solo (hoy es la limitación documentada) | La limitación sigue: dos filas |
| Integridad | `CHECK (hora_cierre <> hora_apertura)` | El par no tiene forma de garantizarse en la base |
| Edición con vigencia | Una fila por cambio | Pares a versionar juntos |
| Migración de datos | Fusionar pares existentes `23:59` + `00:00` (revisión manual) | Detectar los mismos pares para enlazarlos |
| UI | Una fila por turno (la UI ya muestra filas por día; hay que permitir cierre menor que apertura) | La UI tiene que ocultar el enlace |

**Recomendación: A.** Cuesta una condición más en `dentroDeFranja`, evita el defecto ya documentado y permite que "turno" sea una clave simple. La columna de cruce no hace falta guardarla: se puede exponer como columna generada virtual (`hora_cierre <= hora_apertura`) si se quiere consultar.

### 3.3 Identidad del turno y asignación del pedido

- **Turno = (comercio, `turno_fecha`, `horario_id`)**, donde `turno_fecha` es la fecha de apertura (los pedidos de madrugada pertenecen al turno del día anterior).
- **Se estampa en el pedido al confirmarse el pago**, dentro de `confirmarPagoAprobado` (bajo el lock del pedido, con el `Clock` de la aplicación): `pedido.fecha_pago_confirmado`, `pedido.turno_fecha`, `pedido.turno_horario_id`. Ventajas: la regla "un pedido pertenece al turno de su pago" queda inmutable aunque después se editen horarios ("rigen desde mañana") y las estadísticas y el cierre dejan de recorrer el historial.
- **Pago confirmado fuera de toda franja** (un pedido creado a las 22:50, pagado a las 23:10 con el comercio cerrado a las 23:00; la expiración del pago es de 30 minutos): no está decidido. Recomiendo asignarlo al **último turno terminado** de ese comercio dentro de la ventana de pago (el pedido se creó cuando estaba abierto). Si no hay turno anterior, `turno_*` queda en `NULL` y se muestra bajo el día. *Pregunta abierta 3.7.1.*
- Pedidos anteriores a la migración: `fecha_pago_confirmado` desde el historial; `turno_*` solo si hay horario vigente conocido, si no `NULL`.

### 3.4 Cómo calcularía `DisponibilidadComercioService` el turno de un pago y su cierre

- `Optional<TurnoRef> turnoDe(comercioId, LocalDateTime instante)`: carga las filas vigentes del comercio para `fecha(instante)` y `fecha(instante) − 1`; para cada fila del día de hoy, contiene el instante si `apertura <= hora < cierre` (o `hora >= apertura` si cruza); para cada fila de ayer que cruza, si `hora < cierre`. Devuelve `(turnoFecha, horarioId)`.
- `LocalDateTime finDelTurno(turno)`: `fecha + cierre`, sumando un día si cruza.
- Quitar la convención `23:59 ⇒ 24:00` (`finDeFranja`) para filas nuevas; mantenerla para las existentes hasta fusionarlas.
- `proximoInicioDeFranja` y `textoReapertura` siguen igual, pero buscan sobre la versión vigente de cada fecha futura.
- El `Clock` se usa **una vez** por operación y se pasa hacia abajo (`ahora()` ya es la única fuente).

### 3.5 Cierre de cada turno: job, zona, reintentos, falla de Resend

- **Job** `CierreTurnoJob`, `@Scheduled(fixedDelay = 60_000)` (mismo patrón que `ReaperturaComerciosJob`), propiedad `turno.cierre.job-habilitado` (en `false` en el perfil `test`) y ejecución a pedido con `POST /api/v1/test/jobs/cierre-turnos?ahora=`. Zona: el reloj único (`America/Argentina/Ushuaia`).
- **Selección:** por cada comercio operativo (`APROBADO`, `APTO_VENTA`, `SUSPENDIDO` y `CERRADO_TEMPORALMENTE` también, porque tuvieron ventas) y cada franja vigente cuya hora de fin más la gracia ya pasó y que no tiene fila en `cierre_turno`, mirando una ventana de los últimos 3 días para ponerse al día tras una caída.
- **Cálculo (foto):** `cierre_turno(comercio_id, turno_fecha, horario_id, inicio, fin, cantidad_pedidos, bruto, comision, neto, anulados, creado, email_estado, email_intentos, email_proximo_intento, email_ultimo_error)` con `UNIQUE (comercio_id, turno_fecha, horario_id)`. La foto se toma una sola vez; lo que pase después (un pedido anulado a la mañana siguiente) no la cambia. Es lo que verá el Dueño como "cierre de caja".
- **Gracia** de 5 minutos configurable antes de calcular (carrera de commits, sección 2, punto 9).
- **Email:** un mail por corrida y por Dueño con todos los `cierre_turno` suyos en `email_estado = PENDIENTE`, con desglose por comercio (bruto, comisión, neto, cantidad de pedidos). Se envía aunque sea 0. `EmailService.enviarResumenTurno` devuelve éxito o error en lugar de tragar la excepción.
- **Reintentos:** si Resend falla, `email_estado` sigue `PENDIENTE`, `email_intentos + 1`, `email_proximo_intento` con retroceso (por ejemplo 10, 30 y 60 minutos, tope de 5 intentos) y `email_ultimo_error`; pasado el tope queda `FALLIDO` con un `log.error` (sin otro canal de aviso al Dueño; podría salir una notificación in-app `RESUMEN_TURNO_NO_ENVIADO` si se quiere). **Una falla de Resend nunca bloquea el cierre ni los demás Dueños**: el cierre se persiste antes y cada Dueño se procesa en su propia transacción y `try/catch`.
- **Idempotencia y varias instancias:** la fila se reclama con `UPDATE ... SET email_estado = 'ENVIANDO' WHERE id = ? AND email_estado = 'PENDIENTE'` (afectadas = 1 gana). La semántica es al-menos-una-vez: un caído entre el envío y el marcado repite el mail; se acepta.
- **No verificado:** límites de tasa de Resend, tamaño máximo y reputación del remitente (`info@bajonea.ar`); en una cuenta gratuita podría haber topes diarios.

### 3.6 Bruto vs. neto: "ventas de hoy" del Dueño y del Empleado

Hoy (`PedidoService.obtenerResumenHoy` vs. `obtenerResumenHoyEmpleado`): el Dueño ve **neto** (`subtotal − cargoServicioComercio`) y el Empleado **bruto** (`subtotal`), con el mismo rótulo "Facturado hoy". Es la incoherencia que mencionás; además hay otra anotada como deuda (`docs/DECISIONES.md`, 2026-10-18): la lista de pedidos del Dueño muestra `pedido.total` (con el cargo del cliente) y el detalle muestra el neto.

**Propuesta: resolverla por definición y por rótulo, no por ocultamiento.**
- "**Vendido en el turno**" = suma del `subtotal` de los pedidos facturables del turno (bruto, lo que se vendió en productos). Lo ve el Dueño y, si lo conservás, el Empleado: el mismo número y el mismo nombre.
- "**Comisión de Bajoneá**" y "**Neto del turno**" (`bruto − comisión`): solo Dueño (el Empleado no ve `cargoServicioComercio` por decisión del 2026-10-18).
- El mail y la estadística muestran las tres cifras (bruto, comisión, neto); la cifra principal del mail es el neto, como decidiste.
- El panel del Dueño pasa de "Facturado hoy" a "Neto del turno" con el bruto en segundo plano.
- Pregunta de producto: ¿el Empleado sigue viendo ventas? Dijiste que "la facturación por turno es solo para que el Dueño vea su cierre de caja". Hoy el Empleado ya ve "Ventas de hoy" (E2). Si se quita es un cambio visible; recomiendo **mantener** "Vendido en el turno" para el Empleado y que el cierre, el mail y las estadísticas sean exclusivos del Dueño.

### 3.7 Preguntas abiertas del modelo de turno

1. Pago fuera de franja: ¿al último turno terminado (mi recomendación), al siguiente, o queda "sin turno"?
2. Turno sin pedidos y comercio cerrado todo el día (cierre manual): ¿se genera cierre y mail en 0? Dijiste "aunque sea 0": recomiendo sí.
3. Un comercio `SUSPENDIDO` o `CERRADO_TEMPORALMENTE` por bloqueo en medio de un turno: recomiendo que el turno cierre igual y el mail salga.
4. Un pedido anulado o reembolsado después del cierre: la foto no cambia; ¿se muestra en el panel como "ajuste posterior"? Recomiendo no hacerlo en esta etapa (límite documentado).
5. Edición de horarios con turno en curso: la versión nueva rige desde mañana, así que el turno de hoy cierra con la versión vigente a la fecha de apertura. Cubierto por `vigente_desde`.

---

## 4. A) Interfaz y heurísticas de Nielsen

### 4.1 Cantidad real de pantallas

`frontend/` tiene **44 archivos `.html`** más **6** de errores en `frontend/errores/` (`404`, `500`, `acceso-denegado`, `sesion-expirada`, `sin-conexion`, `timeout`). Agrupación por rol (por el nombre del archivo; algunas son compartidas):

| Rol | Pantallas | Archivos |
|---|---|---|
| Públicas / acceso | 11 | `splash`, `bienvenida`, `login`, `registro-tipo-cuenta`, `registro-cliente`, `registro-comercio`, `verificar-email`, `recuperar-password`, `reactivar-cuenta`, `invitacion-empleado`, `seleccionar-contexto` |
| Cliente | 9 | `index`, `explorar`, `comercio-detalle`, `carrito`, `checkout`, `pedidos`, `pedido-detalle`, `notificaciones`, `perfil` |
| Dueño / Empleado (comercio) | 12 + 1 | `comercio-dashboard`, `comercio-pedidos`, `comercio-pedido-detalle`, `comercio-productos`, `comercio-producto-form`, `comercio-perfil`, `comercio-corregir`, `comercio-pendiente`, `comercio-rechazado`, `comercio-rechazo-definitivo`, `agregar-comercio`, más `notificaciones` compartida |
| Administrador | 13 | `admin-dashboard`, `admin-comercios`, `admin-comercios-pendientes`, `admin-comercio-detalle`, `admin-resolicitudes`, `admin-resolicitud-detalle`, `admin-comercio-equipo`, `admin-comercio-actividad`, `admin-clientes`, `admin-categorias`, `admin-tags`, `admin-tarifas`, `admin-reembolsos` |

Más de 20.000 líneas de JS (`comercio.js` 3196, `admin.js` 2429, `catalogo.js` 1241) y un único `css/styles.css` de 5883 líneas. Las pantallas nuevas de esta etapa suman ~10: `soporte`, `faq`, `terminos`, `privacidad`, `admin-reclamos`/atención, `admin-documentos`, `comercio-estadisticas`, vista de horarios, y direcciones.

### 4.2 Cuadro por heurística (evidencia de código; severidad 0–4 de Nielsen, estimada por mí)

| # | Heurística | Hallazgos más frecuentes | Ejemplos concretos | Sev. |
|---|---|---|---|---|
| 1 | **Visibilidad del estado** | Buen uso de skeletons, polling de 15 s y toasts de éxito en toda acción (tramo de toasts de E4). Pocos avisos asistivos: 3 `role="alert"` y 1 `aria-live` en todo el frontend; los botones con texto de progreso son pocos (`Guardando` ×4 en `comercio.js`, `Enviando` ×2 en `auth.js`, `Guardando` ×2 en `perfil-cuenta.js`). Un lector de pantalla no se entera de cambios de estado | `js/cierre-comercio.js`, `js/selector-comercio.js` (skeleton bien hecho); `js/api.js` (toast pendiente tras redirección) | 2 |
| 2 | **Correspondencia con el mundo real** | Español rioplatense y mensajes de negocio sin nombres de enum (tramo del 2026-10-18). Pero hay promesas sin función: la notificación de autoconfirmación dice "podés iniciar un reclamo" y no existe; "Contactá a soporte" ×5 sin destino (`SOPORTE_CONTACTO_URL` vacío) | `PedidoService.java:888`; `js/config.js:1`; `js/auth.js:52`, `:149`; `comercio-rechazo-definitivo.html:30` (botón oculto para siempre) | **3** |
| 3 | **Control y libertad del usuario** | Los formularios multipaso no guardan borrador: no hay `sessionStorage` de formularios (los `setItem` son de sesión, contexto y toasts); un refresco o un "atrás" pierde el registro de Comercio de 4 pasos. Solo `agregar-comercio.js:106` avisa "Vas a perder lo que cargaste" al salir. No hay "deshacer" ni confirmación consistente | `js/comercio-form.js` (registro, corrección, alta adicional), `js/cliente-form.js` | **3** |
| 4 | **Consistencia y estándares** | Sistema visual consistente (tokens `--color-*` en `:root`, una sola hoja). Deuda: 249 `style="..."` en HTML y 221 usos de `.style`/`style=` en JS (`comercio-dashboard.html:15,17,22` entre otros), lo que dificulta cambios globales y el escritorio; rótulos que conviven ("Facturado hoy" neto para el Dueño y bruto para el Empleado; total con cargo en la lista y neto en el detalle) | `comercio-dashboard.html`; `PedidoService.obtenerResumenHoy*` | 2 |
| 5 | **Prevención de errores** | Bien: validación en vivo en registro, botones `disabled` hasta que cargan (carreras corregidas en E1 y E4), confirmaciones en acciones destructivas del comercio. Mal: los `<input type="date">` de nacimiento no tienen `min`/`max` (`js/cliente-form.js:136`, `registro-comercio.html:213`, `comercio-corregir.html:207`) y el control real está después de enviar; sin protección al salir de formularios largos | `docs/mvp-terminado.md` punto 18 | 2 |
| 6 | **Reconocer antes que recordar** | Botones con ícono + aria-label (46 en HTML y 41 en JS); chips de filtro visibles; menús "tres puntos" ocultan acciones (Reenviar / Cancelar invitación) | `js/equipo-comercio.js`, `js/equipo-vistas.js` | 2 |
| 7 | **Flexibilidad y eficiencia** | Sin atajos para el uso diario del Dueño: no hay búsqueda en pedidos (hay en productos y explorar), ni filtros por fecha; sin estadísticas ni vistas por turno | `comercio-productos.html` y `explorar.html` (búsqueda), `comercio-pedidos.html` (solo chips de estado) | 2 |
| 8 | **Diseño estético y minimalista** | Pantallas limpias y de una columna; el panel del Dueño tiene muchas capas apiladas (franja de comercio, banner, cierre, métricas, pedidos). Tipografía chica: 50 declaraciones de `12px`, 17 de `11px`, 44 de `13px` | `css/styles.css` | 2 |
| 9 | **Ayudar a reconocer, diagnosticar y recuperarse de errores** | Seis páginas de error dedicadas, `409` de negocio con aviso fijo y texto en español, errores por campo bajo cada input. Sin salida a ayuda real (soporte) | `frontend/errores/*`, `js/form-utils.js` (`mostrarAvisoFijo`) | 2 |
| 10 | **Ayuda y documentación** | **No existe**: sin FAQ, sin ayuda contextual (las únicas "ayudas" son leyendas puntuales como `texto-ayuda-renuncia`), sin Términos ni Privacidad, sin soporte funcional | puntos 3, 6 y 7 de esta auditoría | **3** |
| — | **Accesibilidad (transversal, no es una heurística)** | `--color-primary #ff4700` sobre blanco da ≈ 3,4:1 (cálculo mío con la fórmula WCAG): no llega a 4,5:1 para texto chico, y los botones primarios llevan texto blanco; el placeholder `#b0a9a3` es más bajo aún (≈ 2,3:1); `--color-text-muted #7a736e` da ≈ 4,7:1 (pasa); objetivos táctiles de `30–36 px` de alto en varios controles (`styles.css:127, 444, 1004, 1534, 1593, 1617, 1686, 2099`) frente a 44 px recomendados; ninguna regla `prefers-reduced-motion`; solo 5 reglas `:focus`/`:focus-visible` | `css/styles.css` | **3** |

*No verifiqué visualmente la aplicación corriendo (no se levantó el backend ni el navegador); los hallazgos salen de leer HTML, JS y CSS. Los cocientes de contraste son cálculos propios, a confirmar con una herramienta.*

### 4.3 Esfuerzo de la pasada de interfaz mobile

| Bloque | Qué incluye | Días |
|---|---|---|
| Críticos de severidad 3 | Contraste del naranja en botones y textos chicos, objetivos táctiles de 44 px, `prefers-reduced-motion`, `role="alert"`/`aria-live` en `renderBanner` y `showToast`, `min`/`max` en las fechas de nacimiento, ayuda real (puntos 3, 6, 7), borrador de formularios multipaso en `sessionStorage` | 2,5 |
| Consistencia | Sacar los `style=` más repetidos a clases, unificar rótulos de montos | 1 |
| Revisión por familia con un recorrido manual | Cliente (9), Comercio (12), Admin (13), Auth (11), con capturas a 375 px | 1–1,5 |
| **Total** | | **4,5 d** (focalizada en sev. 3–4: **2,5–3 d**) |

La pasada completa de las 49 pantallas (44 + 6 de error menos las compartidas) no entra junto con el resto; recomiendo la focalizada y aplicar las heurísticas a las pantallas nuevas mientras se construyen.

---

## 5. B) Escritorio

### 5.1 Estado actual

`.app-shell` (`css/styles.css:84-98`) tiene `max-width: var(--screen-max-width)` (460 px) y, desde 640 px de ancho, se centra como tarjeta con `border-radius: 24px` y sombra: **hoy en escritorio la aplicación es el teléfono dentro de un marco**. El archivo tiene **un solo `@media`** (`min-width: 640px`) en 5883 líneas. El resto de las medidas son de columna única (`max-width: 320px`, `62%`, `calc(100% - 96px)`). Las hojas inferiores (modales) están pensadas para pie de pantalla.

### 5.2 Opción 1: breakpoints sobre el mismo HTML y CSS

- Alcance: contenedor más ancho (`--screen-max-width` por breakpoint, 720 px y 1100 px), grillas de 2 a 3 columnas en listas (catálogo `index`/`explorar`, `pedidos`, productos del comercio, tablas del Administrador), navegación inferior que pasa a barra lateral desde 1024 px (los `top-bar-slot`/`bottom-nav-slot` los arma JS: `renderTopBar`/`renderBottomNav` en `catalogo.js`), hojas inferiores que pasan a diálogo centrado, y revisión de los `style=` fijos que impiden el reflujo.
- Costo por rol: Cliente 1,5 d, Dueño/Empleado 2 d, Administrador 1,5 d, Auth 0,5 d: **≈ 5 d completo; ≈ 2–3 d mínimo** (contenedor ancho + 2 columnas en las 4 listas principales + diálogos centrados + nav lateral solo para Dueño y Administrador).
- Riesgos: los 249 + 221 estilos en línea; un CSS único de ~6000 líneas; los tests dependen de que el layout a 1280×720 sea el actual (ver 5.4).

### 5.3 Opción 2: pantallas separadas de escritorio

Duplicar los 44 HTML y su JS por rol (≈ 90 archivos), con `data-testid` repetidos y el doble de mantenimiento para cada punto de esta etapa. Esfuerzo orientativo: 12 a 15 d para solo cubrir lo existente, y cualquier cambio posterior se hace dos veces. **Descartada.**

### 5.4 Impacto en Playwright

- El proyecto único `chromium` usa `devices['Desktop Chrome']` (1280×720) y hoy el layout a ese ancho es la tarjeta de 460 px. **Cambiar el layout de ≥ 1024 px cambia el layout bajo el que corren los ~960 tests.** Riesgo: localizadores que dependen de la barra inferior, de la posición de los diálogos o de `sinScrollHorizontal` (`tests/helpers/layout.ts`).
- Mitigación recomendada: **fijar el viewport por defecto a 390×844** (móvil, que es lo que realmente describe la aplicación hoy) y agregar un segundo proyecto `escritorio` (1280×800) con un conjunto chico de specs etiquetados (`@escritorio`, ~15 a 20 tests: login de cada rol, catálogo, panel del Dueño, pedidos, productos, Administrador). Tiempo de la corrida completa: la suite tarda 30,8 min con 962 tests (`docs/DECISIONES.md`, 2026-10-15), unos 1,9 s por test; 20 tests extra suman ≈ 1 min. **Duplicar la suite entera en escritorio la llevaría a ≈ 60 min: no recomendado.**
- El proyecto `webkit` (iPhone 13) existe pero no se corre; sigue siendo deuda.

### 5.5 Recomendación

**Opción 1, versión mínima (≈ 2–3 d)**, aplicada solo a Administrador y Dueño/Empleado (los roles que usan la aplicación desde una computadora) y con 2 columnas en el catálogo del Cliente; resto de pantallas del Cliente sigue siendo la tarjeta centrada. Cambiar antes el viewport por defecto de Playwright a móvil, y agregar el proyecto `escritorio` con ~15 tests.

---

## 6. C) Deuda y pendientes conocidos

### 6.1 E4, bloque A4 y el estrés de carrito

- `docs/DECISIONES.md`, 2026-10-15, "Tramo E4, bloque A4: cierre y verificación": **figura como hecho** (pendiente de tu confirmación): `mvnw test` 854/854 + 6/6, Newman 3176 requests y 4989 assertions sin fallos, Playwright 962 tests (950 pasaron; fallan los conocidos `27:497` y `53:304`, y el spec 53 completo repetido dio 21/21), **los 18 estreses del runner OK con 0 `Deadlock found` y 0 `Lock wait timeout`** (37,2 min), con `carrito` incluido ("es la primera vez que corren los 18 juntos, con `carrito` incluido"), y ocho mutaciones M1 a M8 (M7, el purgado por rango, es intermitente).
- `docs/entregables-01-02/CAMBIOS.md`, sección "Tramo E4, bloque A4": registra la limpieza de requisitos y qué copiar a `01.` y `02.`. Regresión posterior: toasts y lista de Administrador (860 + 6, Newman 3197 requests, Playwright 987/988 con falla solo `27:497`) y los ajustes del 2026-10-18 (sin migraciones; Newman 00-03, 49, 57, 59, 61, 64; los specs de Cloudinary no se corrieron por `cloud_name is disabled`).
- Lo que quedó explícitamente sin hacer en el cierre: mutación M7 determinista, causa raíz de `27:497` y `53:304`, nombre del comercio en los endpoints del equipo, íconos por tipo de aviso, email de reactivación, WebKit/iPhone.

### 6.2 Recomendaciones de la mesa final

| Recomendación | Estado verificado |
|---|---|
| **Límite del año de nacimiento** | Parcialmente hecha. El Cliente tiene tope de 120 años y fecha futura prohibida (`FechaNacimientoPlausibleValidator`, con `LocalDate.now()` del sistema, no el `Clock`) y piso de edad de 14 años desde el bloque A6 (`@EdadMinima(anios = 14)` en el getter de `RegistroClienteRequestDTO`): una fecha del año en curso ya no pasa. El representante de Comercio exige 18 (`FechaNacimientoRepresentanteValidator`). **Falta**: `min`/`max` en los `<input type="date">` (`js/cliente-form.js:136`, `registro-comercio.html:213`, `comercio-corregir.html:207`); el bloqueo ocurre al salir del campo o enviar. `docs/mvp-terminado.md` punto 18 describe el estado anterior a A6. |
| **Persona jurídica solo con CUIT** | **No encontré la recomendación en ningún documento.** Estado del código: el registro pide `cuit` (`DatosLegalesComercioRequestDTO`, `@ValidarCuit`), razón social, condición de IVA, domicilio fiscal, fecha de inicio de actividades **y además** el DNI del representante (`dniRepresentante`, obligatorio, `@ValidarFormatoDni`). Si la recomendación es "no pedir DNI de la persona jurídica", hoy lo que se pide de DNI es el del representante, no de la sociedad; no puedo confirmar la intención. |
| **Pérdida de datos en formularios multipaso** | **No hecha.** No hay persistencia de borrador (`sessionStorage`/`localStorage` solo guardan sesión, contexto, comercio activo y toasts: `grep` de `setItem`). Hay una advertencia al salir solo en el alta adicional (`js/agregar-comercio.js:106`, "Vas a perder lo que cargaste"). `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md:632` ya lo mencionaba como pendiente. |
| **Cambio de contraseña autenticado con token** | **No encontré la recomendación en ningún documento.** Estado del código: `POST /api/v1/auth/cambiar-password` (`AuthController`, `AuthService.cambiarPasswordDesdePerfil`, líneas ~220-240) exige sesión JWT y la contraseña actual, con bloqueo por 3 intentos y cierre forzado de la sesión; la recuperación sin sesión usa un código de 6 dígitos por email (`/recuperar-password`). Si "con token" significa pedir un código por email también estando logueado, **no existe**. El Empleado ya no tiene "Cambiar contraseña" dentro del comercio (E3 etapa 2). |
| **Libreta sanitaria** | No existe (punto 5). |
| **Testing cross-browser / cross-device** | Solo Chromium Desktop corre; el proyecto WebKit/iPhone existe en `playwright.webkit.config.ts` y no se ejecuta (sección 5.4). |

### 6.3 Aviso al Cliente por pedido no retirado (T36)

Implementado en E3, bloque A4b: `TipoNotificacion.PEDIDO_NO_RETIRADO` (audiencia `CLIENTE`), `PedidoService.avisarPedidoNoRetirado` (llamado desde el cierre manual `cerrarComoNoRetirado` y desde `autoconfirmarRetirosPorSuspension`, líneas 567 y 973), texto `MENSAJE_NO_RETIRADO` = "Tu pedido #%d no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago.", en la misma transacción del cambio de estado. Cobertura: `PedidoNoRetiradoServiceTest`, `PedidoNoRetiradoHttpIntegrationTest`, specs `47` y `48`, carpeta `64` de Newman. Observaciones: (1) `V34` agregó el valor a los tres ENUM. (2) **El texto afirma que el comercio lo cerró también cuando fue el sistema por la suspensión del comercio** (el mismo texto en las dos vías, como dice el bloque). (3) Si se implementa Reclamos con `NO_RETIRADO`, el texto "no hay devolución" conviene complementarlo con el camino de reclamo.

### 6.4 `docs/LISTA-DE-DESPLIEGUE.md` (59 líneas, ocho secciones)

1. Zona horaria: la JVM, la base y la aplicación tienen que coincidir; arrancar con `-Duser.timezone=America/Argentina/Ushuaia`; unos 100 `LocalDateTime.now()` siguen en la zona de la JVM; la constante `ZONA_COMERCIO` del frontend (`js/fechas.js`) es independiente.
2. Perfil de Spring: nunca `test` en producción (`/api/v1/test/**` público con ese perfil); `MERCADOPAGO_API_BASE_URL` no debe estar definida.
3. Credenciales del repositorio: 44 variables `*_password` en `postman/Bajonea-Local.postman_environment.json`; la contraseña del Administrador de producción distinta de cualquiera ya publicada; `ADMIN_PASSWORD` por entorno.
4. Red y base: `server.forward-headers-strategy` para la IP real detrás del proxy; `sql_mode` estricto; último Flyway `V35` (y que `V29` salga con el enum Java); datos anteriores al reloj único no migrados.
5. Variables de entorno: `JWT_SECRET`, `RESEND_API_KEY`/`MAIL_FROM`, `CLOUDINARY_*`, `MERCADOPAGO_*` (incluida `MERCADOPAGO_WEBHOOK_SECRET` sin la cual se omite la firma), `FRONTEND_BASE_URL`/`BACKEND_BASE_URL`; **preset de Cloudinary `bajonea_imagenes_mvp` a crear a mano, y la cuenta de producción distinta de la de pruebas**.
6. Frontend: fuentes pedidas a Google Fonts; `js/api.js` fija `http://localhost:8080/api/v1` (se cambia a mano); WebKit/iPhone sin probar.
7. Aceptado: tope de emails de regularización, retención de `notificacion` y de los historiales, costo de la Actividad, el hueco del Dueño con comercio suspendido.
8. Hallazgos A5-1 a A5-3: resueltos en A5b.

**Faltan en la lista, por esta etapa:** un segundo preset de Cloudinary para documentos (punto 5); variables del cierre de turno (`turno.cierre.*`); `email.envio-habilitado` en `true` y remitente verificado en Resend; que ningún proceso de `@Scheduled` corra duplicado si Don Web levanta dos instancias (los procesos actuales son idempotentes, el nuevo también por diseño); y toda referencia a Railway (`application-production.properties`, `Caddyfile`) a revisar contra el proveedor real.

---

## 7. D) Orden de ejecución propuesto y qué se cae

### 7.1 Presupuesto

Cuatro semanas = 20 días hábiles (24 con sábados), de los cuales reservo 2 para cierre, documentación (diccionario v1.21, `CLAUDE.md`, `alcance-y-limitaciones.md`, DFD) y ensayo de la defensa. Quedan **18 a 22 días de construcción**. Lo decidido suma ≈ 43 días de mis estimaciones: el exceso es de más del 100 % sobre el techo bajo. **No se puede prometer todo.**

### 7.2 Orden recomendado (dependencias primero, riesgo temprano)

| Orden | Puntos | Días | Acumulado | Por qué ahí |
|---|---|---|---|---|
| 1 | **10** Nombre único | 1,75 | 1,75 | Chico, aislado, rompe tests de nombres: conviene hacerlo con la base limpia y antes de sumar más tests |
| 2 | **7 + 6** Términos, Privacidad y FAQ | 1,5 | 3,25 | Casi sin riesgo; toca los helpers de registro de Comercio una sola vez; los textos los necesito tuyos temprano |
| 3 | **13** Edición de horarios (modelo de turno A) | 3,25 | 6,5 | Base de 11, 12, 9 y 8; es el cambio de mayor riesgo del bloque de turnos |
| 4 | **12** Precios no modificables en franja | 2 | 8,5 | Pequeño una vez que la franja está bien definida |
| 5 | **11** Facturación por turno | 3,75 | 12,25 | Columnas en `pedido`, `cierre_turno`, resumen del turno |
| 6 | **9** Email por turno cerrado | 2 | 14,25 | Consume 11 |
| 7 | **8** Estadísticas (mínimas) | 2 | 16,25 | Consume 11 |
| 8 | **5** Libreta sanitaria | 4,5 | 20,75 | Recomendación de los profesores; toca la máquina de estados del comercio |
| 9 | **3 + 2** Soporte y Reclamos mínimos, bandeja compartida | 4,5 | 25,25 | Dependen de una bandeja del Administrador común |
| 10 | Levantar suspensión de comercio + guard del Dueño (punto 4 reducido) | 1,5 | 26,75 | Reusa `recalcularAptitud` del 5 |
| 11 | Escritorio mínimo + pasada de interfaz focalizada | 5,5 | 32,25 | Última, sobre pantallas ya definitivas |

**Conclusión del cálculo: ≈ 32 días contra 18 a 22 disponibles.** Para entrar en las cuatro semanas, hay que elegir entre estos cortes. (La fila 11 ya está reducida a la versión mínima de escritorio y de pasada de interfaz.)

### 7.3 Qué se cae, en este orden

1. **Punto 1 (Extras): descartado desde el inicio.** (−9 a −11 d)
2. **Punto 14 (Direcciones múltiples): descartado** (−3 d); si sobran días, solo "editar la dirección".
3. **Punto 4 completo: reducido** a levantar la suspensión de un comercio y al guard del Dueño; la suspensión de Cliente, Empleado y Dueño queda como diseño documentado (matriz de arriba). Se mantiene dentro del orden 10.
4. **Escritorio: solo contenedor ancho y 2 columnas** (−2,5 d de la versión completa); la pasada de interfaz se reduce a los críticos de severidad 3 (−2 d).
5. **Estadísticas (8): solo "ganancia neta por día" y "flujo de pedidos por estado"** (ya incluido en 2 d).
6. Si aún no alcanza: **Reclamos (2)** se difiere y se deja el botón "Contactar a soporte" apuntando al formulario de Soporte (−3,5 d); es lo único que obliga además a retirar el texto "podés iniciar un reclamo" de `PedidoService.java:888`.

Con los cortes 1 a 3 el total ronda **≈ 27 días** (filas 1 a 10 de la tabla), todavía por encima de 18 a 22. Mi recomendación es dividir en dos tandas:
- **Núcleo (filas 1 a 8, ≈ 20,75 días):** puntos **10, 7, 6, 13, 12, 11, 9, 8 (mínimo) y 5**. Cabe en el presupuesto de construcción y es lo que más pesa en la defensa (turno, precios, libreta de los profesores, nombre único).
- **Segunda tanda, condicionada al ritmo real:** **3 (Soporte)**, el levantar-suspensión (punto 4 reducido), **2 (Reclamos)**, escritorio mínimo y pasada de interfaz focalizada (≈ 14 días en total; entra a lo sumo la mitad). Orden de caída dentro de esta tanda: primero la pasada de interfaz completa, después Reclamos, después escritorio, y Soporte y levantar-suspensión son lo último que se cae porque son las únicas salidas reales a los textos "contactá a soporte".
- Definir ahora, antes de empezar, que los puntos **1, 14 y el resto del 4** no se hacen.

### 7.4 Qué hacer en la primera semana para reducir riesgo

- Correr en `bajonea_practicas3` la consulta de duplicados de nombre y el `GROUP BY estado` de comercios (punto 10 y 5), de solo lectura.
- Crear el preset de Cloudinary de documentos (punto 5) y confirmar si la cuenta nueva está activa (`cloud_name is disabled` el 2026-10-18).
- Redactar o aprobar los textos de FAQ, Términos y Privacidad.
- Decidir las preguntas bloqueantes: 3.7.1 (pago fuera de franja), punto 9 pregunta 1 (frecuencia del mail), punto 5 pregunta 1 (libreta por Dueño o por comercio), punto 2 pregunta 1 (plazo de reclamo).

---

## 8. Cierre de la auditoría

- **Archivos leídos:** unos 60, completos o por tramos, entre `CLAUDE.md` (inyectado), 8 migraciones (`V1`, `V2`, `V23`, `V27`, `V28`, `V34` y las citadas por nombre), unos 25 de `backend/src/main/java` (entre ellos `DisponibilidadComercioService`, `ValidadorComercioDuplicado`, `TextoUtils`, `PedidoService`, `ProductoService`, `ComercioService`, `ComercioEdicionService`, `AdministradorService`, `AuthService`, `EmailService`, `CloudinaryService`, `ClockConfig`, `PedidoSchedulerService`, `TipoNotificacion`, `Direccion`, `Horario`, `ValidadorDatosNegocioComercio`, `UrlCloudinaryValidator`, `FechaNacimientoPlausibleValidator`, y los mapeos de 9 controllers), `application.properties`, `application-test.properties`, `application-production.properties`, `Caddyfile`, `styles.css` (por tramos), 4 HTML, 8 JS (por grep), 10 documentos de `docs/` (`DECISIONES.md`, `LISTA-DE-DESPLIEGUE.md`, `CAMBIOS.md`, `mvp-terminado.md`, `recorrido-trabajo-final.md`, `diccionario-de-datos.md`, `CONCURRENCIA-Y-TRANSACCIONES.md`, `AUDITORIA-FORMULARIOS-PENDIENTES.md`, `alcance-y-limitaciones.md`, `requisitos-funcionales-*`) y los configs de Playwright; más búsquedas por patrón sobre `backend/src`, `frontend/`, `testing/` y `postman/`.
- **No pude verificar:** ningún comportamiento en ejecución (no levanté backend, base ni navegador); qué hay en `bajonea_practicas3` (comercios en `APTO_VENTA`, duplicados de nombre); el comportamiento real de Cloudinary con PDF y con `type=authenticated` (lo describo desde conocimiento general, a confirmar contra la cuenta); que `REGEXP_REPLACE` acepte `STORED` en la 10.4 del servidor; límites de Resend; cualquier cosa específica de Don Web; los cocientes de contraste (son cálculos propios); los nombres de comercios de demostración dentro de `datos-prueba/scripts/*.mjs` (no los leí); la versión real de MariaDB.
- **Discrepancias con el prompt:** las doce de la sección 0, en particular: Extras ya marcado "QUITAR"; Don Web ausente del repo y variables de entorno con forma de Railway; la regla de duplicados invertida; dos de las cuatro recomendaciones de la mesa final sin respaldo documental; reclamos solo a domicilio en los requisitos.

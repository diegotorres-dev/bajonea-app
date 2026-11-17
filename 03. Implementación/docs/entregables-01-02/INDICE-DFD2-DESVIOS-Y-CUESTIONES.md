# ÍNDICE DFD NIVEL 2 (versión 2) — Desvíos, cuestiones abiertas y chequeo cruzado contra el Nivel 1

Consolidación de solo lectura de los informes `MAPEO-DFD2-TRAMO-*.md` (tramos A a J). No se modificó ningún archivo del proyecto salvo este y `CIERRE-DFD2-PLAN-DE-CORRECCIONES.md`.

**Versión 2.** Reescribe la versión 1 sin quitar nada: incorpora el Tramo J (desvíos D-68 a D-79 y cuestiones C-57 a C-65), reclasifica los flujos 34, 38, 39 y 64 del Nivel 1, resuelve la §6.5 "Sin informe", aclara la §1.3 y agrega el inventario de los 80 diagramas dibujados (§9). El detalle de lo que cambió está en la §8 "Cambios respecto de la versión 1". Sin propuestas de refactor. Textos entre comillas = literales de los informes (que a su vez los toman del código).

## 0. Insumos, método y convenciones

**Informes leídos (13 de 13, ninguno faltante):** `MAPEO-DFD2-TRAMO-A.md`, `-A-COMPLEMENTO.md`, `-B.md`, `-B-COMPLEMENTO.md`, `-C.md`, `-D.md` (informe parcial), `-D-COMPLEMENTO.md`, `-E.md`, `-F.md`, `-G.md`, `-H.md`, `-I.md`, `-J.md` (nuevo en la versión 2: cubre los huecos que dejó la versión 1). No existe `-C-COMPLEMENTO`, `-E-COMPLEMENTO` ni similares.

**Nivel 1 usado:** `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 1/Diagrama de Flujo - Nivel 1 - Código Mermaid.md` (incluye Visitante y P8 Soporte). Existe una copia distinta en `docs/entregables-01-02/Diagrama de Flujo - Nivel 1 - Código Mermaid.md` (sin Visitante ni P8, con "extras", "1 h", "90 días"); sus diferencias están en la §4.4.

**Qué se leyó completo y qué por muestreo (límite de este índice):** de cada informe se leyeron completas las secciones de consolidación (desvíos, dudas, NO RELEVADO, archivos revisados, inventarios y hallazgos que cambian el dibujo), el tramo I completo en sus Partes 2 y 3 y su resumen, y el cuerpo de A-COMPLEMENTO §4 y de B-COMPLEMENTO. Los cuerpos proceso por proceso de A, B, C, D, E, F, G, H e I (secciones 1 a 7 de cada diagrama) se recorrieron por encabezados y búsqueda de texto, no línea por línea. Las filas de las §2 a §3 salen de las listas consolidadas de cada informe; si un cuerpo contiene un desvío que su informe no consolidó, no figura acá. El Tramo J (versión 2) se leyó completo: J1 a J3, la parte final, el resumen de desvíos y cuestiones y su sección NO RELEVADO.

**Ningún informe ejecutó la aplicación, la base ni las suites de pruebas:** todo sale de lectura de código y documentación (A-COMPLEMENTO: "No se ejecutó nada contra el backend"; E §10: "todo el informe sale de lectura de código, no de ejecución"; G y H: relevamiento de solo lectura; I §2.7: "solo inventario"; J: "No se ejecutó la aplicación, la base ni las suites").

**Id compuesto.** Los informes repiten ids entre tramos (ver §1). Para no renumerar, cada fila se identifica con `tramo·id-de-origen`, por ejemplo `A·D-01`. `D-COMPL` = `MAPEO-DFD2-TRAMO-D-COMPLEMENTO.md`; `D` = `MAPEO-DFD2-TRAMO-D.md`; `J` = `MAPEO-DFD2-TRAMO-J.md`.

**Abreviaturas de documentos** (carpeta `docs/entregables-01-02/` salvo indicación): RF-gen, RF-cli, RF-com, RF-due, RF-emp, RF-adm, RF-sis = `requisitos-funcionales-generales/cliente/comercio/dueño/empleado/administrador/sistema.md`; RNF = `requisitos-no-funcionales.md`; HU-x = `Historias de Usuario - x.md`; DIC = `diccionario-de-datos.md`; CONC = `docs/CONCURRENCIA-Y-TRANSACCIONES.md`; ALC = `alcance-y-limitaciones.md`; CLAUDE = `CLAUDE.md`; N1 = DFD Nivel 1. "(código/código)" = el informe lo marca como diferencia entre dos partes del código, sin documento citado.

---

## 1. Inconsistencias de numeración (sin renumerar)

### 1.1 Ids de desvíos (`D-xx`) repetidos entre tramos

| Rango de ids | Cuántos informes lo usan | Dónde |
|---|---|---|
| D-01 a D-06 | 4 | A (D-01…D-20), B (D-01…D-18), C (D-01…D-16), D (D-01…D-06; D-COMPL continúa desde D-07) |
| D-07 a D-16 | 4 | A, B, C, D-COMPL (D-07…D-17) |
| D-17 | 3 | A, B, D-COMPL (C termina en D-16) |
| D-18 | 3 | A (D-18), B (D-18), E (D-18…D-29) |
| D-19, D-20 | 2 | A, E |
| D-21 en adelante | 1 | E (D-21…D-29), F (D-30…D-40), G (D-41…D-53), H (D-54…D-59), I (D-60…D-67), J (D-68…D-79): únicos |

La cadena D → D-COMPL → E → F → G → H → I → J continúa la numeración de forma consistente (D-COMPL declara "Numeración de desvíos desde D-07 y de dudas desde C-06"; E "desvíos desde D-18, dudas desde C-13"; F "D-30 / C-23"; G "D-41 / C-26"; H "D-54 / C-38"; I "D-60 / C-49"; J "D-68 / C-57"). Los tramos A, B y C numeraron por su cuenta desde D-01 / C-01.

### 1.2 Ids de dudas (`C-xx`) repetidos entre tramos

| Rango | Informes |
|---|---|
| C-01 a C-05 | A (C-01…C-06), B (C-01…C-10), C (C-01…C-14), D (C-01…C-05) |
| C-06 | A, B, C, D-COMPL (C-06…C-12) |
| C-07 a C-10 | B, C, D-COMPL |
| C-11, C-12 | C, D-COMPL |
| C-13, C-14 | C, E (C-13…C-22) |
| C-15 en adelante | únicos: E (C-15…C-22), F (C-23…C-25), G (C-26…C-37), H (C-38…C-48), I (C-49…C-56), J (C-57…C-65) |

### 1.3 Ids de diagramas (serie P)

- **P1.15 no figura en ningún informe.** B cubre P1.08 a P1.14 y salta a P1.16. B aclara además: "No hay un 'P1.17' escrito en los archivos del Tramo A". **Aclaración de la versión 2:** P1.15 existe como diagrama dibujado ("Cambio de contraseña con sesión", inventario de la §9); el contenido está en A-COMPLEMENTO §4 ("P1.06b"). El Tramo J (Parte final 4) dice que ninguna función del código justifica un P1.15 distinto de lo ya relevado. No se cambió ningún id de los informes.
- **P3.05 se cita sin diagrama:** E dice "No repite lo ya relevado hasta `POST /carrito/items` (P3.02, P3.05)", pero ningún informe define P3.04 ni P3.05 (la serie P3 llega a P3.03). **Aclaración de la versión 2:** P3.04 ("Explorar productos") y P3.05 ("Detalle del comercio y agregar al carrito") existen como diagramas dibujados (inventario de la §9); sus contenidos están en D-COMPLEMENTO (Explorar, detalle del comercio), en E (`POST /carrito/items`) y en J, Parte final 1 (que dice que los cuatro endpoints del catálogo quedan cubiertos por P3.01 a P3.03 y no justifican P3.04 ni P3.05 aparte).
- **P8.05 está en el inventario pero no existe en el código:** I lo titula "Levantamiento de suspensión desde Soporte (**no existe en el código; fusionar con P8.04**)". **Aclaración de la versión 2:** en el inventario de la §9, "P8.05" es otro diagrama ("Bandeja de Soporte del Administrador", que reúne lo que el informe I llama P8.04); el "P8.05" de los informes (inexistente en el código) no tiene diagrama dibujado.
- **Propuestas de división o fusión de los informes** (no cambian los ids de la tabla de §2): A propone P1.06a / P1.06b; B propone partir P1.08 (Cliente / Dueño), P1.12 (tres flujos) y un subproceso común de P1.13 y P1.14; D propone P2.06a a P2.06e y fusionar P3.03 con P2.07; H propone sumar P7.06 "Procesos de pedidos" y P7.07 "Asignación de turnos al arrancar" y redefinir P7.04 como sub-proceso de P7.03; I propone fusionar P8.05 en P8.04.

### 1.4 Mismo hecho registrado con ids distintos (hechos, sin decidir cuál prevalece)

| Hecho | Ids |
|---|---|
| CLAUDE.md dice que el Dueño puede editar con el comercio `SUSPENDIDO`; el código lo bloquea | B·D-04, C·D-14, D·D-02, D-COMPL·D-14, E·D-27 (guard de aceptar pedidos) |
| T14/T15 sin email al aprobar o rechazar comercio | A·D-13, A·C-02 (pregunta), C·D-01, G·D-45 |
| `EstadoToken.EXPIRADO` / job de expiración de tokens inexistente | A·D-07, H·D-54 |
| Extras descritos en documentos y sin código | D-COMPL·D-12, E·D-20 |
| El carrito no pasa a inactivo / no expira | E·D-21, H·D-55, H·C-39 |
| T11 sin email | E·D-25, G·D-44 |
| T19 / T22 (avisos al Administrador) sin emisor | F·D-33, G·D-43, I·D-60, I·C-50 |
| T25 sin email propio | G·D-46, H·D-57 |
| Pago aprobado tardío sí se reembolsa | D·D-05, G·D-47 |
| `LocalDateTime.now()` de la JVM en lugar del reloj único | A·D-08, B·C-04, H·C-45, J·D-69 |
| Un solo hilo de scheduler | H·C-42, I·§2.5 "Scheduler (C-42)", I·C-56 |
| Javadoc de `PedidoSchedulerService` dice "5 jobs" (hay 7) | H·D-59, I·D-65 |
| T41 al restaurar un comercio `INACTIVO` | H·C-38, I·D-64 |
| Edición de horarios / orden sin `ORDER BY` de listados | C·D-09, D-COMPL·C-09 |
| Mensajes de validación sin texto propio (Bean Validation por defecto) | A-COMPL (HorarioRequestDTO), B·D-09, C·D-08, E·C-15, J·D-76 (`@Size(max = 100)` de categoría y tag) |
| Foto de comercio / de usuario sin validación de carpeta | A·D-06, B·D-02, C·D-04 |
| Suspensión de comercio no cierra sesiones del Dueño ni de Empleados | D·D-04 |
| El catálogo de comercios no tiene búsqueda por nombre del lado servidor | D-COMPL·C-10, J·D-78, J·C-65 |
| "Hoy incluido" en los rangos de 7 y 30 días de las estadísticas | D-COMPL·C-11 y Tramo J §J3.4 (hecho sin id: `hasta` = hoy en la zona de Ushuaia) |
| `A·D-03` figura en la sección 8 de P1.01 del informe A, pero su contenido (estados `PENDIENTE` y `BLOQUEADO` antes de la contraseña) es del login (P1.04); este índice lo asigna por contenido a P1.04 | A·D-03 |

---

## 2. Cuadro de diagramas relevados

| Tramo | Serie P | Cant. | Nombres tal como figuran en los informes |
|---|---|---|---|
| A | P1 | 7 | P1.01 Registro de Cliente · P1.02 Registro de Dueño · P1.03 Verificación de email y reenvío de código · P1.04 Inicio de sesión · P1.05 Cierre de sesión (manual, automático, forzado e inactividad) · P1.06 Recuperación y cambio de contraseña (incluye desbloqueo de cuenta bloqueada) · P1.07 Reactivación de cuenta inactiva (vista previa) |
| A-COMPLEMENTO | — | 0 | Sin diagramas nuevos: §1 `ValidadorHorarios.validar`, §2 `ComercioValidaciones.validarModalidadesEntrega`, §3 Consultas de disponibilidad, §4 Cambio de contraseña con sesión (= P1.06b) |
| B | P1 | 8 | P1.08 Perfil de Cliente y de Dueño · P1.09 Gestión de direcciones del Cliente · P1.10 Invitar Empleado · P1.11 Aceptar invitación y alta de Empleado · P1.12 Activar, desactivar y renunciar (Empleado) y asignación a comercios · P1.13 Suspender y levantar suspensión de Cliente (S1) · P1.14 Suspender y levantar suspensión de Dueño con cascada a sus comercios (S3) · P1.16 Selección de contexto del Empleado tras el login |
| B-COMPLEMENTO | — | 0 | Sin diagramas nuevos (§1 mensajes de nombre de usuario, §2 `manejarBloqueoPorCambioPassword`, §3 reenviar email de suspensión, §4 `ComercioDatosOperativosRequestDTO` y `editarDatosOperativos`) |
| C | P2 | 5 | P2.01 Solicitud de alta de comercio (primer alta y alta adicional) · P2.02 Revisión de la solicitud por el Administrador y re-solicitud por el Dueño · P2.03 Subida de documentos del comercio por el Dueño · P2.04 Revisión de documentos por el Administrador y cálculo de `APTO_VENTA` · P2.05 Datos, horarios y redes sociales del comercio (Dueño y Empleado) |
| D (parcial) | P2 / P3 | 5 + 3 | P2.06 Turnos y franjas · P2.07 Estado operativo · P2.08 Gestión de productos · P2.09 Suspender y levantar suspensión de comercio (S2) · P2.10 Listados del Administrador (solo servidor) · P3.01 Búsqueda y filtros de comercios (marcado "NO RELEVADO" en el parcial) · P3.02 Detalle de comercio y menú · P3.03 Disponibilidad del comercio |
| D-COMPLEMENTO | P3 / P2 | 0 | Sin diagramas nuevos: completa con frontend P3.01, P3.02 y las pantallas de P2.06 a P2.10 |
| E | P4 | 6 | P4.01 Gestión del carrito · P4.02 Checkout y creación del pedido · P4.03 Aceptar o rechazar un pedido (comercio) · P4.04 Avance de estados del pedido · P4.05 Cancelación por el Cliente · P4.06 Anulación por el comercio |
| F | P4 | 5 | P4.07 Entrega, retiro y `NO_RETIRADO` · P4.08 Reclamo del Cliente (V50 y V51) · P4.09 Resolución de reclamo por el Administrador · P4.10 Seguimiento e historial de pedidos del Cliente · P4.11 Pedidos entrantes del comercio |
| G | P5 / P6 | 5 + 2 | P5.01 Vinculación de la cuenta de Mercado Pago del Dueño (OAuth) · P5.02 Cobro del pedido · P5.03 Webhook de Mercado Pago · P5.04 Reembolso · P5.05 Reintento manual del reembolso por el Administrador · P6.01 Emisión de notificaciones · P6.02 Consulta y lectura de notificaciones |
| H | P7 | 5 | P7.01 Reapertura automática de comercios · P7.02 Vencimiento de invitaciones de Empleados · P7.03 Inactivación de cuentas por falta de uso · P7.04 Cascada de la inactivación y reactivación de la cuenta · P7.05 Cierre de turno automático y su email |
| I | P8 | 5 (4 con código) | P8.01 Consulta sin sesión (Visitante) y código de acceso · P8.02 Consulta con sesión (Cliente, Dueño, Empleado) · P8.03 Acceso por código, mensajes de seguimiento y límites anti-abuso · P8.04 Bandeja del Administrador, respuesta y cierre de consulta (incluye lo que sería P8.05) · P8.05 Levantamiento de suspensión desde Soporte (no existe en el código) |
| J | P7 / P2 / P3 | 0 | Sin ids de diagrama propios: J1 Configuración de tarifas y tarifa vigente (P7) · J2 Categorías y tags del catálogo (P2) · J3 Estadísticas y ventas por turno del Dueño (P2.06) · Parte final: P3.01 búsqueda y filtros, `TurnoBackfillRunner` y aviso de los 75 minutos, `AptitudVentaComercioService` (sin cambios) y numeración (P1.15, P3.04, P3.05) |

**Totales por serie:** P1 = 15 · P2 = 10 · P3 = 3 · P4 = 11 · P5 = 5 · P6 = 2 · P7 = 5 · P8 = 5 → **56 diagramas** (55 con sustento en el código; P8.05 no). El Tramo J no agrega ids de diagrama. Estos 56 son los ids que usan los informes; el inventario de los diagramas realmente dibujados (80, con otra numeración en varias series) está en la §9.

**Sin diagrama propio, solo nota (según I, Parte 2):** `AptitudVentaComercioService` (nota en los procesos llamadores y cuadro de regla de aptitud en P2), `TurnoBackfillRunner` (nota dentro de P7), `admin-reactivar.js` (nota en P1/P2, ya cubierto por P7.04), `sonido-avisos.js` (nota en P6).

---

## 3. Índice de desvíos (código ≠ documentación)

Orden: por tramo. Columnas: clave · diagrama(s) · archivo y método · qué hace el código · qué dice la documentación · a qué documento corresponde corregir.

### 3.1 Tramo A (acceso y sesión) — A·D-01 a A·D-20

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| A·D-01 | P1.04 | `AuthService.login` (`:110-111`) | Lanza el 401 antes de llamar a BCrypt cuando el usuario no existe: responde más rápido que para uno existente | RF-gen:66: mensaje genérico (solo cubre el texto) | RF-gen, RNF |
| A·D-02 | P1.05 | `TipoCierreSesion.AUTOMATICO`; `jwt.expiration-ms=86400000` | `AUTOMATICO` nunca se asigna; el JWT vence a las 24 h pero la fila de `sesion` queda `activa = true` hasta el próximo login; no hay job ni temporizador de frontend | DIC: "Cierre por expiración del tiempo de sesión inactiva"; RF-gen:73-75 "cierre ... automático", "por vencimiento" | DIC, RF-gen |
| A·D-03 | P1.04 (el informe A también lo cita en P1.01) | `AuthService.validarEstadoParaLogin` (`:445-450`) | Devuelve 409 de `PENDIENTE` y `BLOQUEADO` antes de comparar la contraseña; solo `SUSPENDIDO` e `INACTIVO` se protegen detrás de la contraseña; el login no tiene límite por IP | RF-gen:15 (solo `SUSPENDIDO` e `INACTIVO` detrás de la contraseña) | RF-gen |
| A·D-04 | P1.03 (análogo en P1.06) | `AuthService.java:238-243`; `AuthController` | El controlador responde 200 genérico "Si la cuenta existe y está pendiente de verificación, se envió un nuevo código" pero el servicio lanza 404 "No existe una cuenta con ese email" y 409 "Esta cuenta ya está verificada"; sin espera ni tope por hora en servidor (30 s solo en el frontend) | Respuesta genérica (RF-gen) | RF-gen, RNF |
| A·D-05 | P1.04, P1.05 | `FE js/api.js:327-334` | El modal siempre dice "Tu sesión terminó. Iniciá sesión de nuevo."; no distingue login en otro dispositivo; sin email | RF-gen:46, 75: "el aviso lo dice" | RF-gen, HU |
| A·D-06 | P1.02 | Registro de Dueño; `usuario.foto_perfil_url`; foto del comercio | No existe foto personal del Dueño en el registro (`foto_perfil_url` queda `NULL`); la foto del comercio solo valida `https` y host `res.cloudinary.com` (no carpeta ni cuenta); tipo y tamaño solo en frontend (JPG/PNG/WebP, 5 MB) | RF-due:30: puede cargarla y editarla desde su cuenta | RF-due |
| A·D-07 | P1.01, P1.02, P1.03 | `usuario.email_verificado` (`V1`); `EstadoToken.EXPIRADO` | La columna existe (`DEFAULT 0`) pero la entidad no la mapea y nada la escribe; `EXPIRADO` nunca se asigna y no hay job periódico; un token vencido queda `PENDIENTE` | DIC: `email_verificado` pasa a `true` al verificar; job periódico de expiración | DIC |
| A·D-08 | P1.04 (y registro, tokens) | `AuthService`, `TokenService`, `RegistroService` | `LocalDateTime.now()` (zona de la JVM) en `fecha_ultimo_acceso`, `sesion.fecha_inicio`, `fecha_registro`, vencimientos de tokens; `EstadoUsuarioService` y los jobs usan el `Clock` de `America/Argentina/Ushuaia` | Hecho canónico de zona única; pendiente en CLAUDE §9 | CLAUDE §9, CONC |
| A·D-09 | P1.01, P1.02, P1.03 | `RegistroService` | No escribe la fila inicial de `historial_estado_usuario`; la primera aparece al verificar (`PENDIENTE → ACTIVO`) | DIC (tabla Usuario): al registrarse se inserta fila con `estado_origen = NULL` y `estado_destino = PENDIENTE` | DIC |
| A·D-10 | P1.06 | `AuthService.cambiarPasswordDesdePerfil` | Solo el cambio con sesión valida "La nueva contraseña debe ser distinta a la actual" (400); la recuperación no lo exige; no hay email de aviso tras cambiar la contraseña | RF-gen:114: "ser distinta a la contraseña anterior" | RF-gen |
| A·D-11 | P1.04 | `FE auth.js:201-203` | El 3.er intento fallido responde 401 con `intentosRestantes: 0` y deja `BLOQUEADO`; el frontend solo reacciona a `intentosRestantes === 1`, así que el bloqueo recién se ve en el 4.º intento (en el cambio desde perfil sí hay modal con `0`) | Aviso de bloqueo | HU, RF-gen |
| A·D-12 | P1.04, P1.06 | Contador `intentos_fallidos` | No se resetea al bloquear (queda en 3); se pone en 0 en la recuperación, en el login exitoso o en la reactivación | DIC: tras 3 intentos fallidos se resetea a 0 | DIC |
| A·D-13 | P1.01 a P1.05, P1.07 | Textos y flujo | La pantalla de éxito del registro de Dueño dice "te vamos a avisar por email cuando quede aprobado" y el código no manda email de aprobación; en P1.01 los 409 de email y DNI se muestran en el banner del paso 2 aunque son del paso 1; DIC de `Token` todavía menciona "UUID" y "enlace" | — | DIC, RF-sis (T14/T15), texto de pantalla |
| A·D-14 | P1.01, P1.06 | Mensaje de edad | Backend: "Tenés que tener al menos 14 años para registrarte"; frontend: "Tenés que tener al menos 14 años para poder registrarte." | — | (código/código) |
| A·D-15 | P1.01, P1.06 | `PasswordSeguraValidator` | Exige 8 a 72 caracteres con mayúscula, minúscula y número | CLAUDE §5bis: "mínimo 8 caracteres, 1 mayúscula, 1 número (sin símbolo)"; coincide con RF-gen:114 | CLAUDE §5bis, skill-validaciones |
| A·D-16 | P1.03 | `GET /auth/verificar/{token}` (`AuthService.java:202-208, 541-554`) | Sigue público; valida por el valor del código sin email ni contador de intentos; no lo usa el frontend | Regla de 5 intentos por código y "sin links" | RF-gen, DIC |
| A·D-17 | P1.07 | `/auth/reactivar-cuenta`, `/auth/reactivar-cuenta/confirmar`; `reactivar-cuenta.html` | Endpoints y pantalla vivos sin entrada desde ningún enlace; el código se genera para cualquier estado de cuenta | RF-gen:104 (consistente con "sin entrada") | RF-gen |
| A·D-18 | P1.03, P1.06, P1.07 | DTO de verificación, recuperación y reactivación | No normalizan el email (sin `trim` ni minúsculas, a diferencia del registro y del login por nombre de usuario) | — (ver A·C-01) | DIC (collation), CLAUDE §5bis |
| A·D-19 | P1.06, P1.07 | Rama "cualquier otro estado" de la recuperación | Activa cuentas `PENDIENTE` (`cambiar(..., ACTIVO)`); para un `ACTIVO` cierra la sesión y restaura comercios aunque no haya nada que restaurar | — | RF-gen |
| A·D-20 | P1.04 (`fecha_ultimo_acceso`), P7.03 | `V52`; `Usuario` `@PrePersist` | `fecha_ultimo_acceso` quedó `NOT NULL DEFAULT current_timestamp()` y se completa en `@PrePersist` | DIC la declara nullable | DIC |

### 3.2 Tramo A-COMPLEMENTO y Tramo B-COMPLEMENTO — observaciones sin id

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| B-COMPL·Obs-1 | P1.08, P2.05 | `ComercioActivoService.validarComercioModificable` | Bloquea al Dueño con `SUSPENDIDO` e `INACTIVO` | CLAUDE §1bis (bloque A2 de E3), lista de pulido y §9: el Dueño puede editar con `SUSPENDIDO` | CLAUDE.md |
| B-COMPL·Obs-2 | P2.05 | Javadoc de `ComercioService.editarDatosOperativos` y de `ComercioDatosOperativosRequestDTO` | Desactualizados (ver §4.2 punto 3 y §4.4 del complemento) | — | Javadoc |
| B-COMPL·Obs-3 | P1.13, P1.14 | `MENSAJE_PROPIA_CUENTA`, `MENSAJE_ADMINISTRADOR` | Dicen "suspender" también cuando la operación es reenviar un email | — | (código/código) |
| B-COMPL·Obs-4 | P1.08 | `GlobalExceptionHandler` (línea 83); `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` | El literal "Ese nombre de usuario ya está en uso" está duplicado | — | (código/código) |

### 3.3 Tramo B (perfil, direcciones, equipo y suspensiones) — B·D-01 a B·D-18

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| B·D-01 | P1.08 | `/usuarios/{id}/foto-perfil/*`; `FE js/cliente.js`, `js/comercio.js` | Los endpoints sirven a cualquier rol autenticado, pero solo `js/cliente.js` los usa; el perfil del Dueño solo sube la foto del comercio; el Administrador no tiene pantalla de perfil con foto | RF-due: "El Dueño debe poder cargar y editar su foto de perfil personal desde su cuenta autenticada"; RF-gen "Gestión de Foto de Perfil" (cuatro roles) | RF-due, RF-gen |
| B·D-02 | P1.08 | `UsuarioService.actualizarFotoPerfil`; `CloudinaryService` | Solo se apoya en `@ValidarUrlCloudinary` (dominio + extensión); no hay validación de carpeta `usuarios/{id}/perfil/`, a diferencia de foto de comercio, comercio nuevo e imágenes de producto | (código/código; el comentario de `ComercioPerfilRequestDTO` ya reconoce que solo valida el dominio) | skill-validaciones, CLAUDE §5bis |
| B·D-03 | P1.11 | `InvitacionEmpleadoService.ESTADOS_ACEPTABLES` (`:126-127`) | `{APROBADO, APTO_VENTA, CERRADO_TEMPORALMENTE}`; con `SUSPENDIDO`, `validar` y `aceptar` responden 409 "Esta invitación ya no está disponible" | RF-emp: se puede aceptar con el comercio Aprobado, Apto para Venta, Cerrado Temporalmente o Suspendido | RF-emp |
| B·D-04 | P1.08, P2.05 | `ComercioActivoService.validarComercioModificable` | 409 "El comercio está suspendido: por ahora no se puede modificar." y 409 "El comercio está inactivo: por ahora no se puede modificar." para Dueño y Empleado (`editarPerfil`, `actualizarFotoPerfil`, `editarDatosOperativos`, firma de foto) | RF-due: "hoy el Dueño no tiene las restricciones que sí tiene el Empleado (por ejemplo, puede editar productos y perfil con el comercio Suspendido): es un hueco conocido" | RF-due, CLAUDE §1bis/§9 |
| B·D-05 | P1.16 | `ESTADOS_ACCESIBLES_EMPLEADO` (`ComercioActivoService.java:43-45`) | Incluye `INACTIVO`; el selector tiene etiqueta solo para `SUSPENDIDO` y `CERRADO_TEMPORALMENTE`; un `INACTIVO` aparece sin etiqueta ni aviso | RF-emp: "No aparecen los comercios Inactivos, de Rechazo definitivo, Pendientes ni Rechazados" | RF-emp |
| B·D-06 | P1.14 | `SuspensionDuenoService.SUSPENDIBLES` | Solo `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE` pasan a `SUSPENDIDO`; `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO` e `INACTIVO` quedan igual; los suspendidos por separado conservan su origen | RF-sis:27: "cambiar automáticamente el estado de TODOS los comercios que administra a Suspendido" | RF-sis |
| B·D-07 | P1.13, P1.14 | `estadoAlLevantar` | Al levantar, la cuenta vuelve a `PENDIENTE` o `INACTIVO` si era el origen y a `ACTIVO` en los demás casos (incluida `BLOQUEADO`, con intentos en 0); también para el Dueño | RF-adm: "levantar la suspensión de un cliente, reactivando su cuenta" | RF-adm, HU-Administrador (HU-A06) |
| B·D-08 | P1.13, P1.14 | — | La suspensión de Dueño, su vista previa, el listado de Dueños, el reenvío de email y el mínimo 10 / máximo 500 caracteres del motivo no figuran en RF-adm (solo de forma indirecta en RF-sis:25-31) | RF-adm "Gestión de Usuarios" solo habla del cliente | RF-adm, HU-Administrador |
| B·D-09 | P1.08 | `PUT /clientes/perfil` (`@ValidarNombrePropio`); `ComercioPerfilRequestDTO` | Nombre/apellido: "Debe contener solo letras, espacios y guiones" (registro: "El nombre solo puede contener letras"); teléfono vacío "No debe estar vacío" (registro: "El teléfono es obligatorio"); no normaliza (el teléfono se guarda como llegó); `@Size(max = 150)` y `@Size(max = 30)` del comercio sin mensaje propio | — | (código/código); skill-validaciones |
| B·D-10 | P1.08 | `FE js/perfil-cuenta.js` | Con el nombre de usuario modificado hace primero `PUT /clientes/perfil` y después abre "Confirmá tu contraseña"; si se toca "Cancelar" los datos ya quedaron guardados, sin toast | — | HU-Cliente |
| B·D-11 | P1.08 | `/clientes/**` (`hasRole("CLIENTE")`) | Ninguna pantalla del Dueño muestra nombre, apellido, DNI, teléfono personal ni fecha de nacimiento | RF-due solo lo reconoce para el nombre de usuario | RF-due |
| B·D-12 | P1.09 | `DireccionClienteService` | Se puede eliminar la predeterminada si hay otra activa (se promueve la de mayor `id`); se bloquea eliminar la única activa (409 `ULTIMA_DIRECCION`); tope de 5 activas (409 `DIRECCIONES_CUPO_MAXIMO`); campos `nombre` y `referencia` | RF-cli: "La dirección principal no puede eliminarse si es la única registrada; primero debe designarse otra como principal." (sin tope ni campos) | RF-cli, HU-Cliente |
| B·D-13 | P1.09 | `FE direcciones.js` frente al servidor | Frontend: "Llegaste al máximo de 5 direcciones. Podés eliminar alguna para agregar otra."; servidor: "Ya tenés el máximo de 5 direcciones. Eliminá una para agregar otra."; `pisoDepto` con solo espacios pasa (`\s*`) y se guarda sin recortar | — | (código/código) |
| B·D-14 | P1.10, P1.12 | `EquipoComercioController` / `InvitacionEmpleadoService` | `invitar` y `reenviar` exigen `APROBADO`/`APTO_VENTA` (409 "Este comercio no puede invitar empleados en este momento"); `cancelar` y `desactivar` solo bloquean `SUSPENDIDO` (409 "El comercio está suspendido: el equipo se puede ver, pero no modificar"); `reactivar` exige operativo (409 "Este comercio no puede reactivar empleados en este momento", código `NO_OPERATIVO`) | RF-due solo describe la regla de invitar | RF-due, RF-emp |
| B·D-15 | P1.11 | `crearCliente(…, ACTIVO)` | La cuenta nueva por invitación queda activa sin verificación de email y el aviso de aceptación solo va al Dueño (nada al Empleado); informativo | RF-emp: "El código verifica el email" | RF-emp |
| B·D-16 | P1.12 | `GestionMiembroEquipoService` | Desactivar y renunciar no cierran sesiones ni envían email; solo relación, historial y aviso in-app personal (sin `comercio_id`, llega a su cuenta de Cliente) | RF-sis:31-32 coherente; no dice que no hay email | RF-emp, RF-due |
| B·D-17 | P1.13, P1.14 | `FE js/cuenta-suspendida.js` `mostrarPantallaCuentaSuspendida` | No distingue rol: dice "Tus pedidos ya pagados siguen su curso." y "No podés hacer pedidos nuevos." también para un Dueño suspendido; el email del Dueño dice otra cosa | — | (código/código) |
| B·D-18 | P1.16 | `seleccionar-contexto.html` | El selector siempre se muestra aunque haya un solo comercio; informativo | RF-emp coincide | — |

### 3.4 Tramo C (P2.01 a P2.05) — C·D-01 a C·D-16

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| C·D-01 | P2.01, P2.02 | `AdministradorService` (aprobar / rechazar) | Solo crea notificación in-app `COMERCIO_APROBADO` / `COMERCIO_RECHAZADO`; no manda email | RF-sis T14/T15 "App + Email"; las pantallas de éxito del registro y `comercio-pendiente.html` prometen un email | RF-sis, DIC, textos de pantalla |
| C·D-02 | P2.03 | `DocumentoComercioService`; `documento_comercio_archivo` | Los documentos no usan Cloudinary: `multipart/form-data` al backend, validación por firma de bytes y `LONGBLOB` en MySQL | El informe lo registra como desvío sin citar el texto exacto de la documentación | No indicado en el informe |
| C·D-03 | P2.01 | Alta adicional | Reutiliza los datos fiscales (confirmación; coincide con los docs) | Coincide | — (sin corrección) |
| C·D-04 | P2.01 | Foto del primer alta | No se valida contra carpeta ni cuenta de Cloudinary (solo dominio) | Otros flujos sí validan carpeta | (código/código) |
| C·D-05 | P2.01, P2.05 | Javadoc de `ComercioDatosOperativosRequestDTO` | Dice que no hay edición de horarios | Desactualizado | Javadoc |
| C·D-06 | P2.01, P2.05 | RF-emp | — | RF-emp lista "email de contacto", que ya no existe (V36) | RF-emp |
| C·D-07 | P2.02, P2.04 | Modal de rechazo | Tope de 500 caracteres: correcto para comercios, incorrecto para documentos | — | (código/código) |
| C·D-08 | P2.02 | `AprobacionComercioRequestDTO` | Sin mensajes propios en `aprobar` / `motivo` | — | skill-validaciones |
| C·D-09 | P2.02 | Repositorio de pendientes | Sin `ORDER BY`; el orden lo da el frontend | — | (código/código) |
| C·D-10 | P2.03, P2.04 | Motivo de rechazo de documento | 500 en pantalla frente a 255 en servidor y base | — | (código/código) |
| C·D-11 | P2.03 | `comercio.documentacion.requerida` | `true` por defecto solo en la clase, no en `application.properties` | — | LISTA-DE-DESPLIEGUE, CLAUDE |
| C·D-12 | P2.04 | `AptitudVentaComercioService` | La aptitud exige además documentos (Fase 4) | CLAUDE §1bis (C1/C2) la describe solo con Mercado Pago | CLAUDE.md §1bis |
| C·D-13 | P2.05 | `RedSocialController` | Endpoints sin pantalla; un comercio aprobado no puede editar redes desde la UI | RF-due / HU (describen la edición) | RF-due, HU-Dueño |
| C·D-14 | P2.05 | `validarComercioModificable` | Bloquea al Dueño con `SUSPENDIDO` | CLAUDE §9: el Dueño puede editar con `SUSPENDIDO` | CLAUDE.md §9 |
| C·D-15 | P2.05 | Validación de teléfono | Mensajes distintos entre alta y edición | — | (código/código) |
| C·D-16 | P2.05 | Datos operativos | Omitir la descripción la borra; no está documentado | — | RF-com, RF-emp |

### 3.5 Tramo D parcial y D-COMPLEMENTO (P2.06 a P2.10, P3) — D·D-01 a D·D-06 y D-COMPL·D-07 a D-17

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| D·D-01 | P3.02, P3.03, P2.10 | `listarCatalogoGlobal`, `listarFiltrosDisponibles` frente a `/catalogo/comercios` | Catálogo de comercios y de productos de un comercio incluyen `CERRADO_TEMPORALMENTE`; el catálogo global solo `APTO_VENTA` | — | (código/código); RF-cli |
| D·D-02 | P2.07, P2.08, P2.05 | `409 COMERCIO_SUSPENDIDO` / `COMERCIO_INACTIVO` | Bloquea al Dueño y al Empleado | CLAUDE §9 (lista de pulido) dice que el Dueño puede editar con `SUSPENDIDO` | CLAUDE.md §9 |
| D·D-03 | P2.07 | `ReaperturaComerciosJob` | Reabre aunque el comercio esté `SUSPENDIDO` o `INACTIVO` (solo apaga la bandera) y no emite avisos | La documentación del cierre manual no lo aclara | RF-com, DIC |
| D·D-04 | P2.09 | `SuspensionComercioService` | La suspensión de un comercio no cierra sesiones del Dueño ni de Empleados (la del Dueño, S3, sí cierra las del Dueño) | — | RF-adm, RF-sis |
| D·D-05 | P2.09 | Documento canónico de la suspensión de comercio | Coincide con el código pero omite que `PENDIENTE_PAGO` queda sin tocar y que un pago aprobado tardío se cancela y reembolsa | Documento canónico | CLAUDE, RF-adm |
| D·D-06 | P2.08 | `ProductoService` | "Eliminar producto" no es baja física: es `DESCONTINUADO` (terminal); no hay reordenamiento de productos | — | RF-com, HU-Comercio |
| D-COMPL·D-07 | P3.02 | `js/catalogo.js` `initComercioDetalle`; `comercio-detalle.html` | Muestra nombre, descripción, solo el horario de hoy, dirección y modalidades; no muestra tipo, teléfono, redes sociales ni la semana completa | RF-cli (~línea 26): "tipo de comercio, horarios de atención, dirección, teléfono, enlaces a sus redes sociales" | RF-cli |
| D-COMPL·D-08 | P3.01, P3.02 | `index.html` frente a detalle y Explorar | El Dueño o Administrador es redirigido solo desde `index.html`; en el detalle y en Explorar ve "Iniciá sesión para pedir" aunque ya inició sesión | Las historias y requisitos no dicen qué pasa | RF-cli, HU-Cliente |
| D-COMPL·D-09 (**corregida en parte por J·D-78**) | P3.01 | `explorar.html`, `js/explorar.js` | Explorar: búsqueda por nombre con debounce de 300 ms, categoría única y tags múltiples con AND, paginación de 20, orden aleatorio, contador y "Limpiar filtros"; campo "Buscar productos" en escritorio; filtros "Delivery" y "Retiro" **[corregido por J·D-78: los chips "Delivery", "Retiro" y "Abierto ahora" están en `initCatalogo` (`index.html`, filtro del lado cliente sobre `GET /catalogo/comercios`), no en Explorar; Explorar solo tiene categoría, tags, búsqueda por nombre de producto y paginación; no existe búsqueda por nombre de comercio]** | RF-cli y HU-C08 solo hablan de filtrar productos dentro de un menú por categoría y/o tags y mencionan "Abierto ahora" | RF-cli, HU-Cliente |
| D-COMPL·D-10 | P2.07, P3.02 | Panel del Dueño | Sin aviso propio para `CERRADO_TEMPORALMENTE` (el banner "Comercio cerrado temporalmente. No se aceptan pedidos nuevos." es solo del Empleado) | RF-com (~líneas 113 a 119) | RF-com |
| D-COMPL·D-11 | P2.06 | Rótulo del turno | Agrega "En curso desde ayer", "En curso desde el dd/mm", "Terminó el dd/mm" y una cuarta columna "En preparación" solo en escritorio | RF-com (~línea 315): "En curso", "Terminó" y "Terminó ayer" | RF-com |
| D-COMPL·D-12 | P4.01, P4.02 | Extras | No hay código de extras (solo 5 tablas del baseline, 2 valores de enum y ramas de texto de la Actividad) | RF-cli (~línea 34) y HU-C09B describen extras con grupos y cálculo | RF-cli, RF-com, HU-Cliente (marcar como no implementado) |
| D-COMPL·D-13 | P2.09 | `destinoAlLevantarSuspension` | Restaura a `APTO_VENTA`, `APROBADO` o `CERRADO_TEMPORALMENTE` según cuenta de cobro, documentos y cuenta del Dueño | RF-adm (~línea 12): "restaurando su estado a Aprobado"; HU-A06 genérica | RF-adm, HU-Administrador |
| D-COMPL·D-14 | P2.09 | `pintarSoloLecturaDeProductos`, `protegerPorSuspension` | El código ya impide editar con `SUSPENDIDO` (backend 409 y frontend) | RF-com (~línea 302): "El Dueño queda sin cambios por ahora" | RF-com |
| D-COMPL·D-15 | P2.09 | Hoja de suspensión | Vista previa por pedidos; pendientes rechazados al instante; los demás con 90 minutos | RF-adm (~línea 11): "desencadena la cancelación de pedidos activos … según las reglas del sistema" | RF-adm |
| D-COMPL·D-16 | P2.10 | `renderComercioAdminRow` | La fila muestra nombre, tipo, localidad y estado; sin fecha de registro, Dueño ni MP; sin búsqueda ni filtros | HU-A07: "estado, tipo, fecha de registro, Dueño titular y si ese Dueño tiene MP vinculado" | HU-Administrador |
| D-COMPL·D-17 | P2.10 | Listados del Administrador | Solo el de Dueños tiene "Ver más" de a 30; Clientes, Comercios, Categorías, Tags y Reembolsos sin paginación | Ningún requisito lo exige ni lo descarta | RF-adm |

### 3.6 Tramo E (P4.01 a P4.06) — E·D-18 a E·D-29

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| E·D-18 | P4.02 | `PedidoService.confirmarPedido`; `CarritoService.agregarItem` | No revisa el estado de los productos al confirmar; solo al agregar ("El producto no está disponible") y por la baja de carritos al pasar a `AGOTADO`/`DESCONTINUADO` (`PRODUCTO_REMOVIDO_CARRITO`); `PUT /carrito/items/{id}` tampoco revalida | RF-cli (línea 48): validar al confirmar "que todos los productos sigan activos" | RF-cli |
| E·D-19 | P4.02 | `confirmarPedido` | Exige un `direccionId` de una dirección activa del propio Cliente (no necesariamente la principal): 409 "La dirección es obligatoria para entrega a domicilio" o 404 "Dirección no encontrada" | RF-cli (línea 48): "que el cliente tenga una dirección principal configurada" | RF-cli |
| E·D-20 | P4.01, P4.02 | Carrito, checkout, pedido | Sin lógica de extras | RF-cli (líneas 33 y 48) y RF-com (~224) | RF-cli, RF-com |
| E·D-21 | P4.01 | `Carrito` | Un único registro por Cliente, sin estado ni vínculo con la sesión; no expira; solo se vacía por acciones del Cliente, pago aprobado o baja de un producto | RF-cli (línea 39): vinculado a la sesión, "pasando a estado inactivo al expirar la sesión o al inactivarse la cuenta" | RF-cli, DIC |
| E·D-22 | P4.05 | `PedidoService` (cancelar) | No distingue modalidad (mismos estados); permite cancelar `PENDIENTE_PAGO` (409 "El pedido ya no se puede cancelar" para el resto); cancelar desde `PENDIENTE_PAGO` no genera reembolso (motivo `CANCELACION_SIN_PAGO`) | RF-cli (líneas 53-55), HU-C13: cancelación "según modalidad" con dos estados; RF-sis (línea 58): `CANCELADO` "genera reembolso automático" | RF-cli, HU-Cliente, RF-sis |
| E·D-23 | P4.03 | `MotivoRechazo.CERRADO` | La etiqueta es "Comercio cerrado" (backend y frontend) | RF-com (~242): "Local Cerrado" | RF-com |
| E·D-24 | P4.04 | `pedido.timeout.respuesta-comercio-minutos=30` | Umbral de 30 minutos y corrida cada 5 minutos: el vencimiento cae entre los 30 y 35 minutos | RF-sis (línea 61): "dentro de la hora de margen"; la línea 94 del mismo archivo dice 30 | RF-sis |
| E·D-25 | P4.03, P4.04, P6.01 | `PedidoService.notificarCancelacionSistema` | Solo aviso in-app (`PUSH`); ningún aviso de pedido (T1, T2, T3, T5 a T13) envía email | RF-sis (línea 153, T11): "Push + Panel + Email" | RF-sis, DIC |
| E·D-26 | P4.05 | Cancelación del Cliente | No se crea aviso para el Cliente; solo `PEDIDO_CANCELADO_CLIENTE` al equipo del comercio y solo si el pedido estaba pagado | RF-cli (~66): aviso ante "cancelado" | RF-cli |
| E·D-27 | P4.03 | `ComercioActivoService.validarComercioAceptaPedidosNuevos` | Ya aplica el guard al Dueño con `SUSPENDIDO` (409 `COMERCIO_SIN_OPERACION`, "El comercio está suspendido: no podés aceptar pedidos nuevos. Sí podés rechazarlos."); con `CERRADO_TEMPORALMENTE` el Dueño sigue pudiendo aceptar | CLAUDE §7.2: "Aplicarlo al Dueño queda para el tramo de suspensión" | CLAUDE.md §7.2 |
| E·D-28 | P4.03, P4.11 | `comercio.js` (~1594) | Escribe literal "Cargo por servicio (1%)" aunque la tarifa (`FIJO` o `PORCENTAJE`) es configurable | — | (código/código) |
| E·D-29 | P4.11 | `comercio.js` `renderPedidoActivoCard` | La tarjeta muestra `pedido.total` (con el cargo del Cliente) y el detalle muestra `pedido.neto` rotulado "Total" | Anotada como deuda en CLAUDE | (código/código); CLAUDE |

### 3.7 Tramo F (P4.07 a P4.11) — F·D-30 a F·D-40

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| F·D-30 | P4.07 | `PedidoService.confirmarEntregaComercio` | Solo exige `LISTO_PARA_RETIRAR`; `cerrarComoNoRetirado` sí valida `RETIRO`; inocuo hoy | Sin documento en contrario | — |
| F·D-31 | P4.07 | `confirmarEntregaComercio`, `confirmarEntregaCliente` | No llaman a `NotificacionService`: el Cliente no recibe aviso de `ENTREGADO` manual (solo T8 si lo autoconfirma el sistema) y el comercio no recibe aviso cuando el Cliente confirma | RF-cli (~65): notificar al cliente ante cada cambio de estado, "entregado" incluido | RF-cli, RF-sis |
| F·D-32 | P4.09, P4.08 | `V50__reclamos.sql`, `V51__reclamo_fotos.sql` | Toda la resolución está en `V50`; `V51` es la de las fotos del Cliente | El encargo pedía "Resolución de reclamo por el Administrador (V51)" | Encargo / mapeo de migraciones |
| F·D-33 | P4.08, P4.09, P6.01 | `TipoNotificacion.NUEVO_RECLAMO(ADMINISTRADOR)` | Existe y ningún servicio lo crea; el Administrador lo ve solo en el contador y la insignia | RF-sis (~161) T19 "Push + Panel"; RF-adm (línea 76) | RF-sis, RF-adm |
| F·D-34 | P4.08 | `ReclamoService` | Reclamo sobre cualquier pedido `ENTREGADO` (domicilio o retiro, también autoconfirmado) con seis motivos (`NO_RECIBI_PEDIDO` solo domicilio) y fotos opcionales; no existe la opción "contactar directamente al comercio"; el único contacto es "Contactar a Soporte" tras un rechazo | RF-cli (línea 59), HU-C14, HU-A13 y RF-adm (línea 76): reclamo por pedido a domicilio no recibido y contacto directo con el comercio | RF-cli, RF-adm, HU-Cliente, HU-Administrador |
| F·D-35 | P4.10 | `js/pedidos.js` | Sin recorrido/trazabilidad del pedido para el Cliente (solo el comercio), sin "Volver a pedir", sin agrupación por día, sin paginación y sin separación activos/históricos en móvil | No se halló documento que lo exija (NO RELEVADO exhaustivo de las historias C-xx de pedidos) | HU-Cliente (a confirmar) |
| F·D-36 | P4.11 | `findLlegadosPagadosByComercioId` | Devuelve todo el historial pagado, sin ventana ni paginación; el panel muestra todo bajo "Todos" | Sin "historial de pedidos" acotado en los documentos leídos | RF-com |
| F·D-37 | P4.07, P4.10 | `TextosPedidoActividad.textoDePedidoDelSistema` | Con `pedido = "el pedido"` resulta "Confirmó automáticamente la entrega de el pedido" (en la Actividad dice "de un pedido") | — | (código) |
| F·D-38 | P4.07, P4.08 | `PEDIDO_AUTOCONFIRMADO` (T8) | Texto con un único enlace "Ver pedido" (`destino-aviso.js`); sin botones; el `7` del plazo está escrito en el texto y no en `reclamo.plazo-dias` | RF-sis (líneas 107, 150, 180): T8 "con opciones para iniciar reclamo o contactar al comercio" y "botones" | RF-sis |
| F·D-39 | P4.09 | `ReclamoAdminService`, `AvisoReclamoService`, `EmailService.enviarReclamoResuelto` | T20/T21: aviso in-app más email (Resend) al Cliente; para el Dueño `RECLAMO_REEMBOLSO_DUENO` | RF-sis (líneas 162-163): T20/T21 "Push + Panel"; `RECLAMO_REEMBOLSO_DUENO` no figura en la tabla leída | RF-sis, DIC |
| F·D-40 | P4.11 | `sonido-avisos.js` (`vigilarAvisos`), `pedidos-nuevos.js` | El sonido responde a cualquier aviso nuevo sin leer del comercio activo; la etiqueta "Nuevo" se basa en lo visto desde que se abrió el panel (`sessionStorage`) | RF-com (línea 232): aviso "ante cada nuevo pedido entrante" | RF-com |

### 3.8 Tramo G (P5 y P6) — G·D-41 a G·D-53

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| G·D-41 | P5.04, P5.05, P7 | `ReembolsoService.solicitarYRegistrar`; `NotaCreditoService` (~30) | No existe job de reintento; un solo intento; `PENDIENTE_REINTENTO` no se escribe en ningún lado (solo se cuenta como "cubierta" y se traduce a `EN_PROCESO` para el Empleado); único reintento: el manual del Administrador | RF-sis "Gestión de Reembolsos": job que reintenta `PENDIENTE_REINTENTO`; DIC `NotaCredito.intentos`: "Diseño: máximo 5 con job de reintentos (pendiente)" | RF-sis |
| G·D-42 | P5.04, P6.01 | `TipoNotificacion.REEMBOLSO_FALLIDO_DEFINITIVO` (T27) | Existe en enum y ENUM de base sin emisor; el Administrador solo ve las notas `FALLIDO` / `PENDIENTE_REVISION_MANUAL` y la insignia | RF-sis y DIC (`fecha_fallido`): notificación al Administrador, Push + Email, a los 5 intentos | RF-sis, DIC |
| G·D-43 | P6.01, P6.02 | Audiencias `ADMINISTRADOR` (T17, T18, T19, T22) | Ningún servicio las crea (no existe `crearParaAdministrador`); `initNotificaciones` redirige al login para `ADMINISTRADOR` | RF-sis las lista como Push + Panel (T18 aclara que no se notifica); DIC ya dice "hoy no se emiten" | RF-sis |
| G·D-44 | P4.03, P6.01 | `crearParaCliente` (T11) | Solo PUSH; `EmailService` no tiene método para pedidos | RF-sis y DIC: `PEDIDO_CANCELADO_SISTEMA` "Push + Email" | RF-sis, DIC |
| G·D-45 | P2.02, P6.01 | `AdministradorService` (~360–375) | Solo `notificacionService.crearParaDueno`; sin método de email de comercio aprobado/rechazado (T16, suspensión, sí lleva email por `AvisoCuentaService`) | T14 y T15 documentados Push + Email al Dueño | RF-sis, DIC |
| G·D-46 | P7.03, P6.01 | `AvisoCuentaService.avisarInactivacion` | `CUENTA_INACTIVADA` crea además un aviso PUSH al usuario y `COMERCIO_INACTIVADO` un aviso PUSH al Dueño por comercio; el email es uno solo por cuenta (con la lista de comercios); el "email de T25" no existe como mensaje propio | T24 y T25 documentados con canal "Email" únicamente | RF-sis, DIC |
| G·D-47 | P5.03, P4 | `PedidoService.reembolsarPagoTardio` | Además de la alerta `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO`, crea la nota (`PAGO_TARDIO`, `SUSPENSION_CLIENTE` o `SUSPENSION_COMERCIO`) y pide el reembolso total; el pago duplicado sí es solo alerta | ALC (~línea 223): "solo genera una alerta ... No se devuelve el dinero" (RF-sis ya coincide) | ALC |
| G·D-48 | P5.04 | Descripción de la tabla `NotaCredito` | Cancelación del Cliente, anulación, rechazo, expiración, suspensión (comercio y Cliente), pago tardío y reclamo ya generan nota | DIC: reembolso total solo para `RECHAZADO`, `EXPIRADO` y suspensión de comercio; `CANCELADO`/`ANULADO` "siguen pendientes, marcados con TODO en `PedidoService`" | DIC |
| G·D-49 | P5 | `CONCURRENCIA-Y-TRANSACCIONES.md` §7 | El módulo está implementado | Título: "Módulo Pago / MercadoPago — fuera de alcance del MVP ... documentado para v2" (~línea 131) | CONC §7 |
| G·D-50 | P5.05 | `ReembolsoService.prepararReintento` | Toma la nota `FOR UPDATE` y después el pago `FOR UPDATE` (orden inverso al de `prepararIntento` y `generarNotaDeReclamo`) | CONC (nivel 5): pago antes que nota | CONC |
| G·D-51 | P6.01 | `AudienciaNotificacion` | Seis audiencias (`EMPLEADOS`: `COMERCIO_SUSPENDIDO_EQUIPO` y `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO`); `RECLAMO_REEMBOLSO_DUENO` no aparece en DIC (la tabla leída termina en T41) | DIC (nota de audiencias, ~línea 671): cinco audiencias; columna `tipo` dice "ver tabla T1–T35" (son T1–T41) | DIC |
| G·D-52 | P6.02 | "Marcar todas" del Cliente; `PUT /notificaciones/personales/leidas` | Existen en backend y frontend | No figuran en RF-cli, RF-com ni RF-gen | RF-cli, RF-com, RF-gen |
| G·D-53 | P4.11, P5.02 | `GET /pedidos/comercio/{id}/pago`; `obtenerPedidoDelComercio` | Solo funciona para pedidos que ya llegaron pagados (`llegoPagado`); el frontend no lo consume; el enlace de un pedido sin pagar nunca se ve desde el comercio | RF-due (~línea 322): "ver el enlace de pago de un pedido" | RF-due |

### 3.9 Tramo H (P7) — H·D-54 a H·D-59

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| H·D-54 | P7 (inexistente), P1.03 | `EstadoToken.EXPIRADO` | Ningún `@Scheduled` de tokens y `EXPIRADO` no se escribe en ningún lugar de `backend/src/main/java` (grep sin resultados) | RF-sis L46-48: "Un job periódico procesa los tokens con `fecha_vencimiento <= NOW()` y `estado = PENDIENTE`"; L313; RNF L118 | RF-sis, RNF |
| H·D-55 | P7.03, P4.01 | `Carrito`; `carrito.activo` (`V1:37`) | La columna existe (defecto 1) pero la entidad no la mapea y nada la escribe; la inactivación no toca el carrito | RF-sis L241-242; DIC L2358: "pasa a `activo = false` al cerrar sesión, inactivarse la cuenta o expirar la sesión" | RF-sis, DIC |
| H·D-56 | P7.01 | `CierreComercioService.java:127-130` | Si `proximoInicioDeFranja` no halla franja vigente, el job reabre el comercio y deja `log.warn` | RF-sis L110: "Un comercio sin franjas horarias cargadas no se reabre solo."; CLAUDE (tramo C1): "sin franjas no reabre" | RF-sis, CLAUDE |
| H·D-57 | P7.03, P6.01 | `AvisoCuentaService.java:85-89` | Solo aviso en la app por comercio; el único email es el de T24 (nombra a los comercios) | RF-sis L182 y DIC L689: T25 `COMERCIO_INACTIVADO` canal "Email" | RF-sis, DIC |
| H·D-58 | P7.01 a P7.05 | `InactivacionCuentaJob`, `CierreTurnoJob`, `InvitacionVencimientoJob`, `ReaperturaComerciosJob`, `PedidoSchedulerService` | Registro de ejecución parcial: la inactivación siempre escribe el resumen; el cierre de turno solo si cerró, envió o falló algo; el vencimiento de invitaciones solo si venció alguna; la reapertura no escribe nada por corrida (solo `warn` por comercio y `error` por falla); `PedidoSchedulerService` no registra en esa clase | RF-sis L311-317 y RNF L118: todos los procesos automáticos registran su ejecución según la taxonomía de logs | RF-sis, RNF |
| H·D-59 | P7 (pedidos) | `PedidoSchedulerService` (:9, :79) | Javadoc: "Los 5 jobs" y "uno de los cuatro procesos"; hay 7 métodos `@Scheduled` | — | Javadoc (código) |

### 3.10 Tramo I (P8 y cierres pendientes) — I·D-60 a I·D-67

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| I·D-60 | P8.04, P6.01 | `TipoNotificacion.java:31` (`NUEVO_MENSAJE_SOPORTE`, T22); `AdministradorService.java:288` | No emite nunca ese aviso (ni al crear ni al responder la persona); el Administrador solo ve el contador `consultasSoporteEsperando` con sondeo de 15 s | DIC:651: "Push al Administrador, nuevo mensaje de soporte de un usuario suspendido" | DIC |
| I·D-61 | P8.01, P8.02 | `SoporteService.crear` (`ventanaConsultasHoras=24`, `countByEmailAndCreadoEnAfter`) | Ventana móvil de 24 horas, no día calendario; el mensaje dice "hoy" y "mañana" | CLAUDE y mensajes: "3 consultas hoy", "por día" | CLAUDE, RF-sis (Soporte) |
| I·D-62 | P8.01 | `SoporteLimiteService` | Las claves `CREAR_EMAIL|` / `CREAR_IP|` no llevan conteo (cantidad siempre 0, solo cerrojo); el límite de creación se cuenta sobre `ticket_soporte`; solo `INTENTO_*` y `REENVIO_*` son contadores | CONC (Soporte): todas las claves como "contador" | CONC |
| I·D-63 | P8.02, P8.03 | `TicketSoporteRepository` (`findDelUsuario`, `findDelUsuarioPorId`, `findIdDelUsuarioPorId`, `contarDelUsuarioPorEstado`) | "Mis consultas" y las operaciones con sesión se resuelven por `usuario_id = :id OR email = :email`: una consulta creada sin sesión con el email de la cuenta aparece en "Mis consultas" y la cuenta puede responderla con sesión | Habla de "consultas de la persona" sin precisar este cruce | DIC, RF-gen |
| I·D-64 | P2.04, P7.04 | `AptitudVentaComercioService.avisarCambio` (289-298); `MotivoRecalculo.DUENO_BLOQUEADO` | T41 se emite en toda transición con destino `APROBADO`, incluso al restaurar un comercio `INACTIVO` o `CERRADO_TEMPORALMENTE` (que no vendía), con el texto "dejó de recibir pedidos"; `DUENO_BLOQUEADO` existe con texto "Bloqueo de cuenta" pero ningún llamador lo usa | DIC:667: T41 "dejó de recibir pedidos" (coincide, sin advertir el texto engañoso en el caso `INACTIVO`) | DIC |
| I·D-65 | P7 (pedidos) | `PedidoSchedulerService.java:9` | Javadoc "Los 5 jobs"; hay 7 métodos `@Scheduled` | DECISIONES/CLAUDE: "4 jobs" y "7 de la tabla" según la fecha | Javadoc, DECISIONES |
| I·D-66 | P8.03 | `SoporteProperties.intentosFallidosPorHoraEmail = 30` | Permite 30 intentos fallidos por hora por email y 10 por IP | CONC (Soporte): "5 intentos por hora", "los 5 intentos por hora de su acceso"; el nombre del test cita "TreintaIntentos" | CONC |
| I·D-67 | P8.01, P8.02 | `SoporteService.crear` (240-246); `ConversacionSoporte.agregarMensaje` | Los mensajes de la persona se guardan con `email_enviado = true` siempre (no se envía email por ellos): la columna significa "enviado o no aplica" | La documentación la describe solo para respuestas de Soporte | DIC |

**Total de filas de esta §3:** 133 desvíos con id (A 20 · B 18 · C 16 · D 6 · D-COMPL 11 · E 12 · F 11 · G 13 · H 6 · I 8 · J 12) + 4 observaciones sin id (B-COMPLEMENTO).

### 3.11 Tramo J (huecos que dejó la versión 1) — J·D-68 a J·D-79

Diagramas: J1 = Configuración de tarifas (P7.09 del inventario), J2 = Categorías y tags (P2.14), J3 = Estadísticas del Dueño (P2.13). El informe J compara código con código o con `CLAUDE.md`: no leyó los documentos de requisitos ni las historias de usuario (su sección NO RELEVADO). Donde la columna "Corregir en" dice "No indicado en el informe", el informe no nombra documento a corregir.

| Clave | Diagrama | Archivo / método | Qué hace el código | Qué dice la documentación | Corregir en |
|---|---|---|---|---|---|
| J·D-68 | P7.09 (J1) | `V10__configuracion_tarifa_tipo_cargo.sql`; `CASE` de `V19` | Siembra la tarifa inicial (200,00 `FIJO` al cliente; 1,00 `PORCENTAJE` al comercio) solo si existe un `usuario` con email `admin@bajonea.com`; sin esa fila no hay tarifa vigente y el carrito con ítems y `confirmarPedido` responden 409 "No hay ninguna configuración de tarifa vigente" (no se consultó cuál email tiene el Administrador de cada base) | CLAUDE.md nombra al Administrador como `admin@bajonea.ar` | No indicado en el informe |
| J·D-69 | P7.09 (J1) | `ConfiguracionTarifaService.crear` | `fecha_vigencia = LocalDateTime.now()` (zona de la JVM, no el `Clock`) en una columna `datetime` sin fracciones: dos altas dentro del mismo segundo empatan y `findTopByOrderByFechaVigenciaDesc` no desempata; no existe columna "vigencia hasta" | — | (código/código); misma familia que A·D-08 |
| J·D-70 | P7.09 (J1) | `ConfiguracionTarifaRequestDTO` | Sin máximo, sin `@Digits` ni tope de porcentaje: el porcentaje puede superar 100 (la comisión supera el subtotal y el neto queda negativo), los dos cargos pueden ser 0, más de dos decimales los redondea la base y un valor mayor al `decimal(10,2)` falla en la base (resultado NO VERIFICADO) | — | (código/código) |
| J·D-71 | P7.09 (J1), P4.02 | `PedidoService.confirmarPedido` | El pedido guarda solo `subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio` y `total`: sin id, tipo ni tasa de la configuración aplicada; ningún flujo va de `pedido` hacia `configuracion_tarifa` (el flujo 64 del N1 no existe). El cambio de tarifa no deja aviso ni auditoría más allá de `administrador_id` y `fecha_vigencia`; sobre un pedido en vuelo salta el 409 `PRECIO_CAMBIO` | N1 (flujo 64): "Tarifas almacenadas en pedidos históricos" | DFD Nivel 1 (flujo 64) |
| J·D-72 | P2.14 (J2) | `CategoriaService.editar`, `TagService.editar` | Editar cambiando solo mayúsculas o tildes responde 409 "Ya existe una categoría con ese nombre" / "Ya existe un tag con ese nombre": el `equals` de Java distingue mayúsculas pero `existsByNombre` (collation `utf8mb4_unicode_ci`) encuentra a la propia fila | — | (código/código) |
| J·D-73 | P2.14 (J2), P2.08 | `ProductoService.obtenerCategoria`, `asignarTags` | No validan `activo`: un `POST`/`PUT` de producto con categoría o tag inactivos se acepta | Texto de pantalla (modales del Administrador): "Solo las categorías activas pueden asignarse a productos." y "Solo los tags activos pueden asignarse a productos." | Textos de pantalla / (código/código) |
| J·D-74 | P2.14 (J2), P3.04 | `ProductoService.listarFiltrosDisponibles`; `GET /categorias`, `GET /tags` | La baja lógica no modifica ningún producto ni el catálogo: los filtros salen de los productos visibles sin mirar `activo` y los `GET` devuelven las inactivas a cualquier autenticado | — | (código/código) |
| J·D-75 | P2.14 (J2), P2.08 | `FE js/comercio.js` (formulario de producto) | Editar un producto cuya categoría está inactiva deja el selector sin valor; al guardar, `tagIds` reemplaza la lista y se pierden los tags inactivos | — | (código/código) |
| J·D-76 | P2.14 (J2) | `CategoriaRequestDTO`, `TagRequestDTO`, `CategoriaService.crear`, `TagService.crear` | Sin `trim` ni normalización en el servidor (el frontend recorta); `@Size(max = 100)` sin mensaje propio; una carrera de altas devuelve el 409 genérico "Ya existe un registro con alguno de los datos ingresados" | — | (código/código) |
| J·D-77 | P2.13 (J3) | `EstadisticasComercioService.obtener`; `ComercioActivoService.resolverComoDueno` | Devuelve las estadísticas con el comercio en cualquier estado (no comprueba `APROBADO`, `APTO_VENTA`, `SUSPENDIDO`…); el Empleado y el Administrador reciben 403 de la capa de seguridad (la ruta no está en `DelegacionEmpleado`) | — | (código/código) |
| J·D-78 | P3.01, P3.04 | `initCatalogo` (`index.html`); `js/explorar.js` | Los chips "Delivery", "Retiro" y "Abierto ahora" son un filtro del lado cliente sobre `GET /catalogo/comercios` (`index.html`); Explorar solo tiene categoría, tags, búsqueda por nombre de producto y paginación; no existe búsqueda por nombre de comercio. **Corrige a D-COMPL·D-09** | Lo de D-COMPL·D-09 (RF-cli y HU-C08) | RF-cli, HU-Cliente (como D-COMPL·D-09) |
| J·D-79 | P3.04 | `ProductoService.listarCatalogoGlobal`; `CatalogoController` | `q` busca solo en `producto.nombre` con `contains` en minúsculas (sin normalizar tildes) y el servidor no limita su longitud (el frontend corta en 80); un parámetro de tipo inválido responde 400 "`<parámetro>`: valor inválido" | — | (código/código) |
### 3.12 Hallazgos que los informes dejaron sin id (hechos; sin asignar a un desvío)

- **Tramo A, A-COMPLEMENTO §4.2:** el Administrador no tiene pantalla de cambio de contraseña ("NO EXISTE EN EL CÓDIGO"; el endpoint `POST /auth/cambiar-password` cae en `anyRequest().authenticated()` y sirve a cualquier rol); el Empleado no la tiene dentro de un comercio y usa la del Cliente.
- **Tramo B, cierre (a):** endpoints sin pantalla que los use: `PATCH/DELETE /usuarios/{id}/foto-perfil` y `POST …/firma` (solo los usa el Cliente); `PUT /comercios/perfil/datos-operativos` (solo el Empleado); `GET /clientes/perfil` devuelve `fechaNacimiento` y `dni` y `fechaNacimiento` no se muestra.
- **Tramo B, cierre (b):** flujos que dependen de algo no construido: edición de datos personales y de nombre de usuario del Dueño; edición de datos fiscales desde el perfil del Dueño (no hay endpoint; solo la corrección de un comercio rechazado); foto personal del Dueño; asignación manual de un Empleado a un comercio (solo por invitación); rediseño de la suspensión de comercios.
- **Tramo B, cierre (c):** emails y avisos que el código dispara y no figuran (o solo indirectamente) en la documentación: aviso in-app al Dueño al aceptar una invitación; avisos `COMERCIO_SUSPENDIDO_EQUIPO` y `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` a los Empleados; emails `DUENO_SUSPENDIDO` y `DUENO_SUSPENSION_LEVANTADA` con la lista de comercios.
- **Tramo C, hallazgos 1 a 5 ("que cambian el dibujo"):** aprobar o rechazar no manda email (= C·D-01); los documentos van por multipart (= C·D-02); no existe "reemplazar" un documento, ni vencimientos, ni job de documentos; no hay aviso al Administrador por solicitud nueva ni re-solicitud (`NUEVO_COMERCIO_PENDIENTE` y `NUEVA_RESOLICITUD_COMERCIO` existen y nada los emite; coincide con los docs, que los marcan "sin emisor"); la aptitud tiene una única fuente de verdad (`AptitudVentaComercioService.decidir`, por evento, no por job).
- **Tramo D, hallazgos 1, 2, 3, 5, 6:** no existe endpoint de búsqueda/filtros de comercios (`GET /catalogo/comercios` sin parámetros); no hay baja física ni reordenamiento de productos; las estadísticas aceptan `desde`/`hasta` (máx. 92 días) y los chips 7/30 son del frontend; `ReaperturaComerciosJob` no mira el estado del comercio.
- **Tramo E §7.1:** `apiFetch` no tiene texto por defecto para los `4xx`; cada pantalla pone su respaldo.
- **Tramo G §0 y cierre:** no existe refresh de tokens, ni job de reintento de reembolsos, ni emisor de T27, T17, T18, T19, T22 ni T26 (D-41 a D-45); `app.backend-base-url` queda vacía sin `BACKEND_BASE_URL`.
- **Tramo J:** no existe `PUT` ni `DELETE` de tarifas (tabla append-only, sin "vigencia hasta"); la baja de una categoría o un tag es lógica y no modifica productos; las estadísticas son solo del Dueño (no figuran en `DelegacionEmpleado`) y no son una foto (pueden diferir del email de cierre de turno); `TurnoBackfillRunner` y el aviso de los 75 minutos son idempotentes (J, Parte final 2); `AptitudVentaComercioService` y T40/T41: sin cambios (J, Parte final 3).
- **Tramo H §0:** no existen como job la expiración de tokens, el pase del carrito a inactivo, el reencolado de resúmenes de turno `FALLIDO` ni el reenvío automático de avisos de cuenta; P7.04 no tiene disparador propio.

---

## 4. Índice de cuestiones abiertas de negocio

Columnas: clave · diagrama(s) · resumen de una línea · decisión de Diego (vacía).

### 4.1 Tramo A

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| A·C-01 | P1.03, P1.06, P1.07 | ¿`Usuario.email` debe ser insensible a mayúsculas por collation? Los DTO comparan el email tal cual y no se verificó la collation real | |
| A·C-02 | P1.02, P2.02 | La pantalla de éxito del registro de Dueño promete un email al aprobar el comercio: ¿existe? (el informe C responde: no, solo aviso in-app) | |
| A·C-03 | P1.04 | ¿Es intencional el 409 de `PENDIENTE` y `BLOQUEADO` antes de la contraseña? | |
| A·C-04 | P1.05 | ¿Hay que cerrar la fila de `sesion` cuando vence el JWT (24 h) o `AUTOMATICO` queda como valor reservado? | |
| A·C-05 | P1.02 | ¿El registro de Dueño debe aceptar foto personal? | |
| A·C-06 | P1.02 | Los textos de `ValidadorHorarios` y `validarModalidadesEntrega` no se transcribieron en el informe A (A-COMPLEMENTO transcribe `ValidadorHorarios`) | |

### 4.2 Tramo B

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| B·C-01 | P1.08 | ¿El Dueño debe poder cargar su foto personal (B·D-01)? Si sí, falta pantalla; si no, corregir los requisitos | |
| B·C-02 | P1.08 | ¿La foto de usuario debe validarse contra la carpeta `usuarios/{id}/perfil/` como las demás? | |
| B·C-03 | P1.08 | Texto exacto de `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` no abierto; confirmar contra "Ese nombre de usuario ya está en uso" | |
| B·C-04 | P1.08 | El límite de 3 cambios de nombre de usuario usa `LocalDateTime.now()` de la JVM y no el `Clock`: con otra zona la ventana de 30 días se corre unas horas | |
| B·C-05 | P1.10, P1.14 | Al suspender un Dueño o un comercio las invitaciones `PENDIENTE` quedan vivas pero no se pueden aceptar: ¿cancelarlas, vencerlas o aceptarlas igual? | |
| B·C-06 | P1.12 | ¿Se avisa por email al Empleado dado de baja o que pierde acceso? Hoy solo recibe un aviso in-app personal | |
| B·C-07 | P1.13 | ¿Suspender a un Cliente que es Empleado debe afectar su relación con los comercios? Hoy sigue `ACTIVO` y el equipo muestra `cuentaSuspendida` | |
| B·C-08 | P1.14 | La suspensión de un Dueño procesa los pedidos de forma síncrona dentro de la request del Administrador: ¿es aceptable el tiempo de respuesta? | |
| B·C-09 | P1.14 | Al suspender un Dueño los pedidos `PENDIENTE_PAGO` de sus comercios no se cancelan por esa vía (siguen su vencimiento): ¿es la regla buscada? | |
| B·C-10 | P1.16 | Un Empleado de un comercio `INACTIVO` entra en solo lectura: ¿debe verlo en el selector? | |

### 4.3 Tramo C

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| C·C-01 | P2.01 | Sin fila de historial al nacer `PENDIENTE` | |
| C·C-02 | P2.01 | `vigente_desde` por defecto en el alta | |
| C·C-03 | P2.01 | Alta adicional sin chequeo del estado de la cuenta | |
| C·C-04 | P2.01 | Carrera de CUIT/DNI sin traducción del índice único a 409 limpio (no se verificó si devuelve 500) | |
| C·C-05 | P2.02, P2.05 | `reemplazarHorarios` sin versionado en la corrección | |
| C·C-06 | P2.02 | Motivo de rechazo leído del historial | |
| C·C-07 | P2.04 | Comercio aprobado sin documentos queda `APROBADO` sin aviso | |
| C·C-08 | P2.03 | Un comercio `INACTIVO` no puede subir documentos | |
| C·C-09 | P2.03 | Sin auditoría del borrado de documentos | |
| C·C-10 | P2.04 | Pedidos en curso tras perder la aptitud | |
| C·C-11 | P2.03 | 20 documentos rechazados bloquean la subida sin forma de limpiar | |
| C·C-12 | P2.05 | `PUT /comercios/perfil` sin guard para estados no operativos previos a la aprobación (no verificado con llamada real) | |
| C·C-13 | P2.05 | Historial de versiones de horario | |
| C·C-14 | P2.05 | `CREAR` frente a reactivar una red social dada de baja | |

### 4.4 Tramo D parcial y D-COMPLEMENTO

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| D·C-01 | P3.02, P3.03 | ¿Está bien que el catálogo global excluya `CERRADO_TEMPORALMENTE` (D·D-01)? | |
| D·C-02 | P2.08 | ¿Debe borrarse el asset de Cloudinary al eliminar o reemplazar una imagen? Hoy queda huérfano | |
| D·C-03 | P2.07 | ¿Los avisos de reapertura automática al Dueño o Empleados son un requisito? Hoy no hay | |
| D·C-04 | P2.06, P3.01 | Chips de 7/30 días de estadísticas y filtros de comercios: confirmar en el frontend (resuelto parcialmente en D-COMPL) | |
| D·C-05 | P3.02 | Orden de los productos de un comercio en el catálogo no definido en el servicio (D-COMPL lo confirma como C-09) | |
| D-COMPL·C-06 | P3.02, P4.01 | El 409 de comercio `SUSPENDIDO` al agregar al carrito ("Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio.") no usa el aviso fijo con "Volver al catálogo": ¿intencional? | |
| D-COMPL·C-07 | P3.01, P3.02 | Detalle del comercio y Explorar sin `try/catch`: ¿estado de error con reintento? | |
| D-COMPL·C-08 | P2.07 | ¿El Dueño debe ver una explicación de "Cerrado temporalmente" (cuenta bloqueada) en su panel? | |
| D-COMPL·C-09 | P3.02 | Orden de comercios y de productos del menú depende de la base (sin `ORDER BY`): ¿orden estable definido? | |
| D-COMPL·C-10 | P3.01 | El catálogo de comercios no tiene búsqueda por nombre ni filtro por tipo ni localidad: ¿es el alcance definitivo? | |
| D-COMPL·C-11 | P2.06 | "Últimos 7/30 días" incluye hoy; el requisito no lo precisa | |
| D-COMPL·C-12 | P3.02 | `resumenHorarioHoy` usa el reloj del navegador mientras el estado abierto/cerrado lo da el servidor | |

### 4.5 Tramo E

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| E·C-13 | P4.02 | `confirmarPedido` no valida que la localidad de entrega sea de la zona del comercio: ¿no existe zona de reparto? | |
| E·C-14 | P4.02, P4.10 | `detalle_pedido` no guarda el nombre del producto: un renombre cambia pedidos viejos | |
| E·C-15 | P4.03, P4.06 | `RechazoPedidoRequestDTO.motivo`, `AnulacionPedidoRequestDTO.motivo` y sus `@Size(max = 500)` sin `message` | |
| E·C-16 | P4.01 | `PUT/POST /carrito/items` no controlan el subtotal máximo ($99.999.999) ni revalidan el producto | |
| E·C-17 | P4.05 | El backend permite cancelar `PENDIENTE_PAGO` siempre; la pantalla solo lo ofrece con el comercio no disponible | |
| E·C-18 | P4.03 | "Aceptar pedido" solo se oculta con `SUSPENDIDO`; con `CERRADO_TEMPORALMENTE` el Empleado lo ve y recibe 409 | |
| E·C-19 | P4.02 | `totalEsperado` es opcional: otro consumidor de la API puede crear un pedido a un total distinto del visto | |
| E·C-20 | P4.03, P4.06 | `rechazarPedido` guarda `comentario_rechazo` sin `trim`; `anularPedido` lo recorta y deja `null` si está vacío | |
| E·C-21 | P4.05 | Un Cliente `SUSPENDIDO` no puede cancelar su pedido (`CuentaSuspendidaException`) aunque sus pagados sigan su curso | |
| E·C-22 | P4.10 | `textoVencimientoPedido` usa `Date.now()` del navegador | |

### 4.6 Tramo F

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| F·C-23 | P4.09, P5.04 | ¿Debe registrarse o retenerse algo al comercio cuando un reclamo se aprueba con reembolso? Hoy no hay retención ni liquidación y el reparto de la comisión en un parcial no está verificado | |
| F·C-24 | P4.09 | Paginación de la bandeja de reclamos: el servidor acepta `limite` (50/200) y `pagina`; no se relevó que el frontend ofrezca "Ver más" | |
| F·C-25 | P4.11 | ¿P4.11 debe mostrar un historial acotado en el tiempo? Hoy una lista única de todos los pagados | |

### 4.7 Tramo G

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| G·C-26 | P5.01 | `codigo_vinculacion_mp` nunca vence; el callback es público y se liga al Dueño solo por el `state` | |
| G·C-27 | P5.01, P5.02 | La vinculación no renueva tokens (`refresh_token` y `token_expira` sin uso): vencen a los ~6 meses sin aviso | |
| G·C-28 | P5.02 | `sincronizarPago` sin `paymentId` captura solo `RestClientResponseException`: red caída o timeout termina en 500 | |
| G·C-29 | P5.02, P5.03 | `app.backend-base-url` vacía sin `BACKEND_BASE_URL`: la `notification_url` sería relativa | |
| G·C-30 | P5.02, P4.11 | `GET /pedidos/comercio/{id}/pago` solo para pedidos ya pagados y sin consumidor en el frontend | |
| G·C-31 | P5.04, P6.01 | Sin aviso al Cliente al confirmarse el reembolso de un pago tardío, al cancelar un pedido pagado ni cuando una nota pasa a `PROCESADO` o falla | |
| G·C-32 | P5.04 | Si el hilo post-commit se cae antes de registrar el resultado, la nota queda `PENDIENTE` y nadie la retoma | |
| G·C-33 | P5.05, P4.09 | Orden de bloqueos del reintento manual (nota → pago) frente a `generarNotaDeReclamo`: posible interbloqueo no probado | |
| G·C-34 | P5.05 | La clave de idempotencia `nc-{id}-{intentos+1}` cambia en cada reintento: riesgo de reembolso de más tras un timeout | |
| G·C-35 | P5.03 | Un pago `refunded` o `charged_back` posterior al `approved` se ignora; el pedido no se entera de un contracargo | |
| G·C-36 | P5.03 | Respuestas del webhook: 409 (MP reintenta) y 500 por `pedidoId` no numérico | |
| G·C-37 | P5.01 | Texto "30 minutos" de la hoja de desvinculación escrito en el frontend frente a `pedido.timeout.pago-minutos` | |

### 4.8 Tramo H

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| H·C-38 | P7.04, P2.04 | Reactivar un Dueño: un comercio `INACTIVO` que vuelve a `APTO_VENTA` no genera aviso y uno que vuelve a `APROBADO` recibe T41 "dejó de recibir pedidos" aunque no vendía | |
| H·C-39 | P7.03, P4.01 | ¿Se implementa el pase del carrito a inactivo (H·D-55) o se corrige la documentación? | |
| H·C-40 | P7.03 | Email de inactivación con un solo intento y sin reenvío; es el único canal de la persona | |
| H·C-41 | P7.03 | "3 meses" escrito a mano en email y pantalla mientras `inactividad.meses` es configurable | |
| H·C-42 | P7 | Un solo hilo de programación: los 11 `@Scheduled` se serializan; un cierre de turno largo retrasa reaperturas, vencimientos y pedidos | |
| H·C-43 | P7.01, P7.03 | La inactivación no limpia `cerrado_manualmente` y la reapertura sigue evaluando comercios `INACTIVO` o `SUSPENDIDO` | |
| H·C-44 | P7.02 | `registrarEmailEnviado` escribe `ENVIADO` aunque el envío falle o esté deshabilitado; el tope de 3/24 h cuenta intentos | |
| H·C-45 | P1.04, P7.03 | `AuthService.iniciarSesion`, sesiones y `ComercioService.registrarTransicionAutomatica` usan `LocalDateTime.now()` de la JVM | |
| H·C-46 | P7.02 | "Vencida hace N días" con el reloj del navegador | |
| H·C-47 | P1.07, P7.04 | `reactivar-cuenta.html` huérfana: ¿retirarla con `/auth/reactivar-cuenta` y `/confirmar` o dejarla de respaldo? | |
| H·C-48 | P1.04, P7.04 | Cuenta inactiva con 3 intentos fallidos: sigue `INACTIVO` pero el login muestra el banner de cuenta bloqueada; ¿estado propio en el DFD o dentro de "cuenta inactiva"? | |

### 4.9 Tramo I

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| I·C-49 | P8.03 | `soporte_limite` crece sin acotar y sin limpieza (ningún job la purga) | |
| I·C-50 | P8.04, P6.01 | El Administrador no recibe aviso por consulta nueva ni seguimiento: ¿se emite `NUEVO_MENSAJE_SOPORTE` (T22)? ¿hay tiempo máximo de respuesta? | |
| I·C-51 | P8.01 | El Visitante puede disparar emails "Recibimos tu consulta" a un email ajeno (3 por día por email, 10 por IP); sin captcha ni honeypot | |
| I·C-52 | P8.02 | Un Dueño o Empleado escribe a Soporte sin contexto de comercio (`ticket_soporte` no guarda comercio), sobre todo para `APELACION_COMERCIO` | |
| I·C-53 | P8.03 | El reenvío de códigos manda el email en la misma petición (canal lateral de tiempo); un tercero que conoce un email puede agotarle los 30 accesos por hora | |
| I·C-54 | P8.04, P8.05 | No hay vínculo entre ticket y suspensión: ¿"Levantar suspensión desde Soporte" (P8.05) o proceso separado? Tampoco hay reapertura de ticket cerrado ni cierre automático por inactividad | |
| I·C-55 | P8.01, P8.03 | IP del solicitante con `request.getRemoteAddr()`: detrás de un proxy todos comparten IP si `server.forward-headers-strategy` no está configurado (solo lo define `application-test.properties`) | |
| I·C-56 | P7 | Scheduler de un solo hilo (por configuración, no verificado en ejecución); duplicada con H·C-42 | |

### 4.10 Tramo J

| Clave | Diagrama | Resumen | Decisión de Diego |
|---|---|---|---|
| J·C-57 | P7.09 (J1) | ¿Debe el servidor validar un tope (por ejemplo porcentaje de 0 a 100) y un máximo para las tarifas? | |
| J·C-58 | P7.09 (J1) | Sin tarifa vigente el carrito y los pedidos quedan bloqueados con 409: ¿es lo buscado o debe haber un valor por defecto? | |
| J·C-59 | P7.09 (J1) | ¿Debe avisarse a Dueños y Clientes un cambio de tarifa o programarse una vigencia futura? Hoy se aplica siempre "desde ahora" y sin aviso | |
| J·C-60 | P7.09 (J1) | ¿Debe el pedido conservar una referencia a la configuración de tarifa aplicada (flujo 64) además de los montos? | |
| J·C-61 | P2.14 (J2) | ¿Debe desactivar una categoría o un tag impedir su asignación en el servidor y ocultarlos del catálogo del Cliente, o solo del selector del Dueño? | |
| J·C-62 | P2.14 (J2) | ¿Un producto cuya categoría quedó inactiva debe seguir publicado? Hoy sí | |
| J·C-63 | P2.14 (J2) | ¿Es la regla buscada que "Café" y "cafe" (y mayúsculas) cuenten como el mismo nombre, incluso al renombrar solo la capitalización? | |
| J·C-64 | P2.13 (J3) | ¿Deben verse las estadísticas con el comercio en cualquier estado y debe el Empleado poder verlas? Hoy el servidor no mira el estado y el Empleado no | |
| J·C-65 | P3.01, P3.04 | ¿Hace falta una búsqueda de comercios por nombre (del servidor)? Hoy no existe: solo la de productos en Explorar | |
**Total de filas de esta §4:** 95 cuestiones (A 6 · B 10 · C 14 · D 5 · D-COMPL 7 · E 10 · F 3 · G 12 · H 11 · I 8 · J 9).

---

## 5. Chequeo cruzado contra el DFD Nivel 1

Fuente de los hechos: los informes (con el diagrama que los cubre). Solo hechos, sin proponer cambios al DFD.

### 5.1 Flujos del Nivel 1 (`02. Diseño`) y si el código los ejecuta

Leyenda: **Sí** = el código lo ejecuta tal como se dibuja. **Parcial** = lo ejecuta con diferencias. **No** = el código no lo ejecuta. **Sin detalle** = listado en un informe sin diagrama que lo describa.

| # | Flujo del N1 (texto del N1) | ¿Lo ejecuta? | Diagrama(s) | Hecho |
|---|---|---|---|---|
| 1 | VISITANTE → P8 "Consulta sin sesión y código de acceso" | Sí | P8.01, P8.03 | `POST /soporte/publico/consultas`, `/consultas/ver`, `/consultas/responder`, `/codigos/reenviar` |
| 2 | P8 → VISITANTE "Código de consulta y respuestas" | Sí | P8.01, P8.03 | Respuesta HTTP con código y emails "Recibimos tu consulta", "Tus códigos de consulta", "Soporte respondió tu consulta" (Resend) |
| 3 | CLIENTE → P1 "Registro, credenciales, direcciones y reactivación" | Sí | P1.01, P1.04, P1.09, P1.07 | También P1.03, P1.06, P1.08 (no nombrados en el flujo) |
| 4 | P1 → CLIENTE "Códigos, confirmación, vista previa de reactivación y estado de cuenta" | Sí | P1.01, P1.03, P1.07 | La vista previa del propio usuario no es un endpoint: es el 409 del login con `data.comercios` |
| 5 | CLIENTE → P3 "Búsqueda y filtros" | Parcial | P3.01, P3.02, P3.04 | `GET /catalogo/comercios` no recibe parámetros; búsqueda, tipo, modalidad y "abierto ahora" son del frontend (J·D-78: los chips "Delivery", "Retiro" y "Abierto ahora" están en `initCatalogo` de `index.html`; no existe búsqueda de comercios por nombre del lado servidor); Explorar usa `/catalogo/productos` (`q` solo sobre `producto.nombre`) y `/catalogo/filtros` |
| 6 | P3 → CLIENTE "Comercios y menús" | Sí | P3.02, P3.03 | |
| 7 | CLIENTE → P4 "Carrito, pedidos, cancelaciones y reclamos con fotos" | Sí | P4.01, P4.02, P4.05, P4.08 | Fotos por `multipart` sobre el mismo endpoint (V51) |
| 8 | P4 → CLIENTE "Detalle, estados y resolución de reclamos" | Sí | P4.10, P4.09 | Resolución con aviso in-app y email (F·D-39); sin trazabilidad para el Cliente (F·D-35) |
| 9 | CLIENTE → P8 "Consultas a Soporte" | Sí | P8.02, P8.03 | |
| 10 | P8 → CLIENTE "Respuestas de Soporte" | Sí | P8.02 | Email y lectura en "Mis consultas"; sin fila in-app |
| 11 | DUENO → P1 "Registro, credenciales, foto personal y datos fiscales" | Parcial | P1.02, P1.04, P1.08 | Registro y credenciales: sí. Foto personal: endpoints existen para cualquier rol pero ninguna pantalla del Dueño los usa y el registro no la pide (A·D-06, B·D-01). Datos fiscales: se cargan en el registro y en la corrección de un comercio rechazado; no hay endpoint de edición desde el perfil |
| 12 | P1 → DUENO "Códigos y confirmación de cuenta" | Sí | P1.02, P1.03 | |
| 13 | DUENO → P1 "Invitar, activar y desactivar empleados" | Sí | P1.10, P1.12 | También reenviar y cancelar invitaciones |
| 14 | P1 → DUENO "Estado de invitaciones de empleados" | Sí | P1.10, P1.12 | `GET /comercios/equipo` |
| 15 | DUENO → P2 "Datos de sus comercios, productos, horarios, redes sociales y documentos de habilitación" | Parcial | P2.01, P2.03, P2.05, P2.08 | Redes sociales: endpoints sí, sin pantalla de edición (C·D-13) |
| 16 | P2 → DUENO "Estado de aprobación, aptitud para vender, estado de documentos e historial" | Parcial | P2.02, P2.04, P6.01 | Aprobación y rechazo solo con aviso in-app, sin email (C·D-01) |
| 17 | DUENO → P4 "Gestión de pedidos de sus comercios" | Sí | P4.03 a P4.07, P4.11 | |
| 18 | P4 → DUENO "Pedidos entrantes, reclamos y ventas por turno" | Sí | P4.11, P4.09, P2.06 | Reclamos solo lectura (sin mensaje ni motivo de rechazo); `resumen-turno` lo sirve `PedidoController` |
| 19 | DUENO → P5 "Vinculación OAuth de Mercado Pago" | Sí | P5.01 | Además desvinculación y su previa (`DELETE /oauth/mercadopago/desvincular`, `GET …/desvinculacion/previa`) |
| 20 | P5 → DUENO "Confirmación de vinculación" | Sí | P5.01 | Redirección a `comercio-perfil.html?vinculacionMp=` |
| 21 | DUENO → P8 "Consultas a Soporte" | Sí | P8.02 | |
| 22 | P8 → DUENO "Respuestas de Soporte" | Sí | P8.02 | |
| 23 | EMPLEADO → P1 "Aceptar invitación y credenciales" | Sí | P1.11, P1.04 | |
| 24 | P1 → EMPLEADO "Códigos y confirmación de alta" | Sí | P1.11 | |
| 25 | EMPLEADO → P2 "Productos, horarios y redes sociales de comercios asignados" | Parcial | P2.05, P2.07, P2.08 | Productos y horarios: sí. Redes sociales: `403` para el Empleado (tabla de P2.05). Además el Empleado edita descripción y teléfono (datos operativos) y abre y cierra el comercio |
| 26 | P2 → EMPLEADO "Comercios asignados y su estado" | Sí | P1.16, P2.05 | `GET /empleados/mis-comercios` (`EmpleadoController`, P1.16) y `GET /comercios/perfil` con DTO reducido |
| 27 | EMPLEADO → P4 "Gestión de pedidos de comercios asignados" | Sí | P4.03 a P4.07 | |
| 28 | P4 → EMPLEADO "Pedidos entrantes" | Sí | P4.11 | DTO reducido (`PedidoEmpleadoResponseDTO`) |
| 29 | EMPLEADO → P8 "Consultas a Soporte" | Sí | P8.02 | |
| 30 | P8 → EMPLEADO "Respuestas de Soporte" | Sí | P8.02 | |
| 31 | ADMIN → P1 "Credenciales" | Sí | P1.04 | |
| 32 | ADMIN → P1 "Gestión de cuentas (suspensión y levantamiento de Clientes y Dueños)" | Sí | P1.13, P1.14 | |
| 33 | P1 → ADMIN "Listados de Clientes y Dueños" | Sí | P1.13, P1.14 | `GET /administrador/clientes`, `/duenos` |
| 34 | ADMIN → P2 "Aprobaciones, rechazos, suspensiones, revisión de documentos y catálogo" | Sí (reclasificado por J) | P2.02, P2.04, P2.09, P2.10, P2.14 | Versión 1: Parcial porque el CRUD de servidor de categorías y tags no figuraba en ningún informe. J2: `POST`, `PUT`, `DELETE` (baja lógica) y `PUT …/reactivar` de `/categorias` y `/tags` existen y los usa la pantalla del Administrador (diferencias de detalle en J·D-72 a J·D-76) |
| 35 | P2 → ADMIN "Solicitudes pendientes, documentos por revisar, listados y re-solicitudes" | Sí | P2.02, P2.04, P2.10 | |
| 36 | ADMIN → P4 "Resolución de reclamos (total, parcial o rechazo)" | Sí | P4.09 | |
| 37 | P4 → ADMIN "Reclamos pendientes y fotos adjuntas" | Sí | P4.09 | |
| 38 | ADMIN → P7 "Configuración de tarifas" | Sí (reclasificado por J) | P7.09 (J1) | `POST /administrador/tarifas` (201 "Tarifa creada correctamente") inserta una fila en `configuracion_tarifa` (tabla append-only; sin `PUT` ni `DELETE`); pantalla `admin-tarifas.html` |
| 39 | P7 → ADMIN "Historial de tarifas" | Sí (reclasificado por J) | P7.09 (J1) | `GET /administrador/tarifas/vigente` y `GET /administrador/tarifas/historial` (todas las filas, sin paginar) |
| 40 | ADMIN → P8 "Respuestas y cierre de consultas" | Sí | P8.04 | |
| 41 | P8 → ADMIN "Bandeja de consultas y conversaciones" | Sí | P8.04 | Contador `consultasSoporteEsperando` con sondeo de 15 s |
| 42 | MP → P5 "Webhook de pago y estado de reembolso" | Parcial | P5.03, P5.04 | Webhook de pago: sí. Estado de reembolso: no llega como webhook; el resultado es la respuesta síncrona de `POST …/refunds`; un `refunded` o `charged_back` posterior al `approved` se ignora (G·C-35) |
| 43 | P5 → MP "Solicitud de cobro, split y reembolso" | Sí | P5.02, P5.04, P5.05 | Preferencia con `marketplace_fee`; reembolso total y parcial |
| 44 | P4 → P5 "Solicitud de pago (PENDIENTE_PAGO)" | Sí | P5.02 | `POST /pedidos/cliente/{id}/pago` |
| 45 | P5 → P4 "Confirmación de pago o rechazo vía webhook" | Sí | P5.03 | `aplicarResultadoPago`; también `POST …/pago/sincronizar` |
| 46 | P4 → P5 "Solicitud de reembolso" | Sí | P5.04 | `ReembolsoService.generarNotaYReembolsarTotal` invocado desde `PedidoService` |
| 47 | P5 → P4 "Resultado de reembolso" | Sí | P5.04 | Estado en `nota_credito`; sin job de reintento (G·D-41) |
| 48 | P2 → P3 "Productos activos y comercios disponibles" | Sí | P3.02, P3.03 | |
| 49 | P4 → P6 "Eventos de pedido, pago y reclamo" | Sí | P6.01 | |
| 50 | P2 → P6 "Eventos de comercio y documentos (aprobación, suspensión, aptitud)" | Sí | P6.01 | T14, T15, T16, T40, T41 y avisos de documentos |
| 51 | P1 → P6 "Eventos de usuario (suspensión, inactivación, invitación)" | Sí | P6.01, P1.10, P1.11 | Los emails de invitación y de regularización los arma el servicio de invitaciones |
| 52 | P7 → P6 "Eventos de automatismo (vencimientos, cierre de turno)" | Parcial | P7.01 a P7.05, P6.01 | Los jobs de pedidos y la inactivación crean avisos; la reapertura y el vencimiento de invitaciones no emiten avisos ni emails; el cierre de turno envía email directo (`CierreTurnoEnvioService.java:123`) y guarda su estado en `cierre_turno` |
| 53 | P8 → P6 "Respuesta de Soporte" | No | P8.04 | I Parte 3: "No existe en el código: flujo P8 → P6"; el email de respuesta lo envía P8 directo por `EmailService` y solo marca `ticket_soporte_mensaje.email_enviado` |
| 54 | P6 → CLIENTE "Avisos en la app y email" | Parcial | P6.01, P6.02 | In-app sí; los avisos de pedido no envían email (E·D-25, G·D-44); emails de cuenta y reclamos salen por `AvisoCuentaService` y `AvisoReclamoService` |
| 55 | P6 → DUENO "Avisos en la app y email" | Parcial | P6.01 | Ídem; T14 y T15 sin email (G·D-45) |
| 56 | P6 → EMPLEADO "Avisos en la app y email" | Parcial | P6.01 | Ídem |
| 57 | P6 → VISITANTE "Email de respuesta y de código" | Parcial | P8.01, P8.03 | Los emails al Visitante los envía P8 por `EmailService`, no `NotificacionService` |
| 58 | P7 → P4 "Vencimiento de PENDIENTE_PAGO (30 min), de PENDIENTE_CONFIRMACION_COMERCIO (30 min) y autoconfirmación de EN_CAMINO (90 min)" | Sí | P7 (jobs de pedidos), P4.04 | `pedido.timeout.pago-minutos=30`, `respuesta-comercio-minutos=30` (corrida cada 300 s: vence entre 30 y 35 min), `autoconfirmacion-en-camino-minutos=90`; además un aviso a los 75 min |
| 59 | P7 → P4 "Rechazo, cancelación y cierre de pedidos por suspensión del comercio" | Sí | P7, P2.09, P1.14 | Cuatro métodos de `PedidoSchedulerService` (retiros por suspensión → `NO_RETIRADO`, preparación, pendientes, sin atención por suspensión del Dueño) |
| 60 | P7 → P1 "Inactivación automática de cuentas (3 meses sin uso)" | Sí | P7.03 | `inactividad.meses = 3` (meses calendario, no 90 días) |
| 61 | P7 → P2 "Propagación de estado Dueño → sus comercios" | No (como flujo de P7) | P7.03, P7.04, P1.14 | H·Parte 3 (d): no es un job; ocurre dentro de la transacción de bloqueo, suspensión o inactivación (`AuthService.propagarBloqueoAComercio`, `SuspensionDuenoService`, `InactivacionCuentaService`) |
| 62 | P7 → P2 "Cierre de turno y email de resumen" | Sí | P7.05, P2.06d | `CierreTurnoJob`: `cierre_turno` y email por Resend |
| 63 | P7 → P4 "Tarifa vigente al crear pedido" | Sí | P4.02, P7.09 (J1) | `configuracion_tarifa` leída en cada `GET /carrito` con subtotal mayor a 0 (y en los otros tres métodos que devuelven el carrito) y en `confirmarPedido` (E §2; J1.4); sin tarifa vigente responde 409 "No hay ninguna configuración de tarifa vigente" |
| 64 | P4 → P7 "Tarifas almacenadas en pedidos históricos" | No (reclasificado por J) | P7.09 (J1) | Ningún flujo va de `pedido` hacia `configuracion_tarifa` (J1.6): el pedido guarda solo los montos (`subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio`, `total`) y ninguna referencia a la configuración; el único sentido es P7 → P4 (J·D-71) |

**Conteo de la §5.1 en la versión 2:** 50 Sí · 11 Parcial · 2 No (flujos 53 y 64) · 1 No como flujo de P7 (flujo 61) · 0 Sin detalle · 0 Sin evidencia = 64. En la versión 1 eran 47 · 12 · 1 · 1 · 2 · 1. La diferencia: los flujos 38 y 39 pasan de Sin detalle a Sí (J1), el flujo 64 pasa de Sin evidencia a No (J1.6) y el flujo 34 pasa de Parcial a Sí (J2 relevó el CRUD de servidor que faltaba; es una reclasificación derivada, ver §8).

### 5.2 Flujos que el N1 dibuja y el código no ejecuta (o no ejecuta tal como se dibuja)

1. **P8 → P6 "Respuesta de Soporte" (flujo 53):** no existe.
2. **P7 → P2 "Propagación de estado Dueño → sus comercios" (flujo 61):** no es un proceso de P7; es parte de las transacciones de P1 y P7.03.
3. **MP → P5 "estado de reembolso" (parte del flujo 42):** no hay recepción de estado de reembolso desde MP; refunded/charged_back posteriores al `approved` se ignoran.
4. **DUENO → P1 "foto personal" y "datos fiscales" (parte del flujo 11):** foto personal sin pantalla; datos fiscales sin endpoint de edición desde el perfil.
5. **EMPLEADO → P2 "redes sociales" (parte del flujo 25):** `403` para el Empleado.
6. **DUENO → P2 "redes sociales" (parte del flujo 15):** los endpoints existen; la pantalla de edición no.
7. **P6 → CLIENTE / DUENO / EMPLEADO "… y email" para avisos de pedido, T11, T14 y T15 (flujos 54 a 56):** no envían email.
8. **P6 → VISITANTE (flujo 57):** los emails salen de P8, no de P6.
9. **P4 → P7 "Tarifas almacenadas en pedidos históricos" (flujo 64):** el código no lo ejecuta (J1.6): ningún flujo va del pedido a `configuracion_tarifa`; el pedido solo guarda los montos.
10. **ADMIN ↔ P7 tarifas (flujos 38 y 39):** retirado de esta lista en la versión 2: J1 confirma que el código los ejecuta (ver §5.1).

### 5.3 Flujos que el código ejecuta y el N1 no dibuja

- **ADMIN → P1 "Reactivar cuenta" (`PUT /administrador/cuentas/{id}/reactivar`, con vista previa `GET …/reactivar/previa`):** el N1 solo dice "suspensión y levantamiento" (P7.04, `admin-reactivar.js`).
- **EMPLEADO → P1 "Renuncia" (`PUT /empleados/comercios/{id}/renunciar`) y acceso (`GET /empleados/comercios/{id}/acceso`):** el N1 solo dibuja "Aceptar invitación y credenciales" (P1.12, P1.16).
- **EMPLEADO → P2 "Apertura o cierre del comercio" y "descripción y teléfono" (`PUT /comercios/cerrar`, `/abrir`, `PUT /comercios/perfil/datos-operativos`):** el N1 dice "Productos, horarios y redes sociales" (P2.05, P2.07).
- **P7 → P2 "Reapertura automática de comercios" (`ReaperturaComerciosJob`):** el único flujo P7 → P2 dibujado es el cierre de turno y la propagación.
- **P7 → P1 "Vencimiento de invitaciones de Empleado" (`InvitacionVencimientoJob`):** no dibujado (P7.02).
- **P7 → P4 "Asignación de turnos a pedidos anteriores al arrancar" (`TurnoBackfillRunner`) y el aviso de los 75 minutos:** no dibujados. J (Parte final 2): `TurnoBackfillRunner` corre en `ApplicationReadyEvent` con `turno.backfill.habilitado=true`, lee `pedido` (`turno_fecha IS NULL` y `fecha_pago_confirmado IS NOT NULL`) y `horario`, escribe `pedido.turno_fecha` y `pedido.turno_horario_id` con `UPDATE … WHERE id = ? AND turno_fecha IS NULL` (idempotente); el aviso de los 75 minutos crea `AVISO_75MIN_SIN_CONFIRMACION` y marca `pedido.primer_aviso_emitido` (idempotente).
- **P7 → P4 / P4 → P7 "Lectura de la tarifa vigente en cada `GET /carrito` con subtotal mayor a 0" (J1.4):** el N1 (flujo 63) dice "Tarifa vigente al crear pedido"; el código también la lee al armar cualquier `CarritoResponseDTO` (`verCarrito`, `agregarItem`, `actualizarCantidad`, `eliminarItem`).
- **P5 → P2 "Recalcular aptitud de los comercios al vincular o desvincular Mercado Pago" (`recalcularComerciosDelDueno`):** no hay flujo P5 → P2.
- **P2 → P4 "Estado del comercio, horarios, aptitud y productos usados al agregar al carrito y al confirmar el pedido" y P2 → P4 "baja de ítems del carrito por producto agotado o descontinuado":** el único P2 hacia aguas abajo dibujado es P2 → P3.
- **P2 → P4 "Suspensión de comercio: rechazo, cancelación y cierre de pedidos hechos por el Administrador en el acto":** el N1 solo dibuja el camino por P7.
- **P1 → P4 "Suspensión de Cliente cancela los pedidos sin pagar"; P1 → P4 / P2 "Suspensión de Dueño procesa pedidos y comercios":** no dibujados.
- **P1 → P2 "Cascada del bloqueo, la suspensión y la inactivación a los comercios del Dueño":** ver flujo 61.
- **P5 ← ADMIN "Reintento manual de reembolsos" (`POST /administrador/reembolsos/{id}/reintentar`) y listado de reembolsos:** el N1 no tiene ningún flujo ADMIN ↔ P5.
- **P5 ↔ MP "intercambio de código por tokens OAuth" (P5.01):** el flujo P5 → MP del N1 se rotula "Solicitud de cobro, split y reembolso".
- **Actores → P6 "Consulta y lectura de notificaciones" (`GET /notificaciones`, contador, marcar leídas, sondeo de 15 s):** el N1 solo dibuja P6 → actores.
- **CLIENTE → P1 "Perfil, cambio de nombre de usuario, foto de perfil, cambio de contraseña":** el N1 menciona "Registro, credenciales, direcciones y reactivación".
- **P1 → P6 / P7 "Reactivar cuenta": avisos T40 y T41 al restaurar comercios:** no dibujado como flujo propio.

### 5.4 Diferencias entre las dos copias del N1 (`docs/entregables-01-02` y `02. Diseño`)

La copia de `docs/entregables-01-02/` (4681 bytes) no coincide con la de `02. Diseño`. Diferencias de contenido:

| Elemento | `docs/entregables-01-02/` | `02. Diseño/` |
|---|---|---|
| Entidad Visitante y proceso P8 Soporte (y todos sus flujos) | No existen | Existen |
| CLIENTE → P1 | "Registro, credenciales y reactivación" | "Registro, credenciales, direcciones y reactivación" |
| P1 → CLIENTE | "Tokens, confirmación y estado de cuenta" | "Códigos, confirmación, vista previa de reactivación y estado de cuenta" |
| CLIENTE → P4 | "Carrito, extras, pedidos y reclamos" | "Carrito, pedidos, cancelaciones y reclamos con fotos" |
| P4 → CLIENTE | "Detalle, estados y reclamos" | "Detalle, estados y resolución de reclamos" |
| DUENO → P1 (equipo) | "Invitar, reenviar, cancelar, desactivar y reactivar empleados" | "Invitar, activar y desactivar empleados" |
| P1 → DUENO (equipo) | "Estado de invitaciones y del equipo de empleados" | "Estado de invitaciones de empleados" |
| DUENO → P2 | "… productos, extras, horarios y redes sociales" | "… productos, horarios, redes sociales y documentos de habilitación" |
| P2 → DUENO | "Estado de aprobación, historial y comercios administrados" | "Estado de aprobación, aptitud para vender, estado de documentos e historial" |
| P4 → DUENO | "Pedidos entrantes" | "Pedidos entrantes, reclamos y ventas por turno" |
| EMPLEADO → P1 | "Aceptar invitación, credenciales y renuncia" | "Aceptar invitación y credenciales" |
| EMPLEADO → P2 | "Datos básicos, productos y apertura o cierre de comercios asignados" | "Productos, horarios y redes sociales de comercios asignados" |
| ADMIN → P1 | "Gestión de usuarios (suspensión y reactivación)" y sin retorno | "Gestión de cuentas (suspensión y levantamiento de Clientes y Dueños)" más P1 → ADMIN "Listados de Clientes y Dueños" |
| ADMIN → P2 | "Aprobaciones, rechazos, suspensiones y catálogo" | "… revisión de documentos y catálogo" |
| ADMIN → P4 | "Resolución de reclamos" / "Reclamos pendientes" | "(total, parcial o rechazo)" / "y fotos adjuntas" |
| P2 → P3 | "Productos activos, extras y comercios disponibles" | "Productos activos y comercios disponibles" |
| P2 → P6 | "Eventos de comercio (aprobación, suspensión)" | "… y documentos (aprobación, suspensión, aptitud)" |
| P1 → P6 | "(bloqueo, inactivación, invitación)" | "(suspensión, inactivación, invitación)" |
| P7 → P6 | "(timeout, expiración)" | "(vencimientos, cierre de turno)" |
| P6 → CLIENTE/DUENO/EMPLEADO | "Notificaciones push y email" | "Avisos en la app y email" |
| P6 → ADMIN | "Notificaciones push" | No existe |
| P7 → P4 | "Timeout PENDIENTE_PAGO (30 min) y PENDIENTE_CONFIRMACION_COMERCIO (1 h)" | "Vencimiento de PENDIENTE_PAGO (30 min), de PENDIENTE_CONFIRMACION_COMERCIO (30 min) y autoconfirmación de EN_CAMINO (90 min)" más "Rechazo, cancelación y cierre de pedidos por suspensión del comercio" |
| P7 → P5 | "Reintento de reembolsos fallidos" | No existe |
| P7 → P1 | "Inactivación automática de usuarios (90 días)" | "Inactivación automática de cuentas (3 meses sin uso)" |
| P7 → P2 | "Propagación de estado Dueño → sus comercios" | Ídem y además "Cierre de turno y email de resumen" |

Hechos de los informes sobre los puntos de la copia de `docs/entregables-01-02/` que difieren: "extras" no tiene código (D-COMPL·D-12, E·D-20); `PENDIENTE_CONFIRMACION_COMERCIO` vence a los 30 minutos (E·D-24, H); no hay job de reintento de reembolsos (G·D-41); la inactivación usa 3 meses calendario, no 90 días (I Parte 3 (c)); el Administrador no recibe avisos (G·D-43).

---

## 6. Pendientes NO RELEVADO

Todo lo que los informes marcan como no verificado, por muestreo o sin evidencia en ejecución.

### 6.1 Sin ejecución (aplica a todos los tramos)

- Ningún informe ejecutó el backend, la base (`practicas3`/`bajonea_final`) ni suites. E §10: "Estado real de la base … todo el informe sale de lectura de código, no de ejecución". I §2.7: "no se ejecutó ninguna suite" (solo inventario de nombres de test).
- **Tests no leídos ni ejecutados:** Playwright, Newman y Java de los tramos E (§10), G (solo se listaron specs `20-reembolsos-admin`, `09`, `45`, `54`, `108`, `109`, `112` a `114`) y H ("Pruebas (Java, Playwright, Newman, estreses) de estos procesos"). I: inventario de P8 e ítems 1 a 4 sin ejecutar; `SoporteConcurrenciaIntegrationTest` "no se verificó cómo se repiten"; los tests de los specs `91` y `92` de Playwright no se contaron; no hay spec de API de Soporte en Playwright; `TurnoBackfillRunner` sin test propio identificado.

- **Tramo J:** no se ejecutó el `POST` de tarifas, ni ninguna consulta contra las bases, ni las suites.

### 6.2 C del scheduler (C-42 de H y C-56 de I)

- **Un solo hilo del scheduler:** conclusión "por configuración" (sin `TaskScheduler`, `@EnableAsync`, ni `spring.task.scheduling.*`); "**No se observó un volcado de hilos con la aplicación corriendo**" (I §2.5). El tamaño de pool por defecto de Spring Boot es "conocimiento del framework, no verificado en esta sesión" (H·C-42). El costo de 16 s con 2000 comercios sale de CLAUDE.md, no de una medición en esos informes.
- **`@Scheduled` de pedidos:** cuerpos de `PedidoService` de los 7 procesos y de `TurnoBackfillService`, `TurnoPedidoService`, `CierreTurnoInsercionRepository` (SQL del `INSERT`), `PedidoRepository.agregarTurno` y `existsByComercioIdAndEstadoCreadoAntesDe` (H); `PedidoService` líneas 1075 a 1286 de la suspensión (E §10, tomadas del Tramo D sin releer).

### 6.3 Auditoría de concurrencia por muestreo (I §2.6)

- Relevamiento "por muestreo, no exhaustivo": se contrastó Soporte, `AptitudVentaComercioService` y sus llamadores directos, los llamados a `EmailService`, `REQUIRES_NEW` y `open-in-view`. **No se auditaron** `PedidoService`, `ProductoService`, `CarritoService`, `ReembolsoService`, `NotificacionService`, `InvitacionEmpleadoService` ni los módulos restantes contra `CONCURRENCIA-Y-TRANSACCIONES.md`.
- G·C-33 (posible interbloqueo del reintento manual contra `generarNotaDeReclamo`): "No lo probé ni existe un estrés citado en lo que leí".
- B: no se verificó contra la base real ni contra la configuración de Cloudinary (preset `bajonea_imagenes_mvp`).

### 6.4 Por tramo

- **A / A-COMPLEMENTO:** collation real de `Usuario.email` (A·C-01); textos de `ValidadorHorarios` y `validarModalidadesEntrega` en A (A·C-06; A-COMPLEMENTO cubre `ValidadorHorarios`); mensaje de Bean Validation por defecto de `HorarioRequestDTO` ("el texto exacto no se verificó"); manejo de errores de `auth.js` y de la edición de horarios en `comercio.js` en A-COMPLEMENTO §1.
- **B:** `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` no abierto (B·C-03); texto exacto de `validarModalidadesEntrega` no abierto.
- **C:** carrera de CUIT/DNI "No se verificó si una carrera real devuelve 500" (C·C-04); `PUT /comercios/perfil` en estados no operativos "No se verificó con una llamada real" (C·C-12).
- **D parcial y D-COMPLEMENTO:** el parcial no relevó el frontend (resuelto parcialmente por D-COMPL), P3.01 casi sin relevar, ni los puntos 2 y 6 de ningún proceso, ni la comparación línea por línea contra RF, HU y DIC. D-COMPL no revisó: hojas CSS (colores, íconos, tamaños de estados), `js/carrito.js` y `js/checkout.js` más allá del encabezado, `js/auth.js` y los avisos de login, `js/api.js` (manejo global de errores), el contenido completo del modal de detalle de comercio del Administrador, las pantallas de pedidos del comercio más allá de los banners, `docs/DECISIONES.md`, `CAMBIOS.md` y `MAPEO-ARCHIVOS-TRAMO-*.md`; comparó solo las copias de `docs/entregables-01-02/`, no las de `01. Análisis de Requerimientos/`. Sin revisar en el parcial: `CierreTurnoEnvioService` y `ResumenTurnoMensajeBuilder` en detalle, `HorarioEdicionService`, migraciones `V38`–`V41` (cubiertas en D-COMPL con el encabezado y CLAUDE).
- **E (§10):** `FE/js/auth.js`; helpers `esperarReintento` / `mostrarAvisoTimeout` solo hasta los textos citados; `FE/js/pedidos-nuevos.js` salvo `textoVencimientoPedido` (`esPedidoNuevo`, sonido de pedido nuevo); `FE/js/direcciones.js` y `DireccionClienteService`; `FE/js/hoja.js` y `FE/js/form-utils.js`; `campoTextarea`; `PedidoService` 1075–1286; `ReembolsoService` más allá de `generarNotaYReembolsarTotal`; `MercadoPagoPagoService` más allá del handoff; `NotaCreditoService`; `PedidoResponseDTO`/`PedidoEmpleadoResponseDTO` campo por campo; `ComercioActivoService.resolver`; `TrazabilidadPedidoService`; textos y agrupación de la campana (`notificaciones.js`); pantalla de escritorio del checkout y carrito más allá del aside de resumen.
- **F:** `FE/auth.js` completo; `FE/direcciones.js` y `DireccionClienteService`; `POLLING_INTERVAL_MS` exacto de `FE/notificaciones.js` (se cita 15 s de CLAUDE); render del 409 dentro de la hoja de "Cerrar como no retirado" (`abrirHoja`, `FE/hoja.js`); segunda pantalla del comercio donde se monta `#sonido-slot` (`comercio.js:2583`); texto del error de carga de la lista de pedidos del comercio; indicador del pedido del Cliente para un comercio `INACTIVO`; paginación de `admin-reclamos.js` ("Ver más"); consulta exacta de `TrazabilidadPedidoService` que excluye `TIMEOUT_PAGO` (solo la lista blanca); comparación exhaustiva con las historias de pedidos del Cliente (solo HU-C14 y HU-A13); texto literal de `DETALLE_COMERCIO` para `ENTREGADO` y `RECHAZADO`.
- **G:** `AptitudVentaComercioService` salvo ~290–296 (luego cubierto por I §2.1); `MercadoPagoTokenConverter`, `PagoInsercionRepository`, `CodigoVinculacionMPRepository`/`CodigoVinculacionMP`, `PagoRepository`, `NotaCreditoRepository`, `NotificacionRepository` (queries); `CuentaSuspendidaException` y `ComercioActivoService.resolverSiCorresponde`; `EmailService` líneas 1–130 y 260–300 salvo métodos citados; `TestController` y `TestSupportService`; `SecurityConfig` completo; `GlobalExceptionHandler` fuera de `DesvinculacionBloqueada`, `ServicioNoDisponible` y `LimiteSoporte`; frontend no leído: `js/sonido-avisos.js` (cubierto luego por I §2.4), `js/catalogo.js` (campana del Cliente), `js/cliente-escritorio.js`, `js/selector-comercio.js`, `js/auth.js`, `js/direcciones.js`, `js/pedidos-nuevos.js`, `js/comercio-pedido-detalle`; texto de `PedidoService` ~530–650 y ~1084–1296; documentación no leída (`Historias de Usuario - *.md` salvo una búsqueda, RF-cli, RF-com, RF-adm, RF-gen y RNF solo por búsquedas, `AUDITORIA-NOTIFICACIONES.md`, `DECISIONES.md`, `MERCADOPAGO-BAJONEA-FINAL.md`); migraciones `V33`, `V35`, `V43` a `V50` completas.
- **H:** `PedidoService` (7 procesos), `TurnoBackfillService`, `TurnoPedidoService`, `CierreTurnoInsercionRepository`, `PedidoRepository.agregarTurno`; `DisponibilidadComercioService` (`dentroDeFranja`, `turnosTerminadosEntre`, `ultimoTurnoTerminado`: solo firma y comentarios); `AuthService.obtenerTokenValidoPorCodigo`/`consumirToken`/`TokenService.crear`; `AuthController` (rutas públicas de reactivación); `InvitacionEmpleadoService` fuera de las líneas citadas; `ComercioActivoService` más allá del grep (Empleado con comercio `INACTIVO`; si el fan-out de avisos filtra cuentas `INACTIVO`); llamadores de `AptitudVentaComercioService.recalcular` (luego cubiertos por I §2.1); `ReactivacionCuentaAdminService` desde la línea 70, `AdministradorController`, `js/admin-reactivar.js` (luego cubierto por I §2.3), `js/admin-clientes.js`, `js/admin-duenos.js`, `reactivar-cuenta.html` completo, `js/equipo-comercio.js` y `js/admin-equipo.js`; `js/cierre-comercio.js`; `application-production.properties` (solo grep); `ClockConfig`; documentación: RF-cli, RF-emp (grep), HU salvo HU-D13, ALC (grep), CONC (no leído), `LISTA-DE-DESPLIEGUE.md`, RNF fuera de L118.
- **J (su sección NO RELEVADO):** mensaje literal del `400` por `@Size(max = 100)` de `nombre` (categoría y tag, depende del locale de la JVM); mensajes literales de `401` y `403` de la capa de seguridad en tarifas, categorías, tags y estadísticas; respuesta real de la base ante un valor de tarifa mayor al `decimal(10,2)`; qué muestra `apiFetch` ante el 409 de `GET /tarifas/vigente` y ante fallas de carga de categorías y tags; qué muestra `prepararPaginaComercio` (y la pantalla de estadísticas) con un comercio no operativo; si el Administrador real de cada base tiene el email `.com` o `.ar` (y por tanto si existe la fila inicial de tarifa); contraste de J1 a J3 contra los requisitos y las historias de usuario (por eso los desvíos J·D-68 a J·D-77 son de código contra código o contra `CLAUDE.md`); estilos, `data-testid` y comportamiento táctil o de teclado de las pantallas de tarifas, categorías y tags.
- **I:** mensaje de `400` por `tipo` con valor de enum inexistente (sale del handler genérico `HttpMessageNotReadableException`, "no se probó contra la aplicación"); orden de bloqueo de los módulos restantes (I §2.6 punto 5).

### 6.5 Sin informe (resuelto en la versión 2, salvo Extras)

- **CRUD de categorías y tags** (servidor): relevado en J2 (endpoints, validaciones, escrituras y frontend); desvíos J·D-72 a J·D-76; en el inventario figura como P2.14.
- **Configuración de tarifas** (endpoints del Administrador y pantalla `admin-tarifas.html`): relevada en J1 (J·D-68 a J·D-71); resuelve los flujos 38, 39 y 64 de la §5.1; en el inventario figura como P7.09.
- **Estadísticas del Dueño (T5):** relevadas en J3, servidor y frontend (J·D-77); en el inventario figuran como P2.13.
- **Extras:** sin cambios: no hay código de extras (D-COMPL·D-12, E·D-20), por lo que no hay diagrama.

---

## 7. Resumen

**Totales (versión 2): 133 desvíos con id (+ 4 observaciones sin id de B-COMPLEMENTO), 95 cuestiones abiertas, 56 diagramas relevados por los informes (P1 15 · P2 10 · P3 3 · P4 11 · P5 5 · P6 2 · P7 5 · P8 5, de los que P8.05 no existe en el código) y 80 diagramas dibujados en el inventario de la §9 (P1 21 · P2 14 · P3 5 · P4 16 · P5 7 · P6 2 · P7 9 · P8 6); 64 flujos del DFD Nivel 1 (`02. Diseño`) contrastados (50 Sí · 11 Parcial · 2 No · 1 No como flujo de P7 · 0 Sin detalle · 0 Sin evidencia).**

---

## 8. Cambios respecto de la versión 1

Todo lo que no figura acá se conserva igual que en la versión 1. Cuando el índice anterior contradecía a un informe, prevalece el informe.

1. **Tramo J incorporado.** 13 de 13 informes leídos. Se suman los desvíos J·D-68 a J·D-79 (§3.11) y las cuestiones J·C-57 a J·C-65 (§4.10). Totales: 121 → 133 desvíos con id; 86 → 95 cuestiones. La antigua §3.11 (hallazgos sin id) pasa a ser la §3.12.
2. **D-COMPL·D-09 corregida en parte por J·D-78.** La fila se conserva y está marcada: los chips "Delivery", "Retiro" y "Abierto ahora" no son de Explorar sino de `initCatalogo` (`index.html`). El resto de la fila (debounce, categoría única, tags con AND, paginación de 20, orden aleatorio, contador, "Limpiar filtros", campo "Buscar productos" en escritorio) no lo tocó J.
3. **Flujos 38 y 39 del N1** (tarifas): de "Sin detalle" a "Sí" (J1: `POST /administrador/tarifas`, `GET /administrador/tarifas/vigente` y `/historial`).
4. **Flujo 64 del N1** (P4 → P7): de "Sin evidencia" a "No": J1.6 verifica que ningún flujo va de `pedido` a `configuracion_tarifa`.
5. **Flujo 34 del N1** (ADMIN → P2 "… y catálogo"): de "Parcial" a "Sí". Esta reclasificación no estaba en el encargo: la versión 1 lo marcó Parcial solo porque el CRUD de servidor de categorías y tags no figuraba en ningún informe, y J2 lo relevó. Si se prefiere conservar "Parcial", los conteos de §5.1 y §7 pasan a 49 Sí · 12 Parcial.
6. **§5.2:** el ítem 9 (flujo 64) pasa de "sin evidencia" a "el código no lo ejecuta"; el ítem 10 (flujos 38 y 39) se retira de la lista. **§5.3:** un bullet ampliado y uno nuevo (idempotencia de `TurnoBackfillRunner` y del aviso de los 75 minutos; lectura de la tarifa en cada `GET /carrito`).
7. **§6.5 "Sin informe"** queda resuelta (CRUD de categorías y tags, tarifas y estadísticas, relevados por J), salvo Extras, que no tienen código. **§6.4:** se agrega el NO RELEVADO de J; **§6.1:** una línea de J. Lo que H dejó sin leer sobre `TurnoBackfillService` y `TurnoPedidoService` queda cubierto solo en parte (J lee la asignación al arrancar y el aviso de los 75 minutos, no el resto).
8. **§1.3 (numeración):** P1.15, P3.04 y P3.05 existen como diagramas dibujados (inventario de la §9) aunque los informes no los nombren con ese id. El Tramo J (Parte final 4) dice que ninguna función del código los justifica aparte de lo ya relevado; no se contradicen: el índice no cambia ningún id de los informes y la §9 da la correspondencia. Además, el id "P8.05" del inventario de la §9 (Bandeja de Soporte) no es el "P8.05" de los informes (Levantamiento de suspensión desde Soporte, inexistente).
9. **§2 y §7:** se aclara que los 56 diagramas son los ids de los informes y que hay 80 diagramas dibujados.
10. **Conteo de la §5.1.** Versión 1: 47 Sí · 12 Parcial · 1 No · 1 No como flujo de P7 · 2 Sin detalle · 1 Sin evidencia = 64. Versión 2: 50 Sí · 11 Parcial · 2 No · 1 No como flujo de P7 · 0 Sin detalle · 0 Sin evidencia = 64 (+2 por los flujos 38 y 39, +1 por el flujo 34, y el flujo 64 pasa de Sin evidencia a No).
11. **§1.4:** dos filas nuevas (búsqueda de comercios por nombre; "hoy incluido" en las estadísticas) y las filas de `LocalDateTime.now()` y de mensajes de validación suman J·D-69 y J·D-76. **§5.1, flujo 5:** suma el hecho de J·D-78 y P3.04.
12. **D-COMPL·C-11 sigue abierta:** J3.4 confirma el hecho (el frontend arma `hasta` = hoy y `desde` = hoy menos N−1 días, ambos extremos inclusive), pero la decisión de si el requisito lo debe precisar sigue sin tomarse.
13. **Numeración del inventario.** Los ids de diagrama de la §9 no siempre coinciden con los de los informes (por ejemplo P1.12, P1.14, P4.xx, P7.04, P8.04 y P8.05); la columna "Informe y sección" da la correspondencia. Las claves de desvíos y cuestiones conservan los ids de los informes.

---

## 9. Inventario de diagramas

Los 80 diagramas de nivel 2 dibujados (carpetas `P1` a `P8` de `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/`). La columna "Informe y sección" es de mejor esfuerzo: los informes numeraron 56 diagramas y varios ids del inventario se parten o se renombran respecto de ellos (ver §1.3 y §8, punto 13); donde ningún informe sirve de fuente se escribe "sin informe fuente identificado". Las columnas de claves salen de la columna "Diagrama" de las §3 y §4 (ids de los informes, trasladados al id del inventario) más una asignación manual por contenido para las claves que tratan un subtema (por ejemplo la renuncia del Empleado o las redes sociales); las claves que citan una serie completa o ningún diagrama se listan al final.

| Id | Nombre | Informe y sección | Desvíos que lo mencionan | Cuestiones que lo mencionan |
|---|---|---|---|---|
| P1.01 | Registro de Cliente | A, P1.01 | A·D-03, A·D-07, A·D-09, A·D-13, A·D-14, A·D-15 | ninguno |
| P1.02 | Registro de Dueño y su primer comercio | A, P1.02 | A·D-06, A·D-07, A·D-09, A·D-13 | A·C-02, A·C-05, A·C-06 |
| P1.03 | Verificación de email y reenvío de código | A, P1.03 | A·D-04, A·D-07, A·D-09, A·D-13, A·D-16, A·D-18, H·D-54 | A·C-01 |
| P1.04 | Inicio de sesión | A, P1.04 | A·D-01, A·D-03, A·D-05, A·D-08, A·D-11, A·D-12, A·D-13, A·D-20 | A·C-03, H·C-45, H·C-48 |
| P1.05 | Cierre de sesión | A, P1.05 | A·D-02, A·D-05, A·D-13 | A·C-04 |
| P1.06 | Recuperación de contraseña | A, P1.06 (parte de recuperación) | A·D-04, A·D-10, A·D-12, A·D-14, A·D-15, A·D-18, A·D-19 | A·C-01 |
| P1.07 | Reactivación de cuenta inactiva | A, P1.07 | A·D-13, A·D-17, A·D-18, A·D-19 | A·C-01, H·C-47 |
| P1.08 | Perfil del Cliente | B, P1.08 (parte Cliente) | B-COMPL·Obs-1, B-COMPL·Obs-4, B·D-01, B·D-02, B·D-04, B·D-09, B·D-10, B·D-11 | B·C-01, B·C-02, B·C-03, B·C-04 |
| P1.09 | Gestión de direcciones del Cliente | B, P1.09 | B·D-12, B·D-13 | ninguno |
| P1.10 | Invitar, reenviar y cancelar invitación de Empleado | B, P1.10 | B·D-14 | B·C-05 |
| P1.11 | Aceptar invitación y alta de Empleado | B, P1.11 | B·D-03, B·D-15 | ninguno |
| P1.12 | Desactivar y reactivar miembro del equipo | B, P1.12 (parte desactivar y reactivar) | B·D-14, B·D-16 | B·C-06 |
| P1.13 | Suspender y levantar suspensión de Cliente | B, P1.13 | B-COMPL·Obs-3, B·D-07, B·D-08, B·D-17 | B·C-07 |
| P1.14 | Suspender Dueño con cascada a sus comercios | B, P1.14 | B-COMPL·Obs-3, B·D-06, B·D-07, B·D-08, B·D-17 | B·C-05, B·C-08, B·C-09 |
| P1.15 | Cambio de contraseña con sesión | A-COMPLEMENTO, §4 ("P1.06b"); sin id P1.15 en ningún informe (J, Parte final 4) | A·D-10 | ninguno |
| P1.16 | Selección de contexto del Empleado | B, P1.16 | B·D-05, B·D-18 | B·C-10 |
| P1.17 | Consulta de disponibilidad de nombre | B-COMPLEMENTO, §1 (mensajes de nombre de usuario); mejor esfuerzo, sin informe con ese diagrama | B-COMPL·Obs-4 | B·C-03 |
| P1.18 | Perfil del Dueño | B, P1.08 (parte Dueño; B propone partir P1.08) | B-COMPL·Obs-1, B·D-01, B·D-11 | B·C-01 |
| P1.19 | Renuncia del Empleado | B, P1.12 (parte renuncia; B propone partir P1.12 en tres flujos) | B·D-16 | B·C-06 |
| P1.20 | Levantar suspensión del Dueño y reenviar email de aviso | B, P1.14 (levantar); B-COMPLEMENTO, §3 (reenviar email de suspensión) | B-COMPL·Obs-3, B·D-07, B·D-08, B·D-17 | ninguno |
| P1.21 | Pérdida de acceso al comercio del Empleado | sin informe fuente identificado (temas vecinos: B, P1.16; B·D-05; B·C-10) | ninguno | ninguno |
| P2.01 | Solicitud de alta de comercio | C, P2.01 (primer alta) | C·D-01, C·D-03, C·D-04, C·D-05, C·D-06 | C·C-01, C·C-02, C·C-03, C·C-04 |
| P2.02 | Revisión de la solicitud y re-solicitud del comercio | C, P2.02 | C·D-01, C·D-07, C·D-08, C·D-09, G·D-45 | A·C-02, C·C-05, C·C-06 |
| P2.03 | Subida de documentos del comercio | C, P2.03 | C·D-02, C·D-10, C·D-11 | C·C-08, C·C-09, C·C-11 |
| P2.04 | Revisión de documentos y aptitud de venta | C, P2.04 | C·D-07, C·D-10, C·D-12, I·D-64 | C·C-07, C·C-10, H·C-38 |
| P2.05 | Datos, descripción y horarios del comercio | C, P2.05; A-COMPLEMENTO, §1 (`ValidadorHorarios`); B-COMPLEMENTO, §4 (`editarDatosOperativos`) | B-COMPL·Obs-1, B-COMPL·Obs-2, B·D-04, C·D-05, C·D-06, C·D-13, C·D-14, C·D-15, C·D-16, D·D-02 | C·C-05, C·C-12, C·C-13, C·C-14 |
| P2.06 | Turno del pedido y resumen del turno | D, P2.06 (turnos y franjas); D-COMPLEMENTO | D-COMPL·D-11 | D·C-04, D-COMPL·C-11 |
| P2.07 | Estado operativo del comercio | D, P2.07 | D·D-02, D·D-03, D-COMPL·D-10 | D·C-03, D-COMPL·C-08 |
| P2.08 | Gestión de productos | D, P2.08 | D·D-02, D·D-06, J·D-73, J·D-75 | D·C-02 |
| P2.09 | Suspender y levantar suspensión de comercio | D, P2.09 | D·D-04, D·D-05, D-COMPL·D-13, D-COMPL·D-14, D-COMPL·D-15 | ninguno |
| P2.10 | Listados del Administrador | D, P2.10 | D·D-01, D-COMPL·D-16, D-COMPL·D-17 | ninguno |
| P2.11 | Redes sociales del comercio | C, P2.05 (redes sociales; C·D-13, C·C-14) | C·D-13 | C·C-14 |
| P2.12 | Alta adicional de comercio | C, P2.01 (alta adicional) | C·D-03 | C·C-03 |
| P2.13 | Estadísticas del Dueño (versión completa del Tramo J) | J, J3; D parcial (hallazgo sobre estadísticas) | J·D-77 | D·C-04, D-COMPL·C-11, J·C-64 |
| P2.14 | Categorías y tags del catálogo | J, J2 | J·D-72, J·D-73, J·D-74, J·D-75, J·D-76 | J·C-61, J·C-62, J·C-63 |
| P3.01 | Catálogo de comercios | D, P3.01; D-COMPLEMENTO; J, Parte final 1 | D-COMPL·D-08, D-COMPL·D-09, J·D-78 | D·C-04, D-COMPL·C-07, D-COMPL·C-10, J·C-65 |
| P3.02 | Menú de un comercio y catálogo global | D, P3.02; D-COMPLEMENTO | D·D-01, D-COMPL·D-07, D-COMPL·D-08, D-COMPL·D-10 | D·C-01, D·C-05, D-COMPL·C-06, D-COMPL·C-07, D-COMPL·C-09, D-COMPL·C-12 |
| P3.03 | Disponibilidad del comercio | D, P3.03 | D·D-01 | D·C-01 |
| P3.04 | Explorar productos | J, Parte final 1; D-COMPLEMENTO (Explorar); sin id P3.04 en los informes | D-COMPL·D-08, D-COMPL·D-09, J·D-74, J·D-78, J·D-79 | D-COMPL·C-07, D-COMPL·C-10, J·C-65 |
| P3.05 | Detalle del comercio y agregar al carrito | D-COMPLEMENTO (detalle del comercio); E (cita "P3.02, P3.05" para `POST /carrito/items`); sin id P3.05 definido en los informes | D-COMPL·D-07, D-COMPL·D-08 | D-COMPL·C-06, D-COMPL·C-07, D-COMPL·C-12 |
| P4.01 | Carrito, ver y agregar productos | E, P4.01 | D-COMPL·D-12, E·D-20, E·D-21, H·D-55 | D-COMPL·C-06, E·C-16, H·C-39 |
| P4.02 | Checkout, pantallas y modalidad | E, P4.02 | D-COMPL·D-12, E·D-18, E·D-19, E·D-20, J·D-71 | E·C-13, E·C-14, E·C-19 |
| P4.03 | Aceptar, rechazar y expiración del pedido | E, P4.03 | E·D-23, E·D-24, E·D-25, E·D-27, E·D-28, G·D-44 | E·C-15, E·C-18, E·C-20 |
| P4.04 | Avance de estados del pedido | E, P4.04 | E·D-24, E·D-25 | ninguno |
| P4.05 | Cancelación por el Cliente | E, P4.05 | E·D-22, E·D-26 | E·C-17, E·C-21 |
| P4.06 | Anulación por el comercio | E, P4.06 | ninguno | E·C-15, E·C-20 |
| P4.07 | Entrega y cierre de retiros por el comercio | F, P4.07 | F·D-30, F·D-31, F·D-37, F·D-38 | ninguno |
| P4.08 | Reclamo del Cliente | F, P4.08 | F·D-32, F·D-33, F·D-34, F·D-38 | ninguno |
| P4.09 | Resolución del reclamo por el Administrador | F, P4.09 | F·D-32, F·D-33, F·D-39 | F·C-23, F·C-24, G·C-33 |
| P4.10 | Seguimiento de pedidos del Cliente | F, P4.10 | F·D-35, F·D-37 | E·C-14, E·C-22 |
| P4.11 | Pedidos del comercio, recorrido y sonido | F, P4.11 | E·D-28, E·D-29, F·D-36, F·D-40, G·D-53 | F·C-25, G·C-30 |
| P4.12 | Carrito, cantidad, quitar y vaciar | E, P4.01 (cantidad, quitar y vaciar) | E·D-21 | E·C-16 |
| P4.13 | Carrito, baja automática y vaciado por pago | E, P4.01 (`PRODUCTO_REMOVIDO_CARRITO`); G, P5.03 (vaciado por pago aprobado) | E·D-18 | ninguno |
| P4.14 | Vuelta del pago y vencimiento del pedido sin pagar | G, P5.03; E, P4.04; H (procesos de pedidos) | G·D-47 | ninguno |
| P4.15 | Confirmación del pedido y paso al pago | E, P4.02; G, P5.02 (entrega al pago) | E·D-18, E·D-19, J·D-71 | E·C-13, E·C-19 |
| P4.16 | Recepción del Cliente y autoconfirmación | F, P4.07 (confirmación del Cliente); H (autoconfirmación y aviso de 75 minutos); J, Parte final 2 | F·D-31, F·D-37, F·D-38 | ninguno |
| P5.01 | Vinculación de Mercado Pago (OAuth) | G, P5.01 | ninguno | G·C-26, G·C-27, G·C-37 |
| P5.02 | Cobro del pedido y link de pago | G, P5.02 | G·D-53 | G·C-27, G·C-28, G·C-29, G·C-30 |
| P5.03 | Webhook de Mercado Pago | G, P5.03 | G·D-47 | G·C-29, G·C-35, G·C-36 |
| P5.04 | Reembolso del pago | G, P5.04 | G·D-41, G·D-42, G·D-48 | F·C-23, G·C-31, G·C-32 |
| P5.05 | Reintento manual del reembolso | G, P5.05 | G·D-41, G·D-50 | G·C-33, G·C-34 |
| P5.06 | Desvinculación de Mercado Pago | G, P5.01 (desvinculación y su vista previa) | ninguno | G·C-37 |
| P5.07 | Sincronización del pago al volver | G, P5.02 (`sincronizarPago`) | ninguno | G·C-28 |
| P6.01 | Emisión de notificaciones y emails | G, P6.01 | E·D-25, F·D-33, G·D-42, G·D-43, G·D-44, G·D-45, G·D-46, G·D-51, H·D-57, I·D-60 | G·C-31, I·C-50 |
| P6.02 | Consulta y lectura de notificaciones | G, P6.02 | G·D-43, G·D-52 | ninguno |
| P7.01 | Reapertura automática de comercios | H, P7.01 | H·D-56, H·D-58 | H·C-43 |
| P7.02 | Vencimiento de invitaciones de Empleados | H, P7.02 | H·D-58 | H·C-44, H·C-46 |
| P7.03 | Inactivación de cuentas por falta de uso | H, P7.03 | A·D-20, G·D-46, H·D-55, H·D-57, H·D-58 | H·C-39, H·C-40, H·C-41, H·C-43, H·C-45 |
| P7.04 | Reactivación de la cuenta inactiva | H, P7.04 (cascada de la inactivación y reactivación) | H·D-58, I·D-64 | H·C-38, H·C-47, H·C-48 |
| P7.05 | Cierre de turno automático | H, P7.05 | H·D-58 | ninguno |
| P7.06 | Procesos automáticos de pedidos | H (propone P7.06 "Procesos de pedidos"; H·D-58, H·D-59) | E·D-24, H·D-58, H·D-59, I·D-65 | ninguno |
| P7.07 | Envío del resumen de turno por email | H, P7.05 (email del cierre de turno); D (`CierreTurnoEnvioService`) | H·D-58 | ninguno |
| P7.08 | Aviso de regularización de invitación | sin informe fuente identificado con certeza (tema vecino: B, P1.10, invitaciones) | ninguno | ninguno |
| P7.09 | Configuración de tarifas y tarifa vigente | J, J1 | E·D-28, J·D-68, J·D-69, J·D-70, J·D-71 | J·C-57, J·C-58, J·C-59, J·C-60 |
| P8.01 | Consulta a Soporte sin sesión | I, P8.01 | I·D-61, I·D-62, I·D-67 | I·C-51, I·C-55 |
| P8.02 | Consultas a Soporte con sesión y seguimiento | I, P8.02 | I·D-61, I·D-63, I·D-67 | I·C-52 |
| P8.03 | Acceso por código y seguimiento sin sesión | I, P8.03 | I·D-63, I·D-66 | I·C-49, I·C-53, I·C-55 |
| P8.04 | Reenvío de códigos de consulta | I, P8.03 y P8.01 (`/codigos/reenviar`; I·C-53) | ninguno | I·C-53 |
| P8.05 | Bandeja de Soporte del Administrador | I, P8.04 (bandeja) | I·D-60 | I·C-50, I·C-54 |
| P8.06 | Respuesta, cierre y reenvío de email del Administrador | I, P8.04 (respuesta, cierre y reenvío) | I·D-60 | I·C-50, I·C-54 |

**Cantidad de diagramas por serie:** P1 Usuarios y Sesiones = 21 · P2 Comercios y Documentos = 14 · P3 Exploración y Menús = 5 · P4 Pedidos y Carrito = 16 · P5 Pagos y Reembolsos = 7 · P6 Notificaciones = 2 · P7 Procesos Automáticos = 9 · P8 Soporte = 6 → **80 diagramas** (los informes relevaron 56 ids; los 24 restantes son subdivisiones, diagramas nuevos o con otra numeración).

**Diagramas sin ninguna clave del índice que los mencione:** P1.21, P7.08.

**Claves que citan una serie completa o ningún diagrama del inventario** (no figuran en ninguna fila de la tabla):

- G·D-41: "P5.04, P5.05, P7" (también en: P5.04, P5.05)
- G·D-47: "P5.03, P4" (también en: P4.14, P5.03)
- G·D-49: "P5"
- H·D-54: "P7 (inexistente), P1.03" (también en: P1.03)
- H·C-42: "P7"
- I·C-56: "P7"

**Resumen: 133 desvíos con id (+ 4 observaciones), 95 cuestiones abiertas, 80 diagramas dibujados (56 ids relevados por los informes), 64 flujos del Nivel 1 contrastados (50 Sí · 11 Parcial · 3 No · 0 sin resolver) y 13 de 13 informes leídos.**

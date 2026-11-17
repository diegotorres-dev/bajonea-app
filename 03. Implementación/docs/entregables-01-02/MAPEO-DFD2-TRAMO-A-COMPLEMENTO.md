# MAPEO DFD Nivel 2 — Tramo A: complemento

Informe de solo lectura, tomado del código real el 2026-11-16. Complementa `MAPEO-DFD2-TRAMO-A.md` (acceso y sesión). No contiene propuestas de refactor: describe lo que el código hace hoy. No se ejecutó nada contra el backend; todo sale de leer el código.

Convenciones (las mismas del informe anterior):
- Las rutas son relativas a `03. Implementación/`. `BE` = `backend/src/main/java/com/bajonea/backend/`. `FE` = `frontend/`.
- `archivo:línea` indica dónde está el texto o la condición. Todo texto entre comillas es literal del código.
- "NO EXISTE EN EL CÓDIGO" significa que se buscó y no hay nada.
- Formato de respuesta y errores comunes (`ApiResponse` con `mensaje` y `data`; `ValidacionException` → 400 con `data` null; `RecursoNoEncontradoException` → 404; `ConflictoDeNegocioException` → 409; validación de DTO → 400 con `data` = `{campo: mensaje}`): ver C1 del informe anterior (`BE exceptions/GlobalExceptionHandler.java:107-136, 191-228`).

---

## 1. `ValidadorHorarios.validar`

`BE services/ValidadorHorarios.java:58-84`. Recibe la lista de franjas (`diaSemana`, `horaApertura`, `horaCierre`). Lo llaman:
- `BE services/ValidadorDatosNegocioComercio.java:77-79` (`validarHorarios`), que usan el registro de un comercio, el alta de un comercio adicional y la corrección de un rechazado (Javadoc `ValidadorDatosNegocioComercio.java:17-23`);
- `BE services/HorarioEdicionService.java:63` (`editarHorarios`, el `PUT /api/v1/comercios/perfil/horarios`).

Todas las infracciones lanzan `ValidacionException` → **HTTP 400**, `data` null, `mensaje` = el texto (`GlobalExceptionHandler.java:191-194`).

### 1.1 Condiciones del servicio, en el orden en que se evalúan

Antes de entrar al validador corre Bean Validation sobre el DTO (ver 1.2). Dentro de `validar`:

| # | Condición | Mensaje literal | HTTP | Archivo:línea |
|---|---|---|---|---|
| 1 | Para cada franja de la lista (en orden): `horaCierre.equals(horaApertura)` | `"La hora de cierre no puede ser igual a la de apertura. Si atendés las 24 horas, cargá de 00:00 a 23:59."` | 400 | `ValidadorHorarios.java:59-63`; constante `:22-23` |
| 2 | Recorre los pares `(i, j)` con `j > i`, en el orden de la lista. Para el primer par cuyos intervalos se superponen (semana circular de 7 días) **y** tienen el mismo `diaSemana` | `"Ya tenés un horario cargado el %s de %s a %s, que se superpone con este"` con: día de la franja `j` con la primera letra en mayúscula (`"Lunes"`, `"Martes"`, `"Miércoles"`, `"Jueves"`, `"Viernes"`, `"Sábado"`, `"Domingo"`), `horaApertura` de `j`, `horaCierre` de `j` | 400 | `ValidadorHorarios.java:64-78` |
| 3 | Mismo par superpuesto pero con `diaSemana` distinto | `"El turno del %s de %s a %s se superpone con el del %s de %s a %s"` con: día de `i` (minúsculas), `HH:mm` de apertura de `i`, `HH:mm` de cierre de `i`, día de `j` (minúsculas), `HH:mm` apertura de `j`, `HH:mm` cierre de `j` | 400 | `ValidadorHorarios.java:79-81`; `nombreDia` `:86-88`; `hora` `:90-92` |

Cómo se mide la superposición:
- Intervalo en segundos desde el lunes 00:00: `inicio = ordinal(día) * 86400 + apertura` (`ValidadorHorarios.java:46-56`).
- Si `cierre < apertura` la franja cruza la medianoche y su duración es `86400 - apertura + cierre` (`:49-50`; `cruzaMedianoche` en `DisponibilidadComercioService`).
- Si no cruza, un cierre `23:59` vale `24:00` (`:52`).
- Dos intervalos se superponen si chocan con un desplazamiento de −1, 0 o +1 semana (`:31-39`), así un turno del domingo que cruza choca con una franja del lunes.
- Dos franjas idénticas se superponen: caen en el caso 2 (mismo día).

Detalles de redacción que hay que tener presentes:
- El caso 2 cita la franja `j` (la segunda de la lista), y las horas salen con `%s` sobre un `LocalTime` (formato `HH:mm`; si trajera segundos distintos de cero saldría `HH:mm:ss`). El texto no termina en punto.
- El caso 3 cita primero la franja `i` y después la `j`, en el orden de la lista (no por quién empieza antes). Las horas son `HH:mm`. El texto no termina en punto.
- La comparación del caso 1 es `LocalTime.equals`, que incluye segundos.

Lo que **no** valida `validar`: que haya al menos una franja, que el cierre sea posterior a la apertura (un cierre menor es un turno que cruza la medianoche y es válido), el máximo de franjas ni el formato de la hora.

### 1.2 Validaciones que corren antes (Bean Validation del DTO)

- `BE dto/request/DatosNegocioComercioRequestDTO.java:59-61` (registro, alta adicional, corrección): `horarios` con `@NotEmpty(message = "No debe estar vacío")` y `@Valid`. Error: 400 con `data = {"horarios": "No debe estar vacío"}`.
- `BE dto/request/ComercioHorariosRequestDTO.java:15-17` (`PUT /comercios/perfil/horarios`): `@NotEmpty(message = "Cargá al menos un horario de atención")`. Error: 400 con `data = {"horarios": "Cargá al menos un horario de atención"}`.
- `BE dto/request/HorarioRequestDTO.java:17-24`: `diaSemana`, `horaApertura` y `horaCierre` con `@NotNull` **sin mensaje propio**. El texto es el predeterminado de Jakarta Validation (no hay `ValidationMessages` ni `messages` en el proyecto; el texto exacto no se verificó). La clave del error es del tipo `horarios[0].horaCierre`.
- Un `diaSemana` que no es del enum o una hora ilegible llega como 400 `"El cuerpo de la solicitud contiene datos con formato inválido"` (`GlobalExceptionHandler.java:248-252`).

### 1.3 Orden dentro de `ValidadorDatosNegocioComercio.validar`

`BE services/ValidadorDatosNegocioComercio.java:39-44`: (1) horarios, (2) redes sociales repetidas, (3) modalidades de entrega, (4) localidad. La edición de horarios (`HorarioEdicionService`) llama solo a `ValidadorHorarios.validar`.

### 1.4 Regla extra solo en la edición de horarios

`BE services/HorarioEdicionService.java:84, 120-142` (`validarColaDelTurnoDeHoy`): solo si lo nuevo difiere de lo vigente. Si hoy hay un turno que cruza la medianoche y una franja nueva de mañana empieza antes de que ese turno termine, 400 con:

`"Tu turno de hoy (%s de %s a %s) termina %s a las %s y se superpone con la franja del %s de %s a %s. Movela para que empiece después de las %s."`

Los `%s`, en orden: día de hoy en minúsculas, apertura del turno, cierre del turno, `"el " +` día de mañana en minúsculas, cierre del turno, día de mañana en minúsculas, apertura de la franja nueva, cierre de la franja nueva, cierre del turno. Horas en `HH:mm`.

### 1.5 Validaciones equivalentes del frontend (`initHorarios`)

`FE js/comercio-form.js:558` (`export function initHorarios({ mostrarError })`). Lo usan: `FE js/auth.js:385` (registro de Comercio), `FE js/agregar-comercio.js:168` (alta adicional), `FE js/comercio-corregir.js:233` (corrección) y `FE js/comercio.js:2288` (edición de horarios del Dueño y del Empleado). `mostrarError` muestra el texto: en un banner en las tres primeras (`auth.js:318-321`, `agregar-comercio.js:161-164`, `comercio-corregir.js:225-228`) y bajo el campo `error-horarios` en la edición (`comercio.js:2288`).

**Validación al enviar** (`FE js/comercio-form.js:811-840`, función `validar`; en el registro la llama `auth.js:387-389` al apretar "Continuar"). Orden:

| # | Condición | Mensaje literal | Línea |
|---|---|---|---|
| 0 | Se limpia `error-horarios` | — | `:812` |
| 1 | Hay una fila con alguno de día/apertura/cierre cargado pero no los tres | `"Completá el día y el horario de todas las franjas cargadas."` | `:814-819` |
| 2 | No hay ninguna fila completa | `"Cargá al menos una franja horaria de atención."` | `:820-824` |
| 3 | Alguna fila completa con `horaCierre === horaApertura` | `"La hora de cierre no puede ser igual a la de apertura. Si atendés las 24 horas, cargá de 00:00 a 23:59."` (`MENSAJE_CIERRE_IGUAL`, `FE js/horarios.js:99`) | `:825-830` |
| 4 | Primer par `(i, j)` de filas completas que se superpone (`franjasSeSuperponen`) | ver `mensajeConflictoFranjas` abajo | `:831-838` |

**Validación mientras se edita una fila** (`validarFilaHorario`, `FE js/comercio-form.js:604-629`, al cambiar día, apertura o cierre, `:708-714`): si la fila está incompleta limpia el error; cierre igual a apertura → `MENSAJE_CIERRE_IGUAL` (`:614-619`); conflicto con otra fila → `mensajeConflictoFranjas` (`:620-626`). Marca los dos campos con `input-shell--error`. Muestra el texto en `error-horarios`.

**Franja rápida** ("aplicar a varios días", `FE js/comercio-form.js:771-807`, error en `error-franja-rapida`):
- ningún día tildado: `"Tildá al menos un día para aplicar la franja."` (`:774`);
- falta Desde o Hasta: `"Completá el horario Desde y Hasta."` (`:778`);
- Hasta igual a Desde: `MENSAJE_CIERRE_IGUAL` (`:782`);
- choca con una franja ya cargada: `mensajeConflictoFranjas` (`:790`).

**`mensajeConflictoFranjas`** (`FE js/horarios.js:88-97`):
- mismo día: `` `Ya tenés un horario cargado el ${LABELS_DIA[otra.diaSemana]} de ${recortarHora(otra.horaApertura)} a ${recortarHora(otra.horaCierre)}, que se superpone con este.` ``
- días distintos: `` `El turno del ${nombreDia(primera.diaSemana)} de ${recortarHora(primera.horaApertura)} a ${recortarHora(primera.horaCierre)} se superpone con el del ${nombreDia(segunda.diaSemana)} de ${recortarHora(segunda.horaApertura)} a ${recortarHora(segunda.horaCierre)}.` ``

**Diferencias frente al backend:**
- Los textos de conflicto del frontend terminan en punto; los del backend no.
- En días distintos, el frontend ordena el par por quién empieza antes en la semana circular (`horarios.js:93-95`); el backend los cita en el orden de la lista.
- El cierre igual a apertura se compara como texto `HH:mm` en el frontend y como `LocalTime.equals` en el backend.
- La regla del turno de hoy de 1.4 no existe en el frontend (NO EXISTE EN EL CÓDIGO).

**Qué hace el frontend con el 400 del backend:** `ValidacionException` viaja con `data` null; en el alta adicional el flujo cae en `mostrarPaso(0); mostrarErrorEnBanner(error.message)` (`FE js/agregar-comercio.js:259-260`) y en la corrección en `mostrarErrorEnBanner(error.message)` (`FE js/comercio-corregir.js:374`). Cuando el 400 trae `data` con una clave de horarios (error de Bean Validation), muestra el texto bajo `error-horarios` y el banner `"Revisá los horarios cargados."` (`agregar-comercio.js:246-249`, `comercio-corregir.js:350-353`). No se leyó el manejo de errores de `auth.js` ni el de la edición de horarios en `comercio.js`.

---

## 2. `ComercioValidaciones.validarModalidadesEntrega`

`BE util/ComercioValidaciones.java:17-21`.

- **Condición:** `!aceptaDelivery && !aceptaRetiro` (las dos modalidades en `false`).
- **Mensaje literal:** `"El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)"` (`:19`).
- **HTTP:** 400 (`ValidacionException`), `data` null.
- **Dónde se llama:**
  - `BE services/ValidadorDatosNegocioComercio.java:42` (registro, alta adicional y corrección), después de horarios y de redes sociales y antes de la localidad;
  - `BE services/ComercioService.java:147` (`editarPerfil`, es la primera sentencia del método, antes de `iniciarEscritura`).
- **DTO:** `aceptaDelivery` y `aceptaRetiro` son `boolean` primitivos sin anotación (`BE dto/request/DatosNegocioComercioRequestDTO.java:51-53`, `ComercioPerfilRequestDTO.java:43-45`); si el campo no viene vale `false`.

**Frontend:**
- Formulario de negocio (registro, alta adicional, corrección): `FE js/comercio-form.js:362-367`. Condición: ni `switch-delivery` ni `switch-retiro` tienen `aria-pressed === 'true'`. Texto: `"Debés ofrecer al menos una modalidad de entrega."`, en `error-modalidad`. Es la última comprobación de `validar` (después de la foto) y hace `scrollAlPrimerError()`.
- Edición del perfil del Dueño: `FE js/comercio.js:2776-2781`. Mismo texto `"Debés ofrecer al menos una modalidad de entrega."`, en `error-editar-modalidad`.
- El texto del frontend (con "Debés…" y punto final) no es el del backend.
- El Empleado no edita las modalidades: la fila queda bloqueada (`FE js/comercio.js:2430-2434`, `pintarCamposBloqueadosDelEmpleado`).

---

## 3. Consultas de disponibilidad

Las dos son `GET`, públicas (`BE config/security/SecurityConfig.java:101-102`), no requieren sesión y están limitadas por `RateLimitPublicoFilter`.

### 3.1 Qué tienen en común

**Límite de uso (429):** `BE config/security/RateLimitPublicoFilter.java`.
- Las dos rutas pertenecen al grupo `disponibilidad` (`:45, 52-53`). Los dos endpoints **comparten el mismo contador** por IP.
- Límite: `app.rate-limit.disponibilidad-por-minuto`, **30 por defecto** (`:61`).
- Ventana de un minuto por `grupo|IP` (`getRemoteAddr()`, `:77, 81`). Excedido = contador > límite (`:91`).
- Respuesta: **HTTP 429**, `Content-Type: application/json`, cuerpo literal `{"mensaje":"Demasiadas solicitudes. Esperá un minuto e intentá de nuevo.","data":null}` (`:94-98`).
- Los `OPTIONS` pasan sin contar (`:72`).

**Parámetro ausente:** `@RequestParam` obligatorio. Sin el parámetro: 400 `"<parámetro>: parámetro requerido ausente"` (`GlobalExceptionHandler.java:262-266`); el parámetro vacío (`?nombre=`) sí llega al servicio.

**¿Reserva el nombre?** **No. Es solo lectura.** Los dos métodos son `@Transactional(readOnly = true)` (`RegistroService.java:261`, `NombreComercioService.java:44`), solo hacen consultas y no insertan nada. La unicidad real se impone al registrar (ver 3.2 y 3.3).

**Respuesta correcta:** HTTP 200, `mensaje` = `"Consulta realizada correctamente"` (`AuthController.java:61, 68`), `data` = `{"disponible": true|false}` (`BE dto/response/DisponibilidadNombreUsuarioResponseDTO.java:8`, `DisponibilidadNombreComercioResponseDTO.java:10`).

### 3.2 `GET /api/v1/auth/nombre-usuario/disponibilidad?nombreUsuario=`

Controller: `BE controllers/AuthController.java:57-62`. Servicio: `BE services/RegistroService.java:261-271`. Reglas: `BE validation/NombreUsuarioPolicy.java`.

Orden de proceso:
1. **Normalización:** `trim()` + `toLowerCase(Locale.ROOT)` (`NombreUsuarioPolicy.java:24-26`).
2. **Formato**, `mensajeDeFormatoInvalido` (`:49-66`). Se corta en la primera que falla; cada una responde HTTP 400 (`ValidacionException`) con `data` null:

| # | Condición | Mensaje literal |
|---|---|---|
| a | nulo o en blanco | `"El nombre de usuario es obligatorio"` |
| b | tiene un carácter fuera de `a-z`, `A-Z`, `0-9` | `"Solo se permiten letras y números"` |
| c | no tiene ninguna letra | `"El nombre de usuario debe contener al menos una letra."` |
| d | menos de 8 caracteres | `"El nombre de usuario debe tener al menos 8 caracteres"` |
| e | más de 20 caracteres | `"El nombre de usuario no puede superar los 20 caracteres"` |

3. **Reservado:** `esReservado` (`:76-78`), comparación exacta contra la lista en minúsculas (`:17-19`): `administrador`, `administrator`, `bajonea`, `soporte`, `support`, `comercio`, `cliente`, `empleado`, `duenio`, `superadmin`.
4. **Existencia:** `usuarioRepository.existsByNombreUsuario(normalizado)`.
5. `disponible = !reservado && !existe` (`RegistroService.java:268-269`).

Respuestas posibles:

| Caso | HTTP | `mensaje` | `data` |
|---|---|---|---|
| Disponible | 200 | `"Consulta realizada correctamente"` | `{"disponible": true}` |
| En uso | 200 | `"Consulta realizada correctamente"` | `{"disponible": false}` |
| Reservado | 200 | `"Consulta realizada correctamente"` | `{"disponible": false}` (igual que en uso, no se distingue) |
| Formato inválido | 400 | el texto de la tabla (a–e) | null |
| Parámetro ausente | 400 | `"nombreUsuario: parámetro requerido ausente"` | null |
| Límite excedido | 429 | `"Demasiadas solicitudes. Esperá un minuto e intentá de nuevo."` | null |

Observación que sale del orden: el formato se valida antes que los reservados, así que los reservados de menos de 8 caracteres (`soporte`, `support`, `cliente`, `bajonea`, `duenio`) responden 400 `"El nombre de usuario debe tener al menos 8 caracteres"` y nunca llegan a `disponible: false`. Los reservados de 8 o más (`administrador`, `administrator`, `comercio`, `empleado`, `superadmin`) sí responden `disponible: false`.

Al registrar (no es parte de la consulta): `RegistroService.java:273-277` lanza 409 `"Ese nombre de usuario ya está en uso"` (`NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE`, `:15`) si es reservado o ya existe; la violación del índice `uq_usuario_nombre_usuario` en una carrera da el mismo 409 (`GlobalExceptionHandler.java:75-99`).

### 3.3 `GET /api/v1/auth/comercio-nombre/disponibilidad?nombre=`

Controller: `BE controllers/AuthController.java:64-69` (llama `consultarDisponibilidad(nombre, null, null)`). Servicio: `BE services/NombreComercioService.java:44-60`. SQL: `BE repositories/ComercioNombreRepository.java:18-33`.

Orden de proceso:
1. Con `comercioId` y `duenoId` nulos (caso público) se salta la comprobación de comercio ajeno (`:46-48`).
2. **Normalización en Java:** `nombre == null ? "" : nombre.trim()` (`:49`).
3. Validaciones, cada una 400 (`ValidacionException`) con `data` null:

| # | Condición | Mensaje literal | Línea |
|---|---|---|---|
| a | vacío tras el `trim` | `"El nombre del comercio es obligatorio"` | `:50-52` |
| b | más de 150 caracteres (`LARGO_MAXIMO`, `:28`) | `"El nombre no puede superar los 150 caracteres"` | `:53-55` |
| c | no contiene ninguna letra ni número (`.*[\p{L}0-9].*`, `:30`) | `"Ingresá un nombre de comercio válido"` | `:56-58` |

4. **Existencia:** `SELECT EXISTS(SELECT 1 FROM comercio WHERE nombre_unico = TRIM(REGEXP_REPLACE(?, '[[:space:]]+', ' ')))` (`ComercioNombreRepository.java:18-21`). `nombre_unico` es la columna generada del comercio; según el Javadoc de `NombreComercioService.java:14-19` el nombre se compara sin mayúsculas, sin acentos y sin espacios de más (la ñ cuenta como n), cuentan todos los estados salvo `RECHAZO_DEFINITIVO` y un `RECHAZADO` retiene el nombre.
5. `disponible = !existe`.

**Nombres reservados de comercio: NO EXISTE EN EL CÓDIGO** (no hay ninguna lista).

Respuestas posibles:

| Caso | HTTP | `mensaje` | `data` |
|---|---|---|---|
| Disponible | 200 | `"Consulta realizada correctamente"` | `{"disponible": true}` |
| En uso | 200 | `"Consulta realizada correctamente"` | `{"disponible": false}` |
| Reservado | NO EXISTE EN EL CÓDIGO | — | — |
| Vacío | 400 | `"El nombre del comercio es obligatorio"` | null |
| Más de 150 | 400 | `"El nombre no puede superar los 150 caracteres"` | null |
| Sin letra ni número | 400 | `"Ingresá un nombre de comercio válido"` | null |
| Parámetro ausente | 400 | `"nombre: parámetro requerido ausente"` | null |
| Límite excedido | 429 | `"Demasiadas solicitudes. Esperá un minuto e intentá de nuevo."` | null |

Al registrar o editar (no es parte de la consulta): `NombreComercioService.validar` (`:62-66`) lanza 409 `"Ya existe un comercio con ese nombre. Elegí otro."` (`:26`); la violación de `uq_comercio_nombre_unico` da el mismo 409.

Variante con sesión (no era el pedido, mismo servicio): `GET /api/v1/comercios/nombre/disponibilidad?nombre=&comercioId=` (`BE controllers/ComercioController.java:85-90`, solo Dueño). Con `comercioId` de un comercio que no es del Dueño: 404 `"Comercio no encontrado"` (`NombreComercioService.java:46-48`). No está en el grupo de límite (`RateLimitPublicoFilter.java:47-53` lista solo rutas públicas).

### 3.4 Qué muestra el frontend

Componente: `bindDisponibilidad` (`FE js/form-utils.js:155-322`), con dos envoltorios: `bindNombreUsuario` (`:328-340`) y `bindNombreComercio` (`:342-359`).

Cuándo consulta:
- **Al salir del campo** (`blur`, `:276-291`). No hay consulta mientras se escribe ni espera con retardo.
- Al escribir (`input`) se reinicia: borra el error y el estado (`:275`, `reiniciar` `:223-229`).
- Normaliza el valor: usuario = `trim` + minúsculas y **reescribe el campo** (`:324-326`, `reescribir: true`); comercio = `trim` y colapsa espacios (`:151-153`), sin reescribir.
- Campo vacío: no hace nada. Si el valor es el original del usuario o del comercio que se edita (`valorOriginal`): reinicia y no consulta (`:280-283`).
- Antes de consultar valida el formato en el cliente (`validarFormato`, `:284-289`): si falla muestra el error bajo el campo y **no consulta**.
- Al continuar (`validarParaContinuar`, `:294-314`): si está verificando espera el resultado; en comercio, si no hay estado y hay valor, consulta (`consultarSiHaceFalta: true`, `:306-308`); si el resultado es "ocupado" muestra el texto de ocupado y no deja avanzar.

Textos:

| Caso | Nombre de usuario | Nombre de comercio |
|---|---|---|
| Consultando | `"Verificando…"` (`:334`) | `"Verificando…"` (`:352`) |
| Disponible (`disponible: true`) | `"Nombre de usuario disponible"` (`:334`) | `"Nombre disponible"` (`:352`) |
| En uso o reservado (`disponible: false`) | `"Ese nombre de usuario ya está en uso"` (`:142`) | `"Ya existe un comercio con ese nombre. Elegí otro."` (`:143`) |
| Formato inválido (se detecta en el cliente) | los de `mensajeNombreUsuarioInvalido` (`FE js/validators.js:36-44`), idénticos a los del backend (a–e de 3.2) | `"Ingresá un nombre de comercio válido."` (con punto final; `FE js/comercio-form.js:319`) |

- "Disponible" se muestra como línea de estado con ícono de OK (`mostrarEstado`, `mostrarIcono('disponible')`, `:249-253`); "en uso" como error bajo el campo con ícono de ocupado (`marcarEnUso`, `:231-236`).
- El frontend **no distingue** "reservado" de "en uso": para los dos muestra el mismo texto de ocupado.
- **429 y 400 del servidor: el frontend no muestra ningún texto propio.** Cualquier `ApiError` lanzado por `apiFetch` en esta consulta (400, 429, etc.) cae en el `catch` de `consultarDisponibilidad` (`:256-260`) y deja el estado en `inactivo` y oculta la línea de estado. El mensaje `"Demasiadas solicitudes. Esperá un minuto e intentá de nuevo."` no llega a la pantalla desde este componente.
- Las dos consultas son `GET` sin `handle5xxGlobally` ni `handleRedGlobally`: para un `GET` eso significa modo `'redirigir'` (`FE js/api.js:546-557`). Un 5xx lleva a `errores/500.html` (`api.js:653-656`) y una falla de red o timeout se reintenta una vez y después lleva a `errores/sin-conexion.html` o `errores/timeout.html` (`api.js:621-629`). La variante con sesión (`auth: true`) además muestra el modal de sesión cerrada ante un 401 (`api.js:674-678`) y redirige a acceso denegado ante un 403 (`api.js:691-693`).

Quién usa cada una:
- `bindNombreUsuario`: `FE js/auth.js:346` (registro de Comercio), `FE js/cliente-form.js:340` (registro de Cliente y alta por invitación) y `FE js/perfil-cuenta.js:141` (edición del nombre de usuario del Cliente, con `valorOriginal`).
- `bindNombreComercio` público (`/auth/comercio-nombre/disponibilidad`): `FE js/comercio-form.js:315-320` con `disponibilidad.publico = true`, que pasa `auth.js:324` (registro de Comercio). Con sesión (`/comercios/nombre/disponibilidad`): `agregar-comercio.js:167`, `comercio-corregir.js:231` (con `comercioId` y `valorOriginal`) y `comercio.js:2617` (edición del perfil).

---

## 4. Cambio de contraseña con sesión

### 4.1 Endpoint

- `POST /api/v1/auth/cambiar-password` (`BE controllers/AuthController.java:164-169`). No tiene regla propia en `SecurityConfig`; cae en `anyRequest().authenticated()` (`SecurityConfig.java:159`): **cualquier rol con sesión activa puede llamarlo**. Un Empleado es un usuario con rol `CLIENTE` y entra por esa misma vía.
- Body (`BE dto/request/CambioPasswordPerfilRequestDTO.java`): `passwordActual` (`@NotBlank`, `"No debe estar vacío"`) y `passwordNueva` (`@NotBlank` `"No debe estar vacío"` y `@ValidarPasswordSegura`, mensaje `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"`, `BE validation/annotations/ValidarPasswordSegura.java:24`).
- Servicio (`BE services/AuthService.java:312-332`): contraseña actual incorrecta → suma intento fallido (al tercero bloquea la cuenta) y 401 `"La contraseña actual es incorrecta"` con `data = {intentosRestantes}`; la nueva igual a la actual → 400 `"La nueva contraseña debe ser distinta a la actual"`; si todo está bien cambia el hash, pone los intentos en 0 y cierra la sesión activa (`FORZADO`). Respuesta 200 `"Contraseña cambiada correctamente"`.

### 4.2 Qué roles tienen pantalla

| Rol | ¿Tiene pantalla? | Dónde |
|---|---|---|
| **Cliente** | **Sí** | `FE perfil.html:33-37` (fila "Cambiar contraseña", `id="cambiar-password-link"`) y vista `FE perfil.html:128-141` (título "Cambiar contraseña", `form-cambiar-password`). Lógica en `FE js/perfil-cuenta.js:239-321` (`enlazarCambioPassword`; llamada a la API en `:290`), que enlaza `FE js/cliente.js:181`. |
| **Dueño** | **Sí** | `FE comercio-perfil.html:59-63` (fila "Cambiar contraseña", dentro de `#seccion-mi-comercio`, `:26`) y vista `comercio-perfil.html:437-450`. Lógica en `FE js/comercio.js:2646-2650` (abre la vista) y `:2821-2895` (envío; llamada a la API en `:2865`). Es una copia propia: no usa `perfil-cuenta.js`. |
| **Empleado** | **No dentro de un comercio. Sí, usando la pantalla del Cliente.** | En contexto Empleado, `comercio-perfil.html` quita `#seccion-mi-comercio` (donde estaba la fila) y la vista `view-cambiar-password` (`FE js/comercio.js:2418`); el perfil del Empleado (`iniciarPerfilDelEmpleado`, `:2540-2571`) no enlaza esa fila. Para cambiar su contraseña el Empleado pasa a su cuenta de Cliente (fila "Cambiar de cuenta", `comercio-perfil.html:88-92`, `comercio.js:2551-2553`; hoja de `FE js/selector-contexto.js:203`) y usa `perfil.html`. La fila "Editar datos personales" de su perfil también lleva ahí (`comercio.js:2437-2455`, hoja "Vas a pasar a tu cuenta personal"). |
| **Administrador** | **No** | NO EXISTE EN EL CÓDIGO. Ningún archivo `admin*` del frontend (HTML ni JS) menciona "contraseña" ni "password", y `admin-dashboard.html` no tiene entrada de perfil. El endpoint sí le sirve (cae en `anyRequest().authenticated()`), pero no hay pantalla que lo llame. Si el Administrador abriera `perfil.html` a mano, por lectura del código: `initPerfil` no lo bloquea (`FE js/cliente.js:126` solo exige contexto si el rol es `CLIENTE`) y el primer pedido, `GET /clientes/perfil` (`cliente.js:150`), cae en `hasRole("CLIENTE")` (`SecurityConfig.java:154-155`) → 403 → `errores/acceso-denegado.html` (`FE js/api.js:691-693`). No se ejecutó. |

### 4.3 Comportamiento común del formulario (Cliente y Dueño, mismo código en dos copias)

`FE js/perfil-cuenta.js:262-320` y `FE js/comercio.js:2837-2895`: campos `password-actual`, `password-nueva` y `password-confirmar`; validaciones del cliente en este orden:
1. Los tres obligatorios: `"Ingresá tu contraseña actual."`, `"Ingresá una nueva contraseña."`, `"Repetí tu nueva contraseña."`.
2. `esPasswordSegura` (`FE js/validators.js:11-19`: 8 a 72 caracteres, una mayúscula, una minúscula y un número): `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número."`.
3. Nueva y confirmación iguales: `"Las contraseñas ingresadas no coinciden."`.

Si sale bien: `clearSesion()` y redirige a `login.html?passwordActualizada=1`. Ante un 401: `"La contraseña actual no es correcta."` bajo el campo; con `intentosRestantes === 1` el banner `"Cuidado: si fallás una vez más, tu cuenta se bloqueará."`; con `intentosRestantes === 0` el modal `"Cuenta bloqueada"` con `"Tu contraseña fue ingresada incorrectamente varias veces y tu cuenta fue bloqueada por seguridad. Para volver a ingresar, recuperá tu contraseña."` (`FE js/catalogo.js:129-139`, `FE js/api.js:336-344`).

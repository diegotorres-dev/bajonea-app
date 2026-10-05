# Auditoría de formularios pendientes + catálogo de patrones reutilizables (2026-09-01)

> **Documento de auditoría pura — nada de lo relevado acá se implementó.** Entregado como
> insumo para las próximas conversaciones de implementación, una por formulario, mismo
> patrón ya usado para "01. Datos Personales"/"02. Dirección" (Cliente) y "1. Negocio"/
> "2. Legales"/"3. Horarios"/"4. Redes sociales" (Comercio). Ver enlace desde
> `docs/DECISIONES.md`, entrada del 2026-09-01 "Auditoría completa de formularios
> pendientes + catálogo de patrones reutilizables".

Contexto: tras cerrar el perfeccionamiento de validaciones de los dos wizards de registro
(`registro-cliente.html`, `registro-comercio.html`) y auditar (sin implementar)
`ProductoRequestDTO`, quedaba pendiente relevar el resto de los formularios reales del
proyecto — todos los que no son wizards de registro ni el formulario de producto — para
tener el panorama completo antes de seguir campo por campo. No se relevó nada de Empleado
ni Soporte: ninguno de los dos tiene pantalla implementada todavía en el código.

**Hallazgo transversal que enmarca toda la Parte 1:** el mini-tramo del 2026-09-01
"arreglo transversal del orden no determinístico de mensajes en `GlobalExceptionHandler`"
(ver `docs/DECISIONES.md`) ya resolvió, a nivel backend y para **todos** los DTOs del
proyecto (no solo los de los wizards), la ambigüedad de qué mensaje gana cuando un campo
vacío viola a la vez `@NotBlank`/`@NotNull`/`@NotEmpty` y una anotación de formato no
blanco-tolerante: `GlobalExceptionHandler` prioriza siempre el mensaje de
obligatoriedad. Eso significa que, para los 11 formularios de abajo, **el backend ya
separa correctamente vacío de formato inválido en casi todos los casos**, aunque los
validadores individuales (`@ValidarNombrePropio`, `@ValidarTelefonoArgentino` en su forma
no reforzada, etc.) no sean blanco-tolerantes por sí mismos. La brecha real que queda para
resolver formulario por formulario está casi siempre del lado del **frontend**: varios de
estos formularios todavía no separan vacío de formato en la UI (un solo mensaje cubre
ambos casos, o directamente no hay validación de formato en absoluto), a diferencia del
patrón de dos pasos ya establecido en "01. Datos Personales"/"02. Dirección" y también
presente en `recuperar-password.html`/`reactivar-cuenta.html` (chequeo de vacío manual
primero, `validarCamposSilencioso` con validador después).

---

## Parte 1 — Auditoría de formularios pendientes

### 1. Edición de perfil de Cliente — `ClienteEditarPerfilRequestDTO`

Pantalla: `perfil.html` (vista `view-editar-datos`) + `js/cliente.js` (`initPerfil`,
líneas 148-265). Solo 3 campos editables (`email`/`dni`/`fechaNacimiento` de solo
lectura, confirmado por diseño desde Fase 16a).

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `nombre` | `@NotBlank("No debe estar vacío")` + `@ValidarNombrePropio` (mensaje default "Debe contener solo letras, espacios y guiones") + `@Size(max=100)` sin mensaje. Sin setter manual: no hay trim ni colapso de espacios internos antes de validar (a diferencia de `RegistroClienteRequestDTO.nombre`). | `validarCamposSilencioso` **sin `validador`** (usa `input.checkValidity()` nativo — el `<input>` no tiene `pattern`, solo `required`) con mensaje único "Ingresá tu nombre." | **Divergencia real:** el frontend no valida formato en absoluto (un nombre como `"123"` o `"Juan!!"` pasa la UI y solo lo rechaza el backend, con mensaje que nunca llega a mostrarse cerca del campo salvo por `mapearErroresBackend` — sí está mapeado, `error-editar-nombre`). Sin separación vacío/formato del lado cliente porque no hay chequeo de formato que separar. |
| `apellido` | Igual que `nombre`. | Igual patrón, mensaje "Ingresá tu apellido." | Misma divergencia que `nombre`. |
| `telefono` | `@NotBlank` + `@ValidarTelefonoArgentino` (endurecida a blanco-tolerante, prefijo fijo `+549` + 10 dígitos) + `@Size(max=30)`. | `validador: esTelefonoValido`, **un único mensaje** "Ingresá un teléfono argentino válido (código de área + número)." para vacío y para formato inválido. Input con `inputmode="numeric"`, sin bloqueo de teclado explícito (`type="tel"`, sin JS que filtre no-dígitos). | Backend separa (gracias al fix transversal); frontend no separa — mismo patrón de "un solo mensaje" ya identificado y corregido en los wizards, pendiente acá. |

Gap adicional no ligado a un campo puntual: el formulario entero no tiene `maxlength` en
los inputs de `nombre`/`apellido` (backend limita a 100), y `editar-telefono` no bloquea
teclado a solo dígitos (patrón sí usado en los wizards, ver Parte 2).

### 2. Edición de perfil de Comercio — `ComercioPerfilRequestDTO`

Pantalla: `comercio-perfil.html` (vista `view-editar-perfil`) + `js/comercio.js`
(`initComercioPerfil`, líneas 811-977). No incluye datos legales (`razonSocial`/`cuit`/
etc., de solo lectura) ni `fotoPerfilUrl` (flujo de Cloudinary aparte).

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `nombre` | `@NotBlank` + `@Pattern(".*[\p{L}0-9].*", "Ingresá un nombre de comercio válido")` (texto libre permisivo) + `@Size(max=150)`. Se persiste vía `TextoUtils.aTitleCase(...)`, que tampoco trimea. | `validador: esTextoConContenidoValido`, **un único mensaje** "Ingresá el nombre de tu comercio." para vacío y formato. | Backend separa (fix transversal); frontend no separa. |
| `descripcion` | `@Size(max=2000)` sin mensaje, opcional. | Sin validación JS (correcto, es opcional). `maxlength` no confirmado en el HTML — a revisar si coincide con 2000. | Sin divergencia funcional; falta mensaje en español del `@Size` (mismo patrón ya señalado en la auditoría de `ProductoRequestDTO.descripcion`). |
| `telefono` | Igual patrón que Cliente. | `validador: esTelefonoValido`, único mensaje "Ingresá un teléfono argentino válido (código de área + número)." | Misma divergencia que Cliente #1. |
| `emailContacto` | `@NotBlank` + `@Email` + `@Pattern` redundante (mismo regex que `@ValidarFormatoEmail`, sin usar la anotación custom ya existente) + `@Size(max=150)`. | `validador: esEmailValido`, único mensaje "Ingresá un email de contacto con formato válido." | Backend: `@Email` + `@Pattern` es doble validación redundante entre sí (`@Email` de Hibernate Validator ya es blanco-tolerante, pero el `@Pattern` agregado no lo es — mismo riesgo de ambigüedad de mensaje que motivó crear `@ValidarFormatoEmail`, mitigado igual por el fix transversal, pero la anotación custom ya existe para este caso exacto y no se está reusando). Frontend no separa vacío/formato. |
| `aceptaDelivery` / `aceptaRetiro` | **Sin ninguna validación de "al menos una modalidad" en este DTO ni en `ComercioService.editarPerfil`** — confirmado por lectura de código: `validarModalidades(...)` existe solo en `RegistroService` (registro inicial), nunca se invoca desde la edición de perfil. | JS chequea manualmente `switchDelivery/Retiro` antes del submit, con mensaje "Debés ofrecer al menos una modalidad de entrega." | **Gap real de backend, no de mensajes:** un comercio podría, llamando `PUT /comercios/perfil` directo (Postman/curl), guardar `aceptaDelivery=false, aceptaRetiro=false` sin que el backend lo impida — la única barrera hoy es la UI. Mismo criterio de "regla de negocio faltante" ya encontrado en la Fase de "1. Negocio" de `registro-comercio.html" (modalidades sin validar en backend, corregido ahí — este es el mismo problema pero en el endpoint de edición, no en el de alta). |

### 3. Alta de Categoría — `CategoriaRequestDTO`

Pantalla: `admin-categorias.html` (modal "Nueva/Editar Categoría") + `js/admin.js`
(`mostrarModalCategoria`, líneas 768-909).

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `nombre` | `@NotBlank("No debe estar vacío")` + `@Size(max=100)` sin mensaje. **Sin ninguna validación de formato** — cualquier string no vacío de hasta 100 caracteres pasa (`"123"`, `"!!!"`, `" - "` con espacios internos, todos válidos hoy). | JS solo chequea `!nombre` (tras `.trim()`) → "El nombre de la categoría es obligatorio." **Tampoco valida formato**, coincide exactamente con el backend (no hay nada que separar: no existe concepto de "formato inválido" para este campo hoy). `maxlength=100` puesto en el input, coincide con el `@Size`. | Alineado — pero es una alineación "vacía": ninguna capa impone que el nombre de una categoría tenga contenido alfanumérico real. Si se decide sumar una regla de formato (ej. `@Pattern(".*[\p{L}0-9].*")`, mismo patrón "texto libre permisivo" ya usado en `razonSocial`/`domicilioFiscal`/nombre de Comercio), habría que sumarla en ambas capas a la vez. |

### 4. Alta de Tag — `TagRequestDTO`

Pantalla: `admin-tags.html` (modal "Nuevo/Editar Tag") + `js/admin.js`
(`mostrarModalTag`, líneas ~1025-1160). Estructura idéntica a Categoría, campo por campo:
mismo `@NotBlank` sin mensaje de formato, mismo chequeo JS de solo-vacío, mismo
`maxlength=100`. Mismas conclusiones que el punto 3, sin diferencias.

### 5. Rechazo de pedido — `RechazoPedidoRequestDTO`

Pantalla: `comercio-pedido-detalle.html` (modal, CO20) + `js/comercio.js`
(`mostrarModalRechazarPedido`, líneas 526-580).

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `motivo` | `@NotNull` sobre `MotivoRechazo` (enum cerrado). | `<select required>`, chequeo JS explícito `if (!motivo)` → "Seleccioná un motivo de rechazo." | Alineado, sin divergencia — es un enum cerrado, no hay "formato inválido" posible más allá de "no seleccionado". |
| `comentario` | **Actualizado el 2026-09-02** (ver `docs/DECISIONES.md`): `@Size(max=500)` + obligatoriedad condicional a nivel `PedidoService.rechazarPedido` — obligatorio únicamente si `motivo=OTRO`, opcional para los otros 6 valores del enum. | Label dinámico ("Comentario (opcional)" / "Comentario" según `motivo`), error propio (`#rechazo-error-comentario`) cuando `motivo=OTRO` y el campo queda vacío tras `trim()`. | Alineado — regla de negocio nueva confirmada por Diego el 2026-09-02, implementada en ambas capas con el mismo criterio que el resto del proyecto (backend fuente de verdad, frontend replica la condición para UX). |

Formulario resuelto — la obligatoriedad condicional de `comentario` cuando `motivo=OTRO` se
sumó en el tramo del 2026-09-02 (ver `docs/DECISIONES.md` y
`docs/MAPEO-ARCHIVOS-VALIDACIONES-TRAMO-FORMULARIOS-ESPORADICOS.md`). Esta entrada decía
antes "ya bien resuelto" tratando `comentario` como opcional en todos los casos — quedó
desactualizada por la nueva regla, no por un error de la auditoría original (la regla no
existía como tal hasta este tramo).

### 6. Aprobación/rechazo de Comercio — `AprobacionComercioRequestDTO`

Pantalla: `admin-comercios-pendientes.html` / `admin-comercio-detalle.html` (modales
AD05/AD06) + `js/admin.js` (`mostrarModalRechazarComercio`, líneas 375-435; botones
aprobar/rechazar, líneas 548-586).

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `aprobar` | `@NotNull` (`Boolean`). | No es un campo de formulario — dos botones distintos (`Aprobar`/`Rechazar`) arman el body directamente (`aprobar: true`/`false`). | Sin divergencia, no aplica el concepto de validación de campo. |
| `motivo` | **Sin `@NotBlank`/`@NotNull` a nivel Bean Validation** — es `@Size(max=500)` nomás. Obligatoriedad condicional (solo si `aprobar=false`) impuesta a nivel `AdministradorService.resolverComercio` (línea 107): `"El motivo es obligatorio al rechazar un comercio"`, texto libre a propósito (sin ENUM, mismo criterio documentado en el Javadoc del DTO — no hay catálogo cerrado de motivos de rechazo de Comercio, a diferencia de `Pedido.motivoRechazo`). | JS chequea `if (!motivo)` → "El motivo es obligatorio para rechazar una solicitud." (textarea, `maxlength="500"`). | Alineado funcionalmente — la redacción del mensaje difiere levemente entre capas ("...al rechazar un comercio" vs. "...para rechazar una solicitud"), cosmético, no un bug. Sin validación de formato en ninguna capa (correcto, es texto libre). |

### 7. Carga de horario — `HorarioRequestDTO`

**No es un formulario aparte**: confirmado por lectura de código que `HorarioRequestDTO`
se usa exclusivamente dentro de `RegistroComercioRequestDTO.horarios` (campo
`List<HorarioRequestDTO>`, `RegistroComercioRequestDTO.java:148`), consumido únicamente
por la sección "3. Horarios de atención" del wizard `registro-comercio.html`. **No existe
ninguna pantalla de edición de horarios ya cargados** — ni en `comercio-perfil.html` ni en
ningún otro archivo (`grep` de "horario" sobre todo `frontend/` solo devuelve
`registro-comercio.html` y los módulos que lo consumen o solo lo muestran de lectura:
`js/auth.js` para el wizard, `js/catalogo.js`/`js/checkout.js`/`js/comercio.js` para
calcular/mostrar si un comercio está abierto). Confirma explícitamente lo ya documentado
en `CLAUDE.md` §6 (Fase 16, Tramo 16a): "sin endpoint de edición de horarios ya cargados,
pospuesto a una fase futura".

Este formulario **ya pasó por una auditoría e implementación completa** en el tramo
"CUIT solo dígitos, rediseño de 3. Horarios con pestañas + no-superposición..."
(2026-09-01, ver `docs/DECISIONES.md`): separación vacío/formato resuelta, chequeo de
cierre>apertura, chequeo de solapamiento por pares en ambas capas con el mismo mensaje.
No hay nada pendiente de auditar acá — se incluye este punto solo para dejar registrada
la confirmación pedida en el prompt original.

### 8. Cambio de contraseña desde perfil — `CambioPasswordPerfilRequestDTO`

Pantallas: `perfil.html` (Cliente) y `comercio-perfil.html` (Comercio) — **mismo patrón
JS duplicado casi al carácter** entre `js/cliente.js` (líneas 267-339) y `js/comercio.js`
(líneas 979-1046), ambos contra el mismo endpoint `POST /auth/cambiar-password`.

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `passwordActual` | `@NotBlank("No debe estar vacío")`, sin validación de formato (correcto — se compara contra el hash existente, no tiene "formato"). | Chequeo de vacío only vía `validarCamposSilencioso` sin validador, mensaje "Ingresá tu contraseña actual." Si el backend devuelve `401`, se marca el campo en rojo con "La contraseña actual no es correcta." (incluye aviso de intentos restantes). | Alineado, sin divergencia. |
| `passwordNueva` | `@NotBlank` + `@ValidarPasswordSegura` (mensaje default "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número" — **corregida el 2026-09-01 para exigir también minúscula**, ver skill de validaciones). | Vacío: "Ingresá una nueva contraseña." Formato: `esPasswordSegura(...)` (SÍ exige minúscula, `validators.js:1-10`, coherente con el validador backend) pero el mensaje mostrado es **"La nueva contraseña debe tener al menos 8 caracteres, una mayúscula y un número."** — no menciona la minúscula. | **Divergencia real de mensaje (no de lógica):** la regla que se aplica del lado cliente ya exige minúscula (correcto, coincide con el backend), pero el texto que ve el usuario cuando falla no se lo dice — un usuario que ponga `"PASSWORD1"` (sin minúscula) es rechazado sin que el mensaje le explique por qué. Mismo texto desactualizado en `cliente.js:298` y `comercio.js:1010` (duplicado, ver más abajo). |
| `passwordConfirmar` (solo frontend, no existe en el DTO) | No aplica — el backend nunca recibe la confirmación, es un chequeo puramente de UX. | `!==` contra `passwordNueva`, mensaje "Las contraseñas ingresadas no coinciden." | Correcto tal cual está. |

Hallazgo adicional (no pedido explícitamente, relevante para una futura limpieza): las
funciones de cambio de contraseña de `cliente.js` y `comercio.js` son prácticamente
idénticas (misma estructura de banner, mismos ids de campo, misma lógica de submit) — un
candidato real a extraer a una función compartida si se llega a tocar este formulario,
aunque no es parte del pedido de esta auditoría.

### 9. Recuperación de contraseña — 3 DTOs (`RecuperacionPasswordRequestDTO`, `ValidarCodigoRecuperacionRequestDTO`, `ConfirmarRecuperacionPasswordRequestDTO`)

Pantalla: `recuperar-password.html` (3 pasos: email → código OTP → nueva contraseña) +
`js/auth.js` (`initRecuperarPasswordSolicitar`, líneas 1369-1531).

| Paso / campo | Backend | Frontend | Alineación |
|---|---|---|---|
| Paso 1, `email` | `@NotBlank` + `@Email` (blanco-tolerante nativamente). | **Ya separa vacío de formato** (patrón correcto, a diferencia de los formularios #1/#2): chequeo manual `if (!emailInput.value.trim())` → "Ingresá tu email.", y solo si pasa eso corre `validarCamposSilencioso` con `esEmailValido` → "Ingresá un email con formato válido." | Alineado y ya con el patrón de dos pasos deseado — **este formulario puede servir de referencia de cómo separar vacío/formato en JS** para los formularios #1/#2 de arriba. |
| Paso 2, `codigo` (`ValidarCodigoRecuperacionRequestDTO`) | `@NotBlank` + `@Pattern("\\d{6}")` → "El código debe tener 6 dígitos numéricos". | Input OTP de 6 casilleros (`js/otp.js`) — cada casillero solo acepta 1 dígito (`replace(/\D/g,'')`), estructuralmente imposible enviar algo que no sean 6 dígitos una vez completo; el submit se dispara solo al completarse (`onComplete`). | Alineado por diseño estructural — no hace falta separar vacío/formato porque la UI no permite un estado intermedio inválido; el único error posible es "código incorrecto" (`401`) o "vencido" (`409`), ambos manejados con mensajes propios del backend. |
| Paso 3, `nuevaPassword` (`ConfirmarRecuperacionPasswordRequestDTO`) | Igual `@ValidarPasswordSegura` que #8. | Mismo patrón que #8: vacío separado ("Ingresá una nueva contraseña."), pero el mensaje de formato (`auth.js:1498`) es **el mismo texto desactualizado sin mencionar minúscula** ("...una mayúscula y un número."). | Misma divergencia de mensaje que el punto #8 — 3er lugar donde aparece el mismo texto duplicado. |
| Paso 3, confirmar contraseña | No aplica (solo frontend). | Igual que #8. | Correcto. |

### 10. Verificación de cuenta / Reactivación — 4 DTOs (`VerificarCodigoRequestDTO`, `ReenviarVerificacionRequestDTO`, `ReactivacionCuentaRequestDTO`, `ConfirmarReactivacionCuentaRequestDTO`)

Pantallas: `verificar-email.html` (`initVerificarEmail`, `auth.js:1283-1367`) y
`reactivar-cuenta.html` (`initReactivarCuentaSolicitar`, `auth.js:1533+`). Ambos son
formularios reales con campos (código OTP de 6 dígitos, y en el caso de reactivación
también el paso de solicitar por email) — no son solo un link de un email, hay una
pantalla con inputs.

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `email` (solicitud, ambos flujos) | `@NotBlank` + `@Email`. | Mismo patrón correcto de dos pasos que el punto #9 (vacío manual + `esEmailValido`). | Alineado, mismo patrón de referencia. |
| `codigo` (ambos flujos) | `@NotBlank` + `@Pattern("\\d{6}")`. | Mismo input OTP estructural que el punto #9 — en `verificar-email.html` hay además un chequeo redundante de longitud (`otp.getValor().length !== 6`) antes de enviar, cinturón y tirantes sobre algo que la UI ya impide. | Alineado, sin divergencia real. |

Sin hallazgos nuevos en estos 2 flujos — ambos ya siguen el patrón correcto de
separación (a diferencia de los formularios de perfil #1/#2). El único matiz es que
`ReenviarVerificacionRequestDTO`/`ReactivacionCuentaRequestDTO` técnicamente comparten
la validación de `email`, pero no hay ninguna oportunidad de reuso adicional más allá de
lo que ya existe.

### 11. Formularios de imágenes (`FotoPerfilComercioRequestDTO`, `FotoPerfilUsuarioRequestDTO`, `UrlImagenRequestDTO`, `OrdenImagenRequestDTO`)

**Confirmado: ninguno tiene un campo de texto que el usuario escriba a mano.** Los 4 son
puramente técnicos — el valor de `url` sale siempre de `uploadData.secure_url`, la
respuesta real de la API de Cloudinary tras la subida (`js/cloudinary.js:39-46`), nunca
de un input pegado por el usuario; `orden` sale de la posición en un drag-and-drop, no de
un campo numérico tipeado. No corresponde auditoría de UX de formulario para estos 4 —
ya están cubiertos correctamente por la skill de validaciones (`@ValidarUrlCloudinary`
+ `@Pattern` de extensión, ver advertencia de suplantación ya documentada) y por la
Parte B de la auditoría del 2026-09-01 (mensajes en español de DTOs técnicos).

### Hallazgo adicional no listado en el prompt original

Ninguno — se revisó el árbol completo de `frontend/*.html` y no apareció ningún
formulario real adicional con campos de texto fuera de los 11 puntos de arriba y de lo
ya cubierto en tramos previos (wizards de registro, `ProductoRequestDTO`, carrito/
checkout, ya cerrados). Confirmado también que no existe ningún DTO de edición de perfil
de Administrador (`AdministradorResponseDTO` es de solo lectura) ni ninguna pantalla de
edición de Redes Sociales fuera del wizard de registro de Comercio.

---

## Parte 2 — Catálogo de patrones de validación ya existentes

Fuente primaria: `.claude/skills/skill-validaciones/SKILL.md` (catálogo completo con
Javadoc de cada anotación) + `frontend/js/validators.js` (funciones JS reales). Esta
tabla es un resumen orientado a consulta rápida al armar un formulario nuevo — para el
detalle exacto de blanco/null-tolerancia, ver la skill.

| Patrón | Anotación backend / función JS | Regla exacta | Mensaje de vacío | Mensaje de formato inválido |
|---|---|---|---|---|
| Nombre / Apellido (estricto, Unicode completo) | `@ValidarNombrePropio` / `esNombrePropioValido` | Solo letras Unicode + espacios + guiones, `^\p{L}[\p{L} '-]*$` (JS) | `@NotBlank` del campo (mensaje propio de cada DTO) | "Debe contener solo letras, espacios y guiones" (default) |
| Nombre / Apellido (charset acotado, blanco-tolerante) | `@ValidarFormatoNombre` / `esNombreClienteValido` | Solo A-Z + vocales acentuadas + Ñ + guion + apóstrofe + espacio, `^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[-' ][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$` (JS) | "El nombre es obligatorio" / "El apellido es obligatorio" (según DTO) | "El nombre solo puede contener letras" (default; personalizable por campo, ej. "El apellido solo puede contener letras") |
| DNI (con rango numérico) | `@ValidarDni` | **Eliminada el 2026-09-01** (código muerto, sin usos reales) — no reusar, usar `@ValidarFormatoDni` en su lugar. | — | — |
| DNI (solo formato, blanco-tolerante) | `@ValidarFormatoDni` / `esDniClienteValido` | 7-8 dígitos tras sanitizar puntos/espacios/guiones, `^\d{7,8}$` | Mensaje propio del `@NotBlank` del DTO | "El DNI debe tener un formato válido" (default) |
| Teléfono argentino | `@ValidarTelefonoArgentino` / `esTelefonoValido` | Prefijo fijo `+549` (no editable en el HTML) + exactamente 10 dígitos locales tras quitar espacios/paréntesis/guiones | Mensaje propio del `@NotBlank` del DTO | "Ingresá un número de teléfono válido (cod. área + número)" (default) |
| Email (estándar Hibernate) | `@Email` (jakarta) | RFC email estándar, **blanco-tolerante nativamente** (empty string pasa) | Mensaje propio del `@NotBlank` | "Ingresá un email con formato válido" (mensaje custom típico en este proyecto, no el default de Hibernate) |
| Email (formato acotado, blanco-tolerante explícito) | `@ValidarFormatoEmail` / `esEmailValido` | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | "El email es obligatorio" (según DTO) | "Ingresá un email válido" (default) |
| Contraseña segura | `@ValidarPasswordSegura` / `esPasswordSegura` | 8-72 caracteres, 1 mayúscula, 1 minúscula, 1 número (sin símbolo obligatorio) | Mensaje propio del `@NotBlank` | "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número" (default) — **ver hallazgo #8/#9: varios mensajes JS hardcodeados en el proyecto todavía no mencionan la minúscula** |
| CUIT | `@ValidarCuit` / `esCuitValido` | 11 dígitos + dígito verificador módulo 11 (AFIP), sanitizado con `sanitizarCuit` (solo dígitos, sin puntos/guiones) | Mensaje propio del `@NotBlank` | "CUIT inválido" (default; en `RegistroComercioRequestDTO` personalizado a "El CUIT debe tener 11 dígitos numéricos") |
| Código postal argentino | `@ValidarCodigoPostalArgentino` / `esCodigoPostalValido` | 4 dígitos clásico o CPA alfanumérico de 8 (`[A-Za-z]\d{4}[A-Za-z]{3}`), normalizado a mayúsculas con `normalizarCodigoPostal`/`TextoUtils.normalizarCodigoPostal` | "El código postal es obligatorio" | "Ingresá un código postal válido (4 dígitos o formato CPA)" (personalizado en `DireccionRequestDTO`) |
| Texto libre permisivo (Calle, Domicilio fiscal, Razón social, Nombre de Comercio) | `@Pattern(".*[\\p{L}0-9].*", ...)` / `esCalleValida` \| `esTextoConContenidoValido` | Rechaza solo si no hay **ningún** carácter alfanumérico tras trim — permite símbolos, números, letras en cualquier combinación, solo bloquea "todo símbolos" o vacío | "La calle es obligatoria" / "La razón social es obligatoria" / etc. (según campo) | "La calle no puede contener solo caracteres especiales" / "La razón social no puede contener solo caracteres especiales" / "Ingresá un nombre de comercio válido" (redacción varía por campo, mismo patrón de regex) |
| Fecha no futura (sin piso de edad) | `@PastOrPresent` (jakarta, fecha de inicio de actividades) / `esFechaNoFuturaValida` | Rechaza solo fecha futura | Mensaje propio del `@NotNull` | "La fecha ingresada no es válida" |
| Fecha con piso de plausibilidad (sin edad mínima) | `@ValidarFechaNacimientoPlausible` / `esFechaNacimientoClientePlausible` | Rechaza fecha futura y fecha anterior a 120 años desde hoy | Mensaje propio del `@NotNull` | "La fecha ingresada no es válida" (default) |
| Fecha con piso de edad mínima (18 años) | `@MayorDeEdad` / `esFechaNacimientoValida` | Igual que la anterior + exige 18 años cumplidos — vigente hoy solo en `fechaNacimientoRepresentante` de Comercio (retirada de Cliente el 2026-09-01) | Mensaje propio del `@NotNull` | "Debe ser mayor de 18 años" |
| Campo exclusivamente numérico con bloqueo de teclado | `@Pattern("^\\d+$", ...)` (backend, ej. `Direccion.numero`) / bloqueo de teclado JS (`inputmode="numeric"` + filtro `replace(/\D/g,'')`, usado en Número de dirección, DNI, Teléfono, CUIT, código OTP) | Estructural: el campo nunca llega a contener un carácter no numérico | N/A (el campo vacío es su propio `@NotBlank`) | "Solo se permiten números" (o no hace falta mensaje si el bloqueo de teclado ya lo impide, como en el DNI/CUIT/OTP de los wizards) |
| URL con normalización de esquema | `@Pattern("^(?=.*\\p{L})(?=.*\\.)\\S+$", ...)` + `TextoUtils.normalizarUrlConEsquema` / `esUrlRedSocialValida` + `normalizarUrlRedSocial` | Exige al menos una letra y un punto, sin espacios; si no empieza con `http(s)://`, se le antepone `https://` automáticamente antes de persistir | "El link es obligatorio" | "Ingresá un link válido" |
| URL de Cloudinary (dominio, no propiedad) | `@ValidarUrlCloudinary` + `@Pattern` de extensión (`(?i).*\.(jpg\|jpeg\|png\|webp)$`) | Esquema `https` + host exactamente `res.cloudinary.com`, más extensión de archivo permitida — **no valida propiedad del recurso**, mitigado por el flujo de firma scoped por `comercioId`/`productoId` (ver skill) | "No debe estar vacío" | "La URL debe pertenecer al dominio de Cloudinary" / "La URL debe apuntar a un archivo jpg, jpeg, png o webp" |
| Motivo de rechazo — enum cerrado | `@NotNull` sobre `MotivoRechazo` (usado en `RechazoPedidoRequestDTO`) | N/A, es un `<select>` de opciones fijas | "Seleccioná un motivo de rechazo." | N/A |
| Motivo de rechazo — texto libre (sin ENUM en el diccionario) | `@Size(max=500)` + obligatoriedad condicional a nivel Service (usado en `AprobacionComercioRequestDTO.motivo`, `HistorialEstadoComercio.motivo`) | Sin regex de formato — es un campo de explicación humana, no clasificable | Mensaje ad-hoc del Service ("El motivo es obligatorio al rechazar...") | N/A |
| Precio entero con separador de miles (sin centavos) | `@Digits(integer=8, fraction=0)` + `@Positive` (backend, `ProductoRequestDTO.precio`) / `esPrecioValido` + `formatearMilesInput`/`precioDesdeInput` (frontend, `comercio.js`) | Implementado en el tramo de perfeccionamiento de validaciones — Producto (2026-09-02). El input bloquea todo carácter no numérico y reformatea con puntos de miles en vivo (`4000` → `4.000`), tope de 8 dígitos reales aplicado dentro del propio listener de `input` (no vía `maxlength` HTML, que no alcanza a frenar la escritura porque el handler reescribe `.value` en cada tecla — el atributo queda solo como tope defensivo). **No es un patrón de decimales con coma** — se evaluó habilitar centavos y se descartó porque no es una práctica usada en Argentina para este tipo de comercio; `Producto.precio` sigue siendo `DECIMAL(10,2)` en la base solo como margen a futuro (ver `docs/DECISIONES.md`, 2026-09-02). | "El precio es obligatorio." | "El precio no puede tener más de 8 dígitos." (formato) / "El precio debe ser mayor a $0." (rango, mensaje separado) |
| Cantidad seleccionable con tope (ej. tags de producto) | `@Size(max=5, message=...)` (usado en `ProductoRequestDTO.tagIds`) | Tope fijo sobre el tamaño de una lista, no sobre un string | N/A (no aplica "vacío") | "No podés seleccionar más de 5 tags" |

---

## Parte 3 — Recomendación de reutilización por campo

Formato: **Reusar tal cual** / **Reusar con adaptación** / **Patrón nuevo**, con el motivo.

### 1. Edición de perfil de Cliente

- `nombre`, `apellido` → **Reusar tal cual** el patrón "Nombre/Apellido" ya usado en el
  propio `ClienteEditarPerfilRequestDTO` (`@ValidarNombrePropio`, ya está en el backend).
  Lo que falta es sumar el `validador: esNombrePropioValido` (o `esNombreClienteValido`,
  a decidir cuál de las dos variantes ya usa el resto del formulario de Cliente) al
  `validarCamposSilencioso` del frontend, con mensaje separado de vacío y de formato —
  no hace falta nada nuevo, ya existen ambas piezas.
- `telefono` → **Reusar tal cual**, ya está `esTelefonoValido` en uso; solo falta separar
  el mensaje de vacío ("Ingresá tu teléfono.") del de formato inválido (el ya existente).

### 2. Edición de perfil de Comercio

- `nombre` → **Reusar tal cual** el patrón "texto libre permisivo" (`esTextoConContenidoValido`
  ya está en uso); solo falta separar vacío de formato en el mensaje JS.
- `descripcion` → sin cambios, ya está correctamente sin validación de formato (campo
  opcional de texto libre real).
- `telefono` → igual que Cliente #1, reusar tal cual, separar mensajes.
- `emailContacto` → **Reusar con adaptación**: cambiar el `@Email` + `@Pattern` redundante
  del backend por `@ValidarFormatoEmail` (ya existe, blanco-tolerante, evita la
  redundancia); en frontend ya está `esEmailValido`, solo falta separar vacío/formato.
- `aceptaDelivery`/`aceptaRetiro` → no es un problema de patrón de validación de campo,
  es una regla de negocio faltante en el backend (ver Parte 1, punto 2) — **patrón
  nuevo** en el sentido de que no es un campo de texto, sino sumar `validarModalidades(...)`
  (ya existe en `RegistroService`, se podría extraer a un lugar compartido o llamar desde
  `ComercioService.editarPerfil` directamente) al flujo de edición de perfil.

### 3. Alta de Categoría / 4. Alta de Tag

- `nombre` → si se decide agregar validación de formato (hoy no existe en ninguna capa):
  **Reusar tal cual** el patrón "texto libre permisivo" (`@Pattern(".*[\p{L}0-9].*")` +
  `esTextoConContenidoValido`), mismo criterio que Comercio/Razón social/Domicilio
  fiscal — no hace falta nada nuevo. Si se decide mantenerlo sin validación de formato
  (una categoría "123" podría ser intencional, ej. "18+"), no aplica ningún cambio.

### 5. Rechazo de pedido

- `motivo` → ya resuelto, es un enum cerrado con validación estándar. Sin acción.
- `comentario` → **resuelto en el tramo del 2026-09-02**: obligatorio condicional cuando
  `motivo=OTRO`, opcional en los demás casos, implementado en ambas capas. Sin acción
  pendiente más allá del mensaje en español al `@Size` (cosmético, sigue inalcanzable en la
  práctica).

### 6. Aprobación/rechazo de Comercio

- `motivo` → ya resuelto como texto libre obligatorio condicional, sin regla de formato
  (correcto, no hay ENUM). Sin acción más allá de unificar la redacción del mensaje
  entre backend y frontend (cosmético).

### 7. Horario

Ya implementado y auditado en un tramo previo — sin acción.

### 8. Cambio de contraseña / 9. Recuperación de contraseña (paso 3)

- `passwordActual` → sin cambios, correcto tal cual.
- `passwordNueva` / `nuevaPassword` → **Reusar tal cual** el patrón "Contraseña segura"
  (`esPasswordSegura` ya está en uso y ya exige minúscula, coincide con el backend); el
  único cambio necesario es actualizar el **texto** del mensaje hardcodeado en 3 lugares
  (`cliente.js:298`, `comercio.js:1010`, `auth.js:1498`) para que mencione la minúscula,
  igual que ya dice el mensaje default de `@ValidarPasswordSegura` en el backend — no
  hace falta ninguna función ni anotación nueva, es un ajuste de texto puro.
- `passwordConfirmar` → sin cambios, correcto tal cual (no es un campo de Bean Validation).

### 9. Recuperación de contraseña (pasos 1-2) / 10. Verificación y reactivación

Ya resueltos con el patrón correcto de dos pasos (vacío manual + validador de formato) y
con el input OTP estructural para el código — sin acción. Sirven de referencia de patrón
para corregir los formularios #1/#2.

### 11. Formularios de imágenes

No aplica — no son formularios de texto editables por el usuario.

### Precio de Producto — resuelto en el tramo del 2026-09-02

**Ya no es un caso abierto.** El tramo de perfeccionamiento de validaciones dedicado a
`ProductoRequestDTO` (2026-09-02, ver `docs/DECISIONES.md`) implementó el patrón
"Precio entero con separador de miles (sin centavos)" documentado en la Parte 2 —
`nombre`/`precio`/`categoriaId` de `ProductoRequestDTO` ya separan mensaje de vacío y de
formato inválido en el frontend, reusando el `@Pattern`/`esNombreProductoValido` que ya
existían para `nombre` y el `@Digits(integer=8, fraction=0)` + `@Positive` nuevos para
`precio`. `descripcion` queda sin tocar (campo opcional, sin `@Pattern`, mismo criterio
que `ComercioPerfilRequestDTO.descripcion`).

---

## Cierre

Auditoría completa, sin implementar nada. Los 11 formularios pedidos quedan relevados
(más la confirmación de que Horario ya está resuelto y que los 4 DTOs de imágenes son
puramente técnicos). El hallazgo más importante en términos de riesgo real (no solo de
mensajes) es el de `ComercioPerfilRequestDTO.aceptaDelivery`/`aceptaRetiro` sin validar
en el endpoint de edición — el resto son divergencias de UX (mensajes sin separar
vacío/formato, texto de contraseña desactualizado) sin impacto en la integridad de los
datos. Queda a la espera de que se definan, uno por uno y en conversaciones separadas,
los criterios de implementación de cada formulario antes de tocar código.

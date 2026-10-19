# Auditoría Fase 1: bloque Registro de Comercio (2026-10-18)

Auditoría de solo lectura. Lo único que se creó es este archivo. No se tocó ninguna base, no se ejecutó ninguna migración, test ni consulta SQL, y no se commiteó nada. Todo lo que se afirma sale de leer código, migraciones, tests y `docs/`; lo que no pude verificar está marcado como **no verificado** y reunido en la sección 9. Siguiente migración libre de Flyway: **`V36`** (la última es `V35__tipo_notificacion_empleado_reactivado.sql`).

---

## 0. Discrepancias con el prompt y hallazgos que cambian el diseño

1. **Tres DTOs de request comparten los datos del negocio.** `DatosNegocioComercioRequestDTO` es la superclase de `RegistroComercioRequestDTO` (registro), `AltaComercioAdicionalRequestDTO` (alta adicional) y `ReSolicitudComercioRequestDTO` (corrección de un rechazado). Cualquier cambio en `emailContacto` se propaga a los tres. **`aceptaTerminos` no puede ir en esa superclase**: la corrección de un rechazado no debe pedirlo (el Dueño ya aceptó al registrarse). Va en `RegistroComercioRequestDTO` y en `AltaComercioAdicionalRequestDTO` por separado.
2. **Tolhuin no existe en la base actual.** El seed del ETL (`backend/scripts/etl-georef/output/georef-seed.sql`) trae para la provincia `94` solo cuatro localidades: `94008010` Río Grande, `94015020` Ushuaia, `94015010` Laguna Escondida y `94021010` Puerto Argentino. Tolhuin la había cargado `V16__seed_localidad_tolhuin.sql` con el id `940021`, **que es el id del municipio y no de la localidad (ver 3.c, verificado contra Georef el 2026-10-18; el id oficial de la localidad es `94011010`)**; esa migración está **archivada** en `db/migration-archivo-bajonea-vieja/` y no pertenece a la cadena vigente (`V1` es el baseline de `bajonea_final` y no la incluye). `reset-db.mjs` carga `V1` → seed → Flyway, así que `bajonea_test` tampoco tiene Tolhuin. En `bajonea_practicas3` no sé si está (no verificado). Hay que insertarla por migración (punto 3).
3. **La regla de estados del nombre es la inversa de la actual** (ya lo había señalado `AUDITORIA-ETAPA-FINAL.md`). Hoy `ValidadorComercioDuplicado.ESTADOS_EXCLUIDOS_DEL_DUPLICADO = {RECHAZADO}`; la decisión nueva excluye solo `RECHAZO_DEFINITIVO`.
4. **El registro de Comercio no llama al validador de duplicados.** `RegistroService.registrarComercio` no invoca `ValidadorComercioDuplicado`; solo lo hacen `AltaComercioAdicionalService:76` y `ComercioCorreccionService:156`. Para el nombre único global hay que agregar el chequeo al registro.
5. **Corrección a la auditoría previa sobre la ñ.** `AUDITORIA-ETAPA-FINAL.md` (punto 10) dice que `utf8mb4_unicode_ci` trata `ñ` y `n` como letras distintas. Por lo que sé de UCA (DUCET), `unicode_ci` compara a nivel primario y `ñ` = `n` (la que las separa es `utf8mb4_spanish_ci`). Si es así, la base y `TextoUtils.normalizarParaComparar` (NFD sin marcas, que también convierte `ñ` en `n`) **coinciden**. No pude ejecutar nada para confirmarlo: hay que probar `SELECT 'ñ' = 'n' COLLATE utf8mb4_unicode_ci` en una base descartable. Igual lo evito por diseño (ver 4.b).
6. **Otro campo legal obligatorio que hoy no se usa para nada: `condicion_iva`** (`NOT NULL`, ENUM de 5 valores). Solo se muestra en pantallas del Administrador y del Dueño. Recomiendo volverlo opcional junto con los otros tres.
7. **Datos del representante.** `persona_fisica` tiene `fecha_nacimiento` y `telefono` `NOT NULL`, y el representante es el mismo `Dueno.persona_fisica`. Si "el DNI se queda", lo coherente es que **nombre, apellido, fecha de nacimiento y teléfono del representante también se queden obligatorios**; no los toco en la propuesta.
8. **El header del perfil del Dueño muestra el email del comercio** (`comercio.js:2166`, testid `email-comercio-perfil`). Si se deja de pedir, esa línea queda vacía y hay que decidir qué la reemplaza (pregunta Q3).
9. **El checkbox de Términos del Cliente no tiene enlaces.** `js/cliente-form.js:196` arma "Términos y Condiciones" y "Política de Privacidad" como `<span class="link">`, sin `href`. Al crear `terminos.html` y `privacidad.html` hay que convertirlos en enlaces reales en los tres registros (Cliente, invitación de Empleado, Comercio).
10. **Árbol de trabajo con cambios ajenos a esta auditoría** (de `git status`): `application.properties` y `Bajonea-Local.postman_environment.json` modificados; `backend/run-local.ps1`, `docs/AUDITORIA-ETAPA-FINAL.md` y `testing/playwright/tmp-capturas/` sin seguimiento.

---

## 1. Persona jurídica simplificada

### a) Qué existe hoy

| Capa | Dónde | Estado actual |
|---|---|---|
| Base | `V1__baseline_bajonea_final.sql:391-402`, tabla `persona_juridica` | `razon_social varchar(150) NOT NULL`, `cuit varchar(11) NOT NULL` + `uq_persona_juridica_cuit`, `condicion_iva enum(...) NOT NULL`, `tipo_sociedad enum(18 valores) NOT NULL`, `domicilio_fiscal varchar(255) NOT NULL`, `fecha_inicio_actividades date NOT NULL`. Ninguna migración posterior la toca |
| Entidad | `entities/PersonaJuridica.java` | `nullable = false` en los seis campos |
| Request | `dto/request/RegistroComercioRequestDTO.java` (campos legales) y `dto/request/DatosLegalesComercioRequestDTO.java` (el mismo bloque, para la corrección) | `@NotBlank`/`@NotNull` en razón social ("La razón social es obligatoria"), tipo de sociedad ("Seleccioná el tipo de sociedad"), condición IVA ("Seleccioná la condición ante el IVA"), fecha de inicio ("La fecha de inicio de actividades es obligatoria"), domicilio fiscal y CUIT. Los dos DTOs duplican los mismos campos y anotaciones |
| Response | `ComercioResponseDTO`, `ComercioAdminResponseDTO`, `DatosLegalesCorreccionResponseDTO` y **`ComercioPublicoResponseDTO`** (este último expone `razonSocial` sin autenticación) | Se arman en `ComercioService:382-387` y `:428`, `AdministradorService:391-396`, `ComercioCorreccionService:205` |
| Alta | `RegistroService.registrarComercio` (`:156-161`) | `TextoUtils.aTitleCase(razonSocial)` y el resto directo |
| Corrección | `ComercioEdicionService.actualizarDatosLegales` (`:262-310`) | Ya es **tolerante a nulos**: `limpiar()` convierte vacío en `null`, `registrar()` compara con `Objects.equals`, `nombreDe()` y `fecha()` aceptan `null`. `historial_cambio_comercio.valor_anterior` y `valor_nuevo` son `text DEFAULT NULL` (`V26`) |
| Pantallas | `registro-comercio.html:230-275`, `comercio-corregir.html:226-268`, lógica en `js/comercio-form.js` (`initDatosLegales`, `:434-523`); lectura en `comercio-perfil.html:164-184` + `comercio.js:2175-2180`, y en el Administrador `admin.js:569-570` y `:2041-2079` | Los cinco campos llevan `required` y mensaje de obligatorio en `validar()` |
| Usos reales del dato | Solo mostrarlo. Ningún servicio, email, notificación ni integración con Mercado Pago lee razón social, tipo de sociedad, IVA ni fecha de inicio (grep completo en `backend/src/main`). `CUIT` se usa para unicidad (`existsByCuit`) |

### b) Qué cambiar, capa por capa

- **Base**: `ALTER TABLE persona_juridica` volviendo `NULL`-ables `razon_social`, `tipo_sociedad`, `fecha_inicio_actividades` y (recomendado) `condicion_iva`. CUIT y domicilio fiscal quedan `NOT NULL`.
- **Entidad**: sacar `nullable = false` de esos campos.
- **DTOs** (los dos): quitar `@NotBlank`/`@NotNull` de esos campos. Las demás anotaciones (`@Pattern`, `@Size`, `@PastOrPresent`) ya pasan con `null`, pero **un string vacío no pasa el `@Pattern`**: hace falta un setter que convierta vacío o blanco en `null` (como ya hacen los setters de CUIT y DNI) y que el frontend mande `null`. Aprovechar para extraer una base común de los campos legales (hoy duplicados en dos clases).
- **Servicios**: `RegistroService:156-161` no cambia (`aTitleCase(null)` devuelve `null`). `ComercioEdicionService` no cambia.
- **Respuestas**: sin cambios de tipo; los campos pasan a poder venir `null`. Recomiendo además dejar de exponer `razonSocial` en `ComercioPublicoResponseDTO` (ninguna pantalla pública la dibuja; `catalogo.js`, `carrito.js`, `checkout.js` y `pedidos.js` solo la normalizan con `normalizarCampos`, que ya ignora `null`).
- **Frontend**:
  - Formularios: quitar `required`, rotular "(opcional)", validar solo si hay valor (hoy `validar()` usa `validarCampoRequeridoYValido` y `validarCamposSilencioso` para los selects) y mandar `null` si están vacíos (`leerPayload` hoy manda `''`).
  - Lectura: `comercio.js:2180` llama a `formatearFechaLarga(null)` y mostraría "Invalid Date"; el resto de las filas de `comercio-perfil.html` y `admin.js` mostrarían vacío. Hay que poner un guion o esconder la fila.
  - `comercio-corregir.html` y `precargar()` deben tolerar `null`.
- **Docs**: `diccionario-de-datos.md`, `requisitos-funcionales-dueño.md`/`-comercio.md`, historias de usuario del Dueño, `CLAUDE.md` §5bis.

### c) Migración y riesgo con datos

```sql
ALTER TABLE `persona_juridica`
  MODIFY COLUMN `razon_social` varchar(150) NULL,
  MODIFY COLUMN `condicion_iva` enum('RESPONSABLE_INSCRIPTO','EXENTO','NO_INSCRIPTO','MONOTRIBUTO','RESPONSABLE_NACIONAL') NULL,
  MODIFY COLUMN `tipo_sociedad` enum('SA','SRL','SAS','SC','SCS','SCRL','SCSA','SCCS','CC','CS','CCSA','CA','SP','ST','ACP','EMP','EU','UTE') NULL,
  MODIFY COLUMN `fecha_inicio_actividades` date NULL;
```

Los ENUM hay que repetirlos **exactos** (copiados del baseline); un valor omitido trunca o rechaza filas. Relajar un `NOT NULL` no toca filas existentes: riesgo con datos **nulo**. Reconstruye una tabla chica. `ddl-auto=validate` no mira nulabilidad. Los comercios ya registrados quedan intactos.

### d) Impacto en tests

Relajar una obligación **no rompe** los tests que siguen mandando todo. Se rompen solo los que prueban "obligatorio":
- Playwright: `13-registro-comercio-wizard.spec.ts:133-134` (espera "La razón social es obligatoria" al dejarla vacía). El `25-...:461-468` mockea la respuesta del servidor y debería seguir pasando mientras el mapeo del error se mantenga. El `01`, `19` y `13` llenan los campos con `fill`; seguirán pasando.
- Newman: carpeta `34 - Matriz Comercio - Registro Paso 2 (Legales)` (69 requests): "razonSocial vacia" (400), "tipoSociedad vacio (null)" (400), "condicionIva vacio (null)" (400) pasan a aceptar; probablemente también hay negativos de `fechaInicioActividades` (no los listé por nombre). Los de "(pasa validacion de formato, aislado con password vacio)" siguen en 400 por la contraseña. El builder es `build-matriz-comercio-postman.mjs`.
- Java: ninguna prueba busca esos mensajes (grep en `backend/src/test`). Los DTOs se leen de JSON y se pasan directo al servicio.
- Tests nuevos: registro sin los cuatro opcionales (201), con valores inválidos si vienen (400), corrección que borra el valor (cambio registrado con `valor_nuevo` nulo).
- Los 41 scripts y la helper `registrarComercio` siguen mandando todo: sin cambio forzoso.

### e) Concurrencia

Ninguna.

### f) Preguntas abiertas
- **Q1** ¿`condicion_iva` también opcional? Recomiendo **sí**.
- **Q2** ¿Los datos del representante (nombre, apellido, fecha de nacimiento, teléfono) se quedan obligatorios? Recomiendo **sí** (`persona_fisica` los exige y son del propio Dueño).
- **Q2b** ¿Se deja de exponer `razonSocial` en el DTO público? Recomiendo **sí**.

---

## 2. Email del comercio (`comercio.email`)

### a) Todo lugar que lo lee o escribe

**Base y entidad**: `comercio.email varchar(150) NOT NULL` (`V1:66`), sin índice ni unicidad. `Comercio.java:62-63` (`nullable = false`).

**Escrituras** (todas desde un request del Dueño; el dato nunca se calcula):
| Dónde | Qué hace |
|---|---|
| `RegistroService.crearComercio` `:200` | `.email(datos.getEmailContacto())` en el alta y en el alta adicional |
| `ComercioService.editarPerfil` `:156-166` | compara y hace `setEmail(request.getEmailContacto())` (`PUT /comercios/perfil`) |
| `ComercioEdicionService.actualizarDatosBasicos` `:76-89` | corrección de un rechazado; registra el cambio `CampoCambioComercio.EMAIL_CONTACTO` |
| `TestSupportService.clonarComercio` `:175` | copia el email del comercio original (atajo de test) |

**Lecturas** (todas para mostrar):
| Dónde | Para qué |
|---|---|
| `ComercioService:91`, `:377`, `:420` → `ComercioResponseDTO`, `ComercioEmpleadoResponseDTO`, `ComercioPublicoResponseDTO` | respuesta self-service, del Empleado y público |
| `AdministradorService:385` → `ComercioAdminResponseDTO` | detalle del Administrador |
| `ComercioCorreccionService:120` → `CorreccionComercioResponseDTO` | precarga del formulario de corrección |

**DTOs de request**: `DatosNegocioComercioRequestDTO.emailContacto` (`@NotBlank @Email @Size(150)`, compartido por registro, alta adicional y re-solicitud), `ComercioPerfilRequestDTO.emailContacto` (`@NotBlank @ValidarFormatoEmail`), mencionado como "prohibido" en `ComercioDatosOperativosRequestDTO` (el Empleado no puede cambiarlo).

**Pantallas**: `registro-comercio.html:69-76`, `agregar-comercio.html:95-102`, `comercio-corregir.html:76-83`, `comercio-perfil.html:120-122` (edición) y `:267-270` (campo bloqueado del Empleado); lógica en `comercio-form.js:107,112,323,339,370,379,404`, `comercio.js:2017` (campo bloqueado), `:2166` (**header del perfil**), `:2190`, `:2318-2359` (edición), `admin.js:560` (fila "Email de contacto") y `:2067` (comparación de re-solicitudes).

**Emails y notificaciones que lo usen como destinatario: ninguno.** Todos los envíos van por `EmailService.enviarTextoPlano(destinatario, ...)` y se llaman así: `enviarVerificacion`, `enviarRecuperacionPassword` y `enviarReactivacionCuenta` con `usuario.getEmail()` (cuenta de login del Dueño o del Cliente; `AuthService:167,182,316`, `RegistroService:317`); `enviarInvitacionEmpleado` y `enviarRegularizacionInvitacion` con el email de la persona invitada (`InvitacionEmpleadoService:631`, `InvitacionRegularizacionService:59`). Mercado Pago tampoco lo usa (el único `payer` del código es `fee_payer`). Las notificaciones son in-app. **Ningún envío usa el email del comercio; los que salen de una cuenta usan el del usuario.**

**Tests, seeds y builders que lo mandan** (`emailContacto`): 10 clases Java, 13 specs de Playwright, 42 scripts, 5 scripts de `datos-prueba`, y 287 apariciones en `postman/Bajonea-MVP.postman_collection.json`. Los que **aseveran** sobre él: `23-...ui.spec.ts:316` (mensaje "Ingresá un email de contacto con formato válido"), `22-...spec.ts:274` (email inválido en el alta adicional da 400), `42-empleado-escrituras-api.spec.ts:185,199` (el email no cambia y coincide con `SELECT email FROM comercio`), `53-empleado-edicion-ui.spec.ts:137,264`, `38-...:563` (`email-comercio-perfil` oculto), `EscriturasEmpleadoHttpIntegrationTest:120`.

**Conclusión: nada de negocio lo lee.** Se puede dejar de pedir.

### b) Qué cambiar
- **Base**: `comercio.email` pasa a `NULL`; no se borra la columna.
- **Entidad**: sin `nullable = false`.
- **Request**: sacar `emailContacto` de `DatosNegocioComercioRequestDTO` y de `ComercioPerfilRequestDTO`. Atención: `editarPerfil:166` hoy asigna siempre el valor del request; con el campo ausente **pisaría el email con `null`**. Si el campo se saca del DTO, hay que sacar también esa asignación. Alternativa conservadora: dejarlo opcional en los DTOs (si viene, se guarda) y solo sacarlo de las pantallas.
- **Servicios**: `RegistroService:200`, `ComercioService:156-166`, `ComercioEdicionService.actualizarDatosBasicos` (cambiar la firma, que hoy recibe `emailContacto`; `ComercioCorreccionService:160` la llama) y la comparación en `editarPerfil`.
- **Response**: `emailContacto` en cinco DTOs. Recomiendo sacarlo de `ComercioPublicoResponseDTO` y de los de edición, y dejarlo en el del Administrador solo si se quiere ver el dato histórico (los comercios viejos lo tienen).
- **Enum** `CampoCambioComercio.EMAIL_CONTACTO`: se deja (hay filas históricas en `historial_cambio_comercio.campo`, que es `varchar(40)`).
- **Pantallas**: quitar los cuatro campos de formulario (`registro-comercio`, `agregar-comercio`, `comercio-corregir`, `comercio-perfil`), la fila del Administrador (`admin.js:560`, `:2067`), el campo bloqueado del Empleado (`comercio-perfil.html:267`) y **resolver el header del perfil** (`perfil-email`).
- **Docs/tests ids**: los testids `input-email-contacto` y `mensaje-error-email-contacto` desaparecen (`docs/DATA-TESTID-FASE17.md`).

### c) Migración y riesgo
```sql
ALTER TABLE `comercio` MODIFY COLUMN `email` varchar(150) NULL;
```
Riesgo con datos nulo. Los comercios existentes conservan su email. Va en la misma `V36` que el punto 1.

### d) Impacto en tests
- Si se **saca del DTO**: los 13 specs y 42 scripts que mandan `emailContacto` siguen funcionando mientras el servidor ignore campos desconocidos (el cuerpo de `PUT /comercios/perfil/datos-operativos` los rechaza a propósito, pero `ComercioPerfilRequestDTO` y los de registro no; `application*.properties` no define ninguna propiedad `spring.jackson.*`, y el default de Spring Boot ignora campos desconocidos; **no verifiqué que no exista un `ObjectMapper` propio**). Hay que limpiar de todos modos los payloads (helpers `backend.ts:347`, `:718`, `multicomercio.ts:142`).
- Tests de UI que llenan `input-email-contacto`: `01-registro-y-verificacion` (líneas 176, 337, 355, 443), `13-registro-comercio-wizard` (60, 141), `19-nombre-usuario` (434), `23-...ui` (118, 316): fallan por testid inexistente hasta quitarlos.
- A invertir/eliminar: `22:274`, `23:316`, `42:185,199`, `53:137,264`, `38:563` (según qué se haga con el header), `EscriturasEmpleadoHttpIntegrationTest:120`; en Newman las carpetas `33` ("emailContacto vacio", "sin arroba", "sin dominio") y `50` ("sin email de contacto", "formato invalido"), y los 287 usos en bodies.
- `TestSupportService.clonarComercio` sigue compilando.

### e) Concurrencia
Ninguna.

### f) Preguntas abiertas
- **Q3** ¿Qué reemplaza al email en el header del perfil del Dueño (`perfil-email`)? Recomiendo el **teléfono del comercio** o dejar solo el nombre. No mostrar el email de la cuenta (es el de login).
- **Q3b** ¿Se saca de los DTOs o queda opcional? Recomiendo **sacarlo** de request y de los responses público y del Empleado, y dejarlo `NULL`-able en la base.

---

## 3. Provincia y ciudades: solo Tierra del Fuego (Río Grande, Ushuaia, Tolhuin)

### a) Qué existe hoy
- **Carga**: `provincia(id varchar(2), nombre)` y `localidad(id varchar(15), nombre, provincia_id)`, sin columna de estado. Se cargan con `backend/scripts/etl-georef/etl-georef.mjs` (genera `output/georef-seed.sql`, `INSERT ... ON DUPLICATE KEY UPDATE`, ~4037 localidades, 24 provincias), fuera de Flyway. Tolhuin no viene del ETL (punto 0.2).
- **Endpoints** (públicos, `SecurityConfig:108` `/api/v1/geografia/**`): `GET /geografia/provincias` (todas, `provinciaRepository.findAll()`) y `GET /geografia/localidades?provinciaId=` (`LocalidadRepository.findByProvinciaId`), en `GeografiaService`/`GeografiaController`.
- **Pantallas que las listan**: `js/geografia.js` (`initGeografiaSelects`, `preseleccionarGeografia`) lo usan `cliente-form.js:422` (registro de Cliente y alta por invitación) y `comercio-form.js:315` (registro, alta adicional y corrección de Comercio), con "Tierra del Fuego" como provincia preseleccionada.
- **Dónde se acepta una localidad por id**: `ValidadorDatosNegocioComercio.obtenerLocalidad` (`localidadRepository.findById`, `404` "La localidad indicada no existe"), que usan `RegistroService.crearCliente`, `registrarComercio`, `crearComercio` (también alta adicional) y `ComercioCorreccionService.reSolicitar` (vía `validar`). `DireccionRequestDTO.localidadId` solo valida no vacío y `@Size(15)`. **No hay endpoint de edición de la dirección del Cliente** (`ClienteService:94-96` solo lee). Los pedidos leen `pedido.direccion` (`PedidoService:1085-1087`) pero no filtran por localidad. `ValidadorComercioDuplicado` compara por `localidad.id`.
- **Datos existentes con otras localidades**: no puedo saberlo sin base. Las direcciones (`direccion.localidad_id`, FK a `localidad`) y los pedidos (`pedido.direccion_id`) apuntan a localidades que **no se pueden borrar** sin romper FKs y sin violar la regla del proyecto.

### b) Opción más segura para restringir sin borrar

**Recomiendo una lista fija de ids habilitados, en configuración, aplicada en dos puntos** (lectura y escritura), más una migración que garantice Tolhuin:

1. `GeografiaService`: filtrar `listarLocalidadesPorProvincia` por la lista y `listarProvincias` para devolver solo las provincias que tengan al menos una localidad habilitada (queda una: Tierra del Fuego).
2. `ValidadorDatosNegocioComercio.obtenerLocalidad`: rechazar con `400` (`ValidacionException`, "Esa localidad todavía no está disponible") una localidad **existente pero no habilitada**; una inexistente sigue dando `404`.
3. Propiedad, p. ej. `geografia.localidades-habilitadas=94008010,94015020,94011010`.

Por qué no una columna `activa`: depende del **orden de carga**. En `reset-db.mjs` el seed corre antes de `V36` (un `UPDATE` funcionaría), pero en un servidor nuevo el ETL se corre a mano después de Flyway, y un `UPDATE` en `V36` no encontraría filas; con `DEFAULT 1` o `DEFAULT 0` el ETL dejaría todo habilitado o todo deshabilitado. La lista fija no depende de eso. Las filas existentes siguen legibles (los `JOIN FETCH` y las FKs no se ven afectados).

Para el frontend: con una sola provincia, `provincia` puede quedar fijo y oculto (el select de localidad pasa a tres opciones). Es un cambio chico en `geografia.js`, `registro-comercio.html`, `agregar-comercio.html`, `comercio-corregir.html` y el paso de dirección de `cliente-form.js`; `preseleccionarGeografia` seguiría funcionando.

### c) Migración
**Id oficial de Tolhuin, verificado contra la API de Georef el 2026-10-18** (consultas `GET` de solo lectura a `apis.datos.gob.ar/georef/api`, provincia `94`):

| Endpoint | Resultado |
|---|---|
| `/localidades?provincia=94` (el que consulta el ETL) | 4 resultados: Puerto Argentino `94021010`, Río Grande `94008010`, Ushuaia `94015020`, Laguna Escondida `94015010`. **Tolhuin no está**; `/localidades?nombre=tolhuin` devuelve 0 |
| `/municipios?provincia=94` | Ushuaia `940014`, **Tolhuin `940021`**, Río Grande `940007` (ids de 6 dígitos) |
| `/localidades-censales?provincia=94` (14 resultados) | **Tolhuin `94011010`** (departamento `94011`, `municipio.id = 940021`), Río Grande `94008010`, Ushuaia `94015020`, Laguna Escondida `94015010` |

Conclusión: el `940021` de la `V16` archivada es el **id del municipio**, no el de la localidad, por eso no tiene el formato de 8 dígitos de los demás. **El id oficial de la localidad es `94011010`**, el que Georef publica como localidad censal (mismo formato y misma familia que `94008010` y `94015020`, que coinciden exactamente con los del seed). Lo que no pude verificar es qué decidió la cuenta de Georef a futuro (el dataset puede cambiar).

`V36` (misma que 1 y 2) debe insertar Tolhuin con ese id, idempotente:
```sql
INSERT INTO `localidad` (`id`, `nombre`, `provincia_id`)
VALUES ('94011010', 'Tolhuin', '94')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`), `provincia_id` = VALUES(`provincia_id`);
```
Requiere que la provincia `94` exista (en `bajonea_test` y las demás ya está, por el seed). Riesgo con datos: ninguno para la inserción.

**Bases que ya aplicaron la `V16` vieja** (la cadena anterior a `bajonea_final`, o `bajonea_practicas3` si la copió): tendrían una fila `940021`. Esa fila no debe tocarse ni borrarse. Si alguna dirección la usa (consulta en 3.e, primera sentencia extra), la `V36` debe reapuntarlas: `UPDATE direccion SET localidad_id = '94011010' WHERE localidad_id = '940021'`. Esa sentencia es idempotente y no hace nada si no hay filas; no la incluyo por defecto porque no sé si existe tal caso (decisión Q11).

El ETL (`etl-georef.mjs`) solo consulta `/localidades`, así que nunca traerá Tolhuin: la migración es la única vía, y conviene anotarlo en el script y en `docs/LISTA-DE-DESPLIEGUE.md`.

### d) Impacto en tests
- Todos los tests eligen **Río Grande** (`helpers/backend.ts:197-212` busca la provincia que empieza con "Tierra del Fuego" y la localidad "río grande"; los scripts usan la misma búsqueda o `94008010` fijo en `datos-prueba/scripts/datos-fase1.mjs:47`, `datos-fase2.mjs:47`, `seed-fase1-comercios.mjs:52`). Con el filtro por lista, siguen funcionando.
- A revisar: `22-multicomercio-tramo2a-alta-adicional.spec.ts:715-717` (busca provincia y localidades por API) y las carpetas de Newman que prueban "Localidad inexistente" (`50 ... [alta invalida] Localidad inexistente: 404`, `ValidadorDatosNegocioComercio`): siguen dando 404 si el id no existe.
- Tests Java que crean `Localidad` en memoria ("L2" Tolhuin en `ComercioEdicionServiceTest:207`) no pasan por el filtro.
- Nuevos: localidad existente pero fuera de la lista (`400`), `GET /geografia/provincias` devuelve una sola, `GET /geografia/localidades?provinciaId=94` devuelve tres (en `bajonea_test` solo después de `V36`).
- UI: los specs que seleccionan provincia/localidad por testid (`select-provincia`, `select-localidad`) se rompen si se oculta la provincia.

### e) Concurrencia
Ninguna.

### Consulta de solo lectura para detectar datos fuera de Tierra del Fuego (no ejecutada)
```sql
SELECT p.id AS provincia_id, p.nombre AS provincia, l.id AS localidad_id, l.nombre AS localidad,
       SUM(d.cliente_id IS NOT NULL) AS direcciones_de_clientes,
       SUM(d.comercio_id IS NOT NULL) AS direcciones_de_comercios,
       COUNT(*) AS total
FROM direccion d
JOIN localidad l ON l.id = d.localidad_id
JOIN provincia p ON p.id = l.provincia_id
WHERE l.id NOT IN ('94008010', '94015020', '94011010')
GROUP BY p.id, p.nombre, l.id, l.nombre
ORDER BY total DESC;

SELECT COUNT(*) AS pedidos_con_direccion_fuera
FROM pedido ped
JOIN direccion d ON d.id = ped.direccion_id
WHERE d.localidad_id NOT IN ('94008010', '94015020', '94011010');

SELECT id, nombre, provincia_id FROM localidad WHERE id IN ('94008010', '94015020', '94011010') OR nombre LIKE 'Tolhuin%';
```
La tercera confirma si Tolhuin ya está (con cualquiera de los dos ids). Para el caso de la `V16` vieja, una cuarta consulta cuenta las direcciones que usan el id del municipio:
```sql
SELECT COUNT(*) AS direcciones_con_id_de_municipio FROM direccion WHERE localidad_id = '940021';
```
Las filas fuera de la lista **no hay que tocarlas**: quedan como están y se muestran normalmente.

### f) Preguntas abiertas
- **Q4** ¿La restricción aplica también a los **Clientes** (registro y alta por invitación)? Recomiendo **sí**, es la misma tabla; si el Cliente queda libre habría que distinguir endpoints.
- **Q4b** ¿Se oculta el select de provincia? Recomiendo sí, fijo en Tierra del Fuego.
- **Q4c** ¿Qué hacer si ya hay direcciones fuera (la primera consulta)? Recomiendo dejarlas; el Cliente afectado no puede cambiarla desde la app de todos modos (no hay edición de dirección).

---

## 4. Nombre único de comercio

### a) Qué existe hoy
- **Regla actual**: por Dueño, nombre + dirección (`ValidadorComercioDuplicado`), con `TextoUtils.normalizarParaComparar` (NFD sin marcas, minúsculas, `trim`, espacios colapsados). Excluye `RECHAZADO`. Mensaje `MENSAJE_DUPLICADO` = "Ya tenés un comercio con ese nombre en esa dirección. Si es otro local del mismo edificio, agregá el piso o número de local.".
- **Dónde se invoca**: alta adicional (`AltaComercioAdicionalService:76`) y re-solicitud (`ComercioCorreccionService:156`, con el id del propio comercio como exclusión). **No** en el registro ni en la edición del perfil.
- **Edición del perfil**: `ComercioService.editarPerfil` (`:140-166`) pone `setNombre(aTitleCase(...))` y `comercioRepository.save(comercio)` **sin validar duplicados**: hoy se puede renombrar a un nombre repetido. Solo el Dueño la usa (el Empleado no cambia el nombre).
- **Base**: `comercio.nombre varchar(150) NOT NULL`, colación `utf8mb4_unicode_ci`, **sin índice único** (solo `idx_comercio_dueno`, `idx_comercio_estado`).
- **Quién escribe el nombre**: `RegistroService.crearComercio:~195` (`aTitleCase`), `ComercioService.editarPerfil`, `ComercioEdicionService.actualizarDatosBasicos:73` y `TestSupportService.clonarComercio:170` (nombre recibido por parámetro).
- **Front**: `comercio-corregir.js:25,352` detecta el prefijo "Ya tenés un comercio con ese nombre" para volver al paso del negocio. El alta adicional (`agregar-comercio.js`) muestra el mensaje en un banner y vuelve al paso 1.
- `DatosNegocioComercioRequestDTO.nombre` no tiene setter de normalización: se guarda como se escribió (sólo `aTitleCase`), con sus espacios.

### b) Qué cambiar, capa por capa

**Migración** (precedente `V27__cuenta_mercado_pago_mp_user_id_activo_unico.sql`):
```sql
ALTER TABLE `comercio`
  ADD COLUMN `nombre_unico` varchar(150) COLLATE utf8mb4_unicode_ci
    GENERATED ALWAYS AS (CASE WHEN `estado` = 'RECHAZO_DEFINITIVO' THEN NULL
      ELSE TRIM(REGEXP_REPLACE(`nombre`, '[[:space:]]+', ' ')) END) STORED,
  ADD UNIQUE KEY `uq_comercio_nombre_unico` (`nombre_unico`);
```
**Confirmo / corrijo respecto de la auditoría anterior**:
- Confirmo la idea (columna generada `STORED` + `UNIQUE`, `NULL` para `RECHAZO_DEFINITIVO`, no mapeada por JPA).
- **Saco el `LOWER`**: con `utf8mb4_unicode_ci` el `UNIQUE` ya ignora mayúsculas y acentos, y declaro la colación de la columna para que no dependa de la de la conexión.
- Una clave de 150 caracteres `utf8mb4` son 600 bytes, bajo el límite del índice de InnoDB.
- `STORED` ya está en uso con éxito en `V27`; **`REGEXP_REPLACE` dentro de una columna generada `STORED` en MariaDB 10.4 no está verificado**: probarlo en una base descartable antes de commitear.
- Los `NULL` no chocan en un `UNIQUE`: los `RECHAZO_DEFINITIVO` conviven.

**ñ y la normalización Java**: para que Java y base **no puedan discrepar**, el chequeo previo de Java no debe usar `TextoUtils.normalizarParaComparar` sino la **misma expresión SQL** contra la columna generada, p. ej. una consulta nativa `SELECT EXISTS (SELECT 1 FROM comercio WHERE nombre_unico = TRIM(REGEXP_REPLACE(:nombre, '[[:space:]]+', ' ')) AND (:excluirId IS NULL OR id <> :excluirId))`. Así el mensaje amigable y el índice usan la misma regla (incluida la `ñ`, sea cual sea la colación). Complemento: la base es la red de seguridad.

**Servicios**:
- Reemplazar el cuerpo de `ValidadorComercioDuplicado` por un validador de nombre global (el chequeo por dirección queda redundante: dos comercios con el mismo nombre ya no pueden convivir). Invocarlo desde `registrarComercio` (hoy no lo hace), `AltaComercioAdicionalService`, `ComercioCorreccionService` (excluyendo el propio id) y `ComercioService.editarPerfil` (solo si el nombre cambió, excluyendo el propio id).
- `GlobalExceptionHandler.handleDataIntegrityViolation` ya traduce `uq_usuario_nombre_usuario`; sumar `uq_comercio_nombre_unico` con el mismo `409` y mensaje, como se hizo con `uq_persona_juridica_cuit` (`ComercioEdicionService:~315`) y `V27`. Para que la excepción salga dentro del método (y no en el commit), usar `saveAndFlush` en el alta (hoy `comercioRepository.save` con id `IDENTITY` ya inserta al instante) y en `editarPerfil`/`actualizarDatosBasicos`, donde el `save` de una entidad gestionada se difiere al commit.
- Opcional: normalizar el nombre al guardar (colapsar espacios y `trim`) con un setter en el DTO.

**Mensaje nuevo** (a confirmar): "Ya existe un comercio con ese nombre. Elegí otro." El prefijo cambia; `comercio-corregir.js:25` (`PREFIJO_MENSAJE_DUPLICADO`) y los tests que comparan el texto hay que actualizarlos.

**Edición del perfil**: hoy no valida; con la regla nueva sí debe hacerlo y devolver `409` con el mismo mensaje (`comercio-perfil` ya muestra errores de `409`; verificar el manejo en `comercio.js:2338-2359`).

**Regla de estados**: todos cuentan salvo `RECHAZO_DEFINITIVO`. Consecuencia: un comercio `RECHAZADO` **retiene su nombre**; el Dueño ya no puede darlo de alta de nuevo, tiene que corregirlo; y otra cuenta tampoco puede tomarlo. Se invierte el test `22:449` ("un comercio RECHAZADO no cuenta como duplicado") y `24:818` ("un RECHAZO_DEFINITIVO cuenta como duplicado ... un RECHAZADO no") queda al revés.

### c) Migración y riesgo con datos
`V36` (o `V37` si se prefiere una migración aparte, ver sección 7). **Riesgo real**: si en la base existen dos comercios no-`RECHAZO_DEFINITIVO` con el mismo nombre, el `ADD UNIQUE KEY` falla y Flyway deja la versión en estado fallido. Hay que correr antes la consulta de duplicados y resolverlos a mano.

**Consulta de duplicados de solo lectura (versión final, no ejecutada)**: usa la misma expresión de la columna, así que lo que detecta es exactamente lo que fallaría:
```sql
SELECT TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' ')) AS clave,
       COUNT(*) AS n,
       GROUP_CONCAT(id ORDER BY id) AS ids,
       GROUP_CONCAT(estado ORDER BY id) AS estados,
       GROUP_CONCAT(dueno_id ORDER BY id) AS duenos
FROM comercio
WHERE estado <> 'RECHAZO_DEFINITIVO'
GROUP BY clave COLLATE utf8mb4_unicode_ci
HAVING COUNT(*) > 1;
```
(el `COLLATE` en el `GROUP BY` fuerza la misma comparación que usará el índice). En `bajonea_practicas3` es probable que haya repetidos si se registraron pruebas con el mismo nombre; en `bajonea_test` no, porque se resetea (no verificado en ninguna).

### d) Impacto en tests (la parte más grande)

**Nombres fijos que colisionarían**. Medí la colección de Newman: de 233 altas de comercio (172 `POST /auth/registro/comercio` y ~61 `POST /comercios`), se repiten:
- **`Comercio Matriz Base`: 109 veces** (carpetas `33` a `39` y `41`, "Matriz Comercio"; 28 en la `33`, 69 en la `34`, 7 en la `35` y 1 en cada una de las otras), de las cuales **14 esperan 201** (cada una un Dueño distinto): con el nombre global, 13 de esas pasan a 409. Los otros 93 son negativos (400) que fallan antes por otra validación y no chocan, y 2 esperan 409. Hay que ponerles un sufijo por corrida en `build-matriz-comercio-postman.mjs` y en `matriz-comercio-runner.mjs:13`.
- `Sucursal Postman Base` (34, carpeta `50`; los 201 usan otros nombres), `Cafetería Ñandú Postman` (9, carpeta `50`), `Comercio Postman Negativo` (4, carpeta `09`), `Ex Empleado Postman` (2, carpeta `56`).
- En los builders y estreses hay nombres literales que se repiten solo si se corre dos veces sin reset: `Local Pedidos A0`, `Local Trazabilidad A3`, `Local Orden A5b`, `Local No Retirado A4b`, `Local Escrituras A2`, `Local Equipo E4`, `Local Carrito E3`, `Local Avisos A4`, `Local Autoconfirmado A6`, `Local Actividad A2b`, `Comercio Matriz Cliente`, `Comercio Matriz Sin Delivery`, `Comercio Unico Editado`, `Multi Postman B Editado`, `Adicional Correccion M`. Newman exige base reseteada por corrida, así que hoy no chocan; **con el índice, un estrés repetido sin reset sí**.
- Playwright: `helpers/backend.ts:337` usa `Comercio E2E ${suf}` y `:713` `Adicional E2E ${suf}` (únicos). Literales: `09-notificaciones.spec.ts:18` (`Comercio Notificaciones E2E`), `21-multicomercio-tramo1.spec.ts:163,302` (`Comercio Unico Editado`, `Comercio B Editado`), `24-...spec.ts:1010,1027` (`Nombre De La Bandeja`).
- `TestSupportService.clonarComercio` (`POST /test/comercios/{id}/clonar?nombre=`): 29 archivos lo llaman (33 usos en Newman, siempre con `{{lc_N_nombre}}`); si algún llamador repite un nombre, falla.
- Seeds: `datos-prueba/scripts/datos-fase1.mjs` y `seed-fase1-comercios.mjs` tienen los **mismos 7 nombres** (Pizzería Popular, Corner Coffee Shop, Los Troncos, Store 54, Las Vegas Food Truck, Big Burger, Tante Sara): son copias, no se pueden correr las dos sobre la misma base. `datos-fase2.mjs` (7 nombres) no repite los de fase 1. `postman/limpiar-datos-postman.sql` no toca comercios por nombre (no verificado en detalle).

**Tests que cambian de significado**:
- Playwright `22-multicomercio-tramo2a-alta-adicional.spec.ts`: `:384` (mismo nombre en la misma dirección, 409: sigue, con mensaje nuevo), `:391` (mayúsculas/tildes/espacios), **`:405` (mismo nombre en otra dirección es distinto: ahora es 409)**, `:438`, **`:449` (RECHAZADO no cuenta: se invierte)**, **`:466` (dos Dueños pueden tener el mismo nombre: se invierte)**; `23-...ui.spec.ts:35,277,454` (texto del mensaje); `24-...spec.ts:39-40,796-827` (mensaje y regla de estados).
- Java: `AltaComercioAdicionalServiceTest:135` (mensaje) y `:160,175` (otra dirección, RECHAZADO), `ComercioCorreccionServiceTest:242` (exclusión del propio comercio, se mantiene), `ComercioEdicionServiceTest` (patrón de carrera de `uq_persona_juridica_cuit`, `:397`, a replicar).
- Newman carpeta `50` (la de los `[duplicado]`: "Mismo nombre en otra direccion (otro numero): 201", "otro piso: 201", "Tras el rechazo se puede dar de alta el mismo comercio otra vez: 201", "tercer intento ya es duplicado: 409" cambian) y carpeta `51` (RECHAZO_DEFINITIVO). Los mensajes de Newman comparan texto.
- Nuevos: registro con nombre ya tomado (409, y que no queda ningún `usuario` huérfano), renombrar desde el perfil a un nombre ajeno (409), `ñ` vs `n`, espacios y mayúsculas, `RECHAZO_DEFINITIVO` libera el nombre, carrera de dos registros simultáneos con el mismo nombre (un 201 y un 409).
- Estrés: nuevo `stress-locks-tramoNombreUnico.mjs` (patrón de `stress-locks-tramo2a.mjs`): N registros simultáneos con el mismo nombre desde Dueños distintos.

### e) Concurrencia
- El `UNIQUE` serializa: el segundo `INSERT` espera el lock de la clave hasta que el primero confirma o revierte, y falla con `1062`. Sin locks nuevos y sin cambios al orden global de bloqueos.
- **Cruce de Dueños**: el alta adicional toma `dueno FOR UPDATE`, pero eso solo serializa al mismo Dueño; la carrera entre Dueños distintos depende del índice.
- **Riesgo conocido de InnoDB**: con **tres o más** inserciones concurrentes de la misma clave única puede aparecer un `Deadlock found` (error `1213`) en vez del `1062`. Hay que mapear también ese caso a `409` y cubrirlo con el estrés (en este proyecto ya hubo otros deadlocks documentados en `docs/APRENDIZAJES-TECNICOS.md`).
- **Registro**: el comercio se inserta al final de `registrarComercio`, después de crear `usuario`, `persona`, etc. Un `409` por nombre repetido revierte toda la transacción (correcto), pero conviene validar **antes de la primera escritura**, como ya se hace con email, nombre de usuario, CUIT y DNI.
- **El nombre queda retenido por un registro nunca verificado**: el comercio nace `PENDIENTE` junto con un `usuario` `PENDIENTE` (sin verificar el email); no hay un job que libere esos nombres. Alguien puede "ocupar" un nombre con una cuenta que nunca verifica (ver Q7).

### f) Preguntas abiertas
- **Q5** Mensaje nuevo. Propongo "Ya existe un comercio con ese nombre. Elegí otro."
- **Q6** ¿El chequeo por dirección se **elimina** (recomiendo) o se mantiene como segundo mensaje?
- **Q7** Cuentas sin verificar que retienen el nombre: recomiendo **aceptarlo** en esta etapa y anotarlo como limitación conocida (el nombre es chico, no hay dinero en juego).
- **Q8** ¿Un `RECHAZADO` retiene el nombre? Es consecuencia de tu regla; lo señalo porque cambia el flujo del Dueño (debe corregir, no re-registrar). Recomiendo **sí**.

---

## 5. Términos y Condiciones

### a) Qué existe hoy
- **Cliente**: `RegistroClienteRequestDTO.aceptaTerminos` (`Boolean`, `@NotNull` + `@AssertTrue`, "Tenés que aceptar los Términos y Condiciones"), checkbox `aceptaTerminos` (testid `input-acepta-terminos`) en `js/cliente-form.js:195-198`, bloqueo de paso en `:413-418`, payload en `:469`. Se valida y **no se guarda**.
- **Invitación de Empleado**: `AceptarInvitacionEmpleadoRequestDTO.aceptaTerminos` (solo cuenta nueva), `invitacion-empleado.js:151-155` reutiliza `cliente-form.js`.
- **Comercio**: nada. Ni el DTO ni `registro-comercio.html` ni `agregar-comercio.html` tienen el campo.
- **Páginas**: no existen `terminos.html` ni `privacidad.html`. `frontend/` tiene 44 `.html`; no hay una lista de páginas públicas que mantener (`PAGINAS_PUBLICAS` no existe en `js/`); `Caddyfile` sirve estáticos.

### Puntos de entrada de registro de Comercio y su DTO
| Punto de entrada | Ruta | DTO | ¿Pide términos? |
|---|---|---|---|
| Registro (Dueño + comercio) | `POST /api/v1/auth/registro/comercio` (`auth.js:384`, paso 4, `submit-btn`) | `RegistroComercioRequestDTO` | **Sí** (agregar) |
| Alta adicional | `POST /api/v1/comercios` (`agregar-comercio.js:198`, paso 3) | `AltaComercioAdicionalRequestDTO` | **Sí** (agregar), por decisión tuya |
| Corrección de un rechazado | `PUT /api/v1/comercios/{id}/resolicitud` (`comercio-corregir.js:305`) | `ReSolicitudComercioRequestDTO` | **No**: el Dueño ya aceptó y es el mismo comercio |

### b) Qué cambiar
- **Backend**: `Boolean aceptaTerminos` con `@NotNull` + `@AssertTrue` en `RegistroComercioRequestDTO` y `AltaComercioAdicionalRequestDTO` (no en la superclase). El error sale como `data["aceptaTerminos"]`, igual que el Cliente.
- **Frontend**: checkbox con enlaces reales en el paso final de `registro-comercio.html` y de `agregar-comercio.html`; que bloquee el envío; sumar `aceptaTerminos` al payload en `auth.js:~375` y `agregar-comercio.js:~190`; mapear el error de campo en `MAPA_ERRORES_REGISTRO_COMERCIO` y `MAPA_ERRORES_NEGOCIO` (`comercio-form.js:~119`). Reusar el mismo testid `input-acepta-terminos`.
- **Páginas**: `terminos.html` y `privacidad.html` con texto provisorio; enlazar desde los tres registros (convertir los `span.link` de `cliente-form.js:196` en `<a href target="_blank" rel="noopener">`). Las páginas no llevan comentarios (regla 11 del proyecto).
- **Docs**: `requisitos-funcionales-comercio.md`/`-dueño.md`, `alcance-y-limitaciones.md`, `CLAUDE.md` §5bis.

### c) Migración
Ninguna (no se guarda).

### d) Impacto en tests (el barrido mecánico más grande del bloque)
Como el campo es obligatorio, **todo cuerpo que registra un comercio sin él pasa a dar 400**:
- `helpers/backend.ts`: `registrarComercio` (`:319-370`, payload sin el campo) y `payloadAltaAdicional` (`:709-735`), de los que cuelgan `registrarYVerificarComercio` y `registrarComercioAdicional`. Un cambio de una línea en cada uno cubre la mayoría de los specs.
- Specs que arman el cuerpo a mano: `18-configuracion-tarifas.spec.ts:62`, `35-empleado-invitacion-api.spec.ts:1107-1108`, `01-registro-y-verificacion.spec.ts:223` y `:436` (esperan o interceptan la respuesta de `/auth/registro/comercio`).
- Specs de UI que recorren el wizard y deben tildar el checkbox antes de enviar: `01` (`:167-190`, `:337-368`, `:443-455`), `13` (todo el wizard), `19` (`:434-449`), y los helpers de `23-...ui.spec.ts` (alta adicional por UI, `:118`).
- Scripts: **41** scripts de `testing/playwright/scripts` hacen `POST /auth/registro/comercio` (cada uno arma su propio cuerpo; `build-matriz-comercio` tiene 5 cuerpos, `build-multicomercio-tramo3a` 7, `E2` 4, `A2` 2 y `2a` 2); 6 de ellos (`build-multicomercio-tramo1`, `tramo8a`, `matriz-comercio-runner`, `stress-locks-tramo2a`, `tramoC3`, `tramoE3-A1`) no mencionan `aceptaTerminos` en absoluto. Los demás sí lo mencionan, pero para el Cliente.
- **Newman**: **172** requests `POST /auth/registro/comercio` y unas **61** de alta adicional (`POST /comercios`) en `postman/Bajonea-MVP.postman_collection.json`. Los cuerpos salen de los builders; hay que regenerar la colección (cuidado: `build-matriz-cliente-postman.mjs` calcula fechas con el día actual, ver nota en `CLAUDE.md`). Más un negativo nuevo "sin aceptaTerminos: 400".
- `datos-prueba/scripts/01-registrar-comercios*.mjs`, `01b-reintentar-fallidos*.mjs`, `seed-fase1-comercios.mjs`: cuerpos a actualizar (5 archivos).
- **Java: sin rotura.** Los tests de integración (`BloqueoComercioIntegrationTest`, `BloqueoVigenteIntegrationTest`, `CierreComercioIntegrationTest`, `DatosPruebaEmpleado`, `MercadoPagoCuentaUnicaIntegrationTest`, `NotificacionesPorComercioIntegrationTest`, `TokenColision*`) leen el JSON a `RegistroComercioRequestDTO` y llaman directo a `registroService.registrarComercio`, sin pasar por la validación de Bean Validation. Hay que agregar un test de DTO (campo `null`, `false`, `true`) y uno HTTP.
- Precedente: es la misma tarea que hizo el bloque A0 de E1 con el Cliente (`docs/entregables-01-02/AUDITORIA-E1.md`, sección 2, ~14 sitios). Mitigación: una sola pasada con búsqueda y reemplazo y regenerar con los builders; error típico, un cuerpo de Newman sin el campo.

### e) Concurrencia
Ninguna.

### f) Preguntas abiertas
- **Q9** ¿Los textos de `terminos.html`/`privacidad.html` los escribís vos o los redacto como borrador? Recomiendo un borrador corto y honesto sobre el alcance académico.
- **Q10** El checkbox del Cliente y el de la invitación hoy no enlazan nada: ¿se corrigen en este bloque (recomiendo sí, es la misma edición)?

---

## 6. Resumen de la migración propuesta

Todo en una sola migración **`V36`** salvo que prefieras separar riesgo (sección 7):

| Cambio | Riesgo con datos |
|---|---|
| `persona_juridica`: cuatro columnas a `NULL` (punto 1) | Nulo |
| `comercio.email` a `NULL` (punto 2) | Nulo |
| `INSERT` idempotente de Tolhuin (punto 3) | Nulo |
| `comercio.nombre_unico` generada + `UNIQUE` (punto 4) | **Falla si hay duplicados**; correr la consulta antes |

Recomiendo **`V36` para los tres primeros** y **`V37` solo para el índice único**, así una base con duplicados no bloquea la relajación de los datos legales.

---

## 7. Orden interno recomendado y agrupación en tramos A/B

**Dependencias.** 1, 2 y 5 tocan los mismos DTOs (`RegistroComercioRequestDTO`, `DatosNegocioComercioRequestDTO`, `DatosLegalesComercioRequestDTO`), los mismos formularios (`registro-comercio.html`, `agregar-comercio.html`, `comercio-corregir.html`, `comercio-form.js`) y los mismos cuerpos de test (helper, 41 scripts, 172+61 requests de Newman): conviene hacerlos en una sola pasada. 3 toca los mismos formularios (dirección) y es chico. 4 es el más delicado: cambia el significado de tests existentes y requiere limpiar datos antes, así que va **después** y con los nombres de los fixtures ya únicos.

**Propuesta: dos tramos.**

**Tramo 1: relajar y completar el registro (puntos 1, 2, 3 y 5)**
- Entrega A (backend y tests): `V36`; DTOs sin los obligatorios legales, sin `emailContacto`, con `aceptaTerminos`; filtro de geografía por lista y validación de localidad habilitada; actualizar todos los cuerpos de test (helper, scripts, builders, datos-prueba), regenerar Newman, tests Java de DTO y de geografía.
- Entrega B (frontend y UI): formularios (opcionales, sin email, con checkbox, provincia fija), `terminos.html` y `privacidad.html`, lectura tolerante a nulos, header del perfil, tests de UI.
- Dentro del tramo, orden: 5 (y la limpieza de cuerpos de test) → 1 → 2 → 3, porque el barrido de cuerpos de test sirve para los tres.

**Tramo 2: nombre único (punto 4)**
- Previo: ejecutar la consulta de duplicados en `bajonea_practicas3` (lo hacés vos) y probar la expresión de la columna en una base descartable.
- Entrega A: `V37`, validador global invocado desde registro, alta adicional, corrección y edición de perfil, traducción del `409`, tests Java, estrés nuevo, reescritura de los tests que cambian de significado (sección 4.d), sufijos únicos en los fixtures fijos.
- Entrega B: mensaje en las pantallas y en la edición del perfil, tests de UI.

Si querés reducirlo a un tramo, el punto 4 se puede incluir, pero concentra el riesgo en una sola entrega; no lo recomiendo.

---

## 8. Preguntas abiertas que necesitan decisión tuya (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| Q1 | ¿`condicion_iva` también opcional? | Sí |
| Q2 | ¿Nombre, apellido, fecha de nacimiento y teléfono del representante siguen obligatorios? | Sí |
| Q2b | ¿Se deja de exponer `razonSocial` en el DTO público? | Sí |
| Q3 | ¿Qué reemplaza al email en el header del perfil del Dueño? | El teléfono del comercio, o solo el nombre |
| Q3b | ¿`emailContacto` se saca de los DTOs o queda opcional? | Sacarlo de request y de los responses público y del Empleado; columna `NULL`-able |
| Q4 | ¿La restricción geográfica aplica también al registro de Cliente? | Sí |
| Q4b | ¿Se oculta el select de provincia? | Sí |
| Q4c | ¿Qué hacemos con direcciones existentes fuera de TDF (si la consulta devuelve filas)? | Dejarlas como están |
| Q5 | Texto del mensaje de nombre duplicado | "Ya existe un comercio con ese nombre. Elegí otro." |
| Q6 | ¿Se elimina el chequeo por dirección? | Sí, reemplazarlo |
| Q7 | ¿Se acepta que una cuenta sin verificar retenga un nombre? | Sí, como limitación conocida |
| Q8 | ¿Un comercio `RECHAZADO` retiene su nombre (hay que corregirlo, no re-registrarlo)? | Sí (es consecuencia de tu regla) |
| Q9 | ¿Los textos legales los redactás vos o va un borrador? | Borrador corto, vos lo ajustás |
| Q10 | ¿Los checkbox de Cliente e invitación pasan a tener enlaces reales? | Sí, en el mismo bloque |

---

## 9. Cobertura y límites de esta auditoría

- **Leí** (completos o por rangos) unos 55 archivos: `docs/AUDITORIA-ETAPA-FINAL.md` (puntos 1 a 10), `V1`, `V24`, `V26`, `V27`, `V16` archivada, `PersonaJuridica`, `Comercio` (campo email), `DatosLegalesComercioRequestDTO`, `RegistroComercioRequestDTO`, `DatosNegocioComercioRequestDTO`, `ComercioPerfilRequestDTO`, `RegistroService`, `ComercioService` (`editarPerfil`), `ComercioEdicionService`, `ComercioCorreccionService`, `AltaComercioAdicionalService`, `ValidadorComercioDuplicado`, `ValidadorDatosNegocioComercio`, `GeografiaService/Controller`, repositorios de geografía, `TextoUtils`, `GlobalExceptionHandler` (traducción de unique), `TestSupportService`, `registro-comercio.html`, `js/comercio-form.js`, `js/auth.js` (registro), `js/agregar-comercio.js`, `js/comercio-corregir.js`, `js/geografia.js`, `js/cliente-form.js` (términos y geografía), `comercio.js` (perfil), `admin.js` (legales), `helpers/backend.ts`, `reset-db.mjs`, seed de Georef, y `datos-prueba/scripts/*`. Más unas 40 búsquedas globales (`grep`) sobre backend, frontend, tests, scripts y la colección de Newman. Para Newman parseé el JSON de la colección y conté requests y nombres.
- **No pude verificar**: (1) que `REGEXP_REPLACE` funcione dentro de una columna generada `STORED` en MariaDB 10.4; (2) que `utf8mb4_unicode_ci` iguale `ñ` y `n` (lo afirmo por conocimiento de UCA, no por ejecución); (3) qué hay en `bajonea_practicas3`: duplicados de nombre, direcciones fuera de TDF, si ya tiene Tolhuin; (4) que no exista un `ObjectMapper` propio que falle con campos desconocidos (afecta a cuántos tests siguen mandando `emailContacto` sin romperse); (5) los negativos de `fechaInicioActividades` de la carpeta `34` de Newman (listé los de razón social, IVA y tipo de sociedad); (6) el detalle de `postman/limpiar-datos-postman.sql` respecto de nombres de comercio; (7) la versión real del servidor MariaDB (los docs dicen 10.4).
- **Discrepancias con el prompt**: las del punto 0 (tres DTOs que comparten el negocio, Tolhuin ausente, registro sin chequeo de duplicados, `condicion_iva` como otro campo obligatorio, header del perfil con el email, corrección a la afirmación de la ñ en la auditoría anterior). El resto del prompt coincide con lo que encontré.

---

## 10. Decisiones de Diego (2026-10-18) y lo que cambian en esta auditoría

| # | Decisión | Efecto sobre lo escrito arriba |
|---|---|---|
| Q1, Q2, Q2b | `condicion_iva` opcional; datos del representante obligatorios; `razonSocial` fuera del DTO público | Tal como se propuso en 1.b |
| Q3 | Header del perfil del Dueño: teléfono del comercio, y si viene vacío, solo el nombre | `comercio.js:2166` pasa a mostrar `comercio.telefono`; el testid `email-comercio-perfil` se renombra (afecta `38-empleado-acceso-ui.spec.ts:563`). `telefono` es `NOT NULL` en la base y obligatorio en el DTO, así que en la práctica siempre viene |
| Q3b | `emailContacto` fuera de los request y de los response público y del Empleado; columna `NULL`-able, sin borrarla | El response del Dueño y el del Administrador quedan a decidir (Q12). Hay que sacar la asignación de `ComercioService.editarPerfil:166` junto con el campo, o pisaría el dato con `null` |
| Q4, Q4b, Q4c | Restricción también en Cliente y alta por invitación; provincia fija y oculta; direcciones existentes intactas | Tal como se propuso en 3.b. El alta por invitación entra por `RegistroService.crearCliente` → `obtenerLocalidad`, así que el mismo punto de validación los cubre |
| Q5, Q6 | Mensaje "Ya existe un comercio con ese nombre. Elegí otro."; el chequeo por nombre global reemplaza al de dirección; más validación en tiempo real | Ver sección 11 |
| Q7, Q8 | Aceptado: una cuenta sin verificar retiene el nombre; un `RECHAZADO` retiene su nombre | Tal como se propuso en 4.f |
| Q9, Q10 | Textos legales provisorios ahora, definitivos al final; enlaces reales en los checkbox de Cliente, invitación y Comercio | Tal como se propuso en 5.b. Conviene que las páginas lleven una línea visible "texto provisorio" para no olvidar reemplazarlas |

### Geografía: qué se rechaza y cómo probarlo

`DireccionRequestDTO` no tiene campo de provincia: solo `localidadId`. La provincia se deduce de la localidad, así que "provincia distinta" se prueba con una localidad de otra provincia. Se rechaza en los cinco puntos que aceptan una localidad por id, todos pasan por `ValidadorDatosNegocioComercio.obtenerLocalidad`:

| Punto de entrada | Ruta | Campo del error |
|---|---|---|
| Registro de Cliente | `POST /auth/registro/cliente` | `direccion.localidadId` |
| Alta por invitación (cuenta nueva) | `POST /auth/invitaciones-empleado/aceptar` | `cuentaNueva.direccion.localidadId` |
| Registro de Comercio | `POST /auth/registro/comercio` | `direccion.localidadId` |
| Alta adicional | `POST /comercios` | `direccion.localidadId` |
| Corrección de un rechazado | `PUT /comercios/{id}/resolicitud` | `direccion.localidadId` |

Recomendación: que la localidad existente pero no habilitada devuelva `400` con el error por campo (`ValidacionCamposException`, ya existente, mapa `{campo: mensaje}`), así el frontend la muestra bajo el select, que ya mapea `direccion.localidadId` a `error-localidad` (`cliente-form.js:52`, `comercio-form.js:119`). Una localidad que no existe sigue dando `404`.

Negativos de Postman (carpeta nueva con un builder nuevo; ids reales del seed): una localidad de **otra provincia** (`02014010` Ciudad de Buenos Aires), una localidad de **Tierra del Fuego no habilitada** (`94015010` Laguna Escondida, `94021010` Puerto Argentino) y un id **inexistente** (`99999999`), cada una en los cinco puntos de entrada (15 requests); los positivos de las tres localidades habilitadas en registro de Cliente y de Comercio (6 requests); y los listados: `GET /geografia/provincias` devuelve solo `94`, `GET /geografia/localidades?provinciaId=94` devuelve exactamente Río Grande, Ushuaia y Tolhuin, `provinciaId=02` e inexistente devuelven lista vacía (4 requests). Misma cobertura en Playwright (API) y en Java (`ValidadorDatosNegocioComercio` y `GeografiaService`). Las direcciones ya existentes fuera de la lista no se tocan y siguen apareciendo en pedidos y perfiles.

### Preguntas nuevas que surgen de estas respuestas

| # | Pregunta | Recomendación |
|---|---|---|
| Q11 | Si alguna base ya tiene Tolhuin con el id `940021` y direcciones que lo usan, ¿la `V36` las reapunta a `94011010`? | Sí, pero solo si la cuarta consulta de 3.e devuelve filas; si devuelve cero, no incluir la sentencia |
| Q12 | ¿El response del Dueño conserva `emailContacto` o también se saca? | Sacarlo; solo el Administrador lo ve (de solo lectura, para los comercios viejos) |

---

## 11. Validación en tiempo real de la disponibilidad del nombre de comercio (Tramo 2)

### a) Cómo está hecha hoy la del nombre de usuario

| Pieza | Dónde | Qué hace |
|---|---|---|
| Endpoint | `AuthController:54` `GET /api/v1/auth/nombre-usuario/disponibilidad?nombreUsuario=` | Público. Llama a `RegistroService.consultarDisponibilidadNombreUsuario` |
| Servicio | `RegistroService:255-263` | Normaliza (`NombreUsuarioPolicy.normalizar`), valida formato (si es inválido lanza `ValidacionException` y sale `400` con el mensaje) y responde `disponible = !esReservado && !existsByNombreUsuario` |
| Respuesta | `DisponibilidadNombreUsuarioResponseDTO` | Un solo booleano `disponible`. No dice de quién es ni por qué no está disponible (un reservado y uno en uso responden igual) |
| Seguridad | `SecurityConfig:96`, en `RUTAS_PUBLICAS` por ruta exacta | Sin JWT |
| Rate limit | **No tiene.** `RateLimitPublicoFilter` solo limita las firmas de foto (5/min) y las invitaciones (10/min) por IP; este endpoint no está en `GRUPO_POR_RUTA`. Figura como pendiente en `CLAUDE.md` (sección 9) |
| Frontend | `js/form-utils.js:116-235`, `bindNombreUsuario({ inputId, valorOriginal })` | **No hay debounce**: consulta en el `blur`, no en cada tecla. Un contador de secuencia (`secuencia`) descarta respuestas viejas y cualquier `input` reinicia el estado. Estados `inactivo`, `verificando`, `disponible` y `ocupado`, con ícono (`icono-<id>`) y texto (`estado-<id>`). Si el valor es igual al original (edición del perfil) no consulta. `validarParaContinuar()` espera la consulta pendiente y no deja avanzar si está ocupado |
| El servidor sigue validando | `RegistroService.validarNombreUsuarioDisponible` (`409`) y el `UNIQUE` `uq_usuario_nombre_usuario` | El front mapea ese `409` (`MENSAJE_NOMBRE_USUARIO_EN_USO`) con `marcarEnUso()` (`auth.js:392`) |
| Plantilla | `registro-comercio.html:288-291` | `icono-nombreUsuario` y `estado-nombreUsuario`, con testids `icono-estado-nombre-usuario` y `estado-nombre-usuario` |
| Tests | Playwright `19-nombre-usuario.spec.ts` (API `:135-218`, UI `:294-381` y `:465-487`, con `page.route` para forzar la lentitud); Newman carpetas `46` (9 requests) y `47` (1); **ningún test Java del endpoint** (`NombreUsuarioTest` prueba solo la política) | Cubre libre, ocupado, otra capitalización, reservado, formato inválido, sin autenticación, solo booleano, "Verificando…", ícono con 4 estados y bloqueo de avance |

### b) Patrón propuesto para el nombre de comercio

**Contexto de uso.** El nombre se escribe en cuatro pantallas: registro (sin sesión, `registro-comercio.html`, paso 1), alta adicional (`agregar-comercio.html`, paso 1), corrección (`comercio-corregir.html`, excluyendo el propio comercio) y edición del perfil (`comercio-perfil.html`, campo `editar-nombre`, excluyendo el comercio activo).

**Dos endpoints finos sobre un solo servicio** (`NombreComercioService.estaDisponible(nombre, excluirComercioId)`), porque el de registro no tiene sesión y el resto sí, y `/api/v1/comercios/**` está cerrado al rol `DUENO`:

| Endpoint | Quién | Seguridad |
|---|---|---|
| `GET /api/v1/auth/comercio-nombre/disponibilidad?nombre=` | Registro (sin sesión) | Se suma a `RUTAS_PUBLICAS` por ruta exacta y a `GRUPO_POR_RUTA` del rate limit |
| `GET /api/v1/comercios/nombre/disponibilidad?nombre=&comercioId=` | Alta adicional, corrección y perfil del Dueño | Matcher exacto `hasRole("DUENO")`, **no delegable** al Empleado: hay que clasificarlo en `ClasificacionRutasComercioTest` y no sumarlo a `DelegacionEmpleado`. Ignora `X-Comercio-Id` |

El segundo recibe `comercioId` opcional, que **se valida contra el Dueño autenticado** (`comercioRepository.findByIdAndDuenoId`); si no es suyo, el mismo `404` "Comercio no encontrado" que el resto. Sin esa validación, un Dueño podría pasar el id de cualquier comercio y descubrir su nombre (la exclusión lo haría aparecer como "disponible"). Para el alta adicional no se manda `comercioId`; para corrección y perfil sí.

**Qué filtra la respuesta.** Un único booleano `{ "disponible": true | false }`, como el de usuario. No incluye estado, dueño, id ni motivo, y no distingue "tomado por un comercio `PENDIENTE`" de "tomado por uno `APROBADO`". Los `RECHAZO_DEFINITIVO` no cuentan (quedan `NULL` en la columna generada), así que responden "disponible". Limitación inevitable: cualquiera puede preguntar si un nombre está tomado. Hoy el catálogo ya publica los nombres de los aprobados; lo que se revela de más son los nombres de comercios `PENDIENTE`, `RECHAZADO` o `SUSPENDIDO`. Se mitiga con rate limit y se acepta como costo del requisito (Q14).

**Una sola fuente de verdad.** El servicio compara con la **misma expresión SQL** que la columna generada (`nombre_unico = TRIM(REGEXP_REPLACE(:nombre, '[[:space:]]+', ' '))`, más `id <> :excluir` cuando corresponde), la misma que usan el chequeo del registro, el de la edición y el `UNIQUE`. Así el aviso en vivo, el `409` del envío y la red de seguridad de la base no pueden discrepar, incluida la `ñ`. El formato (`@NotBlank`, solo caracteres especiales, 150 máximo) se valida igual que en `DatosNegocioComercioRequestDTO` y se responde `400` con el mensaje, como en el endpoint de usuario.

**Rate limit.** Nuevo grupo `nombre-comercio` en `RateLimitPublicoFilter` (propiedad `app.rate-limit.nombre-comercio-por-minuto`, por ejemplo 30 por minuto y por IP: con consulta en `blur`, un registro normal hace unas pocas llamadas). Solo el endpoint público lo necesita (el otro exige JWT de Dueño). `application-test.properties` lo sube a 1000, como los otros dos grupos (`:8` y `:12`). De paso, el endpoint de nombre de usuario podría entrar en el mismo mecanismo y cerrar el pendiente de `CLAUDE.md` (Q15).

**Frontend.**
- Generalizar `bindNombreUsuario` (hoy atado al endpoint, a las minúsculas y a los textos de usuario) a un `bindDisponibilidad({ inputId, endpoint, textos, normalizar, valorOriginal, extraQuery })`, y que `bindNombreUsuario` quede como una llamada con sus parámetros.
- Dispara en `blur`, igual que el de usuario (sin debounce; por eso las consultas son pocas), con el mismo contador de secuencia contra respuestas viejas.
- `normalizar` solo recorta y colapsa espacios (no pasa a minúsculas: el nombre se guarda en Title Case).
- Textos: "Verificando…", "Nombre disponible" y "Ya existe un comercio con ese nombre. Elegí otro."; ids `estado-nombre` e `icono-nombre`; testids `estado-nombre-comercio` e `icono-estado-nombre-comercio`.
- `valorOriginal` en corrección y perfil (no consulta si no cambió), además de la exclusión por `comercioId` en el servidor para las variantes de mayúsculas.
- `validarParaContinuar()` bloquea el avance si está ocupado. **Costo:** `initCamposNegocio().validar()` hoy es síncrono; pasa a ser asíncrono y hay que actualizar a sus llamadores (`auth.js`, `agregar-comercio.js`, `comercio-corregir.js`) y el guardado del perfil.
- El `409` del envío se mapea al campo y se vuelve al paso 1, como `marcarEnUso()`; reemplaza al `PREFIJO_MENSAJE_DUPLICADO` de `comercio-corregir.js:25`. En el alta adicional hoy el mensaje sale en un banner y pasa al campo.
- El servidor sigue validando siempre en el envío (registro, alta adicional, corrección y edición del perfil).

### c) Impacto en tests (se suma al de la sección 4.d)
- Playwright, API (spec nuevo): libre, ocupado, otra capitalización, sin tildes, espacios de más, **ñ contra n**, `RECHAZADO` retiene, `RECHAZO_DEFINITIVO` libera, formato inválido y vacío `400`, la respuesta trae solo `disponible`, sin token en el endpoint del Dueño `401`, rol Cliente sin relación y Administrador rechazados, Empleado sin acceso (no delegable), `comercioId` ajeno `404`, exclusión del propio comercio, y `429` al pasar el límite (en un test acotado con la propiedad en un valor chico).
- Playwright, UI: "Verificando…", disponible y ocupado, ícono de 4 estados, bloqueo de avance en registro, alta adicional, corrección y perfil, valor original sin consulta (corrección y perfil), y carrera (`page.route` que devuelve disponible y el envío da `409`).
- Specs existentes afectados: los que llenan el paso 1 con `fill` y siguen al paso 2 (`01`, `13`, `19`, `23`, `25`) disparan ahora una consulta en el `blur`; con nombres únicos el resultado no cambia, pero el avance puede quedar esperando la respuesta (ya lo maneja `validarParaContinuar`).
- Newman: carpeta nueva de unas 14 requests (los dos endpoints: libre, ocupado, capitalización, ñ, formato, 401, 403, 404 de `comercioId` ajeno y exclusión). Va después del builder del nombre único.
- Java: tests del servicio (la expresión contra la columna generada, exclusión, `RECHAZO_DEFINITIVO`), del controller y de seguridad (rutas clasificadas). Hoy el endpoint de usuario no tiene tests Java; conviene dejar cubiertos los dos.
- Estrés: no toma locks (lectura simple); un escenario que lo ejecute en paralelo con registros del mismo nombre confirma que nunca responde un `5xx`.
- `docs/DATA-TESTID-FASE17.md` suma los testids nuevos.

### d) Preguntas abiertas
| # | Pregunta | Recomendación |
|---|---|---|
| Q14 | El endpoint público permite saber si un nombre está tomado por un comercio no aprobado (pendiente, rechazado, suspendido). ¿Se acepta? | Sí, es el costo del requisito; sin ningún otro dato en la respuesta y con rate limit |
| Q15 | ¿Se agrega el endpoint de nombre de usuario al rate limit en el mismo tramo? | Sí: es una línea en `GRUPO_POR_RUTA` y cierra el pendiente de `CLAUDE.md` |
| Q16 | ¿Se dispara en `blur`, como el de usuario, o también con debounce mientras se tipea? | `blur`: menos carga y un patrón consistente |

---

## 12. Ajuste al orden de los tramos

- **Tramo 1** (puntos 1, 2, 3 y 5): sin cambios de fondo, con el id de Tolhuin `94011010` y los negativos de geografía de la sección 10.
- **Tramo 2** (punto 4 más la sección 11): `V37` con la columna generada, validador global, edición del perfil, endpoints de disponibilidad con su rate limit, generalización de `bindNombreUsuario` y tests. Orden dentro del tramo: primero el nombre único en el servidor (la disponibilidad depende de la columna generada), después los endpoints, después el frontend.
- **Previo al Tramo 2**: la consulta de duplicados de 4.c en `bajonea_practicas3` y la prueba de la expresión de la columna (y de `ñ` contra `n`) en una base descartable.

## 13. Cobertura de esta ampliación

Leí `AuthController`, `RegistroService` (disponibilidad), `DisponibilidadNombreUsuarioResponseDTO`, `RateLimitPublicoFilter`, `SecurityConfig` (rutas públicas), `form-utils.js` (`bindNombreUsuario`), `application-test.properties`, los nombres de tests del spec `19-nombre-usuario` y la colección de Newman (carpetas `46` y `47`). Para Tolhuin consulté la API de Georef en vivo (`/localidades`, `/municipios`, `/localidades-censales` y `/asentamientos` de la provincia `94`): son lecturas de una API pública, sin escribir nada. **No verifiqué** el comportamiento en ejecución de ninguna pieza (no se corrió nada) ni qué contiene `bajonea_practicas3`.

---

## 14. Datos de `bajonea_practicas3` y script de saneamiento

**Decisiones de Diego (2026-10-18)**: Q11, no incluir el reapuntado de `940021` (`practicas3` no tiene Tolhuin ni direcciones con ese id; la `V36` solo inserta `94011010`); Q12 a Q16 confirmadas con las recomendaciones de las secciones 10 y 11.

**Datos reales informados por Diego** (todos son de prueba, se pueden modificar):
- Duplicado de nombre: "Multicomercio", ids 41 y 42, ambos `APROBADO`, mismo Dueño (260). Hay que dejarlos con nombres distintos antes del índice único (`V37`).
- 6 direcciones fuera de la lista: Laguna Escondida (`94015010`: 1 de cliente y 3 de comercio) y Puerto Argentino (`94021010`: 1 de cliente y 1 de comercio). Se pasan a Río Grande (`94008010`).

**Script**: [docs/db/saneamiento-practicas3-fase1-registro.sql](docs/db/saneamiento-practicas3-fase1-registro.sql). Está en `docs/db/`, junto a los otros scripts manuales del proyecto (`datos-prueba/` queda fuera de las carpetas donde el hook del proyecto permite escribir). No es una migración y no lo toma Flyway. Lo corrés a mano en phpMyAdmin sobre `bajonea_practicas3`, **antes** de `V36` y `V37`. No lo ejecuté.

| Bloque | Qué hace |
|---|---|
| 1. Informe ANTES | Una sola tabla (columnas `etapa`, `chequeo`, `detalle`, `cantidad`): cada comercio llamado `Multicomercio*` con su estado, Dueño, **cantidad de productos y de pedidos** (solo informativo); los grupos de nombre duplicado con la misma expresión del índice único; cada dirección fuera de Río Grande, Ushuaia y Tolhuin (con su cliente o comercio, código postal y cuántos pedidos la usan); el total; y si existe la localidad de destino |
| 2. Renombre | En una transacción: el comercio de **id mayor** entre los que se llaman `Multicomercio` pasa a `Multicomercio 2`. Solo si hay exactamente dos y ninguno llamado `Multicomercio 2` |
| 3. Direcciones | `UPDATE direccion SET localidad_id = '94008010'` para las filas en `94015010` o `94021010`. Solo toca `direccion` (`localidad_id` y `fecha_modificacion`). El código postal no se toca; hay una línea opcional comentada para ponerlo en `9420` |
| 4. Informe DESPUÉS | Las mismas consultas. Resultado esperado: el duplicado desaparece, "Total de direcciones fuera de la lista" da 0, y `Multicomercio` y `Multicomercio 2` aparecen con sus productos y pedidos intactos |

**Idempotencia**: el renombre no actúa si no hay exactamente dos comercios con el nombre (después de la primera corrida queda uno), y con tres o más no toca nada; el pasaje de direcciones solo alcanza filas que sigan en las dos localidades de origen.

**Para tener en cuenta al correrlo**:
- Los pedidos que usan esas direcciones pasan a mostrar Río Grande como localidad. Son datos de prueba, pero el informe ANTES muestra cuántos son.
- Lo corrí mentalmente contra el esquema (`V1`), no contra una base: **no verifiqué** que las consultas se ejecuten sin error en tu MariaDB. Los puntos de riesgo son `REGEXP_REPLACE` (existe desde MariaDB 10.0.5) y la mezcla de colaciones en los `UNION ALL` si tu conexión de phpMyAdmin no usa `utf8mb4_unicode_ci`; si diera "Illegal mix of collations", se resuelve agregando `COLLATE utf8mb4_unicode_ci` al literal que se indique.
- Si el informe ANTES muestra otras direcciones fuera de la lista (otras provincias), el script **no las toca**: quedan listadas también en el DESPUÉS.
- Esta saneación no cubre los duplicados que pudieran aparecer entre nombres que difieran solo en `ñ` o acentos: el informe usa la misma comparación que el índice (colación `utf8mb4_unicode_ci`), así que los detecta; el "Grupos con nombre de comercio duplicado" del DESPUÉS tiene que dar `ninguno`.

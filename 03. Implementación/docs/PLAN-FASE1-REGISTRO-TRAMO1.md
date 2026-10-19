# Plan del Tramo 1: relajar y completar el registro de Comercio (2026-10-18)

Plan de trabajo, sin código todavía. Sale de `docs/AUDITORIA-FASE1-REGISTRO.md` (referencias "aud. N" = sección N de ese documento) y de las decisiones de Diego del 2026-10-18 (Q1 a Q16). Cubre los puntos 1 (persona jurídica simplificada), 2 (email del comercio), 3 (geografía) y 5 (Términos y Condiciones). El punto 4 (nombre único) y la disponibilidad en vivo del nombre son el **Tramo 2** y no entran acá.

Convención del proyecto: cada tramo tiene entrega A (backend y tests) y entrega B (pantallas y tests de UI), checklist de cierre y un commit solo cuando Diego confirma.

---

## 0. Decisiones fijadas que mandan en este tramo

| Tema | Decisión |
|---|---|
| Persona jurídica | `razon_social`, `tipo_sociedad`, `fecha_inicio_actividades` y `condicion_iva` pasan a opcionales en base y DTOs. CUIT y domicilio fiscal siguen obligatorios. Los datos del representante (nombre, apellido, DNI, fecha de nacimiento, teléfono) siguen obligatorios. `razonSocial` deja de exponerse en `ComercioPublicoResponseDTO`. Los comercios ya registrados no se tocan |
| Email del comercio | `comercio.email` pasa a `NULL`-able (sin borrar la columna). `emailContacto` sale de los request y de los response público, del Empleado y del Dueño; solo `ComercioAdminResponseDTO` lo conserva (de solo lectura, para los comercios viejos). Header del perfil del Dueño: teléfono del comercio; si viene vacío, solo el nombre |
| Geografía | Solo la provincia Tierra del Fuego (`94`) y las localidades Río Grande `94008010`, Ushuaia `94015020` y Tolhuin `94011010` (id oficial verificado contra Georef, aud. 3.c). Lista fija en configuración, sin borrar filas. Aplica a registro de Cliente, alta por invitación, registro de Comercio, alta adicional y corrección. Provincia fija y oculta en las pantallas. Direcciones existentes intactas |
| Términos | `aceptaTerminos` obligatorio (`@NotNull` + `@AssertTrue`, no se guarda) en `RegistroComercioRequestDTO` y `AltaComercioAdicionalRequestDTO`; **no** en la superclase `DatosNegocioComercioRequestDTO` (la comparte la corrección, que no lo pide). `terminos.html` y `privacidad.html` con texto provisorio; enlaces reales en los checkbox de Cliente, invitación y Comercio |
| Migración | Una sola, `V36`: cuatro columnas de `persona_juridica` a `NULL`, `comercio.email` a `NULL`, `INSERT` idempotente de Tolhuin. Sin reapuntado de `940021` |

**Prerrequisito de Diego.** El script `docs/db/saneamiento-practicas3-fase1-registro.sql` es necesario para la `V37` del Tramo 2 (índice único), **no para este tramo**: `V36` no depende de él. Conviene correrlo igual antes de arrancar, para probar contra una base ya limpia.

---

## 1. Entrega A: backend y tests

### A1. Migración `V36` y entidades

- Archivo `backend/src/main/resources/db/migration/V36__registro_comercio_campos_opcionales_y_tolhuin.sql`: los `MODIFY COLUMN` de `persona_juridica` (los dos ENUM copiados exactos del baseline, aud. 1.c), `comercio.email varchar(150) NULL`, y el `INSERT ... ON DUPLICATE KEY UPDATE` de Tolhuin `94011010`.
- `entities/PersonaJuridica.java`: sacar `nullable = false` de los cuatro campos. `entities/Comercio.java:62`: sacar `nullable = false` de `email`.
- Aplicar a `bajonea_test` con `scripts/reset-db.mjs` (Flyway corre `V36` después del seed de Georef, así que Tolhuin se inserta). En `practicas3` la aplica Flyway cuando Diego arranca su backend.
- Pruebas: test de integración que persiste una `PersonaJuridica` solo con CUIT y domicilio fiscal y un `Comercio` sin email, y que `localidad` `94011010` existe tras la migración.
- Hecho cuando: `mvnw test` arranca limpio con `ddl-auto=validate` y la migración aplica sobre una base reseteada.

### A2. DTOs y servicios: campos legales y email

- `RegistroComercioRequestDTO` y `DatosLegalesComercioRequestDTO`: quitar `@NotBlank`/`@NotNull` de razón social, tipo de sociedad, condición IVA y fecha de inicio; setters que convierten vacío o blanco en `null` (razón social). Los dos DTOs siguen duplicando campos: no se extrae una base común porque `RegistroComercioRequestDTO` ya extiende `DatosNegocioComercioRequestDTO` (herencia simple); se mantienen en paralelo con las mismas anotaciones.
- `DatosNegocioComercioRequestDTO` y `ComercioPerfilRequestDTO`: quitar `emailContacto`.
- Servicios: `RegistroService.crearComercio:200` (sin `.email(...)`), `ComercioService.editarPerfil:156-166` (sin la comparación ni la asignación del email, y sin el texto "email de contacto" en los campos cambiados), `ComercioEdicionService.actualizarDatosBasicos` (firma sin email) y su llamador `ComercioCorreccionService:~160`, `ComercioCorreccionService:120` y los DTOs de corrección.
- Responses: quitar `emailContacto` de `ComercioResponseDTO`, `ComercioPublicoResponseDTO` (y `razonSocial`), `ComercioEmpleadoResponseDTO` y `CorreccionComercioResponseDTO`; construcción en `ComercioService:91,377,420,428` y `ComercioCorreccionService:120`. `ComercioAdminResponseDTO` conserva `emailContacto` (nullable) en `AdministradorService:385`.
- `CampoCambioComercio.EMAIL_CONTACTO` queda en el enum (hay filas históricas). `TestSupportService.clonarComercio` sigue copiando `email` (nullable).
- Pruebas: tests del DTO (con y sin los cuatro opcionales, con valores inválidos si vienen), `ComercioEdicionServiceTest` (corrección que borra un valor opcional registra `valor_nuevo` nulo), `ComercioServiceTest` (el perfil se edita sin tocar el email), `EscriturasEmpleadoHttpIntegrationTest:120` (sin `emailContacto` en el perfil del Empleado).

### A3. Geografía en el backend

- Propiedad `geografia.localidades-habilitadas` con los tres ids **como valor por defecto en el `@Value`**, para no editar `application.properties` (tiene cambios locales de Diego sin commitear). El perfil de test no necesita override.
- `GeografiaService`: `listarLocalidadesPorProvincia` filtra por la lista (provincia sin localidades habilitadas devuelve lista vacía); `listarProvincias` devuelve solo las provincias con al menos una localidad habilitada (queda `94`).
- `ValidadorDatosNegocioComercio.obtenerLocalidad`: localidad existente pero no habilitada, `400` con el error por campo `direccion.localidadId` y el mensaje "Esa localidad todavía no está disponible"; inexistente sigue `404`. Cubre los cinco puntos de entrada (aud. 10). Detalle a resolver al implementar: el prefijo `cuentaNueva.` del alta por invitación; ver cómo `InvitacionEmpleadoService` ya prefija otros errores de `crearCliente` (por ejemplo DNI duplicado) y repetir ese mecanismo.
- Pruebas: `GeografiaServiceTest` y `ValidadorDatosNegocioComercioTest` (habilitada, existente fuera de la lista en otra provincia y en la misma, inexistente); integración de los cinco puntos de entrada con localidad fuera de lista.

### A4. `aceptaTerminos` en los DTOs de Comercio

- `Boolean aceptaTerminos` con `@NotNull` y `@AssertTrue` (mensaje "Tenés que aceptar los Términos y Condiciones") en `RegistroComercioRequestDTO` y `AltaComercioAdicionalRequestDTO`, más el setter. No va en `DatosNegocioComercioRequestDTO` ni en `ReSolicitudComercioRequestDTO`.
- Pruebas: test de DTO (`null`, `false`, `true`) para los dos; test HTTP del registro; y un test de que `ReSolicitudComercioRequestDTO` **no** lo exige. Los tests Java de integración existentes arman el DTO desde JSON y llaman directo al servicio, sin Bean Validation: no se rompen (aud. 5.d).

### A5. Barrido de los cuerpos de prueba (lo más mecánico del tramo)

Con el campo obligatorio, todo cuerpo que registra un comercio sin `aceptaTerminos` pasa a dar `400`; además se saca `emailContacto` y se pueden dejar de mandar los opcionales. Un codemod puntual en `testing/playwright/scripts/` (se borra al terminar) o ediciones a mano, y una verificación por `grep` de que **ningún** cuerpo de `registro/comercio` ni de `POST /comercios` queda sin el campo:
- `tests/helpers/backend.ts`: `registrarComercio` (`:319-370`) y `payloadAltaAdicional` (`:709-735`); `tests/helpers/multicomercio.ts:142`.
- Specs con cuerpo propio: `18-configuracion-tarifas.spec.ts:62`, `35-empleado-invitacion-api.spec.ts:1107-1108`.
- Los **41** scripts de `testing/playwright/scripts` que registran comercios (builders y estreses), y los de `datos-prueba/scripts` (`01-registrar-comercios*.mjs`, `01b-reintentar-fallidos*.mjs`, `seed-fase1-comercios.mjs`, `datos-fase1.mjs`, `datos-fase2.mjs`).
- Regenerar `postman/Bajonea-MVP.postman_collection.json` con los builders en el orden documentado (172 requests de registro y unas 61 de alta adicional). Cuidado conocido: `build-matriz-cliente-postman.mjs` calcula fechas con el día actual.
- Newman, expectativas a invertir en `build-matriz-comercio-postman.mjs` y `build-multicomercio-tramo2a-postman.mjs`: carpeta `33` ("emailContacto vacio", "sin arroba", "sin dominio"), carpeta `34` ("razonSocial vacia", "tipoSociedad vacio", "condicionIva vacio" y los de fecha de inicio que aparezcan al regenerar) y carpeta `50` ("sin email de contacto", "formato invalido"): pasan de 400 a aceptar o se eliminan.

### A6. Pruebas nuevas de la entrega A

- Playwright API, spec nuevo `63-registro-comercio-fase1-api.spec.ts`: registro sin los cuatro opcionales (201); con valores inválidos si vienen (400); sin `aceptaTerminos`, `false` y `true`; alta adicional con y sin términos; corrección sin pedir términos; las respuestas pública, del Empleado y del Dueño sin `emailContacto`; la pública sin `razonSocial`; el del Administrador con `emailContacto` nulo en un comercio nuevo.
- Playwright API, geografía (mismo spec o uno aparte): provincias solo `94`; localidades de `94` exactamente tres; otra provincia lista vacía; los negativos de los cinco puntos de entrada con `02014010`, `94015010`, `94021010` y `99999999`; los positivos con las tres habilitadas.
- Newman: un builder nuevo `build-registro-comercio-fase1-postman.mjs` (siguiente carpeta libre; la última conocida es la `69`), con los positivos y negativos anteriores (unos 40 requests: 15 de localidad fuera de lista, 6 positivos, 4 de listados, y los de términos y opcionales). Va último en el orden de los builders.
- Mutaciones, según la costumbre del proyecto ("las pruebas muerden"): quitar el filtro de geografía, el `@AssertTrue` y la relajación de un opcional, y verificar que el test correspondiente falla.

### A7. Verificación de la entrega A

- `mvnw test` (en las dos pasadas que usa el proyecto), Newman completo desde base reseteada, Playwright de API, y el runner de estreses **completo una vez**: no hay locks nuevos ni estrés nuevo, pero los estreses registran comercios y tienen que seguir pasando con el cuerpo nuevo. Esperado: sin `Deadlock found` ni `Lock wait timeout`.
- Entregables: lista de archivos tocados y evidencia por punto.

---

## 2. Entrega B: pantallas y tests de UI

### B1. Registro de Comercio (`registro-comercio.html`, `js/comercio-form.js`, `js/auth.js`)

- Paso 1 (negocio): quitar el campo `emailContacto` y su validación en `initCamposNegocio` (`:107-112,323,339,370,379,404`), y de `CAMPOS_BACKEND_NEGOCIO`.
- Paso 2 (legales): razón social, fecha de inicio, tipo de sociedad y condición IVA con "(opcional)", sin `required`; `initDatosLegales` valida solo si hay valor; `leerPayload` manda `null` si están vacíos; `precargar` y `snapshot` tolerantes a vacío.
- Paso 4: checkbox de Términos (componente compartido, ver B5) que bloquea el envío; `aceptaTerminos` en el payload de `auth.js:~375`; mapa de errores para llevar al paso 4 si el servidor lo rechaza.

### B2. Alta adicional y corrección (`agregar-comercio.*`, `comercio-corregir.*`)

- Sin `emailContacto`. Alta adicional: checkbox de Términos en el último paso y `aceptaTerminos` en el payload (`agregar-comercio.js:~190`). Corrección: legales opcionales, **sin** Términos, `precargar` tolerante a `null`.

### B3. Perfil y lecturas del comercio

- `comercio-perfil.html` y `comercio.js`: sacar el campo de edición `editar-emailContacto` (`:2190,2318-2359`); header `perfil-email` pasa a mostrar el teléfono del comercio (o solo el nombre si viene vacío) con testid nuevo; `legal-*` muestran un guion si son `null` y `formatearFechaLarga(null)` deja de devolver "Invalid Date" (`comercio.js:2180`); sacar el campo bloqueado del email del Empleado (`comercio-perfil.html:267`, `comercio.js:2017`).
- Administrador (`admin.js`): `detailRow` y las comparaciones de re-solicitud (`:560,569-570,2041-2079`) toleran `null`; "Email de contacto" se muestra solo si viene.

### B4. Geografía en las pantallas

- `js/geografia.js`: con un solo resultado, selecciona la provincia y oculta su campo; la localidad queda con tres opciones. Aplica en `cliente-form.js:422` (registro de Cliente e invitación), `comercio-form.js:315` (registro, alta adicional y corrección) y la precarga de la corrección. El error `direccion.localidadId` se muestra bajo el select (ya mapeado a `error-localidad`).

### B5. Términos y Condiciones y Privacidad

- `terminos.html` y `privacidad.html`: texto provisorio con una línea visible que lo diga ("Texto provisorio, se reemplaza por la versión definitiva al final del proyecto"); estructura de `<head>` copiada de una página existente, sin comentarios, sin `#` en las URLs (reglas del proyecto y de la skill de páginas web).
- Un componente compartido `crearCheckboxTerminos` en `js/form-utils.js` (usa el constructor `h` ya existente) con "Acepto los Términos y Condiciones y la Política de Privacidad" como **enlaces reales** (`target="_blank"`, `rel="noopener"`), testid `input-acepta-terminos`. Lo usan `cliente-form.js:195-198` (hoy `span.link` sin destino; cubre también la invitación) y los registros de Comercio (B1 y B2).

### B6. Pruebas de UI

- Specs existentes a actualizar: `01-registro-y-verificacion` (`:167-190,337-368,443-455`: sin `input-email-contacto`, con checkbox), `13-registro-comercio-wizard` (todo el wizard; `:133-134` deja de esperar "La razón social es obligatoria"), `19-nombre-usuario` (`:434-449`), `23-multicomercio-tramo2b-alta-adicional-ui` (`:118,316`), `25-multicomercio-tramo3b-correccion-rechazados-ui` (legales opcionales; sin el email), `38-empleado-acceso-ui` (`:563`, testid del header), `53-empleado-edicion-ui` (`:137,264`, ya no hay email), y los que seleccionan provincia por testid (`select-provincia`) en Cliente y Comercio.
- Spec nuevo `64-registro-comercio-fase1-ui.spec.ts`: legales opcionales (se puede registrar sin ellos), el checkbox bloquea el envío y sus enlaces abren `terminos.html` y `privacidad.html`, los mismos enlaces en Cliente e invitación, provincia oculta y tres localidades, header del perfil con teléfono, `terminos.html` y `privacidad.html` cargan con la línea de texto provisorio, sin scroll horizontal a 375 px.
- Actualizar `docs/DATA-TESTID-FASE17.md` (testids nuevos y los que desaparecen: `input-email-contacto`, `mensaje-error-email-contacto`, `campo-bloqueado-email`, `email-comercio-perfil`).

### B7. Cierre del tramo

- Documentación: `CLAUDE.md` (§1bis, §5bis, §6), `docs/DECISIONES.md` (una entrada por decisión), `docs/diccionario-de-datos.md` (columnas opcionales y Tolhuin), `docs/entregables-01-02/requisitos-funcionales-comercio.md`, `-dueño.md` y las historias de usuario del Dueño y del Comercio, `docs/entregables-01-02/CAMBIOS.md`, `docs/LISTA-DE-DESPLIEGUE.md` (Tolhuin entra por migración, no por el ETL; textos legales provisorios por reemplazar), y `docs/MAPEO-ARCHIVOS-TRAMO-REGISTRO-1.md` (mapeo de archivos tocados).
- Regresión completa: `mvnw test`, Newman, Playwright completo (se conocen los inestables `01:101` y `27:497`), estreses.
- Checklist para Diego con evidencia por punto. **Sin commit hasta su confirmación.**

---

## 3. Orden de trabajo y dependencias

1. A1 (migración y entidades) → A2 (DTOs y servicios) → A3 (geografía) → A4 (términos): el servidor queda completo, con sus tests Java.
2. A5 (barrido de cuerpos de prueba) **justo después de A4**: es lo que vuelve a poner en verde Playwright, Newman y estreses; no se avanza a las pantallas con la suite rota.
3. A6 y A7 (pruebas nuevas y verificación de A). **Punto de corte**: entrega A completa, informe a Diego.
4. B5 (componente de términos y páginas legales) antes de B1 y B2, que lo usan. Después B1 → B2 → B3 → B4 → B6 → B7.

## 4. Riesgos y puntos de atención

| Riesgo | Cómo se maneja |
|---|---|
| El barrido de cuerpos toca 41 scripts, el helper y unas 233 requests de Newman | Verificación por `grep` de que ningún cuerpo queda sin `aceptaTerminos`; regenerar la colección con los builders y no editar el JSON |
| Un `MODIFY` de ENUM con un valor omitido trunca o rechaza filas | Copiar las listas exactas del baseline (`V1:395-396`) y probar `V36` en `bajonea_test` antes de `practicas3` |
| `emailContacto` se lee en una pantalla que me falte | La búsqueda de la auditoría lista todas (aud. 2.a); la regresión de Playwright y la revisión de la consola del navegador lo confirman |
| `PUT /comercios/perfil` pisa el email con `null` si se saca el campo sin sacar la asignación | Se quitan juntos en A2 y hay test de que el perfil se edita sin tocar el dato |
| `bajonea_test` sin Tolhuin hasta aplicar `V36` | `reset-db.mjs` aplica Flyway al final: queda cubierto; los tests de geografía se corren después del reset |
| Cambios locales de Diego en `application.properties` y `Bajonea-Local.postman_environment.json` | No se tocan: la propiedad nueva lleva su valor por defecto en el código |
| Textos legales provisorios olvidados | Línea visible en las páginas y anotación en `LISTA-DE-DESPLIEGUE.md` |

## 5. Fuera del tramo (Tramo 2)

Nombre único global (`V37`, columna generada), validador global en registro/alta adicional/corrección/edición del perfil, mensaje "Ya existe un comercio con ese nombre. Elegí otro.", los dos endpoints de disponibilidad en vivo con su rate limit y la generalización de `bindNombreUsuario`. El script de saneamiento de `practicas3` es prerrequisito del Tramo 2.

## 6. Qué necesito de Diego para arrancar

Nada bloqueante: todas las decisiones están tomadas. Si querés, antes de la entrega A, corré `docs/db/saneamiento-practicas3-fase1-registro.sql` y pasame el resultado del informe DESPUÉS.

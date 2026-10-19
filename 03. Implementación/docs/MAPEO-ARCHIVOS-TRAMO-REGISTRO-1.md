# Mapeo de archivos: Registro de Comercio, Tramo 1 (2026-10-18)

Datos legales opcionales, sin email de contacto del comercio, solo Tierra del Fuego y Términos y Condiciones. Detalle de las decisiones en `docs/DECISIONES.md` (entrada del 2026-10-18), plan en `docs/PLAN-FASE1-REGISTRO-TRAMO1.md` y auditoría en `docs/AUDITORIA-FASE1-REGISTRO.md`. Pendiente de la confirmación de Diego; sin commit.

## Entrega A: backend y tests

| Archivo | Cambio |
|---|---|
| `backend/src/main/resources/db/migration/V36__registro_comercio_campos_opcionales_y_tolhuin.sql` | Nuevo: cuatro columnas de `persona_juridica` y `comercio.email` a `NULL`; inserta Tolhuin |
| `entities/PersonaJuridica.java`, `entities/Comercio.java` | Sin `nullable = false` en esos campos |
| `services/LocalidadesHabilitadas.java` | Nuevo: lista fija de localidades (`geografia.localidades-habilitadas`) |
| `services/GeografiaService.java`, `repositories/LocalidadRepository.java` | Solo las provincias y localidades habilitadas |
| `services/ValidadorDatosNegocioComercio.java` | `400` por campo ante una localidad existente fuera de la lista |
| `dto/request/*` (`RegistroComercio`, `AltaComercioAdicional`, `DatosNegocioComercio`, `DatosLegalesComercio`, `ComercioPerfil`) | Opcionales, sin `emailContacto`, con `aceptaTerminos` en registro y alta adicional |
| `dto/response/*` (`ComercioResponse`, `ComercioPublicoResponse`, `ComercioEmpleadoResponse`, `CorreccionComercioResponse`) | Sin `emailContacto`; el público además sin `razonSocial` ni `cuit` |
| `services/ComercioService`, `ComercioEdicionService`, `ComercioCorreccionService`, `RegistroService`, `InvitacionEmpleadoService` | Sin email de contacto; la localidad pasa por el validador |
| Tests Java nuevos | `GeografiaServiceTest`, `LocalidadesHabilitadasTest`, `ValidadorDatosNegocioComercioLocalidadTest`, `AceptaTerminosRegistroComercioTest`, `DatosLegalesComercioOpcionalesTest`, `RegistroComercioFase1IntegrationTest` |
| Tests Java ajustados | `ComercioServiceCatalogoPublicoTest` (JSON público sin `cuit`/`razonSocial`/`emailContacto`), `EscriturasEmpleadoHttpIntegrationTest`, `MisComerciosEmpleadoIntegrationTest`, `ComercioCorreccionServiceTest`, `ComercioEdicionServiceTest`, `HistorialEdicionComercio*` |
| `testing/playwright/tests/63-registro-comercio-fase1-api.spec.ts` | Nuevo (20 tests de API) |
| `testing/playwright/scripts/build-registro-comercio-fase1-postman.mjs` | Nuevo: carpeta 70 de Newman; va último en el orden de los constructores |
| Constructores de Newman, estreses y helpers de Playwright | Cuerpos con `aceptaTerminos` y sin `emailContacto`; la carpeta 50 se regeneró con `build-multicomercio-tramo2a-postman.mjs` |

## Entrega B: frontend y tests de UI

| Archivo | Cambio |
|---|---|
| `frontend/terminos.html`, `frontend/privacidad.html` | Nuevos, con texto provisorio y la línea visible que lo avisa |
| `frontend/js/form-utils.js` | `crearCheckboxTerminos`, `montarTerminos`, `validarTerminos`, `MENSAJE_TERMINOS_REQUERIDOS` |
| `frontend/js/geografia.js` | Provincia única como campo de solo lectura con candado y texto de apoyo |
| `frontend/js/cliente-form.js` | Usa el componente de Términos (Cliente e invitación) |
| `frontend/js/comercio-form.js` | Sin email; legales opcionales; sección plegable que se abre sola ante valor o error |
| `frontend/js/auth.js`, `agregar-comercio.js` | Términos en el último paso y `aceptaTerminos` en el envío |
| `frontend/registro-comercio.html`, `comercio-corregir.html` | `<details>` "Datos adicionales (opcional)"; sin email |
| `frontend/agregar-comercio.html` | Sin email; ranura de Términos |
| `frontend/comercio-perfil.html`, `js/comercio.js` | Encabezado con teléfono y estado y localidad; sin email; guion en los legales ausentes; el Empleado sin la fila bloqueada del email |
| `frontend/js/admin.js` | "Email de contacto" solo si viene; legales ausentes con guion |
| `frontend/css/styles.css` | `.legal-texto`, `.terminos`, `.input-shell--solo-lectura`, `.seccion-plegable`, `.perfil-linea` |
| `testing/playwright/tests/64-registro-comercio-fase1-ui.spec.ts` | Nuevo (17 tests de UI) |
| `testing/playwright/tests/helpers/datos-adicionales.ts` | Nuevo: abre la sección plegable |
| Specs 01, 13, 19, 23, 25, 36, 38, 53 | Adaptados (sin email, con la sección plegable y los Términos) |

## Documentación

`CLAUDE.md` (§1bis), `docs/DECISIONES.md`, `docs/diccionario-de-datos.md` y su copia en `docs/entregables-01-02/` (v1.21), `docs/entregables-01-02/requisitos-funcionales-comercio.md`, `requisitos-funcionales-dueño.md`, `Historias de Usuario - Dueño.md` y `CAMBIOS.md`, `docs/LISTA-DE-DESPLIEGUE.md`, `docs/DATA-TESTID-FASE17.md`.

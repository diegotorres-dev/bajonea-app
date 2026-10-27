# Auditoría — Fase 3: Direcciones múltiples del Cliente

Fecha: 2026-10-24. Auditoría de solo lectura (código + `SELECT` contra `bajonea_practicas3`, en Flyway `V41`). No se modificó código, migraciones ni configuración. Numeración libre: migración `V42`, spec de Playwright `80` (API) y `81` (UI), carpeta `78` de Newman.

Las 11 decisiones de Diego se toman como dadas. Esta auditoría verifica que sean viables y marca dónde chocan con el código real.

---

## 0. Resumen ejecutivo

- **Todas las decisiones son viables.** No hay ninguna que obligue a rediseñar el modelo.
- **La base ya está más preparada de lo que decía el prompt.** `direccion` ya tiene `principal`, `eliminada`, `fecha_baja` y `fecha_modificacion` (`V1`, líneas 133-154; entidad `Direccion.java`). No hay ninguna restricción de unicidad sobre `cliente_id`. Faltan solo `nombre`, `referencia`, la garantía de "una sola por defecto" y la copia (snapshot) en `pedido`.
- **Conflicto principal con el código (decisión 10):** hoy el pedido muestra la dirección **viva**. `PedidoService.aResponseDTO` (`PedidoService.java:1072-1081`) lee `pedido.getDireccion()` en cada respuesta. Ya pasó: los pedidos 49 y 50 apuntan a la dirección 70, editada el 2026-10-18, después de ellos. Es un único punto de armado (el DTO del Empleado lo copia de ahí), así que el arreglo es chico.
- **Conflicto con el código (decisión 7, "preseleccionada"):** el checkout hoy muestra una sola dirección fija (`checkout.js:218-253`), sin selección.
- **Cosa que se rompe si no se toca:** `ClienteService.aResponseDTO` usa `DireccionRepository.findByClienteId` que devuelve `Optional` (`ClienteService.java:87`, `DireccionRepository.java:26`). Con dos filas lanza `IncorrectResultSizeDataAccessException` y rompe `GET /clientes/perfil` para cualquier Cliente con 2 direcciones.
- **Concurrencia:** se resuelve con una sola regla: toda escritura de direcciones del Cliente toma primero la fila `usuario` `FOR UPDATE`. `confirmarPedido` ya toma `usuario` con `LOCK IN SHARE MODE` como primera sentencia (`PedidoService.java:152`), así que se serializa sola sin tocar el orden global.
- **Decisiones de Diego que quedan abiertas:** dos, ambas menores y con recomendación (sección 10).

---

## 1. Modelo de datos

### 1.1 Tabla `direccion` (V1 baseline, sin cambios posteriores: ningún `V2`-`V41` la modifica)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INT AI | PK |
| `calle` | VARCHAR(150) NN | |
| `numero` | VARCHAR(10) NN | |
| `piso_depto` | VARCHAR(30) NULL | |
| `codigo_postal` | VARCHAR(10) NN | |
| `localidad_id` | VARCHAR(15) NN | FK `fk_direccion_localidad` → `localidad.id` |
| `cliente_id` | INT NULL | FK `fk_direccion_cliente` → `cliente.id`, índice `idx_direccion_cliente` (no único) |
| `comercio_id` | INT NULL | FK `fk_direccion_comercio`, **`UNIQUE uq_direccion_comercio`** |
| `principal` | TINYINT(1) NN DEFAULT 0 | |
| `eliminada` | TINYINT(1) NN DEFAULT 0 | |
| `fecha_creacion` | DATETIME NN | |
| `fecha_modificacion` | DATETIME NULL | |
| `fecha_baja` | DATETIME NULL | |

Entidad: `entities/Direccion.java` (todas las columnas mapeadas, `@OneToOne` a `Comercio`, `@ManyToOne` a `Cliente` y `Localidad`).

### 1.2 Relaciones

- `direccion.cliente_id` → `cliente.id` (N:1, ya soporta N direcciones).
- `direccion.localidad_id` → `localidad.id`.
- `pedido.direccion_id` → `direccion.id` (`fk_pedido_direccion`, nullable, índice `fk_pedido_direccion`; `V1` líneas 347, 369, 372). `DOMICILIO` ⇒ no nulo; `RETIRO` ⇒ nulo.

### 1.3 Cómo guarda hoy el pedido la dirección de entrega

**Solo por FK.** No hay copia. Al leer el pedido se hace JOIN lógico a la dirección viva (`PedidoService.java:1072-1081`). Es la causa de que editar una dirección cambie pedidos viejos (decisión 10 lo corrige).

### 1.4 Restricciones que chocan con el borrado lógico o con tener varias

- **No hay ninguna que choque.** `uq_direccion_comercio` solo afecta a comercios (los `NULL` no cuentan como duplicados).
- **No existe garantía en base de "una sola por defecto".** Hoy lo "garantiza" que existe una sola fila por Cliente. MariaDB 10.4 no tiene índices únicos parciales. Se resuelve con una columna generada `STORED` + `UNIQUE`, el mismo patrón que `V27` (`mp_user_id_activo`) y `V37` (`nombre_unico`).
- **La FK `fk_pedido_direccion` no es problema** porque el borrado es lógico: la fila nunca se elimina.

### 1.5 Formato

`DireccionRequestDTO.java`: calle `@NotBlank`, ≤150, debe tener letra o dígito; número `@NotBlank`, ≤10, solo dígitos; piso/depto ≤30; código postal con `@ValidarCodigoPostalArgentino`; `localidadId` `@NotBlank` ≤15. El DTO ya tiene un campo `principal` (boolean) que `RegistroService.java:125` ignora y pisa con `true`.

---

## 2. Datos reales en `bajonea_practicas3` (`SELECT`, 2026-10-24)

| Consulta | Resultado |
|---|---|
| Versión Flyway | 41 (el próximo es V42) |
| Filas en `direccion` | 30: 7 de Cliente, 23 de Comercio, 0 con ambos, 0 con ninguno, 0 eliminadas |
| Clientes | 7 (todos con exactamente 1 dirección; 0 con 0; 0 con más de 1) |
| Clientes sin dirección | 0 |
| Principales | 7 (una por Cliente); los comercios tienen `principal = 0` |
| Clientes con ≠ 1 principal | 0 filas |
| Direcciones de Cliente fuera de Río Grande/Ushuaia/Tolhuin | 0 (las 7 son `94008010`, Río Grande) |
| Direcciones de Comercio fuera de las 3 | 0 |
| Pedidos | 92: 49 `DOMICILIO` (todos con `direccion_id`), 43 `RETIRO` (todos sin) |
| Pedidos con dirección de un comercio o de otro Cliente | 0 y 0 |
| Pedidos cuya dirección se editó después de crearlos | **2** (pedidos 49 y 50, dirección 70, modificada 2026-10-18 19:11:41; pedidos del 2026-09-22) |
| Dirección con más pedidos | id 17: 44 pedidos |

Los 7 Clientes son cuentas de prueba (calles "Calle de Testing", "Test", "Cliente", "Calle", "Asd", "Belgrano", "Empleado").

### 2.1 Propuesta de backfill para V42

1. **Por defecto:** por Cliente con direcciones activas y ninguna `principal`, marcar la de mayor `id`. En `practicas3` es no-op (las 7 ya son principal); se deja como red de seguridad para cualquier otra base.
2. **Snapshot de pedidos existentes:** `UPDATE pedido JOIN direccion` copiando calle, número, piso/depto, código postal y localidad a las columnas `entrega_*`, solo para `direccion_id IS NOT NULL` (49 filas aquí).
3. **Límite honesto:** los pedidos 49 y 50 quedan con los valores **actuales** de la dirección 70 ("Cliente 123"), no con los de septiembre. Los valores viejos no existen en ningún lado (no hay tabla de trazabilidad, ver decisión 11). Son datos de prueba; se documenta y se acepta.
4. No se tocan las direcciones de comercio.

---

## 3. Backend: lo que toca direcciones hoy

### 3.1 Piezas existentes

| Pieza | Archivo | Qué hace con direcciones |
|---|---|---|
| Entidad | `entities/Direccion.java` | Sin `nombre` ni `referencia` |
| Repositorio | `repositories/DireccionRepository.java` | `findByComercioId`, `findByComercioIdInConLocalidad`, **`findByClienteId` (Optional)**, `findByDuenoIdConComercioYLocalidad` |
| Registro Cliente | `RegistroService.java:105-126` | `crearCliente`: valida localidad, `construirDireccion`, `setPrincipal(true)`. Lo reutiliza el alta por invitación (`InvitacionEmpleadoService.java:500`) |
| Localidad habilitada | `ValidadorDatosNegocioComercio.obtenerLocalidad` (`:51-58`) + `LocalidadesHabilitadas` | `404` si no existe; `400` con `ValidacionCamposException(direccion.localidadId)` si existe pero no está en las 3. **Ya aplica a Clientes** (registro y alta por invitación), no solo a comercios |
| Perfil | `ClienteService.java:87-109`, `ClienteController.java`, `ClienteResponseDTO.direccion` | Expone **una** dirección (`findByClienteId`), sin filtrar `eliminada` |
| Pedido (alta) | `PedidoService.confirmarPedido` (`:151-259`) | `usuario` `LOCK IN SHARE MODE` → carrito → comercio con bloqueo compartido → `direccionRepository.findById` **sin bloqueo** → valida dueño y `eliminada` (`:183-193`) → `Pedido.builder().direccion(...)` |
| Pedido (lectura) | `PedidoService.aResponseDTO` (`:1072-1091`) | Arma `DireccionResponseDTO` desde la dirección viva |
| DTO Empleado | `PedidoEmpleadoResponseDTO.java:64` | Copia `pedido.getDireccion()` del `PedidoResponseDTO` |
| DTO compartido | `DireccionResponseDTO.java` | Lo usan Cliente, Pedido **y también** `ComercioService:462` y `AdministradorService:399` |
| Atajo de test | `TestSupportService.java:194-202` | Clona la dirección de un comercio |

### 3.2 Endpoints

**Existen:** `GET /api/v1/clientes/perfil`, `PUT /api/v1/clientes/perfil` (solo nombre, apellido, teléfono), `PUT /api/v1/clientes/perfil/nombre-usuario`, `POST /api/v1/pedidos/cliente` (con `direccionId`).

**Faltan (propuesta):**

| Método y ruta | Acción | Respuesta |
|---|---|---|
| `GET /api/v1/clientes/direcciones` | Lista las activas (por `principal` desc, `id` desc) | 200 |
| `POST /api/v1/clientes/direcciones` | Alta (cupo 5; la primera queda por defecto) | 201 |
| `PUT /api/v1/clientes/direcciones/{id}` | Edición completa | 200 |
| `PUT /api/v1/clientes/direcciones/{id}/principal` | Marcar como por defecto (idempotente) | 200 |
| `DELETE /api/v1/clientes/direcciones/{id}` | Baja lógica; si era la de por defecto promueve la de mayor `id` | 200 con `mensaje` y la lista resultante |

Códigos de negocio: `404` idéntico para ajena, inexistente o ya borrada; `409` `DIRECCIONES_CUPO_MAXIMO`; `409` `ULTIMA_DIRECCION`; `400` por campo (incluida la localidad no habilitada).

**Rol y delegación:** exclusivos de Cliente. Quedan cubiertos por el matcher existente `hasRole("CLIENTE")` de `/api/v1/clientes/**` (`SecurityConfig.java:143`). No van en `DelegacionEmpleado` (que solo lista rutas de comercio) y no usan `X-Comercio-Id`: un Empleado administra sus direcciones **como Cliente**. Verificado: `ClasificacionRutasComercioTest` solo recorre los prefijos `/api/v1/comercios`, `/productos`, `/pedidos/comercio`, `/oauth/mercadopago`, `/notificaciones` y `/empleados` (`:59-60`), así que no exige clasificar `/clientes/**`.

### 3.3 DTOs a crear o ajustar

- `DireccionClienteRequestDTO extends DireccionRequestDTO` con `nombre` (≤40, opcional) y `referencia` (≤150, opcional). **No** agregarlos a `DireccionRequestDTO`: lo comparten el registro de Comercio y la corrección.
- `DireccionClienteResponseDTO` (id, nombre, calle, número, piso/depto, CP, localidad, provincia, referencia, `principal`). No ampliar `DireccionResponseDTO`: lo usan los comercios.
- `DireccionEntregaResponseDTO` para `pedido.direccion` (snapshot: calle, número, piso/depto, CP, localidadId, nombreLocalidad, nombreProvincia, referencia). Mantiene el nombre del campo `direccion`.
- `ClienteResponseDTO.direccion` **se mantiene** (la de por defecto activa) para no romper nada; se suma `direcciones` solo si hace falta.

---

## 4. Frontend: qué cambiaría en cada pantalla

| Pantalla / script | Hoy | Cambio |
|---|---|---|
| `registro-cliente.html` + `js/cliente-form.js` (`:48-52`, `:463`) | Pide una dirección | **Nada.** Sigue obligatoria y queda por defecto |
| `invitacion-empleado.html` + `js/invitacion-empleado.js` | Reutiliza `montarFormularioCliente` | **Nada** |
| `perfil.html` + `js/cliente.js` | No muestra direcciones (`:113` solo normaliza) | Nueva fila "Mis direcciones" (`btn-mis-direcciones`) y vistas `view-direcciones` y `view-direccion-form` dentro de la misma página, como el resto del perfil |
| `js/direcciones.js` (nuevo) | — | Lista, formulario y hoja de alta, compartido entre el perfil y el checkout |
| `checkout.html` + `js/checkout.js` | Paso 2 muestra una dirección fija (`:218-253`); envía `cliente.direccion.id` (`:389`) | Lee `GET /clientes/direcciones`; muestra tarjetas seleccionables con la de por defecto preseleccionada; "Agregar dirección" abre hoja; se conserva `btn-confirmar-direccion`; resumen del paso 3 (`:316-318`) y payload usan la elegida |
| `js/carrito.js:306`, `js/catalogo.js`, `js/comercio-form.js`, `comercio-*.html` | Direcciones **de comercio** | **Nada** |
| `pedido-detalle.html` + `js/pedidos.js` (`:165`, `:499`) | Formatea `pedido.direccion` | Muestra la copia; suma línea de referencia |
| `comercio-pedido-detalle.html` + `js/comercio.js` (`:174`, `:1392`) | Dueño y Empleado ven `pedido.direccion` | Suma la referencia (clave para el repartidor) |
| `admin.js` (`:10`, `:576-583`) | Solo direcciones de comercio; **ninguna pantalla de pedido** del Administrador muestra dirección | **Nada** |
| `js/validators.js:208` | `esNumeroDireccionValido` | Se reutiliza; validadores nuevos de nombre y referencia |
| `css/styles.css` | — | Tarjeta de dirección, chip "Predeterminada", tarjeta seleccionable (radio) |
| `js/api.js` | — | `clientes/direcciones` **no** entra en `RUTAS_DEL_DUENO` |

Provincia/localidad: se reutiliza el selector de `js/geografia.js` (la API ya devuelve solo las 3 localidades) y el patrón de provincia de solo lectura del Tramo 1 de registro.

---

## 5. Reglas existentes

- **Localidad:** ya restringida a las 3 para Clientes (registro y alta por invitación) desde el Tramo 1 de registro (2026-10-18), por `LocalidadesHabilitadas` (`geografia.localidades-habilitadas`, valor por defecto `94008010,94015020,94011010` en el código). El CRUD la reutiliza. Dos detalles:
  - la clave de error es `direccion.localidadId` (`ValidadorDatosNegocioComercio.CAMPO_LOCALIDAD`, verificada en `RegistroComercioFase1IntegrationTest:111`); el CRUD usa un DTO plano, así que hay que parametrizarla a `localidadId`;
  - las direcciones viejas fuera de la lista **siguen siendo legibles** (el spec `63:402` lo prueba cambiando la localidad por SQL). Solo se exige la lista al crear o editar.
- **Calle/número/piso/CP:** todo en `DireccionRequestDTO`. Se hereda y se agregan nombre y referencia en el DTO nuevo.
- **Normalización:** `TextoUtils.aTitleCase(calle)` y `TextoUtils.normalizarCodigoPostal` en `RegistroService.construirDireccion` (`:308-318`). El CRUD debe usar la misma normalización (hoy es privada; conviene extraerla).
- **Dónde viven:** formato en DTOs; la localidad habilitada es un chequeo de servicio contra configuración (no expresable como anotación estática) y ya vive así en todos los demás flujos. Es consistente con lo existente.
- **Diccionario** (`docs/diccionario-de-datos.md`, tabla `Direccion`, líneas 645-670): ya dice "un cliente puede tener múltiples direcciones activas; solo una `principal`". Hay que subirlo a v1.27.

---

## 6. Concurrencia

Orden global vigente: `usuario` → `empleado_comercio` → `dueno`/`cuenta_mercado_pago` → `comercio` → `producto`/`pedido` → `pago` → `carrito` (hoja final).

### 6.1 Diseño

- **Toda escritura del CRUD** (alta, edición, cambiar por defecto, baja) empieza por `UsuarioRepository.findByIdConBloqueo` (`FOR UPDATE` sobre la fila `usuario` del propio Cliente). No toma ningún otro bloqueo: no bloquea filas de `direccion` por rango (`WHERE cliente_id = ? FOR UPDATE` usa next-key locks sobre `idx_direccion_cliente` y se interbloquea; lección ya documentada para invitaciones). Con el `usuario` tomado, el resto son lecturas consistentes y `UPDATE` por clave primaria.
- **`confirmarPedido`** ya toma la misma fila con `LOCK IN SHARE MODE` como primera sentencia (`:152`). `FOR UPDATE` y `LOCK IN SHARE MODE` sobre la misma fila se excluyen: o el pedido ve el estado anterior al CRUD, o el CRUD espera al commit del pedido. No hay nuevo orden ni ciclo posible (el CRUD solo toca `usuario` y `direccion`, ambas antes/fuera del resto de la cadena).
- **Lectura de la dirección en el pedido:** hoy es `findById` común (`:188`). Debe pasar a una lectura nativa `SELECT ... LOCK IN SHARE MODE` (no `PESSIMISTIC_READ` de JPA: MariaDB 10.4 no entiende el `FOR SHARE` de Hibernate, ver `docs/APRENDIZAJES-TECNICOS.md`) y el snapshot se arma de esa fila.
- **Red de seguridad en base:** la columna generada con `UNIQUE` garantiza una sola por defecto activa por Cliente aunque un bug se saltee el bloqueo.
- **Detalle de implementación a no olvidar:** el `UNIQUE` se evalúa por sentencia. Al cambiar el por defecto hay que bajar la vieja y recién después subir la nueva, con `UPDATE` explícitos y `flush` entre ambos; Hibernate no garantiza ese orden con dos `save`.

### 6.2 Casos de carrera pedidos

| Caso | Resultado esperado | Garantizado por |
|---|---|---|
| Dos altas simultáneas con 4 activas | Una gana (5 activas), la otra `409` cupo | `usuario FOR UPDATE`; el conteo se hace con el lock tomado |
| Dos cambios simultáneos de por defecto | Gana el último en entrar; siempre exactamente una por defecto | `usuario FOR UPDATE` + `UNIQUE` generado |
| Borrar o editar una dirección mientras se crea un pedido con ella | Serializados: el pedido guarda la copia anterior completa, o el pedido recibe `404` "Dirección no encontrada". Nunca una copia mezclada ni sin copia | `usuario` S/X + lectura de la dirección con `LOCK IN SHARE MODE` |
| Borrar las dos últimas direcciones en paralelo | Una baja ok, la otra `409` `ULTIMA_DIRECCION`; queda 1 activa | `usuario FOR UPDATE`; el conteo se revalida con el lock |
| Borrar la por defecto mientras otra alta la reemplaza | Serializado; siempre una por defecto | idem |

Efecto lateral aceptable: el `usuario FOR UPDATE` también espera/bloquea a un login del mismo usuario (conteo de intentos). Milisegundos, mismo costo que el cambio de contraseña.

---

## 7. Tests que cambian o se rompen

### 7.1 Java (`backend/src/test`)

Se rompen por compilación si `PedidoService` cambia de constructor o de repositorio: `PedidoServiceConfirmarPedidoLockTest` (`:70`), `PedidoServiceCarreraTest` (`:92`), `PedidoServiceVistaEmpleadoTest` (`:91`; además fija la lista de campos del DTO del Empleado, `:61`, que incluye `"direccion"`), `PedidoServiceReembolsoTest`, `PedidoNoRetiradoServiceTest`, `PedidoServiceRelojTest`. Cambian de significado: `PedidoServiceConfirmarPedidoLockTest` (orden de sentencias: ahora hay una lectura bloqueante de la dirección). No cambian: `RegistroComercioFase1IntegrationTest` (`:99`, `:123` leen la localidad del Cliente), `ComercioEdicionServiceTest`.

Nuevos: `DireccionClienteServiceTest`, `DireccionClienteIntegrationTest`, `DireccionClienteConcurrenciaIntegrationTest`, `PedidoSnapshotDireccionIntegrationTest`.

### 7.2 Playwright (`testing/playwright/tests`)

- **`05-pedido-flujo-completo.spec.ts:114`:** depende de `btn-confirmar-direccion`. Se conserva el testid y la dirección por defecto viene preseleccionada, así que el flujo sigue igual.
- **`12-carrito-checkout-explorar.spec.ts:160-176`:** intercepta `GET /clientes/perfil` poniendo `direccion = null` para probar "No tenés una dirección registrada". Cuando el checkout lea `GET /clientes/direcciones`, el test debe interceptar esa ruta. Cambia de significado.
- **`63-registro-comercio-fase1-api.spec.ts:402-407`:** cambia la localidad del Cliente por SQL y lee `perfil.data.direccion`. Obliga a **mantener `ClienteResponseDTO.direccion`**.
- `35-empleado-invitacion-api.spec.ts:724` (cuenta una principal por Cliente): no cambia.
- `24-multicomercio-tramo3a...:405` lee `direccion.id` de un **comercio**: no cambia.
- Specs con `DOMICILIO` (`12`, `24`, `47-pedidos-no-retirado-api`) y `helpers/backend.ts:627` (`crearPedido` con `direccionId`): verificar que lean la dirección del perfil (se mantiene).
- Nuevos: `80-direcciones-api.spec.ts`, `81-direcciones-ui.spec.ts`.

### 7.3 Postman/Newman (builders en `testing/playwright/scripts`)

Leen `GET /clientes/perfil → data.direccion.id` para pedir `DOMICILIO` (siguen andando si el perfil conserva `direccion`): `build-matriz-cliente-postman.mjs` (`:620-625`, y 26 menciones más del registro), `build-matriz-comercio-postman.mjs` (`:552-581`), `build-actividad-tramoE3-A2b-postman.mjs` (`:236`), `build-pedidos-autoconfirmado-tramoE3-A6-postman.mjs` (`:236`, `:317`). El resto de los builders pide `RETIRO` con `direccionId: null` o solo manda la dirección en el registro: no cambian. Nuevo: `build-direcciones-fase3-postman.mjs` (carpeta `78`, va último).

### 7.4 Estreses

Los que crean pedidos a domicilio por perfil no cambian. Nuevo: `stress-locks-tramoDirecciones.mjs` (id `direcciones` en `correr-estreses.mjs`).

---

## 8. Migración V42

```
ALTER TABLE direccion
  ADD COLUMN nombre VARCHAR(40) NULL,
  ADD COLUMN referencia VARCHAR(150) NULL,
  ADD COLUMN principal_activa_cliente_id INT
    GENERATED ALWAYS AS (IF(principal = 1 AND eliminada = 0, cliente_id, NULL)) STORED,
  ADD UNIQUE KEY uq_direccion_principal_cliente (principal_activa_cliente_id),
  ADD KEY idx_direccion_cliente_activa (cliente_id, eliminada);

ALTER TABLE pedido
  ADD COLUMN entrega_calle VARCHAR(150) NULL,
  ADD COLUMN entrega_numero VARCHAR(10) NULL,
  ADD COLUMN entrega_piso_depto VARCHAR(30) NULL,
  ADD COLUMN entrega_codigo_postal VARCHAR(10) NULL,
  ADD COLUMN entrega_localidad_id VARCHAR(15) NULL,
  ADD COLUMN entrega_referencia VARCHAR(150) NULL;
```

Más el backfill de la sección 2.1 (primero la marca de por defecto, después la copia a `pedido`).

Decisiones de diseño de la migración:
- `pedido.direccion_id` y su FK **se conservan** ("de qué dirección salió").
- `entrega_localidad_id` **sin FK** (el catálogo es estático; evita sumar un bloqueo compartido por pedido y sigue el precedente de `notificacion.comercio_id`). El nombre de localidad y provincia se resuelven por JOIN al armar el DTO.
- No se copia el alias ("Casa", "Trabajo") al snapshot (ver sección 10).
- Sin `CHECK` que exija el snapshot en `DOMICILIO`: lo garantiza el servicio y lo prueba un test.
- `STORED` y no `VIRTUAL`, como `V27` y `V37`; Hibernate (`ddl-auto=validate`) ignora la columna no mapeada.

### 8.1 Riesgos

- **Sobre los datos reales (`practicas3`):** bajos. Hay exactamente 1 principal por Cliente, así que el `UNIQUE` se crea sin violaciones (verificado). 92 pedidos, 49 a copiar. Lo único que se pierde es la imposibilidad ya existente de reconstruir los pedidos 49 y 50.
- **`ALTER TABLE pedido` en el servidor:** hay precedente directo (`V39` agregó 3 columnas, 3 índices y una FK a `pedido` sin problemas). Flyway ejecuta antes de que la app sirva tráfico, y agregar columnas nulas al final es barato en MariaDB 10.4. En una tabla grande, el `UPDATE ... JOIN` del backfill es lo único proporcional al volumen.
- **DDL no transaccional en MariaDB:** si la migración falla a la mitad queda a medias. Mitigación: ensayar `V42` contra una copia de `practicas3` antes de aplicarla, y escribir la migración en orden DDL → DML.
- **Base `bajonea_test`:** el reset de 3 pasos (Flyway hasta V15 → seed → resto) no cambia.

---

## 9. Propuesta de entregas

### Entrega A — backend y pruebas

1. **A1** `V42` + entidades (`Direccion`: nombre, referencia; `Pedido`: seis columnas `entrega_*`) + consultas de `DireccionRepository` (activas por Cliente, conteo, por defecto activa, lectura con `LOCK IN SHARE MODE`).
2. **A2** `DireccionClienteService` + endpoints + DTOs + extracción de la normalización de dirección. `ClienteService.aResponseDTO` pasa a usar la de por defecto activa.
3. **A3** Snapshot en `confirmarPedido` (lectura bloqueante) y `aResponseDTO` desde la copia; `DireccionEntregaResponseDTO`; ajuste de `PedidoEmpleadoResponseDTO`.
4. **A4** Tests Java (unitarios, integración, concurrencia, snapshot) y ajuste de los seis tests con constructor de `PedidoService`.
5. **A5** Newman (builder y carpeta `78`) y spec `80` de API.
6. **A6** Estrés `stress-locks-tramoDirecciones.mjs` con cinco escenarios: (1) altas simultáneas contra el cupo, (2) cambios simultáneos de por defecto, (3) borrar/editar vs. `confirmarPedido` sobre la misma dirección, (4) bajas simultáneas de las últimas dos, (5) edición vs. pedido verificando que la copia nunca queda mezclada. Más las mutaciones: quitar el `usuario FOR UPDATE` del alta; contar también las eliminadas; saltear la promoción al borrar la de por defecto; sacar la lectura bloqueante del pedido; armar el snapshot desde la dirección viva; no validar propiedad en edición/baja; subir y bajar el por defecto en el orden inverso. Criterio: 0 `Deadlock found`, 0 `Lock wait timeout`, 0 `5xx`.
7. **A7** Regresión completa, diccionario v1.27, `CLAUDE.md`, `docs/DECISIONES.md`, `docs/MAPEO-ARCHIVOS-FASE3-DIRECCIONES.md`.

Riesgos de A: el orden de `UPDATE` con el `UNIQUE` generado; que `findByClienteId` quede en algún camino con ≥2 filas; la lectura bloqueante cambia la forma del mock en tres tests.

### Entrega B — pantallas y specs de UI

1. **B0** Mockups aprobados por Diego antes de escribir código.
2. **B1** "Mis direcciones" en el perfil (lista, alta, edición, baja, cambiar por defecto, cupo lleno).
3. **B2** Checkout: selección con la de por defecto preseleccionada y alta desde el checkout sin salir.
4. **B3** Referencia en los detalles de pedido de Cliente, Dueño y Empleado.
5. **B4** Spec `81` de UI, ajuste de los specs `05` y `12`, regresión completa de Playwright.

**Mockups que hacen falta (6):** (1) Mis direcciones: lista con "Predeterminada", con 1, con 5 (botón "Agregar" deshabilitado y aviso de cupo); (2) alta y edición de dirección (nombre, calle, número, piso/depto, CP, provincia fija, localidad, referencia, interruptor "Usar como predeterminada"); (3) confirmación de baja (tres variantes: común, la predeterminada con aviso de cuál pasa a serlo, y la última con el bloqueo); (4) checkout paso 2 con tarjetas seleccionables; (5) hoja "Agregar dirección" dentro del checkout; (6) detalle de pedido con la línea de referencia (Cliente y Dueño/Empleado).

---

## 10. Preguntas abiertas para Diego

Ninguna bloquea el arranque. Si no contestás, avanzo con la recomendación.

1. **Direcciones viejas fuera de Río Grande/Ushuaia/Tolhuin al hacer un pedido.** Hoy (y en `practicas3`: 0 casos) un Cliente con una dirección guardada fuera de la lista puede pedir con ella. La lista solo se exige al crear o editar. **Recomiendo** no bloquear el pedido con una dirección ya guardada (no se rompe a nadie) y exigir una localidad válida solo al editarla.
2. **¿El alias ("Casa", "Trabajo") viaja en el snapshot del pedido?** **Recomiendo que no**: es una etiqueta privada del Cliente y el comercio solo necesita calle, número, piso/depto, localidad y referencia. Es reversible (una columna más) si querés que el comercio la vea.

Decididas por mí como parte de la implementación (no requieren tu respuesta): alias repetible entre direcciones; "más reciente" = mayor `id`; `GET /clientes/perfil` conserva el campo `direccion` (la predeterminada); el `DELETE` responde `200` con `mensaje` (regla del proyecto) y no `204`.

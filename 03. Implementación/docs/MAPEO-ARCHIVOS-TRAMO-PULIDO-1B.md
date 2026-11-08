# Mapeo de archivos — Tramo 1b de pulido: ajustes del Tramo 1 (2026-11-07)

Cierra lo que dejó abierto `docs/MAPEO-ARCHIVOS-TRAMO-PULIDO-1.md`. Backend: un solo cambio, aprobado por Diego (el campo `limiteRespuestaComercio`); sin migraciones ni tablas nuevas. El resto es frontend y pruebas. No se tocó ningún token de color. Pendiente de la confirmación de Diego.

## Qué hace

- **"Vence en N minutos" (K01, backend + frontend).** `PedidoResponseDTO` y `PedidoEmpleadoResponseDTO` suman `limiteRespuestaComercio` (fecha y hora sin zona, como el resto): `fechaPagoAprobado` más `pedido.timeout.respuesta-comercio-minutos`, la misma propiedad que usa `expirarPedidosSinRespuestaComercio` (no hay un 30 copiado). Solo existe en `PENDIENTE_CONFIRMACION_COMERCIO` y solo en las respuestas del lado del comercio (la lista `GET /pedidos/comercio` y las acciones del comercio); en cualquier otro estado, sin fecha de pago, y para el Cliente, es `null`. El frontend (`js/pedidos-nuevos.js`) ya tenía el texto escrito y apagado: con el campo real se enciende solo ("Vence en N minutos" mientras falten más de 0; "Está por vencer" cuando el límite ya pasó, nunca minutos negativos; sin el campo, nada). No hizo falta tocar el frontend de pedidos.
- **Toast (T06).** Solo los toasts de error se pausan con mouse, foco o toque. El de éxito (2,5 s) se va solo aunque el mouse esté encima.
- **Título "Ayuda" del Dueño.** `comercio-perfil.html` ya no tiene el título de la sección "Ayuda"; las filas "Ayuda" y "Mis consultas a Soporte" quedan juntas sin encabezado. El Empleado no tenía el problema (su fila Ayuda entra en su propia lista y la sección se descarta).
- **Botones de crear categoría y crear tag (carrera real, hallada en el Bloque 0).** Nacen `disabled` y se habilitan al final de `initAdminCategorias` / `initAdminTags`. Resuelve `17:295` y `17:310`.
- **Foco al cerrar una hoja en Safari (hallazgo de WebKit).** `abrirHoja` acepta la opción `disparador`; las hojas de cancelar pedido y confirmar recepción pasan el botón que las abrió.

## Archivos modificados

### Backend

| Archivo | Cambio |
|---|---|
| `dto/response/PedidoResponseDTO.java` | Campo y parámetro del constructor `limiteRespuestaComercio` (después de `limiteResolucionSuspension`). |
| `dto/response/PedidoEmpleadoResponseDTO.java` | Campo `limiteRespuestaComercio`, copiado del DTO completo (lista blanca ampliada a propósito). |
| `services/PedidoService.java` | `limiteRespuestaComercio(pedido, fechaPagoAprobado)` (estado y fecha de pago, más `timeoutProperties.getRespuestaComercioMinutos()`); lo usan `listarPedidosComercio` y `aResponseDTOParaComercio`; las vistas del Cliente pasan `null`. |
| `test/.../PedidoServiceVistaEmpleadoTest.java` | Lista blanca con el campo nuevo (31 campos en la vista del Dueño); tres tests nuevos: límite en pendiente y nulo en aceptado y expirado para Dueño y Empleado, el límite sigue al plazo configurado (45 minutos) y sin fecha de pago es nulo. |

### Frontend

| Archivo | Cambio |
|---|---|
| `js/catalogo.js` | `showToast`: los escuchadores de pausa (`pointerenter`, `pointerleave`, `pointerdown`, `pointerup`, `focusin`, `focusout`) solo se agregan si el toast es de error. |
| `comercio-perfil.html` | Sin el `<p class="profile-section__title">Ayuda</p>` de `#seccion-soporte`. |
| `admin-categorias.html`, `admin-tags.html` | `btn-crear-categoria` y `btn-crear-tag` con `disabled`. |
| `js/admin.js` | `fab.disabled = false` después de enlazar el manejador, en categorías y en tags. |
| `css/styles.css` | `.fab:disabled` (opacidad 0,6 y cursor normal). |
| `js/hoja.js`, `js/pedidos.js` | Opción `disparador` de `abrirHoja`; las tres llamadas de `pedidos.js` pasan `evento.currentTarget`. |

## Pruebas

| Spec | Qué cambió |
|---|---|
| `103-panel-comercio-nuevos-ui` | Ya no simula el límite: usa el campo real de la API (y comprueba que sea el pago más 30 minutos). Nuevos: pedido aceptado sin vencimiento, límite ya pasado ("Está por vencer", sin minutos negativos) y campo `null` o ausente (nada, y ninguna palabra "null"). Quedó en 7 tests. |
| `106-pulido-1b-ui` (nuevo, 11 tests) | API del Dueño (límite solo en pendiente), del Empleado (mismo valor, sin los datos reservados) y del Cliente (sin el campo); panel y lista con "Vence en N minutos"; toast de éxito que se va aunque el mouse esté encima y no se pausa al tocar; toast de error que sí se pausa; perfil del Dueño y del Empleado sin título "Ayuda". |
| `38-empleado-acceso-ui` | La lista de títulos del perfil del Dueño pasa de `['Mi comercio', 'Ayuda', 'Sesión']` a `['Mi comercio', 'Sesión']`. |
| `94`, `95` | Vuelven al código original (`toHaveCount(0)` sin mover el mouse ni esperar 10 s): ya no hacen falta porque el toast de éxito deja de pausarse. Quedan idénticos al último commit. |
| `37`, `44` | La lista blanca exacta de campos del pedido del Empleado suma `limiteRespuestaComercio` (los dos fallaron en la corrida completa por eso). |
| `17` | Sin cambios de código: `17:295` y `17:310` pasaban a fallar por la carrera del botón y ahora pasan (42/42 con `--repeat-each=3`). |

## Verificaciones del Bloque 0

### 1. Reintentar una mutación que ya llegó al servidor

"Reintentar" repite la última llamada. `apiFetch` (modo `aviso`) trata igual la falta de red y un *timeout* (`FalloRecuperable('red')`) y también reintenta ante un 5xx; en esos casos el primer envío pudo haber llegado.

| Mutación | ¿Se duplica? | Por qué |
|---|---|---|
| Crear pedido (`POST /pedidos/cliente`) | **Sí, no está protegida** | `confirmarPedido` no mira si ya hay un `PENDIENTE_PAGO` del mismo carrito ni vacía el carrito (se vacía al aprobarse el pago). Un segundo envío crea un segundo pedido sin pagar con los mismos ítems; vence a los 30 minutos si no se paga. Con `totalEsperado` no hay una clave de idempotencia. |
| Iniciar pago (`POST .../pago`) | No | Hay una sola fila de pago por pedido (alta con `ON DUPLICATE KEY`) y se reutiliza la preferencia ya creada; la verificación previa con Mercado Pago evita pagar dos veces. |
| Enviar reclamo | No | Un reclamo por pedido (restricción única, `409` "ya existe"). |
| Consulta nueva a Soporte | **Parcial** | Cada envío crea una consulta, acotada por los límites de 3 por día y 3 abiertas por email (`429`). Un duplicado es posible pero acotado. |
| Mensaje en una consulta de Soporte | No | La regla de turno (`ConversacionSoporte.agregarMensaje`): el segundo mensaje de la misma persona da `409`. |
| Cargar documento | **Sí, no está protegida** | Sin hash ni restricción de unicidad; solo los topes (5 en revisión, 20 en total). |
| Crear producto | **Sí, no está protegida** | Sin restricción única por nombre dentro del comercio. |
| Crear categoría | No | Restricción única por nombre (`uq_categoria_nombre`, `409`). |

**Propuesta (no implementada, hay que aprobarla):** ante un *timeout* (no ante "sin red" ni un 5xx), las mutaciones sin protección (crear pedido, cargar documento, crear producto y consulta nueva a Soporte) no ofrecen "Reintentar" y dicen "No sabemos si llegó. Revisá antes de volver a enviar" con un enlace a la lista correspondiente. Un costo menor alternativo: que `confirmarPedido` reutilice un `PENDIENTE_PAGO` del mismo cliente y comercio con los mismos ítems (cambia backend).

### 2 y 3. Cuenta de fallos del Tramo 1 y los 36 que no corrieron

La cifra real de tests distintos que fallaron fue **10**: `38` x4, `53`, `94`, `95`, `06:89`, `17:295` y `17:310`. En la corrida completa fallaron 9; `17:310` quedó entre los 36 "no corrieron", porque `17` es un bloque serial y Playwright salta los tests siguientes de un bloque serial cuando uno falla (los reportó como "did not run", no como fallo); después, al repetir `17` completo, `17:310` sí corrió y falló, y de ahí la suma de 10. No hay `skip` explícito. El archivo de resultados de esa corrida se sobrescribió, así que los 36 nombres no se pueden listar a posteriori; el patrón se confirmó en la corrida de este tramo, donde los 2 fallos legítimos (ver más abajo) dejaron 7 tests sin correr, todos los siguientes dentro de los bloques seriales de `37` y `44`, y esos 7 corrieron y pasaron al repetir los specs completos. Con `17:295` resuelto, los de `17` vuelven a correr.

### 4. `17:295` y `17:310`

No eran datos acumulados ni algo que tapara el botón: era una carrera real de la interfaz. El botón de crear categoría está en el HTML y su manejador se enlaza después de `await apiFetch('/categorias')`; con 96 categorías esa llamada tarda unos 75 ms (cuenta los productos de cada una), contra 13 ms de `GET /tags`, y el clic de Playwright caía en esa ventana (el modal nunca se abría). Corregido en la interfaz con el patrón del proyecto (botón `disabled` hasta estar enlazado), también en tags por consistencia.

## Resultado de las pruebas

- **Java:** `PedidoServiceVistaEmpleadoTest` (8), `PedidoServiceCarreraTest` (17), `PedidoServiceReembolsoTest` (16), `PedidoServiceRelojTest` (5), `PedidoServiceConfirmarPedidoLockTest` (6) y `PedidoNoRetiradoServiceTest` (22): 0 fallos. No se corrió `mvnw test` completo: la mayoría de las clases de integración usan la base de pruebas que Playwright tenía en uso.
- **Playwright, corrida completa** (`workers: 1`, 44,2 min, Mercado Pago simulado, backend reiniciado con el código nuevo, base reseteada con `entorno-test.mjs preparar`): **1552 tests: 1543 pasaron, 2 fallaron, 7 no corrieron**. Los 2 fallos: `37:367` y `44:136`, que comparan la lista blanca exacta del pedido del Empleado y no tenían el campo nuevo (es el cambio de backend, no un defecto). Los 7 sin correr son los siguientes dentro de esos bloques seriales. Corregidos los dos specs, `37`, `44` y `53` completos volvieron a correr: 69/69. Los inestables conocidos (`27:497`, `06:89`, `23:235`) pasaron en esta corrida. No se repitió la corrida de 1552 completa después de corregir `37` y `44`.
- **WebKit** (iPhone 13 de Playwright): `101` a `106`, 47/47.

## WebKit

`playwright.webkit.config.ts` ya existe (proyecto `webkit`, perfil iPhone 13). Corridos los specs `101` a `106`: **47/47**, después de corregir un defecto real que encontró (`102:55`: en Safari un botón no recibe el foco al tocarlo, así que la hoja de confirmación no devolvía el foco al cerrarse; ahora recibe el disparador de forma explícita). Es el WebKit de Playwright, no un iPhone ni Safari reales: el sonido y el aviso de red siguen sin probarse en un dispositivo. Texto sugerido para el entregable en `docs/entregables-01-02/alcance-y-limitaciones.md` (no se editó nada de `01.` ni de `02.`).

## Decisiones no previstas

1. **Dónde vive el texto de limitaciones.** El prompt nombraba `docs/alcance-y-limitaciones.md`, que no existe; el texto sugerido para el entregable está en `docs/entregables-01-02/alcance-y-limitaciones.md`, y se agregó ahí.
2. **El campo solo va del lado del comercio.** Es `null` en las respuestas del Cliente (mismo criterio que `limiteResolucionSuspension`).
3. **Textos del frontend sin cambios.** El código del Tramo 1 muestra "Respondé antes de 30 minutos" en un pedido recién llegado y "Vence en N minutos" en los demás, y "Está por vencer" cuando falta menos de un minuto o ya pasó: ya cumplía lo pedido y no se tocó.
4. **Segundo cambio de `hoja.js`.** No estaba en el prompt: es el defecto de foco que apareció al correr WebKit; es chico y real.
5. **Botones de crear en tags.** También nacen `disabled` aunque `17` solo fallaba en categorías (la lista de tags es más rápida): mismo defecto latente.
6. **Pausa del reloj en el spec `106`.** `page.clock.pauseAt` en el `beforeEach` de los tests de toast, porque en WebKit el `hover` gasta tiempo real del reloj simulado.

## Hallazgos abiertos (no se tocaron)

Los de `AUDITORIA-NIELSEN.md` listados en el mapeo del Tramo 1, más: crear pedido, cargar documento y crear producto no son idempotentes ante un reintento (ver la tabla de arriba).

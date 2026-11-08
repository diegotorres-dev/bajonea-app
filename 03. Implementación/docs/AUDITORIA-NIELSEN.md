# Auditoría de usabilidad con las 10 heurísticas de Nielsen

Fecha: 2026-11-07. Alcance: la interfaz mobile vigente (375 px) en `frontend/` (61 páginas, 58 módulos JS, `css/styles.css`). Solo lectura: no se modificó código, tests, estilos ni documentos, no se tocó `bajonea_practicas3`, no se corrió el backend y no se tomaron capturas nuevas.

**Cómo se hizo.** Lectura de código (HTML, JS y CSS) con `grep` para contar patrones, cálculo de contraste con la fórmula WCAG sobre los tokens de `:root`, y lectura de capturas ya existentes en `docs/capturas-*` (tres, citadas donde se usan). **No se abrió la app en un navegador**, así que todo lo que dice "cómo se ve" sale del código o de esas capturas; lo que no pude comprobar está marcado como "no verificado" (sección 9).

Fuentes cruzadas: `docs/AUDITORIA-ESCRITORIO.md` (inventario de pantallas y componentes, §3 y §4) y `CLAUDE.md`.

---

## 1. Resumen ejecutivo

1. La base es sólida en lo fino (confirmaciones con foco inicial en "Cancelar" en el cierre manual y en "no retirado", aviso preventivo antes del bloqueo de cuenta en el login, descarte de cambios en direcciones y documentos, previa de Mercado Pago antes de desvincular), pero **las reglas no están unificadas**: cada una de las ~43 apariciones de hoja o modal se arma a mano y el nivel de cuidado depende de quién la escribió.
2. **Tres hallazgos graves (severidad 4)**: el Cliente cancela un pedido, incluso pagado, con un solo toque y sin confirmación (C01); un corte de red, un timeout o un 5xx, también en un sondeo de fondo cada 15 s, expulsa a toda pantalla a la página de error y se pierde lo escrito (T01); y el panel y la lista de pedidos del comercio no se actualizan solos cuando entra un pedido (K01).
3. La confirmación está **invertida respecto del riesgo**: "Cerrar sesión" pide confirmación en los tres roles (el modal está copiado tres veces) y "Cancelar pedido", que es irreversible y toca plata, no.
4. Los dos problemas que ya conocías de los modales se confirman en parte: la hoja es blanca, lo "amarillento" son las cajas de advertencia (`--color-warning-bg` con borde amarillo) y las cremas (`--color-surface-alt`), y hay hojas con 6 a 8 bloques de texto (T04).
5. Casi todo lo grave se arregla con cambios chicos (S/M) en componentes compartidos; conviene un tramo P1 antes del escritorio y resolver ya C01, K01 y T01 porque no dependen del escritorio.

**37 hallazgos: 3 graves (4), 13 importantes (3), 14 menores (2), 7 cosméticos (1).** Conteo por heurística principal: A 8, B 2, C 4, D 4, E 9, F 2, G 3, H 1, I 2, J 2.

---

## 2. Escala usada

| Dimensión | Valores |
|---|---|
| Severidad | 1 cosmético · 2 menor · 3 importante (el usuario se traba o se confunde) · 4 grave (puede perder datos, plata o quedar sin salida) |
| Costo de arreglo | S cambio de texto o de una clase · M un componente o una pantalla · L varias pantallas o lógica |
| Riesgo para tests | bajo, medio o alto según cuántos specs de Playwright y `data-testid` dependan de lo que habría que cambiar |
| "Esc." | si el hallazgo también afecta a la interfaz de escritorio |

El riesgo para tests es una estimación por lectura: solo conté referencias donde está dicho (por ejemplo, `btn-cancelar-pedido` aparece 3 veces en `testing/playwright/tests`). Los `data-testid` se pueden conservar en casi todos los arreglos propuestos.

Heurísticas: A visibilidad del estado · B lenguaje del mundo real · C control y libertad · D consistencia · E prevención de errores · F reconocimiento · G flexibilidad · H minimalismo · I diagnóstico de errores · J ayuda.

---

## 3. Hallazgos transversales (Bloque 1: componentes compartidos)

Un hallazgo transversal vale por todas las pantallas que usan el componente; en "pantallas" va la lista.

| Id | Componente | Heur. | Qué pasa | Evidencia | Sev | Costo | Riesgo tests | Recomendación | Esc. |
|---|---|---|---|---|---|---|---|---|---|
| T01 | `apiFetch` y errores globales | A, C, E, I | Cualquier error de red, timeout (15 s) o 5xx navega a toda pantalla a `errores/*.html`. Los sondeos de fondo usan las mismas opciones por defecto: `refrescarComercios()` corre cada 15 s en las cuatro pestañas del Dueño y del Empleado, y su `catch { return; }` nunca llega a ejecutarse porque la redirección ya ocurrió. Un parpadeo de red mientras alguien escribe un motivo de rechazo, edita un producto o llena un formulario lo saca de la pantalla y pierde lo escrito. "Reintentar" recarga la URL de retorno con GET. | `api.js:520-545` (catch → `redirectTo` en `:529` y `:531`, rama 5xx en `:544`); `comercio-activo.js:62-63` y `:165-174`; `notificaciones.js:203-218`; `errores/500.html`, `sin-conexion.html` y `timeout.html` (script de reintento). Solo 25 módulos pasan `handle5xxGlobally: false`. Pantallas: todas las autenticadas con sondeo (Dueño, Empleado, Cliente en notificaciones). | 4 | M | medio (specs de errores y de red) | Los sondeos y las lecturas en segundo plano deben pasar siempre `handleRedGlobally: false` y `handle5xxGlobally: false` y fallar en silencio (o con un indicador discreto "Sin conexión"). La página de error a pantalla completa solo para la carga inicial de una pantalla. En pantallas con formulario, mostrar banner con "Reintentar" sin salir. | Sí |
| T02 | Hojas y modales (≈43 apariciones de `modal-backdrop` en 19 archivos) | C, G, D | Sin helper común. `Escape` cierra en solo 10 archivos: `admin.js` (8 hojas), `carrito.js`, `catalogo.js`, `cliente.js`, `documentos.js` y casi todo `comercio.js` (solo la de "no retirado" tiene `Escape`) no lo manejan. `role="dialog"` y `aria-modal` están en 14 archivos, ausentes en los modales de anular y rechazar pedido, rechazar comercio, vaciar carrito, logout y desvincular Mercado Pago. El foco inicial en la acción segura existe solo en algunas hojas (lo comprobé en "no retirado" y en el cierre manual); no hay focus trap. Cerrar tocando el fondo sí funciona en casi todas. | Conteo `grep` de `modal-backdrop`, `Escape`, `aria-modal`, `.focus()` en `js/`; `comercio.js:1051-1127` (anular, sin role, sin Escape, sin foco) frente a `:1175-1230` y `cierre-comercio.js:36-70` (los dos modelos buenos). `AUDITORIA-ESCRITORIO.md` §5 ya anotó que no hay `inert` ni trampa de foco. | 3 | L | medio (los `data-testid` se conservan) | Un único `abrirHoja({titulo, texto, acciones, peligro})` con `role="dialog"`, `Escape`, cierre por fondo, foco inicial en la acción segura, foco atrapado y devolución del foco. Modelo: `cierre-comercio.js:36-70`. Migrar primero las destructivas. | Sí |
| T03 | Botón destructivo | D, E | Seis maneras distintas de marcar "peligro": `btn-primary` naranja en "Sí, vaciar carrito" y en el logout; `style.background = var(--color-error)` inline en anular, rechazar y no retirado; `btn-peligro`; `doc-peligro`; `equipo-hoja__peligro`; `renuncia-hoja__peligro`. En el rechazo de comercio la lógica está invertida: es rojo inline si NO es definitivo y usa `btn-peligro` si lo es. Además "Rechazar pedido", "Anular pedido" y "Cancelar pedido" son botones secundarios con borde rojo asignado inline. | `carrito.js:~70`; `comercio.js:1189-1191`, `:1015-1020`; `admin.js:475-478`; `direcciones.js:523`; `styles.css:4446`, `:5520-5521`, `:5909-5910`, `:7164-7178` | 2 | M | bajo (clases) a medio (inline) | Una sola variante `btn-peligro` (rojo sólido) para la acción que destruye y `btn-primary` para lo demás; "Cancelar" siempre terciario. Sacar los `style` inline. | Sí |
| T04 | Contenido y color de las hojas | H, I | La hoja en sí es blanca (`--color-surface`, `styles.css:1352-1356`), pero adentro se acumulan cajas de advertencia amarillas (`--color-warning-bg` `#fff7e6` con borde `--color-warning`, `:8045-8046`, `:8141-8143`), cajas crema (`--color-surface-alt`) y un fondo oscuro cálido (`rgba(20,16,12,.55)`, `:1342-1349`). Se leen como "hoja amarillenta". La hoja de levantar a un Dueño junta ≈7 bloques (título, caja gris con motivo, caja verde, dos cajas amarillas, nota, campo); el pie fijo corta el texto. En la de suspender, el título y el subtítulo quedan pegados y el subtítulo se ve cortado. | Capturas `capturas-suspension-dueno/10-hoja-levantar-con-comercios-que-siguen.png` y `02-hoja-suspender-con-empleados.png`. Es lectura de una captura, no de la app en vivo. | 3 | M | bajo-medio | Regla de contenido: una idea y como máximo 2 o 3 líneas por hoja; el detalle (por comercio, por pedido) va en la pantalla de origen o en un "Ver detalle" desplegable. Amarillo solo para avisos persistentes dentro de la página, nunca dentro de una hoja de decisión: usar el borde gris y un ícono. | Sí |
| T05 | Separación de botones en hojas | D, E | Los botones se separan con `margin-bottom` inline de 10, 12 o 16 px según la hoja; en la hoja de eliminar documento "Eliminar" (rojo) y "Cancelar" quedan prácticamente pegados, con riesgo de toque equivocado. | `capturas-documentos/17-modal-eliminar.png`; `admin.js:408`, `carrito.js:~70`, `comercio.js:1189` | 2 | S | bajo | Resolverlo dentro del helper de T02 con un `gap` único entre acciones. | Sí |
| T06 | `showToast` | A, I | Dura 2,2 s fijos, sin pausa al tocarlo, sin botón de cierre, y cada toast nuevo borra el anterior. Los errores usan el mismo tiempo y `role="status"` en lugar de `alert`. Un mensaje de error largo ("No pudimos cancelar el pedido…") se puede ir antes de leerse. Aparece a 90 px del borde, encima de la navegación. | `catalogo.js:31-46`; `styles.css:3000-3019` | 3 | S | bajo (93 referencias a `.toast`, ninguna depende de la duración) | Errores: 6 a 8 s, `role="alert"` y cierre manual; éxito: 2,5 s. Pausar con el foco o el toque. Mantener un toast por vez. | Sí |
| T07 | Patrón "la hoja se cierra y después se envía" | A, E, I | Las hojas con formulario (anular pedido, rechazar pedido, aprobar y rechazar comercio) ejecutan `backdrop.remove()` y recién entonces llaman a la API; si falla, el aviso sale detrás, sin contexto, y lo que se escribió (motivo, comentario) se perdió. Las hojas de equipo, desvincular y direcciones sí quedan abiertas con estado de carga. | `comercio.js:1117-1126` (anular) y el equivalente de rechazar; `admin.js:414-417` y `:718-748` | 3 | M | medio | Mantener la hoja abierta mientras dura el pedido, con botón en "Enviando…", y mostrar el error dentro de la hoja. Cerrar solo al éxito. Entra en el helper de T02. | Sí |
| T08 | Contraste de color | D | Texto blanco sobre `--color-primary` `#ff4700`: 3,41:1 en todo botón primario, FAB y chip activo. Texto naranja sobre blanco (enlaces `.link`): 3,41:1. `--color-text-muted` `#7a736e` sobre el fondo crema `#f2ece6`: 3,98:1 y sobre `--color-surface-alt`: 4,37:1. `--color-text-placeholder` sobre blanco: 2,32:1. 24 reglas con fuente de 10 u 11 px. El punto amarillo de "Pendiente" (`#f2b400`) tiene 1,86:1, aceptable solo porque lleva texto al lado. | `styles.css:3-30` (tokens, cálculo propio con la fórmula WCAG); `:271`, `:284`, `:745` y otras 21 reglas de 10 a 11 px. Para pasar 4,5:1 con texto blanco alcanza `#d33a00` (4,80:1); `--color-primary-dark` `#e03e00` da 4,32:1 y no llega. | 2 | M | bajo | Oscurecer el primario a algo como `#d33a00` o pasar los botones a texto de 18 px en negrita (3:1 alcanza para texto grande). Subir los textos de 10 y 11 px y el gris secundario sobre crema. | Sí |
| T09 | Zonas táctiles | E | El proyecto cuida 44 px en 18 reglas, pero el botón volver mide 32 px, el ojo de contraseña 20, campana y perfil de la cabecera 24 y los chips 36. La variante `--tactil` de 44 px del volver existe solo en las pantallas de direcciones. | `styles.css:125-127`, `:423-426`, `:1515-1521`, `:1591-1594`, `:6520-6522` | 2 | M | bajo | Subir el área de toque a 44 px con `padding` sin cambiar el tamaño del ícono. | Parcial (en escritorio son menos críticas) |
| T10 | Teclado, foco y hover | G, D | Hay 9 reglas `:hover`, ninguna dentro de `@media (hover: hover)`, 7 `:focus-visible` y ningún foco propio en `.btn`; las tarjetas clicables de comercio, de pedido y de las bandejas de Administrador no tienen estado hover ni foco; no hay atajos ni "saltar al contenido". `.chip-row` oculta la barra de desplazamiento (6 usos), lo que con mouse impide recorrerlo. Ya estaba relevado en `AUDITORIA-ESCRITORIO.md` §8. | `styles.css`: conteo de `:hover`, `:focus-visible`, `hover: hover`, `scrollbar-width: none` | 2 | M | bajo | Estados `:hover` bajo `(hover: hover)` y `:focus-visible` consistente para botones, enlaces y tarjetas; variante `chip-row--wrap` para escritorio. | Sí (es el punto que más pesa) |
| T11 | Botón "Volver" | C, D | 15 páginas usan `onclick="history.back()"`. Funciona si se llegó paso a paso, pero tras un deep link (`?id=`), un reemplazo de URL o una acción que navega, "volver" cae en una pantalla arbitraria o fuera de la app. En el mismo proyecto el volver de las vistas del perfil usa un manejador propio. | `admin-comercios.html:12`, `admin-clientes.html:12`, `admin-tarifas.html:5-6`, `errores/404.html:6`; 15 HTML con `history.back()` | 2 | S | medio (`btn-volver` en specs) | Un destino lógico por pantalla (`data-volver="admin-dashboard.html"`) con `history.back()` solo como respaldo. | Sí |
| T12 | Errores de campo | I | `mostrarErrorCampo` solo escribe texto y `display:flex`; no marca `aria-invalid`, no enlaza `aria-describedby` y no lleva el foco al primer error. `aria-invalid` aparece en 1 archivo (`documentos.js`), `role="alert"` en 9 sitios y `aria-describedby` en 10 módulos de los ≈25 con formularios. | `validators.js:234-239`; `documentos.js:199-202`; conteos de `grep` | 2 | M | bajo | Una función única de error de campo que ponga `aria-invalid`, `aria-describedby` y mueva el foco al primero. | Sí |
| T13 | Estados de carga | A | Los módulos principales del Cliente (`catalogo.js`, `pedidos.js`, `carrito.js`, `notificaciones.js`, `explorar.js`, `cliente.js`) no tienen ningún indicador de carga: `grep 'skeleton\|loading\|cargando'` sin resultados, mientras que 20 módulos de Comercio y Administrador sí usan skeletons. Los botones de `perfil.html` y `comercio-perfil.html` nacen `disabled` (para evitar una carrera) y no muestran que están cargando. `admin-dashboard.html` deja el texto literal "Cargando..." en tres lugares. | `grep` sobre `js/`; `perfil.html:12-45`; `admin-dashboard.html:18`, `:29`, `:56` | 3 | M | bajo | Skeletons de tarjeta de comercio, de pedido y de producto con el componente `.skeleton` que ya existe; botones deshabilitados con aspecto "en espera". La pantalla vacía hasta que llegan los datos no está verificada visualmente. | Sí |
| T14 | Ayuda | J, F | Las Preguntas frecuentes solo se enlazan desde pies de páginas públicas (login, registros, legales) y desde Soporte. Ningún rol autenticado llega a ellas. "Nueva consulta" vive adentro de "Mis consultas a Soporte". El perfil del Cliente no tiene Términos, Privacidad ni Preguntas frecuentes. No hay ayuda contextual de las reglas (plazo de reclamo, estados del comercio, hora límite de 90 minutos). | `grep faq.html` (login, registros, legales, `soporte.js:144`); `perfil.html:42-47`; `comercio-perfil.html:98-103`; `soporte-mis-consultas.js:69` | 3 | S | bajo | Fila "Ayuda" en los perfiles de Cliente, Dueño y Empleado con tres entradas: Preguntas frecuentes, Nueva consulta y Términos y Privacidad. Enlace "¿Cómo funciona?" junto a las reglas con plazo. | Sí |
| T15 | Gesto escondido (mantener apretado) | F, G | Mantener 500 ms el avatar de la barra inferior abre "Tus comercios", solo con `pointerType === 'touch'`, sin indicio visible, y además `contextmenu` está bloqueado (clic derecho no hace nada). Existe alternativa (la franja bajo el header) y por eso no hay pérdida funcional. | `selector-comercio.js:500-543` | 2 | S | bajo | Dejar el gesto como acelerador, pero mostrar una pista la primera vez y no bloquear el menú contextual en escritorio. | Sí |
| T16 | Textos de estado de pedido | B, A | "Pendiente" del Cliente significa "esperando que el comercio acepte" y queda al lado de "Esperando pago", sin diferenciarse. El texto de "Esperando pago" dice "esperá unos segundos y actualizá esta pantalla" aunque la pantalla ya se actualiza sola. | `pedidos.js:36-48` y `:716-730` | 2 | S | medio (textos en specs) | "Esperando al comercio" en lugar de "Pendiente"; sacar la frase de actualizar. | No |
| T17 | Modal de sesión cerrada y página de sesión expirada | I, B | Cualquier `401` con token abre el modal "Sesión cerrada: detectamos que iniciaste sesión en otro dispositivo". Pero el caso común es el vencimiento (el token dura 24 h según `jwt.expiration-ms`), y el texto es falso. `errores/sesion-expirada.html`, con el texto correcto, no está enlazada desde ningún lado. El modal no tiene `Escape`, foco ni `role="dialog"`. | `api.js:280-286`, `:564-568`; `grep sesion-expirada` sin referencias; `CLAUDE.md` §7.1 | 3 | S | medio | Distinguir los dos casos con el código del `401` (o el texto neutro "Tu sesión terminó") y usar el modal con el texto correcto. Si el backend no los distingue, texto neutro. | Sí |

---

## 4. Hallazgos por rol

### 4.1 Público y acceso (Bloque 2)

| Id | Pantalla | Heur. | Qué pasa | Evidencia | Sev | Costo | Riesgo tests | Recomendación | Esc. |
|---|---|---|---|---|---|---|---|---|---|
| P01 | `registro-comercio` (4 pasos, ≈25 campos) y `registro-cliente` (2 pasos) | E, C | "Volver" desde el primer paso hace `history.back()` y salir de la pestaña no avisa: no hay `beforeunload`, descarte ni borrador. El formulario de comercio es el más largo del proyecto (30 KB). Entre pasos "Volver" sí retrocede el paso. | `auth.js:250-258` y `:285-292`; `grep beforeunload` (solo `comercio-activo.js` y `notificaciones.js`, no son formularios) | 3 | M | bajo-medio | Confirmar el descarte con la misma hoja de "¿Descartar los cambios?" de direcciones y documentos cuando haya datos cargados. | Sí |
| P02 | `splash` | A, G | Espera fija de 900 ms con "Cargando..." aun con sesión iniciada, aunque no hay nada que cargar. | `splash.html` (`setTimeout(..., 900)`) | 1 | S | bajo | Redirigir de inmediato cuando hay sesión; el splash solo para la primera visita. | Sí |
| P03 | `verificar-email` | J, B | La pantalla no dice cuánto vale el código (la de recuperar contraseña sí: "vence en 30 minutos") y "Reenviar código" no tiene cuenta regresiva. Parcial: el texto `verificar-texto` lo arma JS y no lo leí entero. | `verificar-email.html`; `recuperar-password.html:20` | 1 | S | bajo | Misma frase de vencimiento que en recuperar contraseña y espera visible entre reenvíos. | No |
| P04 | `errores/*` | C, I | Los cinco textos están bien escritos, pero "Volver al inicio" apunta siempre a `../index.html` (el catálogo del Cliente) para cualquier rol, y `acceso-denegado` no ofrece "Volver al panel". No verifiqué si `index.html` redirige a Dueño y Administrador. | `errores/404.html`, `500.html`, `acceso-denegado.html`, `sin-conexion.html`, `timeout.html` | 2 | S | bajo | "Volver al inicio" que resuelva el destino por rol (como hace `splash`). | Sí |

### 4.2 Cliente (Bloque 3)

| Id | Pantalla | Heur. | Qué pasa | Evidencia | Sev | Costo | Riesgo tests | Recomendación | Esc. |
|---|---|---|---|---|---|---|---|---|---|
| C01 | `pedido-detalle` / `pedidos`: "Cancelar pedido" | E, C | **Un toque cancela, sin confirmación**, en cualquier estado cancelable: sin pagar, pendiente de aceptación o en preparación. Si el pago ya se hizo, dispara un reembolso. El aviso de que la devolución queda en gestión llega recién después, en un toast de 2,2 s. En el mismo rol, "Cerrar sesión" sí pide confirmación. | `pedidos.js:380-393` (`ejecutar` llama a la API directo), `:416-422` y `:462-475`; `cliente.js:63-84` (logout con confirmación); `btn-cancelar-pedido` aparece 3 veces en los specs | 4 | S | medio (3 referencias; los specs hoy esperan cancelación inmediata) | Hoja de confirmación: "¿Cancelar el pedido #N?", con la consecuencia ("Te devolvemos el pago" o "El pedido todavía no se pagó") y "Sí, cancelar" en rojo con "Volver" por defecto. | Sí |
| C02 | `pedido-detalle`: "Confirmar que recibí mi pedido" | E | También de un toque y es irreversible (cierra el pedido como entregado y abre el plazo de reclamo de 7 días). Un toque accidental marca como recibido algo que no llegó. | `pedidos.js:478-486` | 3 | S | medio | Confirmación corta: "¿Ya tenés tu pedido? Si no lo recibiste, no lo confirmes todavía." | Sí |
| C03 | `pedido-detalle` | A | El sondeo de 15 s solo corre mientras el pedido está en `PENDIENTE_PAGO`. Con el pedido en preparación o en camino la pantalla no se actualiza sola, y el botón "Confirmar que recibí" depende de que el estado pase a `EN_CAMINO`. La campana avisa, pero el detalle abierto sigue mostrando el estado viejo hasta recargar. | `pedidos.js:716-730` (`pedido.estado !== 'PENDIENTE_PAGO'` → return) | 3 | M | bajo | Mantener el sondeo mientras el pedido no esté en un estado final, con la pantalla visible. | Sí |
| C04 | `explorar` | F, E, H | El buscador no tiene etiqueta ni `aria-label` (solo placeholder), no hay botón para borrar, los chips de categoría y de tags son dos filas con scroll horizontal sin barra, y no hay "Limpiar filtros" ni contador de resultados. | `explorar.html:11-17`; `explorar.js:94-150` | 2 | S | bajo | `aria-label`, botón de borrar, "Limpiar filtros" cuando hay alguno activo y el número de resultados. | Sí |
| C05 | `checkout`, paso 1 | G, H | El paso "Modalidad" es solo elegir entre dos tarjetas y luego tocar "Continuar": un paso y un toque extra. No verifiqué si se saltea cuando el comercio ofrece una sola modalidad. | `checkout.html:26-37` | 1 | S | medio | Avanzar al elegir, o fusionar con "Dirección / Retiro". | Sí |
| C06 | `notificaciones` (Cliente) | G | Falta "Marcar todas" para el Cliente (solo existe en contextos de comercio). Ya estaba anotado como pulido pendiente en `CLAUDE.md` §9. | `notificaciones.js:151-165` | 1 | M | bajo | Endpoint de avisos personales (ya anotado). | No |

### 4.3 Comercio, Dueño y Empleado (Bloque 4)

| Id | Pantalla | Heur. | Qué pasa | Evidencia | Sev | Costo | Riesgo tests | Recomendación | Esc. |
|---|---|---|---|---|---|---|---|---|---|
| K01 | `comercio-dashboard` y `comercio-pedidos` | A | **No se actualizan solos.** Panel y lista cargan una vez y solo vuelven a pedir datos al volver a la pestaña (`visibilitychange`) o con `pageshow`. El contador de la campana sí cambia con el sondeo de 15 s, pero "Pendientes", "Pedidos del turno" y la lista no; no hay sonido ni vibración (`grep Audio\|vibrate` sin resultados). Un pedido sin respuesta se rechaza a los 30 minutos (`pedido.timeout.respuesta-comercio-minutos`) con reembolso, es decir, una venta perdida. Nota: dejo el 4 por el impacto sobre la venta, pero depende de que la campana no sea suficiente aviso para el equipo: no lo ejercité. | `comercio.js:670-700` y `:740` (carga única); `comercio-activo.js:197-205` (el sondeo solo refresca contadores); `catalogo.js:107` | 4 | M | medio | Recargar resumen y lista en cada sondeo, resaltar "Nuevo" lo que entró y ofrecer sonido (ver decisión 2). Es más grave en escritorio: la pestaña queda abierta todo el turno. | Sí |
| K02 | Hojas "Anular pedido" y "Rechazar pedido" | E, I | No explican la consecuencia ("el cliente recibe la devolución del pago"), no son `dialog`, no tienen `Escape` ni foco inicial, y siguen T07 (se cierran antes de enviar). El modal vecino de "no retirado" sí dice la consecuencia y es el modelo. El comentario dice "Agregá una aclaración para el cliente" sin aclarar que el cliente lo lee. | `comercio.js:910-996` (rechazar), `:1051-1127` (anular), `:1175-1230` | 3 | M | medio | Texto de consecuencia visible bajo el título, mismo patrón que "no retirado", y migración al helper de T02. | Sí |
| K03 | Detalle de pedido: "Marcar como despachado / listo para retirar" | E | De un toque, sin confirmación, y avisa al cliente sin posibilidad de deshacer. "Aceptar pedido" también, pero allí es lo esperable. | `comercio.js:1129-1150` | 2 | S | bajo | Confirmación solo para despachar y listo para retirar (o un "Deshacer" de unos segundos). | Sí |
| K04 | `comercio-estadisticas` | E | Gráfico de 30 columnas de unos 10 px de ancho (objetivo táctil muy por debajo de 44 px). Ya figura como deuda en `DECISIONES.md` y en `AUDITORIA-ESCRITORIO.md` §3.3. | `styles.css:6339-6350` | 2 | M | bajo | Ver el detalle por día al tocar y permitir cambiar a 7 días como vista por defecto en pantallas angostas. | Se resuelve con el ancho |
| K05 | `comercio-dashboard` | B | El saludo usa el nombre del comercio como si fuera una persona: "Hola, Pizzería Popular 👋". | `comercio.js:667` | 1 | S | bajo | "Hola 👋" o el nombre de la persona. | No |

### 4.4 Administrador (Bloque 5)

| Id | Pantalla | Heur. | Qué pasa | Evidencia | Sev | Costo | Riesgo tests | Recomendación | Esc. |
|---|---|---|---|---|---|---|---|---|---|
| A01 | Las 17 pantallas `admin-*` | C, G, F | No hay navegación entre pantallas: el panel es el único punto de entrada y cada pantalla vuelve con `history.back()`. Cada tarea cuesta pasar por el panel, y tras una acción "volver" puede caer en la pantalla equivocada. | `admin-comercios.html:12`, `admin-clientes.html:12`, `admin-tarifas.html:5-6`; `AUDITORIA-ESCRITORIO.md` §3.4 y §11 punto 5 | 3 | L | medio | Componente de navegación del Administrador (ya planeado como `renderAdminNav` en E2) y destinos lógicos de "Volver". | Sí |
| A02 | `admin-dashboard` | A, F | "Requieren atención" cubre comercios, re-solicitudes y documentos; Soporte y Reclamos muestran su conteo en la grilla de gestión, pero **Reembolsos** dice siempre "Revisión manual" sin número, aunque son notas de crédito pendientes o fallidas con plata de clientes. Nadie se entera de que hay un reembolso trabado salvo que entre a mirar. | `admin.js:219-246` (el subtítulo de reembolsos es fijo; no se usa ningún contador de reembolsos) | 3 | M | bajo | Contador de reembolsos para revisar en las métricas y en el panel, con el mismo formato que Reclamos. | Sí |
| A03 | `admin-tarifas`: confirmar nueva tarifa | E | La confirmación muestra los valores nuevos pero no la tarifa vigente que se reemplaza ni que no afecta a los pedidos ya creados; "Confirmar" es naranja como cualquier acción. Cambia dinero de todos los pedidos futuros. | `admin.js:1523-1535` | 2 | S | bajo | Mostrar "Antes → Ahora" y una línea de alcance. | Sí |
| A04 | Rechazo de comercio | D | El botón de confirmar es rojo inline cuando el rechazo no es definitivo y pasa a `btn-peligro` cuando lo es; el cambio de color es el inverso de la gravedad. | `admin.js:472-478` | 1 | S | bajo | Se resuelve con T03. | No |
| A05 | `admin-dashboard` | A | Tres "Cargando..." escritos literalmente en el HTML en lugar de un skeleton. | `admin-dashboard.html:18`, `:29`, `:56` | 1 | S | bajo | Skeleton de línea. | No |

---

## 5. Heurísticas que no aplican, por pantalla o grupo

| Grupo | No aplican | Motivo |
|---|---|---|
| Landing y acceso (`splash`, `bienvenida`, `registro-tipo-cuenta`, `seleccionar-contexto`) | E, I | No hay acciones destructivas ni entrada de datos que validar; la pantalla solo elige un camino. |
| Textos legales y Preguntas frecuentes | A, E, G | Son páginas de lectura sin estado ni acciones. Se evaluaron J (ayuda) y D (pies de enlaces). |
| Páginas de error (`errores/*`) | E, F, G, H | Una acción primaria y una secundaria, sin entrada de datos. |
| Formularios de ingreso (`login`, `verificar-email`, `recuperar-password`, `reactivar-cuenta`) | C | Son pantallas de un solo paso con "Volver" simple; no hay trabajo en curso que proteger. |
| Catálogo, detalle de comercio, carrito (solo lectura y edición liviana) | J | La ayuda de reglas aparece recién en checkout y pedidos. |
| Listados del Administrador (Clientes, Dueños, Comercios, Reclamos, Soporte) | B | El vocabulario es de operación interna y los términos ("Dueño", "suspender", "Re-solicitudes") son los del equipo. |
| Pantallas de solo lectura del Administrador (equipo y actividad de un comercio) | E, I | No hay entrada de datos ni acciones. |
| Pantallas de estado del comercio (`comercio-pendiente`, `-rechazado`, `-rechazo-definitivo`) | G | Una sola acción posible por estado. |
| Notificaciones de todos los roles | E | La única acción es marcar como leída, reversible por naturaleza. |

---

## 6. Relación con lo ya conocido

| Tema previo | Qué dice esta auditoría |
|---|---|
| **Modales de color amarillento** | **Confirmado en parte.** La hoja es blanca; lo que se percibe es el amarillo de las cajas de advertencia dentro de las hojas de suspensión y levantamiento (T04), el crema de las cajas y de "Cancelar", y el fondo oscuro cálido. Recomendación: sacar el amarillo de las hojas de decisión. |
| **Modales con demasiado texto** | **Confirmado** en las hojas de suspensión y levantamiento de Dueños (≈7 bloques y pie fijo que corta el contenido) (T04). El resto de las hojas de confirmación son breves. |
| `AUDITORIA-ESCRITORIO.md` §1 `sticky` dentro de `overflow:hidden` | No relevado aquí; sigue como verificación pendiente de E0. |
| §1 `chip-row` sin barra | Reforzado (T10, C04): afecta usabilidad con mouse y la lectura de filtros de tags y categorías. |
| §5 Sin foco atrapado en las hojas | Confirmado y ampliado con la medición de `Escape` y `role="dialog"` (T02). |
| §5 Gesto de mantener apretado solo táctil | Confirmado y agregado el bloqueo del menú contextual (T15). |
| §3.3 Gráfico de estadísticas de 10 px | Reaparece como K04. |
| §11 puntos 1 y 3 (inline styles, tokens) | Los estilos inline de los botones destructivos son parte de T03. |
| `CLAUDE.md` §9 pulido pendiente: "Marcar todas" del Cliente | Reaparece como C06. |

---

## 7. Propuesta de agrupación en tramos

### 7.1 P1: pulido de componentes compartidos (antes del escritorio)

Orden sugerido, de lo que más pesa y menos cuesta a lo que más cuesta:

| Orden | Contenido | Hallazgos | Costo | Riesgo tests |
|---|---|---|---|---|
| 1 | Red y sondeos: opciones por defecto seguras y banner en lugar de redirección | T01 | M | medio |
| 2 | Toast con duración, pausa y `alert` | T06 | S | bajo |
| 3 | Mensaje correcto al vencer la sesión | T17 | S | medio |
| 4 | Ayuda en los tres perfiles | T14 | S | bajo |
| 5 | Helper único de hoja y migración de las destructivas (anular, rechazar, desvincular, vaciar, logout) y del patrón "enviar y cerrar" | T02, T03, T05, T07 | L | medio |
| 6 | Reglas de contenido y color de hojas (se hace dentro del paso 5 para las de suspensión) | T04 | M | bajo-medio |
| 7 | Skeletons del Cliente y botones en espera | T13 | M | bajo |
| 8 | Contraste y zonas táctiles | T08, T09 | M | bajo |
| 9 | Errores de campo accesibles | T12 | M | bajo |
| 10 | Foco y hover; destinos lógicos de "Volver"; pista del gesto; textos de estado | T10, T11, T15, T16 | M | bajo-medio (T10 y T11 conviene hacerlos con E0) |

### 7.2 Por rol, junto con su tramo de escritorio

| Tramo | Hallazgos que se resuelven ahí |
|---|---|
| E0 Acceso | P01, P04, P02, P03 |
| E1 Comercio | K01, K02, K03, K04 |
| E2 Administrador | A01, A02, A03 |
| E3 Cliente | C03, C04, C02, C05 |

**Fuera de los tramos y antes de todo: C01, K01 (como corrección mínima: recarga de la lista en el sondeo) y T01.** Son graves, de costo S o M y no dependen del escritorio.

### 7.3 Diferidos

C05 (paso de modalidad), C06 (endpoint de avisos personales), A04 y A05 (cosméticos que se corrigen solos con T03 y T13), K05, P02 y P03 (cosméticos baratos que pueden ir en cualquier pasada).

---

## 8. Decisiones para Diego (de producto)

| # | Decisión | Recomendación |
|---|---|---|
| 1 | ¿El Cliente confirma antes de cancelar un pedido? | Sí, con una hoja que diga qué pasa con el pago según el estado. Es lo más urgente. |
| 2 | ¿El panel del comercio tiene sonido y destaque al entrar un pedido? | Recarga automática siempre; sonido encendido por defecto con interruptor visible en el panel (en un mostrador es lo que evita perder ventas). Si preferís no tener sonido, al menos el resaltado "Nuevo". |
| 3 | ¿Qué hace la app cuando se corta la red? | Banner no bloqueante con "Reintentar" en las pantallas con formulario o acción en curso, y página de error solo en la carga inicial. |
| 4 | Estilo del botón de acción destructiva | Un rojo sólido único; el naranja queda para la acción principal no destructiva; "Cancelar" siempre gris con borde. |
| 5 | Reglas para las hojas | Una idea, hasta 3 líneas y como máximo 2 botones; el detalle va en la pantalla de origen; sin amarillo dentro de hojas de decisión. |
| 6 | ¿Cuántos clics hasta Ayuda en cada rol? | Una fila "Ayuda" en el perfil de Cliente, Dueño y Empleado (Preguntas frecuentes, Nueva consulta, Términos y Privacidad). El Administrador no la necesita. |
| 7 | ¿Se oscurece el naranja de marca para que el texto blanco pase AA? | Sí, a un valor cercano a `#d33a00` (4,80:1); el cambio de aspecto es mínimo y se toca un solo token. Si no, subir el tamaño del texto de los botones. |
| 8 | ¿"Despachar" y "Confirmar recibido" piden confirmación? | Confirmación breve en ambas (el despacho avisa al cliente; la confirmación de entrega es irreversible). Aceptar pedido queda sin confirmación. |
| 9 | ¿Se avisa al Administrador de reembolsos trabados desde el panel? | Sí, con un contador como el de Reclamos. |

---

## 9. Lo que no pude verificar

- **Nada se vio en un navegador.** Todo lo de aspecto sale del CSS o de tres capturas existentes (`capturas-suspension-dueno/02` y `/10`, `capturas-documentos/17`).
- **T01**: la redirección por red caída o 5xx en un sondeo de fondo la deduzco del código (`redirectTo` en `apiFetch`, sin opciones en `refrescarComercios`); no la reproduje cortando la red.
- **K01**: que la lista no se actualice sola se deduce de que no hay ningún sondeo de pedidos; no probé qué tan visible es el cambio de la campana ni si el equipo la mira. No sé si hay un aviso sonoro del navegador fuera de `js/`.
- **T13**: que las pantallas del Cliente aparezcan vacías mientras cargan es una deducción de la falta de indicadores en el código.
- **P03 y P04**: no leí el texto armado por JS de `verificar-email` ni comprobé si `index.html` redirige por rol.
- **Sin leer a fondo**: `reclamo-nuevo`, `soporte` y `soporte-consulta`, `invitacion-empleado`, `comercio-producto-form`, `comercio-documentacion`, `agregar-comercio`, `comercio-corregir`, `admin-reembolsos` (si "Reintentar" confirma), `admin-documento-revision`, `admin-soporte`. Los que ya tienen descarte de cambios, vista previa y confirmación quedan sin hallazgos solo porque no los cuestioné, no porque estén verificados.
- **Lectores de pantalla y teclado en vivo**: no se probó; los hallazgos de accesibilidad son de estructura (atributos), no de uso.
- **Riesgo para tests**: estimado por lectura; no se corrió ningún spec.
- **Contraste**: calculado sobre los tokens de `:root`; no medí colores renderizados ni fondos con transparencia.

---

## 10. Los 15 hallazgos que más conviene arreglar primero

Ordenados por severidad y, dentro de cada una, por costo.

| # | Id | Hallazgo | Sev | Costo |
|---|---|---|---|---|
| 1 | C01 | Cancelar pedido sin confirmación, también con pago hecho | 4 | S |
| 2 | T01 | Errores de red y sondeos expulsan a pantalla de error y pierden lo escrito | 4 | M |
| 3 | K01 | Panel y lista de pedidos del comercio sin actualización automática ni aviso | 4 | M |
| 4 | T06 | Toast de error de 2,2 s sin pausa ni cierre | 3 | S |
| 5 | T17 | Sesión vencida mostrada como "iniciaste sesión en otro dispositivo" | 3 | S |
| 6 | T14 | Ningún rol autenticado llega a las Preguntas frecuentes | 3 | S |
| 7 | C02 | Confirmar recepción del pedido de un toque | 3 | S |
| 8 | C03 | Detalle del pedido sin actualización salvo "Esperando pago" | 3 | M |
| 9 | T07 | Hojas que se cierran antes de enviar y pierden lo escrito | 3 | M |
| 10 | K02 | Anular y rechazar pedido sin explicar la consecuencia | 3 | M |
| 11 | A02 | Reembolsos para revisar sin contador en el panel | 3 | M |
| 12 | T13 | Pantallas del Cliente sin indicador de carga | 3 | M |
| 13 | T04 | Hojas con demasiado texto y cajas amarillas | 3 | M |
| 14 | T02 | Hojas sin helper común: sin `Escape`, foco ni `role="dialog"` | 3 | L |
| 15 | P01 | Registros largos sin protección al salir | 3 | M |

El A01 (navegación del Administrador) es severidad 3 pero costo L: queda dentro de E2 y por eso no figura en esta lista.

---

## Estado de los bloques

- Bloque 1 completo (componentes transversales: 17 hallazgos).
- Bloque 2 completo (público y acceso: 4 hallazgos).
- Bloque 3 completo (Cliente: 6 hallazgos).
- Bloque 4 completo (Comercio: 5 hallazgos).
- Bloque 5 completo (Administrador: 5 hallazgos).
- Bloque 6 completo (este documento).

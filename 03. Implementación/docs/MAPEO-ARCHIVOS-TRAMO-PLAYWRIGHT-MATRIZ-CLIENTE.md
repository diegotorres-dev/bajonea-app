# Mapeo del tramo — Matriz exhaustiva de testeo Playwright (Cliente), 2026-09-03

Insumo: `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` (Partes 1, 2 y 4) + el tramo de corrección de
bugs cerrado justo antes de este (`docs/MAPEO-ARCHIVOS-TRAMO-BUGS-CLIENTE.md`) — se empezó
recién después de aplicar y verificar esos 3 fixes, para no construir specs sobre
comportamiento que se iba a corregir en el camino. Cubre los 12 formularios/flujos de
Cliente ya inventariados, con foco exclusivo en lo que realmente necesita navegador real
(bloqueo de teclado, formateo en vivo, mensajes visibles cerca del campo, habilitación/
deshabilitación de botones, boundary visual) — no repite mecánicamente la matriz de Postman
ya cerrada. **No cerrado — pendiente de confirmación explícita de Diego**, mismo criterio
que el resto de los tramos del proyecto.

---

## 1. Organización elegida

Un archivo nuevo por bloque de formularios afines (no uno solo gigante, no uno por
formulario individual — 3 archivos, mismo criterio de "carpeta por formulario" que ya usó la
matriz de Postman, pero agrupando formularios chicos y afines para no fragmentar en exceso):

| Archivo | Formulario(s) de la auditoría | Tests |
|---|---|---|
| `10-recuperacion-y-reactivacion.spec.ts` | 4. Recuperación de contraseña + 5. Reactivación de cuenta | 6 |
| `11-perfil-cliente.spec.ts` | 6. Edición de perfil + 7. Cambio de contraseña + 8. Foto de perfil | 10 |
| `12-carrito-checkout-explorar.spec.ts` | 9+10. Carrito (boundary visual) + 11. Checkout (habilitación/bloqueo) + 12. Explorar | 6 |

Además, **1 test sumado directamente a `01-registro-y-verificacion.spec.ts`** (ya existente,
formulario 1) en vez de un archivo nuevo: bloqueo de teclado de DNI/teléfono en tiempo real,
único caso de "comportamiento de navegador" de ese formulario que la Fase 17 original no
había cubierto todavía (esa fase probaba el flujo feliz y los negativos de backend, no la
UX del filtrado en vivo). No se tocó el resto de los formularios ya cubiertos por specs
existentes (2. Login, 3. Verificación, 9/10. Carrito golden path, 11. Checkout golden path)
más allá de lo que ya tenían.

**23 tests nuevos en total** (22 en los 3 archivos nuevos + 1 en el archivo existente), sobre
los 36 tests que ya tenía la Fase 17 (35/36 en verde + 1 aceptado) — **59 tests en total**.

## 2. Qué se decidió NO repetir de Postman

Por diseño, ninguno de los 23 tests nuevos duplica un caso de formato/límite que Postman ya
prueba a nivel de API sin que el navegador aporte nada (ej. no se repite cada variante de
DNI/CUIT/email inválido campo por campo) — se cubre 1 caso representativo por campo cuando
hace falta, y el resto del esfuerzo va a los 8 puntos de la lista de cobertura del prompt:
mensaje visible cerca del campo, bloqueo de teclado, boundary visual, habilitación/
deshabilitación de botones, flujos multi-paso con error intermedio, OTP, carrito/checkout, y
explorar.

## 3. Formulario 4 — Recuperación de contraseña (`10-recuperacion-y-reactivacion.spec.ts`)

- Paso 1 (email): vacío y formato inválido, mensaje visible cerca del campo, sin avanzar de
  paso (`input-codigo-verificacion` sigue oculto).
- **Flujo completo de punta a punta por UI** (los 3 pasos reales, no solo por API como hace
  el helper `fijarPasswordAdminYLoguear`): código incorrecto en el paso intermedio no deja
  avanzar (`401`, error visible, campo de nueva contraseña sigue oculto) — cubre el punto 5
  de la cobertura pedida ("error en un paso intermedio, no te deja avanzar"); código real
  (vía bypass de test) sí avanza; fortaleza visual reacciona en vivo (0 barras para "debil",
  4 para una password de 13+ caracteres); confirmación que no coincide bloquea el submit;
  contraseña nueva confirmada con `200` real, contraseña vieja deja de servir (`login()` por
  API con la vieja falla), la nueva sí loguea — persistencia real, no solo la UI.
- Reenviar código: limpia los boxes del OTP y pide uno nuevo (mismo patrón de limpieza ya
  usado en la Fase 17 original para el bug de entorno conocido).

## 4. Formulario 5 — Reactivación de cuenta (`10-recuperacion-y-reactivacion.spec.ts`)

- Paso 1 (email): mismo patrón que recuperación.
- **Sin cobertura del flujo feliz completo — gap real, no una omisión.** No existe ninguna
  vía real de API en el MVP para dejar una cuenta en `EstadoUsuario.INACTIVO` (sin job de
  inactivación automática, sin baja de cuenta propia, sin suspensión de Administrador) —
  mismo gap ya confirmado en el cierre de Fase 14 y en la matriz de Postman de este mismo
  bloque de tramos (`docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md`, punto 7). Lo que
  SÍ es real y se prueba: `AuthService.solicitarReactivacionCuenta` no genera ningún token
  para una cuenta ya `ACTIVO` (anti user-enumeration) — así que pedir reactivación para un
  Cliente normal y después mandar cualquier código siempre da un rechazo real (`401`/`409`,
  no simulado), mismo caso único alcanzable que ya documentaba Postman para este formulario.
- OTP de reactivación: bloqueo de teclado en tiempo real (letra descartada, solo 1 dígito por
  casillero), mismo componente compartido `js/otp.js` que usan verificación y recuperación.

## 5. Formulario 6 — Edición de perfil de Cliente (`11-perfil-cliente.spec.ts`)

- `nombre`/`apellido` vacío y formato inválido: mensaje visible cerca del campo correcto.
- **Boundary visual real de `maxlength=100`:** tipear 105 caracteres en el input de nombre
  deja como mucho 100 en el DOM — el HTML bloquea físicamente, no es solo un límite de
  backend (punto 3 de la cobertura pedida).
- **Bloqueo de teclado en tiempo real del teléfono:** tipear letras/símbolos mezclados con
  dígitos los descarta carácter por carácter mientras se tipea, no solo al enviar.
- Guardar datos válidos: toast + encabezado del perfil actualizado en la UI, **y persistencia
  real confirmada por `GET /clientes/perfil`** después (nombre/apellido/teléfono
  normalizados como se esperaba).

## 6. Formulario 7 — Cambio de contraseña desde perfil (`11-perfil-cliente.spec.ts`)

- Campos vacíos: 3 mensajes visibles simultáneos, uno por campo.
- Contraseña nueva que no cumple la política: mensaje real de complejidad visible (con la
  advertencia de que un valor de menos de 8 caracteres nunca llega a ese mensaje — lo
  bloquea antes el `minlength=8` nativo del input con el mensaje genérico de "campo vacío";
  hallazgo documentado en el código del test, no un bug, solo un límite de HTML que compite
  con la validación JS y hay que esquivar al elegir el valor de prueba).
- Fortaleza visual en vivo + confirmación que no coincide bloquea el submit.
- **2 intentos con la contraseña actual incorrecta muestran el aviso real de "un intento más
  y se bloquea" recién en el segundo intento** (no en el primero) — probado contra el
  contador real de `AuthService.registrarIntentoFallido` (`MAX_INTENTOS_FALLIDOS=3`), sin
  llegar nunca a bloquear la cuenta (el 3er intento usa la contraseña correcta, que además
  resetea el contador). El cambio exitoso invalida la sesión real (`clearSesion()` +
  redirect a `login.html?passwordActualizada=1`) y la contraseña nueva looguea de verdad.

## 7. Formulario 8 — Foto de perfil de Cliente (`11-perfil-cliente.spec.ts`)

- Archivo > 5MB y archivo con formato no permitido: rechazados **en el cliente**, con toast
  visible y **sin llegar a pedir la firma de Cloudinary** (confirmado escuchando el evento
  `request` de Playwright — 0 requests a `/foto-perfil/firma`).
- Flujo completo subir → editar → eliminar contra Cloudinary real (misma cuenta ya usada por
  la Fase 17 para productos), con el mismo editor de recorte (`js/crop.js`) reusado del
  registro de Comercio y del CRUD de productos — reaprovecha el helper de patrón ya
  establecido (`subirFotoViaCropUi` de `06-crud-productos.spec.ts`), adaptado al endpoint de
  usuario. Persistencia real confirmada leyendo `GET /clientes/perfil` con el mismo token de
  sesión (ver punto 9 más abajo).
- Aislamiento entre usuarios: un Cliente no puede tocar la foto de otro (`404`, no `403` —
  `UsuarioService.validarPropioUsuario` no revela que el id ajeno existe).

## 8. Formularios 9+10 — Carrito, boundary visual (`12-carrito-checkout-explorar.spec.ts`)

- **Hallazgo real de UI, no corregido en este tramo:** el stepper del modal de producto
  (`catalogo.js`) arranca en cantidad 1 con el botón "−" habilitado (no reproduce el piso
  visualmente hasta el primer click), porque `actualizarStepper()` solo se llama desde los
  listeners de click, nunca al crear el stepper. Funcionalmente no se puede bajar de 1 en
  ningún momento (`Math.max(1, ...)`), pero el botón no lo refleja al abrir el modal —
  inconsistente con el resto de los steppers del proyecto (`carrito.html` sí lo deja bien
  puesto desde el primer render, `plusBtn.disabled` se fija en la creación misma del nodo).
  Documentado en el propio test con el comportamiento real, no oculto ni forzado a pasar.
- Techo real en 20: clampeo confirmado botón por botón hasta el límite exacto (19 habilitado,
  20 deshabilitado, ni uno antes ni uno después) — en el modal de producto y en `carrito.html`
  (este último con el ítem ya sembrado en 20 vía API, confirmando que el estado inicial de
  carga SÍ refleja el límite correctamente, a diferencia del piso del modal).
  Persistencia real confirmada con `SELECT` directo sobre `item_carrito.cantidad = 20`.
- `input-nota-producto`: `maxlength=255` real, boundary visual confirmado (260 tipeados,
  quedan 255).

## 9. Formulario 11 — Checkout (`12-carrito-checkout-explorar.spec.ts`)

- **Habilitación de botón real:** "Continuar" del paso 1 arranca `disabled` (atributo HTML,
  no solo estilo) y recién se habilita al elegir una modalidad — punto 4 de la cobertura
  pedida.
- **DOMICILIO sin dirección cargada: única excepción documentada a la convención de "nunca
  mockear" del proyecto.** No hay ninguna vía real de API para dejar a un Cliente sin
  dirección (obligatoria en el registro, sin endpoint de baja) — mismo gap que Postman ya
  había marcado como "omitido, no simulable". La rama de código SÍ existe y es real
  (`js/checkout.js`, `renderStep2`, `if (!cliente.direccion)`, con un mensaje real: "No
  tenés una dirección registrada..."), así que se intercepta puntualmente
  `GET /clientes/perfil` con `page.route(...)` para forzar `direccion: null` y ejercitar esa
  rama — documentado en un comentario largo dentro del propio test explicando por qué es la
  única excepción del proyecto a "siempre contra el backend real". Confirma que la UI
  muestra un mensaje real, no una pantalla en blanco.

## 10. Formulario 12 — Explorar (`12-carrito-checkout-explorar.spec.ts`)

- **Debounce real de 300ms, probado con el reloj virtual de Playwright (`page.clock`), no
  con esperas de tiempo real.** Un primer intento con `waitForTimeout` real corriendo contra
  un debounce de 300ms resultó ser una carrera genuina — falló de forma intermitente (a
  veces 1 request de más, a veces de menos) tanto corriendo el archivo solo como corriendo
  la suite completa bajo más carga del sistema. Reescrito con `page.clock.install()` +
  `page.clock.pauseAt(...)` (con un margen real mínimo de 50ms para que la pausa quede
  aplicada del todo antes de tipear, ver el comentario en el propio test) + `runFor(350)`:
  19 caracteres tipeados uno por uno con el reloj congelado no disparan ningún request hasta
  que se avanza el tiempo virtual a mano, y ahí dispara exactamente 1 (el último timer vivo,
  nunca los 18 cancelados en el camino por los sucesivos `clearTimeout`). Confirmado
  reproducible en 2 corridas completas de la suite (58/59 ambas veces, mismo único fallo
  aceptado de Fase 17).
- Categoría + tag combinados: filtran junto con el texto de búsqueda (`AND` de los 3
  criterios, no solo el último aplicado).
- "Sin resultados": mensaje real visible (`estado-vacio`, "Sin resultados", "Probá con otro
  filtro..."), no una lista vacía sin explicación.

## 11. 4 bugs propios encontrados y corregidos DURANTE la escritura de los tests (no de la app)

Ninguno de estos 4 es un bug de Bajoneá — los 4 eran errores en mi propio código de test,
encontrados por la primera corrida real de la suite (evidencia real, no supuesta) y
corregidos antes de dar el tramo por bueno:

1. Un locator encadenado mal construido (`barras.locator('.strength-meter__bar--filled')`)
   buscaba DESCENDIENTES de los divs de la barra de fortaleza, pero la clase `--filled` se
   agrega a los mismos divs, no a hijos nuevos — nunca podía encontrar nada. Corregido a un
   selector plano en los 2 archivos que probaban el indicador de fortaleza.
2. Un valor de prueba de 5 caracteres ("debil") para "contraseña insegura" en 2 tests
   disparaba el `minlength=8` nativo del HTML antes de llegar al mensaje de complejidad de
   `esPasswordSegura()` que se quería probar — corregido a un valor de 8+ caracteres sin
   mayúscula/número.
3. Un password de 11 caracteres ("Fuerte12345") para "las 4 barras llenas" se quedaba en 3/4
   según `calcularFortalezaPassword` (el 4to punto exige símbolo especial O longitud ≥ 12) —
   corregido a 12+ caracteres.
4. Una re-autenticación por API a mitad de un test (`login(request, ...)` después de ya
   haber logueado por UI) invalidaba la sesión real del navegador -- Bajoneá tiene sesión
   única por cuenta (`Sesion.activa`), mismo criterio ya documentado como convención de test
   en `CLAUDE.md` (entrada de cierre de Fase 17: "todo el setup por API de una cuenta va
   antes que su login por UI dentro del mismo test") que este tramo pasó por alto en un
   primer borrador. Corregido leyendo el token directo de `localStorage` del navegador
   (`bajonea_token`) en vez de loguear de nuevo por API.
5. El test de debounce con espera de tiempo real (no listado arriba como bug de test común,
   ya descripto en el punto 10) — mismo criterio, encontrado y corregido con evidencia real.

## 12. Evidencia de la corrida final

- `npm run test:reset` corrido 2 veces consecutivas antes de sendas corridas completas.
- **58/59 en verde en ambas corridas** (`--workers=1`), mismo único fallo aceptado de
  siempre: `07-crud-categorias-tags.spec.ts`, edición de categoría (bug de layout
  preexistente del FAB de Administrador, ya documentado y aceptado en el cierre de Fase 17
  — no tocado ni re-investigado en este tramo, sigue siendo el mismo).
- Persistencia real confirmada con `SELECT` directo contra `bajonea_test` (no solo
  `GET`/toast de la UI): `persona_fisica.nombre`/`apellido`/`telefono` actualizados tras el
  test de edición de perfil; `item_carrito.cantidad = 20` tras el test de boundary de
  carrito; `tag`/`comercio` de los tests de Explorar y Checkout presentes.
- Sin necesidad de limpieza manual adicional: `bajonea_test` es la misma base que resetea
  `npm run test:reset` antes de cada corrida real (mismo criterio que el resto de la Fase 17
  — no es `bajonea_final`, así que los datos de las corridas de esta sesión quedan hasta el
  próximo reset, sin riesgo para datos reales).

## 13. Pendiente, no resuelto en este tramo

- Formulario 5 (reactivación): flujo feliz completo sin cobertura real posible (gap de
  backend ya documentado, ver punto 4).
- Hallazgo de UI del punto 8 (stepper del modal de producto sin piso visual hasta el primer
  click) — documentado, no corregido, pendiente de decisión de Diego.
- El resto de los formularios de Cliente ya tenían su cobertura de navegador cerrada en la
  Fase 17 original (Login, Verificación, Carrito/Checkout golden path) — no se tocaron más
  allá de lo ya construido acá.

Con este tramo, y a la espera de la confirmación de Diego, queda completa la cobertura
exhaustiva (Postman + Playwright) de los 12 formularios de Cliente. Comercio y
Administrador quedan para tramos aparte, después de que confirme este.

**No cerrado.** A la espera de que Diego confirme el checklist completo antes de dar por
terminado este tramo — mismo criterio que el resto de los tramos del proyecto.

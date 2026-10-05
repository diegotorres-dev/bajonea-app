# Mapeo de archivos — Perfeccionamiento de validaciones: Producto (2026-09-02)

> Pendiente de confirmación explícita de Diego antes de cerrarse. Ver entrada completa en
> `docs/DECISIONES.md`, "2026-09-02 — Perfeccionamiento de validaciones: `ProductoRequestDTO`
> (alta/edición de producto)".

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `backend/src/main/java/com/bajonea/backend/dto/request/ProductoRequestDTO.java` | `precio`: `@Digits(integer=8, fraction=2)` → `@Digits(integer=8, fraction=0, message=...)` (ya no admite centavos desde este DTO); `@Positive` y `@NotNull` suman mensaje en español. `nombre` sin cambios de anotación (ya tenía `@Pattern` propio con mensaje). |
| `frontend/js/validators.js` | Función nueva `esPrecioValido(valorFormateado)` — verifica 1 a 8 dígitos tras sanitizar. |
| `frontend/js/comercio.js` | Import de `esPrecioValido`. `initComercioProductoForm`: (1) listener de `input` del campo precio recorta a 8 dígitos reales antes de formatear (bug real corregido, ver abajo); (2) precarga en modo edición usa `Math.trunc` en vez de `Math.round` (bug real corregido); (3) submit separa `nombre` en vacío/formato (`validarCamposRequeridosSilencioso`) y separa `precio` en 3 mensajes distintos (vacío / formato-más-de-8-dígitos / rango-$0-o-negativo), reemplazando el mensaje único combinado anterior. |
| `frontend/comercio-producto-form.html` | `maxlength="10"` agregado al input de precio (tope defensivo secundario; el tope real de 8 dígitos vive ahora en el handler de `comercio.js`). |
| `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` | Fila "Precio / campo numérico con decimales" de la Parte 2 reemplazada por "Precio entero con separador de miles (sin centavos)", documentando el patrón real implementado. Sección "Precio de Producto" (Parte 3) actualizada de "caso abierto" a "resuelto en el tramo del 2026-09-02". |
| `docs/DECISIONES.md` | Entrada nueva con el detalle completo de discrepancias encontradas, decisiones tomadas con Diego, implementación y evidencia. |

## Bugs reales encontrados y corregidos (no pedidos explícitamente en el prompt de arranque)

1. **Precarga de edición redondeaba en vez de truncar** (`Math.round` → `Math.trunc`): un
   producto con centavos ya guardados (dato heredado o insertado por otra vía) se mostraba
   redondeado en el formulario de edición, pudiendo diferir del valor realmente persistido.
2. **`maxlength` HTML no frenaba el tecleo de más de 8 dígitos**: el listener de `input` reescribe
   `.value` completo en cada tecla vía `formatearMilesInput`, y esa asignación por JS no respeta
   el `maxlength` del navegador (que solo actúa sobre tecleo directo). Corregido recortando a 8
   dígitos reales dentro del propio handler, antes de formatear.

## Discrepancias encontradas en la re-auditoría (resueltas con Diego antes de implementar)

1. `nombre` de producto ya tenía un patrón de formato propio (`@Pattern` + `esNombreProductoValido`),
   distinto al "texto libre permisivo" que suponía el prompt de arranque — se mantuvo tal cual,
   solo se separaron los mensajes de vacío/formato.
2. El frontend de `precio` no soporta centavos (nunca los soportó) — el prompt de arranque pedía
   habilitar coma decimal, justo lo opuesto. Se confirmó con Diego que el comportamiento entero
   actual es el correcto para el rubro en Argentina, y se generó un prompt de corrección con el
   alcance real.

## Evidencia (resumen — detalle completo en `docs/DECISIONES.md`)

- `curl` contra `POST /api/v1/productos`: 7 casos (nombre vacío, nombre formato inválido, precio
  ausente, precio 9 dígitos, precio $0, precio negativo, precio 8 dígitos límite) — cada uno con
  el mensaje esperado, distinto entre vacío/formato/rango.
- `SELECT` directo contra `bajonea_final.producto` confirmando persistencia exacta de los casos
  válidos, sin corrupción de formato.
- Navegador real (Chrome vía MCP, frontend + backend reales): formulario de alta con los mismos
  casos, formulario de edición con un dato heredado de centavos (`1234.56` insertado por SQL)
  confirmando el fix de truncado de punta a punta (mostrado y guardado coinciden en `1234`/`1234.00`).
- Verificación de sintaxis (`node --check` sobre copia `.mjs`) para `comercio.js`/`validators.js`.
- Datos de prueba (usuario id 144, comercio id 52, 3 productos, y toda la cadena de tablas
  relacionadas) eliminados de `bajonea_final` al finalizar, confirmado con `SELECT COUNT(*)` en
  cero.

# Mapeo de archivos — Fase 4 (visual y copy menor)

Detalle de qué se tocó y por qué, punto por punto. Ver `docs/DECISIONES.md` (entradas del
2026-08-31, "Corrección de `CLAUDE.md`..." y "Fase 4: visual y copy menor...") para el
razonamiento completo y la evidencia de verificación.

## Corrección previa de `CLAUDE.md`

| Archivo | Cambio |
|---|---|
| `CLAUDE.md` | §1bis: `Dueño`/`RedSocial` sacados de "pendientes de planificación" (ya implementados). 3 menciones de `spring.datasource.url=...bajonea` corregidas a `bajonea_final` (§1bis x2, §7.1, §9). |

## 4.1 + 4.2 — Toasts

| Archivo | Cambio | Motivo |
|---|---|---|
| `frontend/css/styles.css` | Nueva regla `.toast .banner-error` (solid `var(--color-error)` + texto blanco) | Faltaba el equivalente de `.toast .banner-success`; sin ella todo toast de error caía al estilo pastel base, compartido con banners inline persistentes de todo el proyecto. |
| `frontend/js/comercio.js` | 2 líneas: `renderBanner(...)` → `showToast(...)` en las 2 ramas de `validarArchivoImagen()` (foto de perfil ~línea 883, galería de producto ~línea 1633) | Decisión de Diego tras la auditoría 4.1: unificar Comercio con el comportamiento que ya tenían Cliente/Administrador para la misma función de validación. |
| `frontend/js/comercio.js` | 1 línea nueva: `showToast('Datos actualizados correctamente')` tras `mostrarVista('view-principal')` en "Editar perfil" | No existía ningún feedback de éxito al guardar datos personales. |
| `frontend/js/cliente.js` | 1 línea nueva: mismo `showToast(...)` tras `mostrarVista('view-principal')` en "Editar datos personales" | Mismo gap que Comercio. |

Administrador y Empleado no se tocaron: Administrador no tiene endpoint de autoedición de perfil
(`AdministradorController` solo expone `GET`), Empleado no existe todavía en el frontend.

## 4.3 — Sin cambios

Ya cerrado en Fase 1. No se tocó ningún archivo.

## 4.4 — Badge "obligatorio"

| Archivo | Cambio |
|---|---|
| `frontend/registro-comercio.html` | Paso 1: `"obligatorio"` envuelto en `<span class="field__label-badge">` |
| `frontend/css/styles.css` | Clase nueva `.field__label-badge` (pill naranja sólido, texto blanco) |

## 4.5 — Dropdown de red social

| Archivo | Cambio |
|---|---|
| `frontend/js/auth.js` | `crearFilaRedSocial()`: placeholder de `poblarSelect(...)` cambiado de `'Tipo de red social'` a `'Elegir'` |

## 4.6 — Aviso de comercio en revisión

| Archivo | Cambio |
|---|---|
| `frontend/comercio-pendiente.html` | Ícono+título+texto envueltos en `<div class="revision-alert">` nuevo; botón de acción queda fuera del banner, sin cambios de flujo |
| `frontend/css/styles.css` | Clase nueva `.revision-alert` + 2 overrides por descendencia (`.revision-alert .state-page__icon`, `.revision-alert .state-page__text`). `.state-page` (compartida por 13 pantallas) no se tocó. |

## 4.7 — Bug del FAB gigante

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | Clase nueva `.fab` (+ `.fab:hover`, `.fab svg`) — no existía ninguna regla para esa clase, causa raíz del bug. `position: absolute` anclado a `.app-shell`, círculo de 56px. |

Cascada automática a `comercio-productos.html`, `admin-categorias.html` y `admin-tags.html`
(las 3 comparten `class="fab"`), aunque Diego solo reportó la primera.

## Archivos nuevos

- `docs/DECISIONES.md` — 2 entradas nuevas (corrección de `CLAUDE.md` + Fase 4 completa).
- `docs/MAPEO-ARCHIVOS-FASE4.md` — este archivo.

## Verificación

Backend levantado a mano (perfil `default`, `bajonea_final`) + frontend vía
`.claude/scripts/dev-server-no-cache.py` (puerto 5501). 2 cuentas de prueba reales (Cliente +
Comercio) creadas por API, verificadas con código real, comercio aprobado por `UPDATE` directo
(autorizado explícitamente por Diego). Todo verificado contra el navegador real — texto, clases
CSS y `getComputedStyle` reales para los toasts (las capturas de pantalla de los 3 casos de error
no compusieron frame a tiempo, límite de entorno ya documentado en `CLAUDE.md` Tramos 16.25-17);
capturas de pantalla reales para 4.4, 4.5, 4.6 (antes/después) y 4.7 (antes/después). Datos de
prueba eliminados al finalizar, `COUNT(*) = 0` confirmado en las 13 tablas involucradas.

**Confirmado por Diego (2026-08-31): los 6 puntos cerrados.** Ver `docs/DECISIONES.md` para el
texto exacto de la confirmación.

## Agregado post-cierre: auditoría de toasts en Administrador (4.2)

Pedido de Diego al cerrar la Fase 4: extender la verificación de 4.2 a las 7 pantallas de
Administrador. Detalle completo (inventario de los 12 `showToast()` de `admin.js`, tabla por
pantalla, verificación en navegador) en `docs/DECISIONES.md`, entrada "Agregado a Fase 4 (4.2):
auditoría y verificación de toasts en las 7 pantallas de Administrador". Resumen:

| Archivo | Cambio |
|---|---|
| *(ninguno)* | Auditoría de las 1287 líneas de `admin.js`: los 12 `showToast()` (repartidos en 5 de las 7 pantallas; `admin-comercios.html`/`admin-clientes.html` son de solo lectura, sin toasts) ya usaban la función compartida — cero banners/toasts sueltos para migrar. El fix de CSS ya aplicado en 4.2 cubre Administrador sin tocar código. |

Verificado en navegador real: 1 caso de error (`admin-dashboard.html`, foto de perfil >5MB) + 1
de éxito (`admin-categorias.html`, crear categoría) — ambos con `getComputedStyle` real
(`banner-error`/`banner-success`, colores sólidos correctos). Administrador de prueba temporal
(usuario id 63) creado por `INSERT` directo (autorizado por Diego, para no arriesgar la cuenta
real `admin@bajonea.com`) y eliminado al finalizar, junto con la categoría de prueba creada.

**Pendiente de confirmación explícita de Diego para dar este agregado por cerrado.**

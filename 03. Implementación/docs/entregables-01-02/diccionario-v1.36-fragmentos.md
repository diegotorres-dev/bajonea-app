# Diccionario de datos v1.36 — fragmentos para pegar (fotos del reclamo, migración `V51`)

El archivo vigente (`02. Diseño/03. Diagramas de Bases de Datos/03. Diccionario de Datos/diccionario-de-datos.md`, hoy v1.35) está fuera de las carpetas que el hook del proyecto deja escribir, así que los cambios quedan acá, listos para pegar. Son cuatro: la línea de versión, el párrafo de cambios, las dos tablas nuevas (con la sección de reglas) y las dos filas de la sección de relaciones.

## 1. Encabezado: la línea de versión

Reemplazar `**Versión del modelo:** 1.35` por:

```
**Versión del modelo:** 1.36
```

## 2. Párrafo de cambios (va justo debajo de esa línea, antes del párrafo de la v1.35)

```
**Cambios de la v1.36 (Fase 5, tramo S5, fotos del reclamo, migración `V51`, 2026-11-05):** tablas nuevas `ReclamoFoto` (`reclamo_foto`: metadatos de cada foto adjunta a un reclamo: orden de 1 a 3, nombre original, tipo de contenido, tamaño y fecha) y `ReclamoFotoArchivo` (`reclamo_foto_archivo`: el contenido binario, `LONGBLOB`, en tabla aparte para que ningún listado lo lea, igual que `documento_comercio` / `documento_comercio_archivo`). El Cliente adjunta hasta 3 fotos opcionales (5 MB cada una, JPG, PNG o WebP, validadas por la firma de bytes) **al crear** el reclamo, en la misma transacción; un reclamo enviado no se edita. Solo las ve el Administrador; el Cliente ve solo la cantidad; el Dueño y el Empleado, nada. Nada las borra nunca. Límites por propiedad: `reclamo.fotos.max-cantidad` (3) y `reclamo.fotos.max-bytes` (5 MB). `V51` no toca los reclamos existentes. Ver "Fotos del reclamo (v1.36)" más abajo.
```

## 3. Tablas nuevas (van en el módulo 7, entre el CHECK de `Reclamo` y la sección "Reclamos (v1.35)")

```markdown
### Tabla: ReclamoFoto

**Descripción:** Foto adjunta por el Cliente al crear un reclamo (V51). Hasta 3 por reclamo (el `CHECK` y el `UNIQUE (reclamo_id, orden)` lo garantizan en la base; el servicio lo valida antes con un mensaje claro). Solo metadatos: el contenido vive en `ReclamoFotoArchivo`. Nunca se modifica ni se borra.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador de la foto. |
| `reclamo_id` | INT | NO | — | FK → Reclamo.id, NN | Reclamo al que pertenece la foto. |
| `orden` | INT | NO | — | NN, CHECK 1–3 | Posición de la foto en el envío (1 a 3). |
| `nombre_original` | VARCHAR(255) | NO | — | NN | Nombre del archivo en el dispositivo del Cliente, sin ruta ni caracteres de control; solo informativo. |
| `tipo_contenido` | VARCHAR(50) | NO | — | NN | `image/jpeg`, `image/png` o `image/webp`, detectado por la firma de bytes (no por la extensión ni por el tipo que declara el cliente). |
| `tamano_bytes` | INT | NO | — | NN | Tamaño real del archivo (hasta 5 MB). |
| `fecha_creacion` | DATETIME | NO | — | NN | Momento en que se guardó (el del reclamo). |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE uq_reclamo_foto_orden (reclamo_id, orden)` | `FOREIGN KEY fk_reclamo_foto_reclamo`.

**Restricción:** `CHECK ck_reclamo_foto_orden`: `orden` entre 1 y 3.

---

### Tabla: ReclamoFotoArchivo

**Descripción:** Contenido binario de una foto de reclamo, en tabla aparte para que ninguna consulta de listado lo lea.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `foto_id` | INT | NO | — | PK, FK → ReclamoFoto.id | Foto a la que pertenece el contenido (relación 1:1). |
| `contenido` | LONGBLOB | NO | — | NN | Bytes del archivo (hasta 5 MB). El servidor de base de datos necesita `max_allowed_packet` de al menos 16 MB. |

**Índices:** `PRIMARY KEY (foto_id)` | `FOREIGN KEY fk_reclamo_foto_archivo_foto`.

### Fotos del reclamo (v1.36)

- **Quién las sube y cuándo:** solo el Cliente dueño del pedido, al crear el reclamo (`POST /api/v1/pedidos/cliente/{id}/reclamo` en `multipart/form-data`: parte `reclamo` con el JSON y hasta tres partes `fotos`; el envío JSON de siempre sigue funcionando, sin fotos). Todo o nada: una foto inválida (más de 3, más de 5 MB, formato que no es JPG, PNG ni WebP —un HEIC de iPhone se rechaza con un mensaje que dice qué formatos sirven—) rechaza el envío entero y no crea el reclamo; un segundo envío para el mismo pedido responde `409` y no deja fotos huérfanas.
- **Quién las ve:** `GET /api/v1/administrador/reclamos/{id}` lista las fotos (`id`, `orden`, `nombre`, `tipoContenido`, `tamanoBytes`) y `GET /api/v1/administrador/reclamos/{id}/fotos/{fotoId}` entrega el archivo (`Content-Type` real, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`; una foto de otro reclamo o inexistente es `404`). El bloque `reclamo` del Cliente suma `cantidadFotos`; el del Dueño y el del Empleado no cambian.
- **Persistencia:** nada se borra nunca (sin endpoint ni cascada); las fotos se guardan en la base.
```

## 4. Sección 10 (Relaciones entre tablas): dos filas nuevas, a continuación de la fila 22b (`NotaCredito.reclamo_id`)

```markdown
| 22c | `ReclamoFoto` | `reclamo_id` | `Reclamo` | N:1 | 1 reclamo → 0 a 3 fotos | Fotos que el Cliente adjuntó al crear el reclamo (V51). Solo las ve el Administrador. |
| 22d | `ReclamoFotoArchivo` | `foto_id` | `ReclamoFoto` | 1:1 | 1 foto → 1 contenido | Contenido binario de la foto (V51), en tabla aparte. |
```

(La numeración 22c y 22d es provisoria: si esa sección ya usa otras, seguir su numeración. Las restricciones UNIQUE de la sección 11 suman `uq_reclamo_foto_orden (reclamo_id, orden)`.)

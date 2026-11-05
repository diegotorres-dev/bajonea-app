# Diccionario de datos v1.37 — fragmentos para pegar (inactivación por falta de uso, migración `V52`)

El archivo vigente (`02. Diseño/03. Diagramas de Bases de Datos/03. Diccionario de Datos/diccionario-de-datos.md`, hoy v1.36 con los fragmentos de `diccionario-v1.36-fragmentos.md` pegados) está fuera de las carpetas que el hook del proyecto deja escribir, así que los cambios quedan acá, listos para pegar.

## 1. Encabezado: la línea de versión

Reemplazar `**Versión del modelo:** 1.36` por:

```
**Versión del modelo:** 1.37
```

## 2. Párrafo de cambios (justo debajo de esa línea, antes del párrafo de la v1.36)

```
**Cambios de la v1.37 (Fase 5, tramo S6, inactivación automática por falta de uso, migración `V52`, 2026-11-05):** `Usuario.fecha_ultimo_acceso` pasa a `DATETIME NOT NULL DEFAULT current_timestamp()` (antes admitía `NULL`; la migración deja a todas las cuentas existentes con la fecha de la migración, de modo que nadie queda inactivo el día del despliegue) y suma el índice `idx_usuario_estado_ultimo_acceso (estado, fecha_ultimo_acceso)`; `Sesion.tipo_cierre` suma `INACTIVIDAD` (al final del ENUM, cambio de metadatos); `Pedido` suma el índice `idx_pedido_comercio_fecha_creacion (comercio_id, fecha_creacion)`. Sin tablas ni columnas nuevas. Cambios de comportamiento: un proceso diario pasa a `INACTIVO` las cuentas `ACTIVO` con último acceso anterior a 3 meses calendario (salvo Administrador, cuentas con un pedido en curso y, para un Dueño, con un pedido en cualquier estado en los últimos 3 meses en alguno de sus comercios) y sus comercios `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE` a `INACTIVO`; el último acceso se renueva con el inicio de sesión y con todo pase a `ACTIVO` (verificación, desbloqueo, reactivación, fin de suspensión). Los tipos de aviso `CUENTA_INACTIVADA` y `COMERCIO_INACTIVADO` ya existían en el ENUM de `notificacion.tipo` y ahora tienen emisor.
```

## 3. Tabla `Usuario`: la columna

Reemplazar la fila de `fecha_ultimo_acceso` por:

```
| `fecha_ultimo_acceso` | DATETIME | NO | CURRENT_TIMESTAMP | NN | Último acceso de la persona: se actualiza con cada inicio de sesión exitoso y cada vez que la cuenta pasa a `ACTIVO` (verificación del email, desbloqueo, reactivación, fin de una suspensión); nunca en cada request. Las cuentas nuevas nacen con la fecha de registro. La inactivación automática compara contra esta fecha (`< ahora - 3 meses`). |
```

Agregar a los índices de `Usuario`: `KEY idx_usuario_estado_ultimo_acceso (estado, fecha_ultimo_acceso)`.

## 4. Estados de `Usuario`: la fila `INACTIVO`

Reemplazar la fila `INACTIVO` por:

```
| `INACTIVO` | Inactivada automáticamente por el sistema tras 3 meses sin actividad (`fecha_ultimo_acceso`), con motivo "Inactividad" en `HistorialEstadoUsuario`. No puede iniciar sesión: el login con la contraseña correcta responde `409` con el código `CUENTA_INACTIVA`. Se reactiva con usuario y contraseña, con un código por email, recuperando la contraseña o por el Administrador; si es un Dueño, sus comercios `INACTIVO` vuelven a `APTO_VENTA` o `APROBADO`. Una suspensión sobre una cuenta inactiva, al levantarse, la devuelve a `INACTIVO`. |
```

## 5. Tabla `Sesion`: valores de `tipo_cierre`

Agregar `INACTIVIDAD` a la descripción de `tipo_cierre`: "`MANUAL`, `AUTOMATICO`, `FORZADO`, `SUSPENSION` o `INACTIVIDAD` (cierre de la sesión por la inactivación automática de la cuenta, desde la `V52`)."

## 6. Estados de `Comercio`: la fila `INACTIVO`

Aclarar: "`INACTIVO`: el Dueño quedó inactivo por falta de uso (desde la `V52` lo escribe el proceso de inactivación; se restaura al reactivar la cuenta). No aparece en el catálogo ni recibe pedidos; el Empleado lo ve en solo lectura."

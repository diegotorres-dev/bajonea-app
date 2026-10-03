package com.bajonea.backend.enums;

/**
 * Dato de un comercio que se compara al corregirlo y volver a solicitar su aprobación. Se guarda como
 * texto en {@code historial_cambio_comercio.campo} (no como ENUM de MySQL), así que sumar un campo no
 * pide migración. Los datos fiscales y del representante solo se comparan cuando el Dueño tiene permitido
 * corregirlos.
 */
public enum CampoCambioComercio {
    NOMBRE,
    DESCRIPCION,
    TELEFONO,
    EMAIL_CONTACTO,
    TIPO_COMERCIO,
    MODALIDADES,
    FOTO_PERFIL,
    DIRECCION,
    HORARIOS,
    REDES_SOCIALES,
    RAZON_SOCIAL,
    CUIT,
    CONDICION_IVA,
    TIPO_SOCIEDAD,
    DOMICILIO_FISCAL,
    FECHA_INICIO_ACTIVIDADES,
    REPRESENTANTE_NOMBRE,
    REPRESENTANTE_APELLIDO,
    REPRESENTANTE_DNI,
    REPRESENTANTE_TELEFONO,
    REPRESENTANTE_FECHA_NACIMIENTO
}

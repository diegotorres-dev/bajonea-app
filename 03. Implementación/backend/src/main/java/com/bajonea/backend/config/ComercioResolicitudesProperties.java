package com.bajonea.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Cuántas veces puede un Dueño corregir y volver a solicitar un comercio rechazado
 * ({@code comercio.resolicitudes.max}, 3 en {@code application.properties}: el alta original más 3
 * correcciones). La re-solicitud que el Administrador rechaza cuando el comercio ya usó todas pasa a
 * {@code RECHAZO_DEFINITIVO}.
 */
@Component
@ConfigurationProperties(prefix = "comercio.resolicitudes")
@Getter
@Setter
public class ComercioResolicitudesProperties {

    private int max;
}

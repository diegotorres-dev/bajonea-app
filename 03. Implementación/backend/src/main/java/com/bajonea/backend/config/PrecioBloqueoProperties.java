package com.bajonea.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "precio.bloqueo-en-franja")
@Getter
@Setter
public class PrecioBloqueoProperties {

    private boolean habilitado = true;
}

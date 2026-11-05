package com.bajonea.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "reclamo.fotos")
@Getter
@Setter
public class ReclamoFotosProperties {

    private int maxCantidad = 3;

    private int maxBytes = 5 * 1024 * 1024;
}

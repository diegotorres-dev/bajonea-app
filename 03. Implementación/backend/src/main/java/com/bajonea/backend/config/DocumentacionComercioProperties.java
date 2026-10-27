package com.bajonea.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "comercio.documentacion")
@Getter
@Setter
public class DocumentacionComercioProperties {

    private boolean requerida = true;

    private int maxBytes = 8 * 1024 * 1024;

    private int maxEnRevision = 5;

    private int maxTotal = 20;
}

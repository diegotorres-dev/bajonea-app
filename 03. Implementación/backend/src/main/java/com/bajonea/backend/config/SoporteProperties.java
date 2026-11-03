package com.bajonea.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "soporte")
@Getter
@Setter
public class SoporteProperties {

    private int consultasPorDiaEmail = 3;
    private int consultasAbiertasEmail = 3;
    private int consultasPorDiaIp = 10;
    private int intentosFallidosPorHoraEmail = 30;
    private int intentosFallidosPorHoraIp = 10;
    private int reenviosPorHoraEmail = 3;
    private int reenviosPorHoraIp = 3;
    private long ventanaConsultasHoras = 24;
    private long ventanaIntentosMinutos = 60;
    private int codigoMaxIntentosColision = 10;
}

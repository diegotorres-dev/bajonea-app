package com.bajonea.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "pedido.timeout")
@Getter
@Setter
public class PedidoTimeoutProperties {

    private long pagoMinutos;
    private long avisoEnCaminoMinutos;
    private long autoconfirmacionEnCaminoMinutos;
    private long respuestaComercioMinutos;
    private long retiroSuspensionMinutos;
}

package com.bajonea.backend.config;

import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "turno.cierre")
@Getter
@Setter
public class TurnoCierreProperties {

    private long graciaMinutos = 30;
    private long esperaMaximaMinutos = 120;
    private int diasAtras = 3;
    private int emailIntentosMaximos = 5;
    private List<Long> emailRetrocesoMinutos = List.of(10L, 30L, 60L);
    private long emailEnvioVencidoMinutos = 15;

    public long retrocesoParaIntento(int intentosHechos) {
        int indice = Math.min(Math.max(intentosHechos - 1, 0), emailRetrocesoMinutos.size() - 1);
        return emailRetrocesoMinutos.get(indice);
    }
}

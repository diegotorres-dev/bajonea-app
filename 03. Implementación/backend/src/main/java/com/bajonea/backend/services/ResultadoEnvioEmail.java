package com.bajonea.backend.services;

public record ResultadoEnvioEmail(Estado estado, String idResend, Integer codigoHttp, String error) {

    public enum Estado {
        ENVIADO,
        FALLIDO,
        DESHABILITADO
    }

    public static ResultadoEnvioEmail enviado(String idResend) {
        return new ResultadoEnvioEmail(Estado.ENVIADO, idResend, null, null);
    }

    public static ResultadoEnvioEmail deshabilitado() {
        return new ResultadoEnvioEmail(Estado.DESHABILITADO, null, null, null);
    }

    public static ResultadoEnvioEmail fallido(Integer codigoHttp, String error) {
        return new ResultadoEnvioEmail(Estado.FALLIDO, null, codigoHttp, error);
    }

    public boolean salio() {
        return estado != Estado.FALLIDO;
    }
}

package com.bajonea.backend.config.security;

import org.springframework.security.core.AuthenticationException;

public class CuentaSuspendidaAuthenticationException extends AuthenticationException {

    private final String motivo;

    public CuentaSuspendidaAuthenticationException(String motivo) {
        super("La cuenta está suspendida");
        this.motivo = motivo;
    }

    public String getMotivo() {
        return motivo;
    }
}

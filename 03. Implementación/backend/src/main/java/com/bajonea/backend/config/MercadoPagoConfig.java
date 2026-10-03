package com.bajonea.backend.config;

import lombok.Getter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Credenciales de la aplicación "Bajonea" en Mercado Pago (client_id/client_secret del flujo
 * OAuth authorization_code) y la URL de callback registrada en el panel de MP. Nunca
 * hardcodeadas — siempre vía variable de entorno (ver application*.properties). {@code testToken}
 * es el valor que se manda como {@code test_token} en el intercambio OAuth y que se guarda como
 * {@code CuentaMercadoPago.esCuentaPrueba}: única fuente de verdad del entorno de la cuenta.
 */
@Component
@Getter
public class MercadoPagoConfig {

    private static final Logger log = LoggerFactory.getLogger(MercadoPagoConfig.class);

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final String webhookSecret;
    private final boolean testToken;

    public MercadoPagoConfig(
            @Value("${mercadopago.client-id:}") String clientId,
            @Value("${mercadopago.client-secret:}") String clientSecret,
            @Value("${mercadopago.redirect-uri:}") String redirectUri,
            @Value("${mercadopago.webhook-secret:}") String webhookSecret,
            @Value("${mercadopago.test-token:false}") boolean testToken,
            Environment environment) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.webhookSecret = webhookSecret;
        this.testToken = testToken;

        if (!environment.containsProperty("MERCADOPAGO_TEST_TOKEN")) {
            String separador = "=".repeat(100);
            log.warn("\n{}\nMERCADOPAGO_TEST_TOKEN no esta seteada explicitamente: se usa el default false.\n"
                    + "Una cuenta de MercadoPago vinculada por OAuth en este arranque queda con es_cuenta_prueba = false\n"
                    + "y el pago devuelve el init_point de produccion. Si vas a vincular una cuenta de prueba,\n"
                    + "seteala en true antes de arrancar (PowerShell: $env:MERCADOPAGO_TEST_TOKEN=\"true\").\n{}",
                    separador, separador);
        }
    }
}

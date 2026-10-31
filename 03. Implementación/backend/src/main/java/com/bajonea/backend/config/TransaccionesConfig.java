package com.bajonea.backend.config;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.transaction.TransactionManagerCustomizers;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Reemplaza al gestor de transacciones que arma Spring Boot (misma clase base, mismos personalizadores) por uno que
 * avisa cuándo empieza y termina cada transacción del hilo ({@link GestorTransacciones}).
 */
@Configuration
public class TransaccionesConfig {

    @Bean
    public PlatformTransactionManager transactionManager(ObjectProvider<TransactionManagerCustomizers> personalizadores) {
        GestorTransacciones gestor = new GestorTransacciones();
        personalizadores.ifAvailable(personalizador -> personalizador.customize(gestor));
        return gestor;
    }
}

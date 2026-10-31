package com.bajonea.backend.config;

import com.bajonea.backend.util.ColaPostTransaccion;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.TransactionDefinition;

/**
 * Gestor de transacciones de JPA que avisa a {@link ColaPostTransaccion} cuándo empieza y cuándo termina cada
 * transacción del hilo, para que los efectos hacia afuera (emails, pedidos a Mercado Pago, el registro de su resultado)
 * corran cuando la transacción más externa ya soltó su conexión. Nada más cambia respecto de {@link JpaTransactionManager}.
 */
public class GestorTransacciones extends JpaTransactionManager {

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        super.doBegin(transaction, definition);
        ColaPostTransaccion.transaccionIniciada();
    }

    @Override
    protected void doCleanupAfterCompletion(Object transaction) {
        try {
            super.doCleanupAfterCompletion(transaction);
        } finally {
            ColaPostTransaccion.transaccionTerminada();
        }
    }
}

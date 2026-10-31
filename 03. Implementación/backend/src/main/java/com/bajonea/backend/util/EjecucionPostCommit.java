package com.bajonea.backend.util;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Ejecuta una acción con efecto hacia afuera (un email, un pedido a Mercado Pago) recién cuando la transacción en curso
 * se confirma, para no mandar un código de una transacción que después se revierte, y recién cuando la transacción más
 * externa soltó su conexión ({@link ColaPostTransaccion}), para que la acción no mantenga una conexión tomada ni pida una
 * segunda mientras tanto. Sin transacción en curso corre en el acto.
 */
public final class EjecucionPostCommit {

    private EjecucionPostCommit() {
    }

    public static void ejecutar(Runnable accion) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    ColaPostTransaccion.encolar(accion);
                }
            });
            return;
        }
        accion.run();
    }
}

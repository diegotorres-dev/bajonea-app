package com.bajonea.backend.util;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Ejecuta una acción con efecto hacia afuera (un email) recién cuando la transacción en curso se confirma,
 * para no mandar un código de una transacción que después se revierte. Sin transacción en curso corre en
 * el acto. Misma idea que {@code ReembolsoService.procesarReembolsoTotal}.
 */
public final class EjecucionPostCommit {

    private EjecucionPostCommit() {
    }

    public static void ejecutar(Runnable accion) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    accion.run();
                }
            });
            return;
        }
        accion.run();
    }
}

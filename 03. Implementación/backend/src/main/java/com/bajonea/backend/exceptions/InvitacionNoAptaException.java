package com.bajonea.backend.exceptions;

/**
 * La invitación no se puede crear (o aceptar) con esa cuenta: rol incompatible o cuenta que no está activa.
 * Mapea a {@code 409} (hereda de {@link ConflictoDeNegocioException}). Existe como subclase propia porque
 * al invitar la fila de regularización que cuenta el tope diario tiene que persistir aunque el Dueño reciba
 * este {@code 409}: el servicio la declara en {@code noRollbackFor} sin ampliar la regla a todos los
 * conflictos de negocio.
 */
public class InvitacionNoAptaException extends ConflictoDeNegocioException {

    public InvitacionNoAptaException(String mensaje) {
        super(mensaje);
    }
}

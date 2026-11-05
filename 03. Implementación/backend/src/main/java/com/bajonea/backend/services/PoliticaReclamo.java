package com.bajonea.backend.services;

import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoEntrega;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Reglas de elegibilidad de un reclamo, compartidas por quien crea el reclamo (con el pedido y el pago ya bloqueados) y
 * por quien arma el bloque {@code reclamo} de las respuestas de pedido, para que el frontend nunca calcule plazos ni
 * reglas. Solo se puede reclamar un pedido {@code ENTREGADO}, con el pago aprobado y confirmado y con fecha de entrega,
 * dentro de {@code reclamo.plazo-dias} días corridos (7 por defecto) desde esa fecha.
 */
@Component
public class PoliticaReclamo {

    static final String MENSAJE_YA_EXISTE = "Ya hiciste un reclamo por este pedido.";
    static final String MENSAJE_NO_ENTREGADO = "Solo podés reclamar un pedido que ya te entregaron.";
    static final String MENSAJE_SIN_PAGO = "Este pedido no tiene un pago aprobado, así que no se puede reclamar.";
    static final String MENSAJE_SIN_FECHA = "No pudimos verificar la fecha de entrega de este pedido, así que no se puede reclamar.";
    static final String MENSAJE_NO_RECIBI_EN_RETIRO = "Este pedido era para retirar en el local. Elegí otro motivo.";

    private final int plazoDias;

    public PoliticaReclamo(@Value("${reclamo.plazo-dias:7}") int plazoDias) {
        this.plazoDias = plazoDias;
    }

    public LocalDateTime fechaLimite(Pedido pedido) {
        return pedido.getFechaEntrega() == null ? null : pedido.getFechaEntrega().plusDays(plazoDias);
    }

    /**
     * El texto de por qué un pedido no se puede reclamar, o {@code null} si se puede. El pedido todavía no tiene reclamo;
     * {@code pago} puede ser {@code null} (pedido sin pago).
     */
    public String motivoDeNoElegible(Pedido pedido, Pago pago, LocalDateTime ahora) {
        if (pedido.getEstado() != EstadoPedido.ENTREGADO) {
            return MENSAJE_NO_ENTREGADO;
        }
        if (pago == null || !ReembolsoService.esPagoReembolsable(pago)) {
            return MENSAJE_SIN_PAGO;
        }
        if (pedido.getFechaEntrega() == null) {
            return MENSAJE_SIN_FECHA;
        }
        if (ahora.isAfter(fechaLimite(pedido))) {
            return mensajePlazoVencido();
        }
        return null;
    }

    /**
     * El texto del plazo vencido, o {@code null} si el pedido no está en ese caso. Solo se informa cuando el pedido era
     * reclamable en todo lo demás (entregado, con pago aprobado y con fecha de entrega): así la pantalla no confunde un
     * plazo vencido con un pedido que nunca se pudo reclamar.
     */
    public String avisoPlazoVencido(Pedido pedido, Pago pago, LocalDateTime ahora) {
        String motivo = motivoDeNoElegible(pedido, pago, ahora);
        return motivo != null && motivo.equals(mensajePlazoVencido()) ? motivo : null;
    }

    private String mensajePlazoVencido() {
        return "Pasaron los " + plazoDias + " días para reclamar este pedido.";
    }

    public List<MotivoReclamo> motivosDisponibles(Pedido pedido) {
        return Arrays.stream(MotivoReclamo.values())
                .filter(motivo -> motivo != MotivoReclamo.NO_RECIBI_PEDIDO || pedido.getTipoEntrega() == TipoEntrega.DOMICILIO)
                .toList();
    }
}

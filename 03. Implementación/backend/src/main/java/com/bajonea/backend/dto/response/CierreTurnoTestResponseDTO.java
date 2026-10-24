package com.bajonea.backend.dto.response;

import com.bajonea.backend.entities.CierreTurno;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record CierreTurnoTestResponseDTO(Integer id, Integer comercioId, LocalDate turnoFecha, Integer horarioId,
        LocalDateTime inicio, LocalDateTime fin, Integer cantidadPedidos, BigDecimal vendido, BigDecimal comision,
        BigDecimal neto, Integer pendientesAlCierre, LocalDateTime fechaCierre, String emailEstado, Integer emailIntentos,
        LocalDateTime emailProximoIntento, LocalDateTime emailEnvioIniciado, LocalDateTime emailFechaEnvio,
        String emailUltimoError) {

    public static CierreTurnoTestResponseDTO de(CierreTurno cierre) {
        return new CierreTurnoTestResponseDTO(cierre.getId(), cierre.getComercioId(), cierre.getTurnoFecha(),
                cierre.getHorarioId(), cierre.getInicio(), cierre.getFin(), cierre.getCantidadPedidos(), cierre.getVendido(),
                cierre.getComision(), cierre.getNeto(), cierre.getPendientesAlCierre(), cierre.getFechaCierre(),
                cierre.getEmailEstado().name(), cierre.getEmailIntentos(), cierre.getEmailProximoIntento(),
                cierre.getEmailEnvioIniciado(), cierre.getEmailFechaEnvio(), cierre.getEmailUltimoError());
    }
}

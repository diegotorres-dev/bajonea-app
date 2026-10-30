package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import java.util.List;
import lombok.Getter;

@Getter
public class SuspensionDuenoResponseDTO {

    private final Integer duenoId;
    private final EstadoUsuario estado;
    private final List<Integer> comerciosSuspendidos;
    private final List<Integer> comerciosRestaurados;
    private final List<Integer> comerciosQueSiguenSuspendidos;
    private final int pedidosPendientesRechazados;
    private final int pedidosSinAtencionProcesados;

    public SuspensionDuenoResponseDTO(Integer duenoId, EstadoUsuario estado, List<Integer> comerciosSuspendidos,
            List<Integer> comerciosRestaurados, List<Integer> comerciosQueSiguenSuspendidos, int pedidosPendientesRechazados,
            int pedidosSinAtencionProcesados) {
        this.duenoId = duenoId;
        this.estado = estado;
        this.comerciosSuspendidos = comerciosSuspendidos;
        this.comerciosRestaurados = comerciosRestaurados;
        this.comerciosQueSiguenSuspendidos = comerciosQueSiguenSuspendidos;
        this.pedidosPendientesRechazados = pedidosPendientesRechazados;
        this.pedidosSinAtencionProcesados = pedidosSinAtencionProcesados;
    }
}

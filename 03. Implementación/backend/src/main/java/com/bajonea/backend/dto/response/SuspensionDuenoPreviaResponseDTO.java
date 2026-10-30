package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.OrigenSuspensionComercio;
import java.util.List;
import lombok.Getter;

@Getter
public class SuspensionDuenoPreviaResponseDTO {

    public enum Efecto {
        SE_SUSPENDE,
        QUEDA_COMO_ESTA
    }

    public enum AtencionDePedidos {
        ATENDIDOS_POR_EMPLEADOS,
        SE_ANULAN_AL_INSTANTE,
        SIN_PEDIDOS_EN_PREPARACION
    }

    @Getter
    public static class ComercioPrevia {

        private final Integer comercioId;
        private final String nombre;
        private final EstadoComercio estadoActual;
        private final OrigenSuspensionComercio suspensionOrigen;
        private final Efecto efecto;
        private final String motivoDelEfecto;
        private final long pedidosPendientesDeConfirmacion;
        private final long pedidosEnPreparacion;
        private final long pedidosListosParaRetirar;
        private final long pedidosEnCamino;
        private final long pedidosSinPagar;
        private final long empleadosActivos;
        private final AtencionDePedidos atencionDePedidos;

        public ComercioPrevia(Integer comercioId, String nombre, EstadoComercio estadoActual,
                OrigenSuspensionComercio suspensionOrigen, Efecto efecto, String motivoDelEfecto,
                long pedidosPendientesDeConfirmacion, long pedidosEnPreparacion, long pedidosListosParaRetirar,
                long pedidosEnCamino, long pedidosSinPagar, long empleadosActivos, AtencionDePedidos atencionDePedidos) {
            this.comercioId = comercioId;
            this.nombre = nombre;
            this.estadoActual = estadoActual;
            this.suspensionOrigen = suspensionOrigen;
            this.efecto = efecto;
            this.motivoDelEfecto = motivoDelEfecto;
            this.pedidosPendientesDeConfirmacion = pedidosPendientesDeConfirmacion;
            this.pedidosEnPreparacion = pedidosEnPreparacion;
            this.pedidosListosParaRetirar = pedidosListosParaRetirar;
            this.pedidosEnCamino = pedidosEnCamino;
            this.pedidosSinPagar = pedidosSinPagar;
            this.empleadosActivos = empleadosActivos;
            this.atencionDePedidos = atencionDePedidos;
        }
    }

    private final Integer duenoId;
    private final EstadoUsuario estadoActual;
    private final List<ComercioPrevia> comercios;
    private final long topePreparacionMinutos;
    private final long topeRetiroMinutos;

    public SuspensionDuenoPreviaResponseDTO(Integer duenoId, EstadoUsuario estadoActual, List<ComercioPrevia> comercios,
            long topePreparacionMinutos, long topeRetiroMinutos) {
        this.duenoId = duenoId;
        this.estadoActual = estadoActual;
        this.comercios = comercios;
        this.topePreparacionMinutos = topePreparacionMinutos;
        this.topeRetiroMinutos = topeRetiroMinutos;
    }
}

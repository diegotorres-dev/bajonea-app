package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.dto.response.SuspensionComercioPreviaResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import java.time.Clock;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

class SuspensionComercioServiceVistaPreviaTest {

    private SuspensionComercioPreviaResponseDTO previa(PedidoTimeoutProperties propiedades) {
        ComercioRepository comercios = mock(ComercioRepository.class);
        PedidoRepository pedidos = mock(PedidoRepository.class);
        Comercio comercio = mock(Comercio.class);
        when(comercio.getEstado()).thenReturn(EstadoComercio.APTO_VENTA);
        when(comercios.findById(7)).thenReturn(Optional.of(comercio));
        when(pedidos.countByComercioIdAndEstado(eq(7), any(EstadoPedido.class))).thenReturn(0L);
        SuspensionComercioService servicio = new SuspensionComercioService(comercios, null, null, null, null, pedidos, null, null, null,
                Clock.systemDefaultZone(), propiedades, mock(PlatformTransactionManager.class));
        return servicio.vistaPrevia(7);
    }

    @Test
    void usaLosTopesPorDefectoDeLaConfiguracion() {
        PedidoTimeoutProperties propiedades = new PedidoTimeoutProperties();
        propiedades.setRetiroSuspensionMinutos(90);

        SuspensionComercioPreviaResponseDTO respuesta = previa(propiedades);

        assertEquals(90, respuesta.getTopePreparacionMinutos());
        assertEquals(90, respuesta.getTopeRetiroMinutos());
    }

    @Test
    void usaLosTopesConfiguradosYNoUnNumeroFijo() {
        PedidoTimeoutProperties propiedades = new PedidoTimeoutProperties();
        propiedades.setPreparacionSuspensionMinutos(45);
        propiedades.setRetiroSuspensionMinutos(30);

        SuspensionComercioPreviaResponseDTO respuesta = previa(propiedades);

        assertEquals(45, respuesta.getTopePreparacionMinutos());
        assertEquals(30, respuesta.getTopeRetiroMinutos());
    }
}

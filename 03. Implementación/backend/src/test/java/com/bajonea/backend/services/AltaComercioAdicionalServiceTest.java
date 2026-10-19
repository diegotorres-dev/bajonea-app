package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.AltaComercioAdicionalRequestDTO;
import com.bajonea.backend.dto.request.DireccionRequestDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class AltaComercioAdicionalServiceTest {

    private static final int DUENO_ID = 7;

    private DuenoRepository duenoRepository;
    private ComercioRepository comercioRepository;
    private RegistroService registroService;
    private ComercioService comercioService;
    private CloudinaryService cloudinaryService;
    private AltaComercioAdicionalService service;
    private Dueno dueno;

    @BeforeEach
    void preparar() {
        duenoRepository = mock(DuenoRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        registroService = mock(RegistroService.class);
        comercioService = mock(ComercioService.class);
        cloudinaryService = mock(CloudinaryService.class);
        service = new AltaComercioAdicionalService(duenoRepository, comercioRepository, registroService, comercioService,
                cloudinaryService);

        dueno = Dueno.builder().id(DUENO_ID).build();
        when(duenoRepository.findByIdConBloqueo(DUENO_ID)).thenReturn(Optional.of(dueno));
        when(comercioRepository.existsByDuenoIdAndEstadoIn(anyInt(), anyCollection())).thenReturn(true);
        when(registroService.crearComercio(any(), any())).thenReturn(Comercio.builder().id(99).build());
    }

    private static AltaComercioAdicionalRequestDTO pedido(String nombre, String calle, String numero, String piso, String localidadId,
            String codigoPostal) {
        AltaComercioAdicionalRequestDTO request = new AltaComercioAdicionalRequestDTO();
        request.setNombre(nombre);
        request.setFotoPerfilUrl("https://res.cloudinary.com/x/image/upload/v1/duenos/7/comercios-nuevos/f.png");
        request.setDireccion(new DireccionRequestDTO(calle, numero, piso, codigoPostal, localidadId, false));
        return request;
    }

    @Test
    void bloqueaLaFilaDelDuenoAntesDeCualquierOtraConsulta() {
        service.altaAdicional(DUENO_ID, pedido("Sucursal", "Belgrano", "250", null, "L1", "9420"));

        InOrder orden = inOrder(duenoRepository, comercioRepository, cloudinaryService, registroService);
        orden.verify(duenoRepository).findByIdConBloqueo(DUENO_ID);
        orden.verify(comercioRepository).existsByDuenoIdAndEstadoIn(anyInt(), anyCollection());
        orden.verify(cloudinaryService).validarFotoNuevoComercio(anyInt(), any());
        orden.verify(registroService).crearComercio(any(), any());
    }

    @Test
    void sinUnComercioAprobadoDaConflictoYNoCreaNada() {
        when(comercioRepository.existsByDuenoIdAndEstadoIn(anyInt(), anyCollection())).thenReturn(false);

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.altaAdicional(DUENO_ID, pedido("Sucursal", "Belgrano", "250", null, "L1", "9420")));

        assertEquals("Para agregar un nuevo comercio, necesitás tener al menos uno aprobado previamente", error.getMessage());
        verify(registroService, never()).crearComercio(any(), any());
    }

    @Test
    void duenoInexistenteDaNoEncontrado() {
        when(duenoRepository.findByIdConBloqueo(DUENO_ID)).thenReturn(Optional.empty());
        assertThrows(RecursoNoEncontradoException.class,
                () -> service.altaAdicional(DUENO_ID, pedido("Sucursal", "Belgrano", "250", null, "L1", "9420")));
    }

    @Test
    void unaFotoInvalidaCortaAntesDeCrearElComercio() {
        org.mockito.Mockito.doThrow(new ValidacionException("foto")).when(cloudinaryService).validarFotoNuevoComercio(anyInt(), any());

        assertThrows(ValidacionException.class, () -> service.altaAdicional(DUENO_ID, pedido("Sucursal", "Belgrano", "250", null, "L1", "9420")));

        verify(registroService, never()).crearComercio(any(), any());
    }

    @Test
    void laConsultaDeElegibilidadUsaAprobadoYAptoVentaComoPrimeraCondicion() {
        assertTrue(service.consultarElegibilidad(DUENO_ID).isElegible());
        verify(comercioRepository).existsByDuenoIdAndEstadoIn(DUENO_ID,
                java.util.EnumSet.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA));
        verify(comercioRepository, never()).countByDuenoId(anyInt());
    }

    @Test
    void sinAprobadosEsElegibleSoloSiTieneComerciosYTodosEstanEnRechazoDefinitivo() {
        when(comercioRepository.existsByDuenoIdAndEstadoIn(anyInt(), anyCollection())).thenReturn(false);

        when(comercioRepository.countByDuenoId(DUENO_ID)).thenReturn(2L);
        when(comercioRepository.countByDuenoIdAndEstadoNot(DUENO_ID, EstadoComercio.RECHAZO_DEFINITIVO)).thenReturn(0L);
        assertTrue(service.consultarElegibilidad(DUENO_ID).isElegible());

        when(comercioRepository.countByDuenoIdAndEstadoNot(DUENO_ID, EstadoComercio.RECHAZO_DEFINITIVO)).thenReturn(1L);
        assertFalse(service.consultarElegibilidad(DUENO_ID).isElegible());
    }

    @Test
    void sinComerciosNoEsElegible() {
        when(comercioRepository.existsByDuenoIdAndEstadoIn(anyInt(), anyCollection())).thenReturn(false);
        when(comercioRepository.countByDuenoId(DUENO_ID)).thenReturn(0L);
        when(comercioRepository.countByDuenoIdAndEstadoNot(DUENO_ID, EstadoComercio.RECHAZO_DEFINITIVO)).thenReturn(0L);

        assertFalse(service.consultarElegibilidad(DUENO_ID).isElegible());
    }

    @Test
    void conTodosLosComerciosEnRechazoDefinitivoPuedeDarDeAltaOtro() {
        when(comercioRepository.existsByDuenoIdAndEstadoIn(anyInt(), anyCollection())).thenReturn(false);
        when(comercioRepository.countByDuenoId(DUENO_ID)).thenReturn(1L);
        when(comercioRepository.countByDuenoIdAndEstadoNot(DUENO_ID, EstadoComercio.RECHAZO_DEFINITIVO)).thenReturn(0L);

        service.altaAdicional(DUENO_ID, pedido("Sucursal", "Belgrano", "250", null, "L1", "9420"));

        verify(registroService).crearComercio(any(), any());
    }
}

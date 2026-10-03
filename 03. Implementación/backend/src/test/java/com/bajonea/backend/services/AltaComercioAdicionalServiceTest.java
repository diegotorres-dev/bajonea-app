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
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class AltaComercioAdicionalServiceTest {

    private static final int DUENO_ID = 7;

    private DuenoRepository duenoRepository;
    private ComercioRepository comercioRepository;
    private DireccionRepository direccionRepository;
    private RegistroService registroService;
    private ComercioService comercioService;
    private CloudinaryService cloudinaryService;
    private AltaComercioAdicionalService service;
    private Dueno dueno;

    @BeforeEach
    void preparar() {
        duenoRepository = mock(DuenoRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        direccionRepository = mock(DireccionRepository.class);
        registroService = mock(RegistroService.class);
        comercioService = mock(ComercioService.class);
        cloudinaryService = mock(CloudinaryService.class);
        service = new AltaComercioAdicionalService(duenoRepository, comercioRepository, registroService, comercioService,
                cloudinaryService, new ValidadorComercioDuplicado(direccionRepository));

        dueno = Dueno.builder().id(DUENO_ID).build();
        when(duenoRepository.findByIdConBloqueo(DUENO_ID)).thenReturn(Optional.of(dueno));
        when(comercioRepository.existsByDuenoIdAndEstadoIn(anyInt(), anyCollection())).thenReturn(true);
        when(direccionRepository.findByDuenoIdConComercioYLocalidad(DUENO_ID)).thenReturn(List.of());
        when(registroService.crearComercio(any(), any())).thenReturn(Comercio.builder().id(99).build());
    }

    private static Direccion direccion(String estado, String nombre, String calle, String numero, String piso, String localidadId) {
        Comercio comercio = Comercio.builder().id(1).nombre(nombre).estado(EstadoComercio.valueOf(estado)).build();
        return Direccion.builder()
                .comercio(comercio)
                .calle(calle)
                .numero(numero)
                .pisoDepto(piso)
                .codigoPostal("9420")
                .localidad(Localidad.builder().id(localidadId).build())
                .build();
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

        InOrder orden = inOrder(duenoRepository, comercioRepository, cloudinaryService, direccionRepository, registroService);
        orden.verify(duenoRepository).findByIdConBloqueo(DUENO_ID);
        orden.verify(comercioRepository).existsByDuenoIdAndEstadoIn(anyInt(), anyCollection());
        orden.verify(cloudinaryService).validarFotoNuevoComercio(anyInt(), any());
        orden.verify(direccionRepository).findByDuenoIdConComercioYLocalidad(DUENO_ID);
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
    void unaFotoInvalidaCortaAntesDelChequeoDeDuplicado() {
        org.mockito.Mockito.doThrow(new ValidacionException("foto")).when(cloudinaryService).validarFotoNuevoComercio(anyInt(), any());

        assertThrows(ValidacionException.class, () -> service.altaAdicional(DUENO_ID, pedido("Sucursal", "Belgrano", "250", null, "L1", "9420")));

        verify(direccionRepository, never()).findByDuenoIdConComercioYLocalidad(anyInt());
        verify(registroService, never()).crearComercio(any(), any());
    }

    @Test
    void mismoNombreYDireccionDaConflictoAunqueCambienTildesMayusculasYEspacios() {
        when(direccionRepository.findByDuenoIdConComercioYLocalidad(DUENO_ID))
                .thenReturn(List.of(direccion("PENDIENTE", "Cafetería Ñandú", "Belgrano", "250", "2B", "L1")));

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.altaAdicional(DUENO_ID, pedido("  CAFETERIA   NANDU ", " BELGRANO ", " 250 ", " 2b ", "L1", "9420")));

        assertEquals("Ya tenés un comercio con ese nombre en esa dirección. Si es otro local del mismo edificio, agregá el piso o número de local.", error.getMessage());
        verify(registroService, never()).crearComercio(any(), any());
    }

    @Test
    void elCodigoPostalNoEntraEnLaComparacion() {
        when(direccionRepository.findByDuenoIdConComercioYLocalidad(DUENO_ID))
                .thenReturn(List.of(direccion("APROBADO", "Cafetería", "Belgrano", "250", null, "L1")));

        assertThrows(ConflictoDeNegocioException.class,
                () -> service.altaAdicional(DUENO_ID, pedido("Cafetería", "Belgrano", "250", null, "L1", "V9420ABC")));
    }

    @Test
    void pisoNuloVacioYEnBlancoSonLoMismo() {
        when(direccionRepository.findByDuenoIdConComercioYLocalidad(DUENO_ID))
                .thenReturn(List.of(direccion("APTO_VENTA", "Cafetería", "Belgrano", "250", null, "L1")));

        for (String piso : new String[] { null, "", "   " }) {
            assertThrows(ConflictoDeNegocioException.class,
                    () -> service.altaAdicional(DUENO_ID, pedido("Cafetería", "Belgrano", "250", piso, "L1", "9420")));
        }
    }

    @Test
    void otraDireccionOtroPisoOtraLocalidadOOtroNombreNoSonDuplicado() {
        when(direccionRepository.findByDuenoIdConComercioYLocalidad(DUENO_ID))
                .thenReturn(List.of(direccion("PENDIENTE", "Cafetería", "Belgrano", "250", "2B", "L1")));

        service.altaAdicional(DUENO_ID, pedido("Cafetería", "Belgrano", "251", "2B", "L1", "9420"));
        service.altaAdicional(DUENO_ID, pedido("Cafetería", "Belgrano", "250", "3C", "L1", "9420"));
        service.altaAdicional(DUENO_ID, pedido("Cafetería", "Belgrano", "250", null, "L1", "9420"));
        service.altaAdicional(DUENO_ID, pedido("Cafetería", "Belgrano", "250", "2B", "L2", "9420"));
        service.altaAdicional(DUENO_ID, pedido("Otro nombre", "Belgrano", "250", "2B", "L1", "9420"));
        service.altaAdicional(DUENO_ID, pedido("Cafetería", "Moreno", "250", "2B", "L1", "9420"));

        verify(registroService, org.mockito.Mockito.times(6)).crearComercio(any(), any());
    }

    @Test
    void unComercioRechazadoNoCuentaComoDuplicadoPeroCualquierOtroEstadoSi() {
        when(direccionRepository.findByDuenoIdConComercioYLocalidad(DUENO_ID))
                .thenReturn(List.of(direccion("RECHAZADO", "Cafetería", "Belgrano", "250", null, "L1")));
        service.altaAdicional(DUENO_ID, pedido("Cafetería", "Belgrano", "250", null, "L1", "9420"));
        verify(registroService).crearComercio(any(), any());

        for (String estado : new String[] { "PENDIENTE", "APROBADO", "APTO_VENTA", "SUSPENDIDO", "CERRADO_TEMPORALMENTE", "INACTIVO",
                "RECHAZO_DEFINITIVO" }) {
            when(direccionRepository.findByDuenoIdConComercioYLocalidad(DUENO_ID))
                    .thenReturn(List.of(direccion(estado, "Cafetería", "Belgrano", "250", null, "L1")));
            assertThrows(ConflictoDeNegocioException.class,
                    () -> service.altaAdicional(DUENO_ID, pedido("Cafetería", "Belgrano", "250", null, "L1", "9420")),
                    estado);
        }
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

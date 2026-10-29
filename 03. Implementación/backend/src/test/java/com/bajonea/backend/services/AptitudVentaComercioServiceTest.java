package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.MotivoRecalculo;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DocumentoComercioRepository;
import com.bajonea.backend.services.AptitudVentaComercioService.EntradasDueno;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Regla única de aptitud de venta. La tabla de verdad ({@link #decidirSegunLaTabla}) es la fuente de lo aprobado: entrar
 * a {@code APTO_VENTA} pide Mercado Pago, al menos un documento aprobado y ninguno en revisión; seguir vendiendo
 * solo pide Mercado Pago y un aprobado; con la cuenta bloqueada nada queda a la venta. El resto prueba la orquestación
 * (qué transición escribe, con qué texto, qué avisa) con repositorios simulados; el motor real lo cubren
 * {@code DocumentoComercioAptitudIntegrationTest} y {@code BloqueoVigenteIntegrationTest}.
 */
class AptitudVentaComercioServiceTest {

    private ComercioRepository comercioRepository;
    private ComercioService comercioService;
    private CuentaMercadoPagoService cuentaMercadoPagoService;
    private DocumentoComercioRepository documentoRepository;
    private NotificacionService notificacionService;
    private DocumentacionComercioProperties propiedades;
    private EntityManager entityManager;
    private AptitudVentaComercioService service;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        comercioService = mock(ComercioService.class);
        cuentaMercadoPagoService = mock(CuentaMercadoPagoService.class);
        documentoRepository = mock(DocumentoComercioRepository.class);
        notificacionService = mock(NotificacionService.class);
        propiedades = new DocumentacionComercioProperties();
        entityManager = mock(EntityManager.class);
        service = new AptitudVentaComercioService(comercioRepository, comercioService, cuentaMercadoPagoService,
                documentoRepository, notificacionService, propiedades);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
    }

    private static Comercio comercio(int id, EstadoComercio estado) {
        Dueno dueno = Dueno.builder().id(7).build();
        return Comercio.builder().id(id).nombre("Comercio " + id).dueno(dueno).estado(estado).build();
    }

    private void documentos(int comercioId, String... estados) {
        when(documentoRepository.estadosDelComercioConBloqueoCompartido(comercioId)).thenReturn(List.of(estados));
    }

    @ParameterizedTest(name = "{0} bloqueado={1} mp={2} aprobados={3} pendientes={4} requerida={5} -> {6}")
    @CsvSource({
            "APROBADO,false,true,0,0,true,APROBADO",
            "APROBADO,false,true,1,0,true,APTO_VENTA",
            "APROBADO,false,true,1,1,true,APROBADO",
            "APROBADO,false,true,0,1,true,APROBADO",
            "APROBADO,false,false,1,0,true,APROBADO",
            "APROBADO,false,false,0,0,false,APROBADO",
            "APROBADO,false,true,0,0,false,APTO_VENTA",
            "APROBADO,false,true,0,3,false,APTO_VENTA",
            "APROBADO,true,true,1,0,true,CERRADO_TEMPORALMENTE",
            "APROBADO,true,true,0,0,false,CERRADO_TEMPORALMENTE",
            "APROBADO,true,true,0,0,true,APROBADO",
            "APROBADO,true,false,1,0,true,APROBADO",
            "APTO_VENTA,false,true,1,0,true,APTO_VENTA",
            "APTO_VENTA,false,true,1,1,true,APTO_VENTA",
            "APTO_VENTA,false,true,2,0,true,APTO_VENTA",
            "APTO_VENTA,false,true,0,1,true,APROBADO",
            "APTO_VENTA,false,true,0,0,true,APROBADO",
            "APTO_VENTA,false,false,3,0,true,APROBADO",
            "APTO_VENTA,false,false,0,0,false,APROBADO",
            "APTO_VENTA,false,true,0,0,false,APTO_VENTA",
            "APTO_VENTA,true,true,1,0,true,CERRADO_TEMPORALMENTE",
            "APTO_VENTA,true,false,1,0,true,APROBADO"
    })
    void decidirSegunLaTabla(EstadoComercio actual, boolean bloqueado, boolean mp, long aprobados, long pendientes,
            boolean requerida, EstadoComercio esperado) {
        assertEquals(esperado, AptitudVentaComercioService.decidir(actual, bloqueado, mp, aprobados, pendientes,
                requerida, MotivoRecalculo.DOCUMENTO_APROBADO));
    }

    @ParameterizedTest(name = "restauracion desde {0}: mp={1} aprobados={2} requerida={3} -> {4}")
    @CsvSource({
            "CERRADO_TEMPORALMENTE,true,1,true,APTO_VENTA",
            "CERRADO_TEMPORALMENTE,true,0,true,APROBADO",
            "CERRADO_TEMPORALMENTE,false,1,true,APROBADO",
            "CERRADO_TEMPORALMENTE,true,0,false,APTO_VENTA",
            "CERRADO_TEMPORALMENTE,false,0,false,APROBADO",
            "INACTIVO,true,1,true,APTO_VENTA",
            "INACTIVO,false,1,true,APROBADO"
    })
    void alRestaurarSeEvaluaLaReglaDeSeguirVendiendo(EstadoComercio origen, boolean mp, long aprobados, boolean requerida,
            EstadoComercio esperado) {
        assertEquals(esperado, AptitudVentaComercioService.decidir(origen, false, mp, aprobados, 2, requerida,
                MotivoRecalculo.DUENO_RESTAURADO));
    }

    @ParameterizedTest
    @CsvSource({"DOCUMENTO_APROBADO", "DOCUMENTO_RECHAZADO", "DOCUMENTO_REVOCADO", "DOCUMENTO_SUBIDO", "DOCUMENTO_ELIMINADO",
            "MP_VINCULADO", "MP_DESVINCULADO", "DUENO_BLOQUEADO", "COMERCIO_APROBADO", "SUSPENSION_LEVANTADA"})
    void mientrasDuraElBloqueoNingunEventoMueveUnComercioCerrado(MotivoRecalculo motivo) {
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, AptitudVentaComercioService.decidir(
                EstadoComercio.CERRADO_TEMPORALMENTE, true, true, 5, 0, true, motivo));
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, AptitudVentaComercioService.decidir(
                EstadoComercio.CERRADO_TEMPORALMENTE, false, true, 5, 0, true, motivo));
        assertEquals(EstadoComercio.INACTIVO, AptitudVentaComercioService.decidir(
                EstadoComercio.INACTIVO, false, true, 5, 0, true, motivo));
    }

    @ParameterizedTest
    @CsvSource({"PENDIENTE", "RECHAZADO", "RECHAZO_DEFINITIVO"})
    void losEstadosQueNoParticipanNuncaCambian(EstadoComercio estado) {
        for (MotivoRecalculo motivo : MotivoRecalculo.values()) {
            assertEquals(estado, AptitudVentaComercioService.decidir(estado, false, true, 3, 0, true, motivo));
            assertEquals(estado, AptitudVentaComercioService.decidir(estado, true, true, 3, 0, false, motivo));
        }
    }

    @ParameterizedTest
    @EnumSource(value = MotivoRecalculo.class, mode = EnumSource.Mode.EXCLUDE, names = "SUSPENSION_LEVANTADA")
    void laSuspensionPrevaleceSobreCualquierOtroEvento(MotivoRecalculo motivo) {
        assertEquals(EstadoComercio.SUSPENDIDO, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, false, true, 3, 0, true, motivo));
        assertEquals(EstadoComercio.SUSPENDIDO, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, true, true, 3, 0, false, motivo));
        assertEquals(EstadoComercio.SUSPENDIDO, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, false, false, 0, 0, true, motivo));
    }

    @Test
    void alLevantarLaSuspensionVuelveAAptoVentaSiPuedeSeguirVendiendo() {
        MotivoRecalculo m = MotivoRecalculo.SUSPENSION_LEVANTADA;
        assertEquals(EstadoComercio.APTO_VENTA, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, false, true, 1, 0, true, m));
        assertEquals(EstadoComercio.APTO_VENTA, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, false, true, 1, 3, true, m),
                "un documento nuevo en revision no frena: se usa la regla de seguir, no la de entrar");
        assertEquals(EstadoComercio.APTO_VENTA, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, false, true, 0, 0, false, m));
    }

    @Test
    void alLevantarLaSuspensionVuelveAAprobadoSiFaltaMercadoPagoOUnDocumentoAprobado() {
        MotivoRecalculo m = MotivoRecalculo.SUSPENSION_LEVANTADA;
        assertEquals(EstadoComercio.APROBADO, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, false, false, 1, 0, true, m));
        assertEquals(EstadoComercio.APROBADO, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, false, true, 0, 1, true, m));
        assertEquals(EstadoComercio.APROBADO, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, false, false, 0, 0, false, m));
    }

    @Test
    void alLevantarLaSuspensionConElDuenoBloqueadoNadaQuedaAptoVenta() {
        MotivoRecalculo m = MotivoRecalculo.SUSPENSION_LEVANTADA;
        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, true, true, 1, 0, true, m));
        assertEquals(EstadoComercio.APROBADO, AptitudVentaComercioService.decidir(EstadoComercio.SUSPENDIDO, true, false, 1, 0, true, m));
    }

    @Test
    void recalcularEscribeLaTransicionConElTextoDelMotivoYAvisaAlDuenoCuandoPuedeVender() {
        Comercio comercio = comercio(1, EstadoComercio.APROBADO);
        documentos(1, "APROBADO");

        EstadoComercio final_ = service.recalcular(comercio, new EntradasDueno(false, true), MotivoRecalculo.DOCUMENTO_APROBADO, null);

        assertEquals(EstadoComercio.APTO_VENTA, final_);
        verify(comercioService).registrarTransicionAutomatica(comercio, EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA,
                "Documento aprobado por el Administrador");
        verify(notificacionService).crearParaDueno(7, 1, "Tu comercio Comercio 1 ya puede recibir pedidos.",
                TipoNotificacion.COMERCIO_APTO_VENTA, TipoEntidadNotificacion.COMERCIO, 1);
    }

    @Test
    void recalcularQuePierdeLaAptitudDiceQueFalta() {
        Comercio sinDocumento = comercio(1, EstadoComercio.APTO_VENTA);
        documentos(1, "RECHAZADO");
        service.recalcular(sinDocumento, new EntradasDueno(false, true), MotivoRecalculo.DOCUMENTO_REVOCADO, null);
        verify(notificacionService).crearParaDueno(7, 1,
                "Tu comercio Comercio 1 dejó de recibir pedidos: falta tener un documento aprobado.",
                TipoNotificacion.COMERCIO_SIN_APTITUD, TipoEntidadNotificacion.COMERCIO, 1);
        verify(comercioService).registrarTransicionAutomatica(sinDocumento, EstadoComercio.APTO_VENTA, EstadoComercio.APROBADO,
                "Documento revocado por el Administrador");

        Comercio sinMp = comercio(2, EstadoComercio.APTO_VENTA);
        documentos(2, "APROBADO");
        service.recalcular(sinMp, new EntradasDueno(false, false), MotivoRecalculo.MP_DESVINCULADO, null);
        verify(notificacionService).crearParaDueno(7, 2, "Tu comercio Comercio 2 dejó de recibir pedidos: falta vincular Mercado Pago.",
                TipoNotificacion.COMERCIO_SIN_APTITUD, TipoEntidadNotificacion.COMERCIO, 2);
        verify(comercioService).registrarTransicionAutomatica(sinMp, EstadoComercio.APTO_VENTA, EstadoComercio.APROBADO,
                "Desvinculación de cuenta de Mercado Pago");

        Comercio sinNada = comercio(3, EstadoComercio.APTO_VENTA);
        documentos(3);
        service.recalcular(sinNada, new EntradasDueno(false, false), MotivoRecalculo.DOCUMENTO_ELIMINADO, null);
        verify(notificacionService).crearParaDueno(7, 3,
                "Tu comercio Comercio 3 dejó de recibir pedidos: falta vincular Mercado Pago y tener un documento aprobado.",
                TipoNotificacion.COMERCIO_SIN_APTITUD, TipoEntidadNotificacion.COMERCIO, 3);
    }

    @Test
    void conLaExigenciaApagadaLosDocumentosSeIgnoranYElAvisoNoLosMenciona() {
        propiedades.setRequerida(false);
        Comercio comercio = comercio(1, EstadoComercio.APTO_VENTA);
        documentos(1);

        service.recalcular(comercio, new EntradasDueno(false, false), MotivoRecalculo.MP_DESVINCULADO, null);

        verify(notificacionService).crearParaDueno(7, 1, "Tu comercio Comercio 1 dejó de recibir pedidos: falta vincular Mercado Pago.",
                TipoNotificacion.COMERCIO_SIN_APTITUD, TipoEntidadNotificacion.COMERCIO, 1);
    }

    @Test
    void sinCambioDeDestinoNoEscribeNiAvisa() {
        Comercio comercio = comercio(1, EstadoComercio.APTO_VENTA);
        documentos(1, "APROBADO", "PENDIENTE");

        EstadoComercio estado = service.recalcular(comercio, new EntradasDueno(false, true), MotivoRecalculo.DOCUMENTO_SUBIDO, null);

        assertEquals(EstadoComercio.APTO_VENTA, estado);
        verify(comercioService, never()).registrarTransicionAutomatica(any(), any(), any(), anyString());
        verify(notificacionService, never()).crearParaDueno(any(), any(), anyString(), any(), any(), any());
    }

    @ParameterizedTest
    @CsvSource({"PENDIENTE", "RECHAZADO", "SUSPENDIDO", "RECHAZO_DEFINITIVO"})
    void unComercioQueNoParticipaNiSiquieraLeeLosDocumentos(EstadoComercio estado) {
        Comercio comercio = comercio(1, estado);

        assertEquals(estado, service.recalcular(comercio, new EntradasDueno(false, true), MotivoRecalculo.DOCUMENTO_APROBADO, null));

        verify(documentoRepository, never()).estadosDelComercioConBloqueoCompartido(anyInt());
        verify(comercioService, never()).registrarTransicionAutomatica(any(), any(), any(), anyString());
    }

    @Test
    void conLaCuentaBloqueadaElQueCumpleVaACerradoTemporalmenteConElTextoDelBloqueoYSinAvisoDeAptitud() {
        Comercio comercio = comercio(1, EstadoComercio.APROBADO);
        documentos(1, "APROBADO");

        EstadoComercio estado = service.recalcular(comercio, new EntradasDueno(true, true), MotivoRecalculo.DOCUMENTO_APROBADO, null);

        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, estado);
        verify(comercioService).registrarTransicionAutomatica(comercio, EstadoComercio.APROBADO,
                EstadoComercio.CERRADO_TEMPORALMENTE, "Bloqueo de cuenta vigente al revisar la documentación");
        verify(notificacionService, never()).crearParaDueno(any(), any(), anyString(), any(), any(), any());
    }

    @Test
    void elTextoDelBloqueoVigenteDependeDeQuienLoDispara() {
        Comercio alVincular = comercio(1, EstadoComercio.APROBADO);
        documentos(1);
        propiedades.setRequerida(false);
        service.recalcular(alVincular, new EntradasDueno(true, true), MotivoRecalculo.MP_VINCULADO, null);
        verify(comercioService).registrarTransicionAutomatica(alVincular, EstadoComercio.APROBADO,
                EstadoComercio.CERRADO_TEMPORALMENTE, "Bloqueo de cuenta vigente al vincular Mercado Pago");

        Comercio alAprobar = comercio(2, EstadoComercio.APROBADO);
        documentos(2);
        service.recalcular(alAprobar, new EntradasDueno(true, true), MotivoRecalculo.COMERCIO_APROBADO,
                AptitudVentaComercioService.DETALLE_BLOQUEO_VIGENTE_AL_APROBAR);
        verify(comercioService).registrarTransicionAutomatica(alAprobar, EstadoComercio.APROBADO,
                EstadoComercio.CERRADO_TEMPORALMENTE, "Bloqueo de cuenta vigente al aprobar");
    }

    @Test
    void laAprobacionDelComercioPuedeSilenciarElAvisoDeAptitud() {
        propiedades.setRequerida(false);
        Comercio comercio = comercio(1, EstadoComercio.APROBADO);
        documentos(1);

        service.recalcular(comercio, new EntradasDueno(false, true), MotivoRecalculo.COMERCIO_APROBADO, null, false);

        verify(comercioService).registrarTransicionAutomatica(comercio, EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA,
                "Vinculación automática de cuenta de Mercado Pago");
        verify(notificacionService, never()).crearParaDueno(any(), any(), anyString(), any(), any(), any());
    }

    @Test
    void leerDuenoTomaPrimeroElUsuarioYDespuesLaCuentaDeMercadoPago() {
        when(comercioService.duenoBloqueadoConBloqueo(7)).thenReturn(true);
        when(cuentaMercadoPagoService.existeActivaConBloqueo(7)).thenReturn(true);

        EntradasDueno entradas = service.leerDueno(7);

        assertTrue(entradas.bloqueado());
        assertTrue(entradas.cuentaMercadoPagoActiva());
        InOrder orden = inOrder(comercioService, cuentaMercadoPagoService);
        orden.verify(comercioService).duenoBloqueadoConBloqueo(7);
        orden.verify(cuentaMercadoPagoService).existeActivaConBloqueo(7);
    }

    @Test
    void leerDuenoRestauradoNoLeeElBloqueoPorqueLaCuentaSeEstaRestaurando() {
        when(cuentaMercadoPagoService.existeActivaConBloqueo(7)).thenReturn(true);

        EntradasDueno entradas = service.leerDuenoRestaurado(7);

        assertFalse(entradas.bloqueado());
        assertTrue(entradas.cuentaMercadoPagoActiva());
        verify(comercioService, never()).duenoBloqueadoConBloqueo(anyInt());
    }

    @Test
    void bloquearComercioLoTomaConForUpdateYRefrescaSuEstadoReal() {
        Comercio comercio = comercio(1, EstadoComercio.APROBADO);
        when(comercioRepository.findByIdConBloqueo(1)).thenReturn(Optional.of(comercio));

        assertEquals(comercio, service.bloquearComercio(1));

        InOrder orden = inOrder(comercioRepository, entityManager);
        orden.verify(comercioRepository).findByIdConBloqueo(1);
        orden.verify(entityManager).refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void recalcularComerciosDelDuenoRefrescaYRecalculaCadaUnoSinTocarLosQueNoParticipan() {
        propiedades.setRequerida(false);
        Comercio aprobado = comercio(1, EstadoComercio.APROBADO);
        Comercio pendiente = comercio(2, EstadoComercio.PENDIENTE);
        Comercio suspendido = comercio(3, EstadoComercio.SUSPENDIDO);
        Comercio aptoVenta = comercio(4, EstadoComercio.APTO_VENTA);
        when(comercioRepository.findByDuenoIdConBloqueo(7)).thenReturn(List.of(aprobado, pendiente, suspendido, aptoVenta));
        documentos(1);
        documentos(4);

        service.recalcularComerciosDelDueno(7, new EntradasDueno(false, true), MotivoRecalculo.MP_VINCULADO);

        verify(entityManager, times(4)).refresh(any(Comercio.class), eq(LockModeType.PESSIMISTIC_WRITE));
        verify(comercioService).registrarTransicionAutomatica(aprobado, EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA,
                "Vinculación automática de cuenta de Mercado Pago");
        verify(comercioService, times(1)).registrarTransicionAutomatica(any(), any(), any(), anyString());
    }

    @Test
    void cerrarPorBloqueoPasaUnAptoVentaACerradoTemporalmente() {
        Comercio comercio = comercio(1, EstadoComercio.APTO_VENTA);

        boolean cerro = service.cerrarPorBloqueo(comercio, "Bloqueo de cuenta por intentos fallidos");

        assertTrue(cerro);
        verify(entityManager).refresh(comercio, LockModeType.PESSIMISTIC_WRITE);
        verify(comercioService).registrarTransicionAutomatica(comercio, EstadoComercio.APTO_VENTA,
                EstadoComercio.CERRADO_TEMPORALMENTE, "Bloqueo de cuenta por intentos fallidos");
        verify(notificacionService, never()).crearParaDueno(any(), any(), anyString(), any(), any(), any());
    }

    @ParameterizedTest
    @CsvSource({"PENDIENTE", "APROBADO", "RECHAZADO", "SUSPENDIDO", "INACTIVO", "CERRADO_TEMPORALMENTE", "RECHAZO_DEFINITIVO"})
    void cerrarPorBloqueoNoTocaNingunOtroEstado(EstadoComercio estado) {
        Comercio comercio = comercio(1, estado);

        assertFalse(service.cerrarPorBloqueo(comercio, "x"));

        assertEquals(estado, comercio.getEstado());
        verify(comercioService, never()).registrarTransicionAutomatica(any(), any(), any(), anyString());
    }

    @Test
    void cerrarPorBloqueoDecideConElEstadoRealDespuesDelBloqueoYNoConLaFoto() {
        Comercio comercio = comercio(1, EstadoComercio.APTO_VENTA);
        doAnswer(invocacion -> {
            comercio.setEstado(EstadoComercio.APROBADO);
            return null;
        }).when(entityManager).refresh(eq(comercio), eq(LockModeType.PESSIMISTIC_WRITE));

        assertFalse(service.cerrarPorBloqueo(comercio, "x"));

        verify(comercioService, never()).registrarTransicionAutomatica(any(), any(), any(), anyString());
    }

    @Test
    void unAprobadoQueUnaVinculacionAcabaDePasarAAptoVentaSiSeCierra() {
        Comercio comercio = comercio(1, EstadoComercio.APROBADO);
        doAnswer(invocacion -> {
            comercio.setEstado(EstadoComercio.APTO_VENTA);
            return null;
        }).when(entityManager).refresh(eq(comercio), eq(LockModeType.PESSIMISTIC_WRITE));

        assertTrue(service.cerrarPorBloqueo(comercio, "x"));

        verify(comercioService).registrarTransicionAutomatica(comercio, EstadoComercio.APTO_VENTA,
                EstadoComercio.CERRADO_TEMPORALMENTE, "x");
    }

    @Test
    void restaurarLeeLaCuentaConBloqueoYSoloMueveLosComerciosDelEstadoDeOrigen() {
        propiedades.setRequerida(true);
        Comercio cerradoConDoc = comercio(1, EstadoComercio.CERRADO_TEMPORALMENTE);
        Comercio cerradoSinDoc = comercio(2, EstadoComercio.CERRADO_TEMPORALMENTE);
        Comercio aprobado = comercio(3, EstadoComercio.APROBADO);
        Comercio inactivo = comercio(4, EstadoComercio.INACTIVO);
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(7))
                .thenReturn(List.of(cerradoConDoc, cerradoSinDoc, aprobado, inactivo));
        when(cuentaMercadoPagoService.existeActivaConBloqueo(7)).thenReturn(true);
        documentos(1, "APROBADO");
        documentos(2, "RECHAZADO");

        service.restaurar(7, EstadoComercio.CERRADO_TEMPORALMENTE, "Restauración por recuperación de contraseña");

        verify(comercioService).registrarTransicionAutomatica(cerradoConDoc, EstadoComercio.CERRADO_TEMPORALMENTE,
                EstadoComercio.APTO_VENTA, "Restauración por recuperación de contraseña");
        verify(comercioService).registrarTransicionAutomatica(cerradoSinDoc, EstadoComercio.CERRADO_TEMPORALMENTE,
                EstadoComercio.APROBADO, "Restauración por recuperación de contraseña");
        verify(comercioService, times(2)).registrarTransicionAutomatica(any(), any(), any(), anyString());
        verify(cuentaMercadoPagoService).existeActivaConBloqueo(7);
        verify(entityManager).refresh(cerradoConDoc, LockModeType.PESSIMISTIC_WRITE);
        verify(entityManager, never()).refresh(aprobado, LockModeType.PESSIMISTIC_WRITE);
        verify(notificacionService).crearParaDueno(7, 2,
                "Tu comercio Comercio 2 dejó de recibir pedidos: falta tener un documento aprobado.",
                TipoNotificacion.COMERCIO_SIN_APTITUD, TipoEntidadNotificacion.COMERCIO, 2);
        verify(notificacionService, never()).crearParaDueno(eq(7), eq(1), anyString(), any(), any(), any());
    }

    @Test
    void restaurarUnComercioInactivoUsaLaMismaReglaYSuPropioOrigen() {
        propiedades.setRequerida(false);
        Comercio inactivo = comercio(4, EstadoComercio.INACTIVO);
        Comercio cerrado = comercio(5, EstadoComercio.CERRADO_TEMPORALMENTE);
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(7)).thenReturn(List.of(inactivo, cerrado));
        when(cuentaMercadoPagoService.existeActivaConBloqueo(7)).thenReturn(false);
        documentos(4);

        service.restaurar(7, EstadoComercio.INACTIVO, "Restauración por reactivación de cuenta");

        verify(comercioService).registrarTransicionAutomatica(inactivo, EstadoComercio.INACTIVO, EstadoComercio.APROBADO,
                "Restauración por reactivación de cuenta");
        verify(comercioService, times(1)).registrarTransicionAutomatica(any(), any(), any(), anyString());
    }
}

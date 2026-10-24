package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.TurnoCierreProperties;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.repositories.CierreTurnoInsercionRepository;
import com.bajonea.backend.repositories.CierreTurnoRepository;
import com.bajonea.backend.repositories.CierreTurnoRepository.UltimoCierreDeComercio;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.ComercioRepository.ComercioElegibleParaCierre;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.services.CierreTurnoService.CandidatoCierre;
import com.bajonea.backend.services.CierreTurnoService.ResultadoCierre;
import com.bajonea.backend.services.DisponibilidadComercioService.Turno;
import com.bajonea.backend.services.ResumenTurnoService.CifrasTurno;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class CierreTurnoServiceTest {

    private static final LocalDate VIERNES = LocalDate.of(2026, 10, 23);

    private ComercioRepository comercioRepository;
    private HorarioRepository horarioRepository;
    private CierreTurnoRepository cierreTurnoRepository;
    private CierreTurnoInsercionRepository insercionRepository;
    private PedidoRepository pedidoRepository;
    private ResumenTurnoService resumenTurnoService;
    private TurnoCierreProperties propiedades;
    private CierreTurnoService servicio;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        horarioRepository = mock(HorarioRepository.class);
        cierreTurnoRepository = mock(CierreTurnoRepository.class);
        insercionRepository = mock(CierreTurnoInsercionRepository.class);
        pedidoRepository = mock(PedidoRepository.class);
        resumenTurnoService = mock(ResumenTurnoService.class);
        propiedades = new TurnoCierreProperties();
        DisponibilidadComercioService disponibilidad = new DisponibilidadComercioService(horarioRepository,
                mock(HistorialCierreComercioRepository.class),
                Clock.fixed(Instant.parse("2026-10-23T15:00:00Z"), ZoneId.of("America/Argentina/Ushuaia")));
        servicio = new CierreTurnoService(comercioRepository, horarioRepository, cierreTurnoRepository, insercionRepository,
                pedidoRepository, resumenTurnoService, disponibilidad, propiedades);
    }

    private static ComercioElegibleParaCierre elegible(int id, EstadoComercio estado) {
        ComercioElegibleParaCierre comercio = mock(ComercioElegibleParaCierre.class);
        when(comercio.getId()).thenReturn(id);
        when(comercio.getEstado()).thenReturn(estado);
        return comercio;
    }

    private static Horario franja(int id, int comercioId, DiaSemana dia, String apertura, String cierre) {
        return Horario.builder().id(id).comercio(Comercio.builder().id(comercioId).build()).diaSemana(dia)
                .horaApertura(LocalTime.parse(apertura)).horaCierre(LocalTime.parse(cierre))
                .vigenteDesde(LocalDate.of(2026, 1, 1)).build();
    }

    private static Horario franja(int id, int comercioId, DiaSemana dia, String apertura, String cierre, LocalDate hasta) {
        Horario horario = franja(id, comercioId, dia, apertura, cierre);
        horario.setVigenteHasta(hasta);
        return horario;
    }

    private void con(List<ComercioElegibleParaCierre> comercios, List<Horario> horarios) {
        when(comercioRepository.findElegiblesParaCierreDeTurno(any())).thenReturn(comercios);
        when(horarioRepository.findVigentesDesdeIn(any(), any())).thenReturn(horarios);
    }

    private void conUltimoCierre(int comercioId, LocalDateTime fin) {
        UltimoCierreDeComercio ultimo = mock(UltimoCierreDeComercio.class);
        when(ultimo.getComercioId()).thenReturn(comercioId);
        when(ultimo.getFin()).thenReturn(fin);
        when(cierreTurnoRepository.findUltimoFinDesde(any(), any())).thenReturn(List.of(ultimo));
    }

    @Test
    void soloSeConsultanLosEstadosQuePuedenVenderOTenerPedidosEnCurso() {
        con(List.of(), List.of());

        servicio.candidatos(VIERNES.atTime(15, 30));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<EstadoComercio>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(comercioRepository).findElegiblesParaCierreDeTurno(captor.capture());
        assertEquals(java.util.Set.of(EstadoComercio.APTO_VENTA, EstadoComercio.SUSPENDIDO, EstadoComercio.CERRADO_TEMPORALMENTE),
                java.util.Set.copyOf(captor.getValue()));
    }

    @Test
    void elTurnoSeCierraJustoCuandoPasaElFinMasLaGraciaYNoUnSegundoAntes() {
        con(List.of(elegible(1, EstadoComercio.APTO_VENTA)), List.of(franja(10, 1, DiaSemana.VIERNES, "12:00", "15:00")));
        conUltimoCierre(1, VIERNES.minusDays(1).atTime(15, 0));

        assertEquals(0, servicio.candidatos(VIERNES.atTime(15, 29, 59)).size());
        List<CandidatoCierre> exacto = servicio.candidatos(VIERNES.atTime(15, 30));
        assertEquals(1, exacto.size());
        assertEquals(VIERNES.atTime(15, 0), exacto.get(0).turno().fin());
        assertEquals(10, exacto.get(0).turno().horario().getId());
    }

    @Test
    void unComercioSinCierresPreviosCierraSoloSuUltimoTurnoTerminado() {
        List<Horario> semana = List.of(franja(10, 1, DiaSemana.VIERNES, "12:00", "15:00"),
                franja(11, 1, DiaSemana.JUEVES, "12:00", "15:00"), franja(12, 1, DiaSemana.MIERCOLES, "12:00", "15:00"));
        con(List.of(elegible(1, EstadoComercio.APTO_VENTA)), semana);
        when(cierreTurnoRepository.findUltimoFinDesde(any(), any())).thenReturn(List.of());

        List<CandidatoCierre> candidatos = servicio.candidatos(VIERNES.atTime(16, 0));

        assertEquals(1, candidatos.size());
        assertEquals(VIERNES.atTime(15, 0), candidatos.get(0).turno().fin());
    }

    @Test
    void unComercioSinCierresPreviosEsperaLaGraciaDeSuUltimoTurnoSinCerrarUnoMasViejo() {
        List<Horario> semana = List.of(franja(10, 1, DiaSemana.VIERNES, "12:00", "15:00"),
                franja(11, 1, DiaSemana.JUEVES, "12:00", "15:00"));
        con(List.of(elegible(1, EstadoComercio.APTO_VENTA)), semana);
        when(cierreTurnoRepository.findUltimoFinDesde(any(), any())).thenReturn(List.of());

        assertEquals(0, servicio.candidatos(VIERNES.atTime(15, 10)).size());
        assertEquals(1, servicio.candidatos(VIERNES.atTime(15, 30)).size());
    }

    @Test
    void unComercioConCierresPreviosCierraTodosLosTurnosPosterioresAlUltimoEnOrden() {
        List<Horario> semana = List.of(franja(10, 1, DiaSemana.VIERNES, "12:00", "15:00"),
                franja(11, 1, DiaSemana.JUEVES, "12:00", "15:00"), franja(12, 1, DiaSemana.JUEVES, "20:00", "23:00"),
                franja(13, 1, DiaSemana.MIERCOLES, "12:00", "15:00"));
        con(List.of(elegible(1, EstadoComercio.APTO_VENTA)), semana);
        conUltimoCierre(1, VIERNES.minusDays(2).atTime(15, 0));

        List<CandidatoCierre> candidatos = servicio.candidatos(VIERNES.atTime(16, 0));

        assertEquals(List.of(VIERNES.minusDays(1).atTime(15, 0), VIERNES.minusDays(1).atTime(23, 0), VIERNES.atTime(15, 0)),
                candidatos.stream().map(c -> c.turno().fin()).toList());
    }

    @Test
    void ningunTurnoMasViejoQueLaVentanaDeDiasSeCierraAunqueNoTengaFila() {
        List<Horario> semana = List.of(franja(10, 1, DiaSemana.MARTES, "12:00", "15:00"));
        con(List.of(elegible(1, EstadoComercio.APTO_VENTA)), semana);
        conUltimoCierre(1, VIERNES.minusDays(20).atTime(15, 0));

        assertEquals(0, servicio.candidatos(VIERNES.atTime(16, 0)).size());
    }

    @Test
    void unaEdicionDeHorariosNoHaceDesaparecerElTurnoDeLaVersionCerrada() {
        Horario vieja = franja(10, 1, DiaSemana.VIERNES, "12:00", "15:00", VIERNES);
        Horario nueva = franja(11, 1, DiaSemana.VIERNES, "13:00", "16:00");
        nueva.setVigenteDesde(VIERNES.plusDays(1));
        con(List.of(elegible(1, EstadoComercio.APTO_VENTA)), List.of(vieja, nueva));
        conUltimoCierre(1, VIERNES.minusDays(1).atTime(15, 0));

        List<CandidatoCierre> candidatos = servicio.candidatos(VIERNES.atTime(16, 0));

        assertEquals(1, candidatos.size());
        assertEquals(10, candidatos.get(0).turno().horario().getId());
    }

    @Test
    void unComercioSinFranjasNoTieneTurnosNiCierre() {
        con(List.of(elegible(1, EstadoComercio.APTO_VENTA)), List.of());

        assertTrue(servicio.candidatos(VIERNES.atTime(16, 0)).isEmpty());
    }

    @Test
    void unTurnoQueCruzaLaMedianocheSeCierraDespuesDelFinDelDiaSiguienteMasLaGracia() {
        con(List.of(elegible(1, EstadoComercio.APTO_VENTA)), List.of(franja(10, 1, DiaSemana.JUEVES, "20:00", "02:00")));
        conUltimoCierre(1, VIERNES.minusDays(8).atTime(2, 0));

        assertEquals(0, servicio.candidatos(VIERNES.atTime(2, 29)).size());
        assertEquals(1, servicio.candidatos(VIERNES.atTime(2, 30)).size());
    }

    private CandidatoCierre candidato(EstadoComercio estado) {
        Horario horario = franja(10, 1, DiaSemana.VIERNES, "12:00", "15:00");
        return new CandidatoCierre(1, estado, new Turno(horario, VIERNES.atTime(12, 0), VIERNES.atTime(15, 0)));
    }

    private void cifras(int pedidos, int pendientes) {
        when(resumenTurnoService.cifras(eq(1), any())).thenReturn(new CifrasTurno(pedidos,
                new BigDecimal("1000.00"), new BigDecimal("10.00"), new BigDecimal("990.00"), pendientes));
        when(insercionRepository.insertar(anyInt(), any(), anyInt(), any(), any(), anyInt(), any(), any(), any(), anyInt(), any(),
                anyString(), any())).thenReturn(true);
    }

    @Test
    void conPagosSinResolverCreadosAntesDelFinElCierreSeDifiereMientrasNoPaseElTope() {
        when(pedidoRepository.existsByComercioIdAndEstadoCreadoAntesDe(1, EstadoPedido.PENDIENTE_PAGO, VIERNES.atTime(15, 0)))
                .thenReturn(true);
        cifras(2, 0);

        assertEquals(ResultadoCierre.DIFERIDO, servicio.cerrar(candidato(EstadoComercio.APTO_VENTA), VIERNES.atTime(15, 30)));
        assertEquals(ResultadoCierre.DIFERIDO, servicio.cerrar(candidato(EstadoComercio.APTO_VENTA), VIERNES.atTime(16, 59, 59)));
        verify(insercionRepository, never()).insertar(anyInt(), any(), anyInt(), any(), any(), anyInt(), any(), any(), any(),
                anyInt(), any(), anyString(), any());
        assertEquals(ResultadoCierre.CERRADO, servicio.cerrar(candidato(EstadoComercio.APTO_VENTA), VIERNES.atTime(17, 0)));
    }

    @Test
    void laFotoGuardaLasCifrasDelPanelYQuedaPendienteDeEnvio() {
        cifras(23, 2);

        ResultadoCierre resultado = servicio.cerrar(candidato(EstadoComercio.APTO_VENTA), VIERNES.atTime(15, 30));

        assertEquals(ResultadoCierre.CERRADO, resultado);
        verify(insercionRepository).insertar(eq(1), eq(VIERNES), eq(10), eq(VIERNES.atTime(12, 0)), eq(VIERNES.atTime(15, 0)),
                eq(23), eq(new BigDecimal("1000.00")), eq(new BigDecimal("10.00")), eq(new BigDecimal("990.00")), eq(2),
                eq(VIERNES.atTime(15, 30)), eq("PENDIENTE"), isNull());
    }

    @Test
    void unaClaveDuplicadaSignificaQueOtraCorridaYaLoCerro() {
        cifras(1, 0);
        when(insercionRepository.insertar(anyInt(), any(), anyInt(), any(), any(), anyInt(), any(), any(), any(), anyInt(), any(),
                anyString(), any())).thenReturn(false);

        assertEquals(ResultadoCierre.YA_CERRADO, servicio.cerrar(candidato(EstadoComercio.APTO_VENTA), VIERNES.atTime(15, 30)));
    }

    @Test
    void unComercioSuspendidoSinPedidosNiPendientesRegistraElCierreSinAvisar() {
        cifras(0, 0);

        servicio.cerrar(candidato(EstadoComercio.SUSPENDIDO), VIERNES.atTime(15, 30));

        verify(insercionRepository).insertar(anyInt(), any(), anyInt(), any(), any(), eq(0), any(), any(), any(), eq(0), any(),
                eq("OMITIDO"), eq("Comercio no operativo sin pedidos ni pendientes"));
    }

    @Test
    void unComercioSuspendidoOCerradoTemporalmenteConPedidosOPendientesSiAvisa() {
        cifras(3, 0);
        servicio.cerrar(candidato(EstadoComercio.SUSPENDIDO), VIERNES.atTime(15, 30));
        cifras(0, 1);
        servicio.cerrar(candidato(EstadoComercio.CERRADO_TEMPORALMENTE), VIERNES.atTime(15, 30));

        verify(insercionRepository, org.mockito.Mockito.times(2)).insertar(anyInt(), any(), anyInt(), any(), any(), anyInt(), any(),
                any(), any(), anyInt(), any(), eq("PENDIENTE"), isNull());
    }

    @Test
    void unComercioAptoVentaSinPedidosTambienAvisaConTotalCero() {
        cifras(0, 0);

        servicio.cerrar(candidato(EstadoComercio.APTO_VENTA), VIERNES.atTime(15, 30));

        verify(insercionRepository).insertar(anyInt(), any(), anyInt(), any(), any(), eq(0), any(), any(), any(), eq(0), any(),
                eq("PENDIENTE"), isNull());
    }
}

package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.DatosLegalesComercioRequestDTO;
import com.bajonea.backend.dto.request.DireccionRequestDTO;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.PersonaJuridica;
import com.bajonea.backend.entities.Provincia;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.enums.CampoCambioComercio;
import com.bajonea.backend.enums.CondicionIva;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.TipoComercio;
import com.bajonea.backend.enums.TipoPersonaJuridica;
import com.bajonea.backend.enums.TipoRedSocial;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.repositories.PersonaJuridicaRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class ComercioEdicionServiceTest {

    private ComercioRepository comercioRepository;
    private DireccionRepository direccionRepository;
    private HorarioRepository horarioRepository;
    private RedSocialRepository redSocialRepository;
    private PersonaJuridicaRepository personaJuridicaRepository;
    private PersonaFisicaRepository personaFisicaRepository;
    private CloudinaryService cloudinaryService;
    private ComercioEdicionService service;
    private Comercio comercio;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        direccionRepository = mock(DireccionRepository.class);
        horarioRepository = mock(HorarioRepository.class);
        redSocialRepository = mock(RedSocialRepository.class);
        personaJuridicaRepository = mock(PersonaJuridicaRepository.class);
        personaFisicaRepository = mock(PersonaFisicaRepository.class);
        cloudinaryService = mock(CloudinaryService.class);
        service = new ComercioEdicionService(comercioRepository, direccionRepository, horarioRepository, redSocialRepository,
                personaJuridicaRepository, personaFisicaRepository, cloudinaryService);

        comercio = Comercio.builder()
                .id(5)
                .nombre("Cafetería Del Sur")
                .descripcion("Cafe de especialidad")
                .telefono("+5492964111222")
                .email("contacto@cafe.test")
                .tipoComercio(TipoComercio.CAFETERIA)
                .aceptaDelivery(true)
                .aceptaRetiro(false)
                .fotoPerfilUrl("https://res.cloudinary.com/x/image/upload/v1/comercios/pre-registro/a.png")
                .build();
    }

    private static Localidad localidad(String id, String nombre) {
        return Localidad.builder().id(id).nombre(nombre).provincia(Provincia.builder().id("94").nombre("Tierra Del Fuego").build()).build();
    }

    private static HorarioRequestDTO franja(DiaSemana dia, String apertura, String cierre) {
        return new HorarioRequestDTO(dia, LocalTime.parse(apertura), LocalTime.parse(cierre));
    }

    private static Horario horario(DiaSemana dia, String apertura, String cierre) {
        return Horario.builder().diaSemana(dia).horaApertura(LocalTime.parse(apertura)).horaCierre(LocalTime.parse(cierre)).build();
    }

    @Test
    void datosBasicosIgualesDespuesDeNormalizarNoSonUnCambioNiSeGuardan() {
        List<CambioComercio> cambios = service.actualizarDatosBasicos(comercio, "  cafetería del sur ", "  Cafe de especialidad",
                "+5492964111222", " contacto@cafe.test ");

        assertTrue(cambios.isEmpty());
        verify(comercioRepository, never()).save(any());
    }

    @Test
    void unaDescripcionVaciaEnBlancoONulaEsLoMismo() {
        comercio.setDescripcion(null);

        assertTrue(service.actualizarDatosBasicos(comercio, "Cafetería Del Sur", "   ", "+5492964111222", "contacto@cafe.test").isEmpty());
        assertTrue(service.actualizarDatosBasicos(comercio, "Cafetería Del Sur", null, "+5492964111222", "contacto@cafe.test").isEmpty());
        verify(comercioRepository, never()).save(any());
    }

    @Test
    void cadaDatoBasicoCambiadoDejaUnCambioConSuValorAnteriorYNuevo() {
        List<CambioComercio> cambios = service.actualizarDatosBasicos(comercio, "nuevo nombre", "Otra descripción", "+5492964999888",
                "otro@cafe.test");

        assertEquals(List.of(
                new CambioComercio(CampoCambioComercio.NOMBRE, "Cafetería Del Sur", "Nuevo Nombre"),
                new CambioComercio(CampoCambioComercio.DESCRIPCION, "Cafe de especialidad", "Otra descripción"),
                new CambioComercio(CampoCambioComercio.TELEFONO, "+5492964111222", "+5492964999888"),
                new CambioComercio(CampoCambioComercio.EMAIL_CONTACTO, "contacto@cafe.test", "otro@cafe.test")), cambios);
        assertEquals("Nuevo Nombre", comercio.getNombre());
        assertNotNull(comercio.getFechaModificacion());
        verify(comercioRepository).save(comercio);
    }

    @Test
    void unaDescripcionQuitadaQuedaEnNulo() {
        List<CambioComercio> cambios = service.actualizarDatosBasicos(comercio, "Cafetería Del Sur", "", "+5492964111222", "contacto@cafe.test");

        assertEquals(List.of(new CambioComercio(CampoCambioComercio.DESCRIPCION, "Cafe de especialidad", null)), cambios);
        assertNull(comercio.getDescripcion());
    }

    @Test
    void tipoYModalidadesSoloCambianSiSonDistintos() {
        assertTrue(service.actualizarTipo(comercio, TipoComercio.CAFETERIA).isEmpty());
        assertEquals(List.of(new CambioComercio(CampoCambioComercio.TIPO_COMERCIO, "CAFETERIA", "PIZZERIA")),
                service.actualizarTipo(comercio, TipoComercio.PIZZERIA));

        assertTrue(service.actualizarModalidades(comercio, true, false).isEmpty());
        assertEquals(List.of(new CambioComercio(CampoCambioComercio.MODALIDADES, "Solo delivery", "Delivery y retiro")),
                service.actualizarModalidades(comercio, true, true));
        assertTrue(comercio.isAceptaRetiro());
    }

    @Test
    void laMismaFotoNoSeValidaNiSeRegistra() {
        assertTrue(service.actualizarFoto(comercio, comercio.getFotoPerfilUrl()).isEmpty());
        verify(cloudinaryService, never()).validarFotoPerfilComercio(any(), any());
    }

    @Test
    void unaFotoDistintaSeValidaContraLaCarpetaDelComercioYSeRegistra() {
        String nueva = "https://res.cloudinary.com/x/image/upload/v2/comercios/5/perfil/b.png";

        List<CambioComercio> cambios = service.actualizarFoto(comercio, nueva);

        verify(cloudinaryService).validarFotoPerfilComercio(5, nueva);
        assertEquals(1, cambios.size());
        assertEquals(CampoCambioComercio.FOTO_PERFIL, cambios.get(0).campo());
        assertEquals(nueva, comercio.getFotoPerfilUrl());
    }

    @Test
    void unaFotoInvalidaCortaSinCambiarNada() {
        org.mockito.Mockito.doThrow(new ValidacionException("foto")).when(cloudinaryService).validarFotoPerfilComercio(any(), any());

        assertThrows(ValidacionException.class, () -> service.actualizarFoto(comercio, "https://res.cloudinary.com/x/image/upload/otra.png"));
        assertEquals("https://res.cloudinary.com/x/image/upload/v1/comercios/pre-registro/a.png", comercio.getFotoPerfilUrl());
    }

    private Direccion direccionActual() {
        Direccion direccion = Direccion.builder()
                .id(11)
                .calle("Belgrano")
                .numero("250")
                .pisoDepto(null)
                .codigoPostal("9420")
                .localidad(localidad("L1", "Río Grande"))
                .build();
        when(direccionRepository.findByComercioId(5)).thenReturn(Optional.of(direccion));
        return direccion;
    }

    @Test
    void laMismaDireccionConPisoEnBlancoYCodigoPostalCanonicoNoEsUnCambio() {
        direccionActual();
        DireccionRequestDTO igual = new DireccionRequestDTO(" belgrano ", " 250 ", "   ", "9420", "L1", false);

        assertTrue(service.actualizarDireccion(comercio, igual, localidad("L1", "Río Grande")).isEmpty());
        verify(direccionRepository, never()).save(any());
    }

    @Test
    void cambiarCualquierPiezaDeLaDireccionLaActualizaEnElLugar() {
        Direccion direccion = direccionActual();
        DireccionRequestDTO nueva = new DireccionRequestDTO("moreno", "10", "2B", "v9420abc", "L2", false);

        List<CambioComercio> cambios = service.actualizarDireccion(comercio, nueva, localidad("L2", "Tolhuin"));

        assertEquals(List.of(new CambioComercio(CampoCambioComercio.DIRECCION,
                "Belgrano 250, Río Grande, Tierra Del Fuego (9420)", "Moreno 10, 2B, Tolhuin, Tierra Del Fuego (V9420ABC)")), cambios);
        assertEquals("Moreno", direccion.getCalle());
        assertEquals("V9420ABC", direccion.getCodigoPostal());
        assertEquals("L2", direccion.getLocalidad().getId());
        verify(direccionRepository).save(direccion);
    }

    @Test
    void soloCambiarElCodigoPostalCuentaComoCambioDeDireccion() {
        direccionActual();
        DireccionRequestDTO nueva = new DireccionRequestDTO("Belgrano", "250", null, "9421", "L1", false);

        assertEquals(1, service.actualizarDireccion(comercio, nueva, localidad("L1", "Río Grande")).size());
    }

    @Test
    void horariosConLasMismasFranjasEnOtroOrdenYConSegundosNoSonUnCambio() {
        when(horarioRepository.findByComercioId(5)).thenReturn(List.of(
                horario(DiaSemana.LUNES, "09:00:00", "13:00:00"), horario(DiaSemana.MARTES, "09:00:00", "13:00:00")));

        List<CambioComercio> cambios = service.reemplazarHorarios(comercio, List.of(
                franja(DiaSemana.MARTES, "09:00", "13:00"), franja(DiaSemana.LUNES, "09:00:30", "13:00")));

        assertTrue(cambios.isEmpty());
        verify(horarioRepository, never()).deleteAll(anyList());
        verify(horarioRepository, never()).saveAll(anyList());
    }

    @Test
    void cambiarLosHorariosBorraLasFranjasViejasYCargaLasNuevas() {
        List<Horario> actuales = List.of(horario(DiaSemana.LUNES, "09:00:00", "13:00:00"));
        when(horarioRepository.findByComercioId(5)).thenReturn(actuales);

        List<CambioComercio> cambios = service.reemplazarHorarios(comercio, List.of(
                franja(DiaSemana.LUNES, "09:00", "13:00"), franja(DiaSemana.LUNES, "17:00", "21:00")));

        assertEquals(List.of(new CambioComercio(CampoCambioComercio.HORARIOS, "Lunes 09:00-13:00",
                "Lunes 09:00-13:00; Lunes 17:00-21:00")), cambios);
        verify(horarioRepository).deleteAll(actuales);
        verify(horarioRepository).flush();
        verify(horarioRepository).saveAll(anyList());
    }

    private static RedSocial red(TipoRedSocial tipo, String url, LocalDateTime baja) {
        return RedSocial.builder().id(tipo.ordinal() + 1).tipo(tipo).url(url).fechaBaja(baja).fechaCreacion(LocalDateTime.now()).build();
    }

    private static RedSocialRequestDTO pedidoRed(TipoRedSocial tipo, String url) {
        RedSocialRequestDTO red = new RedSocialRequestDTO();
        red.setTipo(tipo);
        red.setUrl(url);
        return red;
    }

    @Test
    void redesIgualesNoSonUnCambio() {
        when(redSocialRepository.findByComercioId(5)).thenReturn(List.of(
                red(TipoRedSocial.INSTAGRAM, "https://instagram.com/x", null), red(TipoRedSocial.FACEBOOK, "https://facebook.com/x", null)));

        List<CambioComercio> cambios = service.sincronizarRedes(comercio, List.of(
                pedidoRed(TipoRedSocial.FACEBOOK, "https://facebook.com/x"), pedidoRed(TipoRedSocial.INSTAGRAM, "https://instagram.com/x")));

        assertTrue(cambios.isEmpty());
        verify(redSocialRepository, never()).save(any());
    }

    @Test
    void lasRedesSeActualizanSeDanDeBajaSeReviveYSeInsertanSoloLasNuevas() {
        RedSocial instagram = red(TipoRedSocial.INSTAGRAM, "https://instagram.com/x", null);
        RedSocial facebook = red(TipoRedSocial.FACEBOOK, "https://facebook.com/x", null);
        RedSocial tiktokDadaDeBaja = red(TipoRedSocial.TIKTOK, "https://tiktok.com/x", LocalDateTime.now().minusDays(3));
        when(redSocialRepository.findByComercioId(5)).thenReturn(List.of(instagram, facebook, tiktokDadaDeBaja));

        List<CambioComercio> cambios = service.sincronizarRedes(comercio, List.of(
                pedidoRed(TipoRedSocial.INSTAGRAM, "https://instagram.com/nuevo"),
                pedidoRed(TipoRedSocial.TIKTOK, "https://tiktok.com/otro"),
                pedidoRed(TipoRedSocial.WHATSAPP, "https://wa.me/1")));

        assertEquals(1, cambios.size());
        assertEquals(CampoCambioComercio.REDES_SOCIALES, cambios.get(0).campo());
        assertEquals("INSTAGRAM: https://instagram.com/x; FACEBOOK: https://facebook.com/x", cambios.get(0).anterior());
        assertEquals("INSTAGRAM: https://instagram.com/nuevo; TIKTOK: https://tiktok.com/otro; WHATSAPP: https://wa.me/1",
                cambios.get(0).nuevo());

        assertEquals("https://instagram.com/nuevo", instagram.getUrl());
        assertNotNull(facebook.getFechaBaja());
        assertNull(tiktokDadaDeBaja.getFechaBaja());
        assertEquals("https://tiktok.com/otro", tiktokDadaDeBaja.getUrl());
        verify(redSocialRepository).save(org.mockito.ArgumentMatchers.argThat(r -> r.getId() == null && r.getTipo() == TipoRedSocial.WHATSAPP));
    }

    @Test
    void quitarTodasLasRedesDejaElValorNuevoEnNulo() {
        when(redSocialRepository.findByComercioId(5)).thenReturn(List.of(red(TipoRedSocial.INSTAGRAM, "https://instagram.com/x", null)));

        List<CambioComercio> cambios = service.sincronizarRedes(comercio, List.of());

        assertEquals(List.of(new CambioComercio(CampoCambioComercio.REDES_SOCIALES, "INSTAGRAM: https://instagram.com/x", null)), cambios);
    }

    private Dueno dueno() {
        PersonaJuridica pj = PersonaJuridica.builder()
                .razonSocial("Cafe Sur Srl")
                .cuit("30700000007")
                .condicionIva(CondicionIva.RESPONSABLE_INSCRIPTO)
                .tipoSociedad(TipoPersonaJuridica.SRL)
                .domicilioFiscal("Calle Fiscal 1")
                .fechaInicioActividades(LocalDate.of(2020, 1, 1))
                .build();
        PersonaFisica pf = PersonaFisica.builder()
                .nombre("Ana")
                .apellido("Perez")
                .dni("30111222")
                .telefono("+5492964111222")
                .fechaNacimiento(LocalDate.of(1985, 5, 5))
                .build();
        return Dueno.builder().id(7).personaJuridica(pj).personaFisica(pf).build();
    }

    private static DatosLegalesComercioRequestDTO legalesIguales() {
        DatosLegalesComercioRequestDTO legales = new DatosLegalesComercioRequestDTO();
        legales.setRazonSocial("cafe sur srl");
        legales.setCuit("30-70000000-7");
        legales.setCondicionIva(CondicionIva.RESPONSABLE_INSCRIPTO);
        legales.setTipoSociedad(TipoPersonaJuridica.SRL);
        legales.setDomicilioFiscal("Calle Fiscal 1");
        legales.setFechaInicioActividades(LocalDate.of(2020, 1, 1));
        legales.setNombreRepresentante("ana");
        legales.setApellidoRepresentante("perez");
        legales.setDniRepresentante("30.111.222");
        legales.setTelefonoRepresentante("+5492964111222");
        legales.setFechaNacimientoRepresentante(LocalDate.of(1985, 5, 5));
        return legales;
    }

    @Test
    void datosLegalesIgualesNoSonUnCambioNiSeGuardan() {
        assertTrue(service.actualizarDatosLegales(dueno(), legalesIguales()).isEmpty());
        verify(personaJuridicaRepository, never()).saveAndFlush(any());
        verify(personaFisicaRepository, never()).saveAndFlush(any());
    }

    @Test
    void cambiarCuitYDniGuardaLosValoresEnTextoPlanoYConsultaSiYaSonDeOtraCuenta() {
        DatosLegalesComercioRequestDTO legales = legalesIguales();
        legales.setCuit("20-12345678-6");
        legales.setDniRepresentante("31222333");
        legales.setNombreRepresentante("maria");

        List<CambioComercio> cambios = service.actualizarDatosLegales(dueno(), legales);

        assertEquals(List.of(
                new CambioComercio(CampoCambioComercio.CUIT, "30700000007", "20123456786"),
                new CambioComercio(CampoCambioComercio.REPRESENTANTE_NOMBRE, "Ana", "Maria"),
                new CambioComercio(CampoCambioComercio.REPRESENTANTE_DNI, "30111222", "31222333")), cambios);
        verify(personaJuridicaRepository).existsByCuit("20123456786");
        verify(personaFisicaRepository).existsByDni("31222333");
        verify(personaJuridicaRepository).saveAndFlush(any());
        verify(personaFisicaRepository).saveAndFlush(any());
    }

    @Test
    void unCuitQueYaEsDeOtraCuentaDa409SinGuardarNada() {
        when(personaJuridicaRepository.existsByCuit("20123456786")).thenReturn(true);
        DatosLegalesComercioRequestDTO legales = legalesIguales();
        legales.setCuit("20123456786");

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.actualizarDatosLegales(dueno(), legales));

        assertEquals("Ya existe una cuenta registrada con ese CUIT", error.getMessage());
        verify(personaJuridicaRepository, never()).saveAndFlush(any());
    }

    @Test
    void unDniQueYaEsDeOtraCuentaDa409() {
        when(personaFisicaRepository.existsByDni("31222333")).thenReturn(true);
        DatosLegalesComercioRequestDTO legales = legalesIguales();
        legales.setDniRepresentante("31222333");

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.actualizarDatosLegales(dueno(), legales));

        assertEquals("Ya existe una cuenta registrada con ese DNI", error.getMessage());
    }

    @Test
    void laCarreraDeUnCuitDuplicadoSeTraduceAlMismoConflicto() {
        when(personaJuridicaRepository.saveAndFlush(any())).thenThrow(
                new DataIntegrityViolationException("x", new RuntimeException("Duplicate entry for key 'uq_persona_juridica_cuit'")));
        DatosLegalesComercioRequestDTO legales = legalesIguales();
        legales.setCuit("20123456786");

        ConflictoDeNegocioException error = assertThrows(ConflictoDeNegocioException.class,
                () -> service.actualizarDatosLegales(dueno(), legales));

        assertEquals("Ya existe una cuenta registrada con ese CUIT", error.getMessage());
    }

    @Test
    void elCuitSinCambiosNoConsultaSiYaExiste() {
        service.actualizarDatosLegales(dueno(), legalesIguales());

        verify(personaJuridicaRepository, never()).existsByCuit(eq("30700000007"));
    }
}

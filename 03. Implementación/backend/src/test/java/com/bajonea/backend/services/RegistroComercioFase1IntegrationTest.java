package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Registro de Comercio, Fase 1 (2026-10-18), contra {@code bajonea_test}: los datos legales opcionales y el email
 * del comercio pueden faltar y la base lo acepta (migración {@code V36}), Tolhuin existe con su id oficial, y solo se
 * puede registrar una dirección en Río Grande, Ushuaia o Tolhuin. Todo dentro de una transacción que se revierte.
 */
@SpringBootTest
@ActiveProfiles("test")
class RegistroComercioFase1IntegrationTest {

    private static final String RIO_GRANDE = "94008010";
    private static final String TOLHUIN = "94011010";
    private static final String LAGUNA_ESCONDIDA = "94015010";
    private static final String PUERTO_ARGENTINO = "94021010";
    private static final String CIUDAD_DE_BUENOS_AIRES = "02014010";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    @Test
    void unComercioSeRegistraSinLosCuatroDatosLegalesOpcionalesNiEmailDeContacto() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            int usuarioId = registroService.registrarComercio(comercioJson(RIO_GRANDE, false)).getId();

            Map<String, Object> pj = jdbcTemplate.queryForMap(
                    "SELECT razon_social, condicion_iva, tipo_sociedad, fecha_inicio_actividades, cuit, domicilio_fiscal FROM persona_juridica WHERE id = ?",
                    usuarioId);
            assertNull(pj.get("razon_social"));
            assertNull(pj.get("condicion_iva"));
            assertNull(pj.get("tipo_sociedad"));
            assertNull(pj.get("fecha_inicio_actividades"));
            assertNotNull(pj.get("cuit"));
            assertEquals("Av. San Martin 100", pj.get("domicilio_fiscal"));
            assertNull(jdbcTemplate.queryForObject("SELECT email FROM comercio WHERE dueno_id = ?", String.class, usuarioId));
            status.setRollbackOnly();
        });
    }

    @Test
    void unComercioConDatosLegalesCompletosSigueGuardandoTodo() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            int usuarioId = registroService.registrarComercio(comercioJson(RIO_GRANDE, true)).getId();

            Map<String, Object> pj = jdbcTemplate.queryForMap(
                    "SELECT razon_social, condicion_iva, tipo_sociedad, fecha_inicio_actividades FROM persona_juridica WHERE id = ?", usuarioId);
            assertEquals("Comercio Fase Uno Srl", pj.get("razon_social"));
            assertEquals("RESPONSABLE_INSCRIPTO", pj.get("condicion_iva"));
            assertEquals("SRL", pj.get("tipo_sociedad"));
            assertNotNull(pj.get("fecha_inicio_actividades"));
            status.setRollbackOnly();
        });
    }

    @Test
    void tolhuinExisteConElIdOficialDeLaLocalidad() {
        assertEquals("Tolhuin", jdbcTemplate.queryForObject("SELECT nombre FROM localidad WHERE id = ?", String.class, TOLHUIN));
        assertEquals("94", jdbcTemplate.queryForObject("SELECT provincia_id FROM localidad WHERE id = ?", String.class, TOLHUIN));
    }

    @Test
    void sePuedeRegistrarUnComercioEnLasTresLocalidadesHabilitadas() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            for (String localidad : new String[] {RIO_GRANDE, "94015020", TOLHUIN}) {
                int usuarioId = registroService.registrarComercio(comercioJson(localidad, false)).getId();
                assertEquals(localidad, jdbcTemplate.queryForObject(
                        "SELECT d.localidad_id FROM direccion d JOIN comercio c ON c.id = d.comercio_id WHERE c.dueno_id = ?", String.class, usuarioId));
            }
            status.setRollbackOnly();
        });
    }

    @Test
    void unComercioEnUnaLocalidadFueraDeLaListaSeRechazaSinCrearNada() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            for (String localidad : new String[] {LAGUNA_ESCONDIDA, PUERTO_ARGENTINO, CIUDAD_DE_BUENOS_AIRES}) {
                RegistroComercioRequestDTO request = comercioJson(localidad, false);
                ValidacionCamposException ex = assertThrows(ValidacionCamposException.class, () -> registroService.registrarComercio(request));
                assertEquals(Map.of("direccion.localidadId", "Esa localidad todavía no está disponible"), ex.getErrores());
                assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario WHERE email = ?", Integer.class, request.getEmail()));
            }
            status.setRollbackOnly();
        });
    }

    @Test
    void unClienteSoloSePuedeRegistrarEnLasLocalidadesHabilitadas() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            int usuarioId = registroService.registrarCliente(clienteJson(TOLHUIN)).getId();
            assertEquals(TOLHUIN, jdbcTemplate.queryForObject(
                    "SELECT localidad_id FROM direccion WHERE cliente_id = ?", String.class, usuarioId));

            for (String localidad : new String[] {LAGUNA_ESCONDIDA, CIUDAD_DE_BUENOS_AIRES}) {
                ValidacionCamposException ex = assertThrows(ValidacionCamposException.class,
                        () -> registroService.registrarCliente(clienteJson(localidad)));
                assertEquals(Map.of("direccion.localidadId", "Esa localidad todavía no está disponible"), ex.getErrores());
            }
            status.setRollbackOnly();
        });
    }

    private RegistroComercioRequestDTO comercioJson(String localidadId, boolean conDatosLegalesOpcionales) {
        String sufijo = sufijo();
        String opcionales = conDatosLegalesOpcionales
                ? "\"razonSocial\":\"comercio fase uno srl\",\"condicionIva\":\"RESPONSABLE_INSCRIPTO\",\"tipoSociedad\":\"SRL\","
                        + "\"fechaInicioActividades\":\"2020-01-01\","
                : "";
        String json = """
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "aceptaTerminos":true,%s
                 "cuit":"%s","domicilioFiscal":"Av. San Martin 100",
                 "nombre":"Comercio Fase Uno %s","descripcion":"Prueba del registro de la Fase 1",
                 "telefono":"+5492964123456","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/fase.uno.%s"}],
                 "nombreRepresentante":"Representante","apellidoRepresentante":"Prueba","dniRepresentante":"%s",
                 "telefonoRepresentante":"+5492964123457","fechaNacimientoRepresentante":"1985-03-15"}
                """.formatted(opcionales, cuitAleatorio(), sufijo, "fu" + sufijo, "fase.uno." + sufijo + "@bajonea.test",
                localidadId, sufijo, dniAleatorio());
        return leer(json, RegistroComercioRequestDTO.class);
    }

    private RegistroClienteRequestDTO clienteJson(String localidadId) {
        String sufijo = sufijo();
        String json = """
                {"nombre":"Cliente","apellido":"Fase Uno","dni":"%s","fechaNacimiento":"1995-05-20",
                 "telefono":"+5492964123456","nombreUsuario":"%s","email":"%s","password":"Testing123","aceptaTerminos":true,
                 "fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "direccion":{"calle":"Calle Siempre Viva","numero":"123","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true}}
                """.formatted(dniAleatorio(), "cf" + sufijo, "cliente.fase.uno." + sufijo + "@bajonea.test", localidadId);
        return leer(json, RegistroClienteRequestDTO.class);
    }

    private <T> T leer(String json, Class<T> tipo) {
        try {
            return objectMapper.readValue(json, tipo);
        } catch (Exception e) {
            throw new IllegalStateException("JSON de prueba inválido para " + tipo.getSimpleName(), e);
        }
    }

    private static String sufijo() {
        return String.valueOf(ThreadLocalRandom.current().nextLong(1_000_000_000L, 9_999_999_999L));
    }

    private static String dniAleatorio() {
        return String.valueOf(ThreadLocalRandom.current().nextInt(30_000_000, 99_999_999));
    }

    private static String cuitAleatorio() {
        return "20" + ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L);
    }
}

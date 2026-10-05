package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.CierreComercioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.ActorCierre;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.ComercioRepository.EstadoYCierreComercio;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.LocalDateTime;
import java.util.List;
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
 * Cierre manual contra {@code bajonea_test} (bloque "Cierre manual", tramo C1): el mapeo de la columna
 * {@code cerrado_manualmente}, el {@code CHECK} del actor del historial, la lectura nativa con bloqueo
 * compartido y la protección de {@code @DynamicUpdate} corren en el motor real. Todo dentro de una transacción
 * que se revierte. La concurrencia real entre transacciones se ejercita en {@code stress-locks-tramoC1.mjs}.
 */
@SpringBootTest
@ActiveProfiles("test")
class CierreComercioIntegrationTest {

    private static final String LOCALIDAD_RIO_GRANDE = "94008010";

    @Autowired
    private RegistroService registroService;

    @Autowired
    private CierreComercioService cierreComercioService;

    @Autowired
    private ComercioRepository comercioRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EntityManager entityManager;

    @MockitoBean
    private EmailService emailService;

    private record Dueno(int id, int comercioId) {
    }

    @Test
    void cerrarYAbrirEscribenBanderaYHistorialCoherentesYLaLecturaCompartidaLosVe() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoOperativoAbiertoTodoElDia("APTO_VENTA");

            CierreComercioResponseDTO cerrado = cierreComercioService.cerrar(dueno.comercioId(), dueno.id(), ActorCierre.DUENO);
            entityManager.flush();

            assertTrue(cerrado.isCerradoManualmente());
            assertEquals(1, bandera(dueno.comercioId()));
            EstadoYCierreComercio lectura = comercioRepository.leerEstadoConBloqueoCompartido(dueno.comercioId()).orElseThrow();
            assertEquals("APTO_VENTA", lectura.getEstado());
            assertTrue(lectura.getCerradoManualmente());
            assertEquals(1, filas(dueno.comercioId(), "CERRADO", "DUENO"));

            CierreComercioResponseDTO repetido = cierreComercioService.cerrar(dueno.comercioId(), dueno.id(), ActorCierre.DUENO);
            assertTrue(repetido.isCerradoManualmente());
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ?",
                    Integer.class, dueno.comercioId()));

            CierreComercioResponseDTO abierto = cierreComercioService.abrir(dueno.comercioId(), dueno.id(), ActorCierre.DUENO);
            entityManager.flush();

            assertFalse(abierto.isCerradoManualmente());
            assertEquals(0, bandera(dueno.comercioId()));
            assertFalse(comercioRepository.leerEstadoConBloqueoCompartido(dueno.comercioId()).orElseThrow().getCerradoManualmente());
            assertEquals(1, filas(dueno.comercioId(), "REABIERTO", "DUENO"));

            status.setRollbackOnly();
        });
    }

    @Test
    void elCheckDelHistorialExigeUsuarioParaPersonasYNuloParaElSistema() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoOperativoAbiertoTodoElDia("APTO_VENTA");
            String insertar = "INSERT INTO historial_cierre_comercio (comercio_id, accion, actor_usuario_id, actor_rol, fecha_hora) "
                    + "VALUES (?, 'CERRADO', ?, ?, NOW())";

            jdbcTemplate.update(insertar, dueno.comercioId(), null, "SISTEMA");
            jdbcTemplate.update(insertar, dueno.comercioId(), dueno.id(), "DUENO");
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                    () -> jdbcTemplate.update(insertar, dueno.comercioId(), dueno.id(), "SISTEMA"));
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                    () -> jdbcTemplate.update(insertar, dueno.comercioId(), null, "DUENO"));

            status.setRollbackOnly();
        });
    }

    @Test
    void unSaveConUnaEntidadCargadaAntesDelCierreNoPisaLaBandera() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoOperativoAbiertoTodoElDia("APROBADO");
            Comercio vieja = comercioRepository.findById(dueno.comercioId()).orElseThrow();
            assertFalse(vieja.isCerradoManualmente());

            jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", dueno.comercioId());
            vieja.setFechaModificacion(LocalDateTime.now().withNano(0));
            comercioRepository.save(vieja);
            entityManager.flush();

            assertEquals(1, bandera(dueno.comercioId()));

            status.setRollbackOnly();
        });
    }

    @Test
    void cerrarYAbrirTomanLoUltimoConfirmadoAunqueLaEntidadYaEstuvieraCargada() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoOperativoAbiertoTodoElDia("APTO_VENTA");
            comercioRepository.findById(dueno.comercioId()).orElseThrow();
            jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", dueno.comercioId());
            jdbcTemplate.update("INSERT INTO historial_cierre_comercio (comercio_id, accion, actor_usuario_id, actor_rol, fecha_hora) "
                    + "VALUES (?, 'CERRADO', ?, 'DUENO', NOW())", dueno.comercioId(), dueno.id());

            CierreComercioResponseDTO respuesta = cierreComercioService.cerrar(dueno.comercioId(), dueno.id(), ActorCierre.DUENO);

            assertTrue(respuesta.isCerradoManualmente());
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ?",
                    Integer.class, dueno.comercioId()));

            status.setRollbackOnly();
        });
    }

    @Test
    void unComercioNoOperativoOFueraDeHorarioDa409SinTocarLaBase() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno pendiente = duenoOperativoAbiertoTodoElDia("PENDIENTE");
            assertThrows(ConflictoDeNegocioException.class,
                    () -> cierreComercioService.cerrar(pendiente.comercioId(), pendiente.id(), ActorCierre.DUENO));

            Dueno sinHorario = duenoOperativoAbiertoTodoElDia("APTO_VENTA");
            jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", sinHorario.comercioId());
            ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                    () -> cierreComercioService.cerrar(sinHorario.comercioId(), sinHorario.id(), ActorCierre.DUENO));
            assertEquals("Solo podés abrir o cerrar dentro de tu horario", ex.getMessage());
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id IN (?, ?)",
                    Integer.class, pendiente.comercioId(), sinHorario.comercioId()));

            status.setRollbackOnly();
        });
    }

    @Test
    void elJobReabreUnComercioCerradoCuandoEmpiezaLaProximaFranjaConLaHoraQueSeLePasa() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            Dueno dueno = duenoOperativoAbiertoTodoElDia("APTO_VENTA");
            cierreComercioService.cerrar(dueno.comercioId(), dueno.id(), ActorCierre.DUENO);
            entityManager.flush();

            LocalDateTime dentroDeLaMismaFranja = LocalDateTime.now().plusSeconds(30);
            assertFalse(cierreComercioService.reabrirSiVencido(dueno.comercioId(), dentroDeLaMismaFranja));
            assertEquals(1, bandera(dueno.comercioId()));

            LocalDateTime pasadoManana = LocalDateTime.now().plusDays(2);
            assertTrue(cierreComercioService.reabrirSiVencido(dueno.comercioId(), pasadoManana));
            entityManager.flush();

            assertEquals(0, bandera(dueno.comercioId()));
            assertEquals(1, filas(dueno.comercioId(), "REABIERTO", "SISTEMA"));
            assertNull(jdbcTemplate.queryForObject(
                    "SELECT actor_usuario_id FROM historial_cierre_comercio WHERE comercio_id = ? AND accion = 'REABIERTO'",
                    Integer.class, dueno.comercioId()));
            assertTrue(comercioRepository.findIdsCerradosManualmente().stream().noneMatch(id -> id == dueno.comercioId()));

            status.setRollbackOnly();
        });
    }

    private int bandera(int comercioId) {
        return jdbcTemplate.queryForObject("SELECT cerrado_manualmente FROM comercio WHERE id = ?", Integer.class, comercioId);
    }

    private int filas(int comercioId, String accion, String rol) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ? AND accion = ? AND actor_rol = ?",
                Integer.class, comercioId, accion, rol);
    }

    private Dueno duenoOperativoAbiertoTodoElDia(String estado) {
        int usuarioId = registroService.registrarComercio(comercioJson()).getId();
        int comercioId = jdbcTemplate.queryForObject("SELECT id FROM comercio WHERE dueno_id = ?", Integer.class, usuarioId);
        entityManager.flush();
        jdbcTemplate.update("UPDATE comercio SET estado = ? WHERE id = ?", estado, comercioId);
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", comercioId);
        for (String dia : List.of("LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO")) {
            jdbcTemplate.update("INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, '00:00:00', '23:59:00')",
                    comercioId, dia);
        }
        entityManager.clear();
        return new Dueno(usuarioId, comercioId);
    }

    private RegistroComercioRequestDTO comercioJson() {
        String json = """
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "razonSocial":"Cierre SRL","cuit":"%s","condicionIva":"RESPONSABLE_INSCRIPTO","tipoSociedad":"SRL",
                 "domicilioFiscal":"Av. San Martin 100","fechaInicioActividades":"2020-01-01",
                 "nombre":"Comercio Cierre %s","descripcion":"Prueba de cierre manual",
                 "telefono":"+5492964123456","emailContacto":"%s","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"Testing123",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/cierre.%s"}],
                 "nombreRepresentante":"Representante","apellidoRepresentante":"Prueba","dniRepresentante":"%s",
                 "telefonoRepresentante":"+5492964123457","fechaNacimientoRepresentante":"1985-03-15"}
                """.formatted(cuitAleatorio(), sufijo(), "cierre." + sufijo() + "@bajonea.test", "cci" + sufijo(),
                "cierre." + sufijo() + "@bajonea.test", LOCALIDAD_RIO_GRANDE, sufijo(), dniAleatorio());
        try {
            return objectMapper.readValue(json, RegistroComercioRequestDTO.class);
        } catch (Exception e) {
            throw new IllegalStateException("JSON de prueba inválido", e);
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

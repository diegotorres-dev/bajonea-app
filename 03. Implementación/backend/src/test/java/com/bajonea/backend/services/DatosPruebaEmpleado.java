package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Alta de datos reales en {@code bajonea_test} para las pruebas de invitaciones de empleado: Dueños con un
 * comercio, Clientes y filas de empleado. Los usuarios se crean por los servicios de registro; las filas de
 * empleado y los cambios de estado por JDBC (quien lo use tiene que sincronizar el contexto de persistencia
 * si ya cargó esas entidades).
 */
class DatosPruebaEmpleado {

    private static final String LOCALIDAD_RIO_GRANDE = "94008010";

    record Dueno(int id, String email, int comercioId, String nombreComercio) {
    }

    private final RegistroService registroService;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    DatosPruebaEmpleado(RegistroService registroService, ObjectMapper objectMapper, JdbcTemplate jdbcTemplate) {
        this.registroService = registroService;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    Dueno registrarDuenoAprobado() {
        String sufijo = sufijo();
        String email = "dueno." + sufijo + "@bajonea.test";
        String nombreComercio = "Comercio Equipo " + sufijo;
        UsuarioResponseDTO usuario = registroService.registrarComercio(comercioJson(sufijo, email, nombreComercio));
        int comercioId = jdbcTemplate.queryForObject("SELECT id FROM comercio WHERE dueno_id = ?", Integer.class, usuario.getId());
        jdbcTemplate.update("UPDATE comercio SET estado = 'APROBADO' WHERE id = ?", comercioId);
        return new Dueno(usuario.getId(), email, comercioId, nombreComercio);
    }

    int registrarCliente() {
        int id = registroService.registrarCliente(clienteJson(sufijo())).getId();
        cambiarEstadoUsuario(id, "ACTIVO");
        return id;
    }

    String emailDe(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT email FROM usuario WHERE id = ?", String.class, usuarioId);
    }

    void cambiarEstadoUsuario(int usuarioId, String estado) {
        jdbcTemplate.update("UPDATE usuario SET estado = ? WHERE id = ?", estado, usuarioId);
    }

    void cambiarEstadoComercio(int comercioId, String estado) {
        jdbcTemplate.update("UPDATE comercio SET estado = ? WHERE id = ?", estado, comercioId);
    }

    void hacerAdministrador(int usuarioId) {
        jdbcTemplate.update("INSERT INTO administrador (id) VALUES (?)", usuarioId);
    }

    void hacerEmpleado(int usuarioId) {
        Integer existe = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM empleado WHERE id = ?", Integer.class, usuarioId);
        if (existe == null || existe == 0) {
            jdbcTemplate.update("INSERT INTO empleado (id) VALUES (?)", usuarioId);
        }
    }

    int vincularEmpleado(int usuarioId, int comercioId, String estado, LocalDateTime fechaAlta) {
        hacerEmpleado(usuarioId);
        jdbcTemplate.update("INSERT INTO empleado_comercio (empleado_id, comercio_id, estado, fecha_alta, fecha_baja) VALUES (?, ?, ?, ?, ?)",
                usuarioId, comercioId, estado, fechaAlta, "INACTIVO".equals(estado) ? fechaAlta.plusDays(1) : null);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private RegistroClienteRequestDTO clienteJson(String sufijo) {
        return leer("""
                {"nombre":"Equipo","apellido":"Prueba","dni":"%s","fechaNacimiento":"1995-05-20",
                 "telefono":"+5492964123456","nombreUsuario":"%s","email":"%s","password":"%s",
                 "aceptaTerminos":true,
                 "fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "direccion":{"calle":"Calle Siempre Viva","numero":"123","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true}}
                """.formatted(dniAleatorio(), "emp" + sufijo, "emp." + sufijo + "@bajonea.test", claveAleatoria(), LOCALIDAD_RIO_GRANDE),
                RegistroClienteRequestDTO.class);
    }

    private RegistroComercioRequestDTO comercioJson(String sufijo, String email, String nombreComercio) {
        return leer("""
                {"fotoPerfilUrl":"https://res.cloudinary.com/demo/image/upload/foto.png",
                 "razonSocial":"Equipo SRL","cuit":"%s","condicionIva":"RESPONSABLE_INSCRIPTO","tipoSociedad":"SRL",
                 "domicilioFiscal":"Av. San Martin 100","fechaInicioActividades":"2020-01-01",
                 "nombre":"%s","descripcion":"Prueba de invitaciones de empleado",
                 "telefono":"+5492964123456","emailContacto":"%s","tipoComercio":"RESTAURANTE",
                 "aceptaDelivery":true,"aceptaRetiro":false,"nombreUsuario":"%s","email":"%s","password":"%s",
                 "direccion":{"calle":"Av. San Martin","numero":"100","pisoDepto":null,"codigoPostal":"9420",
                              "localidadId":"%s","principal":true},
                 "horarios":[{"diaSemana":"LUNES","horaApertura":"09:00","horaCierre":"18:00"}],
                 "redesSociales":[{"tipo":"INSTAGRAM","url":"https://instagram.com/equipo.%s"}],
                 "nombreRepresentante":"Representante","apellidoRepresentante":"Prueba","dniRepresentante":"%s",
                 "telefonoRepresentante":"+5492964123457","fechaNacimientoRepresentante":"1985-03-15"}
                """.formatted(cuitAleatorio(), nombreComercio, email, "dnu" + sufijo, email, claveAleatoria(), LOCALIDAD_RIO_GRANDE, sufijo,
                dniAleatorio()), RegistroComercioRequestDTO.class);
    }

    private <T> T leer(String json, Class<T> tipo) {
        try {
            return objectMapper.readValue(json, tipo);
        } catch (Exception e) {
            throw new IllegalStateException("JSON de prueba inválido para " + tipo.getSimpleName(), e);
        }
    }

    static String sufijo() {
        return String.valueOf(ThreadLocalRandom.current().nextLong(1_000_000_000L, 9_999_999_999L));
    }

    private static String claveAleatoria() {
        return "Pw" + ThreadLocalRandom.current().nextLong(1_000_000_000L, 9_999_999_999L);
    }

    private static String dniAleatorio() {
        return String.valueOf(ThreadLocalRandom.current().nextInt(30_000_000, 99_999_999));
    }

    private static String cuitAleatorio() {
        return "20" + ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L);
    }
}

package com.bajonea.backend.services;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.AccesoConsultaSoporteRequestDTO;
import com.bajonea.backend.dto.request.CrearConsultaSoporteRequestDTO;
import com.bajonea.backend.dto.request.CrearConsultaSoporteSesionRequestDTO;
import com.bajonea.backend.dto.request.MensajeSoporteRequestDTO;
import com.bajonea.backend.dto.request.ReenviarCodigosSoporteRequestDTO;
import com.bajonea.backend.dto.request.ResponderConsultaSoportePublicaRequestDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.enums.TipoTicketSoporte;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Base de las pruebas del módulo de Soporte (Fase 5, tramo S4): los servicios, datos únicos por prueba (email e IP, porque
 * los límites se cuentan por ambos y la base de pruebas conserva todo lo que se confirma) y atajos para armar consultas.
 * El envío de emails está simulado.
 */
abstract class SoporteIntegrationBase extends CarritoIntegrationBase {

    protected static final String TEXTO_INICIAL = "No puedo entrar a mi cuenta desde ayer";

    private static final AtomicInteger SECUENCIA_IP = new AtomicInteger((int) (System.nanoTime() % 50_000));

    @Autowired
    protected SoporteService soporte;

    @Autowired
    protected SoporteAdminService soporteAdmin;

    @BeforeEach
    void prepararEmailsDeSoporte() {
        when(emailService.enviarSoporteConsultaRecibida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarSoporteCodigos(anyString(), anyList())).thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    protected static String emailNuevo() {
        return "soporte" + DatosUnicos.siguienteSufijo() + "@bajonea.test";
    }

    protected static String ipNueva() {
        int n = SECUENCIA_IP.incrementAndGet();
        return "10." + (n / 65_536 % 256) + "." + (n / 256 % 256) + "." + (n % 256);
    }

    protected CrearConsultaSoporteRequestDTO pedido(String email, TipoTicketSoporte tipo, String mensaje) {
        CrearConsultaSoporteRequestDTO request = new CrearConsultaSoporteRequestDTO();
        request.setEmail(email);
        request.setTipo(tipo);
        request.setMensaje(mensaje);
        return request;
    }

    protected ConsultaSoporteCreadaResponseDTO crear(String email, String ip) {
        return soporte.crearSinSesion(pedido(email, TipoTicketSoporte.NO_PUEDO_ENTRAR, TEXTO_INICIAL), ip);
    }

    protected CrearConsultaSoporteSesionRequestDTO pedidoConSesion(TipoTicketSoporte tipo, String mensaje) {
        CrearConsultaSoporteSesionRequestDTO request = new CrearConsultaSoporteSesionRequestDTO();
        request.setTipo(tipo);
        request.setMensaje(mensaje);
        return request;
    }

    protected AccesoConsultaSoporteRequestDTO acceso(String email, String codigo) {
        AccesoConsultaSoporteRequestDTO request = new AccesoConsultaSoporteRequestDTO();
        request.setEmail(email);
        request.setCodigo(codigo);
        return request;
    }

    protected ResponderConsultaSoportePublicaRequestDTO respuestaPublica(String email, String codigo, String texto) {
        ResponderConsultaSoportePublicaRequestDTO request = new ResponderConsultaSoportePublicaRequestDTO();
        request.setEmail(email);
        request.setCodigo(codigo);
        request.setTexto(texto);
        return request;
    }

    protected ReenviarCodigosSoporteRequestDTO reenvio(String email) {
        ReenviarCodigosSoporteRequestDTO request = new ReenviarCodigosSoporteRequestDTO();
        request.setEmail(email);
        return request;
    }

    protected MensajeSoporteRequestDTO texto(String texto) {
        return new MensajeSoporteRequestDTO(texto);
    }

    protected String estadoDeLaConsulta(int id) {
        return jdbcTemplate.queryForObject("SELECT estado FROM ticket_soporte WHERE id = ?", String.class, id);
    }

    protected int cantidadDeMensajes(int id) {
        return jdbcTemplate.queryForObject("SELECT cantidad_mensajes FROM ticket_soporte WHERE id = ?", Integer.class, id);
    }

    protected int filasDeMensajes(int id) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte_mensaje WHERE ticket_id = ?", Integer.class, id);
    }

    protected void envejecerConsultas(String email, int horas) {
        jdbcTemplate.update("UPDATE ticket_soporte SET creado_en = creado_en - INTERVAL ? HOUR WHERE email = ?", horas, email);
    }
}

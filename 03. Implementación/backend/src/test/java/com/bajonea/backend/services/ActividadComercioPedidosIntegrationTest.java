package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.bajonea.backend.dto.response.ActividadComercioItemResponseDTO;
import com.bajonea.backend.dto.response.ActividadComercioResponseDTO;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Bloque A2b de E3: qué transiciones de un pedido llegan a la actividad del comercio. Entran todas las que el
 * comercio vio, sea quien sea el actor; no entran el nacimiento del pedido en {@code PENDIENTE_PAGO}, su vencimiento
 * por falta de pago ({@code TIMEOUT_PAGO}) ni un estado que el enum Java no conoce (el literal viejo
 * {@code PENDIENTE} que {@code V6} dejó en la base). Un pedido de otro comercio nunca aparece.
 */
@SpringBootTest
@ActiveProfiles("test")
class ActividadComercioPedidosIntegrationTest {

    private static final LocalDateTime T0 = LocalDateTime.of(2026, 9, 1, 12, 0, 0);

    private record Caso(String estado, String rol, String motivoTimeout, String texto) {
        boolean entra() {
            return texto != null;
        }
    }

    private static final List<Caso> MATRIZ = List.of(
            new Caso("PENDIENTE_PAGO", "CLIENTE", null, null),
            new Caso("CANCELADO_POR_SISTEMA", "SISTEMA", "TIMEOUT_PAGO", null),
            new Caso("PENDIENTE", "CLIENTE", null, null),
            new Caso("PENDIENTE", "SISTEMA", null, null),
            new Caso("PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, "Pedido recibido"),
            new Caso("EN_PREPARACION", "DUENO", null, "Aceptó un pedido"),
            new Caso("EN_PREPARACION", "EMPLEADO", null, "Aceptó un pedido"),
            new Caso("RECHAZADO", "DUENO", null, "Rechazó un pedido"),
            new Caso("RECHAZADO", "EMPLEADO", null, "Rechazó un pedido"),
            new Caso("EN_CAMINO", "DUENO", null, "Despachó un pedido"),
            new Caso("LISTO_PARA_RETIRAR", "EMPLEADO", null, "Dejó un pedido listo para retirar"),
            new Caso("ENTREGADO", "DUENO", null, "Marcó un pedido como entregado"),
            new Caso("ENTREGADO", "EMPLEADO", null, "Marcó un pedido como entregado"),
            new Caso("NO_RETIRADO", "DUENO", null, "Cerró un pedido como no retirado"),
            new Caso("NO_RETIRADO", "EMPLEADO", null, "Cerró un pedido como no retirado"),
            new Caso("NO_RETIRADO", "SISTEMA", "TIMEOUT_RETIRO_SUSPENSION",
                    "Cerró automáticamente un pedido como no retirado (comercio suspendido)"),
            new Caso("ANULADO", "DUENO", null, "Anuló un pedido"),
            new Caso("ANULADO", "EMPLEADO", null, "Anuló un pedido"),
            new Caso("CANCELADO", "CLIENTE", null, "Canceló un pedido"),
            new Caso("ENTREGADO", "CLIENTE", null, "Confirmó la recepción de un pedido"),
            new Caso("EXPIRADO", "SISTEMA", "TIMEOUT_RESPUESTA_COMERCIO", "Venció un pedido sin respuesta del comercio"),
            new Caso("ENTREGADO", "SISTEMA", "TIMEOUT_ENTREGA", "Confirmó automáticamente la entrega de un pedido"),
            new Caso("ENTREGADO", "SISTEMA", "TIMEOUT_RETIRO_SUSPENSION",
                    "Cerró automáticamente un pedido listo para retirar (comercio suspendido)"),
            new Caso("CANCELADO_POR_SISTEMA", "SISTEMA", null, "Canceló un pedido por la suspensión del comercio"));

    @Autowired
    private ActividadComercioService actividadService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private Dueno dueno;
    private Dueno duenoAjeno;
    private int comprador;
    private int empleado;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        dueno = datos.registrarDuenoAprobado();
        duenoAjeno = datos.registrarDuenoAprobado();
        comprador = datos.registrarCliente();
        empleado = datos.registrarClienteConCredenciales().id();
    }

    private int pedido(Dueno comercio) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', 'EN_PREPARACION', 'PAGADO', 10000, 200, 100, 10200, ?)", comprador, comercio.comercioId(), T0);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private long historial(int pedidoId, Caso caso, LocalDateTime fecha) {
        Integer usuario = switch (caso.rol()) {
            case "DUENO" -> dueno.id();
            case "EMPLEADO" -> empleado;
            case "CLIENTE" -> comprador;
            default -> null;
        };
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, motivo_timeout, "
                + "fecha_hora) VALUES (?, ?, ?, ?, ?, ?)", pedidoId, caso.estado(), caso.rol(), usuario, caso.motivoTimeout(), fecha);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    @Test
    void entranLasTransicionesQueElComercioVioYNoElNacimientoNiSuVencimientoPorFaltaDePago() {
        int pedido = pedido(dueno);
        int ajeno = pedido(duenoAjeno);
        Map<String, String> textoPorId = new LinkedHashMap<>();
        List<String> noDebenEntrar = new ArrayList<>();
        for (int i = 0; i < MATRIZ.size(); i++) {
            Caso caso = MATRIZ.get(i);
            long id = historial(pedido, caso, T0.plusMinutes(i));
            historial(ajeno, caso, T0.plusMinutes(i));
            if (caso.entra()) {
                textoPorId.put("PEDIDO-" + id, caso.texto());
            } else {
                noDebenEntrar.add("PEDIDO-" + id);
            }
        }

        ActividadComercioResponseDTO pagina = actividadService.listar(dueno.comercioId(), 100, null);

        Map<String, String> reales = new LinkedHashMap<>();
        pagina.getItems().forEach(item -> reales.put(item.getId(), item.getAccionTexto()));
        assertEquals(textoPorId.keySet(), reales.keySet());
        textoPorId.forEach((id, texto) -> assertEquals(texto, reales.get(id), id));
        noDebenEntrar.forEach(id -> assertEquals(null, reales.get(id), id));
    }

    @Test
    void elSistemaNoTraeNombreNiUsuarioYElClienteTraeSuNombreCompleto() {
        int pedido = pedido(dueno);
        historial(pedido, new Caso("PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, "x"), T0);
        historial(pedido, new Caso("CANCELADO", "CLIENTE", null, "x"), T0.plusMinutes(1));

        List<ActividadComercioItemResponseDTO> items = actividadService.listar(dueno.comercioId(), 100, null).getItems();

        ActividadComercioItemResponseDTO cliente = items.get(0);
        Map<String, Object> persona = jdbcTemplate.queryForMap("SELECT nombre, apellido FROM persona_fisica WHERE id = ?", comprador);
        assertEquals(persona.get("nombre") + " " + persona.get("apellido"), cliente.getActorNombre());
        assertEquals(comprador, cliente.getActorUsuarioId());
        assertEquals("Cliente", cliente.getActorRolTexto());

        ActividadComercioItemResponseDTO sistema = items.get(1);
        assertNull(sistema.getActorNombre());
        assertNull(sistema.getActorUsuarioId());
        assertEquals("SISTEMA", sistema.getActorRol());
        assertEquals("Sistema", sistema.getActorRolTexto());
    }

    @Test
    void laListaBlancaDeEstadosEsElEnumJavaMenosPendientePago() {
        List<String> noCubiertos = Arrays.stream(EstadoPedido.values())
                .map(Enum::name)
                .filter(estado -> !estado.equals("PENDIENTE_PAGO"))
                .filter(estado -> MATRIZ.stream().noneMatch(caso -> caso.entra() && caso.estado().equals(estado)))
                .toList();

        assertEquals(List.of(), noCubiertos, "Hay un estado del enum que la matriz no cubre");
    }
}

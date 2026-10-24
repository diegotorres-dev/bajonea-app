package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.bajonea.backend.enums.EstadoEmailCierreTurno;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoTimeoutPedido;
import com.bajonea.backend.enums.TipoNotificacion;
import java.util.Arrays;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Los valores de los enums de Java que se guardan como texto tienen que estar en el ENUM de la columna que los
 * recibe, y la columna no puede tener valores que Java no conozca salvo los heredados que se dejan a propósito (el
 * literal viejo {@code PENDIENTE} de los dos estados del pedido, anterior al rename de V6). Si falta un valor la
 * escritura falla recién en tiempo de ejecución, con el motivo escondido en un error de datos truncados; esta prueba
 * lo detecta al compilar el esquema real aplicado por Flyway.
 */
@SpringBootTest
@ActiveProfiles("test")
class EnumsContraBaseDeDatosIntegrationTest {

    private static final Pattern VALOR = Pattern.compile("'((?:[^']|'')*)'");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Set<String> valoresDeLaColumna(String tabla, String columna) {
        String tipo = jdbcTemplate.queryForObject("SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", String.class, tabla, columna);
        Set<String> valores = new TreeSet<>();
        Matcher m = VALOR.matcher(tipo);
        while (m.find()) {
            valores.add(m.group(1));
        }
        return valores;
    }

    private static Set<String> nombres(Enum<?>[] valores) {
        Set<String> nombres = new TreeSet<>();
        Arrays.stream(valores).forEach(valor -> nombres.add(valor.name()));
        return nombres;
    }

    private void compararConLaColumna(String tabla, String columna, Enum<?>[] valoresJava, Set<String> heredadosDeLaBase) {
        Set<String> enBase = valoresDeLaColumna(tabla, columna);
        Set<String> esperados = nombres(valoresJava);
        esperados.addAll(heredadosDeLaBase);
        assertEquals(esperados, enBase, "El ENUM de " + tabla + "." + columna + " no coincide con el enum de Java");
    }

    @Test
    void elEstadoDelPedidoCoincideConElEnumDeJava() {
        compararConLaColumna("pedido", "estado", EstadoPedido.values(), Set.of("PENDIENTE"));
    }

    @Test
    void elEstadoDelHistorialDelPedidoCoincideConElEnumDeJava() {
        compararConLaColumna("historial_estado_pedido", "estado", EstadoPedido.values(), Set.of("PENDIENTE"));
    }

    @Test
    void elTipoDeNotificacionCoincideConElEnumDeJava() {
        compararConLaColumna("notificacion", "tipo", TipoNotificacion.values(), Set.of());
    }

    @Test
    void losTiposDeAvisoDeBajaYReactivacionDelEmpleadoEstanEnLaBase() {
        Set<String> enBase = valoresDeLaColumna("notificacion", "tipo");
        assertEquals(Set.of("EMPLEADO_DESACTIVADO", "EMPLEADO_REACTIVADO"),
                Set.of("EMPLEADO_DESACTIVADO", "EMPLEADO_REACTIVADO").stream().filter(enBase::contains).collect(java.util.stream.Collectors.toSet()),
                "V35 tiene que haber agregado EMPLEADO_REACTIVADO al ENUM de notificacion.tipo");
    }

    @Test
    void elEstadoDelEmailDelCierreDeTurnoCoincideConElEnumDeJava() {
        compararConLaColumna("cierre_turno", "email_estado", EstadoEmailCierreTurno.values(), Set.of());
    }

    @Test
    void elMotivoDeTimeoutDelHistorialCoincideConElEnumDeJava() {
        compararConLaColumna("historial_estado_pedido", "motivo_timeout", MotivoTimeoutPedido.values(), Set.of());
    }
}

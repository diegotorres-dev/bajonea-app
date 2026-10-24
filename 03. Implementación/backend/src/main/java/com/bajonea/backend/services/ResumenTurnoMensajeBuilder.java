package com.bajonea.backend.services;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * Arma el asunto y el cuerpo del email de cierre de turno. Es una función pura: no lee nada ni registra nada. Las
 * etiquetas son las del panel del comercio, la hora de un turno que cruza la medianoche dice "(día siguiente)"
 * (nunca "+1") y los montos usan el formato argentino, sin centavos cuando son cero. El "vendido" es el bruto, igual
 * que el panel; los pedidos sin responder quedan fuera de los montos.
 */
public final class ResumenTurnoMensajeBuilder {

    public record CierreParaMensaje(String nombreComercio, LocalDate turnoFecha, LocalTime horaApertura, LocalTime horaCierre,
            int cantidadPedidos, BigDecimal vendido, BigDecimal comision, BigDecimal neto, int pendientesAlCierre) {
    }

    public record Mensaje(String asunto, String cuerpo) {
    }

    private static final DateTimeFormatter FORMATO_HORA = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter FORMATO_DIA_MES = DateTimeFormatter.ofPattern("dd/MM");
    private static final String[] NOMBRES_DIA = {"lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"};
    private static final String CIERRE = "Podés ver el detalle en el panel de Bajoneá.\n\nEquipo de Bajoneá";

    private ResumenTurnoMensajeBuilder() {
    }

    public static Mensaje armar(String nombreDueno, List<CierreParaMensaje> cierres) {
        if (cierres.size() == 1) {
            return armarUno(nombreDueno, cierres.get(0));
        }
        return armarVarios(nombreDueno, cierres);
    }

    private static Mensaje armarUno(String nombreDueno, CierreParaMensaje cierre) {
        String asunto = "Cerró tu turno en " + cierre.nombreComercio() + ": "
                + (cierre.cantidadPedidos() == 0 ? "sin pedidos" : "neto " + monto(cierre.neto()));
        StringBuilder cuerpo = new StringBuilder();
        cuerpo.append("Hola ").append(nombreDueno).append(",\n\n");
        cuerpo.append("Cerró el turno de ").append(cierre.nombreComercio()).append(" del ").append(dia(cierre.turnoFecha()))
                .append(", ").append(rango(cierre)).append(".\n\n");
        if (cierre.cantidadPedidos() == 0) {
            cuerpo.append("No hubo pedidos en este turno.\n");
        } else {
            cuerpo.append(montos(cierre));
        }
        if (cierre.pendientesAlCierre() > 0) {
            cuerpo.append("\n").append(cierre.pendientesAlCierre() == 1
                    ? "Quedó 1 pedido sin responder al cerrar el turno. No está incluido en estos montos.\n"
                    : "Quedaron " + cierre.pendientesAlCierre()
                            + " pedidos sin responder al cerrar el turno. No están incluidos en estos montos.\n");
        }
        cuerpo.append("\n").append(CIERRE);
        return new Mensaje(asunto, cuerpo.toString());
    }

    private static Mensaje armarVarios(String nombreDueno, List<CierreParaMensaje> cierres) {
        StringBuilder cuerpo = new StringBuilder();
        cuerpo.append("Hola ").append(nombreDueno).append(",\n\n");
        cuerpo.append("Cerraron estos turnos:\n\n");
        for (CierreParaMensaje cierre : cierres) {
            cuerpo.append(cierre.nombreComercio()).append(" — ").append(dia(cierre.turnoFecha())).append(", ")
                    .append(rango(cierre)).append("\n");
            if (cierre.cantidadPedidos() == 0) {
                cuerpo.append("No hubo pedidos en este turno.\n");
            } else {
                cuerpo.append(montos(cierre));
            }
            if (cierre.pendientesAlCierre() > 0) {
                cuerpo.append("Pedidos sin responder al cierre: ").append(cierre.pendientesAlCierre())
                        .append(" (no incluidos en estos montos)\n");
            }
            cuerpo.append("\n");
        }
        cuerpo.append(CIERRE);
        return new Mensaje("Cerraron los turnos de tus comercios", cuerpo.toString());
    }

    private static String montos(CierreParaMensaje cierre) {
        return "Vendido en el turno: " + monto(cierre.vendido()) + "\n"
                + "Comisión de Bajoneá: " + monto(cierre.comision()) + "\n"
                + "Neto del turno: " + monto(cierre.neto()) + "\n"
                + "Pedidos del turno: " + cierre.cantidadPedidos() + "\n";
    }

    private static String dia(LocalDate fecha) {
        DayOfWeek dia = fecha.getDayOfWeek();
        return NOMBRES_DIA[dia.getValue() - 1] + " " + fecha.format(FORMATO_DIA_MES);
    }

    private static String rango(CierreParaMensaje cierre) {
        String rango = "de " + cierre.horaApertura().format(FORMATO_HORA) + " a " + cierre.horaCierre().format(FORMATO_HORA);
        return cierre.horaCierre().isBefore(cierre.horaApertura()) ? rango + " (día siguiente)" : rango;
    }

    static String monto(BigDecimal valor) {
        BigDecimal redondeado = valor.setScale(2, RoundingMode.HALF_UP);
        boolean sinCentavos = redondeado.stripTrailingZeros().scale() <= 0;
        DecimalFormatSymbols simbolos = DecimalFormatSymbols.getInstance(Locale.ROOT);
        simbolos.setGroupingSeparator('.');
        simbolos.setDecimalSeparator(',');
        DecimalFormat formato = new DecimalFormat(sinCentavos ? "#,##0" : "#,##0.00", simbolos);
        return "$" + formato.format(redondeado);
    }
}

package com.bajonea.backend.util;

import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.TipoRedSocial;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Pasa a texto legible los datos de un comercio que no son un simple valor (dirección, horarios, redes
 * sociales, modalidades de entrega): es lo que se guarda en {@code historial_cambio_comercio} y lo que
 * muestra la bandeja del Administrador. Una sola implementación para el valor anterior y el nuevo, así
 * que dos datos iguales dan siempre el mismo texto. Las horas se muestran en {@code HH:mm}.
 */
public final class ComercioTextoLegible {

    private static final Map<DiaSemana, String> ETIQUETAS_DIA = Map.of(
            DiaSemana.LUNES, "Lunes",
            DiaSemana.MARTES, "Martes",
            DiaSemana.MIERCOLES, "Miércoles",
            DiaSemana.JUEVES, "Jueves",
            DiaSemana.VIERNES, "Viernes",
            DiaSemana.SABADO, "Sábado",
            DiaSemana.DOMINGO, "Domingo");

    private static final DateTimeFormatter FORMATO_HORA = DateTimeFormatter.ofPattern("HH:mm");

    private ComercioTextoLegible() {
    }

    public static String etiquetaDia(DiaSemana dia) {
        return ETIQUETAS_DIA.get(dia);
    }

    /** Recorta una hora a minutos: {@code 23:59:00} y {@code 23:59} son la misma hora. */
    public static LocalTime aMinutos(LocalTime hora) {
        return hora.truncatedTo(ChronoUnit.MINUTES);
    }

    public static String modalidades(boolean aceptaDelivery, boolean aceptaRetiro) {
        if (aceptaDelivery && aceptaRetiro) {
            return "Delivery y retiro";
        }
        if (aceptaDelivery) {
            return "Solo delivery";
        }
        return aceptaRetiro ? "Solo retiro" : "Ninguna";
    }

    /**
     * {@code Calle 123, Piso/Depto, Localidad, Provincia (CP)}; el piso/depto solo si lo hay.
     */
    public static String direccion(String calle, String numero, String pisoDepto, String localidad, String provincia,
            String codigoPostal) {
        StringBuilder texto = new StringBuilder(calle).append(' ').append(numero);
        if (pisoDepto != null && !pisoDepto.isBlank()) {
            texto.append(", ").append(pisoDepto);
        }
        texto.append(", ").append(localidad).append(", ").append(provincia).append(" (").append(codigoPostal).append(')');
        return texto.toString();
    }

    public static String direccion(Direccion direccion) {
        return direccion(direccion.getCalle(), direccion.getNumero(), direccion.getPisoDepto(),
                direccion.getLocalidad().getNombre(), direccion.getLocalidad().getProvincia().getNombre(),
                direccion.getCodigoPostal());
    }

    /**
     * Franjas ordenadas por día, apertura y cierre, separadas por {@code "; "}:
     * {@code Lunes 09:00-13:00; Lunes 17:00-21:00; Martes 09:00-13:00}.
     */
    public static String horarios(List<Horario> horarios) {
        return horarios.stream()
                .map(h -> new FranjaOrdenable(h.getDiaSemana(), aMinutos(h.getHoraApertura()), aMinutos(h.getHoraCierre())))
                .sorted(FranjaOrdenable.ORDEN)
                .map(FranjaOrdenable::texto)
                .collect(Collectors.joining("; "));
    }

    /** Redes sociales activas ordenadas por tipo: {@code FACEBOOK: https://...; INSTAGRAM: https://...}. */
    public static String redesSociales(List<RedSocial> redesActivas) {
        return redesActivas.stream()
                .sorted(Comparator.comparing(RedSocial::getTipo))
                .map(r -> r.getTipo() + ": " + r.getUrl())
                .collect(Collectors.joining("; "));
    }

    public static String redesSociales(Map<TipoRedSocial, String> urlPorTipo) {
        return urlPorTipo.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> e.getKey() + ": " + e.getValue())
                .collect(Collectors.joining("; "));
    }

    public record FranjaOrdenable(DiaSemana dia, LocalTime apertura, LocalTime cierre) {

        public static final Comparator<FranjaOrdenable> ORDEN = Comparator
                .comparing(FranjaOrdenable::dia)
                .thenComparing(FranjaOrdenable::apertura)
                .thenComparing(FranjaOrdenable::cierre);

        public String texto() {
            return etiquetaDia(dia) + " " + FORMATO_HORA.format(apertura) + "-" + FORMATO_HORA.format(cierre);
        }
    }
}

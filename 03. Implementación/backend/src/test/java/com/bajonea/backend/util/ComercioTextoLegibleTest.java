package com.bajonea.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.TipoRedSocial;
import java.time.LocalTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ComercioTextoLegibleTest {

    private static Horario horario(DiaSemana dia, String apertura, String cierre) {
        return Horario.builder().diaSemana(dia).horaApertura(LocalTime.parse(apertura)).horaCierre(LocalTime.parse(cierre)).build();
    }

    @Test
    void modalidadesTieneUnTextoPorCombinacion() {
        assertEquals("Delivery y retiro", ComercioTextoLegible.modalidades(true, true));
        assertEquals("Solo delivery", ComercioTextoLegible.modalidades(true, false));
        assertEquals("Solo retiro", ComercioTextoLegible.modalidades(false, true));
        assertEquals("Ninguna", ComercioTextoLegible.modalidades(false, false));
    }

    @Test
    void direccionOmiteElPisoSoloSiNoHay() {
        assertEquals("Belgrano 250, Río Grande, Tierra del Fuego (9420)",
                ComercioTextoLegible.direccion("Belgrano", "250", null, "Río Grande", "Tierra del Fuego", "9420"));
        assertEquals("Belgrano 250, 2B, Río Grande, Tierra del Fuego (9420)",
                ComercioTextoLegible.direccion("Belgrano", "250", "2B", "Río Grande", "Tierra del Fuego", "9420"));
        assertEquals("Belgrano 250, Río Grande, Tierra del Fuego (9420)",
                ComercioTextoLegible.direccion("Belgrano", "250", "  ", "Río Grande", "Tierra del Fuego", "9420"));
    }

    @Test
    void horariosSalenOrdenadosPorDiaYAperturaYEnMinutos() {
        List<Horario> franjas = List.of(
                horario(DiaSemana.MARTES, "09:00:00", "13:00:00"),
                horario(DiaSemana.LUNES, "17:00:00", "21:30:00"),
                horario(DiaSemana.LUNES, "09:00:00", "13:00:00"));

        assertEquals("Lunes 09:00-13:00; Lunes 17:00-21:30; Martes 09:00-13:00", ComercioTextoLegible.horarios(franjas));
    }

    @Test
    void horariosConLosMismosDatosEnOtroOrdenDanElMismoTexto() {
        List<Horario> uno = List.of(horario(DiaSemana.SABADO, "10:00", "14:00"), horario(DiaSemana.DOMINGO, "10:00", "14:00"));
        List<Horario> otro = List.of(horario(DiaSemana.DOMINGO, "10:00", "14:00"), horario(DiaSemana.SABADO, "10:00", "14:00"));

        assertEquals(ComercioTextoLegible.horarios(uno), ComercioTextoLegible.horarios(otro));
    }

    @Test
    void redesSocialesSalenOrdenadasPorTipo() {
        List<RedSocial> redes = List.of(
                RedSocial.builder().tipo(TipoRedSocial.FACEBOOK).url("https://facebook.com/x").build(),
                RedSocial.builder().tipo(TipoRedSocial.INSTAGRAM).url("https://instagram.com/x").build());

        assertEquals("INSTAGRAM: https://instagram.com/x; FACEBOOK: https://facebook.com/x", ComercioTextoLegible.redesSociales(redes));
    }

    @Test
    void redesSocialesDeLaListaYDelMapaDanElMismoTexto() {
        List<RedSocial> redes = List.of(
                RedSocial.builder().tipo(TipoRedSocial.WHATSAPP).url("https://wa.me/1").build(),
                RedSocial.builder().tipo(TipoRedSocial.INSTAGRAM).url("https://instagram.com/x").build());
        Map<TipoRedSocial, String> mapa = new EnumMap<>(TipoRedSocial.class);
        mapa.put(TipoRedSocial.INSTAGRAM, "https://instagram.com/x");
        mapa.put(TipoRedSocial.WHATSAPP, "https://wa.me/1");

        assertEquals(ComercioTextoLegible.redesSociales(redes), ComercioTextoLegible.redesSociales(mapa));
        assertEquals("INSTAGRAM: https://instagram.com/x; WHATSAPP: https://wa.me/1", ComercioTextoLegible.redesSociales(mapa));
    }
}

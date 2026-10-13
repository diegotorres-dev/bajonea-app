package com.bajonea.backend.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/** Zona horaria de la aplicación ({@code app.zona-horaria}): por defecto Ushuaia, configurable, y una zona inválida impide arrancar. */
class ClockConfigTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(ClockConfig.class);

    @Test
    void sinLaPropiedadLaZonaEsUshuaiaYAlcanzaUnOffsetDeMenosTres() {
        runner.run(contexto -> {
            Clock reloj = contexto.getBean(Clock.class);
            assertEquals(ZoneId.of("America/Argentina/Ushuaia"), reloj.getZone());
            assertEquals(-3 * 3600, reloj.getZone().getRules().getOffset(reloj.instant()).getTotalSeconds());
        });
    }

    @Test
    void laPropiedadCambiaLaZonaDelReloj() {
        runner.withPropertyValues("app.zona-horaria=UTC").run(contexto ->
                assertEquals(ZoneId.of("UTC"), contexto.getBean(Clock.class).getZone()));
        runner.withPropertyValues("app.zona-horaria= Asia/Tokyo ").run(contexto ->
                assertEquals(ZoneId.of("Asia/Tokyo"), contexto.getBean(Clock.class).getZone()));
    }

    @Test
    void unaZonaInvalidaHaceFallarElArranque() {
        for (String invalida : new String[] {"Narnia/Cair_Paravel", "", "   ", "-03:99"}) {
            runner.withPropertyValues("app.zona-horaria=" + invalida).run(contexto -> {
                assertNotNull(contexto.getStartupFailure(), "Zona '" + invalida + "'");
                assertTrue(rootMessage(contexto.getStartupFailure()).contains("app.zona-horaria"), "Zona '" + invalida + "'");
            });
        }
    }

    private static String rootMessage(Throwable error) {
        for (Throwable actual = error; actual != null; actual = actual.getCause()) {
            if (actual.getMessage() != null && actual.getMessage().contains("app.zona-horaria")) {
                return actual.getMessage();
            }
        }
        return String.valueOf(error.getMessage());
    }
}

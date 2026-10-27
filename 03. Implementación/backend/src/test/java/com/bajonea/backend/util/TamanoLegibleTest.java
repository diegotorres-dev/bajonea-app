package com.bajonea.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class TamanoLegibleTest {

    @Test
    void formateaConComaDecimalYSinDecimalesCuandoEsEntero() {
        assertEquals("8 MB", TamanoLegible.formatear(8L * 1024 * 1024));
        assertEquals("11,4 MB", TamanoLegible.formatear((long) (11.4 * 1024 * 1024)));
        assertEquals("8,1 MB", TamanoLegible.formatear(8L * 1024 * 1024 + 100_000));
        assertEquals("1 MB", TamanoLegible.formatear(1024L * 1024));
    }

    @Test
    void losTamanosChicosVanEnKilobytesConMinimoDeUno() {
        assertEquals("350 KB", TamanoLegible.formatear(350L * 1024));
        assertEquals("1 KB", TamanoLegible.formatear(10));
        assertEquals("1023 KB", TamanoLegible.formatear(1023L * 1024));
    }
}

package com.bajonea.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class TextoUtilsTest {

    @Test
    void normalizarParaCompararQuitaTildesMayusculasYEspaciosDeMas() {
        assertEquals("cafeteria nandu 5", TextoUtils.normalizarParaComparar("  CAFETERÍA   Ñandú  5 "));
    }

    @Test
    void normalizarParaCompararTrataNuloVacioYBlancosComoLoMismo() {
        assertEquals("", TextoUtils.normalizarParaComparar(null));
        assertEquals("", TextoUtils.normalizarParaComparar(""));
        assertEquals("", TextoUtils.normalizarParaComparar("   "));
    }

    @Test
    void normalizarParaCompararConservaNumerosYSimbolosQueNoSonMarcas() {
        assertEquals("av. san martin 100/2", TextoUtils.normalizarParaComparar("Av. San Martín 100/2"));
    }

    @Test
    void normalizarParaCompararEsIdempotente() {
        String una = TextoUtils.normalizarParaComparar("Panadería  Ñu");
        assertEquals(una, TextoUtils.normalizarParaComparar(una));
    }
}

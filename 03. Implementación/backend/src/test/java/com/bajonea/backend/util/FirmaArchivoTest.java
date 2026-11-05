package com.bajonea.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class FirmaArchivoTest {

    private static byte[] bytes(int... valores) {
        byte[] resultado = new byte[valores.length];
        for (int i = 0; i < valores.length; i++) {
            resultado[i] = (byte) valores[i];
        }
        return resultado;
    }

    @Test
    void reconocePdfJpegPngYWebpPorSusBytes() {
        assertEquals(Optional.of(FirmaArchivo.PDF), FirmaArchivo.detectar("%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII)));
        assertEquals(Optional.of(FirmaArchivo.JPEG), FirmaArchivo.detectar(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10)));
        assertEquals(Optional.of(FirmaArchivo.PNG), FirmaArchivo.detectar(bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0)));
        assertEquals(Optional.of(FirmaArchivo.WEBP),
                FirmaArchivo.detectar(bytes('R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' ')));
    }

    @Test
    void unEjecutableOUnScriptRenombradoNoPasa() {
        assertTrue(FirmaArchivo.detectar(bytes('M', 'Z', 0x90, 0, 3, 0, 0, 0)).isEmpty());
        assertTrue(FirmaArchivo.detectar("<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8)).isEmpty());
        assertTrue(FirmaArchivo.detectar("#!/bin/sh\nrm -rf /".getBytes(StandardCharsets.UTF_8)).isEmpty());
        assertTrue(FirmaArchivo.detectar("<svg xmlns='http://www.w3.org/2000/svg'/>".getBytes(StandardCharsets.UTF_8)).isEmpty());
    }

    @Test
    void unRiffQueNoEsWebpNoPasa() {
        assertTrue(FirmaArchivo.detectar(bytes('R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'A', 'V', 'E', 0, 0)).isEmpty());
        assertTrue(FirmaArchivo.detectar(bytes('R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'E', 'B')).isEmpty());
    }

    @Test
    void lasFirmasIncompletasOVaciasNoPasan() {
        assertTrue(FirmaArchivo.detectar(null).isEmpty());
        assertTrue(FirmaArchivo.detectar(new byte[0]).isEmpty());
        assertTrue(FirmaArchivo.detectar("%PDF".getBytes(StandardCharsets.US_ASCII)).isEmpty());
        assertTrue(FirmaArchivo.detectar(bytes(0xFF, 0xD8)).isEmpty());
        assertTrue(FirmaArchivo.detectar(bytes(0x89, 'P', 'N', 'G')).isEmpty());
    }

    @Test
    void laFirmaTieneQueEstarAlPrincipioDelArchivo() {
        assertTrue(FirmaArchivo.detectar(" %PDF-1.4".getBytes(StandardCharsets.US_ASCII)).isEmpty());
        assertTrue(FirmaArchivo.detectar(bytes(0, 0xFF, 0xD8, 0xFF)).isEmpty());
    }

    @Test
    void detectarImagenAceptaLasTresImagenesYRechazaElPdf() {
        assertTrue(FirmaArchivo.detectarImagen(bytes(0xFF, 0xD8, 0xFF, 0xE0)).isPresent());
        assertTrue(FirmaArchivo.detectarImagen(bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)).isPresent());
        assertTrue(FirmaArchivo.detectarImagen(bytes('R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'E', 'B', 'P')).isPresent());
        assertTrue(FirmaArchivo.detectarImagen("%PDF-1.4".getBytes(StandardCharsets.US_ASCII)).isEmpty());
        assertTrue(FirmaArchivo.detectarImagen(null).isEmpty());
    }

    @Test
    void esHeicReconoceLaFamiliaHeifPorSuMarca() {
        for (String marca : new String[] {"heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"}) {
            byte[] contenido = new byte[16];
            System.arraycopy("ftyp".getBytes(StandardCharsets.US_ASCII), 0, contenido, 4, 4);
            System.arraycopy(marca.getBytes(StandardCharsets.US_ASCII), 0, contenido, 8, 4);
            assertTrue(FirmaArchivo.esHeic(contenido), marca);
        }
        byte[] mp4 = new byte[16];
        System.arraycopy("ftyp".getBytes(StandardCharsets.US_ASCII), 0, mp4, 4, 4);
        System.arraycopy("isom".getBytes(StandardCharsets.US_ASCII), 0, mp4, 8, 4);
        assertFalse(FirmaArchivo.esHeic(mp4));
        assertFalse(FirmaArchivo.esHeic(null));
        assertFalse(FirmaArchivo.esHeic(new byte[8]));
        assertFalse(FirmaArchivo.esHeic(bytes(0xFF, 0xD8, 0xFF, 0xE0, 'f', 't', 'y', 'p', 'h', 'e', 'i')));
    }
}

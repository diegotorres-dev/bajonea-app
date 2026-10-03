package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoToken;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.GeneracionTokenException;
import com.bajonea.backend.repositories.TokenInsercionRepository;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

class TokenServiceTest {

    private static final int MAX_INTENTOS = 4;

    private TokenInsercionRepository insercion;
    private CodigoTokenGenerador generador;
    private TokenService tokenService;
    private Usuario usuario;
    private LocalDateTime vencimiento;

    @BeforeEach
    void preparar() {
        insercion = mock(TokenInsercionRepository.class);
        generador = mock(CodigoTokenGenerador.class);
        tokenService = new TokenService(insercion, generador, MAX_INTENTOS);
        usuario = mock(Usuario.class);
        when(usuario.getId()).thenReturn(42);
        vencimiento = LocalDateTime.now().plusMinutes(30);
    }

    @Test
    void sinColisionInsertaElPrimerCodigoGenerado() {
        when(generador.generar()).thenReturn("111111");
        when(insercion.existeValor("111111")).thenReturn(false);
        when(insercion.insertarPendiente(eq(42), eq(TipoToken.RECUPERACION_PASSWORD), eq("111111"), any(), eq(vencimiento)))
                .thenReturn(900);

        Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, vencimiento);

        assertEquals("111111", token.getToken());
        assertEquals(900, token.getId());
        assertEquals(TipoToken.RECUPERACION_PASSWORD, token.getTipo());
        assertEquals(EstadoToken.PENDIENTE, token.getEstado());
        assertEquals(vencimiento, token.getFechaVencimiento());
        verify(generador, times(1)).generar();
    }

    @Test
    void siElCodigoYaExisteGeneraOtroSinIntentarInsertarElRepetido() {
        when(generador.generar()).thenReturn("111111", "222222");
        when(insercion.existeValor("111111")).thenReturn(true);
        when(insercion.existeValor("222222")).thenReturn(false);
        when(insercion.insertarPendiente(anyInt(), any(), eq("222222"), any(), any())).thenReturn(7);

        Token token = tokenService.crear(usuario, TipoToken.VERIFICACION_EMAIL, vencimiento);

        assertEquals("222222", token.getToken());
        verify(insercion, never()).insertarPendiente(anyInt(), any(), eq("111111"), any(), any());
    }

    @Test
    void siElInsertChocaPorCarreraReintentaConOtroCodigo() {
        when(generador.generar()).thenReturn("111111", "222222");
        when(insercion.existeValor(anyString())).thenReturn(false);
        when(insercion.insertarPendiente(anyInt(), any(), eq("111111"), any(), any()))
                .thenThrow(new DuplicateKeyException("Duplicate entry '111111' for key 'uq_token_valor'"));
        when(insercion.insertarPendiente(anyInt(), any(), eq("222222"), any(), any())).thenReturn(8);

        Token token = tokenService.crear(usuario, TipoToken.REACTIVACION_CUENTA, vencimiento);

        assertEquals("222222", token.getToken());
        assertEquals(8, token.getId());
    }

    @Test
    void mezclaDeColisionPreviaYCarreraEnElMismoPedido() {
        when(generador.generar()).thenReturn("111111", "222222", "333333");
        when(insercion.existeValor("111111")).thenReturn(true);
        when(insercion.existeValor("222222")).thenReturn(false);
        when(insercion.existeValor("333333")).thenReturn(false);
        when(insercion.insertarPendiente(anyInt(), any(), eq("222222"), any(), any()))
                .thenThrow(new DuplicateKeyException("carrera"));
        when(insercion.insertarPendiente(anyInt(), any(), eq("333333"), any(), any())).thenReturn(9);

        Token token = tokenService.crear(usuario, TipoToken.VERIFICACION_EMAIL, vencimiento);

        assertEquals("333333", token.getToken());
    }

    @Test
    void siSeAgotanLosReintentosLanzaGeneracionTokenExceptionYNoUnConflicto() {
        when(generador.generar()).thenReturn("111111");
        when(insercion.existeValor("111111")).thenReturn(true);

        GeneracionTokenException ex = assertThrows(GeneracionTokenException.class,
                () -> tokenService.crear(usuario, TipoToken.VERIFICACION_EMAIL, vencimiento));

        verify(generador, times(MAX_INTENTOS)).generar();
        verify(insercion, never()).insertarPendiente(anyInt(), any(), anyString(), any(), any());
        assertEquals("No pudimos generar el código de verificación. Intentá nuevamente en unos instantes.", ex.getMessage());
    }

    @Test
    void siSeAgotanLosReintentosPorCarrerasTambienLanzaGeneracionTokenException() {
        when(generador.generar()).thenReturn("111111");
        when(insercion.existeValor(anyString())).thenReturn(false);
        when(insercion.insertarPendiente(anyInt(), any(), anyString(), any(), any()))
                .thenThrow(new DuplicateKeyException("carrera"));

        assertThrows(GeneracionTokenException.class,
                () -> tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, vencimiento));

        verify(insercion, times(MAX_INTENTOS)).insertarPendiente(anyInt(), any(), anyString(), any(), any());
    }
}

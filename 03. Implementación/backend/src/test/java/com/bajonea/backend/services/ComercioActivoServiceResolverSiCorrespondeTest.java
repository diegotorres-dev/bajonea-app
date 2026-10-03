package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ComercioActivoServiceResolverSiCorrespondeTest {

    private static final int DUENO_ID = 7;

    private ComercioRepository comercioRepository;
    private ComercioActivoService service;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        service = new ComercioActivoService(comercioRepository);
    }

    private static AuthenticatedUser usuario(RolUsuario rol) {
        return new AuthenticatedUser(DUENO_ID, 1, rol);
    }

    @ParameterizedTest
    @EnumSource(value = RolUsuario.class, names = "DUENO", mode = EnumSource.Mode.EXCLUDE)
    void paraCualquierRolQueNoEsDuenoDevuelveVacioSinMirarElHeader(RolUsuario rol) {
        assertTrue(service.resolverSiCorresponde(usuario(rol), "abc").isEmpty());
        assertTrue(service.resolverSiCorresponde(usuario(rol), "99999").isEmpty());
        assertTrue(service.resolverSiCorresponde(usuario(rol), null).isEmpty());
        verifyNoInteractions(comercioRepository);
    }

    @Test
    void elDuenoConHeaderPropioObtieneEseComercio() {
        when(comercioRepository.findByIdAndDuenoId(31, DUENO_ID)).thenReturn(Optional.of(Comercio.builder().id(31).build()));

        Optional<ComercioActivo> activo = service.resolverSiCorresponde(usuario(RolUsuario.DUENO), " 31 ");

        assertEquals(new ComercioActivo(31, DUENO_ID), activo.orElseThrow());
    }

    @Test
    void elDuenoConHeaderAjenoRecibe404() {
        when(comercioRepository.findByIdAndDuenoId(99, DUENO_ID)).thenReturn(Optional.empty());

        assertThrows(RecursoNoEncontradoException.class, () -> service.resolverSiCorresponde(usuario(RolUsuario.DUENO), "99"));
    }

    @Test
    void elDuenoSinHeaderOConHeaderVacioRecibe400() {
        assertThrows(ValidacionException.class, () -> service.resolverSiCorresponde(usuario(RolUsuario.DUENO), null));
        assertThrows(ValidacionException.class, () -> service.resolverSiCorresponde(usuario(RolUsuario.DUENO), ""));
        assertThrows(ValidacionException.class, () -> service.resolverSiCorresponde(usuario(RolUsuario.DUENO), "  "));
        verifyNoInteractions(comercioRepository);
    }

    @Test
    void elDuenoConHeaderNoNumericoRecibe400() {
        assertThrows(ValidacionException.class, () -> service.resolverSiCorresponde(usuario(RolUsuario.DUENO), "abc"));
        verifyNoInteractions(comercioRepository);
    }
}

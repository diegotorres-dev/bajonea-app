package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ComercioActivoServiceResolverSiCorrespondeTest {

    private static final int DUENO_ID = 7;

    private ComercioRepository comercioRepository;
    private ComercioActivoService service;
    private EmpleadoComercioRepository empleadoComercioRepository;

    @BeforeEach
    void preparar() {
        comercioRepository = mock(ComercioRepository.class);
        empleadoComercioRepository = mock(EmpleadoComercioRepository.class);
        service = new ComercioActivoService(comercioRepository, empleadoComercioRepository);
    }

    private static AuthenticatedUser usuario(RolUsuario rol) {
        return new AuthenticatedUser(DUENO_ID, 1, rol);
    }

    @ParameterizedTest
    @EnumSource(value = RolUsuario.class, names = {"DUENO", "CLIENTE"}, mode = EnumSource.Mode.EXCLUDE)
    void paraElAdministradorDevuelveVacioSinMirarElHeader(RolUsuario rol) {
        assertTrue(service.resolverSiCorresponde(usuario(rol), "abc").isEmpty());
        assertTrue(service.resolverSiCorresponde(usuario(rol), "99999").isEmpty());
        assertTrue(service.resolverSiCorresponde(usuario(rol), null).isEmpty());
        verifyNoInteractions(comercioRepository, empleadoComercioRepository);
    }

    @Test
    void elClienteSinHeaderOConHeaderEnBlancoDevuelveVacioYVeTodoLoSuyo() {
        assertTrue(service.resolverSiCorresponde(usuario(RolUsuario.CLIENTE), null).isEmpty());
        assertTrue(service.resolverSiCorresponde(usuario(RolUsuario.CLIENTE), "").isEmpty());
        assertTrue(service.resolverSiCorresponde(usuario(RolUsuario.CLIENTE), "   ").isEmpty());
        verifyNoInteractions(comercioRepository, empleadoComercioRepository);
    }

    @Test
    void elClienteConHeaderNoNumericoRecibe400() {
        assertThrows(ValidacionException.class, () -> service.resolverSiCorresponde(usuario(RolUsuario.CLIENTE), "abc"));
        verifyNoInteractions(comercioRepository, empleadoComercioRepository);
    }

    @Test
    void elClienteConHeaderDeUnComercioSinRelacionActivaRecibeElMismo404() {
        when(empleadoComercioRepository.findComercioAccesible(eq(DUENO_ID), eq(31), eq(EstadoEmpleadoComercio.ACTIVO), anyCollection()))
                .thenReturn(Optional.empty());

        assertThrows(ComercioNoDisponibleException.class, () -> service.resolverSiCorresponde(usuario(RolUsuario.CLIENTE), "31"));
    }

    @Test
    void elClienteEmpleadoConHeaderDeSuComercioObtieneElContextoDeEmpleado() {
        Comercio comercio = Comercio.builder().id(31).estado(EstadoComercio.APTO_VENTA)
                .dueno(Dueno.builder().id(77).build()).build();
        when(empleadoComercioRepository.findComercioAccesible(eq(DUENO_ID), eq(31), eq(EstadoEmpleadoComercio.ACTIVO), anyCollection()))
                .thenReturn(Optional.of(comercio));

        ComercioActivo activo = service.resolverSiCorresponde(usuario(RolUsuario.CLIENTE), " 31 ").orElseThrow();

        assertEquals(RolActorComercio.EMPLEADO, activo.actorRol());
        assertEquals(31, activo.comercioId());
        assertEquals(77, activo.duenoId());
        assertEquals(DUENO_ID, activo.actorUsuarioId());
    }

    @Test
    void elDuenoConHeaderPropioObtieneEseComercio() {
        when(comercioRepository.findByIdAndDuenoId(31, DUENO_ID)).thenReturn(Optional.of(Comercio.builder().id(31).estado(EstadoComercio.APROBADO).build()));

        Optional<ComercioActivo> activo = service.resolverSiCorresponde(usuario(RolUsuario.DUENO), " 31 ");

        assertEquals(ComercioActivo.delDueno(31, DUENO_ID, EstadoComercio.APROBADO), activo.orElseThrow());
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

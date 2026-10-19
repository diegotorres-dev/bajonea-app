package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body de {@code POST /api/v1/comercios}: un Dueño autenticado agrega un comercio más a su cuenta. Lleva los
 * datos del negocio ({@link DatosNegocioComercioRequestDTO}); los datos fiscales, el
 * representante y las credenciales de acceso se reutilizan de los que el Dueño ya cargó al registrarse.
 * La foto de perfil tiene que haberse subido con la firma de
 * {@code POST /api/v1/comercios/nuevo/foto/firma}.
 * <p>
 * {@code aceptaTerminos} se valida y no se guarda, como en el registro. Va acá y no en la superclase porque la
 * corrección de un comercio rechazado ({@link ReSolicitudComercioRequestDTO}) comparte los datos del negocio y no
 * lo pide: el Dueño ya aceptó al registrarse.
 */
@Getter
@Setter
@NoArgsConstructor
public class AltaComercioAdicionalRequestDTO extends DatosNegocioComercioRequestDTO {

    @NotNull(message = "Tenés que aceptar los Términos y Condiciones")
    @AssertTrue(message = "Tenés que aceptar los Términos y Condiciones")
    private Boolean aceptaTerminos;
}

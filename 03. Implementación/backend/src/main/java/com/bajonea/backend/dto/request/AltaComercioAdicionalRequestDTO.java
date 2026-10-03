package com.bajonea.backend.dto.request;

import lombok.NoArgsConstructor;

/**
 * Body de {@code POST /api/v1/comercios}: un Dueño autenticado agrega un comercio más a su cuenta. Solo
 * lleva los datos del negocio ({@link DatosNegocioComercioRequestDTO}); los datos fiscales, el
 * representante y las credenciales de acceso se reutilizan de los que el Dueño ya cargó al registrarse.
 * La foto de perfil tiene que haberse subido con la firma de
 * {@code POST /api/v1/comercios/nuevo/foto/firma}.
 */
@NoArgsConstructor
public class AltaComercioAdicionalRequestDTO extends DatosNegocioComercioRequestDTO {
}

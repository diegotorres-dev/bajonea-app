package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ConfiguracionTarifaRequestDTO;
import com.bajonea.backend.dto.response.ConfiguracionTarifaResponseDTO;
import com.bajonea.backend.entities.Administrador;
import com.bajonea.backend.entities.ConfiguracionTarifa;
import com.bajonea.backend.enums.TipoCargo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.ConfiguracionTarifaRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tabla {@code configuracion_tarifa} append-only (ver {@code docs/diccionario-de-datos.md}):
 * nunca se hace {@code UPDATE}/{@code DELETE} sobre un registro existente, solo {@code INSERT}
 * de una configuración nueva. La vigente es siempre la de {@code fecha_vigencia} más alta.
 *
 * <p>Cada cargo ({@code cliente}/{@code comercio}) tiene su propio {@link TipoCargo}
 * independiente: {@code FIJO} significa que el valor guardado es un monto en pesos tal cual
 * (ej. {@code cargoCliente=200.00} → siempre $200, sin importar el subtotal del pedido);
 * {@code PORCENTAJE} significa que el valor guardado es una tasa (ej. {@code cargoComercio=1.00}
 * → 1%, aplicada sobre el subtotal). No hay ninguna restricción que obligue a que ambos cargos
 * usen el mismo tipo — la decisión de negocio vigente (ver docs/DECISIONES.md) es cliente fijo
 * / comercio porcentual, pero el modelo soporta cualquier combinación.
 *
 * <p>El cargo al comercio se calcula siempre sobre el <b>subtotal</b> del pedido (suma de
 * {@code DetallePedido.subtotal}), nunca sobre el total — el total ya incluye el cargo al
 * cliente, y cobrarle al comercio un porcentaje sobre un monto que incluye un cargo que el
 * comercio no percibe (el cargo al cliente es ingreso de Bajoneá, no del comercio) inflaría la
 * comisión real sin ninguna justificación de negocio.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ConfiguracionTarifaService {

    private final ConfiguracionTarifaRepository configuracionTarifaRepository;
    private final AdministradorRepository administradorRepository;

    private static final int ESCALA_MONETARIA = 2;

    public ConfiguracionTarifa obtenerVigente() {
        return configuracionTarifaRepository.findTopByOrderByFechaVigenciaDesc()
                .orElseThrow(() -> new ConflictoDeNegocioException("No hay ninguna configuración de tarifa vigente"));
    }

    public ConfiguracionTarifaResponseDTO obtenerVigenteResponseDTO() {
        return aResponseDTO(obtenerVigente());
    }

    public List<ConfiguracionTarifaResponseDTO> obtenerHistorial() {
        return configuracionTarifaRepository.findAllByOrderByFechaVigenciaDesc().stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public ConfiguracionTarifaResponseDTO crear(ConfiguracionTarifaRequestDTO request, Integer administradorId) {
        Administrador administrador = administradorRepository.findById(administradorId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));

        ConfiguracionTarifa configuracion = ConfiguracionTarifa.builder()
                .administrador(administrador)
                .cargoCliente(request.getCargoCliente())
                .tipoCargoCliente(request.getTipoCargoCliente())
                .cargoComercio(request.getCargoComercio())
                .tipoCargoComercio(request.getTipoCargoComercio())
                .fechaVigencia(LocalDateTime.now())
                .build();
        configuracionTarifaRepository.save(configuracion);

        return aResponseDTO(configuracion);
    }

    /**
     * Cargo de servicio de Bajoneá a cargo del cliente para un pedido con el {@code subtotal}
     * dado, según la {@code tarifa} vigente. {@code FIJO} devuelve {@code cargoCliente} tal
     * cual; {@code PORCENTAJE} lo trata como una tasa sobre el subtotal.
     */
    public BigDecimal calcularCargoCliente(BigDecimal subtotal, ConfiguracionTarifa tarifa) {
        return calcular(subtotal, tarifa.getCargoCliente(), tarifa.getTipoCargoCliente());
    }

    /**
     * Comisión de plataforma de Bajoneá a cargo del comercio para un pedido con el
     * {@code subtotal} dado, según la {@code tarifa} vigente. Se calcula siempre sobre el
     * subtotal, no sobre el total (ver Javadoc de clase).
     */
    public BigDecimal calcularCargoComercio(BigDecimal subtotal, ConfiguracionTarifa tarifa) {
        return calcular(subtotal, tarifa.getCargoComercio(), tarifa.getTipoCargoComercio());
    }

    private BigDecimal calcular(BigDecimal subtotal, BigDecimal valor, TipoCargo tipo) {
        if (tipo == TipoCargo.FIJO) {
            return valor.setScale(ESCALA_MONETARIA, RoundingMode.HALF_UP);
        }
        return subtotal.multiply(valor)
                .divide(BigDecimal.valueOf(100), ESCALA_MONETARIA, RoundingMode.HALF_UP);
    }

    private ConfiguracionTarifaResponseDTO aResponseDTO(ConfiguracionTarifa configuracion) {
        return new ConfiguracionTarifaResponseDTO(
                configuracion.getId(),
                configuracion.getCargoCliente(),
                configuracion.getTipoCargoCliente(),
                configuracion.getCargoComercio(),
                configuracion.getTipoCargoComercio(),
                configuracion.getFechaVigencia());
    }
}

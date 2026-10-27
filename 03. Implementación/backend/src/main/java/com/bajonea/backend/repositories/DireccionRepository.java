package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Direccion;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DireccionRepository extends JpaRepository<Direccion, Integer> {

    /**
     * Usado en {@code AdministradorService.aResponseDTO} para armar la dirección anidada de
     * {@code ComercioResponseDTO} (relación 1:1 comercio → dirección).
     */
    Optional<Direccion> findByComercioId(Integer comercioId);

    @Query("SELECT d FROM Direccion d JOIN FETCH d.localidad l JOIN FETCH l.provincia WHERE d.comercio.id IN :comercioIds")
    List<Direccion> findByComercioIdInConLocalidad(java.util.Collection<Integer> comercioIds);

    /**
     * Direcciones de todos los comercios de un Dueño, con el comercio y la localidad ya cargados, en una
     * sola consulta: base del chequeo de comercio duplicado del alta adicional, sin una consulta por
     * comercio.
     */
    @Query("SELECT d FROM Direccion d JOIN FETCH d.comercio c JOIN FETCH d.localidad WHERE c.dueno.id = :duenoId")
    List<Direccion> findByDuenoIdConComercioYLocalidad(Integer duenoId);

    @Query("SELECT d FROM Direccion d JOIN FETCH d.localidad l JOIN FETCH l.provincia "
            + "WHERE d.cliente.id = :clienteId AND d.eliminada = false ORDER BY d.principal DESC, d.id DESC")
    List<Direccion> findActivasByClienteId(@Param("clienteId") Integer clienteId);

    long countByClienteIdAndEliminadaFalse(Integer clienteId);

    Optional<Direccion> findByIdAndClienteIdAndEliminadaFalse(Integer id, Integer clienteId);

    @Query("SELECT d FROM Direccion d JOIN FETCH d.localidad l JOIN FETCH l.provincia "
            + "WHERE d.cliente.id = :clienteId AND d.eliminada = false AND d.principal = true")
    Optional<Direccion> findPrincipalActivaByClienteId(@Param("clienteId") Integer clienteId);

    @Query("SELECT d FROM Direccion d WHERE d.cliente.id = :clienteId AND d.eliminada = false ORDER BY d.id DESC")
    List<Direccion> findActivasPorIdDescByClienteId(@Param("clienteId") Integer clienteId);

    /**
     * Lectura de la dirección de entrega con bloqueo compartido y sin pasar por Hibernate (MariaDB 10.4 no entiende
     * el {@code FOR SHARE} que genera {@code PESSIMISTIC_READ}): mientras el pedido se confirma, una edición o baja
     * de esa misma dirección espera al commit, y la copia sale de una sola fila consistente.
     */
    @Query(value = "SELECT d.id AS id, d.cliente_id AS clienteId, d.eliminada AS eliminada, d.calle AS calle, "
            + "d.numero AS numero, d.piso_depto AS pisoDepto, d.codigo_postal AS codigoPostal, "
            + "d.localidad_id AS localidadId, d.referencia AS referencia "
            + "FROM direccion d WHERE d.id = :id LOCK IN SHARE MODE", nativeQuery = true)
    Optional<DireccionParaEntrega> leerParaEntregaConBloqueoCompartido(@Param("id") Integer id);

    interface DireccionParaEntrega {
        Integer getId();

        Integer getClienteId();

        Boolean getEliminada();

        String getCalle();

        String getNumero();

        String getPisoDepto();

        String getCodigoPostal();

        String getLocalidadId();

        String getReferencia();
    }
}

package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.DocumentoComercio;
import com.bajonea.backend.enums.EstadoDocumentoComercio;
import com.bajonea.backend.enums.TipoDocumentoComercio;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DocumentoComercioRepository extends JpaRepository<DocumentoComercio, Integer> {

    interface DocumentoPendienteFila {
        Integer getId();

        Integer getComercioId();

        String getNombreComercio();

        Integer getDuenoId();

        String getNombreDueno();

        String getApellidoDueno();

        TipoDocumentoComercio getTipo();

        String getDescripcion();

        String getNombreOriginal();

        String getTipoMime();

        Integer getTamanoBytes();

        LocalDateTime getFechaSubida();

        Long getCuentasMercadoPagoActivas();
    }

    /**
     * La fila del documento leída con {@code FOR UPDATE}: tiene que ser la primera lectura de esa fila en la
     * transacción (una lectura común antes fijaría una foto vieja) y va después del bloqueo del comercio.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM DocumentoComercio d WHERE d.id = :id")
    Optional<DocumentoComercio> findByIdConBloqueo(@Param("id") Integer id);

    /**
     * Los estados de todos los documentos del comercio leídos con bloqueo compartido. Quien los cuenta ya tiene el
     * comercio bloqueado {@code FOR UPDATE}, y toda escritura de documentos toma primero ese bloqueo, así que el
     * recuento no cambia bajo los pies de quien lo usa; el bloqueo compartido evita además leer la foto vieja de
     * la transacción.
     */
    @Query(value = "SELECT estado FROM documento_comercio WHERE comercio_id = :comercioId LOCK IN SHARE MODE", nativeQuery = true)
    List<String> estadosDelComercioConBloqueoCompartido(@Param("comercioId") Integer comercioId);

    @Query("SELECT d FROM DocumentoComercio d WHERE d.comercioId = :comercioId ORDER BY d.fechaSubida DESC, d.id DESC")
    List<DocumentoComercio> findByComercioIdOrdenados(@Param("comercioId") Integer comercioId);

    @Query("SELECT d FROM DocumentoComercio d WHERE d.id = :id AND d.comercioId = :comercioId")
    Optional<DocumentoComercio> findByIdAndComercioId(@Param("id") Integer id, @Param("comercioId") Integer comercioId);

    @Query("SELECT d.comercioId FROM DocumentoComercio d WHERE d.id = :id")
    Optional<Integer> findComercioIdById(@Param("id") Integer id);

    long countByEstado(EstadoDocumentoComercio estado);

    @Query("SELECT d.id AS id, d.comercioId AS comercioId, c.nombre AS nombreComercio, c.dueno.id AS duenoId, "
            + "pf.nombre AS nombreDueno, pf.apellido AS apellidoDueno, d.tipo AS tipo, d.descripcion AS descripcion, "
            + "d.nombreOriginal AS nombreOriginal, d.tipoMime AS tipoMime, d.tamanoBytes AS tamanoBytes, "
            + "d.fechaSubida AS fechaSubida, "
            + "(SELECT COUNT(cm) FROM CuentaMercadoPago cm WHERE cm.dueno.id = c.dueno.id AND cm.activa = true) "
            + "AS cuentasMercadoPagoActivas "
            + "FROM DocumentoComercio d JOIN Comercio c ON c.id = d.comercioId "
            + "JOIN c.dueno du JOIN du.personaFisica pf "
            + "WHERE d.estado = com.bajonea.backend.enums.EstadoDocumentoComercio.PENDIENTE "
            + "ORDER BY d.fechaSubida ASC, d.id ASC")
    List<DocumentoPendienteFila> findPendientesOrdenados();
}

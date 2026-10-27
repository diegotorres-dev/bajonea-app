package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.DocumentoComercioArchivo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DocumentoComercioArchivoRepository extends JpaRepository<DocumentoComercioArchivo, Integer> {

    /** Baja directa: no carga el binario en memoria para borrarlo. */
    @Modifying
    @Query("DELETE FROM DocumentoComercioArchivo a WHERE a.id = :id")
    int borrarPorDocumentoId(@Param("id") Integer id);
}

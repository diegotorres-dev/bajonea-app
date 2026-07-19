package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.ImagenProducto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ImagenProductoRepository extends JpaRepository<ImagenProducto, Integer> {

    List<ImagenProducto> findByProductoIdOrderByOrdenAsc(Integer productoId);

    long countByProductoId(Integer productoId);
}

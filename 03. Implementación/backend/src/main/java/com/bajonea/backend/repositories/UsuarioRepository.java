package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Usuario;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface UsuarioRepository extends JpaRepository<Usuario, Integer> {

    Optional<Usuario> findByEmail(String email);

    boolean existsByEmail(String email);

    /**
     * {@code SELECT ... FOR UPDATE} — serializa requests concurrentes contra el mismo usuario
     * (ej. doble submit de login). Ver docs/CONCURRENCIA-Y-TRANSACCIONES.md, sección 1. Usar
     * únicamente donde la transacción va a mutar el {@code Usuario} leído; para lecturas simples
     * (ej. validación de unicidad en RegistroService) usar {@link #findByEmail} sin lock.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM Usuario u WHERE u.email = :email")
    Optional<Usuario> findByEmailConBloqueo(String email);

    /**
     * Mismo patrón que {@link #findByEmailConBloqueo}, por PK en vez de email — usado en flujos
     * autenticados que mutan al propio usuario (ej. cambio de contraseña desde perfil).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM Usuario u WHERE u.id = :id")
    Optional<Usuario> findByIdConBloqueo(Integer id);
}

package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Usuario;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UsuarioRepository extends JpaRepository<Usuario, Integer> {

    Optional<Usuario> findByEmail(String email);

    boolean existsByEmail(String email);

    /**
     * Id de la cuenta de un email sin cargar la entidad (ver {@code InvitacionEmpleadoRepository.InvitacionPendienteVista}):
     * quien lo usa va a bloquear la fila después y necesita leer su estado confirmado, no una copia ya cargada.
     */
    @Query("SELECT u.id FROM Usuario u WHERE u.email = :email")
    Optional<Integer> findIdByEmail(@Param("email") String email);

    boolean existsByNombreUsuario(String nombreUsuario);

    /**
     * Mismo patrón que {@link #findByEmailConBloqueo}, usado por el login (credencial: nombre de
     * usuario, siempre normalizado a minúsculas antes de llegar acá).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM Usuario u WHERE u.nombreUsuario = :nombreUsuario")
    Optional<Usuario> findByNombreUsuarioConBloqueo(String nombreUsuario);

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

    /**
     * Lectura con bloqueo compartido (una consulta nativa: MariaDB 10.4 no entiende el {@code FOR SHARE} que genera
     * Hibernate, ver docs/APRENDIZAJES-TECNICOS.md) de la fila del usuario. La toma quien va a escribir una fila con
     * clave foránea a este usuario (por ejemplo {@code historial_cierre_comercio.actor_usuario_id}) <b>antes</b> de
     * bloquear la fila de otra tabla, para respetar el mismo orden que el login (usuario y después comercio) y no
     * cruzarse con el bloqueo de cuenta por intentos fallidos.
     */
    @Query(value = "SELECT id FROM usuario WHERE id = :id LOCK IN SHARE MODE", nativeQuery = true)
    Optional<Integer> leerIdConBloqueoCompartido(@Param("id") Integer id);

    /**
     * Estado de la cuenta leído con bloqueo compartido (devuelve lo último confirmado, no la foto de la
     * transacción). Lo toma quien va a dejar un comercio del Dueño a la venta (aprobación, vinculación de Mercado
     * Pago) <b>antes</b> de bloquear la cuenta de cobro y el comercio, para respetar el orden usuario, cuenta,
     * comercio y decidir sin carrera contra un bloqueo de cuenta que se confirma en el medio.
     */
    @Query(value = "SELECT estado FROM usuario WHERE id = :id LOCK IN SHARE MODE", nativeQuery = true)
    Optional<String> leerEstadoConBloqueoCompartido(@Param("id") Integer id);
}

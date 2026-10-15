package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.ActividadComercioItemResponseDTO;
import com.bajonea.backend.dto.response.ActividadComercioResponseDTO;
import com.bajonea.backend.enums.AccionCierre;
import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.FuenteActividad;
import com.bajonea.backend.enums.TipoEntidadEdicion;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.FilaActividadCierre;
import com.bajonea.backend.repositories.FilaActividadEdicion;
import com.bajonea.backend.repositories.FilaActividadPedido;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HistorialEdicionComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoPedidoRepository;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Actividad de un comercio: una sola lista, de la más nueva a la más vieja, que mezcla tres historiales que ya
 * existen: las ediciones del catálogo y el perfil ({@code historial_edicion_comercio}), todo lo que le pasó a sus
 * pedidos desde que el comercio los ve ({@code historial_estado_pedido}: acciones del Dueño y los Empleados, del
 * Cliente y del sistema, incluida la llegada del pedido pagado; no el nacimiento en {@code PENDIENTE_PAGO} ni su
 * vencimiento por falta de pago) y los cierres y reaperturas ({@code historial_cierre_comercio}, también las
 * automáticas del sistema). Las tres fuentes escriben la hora con el reloj de la aplicación, así que el orden
 * entre ellas es el real.
 * <p>
 * Con el filtro opcional {@code fuente} se consulta una sola de las tres y se saltean las otras dos; el cursor es el
 * mismo y vale con o sin filtro, porque todas las filas que quedan son de la fuente pedida.
 * <p>
 * Paginación por cursor sobre el orden total {@code (fecha_hora desc, fuente asc, id desc)}: el cursor es la
 * posición de la última fila entregada, así que una fila nueva no corre las páginas ni repite ni saltea filas.
 * Cada fuente se consulta con su propio tope ({@code limite + 1}): las primeras {@code limite + 1} filas del total
 * están siempre entre las primeras {@code limite + 1} de alguna fuente. Tres consultas en total por página, con el
 * nombre del actor ya resuelto en cada una (join a {@code persona_fisica}), sin consultas por fila.
 * <p>
 * La ve el Dueño; el Administrador la va a leer en solo lectura con {@link #listar(Integer, Integer, String)}.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ActividadComercioService {

    static final int LIMITE_POR_DEFECTO = 30;
    static final int LIMITE_MAXIMO = 100;

    private static final LocalDateTime SIN_CURSOR_FECHA = LocalDateTime.of(9999, 12, 31, 23, 59, 59);
    private static final List<EstadoPedido> ESTADOS_VISIBLES = TextosPedidoActividad.ESTADOS_VISIBLES_PARA_EL_COMERCIO;

    private static final Comparator<Fila> ORDEN_DE_LA_LISTA = Comparator
            .comparing(Fila::fechaHora, Comparator.<LocalDateTime>reverseOrder())
            .thenComparingInt(fila -> fila.fuente().ordinal())
            .thenComparing(Fila::idFila, Comparator.<Integer>reverseOrder());

    private final HistorialEdicionComercioRepository historialEdicionComercioRepository;
    private final HistorialEstadoPedidoRepository historialEstadoPedidoRepository;
    private final HistorialCierreComercioRepository historialCierreComercioRepository;

    public ActividadComercioResponseDTO listar(ComercioActivo comercio, Integer limite, String cursor) {
        return listar(comercio, limite, cursor, null);
    }

    public ActividadComercioResponseDTO listar(ComercioActivo comercio, Integer limite, String cursor, String fuente) {
        if (comercio.esEmpleado()) {
            throw new ComercioNoDisponibleException();
        }
        return listar(comercio.comercioId(), limite, cursor, fuente);
    }

    public ActividadComercioResponseDTO listar(Integer comercioId, Integer limite, String cursor) {
        return listar(comercioId, limite, cursor, null);
    }

    public ActividadComercioResponseDTO listar(Integer comercioId, Integer limite, String cursor, String fuente) {
        int tamanio = tamanioDePagina(limite);
        FuenteActividad filtro = interpretarFuente(fuente);
        Cursor desde = Cursor.interpretar(cursor);
        PageRequest pagina = PageRequest.of(0, tamanio + 1);

        List<Fila> filas = new ArrayList<>();
        if (filtro == null || filtro == FuenteActividad.PEDIDO) {
            for (FilaActividadPedido fila : historialEstadoPedidoRepository.actividadDelComercio(comercioId, ESTADOS_VISIBLES,
                    desde.fecha(), desde.idMaximoDe(FuenteActividad.PEDIDO), pagina)) {
                filas.add(desdePedido(fila));
            }
        }
        if (filtro == null || filtro == FuenteActividad.EDICION) {
            for (FilaActividadEdicion fila : historialEdicionComercioRepository.actividadDelComercio(comercioId, desde.fecha(),
                    desde.idMaximoDe(FuenteActividad.EDICION), pagina)) {
                filas.add(desdeEdicion(fila));
            }
        }
        if (filtro == null || filtro == FuenteActividad.CIERRE) {
            for (FilaActividadCierre fila : historialCierreComercioRepository.actividadDelComercio(comercioId, desde.fecha(),
                    desde.idMaximoDe(FuenteActividad.CIERRE), pagina)) {
                filas.add(desdeCierre(fila));
            }
        }

        filas.sort(ORDEN_DE_LA_LISTA);

        boolean hayMas = filas.size() > tamanio;
        List<Fila> pagina1 = hayMas ? filas.subList(0, tamanio) : filas;
        String siguiente = hayMas ? Cursor.de(pagina1.get(pagina1.size() - 1)) : null;
        List<ActividadComercioItemResponseDTO> items = pagina1.stream().map(Fila::item).toList();
        return new ActividadComercioResponseDTO(items, siguiente, hayMas);
    }

    private static FuenteActividad interpretarFuente(String texto) {
        if (texto == null || texto.isBlank()) {
            return null;
        }
        try {
            return FuenteActividad.valueOf(texto.trim());
        } catch (IllegalArgumentException e) {
            throw new ValidacionException("La fuente tiene que ser PEDIDO, EDICION o CIERRE");
        }
    }

    private static int tamanioDePagina(Integer limite) {
        if (limite == null) {
            return LIMITE_POR_DEFECTO;
        }
        if (limite < 1) {
            throw new ValidacionException("El límite tiene que ser de al menos 1");
        }
        return Math.min(limite, LIMITE_MAXIMO);
    }

    private record Fila(FuenteActividad fuente, Integer idFila, LocalDateTime fechaHora, ActividadComercioItemResponseDTO item) {
    }

    private record Cursor(LocalDateTime fecha, FuenteActividad fuente, Integer id) {

        static Cursor interpretar(String texto) {
            if (texto == null || texto.isBlank()) {
                return new Cursor(SIN_CURSOR_FECHA, null, null);
            }
            String[] partes = texto.trim().split("_");
            if (partes.length != 3) {
                throw cursorInvalido();
            }
            try {
                LocalDateTime fecha = LocalDateTime.parse(partes[0]);
                FuenteActividad fuente = FuenteActividad.values()[Integer.parseInt(partes[1])];
                int id = Integer.parseInt(partes[2]);
                return new Cursor(fecha, fuente, id);
            } catch (DateTimeParseException | NumberFormatException | ArrayIndexOutOfBoundsException e) {
                throw cursorInvalido();
            }
        }

        static String de(Fila ultima) {
            return ultima.fechaHora() + "_" + ultima.fuente().ordinal() + "_" + ultima.idFila();
        }

        /**
         * Mayor id de la fuente que sigue siendo posterior al cursor cuando la fecha es igual a la del cursor: todo
         * si la fuente va después en el desempate, nada si va antes y {@code id - 1} si es la misma.
         */
        int idMaximoDe(FuenteActividad consultada) {
            if (fuente == null || consultada.ordinal() > fuente.ordinal()) {
                return Integer.MAX_VALUE;
            }
            if (consultada == fuente) {
                return id - 1;
            }
            return -1;
        }

        private static ValidacionException cursorInvalido() {
            return new ValidacionException("El cursor no es válido");
        }
    }

    private static Fila desdeEdicion(FilaActividadEdicion fila) {
        String rol = fila.actorRol().name();
        ActividadComercioItemResponseDTO item = new ActividadComercioItemResponseDTO("EDICION-" + fila.id(), FuenteActividad.EDICION,
                fila.fechaHora(), fila.usuarioId(), TextosPedidoActividad.nombreDe(fila.actorNombre(), fila.actorApellido()), rol, TextosPedidoActividad.textoDeRol(rol),
                fila.accion().name(), textoDeEdicion(fila.accion(), fila.entidadTipo()), fila.entidadTipo().name(),
                fila.entidadId(), fila.entidadNombre(), fila.detalle());
        return new Fila(FuenteActividad.EDICION, fila.id(), fila.fechaHora(), item);
    }

    private static Fila desdePedido(FilaActividadPedido fila) {
        String rol = fila.actorRol().name();
        boolean delSistema = fila.actorRol() == ActorPedido.SISTEMA;
        ActividadComercioItemResponseDTO item = new ActividadComercioItemResponseDTO("PEDIDO-" + fila.id(), FuenteActividad.PEDIDO,
                fila.fechaHora(), delSistema ? null : fila.usuarioId(),
                delSistema ? null : TextosPedidoActividad.nombreDe(fila.actorNombre(), fila.actorApellido()), rol, TextosPedidoActividad.textoDeRol(rol),
                fila.estado().name(), TextosPedidoActividad.textoDePedido(fila.estado(), fila.actorRol(), fila.motivoTimeout(), TextosPedidoActividad.UN_PEDIDO), "PEDIDO",
                fila.pedidoId(), "Pedido #" + fila.pedidoId(), null);
        return new Fila(FuenteActividad.PEDIDO, fila.id(), fila.fechaHora(), item);
    }

    private static Fila desdeCierre(FilaActividadCierre fila) {
        String rol = fila.actorRol().name();
        String nombre = fila.usuarioId() == null ? null : TextosPedidoActividad.nombreDe(fila.actorNombre(), fila.actorApellido());
        String texto = fila.accion() == AccionCierre.CERRADO ? "Cerró el comercio" : "Reabrió el comercio";
        ActividadComercioItemResponseDTO item = new ActividadComercioItemResponseDTO("CIERRE-" + fila.id(), FuenteActividad.CIERRE,
                fila.fechaHora(), fila.usuarioId(), nombre, rol, TextosPedidoActividad.textoDeRol(rol), fila.accion().name(), texto, "COMERCIO", null,
                null, null);
        return new Fila(FuenteActividad.CIERRE, fila.id(), fila.fechaHora(), item);
    }

    private static String textoDeEdicion(AccionEdicion accion, TipoEntidadEdicion tipo) {
        return switch (accion) {
            case CREAR -> switch (tipo) {
                case PRODUCTO -> "Creó un producto";
                case IMAGEN_PRODUCTO -> "Agregó una imagen a un producto";
                case COMERCIO -> "Creó el comercio";
                case HORARIO -> "Agregó un horario";
                case RED_SOCIAL -> "Agregó una red social";
                case GRUPO_EXTRA -> "Creó un grupo de extras";
                case EXTRA -> "Creó un extra";
            };
            case EDITAR -> switch (tipo) {
                case PRODUCTO -> "Editó un producto";
                case IMAGEN_PRODUCTO -> "Editó una imagen de un producto";
                case COMERCIO -> "Editó los datos del comercio";
                case HORARIO -> "Editó los horarios";
                case RED_SOCIAL -> "Editó una red social";
                case GRUPO_EXTRA -> "Editó un grupo de extras";
                case EXTRA -> "Editó un extra";
            };
            case ELIMINAR -> switch (tipo) {
                case PRODUCTO -> "Eliminó un producto";
                case IMAGEN_PRODUCTO -> "Eliminó una imagen de un producto";
                case COMERCIO -> "Eliminó el comercio";
                case HORARIO -> "Eliminó un horario";
                case RED_SOCIAL -> "Dio de baja una red social";
                case GRUPO_EXTRA -> "Eliminó un grupo de extras";
                case EXTRA -> "Eliminó un extra";
            };
            case CAMBIAR_ESTADO -> switch (tipo) {
                case PRODUCTO -> "Cambió la disponibilidad de un producto";
                case COMERCIO -> "Cambió el estado del comercio";
                default -> "Cambió el estado de " + tipo.name().toLowerCase().replace('_', ' ');
            };
        };
    }
}

package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.DatosLegalesComercioRequestDTO;
import com.bajonea.backend.dto.request.DireccionRequestDTO;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.PersonaJuridica;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.enums.CampoCambioComercio;
import com.bajonea.backend.enums.TipoComercio;
import com.bajonea.backend.enums.TipoRedSocial;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.repositories.PersonaJuridicaRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import com.bajonea.backend.util.ComercioTextoLegible;
import com.bajonea.backend.util.ComercioTextoLegible.FranjaOrdenable;
import com.bajonea.backend.util.TextoUtils;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Operaciones de edición de los datos de un comercio, reutilizables por cualquier flujo que cambie datos de
 * un comercio ya cargado (hoy, la corrección de un comercio rechazado; mañana, la edición de horarios,
 * dirección y tipo desde el perfil). Cada operación recibe el {@link Comercio} ya cargado (y bloqueado, si
 * el llamador lo necesita), aplica el cambio dentro de la transacción del llamador y devuelve la lista de
 * {@link CambioComercio} que realmente cambió: vacía si el dato recibido, una vez normalizado como al
 * registrar, es igual al que ya estaba. No decide quién puede editar qué, ni en qué estado: eso es del
 * llamador.
 * <p>
 * Normalización de lo recibido, igual que en el alta: nombre, calle y nombres del representante a Title
 * Case, código postal a su forma canónica, texto vacío o en blanco a {@code null}; las horas se comparan a
 * nivel minuto. Los valores anterior y nuevo salen como texto legible ({@link ComercioTextoLegible}): una
 * sola implementación para ambos lados, así dos datos iguales nunca dan textos distintos.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ComercioEdicionService {

    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final RedSocialRepository redSocialRepository;
    private final PersonaJuridicaRepository personaJuridicaRepository;
    private final PersonaFisicaRepository personaFisicaRepository;
    private final CloudinaryService cloudinaryService;

    /** Nombre, descripción, teléfono y email de contacto. */
    public List<CambioComercio> actualizarDatosBasicos(Comercio comercio, String nombre, String descripcion,
            String telefono, String emailContacto) {
        List<CambioComercio> cambios = new ArrayList<>();
        String nuevoNombre = TextoUtils.aTitleCase(limpiar(nombre));
        String nuevaDescripcion = limpiar(descripcion);
        String nuevoTelefono = limpiar(telefono);
        String nuevoEmail = limpiar(emailContacto);

        if (registrar(cambios, CampoCambioComercio.NOMBRE, comercio.getNombre(), nuevoNombre)) {
            comercio.setNombre(nuevoNombre);
        }
        if (registrar(cambios, CampoCambioComercio.DESCRIPCION, comercio.getDescripcion(), nuevaDescripcion)) {
            comercio.setDescripcion(nuevaDescripcion);
        }
        if (registrar(cambios, CampoCambioComercio.TELEFONO, comercio.getTelefono(), nuevoTelefono)) {
            comercio.setTelefono(nuevoTelefono);
        }
        if (registrar(cambios, CampoCambioComercio.EMAIL_CONTACTO, comercio.getEmail(), nuevoEmail)) {
            comercio.setEmail(nuevoEmail);
        }
        guardarSiCambio(comercio, cambios);
        return cambios;
    }

    public List<CambioComercio> actualizarTipo(Comercio comercio, TipoComercio tipo) {
        List<CambioComercio> cambios = new ArrayList<>();
        if (registrar(cambios, CampoCambioComercio.TIPO_COMERCIO, nombreDe(comercio.getTipoComercio()), nombreDe(tipo))) {
            comercio.setTipoComercio(tipo);
        }
        guardarSiCambio(comercio, cambios);
        return cambios;
    }

    /** Modalidades de entrega. La regla de "al menos una" la valida el llamador. */
    public List<CambioComercio> actualizarModalidades(Comercio comercio, boolean aceptaDelivery, boolean aceptaRetiro) {
        List<CambioComercio> cambios = new ArrayList<>();
        String anterior = ComercioTextoLegible.modalidades(comercio.isAceptaDelivery(), comercio.isAceptaRetiro());
        String nuevo = ComercioTextoLegible.modalidades(aceptaDelivery, aceptaRetiro);
        if (registrar(cambios, CampoCambioComercio.MODALIDADES, anterior, nuevo)) {
            comercio.setAceptaDelivery(aceptaDelivery);
            comercio.setAceptaRetiro(aceptaRetiro);
        }
        guardarSiCambio(comercio, cambios);
        return cambios;
    }

    /**
     * Cambia la foto de perfil. Si la URL recibida es la que ya está no hay cambio ni validación (puede ser la
     * del registro, de otra carpeta); si es otra, tiene que haberse subido con la firma de
     * {@code CloudinaryService.generarFirmaFotoPerfilComercio} de este comercio.
     */
    public List<CambioComercio> actualizarFoto(Comercio comercio, String url) {
        List<CambioComercio> cambios = new ArrayList<>();
        String nueva = limpiar(url);
        if (!Objects.equals(limpiar(comercio.getFotoPerfilUrl()), nueva)) {
            cloudinaryService.validarFotoPerfilComercio(comercio.getId(), nueva);
            registrar(cambios, CampoCambioComercio.FOTO_PERFIL, comercio.getFotoPerfilUrl(), nueva);
            comercio.setFotoPerfilUrl(nueva);
        }
        guardarSiCambio(comercio, cambios);
        return cambios;
    }

    /**
     * Actualiza la dirección en el lugar (no crea otra: la dirección del comercio es única). El código
     * postal cuenta: si cambia, es un cambio de dirección.
     */
    public List<CambioComercio> actualizarDireccion(Comercio comercio, DireccionRequestDTO nueva, Localidad localidad) {
        List<CambioComercio> cambios = new ArrayList<>();
        Direccion direccion = direccionRepository.findByComercioId(comercio.getId())
                .orElseThrow(() -> new RecursoNoEncontradoException("El comercio no tiene una dirección cargada"));

        String calle = TextoUtils.aTitleCase(limpiar(nueva.getCalle()));
        String numero = limpiar(nueva.getNumero());
        String pisoDepto = limpiar(nueva.getPisoDepto());
        String codigoPostal = TextoUtils.normalizarCodigoPostal(limpiar(nueva.getCodigoPostal()));

        boolean cambia = !Objects.equals(limpiar(direccion.getCalle()), calle)
                || !Objects.equals(limpiar(direccion.getNumero()), numero)
                || !Objects.equals(limpiar(direccion.getPisoDepto()), pisoDepto)
                || !Objects.equals(limpiar(direccion.getCodigoPostal()), codigoPostal)
                || !direccion.getLocalidad().getId().equals(localidad.getId());
        if (cambia) {
            cambios.add(new CambioComercio(CampoCambioComercio.DIRECCION, ComercioTextoLegible.direccion(direccion),
                    ComercioTextoLegible.direccion(calle, numero, pisoDepto, localidad.getNombre(),
                            localidad.getProvincia().getNombre(), codigoPostal)));
            direccion.setCalle(calle);
            direccion.setNumero(numero);
            direccion.setPisoDepto(pisoDepto);
            direccion.setCodigoPostal(codigoPostal);
            direccion.setLocalidad(localidad);
            direccion.setFechaModificacion(LocalDateTime.now());
            direccionRepository.save(direccion);
        }
        guardarSiCambio(comercio, cambios);
        return cambios;
    }

    /**
     * Reemplaza los horarios: borra las franjas que había y carga las recibidas. Dos listas de franjas son
     * iguales si tienen las mismas franjas, sin importar el orden en que vengan. La validación (superposición,
     * cierre posterior a apertura) la hace el llamador.
     */
    public List<CambioComercio> reemplazarHorarios(Comercio comercio, List<HorarioRequestDTO> nuevos) {
        List<CambioComercio> cambios = new ArrayList<>();
        List<Horario> actuales = horarioRepository.findByComercioId(comercio.getId());

        List<FranjaOrdenable> franjasActuales = actuales.stream()
                .map(h -> franja(h.getDiaSemana(), h.getHoraApertura(), h.getHoraCierre()))
                .sorted(FranjaOrdenable.ORDEN)
                .toList();
        List<FranjaOrdenable> franjasNuevas = nuevos.stream()
                .map(h -> franja(h.getDiaSemana(), h.getHoraApertura(), h.getHoraCierre()))
                .sorted(FranjaOrdenable.ORDEN)
                .toList();

        if (!franjasActuales.equals(franjasNuevas)) {
            cambios.add(new CambioComercio(CampoCambioComercio.HORARIOS, ComercioTextoLegible.horarios(actuales),
                    franjasNuevas.stream().map(FranjaOrdenable::texto).collect(Collectors.joining("; "))));
            horarioRepository.deleteAll(actuales);
            horarioRepository.flush();
            horarioRepository.saveAll(franjasNuevas.stream()
                    .map(f -> Horario.builder()
                            .comercio(comercio)
                            .diaSemana(f.dia())
                            .horaApertura(f.apertura())
                            .horaCierre(f.cierre())
                            .build())
                    .toList());
        }
        guardarSiCambio(comercio, cambios);
        return cambios;
    }

    /**
     * Sincroniza las redes sociales con la lista recibida (sin tipos repetidos, hasta 5; lo valida el
     * llamador): actualiza la de cada tipo recibido (reviviendo una dada de baja, por la restricción única
     * {@code (comercio_id, tipo)}), da de baja las activas cuyo tipo ya no viene e inserta solo los tipos
     * que el comercio nunca tuvo.
     */
    public List<CambioComercio> sincronizarRedes(Comercio comercio, List<RedSocialRequestDTO> nuevas) {
        List<CambioComercio> cambios = new ArrayList<>();
        List<RedSocial> todas = redSocialRepository.findByComercioId(comercio.getId());
        List<RedSocial> activas = todas.stream().filter(r -> r.getFechaBaja() == null).toList();

        Map<TipoRedSocial, String> urlsNuevas = new EnumMap<>(TipoRedSocial.class);
        nuevas.forEach(r -> urlsNuevas.put(r.getTipo(), r.getUrl()));
        Map<TipoRedSocial, String> urlsActuales = new EnumMap<>(TipoRedSocial.class);
        activas.forEach(r -> urlsActuales.put(r.getTipo(), r.getUrl()));

        if (urlsActuales.equals(urlsNuevas)) {
            return cambios;
        }
        cambios.add(new CambioComercio(CampoCambioComercio.REDES_SOCIALES,
                limpiar(ComercioTextoLegible.redesSociales(urlsActuales)), limpiar(ComercioTextoLegible.redesSociales(urlsNuevas))));

        LocalDateTime ahora = LocalDateTime.now();
        Map<TipoRedSocial, RedSocial> porTipo = new EnumMap<>(TipoRedSocial.class);
        todas.forEach(r -> porTipo.put(r.getTipo(), r));

        for (RedSocial activa : activas) {
            if (!urlsNuevas.containsKey(activa.getTipo())) {
                activa.setFechaBaja(ahora);
                redSocialRepository.save(activa);
            }
        }
        for (Map.Entry<TipoRedSocial, String> nueva : urlsNuevas.entrySet()) {
            RedSocial existente = porTipo.get(nueva.getKey());
            if (existente == null) {
                redSocialRepository.save(RedSocial.builder()
                        .comercio(comercio)
                        .tipo(nueva.getKey())
                        .url(nueva.getValue())
                        .fechaCreacion(ahora)
                        .build());
            } else if (existente.getFechaBaja() != null || !existente.getUrl().equals(nueva.getValue())) {
                existente.setUrl(nueva.getValue());
                existente.setFechaBaja(null);
                existente.setFechaModificacion(ahora);
                redSocialRepository.save(existente);
            }
        }
        guardarSiCambio(comercio, cambios);
        return cambios;
    }

    /**
     * Datos fiscales ({@code PersonaJuridica}) y del representante ({@code PersonaFisica}) del Dueño. Un CUIT
     * o un DNI que ya es de otra cuenta da {@code 409} con el mismo mensaje del alta, sin decir de quién (se
     * atrapa también la violación de la restricción única, por si otra transacción lo tomó en el medio). El
     * llamador es quien decide si el Dueño puede tocar estos datos.
     */
    public List<CambioComercio> actualizarDatosLegales(Dueno dueno, DatosLegalesComercioRequestDTO legales) {
        List<CambioComercio> cambios = new ArrayList<>();
        PersonaJuridica pj = dueno.getPersonaJuridica();
        PersonaFisica pf = dueno.getPersonaFisica();

        String cuit = legales.getCuit();
        String dni = legales.getDniRepresentante();
        if (!Objects.equals(pj.getCuit(), cuit) && personaJuridicaRepository.existsByCuit(cuit)) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese CUIT");
        }
        if (!Objects.equals(pf.getDni(), dni) && personaFisicaRepository.existsByDni(dni)) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese DNI");
        }

        String razonSocial = TextoUtils.aTitleCase(limpiar(legales.getRazonSocial()));
        String domicilio = limpiar(legales.getDomicilioFiscal());
        boolean cambioJuridica = false;
        if (registrar(cambios, CampoCambioComercio.RAZON_SOCIAL, pj.getRazonSocial(), razonSocial)) {
            pj.setRazonSocial(razonSocial);
            cambioJuridica = true;
        }
        if (registrar(cambios, CampoCambioComercio.CUIT, pj.getCuit(), cuit)) {
            pj.setCuit(cuit);
            cambioJuridica = true;
        }
        if (registrar(cambios, CampoCambioComercio.CONDICION_IVA, nombreDe(pj.getCondicionIva()), nombreDe(legales.getCondicionIva()))) {
            pj.setCondicionIva(legales.getCondicionIva());
            cambioJuridica = true;
        }
        if (registrar(cambios, CampoCambioComercio.TIPO_SOCIEDAD, nombreDe(pj.getTipoSociedad()), nombreDe(legales.getTipoSociedad()))) {
            pj.setTipoSociedad(legales.getTipoSociedad());
            cambioJuridica = true;
        }
        if (registrar(cambios, CampoCambioComercio.DOMICILIO_FISCAL, pj.getDomicilioFiscal(), domicilio)) {
            pj.setDomicilioFiscal(domicilio);
            cambioJuridica = true;
        }
        if (registrar(cambios, CampoCambioComercio.FECHA_INICIO_ACTIVIDADES, fecha(pj.getFechaInicioActividades()),
                fecha(legales.getFechaInicioActividades()))) {
            pj.setFechaInicioActividades(legales.getFechaInicioActividades());
            cambioJuridica = true;
        }

        String nombre = TextoUtils.aTitleCase(limpiar(legales.getNombreRepresentante()));
        String apellido = TextoUtils.aTitleCase(limpiar(legales.getApellidoRepresentante()));
        String telefono = limpiar(legales.getTelefonoRepresentante());
        boolean cambioFisica = false;
        if (registrar(cambios, CampoCambioComercio.REPRESENTANTE_NOMBRE, pf.getNombre(), nombre)) {
            pf.setNombre(nombre);
            cambioFisica = true;
        }
        if (registrar(cambios, CampoCambioComercio.REPRESENTANTE_APELLIDO, pf.getApellido(), apellido)) {
            pf.setApellido(apellido);
            cambioFisica = true;
        }
        if (registrar(cambios, CampoCambioComercio.REPRESENTANTE_DNI, pf.getDni(), dni)) {
            pf.setDni(dni);
            cambioFisica = true;
        }
        if (registrar(cambios, CampoCambioComercio.REPRESENTANTE_TELEFONO, pf.getTelefono(), telefono)) {
            pf.setTelefono(telefono);
            cambioFisica = true;
        }
        if (registrar(cambios, CampoCambioComercio.REPRESENTANTE_FECHA_NACIMIENTO, fecha(pf.getFechaNacimiento()),
                fecha(legales.getFechaNacimientoRepresentante()))) {
            pf.setFechaNacimiento(legales.getFechaNacimientoRepresentante());
            cambioFisica = true;
        }

        try {
            if (cambioJuridica) {
                personaJuridicaRepository.saveAndFlush(pj);
            }
            if (cambioFisica) {
                pf.setFechaModificacion(LocalDateTime.now());
                personaFisicaRepository.saveAndFlush(pf);
            }
        } catch (DataIntegrityViolationException ex) {
            String detalle = String.valueOf(ex.getMostSpecificCause().getMessage());
            if (detalle.contains("uq_persona_juridica_cuit")) {
                throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese CUIT");
            }
            if (detalle.contains("uq_persona_fisica_dni")) {
                throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese DNI");
            }
            throw ex;
        }
        return cambios;
    }

    private void guardarSiCambio(Comercio comercio, List<CambioComercio> cambios) {
        if (!cambios.isEmpty()) {
            comercio.setFechaModificacion(LocalDateTime.now());
            comercioRepository.save(comercio);
        }
    }

    private static FranjaOrdenable franja(com.bajonea.backend.enums.DiaSemana dia, java.time.LocalTime apertura,
            java.time.LocalTime cierre) {
        return new FranjaOrdenable(dia, ComercioTextoLegible.aMinutos(apertura), ComercioTextoLegible.aMinutos(cierre));
    }

    private static boolean registrar(List<CambioComercio> cambios, CampoCambioComercio campo, String anterior, String nuevo) {
        String anteriorLimpio = limpiar(anterior);
        String nuevoLimpio = limpiar(nuevo);
        if (Objects.equals(anteriorLimpio, nuevoLimpio)) {
            return false;
        }
        cambios.add(new CambioComercio(campo, anteriorLimpio, nuevoLimpio));
        return true;
    }

    private static String limpiar(String valor) {
        if (valor == null) {
            return null;
        }
        String recortado = valor.trim();
        return recortado.isEmpty() ? null : recortado;
    }

    private static String nombreDe(Enum<?> valor) {
        return valor == null ? null : valor.name();
    }

    private static String fecha(LocalDate fecha) {
        return fecha == null ? null : fecha.toString();
    }
}

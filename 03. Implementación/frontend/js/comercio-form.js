import { initGeografiaSelects, preseleccionarGeografia } from './geografia.js';
import { validarArchivoImagen } from './cloudinary.js';
import { abrirEditorRecorte } from './crop.js';
import {
  esEmailValido,
  esTelefonoValido,
  esCalleValida,
  esNumeroDireccionValido,
  esCodigoPostalValido,
  esTextoConContenidoValido,
  mostrarErrorCampo,
  limpiarErrorCampo,
  validarCamposSilencioso,
  esUrlRedSocialValida,
  normalizarUrlRedSocial,
  scrollAlPrimerError,
  esCuitValido,
  sanitizarCuit,
  esFechaNoFuturaValida,
  esFechaNacimientoValida,
  esFechaNacimientoNoAnteriorA120Anios,
  esNombreClienteValido,
  esDniClienteValido,
  colapsarEspacios,
  sanitizarDni,
} from './validators.js';

const ICONO_SALIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

export const LABELS_TIPO_SOCIEDAD = {
  SA: 'Sociedad Anónima (SA)',
  SRL: 'Sociedad de Responsabilidad Limitada (SRL)',
  SAS: 'Sociedad por Acciones Simplificada (SAS)',
  SC: 'Sociedad Colectiva (SC)',
  SCS: 'Sociedad en Comandita Simple (SCS)',
  SCRL: 'Sociedad Cooperativa de Responsabilidad Limitada (SCRL)',
  SCSA: 'Sociedad en Comandita por Acciones (SCSA)',
  SCCS: 'Otra forma societaria (SCCS)',
  CC: 'Cooperativa (CC)',
  CS: 'Otra forma societaria (CS)',
  CCSA: 'Otra forma societaria (CCSA)',
  CA: 'Otra forma societaria (CA)',
  SP: 'Otra forma societaria (SP)',
  ST: 'Otra forma societaria (ST)',
  ACP: 'Otra forma societaria (ACP)',
  EMP: 'Otra forma societaria (EMP)',
  EU: 'Empresa Unipersonal (EU)',
  UTE: 'Unión Transitoria de Empresas (UTE)',
};

export const LABELS_CONDICION_IVA = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  EXENTO: 'Exento',
  NO_INSCRIPTO: 'No Inscripto',
  MONOTRIBUTO: 'Monotributista',
  RESPONSABLE_NACIONAL: 'Responsable Nacional',
};

export const LABELS_TIPO_COMERCIO = {
  RESTAURANTE: 'Restaurante',
  EMPRENDIMIENTO: 'Emprendimiento',
  ROTISERIA: 'Rotisería',
  HELADERIA: 'Heladería',
  CAFETERIA: 'Cafetería',
  PANADERIA: 'Panadería',
  PIZZERIA: 'Pizzería',
  PARRILLA: 'Parrilla',
  BAR: 'Bar',
  KIOSCO: 'Kiosco',
  FOOD_TRUCK: 'Food truck',
  HAMBURGUESERIA: 'Hamburguesería',
  OTRO: 'Otro',
};

export const LABELS_TIPO_RED_SOCIAL = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  WHATSAPP: 'WhatsApp',
  X: 'X (Twitter)',
  SITIO_WEB: 'Sitio web',
  OTRO: 'Otro',
};

const LABELS_DIA_SEMANA = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miércoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sábado',
  DOMINGO: 'Domingo',
};

const ORDEN_DIAS_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

const LABELS_DIA_SEMANA_CORTO = {
  LUNES: 'L',
  MARTES: 'M',
  MIERCOLES: 'M',
  JUEVES: 'J',
  VIERNES: 'V',
  SABADO: 'S',
  DOMINGO: 'D',
};

export const CAMPOS_BACKEND_NEGOCIO = ['nombre', 'telefono', 'emailContacto', 'tipoComercio', 'aceptaDelivery', 'aceptaRetiro', 'fotoPerfilUrl'];

export const MAPA_ERRORES_NEGOCIO = {
  nombre: 'error-nombre',
  telefono: 'error-telefono',
  emailContacto: 'error-emailContacto',
  tipoComercio: 'error-tipoComercio',
  fotoPerfilUrl: 'error-foto-comercio',
  'direccion.calle': 'error-calle',
  'direccion.numero': 'error-numero',
  'direccion.pisoDepto': 'error-pisoDepto',
  'direccion.codigoPostal': 'error-codigoPostal',
  'direccion.localidadId': 'error-localidad',
};

export const CAMPOS_BACKEND_LEGALES = [
  'razonSocial', 'cuit', 'condicionIva', 'tipoSociedad', 'domicilioFiscal', 'fechaInicioActividades',
  'nombreRepresentante', 'apellidoRepresentante', 'dniRepresentante', 'telefonoRepresentante', 'fechaNacimientoRepresentante',
];

export const MAPA_ERRORES_LEGALES = {
  razonSocial: 'error-razonSocial',
  cuit: 'error-cuit',
  condicionIva: 'error-condicionIva',
  tipoSociedad: 'error-tipoSociedad',
  domicilioFiscal: 'error-domicilioFiscal',
  fechaInicioActividades: 'error-fechaInicioActividades',
  nombreRepresentante: 'error-nombreRepresentante',
  apellidoRepresentante: 'error-apellidoRepresentante',
  dniRepresentante: 'error-dniRepresentante',
  telefonoRepresentante: 'error-telefonoRepresentante',
  fechaNacimientoRepresentante: 'error-fechaNacimientoRepresentante',
};

export const MAPA_ERRORES_LEGALES_ANIDADOS = Object.fromEntries(
  Object.entries(MAPA_ERRORES_LEGALES).map(([campo, errorId]) => [`legales.${campo}`, errorId]),
);

export function esCampoBackendDeNegocio(campo) {
  return CAMPOS_BACKEND_NEGOCIO.includes(campo) || campo.startsWith('direccion.');
}

export function esCampoBackendDeHorarios(campo) {
  return campo.startsWith('horarios');
}

export function esCampoBackendDeRedesSociales(campo) {
  return campo.startsWith('redesSociales');
}

export function poblarSelect(select, labels, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  Object.entries(labels).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
}

function franjasSeSuperponen(aDesde, aHasta, bDesde, bHasta) {
  return aDesde < bHasta && bDesde < aHasta;
}

function mensajeConflictoHorario(conflicto) {
  return `Ya tenés un horario cargado el ${LABELS_DIA_SEMANA[conflicto.diaSemana]} de ${conflicto.horaApertura} a ${conflicto.horaCierre}, que se superpone con este.`;
}

export function validarCampo(inputId, errorId, validador, mensaje) {
  const input = document.getElementById(inputId);
  if (validador(input.value)) {
    limpiarErrorCampo(errorId);
    return true;
  }
  mostrarErrorCampo(errorId, mensaje);
  return false;
}

export function validarCampoRequeridoYValido(inputId, errorId, mensajeRequerido, validador, mensajeInvalido) {
  const input = document.getElementById(inputId);
  if (!input.value.trim()) {
    mostrarErrorCampo(errorId, mensajeRequerido);
    return false;
  }
  return validarCampo(inputId, errorId, validador, mensajeInvalido);
}

export function validarCampoOpcionalYValido(inputId, errorId, validador, mensajeInvalido) {
  const input = document.getElementById(inputId);
  if (!input.value.trim()) {
    limpiarErrorCampo(errorId);
    return true;
  }
  return validarCampo(inputId, errorId, validador, mensajeInvalido);
}

export function bindValidacionCampo(inputId, errorId, validador, mensaje) {
  const input = document.getElementById(inputId);
  input.addEventListener('blur', () => {
    if (input.value.trim()) {
      validarCampo(inputId, errorId, validador, mensaje);
    }
  });
  input.addEventListener('input', () => limpiarErrorCampo(errorId));
}

export function quitarPrefijoTelefono(telefono) {
  return String(telefono || '').replace(/^\+?549/, '').replace(/\D/g, '').slice(0, 10);
}

export function mostrarModalConfirmarSalida({ texto, textoSeguir, testidSeguir, onSalir }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-testid', 'modal-confirmar-salida');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet__icon">${ICONO_SALIR}</div>
      <h2 class="modal-sheet__title">¿Salir?</h2>
      <p class="modal-sheet__text"></p>
      <button class="btn btn-primary" type="button" id="seguir-btn" style="margin-bottom:12px;"></button>
      <button class="btn btn-tertiary" type="button" id="confirmar-salida-btn" data-testid="btn-confirmar-salida">Salir</button>
    </div>
  `;
  backdrop.querySelector('.modal-sheet__text').textContent = texto;
  const seguirBtn = backdrop.querySelector('#seguir-btn');
  seguirBtn.textContent = textoSeguir;
  seguirBtn.setAttribute('data-testid', testidSeguir);
  document.body.appendChild(backdrop);
  seguirBtn.addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('#confirmar-salida-btn').addEventListener('click', () => {
    backdrop.remove();
    onSalir();
  });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

export function initFotoComercio({ urlExistente = null } = {}) {
  let staged = null;
  const avatar = document.getElementById('foto-comercio-avatar');
  const input = document.getElementById('input-foto-comercio');

  function pintarFoto(src) {
    avatar.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    avatar.appendChild(img);
  }

  if (urlExistente) {
    pintarFoto(urlExistente);
  }

  avatar.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    if (!file) {
      return;
    }
    const errorValidacion = validarArchivoImagen(file);
    if (errorValidacion) {
      mostrarErrorCampo('error-foto-comercio', errorValidacion);
      return;
    }
    limpiarErrorCampo('error-foto-comercio');
    abrirEditorRecorte({
      origen: { file },
      aspectRatio: 1,
      onConfirmar: (blob) => {
        const archivoRecortado = new File([blob], file.name, { type: 'image/jpeg' });
        if (staged) {
          URL.revokeObjectURL(staged.previewUrl);
        }
        staged = { file: archivoRecortado, previewUrl: URL.createObjectURL(archivoRecortado) };
        pintarFoto(staged.previewUrl);
      },
    });
  });
  return {
    obtenerArchivo: () => (staged ? staged.file : null),
    tieneFoto: () => Boolean(staged) || Boolean(urlExistente),
  };
}

export function initCamposNegocio({ foto }) {
  poblarSelect(document.getElementById('tipoComercio'), LABELS_TIPO_COMERCIO, 'Seleccioná el tipo de comercio');
  document.getElementById('tipoComercio').addEventListener('change', () => limpiarErrorCampo('error-tipoComercio'));

  const switchDelivery = document.getElementById('switch-delivery');
  const switchRetiro = document.getElementById('switch-retiro');
  function bindSwitch(button) {
    button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!pressed));
      button.parentElement.setAttribute('aria-pressed', String(!pressed));
    });
  }
  bindSwitch(switchDelivery);
  bindSwitch(switchRetiro);

  const geografiaLista = initGeografiaSelects(document.getElementById('provincia'), document.getElementById('localidad'), 'Tierra del Fuego');

  bindValidacionCampo('nombre', 'error-nombre', esTextoConContenidoValido, 'Ingresá un nombre de comercio válido.');
  bindValidacionCampo('telefono', 'error-telefono', esTelefonoValido, 'Ingresá un número de teléfono válido (cod. área + número)');
  const telefonoInput = document.getElementById('telefono');
  telefonoInput.addEventListener('input', () => {
    telefonoInput.value = telefonoInput.value.replace(/\D/g, '').slice(0, 10);
  });
  bindValidacionCampo('emailContacto', 'error-emailContacto', esEmailValido, 'Ingresá un email de contacto con formato válido.');
  bindValidacionCampo('calle', 'error-calle', esCalleValida, 'La calle no puede contener solo caracteres especiales.');
  bindValidacionCampo('numero', 'error-numero', esNumeroDireccionValido, 'Solo se permiten números.');
  const numeroInput = document.getElementById('numero');
  numeroInput.addEventListener('input', () => {
    numeroInput.value = numeroInput.value.replace(/\D/g, '').slice(0, 10);
  });
  bindValidacionCampo('pisoDepto', 'error-pisoDepto', esTextoConContenidoValido, 'El piso/departamento no puede contener solo caracteres especiales');
  bindValidacionCampo('codigoPostal', 'error-codigoPostal', esCodigoPostalValido, 'Ingresá un código postal válido (4 dígitos o formato CPA).');
  document.getElementById('provincia').addEventListener('change', () => limpiarErrorCampo('error-provincia'));
  document.getElementById('localidad').addEventListener('change', () => limpiarErrorCampo('error-localidad'));

  function validar() {
    const camposValidos = [
      validarCampoRequeridoYValido('nombre', 'error-nombre', 'El nombre del comercio es obligatorio', esTextoConContenidoValido, 'Ingresá un nombre de comercio válido.'),
      validarCampoRequeridoYValido('telefono', 'error-telefono', 'El teléfono de contacto es obligatorio', esTelefonoValido, 'Ingresá un número de teléfono válido (cod. área + número)'),
      validarCampoRequeridoYValido('emailContacto', 'error-emailContacto', 'El email de contacto es obligatorio', esEmailValido, 'Ingresá un email de contacto con formato válido.'),
      validarCampoRequeridoYValido('calle', 'error-calle', 'La calle es obligatoria', esCalleValida, 'La calle no puede contener solo caracteres especiales.'),
      validarCampoRequeridoYValido('numero', 'error-numero', 'El número es obligatorio', esNumeroDireccionValido, 'Solo se permiten números.'),
      validarCampoOpcionalYValido('pisoDepto', 'error-pisoDepto', esTextoConContenidoValido, 'El piso/departamento no puede contener solo caracteres especiales'),
      validarCampoRequeridoYValido('codigoPostal', 'error-codigoPostal', 'El código postal es obligatorio', esCodigoPostalValido, 'Ingresá un código postal válido (4 dígitos o formato CPA).'),
      validarCamposSilencioso([
        { inputId: 'provincia', errorId: 'error-provincia', mensaje: 'Seleccioná una provincia.' },
        { inputId: 'localidad', errorId: 'error-localidad', mensaje: 'Seleccioná tu localidad.' },
        { inputId: 'tipoComercio', errorId: 'error-tipoComercio', mensaje: 'Seleccioná el tipo de comercio.' },
      ]),
    ].every(Boolean);
    if (!camposValidos) {
      scrollAlPrimerError();
      return false;
    }
    if (!foto.tieneFoto()) {
      mostrarErrorCampo('error-foto-comercio', 'Agregá una foto de perfil de tu comercio');
      scrollAlPrimerError();
      return false;
    }
    limpiarErrorCampo('error-foto-comercio');
    if (switchDelivery.getAttribute('aria-pressed') !== 'true' && switchRetiro.getAttribute('aria-pressed') !== 'true') {
      mostrarErrorCampo('error-modalidad', 'Debés ofrecer al menos una modalidad de entrega.');
      scrollAlPrimerError();
      return false;
    }
    limpiarErrorCampo('error-modalidad');
    return true;
  }

  function hayDatosCargados() {
    const ids = ['nombre', 'descripcion', 'telefono', 'emailContacto', 'calle', 'numero', 'pisoDepto', 'codigoPostal'];
    return ids.some((id) => document.getElementById(id).value.trim() !== '');
  }

  function leerPayloadNegocio(construirTelefono) {
    return {
      nombre: document.getElementById('nombre').value.trim(),
      descripcion: document.getElementById('descripcion').value.trim() || null,
      telefono: construirTelefono(document.getElementById('telefono').value.trim()),
      emailContacto: document.getElementById('emailContacto').value.trim(),
      tipoComercio: document.getElementById('tipoComercio').value,
      aceptaDelivery: switchDelivery.getAttribute('aria-pressed') === 'true',
      aceptaRetiro: switchRetiro.getAttribute('aria-pressed') === 'true',
      direccion: {
        calle: document.getElementById('calle').value.trim(),
        numero: document.getElementById('numero').value.trim(),
        pisoDepto: document.getElementById('pisoDepto').value.trim() || null,
        codigoPostal: document.getElementById('codigoPostal').value.trim(),
        localidadId: document.getElementById('localidad').value,
        principal: true,
      },
    };
  }

  function setSwitch(button, activo) {
    button.setAttribute('aria-pressed', String(Boolean(activo)));
    button.parentElement.setAttribute('aria-pressed', String(Boolean(activo)));
  }

  async function precargar(datos) {
    document.getElementById('nombre').value = datos.nombre || '';
    document.getElementById('tipoComercio').value = datos.tipoComercio || '';
    document.getElementById('descripcion').value = datos.descripcion || '';
    document.getElementById('telefono').value = quitarPrefijoTelefono(datos.telefono);
    document.getElementById('emailContacto').value = datos.emailContacto || '';
    setSwitch(switchDelivery, datos.aceptaDelivery);
    setSwitch(switchRetiro, datos.aceptaRetiro);
    const direccion = datos.direccion;
    document.getElementById('calle').value = direccion.calle || '';
    document.getElementById('numero').value = direccion.numero || '';
    document.getElementById('pisoDepto').value = direccion.pisoDepto || '';
    document.getElementById('codigoPostal').value = direccion.codigoPostal || '';
    await geografiaLista;
    await preseleccionarGeografia(
      document.getElementById('provincia'),
      document.getElementById('localidad'),
      direccion.provinciaId,
      direccion.localidadId,
    );
  }

  function snapshot() {
    return leerPayloadNegocio((digitos) => digitos);
  }

  return {
    validar,
    hayDatosCargados,
    leerPayloadNegocio,
    precargar,
    snapshot,
  };
}

export function initDatosLegales() {
  poblarSelect(document.getElementById('tipoSociedad'), LABELS_TIPO_SOCIEDAD, 'Seleccioná el tipo de sociedad');
  poblarSelect(document.getElementById('condicionIva'), LABELS_CONDICION_IVA, 'Seleccioná la condición ante el IVA');
  document.getElementById('tipoSociedad').addEventListener('change', () => limpiarErrorCampo('error-tipoSociedad'));
  document.getElementById('condicionIva').addEventListener('change', () => limpiarErrorCampo('error-condicionIva'));

  function validarFechaNacimientoRepresentante(requerido) {
    const inputId = 'fechaNacimientoRepresentante';
    const errorId = 'error-fechaNacimientoRepresentante';
    const input = document.getElementById(inputId);
    if (!input.value) {
      if (requerido) {
        mostrarErrorCampo(errorId, 'La fecha de nacimiento es obligatoria');
      }
      return !requerido;
    }
    if (!esFechaNoFuturaValida(input.value)) {
      mostrarErrorCampo(errorId, 'La fecha ingresada no es válida');
      return false;
    }
    if (!esFechaNacimientoNoAnteriorA120Anios(input.value)) {
      mostrarErrorCampo(errorId, 'La fecha ingresada no puede ser anterior a 120 años');
      return false;
    }
    if (!esFechaNacimientoValida(input.value)) {
      mostrarErrorCampo(errorId, 'Debe ser mayor de 18 años');
      return false;
    }
    limpiarErrorCampo(errorId);
    return true;
  }

  bindValidacionCampo('razonSocial', 'error-razonSocial', esTextoConContenidoValido, 'La razón social no puede contener solo caracteres especiales');
  const cuitInput = document.getElementById('cuit');
  cuitInput.addEventListener('input', () => {
    cuitInput.value = cuitInput.value.replace(/\D/g, '').slice(0, 11);
  });
  bindValidacionCampo('cuit', 'error-cuit', esCuitValido, 'El CUIT debe tener 11 dígitos numéricos');
  bindValidacionCampo('fechaInicioActividades', 'error-fechaInicioActividades', esFechaNoFuturaValida, 'La fecha ingresada no es válida');
  bindValidacionCampo('domicilioFiscal', 'error-domicilioFiscal', esTextoConContenidoValido, 'El domicilio fiscal no puede contener solo caracteres especiales');
  bindValidacionCampo('nombreRepresentante', 'error-nombreRepresentante', esNombreClienteValido, 'El nombre solo puede contener letras');
  bindValidacionCampo('apellidoRepresentante', 'error-apellidoRepresentante', esNombreClienteValido, 'El apellido solo puede contener letras');
  const dniRepresentanteInput = document.getElementById('dniRepresentante');
  dniRepresentanteInput.addEventListener('input', () => {
    dniRepresentanteInput.value = dniRepresentanteInput.value.replace(/\D/g, '').slice(0, 8);
  });
  bindValidacionCampo('dniRepresentante', 'error-dniRepresentante', esDniClienteValido, 'El DNI debe tener un formato válido');
  const fechaNacimientoRepresentanteInput = document.getElementById('fechaNacimientoRepresentante');
  fechaNacimientoRepresentanteInput.addEventListener('blur', () => {
    if (fechaNacimientoRepresentanteInput.value) {
      validarFechaNacimientoRepresentante(false);
    }
  });
  fechaNacimientoRepresentanteInput.addEventListener('input', () => limpiarErrorCampo('error-fechaNacimientoRepresentante'));
  const telefonoRepresentanteInput = document.getElementById('telefonoRepresentante');
  telefonoRepresentanteInput.addEventListener('input', () => {
    telefonoRepresentanteInput.value = telefonoRepresentanteInput.value.replace(/\D/g, '').slice(0, 10);
  });
  bindValidacionCampo('telefonoRepresentante', 'error-telefonoRepresentante', esTelefonoValido, 'Ingresá un número de teléfono válido (cod. área + número)');

  function validar() {
    return [
      validarCampoRequeridoYValido('razonSocial', 'error-razonSocial', 'La razón social es obligatoria', esTextoConContenidoValido, 'La razón social no puede contener solo caracteres especiales'),
      validarCampoRequeridoYValido('cuit', 'error-cuit', 'El CUIT es obligatorio', esCuitValido, 'El CUIT debe tener 11 dígitos numéricos'),
      validarCampoRequeridoYValido('fechaInicioActividades', 'error-fechaInicioActividades', 'La fecha de inicio de actividades es obligatoria', esFechaNoFuturaValida, 'La fecha ingresada no es válida'),
      validarCamposSilencioso([
        { inputId: 'tipoSociedad', errorId: 'error-tipoSociedad', mensaje: 'Seleccioná el tipo de sociedad.' },
        { inputId: 'condicionIva', errorId: 'error-condicionIva', mensaje: 'Seleccioná la condición ante el IVA.' },
      ]),
      validarCampoRequeridoYValido('domicilioFiscal', 'error-domicilioFiscal', 'El domicilio fiscal es obligatorio', esTextoConContenidoValido, 'El domicilio fiscal no puede contener solo caracteres especiales'),
      validarCampoRequeridoYValido('nombreRepresentante', 'error-nombreRepresentante', 'El nombre es obligatorio', esNombreClienteValido, 'El nombre solo puede contener letras'),
      validarCampoRequeridoYValido('apellidoRepresentante', 'error-apellidoRepresentante', 'El apellido es obligatorio', esNombreClienteValido, 'El apellido solo puede contener letras'),
      validarCampoRequeridoYValido('dniRepresentante', 'error-dniRepresentante', 'El DNI es obligatorio', esDniClienteValido, 'El DNI debe tener un formato válido'),
      validarFechaNacimientoRepresentante(true),
      validarCampoRequeridoYValido('telefonoRepresentante', 'error-telefonoRepresentante', 'El teléfono es obligatorio', esTelefonoValido, 'Ingresá un número de teléfono válido (cod. área + número)'),
    ].every(Boolean);
  }

  function leerPayload(construirTelefono) {
    return {
      razonSocial: document.getElementById('razonSocial').value.trim(),
      cuit: sanitizarCuit(document.getElementById('cuit').value),
      condicionIva: document.getElementById('condicionIva').value,
      tipoSociedad: document.getElementById('tipoSociedad').value,
      domicilioFiscal: document.getElementById('domicilioFiscal').value.trim(),
      fechaInicioActividades: document.getElementById('fechaInicioActividades').value,
      nombreRepresentante: colapsarEspacios(document.getElementById('nombreRepresentante').value),
      apellidoRepresentante: colapsarEspacios(document.getElementById('apellidoRepresentante').value),
      dniRepresentante: sanitizarDni(document.getElementById('dniRepresentante').value),
      telefonoRepresentante: construirTelefono(document.getElementById('telefonoRepresentante').value.trim()),
      fechaNacimientoRepresentante: document.getElementById('fechaNacimientoRepresentante').value,
    };
  }

  function precargar(legales) {
    const representante = legales.representante || {};
    document.getElementById('razonSocial').value = legales.razonSocial || '';
    document.getElementById('cuit').value = legales.cuit || '';
    document.getElementById('fechaInicioActividades').value = legales.fechaInicioActividades || '';
    document.getElementById('tipoSociedad').value = legales.tipoSociedad || '';
    document.getElementById('condicionIva').value = legales.condicionIva || '';
    document.getElementById('domicilioFiscal').value = legales.domicilioFiscal || '';
    document.getElementById('nombreRepresentante').value = representante.nombre || '';
    document.getElementById('apellidoRepresentante').value = representante.apellido || '';
    document.getElementById('dniRepresentante').value = representante.dni || '';
    document.getElementById('telefonoRepresentante').value = quitarPrefijoTelefono(representante.telefono);
    document.getElementById('fechaNacimientoRepresentante').value = representante.fechaNacimiento || '';
  }

  function snapshot() {
    return leerPayload((digitos) => digitos);
  }

  return { validar, leerPayload, precargar, snapshot };
}

export function initHorarios({ mostrarError }) {
  const horarioList = document.getElementById('horario-list');
  const tabHorarioFijo = document.getElementById('tab-horario-fijo');
  const tabHorarioPersonalizado = document.getElementById('tab-horario-personalizado');
  const panelHorarioFijo = document.getElementById('panel-horario-fijo');
  const panelHorarioPersonalizado = document.getElementById('panel-horario-personalizado');

  function mostrarTabHorario(tab) {
    const esFijo = tab === 'fijo';
    tabHorarioFijo.setAttribute('aria-selected', String(esFijo));
    tabHorarioPersonalizado.setAttribute('aria-selected', String(!esFijo));
    panelHorarioFijo.classList.toggle('is-hidden', !esFijo);
    panelHorarioPersonalizado.classList.toggle('is-hidden', esFijo);
  }
  tabHorarioFijo.addEventListener('click', () => mostrarTabHorario('fijo'));
  tabHorarioPersonalizado.addEventListener('click', () => mostrarTabHorario('personalizado'));

  function todasLasFilasHorario() {
    return Array.from(horarioList.querySelectorAll('[data-horario-row]'));
  }

  function leerFilaHorario(fila) {
    return {
      diaSemana: fila.querySelector('.horario-dia').value,
      horaApertura: fila.querySelector('.horario-apertura').value,
      horaCierre: fila.querySelector('.horario-cierre').value,
    };
  }

  function recolectar() {
    return todasLasFilasHorario().map(leerFilaHorario);
  }

  function buscarConflictoEntreFilas(filaActual) {
    const actual = leerFilaHorario(filaActual);
    for (const otraFila of todasLasFilasHorario()) {
      if (otraFila === filaActual) continue;
      const otra = leerFilaHorario(otraFila);
      if (!otra.diaSemana || !otra.horaApertura || !otra.horaCierre) continue;
      if (otra.diaSemana !== actual.diaSemana) continue;
      if (franjasSeSuperponen(actual.horaApertura, actual.horaCierre, otra.horaApertura, otra.horaCierre)) {
        return otra;
      }
    }
    return null;
  }

  function validarFilaHorario(fila) {
    const shellApertura = fila.querySelector('.horario-apertura').closest('.input-shell');
    const shellCierre = fila.querySelector('.horario-cierre').closest('.input-shell');
    shellApertura.classList.remove('input-shell--error');
    shellCierre.classList.remove('input-shell--error');
    const datos = leerFilaHorario(fila);
    if (!datos.diaSemana || !datos.horaApertura || !datos.horaCierre) {
      limpiarErrorCampo('error-horarios');
      return true;
    }
    if (datos.horaCierre <= datos.horaApertura) {
      shellApertura.classList.add('input-shell--error');
      shellCierre.classList.add('input-shell--error');
      mostrarErrorCampo('error-horarios', 'El horario de cierre tiene que ser posterior al de apertura.');
      return false;
    }
    const conflicto = buscarConflictoEntreFilas(fila);
    if (conflicto) {
      shellApertura.classList.add('input-shell--error');
      shellCierre.classList.add('input-shell--error');
      mostrarErrorCampo('error-horarios', mensajeConflictoHorario(conflicto));
      return false;
    }
    limpiarErrorCampo('error-horarios');
    return true;
  }

  function renderResumenFijo() {
    const contenedor = document.getElementById('horario-resumen-fijo');
    const vacioEl = document.getElementById('horario-resumen-vacio');
    const filas = todasLasFilasHorario()
      .map((fila) => ({ fila, datos: leerFilaHorario(fila) }))
      .filter(({ datos }) => datos.diaSemana && datos.horaApertura && datos.horaCierre)
      .sort((a, b) => {
        const diaComp = ORDEN_DIAS_SEMANA.indexOf(a.datos.diaSemana) - ORDEN_DIAS_SEMANA.indexOf(b.datos.diaSemana);
        return diaComp !== 0 ? diaComp : a.datos.horaApertura.localeCompare(b.datos.horaApertura);
      });
    contenedor.innerHTML = '';
    vacioEl.classList.toggle('is-hidden', filas.length > 0);
    filas.forEach(({ fila, datos }) => {
      const row = document.createElement('div');
      row.className = 'schedule-summary-row';
      row.setAttribute('data-testid', 'fila-resumen-horario');
      const texto = document.createElement('span');
      texto.className = 'schedule-summary-row__text';
      texto.textContent = `${LABELS_DIA_SEMANA[datos.diaSemana]}: ${datos.horaApertura} a ${datos.horaCierre}`;
      const acciones = document.createElement('div');
      acciones.className = 'schedule-summary-row__actions';
      const btnEditar = document.createElement('button');
      btnEditar.type = 'button';
      btnEditar.setAttribute('aria-label', 'Editar franja');
      btnEditar.setAttribute('data-testid', 'btn-editar-resumen-horario');
      btnEditar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
      btnEditar.addEventListener('click', () => {
        mostrarTabHorario('personalizado');
        fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
        fila.querySelector('.horario-dia').focus();
      });
      const btnEliminar = document.createElement('button');
      btnEliminar.type = 'button';
      btnEliminar.setAttribute('aria-label', 'Eliminar franja');
      btnEliminar.setAttribute('data-testid', 'btn-eliminar-resumen-horario');
      btnEliminar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      btnEliminar.addEventListener('click', () => {
        fila.remove();
        limpiarErrorCampo('error-horarios');
        renderResumenFijo();
      });
      acciones.appendChild(btnEditar);
      acciones.appendChild(btnEliminar);
      row.appendChild(texto);
      row.appendChild(acciones);
      contenedor.appendChild(row);
    });
  }

  function crearFilaHorario() {
    const row = document.createElement('div');
    row.className = 'schedule-row';
    row.dataset.horarioRow = 'true';
    row.setAttribute('data-testid', 'fila-horario');
    row.innerHTML = `
      <div class="select-shell">
        <select class="horario-dia" required data-testid="select-dia-horario"></select>
        <svg class="select-shell__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="schedule-row__horas">
        <div class="input-shell">
          <input type="time" class="horario-apertura" required data-testid="input-apertura-horario" />
        </div>
        <span class="schedule-row__separador">a</span>
        <div class="input-shell">
          <input type="time" class="horario-cierre" required data-testid="input-cierre-horario" />
        </div>
        <button type="button" class="schedule-chip__remove" aria-label="Quitar franja" style="border:none;background:transparent;color:var(--color-text-muted);cursor:pointer;width:44px;height:48px;flex-shrink:0;" data-testid="btn-eliminar-horario">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
    poblarSelect(row.querySelector('.horario-dia'), LABELS_DIA_SEMANA, 'Día');
    row.querySelector('.schedule-chip__remove').addEventListener('click', () => {
      row.remove();
      limpiarErrorCampo('error-horarios');
      renderResumenFijo();
    });
    ['horario-dia', 'horario-apertura', 'horario-cierre'].forEach((clase) => {
      row.querySelector(`.${clase}`).addEventListener('change', () => {
        validarFilaHorario(row);
        renderResumenFijo();
      });
    });
    return row;
  }

  document.getElementById('agregar-horario-btn').addEventListener('click', () => {
    horarioList.appendChild(crearFilaHorario());
  });

  const diaChipRow = document.getElementById('dia-chip-row');
  const diasSeleccionadosFranjaRapida = new Set();
  ORDEN_DIAS_SEMANA.forEach((dia) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = LABELS_DIA_SEMANA_CORTO[dia];
    chip.setAttribute('aria-pressed', 'false');
    chip.setAttribute('aria-label', LABELS_DIA_SEMANA[dia]);
    chip.setAttribute('data-testid', `chip-dia-franja-rapida-${dia}`);
    chip.addEventListener('click', () => {
      const activo = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', String(!activo));
      if (activo) {
        diasSeleccionadosFranjaRapida.delete(dia);
      } else {
        diasSeleccionadosFranjaRapida.add(dia);
      }
    });
    diaChipRow.appendChild(chip);
  });

  const franjaRapidaDesde = document.getElementById('franja-rapida-desde');
  const franjaRapidaHasta = document.getElementById('franja-rapida-hasta');

  document.getElementById('aplicar-franja-rapida-btn').addEventListener('click', () => {
    limpiarErrorCampo('error-franja-rapida');
    if (diasSeleccionadosFranjaRapida.size === 0) {
      mostrarErrorCampo('error-franja-rapida', 'Tildá al menos un día para aplicar la franja.');
      return;
    }
    if (!franjaRapidaDesde.value || !franjaRapidaHasta.value) {
      mostrarErrorCampo('error-franja-rapida', 'Completá el horario Desde y Hasta.');
      return;
    }
    if (franjaRapidaHasta.value <= franjaRapidaDesde.value) {
      mostrarErrorCampo('error-franja-rapida', 'El horario de cierre tiene que ser posterior al de apertura.');
      return;
    }
    const horariosActuales = recolectar();
    for (const dia of diasSeleccionadosFranjaRapida) {
      const conflicto = horariosActuales.find((h) => h.diaSemana === dia && h.horaApertura && h.horaCierre
        && franjasSeSuperponen(franjaRapidaDesde.value, franjaRapidaHasta.value, h.horaApertura, h.horaCierre));
      if (conflicto) {
        mostrarErrorCampo('error-franja-rapida', mensajeConflictoHorario(conflicto));
        return;
      }
    }
    ORDEN_DIAS_SEMANA.forEach((dia) => {
      if (!diasSeleccionadosFranjaRapida.has(dia)) return;
      const fila = crearFilaHorario();
      fila.querySelector('.horario-dia').value = dia;
      fila.querySelector('.horario-apertura').value = franjaRapidaDesde.value;
      fila.querySelector('.horario-cierre').value = franjaRapidaHasta.value;
      horarioList.appendChild(fila);
    });
    diaChipRow.querySelectorAll('.chip').forEach((chip) => chip.setAttribute('aria-pressed', 'false'));
    diasSeleccionadosFranjaRapida.clear();
    limpiarErrorCampo('error-horarios');
    renderResumenFijo();
  });

  renderResumenFijo();

  function validar() {
    limpiarErrorCampo('error-horarios');
    const horarios = recolectar();
    const parcial = horarios.find((h) => (h.diaSemana || h.horaApertura || h.horaCierre)
      && !(h.diaSemana && h.horaApertura && h.horaCierre));
    if (parcial) {
      mostrarError('Completá el día y el horario de todas las franjas cargadas.');
      return false;
    }
    const completos = horarios.filter((h) => h.diaSemana && h.horaApertura && h.horaCierre);
    if (completos.length === 0) {
      mostrarError('Cargá al menos una franja horaria de atención.');
      return false;
    }
    for (const horario of completos) {
      if (horario.horaCierre <= horario.horaApertura) {
        mostrarError('El horario de cierre tiene que ser posterior al de apertura en cada franja.');
        return false;
      }
    }
    for (let i = 0; i < completos.length; i++) {
      for (let j = i + 1; j < completos.length; j++) {
        if (completos[i].diaSemana !== completos[j].diaSemana) continue;
        if (franjasSeSuperponen(completos[i].horaApertura, completos[i].horaCierre, completos[j].horaApertura, completos[j].horaCierre)) {
          mostrarError(mensajeConflictoHorario(completos[j]));
          return false;
        }
      }
    }
    return true;
  }

  function precargar(franjas) {
    horarioList.innerHTML = '';
    franjas.forEach((franja) => {
      const fila = crearFilaHorario();
      fila.querySelector('.horario-dia').value = franja.diaSemana;
      fila.querySelector('.horario-apertura').value = String(franja.horaApertura).slice(0, 5);
      fila.querySelector('.horario-cierre').value = String(franja.horaCierre).slice(0, 5);
      horarioList.appendChild(fila);
    });
    limpiarErrorCampo('error-horarios');
    renderResumenFijo();
  }

  return { recolectar, validar, precargar };
}

export function initRedesSociales({ mostrarError }) {
  const MAX_REDES_SOCIALES = 5;
  const redSocialList = document.getElementById('red-social-list');
  const agregarRedSocialBtn = document.getElementById('agregar-red-social-btn');
  const redSocialMaxHint = document.getElementById('red-social-max-hint');

  function actualizarLimiteRedesSociales() {
    const alcanzoMaximo = redSocialList.querySelectorAll('[data-red-social-row]').length >= MAX_REDES_SOCIALES;
    agregarRedSocialBtn.classList.toggle('is-hidden', alcanzoMaximo);
    redSocialMaxHint.classList.toggle('is-hidden', !alcanzoMaximo);
  }

  function crearFilaRedSocial() {
    const row = document.createElement('div');
    row.className = 'schedule-row';
    row.dataset.redSocialRow = 'true';
    row.setAttribute('data-testid', 'fila-red-social');
    row.innerHTML = `
      <div class="select-shell" style="flex:1;">
        <select class="red-social-tipo" required data-testid="select-tipo-red-social"></select>
        <svg class="select-shell__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="input-shell" style="flex:1;">
        <input type="text" class="red-social-url" placeholder="Pegá el link" required data-testid="input-url-red-social" />
      </div>
      <button type="button" class="schedule-chip__remove" aria-label="Quitar red social" style="border:none;background:transparent;color:var(--color-text-muted);cursor:pointer;width:32px;height:48px;flex-shrink:0;" data-testid="btn-eliminar-red-social">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    poblarSelect(row.querySelector('.red-social-tipo'), LABELS_TIPO_RED_SOCIAL, 'Elegir');
    row.querySelector('.schedule-chip__remove').addEventListener('click', () => {
      const list = row.parentElement;
      if (list.querySelectorAll('[data-red-social-row]').length > 1) {
        row.remove();
        actualizarLimiteRedesSociales();
      }
    });
    return row;
  }

  redSocialList.appendChild(crearFilaRedSocial());
  actualizarLimiteRedesSociales();
  agregarRedSocialBtn.addEventListener('click', () => {
    if (redSocialList.querySelectorAll('[data-red-social-row]').length >= MAX_REDES_SOCIALES) {
      return;
    }
    redSocialList.appendChild(crearFilaRedSocial());
    actualizarLimiteRedesSociales();
  });

  function recolectar() {
    const filas = Array.from(redSocialList.querySelectorAll('[data-red-social-row]'));
    return filas.map((fila) => ({
      tipo: fila.querySelector('.red-social-tipo').value,
      url: normalizarUrlRedSocial(fila.querySelector('.red-social-url').value),
    }));
  }

  function validarYRecolectar() {
    const redesSociales = recolectar().filter((r) => r.tipo || r.url);
    if (redesSociales.length === 0) {
      mostrarError('Cargá al menos una red social.');
      return null;
    }
    const tiposVistos = new Set();
    for (const redSocial of redesSociales) {
      if (!redSocial.tipo) {
        mostrarError('Seleccioná el tipo de cada red social cargada.');
        return null;
      }
      if (!redSocial.url) {
        mostrarError('El link es obligatorio en cada red social cargada.');
        return null;
      }
      if (!esUrlRedSocialValida(redSocial.url)) {
        mostrarError('Ingresá un link válido para cada red social cargada.');
        return null;
      }
      if (tiposVistos.has(redSocial.tipo)) {
        mostrarError('No podés cargar dos redes sociales del mismo tipo. Eliminá la que se repite.');
        return null;
      }
      tiposVistos.add(redSocial.tipo);
    }
    return redesSociales;
  }

  function precargar(redes) {
    redSocialList.innerHTML = '';
    redes.forEach((red) => {
      const fila = crearFilaRedSocial();
      fila.querySelector('.red-social-tipo').value = red.tipo;
      fila.querySelector('.red-social-url').value = red.url;
      redSocialList.appendChild(fila);
    });
    if (redes.length === 0) {
      redSocialList.appendChild(crearFilaRedSocial());
    }
    actualizarLimiteRedesSociales();
  }

  return { recolectar, validarYRecolectar, precargar };
}

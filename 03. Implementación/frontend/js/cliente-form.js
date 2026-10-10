import { ApiError } from './api.js';
import { initGeografiaSelects } from './geografia.js';
import { validarArchivoImagen, subirFotoPerfilRegistroCliente, CloudinaryUploadError } from './cloudinary.js';
import { abrirEditorRecorte } from './crop.js';
import { validarCampoRequeridoYValido, validarCampoOpcionalYValido, bindValidacionCampo } from './comercio-form.js';
import { h, crearSvg, renderBannerTexto, bindPasswordToggle, setLoading, construirTelefono, bindNombreUsuario, crearPasos, MENSAJE_NOMBRE_USUARIO_EN_USO } from './form-utils.js';
import {
  esPasswordSegura,
  aplicarFortalezaPassword,
  esEmailValido,
  esTelefonoValido,
  esCalleValida,
  esNumeroDireccionValido,
  esCodigoPostalValido,
  normalizarCodigoPostal,
  esTextoConContenidoValido,
  mostrarErrorCampo,
  limpiarErrorCampo,
  mapearErroresBackend,
  validarCamposSilencioso,
  scrollAlPrimerError,
  esNombreClienteValido,
  esDniClienteValido,
  esFechaNacimientoClientePlausible,
  cumpleEdadMinima,
  fechaNacimientoCompleta,
  colapsarEspacios,
  sanitizarDni,
} from './validators.js';

const EDAD_MINIMA_POR_DEFECTO = 14;
const MENSAJE_FECHA_NO_VALIDA = 'La fecha ingresada no es válida';

const CAMPOS_STEP1_BACKEND = ['nombre', 'apellido', 'dni', 'fechaNacimiento', 'telefono', 'nombreUsuario', 'email', 'password', 'aceptaTerminos'];

const CAMPOS_SIN_PREFIJO = ['email', 'aceptaTerminos'];

const MAPA_ERRORES_REGISTRO_CLIENTE = {
  nombre: 'error-nombre',
  apellido: 'error-apellido',
  dni: 'error-dni',
  fechaNacimiento: 'error-fechaNacimiento',
  telefono: 'error-telefono',
  nombreUsuario: 'error-nombreUsuario',
  email: 'error-email',
  password: 'error-password',
  aceptaTerminos: 'error-terminos',
  'direccion.calle': 'error-calle',
  'direccion.numero': 'error-numero',
  'direccion.pisoDepto': 'error-pisoDepto',
  'direccion.codigoPostal': 'error-codigoPostal',
  'direccion.localidadId': 'error-localidad',
};

const FIGURAS_USUARIO = [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: '12', cy: '7', r: '4' }]];
const FIGURAS_DNI = [['rect', { x: '2', y: '5', width: '20', height: '14', rx: '2' }], ['line', { x1: '6', y1: '15', x2: '10', y2: '15' }], ['circle', { cx: '15', cy: '12', r: '2' }]];
const FIGURAS_CALENDARIO = [['rect', { x: '3', y: '4', width: '18', height: '18', rx: '2' }], ['line', { x1: '16', y1: '2', x2: '16', y2: '6' }], ['line', { x1: '8', y1: '2', x2: '8', y2: '6' }], ['line', { x1: '3', y1: '10', x2: '21', y2: '10' }]];
const FIGURAS_EMAIL = [['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }], ['path', { d: 'm22 6-10 7L2 6' }]];
const FIGURAS_CANDADO = [['rect', { x: '3', y: '11', width: '18', height: '11', rx: '2' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]];
const FIGURAS_OJO = [['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z' }], ['circle', { cx: '12', cy: '12', r: '3' }]];
const FIGURAS_FLECHA = [['line', { x1: '5', y1: '12', x2: '19', y2: '12' }], ['polyline', { points: '12 5 19 12 12 19' }]];
const FIGURAS_UBICACION = [['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }], ['circle', { cx: '12', cy: '10', r: '3' }]];
const FIGURAS_CHEVRON = [['polyline', { points: '6 9 12 15 18 9' }]];

function iconoDeCampo(figuras) {
  return h('span', { class: 'input-shell__icon' }, [crearSvg(figuras)]);
}

function mensajeError(id, testid) {
  return h('div', { class: 'field__error', id, style: 'display:none;', 'data-testid': testid });
}

function campo(etiqueta, inputId, shellHijos, errorId, errorTestid, extras = []) {
  return h('div', { class: 'field' }, [
    h('label', { class: 'field__label', for: inputId }, [etiqueta]),
    h('div', { class: 'input-shell' }, shellHijos),
    ...extras,
    mensajeError(errorId, errorTestid),
  ]);
}

function selectCampo(etiqueta, selectId, testid, errorId, errorTestid) {
  return h('div', { class: 'field' }, [
    h('label', { class: 'field__label', for: selectId }, [etiqueta]),
    h('div', { class: 'select-shell' }, [
      h('select', { id: selectId, required: true, 'data-testid': testid }),
      crearSvg(FIGURAS_CHEVRON, { class: 'select-shell__chevron' }),
    ]),
    mensajeError(errorId, errorTestid),
  ]);
}

function botonToggle(id, testid) {
  return h('button', { type: 'button', class: 'input-shell__toggle', id, 'aria-label': 'Mostrar contraseña', 'data-testid': testid }, [crearSvg(FIGURAS_OJO)]);
}

function construirProgreso() {
  return h('div', { id: 'step-progress-container', class: 'step-progress' }, [
    h('div', { class: 'step-progress__bars' }, [
      h('div', { class: 'step-progress__bar step-progress__bar--active' }),
      h('div', { class: 'step-progress__bar' }),
    ]),
    h('div', { class: 'step-progress__labels' }, [
      h('span', { class: 'is-active' }, ['1. Datos personales']),
      h('span', {}, ['2. Dirección']),
    ]),
  ]);
}

function construirPaso1({ incluirEmail, mostrarEnlaceLogin }) {
  const fotoAvatar = h(
    'button',
    {
      type: 'button',
      class: 'profile-header__avatar',
      id: 'foto-cliente-avatar',
      style: 'margin:0 auto 10px;border:none;padding:0;cursor:pointer;',
      'data-testid': 'btn-agregar-foto-cliente',
    },
    [crearSvg(FIGURAS_USUARIO, { style: 'width:32px;height:32px;' })],
  );

  const campos = [
    h('div', { class: 'field', style: 'text-align:center;' }, [
      h('label', { class: 'field__label' }, ['Agregá una foto de perfil']),
      h('span', { class: 'field__label-badge field__label-badge--opcional', style: 'align-self:center;margin-bottom:10px;' }, ['Opcional']),
      fotoAvatar,
      h('input', { type: 'file', id: 'input-foto-cliente', accept: 'image/jpeg,image/png,image/webp', class: 'is-hidden', 'data-testid': 'input-foto-cliente' }),
      mensajeError('error-foto-cliente', 'mensaje-error-foto-cliente'),
    ]),
    h('div', { class: 'form-row' }, [
      campo('Nombre', 'nombre', [h('input', { type: 'text', id: 'nombre', placeholder: 'Nombre', required: true, maxlength: '100', 'data-testid': 'input-nombre' })], 'error-nombre', 'mensaje-error-nombre'),
      campo('Apellido', 'apellido', [h('input', { type: 'text', id: 'apellido', placeholder: 'Apellido', required: true, maxlength: '100', 'data-testid': 'input-apellido' })], 'error-apellido', 'mensaje-error-apellido'),
    ]),
    campo('Documento (DNI)', 'dni', [iconoDeCampo(FIGURAS_DNI), h('input', { type: 'text', id: 'dni', inputmode: 'numeric', placeholder: '12345678', maxlength: '8', required: true, 'data-testid': 'input-dni' })], 'error-dni', 'mensaje-error-dni'),
    campo('Fecha de nacimiento', 'fechaNacimiento', [iconoDeCampo(FIGURAS_CALENDARIO), h('input', { type: 'date', id: 'fechaNacimiento', required: true, 'data-testid': 'input-fecha-nacimiento' })], 'error-fechaNacimiento', 'mensaje-error-fecha-nacimiento'),
    campo('Teléfono (WhatsApp)', 'telefono', [h('span', { class: 'input-prefix' }, ['+54 9']), h('input', { type: 'tel', id: 'telefono', inputmode: 'numeric', placeholder: '2964 000000', required: true, 'data-testid': 'input-telefono' })], 'error-telefono', 'mensaje-error-telefono'),
  ];

  if (incluirEmail) {
    campos.push(campo('Email', 'email', [iconoDeCampo(FIGURAS_EMAIL), h('input', { type: 'email', id: 'email', placeholder: 'tu@email.com', autocomplete: 'email', required: true, maxlength: '254', 'data-testid': 'input-email' })], 'error-email', 'mensaje-error-email'));
  }

  campos.push(
    campo(
      'Nombre de usuario',
      'nombreUsuario',
      [
        iconoDeCampo(FIGURAS_USUARIO),
        h('input', { type: 'text', id: 'nombreUsuario', placeholder: 'Elegí tu nombre de usuario', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, maxlength: '20', 'data-testid': 'input-nombre-usuario' }),
        h('span', { class: 'input-shell__status-icon', id: 'icono-nombreUsuario', style: 'display:none;', 'data-testid': 'icono-estado-nombre-usuario' }),
      ],
      'error-nombreUsuario',
      'mensaje-error-nombre-usuario',
      [
        h('p', { class: 'field__hint' }, ['Entre 8 y 20 caracteres, solo letras y números.']),
        h('div', { class: 'field__status', id: 'estado-nombreUsuario', style: 'display:none;', 'data-testid': 'estado-nombre-usuario' }),
      ],
    ),
    campo(
      'Contraseña',
      'password',
      [
        iconoDeCampo(FIGURAS_CANDADO),
        h('input', { type: 'password', id: 'password', placeholder: 'Mínimo 8 caracteres', autocomplete: 'new-password', required: true, minlength: '8', maxlength: '72', 'data-testid': 'input-password' }),
        botonToggle('toggle-password', 'btn-mostrar-password'),
      ],
      'error-password',
      'mensaje-error-password',
      [
        h('p', { class: 'field__hint' }, ['La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.']),
        h('div', { class: 'strength-meter', id: 'strength-bars', 'data-testid': 'indicador-fortaleza-password' }, [
          h('div', { class: 'strength-meter__bars' }, [
            h('div', { class: 'strength-meter__bar' }),
            h('div', { class: 'strength-meter__bar' }),
            h('div', { class: 'strength-meter__bar' }),
            h('div', { class: 'strength-meter__bar' }),
          ]),
          h('span', { class: 'strength-meter__label', id: 'strength-label' }, ['Seguridad']),
        ]),
      ],
    ),
    campo(
      'Confirmá tu contraseña',
      'confirmarPassword',
      [
        iconoDeCampo(FIGURAS_CANDADO),
        h('input', { type: 'password', id: 'confirmarPassword', placeholder: 'Repetí tu contraseña', autocomplete: 'new-password', required: true, 'data-testid': 'input-confirmar-password' }),
        botonToggle('toggle-confirmar', 'btn-mostrar-confirmar-password'),
      ],
      'error-confirmarPassword',
      'mensaje-error-confirmar-password',
    ),
    h('div', { class: 'checkbox-row' }, [
      h('input', { type: 'checkbox', id: 'aceptaTerminos', 'data-testid': 'input-acepta-terminos' }),
      h('label', { for: 'aceptaTerminos' }, ['Acepto los ', h('span', { class: 'link' }, ['Términos y Condiciones']), ' y la ', h('span', { class: 'link' }, ['Política de Privacidad'])]),
    ]),
    mensajeError('error-terminos', 'mensaje-error-terminos'),
  );

  const hijos = [
    h('h1', { class: 'title-md' }, ['Tus datos personales']),
    h('p', { class: 'subtitle', style: 'margin-bottom:20px;' }, ['Completá la información para crear tu cuenta.']),
    h('form', { class: 'form', id: 'form-step-1', novalidate: true }, campos),
    h('button', { class: 'btn btn-primary', type: 'button', id: 'continuar-btn', style: 'margin-top:24px;', 'data-testid': 'btn-continuar' }, ['Continuar', crearSvg(FIGURAS_FLECHA)]),
  ];
  if (mostrarEnlaceLogin) {
    hijos.push(h('p', { class: 'form-footer-link' }, ['¿Ya tenés cuenta? ', h('a', { class: 'link', href: 'login.html' }, ['Iniciá sesión'])]));
  }
  return h('section', { id: 'step-1' }, hijos);
}

function construirPaso2({ textoBotonFinal }) {
  return h('section', { id: 'step-2', class: 'is-hidden' }, [
    h('h1', { class: 'title-md' }, ['Tu dirección de entrega']),
    h('p', { class: 'subtitle', style: 'margin-bottom:20px;' }, ['Esta será tu dirección principal para recibir pedidos.']),
    h('form', { class: 'form', id: 'form-step-2', novalidate: true }, [
      campo('Calle', 'calle', [iconoDeCampo(FIGURAS_UBICACION), h('input', { type: 'text', id: 'calle', placeholder: 'Nombre de la calle', required: true, 'data-testid': 'input-calle' })], 'error-calle', 'mensaje-error-calle'),
      h('div', { class: 'form-row' }, [
        campo('Número', 'numero', [h('input', { type: 'text', id: 'numero', inputmode: 'numeric', placeholder: '1234', required: true, 'data-testid': 'input-numero' })], 'error-numero', 'mensaje-error-numero'),
        campo('Piso / Dpto', 'pisoDepto', [h('input', { type: 'text', id: 'pisoDepto', placeholder: 'Opcional', 'data-testid': 'input-piso-depto' })], 'error-pisoDepto', 'mensaje-error-piso-depto'),
      ]),
      campo('Código Postal', 'codigoPostal', [h('span', { class: 'input-shell__icon' }, ['#']), h('input', { type: 'text', id: 'codigoPostal', placeholder: '9420', required: true, 'data-testid': 'input-codigo-postal' })], 'error-codigoPostal', 'mensaje-error-codigo-postal'),
      selectCampo('Provincia', 'provincia', 'select-provincia', 'error-provincia', 'mensaje-error-provincia'),
      selectCampo('Localidad', 'localidad', 'select-localidad', 'error-localidad', 'mensaje-error-localidad'),
      h('button', { class: 'btn btn-primary', type: 'submit', id: 'submit-btn', 'data-testid': 'btn-crear-cuenta' }, [textoBotonFinal]),
    ]),
  ]);
}

function construirMapaErrores(prefijoErrores) {
  const mapa = { ...MAPA_ERRORES_REGISTRO_CLIENTE };
  if (prefijoErrores) {
    Object.entries(MAPA_ERRORES_REGISTRO_CLIENTE).forEach(([campoBackend, errorId]) => {
      if (!CAMPOS_SIN_PREFIJO.includes(campoBackend)) {
        mapa[`${prefijoErrores}${campoBackend}`] = errorId;
      }
    });
  }
  return mapa;
}

function esErrorDelPaso1(campoBackend, prefijoErrores) {
  const sinPrefijo = prefijoErrores && campoBackend.startsWith(prefijoErrores) ? campoBackend.slice(prefijoErrores.length) : campoBackend;
  return CAMPOS_STEP1_BACKEND.includes(sinPrefijo);
}

export function montarFormularioCliente(contenedor, opciones) {
  const {
    onEnviar,
    incluirEmail = true,
    antesDe = null,
    prefijoErrores = '',
    mostrarEnlaceLogin = true,
    edadMinima = EDAD_MINIMA_POR_DEFECTO,
    textos = {},
  } = opciones;
  const mensajeEdadInsuficiente = textos.edadInsuficiente || `Tenés que tener al menos ${edadMinima} años para poder registrarte.`;
  const textoBotonFinal = textos.botonFinal || 'Crear mi cuenta';
  const textoBotonFinalCargando = textos.botonFinalCargando || 'Creando cuenta...';
  const mapaErrores = construirMapaErrores(prefijoErrores);

  const progreso = construirProgreso();
  const asistente = h('div', { id: 'wizard-container', class: 'screen-body screen-body--tight' }, [
    h('div', { id: 'banner-slot', 'data-testid': 'mensaje-banner' }),
    construirPaso1({ incluirEmail, mostrarEnlaceLogin }),
    construirPaso2({ textoBotonFinal }),
  ]);
  contenedor.insertBefore(progreso, antesDe);
  contenedor.insertBefore(asistente, antesDe);

  const bannerSlot = document.getElementById('banner-slot');
  const pasos = crearPasos({
    pasos: [document.getElementById('step-1'), document.getElementById('step-2')],
    barras: progreso.querySelectorAll('.step-progress__bar'),
    etiquetas: progreso.querySelectorAll('.step-progress__labels span'),
  });

  let fotoClienteStaged = null;
  const fotoClienteAvatar = document.getElementById('foto-cliente-avatar');
  const inputFotoCliente = document.getElementById('input-foto-cliente');
  fotoClienteAvatar.addEventListener('click', () => inputFotoCliente.click());
  inputFotoCliente.addEventListener('change', () => {
    const file = inputFotoCliente.files[0];
    inputFotoCliente.value = '';
    if (!file) {
      return;
    }
    const errorValidacion = validarArchivoImagen(file);
    if (errorValidacion) {
      mostrarErrorCampo('error-foto-cliente', errorValidacion);
      return;
    }
    limpiarErrorCampo('error-foto-cliente');
    abrirEditorRecorte({
      origen: { file },
      aspectRatio: 1,
      onConfirmar: (blob) => {
        const archivoRecortado = new File([blob], file.name, { type: 'image/jpeg' });
        if (fotoClienteStaged) {
          URL.revokeObjectURL(fotoClienteStaged.previewUrl);
        }
        fotoClienteStaged = { file: archivoRecortado, previewUrl: URL.createObjectURL(archivoRecortado) };
        fotoClienteAvatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = fotoClienteStaged.previewUrl;
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        fotoClienteAvatar.appendChild(img);
      },
    });
  });

  const passwordInput = document.getElementById('password');
  const confirmarInput = document.getElementById('confirmarPassword');
  bindPasswordToggle(document.getElementById('toggle-password'), passwordInput);
  bindPasswordToggle(document.getElementById('toggle-confirmar'), confirmarInput);
  passwordInput.addEventListener('input', () => {
    aplicarFortalezaPassword(passwordInput.value, document.getElementById('strength-bars'), document.getElementById('strength-label'));
    limpiarErrorCampo('error-password');
  });
  confirmarInput.addEventListener('input', () => limpiarErrorCampo('error-confirmarPassword'));
  document.getElementById('aceptaTerminos').addEventListener('change', () => limpiarErrorCampo('error-terminos'));

  const nombreUsuarioCtl = bindNombreUsuario();
  const camposConErrorEnVivo = ['nombre', 'apellido', 'dni', 'fechaNacimiento', 'telefono'];
  if (incluirEmail) {
    camposConErrorEnVivo.push('email');
  }
  camposConErrorEnVivo.filter((inputId) => inputId !== 'fechaNacimiento').forEach((inputId) => {
    document.getElementById(inputId).addEventListener('input', () => limpiarErrorCampo(`error-${inputId}`));
  });
  const fechaNacimientoInput = document.getElementById('fechaNacimiento');
  function validarEdadDeLaFecha() {
    limpiarErrorCampo('error-fechaNacimiento');
    if (!fechaNacimientoCompleta(fechaNacimientoInput.value)) {
      return true;
    }
    if (!esFechaNacimientoClientePlausible(fechaNacimientoInput.value)) {
      mostrarErrorCampo('error-fechaNacimiento', MENSAJE_FECHA_NO_VALIDA);
      return false;
    }
    if (!cumpleEdadMinima(fechaNacimientoInput.value, edadMinima)) {
      mostrarErrorCampo('error-fechaNacimiento', mensajeEdadInsuficiente);
      return false;
    }
    return true;
  }
  fechaNacimientoInput.addEventListener('input', validarEdadDeLaFecha);
  fechaNacimientoInput.addEventListener('change', validarEdadDeLaFecha);
  const dniInput = document.getElementById('dni');
  dniInput.addEventListener('input', () => {
    dniInput.value = dniInput.value.replace(/\D/g, '').slice(0, 8);
  });
  const telefonoInput = document.getElementById('telefono');
  telefonoInput.addEventListener('input', () => {
    telefonoInput.value = telefonoInput.value.replace(/\D/g, '').slice(0, 10);
  });
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

  document.getElementById('continuar-btn').addEventListener('click', async () => {
    renderBannerTexto(bannerSlot, 'info', '');
    const nombreUsuarioValido = await nombreUsuarioCtl.validarParaContinuar();
    const validaciones = [
      nombreUsuarioValido,
      validarCampoRequeridoYValido('nombre', 'error-nombre', 'El nombre es obligatorio', esNombreClienteValido, 'El nombre solo puede contener letras'),
      validarCampoRequeridoYValido('apellido', 'error-apellido', 'El apellido es obligatorio', esNombreClienteValido, 'El apellido solo puede contener letras'),
      validarCampoRequeridoYValido('dni', 'error-dni', 'El DNI es obligatorio', esDniClienteValido, 'El DNI debe tener un formato válido'),
      validarCampoRequeridoYValido('fechaNacimiento', 'error-fechaNacimiento', 'La fecha de nacimiento es obligatoria', esFechaNacimientoClientePlausible, MENSAJE_FECHA_NO_VALIDA),
      fechaNacimientoInput.value && esFechaNacimientoClientePlausible(fechaNacimientoInput.value) ? validarEdadDeLaFecha() : true,
    ];
    if (incluirEmail) {
      validaciones.push(validarCampoRequeridoYValido('email', 'error-email', 'El email es obligatorio', esEmailValido, 'Ingresá un email válido'));
    }
    validaciones.push(validarCampoRequeridoYValido('telefono', 'error-telefono', 'El teléfono es obligatorio', esTelefonoValido, 'Ingresá un número de teléfono válido (cod. área + número)'));
    if (!validaciones.every(Boolean)) {
      scrollAlPrimerError();
      return;
    }
    if (!passwordInput.value) {
      mostrarErrorCampo('error-password', 'La contraseña es obligatoria');
      scrollAlPrimerError();
      return;
    }
    if (!esPasswordSegura(passwordInput.value)) {
      mostrarErrorCampo('error-password', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-password');
    if (!confirmarInput.value) {
      mostrarErrorCampo('error-confirmarPassword', 'Debes confirmar la contraseña');
      scrollAlPrimerError();
      return;
    }
    if (passwordInput.value !== confirmarInput.value) {
      mostrarErrorCampo('error-confirmarPassword', 'Las contraseñas no coinciden');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-confirmarPassword');
    if (!document.getElementById('aceptaTerminos').checked) {
      mostrarErrorCampo('error-terminos', 'Tenés que aceptar los Términos y Condiciones para continuar.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-terminos');
    pasos.mostrar(1);
  });

  initGeografiaSelects(document.getElementById('provincia'), document.getElementById('localidad'), 'Tierra del Fuego');

  const submitBtn = document.getElementById('submit-btn');
  document.getElementById('form-step-2').addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBannerTexto(bannerSlot, 'info', '');
    const codigoPostalInput = document.getElementById('codigoPostal');
    codigoPostalInput.value = normalizarCodigoPostal(codigoPostalInput.value);
    const camposValidos = [
      validarCampoRequeridoYValido('calle', 'error-calle', 'La calle es obligatoria', esCalleValida, 'La calle no puede contener solo caracteres especiales.'),
      validarCampoRequeridoYValido('numero', 'error-numero', 'El número es obligatorio', esNumeroDireccionValido, 'Solo se permiten números.'),
      validarCampoOpcionalYValido('pisoDepto', 'error-pisoDepto', esTextoConContenidoValido, 'El piso/departamento no puede contener solo caracteres especiales'),
      validarCampoRequeridoYValido('codigoPostal', 'error-codigoPostal', 'El código postal es obligatorio', esCodigoPostalValido, 'Ingresá un código postal válido (4 dígitos o formato CPA).'),
      validarCamposSilencioso([
        { inputId: 'provincia', errorId: 'error-provincia', mensaje: 'Seleccioná una provincia.' },
        { inputId: 'localidad', errorId: 'error-localidad', mensaje: 'Seleccioná tu localidad.' },
      ]),
    ].every(Boolean);
    if (!camposValidos) {
      scrollAlPrimerError();
      return;
    }
    setLoading(submitBtn, textoBotonFinalCargando, true);
    let fotoPerfilUrl = null;
    if (fotoClienteStaged) {
      try {
        fotoPerfilUrl = await subirFotoPerfilRegistroCliente(fotoClienteStaged.file);
      } catch (error) {
        setLoading(submitBtn, '', false, textoBotonFinal);
        renderBannerTexto(bannerSlot, 'error', error instanceof CloudinaryUploadError ? error.message : 'No pudimos subir la foto. Intentá nuevamente.');
        scrollAlPrimerError();
        return;
      }
    }
    const payload = {
      fotoPerfilUrl,
      nombre: colapsarEspacios(document.getElementById('nombre').value),
      apellido: colapsarEspacios(document.getElementById('apellido').value),
      dni: sanitizarDni(document.getElementById('dni').value),
      fechaNacimiento: document.getElementById('fechaNacimiento').value,
      telefono: construirTelefono(document.getElementById('telefono').value.trim()),
      nombreUsuario: document.getElementById('nombreUsuario').value.trim().toLowerCase(),
    };
    if (incluirEmail) {
      payload.email = document.getElementById('email').value.trim().toLowerCase();
    }
    payload.password = passwordInput.value;
    payload.aceptaTerminos = document.getElementById('aceptaTerminos').checked;
    payload.direccion = {
      calle: document.getElementById('calle').value.trim(),
      numero: document.getElementById('numero').value.trim(),
      pisoDepto: document.getElementById('pisoDepto').value.trim() || null,
      codigoPostal: document.getElementById('codigoPostal').value.trim(),
      localidadId: document.getElementById('localidad').value,
      principal: true,
    };
    try {
      await onEnviar(payload);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.message === MENSAJE_NOMBRE_USUARIO_EN_USO) {
        nombreUsuarioCtl.marcarEnUso();
        pasos.mostrar(0);
        renderBannerTexto(bannerSlot, 'error', 'Revisá los campos marcados.');
        scrollAlPrimerError();
      } else if (error instanceof ApiError && error.data && mapearErroresBackend(error.data, mapaErrores)) {
        const tieneErrorStep1 = Object.keys(error.data).some((campoBackend) => esErrorDelPaso1(campoBackend, prefijoErrores));
        pasos.mostrar(tieneErrorStep1 ? 0 : 1);
        renderBannerTexto(bannerSlot, 'error', 'Revisá los campos marcados.');
        scrollAlPrimerError();
      } else {
        pasos.mostrar(1);
        renderBannerTexto(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos crear tu cuenta. Intentá nuevamente.');
        scrollAlPrimerError();
      }
    } finally {
      setLoading(submitBtn, '', false, textoBotonFinal);
    }
  });

  return {
    mostrarPaso: pasos.mostrar,
    pasoActual: pasos.actual,
    ocultar() {
      progreso.classList.add('is-hidden');
      asistente.classList.add('is-hidden');
    },
  };
}

import { apiFetch, ApiError, setSesion, clearSesion } from './api.js';
import { initGeografiaSelects } from './geografia.js';
import { crearInputOtp } from './otp.js';
import { validarArchivoImagen, subirFotoPerfilRegistroComercio, subirFotoPerfilRegistroCliente, CloudinaryUploadError } from './cloudinary.js';
import { abrirEditorRecorte } from './crop.js';
import {
  esPasswordSegura,
  aplicarFortalezaPassword,
  esEmailValido,
  esFechaNacimientoValida,
  esTelefonoValido,
  esCalleValida,
  esNumeroDireccionValido,
  esCodigoPostalValido,
  normalizarCodigoPostal,
  esCuitValido,
  sanitizarCuit,
  esTextoConContenidoValido,
  esFechaNoFuturaValida,
  mostrarErrorCampo,
  limpiarErrorCampo,
  mapearErroresBackend,
  validarCamposSilencioso,
  esUrlRedSocialValida,
  normalizarUrlRedSocial,
  scrollAlPrimerError,
  esNombreClienteValido,
  esDniClienteValido,
  esFechaNacimientoClientePlausible,
  colapsarEspacios,
  sanitizarDni,
} from './validators.js';

const ICONS = {
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

function renderBanner(slot, kind, html) {
  if (!html) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = `<div class="banner banner-${kind}" style="margin-bottom:20px;">${ICONS[kind] || ICONS.info}<div>${html}</div></div>`;
}

function bindPasswordToggle(toggleBtn, input) {
  toggleBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

function setLoading(button, loadingText, isLoading, originalHtml) {
  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = loadingText;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalHtml || originalHtml;
    button.disabled = false;
  }
}

const MENSAJES_LOGIN_CONFLICTO = {
  'Cuenta bloqueada. Recuperá tu contraseña para desbloquearla': {
    kind: 'error',
    html: 'Tu cuenta está bloqueada por intentos fallidos. <a class="link" href="recuperar-password.html">Recuperá tu contraseña</a> para desbloquearla.',
  },
  'Cuenta inactiva. Solicitá la reactivación de tu cuenta': {
    kind: 'warning',
    html: 'Tu cuenta está inactiva. <a class="link" href="reactivar-cuenta.html">Solicitá la reactivación</a> para volver a ingresar.',
  },
  'Cuenta suspendida': {
    kind: 'error',
    html: 'Tu cuenta fue suspendida. Contactá a soporte para más información.',
  },
};

export async function resolverHomePorRol(usuario) {
  if (usuario.rol === 'CLIENTE') {
    return 'index.html';
  }
  if (usuario.rol === 'ADMINISTRADOR') {
    return 'admin-dashboard.html';
  }
  const comercio = await apiFetch('/comercios/perfil');
  if (comercio.estado === 'PENDIENTE') {
    return 'comercio-pendiente.html';
  }
  if (comercio.estado === 'RECHAZADO') {
    return 'comercio-rechazado.html';
  }
  if (comercio.estado === 'APROBADO') {
    return 'comercio-dashboard.html';
  }
  return null;
}

export function initLogin() {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const shellEmail = document.getElementById('shell-email');
  const shellPassword = document.getElementById('shell-password');
  const errorCredenciales = document.getElementById('error-credenciales');
  const warningBloqueo = document.getElementById('warning-bloqueo');
  const bannerSlot = document.getElementById('banner-slot');
  const submitBtn = document.getElementById('submit-btn');

  bindPasswordToggle(document.getElementById('toggle-password'), passwordInput);

  if (new URLSearchParams(window.location.search).get('passwordActualizada') === '1') {
    renderBanner(bannerSlot, 'info', 'Tu contraseña se actualizó. Iniciá sesión con tu nueva contraseña.');
  }

  function limpiarErrores() {
    shellEmail.classList.remove('input-shell--error');
    shellPassword.classList.remove('input-shell--error');
    errorCredenciales.style.display = 'none';
    warningBloqueo.style.display = 'none';
    renderBanner(bannerSlot, 'info', '');
  }

  function validarCamposCompletos() {
    const emailVacio = !emailInput.value.trim();
    const passwordVacio = !passwordInput.value;
    if (!emailVacio && !passwordVacio) {
      return true;
    }
    shellEmail.classList.toggle('input-shell--error', emailVacio);
    shellPassword.classList.toggle('input-shell--error', passwordVacio);
    let mensaje = 'Completá tu email y tu contraseña.';
    if (emailVacio && !passwordVacio) mensaje = 'Ingresá tu email.';
    if (!emailVacio && passwordVacio) mensaje = 'Ingresá tu contraseña.';
    errorCredenciales.textContent = mensaje;
    errorCredenciales.style.display = 'flex';
    return false;
  }

  async function redirigirPostLogin(usuario) {
    try {
      const destino = await resolverHomePorRol(usuario);
      if (destino) {
        window.location.href = destino;
      } else {
        renderBanner(bannerSlot, 'warning', 'Tu comercio no está operativo en este momento. Contactá a soporte para más información.');
      }
    } catch {
      renderBanner(bannerSlot, 'error', 'No pudimos verificar el estado de tu comercio. Intentá nuevamente.');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    limpiarErrores();
    if (!validarCamposCompletos()) {
      scrollAlPrimerError();
      return;
    }
    setLoading(submitBtn, 'Ingresando...', true);

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: emailInput.value.trim(), password: passwordInput.value },
      });
      setSesion(data.token, data.usuario);
      await redirigirPostLogin(data.usuario);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        shellEmail.classList.add('input-shell--error');
        shellPassword.classList.add('input-shell--error');
        errorCredenciales.textContent = 'Email o contraseña incorrectos. Intentá nuevamente.';
        errorCredenciales.style.display = 'flex';
        const intentosRestantes = error.data && typeof error.data.intentosRestantes === 'number' ? error.data.intentosRestantes : null;
        if (intentosRestantes === 1) {
          warningBloqueo.textContent = 'Cuidado: si fallás 1 vez más, tu cuenta se bloqueará.';
          warningBloqueo.style.display = 'block';
        }
        scrollAlPrimerError();
      } else if (error instanceof ApiError && error.status === 409) {
        if (error.message === 'Verificá tu email antes de iniciar sesión') {
          const emailQS = encodeURIComponent(emailInput.value.trim());
          renderBanner(bannerSlot, 'warning', `Todavía no verificaste tu email. Ingresá el código de 6 dígitos que te enviamos al registrarte en la <a class="link" href="verificar-email.html?email=${emailQS}">pantalla de verificación</a>.`);
        } else {
          const mapeo = MENSAJES_LOGIN_CONFLICTO[error.message];
          renderBanner(bannerSlot, mapeo ? mapeo.kind : 'error', mapeo ? mapeo.html : error.message);
        }
        scrollAlPrimerError();
      } else if (error instanceof ApiError && error.data) {
        shellEmail.classList.toggle('input-shell--error', Boolean(error.data.email));
        shellPassword.classList.toggle('input-shell--error', Boolean(error.data.password));
        errorCredenciales.textContent = error.data.email || error.data.password || error.message;
        errorCredenciales.style.display = 'flex';
        scrollAlPrimerError();
      } else if (error instanceof ApiError) {
        renderBanner(bannerSlot, 'error', error.message || 'No pudimos iniciar sesión. Intentá nuevamente.');
        scrollAlPrimerError();
      }
    } finally {
      setLoading(submitBtn, '', false, 'Ingresar');
    }
  });
}

export function construirTelefono(digitos) {
  return `+549${String(digitos || '').replace(/[ ()\-]/g, '')}`;
}

const CAMPOS_STEP1_BACKEND = ['nombre', 'apellido', 'dni', 'fechaNacimiento', 'telefono', 'email', 'password'];

const MAPA_ERRORES_REGISTRO_CLIENTE = {
  nombre: 'error-nombre',
  apellido: 'error-apellido',
  dni: 'error-dni',
  fechaNacimiento: 'error-fechaNacimiento',
  telefono: 'error-telefono',
  email: 'error-email',
  password: 'error-password',
  'direccion.calle': 'error-calle',
  'direccion.numero': 'error-numero',
  'direccion.pisoDepto': 'error-pisoDepto',
  'direccion.codigoPostal': 'error-codigoPostal',
  'direccion.localidadId': 'error-localidad',
};

function validarCampo(inputId, errorId, validador, mensaje) {
  const input = document.getElementById(inputId);
  if (validador(input.value)) {
    limpiarErrorCampo(errorId);
    return true;
  }
  mostrarErrorCampo(errorId, mensaje);
  return false;
}

function validarCampoRequeridoYValido(inputId, errorId, mensajeRequerido, validador, mensajeInvalido) {
  const input = document.getElementById(inputId);
  if (!input.value.trim()) {
    mostrarErrorCampo(errorId, mensajeRequerido);
    return false;
  }
  return validarCampo(inputId, errorId, validador, mensajeInvalido);
}

function validarCampoOpcionalYValido(inputId, errorId, validador, mensajeInvalido) {
  const input = document.getElementById(inputId);
  if (!input.value.trim()) {
    limpiarErrorCampo(errorId);
    return true;
  }
  return validarCampo(inputId, errorId, validador, mensajeInvalido);
}

function bindValidacionCampo(inputId, errorId, validador, mensaje) {
  const input = document.getElementById(inputId);
  input.addEventListener('blur', () => {
    if (input.value.trim()) {
      validarCampo(inputId, errorId, validador, mensaje);
    }
  });
  input.addEventListener('input', () => limpiarErrorCampo(errorId));
}

function validarFechaNacimientoRepresentante(inputId, errorId, requerido) {
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
  if (!esFechaNacimientoValida(input.value)) {
    mostrarErrorCampo(errorId, 'Debe ser mayor de 18 años');
    return false;
  }
  limpiarErrorCampo(errorId);
  return true;
}

export function initRegistroCliente() {
  const steps = [document.getElementById('step-1'), document.getElementById('step-2')];
  const bars = document.querySelectorAll('.step-progress__bar');
  const labels = document.querySelectorAll('.step-progress__labels span');
  const bannerSlot = document.getElementById('banner-slot');
  let currentStep = 0;

  function mostrarPaso(index) {
    steps.forEach((step, i) => step.classList.toggle('is-hidden', i !== index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--done', i < index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--active', i <= index));
    labels.forEach((label, i) => label.classList.toggle('is-active', i === index));
    currentStep = index;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('back-btn').addEventListener('click', () => {
    if (currentStep === 1) {
      mostrarPaso(0);
    } else {
      history.back();
    }
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

  ['nombre', 'apellido', 'dni', 'fechaNacimiento', 'email', 'telefono'].forEach((inputId) => {
    document.getElementById(inputId).addEventListener('input', () => limpiarErrorCampo(`error-${inputId}`));
  });
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

  document.getElementById('continuar-btn').addEventListener('click', () => {
    renderBanner(bannerSlot, 'info', '');
    const camposValidos = [
      validarCampoRequeridoYValido('nombre', 'error-nombre', 'El nombre es obligatorio', esNombreClienteValido, 'El nombre solo puede contener letras'),
      validarCampoRequeridoYValido('apellido', 'error-apellido', 'El apellido es obligatorio', esNombreClienteValido, 'El apellido solo puede contener letras'),
      validarCampoRequeridoYValido('dni', 'error-dni', 'El DNI es obligatorio', esDniClienteValido, 'El DNI debe tener un formato válido'),
      validarCampoRequeridoYValido('fechaNacimiento', 'error-fechaNacimiento', 'La fecha de nacimiento es obligatoria', esFechaNacimientoClientePlausible, 'La fecha ingresada no es válida'),
      validarCampoRequeridoYValido('email', 'error-email', 'El email es obligatorio', esEmailValido, 'Ingresá un email válido'),
      validarCampoRequeridoYValido('telefono', 'error-telefono', 'El teléfono es obligatorio', esTelefonoValido, 'Ingresá un número de teléfono válido (cod. área + número)'),
    ].every(Boolean);
    if (!camposValidos) {
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
    mostrarPaso(1);
  });

  initGeografiaSelects(document.getElementById('provincia'), document.getElementById('localidad'), 'Tierra del Fuego');

  const submitBtn = document.getElementById('submit-btn');
  document.getElementById('form-step-2').addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerSlot, 'info', '');
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
    setLoading(submitBtn, 'Creando cuenta...', true);
    let fotoPerfilUrl = null;
    if (fotoClienteStaged) {
      try {
        fotoPerfilUrl = await subirFotoPerfilRegistroCliente(fotoClienteStaged.file);
      } catch (error) {
        setLoading(submitBtn, '', false, 'Crear mi cuenta');
        renderBanner(bannerSlot, 'error', error instanceof CloudinaryUploadError ? error.message : 'No pudimos subir la foto. Intentá nuevamente.');
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
      email: document.getElementById('email').value.trim().toLowerCase(),
      password: passwordInput.value,
      direccion: {
        calle: document.getElementById('calle').value.trim(),
        numero: document.getElementById('numero').value.trim(),
        pisoDepto: document.getElementById('pisoDepto').value.trim() || null,
        codigoPostal: document.getElementById('codigoPostal').value.trim(),
        localidadId: document.getElementById('localidad').value,
        principal: true,
      },
    };
    try {
      await apiFetch('/auth/registro/cliente', { method: 'POST', auth: false, body: payload });
      document.getElementById('ir-a-verificar-link').href = `verificar-email.html?email=${encodeURIComponent(payload.email)}`;
      document.getElementById('wizard-container').classList.add('is-hidden');
      document.getElementById('exito-container').classList.remove('is-hidden');
      document.getElementById('step-progress-container').classList.add('is-hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof ApiError && error.data && mapearErroresBackend(error.data, MAPA_ERRORES_REGISTRO_CLIENTE)) {
        const tieneErrorStep1 = Object.keys(error.data).some((campo) => CAMPOS_STEP1_BACKEND.includes(campo));
        mostrarPaso(tieneErrorStep1 ? 0 : 1);
        renderBanner(bannerSlot, 'error', 'Revisá los campos marcados.');
        scrollAlPrimerError();
      } else {
        mostrarPaso(1);
        renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos crear tu cuenta. Intentá nuevamente.');
        scrollAlPrimerError();
      }
    } finally {
      setLoading(submitBtn, '', false, 'Crear mi cuenta');
    }
  });
}

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

function poblarSelect(select, labels, placeholder) {
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

const CAMPOS_STEP1_BACKEND_COMERCIO = ['nombre', 'telefono', 'emailContacto', 'tipoComercio', 'aceptaDelivery', 'aceptaRetiro', 'fotoPerfilUrl'];

const CAMPOS_STEP2_BACKEND_COMERCIO = [
  'razonSocial', 'cuit', 'condicionIva', 'tipoSociedad', 'domicilioFiscal', 'fechaInicioActividades',
  'email', 'password', 'nombreRepresentante', 'apellidoRepresentante', 'dniRepresentante',
  'telefonoRepresentante', 'fechaNacimientoRepresentante',
];

const MAPA_ERRORES_REGISTRO_COMERCIO = {
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
  razonSocial: 'error-razonSocial',
  cuit: 'error-cuit',
  condicionIva: 'error-condicionIva',
  tipoSociedad: 'error-tipoSociedad',
  domicilioFiscal: 'error-domicilioFiscal',
  fechaInicioActividades: 'error-fechaInicioActividades',
  email: 'error-email',
  password: 'error-password',
  nombreRepresentante: 'error-nombreRepresentante',
  apellidoRepresentante: 'error-apellidoRepresentante',
  dniRepresentante: 'error-dniRepresentante',
  telefonoRepresentante: 'error-telefonoRepresentante',
  fechaNacimientoRepresentante: 'error-fechaNacimientoRepresentante',
};

export function initRegistroComercio() {
  const steps = [document.getElementById('step-1'), document.getElementById('step-2'), document.getElementById('step-3'), document.getElementById('step-4')];
  const bars = document.querySelectorAll('.step-progress__bar');
  const labels = document.querySelectorAll('.step-progress__labels span');
  const bannerSlot = document.getElementById('banner-slot');
  let currentStep = 0;

  function mostrarPaso(index) {
    steps.forEach((step, i) => step.classList.toggle('is-hidden', i !== index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--done', i < index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--active', i <= index));
    labels.forEach((label, i) => label.classList.toggle('is-active', i === index));
    currentStep = index;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('back-btn').addEventListener('click', () => {
    if (currentStep > 0) {
      mostrarPaso(currentStep - 1);
    } else {
      history.back();
    }
  });

  let fotoComercioStaged = null;
  const fotoComercioAvatar = document.getElementById('foto-comercio-avatar');
  const inputFotoComercio = document.getElementById('input-foto-comercio');
  fotoComercioAvatar.addEventListener('click', () => inputFotoComercio.click());
  inputFotoComercio.addEventListener('change', () => {
    const file = inputFotoComercio.files[0];
    inputFotoComercio.value = '';
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
        if (fotoComercioStaged) {
          URL.revokeObjectURL(fotoComercioStaged.previewUrl);
        }
        fotoComercioStaged = { file: archivoRecortado, previewUrl: URL.createObjectURL(archivoRecortado) };
        fotoComercioAvatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = fotoComercioStaged.previewUrl;
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        fotoComercioAvatar.appendChild(img);
      },
    });
  });

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

  initGeografiaSelects(document.getElementById('provincia'), document.getElementById('localidad'), 'Tierra del Fuego');

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

  document.getElementById('continuar-btn').addEventListener('click', () => {
    renderBanner(bannerSlot, 'info', '');
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
      return;
    }
    if (!fotoComercioStaged) {
      mostrarErrorCampo('error-foto-comercio', 'Agregá una foto de perfil de tu comercio');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-foto-comercio');
    if (switchDelivery.getAttribute('aria-pressed') !== 'true' && switchRetiro.getAttribute('aria-pressed') !== 'true') {
      mostrarErrorCampo('error-modalidad', 'Debés ofrecer al menos una modalidad de entrega.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-modalidad');
    mostrarPaso(1);
  });

  poblarSelect(document.getElementById('tipoSociedad'), LABELS_TIPO_SOCIEDAD, 'Seleccioná el tipo de sociedad');
  poblarSelect(document.getElementById('condicionIva'), LABELS_CONDICION_IVA, 'Seleccioná la condición ante el IVA');
  document.getElementById('tipoSociedad').addEventListener('change', () => limpiarErrorCampo('error-tipoSociedad'));
  document.getElementById('condicionIva').addEventListener('change', () => limpiarErrorCampo('error-condicionIva'));

  const passwordInput = document.getElementById('password');
  const confirmarInput = document.getElementById('confirmarPassword');
  bindPasswordToggle(document.getElementById('toggle-password'), passwordInput);
  bindPasswordToggle(document.getElementById('toggle-confirmar'), confirmarInput);
  passwordInput.addEventListener('input', () => {
    aplicarFortalezaPassword(passwordInput.value, document.getElementById('strength-bars'), document.getElementById('strength-label'));
    limpiarErrorCampo('error-password');
  });
  confirmarInput.addEventListener('input', () => limpiarErrorCampo('error-confirmarPassword'));

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
      validarFechaNacimientoRepresentante('fechaNacimientoRepresentante', 'error-fechaNacimientoRepresentante', false);
    }
  });
  fechaNacimientoRepresentanteInput.addEventListener('input', () => limpiarErrorCampo('error-fechaNacimientoRepresentante'));
  const telefonoRepresentanteInput = document.getElementById('telefonoRepresentante');
  telefonoRepresentanteInput.addEventListener('input', () => {
    telefonoRepresentanteInput.value = telefonoRepresentanteInput.value.replace(/\D/g, '').slice(0, 10);
  });
  bindValidacionCampo('telefonoRepresentante', 'error-telefonoRepresentante', esTelefonoValido, 'Ingresá un número de teléfono válido (cod. área + número)');
  bindValidacionCampo('email', 'error-email', esEmailValido, 'Ingresá un email válido');

  document.getElementById('continuar-btn-2').addEventListener('click', () => {
    renderBanner(bannerSlot, 'info', '');
    const camposValidos = [
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
      validarFechaNacimientoRepresentante('fechaNacimientoRepresentante', 'error-fechaNacimientoRepresentante', true),
      validarCampoRequeridoYValido('telefonoRepresentante', 'error-telefonoRepresentante', 'El teléfono es obligatorio', esTelefonoValido, 'Ingresá un número de teléfono válido (cod. área + número)'),
      validarCampoRequeridoYValido('email', 'error-email', 'El email es obligatorio', esEmailValido, 'Ingresá un email válido'),
    ].every(Boolean);
    if (!camposValidos) {
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
    mostrarPaso(2);
  });

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

  function recolectarHorarios() {
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
      <div class="select-shell" style="flex:1;">
        <select class="horario-dia" required data-testid="select-dia-horario"></select>
        <svg class="select-shell__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="input-shell" style="flex:1;">
        <input type="time" class="horario-apertura" required data-testid="input-apertura-horario" />
      </div>
      <div class="input-shell" style="flex:1;">
        <input type="time" class="horario-cierre" required data-testid="input-cierre-horario" />
      </div>
      <button type="button" class="schedule-chip__remove" aria-label="Quitar franja" style="border:none;background:transparent;color:var(--color-text-muted);cursor:pointer;width:32px;height:48px;flex-shrink:0;" data-testid="btn-eliminar-horario">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
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
    const horariosActuales = recolectarHorarios();
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

  document.getElementById('continuar-btn-3').addEventListener('click', () => {
    renderBanner(bannerSlot, 'info', '');
    limpiarErrorCampo('error-horarios');
    const horarios = recolectarHorarios();
    const parcial = horarios.find((h) => (h.diaSemana || h.horaApertura || h.horaCierre)
      && !(h.diaSemana && h.horaApertura && h.horaCierre));
    if (parcial) {
      renderBanner(bannerSlot, 'error', 'Completá el día y el horario de todas las franjas cargadas.');
      scrollAlPrimerError();
      return;
    }
    const completos = horarios.filter((h) => h.diaSemana && h.horaApertura && h.horaCierre);
    if (completos.length === 0) {
      renderBanner(bannerSlot, 'error', 'Cargá al menos una franja horaria de atención.');
      scrollAlPrimerError();
      return;
    }
    for (const horario of completos) {
      if (horario.horaCierre <= horario.horaApertura) {
        renderBanner(bannerSlot, 'error', 'El horario de cierre tiene que ser posterior al de apertura en cada franja.');
        scrollAlPrimerError();
        return;
      }
    }
    for (let i = 0; i < completos.length; i++) {
      for (let j = i + 1; j < completos.length; j++) {
        if (completos[i].diaSemana !== completos[j].diaSemana) continue;
        if (franjasSeSuperponen(completos[i].horaApertura, completos[i].horaCierre, completos[j].horaApertura, completos[j].horaCierre)) {
          renderBanner(bannerSlot, 'error', mensajeConflictoHorario(completos[j]));
          scrollAlPrimerError();
          return;
        }
      }
    }
    mostrarPaso(3);
  });

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

  function recolectarRedesSociales() {
    const filas = Array.from(redSocialList.querySelectorAll('[data-red-social-row]'));
    return filas.map((fila) => ({
      tipo: fila.querySelector('.red-social-tipo').value,
      url: normalizarUrlRedSocial(fila.querySelector('.red-social-url').value),
    }));
  }

  const submitBtn = document.getElementById('submit-btn');
  document.getElementById('form-step-4').addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerSlot, 'info', '');
    const horarios = recolectarHorarios();
    const redesSociales = recolectarRedesSociales().filter((r) => r.tipo || r.url);
    if (redesSociales.length === 0) {
      renderBanner(bannerSlot, 'error', 'Cargá al menos una red social.');
      scrollAlPrimerError();
      return;
    }
    const tiposVistos = new Set();
    for (const redSocial of redesSociales) {
      if (!redSocial.tipo) {
        renderBanner(bannerSlot, 'error', 'Seleccioná el tipo de cada red social cargada.');
        scrollAlPrimerError();
        return;
      }
      if (!redSocial.url) {
        renderBanner(bannerSlot, 'error', 'El link es obligatorio en cada red social cargada.');
        scrollAlPrimerError();
        return;
      }
      if (!esUrlRedSocialValida(redSocial.url)) {
        renderBanner(bannerSlot, 'error', 'Ingresá un link válido para cada red social cargada.');
        scrollAlPrimerError();
        return;
      }
      if (tiposVistos.has(redSocial.tipo)) {
        renderBanner(bannerSlot, 'error', 'No podés cargar dos redes sociales del mismo tipo. Eliminá la que se repite.');
        scrollAlPrimerError();
        return;
      }
      tiposVistos.add(redSocial.tipo);
    }

    setLoading(submitBtn, 'Registrando comercio...', true);
    let fotoPerfilUrl = null;
    if (fotoComercioStaged) {
      try {
        fotoPerfilUrl = await subirFotoPerfilRegistroComercio(fotoComercioStaged.file);
      } catch (error) {
        setLoading(submitBtn, '', false, 'Registrar comercio');
        mostrarPaso(0);
        renderBanner(bannerSlot, 'error', error instanceof CloudinaryUploadError ? error.message : 'No pudimos subir la foto. Intentá nuevamente.');
        scrollAlPrimerError();
        return;
      }
    }
    const payload = {
      fotoPerfilUrl,
      razonSocial: document.getElementById('razonSocial').value.trim(),
      cuit: sanitizarCuit(document.getElementById('cuit').value),
      condicionIva: document.getElementById('condicionIva').value,
      tipoSociedad: document.getElementById('tipoSociedad').value,
      domicilioFiscal: document.getElementById('domicilioFiscal').value.trim(),
      fechaInicioActividades: document.getElementById('fechaInicioActividades').value,
      nombre: document.getElementById('nombre').value.trim(),
      descripcion: document.getElementById('descripcion').value.trim() || null,
      telefono: construirTelefono(document.getElementById('telefono').value.trim()),
      emailContacto: document.getElementById('emailContacto').value.trim(),
      tipoComercio: document.getElementById('tipoComercio').value,
      aceptaDelivery: switchDelivery.getAttribute('aria-pressed') === 'true',
      aceptaRetiro: switchRetiro.getAttribute('aria-pressed') === 'true',
      email: document.getElementById('email').value.trim().toLowerCase(),
      password: passwordInput.value,
      direccion: {
        calle: document.getElementById('calle').value.trim(),
        numero: document.getElementById('numero').value.trim(),
        pisoDepto: document.getElementById('pisoDepto').value.trim() || null,
        codigoPostal: document.getElementById('codigoPostal').value.trim(),
        localidadId: document.getElementById('localidad').value,
        principal: true,
      },
      horarios,
      redesSociales,
      nombreRepresentante: colapsarEspacios(document.getElementById('nombreRepresentante').value),
      apellidoRepresentante: colapsarEspacios(document.getElementById('apellidoRepresentante').value),
      dniRepresentante: sanitizarDni(document.getElementById('dniRepresentante').value),
      telefonoRepresentante: construirTelefono(document.getElementById('telefonoRepresentante').value.trim()),
      fechaNacimientoRepresentante: document.getElementById('fechaNacimientoRepresentante').value,
    };
    try {
      await apiFetch('/auth/registro/comercio', { method: 'POST', auth: false, body: payload });
      document.getElementById('ir-a-verificar-link').href = `verificar-email.html?email=${encodeURIComponent(payload.email)}`;
      document.getElementById('wizard-container').classList.add('is-hidden');
      document.getElementById('exito-container').classList.remove('is-hidden');
      document.getElementById('step-progress-container').classList.add('is-hidden');
      document.getElementById('back-btn').classList.add('is-hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof ApiError && error.data && mapearErroresBackend(error.data, MAPA_ERRORES_REGISTRO_COMERCIO)) {
        const campos = Object.keys(error.data);
        const tieneErrorStep1 = campos.some((campo) => CAMPOS_STEP1_BACKEND_COMERCIO.includes(campo) || campo.startsWith('direccion.'));
        const tieneErrorStep2 = campos.some((campo) => CAMPOS_STEP2_BACKEND_COMERCIO.includes(campo));
        const tieneErrorStep4 = campos.some((campo) => campo.startsWith('redesSociales'));
        mostrarPaso(tieneErrorStep1 ? 0 : tieneErrorStep2 ? 1 : tieneErrorStep4 ? 3 : 2);
        renderBanner(bannerSlot, 'error', 'Revisá los campos marcados.');
        scrollAlPrimerError();
      } else {
        mostrarPaso(3);
        renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos registrar tu comercio. Intentá nuevamente.');
        scrollAlPrimerError();
      }
    } finally {
      setLoading(submitBtn, '', false, 'Registrar comercio');
    }
  });
}

export function initVerificarEmail() {
  const params = new URLSearchParams(window.location.search);
  const formContainer = document.getElementById('form-container');
  const exitoEl = document.getElementById('estado-exito');
  const errorEl = document.getElementById('estado-error');
  const errorTextoEl = document.getElementById('estado-error-texto');
  const bannerSlot = document.getElementById('banner-slot');
  const form = document.getElementById('verificar-form');
  const textoEl = document.getElementById('verificar-texto');
  const submitBtn = document.getElementById('submit-btn');
  const reenviarBtn = document.getElementById('reenviar-btn');
  const errorReenviarBtn = document.getElementById('error-reenviar-btn');

  const otp = crearInputOtp(document.getElementById('otp-container'), {
    onComplete: () => form.requestSubmit(),
  });

  const email = (params.get('email') || '').trim();

  if (!email) {
    formContainer.classList.add('is-hidden');
    errorTextoEl.textContent = 'No pudimos identificar tu cuenta. Volvé a iniciar sesión o registrate para recibir un nuevo código.';
    errorEl.classList.remove('is-hidden');
    errorReenviarBtn.classList.add('is-hidden');
    return;
  }

  textoEl.textContent = `Te enviamos un código de 6 dígitos al email ${email}. Ingresalo acá para activar tu cuenta.`;

  async function reenviarCodigo() {
    try {
      await apiFetch('/auth/reenviar-verificacion', {
        method: 'POST',
        auth: false,
        body: { email },
      });
      formContainer.classList.remove('is-hidden');
      errorEl.classList.add('is-hidden');
      otp.reset();
      renderBanner(bannerSlot, 'info', 'Te enviamos un nuevo código.');
    } catch (error) {
      renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos reenviar el código. Intentá nuevamente.');
    }
  }

  reenviarBtn.addEventListener('click', reenviarCodigo);
  errorReenviarBtn.addEventListener('click', reenviarCodigo);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerSlot, 'info', '');
    limpiarErrorCampo('error-codigo');
    if (otp.getValor().length !== 6) {
      mostrarErrorCampo('error-codigo', 'Ingresá el código de 6 dígitos.');
      scrollAlPrimerError();
      return;
    }
    setLoading(submitBtn, 'Verificando...', true);
    try {
      await apiFetch('/auth/verificar', {
        method: 'POST',
        auth: false,
        body: { email, codigo: otp.getValor() },
      });
      otp.marcarExito();
      formContainer.classList.add('is-hidden');
      exitoEl.classList.remove('is-hidden');
    } catch (error) {
      otp.marcarError();
      if (error instanceof ApiError && error.status === 409) {
        formContainer.classList.add('is-hidden');
        errorTextoEl.textContent = error.message || 'El código no es válido o ya venció. Pedí uno nuevo para continuar.';
        errorEl.classList.remove('is-hidden');
      } else if (error instanceof ApiError && error.status === 401) {
        mostrarErrorCampo('error-codigo', error.message || 'El código ingresado es incorrecto.');
        scrollAlPrimerError();
      } else {
        renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos verificar tu cuenta. Intentá nuevamente.');
        scrollAlPrimerError();
      }
    } finally {
      setLoading(submitBtn, '', false, 'Verificar cuenta');
    }
  });
}

export function initRecuperarPasswordSolicitar() {
  const form = document.getElementById('solicitar-form');
  const bannerSlot = document.getElementById('banner-slot');
  const submitBtn = document.getElementById('submit-btn');
  const formContainer = document.getElementById('form-container');
  const codigoContainer = document.getElementById('codigo-container');
  const exitoContainer = document.getElementById('exito-container');
  const emailInput = document.getElementById('email');

  let emailSolicitado = '';

  async function solicitarCodigo(email) {
    await apiFetch('/auth/recuperar-password', { method: 'POST', auth: false, body: { email } });
    emailSolicitado = email;
    formContainer.classList.add('is-hidden');
    codigoContainer.classList.remove('is-hidden');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerSlot, 'info', '');
    limpiarErrorCampo('error-email');
    if (!emailInput.value.trim()) {
      mostrarErrorCampo('error-email', 'Ingresá tu email.');
      scrollAlPrimerError();
      return;
    }
    if (!validarCamposSilencioso([{ inputId: 'email', errorId: 'error-email', validador: esEmailValido, mensaje: 'Ingresá un email con formato válido.' }])) {
      scrollAlPrimerError();
      return;
    }
    setLoading(submitBtn, 'Enviando...', true);
    try {
      await solicitarCodigo(emailInput.value.trim());
    } catch (error) {
      if (!(error instanceof ApiError && error.data && mapearErroresBackend(error.data, { email: 'error-email' }))) {
        renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos procesar tu solicitud. Intentá nuevamente.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(submitBtn, '', false, 'Enviar código de recuperación');
    }
  });

  emailInput.addEventListener('input', () => limpiarErrorCampo('error-email'));

  const codigoBannerSlot = document.getElementById('banner-slot-codigo');
  const pasoCodigo = document.getElementById('paso-codigo');
  const pasoPassword = document.getElementById('paso-password');
  const barCodigo = document.getElementById('rp-bar-1');
  const barPassword = document.getElementById('rp-bar-2');
  const labelCodigo = document.getElementById('rp-label-1');
  const labelPassword = document.getElementById('rp-label-2');
  const codigoForm = document.getElementById('confirmar-form');
  const passwordInput = document.getElementById('nuevaPassword');
  const confirmarInput = document.getElementById('confirmarPassword');
  const confirmarSubmitBtn = document.getElementById('confirmar-submit-btn');
  const reenviarBtn = document.getElementById('reenviar-btn');

  function mostrarPasoCodigo() {
    pasoPassword.classList.add('is-hidden');
    pasoCodigo.classList.remove('is-hidden');
    barPassword.classList.remove('step-progress__bar--active', 'step-progress__bar--done');
    barCodigo.classList.add('step-progress__bar--active');
    labelPassword.classList.remove('is-active');
    labelCodigo.classList.add('is-active');
  }

  function mostrarPasoPassword() {
    pasoCodigo.classList.add('is-hidden');
    pasoPassword.classList.remove('is-hidden');
    barCodigo.classList.add('step-progress__bar--done');
    barPassword.classList.add('step-progress__bar--active');
    labelCodigo.classList.remove('is-active');
    labelPassword.classList.add('is-active');
  }

  const otp = crearInputOtp(document.getElementById('otp-container'), {
    onComplete: async (codigo) => {
      renderBanner(codigoBannerSlot, 'info', '');
      limpiarErrorCampo('error-codigo');
      try {
        await apiFetch('/auth/recuperar-password/validar-codigo', {
          method: 'POST',
          auth: false,
          body: { email: emailSolicitado, codigo },
        });
        otp.marcarExito();
        mostrarPasoPassword();
      } catch (error) {
        otp.marcarError();
        mostrarErrorCampo('error-codigo', error instanceof ApiError ? error.message : 'No pudimos validar el código. Intentá nuevamente.');
        scrollAlPrimerError();
      }
    },
  });

  bindPasswordToggle(document.getElementById('toggle-password'), passwordInput);
  bindPasswordToggle(document.getElementById('toggle-confirmar'), confirmarInput);
  passwordInput.addEventListener('input', () => {
    aplicarFortalezaPassword(passwordInput.value, document.getElementById('strength-bars'), document.getElementById('strength-label'));
    limpiarErrorCampo('error-nuevaPassword');
  });
  confirmarInput.addEventListener('input', () => limpiarErrorCampo('error-confirmarPassword'));

  reenviarBtn.addEventListener('click', async () => {
    renderBanner(codigoBannerSlot, 'info', '');
    try {
      await solicitarCodigo(emailSolicitado);
      otp.reset();
      mostrarPasoCodigo();
      renderBanner(codigoBannerSlot, 'info', 'Te enviamos un nuevo código.');
    } catch (error) {
      renderBanner(codigoBannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos reenviar el código. Intentá nuevamente.');
    }
  });

  codigoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(codigoBannerSlot, 'info', '');
    const camposValidos = validarCamposSilencioso([
      { inputId: 'nuevaPassword', errorId: 'error-nuevaPassword', mensaje: 'Ingresá una nueva contraseña.' },
      { inputId: 'confirmarPassword', errorId: 'error-confirmarPassword', mensaje: 'Repetí tu contraseña.' },
    ]);
    if (!camposValidos) {
      scrollAlPrimerError();
      return;
    }
    if (!esPasswordSegura(passwordInput.value)) {
      mostrarErrorCampo('error-nuevaPassword', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-nuevaPassword');
    if (passwordInput.value !== confirmarInput.value) {
      mostrarErrorCampo('error-confirmarPassword', 'Las contraseñas ingresadas no coinciden.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-confirmarPassword');
    setLoading(confirmarSubmitBtn, 'Guardando...', true);
    try {
      await apiFetch('/auth/recuperar-password/confirmar', {
        method: 'POST',
        auth: false,
        body: { email: emailSolicitado, codigo: otp.getValor(), nuevaPassword: passwordInput.value },
      });
      codigoContainer.classList.add('is-hidden');
      exitoContainer.classList.remove('is-hidden');
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
        mostrarPasoCodigo();
        otp.marcarError();
        renderBanner(codigoBannerSlot, 'error', error.message || 'El código no es válido o ya venció. Pedí uno nuevo.');
      } else {
        renderBanner(codigoBannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos actualizar tu contraseña. Intentá nuevamente.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(confirmarSubmitBtn, '', false, 'Restablecer contraseña');
    }
  });
}

export function initReactivarCuentaSolicitar() {
  const form = document.getElementById('solicitar-form');
  const bannerSlot = document.getElementById('banner-slot');
  const submitBtn = document.getElementById('submit-btn');
  const formContainer = document.getElementById('form-container');
  const codigoContainer = document.getElementById('codigo-container');
  const exitoContainer = document.getElementById('exito-container');
  const emailInput = document.getElementById('email');

  let emailSolicitado = '';

  async function solicitarCodigo(email) {
    await apiFetch('/auth/reactivar-cuenta', { method: 'POST', auth: false, body: { email } });
    emailSolicitado = email;
    formContainer.classList.add('is-hidden');
    codigoContainer.classList.remove('is-hidden');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerSlot, 'info', '');
    limpiarErrorCampo('error-email');
    if (!emailInput.value.trim()) {
      mostrarErrorCampo('error-email', 'Ingresá tu email.');
      scrollAlPrimerError();
      return;
    }
    if (!validarCamposSilencioso([{ inputId: 'email', errorId: 'error-email', validador: esEmailValido, mensaje: 'Ingresá un email con formato válido.' }])) {
      scrollAlPrimerError();
      return;
    }
    setLoading(submitBtn, 'Enviando...', true);
    try {
      await solicitarCodigo(emailInput.value.trim());
    } catch (error) {
      if (!(error instanceof ApiError && error.data && mapearErroresBackend(error.data, { email: 'error-email' }))) {
        renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos procesar tu solicitud. Intentá nuevamente.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(submitBtn, '', false, 'Enviar código de reactivación');
    }
  });

  emailInput.addEventListener('input', () => limpiarErrorCampo('error-email'));

  const codigoBannerSlot = document.getElementById('banner-slot-codigo');
  const codigoForm = document.getElementById('confirmar-form');
  const confirmarSubmitBtn = document.getElementById('confirmar-submit-btn');
  const reenviarBtn = document.getElementById('reenviar-btn');

  let intentosAgotados = false;

  const otp = crearInputOtp(document.getElementById('otp-container'), {
    onComplete: () => codigoForm.requestSubmit(),
  });

  reenviarBtn.addEventListener('click', async () => {
    renderBanner(codigoBannerSlot, 'info', '');
    try {
      await solicitarCodigo(emailSolicitado);
      intentosAgotados = false;
      confirmarSubmitBtn.disabled = false;
      otp.setDisabled(false);
      otp.reset();
      limpiarErrorCampo('error-codigo');
      renderBanner(codigoBannerSlot, 'info', 'Te enviamos un nuevo código.');
    } catch (error) {
      renderBanner(codigoBannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos reenviar el código. Intentá nuevamente.');
    }
  });

  codigoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (intentosAgotados) {
      return;
    }
    renderBanner(codigoBannerSlot, 'info', '');
    limpiarErrorCampo('error-codigo');
    if (otp.getValor().length !== 6) {
      mostrarErrorCampo('error-codigo', 'Ingresá el código de 6 dígitos.');
      scrollAlPrimerError();
      return;
    }
    setLoading(confirmarSubmitBtn, 'Reactivando...', true);
    try {
      await apiFetch('/auth/reactivar-cuenta/confirmar', {
        method: 'POST',
        auth: false,
        body: { email: emailSolicitado, codigo: otp.getValor() },
      });
      otp.marcarExito();
      codigoContainer.classList.add('is-hidden');
      exitoContainer.classList.remove('is-hidden');
    } catch (error) {
      otp.marcarError();
      if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
        mostrarErrorCampo('error-codigo', error.message || 'El código no es válido o ya venció.');
        if (error.status === 409) {
          intentosAgotados = true;
          otp.setDisabled(true);
        }
      } else {
        renderBanner(codigoBannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos reactivar tu cuenta. Intentá nuevamente.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(confirmarSubmitBtn, '', false, 'Reactivar cuenta');
    }
    if (intentosAgotados) {
      confirmarSubmitBtn.disabled = true;
    }
  });
}

export async function logout(destino = 'login.html') {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
  }
  clearSesion();
  window.location.href = destino;
}

import { apiFetch, ApiError, setSesion, clearSesion, consumirAvisoInvitacion } from './api.js';
import { resolverComercioActivo, destinoDeNavegacion } from './comercio-activo.js';
import { crearInputOtp } from './otp.js';
import { subirFotoPerfilRegistroComercio, CloudinaryUploadError } from './cloudinary.js';
import {
  MAPA_ERRORES_NEGOCIO,
  MAPA_ERRORES_LEGALES,
  CAMPOS_BACKEND_LEGALES,
  esCampoBackendDeNegocio,
  esCampoBackendDeHorarios,
  esCampoBackendDeRedesSociales,
  validarCampoRequeridoYValido,
  bindValidacionCampo,
  initFotoComercio,
  initCamposNegocio,
  initDatosLegales,
  initHorarios,
  initRedesSociales,
} from './comercio-form.js';
import {
  esPasswordSegura,
  aplicarFortalezaPassword,
  esEmailValido,
  mostrarErrorCampo,
  limpiarErrorCampo,
  mapearErroresBackend,
  validarCamposSilencioso,
  scrollAlPrimerError,
} from './validators.js';
import { montarFormularioCliente } from './cliente-form.js';
import { renderBanner, renderBannerTexto, bindPasswordToggle, setLoading, construirTelefono, bindNombreUsuario, MENSAJE_NOMBRE_USUARIO_EN_USO } from './form-utils.js';

export { LABELS_TIPO_SOCIEDAD, LABELS_CONDICION_IVA, LABELS_TIPO_COMERCIO, LABELS_TIPO_RED_SOCIAL } from './comercio-form.js';
export { construirTelefono, bindNombreUsuario } from './form-utils.js';

const MENSAJES_LOGIN_CONFLICTO = {
  'Cuenta bloqueada. Recuperá tu contraseña para desbloquearla': {
    kind: 'error',
    antes: 'Tu cuenta está bloqueada por intentos fallidos. ',
    enlace: { texto: 'Recuperá tu contraseña', href: 'recuperar-password.html' },
    despues: ' para desbloquearla.',
  },
  'Cuenta inactiva. Solicitá la reactivación de tu cuenta': {
    kind: 'warning',
    antes: 'Tu cuenta está inactiva. ',
    enlace: { texto: 'Solicitá la reactivación', href: 'reactivar-cuenta.html' },
    despues: ' para volver a ingresar.',
  },
  'Cuenta suspendida': {
    kind: 'error',
    antes: 'Tu cuenta fue suspendida. Contactá a soporte para más información.',
  },
};

function renderBannerConEnlace(slot, kind, { antes, enlace = null, despues = '' }) {
  renderBannerTexto(slot, kind, antes);
  if (!enlace) return;
  const contenido = slot.querySelector('.banner > div');
  const ancla = document.createElement('a');
  ancla.className = 'link';
  ancla.href = enlace.href;
  ancla.textContent = enlace.texto;
  contenido.append(ancla, despues);
}

export async function resolverHomePorRol(usuario) {
  if (usuario.rol === 'CLIENTE') {
    return 'index.html';
  }
  if (usuario.rol === 'ADMINISTRADOR') {
    return 'admin-dashboard.html';
  }
  const destino = await resolverComercioActivo();
  if (destino.tipo === 'sin-comercios') {
    throw new Error('El Dueño no tiene comercios');
  }
  if (destino.tipo === 'ninguno') {
    return null;
  }
  return destinoDeNavegacion(destino);
}

export function initLogin() {
  const form = document.getElementById('login-form');
  const usuarioInput = document.getElementById('nombreUsuario');
  const passwordInput = document.getElementById('password');
  const shellUsuario = document.getElementById('shell-nombre-usuario');
  const shellPassword = document.getElementById('shell-password');
  const errorCredenciales = document.getElementById('error-credenciales');
  const warningBloqueo = document.getElementById('warning-bloqueo');
  const bannerSlot = document.getElementById('banner-slot');
  const submitBtn = document.getElementById('submit-btn');

  bindPasswordToggle(document.getElementById('toggle-password'), passwordInput);

  if (new URLSearchParams(window.location.search).get('passwordActualizada') === '1') {
    renderBanner(bannerSlot, 'info', 'Tu contraseña se actualizó. Iniciá sesión con tu nueva contraseña.');
  }

  if (consumirAvisoInvitacion()) {
    import('./catalogo.js').then((modulo) => modulo.showToast('Listo, ya podés ingresar')).catch(() => {});
  }

  function limpiarErrores() {
    shellUsuario.classList.remove('input-shell--error');
    shellPassword.classList.remove('input-shell--error');
    errorCredenciales.style.display = 'none';
    warningBloqueo.style.display = 'none';
    renderBanner(bannerSlot, 'info', '');
  }

  function validarCamposCompletos() {
    const usuarioVacio = !usuarioInput.value.trim();
    const passwordVacio = !passwordInput.value;
    if (!usuarioVacio && !passwordVacio) {
      return true;
    }
    shellUsuario.classList.toggle('input-shell--error', usuarioVacio);
    shellPassword.classList.toggle('input-shell--error', passwordVacio);
    let mensaje = 'Completá tu nombre de usuario y tu contraseña.';
    if (usuarioVacio && !passwordVacio) mensaje = 'Ingresá tu nombre de usuario.';
    if (!usuarioVacio && passwordVacio) mensaje = 'Ingresá tu contraseña.';
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
        body: { nombreUsuario: usuarioInput.value.trim().toLowerCase(), password: passwordInput.value },
      });
      setSesion(data.token, data.usuario);
      await redirigirPostLogin(data.usuario);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        shellUsuario.classList.add('input-shell--error');
        shellPassword.classList.add('input-shell--error');
        errorCredenciales.textContent = 'Usuario o contraseña incorrectos. Intentá nuevamente.';
        errorCredenciales.style.display = 'flex';
        const intentosRestantes = error.data && typeof error.data.intentosRestantes === 'number' ? error.data.intentosRestantes : null;
        if (intentosRestantes === 1) {
          warningBloqueo.textContent = 'Cuidado: si fallás una vez más, tu cuenta se bloqueará.';
          warningBloqueo.style.display = 'block';
        }
        scrollAlPrimerError();
      } else if (error instanceof ApiError && error.status === 409) {
        if (error.message === 'Verificá tu email antes de iniciar sesión') {
          renderBannerConEnlace(bannerSlot, 'warning', {
            antes: 'Todavía no verificaste tu email. Ingresá el código de 6 dígitos que te enviamos al registrarte en la ',
            enlace: { texto: 'pantalla de verificación', href: 'verificar-email.html' },
            despues: '.',
          });
        } else {
          const mapeo = MENSAJES_LOGIN_CONFLICTO[error.message];
          if (mapeo) {
            renderBannerConEnlace(bannerSlot, mapeo.kind, mapeo);
          } else {
            renderBanner(bannerSlot, 'error', error.message);
          }
        }
        scrollAlPrimerError();
      } else if (error instanceof ApiError && error.data) {
        shellUsuario.classList.toggle('input-shell--error', Boolean(error.data.nombreUsuario));
        shellPassword.classList.toggle('input-shell--error', Boolean(error.data.password));
        errorCredenciales.textContent = error.data.nombreUsuario || error.data.password || error.message;
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

export function initRegistroCliente() {
  const formulario = montarFormularioCliente(document.getElementById('registro-cliente-main'), {
    antesDe: document.getElementById('exito-container'),
    onEnviar: async (payload) => {
      await apiFetch('/auth/registro/cliente', { method: 'POST', auth: false, body: payload });
      document.getElementById('ir-a-verificar-link').href = `verificar-email.html?email=${encodeURIComponent(payload.email)}`;
      formulario.ocultar();
      document.getElementById('exito-container').classList.remove('is-hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    if (formulario.pasoActual() === 1) {
      formulario.mostrarPaso(0);
    } else {
      history.back();
    }
  });
}

const CAMPOS_STEP2_BACKEND_COMERCIO = [...CAMPOS_BACKEND_LEGALES, 'nombreUsuario', 'email', 'password'];

const MAPA_ERRORES_REGISTRO_COMERCIO = {
  ...MAPA_ERRORES_NEGOCIO,
  ...MAPA_ERRORES_LEGALES,
  nombreUsuario: 'error-nombreUsuario',
  email: 'error-email',
  password: 'error-password',
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

  const mostrarErrorEnBanner = (mensaje) => {
    renderBanner(bannerSlot, 'error', mensaje);
    scrollAlPrimerError();
  };

  const foto = initFotoComercio();
  const negocio = initCamposNegocio({ foto });

  document.getElementById('continuar-btn').addEventListener('click', () => {
    renderBanner(bannerSlot, 'info', '');
    if (negocio.validar()) {
      mostrarPaso(1);
    }
  });

  const legales = initDatosLegales();

  const passwordInput = document.getElementById('password');
  const confirmarInput = document.getElementById('confirmarPassword');
  bindPasswordToggle(document.getElementById('toggle-password'), passwordInput);
  bindPasswordToggle(document.getElementById('toggle-confirmar'), confirmarInput);
  passwordInput.addEventListener('input', () => {
    aplicarFortalezaPassword(passwordInput.value, document.getElementById('strength-bars'), document.getElementById('strength-label'));
    limpiarErrorCampo('error-password');
  });
  confirmarInput.addEventListener('input', () => limpiarErrorCampo('error-confirmarPassword'));

  bindValidacionCampo('email', 'error-email', esEmailValido, 'Ingresá un email válido');
  const nombreUsuarioCtl = bindNombreUsuario();

  document.getElementById('continuar-btn-2').addEventListener('click', async () => {
    renderBanner(bannerSlot, 'info', '');
    const nombreUsuarioValido = await nombreUsuarioCtl.validarParaContinuar();
    const camposValidos = [
      nombreUsuarioValido,
      legales.validar(),
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

  const horarios = initHorarios({ mostrarError: mostrarErrorEnBanner });

  document.getElementById('continuar-btn-3').addEventListener('click', () => {
    renderBanner(bannerSlot, 'info', '');
    if (horarios.validar()) {
      mostrarPaso(3);
    }
  });

  const redesSociales = initRedesSociales({ mostrarError: mostrarErrorEnBanner });

  const submitBtn = document.getElementById('submit-btn');
  document.getElementById('form-step-4').addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerSlot, 'info', '');
    const horariosCargados = horarios.recolectar();
    const redesSocialesCargadas = redesSociales.validarYRecolectar();
    if (!redesSocialesCargadas) {
      return;
    }

    setLoading(submitBtn, 'Registrando comercio...', true);
    let fotoPerfilUrl = null;
    if (foto.obtenerArchivo()) {
      try {
        fotoPerfilUrl = await subirFotoPerfilRegistroComercio(foto.obtenerArchivo());
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
      ...legales.leerPayload(construirTelefono),
      ...negocio.leerPayloadNegocio(construirTelefono),
      nombreUsuario: document.getElementById('nombreUsuario').value.trim().toLowerCase(),
      email: document.getElementById('email').value.trim().toLowerCase(),
      password: passwordInput.value,
      horarios: horariosCargados,
      redesSociales: redesSocialesCargadas,
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
      if (error instanceof ApiError && error.status === 409 && error.message === MENSAJE_NOMBRE_USUARIO_EN_USO) {
        nombreUsuarioCtl.marcarEnUso();
        mostrarPaso(1);
        renderBanner(bannerSlot, 'error', 'Revisá los campos marcados.');
        scrollAlPrimerError();
      } else if (error instanceof ApiError && error.data && mapearErroresBackend(error.data, MAPA_ERRORES_REGISTRO_COMERCIO)) {
        const campos = Object.keys(error.data);
        const tieneErrorStep1 = campos.some(esCampoBackendDeNegocio);
        const tieneErrorStep2 = campos.some((campo) => CAMPOS_STEP2_BACKEND_COMERCIO.includes(campo));
        const tieneErrorStep4 = campos.some(esCampoBackendDeRedesSociales);
        mostrarPaso(tieneErrorStep1 ? 0 : tieneErrorStep2 ? 1 : tieneErrorStep4 ? 3 : 2);
        renderBanner(bannerSlot, 'error', 'Revisá los campos marcados.');
        scrollAlPrimerError();
      } else {
        const tieneErrorHorarios = error instanceof ApiError && error.data && Object.keys(error.data).some(esCampoBackendDeHorarios);
        mostrarPaso(tieneErrorHorarios ? 2 : 3);
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

  const emailParam = (params.get('email') || '').trim();
  const emailInputEl = document.getElementById('email-verificacion');
  const emailFieldEl = document.getElementById('field-email-verificacion');
  const pideEmail = !emailParam;

  if (pideEmail) {
    emailFieldEl.classList.remove('is-hidden');
    textoEl.textContent = 'Ingresá el email con el que te registraste y el código de 6 dígitos que te enviamos.';
    emailInputEl.addEventListener('input', () => limpiarErrorCampo('error-email-verificacion'));
  } else {
    textoEl.textContent = `Te enviamos un código de 6 dígitos al email ${emailParam}. Ingresalo acá para activar tu cuenta.`;
  }

  function obtenerEmail() {
    return pideEmail ? emailInputEl.value.trim().toLowerCase() : emailParam;
  }

  function validarEmailIngresado() {
    if (!pideEmail) return true;
    const valor = emailInputEl.value.trim();
    if (!valor) {
      mostrarErrorCampo('error-email-verificacion', 'El email es obligatorio');
      return false;
    }
    if (!esEmailValido(valor)) {
      mostrarErrorCampo('error-email-verificacion', 'Ingresá un email válido');
      return false;
    }
    return true;
  }

  async function reenviarCodigo() {
    if (!validarEmailIngresado()) {
      scrollAlPrimerError();
      return;
    }
    const email = obtenerEmail();
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
    limpiarErrorCampo('error-email-verificacion');
    const emailValido = validarEmailIngresado();
    const codigoValido = otp.getValor().length === 6;
    if (!codigoValido) {
      mostrarErrorCampo('error-codigo', 'Ingresá el código de 6 dígitos.');
    }
    if (!emailValido || !codigoValido) {
      scrollAlPrimerError();
      return;
    }
    const email = obtenerEmail();
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

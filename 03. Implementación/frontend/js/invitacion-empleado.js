import { apiFetch, ApiError, getToken, clearSesion, marcarAvisoInvitacion } from './api.js';
import { crearInputOtp } from './otp.js';
import { montarFormularioCliente } from './cliente-form.js';
import { renderBannerTexto, setLoading } from './form-utils.js';
import { esEmailValido, mostrarErrorCampo, limpiarErrorCampo, scrollAlPrimerError } from './validators.js';

const RUTA_VALIDAR = '/auth/invitaciones-empleado/validar';
const RUTA_ACEPTAR = '/auth/invitaciones-empleado/aceptar';

const OPCIONES_PUBLICAS = { auth: false, handle5xxGlobally: false, handleRedGlobally: false };

const MENSAJE_SIN_CONEXION = 'No pudimos conectar. Probá de nuevo.';
const MENSAJE_LIMITE = 'Demasiados intentos. Probá de nuevo en un minuto.';
const MENSAJE_CODIGO_INVALIDO = 'El código es incorrecto o la invitación ya no está vigente. Pedí que te reenvíen la invitación.';
const MENSAJE_DNI_DUPLICADO = 'Ya existe una cuenta registrada con ese DNI';

const TITULOS = {
  codigo: 'Tengo una invitación',
  existente: 'Invitación',
  nueva: 'Crear tu cuenta',
  exito: 'Invitación',
};

const ERRORES_DE_CAMPO_CODIGO = {
  email: 'error-email-invitacion',
  codigo: 'error-codigo-invitacion',
};

function iniciales(nombre) {
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) {
    return '?';
  }
  return palabras.slice(0, 2).map((palabra) => palabra.charAt(0).toUpperCase()).join('');
}

function pintarAvatar(contenedor, nombre, fotoUrl) {
  contenedor.replaceChildren();
  const pintarIniciales = () => {
    contenedor.replaceChildren();
    const texto = document.createElement('span');
    texto.className = 'avatar-inicial';
    texto.textContent = iniciales(nombre);
    contenedor.appendChild(texto);
  };
  if (!fotoUrl) {
    pintarIniciales();
    return;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.addEventListener('error', pintarIniciales);
  img.src = fotoUrl;
  contenedor.appendChild(img);
}

function textoDeError(error) {
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) {
    return MENSAJE_SIN_CONEXION;
  }
  if (error.status === 429) {
    return MENSAJE_LIMITE;
  }
  return error.message || MENSAJE_SIN_CONEXION;
}

export function initInvitacionEmpleado() {
  const titulo = document.getElementById('titulo-pagina');
  const backBtn = document.getElementById('back-btn');
  const vistas = {
    codigo: document.getElementById('vista-codigo'),
    existente: document.getElementById('vista-existente'),
    nueva: document.getElementById('vista-nueva'),
    exito: document.getElementById('vista-exito'),
  };
  const formCodigo = document.getElementById('form-codigo');
  const emailInput = document.getElementById('email-invitacion');
  const continuarBtn = document.getElementById('continuar-codigo-btn');
  const bannerCodigo = document.getElementById('banner-slot-codigo');
  const bannerExistente = document.getElementById('banner-slot-existente');
  const aceptarBtn = document.getElementById('aceptar-btn');

  const otp = crearInputOtp(document.getElementById('otp-container'));

  let vistaActual = 'codigo';
  let invitacion = null;
  let formulario = null;

  function mostrarVista(nombre) {
    vistaActual = nombre;
    Object.entries(vistas).forEach(([clave, seccion]) => seccion.classList.toggle('is-hidden', clave !== nombre));
    titulo.textContent = TITULOS[nombre];
    backBtn.classList.toggle('is-hidden', nombre === 'exito');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limpiarErroresCodigo() {
    limpiarErrorCampo('error-email-invitacion');
    limpiarErrorCampo('error-codigo-invitacion');
    renderBannerTexto(bannerCodigo, 'info', '');
  }

  function validarEntradaCodigo(email) {
    let valido = true;
    if (!email) {
      mostrarErrorCampo('error-email-invitacion', 'El email es obligatorio');
      valido = false;
    } else if (!esEmailValido(email)) {
      mostrarErrorCampo('error-email-invitacion', 'Ingresá un email válido');
      valido = false;
    }
    if (otp.getValor().length !== 6) {
      mostrarErrorCampo('error-codigo-invitacion', 'Ingresá el código de 6 dígitos.');
      valido = false;
    }
    return valido;
  }

  function mostrarErrorDeValidar(error) {
    if (error instanceof ApiError && error.status === 401) {
      mostrarErrorCampo('error-codigo-invitacion', error.message || MENSAJE_CODIGO_INVALIDO);
      otp.marcarError();
      return;
    }
    if (error instanceof ApiError && error.status === 400 && error.data) {
      const hayCampos = Object.entries(error.data).reduce((aplico, [campo, mensaje]) => {
        const errorId = ERRORES_DE_CAMPO_CODIGO[campo];
        if (!errorId) {
          return aplico;
        }
        mostrarErrorCampo(errorId, mensaje);
        return true;
      }, false);
      if (hayCampos) {
        return;
      }
    }
    renderBannerTexto(bannerCodigo, 'error', textoDeError(error));
  }

  function mostrarExistente(datos) {
    pintarAvatar(document.getElementById('avatar-comercio'), datos.comercioNombre, datos.comercioFotoPerfilUrl);
    document.getElementById('existente-comercio').textContent = datos.comercioNombre;
    document.getElementById('existente-email').textContent = invitacion.email;
    renderBannerTexto(bannerExistente, 'info', '');
    mostrarVista('existente');
  }

  async function enviarCuentaNueva(payload) {
    const { aceptaTerminos, ...cuentaNueva } = payload;
    try {
      const respuesta = await apiFetch(RUTA_ACEPTAR, {
        method: 'POST',
        body: { email: invitacion.email, codigo: invitacion.codigo, aceptaTerminos, cuentaNueva },
        conMensaje: true,
        ...OPCIONES_PUBLICAS,
      });
      mostrarExito(respuesta.mensaje);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.message === MENSAJE_DNI_DUPLICADO) {
        throw new ApiError(400, error.message, { 'cuentaNueva.dni': error.message });
      }
      if (error instanceof ApiError) {
        throw new ApiError(error.status, textoDeError(error), error.status === 400 || error.status === 409 ? error.data : null);
      }
      throw error;
    }
  }

  function mostrarNueva(datos) {
    document.getElementById('nueva-subtitulo').textContent = `Para sumarte a ${datos.comercioNombre}`;
    if (!formulario) {
      formulario = montarFormularioCliente(vistas.nueva, {
        incluirEmail: false,
        prefijoErrores: 'cuentaNueva.',
        mostrarEnlaceLogin: false,
        textos: { botonFinal: 'Crear cuenta y aceptar', botonFinalCargando: 'Creando cuenta...' },
        onEnviar: enviarCuentaNueva,
      });
    }
    mostrarVista('nueva');
  }

  function mostrarExito(mensaje) {
    const comercioNombre = invitacion ? invitacion.comercioNombre : '';
    document.getElementById('exito-mensaje').textContent = mensaje || `Ya sos parte del equipo de ${comercioNombre}`;
    invitacion = null;
    mostrarVista('exito');
  }

  emailInput.addEventListener('input', () => limpiarErrorCampo('error-email-invitacion'));

  formCodigo.addEventListener('submit', async (event) => {
    event.preventDefault();
    limpiarErroresCodigo();
    const email = emailInput.value.trim().toLowerCase();
    if (!validarEntradaCodigo(email)) {
      scrollAlPrimerError();
      return;
    }
    const codigo = otp.getValor();
    setLoading(continuarBtn, 'Verificando...', true);
    try {
      const datos = await apiFetch(RUTA_VALIDAR, { method: 'POST', body: { email, codigo }, ...OPCIONES_PUBLICAS });
      invitacion = { email, codigo, comercioNombre: datos.comercioNombre };
      if (datos.cuentaExistente) {
        mostrarExistente(datos);
      } else {
        mostrarNueva(datos);
      }
    } catch (error) {
      mostrarErrorDeValidar(error);
      scrollAlPrimerError();
    } finally {
      setLoading(continuarBtn, '', false, 'Continuar');
    }
  });

  aceptarBtn.addEventListener('click', async () => {
    renderBannerTexto(bannerExistente, 'info', '');
    setLoading(aceptarBtn, 'Aceptando...', true);
    try {
      const respuesta = await apiFetch(RUTA_ACEPTAR, {
        method: 'POST',
        body: { email: invitacion.email, codigo: invitacion.codigo },
        conMensaje: true,
        ...OPCIONES_PUBLICAS,
      });
      mostrarExito(respuesta.mensaje);
    } catch (error) {
      renderBannerTexto(bannerExistente, 'error', textoDeError(error));
      scrollAlPrimerError();
    } finally {
      setLoading(aceptarBtn, '', false, 'Aceptar invitación');
    }
  });

  document.getElementById('exito-login-btn').addEventListener('click', () => {
    if (getToken()) {
      clearSesion();
    }
    marcarAvisoInvitacion();
    window.location.href = 'login.html';
  });

  backBtn.addEventListener('click', () => {
    if (vistaActual === 'codigo') {
      window.location.href = 'login.html';
      return;
    }
    if (vistaActual === 'nueva' && formulario && formulario.pasoActual() === 1) {
      formulario.mostrarPaso(0);
      return;
    }
    mostrarVista('codigo');
  });
}

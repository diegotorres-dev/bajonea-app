import { apiFetch, ApiError, getUsuario } from './api.js';
import { subirFotoNuevoComercio, CloudinaryUploadError } from './cloudinary.js';
import { construirTelefono } from './auth.js';
import {
  initFotoComercio,
  initCamposNegocio,
  initHorarios,
  initRedesSociales,
  mostrarModalConfirmarSalida,
  MAPA_ERRORES_NEGOCIO,
  esCampoBackendDeNegocio,
  esCampoBackendDeHorarios,
  esCampoBackendDeRedesSociales,
} from './comercio-form.js';
import { mapearErroresBackend, mostrarErrorCampo, scrollAlPrimerError } from './validators.js';

const ICONO_ERROR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

const TEXTO_AVISO_CON_MERCADOPAGO = 'Usamos los datos fiscales y la cuenta de MercadoPago de tu cuenta. No hace falta cargarlos de nuevo.';
const TEXTO_AVISO_SIN_MERCADOPAGO = 'Usamos los datos fiscales de tu cuenta. No hace falta cargarlos de nuevo.';
const DESTINO_INICIO = 'comercio-dashboard.html';

function mostrar(id) {
  document.getElementById(id).classList.remove('is-hidden');
}

function ocultar(id) {
  document.getElementById(id).classList.add('is-hidden');
}

function renderBannerError(slot, mensaje) {
  slot.innerHTML = '';
  if (!mensaje) {
    return;
  }
  const banner = document.createElement('div');
  banner.className = 'banner banner-error';
  banner.style.marginBottom = '20px';
  banner.setAttribute('role', 'alert');
  const icono = document.createElement('span');
  icono.innerHTML = ICONO_ERROR;
  icono.style.display = 'contents';
  const texto = document.createElement('div');
  texto.textContent = mensaje;
  banner.appendChild(icono);
  banner.appendChild(texto);
  slot.appendChild(banner);
}

function setLoading(button, texto, cargando) {
  if (cargando) {
    button.dataset.originalHtml = button.innerHTML;
    button.textContent = texto;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalHtml || button.innerHTML;
    button.disabled = false;
  }
}

function irAlInicio() {
  window.location.href = DESTINO_INICIO;
}

export async function initAgregarComercio() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return;
  }

  const bannerSlot = document.getElementById('banner-slot');
  const steps = [document.getElementById('step-1'), document.getElementById('step-2'), document.getElementById('step-3')];
  const bars = document.querySelectorAll('.step-progress__bar');
  const labels = document.querySelectorAll('.step-progress__labels span');
  let currentStep = 0;
  let wizardActivo = false;

  function mostrarPaso(index) {
    steps.forEach((step, i) => step.classList.toggle('is-hidden', i !== index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--done', i < index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--active', i <= index));
    labels.forEach((label, i) => label.classList.toggle('is-active', i === index));
    currentStep = index;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  let foto = null;
  let negocio = null;

  function hayDatosEnElPasoUno() {
    return Boolean(foto.obtenerArchivo()) || negocio.hayDatosCargados();
  }

  document.getElementById('back-btn').addEventListener('click', () => {
    if (!wizardActivo) {
      irAlInicio();
      return;
    }
    if (currentStep > 0) {
      mostrarPaso(currentStep - 1);
      return;
    }
    if (hayDatosEnElPasoUno()) {
      mostrarModalConfirmarSalida({
        texto: 'Vas a perder lo que cargaste',
        textoSeguir: 'Seguir cargando',
        testidSeguir: 'btn-seguir-cargando',
        onSalir: irAlInicio,
      });
      return;
    }
    irAlInicio();
  });

  let elegibilidad;
  let cuentaMercadoPago;
  try {
    [elegibilidad, cuentaMercadoPago] = await Promise.all([
      apiFetch('/comercios/alta-adicional/elegibilidad'),
      apiFetch('/oauth/mercadopago/cuenta').catch(() => null),
    ]);
  } catch (error) {
    ocultar('cargando-container');
    const mensaje = error instanceof ApiError ? error.message : 'No pudimos cargar la página. Intentá nuevamente.';
    renderBannerError(bannerSlot, mensaje);
    mostrar('wizard-container');
    ocultar('step-1');
    return;
  }

  ocultar('cargando-container');

  if (!elegibilidad.elegible) {
    mostrar('no-elegible-container');
    return;
  }

  document.getElementById('aviso-datos-reutilizados-texto').textContent = cuentaMercadoPago && cuentaMercadoPago.vinculada
    ? TEXTO_AVISO_CON_MERCADOPAGO
    : TEXTO_AVISO_SIN_MERCADOPAGO;

  mostrar('step-progress-container');
  mostrar('wizard-container');
  wizardActivo = true;

  const mostrarErrorEnBanner = (mensaje) => {
    renderBannerError(bannerSlot, mensaje);
    scrollAlPrimerError();
  };

  foto = initFotoComercio();
  negocio = initCamposNegocio({ foto });
  const horarios = initHorarios({ mostrarError: mostrarErrorEnBanner });
  const redesSociales = initRedesSociales({ mostrarError: mostrarErrorEnBanner });

  document.getElementById('continuar-btn').addEventListener('click', () => {
    renderBannerError(bannerSlot, '');
    if (negocio.validar()) {
      mostrarPaso(1);
    }
  });

  document.getElementById('continuar-btn-2').addEventListener('click', () => {
    renderBannerError(bannerSlot, '');
    if (horarios.validar()) {
      mostrarPaso(2);
    }
  });

  const submitBtn = document.getElementById('submit-btn');
  document.getElementById('form-step-3').addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBannerError(bannerSlot, '');
    const redes = redesSociales.validarYRecolectar();
    if (!redes) {
      return;
    }

    setLoading(submitBtn, 'Enviando solicitud...', true);
    try {
      let fotoPerfilUrl;
      try {
        fotoPerfilUrl = await subirFotoNuevoComercio(foto.obtenerArchivo());
      } catch (error) {
        mostrarPaso(0);
        mostrarErrorEnBanner(error instanceof CloudinaryUploadError || error instanceof ApiError
          ? error.message
          : 'No pudimos subir la foto. Intentá nuevamente.');
        return;
      }
      const payload = {
        ...negocio.leerPayloadNegocio(construirTelefono),
        fotoPerfilUrl,
        horarios: horarios.recolectar(),
        redesSociales: redes,
      };
      const comercio = await apiFetch('/comercios', { method: 'POST', body: payload });
      document.getElementById('exito-texto').textContent = `${comercio.nombre} está en revisión. El equipo de Bajoneá revisará tu solicitud y te notificaremos cuando tengamos una respuesta`;
      wizardActivo = false;
      ocultar('wizard-container');
      ocultar('step-progress-container');
      mostrar('exito-container');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        mostrarPaso(0);
        mostrarErrorEnBanner('No pudimos enviar tu solicitud. Intentá nuevamente.');
        return;
      }
      const campos = error.data && typeof error.data === 'object' ? Object.keys(error.data) : [];
      if (error.status === 400 && campos.length > 0) {
        mapearErroresBackend(error.data, MAPA_ERRORES_NEGOCIO);
        const tieneNegocio = campos.some(esCampoBackendDeNegocio);
        const claveHorarios = campos.find(esCampoBackendDeHorarios);
        const claveRedes = campos.find(esCampoBackendDeRedesSociales);
        if (tieneNegocio) {
          mostrarPaso(0);
          mostrarErrorEnBanner('Revisá los campos marcados.');
        } else if (claveHorarios) {
          mostrarPaso(1);
          mostrarErrorCampo('error-horarios', error.data[claveHorarios]);
          mostrarErrorEnBanner('Revisá los horarios cargados.');
        } else if (claveRedes) {
          mostrarPaso(2);
          mostrarErrorEnBanner(error.data[claveRedes]);
        } else {
          mostrarPaso(0);
          mostrarErrorEnBanner('Revisá los campos marcados.');
        }
        return;
      }
      mostrarPaso(0);
      mostrarErrorEnBanner(error.message);
    } finally {
      setLoading(submitBtn, '', false);
    }
  });
}

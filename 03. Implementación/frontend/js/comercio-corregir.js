import { apiFetch, ApiError, getUsuario } from './api.js';
import { subirFotoCorreccionComercio, CloudinaryUploadError } from './cloudinary.js';
import { construirTelefono, resolverHomePorRol } from './auth.js';
import { crearBloqueMotivoRechazo } from './catalogo.js';
import {
  initFotoComercio,
  initCamposNegocio,
  initDatosLegales,
  initHorarios,
  initRedesSociales,
  mostrarModalConfirmarSalida,
  MAPA_ERRORES_NEGOCIO,
  MAPA_ERRORES_LEGALES_ANIDADOS,
  esCampoBackendDeNegocio,
  esCampoBackendDeHorarios,
  esCampoBackendDeRedesSociales,
} from './comercio-form.js';
import { mapearErroresBackend, mostrarErrorCampo, scrollAlPrimerError } from './validators.js';

const ICONO_ERROR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

const DESTINO_INICIO = 'comercio-dashboard.html';
const PREFIJO_MENSAJE_VERSION = 'La solicitud cambió';
const PREFIJO_MENSAJE_DUPLICADO = 'Ya tenés un comercio con ese nombre';
const MENSAJE_ERROR_CARGA = 'No pudimos cargar la solicitud. Intentá nuevamente.';

const MAPA_ERRORES_CORRECCION = {
  ...MAPA_ERRORES_NEGOCIO,
  ...MAPA_ERRORES_LEGALES_ANIDADOS,
};

function mostrar(id) {
  document.getElementById(id).classList.remove('is-hidden');
}

function ocultar(id) {
  document.getElementById(id).classList.add('is-hidden');
}

function renderBannerError(slot, mensaje, { accion = null } = {}) {
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
  const cuerpo = document.createElement('div');
  const texto = document.createElement('div');
  texto.textContent = mensaje;
  cuerpo.appendChild(texto);
  if (accion) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-secondary banner__accion';
    boton.setAttribute('data-testid', accion.testid);
    boton.textContent = accion.texto;
    boton.addEventListener('click', accion.onClick);
    cuerpo.appendChild(boton);
  }
  banner.appendChild(icono);
  banner.appendChild(cuerpo);
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

async function irAlHome(usuario) {
  let destino = null;
  try {
    destino = await resolverHomePorRol(usuario);
  } catch {
    destino = null;
  }
  window.location.href = destino || DESTINO_INICIO;
}

function ordenarFranjas(franjas) {
  return [...franjas].sort((a, b) => `${a.diaSemana}${a.horaApertura}${a.horaCierre}`.localeCompare(`${b.diaSemana}${b.horaApertura}${b.horaCierre}`));
}

function ordenarRedes(redes) {
  return [...redes].sort((a, b) => a.tipo.localeCompare(b.tipo));
}

export async function initComercioCorregir() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return;
  }

  const comercioId = Number(new URLSearchParams(window.location.search).get('id'));
  if (!Number.isInteger(comercioId) || comercioId <= 0) {
    await irAlHome(usuario);
    return;
  }

  const bannerSlot = document.getElementById('banner-slot');
  let wizardActivo = false;
  let pasoActual = 0;
  let pasos = [];
  let estadoInicial = null;
  let estadoActual = () => null;

  function irAlInicio() {
    window.location.href = DESTINO_INICIO;
  }

  function mostrarPaso(indice) {
    pasos.forEach((paso, i) => document.getElementById(paso.id).classList.toggle('is-hidden', i !== indice));
    const barras = document.querySelectorAll('#step-progress-bars .step-progress__bar');
    const etiquetas = document.querySelectorAll('#step-progress-labels span');
    barras.forEach((barra, i) => {
      barra.classList.toggle('step-progress__bar--done', i < indice);
      barra.classList.toggle('step-progress__bar--active', i <= indice);
    });
    etiquetas.forEach((etiqueta, i) => etiqueta.classList.toggle('is-active', i === indice));
    pasoActual = indice;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function irAlPasoPorId(id) {
    const indice = pasos.findIndex((paso) => paso.id === id);
    mostrarPaso(indice >= 0 ? indice : 0);
  }

  document.getElementById('back-btn').addEventListener('click', () => {
    if (!wizardActivo) {
      irAlInicio();
      return;
    }
    if (pasoActual > 0) {
      mostrarPaso(pasoActual - 1);
      return;
    }
    if (estadoActual() !== estadoInicial) {
      mostrarModalConfirmarSalida({
        texto: 'Vas a perder lo que cambiaste',
        textoSeguir: 'Seguir editando',
        testidSeguir: 'btn-seguir-editando',
        onSalir: irAlInicio,
      });
      return;
    }
    irAlInicio();
  });

  let correccion;
  try {
    correccion = await apiFetch(`/comercios/${comercioId}/correccion`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await irAlHome(usuario);
      return;
    }
    ocultar('cargando-container');
    mostrar('wizard-container');
    ocultar('step-negocio');
    renderBannerError(bannerSlot, error instanceof ApiError ? error.message : MENSAJE_ERROR_CARGA);
    return;
  }

  const puedeCorregirLegales = Boolean(correccion.puedeCorregirDatosLegales && correccion.legales);

  const intentoBadge = document.getElementById('intento-badge');
  intentoBadge.textContent = `Intento ${correccion.intentoActual} de ${correccion.maximoResolicitudes}`;
  intentoBadge.classList.remove('is-hidden');

  if (correccion.motivoRechazo) {
    const slotMotivo = document.getElementById('motivo-rechazo-slot');
    slotMotivo.appendChild(crearBloqueMotivoRechazo({
      titulo: 'Motivo del rechazo',
      motivo: correccion.motivoRechazo,
      testid: 'motivo-rechazo-correccion',
    }));
    slotMotivo.classList.remove('is-hidden');
  }

  pasos = [{ id: 'step-negocio', etiqueta: 'Negocio' }];
  if (puedeCorregirLegales) {
    pasos.push({ id: 'step-legales', etiqueta: 'Legales' });
  } else {
    document.getElementById('step-legales').remove();
  }
  pasos.push({ id: 'step-horarios', etiqueta: 'Horarios' }, { id: 'step-redes', etiqueta: 'Redes' });

  const barras = document.getElementById('step-progress-bars');
  const etiquetas = document.getElementById('step-progress-labels');
  pasos.forEach((paso, i) => {
    const barra = document.createElement('div');
    barra.className = 'step-progress__bar';
    barras.appendChild(barra);
    const etiqueta = document.createElement('span');
    etiqueta.textContent = `${i + 1}. ${paso.etiqueta}`;
    etiquetas.appendChild(etiqueta);
  });

  const mostrarErrorEnBanner = (mensaje, opciones) => {
    renderBannerError(bannerSlot, mensaje, opciones);
    scrollAlPrimerError();
  };

  const foto = initFotoComercio({ urlExistente: correccion.fotoPerfilUrl });
  const negocio = initCamposNegocio({ foto });
  const legales = puedeCorregirLegales ? initDatosLegales() : null;
  const horarios = initHorarios({ mostrarError: mostrarErrorEnBanner });
  const redesSociales = initRedesSociales({ mostrarError: mostrarErrorEnBanner });

  await negocio.precargar(correccion);
  if (legales) {
    legales.precargar(correccion.legales);
  }
  horarios.precargar(correccion.horarios);
  redesSociales.precargar(correccion.redesSociales);

  estadoActual = () => JSON.stringify({
    negocio: negocio.snapshot(),
    foto: foto.obtenerArchivo() ? 'nueva' : 'actual',
    legales: legales ? legales.snapshot() : null,
    horarios: ordenarFranjas(horarios.recolectar()),
    redes: ordenarRedes(redesSociales.recolectar()),
  });
  estadoInicial = estadoActual();

  ocultar('cargando-container');
  mostrar('step-progress-container');
  mostrar('wizard-container');
  wizardActivo = true;
  mostrarPaso(0);

  document.getElementById('continuar-negocio-btn').addEventListener('click', () => {
    renderBannerError(bannerSlot, '');
    if (negocio.validar()) {
      mostrarPaso(pasoActual + 1);
    }
  });

  if (legales) {
    document.getElementById('continuar-legales-btn').addEventListener('click', () => {
      renderBannerError(bannerSlot, '');
      if (legales.validar()) {
        mostrarPaso(pasoActual + 1);
      }
    });
  }

  document.getElementById('continuar-horarios-btn').addEventListener('click', () => {
    renderBannerError(bannerSlot, '');
    if (horarios.validar()) {
      mostrarPaso(pasoActual + 1);
    }
  });

  function recargarDatos() {
    window.location.reload();
  }

  const submitBtn = document.getElementById('submit-btn');
  document.getElementById('form-redes').addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBannerError(bannerSlot, '');
    const redes = redesSociales.validarYRecolectar();
    if (!redes) {
      return;
    }

    setLoading(submitBtn, 'Enviando solicitud...', true);
    try {
      let fotoPerfilUrl = correccion.fotoPerfilUrl;
      if (foto.obtenerArchivo()) {
        try {
          fotoPerfilUrl = await subirFotoCorreccionComercio(comercioId, foto.obtenerArchivo());
        } catch (error) {
          irAlPasoPorId('step-negocio');
          mostrarErrorEnBanner(error instanceof CloudinaryUploadError || error instanceof ApiError
            ? error.message
            : 'No pudimos subir la foto. Intentá nuevamente.');
          return;
        }
      }
      const payload = {
        ...negocio.leerPayloadNegocio(construirTelefono),
        fotoPerfilUrl,
        horarios: horarios.recolectar(),
        redesSociales: redes,
        tokenVersion: correccion.tokenVersion,
      };
      if (legales) {
        payload.legales = legales.leerPayload(construirTelefono);
      }
      const comercio = await apiFetch(`/comercios/${comercioId}/resolicitud`, { method: 'PUT', body: payload });
      document.getElementById('exito-texto').textContent = `${comercio.nombre} está en revisión. El equipo de Bajoneá revisará tu solicitud y te notificaremos cuando tengamos una respuesta`;
      wizardActivo = false;
      ocultar('wizard-container');
      ocultar('step-progress-container');
      ocultar('motivo-rechazo-slot');
      ocultar('intento-badge');
      mostrar('exito-container');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        mostrarErrorEnBanner('No pudimos enviar tu solicitud. Intentá nuevamente.');
        return;
      }
      if (error.status === 404) {
        await irAlHome(usuario);
        return;
      }
      const campos = error.data && typeof error.data === 'object' ? Object.keys(error.data) : [];
      if (error.status === 400 && campos.length > 0) {
        mapearErroresBackend(error.data, MAPA_ERRORES_CORRECCION);
        const claveHorarios = campos.find(esCampoBackendDeHorarios);
        const claveRedes = campos.find(esCampoBackendDeRedesSociales);
        if (campos.some(esCampoBackendDeNegocio)) {
          irAlPasoPorId('step-negocio');
          mostrarErrorEnBanner('Revisá los campos marcados.');
        } else if (legales && campos.some((campo) => campo.startsWith('legales'))) {
          irAlPasoPorId('step-legales');
          mostrarErrorEnBanner('Revisá los campos marcados.');
        } else if (claveHorarios) {
          irAlPasoPorId('step-horarios');
          mostrarErrorCampo('error-horarios', error.data[claveHorarios]);
          mostrarErrorEnBanner('Revisá los horarios cargados.');
        } else if (claveRedes) {
          irAlPasoPorId('step-redes');
          mostrarErrorEnBanner(error.data[claveRedes]);
        } else {
          mostrarErrorEnBanner(error.message);
        }
        return;
      }
      if (error.status === 409 && error.message.startsWith(PREFIJO_MENSAJE_VERSION)) {
        mostrarErrorEnBanner(error.message, {
          accion: { texto: 'Recargar los datos', testid: 'btn-recargar-datos', onClick: recargarDatos },
        });
        return;
      }
      if (error.status === 409 && error.message.startsWith(PREFIJO_MENSAJE_DUPLICADO)) {
        irAlPasoPorId('step-negocio');
      } else if (error.status === 409 && legales && /CUIT|DNI/.test(error.message)) {
        irAlPasoPorId('step-legales');
      }
      mostrarErrorEnBanner(error.message);
    } finally {
      setLoading(submitBtn, '', false);
    }
  });
}

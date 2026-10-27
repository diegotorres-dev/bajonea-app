import { apiFetch, ApiError } from './api.js';
import { showToast } from './catalogo.js';
import { getComercioActivoEnMemoria, suscribirComercios } from './comercio-activo.js';
import { h } from './form-utils.js';
import { icono } from './documentos-comun.js';

const RUTA_DOCUMENTACION = 'comercio-documentacion.html?desde=panel';
const CLAVE_PREFIJO = 'bajonea_pasos_vender_';

function leerMarca(comercioId) {
  try {
    return window.localStorage.getItem(`${CLAVE_PREFIJO}${comercioId}`) === '1';
  } catch {
    return false;
  }
}

function escribirMarca(comercioId, activa) {
  try {
    if (activa) {
      window.localStorage.setItem(`${CLAVE_PREFIJO}${comercioId}`, '1');
    } else {
      window.localStorage.removeItem(`${CLAVE_PREFIJO}${comercioId}`);
    }
  } catch {
    return;
  }
}

function crearBotonEnlace(texto, href, testid, secundario) {
  const enlace = h('a', { class: `btn ${secundario ? 'btn-secondary' : 'btn-primary'} paso__boton`, href, 'data-testid': testid });
  enlace.textContent = texto;
  return enlace;
}

async function vincularMercadoPago() {
  try {
    const { url } = await apiFetch('/oauth/mercadopago/iniciar');
    window.location.href = url;
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : 'No pudimos iniciar la vinculación con Mercado Pago', 'error');
  }
}

function textoPendientes(cantidad) {
  const sujeto = cantidad === 1 ? '1 documento esperando' : `${cantidad} documentos esperando`;
  return `Tenés ${sujeto} la aprobación. Te avisamos cuando esté.`;
}

function pasoDeDocumentacion(requisitos, mpListo) {
  if (requisitos.documentosPendientes > 0) {
    return {
      clave: 'documentacion',
      estado: 'revision',
      titulo: 'Documentación en revisión',
      texto: textoPendientes(requisitos.documentosPendientes),
      accion: crearBotonEnlace('Ver documentación', RUTA_DOCUMENTACION, 'btn-pasos-ver-documentacion', true),
    };
  }
  if (requisitos.documentosAprobados > 0) {
    const enlace = h('a', { class: 'paso__enlace', href: RUTA_DOCUMENTACION, 'data-testid': 'btn-pasos-ver-documentacion' });
    enlace.textContent = 'Ver documentación';
    return { clave: 'documentacion', estado: 'hecho', titulo: 'Documentación aprobada', texto: null, accion: enlace };
  }
  if (requisitos.documentosRechazados > 0) {
    const cantidad = requisitos.documentosRechazados;
    return {
      clave: 'documentacion',
      estado: 'atencion',
      titulo: cantidad === 1 ? 'Tenés un documento rechazado' : `Tenés ${cantidad} documentos rechazados`,
      texto: 'Revisá el motivo y subí uno nuevo.',
      accion: crearBotonEnlace('Ver documentación', RUTA_DOCUMENTACION, 'btn-pasos-ver-documentacion', false),
    };
  }
  return {
    clave: 'documentacion',
    estado: 'pendiente',
    titulo: 'Subir documentación',
    texto: 'Habilitación comercial, carnet de manipulación o libreta sanitaria. La revisamos y te avisamos.',
    accion: crearBotonEnlace('Subir documentación', `${RUTA_DOCUMENTACION}&subir=1`, 'btn-pasos-subir-documentacion', !mpListo),
  };
}

function armarPasos(requisitos) {
  const mpListo = requisitos.cuentaMercadoPagoVinculada;
  const pasos = [{ clave: 'aprobado', estado: 'hecho', titulo: 'Comercio aprobado', texto: null, accion: null }];
  if (mpListo) {
    pasos.push({ clave: 'mercadopago', estado: 'hecho', titulo: 'Mercado Pago vinculado', texto: null, accion: null });
  } else {
    const vincular = h('button', { type: 'button', class: 'btn btn-primary paso__boton', 'data-testid': 'btn-pasos-vincular-mp' });
    vincular.textContent = 'Vincular ahora';
    vincular.addEventListener('click', vincularMercadoPago);
    pasos.push({ clave: 'mercadopago', estado: 'pendiente', titulo: 'Vincular Mercado Pago', texto: 'Es la cuenta donde vas a cobrar tus ventas.', accion: vincular });
  }
  if (requisitos.documentacionRequerida) {
    pasos.push(pasoDeDocumentacion(requisitos, mpListo));
  }
  return pasos;
}

function crearMarca(paso, numero, esActual) {
  const marca = h('span', { class: 'paso__marca', 'aria-hidden': 'true' });
  if (paso.estado === 'hecho') {
    marca.append(icono('tilde'));
  } else if (paso.estado === 'revision') {
    marca.append(icono('reloj'));
  } else if (paso.estado === 'atencion') {
    marca.append(icono('alerta'));
  } else {
    marca.textContent = String(numero);
    if (esActual) {
      marca.classList.add('paso__marca--actual');
    }
  }
  return marca;
}

function crearBloque(pasos, { completo }) {
  const indiceActual = pasos.findIndex((paso) => paso.estado !== 'hecho');
  const titulo = h('h2', { class: 'pasos-vender__titulo', id: 'pasos-vender-titulo', 'data-testid': 'titulo-pasos-vender' });
  titulo.textContent = completo ? 'Todo listo' : 'Para empezar a vender';
  const lista = h('ol', { class: 'pasos-vender__lista', 'data-testid': 'lista-pasos-vender' });
  pasos.forEach((paso, indice) => {
    const cuerpo = h('div', { class: 'paso__cuerpo' });
    const tituloPaso = h('h3', { class: 'paso__titulo', 'data-testid': `titulo-paso-${paso.clave}` });
    tituloPaso.textContent = paso.titulo;
    cuerpo.append(tituloPaso);
    if (paso.texto) {
      const texto = h('p', { class: 'paso__texto', 'data-testid': `texto-paso-${paso.clave}` });
      texto.textContent = paso.texto;
      cuerpo.append(texto);
    }
    if (paso.accion) {
      cuerpo.append(paso.accion);
    }
    const esActual = indice === indiceActual;
    lista.append(h('li', { class: `paso paso--${paso.estado}${esActual ? ' paso--actual' : ''}`, 'data-estado': paso.estado, 'data-testid': `paso-${paso.clave}`, ...(esActual ? { 'aria-current': 'step' } : {}) }, [crearMarca(paso, indice + 1, esActual), cuerpo]));
  });
  const bloque = h('section', { class: 'pasos-vender', 'aria-labelledby': 'pasos-vender-titulo', 'data-testid': 'pasos-vender' }, [titulo, lista]);
  return bloque;
}

export function montarPasosParaVender(slot) {
  let firma = '';
  let actualizando = false;

  async function actualizar() {
    if (actualizando) {
      return;
    }
    actualizando = true;
    try {
      const requisitos = await apiFetch('/comercios/documentos/requisitos', { handle5xxGlobally: false, handleRedGlobally: false });
      const comercioId = getComercioActivoEnMemoria()?.id ?? 0;
      if (requisitos.estadoComercio === 'APROBADO') {
        escribirMarca(comercioId, true);
        slot.replaceChildren(crearBloque(armarPasos(requisitos), { completo: false }));
        return;
      }
      if (requisitos.aptoVenta && leerMarca(comercioId)) {
        escribirMarca(comercioId, false);
        const pasos = armarPasos(requisitos);
        const bloque = crearBloque(pasos, { completo: true });
        const exito = h('div', { class: 'banner banner-success pasos-vender__exito', role: 'status', 'data-testid': 'aviso-pasos-completos' });
        exito.textContent = 'Tu comercio ya puede recibir pedidos.';
        const entendido = h('button', { type: 'button', class: 'btn btn-secondary pasos-vender__cerrar', 'data-testid': 'btn-pasos-entendido' });
        entendido.textContent = 'Entendido';
        entendido.addEventListener('click', () => slot.replaceChildren());
        bloque.append(exito, entendido);
        slot.replaceChildren(bloque);
        return;
      }
      if (!slot.querySelector('[data-testid="aviso-pasos-completos"]')) {
        slot.replaceChildren();
      }
    } catch {
      return;
    } finally {
      actualizando = false;
    }
  }

  function firmaActual() {
    const activo = getComercioActivoEnMemoria();
    return activo ? `${activo.id}|${activo.estado}|${activo.cantidadNotificacionesNoLeidas}` : '';
  }

  firma = firmaActual();
  actualizar();
  suscribirComercios(() => {
    const nueva = firmaActual();
    if (nueva !== firma) {
      firma = nueva;
      actualizar();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      actualizar();
    }
  });
  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) {
      actualizar();
    }
  });
}

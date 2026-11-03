import { apiFetch, ApiError, getToken } from './api.js';
import { renderTopBar, showToast } from './catalogo.js';
import { h, setLoading } from './form-utils.js';
import { texto } from './admin-hojas.js';
import {
  ESTADOS_DE_LA_PERSONA, crearAvisoDeError, crearCabecera, crearCajaRespuesta, crearEstado, crearHilo, crearLinea, etiquetaTipo,
  fechaLegible, limpiarError, mensajeDeApi, mostrarError, normalizarCodigo,
} from './soporte-comun.js';

const OPCIONES_API = { handle5xxGlobally: false, handleRedGlobally: false };
const TEXTO_CERRADA = 'Consulta cerrada. Si necesitás algo más, enviá una consulta nueva.';

function leerFragmento() {
  if (!window.location.hash) return null;
  const parametros = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { email: parametros.get('email') || '', codigo: parametros.get('codigo') || '' };
}

function idDeLaUrl() {
  const valor = new URLSearchParams(window.location.search).get('id');
  return valor && /^\d+$/.test(valor) ? Number(valor) : null;
}

function esperar(contenedor) {
  contenedor.replaceChildren(
    h('div', { class: 'skeleton', style: 'height:88px;margin-bottom:16px;', 'aria-hidden': 'true' }),
    h('div', { class: 'skeleton', style: 'height:64px;width:70%;margin-bottom:12px;', 'aria-hidden': 'true' }),
    h('div', { class: 'skeleton', style: 'height:64px;width:70%;margin-left:auto;', 'aria-hidden': 'true' }),
  );
}

function pintarCerrada(consulta) {
  const topeAlcanzado = consulta.cantidadMensajes >= consulta.maxMensajes && consulta.aviso;
  return h('div', { class: 'soporte-cerrada', 'data-testid': 'consulta-cerrada' }, [
    texto('p', 'soporte-cerrada__texto', topeAlcanzado ? consulta.aviso : TEXTO_CERRADA, { 'data-testid': 'texto-consulta-cerrada' }),
    texto('a', 'btn btn-primary', 'Enviar una consulta nueva', { href: 'soporte.html', 'data-testid': 'btn-consulta-nueva' }),
  ]);
}

function pintarConversacion(contenedor, consulta, { enviar, recargar, avisoInicial = null }) {
  const restantes = Math.max(consulta.maxMensajes - consulta.cantidadMensajes, 0);
  const cabecera = crearCabecera({
    titulo: etiquetaTipo(consulta.tipo),
    lineas: [crearLinea(`Enviada el ${fechaLegible(consulta.creadoEn)}`, 'consulta-fecha')],
    estado: crearEstado(consulta.estado, ESTADOS_DE_LA_PERSONA),
  });
  const hilo = crearHilo(consulta.mensajes || [], { autorPropio: 'PERSONA', rotuloPropio: 'Vos', rotuloAjeno: 'Soporte' });
  const hijos = [cabecera, hilo];

  if (consulta.estado === 'CERRADO') {
    hijos.push(pintarCerrada(consulta));
  } else {
    const caja = crearCajaRespuesta({
      textoDeshabilitada: consulta.puedeResponder ? null : 'Esperando la respuesta de Soporte.',
      restantes,
      textoBoton: 'Enviar respuesta',
      enviar: async (textoRespuesta) => {
        consulta = await enviar(textoRespuesta);
      },
      alEnviado: async () => {
        showToast('Respuesta enviada');
        pintarConversacion(contenedor, consulta, { enviar, recargar });
        contenedor.querySelector('[data-testid="hilo-consulta"]').scrollIntoView({ block: 'end' });
      },
      alFallar: async (error, mensaje) => {
        if (error instanceof ApiError && error.status === 409) {
          try {
            const fresca = await recargar();
            pintarConversacion(contenedor, fresca, { enviar, recargar, avisoInicial: mensaje });
          } catch {
            return;
          }
        }
      },
    });
    hijos.push(caja.elemento);
  }
  contenedor.replaceChildren(...hijos);
  if (avisoInicial) {
    const slot = contenedor.querySelector('[data-testid="aviso-respuesta"]');
    if (slot) mostrarError(slot, avisoInicial, { enfocar: false });
  }
}

function pintarNoEncontrada(contenedor, mensaje, destino) {
  contenedor.replaceChildren(h('div', { class: 'soporte-exito', 'data-testid': 'consulta-no-encontrada' }, [
    texto('h1', 'title-lg', mensaje, { 'data-testid': 'texto-no-encontrada' }),
    texto('a', 'btn btn-primary', destino.texto, { href: destino.href, 'data-testid': destino.testid }),
  ]));
}

async function iniciarConSesion(contenedor, id) {
  esperar(contenedor);
  const ruta = `/soporte/mis-consultas/${id}`;
  const cargar = () => apiFetch(ruta, OPCIONES_API);
  const contexto = {
    recargar: cargar,
    enviar: (textoRespuesta) => apiFetch(`${ruta}/mensajes`, { ...OPCIONES_API, method: 'POST', body: { texto: textoRespuesta } }),
  };
  try {
    pintarConversacion(contenedor, await cargar(), contexto);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      pintarNoEncontrada(contenedor, 'No encontramos esa consulta.', { texto: 'Ir a mis consultas', href: 'mis-consultas.html', testid: 'btn-ir-mis-consultas' });
      return;
    }
    pintarErrorDeCarga(contenedor, mensajeDeApi(error, 'No pudimos cargar tu consulta.'), () => iniciarConSesion(contenedor, id));
  }
}

function pintarErrorDeCarga(contenedor, mensaje, reintentar) {
  const aviso = crearAvisoDeError('aviso-carga-consulta');
  const boton = texto('button', 'btn btn-secondary', 'Reintentar', { type: 'button', 'data-testid': 'btn-reintentar-consulta' });
  boton.addEventListener('click', reintentar);
  contenedor.replaceChildren(aviso, boton);
  mostrarError(aviso, mensaje, { enfocar: false });
}

function pintarReenvio(contenedor, emailInicial, volver) {
  const aviso = crearAvisoDeError('aviso-reenvio');
  const confirmacion = h('div', { 'data-testid': 'confirmacion-reenvio', 'aria-live': 'polite' });
  const email = h('input', {
    type: 'email', id: 'reenvio-email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', maxlength: '254', value: emailInicial, 'data-testid': 'input-reenvio-email',
  });
  const enviar = texto('button', 'btn btn-primary', 'Reenviar código', { type: 'submit', 'data-testid': 'btn-reenviar-codigo' });
  const volverBtn = texto('button', 'btn btn-tertiary', 'Volver a ver mi consulta', { type: 'button', 'data-testid': 'btn-volver-a-ver' });
  const formulario = h('form', { class: 'form', novalidate: true, 'data-testid': 'formulario-reenvio' }, [
    h('div', { class: 'field' }, [
      texto('label', 'field__label', 'Tu email', { for: 'reenvio-email' }),
      h('div', { class: 'input-shell' }, [email]),
    ]),
    aviso, confirmacion, enviar, volverBtn,
  ]);
  contenedor.replaceChildren(
    texto('h1', 'title-lg', '¿Perdiste el código?', { 'data-testid': 'titulo-reenvio' }),
    texto('p', 'soporte-intro', 'Escribí tu email y te mandamos los códigos de tus consultas.'),
    formulario,
  );
  email.focus();
  volverBtn.addEventListener('click', () => volver(email.value));
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviar.disabled) return;
    limpiarError(aviso);
    confirmacion.replaceChildren();
    setLoading(enviar, 'Enviando…', true);
    try {
      const respuesta = await apiFetch('/soporte/publico/codigos/reenviar', { ...OPCIONES_API, method: 'POST', auth: false, body: { email: email.value }, conMensaje: true });
      confirmacion.replaceChildren(h('div', { class: 'banner banner-info', role: 'status', 'data-testid': 'mensaje-reenvio' }, [texto('div', '', respuesta.mensaje)]));
    } catch (error) {
      mostrarError(aviso, mensajeDeApi(error, 'No pudimos reenviar el código. Probá de nuevo.'));
    } finally {
      setLoading(enviar, '', false, 'Reenviar código');
    }
  });
}

function pintarAcceso(contenedor, { email = '', mensaje = null, alConsultar, alPerderCodigo }) {
  const aviso = crearAvisoDeError('aviso-acceso');
  const campoEmail = h('input', {
    type: 'email', id: 'acceso-email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', maxlength: '254', value: email, 'data-testid': 'input-acceso-email',
  });
  const campoCodigo = h('input', {
    type: 'text', id: 'acceso-codigo', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '30', placeholder: 'Por ejemplo, ABCD-2345', 'data-testid': 'input-acceso-codigo',
  });
  const enviar = texto('button', 'btn btn-primary', 'Ver mi consulta', { type: 'submit', 'data-testid': 'btn-acceder-consulta' });
  const perdido = texto('button', 'btn-text', '¿Perdiste el código?', { type: 'button', 'data-testid': 'btn-perdi-codigo' });
  const formulario = h('form', { class: 'form', novalidate: true, 'data-testid': 'formulario-acceso' }, [
    h('div', { class: 'field' }, [texto('label', 'field__label', 'Tu email', { for: 'acceso-email' }), h('div', { class: 'input-shell' }, [campoEmail])]),
    h('div', { class: 'field' }, [texto('label', 'field__label', 'Código', { for: 'acceso-codigo' }), h('div', { class: 'input-shell' }, [campoCodigo])]),
    aviso, enviar, perdido,
  ]);
  contenedor.replaceChildren(
    texto('h1', 'title-lg', 'Ver mi consulta', { 'data-testid': 'titulo-acceso' }),
    texto('p', 'soporte-intro', 'Ingresá el email y el código que te dimos al enviar la consulta.'),
    formulario,
  );
  if (mensaje) mostrarError(aviso, mensaje);
  else (email ? campoCodigo : campoEmail).focus();

  perdido.addEventListener('click', () => alPerderCodigo(campoEmail.value));
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviar.disabled) return;
    limpiarError(aviso);
    setLoading(enviar, 'Buscando…', true);
    try {
      await alConsultar(campoEmail.value.trim().toLowerCase(), normalizarCodigo(campoCodigo.value));
    } catch (error) {
      setLoading(enviar, '', false, 'Ver mi consulta');
      mostrarError(aviso, mensajeDeApi(error, 'No pudimos buscar tu consulta. Probá de nuevo.'));
    }
  });
}

function iniciarPublica(contenedor) {
  const fragmento = leerFragmento();

  function mostrarAcceso(email, mensaje) {
    pintarAcceso(contenedor, {
      email,
      mensaje,
      alConsultar: consultar,
      alPerderCodigo: (valor) => pintarReenvio(contenedor, valor, (otro) => mostrarAcceso(otro, null)),
    });
  }

  async function consultar(email, codigo) {
    const cuerpo = { email, codigo };
    const consulta = await apiFetch('/soporte/publico/consultas/ver', { ...OPCIONES_API, method: 'POST', auth: false, body: cuerpo });
    const contexto = {
      recargar: () => apiFetch('/soporte/publico/consultas/ver', { ...OPCIONES_API, method: 'POST', auth: false, body: cuerpo }),
      enviar: (textoRespuesta) => apiFetch('/soporte/publico/consultas/responder', {
        ...OPCIONES_API, method: 'POST', auth: false, body: { ...cuerpo, texto: textoRespuesta },
      }),
    };
    pintarConversacion(contenedor, consulta, contexto);
  }

  if (fragmento && fragmento.email && fragmento.codigo) {
    esperar(contenedor);
    consultar(fragmento.email.trim().toLowerCase(), normalizarCodigo(fragmento.codigo)).catch((error) => {
      mostrarAcceso(fragmento.email, mensajeDeApi(error, 'No pudimos buscar tu consulta. Probá de nuevo.'));
    });
    return;
  }
  mostrarAcceso(fragmento ? fragmento.email : '', null);
}

export function initSoporteConsulta() {
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Tu consulta' });
  const contenedor = document.getElementById('consulta-contenido');
  const id = idDeLaUrl();
  if (id !== null && getToken()) {
    iniciarConSesion(contenedor, id);
    return;
  }
  iniciarPublica(contenedor);
}

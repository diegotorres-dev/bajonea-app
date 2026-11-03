import { ApiError } from './api.js';
import { h, crearSvg, setLoading } from './form-utils.js';
import { texto } from './admin-hojas.js';
import { diaDe, horaMinutoDe } from './fechas.js';

export const MAX_MENSAJE = 1000;
export const MIN_MENSAJE = 10;
export const TEXTO_SIN_CONEXION = 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.';

export const TIPOS_CONSULTA = Object.freeze([
  { valor: 'APELACION_CUENTA', etiqueta: 'Quiero apelar la suspensión de mi cuenta' },
  { valor: 'APELACION_COMERCIO', etiqueta: 'Quiero apelar la suspensión de mi comercio' },
  { valor: 'NO_PUEDO_ENTRAR', etiqueta: 'No puedo entrar' },
  { valor: 'COMERCIO_RECHAZADO_DOCUMENTOS_COBROS', etiqueta: 'Mi comercio fue rechazado o tengo problemas con documentos o cobros' },
  { valor: 'OTRA', etiqueta: 'Otra consulta' },
]);

export function tipoValido(valor) {
  return TIPOS_CONSULTA.some((tipo) => tipo.valor === valor);
}

export function etiquetaTipo(valor) {
  const tipo = TIPOS_CONSULTA.find((otro) => otro.valor === valor);
  return tipo ? tipo.etiqueta : 'Consulta';
}

export const ESTADOS_DE_LA_PERSONA = Object.freeze({
  ESPERA_PERSONA: { texto: 'Te toca responder', punto: 'soporte-estado__dot--toca' },
  ESPERA_SOPORTE: { texto: 'Esperando a Soporte', punto: 'soporte-estado__dot--espera' },
  CERRADO: { texto: 'Cerrada', punto: 'soporte-estado__dot--cerrada' },
});

export const ESTADOS_DE_SOPORTE = Object.freeze({
  ESPERA_SOPORTE: { texto: 'Espera tu respuesta', punto: 'soporte-estado__dot--toca' },
  ESPERA_PERSONA: { texto: 'Esperando a la persona', punto: 'soporte-estado__dot--espera' },
  CERRADO: { texto: 'Cerrada', punto: 'soporte-estado__dot--cerrada' },
});

export function normalizarCodigo(valor) {
  return String(valor || '').replace(/[\s-]+/g, '').toUpperCase();
}

export function fechaLegible(fechaHora) {
  const [anio, mes, dia] = diaDe(fechaHora).split('-');
  return `${dia}/${mes}/${anio}`;
}

export function fechaHoraLegible(fechaHora) {
  return `${fechaLegible(fechaHora)} ${horaMinutoDe(fechaHora)}`;
}

export function textoRestantes(restantes) {
  return restantes === 1 ? 'queda 1 mensaje' : `quedan ${restantes} mensajes`;
}

export function textoContadorLargo(largo, { minimo = 0, restantes = null } = {}) {
  const partes = [`${largo} / ${MAX_MENSAJE}`];
  if (minimo) partes.push(`mínimo ${minimo}`);
  if (restantes !== null) partes.push(textoRestantes(restantes));
  return partes.join(' · ');
}

export function mensajeDeApi(error, porDefecto = 'No pudimos completar la acción. Probá de nuevo.') {
  if (!(error instanceof ApiError)) return porDefecto;
  if (error.status === 0) return TEXTO_SIN_CONEXION;
  return error.message || porDefecto;
}

export function erroresPorCampo(error) {
  if (!(error instanceof ApiError) || error.status !== 400 || !error.data || typeof error.data !== 'object') return null;
  const campos = {};
  Object.entries(error.data).forEach(([campo, mensaje]) => {
    if (typeof mensaje === 'string') campos[campo] = mensaje;
  });
  return Object.keys(campos).length > 0 ? campos : null;
}

export function crearEstado(estado, mapa, testid = 'estado-consulta') {
  const datos = mapa[estado] || { texto: 'Estado no disponible', punto: 'soporte-estado__dot--cerrada' };
  return h('span', { class: 'cliente-estado soporte-estado', 'data-testid': testid, 'data-estado': estado }, [
    h('span', { class: `cliente-estado__dot ${datos.punto}`, 'aria-hidden': 'true' }),
    texto('span', '', datos.texto),
  ]);
}

export function crearAvisoDeError(testid = 'aviso-soporte') {
  return h('div', { class: 'soporte-aviso', 'aria-live': 'assertive', 'data-testid': testid });
}

export function mostrarError(slot, mensaje, { enfocar = true } = {}) {
  slot.replaceChildren();
  if (!mensaje) return;
  const caja = h('div', { class: 'banner banner-error aviso-fijo', role: 'alert', tabindex: '-1', 'data-testid': `${slot.dataset.testid}-mensaje` }, [
    crearSvg([['circle', { cx: '12', cy: '12', r: '10' }], ['line', { x1: '12', y1: '8', x2: '12', y2: '12' }], ['line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }]], { 'aria-hidden': 'true' }),
    texto('div', '', mensaje),
  ]);
  slot.appendChild(caja);
  if (enfocar) caja.focus();
}

export function limpiarError(slot) {
  slot.replaceChildren();
}

export function crearHilo(mensajes, { autorPropio, rotuloPropio, rotuloAjeno }) {
  const hilo = h('ol', { class: 'soporte-hilo', role: 'log', 'aria-live': 'polite', 'aria-label': 'Mensajes de la consulta', 'data-testid': 'hilo-consulta' });
  mensajes.forEach((mensaje) => {
    const propio = mensaje.autor === autorPropio;
    hilo.appendChild(h('li', {
      class: `soporte-burbuja ${propio ? 'soporte-burbuja--propia' : 'soporte-burbuja--ajena'}`,
      'data-testid': 'mensaje-consulta',
      'data-autor': mensaje.autor,
    }, [
      texto('p', 'soporte-burbuja__autor', propio ? rotuloPropio : rotuloAjeno, { 'data-testid': 'mensaje-autor' }),
      texto('p', 'soporte-burbuja__texto', mensaje.texto, { 'data-testid': 'mensaje-texto' }),
      texto('p', 'soporte-burbuja__fecha', fechaHoraLegible(mensaje.creadoEn), { 'data-testid': 'mensaje-fecha' }),
    ]));
  });
  return hilo;
}

export function crearCabecera({ titulo, lineas = [], estado }) {
  const cuerpo = [texto('h2', 'soporte-cabecera__titulo', titulo, { 'data-testid': 'consulta-tipo' })];
  lineas.forEach((linea) => cuerpo.push(linea));
  if (estado) cuerpo.push(estado);
  return h('section', { class: 'soporte-cabecera', 'aria-label': 'Datos de la consulta', 'data-testid': 'cabecera-consulta' }, cuerpo);
}

export function crearLinea(contenido, testid) {
  return texto('p', 'soporte-cabecera__linea', contenido, { 'data-testid': testid });
}

export function crearCajaRespuesta({ textoDeshabilitada = null, restantes, textoBoton, enviar, alEnviado, alFallar = null, prefijo = 'respuesta' }) {
  const deshabilitada = textoDeshabilitada !== null;
  const idArea = `${prefijo}-texto`;
  const area = h('textarea', {
    id: idArea,
    maxlength: String(MAX_MENSAJE),
    rows: '4',
    disabled: deshabilitada,
    'aria-describedby': `${idArea}-contador ${idArea}-aviso`,
    'data-testid': `input-${prefijo}`,
  });
  const contador = texto('span', '', textoContadorLargo(0, { restantes }), { id: `${idArea}-contador`, 'data-testid': `contador-${prefijo}` });
  const aviso = h('div', { id: `${idArea}-aviso`, 'data-testid': `aviso-${prefijo}`, 'aria-live': 'assertive' });
  const boton = texto('button', 'btn btn-primary', textoBoton, { type: 'submit', disabled: deshabilitada, 'data-testid': `btn-${prefijo}` });
  const hijos = [
    texto('label', 'field__label', 'Tu respuesta', { for: idArea }),
    h('div', { class: 'textarea-shell' }, [area]),
    h('div', { class: 'textarea-counter' }, [contador]),
  ];
  if (deshabilitada) {
    hijos.push(texto('p', 'soporte-turno', textoDeshabilitada, { 'data-testid': `turno-${prefijo}` }));
  }
  hijos.push(aviso, boton);
  const formulario = h('form', { class: 'form soporte-respuesta', novalidate: true, 'data-testid': `formulario-${prefijo}` }, hijos);

  area.addEventListener('input', () => {
    contador.textContent = textoContadorLargo(area.value.length, { restantes });
  });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (deshabilitada || boton.disabled) return;
    limpiarError(aviso);
    setLoading(boton, 'Enviando…', true);
    area.readOnly = true;
    try {
      await enviar(area.value);
      await alEnviado();
    } catch (error) {
      area.readOnly = false;
      setLoading(boton, '', false, textoBoton);
      const mensaje = mensajeDeApi(error, 'No pudimos enviar tu mensaje. Probá de nuevo.');
      mostrarError(aviso, mensaje);
      if (alFallar) await alFallar(error, mensaje);
    }
  });
  return { elemento: formulario, area };
}

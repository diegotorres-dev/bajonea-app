import { diaDeAyerEnZonaComercio, diaDeHoyEnZonaComercio, fechaCortaDe, horaMinutoDe, milisegundosHasta } from './fechas.js';

export const ESTADO_TURNO = {
  EN_CURSO: 'EN_CURSO',
  TERMINADO: 'TERMINADO',
  SIN_TURNO: 'SIN_TURNO',
};

export const TEXTO_SIN_TURNO = 'Sin turno por ahora';
export const GUION_SIN_DATO = '–';

const MARGEN_RECARGA_MS = 1500;
const ICONO_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

let desgloseAbierto = false;
let temporizadorRecarga = null;

function crear(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatearPrecio(valor) {
  const entero = Math.round(Number(valor));
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function normalizarResumenTurno(resumen) {
  const conDesglose = Object.hasOwn(resumen, 'comision') && Object.hasOwn(resumen, 'neto');
  return {
    estado: resumen.estado,
    turno: resumen.turno || null,
    vendido: resumen.vendido,
    comision: conDesglose ? resumen.comision : null,
    neto: conDesglose ? resumen.neto : null,
    conDesglose,
    cantidadPedidos: resumen.cantidadPedidos,
    cantidadPendientes: resumen.cantidadPendientes,
  };
}

export function textoRangoTurno(turno) {
  const apertura = horaMinutoDe(turno.inicio);
  let cierre = horaMinutoDe(turno.fin);
  if (!turno.cruzaMedianoche && cierre === '00:00') {
    cierre = '23:59';
  }
  const rango = `${apertura} a ${cierre}`;
  return turno.cruzaMedianoche ? `${rango} (día siguiente)` : rango;
}

function cuandoEmpezo(fecha) {
  if (fecha === diaDeHoyEnZonaComercio()) {
    return '';
  }
  if (fecha === diaDeAyerEnZonaComercio()) {
    return 'ayer';
  }
  return `el ${fechaCortaDe(fecha)}`;
}

export function textoRotuloTurno(resumen) {
  if (resumen.estado === ESTADO_TURNO.SIN_TURNO || !resumen.turno) {
    return TEXTO_SIN_TURNO;
  }
  const cuando = cuandoEmpezo(resumen.turno.fecha);
  const base = resumen.estado === ESTADO_TURNO.EN_CURSO
    ? (cuando ? `En curso desde ${cuando}` : 'En curso')
    : (cuando ? `Terminó ${cuando}` : 'Terminó');
  return `${base} · ${textoRangoTurno(resumen.turno)}`;
}

function crearRotulo(resumen) {
  const rotulo = crear('p', 'turno-rotulo');
  rotulo.setAttribute('data-testid', 'turno-rotulo');
  rotulo.setAttribute('data-estado', resumen.estado);
  const punto = crear('span', `turno-rotulo__punto turno-rotulo__punto--${resumen.estado === ESTADO_TURNO.EN_CURSO ? 'en-curso' : 'inactivo'}`);
  punto.setAttribute('aria-hidden', 'true');
  rotulo.appendChild(punto);
  const texto = crear('span', 'turno-rotulo__texto');
  texto.setAttribute('data-testid', 'turno-estado');
  texto.textContent = textoRotuloTurno(resumen);
  rotulo.appendChild(texto);
  return rotulo;
}

function crearMetricas(resumen) {
  const sinTurno = resumen.estado === ESTADO_TURNO.SIN_TURNO;
  const barra = crear('div', 'stats-bar');
  const metricas = [
    { testid: 'metrica-vendido', valor: sinTurno ? GUION_SIN_DATO : formatearPrecio(resumen.vendido), label: 'Vendido en el turno' },
    { testid: 'metrica-pedidos', valor: sinTurno ? GUION_SIN_DATO : String(resumen.cantidadPedidos), label: 'Pedidos del turno' },
    { testid: 'metrica-pendientes', valor: String(resumen.cantidadPendientes), label: 'Pendientes' },
  ];
  metricas.forEach((metrica) => {
    const columna = crear('div', 'stats-bar__col');
    columna.setAttribute('data-testid', metrica.testid);
    const valor = crear('p', 'stats-bar__value');
    valor.textContent = metrica.valor;
    columna.appendChild(valor);
    const label = crear('p', 'stats-bar__label');
    label.textContent = metrica.label;
    columna.appendChild(label);
    barra.appendChild(columna);
  });
  return barra;
}

function crearLineaDesglose(label, valor, testid) {
  const linea = crear('div', 'desglose-turno__linea');
  const etiqueta = crear('span', 'desglose-turno__etiqueta');
  etiqueta.textContent = label;
  linea.appendChild(etiqueta);
  const monto = crear('span', 'desglose-turno__valor');
  monto.setAttribute('data-testid', testid);
  monto.textContent = valor;
  linea.appendChild(monto);
  return linea;
}

function crearDesglose(resumen) {
  const bloque = crear('div', 'desglose-turno');
  const boton = crear('button', 'desglose-turno__toggle');
  boton.type = 'button';
  boton.id = 'desglose-turno-toggle';
  boton.setAttribute('data-testid', 'desglose-turno-toggle');
  boton.setAttribute('aria-controls', 'desglose-turno-panel');
  const texto = crear('span');
  boton.appendChild(texto);
  const chevron = crear('span', 'desglose-turno__chevron');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = ICONO_CHEVRON;
  boton.appendChild(chevron);

  const panel = crear('div', 'desglose-turno__panel');
  panel.id = 'desglose-turno-panel';
  panel.setAttribute('data-testid', 'desglose-turno-panel');
  panel.appendChild(crearLineaDesglose('Comisión', formatearPrecio(resumen.comision), 'metrica-comision'));
  panel.appendChild(crearLineaDesglose('Neto del turno', formatearPrecio(resumen.neto), 'metrica-neto'));

  function pintar() {
    boton.setAttribute('aria-expanded', desgloseAbierto ? 'true' : 'false');
    boton.classList.toggle('desglose-turno__toggle--abierto', desgloseAbierto);
    texto.textContent = desgloseAbierto ? 'Ocultar comisión y neto' : 'Ver comisión y neto';
    panel.hidden = !desgloseAbierto;
  }
  boton.addEventListener('click', () => {
    desgloseAbierto = !desgloseAbierto;
    pintar();
  });
  pintar();

  bloque.appendChild(boton);
  bloque.appendChild(panel);
  return bloque;
}

export function renderResumenTurno(container, resumen) {
  container.innerHTML = '';
  container.className = 'resumen-turno';
  container.appendChild(crearRotulo(resumen));
  container.appendChild(crearMetricas(resumen));
  if (resumen.conDesglose && resumen.estado !== ESTADO_TURNO.SIN_TURNO) {
    container.appendChild(crearDesglose(resumen));
  }
}

export function programarRecargaAlFinDelTurno(resumen, recargar) {
  if (temporizadorRecarga !== null) {
    clearTimeout(temporizadorRecarga);
    temporizadorRecarga = null;
  }
  if (resumen.estado !== ESTADO_TURNO.EN_CURSO || !resumen.turno) {
    return;
  }
  const falta = milisegundosHasta(resumen.turno.fin);
  if (falta === null) {
    return;
  }
  const espera = Math.max(falta, 0) + MARGEN_RECARGA_MS;
  temporizadorRecarga = setTimeout(() => {
    temporizadorRecarga = null;
    recargar();
  }, Math.min(espera, 2147483647));
}

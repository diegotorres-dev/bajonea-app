import { apiFetch } from './api.js';
import { exigirDueno } from './contexto.js';
import { renderTopBar } from './catalogo.js';
import { renderBottomNavComercio } from './comercio.js';
import { prepararPaginaComercio } from './selector-comercio.js';
import { h, ICONS } from './form-utils.js';
import { diaDeHoyEnZonaComercio, diaDeLaSemanaDe, fechaCortaDe, sumarDias } from './fechas.js';
import { formatearPrecio, GUION_SIN_DATO, textoRangoTurno } from './turno-resumen.js';

const RANGO_POR_DEFECTO = 30;
const RANGO_CORTO = 7;
const RANGOS = [
  { dias: RANGO_CORTO, etiqueta: '7 días' },
  { dias: RANGO_POR_DEFECTO, etiqueta: '30 días' },
];

const CATEGORIAS = [
  { clave: 'ENTREGADO', etiqueta: 'Entregados' },
  { clave: 'NO_RETIRADO', etiqueta: 'No retirados' },
  { clave: 'RECHAZADO', etiqueta: 'Rechazados' },
  { clave: 'CANCELADO', etiqueta: 'Cancelados' },
  { clave: 'ANULADO', etiqueta: 'Anulados' },
  { clave: 'EXPIRADO', etiqueta: 'Sin respuesta' },
  { clave: 'EN_CURSO', etiqueta: 'En curso' },
];

const TEXTO_SIN_TURNO_ASIGNADO = 'Sin turno asignado';
const ALTURA_MINIMA_BARRA = 3;

const cache = new Map();

function pedirRango(cantidadDias) {
  if (!cache.has(cantidadDias)) {
    const hasta = diaDeHoyEnZonaComercio();
    const desde = sumarDias(hasta, -(cantidadDias - 1));
    const consulta = (agrupar) => apiFetch(`/comercios/estadisticas?desde=${desde}&hasta=${hasta}&agrupar=${agrupar}`);
    const promesa = Promise.all([consulta('DIA'), consulta('TURNO')]).then(([porDia, porTurno]) => {
      const turnosPorDia = new Map();
      porTurno.periodos.forEach((periodo) => {
        if (!turnosPorDia.has(periodo.fecha)) {
          turnosPorDia.set(periodo.fecha, []);
        }
        turnosPorDia.get(periodo.fecha).push(periodo);
      });
      return { cantidadDias, desde, hasta, totales: porDia.totales, dias: porDia.periodos, turnosPorDia };
    });
    promesa.catch(() => cache.delete(cantidadDias));
    cache.set(cantidadDias, promesa);
  }
  return cache.get(cantidadDias);
}

function textoPedidos(cantidad) {
  return cantidad === 1 ? '1 pedido' : `${cantidad} pedidos`;
}

function montoOGuion(valor, vacio) {
  return vacio || valor === null || valor === undefined ? GUION_SIN_DATO : formatearPrecio(valor);
}

function crearCifras(datos) {
  const vacio = datos ? datos.totales.pedidos === 0 : true;
  const totales = datos ? datos.totales : {};
  const cifras = [
    { testid: 'estadisticas-vendido', etiqueta: 'Vendido', valor: montoOGuion(totales.vendido, vacio) },
    { testid: 'estadisticas-comision', etiqueta: 'Comisión', valor: montoOGuion(totales.comision, vacio) },
    { testid: 'estadisticas-neto', etiqueta: 'Neto', valor: montoOGuion(totales.neto, vacio) },
    { testid: 'estadisticas-ticket', etiqueta: 'Ticket promedio', valor: montoOGuion(totales.ticketPromedio, vacio) },
  ];
  const grilla = h('div', { class: 'estadisticas-cifras', 'data-testid': 'estadisticas-cifras' });
  cifras.forEach((cifra) => {
    const valor = h('p', { class: 'estadisticas-cifra__valor', 'data-testid': cifra.testid });
    valor.textContent = cifra.valor;
    const etiqueta = h('p', { class: 'estadisticas-cifra__etiqueta' });
    etiqueta.textContent = cifra.etiqueta;
    grilla.appendChild(h('div', { class: 'estadisticas-cifra' }, [valor, etiqueta]));
  });
  return grilla;
}

function crearEncabezado(texto) {
  const titulo = h('h2', { class: 'estadisticas-seccion' });
  titulo.textContent = texto;
  return titulo;
}

function crearDetalleDia(datos, periodo) {
  const bloque = h('div', { class: 'estadisticas-detalle__contenido' });
  const titulo = h('h3', { class: 'estadisticas-detalle__titulo', 'data-testid': 'estadisticas-detalle-fecha' });
  titulo.textContent = `${diaDeLaSemanaDe(periodo.fecha)} ${fechaCortaDe(periodo.fecha)}`;
  bloque.appendChild(titulo);

  if (periodo.pedidos === 0) {
    const sinPedidos = h('p', { class: 'estadisticas-detalle__texto', 'data-testid': 'estadisticas-detalle-vacio' });
    sinPedidos.textContent = 'No hubo pedidos este día.';
    bloque.appendChild(sinPedidos);
    return bloque;
  }

  const resumen = h('div', { class: 'estadisticas-detalle__resumen' });
  const vendido = h('span', { 'data-testid': 'estadisticas-detalle-vendido' });
  vendido.textContent = `Vendido ${formatearPrecio(periodo.vendido)}`;
  const pedidos = h('span', { 'data-testid': 'estadisticas-detalle-pedidos' });
  pedidos.textContent = textoPedidos(periodo.pedidos);
  resumen.append(vendido, pedidos);
  bloque.appendChild(resumen);

  const lista = h('ul', { class: 'estadisticas-turnos', 'data-testid': 'estadisticas-detalle-turnos' });
  (datos.turnosPorDia.get(periodo.fecha) || []).forEach((turno) => {
    const nombre = h('span', { class: 'estadisticas-turnos__nombre' });
    nombre.textContent = turno.turno ? textoRangoTurno(turno.turno) : TEXTO_SIN_TURNO_ASIGNADO;
    const monto = h('span', { class: 'estadisticas-turnos__monto' });
    monto.textContent = `${formatearPrecio(turno.vendido)} · ${textoPedidos(turno.pedidos)}`;
    lista.appendChild(h('li', { class: 'estadisticas-turnos__fila', 'data-testid': 'estadisticas-turno' }, [nombre, monto]));
  });
  bloque.appendChild(lista);
  return bloque;
}

function moverFoco(barras, indice, destino) {
  const siguiente = barras[Math.min(Math.max(destino, 0), barras.length - 1)];
  if (siguiente && siguiente !== barras[indice]) {
    siguiente.focus();
  }
}

function crearGrafico(datos, detalle) {
  const periodos = datos.dias;
  const maximo = periodos.reduce((mayor, periodo) => Math.max(mayor, Number(periodo.vendido)), 0);
  const primero = periodos[0];
  const ultimo = periodos[periodos.length - 1];

  const columnas = h('div', {
    class: 'estadisticas-grafico',
    role: 'group',
    'aria-label': `Vendido por día, del ${fechaCortaDe(primero.fecha)} al ${fechaCortaDe(ultimo.fecha)}`,
    'data-testid': 'estadisticas-grafico',
  });

  const barras = [];
  let seleccionada = null;

  function pintarDetalle() {
    detalle.replaceChildren();
    if (seleccionada === null) {
      const pista = h('p', { class: 'estadisticas-detalle__pista', 'data-testid': 'estadisticas-detalle-pista' });
      pista.textContent = 'Tocá una barra para ver el detalle de ese día.';
      detalle.appendChild(pista);
      return;
    }
    detalle.appendChild(crearDetalleDia(datos, periodos[seleccionada]));
  }

  periodos.forEach((periodo, indice) => {
    const vendido = Number(periodo.vendido);
    const boton = h('button', {
      type: 'button',
      class: 'estadisticas-barra',
      'aria-pressed': 'false',
      'aria-label': `${fechaCortaDe(periodo.fecha)}: ${formatearPrecio(vendido)}`,
      'data-testid': 'estadisticas-barra',
      'data-fecha': periodo.fecha,
    });
    const relleno = h('span', { class: 'estadisticas-barra__relleno', 'aria-hidden': 'true' });
    if (vendido > 0 && maximo > 0) {
      relleno.style.height = `${Math.max((vendido / maximo) * 100, ALTURA_MINIMA_BARRA)}%`;
    } else {
      relleno.classList.add('estadisticas-barra__relleno--vacia');
    }
    boton.appendChild(relleno);

    boton.addEventListener('click', () => {
      const yaElegida = seleccionada === indice;
      barras.forEach((otra) => otra.setAttribute('aria-pressed', 'false'));
      seleccionada = yaElegida ? null : indice;
      if (!yaElegida) {
        boton.setAttribute('aria-pressed', 'true');
      }
      pintarDetalle();
    });
    boton.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowLeft') {
        evento.preventDefault();
        moverFoco(barras, indice, indice - 1);
      } else if (evento.key === 'ArrowRight') {
        evento.preventDefault();
        moverFoco(barras, indice, indice + 1);
      } else if (evento.key === 'Home') {
        evento.preventDefault();
        moverFoco(barras, indice, 0);
      } else if (evento.key === 'End') {
        evento.preventDefault();
        moverFoco(barras, indice, barras.length - 1);
      }
    });
    barras.push(boton);
    columnas.appendChild(boton);
  });

  const inicio = h('span', { 'data-testid': 'estadisticas-eje-inicio' });
  inicio.textContent = fechaCortaDe(primero.fecha);
  const fin = h('span', { 'data-testid': 'estadisticas-eje-fin' });
  fin.textContent = fechaCortaDe(ultimo.fecha);
  const eje = h('div', { class: 'estadisticas-eje', 'aria-hidden': 'true' }, [inicio, fin]);

  const nota = h('p', { class: 'estadisticas-nota' });
  nota.textContent = 'Cada pedido cuenta en el día en que abrió su turno.';

  pintarDetalle();
  return h('div', { class: 'estadisticas-grafico-bloque' }, [columnas, eje, nota]);
}

function crearResultados(totales) {
  const lista = h('ul', { class: 'estadisticas-resultados', 'data-testid': 'estadisticas-resultados' });
  CATEGORIAS.forEach((categoria) => {
    const cantidad = totales.resultados[categoria.clave] || 0;
    const nombre = h('span');
    nombre.textContent = categoria.etiqueta;
    const numero = h('span', { class: 'estadisticas-resultados__cantidad' });
    numero.textContent = String(cantidad);
    const fila = h('li', {
      class: cantidad === 0 ? 'estadisticas-resultados__fila estadisticas-resultados__fila--cero' : 'estadisticas-resultados__fila',
      'data-testid': 'estadisticas-resultado',
      'data-categoria': categoria.clave,
    }, [nombre, numero]);
    lista.appendChild(fila);
  });
  return lista;
}

function crearEsqueleto() {
  const esqueleto = h('div', { class: 'estadisticas-esqueleto', 'data-testid': 'estadisticas-esqueleto', 'aria-hidden': 'true' });
  const grilla = h('div', { class: 'estadisticas-cifras' });
  for (let i = 0; i < 4; i += 1) {
    grilla.appendChild(h('div', { class: 'skeleton estadisticas-esqueleto__cifra' }));
  }
  esqueleto.appendChild(grilla);
  esqueleto.appendChild(h('div', { class: 'skeleton estadisticas-esqueleto__grafico' }));
  esqueleto.appendChild(h('div', { class: 'skeleton estadisticas-esqueleto__lista' }));
  return esqueleto;
}

function crearError(alReintentar) {
  const texto = h('div');
  texto.textContent = 'No pudimos cargar las estadísticas. Probá de nuevo.';
  const icono = new DOMParser().parseFromString(ICONS.error, 'text/html').body.firstElementChild;
  const banner = h('div', { class: 'banner banner-error', role: 'alert' }, [icono, texto]);
  const boton = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'estadisticas-reintentar' });
  boton.textContent = 'Reintentar';
  boton.addEventListener('click', alReintentar);
  return h('div', { class: 'estadisticas-error', 'data-testid': 'estadisticas-error' }, [banner, boton]);
}

function crearVacio(cantidadDias, alVerTreinta) {
  const mensaje = h('p', { class: 'estadisticas-vacio__texto', 'data-testid': 'estadisticas-vacio-texto' });
  mensaje.textContent = `No hubo pedidos en los últimos ${cantidadDias} días.`;
  const bloque = h('div', { class: 'estadisticas-vacio', 'data-testid': 'estadisticas-vacio' }, [mensaje]);
  if (alVerTreinta) {
    const boton = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'estadisticas-ver-30' });
    boton.textContent = 'Ver los últimos 30 días';
    boton.addEventListener('click', alVerTreinta);
    bloque.appendChild(boton);
  }
  return bloque;
}

function crearChips(contenedor, alElegir) {
  const fila = h('div', { class: 'chip-row estadisticas-rango', role: 'group', 'aria-label': 'Rango de días' });
  RANGOS.forEach((rango) => {
    const chip = h('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': 'false',
      'data-testid': `estadisticas-rango-${rango.dias}`,
      'data-dias': String(rango.dias),
    });
    chip.textContent = rango.etiqueta;
    chip.addEventListener('click', () => alElegir(rango.dias));
    fila.appendChild(chip);
  });
  contenedor.appendChild(fila);
  return fila;
}

export async function initComercioEstadisticas() {
  if (!(await exigirDueno())) {
    return;
  }
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Estadísticas' });
  renderBottomNavComercio(document.getElementById('bottom-nav-slot'), 'panel');
  if (!(await prepararPaginaComercio({ slotFranja: document.getElementById('franja-comercio-slot') }))) {
    return;
  }

  const contenido = document.getElementById('estadisticas-contenido');
  const periodoTexto = document.getElementById('estadisticas-periodo');
  let peticionVigente = 0;
  let filaChips = null;

  function marcarChip(cantidadDias) {
    filaChips.querySelectorAll('.chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.dias) === cantidadDias));
    });
  }

  async function mostrar(cantidadDias) {
    const peticion = peticionVigente + 1;
    peticionVigente = peticion;
    marcarChip(cantidadDias);
    periodoTexto.textContent = '';
    contenido.replaceChildren(crearEsqueleto());
    contenido.setAttribute('aria-busy', 'true');

    let datos;
    try {
      datos = await pedirRango(cantidadDias);
    } catch (error) {
      if (peticion === peticionVigente) {
        contenido.removeAttribute('aria-busy');
        contenido.replaceChildren(crearError(() => mostrar(cantidadDias)));
      }
      return;
    }

    let hayEnTreinta = false;
    if (datos.totales.pedidos === 0 && cantidadDias === RANGO_CORTO) {
      try {
        hayEnTreinta = (await pedirRango(RANGO_POR_DEFECTO)).totales.pedidos > 0;
      } catch (error) {
        hayEnTreinta = false;
      }
    }
    if (peticion !== peticionVigente) {
      return;
    }

    periodoTexto.textContent = `Del ${fechaCortaDe(datos.desde)} al ${fechaCortaDe(datos.hasta)}`;
    contenido.removeAttribute('aria-busy');
    contenido.replaceChildren(crearCifras(datos));

    if (datos.totales.pedidos === 0) {
      contenido.appendChild(crearVacio(cantidadDias, hayEnTreinta ? () => mostrar(RANGO_POR_DEFECTO) : null));
      return;
    }

    const detalle = h('div', { class: 'estadisticas-detalle', 'aria-live': 'polite', 'data-testid': 'estadisticas-detalle' });
    contenido.appendChild(crearEncabezado('Vendido por día'));
    contenido.appendChild(crearGrafico(datos, detalle));
    contenido.appendChild(detalle);
    contenido.appendChild(crearEncabezado('Cómo terminaron los pedidos'));
    contenido.appendChild(crearResultados(datos.totales));
  }

  filaChips = crearChips(document.getElementById('estadisticas-rango-slot'), mostrar);
  await mostrar(RANGO_POR_DEFECTO);
}

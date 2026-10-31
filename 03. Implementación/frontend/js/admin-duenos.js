import { apiFetch, getUsuario } from './api.js';
import { showToast } from './catalogo.js';
import { h, mostrarAvisoFijo } from './form-utils.js';
import { normalizarCampos } from './validators.js';
import { mensajeDeError } from './documentos-comun.js';
import { fechaLegible, plural, texto } from './admin-hojas.js';
import { abrirHojaAccionesDueno, nombreDelDueno, textoComercios } from './admin-dueno-suspension.js';

const ESTADOS_ETIQUETA = {
  PENDIENTE: 'Pendiente',
  ACTIVO: 'Activo',
  BLOQUEADO: 'Bloqueado',
  SUSPENDIDO: 'Suspendido',
  INACTIVO: 'Inactivo',
};

const ESTADOS_PUNTO = {
  PENDIENTE: 'cliente-estado__dot--pendiente',
  ACTIVO: 'cliente-estado__dot--activo',
  BLOQUEADO: 'cliente-estado__dot--bloqueado',
  SUSPENDIDO: 'cliente-estado__dot--suspendido',
  INACTIVO: 'cliente-estado__dot--inactivo',
};

const FILTROS = [
  { clave: 'TODOS', etiqueta: 'Todos', testid: 'filtro-duenos-todos' },
  { clave: 'SUSPENDIDO', etiqueta: 'Suspendidos', testid: 'filtro-duenos-suspendidos' },
  { clave: 'BLOQUEADO', etiqueta: 'Bloqueados', testid: 'filtro-duenos-bloqueados' },
];

const SVG_NS = 'http://www.w3.org/2000/svg';

function icono(figuras) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })
    .forEach(([nombre, valor]) => svg.setAttribute(nombre, valor));
  figuras.forEach(([etiqueta, atributos]) => {
    const figura = document.createElementNS(SVG_NS, etiqueta);
    Object.entries(atributos).forEach(([nombre, valor]) => figura.setAttribute(nombre, valor));
    svg.appendChild(figura);
  });
  return svg;
}

function iconoTresPuntos() {
  return icono([
    ['circle', { cx: '12', cy: '5', r: '1.4', fill: 'currentColor' }],
    ['circle', { cx: '12', cy: '12', r: '1.4', fill: 'currentColor' }],
    ['circle', { cx: '12', cy: '19', r: '1.4', fill: 'currentColor' }],
  ]);
}

function iconoUsuarios() {
  return icono([
    ['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
    ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
  ]);
}

function normalizarBusqueda(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function idDestacadoDeLaUrl() {
  const valor = new URLSearchParams(window.location.search).get('id');
  return valor && /^\d+$/.test(valor) ? Number(valor) : null;
}

export async function initAdminDuenos() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'ADMINISTRADOR') {
    window.location.href = 'login.html';
    return;
  }

  const contenedor = document.getElementById('duenos-content');
  const estado = { duenos: [], busqueda: '', filtro: 'TODOS', destacado: idDestacadoDeLaUrl() };

  const entrada = h('input', {
    type: 'search',
    id: 'dueno-busqueda',
    placeholder: 'Nombre o email',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-controls': 'duenos-lista',
    'data-testid': 'input-buscar-dueno',
  });
  const botonLimpiar = h('button', { type: 'button', class: 'cliente-busqueda__limpiar is-hidden', 'aria-label': 'Borrar búsqueda', 'data-testid': 'btn-limpiar-busqueda' }, [
    icono([['line', { x1: '18', y1: '6', x2: '6', y2: '18' }], ['line', { x1: '6', y1: '6', x2: '18', y2: '18' }]]),
  ]);
  const buscador = h('div', { class: 'field cliente-busqueda' }, [
    texto('label', 'field__label', 'Buscar por nombre o email', { for: 'dueno-busqueda' }),
    h('div', { class: 'input-shell' }, [entrada, botonLimpiar]),
  ]);

  const chips = FILTROS.map((filtro) => {
    const chip = texto('button', 'chip', filtro.etiqueta, { type: 'button', 'aria-pressed': String(filtro.clave === estado.filtro), 'data-testid': filtro.testid });
    chip.addEventListener('click', () => {
      estado.filtro = filtro.clave;
      chips.forEach((otro, indice) => otro.setAttribute('aria-pressed', String(FILTROS[indice].clave === estado.filtro)));
      dibujarLista();
    });
    return chip;
  });
  const filtros = h('div', { class: 'chip-row chip-row--wrap cliente-filtros', role: 'group', 'aria-label': 'Filtrar por estado', 'data-testid': 'filtros-duenos' }, chips);

  const contador = texto('p', 'cliente-contador', '', { role: 'status', 'aria-live': 'polite', 'data-testid': 'contador-duenos' });
  const avisoDestacado = h('div', { 'data-testid': 'aviso-dueno-destacado' });
  const lista = h('div', { class: 'cliente-admin-list', id: 'duenos-lista', 'data-testid': 'duenos-lista' });
  const avisoCarga = h('div', { 'data-testid': 'aviso-duenos' });

  contenedor.replaceChildren(buscador, filtros, contador, avisoDestacado, avisoCarga, lista);

  function esperar() {
    lista.replaceChildren(...[0, 1, 2, 3].map(() => h('div', { class: 'cliente-admin-row cliente-admin-row--espera', 'aria-hidden': 'true' }, [
      h('div', { class: 'skeleton', style: 'height:16px;width:55%;margin-bottom:10px;' }),
      h('div', { class: 'skeleton', style: 'height:12px;width:75%;' }),
    ])));
    contador.textContent = '';
  }

  function visibles() {
    if (estado.destacado !== null) {
      const unico = estado.duenos.filter((dueno) => dueno.id === estado.destacado);
      if (unico.length > 0) return unico;
    }
    const consulta = normalizarBusqueda(estado.busqueda);
    return estado.duenos
      .filter((dueno) => estado.filtro === 'TODOS' || dueno.estado === estado.filtro)
      .filter((dueno) => !consulta || normalizarBusqueda(nombreDelDueno(dueno)).includes(consulta) || normalizarBusqueda(dueno.email).includes(consulta))
      .sort((a, b) => nombreDelDueno(a).localeCompare(nombreDelDueno(b)));
  }

  function enfocarDueno(duenoId) {
    const boton = lista.querySelector(`[data-testid="btn-acciones-dueno-${duenoId}"]`);
    if (boton) {
      boton.focus();
    } else {
      entrada.focus();
    }
  }

  async function recargar() {
    const duenos = await apiFetch('/administrador/duenos', { handle5xxGlobally: false, handleRedGlobally: false });
    duenos.forEach((dueno) => normalizarCampos(dueno, ['nombre', 'apellido']));
    estado.duenos = duenos;
    dibujarLista();
  }

  function dibujarAvisoDestacado(mostrados) {
    avisoDestacado.replaceChildren();
    if (estado.destacado === null || mostrados.length !== 1 || mostrados[0].id !== estado.destacado) return;
    const verTodos = texto('button', 'btn btn-secondary', 'Ver todos', { type: 'button', 'data-testid': 'btn-ver-todos-duenos' });
    verTodos.addEventListener('click', () => {
      estado.destacado = null;
      window.history.replaceState(null, '', window.location.pathname);
      dibujarLista();
      entrada.focus();
    });
    avisoDestacado.append(h('div', { class: 'cliente-modal__caja dueno-destacado', 'data-testid': 'dueno-destacado-aviso' }, [
      texto('p', 'cliente-modal__caja-titulo', `Mostrando a ${nombreDelDueno(mostrados[0])}`),
      verTodos,
    ]));
  }

  async function reenviarEmail(dueno) {
    try {
      await apiFetch(`/administrador/duenos/${dueno.id}/suspension/reenviar-email`, { method: 'POST', handle5xxGlobally: false, handleRedGlobally: false });
      showToast('Email reenviado');
    } catch (error) {
      showToast(mensajeDeError(error, 'No pudimos reenviar el email. Probá de nuevo.'), 'error');
    }
    try {
      await recargar();
    } catch {
      showToast('No pudimos actualizar la lista', 'error');
    }
    enfocarDueno(dueno.id);
  }

  const manejadores = (dueno) => ({
    alExito: async () => {
      try {
        await recargar();
      } catch {
        showToast('No pudimos actualizar la lista', 'error');
      }
      enfocarDueno(dueno.id);
    },
    alConflicto: () => {
      recargar().catch(() => {});
    },
  });

  function lineaDeContacto(dueno) {
    const valor = String(dueno.email || '');
    const arroba = valor.indexOf('@');
    const parrafo = h('p', { class: 'cliente-admin-row__email', 'data-testid': 'dueno-contacto' });
    if (arroba <= 0) {
      parrafo.append(valor);
    } else {
      parrafo.append(valor.slice(0, arroba), document.createElement('wbr'), valor.slice(arroba));
    }
    parrafo.append(` · ${textoComercios(dueno.cantidadComercios)}`);
    return parrafo;
  }

  function dibujarFila(dueno) {
    const punto = h('span', { class: `cliente-estado__dot ${ESTADOS_PUNTO[dueno.estado] || ''}` });
    const chipEstado = h('span', { class: 'cliente-estado', 'data-testid': 'estado-dueno' }, [punto, texto('span', '', ESTADOS_ETIQUETA[dueno.estado] || 'Estado no disponible')]);
    const cuerpo = h('div', { class: 'cliente-admin-row__cuerpo' }, [
      texto('h3', '', nombreDelDueno(dueno)),
      lineaDeContacto(dueno),
      chipEstado,
    ]);
    if (dueno.estado === 'SUSPENDIDO') {
      const desde = dueno.suspendidoDesde ? `Desde el ${fechaLegible(dueno.suspendidoDesde)}` : 'Cuenta suspendida';
      const detalle = dueno.motivoSuspension ? `${desde} · ${dueno.motivoSuspension}` : desde;
      cuerpo.appendChild(texto('p', 'dueno-admin-row__suspension', detalle, { 'data-testid': `dueno-suspension-${dueno.id}` }));
    }
    if (dueno.ultimoEmailAvisoFallido) {
      const reenviar = texto('button', 'dueno-admin-row__reenviar', 'Reenviar', { type: 'button', 'data-testid': `btn-reenviar-email-dueno-${dueno.id}` });
      reenviar.addEventListener('click', () => {
        reenviar.disabled = true;
        reenviar.textContent = 'Reenviando…';
        reenviarEmail(dueno);
      });
      cuerpo.appendChild(h('p', { class: 'cliente-admin-row__aviso', 'data-testid': `email-fallido-${dueno.id}` }, [
        'No se envió el email · ',
        reenviar,
      ]));
    }
    const boton = h('button', {
      type: 'button',
      class: 'cliente-admin-row__acciones',
      'aria-label': `Acciones de ${nombreDelDueno(dueno)}`,
      'aria-haspopup': 'dialog',
      'data-testid': `btn-acciones-dueno-${dueno.id}`,
    }, [iconoTresPuntos()]);
    boton.addEventListener('click', () => abrirHojaAccionesDueno(dueno, boton, manejadores(dueno)));
    const destacada = estado.destacado === dueno.id;
    return h('div', { class: `cliente-admin-row${destacada ? ' cliente-admin-row--destacada' : ''}`, 'data-testid': `dueno-item-${dueno.id}` }, [cuerpo, boton]);
  }

  function dibujarLista() {
    const mostrados = visibles();
    dibujarAvisoDestacado(mostrados);
    contador.textContent = `Mostrando ${mostrados.length} ${plural(mostrados.length, 'dueño', 'dueños')}`;
    if (estado.duenos.length === 0) {
      lista.replaceChildren(h('div', { class: 'state-page', 'data-testid': 'duenos-sin-registros' }, [
        h('div', { class: 'state-page__icon' }, [iconoUsuarios()]),
        texto('h1', 'state-page__title', 'No hay dueños registrados'),
      ]));
      return;
    }
    if (mostrados.length === 0) {
      lista.replaceChildren(texto('p', 'cliente-vacio', 'No hay dueños con esos filtros.', { 'data-testid': 'duenos-vacio' }));
      return;
    }
    lista.replaceChildren(...mostrados.map(dibujarFila));
  }

  entrada.addEventListener('input', () => {
    estado.busqueda = entrada.value;
    botonLimpiar.classList.toggle('is-hidden', entrada.value === '');
    dibujarLista();
  });
  botonLimpiar.addEventListener('click', () => {
    entrada.value = '';
    estado.busqueda = '';
    botonLimpiar.classList.add('is-hidden');
    dibujarLista();
    entrada.focus();
  });

  esperar();
  try {
    await recargar();
  } catch (error) {
    lista.replaceChildren();
    const reintentar = texto('button', 'btn btn-secondary', 'Reintentar', { type: 'button', 'data-testid': 'btn-reintentar-duenos' });
    mostrarAvisoFijo(avisoCarga, mensajeDeError(error, 'No pudimos cargar los dueños.'));
    avisoCarga.appendChild(reintentar);
    reintentar.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

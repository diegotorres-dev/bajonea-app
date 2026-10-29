import { apiFetch, ApiError, getUsuario } from './api.js';
import { showToast } from './catalogo.js';
import { h, mostrarAvisoFijo, limpiarAvisoFijo } from './form-utils.js';
import { normalizarCampos } from './validators.js';
import { atraparFoco, devolverFoco, mensajeDeError } from './documentos-comun.js';

const MIN_MOTIVO = 10;
const MAX_MOTIVO = 500;

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
  { clave: 'TODOS', etiqueta: 'Todos', testid: 'filtro-clientes-todos' },
  { clave: 'SUSPENDIDO', etiqueta: 'Suspendidos', testid: 'filtro-clientes-suspendidos' },
  { clave: 'BLOQUEADO', etiqueta: 'Bloqueados', testid: 'filtro-clientes-bloqueados' },
  { clave: 'INACTIVO', etiqueta: 'Inactivos', testid: 'filtro-clientes-inactivos' },
  { clave: 'PENDIENTE', etiqueta: 'Pendientes', testid: 'filtro-clientes-pendientes' },
];

const SVG_NS = 'http://www.w3.org/2000/svg';

function icono(figuras, atributos = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', ...atributos })
    .forEach(([nombre, valor]) => svg.setAttribute(nombre, valor));
  figuras.forEach(([etiqueta, figuraAtributos]) => {
    const figura = document.createElementNS(SVG_NS, etiqueta);
    Object.entries(figuraAtributos).forEach(([nombre, valor]) => figura.setAttribute(nombre, valor));
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

function texto(etiqueta, clase, contenido, atributos = {}) {
  const elemento = h(etiqueta, { ...(clase ? { class: clase } : {}), ...atributos });
  elemento.textContent = contenido;
  return elemento;
}

function normalizarBusqueda(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function nombreCompleto(cliente) {
  return `${cliente.nombre} ${cliente.apellido}`.trim();
}

function fechaLegible(fechaIso) {
  return new Date(fechaIso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function plural(cantidad, singular, pluralTexto) {
  return cantidad === 1 ? singular : pluralTexto;
}

export async function initAdminClientes() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'ADMINISTRADOR') {
    window.location.href = 'login.html';
    return;
  }

  const contenedor = document.getElementById('clientes-content');
  const estado = { clientes: [], busqueda: '', filtro: 'TODOS', menuAbierto: null };

  const entrada = h('input', {
    type: 'search',
    id: 'cliente-busqueda',
    placeholder: 'Nombre o email',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-controls': 'clientes-lista',
    'data-testid': 'input-buscar-cliente',
  });
  const botonLimpiar = h('button', { type: 'button', class: 'cliente-busqueda__limpiar is-hidden', 'aria-label': 'Borrar búsqueda', 'data-testid': 'btn-limpiar-busqueda' }, [
    icono([['line', { x1: '18', y1: '6', x2: '6', y2: '18' }], ['line', { x1: '6', y1: '6', x2: '18', y2: '18' }]]),
  ]);
  const buscador = h('div', { class: 'field cliente-busqueda' }, [
    texto('label', 'field__label', 'Buscar por nombre o email', { for: 'cliente-busqueda' }),
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
  const filtros = h('div', { class: 'chip-row chip-row--wrap cliente-filtros', role: 'group', 'aria-label': 'Filtrar por estado', 'data-testid': 'filtros-clientes' }, chips);

  const contador = texto('p', 'cliente-contador', '', { role: 'status', 'aria-live': 'polite', 'data-testid': 'contador-clientes' });
  const lista = h('div', { class: 'cliente-admin-list', id: 'clientes-lista', 'data-testid': 'clientes-lista' });
  const avisoCarga = h('div', { 'data-testid': 'aviso-clientes' });

  contenedor.replaceChildren(buscador, filtros, contador, avisoCarga, lista);

  function esperar() {
    lista.replaceChildren(...[0, 1, 2, 3].map(() => h('div', { class: 'cliente-admin-row cliente-admin-row--espera', 'aria-hidden': 'true' }, [
      h('div', { class: 'skeleton', style: 'height:16px;width:55%;margin-bottom:10px;' }),
      h('div', { class: 'skeleton', style: 'height:12px;width:75%;' }),
    ])));
    contador.textContent = '';
  }

  function visibles() {
    const consulta = normalizarBusqueda(estado.busqueda);
    return estado.clientes
      .filter((cliente) => estado.filtro === 'TODOS' || cliente.estado === estado.filtro)
      .filter((cliente) => !consulta || normalizarBusqueda(nombreCompleto(cliente)).includes(consulta) || normalizarBusqueda(cliente.email).includes(consulta))
      .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)));
  }

  function cerrarMenu() {
    if (!estado.menuAbierto) return;
    const { menu, boton, quitar } = estado.menuAbierto;
    quitar();
    menu.remove();
    boton.setAttribute('aria-expanded', 'false');
    estado.menuAbierto = null;
  }

  function enfocarCliente(clienteId) {
    const boton = lista.querySelector(`[data-testid="btn-acciones-cliente-${clienteId}"]`);
    if (boton) {
      boton.focus();
    } else {
      entrada.focus();
    }
  }

  async function recargar() {
    const clientes = await apiFetch('/administrador/clientes', { handle5xxGlobally: false, handleRedGlobally: false });
    clientes.forEach((cliente) => normalizarCampos(cliente, ['nombre', 'apellido']));
    estado.clientes = clientes;
    dibujarLista();
  }

  function abrirMenu(cliente, boton, fila) {
    if (estado.menuAbierto && estado.menuAbierto.boton === boton) {
      cerrarMenu();
      boton.focus();
      return;
    }
    cerrarMenu();
    const suspendida = cliente.estado === 'SUSPENDIDO';
    const acciones = [];
    if (suspendida) {
      acciones.push({ clave: 'levantar', etiqueta: 'Levantar suspensión', alElegir: () => abrirModalLevantar(cliente, boton) });
    } else {
      acciones.push({ clave: 'suspender', etiqueta: 'Suspender cuenta', alElegir: () => abrirModalSuspender(cliente, boton), peligro: true });
    }
    if (cliente.ultimoEmailAvisoFallido) {
      acciones.push({ clave: 'reenviar', etiqueta: 'Reenviar email', alElegir: () => reenviarEmail(cliente) });
    }
    const items = acciones.map((accion) => texto('button', `cliente-menu__item${accion.peligro ? ' cliente-menu__item--peligro' : ''}`, accion.etiqueta, {
      type: 'button',
      role: 'menuitem',
      tabindex: '-1',
      'data-testid': `accion-${accion.clave}-${cliente.id}`,
    }));
    const menu = h('div', { class: 'cliente-menu', role: 'menu', 'aria-label': `Acciones de ${nombreCompleto(cliente)}`, 'data-testid': `menu-acciones-cliente-${cliente.id}` }, items);
    fila.appendChild(menu);
    boton.setAttribute('aria-expanded', 'true');

    items.forEach((item, indice) => item.addEventListener('click', () => {
      cerrarMenu();
      acciones[indice].alElegir();
    }));

    function alTeclear(evento) {
      const actual = items.indexOf(document.activeElement);
      if (evento.key === 'Escape') {
        evento.preventDefault();
        cerrarMenu();
        boton.focus();
      } else if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        items[(actual + 1) % items.length].focus();
      } else if (evento.key === 'ArrowUp') {
        evento.preventDefault();
        items[(actual - 1 + items.length) % items.length].focus();
      } else if (evento.key === 'Home') {
        evento.preventDefault();
        items[0].focus();
      } else if (evento.key === 'End') {
        evento.preventDefault();
        items[items.length - 1].focus();
      } else if (evento.key === 'Tab') {
        cerrarMenu();
      }
    }
    function alTocarAfuera(evento) {
      if (!menu.contains(evento.target) && !boton.contains(evento.target)) {
        cerrarMenu();
      }
    }
    document.addEventListener('keydown', alTeclear);
    document.addEventListener('pointerdown', alTocarAfuera, true);
    estado.menuAbierto = {
      menu,
      boton,
      quitar: () => {
        document.removeEventListener('keydown', alTeclear);
        document.removeEventListener('pointerdown', alTocarAfuera, true);
      },
    };
    items[0].focus();
  }

  function emailCortable(email) {
    const valor = String(email || '');
    const arroba = valor.indexOf('@');
    const parrafo = h('p', { class: 'cliente-admin-row__email' });
    if (arroba <= 0) {
      parrafo.textContent = valor;
      return parrafo;
    }
    parrafo.append(valor.slice(0, arroba), document.createElement('wbr'), valor.slice(arroba));
    return parrafo;
  }

  function dibujarFila(cliente) {
    const punto = h('span', { class: `cliente-estado__dot ${ESTADOS_PUNTO[cliente.estado] || ''}` });
    const chipEstado = h('span', { class: 'cliente-estado', 'data-testid': 'estado-cliente' }, [punto, texto('span', '', ESTADOS_ETIQUETA[cliente.estado] || 'Estado no disponible')]);
    const cuerpo = h('div', { class: 'cliente-admin-row__cuerpo' }, [
      texto('h3', '', nombreCompleto(cliente)),
      emailCortable(cliente.email),
      chipEstado,
    ]);
    if (cliente.ultimoEmailAvisoFallido) {
      cuerpo.appendChild(texto('p', 'cliente-admin-row__aviso', 'No se envió el email', { 'data-testid': `email-fallido-${cliente.id}` }));
    }
    const boton = h('button', {
      type: 'button',
      class: 'cliente-admin-row__acciones',
      'aria-label': `Acciones de ${nombreCompleto(cliente)}`,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'data-testid': `btn-acciones-cliente-${cliente.id}`,
    }, [iconoTresPuntos()]);
    const fila = h('div', { class: 'cliente-admin-row', 'data-testid': `cliente-item-${cliente.id}` }, [cuerpo, boton]);
    boton.addEventListener('click', () => abrirMenu(cliente, boton, fila));
    return fila;
  }

  function dibujarLista() {
    cerrarMenu();
    const mostrados = visibles();
    contador.textContent = `Mostrando ${mostrados.length} ${plural(mostrados.length, 'cliente', 'clientes')}`;
    if (estado.clientes.length === 0) {
      lista.replaceChildren(h('div', { class: 'state-page', 'data-testid': 'clientes-sin-registros' }, [
        h('div', { class: 'state-page__icon' }, [iconoUsuarios()]),
        texto('h1', 'state-page__title', 'No hay clientes registrados'),
      ]));
      return;
    }
    if (mostrados.length === 0) {
      lista.replaceChildren(texto('p', 'cliente-vacio', 'No hay clientes con esos filtros.', { 'data-testid': 'clientes-vacio' }));
      return;
    }
    lista.replaceChildren(...mostrados.map(dibujarFila));
  }

  async function reenviarEmail(cliente) {
    try {
      await apiFetch(`/administrador/clientes/${cliente.id}/suspension/reenviar-email`, { method: 'POST', handle5xxGlobally: false, handleRedGlobally: false });
      showToast('Email reenviado');
    } catch (error) {
      showToast(mensajeDeError(error, 'No pudimos reenviar el email. Probá de nuevo.'), 'error');
    }
    try {
      await recargar();
    } catch {
      showToast('No pudimos actualizar la lista', 'error');
    }
    enfocarCliente(cliente.id);
  }

  function abrirHoja({ clase = 'product-modal-sheet', id, titulo, testid, hijos }) {
    const hoja = h('div', { class: clase, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-titulo`, 'data-testid': testid }, [
      h('div', { class: 'product-modal-sheet__handle' }, [h('span')]),
      h('div', { class: 'product-modal-sheet__body' }, [texto('h2', 'cliente-modal__titulo', titulo, { id: `${id}-titulo`, 'data-testid': `${testid}-titulo` }), ...hijos]),
    ]);
    const fondo = h('div', { class: 'modal-backdrop', 'data-testid': `${testid}-fondo` }, [hoja]);
    document.body.appendChild(fondo);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return { hoja, fondo, overflowPrevio };
  }

  function cajaInformativa(titulo, lineas, testid) {
    const caja = h('div', { class: 'cliente-modal__caja', 'data-testid': testid });
    caja.appendChild(texto('p', 'cliente-modal__caja-titulo', titulo));
    const items = h('ul', { class: 'cliente-modal__caja-lista' });
    lineas.forEach((linea) => items.appendChild(texto('li', '', linea)));
    caja.appendChild(items);
    return { caja, items };
  }

  function campoTexto({ id, etiqueta, ayuda, placeholder, minimo }) {
    const area = h('textarea', { id, maxlength: String(MAX_MOTIVO), placeholder, 'aria-describedby': `${id}-contador`, 'data-testid': `input-${id}` });
    const contador = texto('span', '', minimo ? `0 / ${MAX_MOTIVO} · mínimo ${minimo}` : `0 / ${MAX_MOTIVO}`, { id: `${id}-contador`, 'data-testid': `contador-${id}` });
    const campo = h('div', { class: 'field' }, [
      texto('label', 'field__label', etiqueta, { for: id }),
      ...(ayuda ? [texto('p', 'field__hint', ayuda)] : []),
      h('div', { class: 'textarea-shell' }, [area]),
      h('div', { class: 'textarea-counter' }, [contador]),
    ]);
    area.addEventListener('input', () => {
      contador.textContent = minimo ? `${area.value.length} / ${MAX_MOTIVO} · mínimo ${minimo}` : `${area.value.length} / ${MAX_MOTIVO}`;
    });
    return { campo, area };
  }

  async function abrirModalSuspender(cliente, opener) {
    const nombre = nombreCompleto(cliente);
    const { caja, items } = cajaInformativa('Qué va a pasar', [], 'suspender-que-va-a-pasar');
    items.appendChild(texto('li', 'cliente-modal__espera', 'Cargando…', { 'data-testid': 'suspender-previa-cargando' }));
    const { campo, area } = campoTexto({ id: 'suspender-motivo', etiqueta: 'Motivo (lo va a ver la persona)', placeholder: 'Contale por qué se suspende la cuenta', minimo: MIN_MOTIVO });
    const aviso = h('div', { 'data-testid': 'aviso-suspender' });
    const confirmar = texto('button', 'btn btn-primary doc-peligro', 'Suspender cuenta', { type: 'submit', disabled: true, 'data-testid': 'btn-confirmar-suspender' });
    const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-suspender' });
    const formulario = h('form', { class: 'form', novalidate: true }, [campo, aviso, confirmar, cancelar]);
    const { hoja, fondo, overflowPrevio } = abrirHoja({ id: 'suspender', titulo: `Suspender a ${nombre}`, testid: 'modal-suspender-cliente', hijos: [caja, formulario] });
    let ocupado = false;
    let cerrado = false;
    const quitarAtrapaFoco = atraparFoco(hoja, cerrar);
    area.focus();

    function cerrar(devolver = true) {
      if (ocupado || cerrado) return;
      cerrado = true;
      quitarAtrapaFoco();
      fondo.remove();
      document.body.style.overflow = overflowPrevio;
      if (devolver) devolverFoco(opener, entrada);
    }

    apiFetch(`/administrador/clientes/${cliente.id}/suspension/previa`, { handle5xxGlobally: false, handleRedGlobally: false })
      .then((previa) => {
        if (cerrado) return;
        const lineas = [];
        if (previa.pedidosPagadosEnCurso > 0) {
          lineas.push(`${previa.pedidosPagadosEnCurso} ${plural(previa.pedidosPagadosEnCurso, 'pedido pagado sigue', 'pedidos pagados siguen')} su curso`);
        }
        if (previa.pedidosSinPagar > 0) {
          lineas.push(`${previa.pedidosSinPagar} ${plural(previa.pedidosSinPagar, 'pedido sin pagar se cancela', 'pedidos sin pagar se cancelan')}`);
        }
        if (lineas.length === 0) lineas.push('No tiene pedidos en curso');
        lineas.push('No podrá ingresar ni comprar');
        items.replaceChildren(...lineas.map((linea) => texto('li', '', linea)));
      })
      .catch((error) => {
        if (cerrado) return;
        items.replaceChildren(texto('li', '', 'No podrá ingresar ni comprar'));
        mostrarAvisoFijo(aviso, `${mensajeDeError(error, 'No pudimos calcular el detalle.')} Igual podés suspender la cuenta.`);
      });

    area.addEventListener('input', () => {
      confirmar.disabled = ocupado || area.value.trim().length < MIN_MOTIVO;
    });
    cancelar.addEventListener('click', () => cerrar());
    fondo.addEventListener('click', (evento) => {
      if (evento.target === fondo) cerrar();
    });
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const motivo = area.value.trim();
      if (ocupado || motivo.length < MIN_MOTIVO) return;
      ocupado = true;
      confirmar.disabled = true;
      cancelar.disabled = true;
      confirmar.textContent = 'Suspendiendo…';
      limpiarAvisoFijo(aviso);
      try {
        await apiFetch(`/administrador/clientes/${cliente.id}/suspender`, { method: 'PUT', body: { motivo }, handle5xxGlobally: false, handleRedGlobally: false });
        ocupado = false;
        cerrar(false);
        showToast('Cuenta suspendida');
        await recargar().catch(() => showToast('No pudimos actualizar la lista', 'error'));
        enfocarCliente(cliente.id);
      } catch (error) {
        ocupado = false;
        cancelar.disabled = false;
        confirmar.textContent = 'Suspender cuenta';
        confirmar.disabled = area.value.trim().length < MIN_MOTIVO;
        const mensaje = error instanceof ApiError && error.status === 409
          ? `${error.message}. Cerrá esta ventana: la lista se actualiza.`
          : mensajeDeError(error, 'No pudimos suspender la cuenta. Probá de nuevo.');
        mostrarAvisoFijo(aviso, mensaje);
        if (error instanceof ApiError && error.status === 409) {
          recargar().catch(() => {});
        }
        confirmar.focus();
      }
    });
  }

  function abrirModalLevantar(cliente, opener) {
    const nombre = nombreCompleto(cliente);
    const desde = cliente.suspendidoDesde ? `Suspendida desde ${fechaLegible(cliente.suspendidoDesde)}` : 'Cuenta suspendida';
    const motivoCaja = h('div', { class: 'cliente-modal__caja', 'data-testid': 'levantar-suspension-actual' }, [
      texto('p', 'cliente-modal__caja-titulo', desde),
      texto('p', 'cliente-modal__caja-motivo', cliente.motivoSuspension || '', { 'data-testid': 'levantar-motivo-actual' }),
    ]);
    const previo = cliente.estadoPrevioSuspension;
    let lineas = ['Podrá ingresar y comprar de nuevo.'];
    if (previo === 'BLOQUEADO') lineas.push('Estaba bloqueada: vuelve activa.');
    if (previo === 'INACTIVO') lineas = ['Vuelve a estar inactiva: tiene que reactivar su cuenta para ingresar.'];
    if (previo === 'PENDIENTE') lineas = ['Vuelve a estar pendiente: tiene que verificar su email para ingresar.'];
    const { caja } = cajaInformativa('Qué va a pasar', lineas, 'levantar-que-va-a-pasar');
    const { campo, area } = campoTexto({ id: 'levantar-mensaje', etiqueta: 'Mensaje para la persona (opcional)', placeholder: 'Por ejemplo, qué pasó o qué esperamos de ahora en más' });
    const aviso = h('div', { 'data-testid': 'aviso-levantar' });
    const confirmar = texto('button', 'btn btn-primary', 'Levantar suspensión', { type: 'submit', 'data-testid': 'btn-confirmar-levantar' });
    const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-levantar' });
    const formulario = h('form', { class: 'form', novalidate: true }, [campo, aviso, confirmar, cancelar]);
    const { hoja, fondo, overflowPrevio } = abrirHoja({ id: 'levantar', titulo: 'Levantar suspensión', testid: 'modal-levantar-suspension', hijos: [texto('p', 'cliente-modal__sub', nombre), motivoCaja, caja, formulario] });
    let ocupado = false;
    let cerrado = false;
    const quitarAtrapaFoco = atraparFoco(hoja, cerrar);
    area.focus();

    function cerrar(devolver = true) {
      if (ocupado || cerrado) return;
      cerrado = true;
      quitarAtrapaFoco();
      fondo.remove();
      document.body.style.overflow = overflowPrevio;
      if (devolver) devolverFoco(opener, entrada);
    }

    cancelar.addEventListener('click', () => cerrar());
    fondo.addEventListener('click', (evento) => {
      if (evento.target === fondo) cerrar();
    });
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (ocupado) return;
      ocupado = true;
      confirmar.disabled = true;
      cancelar.disabled = true;
      confirmar.textContent = 'Levantando…';
      limpiarAvisoFijo(aviso);
      const mensaje = area.value.trim();
      try {
        await apiFetch(`/administrador/clientes/${cliente.id}/levantar-suspension`, {
          method: 'PUT',
          body: mensaje ? { motivo: mensaje } : {},
          handle5xxGlobally: false,
          handleRedGlobally: false,
        });
        ocupado = false;
        cerrar(false);
        showToast('Suspensión levantada');
        await recargar().catch(() => showToast('No pudimos actualizar la lista', 'error'));
        enfocarCliente(cliente.id);
      } catch (error) {
        ocupado = false;
        cancelar.disabled = false;
        confirmar.disabled = false;
        confirmar.textContent = 'Levantar suspensión';
        const conflicto = error instanceof ApiError && error.status === 409;
        mostrarAvisoFijo(aviso, conflicto
          ? `${error.message}. Cerrá esta ventana: la lista se actualiza.`
          : mensajeDeError(error, 'No pudimos levantar la suspensión. Probá de nuevo.'));
        if (conflicto) {
          recargar().catch(() => {});
        }
        confirmar.focus();
      }
    });
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
    const reintentar = texto('button', 'btn btn-secondary', 'Reintentar', { type: 'button', 'data-testid': 'btn-reintentar-clientes' });
    mostrarAvisoFijo(avisoCarga, mensajeDeError(error, 'No pudimos cargar los clientes.'));
    avisoCarga.appendChild(reintentar);
    reintentar.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

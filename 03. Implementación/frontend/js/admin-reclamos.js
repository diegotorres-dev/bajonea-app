import { apiFetch, ApiError, getUsuario } from './api.js';
import { renderTopBar, showToast } from './catalogo.js';
import { h, setLoading } from './form-utils.js';
import { atraparFoco, devolverFoco, elementoQueAbrio, tiempoRelativo } from './documentos-comun.js';
import { abrirHoja, texto } from './admin-hojas.js';
import { crearAvisoDeError, erroresPorCampo, fechaHoraLegible, limpiarError, mensajeDeApi, mostrarError } from './soporte-comun.js';
import {
  MAX_MOTIVO_RECHAZO, MIN_MOTIVO_RECHAZO, TIPOS_RESOLUCION, etiquetaMotivoReclamo, formatearMonto,
} from './reclamos-comun.js';

const OPCIONES_API = { handle5xxGlobally: false, handleRedGlobally: false };
const LIMITE_LISTA = 200;

const FILTROS = [
  { clave: 'PENDIENTES', etiqueta: 'Pendientes', contador: 'pendientes', testid: 'filtro-reclamos-pendientes' },
  { clave: 'REEMBOLSO_EN_PROCESO', etiqueta: 'Reembolso en proceso', contador: 'reembolsoEnProceso', testid: 'filtro-reclamos-reembolso' },
  { clave: 'RESUELTOS', etiqueta: 'Resueltos', contador: 'resueltos', testid: 'filtro-reclamos-resueltos' },
];

const VACIOS = {
  PENDIENTES: 'No hay reclamos pendientes de revisar.',
  REEMBOLSO_EN_PROCESO: 'No hay reembolsos de reclamos en proceso.',
  RESUELTOS: 'Todavía no resolviste ningún reclamo.',
};

function idDeLaUrl() {
  const valor = new URLSearchParams(window.location.search).get('id');
  return valor && /^\d+$/.test(valor) ? Number(valor) : null;
}

function datosDeEstado(reclamo) {
  if (reclamo.estado === 'PENDIENTE') return { texto: 'Pendiente', punto: 'pedido-estado__dot--pendiente' };
  if (reclamo.estado === 'RECHAZADO') return { texto: 'Rechazado', punto: 'pedido-estado__dot--rechazado' };
  if (reclamo.estado === 'APROBADO' && reclamo.reembolsoEnProceso) return { texto: 'Reembolso en proceso', punto: 'pedido-estado__dot--pendiente' };
  if (reclamo.estado === 'APROBADO') return { texto: 'Aprobado', punto: 'pedido-estado__dot--positivo' };
  return { texto: 'Estado no disponible', punto: 'pedido-estado__dot--vencido' };
}

function crearEstadoAdmin(reclamo, testid) {
  const datos = datosDeEstado(reclamo);
  return h('span', { class: 'pedido-estado', 'data-testid': testid, 'data-estado': reclamo.estado }, [
    h('span', { class: `pedido-estado__dot ${datos.punto}`, 'aria-hidden': 'true' }),
    texto('span', '', datos.texto),
  ]);
}

function dibujarFila(reclamo) {
  return h('a', {
    class: 'soporte-fila',
    href: `admin-reclamos.html?id=${reclamo.id}`,
    'data-testid': `reclamo-item-${reclamo.id}`,
  }, [
    texto('span', 'soporte-fila__tipo', `Pedido #${reclamo.pedidoId} · ${etiquetaMotivoReclamo(reclamo.motivo)}`, { 'data-testid': 'reclamo-item-titulo' }),
    crearEstadoAdmin(reclamo, 'reclamo-item-estado'),
    texto('p', 'soporte-fila__email', reclamo.comercioNombre, { 'data-testid': 'reclamo-item-comercio' }),
    texto('span', 'soporte-fila__fecha', `${formatearMonto(reclamo.total)} · ${tiempoRelativo(reclamo.fechaCreacion)}`, { 'data-testid': 'reclamo-item-hace' }),
  ]);
}

async function pintarBandeja(contenedor) {
  const estado = { filtro: 'PENDIENTES', contadores: null, reclamos: [], cargando: true, secuencia: 0 };
  const aviso = crearAvisoDeError('aviso-bandeja-reclamos');
  const contador = texto('p', 'cliente-contador', '', { role: 'status', 'aria-live': 'polite', 'data-testid': 'contador-bandeja-reclamos' });
  const lista = h('div', { class: 'soporte-lista', id: 'reclamos-lista', 'data-testid': 'bandeja-reclamos' });

  const chips = FILTROS.map((filtro) => {
    const chip = texto('button', 'chip', filtro.etiqueta, { type: 'button', 'aria-pressed': String(filtro.clave === estado.filtro), 'data-testid': filtro.testid });
    chip.addEventListener('click', () => {
      if (estado.filtro === filtro.clave) return;
      estado.filtro = filtro.clave;
      cargar();
    });
    return chip;
  });
  const filtros = h('div', { class: 'chip-row chip-row--wrap cliente-filtros', role: 'group', 'aria-label': 'Filtrar reclamos', 'data-testid': 'filtros-reclamos' }, chips);

  function dibujar() {
    chips.forEach((chip, indice) => {
      const filtro = FILTROS[indice];
      const cantidad = estado.contadores ? ` ${estado.contadores[filtro.contador]}` : '';
      chip.textContent = `${filtro.etiqueta}${cantidad}`;
      chip.setAttribute('aria-pressed', String(filtro.clave === estado.filtro));
    });
    if (estado.cargando) {
      lista.replaceChildren(...[0, 1, 2].map(() => h('div', { class: 'soporte-fila soporte-fila--espera', 'aria-hidden': 'true' }, [
        h('div', { class: 'skeleton', style: 'height:16px;width:60%;margin-bottom:10px;' }),
        h('div', { class: 'skeleton', style: 'height:12px;width:80%;' }),
      ])));
      return;
    }
    contador.textContent = `Mostrando ${estado.reclamos.length} ${estado.reclamos.length === 1 ? 'reclamo' : 'reclamos'}`;
    if (estado.reclamos.length === 0) {
      lista.replaceChildren(texto('p', 'cliente-vacio', VACIOS[estado.filtro], { 'data-testid': 'bandeja-reclamos-vacia' }));
      return;
    }
    lista.replaceChildren(...estado.reclamos.map(dibujarFila));
  }

  async function cargar() {
    const secuencia = estado.secuencia + 1;
    estado.secuencia = secuencia;
    estado.cargando = true;
    limpiarError(aviso);
    dibujar();
    try {
      const bandeja = await apiFetch(`/administrador/reclamos?filtro=${estado.filtro}&limite=${LIMITE_LISTA}`, OPCIONES_API);
      if (secuencia !== estado.secuencia) return;
      estado.contadores = bandeja.contadores;
      estado.reclamos = bandeja.reclamos;
      estado.cargando = false;
      dibujar();
    } catch (error) {
      if (secuencia !== estado.secuencia) return;
      estado.cargando = false;
      lista.replaceChildren();
      mostrarError(aviso, mensajeDeApi(error, 'No pudimos cargar los reclamos.'), { enfocar: false });
      const reintentar = texto('button', 'btn btn-secondary', 'Reintentar', { type: 'button', 'data-testid': 'btn-reintentar-bandeja-reclamos' });
      reintentar.addEventListener('click', () => cargar());
      lista.appendChild(reintentar);
    }
  }

  contenedor.replaceChildren(
    texto('h1', 'title-lg', 'Reclamos', { 'data-testid': 'titulo-admin-reclamos' }),
    filtros, contador, aviso, lista,
  );
  await cargar();
}

function abrirModalConfirmar({ mensaje, opener, alConfirmar, alFallar }) {
  const aviso = crearAvisoDeError('aviso-confirmar-resolucion');
  const confirmar = texto('button', 'btn btn-primary', 'Confirmar', { type: 'submit', 'data-testid': 'btn-confirmar-resolucion' });
  const cancelar = texto('button', 'btn btn-tertiary', 'Cancelar', { type: 'button', 'data-testid': 'btn-cancelar-resolucion' });
  const formulario = h('form', { class: 'form', novalidate: true }, [
    texto('p', 'soporte-intro', mensaje, { 'data-testid': 'texto-confirmar-resolucion' }),
    aviso, confirmar, cancelar,
  ]);
  const { hoja, fondo, overflowPrevio } = abrirHoja({ id: 'confirmar-resolucion', titulo: 'Resolver reclamo', testid: 'modal-confirmar-resolucion', hijos: [formulario] });
  let ocupado = false;
  let cerrado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, () => cerrar());
  cancelar.focus();

  function cerrar(devolver = true) {
    if (ocupado || cerrado) return;
    cerrado = true;
    quitarAtrapaFoco();
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    if (devolver) devolverFoco(opener);
  }

  cancelar.addEventListener('click', () => cerrar());
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado) return;
    ocupado = true;
    limpiarError(aviso);
    setLoading(confirmar, 'Resolviendo…', true);
    cancelar.disabled = true;
    try {
      const alTerminar = await alConfirmar();
      ocupado = false;
      cerrar(false);
      showToast('Reclamo resuelto');
      alTerminar();
    } catch (error) {
      ocupado = false;
      cerrar(false);
      alFallar(error);
    }
  });
}

function crearBloqueReembolso(detalle) {
  const reembolso = detalle.reembolso;
  const hijos = [
    h('div', { class: 'reclamo-bloque__encabezado' }, [
      texto('h3', 'reclamo-bloque__titulo', 'Reembolso'),
      h('span', { class: 'pedido-estado', 'data-testid': 'estado-reembolso-reclamo' }, [
        h('span', { class: 'pedido-estado__dot pedido-estado__dot--pendiente', 'aria-hidden': 'true' }),
        texto('span', '', 'Reembolso en proceso'),
      ]),
    ]),
  ];
  if (reembolso && reembolso.ultimoError) {
    hijos.push(texto('p', 'reclamo-bloque__error', reembolso.ultimoError, { role: 'alert', 'data-testid': 'error-reembolso-reclamo' }));
  } else {
    hijos.push(texto('p', 'reclamo-bloque__texto', 'El reembolso todavía no se procesó.', { 'data-testid': 'texto-reembolso-sin-procesar' }));
  }
  hijos.push(texto('a', 'btn btn-secondary', 'Ir a Reembolsos para reintentar', { href: 'admin-reembolsos.html', 'data-testid': 'enlace-ir-a-reembolsos' }));
  return h('section', { class: 'reclamo-bloque', 'aria-label': 'Reembolso del reclamo', 'data-testid': 'bloque-reembolso-reclamo' }, hijos);
}

function crearResolucion(detalle) {
  const lineas = [
    texto('p', 'reclamo-bloque__linea', `Resolución: ${TIPOS_RESOLUCION[detalle.tipoResolucion] || 'Resuelto'}`, { 'data-testid': 'tipo-resolucion' }),
  ];
  if (detalle.estado === 'APROBADO') {
    lineas.push(texto('p', 'reclamo-bloque__linea', `Monto reembolsado: ${formatearMonto(detalle.montoAprobado)}`, { 'data-testid': 'monto-resolucion' }));
  }
  lineas.push(texto('p', 'reclamo-bloque__linea', `Resuelto el ${fechaHoraLegible(detalle.fechaResolucion)}`, { 'data-testid': 'fecha-resolucion' }));
  if (detalle.estado === 'RECHAZADO') {
    lineas.push(h('p', { class: 'reclamo-bloque__motivo', 'data-testid': 'motivo-rechazo-resolucion' }, [
      texto('span', 'reclamo-bloque__motivo-rotulo', 'Motivo: '),
      texto('span', '', detalle.notaResolucion || ''),
    ]));
  }
  return h('section', { class: 'reclamo-bloque', 'aria-label': 'Resolución', 'data-testid': 'resolucion-reclamo' }, [
    h('div', { class: 'reclamo-bloque__encabezado' }, [texto('h3', 'reclamo-bloque__titulo', 'Resolución')]),
    ...lineas,
  ]);
}

function crearFormularioResolucion(detalle, contenedor) {
  const aviso = crearAvisoDeError('aviso-resolucion');
  const montoTotal = formatearMonto(detalle.saldoReembolsable);
  const opciones = [
    { valor: 'REEMBOLSO_TOTAL', etiqueta: `Reembolso total · ${montoTotal}`, testid: 'opcion-reembolso-total' },
    { valor: 'REEMBOLSO_PARCIAL', etiqueta: 'Reembolso parcial', testid: 'opcion-reembolso-parcial' },
    { valor: 'RECHAZO', etiqueta: 'Rechazar reclamo', testid: 'opcion-rechazo' },
  ];

  const inputMonto = h('input', {
    type: 'text',
    id: 'reclamo-monto',
    inputmode: 'decimal',
    autocomplete: 'off',
    placeholder: '0,00',
    'aria-describedby': 'ayuda-reclamo-monto error-reclamo-monto',
    'data-testid': 'input-reclamo-monto',
  });
  inputMonto.addEventListener('input', () => {
    const limpio = inputMonto.value.replace(/[^\d.,]/g, '');
    const coincidencia = /^(\d*)([.,]?)(\d{0,2})/.exec(limpio);
    inputMonto.value = coincidencia ? `${coincidencia[1]}${coincidencia[2]}${coincidencia[3]}` : '';
  });
  const errorMonto = h('div', { class: 'field__error', id: 'error-reclamo-monto', role: 'alert', style: 'display:none;', 'data-testid': 'error-reclamo-monto' });
  const campoMonto = h('div', { class: 'field reclamo-opcion__campo', hidden: true, 'data-testid': 'campo-monto' }, [
    texto('label', 'field__label', 'Monto a reembolsar', { for: 'reclamo-monto' }),
    h('div', { class: 'input-shell' }, [inputMonto]),
    texto('p', 'field__hint', `Máximo ${montoTotal}`, { id: 'ayuda-reclamo-monto', 'data-testid': 'ayuda-monto-maximo' }),
    errorMonto,
  ]);

  const areaMotivo = h('textarea', {
    id: 'reclamo-motivo-rechazo',
    maxlength: String(MAX_MOTIVO_RECHAZO),
    rows: '4',
    'aria-describedby': 'reclamo-motivo-rechazo-contador error-reclamo-motivo-rechazo',
    'data-testid': 'input-reclamo-motivo-rechazo',
  });
  const contadorMotivo = texto('span', '', `0 / ${MAX_MOTIVO_RECHAZO} · mínimo ${MIN_MOTIVO_RECHAZO}`, { id: 'reclamo-motivo-rechazo-contador', 'data-testid': 'contador-reclamo-motivo-rechazo' });
  areaMotivo.addEventListener('input', () => {
    contadorMotivo.textContent = `${areaMotivo.value.length} / ${MAX_MOTIVO_RECHAZO} · mínimo ${MIN_MOTIVO_RECHAZO}`;
  });
  const errorMotivo = h('div', { class: 'field__error', id: 'error-reclamo-motivo-rechazo', role: 'alert', style: 'display:none;', 'data-testid': 'error-reclamo-motivo-rechazo' });
  const campoMotivo = h('div', { class: 'field reclamo-opcion__campo', hidden: true, 'data-testid': 'campo-motivo-rechazo' }, [
    texto('label', 'field__label', 'Motivo del rechazo', { for: 'reclamo-motivo-rechazo' }),
    texto('p', 'field__hint', 'El Cliente va a ver este texto.'),
    h('div', { class: 'textarea-shell' }, [areaMotivo]),
    h('div', { class: 'textarea-counter' }, [contadorMotivo]),
    errorMotivo,
  ]);

  const radios = opciones.map((opcion) => h('input', { type: 'radio', name: 'tipo-resolucion', value: opcion.valor, 'data-testid': opcion.testid }));
  const camposPorTipo = { REEMBOLSO_PARCIAL: campoMonto, RECHAZO: campoMotivo };
  const filas = opciones.map((opcion, indice) => {
    const extra = camposPorTipo[opcion.valor];
    return h('div', { class: 'reclamo-opcion' }, [
      h('label', { class: 'reclamo-opcion__etiqueta' }, [radios[indice], texto('span', '', opcion.etiqueta)]),
      ...(extra ? [extra] : []),
    ]);
  });
  const grupo = h('fieldset', { class: 'reclamo-opciones', 'data-testid': 'opciones-resolucion' }, [
    texto('legend', 'field__label', 'Cómo se resuelve'),
    ...filas,
  ]);
  const resolver = texto('button', 'btn btn-primary', 'Resolver reclamo', { type: 'submit', 'data-testid': 'btn-resolver-reclamo' });
  const formulario = h('form', { class: 'form reclamo-resolucion', novalidate: true, 'data-testid': 'formulario-resolucion' }, [grupo, aviso, resolver]);

  function elegida() {
    const radio = radios.find((otro) => otro.checked);
    return radio ? radio.value : null;
  }

  radios.forEach((radio) => radio.addEventListener('change', () => {
    campoMonto.hidden = elegida() !== 'REEMBOLSO_PARCIAL';
    campoMotivo.hidden = elegida() !== 'RECHAZO';
    limpiarError(aviso);
  }));

  function mostrarErrorDe(id, mensaje) {
    const caja = document.getElementById(id);
    caja.textContent = mensaje;
    caja.style.display = mensaje ? 'flex' : 'none';
  }

  function limpiarErrores() {
    mostrarErrorDe('error-reclamo-monto', '');
    mostrarErrorDe('error-reclamo-motivo-rechazo', '');
  }

  function montoIngresado() {
    const normalizado = inputMonto.value.trim().replace(',', '.');
    return normalizado === '' || normalizado === '.' ? null : Number(normalizado);
  }

  function cuerpo(tipo) {
    return {
      tipo,
      monto: tipo === 'REEMBOLSO_PARCIAL' ? montoIngresado() : null,
      motivo: tipo === 'RECHAZO' ? areaMotivo.value : null,
    };
  }

  function mensajeDeConfirmacion(tipo) {
    if (tipo === 'RECHAZO') {
      return '¿Rechazar este reclamo? El Cliente va a ver el motivo que escribiste. No se puede deshacer.';
    }
    const monto = tipo === 'REEMBOLSO_TOTAL' ? montoTotal : formatearMonto(montoIngresado());
    return `¿Reembolsar ${monto} al Cliente? El reembolso lo hace la cuenta de Mercado Pago del comercio. No se puede deshacer.`;
  }

  async function mostrarFalla(error) {
    if (error instanceof ApiError && error.status === 409) {
      const mensaje = mensajeDeApi(error);
      const vigente = await repintarSiSeResolvio(contenedor, detalle.id, mensaje);
      if (vigente) {
        mostrarError(aviso, mensaje);
      }
      return;
    }
    const porCampo = erroresPorCampo(error);
    if (porCampo) {
      if (porCampo.monto) mostrarErrorDe('error-reclamo-monto', porCampo.monto);
      if (porCampo.motivo) mostrarErrorDe('error-reclamo-motivo-rechazo', porCampo.motivo);
      if (porCampo.tipo) mostrarError(aviso, porCampo.tipo);
      const primero = porCampo.monto ? inputMonto : (porCampo.motivo ? areaMotivo : null);
      if (primero) {
        primero.focus();
        return;
      }
      if (porCampo.tipo) return;
    }
    mostrarError(aviso, mensajeDeApi(error, 'No pudimos resolver el reclamo. Probá de nuevo.'));
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    limpiarError(aviso);
    limpiarErrores();
    const tipo = elegida();
    if (tipo === null) {
      mostrarError(aviso, 'Elegí cómo se resuelve el reclamo');
      return;
    }
    const alConfirmar = async () => {
      const actualizado = await apiFetch(`/administrador/reclamos/${detalle.id}/resolver`, { ...OPCIONES_API, method: 'PUT', body: cuerpo(tipo) });
      return () => pintarDetalle(contenedor, actualizado);
    };
    abrirModalConfirmar({ mensaje: mensajeDeConfirmacion(tipo), opener: elementoQueAbrio() || resolver, alConfirmar, alFallar: mostrarFalla });
  });
  return formulario;
}

async function repintarSiSeResolvio(contenedor, id, mensaje) {
  try {
    const actual = await apiFetch(`/administrador/reclamos/${id}`, OPCIONES_API);
    if (actual.estado === 'PENDIENTE') {
      return true;
    }
    pintarDetalle(contenedor, actual, mensaje);
    return false;
  } catch {
    return true;
  }
}

function pintarDetalle(contenedor, detalle, avisoInicial = null) {
  const pedido = detalle.pedido;
  const aviso = crearAvisoDeError('aviso-detalle-reclamo');
  const cabecera = h('section', { class: 'soporte-cabecera', 'aria-label': 'Datos del reclamo', 'data-testid': 'cabecera-reclamo' }, [
    texto('h2', 'soporte-cabecera__titulo', `Pedido #${pedido.id} · ${etiquetaMotivoReclamo(detalle.motivo)}`, { 'data-testid': 'reclamo-titulo' }),
    texto('p', 'soporte-cabecera__linea', `Comercio: ${pedido.comercioNombre}`, { 'data-testid': 'reclamo-comercio' }),
    texto('p', 'soporte-cabecera__linea', `Cliente: ${pedido.clienteNombre} · ${pedido.clienteEmail}`, { 'data-testid': 'reclamo-cliente' }),
    texto('p', 'soporte-cabecera__linea', `${pedido.tipoEntrega === 'DOMICILIO' ? 'A domicilio' : 'Retiro en el local'} · Entregado el ${fechaHoraLegible(pedido.fechaEntrega)}`, { 'data-testid': 'reclamo-modalidad' }),
    texto('p', 'soporte-cabecera__linea', `Total pagado: ${formatearMonto(pedido.total)}`, { 'data-testid': 'reclamo-total' }),
    texto('p', 'soporte-cabecera__linea', `Enviado el ${fechaHoraLegible(detalle.fechaCreacion)}`, { 'data-testid': 'reclamo-fecha' }),
    crearEstadoAdmin(detalle, 'reclamo-estado'),
  ]);
  const mensaje = h('section', { class: 'reclamo-bloque', 'aria-label': 'Mensaje del Cliente', 'data-testid': 'mensaje-del-cliente' }, [
    h('div', { class: 'reclamo-bloque__encabezado' }, [texto('h3', 'reclamo-bloque__titulo', 'Lo que contó el Cliente')]),
    texto('p', 'soporte-burbuja__texto', detalle.descripcion, { 'data-testid': 'reclamo-mensaje' }),
  ]);
  const productos = h('section', { class: 'reclamo-productos', 'aria-label': 'Productos del pedido', 'data-testid': 'productos-reclamo' }, [
    texto('p', 'section-heading', 'Productos del pedido'),
    ...(pedido.detalles || []).map((linea) => h('div', { class: 'order-line', 'data-testid': 'producto-reclamo' }, [
      texto('span', '', `${linea.cantidad}x ${linea.nombreProducto}`),
      texto('span', '', formatearMonto(linea.subtotal)),
    ])),
    h('div', { class: 'order-line order-line--total' }, [texto('span', '', 'Total'), texto('span', '', formatearMonto(pedido.total))]),
  ]);
  const hijos = [aviso, cabecera, mensaje, productos];
  if (detalle.estado === 'PENDIENTE') {
    hijos.push(texto('p', 'reclamo-saldo', `Saldo reembolsable: ${formatearMonto(detalle.saldoReembolsable)}`, { 'data-testid': 'saldo-reembolsable' }));
    hijos.push(crearFormularioResolucion(detalle, contenedor));
  } else {
    hijos.push(crearResolucion(detalle));
    if (detalle.estado === 'APROBADO' && detalle.reembolsoEnProceso) {
      hijos.push(crearBloqueReembolso(detalle));
    }
  }
  contenedor.replaceChildren(...hijos);
  if (avisoInicial) {
    mostrarError(aviso, avisoInicial);
  }
}

async function iniciarDetalle(contenedor, id) {
  contenedor.replaceChildren(
    h('div', { class: 'skeleton', style: 'height:140px;margin-bottom:16px;', 'aria-hidden': 'true' }),
    h('div', { class: 'skeleton', style: 'height:64px;width:70%;margin-bottom:12px;', 'aria-hidden': 'true' }),
  );
  try {
    pintarDetalle(contenedor, await apiFetch(`/administrador/reclamos/${id}`, OPCIONES_API));
  } catch (error) {
    const aviso = crearAvisoDeError('aviso-detalle-reclamo');
    const volver = texto('a', 'btn btn-primary', 'Volver a Reclamos', { href: 'admin-reclamos.html', 'data-testid': 'btn-volver-bandeja-reclamos' });
    contenedor.replaceChildren(aviso, volver);
    mostrarError(aviso, error instanceof ApiError && error.status === 404
      ? 'No encontramos ese reclamo.'
      : mensajeDeApi(error, 'No pudimos cargar el reclamo.'), { enfocar: false });
  }
}

export function initAdminReclamos() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'ADMINISTRADOR') {
    window.location.href = 'login.html';
    return;
  }
  const id = idDeLaUrl();
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: id === null ? 'Reclamos' : 'Reclamo' });
  const contenedor = document.getElementById('admin-reclamos-contenido');
  if (id !== null) {
    iniciarDetalle(contenedor, id);
    return;
  }
  pintarBandeja(contenedor);
}

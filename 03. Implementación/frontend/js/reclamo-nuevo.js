import { apiFetch, getUsuario } from './api.js';
import { exigirContextoCliente } from './contexto.js';
import { renderTopBar, showToast } from './catalogo.js';
import { h, crearSvg, setLoading } from './form-utils.js';
import { texto } from './admin-hojas.js';
import { crearAvisoDeError, erroresPorCampo, limpiarError, mensajeDeApi, mostrarError } from './soporte-comun.js';
import { crearSelectorDeFotos } from './reclamo-fotos.js';
import { MAX_DESCRIPCION_RECLAMO, MIN_DESCRIPCION_RECLAMO, etiquetaMotivoReclamo } from './reclamos-comun.js';

const OPCIONES_API = { handle5xxGlobally: false, handleRedGlobally: false };
const CAMPOS_CON_ERROR = ['motivo', 'descripcion'];
const TIMEOUT_ENVIO_MS = 120000;

function crearCampoError(id) {
  return h('div', { class: 'field__error', id: `error-${id}`, role: 'alert', style: 'display:none;', 'data-testid': `error-${id}` });
}

function mostrarErrorDeCampo(id, mensaje) {
  const caja = document.getElementById(`error-${id}`);
  caja.textContent = mensaje;
  caja.style.display = mensaje ? 'flex' : 'none';
}

function textoContador(largo) {
  return `${largo} / ${MAX_DESCRIPCION_RECLAMO} · mínimo ${MIN_DESCRIPCION_RECLAMO}`;
}

function irAlPedido(pedidoId) {
  return `pedido-detalle.html?id=${pedidoId}`;
}

function pintarSinAcceso(contenedor, pedidoId, mensaje) {
  contenedor.replaceChildren(
    texto('h1', 'title-lg', 'No se puede reclamar', { 'data-testid': 'titulo-reclamo-no-disponible' }),
    texto('p', 'soporte-intro', mensaje, { 'data-testid': 'texto-reclamo-no-disponible' }),
    texto('a', 'btn btn-primary', pedidoId ? 'Volver al pedido' : 'Ver mis pedidos', {
      href: pedidoId ? irAlPedido(pedidoId) : 'pedidos.html',
      'data-testid': 'btn-volver-pedido',
    }),
  );
}

function pintarConfirmacion(contenedor, pedidoId) {
  const titulo = texto('h1', 'title-lg', 'Recibimos tu reclamo', { tabindex: '-1', 'data-testid': 'titulo-reclamo-recibido' });
  contenedor.replaceChildren(h('div', { class: 'soporte-exito', 'data-testid': 'reclamo-recibido' }, [
    h('div', { class: 'soporte-exito__icono' }, [crearSvg([['path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }], ['polyline', { points: '22 4 12 14.01 9 11.01' }]], { 'aria-hidden': 'true' })]),
    titulo,
    texto('p', 'soporte-intro', 'Lo vamos a revisar y te avisamos con el resultado, acá y por email.', { 'data-testid': 'texto-reclamo-recibido' }),
    texto('a', 'btn btn-primary', 'Volver al pedido', { href: irAlPedido(pedidoId), 'data-testid': 'btn-volver-pedido' }),
  ]));
  titulo.focus();
  window.scrollTo({ top: 0 });
}

function pintarFormulario(contenedor, pedido) {
  const aviso = crearAvisoDeError('aviso-reclamo');
  const select = h('select', { id: 'reclamo-motivo', 'aria-describedby': 'error-reclamo-motivo', 'data-testid': 'select-reclamo-motivo' }, [
    texto('option', '', 'Elegí una opción', { value: '' }),
    ...(pedido.reclamo.motivosDisponibles || []).map((motivo) => texto('option', '', etiquetaMotivoReclamo(motivo), { value: motivo })),
  ]);
  const area = h('textarea', {
    id: 'reclamo-descripcion',
    maxlength: String(MAX_DESCRIPCION_RECLAMO),
    rows: '6',
    placeholder: 'Escribí con el mayor detalle posible',
    'aria-describedby': 'reclamo-descripcion-contador error-reclamo-descripcion',
    'data-testid': 'input-reclamo-descripcion',
  });
  const contador = texto('span', '', textoContador(0), { id: 'reclamo-descripcion-contador', 'data-testid': 'contador-reclamo-descripcion' });
  area.addEventListener('input', () => {
    contador.textContent = textoContador(area.value.length);
  });

  const enviar = texto('button', 'btn btn-primary', 'Enviar reclamo', { type: 'submit', 'data-testid': 'btn-enviar-reclamo' });
  const cancelar = texto('a', 'btn btn-tertiary', 'Cancelar', { href: irAlPedido(pedido.id), 'data-testid': 'btn-cancelar-reclamo' });

  const campoMotivo = h('div', { class: 'field' }, [
    texto('label', 'field__label', '¿Qué pasó?', { for: 'reclamo-motivo' }),
    h('div', { class: 'select-shell' }, [select, crearSvg([['polyline', { points: '6 9 12 15 18 9' }]], { class: 'select-shell__chevron', 'aria-hidden': 'true' })]),
    crearCampoError('reclamo-motivo'),
  ]);
  const campoDescripcion = h('div', { class: 'field' }, [
    texto('label', 'field__label', 'Contanos más', { for: 'reclamo-descripcion' }),
    h('div', { class: 'textarea-shell' }, [area]),
    h('div', { class: 'textarea-counter' }, [contador]),
    crearCampoError('reclamo-descripcion'),
  ]);
  const selectorDeFotos = crearSelectorDeFotos();
  const formulario = h('form', { class: 'form', novalidate: true, 'data-testid': 'formulario-reclamo' }, [
    campoMotivo,
    campoDescripcion,
    selectorDeFotos.elemento,
    texto('p', 'soporte-privacidad', 'Podés enviar un solo reclamo por pedido y después no se puede cambiar.', { 'data-testid': 'texto-un-solo-reclamo' }),
    aviso,
    enviar,
    cancelar,
  ]);

  contenedor.replaceChildren(
    texto('h1', 'title-lg', 'Tuve un problema', { 'data-testid': 'titulo-reclamo' }),
    texto('p', 'soporte-intro', `Pedido #${pedido.id}`, { 'data-testid': 'texto-pedido-reclamo' }),
    formulario,
  );
  select.focus();

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviar.disabled) return;
    limpiarError(aviso);
    CAMPOS_CON_ERROR.forEach((campo) => mostrarErrorDeCampo(`reclamo-${campo}`, ''));
    setLoading(enviar, 'Enviando…', true);
    selectorDeFotos.bloquear(true);
    const datos = new FormData();
    datos.append('reclamo', new Blob([JSON.stringify({ motivo: select.value || null, descripcion: area.value })], { type: 'application/json' }));
    selectorDeFotos.archivos().forEach((archivo) => datos.append('fotos', archivo, archivo.name));
    try {
      await apiFetch(`/pedidos/cliente/${pedido.id}/reclamo`, {
        ...OPCIONES_API,
        method: 'POST',
        body: datos,
        timeoutMs: TIMEOUT_ENVIO_MS,
      });
      showToast('Reclamo enviado');
      pintarConfirmacion(contenedor, pedido.id);
    } catch (error) {
      setLoading(enviar, '', false, 'Enviar reclamo');
      selectorDeFotos.bloquear(false);
      const porCampo = erroresPorCampo(error);
      if (porCampo) {
        let primero = null;
        CAMPOS_CON_ERROR.forEach((campo) => {
          if (porCampo[campo]) {
            mostrarErrorDeCampo(`reclamo-${campo}`, porCampo[campo]);
            primero = primero || document.getElementById(`reclamo-${campo}`);
          }
        });
        if (primero) {
          primero.focus();
          return;
        }
      }
      mostrarError(aviso, mensajeDeApi(error, 'No pudimos enviar tu reclamo. Probá de nuevo.'));
    }
  });
}

export async function initReclamoNuevo() {
  if (!(await exigirContextoCliente())) {
    return;
  }
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    window.location.href = 'login.html';
    return;
  }
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Reclamo' });
  const contenedor = document.getElementById('reclamo-contenido');
  const valor = new URLSearchParams(window.location.search).get('pedido');
  const pedidoId = valor && /^\d+$/.test(valor) ? Number(valor) : null;
  if (pedidoId === null) {
    pintarSinAcceso(contenedor, null, 'No encontramos el pedido que querés reclamar.');
    return;
  }
  contenedor.replaceChildren(
    h('div', { class: 'skeleton', style: 'height:48px;margin-bottom:16px;', 'aria-hidden': 'true' }),
    h('div', { class: 'skeleton', style: 'height:140px;', 'aria-hidden': 'true' }),
  );
  try {
    const pedidos = await apiFetch('/pedidos/cliente', OPCIONES_API);
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) {
      pintarSinAcceso(contenedor, null, 'No encontramos el pedido que querés reclamar.');
      return;
    }
    if (!pedido.reclamo || !pedido.reclamo.puedeReclamar) {
      const mensaje = pedido.reclamo && pedido.reclamo.estado
        ? 'Ya hiciste un reclamo por este pedido.'
        : (pedido.reclamo && pedido.reclamo.avisoPlazoVencido) || 'Este pedido no se puede reclamar.';
      pintarSinAcceso(contenedor, pedidoId, mensaje);
      return;
    }
    pintarFormulario(contenedor, pedido);
  } catch (error) {
    const reintentar = texto('button', 'btn btn-secondary', 'Reintentar', { type: 'button', 'data-testid': 'btn-reintentar-reclamo' });
    reintentar.addEventListener('click', () => window.location.reload());
    contenedor.replaceChildren(
      texto('p', 'soporte-intro', mensajeDeApi(error, 'No pudimos cargar el pedido.'), { 'data-testid': 'error-cargar-reclamo' }),
      reintentar,
    );
  }
}
